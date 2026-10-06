import { EventEmitter } from 'node:events';
import Store from 'electron-store';
import { createDefaultSettings } from '@shared/defaults';
import { validateBlocks } from '@shared/schedule';
import type { Settings } from '@shared/types';

type PlainObject = Record<string, unknown>;

function isPlainObject(v: unknown): v is PlainObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 저장된 값에 없는 키를 기본값으로 채운다. 배열은 저장된 값을 그대로 쓴다. */
function fillDefaults<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) return (stored === undefined ? defaults : stored) as T;
  const out: PlainObject = { ...stored };
  for (const [key, value] of Object.entries(defaults)) {
    out[key] = key in stored ? fillDefaults(value, stored[key]) : value;
  }
  return out as T;
}

const EXPORT_FORMAT = 'classroom-clock-settings';

export interface SettingsExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  settings: Omit<Settings, 'display' | 'autoLaunch'>;
}

export class SettingsError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** 저장 전 검사. 시정표 오류가 있으면 저장하지 않는다. */
function assertValid(settings: Settings): void {
  if (settings.templates.length === 0) throw new SettingsError('시정표 템플릿이 하나 이상 있어야 해요.');
  for (const tpl of settings.templates) {
    if (tpl.name.trim() === '') throw new SettingsError('시정표 템플릿 이름을 입력하세요.');
    const errors = validateBlocks(tpl.blocks);
    if (errors.length > 0) throw new SettingsError(`"${tpl.name}" 시정표에 오류가 있어요.`, { templateId: tpl.id, errors });
  }
  const opacity = [settings.display.student.opacity, settings.display.teacher.opacity];
  if (opacity.some((o) => !(o >= 0.3 && o <= 1))) throw new SettingsError('불투명도는 30~100% 사이여야 해요.');

  const { alerts } = settings;
  if (alerts.offsets.some((o) => !Number.isInteger(o.minutes) || o.minutes < 1 || o.minutes > 60))
    throw new SettingsError('알림 시점은 1~60분 사이의 정수여야 해요.');
  if (!(alerts.overlaySeconds >= 1 && alerts.overlaySeconds <= 120))
    throw new SettingsError('전체 화면 알림 표시 시간은 1~120초 사이여야 해요.');
  if (!(alerts.startBannerSeconds >= 1 && alerts.startBannerSeconds <= 120))
    throw new SettingsError('수업 시작 배너 표시 시간은 1~120초 사이여야 해요.');
  if (alerts.sound.preset === 'custom' && !alerts.sound.file) throw new SettingsError('알림음 파일을 선택하세요.');

  const { google } = settings;
  if (!(google.refreshMinutes >= 1 && google.refreshMinutes <= 120)) throw new SettingsError('자동 새로고침은 1~120분 사이여야 해요.');
  if (!(google.days >= 1 && google.days <= 60)) throw new SettingsError('다가오는 일정 범위는 1~60일 사이여야 해요.');
  if (!(google.eventReminderMinutes >= 0 && google.eventReminderMinutes <= 120))
    throw new SettingsError('일정 미리 알림은 0~120분 사이여야 해요.');
}

/**
 * 설정 저장소. %APPDATA%/<앱 이름>/settings.json 에 저장된다.
 * 'change' 이벤트로 (새 설정, 이전 설정)을 알린다.
 */
export class SettingsStore extends EventEmitter<{ change: [Settings, Settings] }> {
  private readonly store = new Store<{ settings: Settings }>({ name: 'settings' });
  private current: Settings;

  constructor() {
    super();
    this.current = fillDefaults(createDefaultSettings(), this.store.get('settings'));
  }

  get(): Settings {
    return this.current;
  }

  /** 최상위 키 단위로 교체한다. 검사에 실패하면 SettingsError를 던지고 저장하지 않는다. */
  update(patch: Partial<Settings>): Settings {
    const next: Settings = { ...this.current, ...patch };
    assertValid(next);
    return this.commit(next);
  }

  /** 검사 없이 내부 값(위젯 위치 등)을 갱신한다. */
  mutate(fn: (draft: Settings) => Settings): Settings {
    return this.commit(fn(this.current));
  }

  /** 초기화. 이 PC에만 해당하는 값(모니터 배치·위젯 위치, 자동 실행)은 유지한다. */
  reset(): Settings {
    return this.commit(this.keepLocal(createDefaultSettings()));
  }

  /** 내보내기용 데이터: PC마다 다른 화면 배치·자동 실행은 빼고, 토큰은 애초에 설정에 없다. */
  exportData(): SettingsExport {
    const { display: _display, autoLaunch: _autoLaunch, ...rest } = this.current;
    return { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), settings: rest };
  }

  /** 가져오기. 형식·내용을 검사하고, 이 PC의 화면 배치·자동 실행은 그대로 둔다. */
  importData(data: unknown): Settings {
    const obj = data as Partial<SettingsExport> | null;
    if (!obj || obj.format !== EXPORT_FORMAT || typeof obj.settings !== 'object' || obj.settings === null)
      throw new SettingsError('우리반 시계 설정 파일이 아니에요.');
    const next = this.keepLocal(fillDefaults(createDefaultSettings(), obj.settings));
    assertValid(next);
    return this.commit(next);
  }

  private keepLocal(next: Settings): Settings {
    return { ...next, display: this.current.display, autoLaunch: this.current.autoLaunch };
  }

  private commit(next: Settings): Settings {
    const prev = this.current;
    this.current = next;
    this.store.set('settings', next);
    this.emit('change', next, prev);
    return next;
  }
}
