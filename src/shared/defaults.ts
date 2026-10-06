import type { Block, BlockKind, ScheduleTemplate, Settings, WidgetDisplay } from './types';

export const SCHEMA_VERSION = 1;
export const DEFAULT_TEMPLATE_ID = 'tpl-default';

function block(id: string, name: string, kind: BlockKind, start: string, end: string): Block {
  return { id, name, kind, start, end };
}

/** 샘플 기본 시정: 아침시간, 1~6교시 40분 수업, 쉬는시간 10분, 4교시 뒤 점심 */
export function createSampleTemplate(): ScheduleTemplate {
  return {
    id: DEFAULT_TEMPLATE_ID,
    name: '기본 시정',
    blocks: [
      block('b-morning', '아침시간', 'morning', '08:40', '09:00'),
      block('b-1', '1교시', 'class', '09:00', '09:40'),
      block('b-break1', '쉬는시간', 'break', '09:40', '09:50'),
      block('b-2', '2교시', 'class', '09:50', '10:30'),
      block('b-break2', '쉬는시간', 'break', '10:30', '10:40'),
      block('b-3', '3교시', 'class', '10:40', '11:20'),
      block('b-break3', '쉬는시간', 'break', '11:20', '11:30'),
      block('b-4', '4교시', 'class', '11:30', '12:10'),
      block('b-lunch', '점심시간', 'lunch', '12:10', '12:50'),
      block('b-5', '5교시', 'class', '12:50', '13:30'),
      block('b-break5', '쉬는시간', 'break', '13:30', '13:40'),
      block('b-6', '6교시', 'class', '13:40', '14:20'),
    ],
  };
}

function widgetDisplay(partial: Partial<WidgetDisplay>): WidgetDisplay {
  return {
    monitorId: '',
    bounds: { x: 40, y: 40, width: 420, height: 560 },
    layer: 'alwaysOnTop',
    opacity: 1,
    fontScale: 'normal',
    locked: false,
    theme: 'light',
    ...partial,
  };
}

export function createDefaultSettings(): Settings {
  return {
    schemaVersion: SCHEMA_VERSION,
    templates: [createSampleTemplate()],
    weekdayTemplate: {
      0: null,
      1: DEFAULT_TEMPLATE_ID,
      2: DEFAULT_TEMPLATE_ID,
      3: DEFAULT_TEMPLATE_ID,
      4: DEFAULT_TEMPLATE_ID,
      5: DEFAULT_TEMPLATE_ID,
      6: null,
    },
    dateOverrides: {},
    weeklySubjects: {},
    subjectNotes: {},
    subjectOverrides: {},
    morningTasks: {
      default: [
        { id: 'mt-1', text: '알림장 꺼내기', icon: '📒' },
        { id: 'mt-2', text: '아침 독서', icon: '📚' },
      ],
      byWeekday: {},
      todayOnly: { date: '', items: [] },
    },
    alerts: {
      offsets: [
        { id: 'off-3', minutes: 3, style: 'banner', enabled: true },
        { id: 'off-1', minutes: 1, style: 'overlay', enabled: true },
      ],
      overlaySeconds: 10,
      startBannerSeconds: 5,
      templates: {
        banner: '{남은분}분 뒤 {교시} {과목}이에요. {준비물}',
        overlay: '{남은분}분 뒤 {교시}가 시작돼요! 자리에 앉아요.',
        start: '{교시} {과목} 시작!',
      },
      sound: { preset: 'dingdong', file: '', volume: 0.8, muted: false },
      pausedUntil: null,
    },
    google: { webAppUrl: '', refreshMinutes: 5, days: 7, lists: [], eventReminderMinutes: 10 },
    display: {
      student: widgetDisplay({ layer: 'alwaysOnTop', fontScale: 'large' }),
      // x를 크게 잡아 모니터 오른쪽 끝에 붙인다 (배치 시 모니터 안쪽으로 보정됨).
      teacher: widgetDisplay({ layer: 'desktop', bounds: { x: 100_000, y: 40, width: 380, height: 640 } }),
    },
    teacherHideShortcut: 'Ctrl+Alt+H',
    autoLaunch: true,
  };
}
