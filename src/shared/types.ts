// 로컬 저장 데이터 모델 (PRD 7장 기준)

export type BlockKind = 'morning' | 'class' | 'break' | 'lunch' | 'other';

export interface Block {
  id: string;
  name: string; // "1교시"
  kind: BlockKind;
  start: string; // "09:00"
  end: string; // "09:40"
}

export interface ScheduleTemplate {
  id: string;
  name: string; // "기본 시정"
  blocks: Block[];
}

/** 0=일 ~ 6=토 (Date#getDay와 동일) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TaskItem {
  id: string;
  text: string;
  icon?: string;
  done?: boolean;
}

export interface MorningTasks {
  default: TaskItem[];
  byWeekday: Partial<Record<Weekday, TaskItem[]>>;
  todayOnly: { date: string; items: TaskItem[] };
}

/**
 * 알림 시점. PRD의 offsetsMinutes(number[])를 확장해
 * 시점별 켜기/끄기와 표시 방식(배너/오버레이)을 지정할 수 있게 했다.
 */
export interface AlertOffset {
  id: string;
  minutes: number;
  style: 'banner' | 'overlay';
  enabled: boolean;
}

export type SoundPreset = 'dingdong' | 'chime' | 'xylophone' | 'custom';

export interface AlertSettings {
  offsets: AlertOffset[];
  overlaySeconds: number;
  /** 수업 시작 시 "3교시 체육 시작!" 배너 유지 시간 */
  startBannerSeconds: number;
  /** 키: banner | overlay | start. 변수: {교시} {과목} {준비물} {남은분} */
  templates: Record<'banner' | 'overlay' | 'start', string>;
  sound: { preset: SoundPreset; file: string; volume: number; muted: boolean };
  /** ISO 시각. 이 시각 전까지 알림을 울리지 않는다. */
  pausedUntil: string | null;
}

export interface GoogleSettings {
  webAppUrl: string;
  refreshMinutes: number;
  days: number;
  /** 표시할 할 일 목록 이름. 비어 있으면 전체 */
  lists: string[];
  /** 일정 시작 몇 분 전에 교사 위젯에 알릴지. 0이면 끔 */
  eventReminderMinutes: number;
}

export type FontScale = 'small' | 'normal' | 'large' | 'xlarge';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetDisplay {
  /** Electron display id (문자열로 저장). 빈 문자열이면 아직 지정 안 됨. */
  monitorId: string;
  /** 모니터 workArea 좌상단 기준 상대 좌표. 모니터 배치가 바뀌어도 같은 모니터 안 위치를 유지한다. */
  bounds: Bounds;
  /** desktop: 바탕화면 고정(위치 잠금 시 바탕화면에 붙임), bottom: 항상 아래(호환 모드) */
  layer: 'alwaysOnTop' | 'desktop' | 'bottom';
  opacity: number; // 0.3 ~ 1
  fontScale: FontScale;
  locked: boolean;
  theme: 'light' | 'dark';
}

export type WidgetRole = 'student' | 'teacher';

export interface Settings {
  schemaVersion: number;
  templates: ScheduleTemplate[];
  weekdayTemplate: Record<Weekday, string | null>;
  /** "2026-10-09" → 템플릿 id 또는 'none'(수업 없음) */
  dateOverrides: Record<string, string>;
  /** 요일 → (블록 이름 → 과목) */
  weeklySubjects: Partial<Record<Weekday, Record<string, string>>>;
  /** 과목 → 준비물/안내 */
  subjectNotes: Record<string, string>;
  /** 날짜 → (블록 이름 → 과목) */
  subjectOverrides: Record<string, Record<string, string>>;
  morningTasks: MorningTasks;
  alerts: AlertSettings;
  google: GoogleSettings;
  display: Record<WidgetRole, WidgetDisplay>;
  /** 교사 위젯 가리기 단축키 (Electron accelerator 형식). 빈 문자열이면 사용 안 함 */
  teacherHideShortcut: string;
  autoLaunch: boolean;
}

export const NO_SCHOOL = 'none';

/** 학생 창으로 보내는 설정. 구글 연동 정보 등 교사 관련 항목을 제외한다. */
export type StudentSettings = Omit<Settings, 'google' | 'autoLaunch' | 'display' | 'teacherHideShortcut'> & {
  display: WidgetDisplay;
};

/** 교사 위젯으로 보내는 설정 */
export type TeacherSettings = Settings;

export interface MonitorInfo {
  id: string;
  /** 사용자에게 보여주는 번호 (1부터) */
  number: number;
  primary: boolean;
  label: string;
  bounds: Bounds;
}

// ---- 구글 연동 (교사 위젯 전용 데이터) ----

export interface GoogleEvent {
  id: string;
  title: string;
  /** 시간 일정: ISO 시각, 종일 일정: "2026-10-05" */
  start: string;
  /** 종일 일정의 end는 다음 날(배타적) */
  end: string;
  allDay: boolean;
  location: string;
  calendar: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  /** "2026-10-06" 또는 null */
  due: string | null;
  notes: string;
  list: string;
}

export interface GoogleData {
  generatedAt: string;
  events: GoogleEvent[];
  tasks: GoogleTask[];
}

export type GoogleState = 'notConfigured' | 'loading' | 'ok' | 'offline' | 'error';

export interface GoogleStatus {
  state: GoogleState;
  /** 마지막으로 성공한 동기화 시각 (ISO) */
  lastSync: string | null;
  message: string | null;
}

/** 교사 위젯으로 보내는 구글 데이터와 상태 */
export interface GoogleSnapshot {
  data: GoogleData | null;
  status: GoogleStatus;
}
