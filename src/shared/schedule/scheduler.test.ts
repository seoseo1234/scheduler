import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../defaults';
import type { Settings } from '../types';
import { pauseUntilEndOfDay } from './alerts';
import { AlertScheduler, type AlertEvent } from './scheduler';

const MON = (h: number, m = 0, s = 0) => new Date(2026, 9, 5, h, m, s);

function setup(patch: Partial<Settings> = {}) {
  let settings: Settings = {
    ...createDefaultSettings(),
    weeklySubjects: { 1: { '1교시': '국어', '3교시': '체육' } },
    subjectNotes: { 체육: '체육복 입고 운동장으로 가요.' },
    ...patch,
  };
  const events: AlertEvent[] = [];
  const scheduler = new AlertScheduler(() => settings, (e) => events.push(e));
  /** from~to 사이를 1초 간격으로 틱 */
  const run = (from: Date, to: Date) => {
    for (let t = from.getTime(); t <= to.getTime(); t += 1000) scheduler.tick(new Date(t));
  };
  return { scheduler, events, run, set: (s: Partial<Settings>) => (settings = { ...settings, ...s }) };
}

describe('AlertScheduler', () => {
  it('fires banner at 08:57, overlay at 08:59, start at 09:00 exactly (수용 기준 1)', () => {
    const { scheduler, events } = setup();
    const fired: [string, string][] = [];
    for (let t = MON(8, 56).getTime(); t <= MON(9, 0, 30).getTime(); t += 1000) {
      const now = new Date(t);
      for (const e of scheduler.tick(now)) fired.push([e.kind, now.toTimeString().slice(0, 8)]);
    }
    expect(fired).toEqual([
      ['banner', '08:57:00'],
      ['overlay', '08:59:00'],
      ['start', '09:00:00'],
    ]);
    expect(events[0]).toMatchObject({ text: '3분 뒤 1교시 국어예요.', until: MON(9), sound: true });
    expect(events[1]).toMatchObject({ text: '1분 뒤 1교시가 시작돼요! 자리에 앉아요.', until: MON(8, 59, 10), sound: true });
    expect(events[2]).toMatchObject({ text: '1교시 국어 시작!', until: MON(9, 0, 5), sound: false });
  });

  it('includes 준비물 in the banner', () => {
    const { events, run } = setup();
    run(MON(10, 36, 59), MON(10, 37));
    expect(events.map((e) => e.text)).toEqual(['3분 뒤 3교시 체육이에요. 체육복 입고 운동장으로 가요.']);
  });

  it('does not backfill when started after the alert time', () => {
    const { events, run } = setup();
    run(MON(8, 57, 30), MON(8, 58, 30));
    expect(events).toEqual([]);
  });

  it('does not backfill after resume (reset or long gap)', () => {
    const { scheduler, events } = setup();
    scheduler.tick(MON(8, 50));
    scheduler.tick(MON(8, 58)); // 절전 복귀로 8분 건너뜀
    expect(events).toEqual([]);
    scheduler.reset();
    scheduler.tick(MON(8, 58, 59));
    scheduler.tick(MON(8, 59)); // 복귀 후에는 정상 동작
    expect(events.map((e) => e.kind)).toEqual(['overlay']);
  });

  it('stays silent while paused, resumes next day (수용 기준 8)', () => {
    const { events, run, set } = setup();
    set({ alerts: { ...createDefaultSettings().alerts, pausedUntil: pauseUntilEndOfDay(MON(8)) } });
    run(MON(8, 56), MON(9, 1));
    expect(events).toEqual([]);
    const TUE = (h: number, m = 0, s = 0) => new Date(2026, 9, 6, h, m, s);
    run(TUE(8, 56, 59), TUE(8, 57));
    expect(events.map((e) => e.kind)).toEqual(['banner']);
  });

  it('applies settings changes mid-day', () => {
    const { events, run, set } = setup();
    const alerts = createDefaultSettings().alerts;
    set({ alerts: { ...alerts, offsets: [{ id: 'x', minutes: 5, style: 'banner', enabled: true }] } });
    run(MON(8, 54, 59), MON(8, 59, 30));
    expect(events.map((e) => [e.kind, e.text])).toEqual([['banner', '5분 뒤 1교시 국어예요.']]);
  });

  it('no alerts on a no-school day (수용 기준 3)', () => {
    const { events, run } = setup({ dateOverrides: { '2026-10-05': 'none' } });
    run(MON(8, 56), MON(9, 1));
    expect(events).toEqual([]);
  });

  it('preview uses the next class, or a sample when none', () => {
    const { scheduler, events } = setup();
    const e = scheduler.preview('banner', MON(10, 0));
    expect(e.text).toBe('3분 뒤 3교시 체육이에요. 체육복 입고 운동장으로 가요.');
    expect(e.preview).toBe(true);
    expect(e.until).toEqual(new Date(MON(10, 0).getTime() + 8000));
    expect(scheduler.preview('overlay', MON(20, 0)).text).toBe('1분 뒤 3교시가 시작돼요! 자리에 앉아요.');
    expect(events).toHaveLength(2);
  });
});
