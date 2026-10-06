// preload가 window.api로 노출하는 API 타입. 창 종류마다 다른 API를 받는다.
import type { AlertKind } from './schedule/alerts';
import type { AppInfo, BannerPayload, ConnectionTestResult, GoogleInfo, OverlayPayload, PauseMode, SoundPayload, UpdateResult } from './ipc';
import type { GoogleSnapshot, MonitorInfo, MorningTasks, Settings, StudentSettings, TeacherSettings } from './types';

type Unsubscribe = () => void;

export interface StudentApi {
  getSettings(): Promise<StudentSettings>;
  onSettings(cb: (s: StudentSettings) => void): Unsubscribe;
  onBanner(cb: (b: BannerPayload) => void): Unsubscribe;
  onSound(cb: (s: SoundPayload) => void): Unsubscribe;
}

export interface TeacherApi {
  getSettings(): Promise<TeacherSettings>;
  onSettings(cb: (s: TeacherSettings) => void): Unsubscribe;
  openSettings(): Promise<void>;
  setPause(mode: PauseMode): Promise<void>;
  updateMorningTasks(tasks: MorningTasks): Promise<UpdateResult<Settings>>;
  getGoogle(): Promise<GoogleSnapshot>;
  refreshGoogle(): Promise<void>;
  onGoogle(cb: (g: GoogleSnapshot) => void): Unsubscribe;
  /** 가리기 단축키 */
  onToggleCover(cb: () => void): Unsubscribe;
}

export interface SettingsApi {
  get(): Promise<Settings>;
  update(patch: Partial<Settings>): Promise<UpdateResult<Settings>>;
  reset(): Promise<Settings>;
  listMonitors(): Promise<MonitorInfo[]>;
  identifyMonitors(): Promise<void>;
  previewAlert(kind: AlertKind): Promise<void>;
  /** 소리 파일 선택 대화상자. 취소하면 null */
  pickSoundFile(): Promise<string | null>;
  readSoundFile(path: string): Promise<Uint8Array | null>;
  googleTest(url: string, token: string): Promise<ConnectionTestResult>;
  /** 빈 문자열이면 토큰 삭제 */
  googleSetToken(token: string): Promise<GoogleInfo>;
  googleInfo(): Promise<GoogleInfo>;
  /** 저장했으면 파일 경로, 취소하면 null */
  exportSettings(): Promise<string | null>;
  /** 가져오기 결과. 취소하면 null */
  importSettings(): Promise<UpdateResult<Settings> | null>;
  appInfo(): Promise<AppInfo>;
  onSettings(cb: (s: Settings) => void): Unsubscribe;
  onMonitors(cb: (m: MonitorInfo[]) => void): Unsubscribe;
}

export interface OverlayApi {
  onShow(cb: (p: OverlayPayload) => void): Unsubscribe;
  close(): void;
}
