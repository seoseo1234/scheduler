import { describe, expect, it } from 'vitest';
import { createDefaultSettings, DEFAULT_TEMPLATE_ID } from '../defaults';
import type { Block, ScheduleTemplate, Settings } from '../types';
import {
  blockLabel,
  collectDueAlerts,
  computeAlerts,
  formatKoreanDate,
  formatKoreanTime,
  getCurrentState,
  getDayPlan,
  getMorningTasks,
  isPaused,
  pauseForMinutes,
  pauseUntilEndOfDay,
  renderAlertTemplate,
  resolveTemplate,
  validateBlocks,
  alertVars,
  type ScheduledAlert,
} from './index';

// 2026-10-05는 월요일
const MON = (h: number, m = 0, s = 0) => new Date(2026, 9, 5, h, m, s);
const WED = (h: number, m = 0, s = 0) => new Date(2026, 9, 7, h, m, s);
const FRI_1009 = (h: number, m = 0) => new Date(2026, 9, 9, h, m);
const SAT = new Date(2026, 9, 10, 10, 0);

const SHORT: ScheduleTemplate = {
  id: 'tpl-short',
  name: '단축 수업',
  blocks: [
    { id: 's-1', name: '1교시', kind: 'class', start: '09:00', end: '09:35' },
    { id: 's-2', name: '2교시', kind: 'class', start: '09:40', end: '10:15' },
  ],
};

function settingsWith(patch: Partial<Settings> = {}): Settings {
  return { ...createDefaultSettings(), ...patch };
}

describe('time', () => {
  it('formats Korean time and date', () => {
    expect(formatKoreanTime(MON(9, 37))).toBe('오전 9:37');
    expect(formatKoreanTime(MON(12, 5))).toBe('오후 12:05');
    expect(formatKoreanTime(MON(0, 0))).toBe('오전 12:00');
    expect(formatKoreanTime(MON(13, 40, 9), true)).toBe('오후 1:40:09');
    expect(formatKoreanDate(MON(9))).toBe('10월 5일 월요일');
  });
});

