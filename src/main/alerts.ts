import { readFile } from 'node:fs/promises';
import { powerMonitor } from 'electron';
import { StudentChannel, type BannerPayload, type PauseMode, type SoundPayload } from '@shared/ipc';
import { AlertScheduler, pauseForMinutes, pauseUntilEndOfDay, type AlertEvent, type AlertKind } from '@shared/schedule';
import type { SettingsStore } from './store';
import type { WindowManager } from './windows';

/**
 * 수업 알림 서비스. 초 경계에 맞춰 1초마다 틱하고,
 * 절전 복귀·잠금 해제 시 즉시 다시 계산한다(지난 알림은 소급하지 않음).
 */
export class AlertService {
  private readonly scheduler: AlertScheduler;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: SettingsStore,
    private readonly windows: WindowManager,
  ) {
    this.scheduler = new AlertScheduler(
      () => store.get(),
      (e) => this.dispatch(e),
    );
  }

  start(): void {
    const resync = () => {
      this.scheduler.reset();
      this.schedule(0);
    };
    powerMonitor.on('resume', resync);
    powerMonitor.on('unlock-screen', resync);
    this.schedule(0);
  }

  preview(kind: AlertKind): void {
    this.scheduler.preview(kind, new Date());
  }

  setPause(mode: PauseMode): void {
    const now = new Date();
    const pausedUntil = mode === 'today' ? pauseUntilEndOfDay(now) : mode === 'hour' ? pauseForMinutes(now, 60) : null;
    this.store.mutate((s) => ({ ...s, alerts: { ...s.alerts, pausedUntil } }));
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const now = new Date();
      this.scheduler.tick(now);
      // 다음 초 경계 직후에 깨어나도록 맞춘다.
      this.schedule(1000 - now.getMilliseconds() + 5);
    }, delay);
  }

  private dispatch(e: AlertEvent): void {
    if (e.kind === 'overlay') {
      const seconds = Math.max(1, Math.round((e.until.getTime() - Date.now()) / 1000));
      this.windows.showOverlay({ text: e.text, seconds });
    } else {
      const banner: BannerPayload = { kind: e.kind, text: e.text, until: e.until.toISOString() };
      this.windows.sendToStudent(StudentChannel.alert, banner);
    }
    if (e.sound) void this.playSound(e.kind);
  }

  private async playSound(kind: AlertKind): Promise<void> {
    const { sound } = this.store.get().alerts;
    if (sound.muted) return;
    // 전체 화면 알림(1분 전)은 배너(3분 전)와 다른 소리로 울린다.
    const preset = kind === 'overlay' ? sound.overlayPreset : sound.preset;
    const payload: SoundPayload = { preset, volume: sound.volume };
    if (preset === 'custom') {
      try {
        payload.data = new Uint8Array(await readFile(sound.file));
      } catch (err) {
        console.error('알림음 파일을 읽지 못해 기본 소리로 재생해요:', err);
        payload.preset = 'dingdong';
      }
    }
    this.windows.sendToStudent(StudentChannel.playSound, payload);
  }
}
