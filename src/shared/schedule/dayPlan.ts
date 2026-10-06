import { NO_SCHOOL, type Block, type ScheduleTemplate, type Settings, type TaskItem, type Weekday } from '../types';
import { atTime, parseHHmm, toDateKey } from './time';

type PlanSource = Pick<
  Settings,
  'templates' | 'weekdayTemplate' | 'dateOverrides' | 'weeklySubjects' | 'subjectNotes' | 'subjectOverrides'
>;

export interface PlannedBlock extends Block {
  /** 과목명. 비어 있으면 '' */
  subject: string;
  /** 과목 준비물/안내. 없으면 '' */
  note: string;
  startAt: Date;
  endAt: Date;
}

export type DayPlan =
  | { date: string; status: 'school'; template: ScheduleTemplate; blocks: PlannedBlock[] }
  | { date: string; status: 'noSchool'; reason: 'override' | 'weekday' | 'missingTemplate' };

/**
 * 날짜에 적용할 템플릿을 결정한다.
 * 우선순위: 날짜 예외 → 요일 지정. 'none'이면 수업 없음.
 */
export function resolveTemplate(
  settings: Pick<Settings, 'templates' | 'weekdayTemplate' | 'dateOverrides'>,
  date: Date,
): { template: ScheduleTemplate | null; reason: 'override' | 'weekday' | 'missingTemplate' } {
  const key = toDateKey(date);
  const override = settings.dateOverrides[key];
  if (override !== undefined) {
    if (override === NO_SCHOOL) return { template: null, reason: 'override' };
    const tpl = settings.templates.find((t) => t.id === override);
    // 지정했던 템플릿이 삭제됐으면 요일 기본값으로 되돌아간다.
    if (tpl) return { template: tpl, reason: 'override' };
  }
  const id = settings.weekdayTemplate[date.getDay() as Weekday];
  if (!id) return { template: null, reason: 'weekday' };
  const tpl = settings.templates.find((t) => t.id === id);
  return tpl ? { template: tpl, reason: 'weekday' } : { template: null, reason: 'missingTemplate' };
}

/** 날짜·블록 이름에 해당하는 과목. 날짜별 변경이 주간 시간표보다 우선한다. */
export function resolveSubject(
  settings: Pick<Settings, 'weeklySubjects' | 'subjectOverrides'>,
  date: Date,
  blockName: string,
): string {
  const override = settings.subjectOverrides[toDateKey(date)]?.[blockName];
  if (override !== undefined && override.trim() !== '') return override.trim();
  return settings.weeklySubjects[date.getDay() as Weekday]?.[blockName]?.trim() ?? '';
}

export function getDayPlan(settings: PlanSource, date: Date): DayPlan {
  const key = toDateKey(date);
  const { template, reason } = resolveTemplate(settings, date);
  if (!template) return { date: key, status: 'noSchool', reason };

  const blocks = template.blocks
    .filter((b) => !Number.isNaN(parseHHmm(b.start)) && !Number.isNaN(parseHHmm(b.end)))
    .map<PlannedBlock>((b) => {
      const subject = resolveSubject(settings, date, b.name);
      return {
        ...b,
        subject,
        note: subject ? (settings.subjectNotes[subject]?.trim() ?? '') : '',
        startAt: atTime(date, b.start),
        endAt: atTime(date, b.end),
      };
    })
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return { date: key, status: 'school', template, blocks };
}

/** 표시용 이름: "2교시 수학" 또는 과목이 없으면 "2교시" */
export function blockLabel(block: Pick<PlannedBlock, 'name' | 'subject'>): string {
  return block.subject ? `${block.name} ${block.subject}` : block.name;
}

/** 오늘 보여줄 아침 할 일: 요일별 목록(있으면) 또는 기본 목록 + 오늘만 항목 */
export function getMorningTasks(settings: Pick<Settings, 'morningTasks'>, date: Date): TaskItem[] {
  const { morningTasks } = settings;
  const weekday = morningTasks.byWeekday[date.getDay() as Weekday];
  const base = weekday && weekday.length > 0 ? weekday : morningTasks.default;
  const todayOnly = morningTasks.todayOnly.date === toDateKey(date) ? morningTasks.todayOnly.items : [];
  return [...base, ...todayOnly];
}
