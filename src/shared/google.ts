// 구글 연동 응답 검사와 교사 위젯 표시용 계산 (순수 함수)
import { startOfDay, toDateKey } from './schedule/time';
import type { GoogleData, GoogleEvent, GoogleTask } from './types';

export type ParseResult =
  | { ok: true; data: GoogleData }
  | { ok: false; code: 'unauthorized' | 'scriptError' | 'badFormat'; message?: string };

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Apps Script 웹 앱 응답(JSON)을 검사해 GoogleData로 바꾼다. */
export function parseGoogleResponse(json: unknown): ParseResult {
  if (typeof json !== 'object' || json === null) return { ok: false, code: 'badFormat' };
  const o = json as Record<string, unknown>;
  if (o.error === 'unauthorized') return { ok: false, code: 'unauthorized' };
  if (typeof o.error === 'string') return { ok: false, code: 'scriptError', message: str(o.message, o.error) };
  if (!Array.isArray(o.events) || !Array.isArray(o.tasks)) return { ok: false, code: 'badFormat' };

  const events: GoogleEvent[] = o.events
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null && typeof e.start === 'string')
    .map((e) => ({
      id: str(e.id),
      title: str(e.title, '(제목 없음)'),
      start: str(e.start),
      end: str(e.end, str(e.start)),
      allDay: e.allDay === true,
      location: str(e.location),
      calendar: str(e.calendar),
    }));
  const tasks: GoogleTask[] = o.tasks
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && typeof t.title === 'string')
    .map((t) => ({
      id: str(t.id),
      title: str(t.title),
      due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.due) ? t.due.slice(0, 10) : null,
      notes: str(t.notes),
      list: str(t.list),
    }));
  return { ok: true, data: { generatedAt: str(o.generatedAt, new Date().toISOString()), events, tasks } };
}

// ---- 일정 ----

/** "2026-10-05" → 로컬 0시 */
function dateOnly(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function eventStart(e: GoogleEvent): Date {
  return e.allDay ? dateOnly(e.start) : new Date(e.start);
}

export function eventEnd(e: GoogleEvent): Date {
  return e.allDay ? dateOnly(e.end) : new Date(e.end);
}

export type EventTiming = 'past' | 'ongoing' | 'upcoming';

export interface TodayEvent {
  event: GoogleEvent;
  timing: EventTiming;
}

export interface DayGroup {
  date: string;
  allDay: GoogleEvent[];
  timed: GoogleEvent[];
}

export interface EventView {
  todayAllDay: GoogleEvent[];
  todayTimed: TodayEvent[];
  /** 내일부터 날짜별 */
  upcoming: DayGroup[];
}

/** 오늘 일정(종일 → 시간순)과 다가오는 일정(날짜별)으로 나눈다. */
export function buildEventView(events: GoogleEvent[], now: Date, days: number): EventView {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const rangeEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.max(1, days));
  const sorted = [...events].sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());

  const todayAllDay: GoogleEvent[] = [];
  const todayTimed: TodayEvent[] = [];
  const groups = new Map<string, DayGroup>();

  for (const e of sorted) {
    const start = eventStart(e);
    const end = eventEnd(e);
    // 오늘에 걸쳐 있는 일정
    if (start < tomorrow && end > today) {
      if (e.allDay) todayAllDay.push(e);
      else {
        const t = now.getTime();
        const timing: EventTiming = end.getTime() <= t ? 'past' : start.getTime() <= t ? 'ongoing' : 'upcoming';
        todayTimed.push({ event: e, timing });
      }
      continue;
    }
    if (start >= tomorrow && start < rangeEnd) {
      const key = toDateKey(start);
      const g = groups.get(key) ?? { date: key, allDay: [], timed: [] };
      (e.allDay ? g.allDay : g.timed).push(e);
      groups.set(key, g);
    }
  }
  return { todayAllDay, todayTimed, upcoming: [...groups.values()] };
}

/** 시작 minutes분 전부터 시작 전까지인 일정 (교사 모니터 알림용) */
export function eventsStartingSoon(events: GoogleEvent[], now: Date, minutes: number): GoogleEvent[] {
  if (minutes <= 0) return [];
  const t = now.getTime();
  return events.filter((e) => {
    if (e.allDay) return false;
    const s = eventStart(e).getTime();
    return s > t && s - t <= minutes * 60_000;
  });
}

// ---- 할 일 ----

export type TaskBucket = 'overdue' | 'today' | 'thisWeek' | 'later' | 'noDue';

export const TASK_BUCKET_LABEL: Record<TaskBucket, string> = {
  overdue: '기한 지남',
  today: '오늘',
  thisWeek: '이번 주',
  later: '나중',
  noDue: '마감 없음',
};

/** 이번 주 일요일 (월~일 기준) */
function endOfWeek(now: Date): Date {
  const daysToSunday = (7 - now.getDay()) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToSunday);
}

export function taskBucket(task: GoogleTask, now: Date): TaskBucket {
  if (!task.due) return 'noDue';
  const today = toDateKey(now);
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  if (task.due <= toDateKey(endOfWeek(now))) return 'thisWeek';
  return 'later';
}

const BUCKET_ORDER: TaskBucket[] = ['overdue', 'today', 'thisWeek', 'later', 'noDue'];

/**
 * 할 일을 마감 기준으로 묶는다: 지남 → 오늘 → 이번 주 → 나중 → 마감 없음.
 * lists가 비어 있지 않으면 그 목록의 할 일만 보여준다.
 */
export function groupTasks(tasks: GoogleTask[], now: Date, lists: string[]): { bucket: TaskBucket; tasks: GoogleTask[] }[] {
  const filtered = lists.length > 0 ? tasks.filter((t) => lists.includes(t.list)) : tasks;
  const map = new Map<TaskBucket, GoogleTask[]>();
  for (const t of filtered) {
    const b = taskBucket(t, now);
    map.set(b, [...(map.get(b) ?? []), t]);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
    bucket: b,
    tasks: map.get(b)!.sort((x, y) => (x.due ?? '').localeCompare(y.due ?? '') || x.title.localeCompare(y.title, 'ko')),
  }));
}

/** 할 일 목록 이름들 (설정에서 표시할 목록 고르기용) */
export function taskListNames(tasks: GoogleTask[]): string[] {
  return [...new Set(tasks.map((t) => t.list).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}