describe('resolveTemplate', () => {
  it('uses weekday template, none on weekends', () => {
    const s = settingsWith();
    expect(MON(9).getDay()).toBe(1);
    expect(resolveTemplate(s, MON(9)).template?.id).toBe(DEFAULT_TEMPLATE_ID);
    expect(resolveTemplate(s, SAT).template).toBeNull();
  });

  it('switches Wednesday to the short template (수용 기준 2)', () => {
    const base = createDefaultSettings();
    const s = settingsWith({ templates: [...base.templates, SHORT], weekdayTemplate: { ...base.weekdayTemplate, 3: SHORT.id } });
    const plan = getDayPlan(s, WED(8));
    expect(plan.status).toBe('school');
    const alerts = computeAlerts(plan, s.alerts.offsets);
    const second = alerts.filter((a) => a.block.id === 's-2').map((a) => [a.kind, formatKoreanTime(a.at)]);
    expect(second).toEqual([
      ['banner', '오전 9:37'],
      ['overlay', '오전 9:39'],
      ['start', '오전 9:40'],
    ]);
  });

  it('date override "none" means no school (수용 기준 3)', () => {
    const s = settingsWith({ dateOverrides: { '2026-10-09': 'none' } });
    const plan = getDayPlan(s, FRI_1009(9));
    expect(plan.status).toBe('noSchool');
    expect(computeAlerts(plan, s.alerts.offsets)).toEqual([]);
    expect(getCurrentState(plan, FRI_1009(9, 30))).toEqual({ phase: 'noSchool' });
  });

  it('date override with a template wins over weekday; deleted template falls back', () => {
    const base = createDefaultSettings();
    const s = settingsWith({ templates: [...base.templates, SHORT], dateOverrides: { '2026-10-10': SHORT.id } });
    expect(resolveTemplate(s, SAT).template?.id).toBe(SHORT.id);
    const gone = settingsWith({ dateOverrides: { '2026-10-05': 'deleted-id' } });
    expect(resolveTemplate(gone, MON(9)).template?.id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('weekday pointing to a missing template is reported', () => {
    const base = createDefaultSettings();
    const s = settingsWith({ weekdayTemplate: { ...base.weekdayTemplate, 1: 'nope' } });
    expect(resolveTemplate(s, MON(9))).toEqual({ template: null, reason: 'missingTemplate' });
  });
});

describe('getDayPlan subjects', () => {
  it('applies weekly subjects, date overrides and notes', () => {
    const s = settingsWith({
      weeklySubjects: { 3: { '1교시': '국어', '3교시': '체육' } },
      subjectNotes: { 체육: '체육복 입고 운동장으로 가요.' },
      subjectOverrides: { '2026-10-07': { '3교시': '현장체험학습' } },
    });
    const plan = getDayPlan(s, WED(8));
    if (plan.status !== 'school') throw new Error('expected school');
    const byName = Object.fromEntries(plan.blocks.map((b) => [b.name + b.id, b]));
    expect(byName['1교시b-1'].subject).toBe('국어');
    expect(byName['3교시b-3'].subject).toBe('현장체험학습');
    expect(byName['3교시b-3'].note).toBe('');
    expect(blockLabel(byName['2교시b-2'])).toBe('2교시');

    const mon = getDayPlan(settingsWith({ weeklySubjects: { 1: { '3교시': '체육' } }, subjectNotes: s.subjectNotes }), MON(8));
    if (mon.status !== 'school') throw new Error('expected school');
    expect(mon.blocks.find((b) => b.id === 'b-3')?.note).toBe('체육복 입고 운동장으로 가요.');
  });
});

describe('getCurrentState', () => {
  const s = settingsWith({ weeklySubjects: { 1: { '2교시': '수학', '3교시': '체육' } } });
  const plan = getDayPlan(s, MON(0));

  it('before school', () => {
    const st = getCurrentState(plan, MON(8, 30));
    expect(st.phase).toBe('beforeSchool');
    if (st.phase === 'beforeSchool') {
      expect(st.next.name).toBe('아침시간');
      expect(st.minutesUntilNext).toBe(10);
    }
  });

  it('morning block', () => {
    const st = getCurrentState(plan, MON(8, 45));
    expect(st.phase === 'inBlock' && st.current.kind).toBe('morning');
  });

  it('"2교시 수학 · 23분 남음" style', () => {
    const st = getCurrentState(plan, MON(10, 7));
    if (st.phase !== 'inBlock') throw new Error(st.phase);
    expect(blockLabel(st.current)).toBe('2교시 수학');
    expect(st.minutesLeft).toBe(23);
    expect(st.next && blockLabel(st.next)).toBe('쉬는시간');
  });

  it('rounds remaining minutes up and switches exactly at boundaries', () => {
    const st = getCurrentState(plan, MON(10, 29, 1));
    expect(st.phase === 'inBlock' && st.minutesLeft).toBe(1);
    const atEnd = getCurrentState(plan, MON(10, 30));
    expect(atEnd.phase === 'inBlock' && atEnd.current.kind).toBe('break');
  });

  it('5교시 starts at 12:50 after lunch', () => {
    const st = getCurrentState(plan, MON(12, 50));
    expect(st.phase === 'inBlock' && st.current.name).toBe('5교시');
  });

  it('after school', () => {
    expect(getCurrentState(plan, MON(14, 20)).phase).toBe('afterSchool');
  });

  it('gap between blocks without a break row', () => {
    const tpl: ScheduleTemplate = {
      id: 'g',
      name: 'gap',
      blocks: [
        { id: 'a', name: '1교시', kind: 'class', start: '09:00', end: '09:40' },
        { id: 'b', name: '2교시', kind: 'class', start: '09:50', end: '10:30' },
      ],
    };
    const p = getDayPlan(settingsWith({ templates: [tpl], weekdayTemplate: { ...s.weekdayTemplate, 1: 'g' } }), MON(0));
    const st = getCurrentState(p, MON(9, 45));
    expect(st.phase).toBe('gap');
    if (st.phase === 'gap') expect(st.minutesUntilNext).toBe(5);
  });
});

describe('alerts', () => {
  const s = settingsWith();
  const plan = getDayPlan(s, MON(0));
  const alerts = computeAlerts(plan, s.alerts.offsets);

  it('only for class blocks: 3 per class × 6 classes', () => {
    expect(alerts).toHaveLength(18);
    expect(alerts.every((a) => a.block.kind === 'class')).toBe(true);
  });

  it('1교시 09:00 → 08:57 banner, 08:59 overlay, 09:00 start (수용 기준 1)', () => {
    const first = alerts.filter((a) => a.block.id === 'b-1');
    expect(first.map((a) => [a.kind, a.at.getTime()])).toEqual([
      ['banner', MON(8, 57).getTime()],
      ['overlay', MON(8, 59).getTime()],
      ['start', MON(9, 0).getTime()],
    ]);
  });

  it('disabled offsets are skipped and extra offsets added', () => {
    const offsets = [
      { id: 'a', minutes: 5, style: 'banner' as const, enabled: true },
      { id: 'b', minutes: 1, style: 'overlay' as const, enabled: false },
    ];
    const first = computeAlerts(plan, offsets).filter((a) => a.block.id === 'b-1');
    expect(first.map((a) => [a.kind, a.minutesBefore])).toEqual([
      ['banner', 5],
      ['start', 0],
    ]);
  });

  describe('collectDueAlerts', () => {
    const at857 = alerts.find((a) => a.block.id === 'b-1' && a.kind === 'banner') as ScheduledAlert;

    it('fires when the tick crosses the alert time (±1초)', () => {
      expect(collectDueAlerts(alerts, MON(8, 56, 59), MON(8, 57, 0))).toEqual([at857]);
      expect(collectDueAlerts(alerts, MON(8, 57, 0), MON(8, 57, 1))).toEqual([]);
    });

    it('does not backfill on first start', () => {
      expect(collectDueAlerts(alerts, null, MON(8, 57, 0))).toEqual([]);
    });

    it('does not backfill after sleep/resume (large gap)', () => {
      expect(collectDueAlerts(alerts, MON(8, 50), MON(8, 58))).toEqual([]);
    });

    it('ignores clock going backwards', () => {
      expect(collectDueAlerts(alerts, MON(8, 57, 1), MON(8, 56, 59))).toEqual([]);
    });
  });

  it('pause for today resumes next day (수용 기준 8)', () => {
    const until = pauseUntilEndOfDay(MON(8, 0));
    expect(isPaused({ pausedUntil: until }, MON(23, 59))).toBe(true);
    expect(isPaused({ pausedUntil: until }, new Date(2026, 9, 6, 0, 0))).toBe(false);
    const hour = pauseForMinutes(MON(9, 0), 60);
    expect(isPaused({ pausedUntil: hour }, MON(9, 59, 59))).toBe(true);
    expect(isPaused({ pausedUntil: hour }, MON(10, 0))).toBe(false);
    expect(isPaused({ pausedUntil: null }, MON(9))).toBe(false);
  });
});

describe('renderAlertTemplate', () => {
  const t = createDefaultSettings().alerts.templates;

  it('fills variables with correct 이에요/예요', () => {
    const vars = { 교시: '3교시', 과목: '체육', 준비물: '체육복 입고 운동장으로 가요.', 남은분: 3 };
    expect(renderAlertTemplate(t.banner, vars)).toBe('3분 뒤 3교시 체육이에요. 체육복 입고 운동장으로 가요.');
    expect(renderAlertTemplate(t.banner, { ...vars, 과목: '국어', 준비물: '' })).toBe('3분 뒤 3교시 국어예요.');
    expect(renderAlertTemplate(t.overlay, { ...vars, 남은분: 1 })).toBe('1분 뒤 3교시가 시작돼요! 자리에 앉아요.');
    expect(renderAlertTemplate(t.start, vars)).toBe('3교시 체육 시작!');
  });

  it('handles empty subject gracefully', () => {
    const vars = { 교시: '3교시', 과목: '', 준비물: '', 남은분: 3 };
    expect(renderAlertTemplate(t.banner, vars)).toBe('3분 뒤 3교시예요.');
    expect(renderAlertTemplate(t.start, vars)).toBe('3교시 시작!');
    expect(renderAlertTemplate('{교시}이에요', { ...vars, 교시: '1' })).toBe('1이에요');
  });

  it('alertVars maps a scheduled alert', () => {
    const s = settingsWith({ weeklySubjects: { 1: { '1교시': '국어' } } });
    const a = computeAlerts(getDayPlan(s, MON(0)), s.alerts.offsets)[0];
    expect(alertVars(a)).toEqual({ 교시: '1교시', 과목: '국어', 준비물: '', 남은분: 3 });
  });
});

describe('validateBlocks (수용 기준 9)', () => {
  const b = (name: string, start: string, end: string): Block => ({ id: name, name, kind: 'class', start, end });

  it('accepts the sample template and touching boundaries', () => {
    expect(validateBlocks(createDefaultSettings().templates[0].blocks)).toEqual([]);
  });

  it('flags overlapping rows on both sides', () => {
    const errors = validateBlocks([b('1교시', '09:00', '09:40'), b('2교시', '09:30', '10:10'), b('3교시', '10:20', '11:00')]);
    expect(errors.map((e) => [e.index, e.code, e.otherIndex])).toEqual([
      [0, 'overlap', 1],
      [1, 'overlap', 0],
    ]);
  });

  it('flags a block contained in another even if not adjacent in order', () => {
    const errors = validateBlocks([b('a', '09:00', '12:00'), b('b', '13:00', '14:00'), b('c', '10:00', '10:30')]);
    expect(errors.map((e) => e.index)).toEqual([0, 2]);
  });

  it('flags start >= end, bad format and empty name', () => {
    const errors = validateBlocks([b('a', '10:00', '09:00'), b('', '9:00', '25:00'), b('c', '10:00', '10:00')]);
    expect(errors.map((e) => [e.index, e.code])).toEqual([
      [0, 'startNotBeforeEnd'],
      [1, 'emptyName'],
      [1, 'invalidStart'],
      [1, 'invalidEnd'],
      [2, 'startNotBeforeEnd'],
    ]);
  });
});

describe('getMorningTasks', () => {
  it('uses weekday list when set, plus today-only items for today only', () => {
    const base = createDefaultSettings();
    const s = settingsWith({
      morningTasks: {
        ...base.morningTasks,
        byWeekday: { 1: [{ id: 'w', text: '주말 이야기 쓰기' }] },
        todayOnly: { date: '2026-10-05', items: [{ id: 't', text: '우유 가져오기' }] },
      },
    });
    expect(getMorningTasks(s, MON(8)).map((t) => t.text)).toEqual(['주말 이야기 쓰기', '우유 가져오기']);
    expect(getMorningTasks(s, WED(8)).map((t) => t.text)).toEqual(['알림장 꺼내기', '아침 독서']);
  });
});
