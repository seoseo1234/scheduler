// preload가 window.api로 노출하는 API 타입. 창 종류마다 다른 API를 받는다.
import type { AlertKind } from './schedule/alerts';
import type { AppInfo, AppUpdateStatus, BannerPayload, MenuPoint, WidgetMenuAction, ConnectionTestResult, GoogleInfo, OverlayPayload, PauseMode, SoundPayload, TaskAction, TaskActionResult, UpdateResult } from './ipc';
import type { GoogleSnapshot, MonitorInfo, MorningTasks, Settings, StudentSettings, TeacherSettings } from './types';

type Unsubscribe = () => void;

/** 위젯 오른쪽 클릭 메뉴 (학생·교사 공통) */
export interface WidgetMenuApi {
  /** 잠금을 풀어 창 전체가 끌기 영역일 때는 메인이 메뉴 위치를 보내 준다. */
  onShowMenu(cb: (p: MenuPoint) => void): Unsubscribe;
  menuAction(action: WidgetMenuAction): Promise<void>;
}

export interface StudentApi extends WidgetMenuApi {
  getSettings(): Promise<StudentSettings>;
  onSettings(cb: (s: StudentSettings) => void): Unsubscribe;
  onBanner(cb: (b: BannerPayload) => void): Unsubscribe;
  onSound(cb: (s: SoundPayload) => void): Unsubscribe;
}

export interface TeacherApi extends WidgetMenuApi {
  getSettings(): Promise<TeacherSettings>;
  onSettings(cb: (s: TeacherSettings) => void): Unsubscribe;
  openSettings(): Promise<void>;
  setPause(mode: PauseMode): Promise<void>;
  updateMorningTasks(tasks: MorningTasks): Promise<UpdateResult<Settings>>;
  getGoogle(): Promise<GoogleSnapshot>;
  refreshGoogle(): Promise<void>;
  /** 구글 할 일 완료·수정·삭제 */
  taskAction(action: TaskAction): Promise<TaskActionResult>;
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
  updateStatus(): Promise<AppUpdateStatus>;
  checkUpdate(): Promise<void>;
  /** 받아 둔 업데이트를 설치하고 다시 시작 */
  installUpdate(): Promise<void>;
  openDownloadPage(): Promise<void>;
  onUpdate(cb: (s: AppUpdateStatus) => void): Unsubscribe;
}

export interface OverlayApi {
  onShow(cb: (p: OverlayPayload) => void): Unsubscribe;
  close(): void;
}
