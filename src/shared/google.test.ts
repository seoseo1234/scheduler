import { describe, expect, it } from 'vitest';
import { buildEventView, eventsStartingSoon, groupTasks, parseGoogleResponse, taskBucket, taskListNames } from './google';
import type { GoogleEvent, GoogleTask } from './types';

const NOW = new Date(2026, 9, 5, 10, 30); // 월요일 10:30

const ev = (p: Partial<GoogleEvent>): GoogleEvent => ({
  id: p.title ?? 'x',
  title: 'x',
  start: '',
  end: '',
  allDay: false,
  location: '',
  calendar: '업무',
  ...p,
});
const task = (title: string, due: string | null, list = '업무'): GoogleTask => ({ id: title, title, due, notes: '', list });

describe('parseGoogleResponse', () => {
  it('accepts the documented format', () => {
    const r = parseGoogleResponse({
      generatedAt: '2026-10-05T08:30:00+09:00',
      events: [{ id: 'abc', title: '학년 협의회', start: '2026-10-05T15:00:00+09:00', end: '2026-10-05T16:00:00+09:00', allDay: false, location: '학년연구실', calendar: '업무' }],
      tasks: [{ id: 'xyz', title: '가정통신문 발송', due: '2026-10-06T00:00:00.000Z', notes: '', list: '업무' }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.events[0].title).toBe('학년 협의회');
      expect(r.data.tasks[0].due).toBe('2026-10-06');
    }
  });

  it('detects token mismatch, script errors and bad format', () => {
    expect(parseGoogleResponse({ error: 'unauthorized' })).toEqual({ ok: false, code: 'unauthorized' });
    expect(parseGoogleResponse({ error: 'failed', message: 'Tasks is not defined' })).toEqual({
      ok: false,
      code: 'scriptError',
      message: 'Tasks is not defined',
    });
    expect(parseGoogleResponse('<html>')).toEqual({ ok: false, code: 'badFormat' });
    expect(parseGoogleResponse({ events: [] })).toEqual({ ok: false, code: 'badFormat' });
  });

  it('drops malformed entries', () => {
    const r = parseGoogleResponse({ events: [null, { title: 'no start' }], tasks: [{ due: '2026-10-01' }, { title: 't', due: 'bad' }] });
    expect(r.ok && r.data.events).toEqual([]);
    expect(r.ok && r.data.tasks).toEqual([{ id: '', title: 't', due: null, notes: '', list: '' }]);
  });
});

describe('buildEventView', () => {
  const events = [
    ev({ title: '협의회', start: '2026-10-05T15:00:00+09:00', end: '2026-10-05T16:00:00+09:00' }),
    ev({ title: '아침 회의', start: '2026-10-05T08:00:00+09:00', end: '2026-10-05T08:30:00+09:00' }),
    ev({ title: '수업 공개', start: '2026-10-05T10:00:00+09:00', end: '2026-10-05T11:00:00+09:00' }),
    ev({ title: '개교기념일', allDay: true, start: '2026-10-05', end: '2026-10-06' }),
    ev({ title: '체험학습', allDay: true, start: '2026-10-04', end: '2026-10-07' }),
    ev({ title: '내일 회의', start: '2026-10-06T14:00:00+09:00', end: '2026-10-06T15:00:00+09:00' }),
    ev({ title: '모레 종일', allDay: true, start: '2026-10-07', end: '2026-10-08' }),
    ev({ title: '먼 일정', start: '2026-10-20T14:00:00+09:00', end: '2026-10-20T15:00:00+09:00' }),
  ];

  // 테스트 환경 시간대와 무관하게 동작하도록 KST 오프셋을 로컬로 맞춘 NOW 사용
  const nowKst = new Date('2026-10-05T10:30:00+09:00');
  const v = buildEventView(events, nowKst, 7);

  it('puts all-day events (incl. multi-day) at top of today', () => {
    expect(v.todayAllDay.map((e) => e.title)).toEqual(['체험학습', '개교기념일']);
  });

  it('marks past / ongoing / upcoming timed events in time order', () => {
    expect(v.todayTimed.map((t) => [t.event.title, t.timing])).toEqual([
      ['아침 회의', 'past'],
      ['수업 공개', 'ongoing'],
      ['협의회', 'upcoming'],
    ]);
  });

  it('groups upcoming events by date within N days', () => {
    expect(v.upcoming.map((g) => [g.date, g.allDay.map((e) => e.title), g.timed.map((e) => e.title)])).toEqual([
      ['2026-10-06', [], ['내일 회의']],
      ['2026-10-07', ['모레 종일'], []],
    ]);
  });

  it('reminds N minutes before start, not for all-day', () => {
    const soon = eventsStartingSoon(events, new Date('2026-10-05T14:50:00+09:00'), 10);
    expect(soon.map((e) => e.title)).toEqual(['협의회']);
    expect(eventsStartingSoon(events, new Date('2026-10-05T14:49:59+09:00'), 10)).toEqual([]);
    expect(eventsStartingSoon(events, new Date('2026-10-05T14:55:00+09:00'), 0)).toEqual([]);
  });
});

describe('tasks', () => {
  const tasks = [
    task('마감 없음', null),
    task('다음 주', '2026-10-12'),
    task('이번 주 일요일', '2026-10-11'),
    task('오늘', '2026-10-05'),
    task('지난주', '2026-10-01'),
    task('개인', '2026-10-05', '개인'),
  ];

  it('buckets by due date (월~일 주)', () => {
    expect(tasks.map((t) => taskBucket(t, NOW))).toEqual(['noDue', 'later', 'thisWeek', 'today', 'overdue', 'today']);
  });

  it('orders overdue → today → this week → later → none, filtered by list', () => {
    expect(groupTasks(tasks, NOW, []).map((g) => [g.bucket, g.tasks.map((t) => t.title)])).toEqual([
      ['overdue', ['지난주']],
      ['today', ['개인', '오늘']],
      ['thisWeek', ['이번 주 일요일']],
      ['later', ['다음 주']],
      ['noDue', ['마감 없음']],
    ]);
    expect(groupTasks(tasks, NOW, ['개인']).map((g) => g.bucket)).toEqual(['today']);
  });

  it('on Sunday, this week ends today', () => {
    const sunday = new Date(2026, 9, 11, 9);
    expect(taskBucket(task('a', '2026-10-12'), sunday)).toBe('later');
  });

  it('lists names', () => {
    expect(taskListNames(tasks)).toEqual(['개인', '업무']);
  });
});
