// IPC 채널 이름. 창 종류별로 접두어를 나눠, 학생 창 preload에는 학생 채널만 노출한다.
import type { GoogleStatus, SoundPreset } from './types';

export const StudentChannel = {
  getSettings: 'student:get-settings',
  settingsChanged: 'student:settings-changed',
  alert: 'student:alert',
  playSound: 'student:play-sound',
} as const;

export const TeacherChannel = {
  getSettings: 'teacher:get-settings',
  settingsChanged: 'teacher:settings-changed',
  openSettings: 'teacher:open-settings',
  setPause: 'teacher:set-pause',
  updateMorningTasks: 'teacher:update-morning-tasks',
  getGoogle: 'teacher:get-google',
  refreshGoogle: 'teacher:refresh-google',
  googleChanged: 'teacher:google-changed',
  toggleCover: 'teacher:toggle-cover',
} as const;

export const SettingsChannel = {
  get: 'settings:get',
  update: 'settings:update',
  reset: 'settings:reset',
  listMonitors: 'settings:list-monitors',
  identifyMonitors: 'settings:identify-monitors',
  previewAlert: 'settings:preview-alert',
  pickSoundFile: 'settings:pick-sound-file',
  readSoundFile: 'settings:read-sound-file',
  googleTest: 'settings:google-test',
  googleSetToken: 'settings:google-set-token',
  googleInfo: 'settings:google-info',
  exportSettings: 'settings:export',
  importSettings: 'settings:import',
  appInfo: 'settings:app-info',
  settingsChanged: 'settings:settings-changed',
  monitorsChanged: 'settings:monitors-changed',
  updateStatus: 'settings:update-status',
  checkUpdate: 'settings:check-update',
  installUpdate: 'settings:install-update',
  openDownloadPage: 'settings:open-download-page',
  updateChanged: 'settings:update-changed',
} as const;

/** 1분 전 알림 오버레이 창. 문구만 받는다. */
export const OverlayChannel = {
  show: 'overlay:show',
  close: 'overlay:close',
} as const;

export interface AppInfo {
  version: string;
  /** 설치형/무설치(portable)/개발 실행 */
  edition: 'installed' | 'portable' | 'dev';
  /** 자동 실행을 실제로 설정할 수 있는지 (개발 실행에서는 불가) */
  canAutoLaunch: boolean;
}

/**
 * 프로그램 업데이트 상태.
 * 설치형은 새 버전을 자동으로 내려받아 두고, 무설치판·개발 실행은 홈페이지로 안내한다.
 */
export type AppUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'latest'; checkedAt: string }
  | { state: 'downloading'; version: string; percent: number }
  /** 설치형: 다 받았고, 다시 시작하면(또는 종료할 때) 설치된다. */
  | { state: 'downloaded'; version: string }
  /** 무설치판·개발 실행: 자동 설치가 안 되니 홈페이지에서 받아야 한다. */
  | { state: 'manual'; version: string }
  | { state: 'error'; message: string };

/** settings:update 결과 */
export type UpdateResult<T> = { ok: true; settings: T } | { ok: false; message: string; details?: unknown };

/** 학생 위젯 상단 배너 */
export interface BannerPayload {
  kind: 'banner' | 'start';
  text: string;
  /** ISO 시각. 이때 배너를 내린다. */
  until: string;
}

export interface SoundPayload {
  preset: Exclude<SoundPreset, 'custom'> | 'custom';
  volume: number;
  /** 사용자 소리 파일 내용 (preset이 custom일 때) */
  data?: Uint8Array;
}

export interface OverlayPayload {
  text: string;
  seconds: number;
}

export type PauseMode = 'today' | 'hour' | 'off';

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  events?: number;
  tasks?: number;
  lists?: string[];
}

/** 설정 화면에 보여줄 연동 상태 (토큰 값은 보내지 않는다) */
export interface GoogleInfo {
  hasToken: boolean;
  status: GoogleStatus;
  /** 마지막으로 받은 할 일 목록 이름들 */
  lists: string[];
}
