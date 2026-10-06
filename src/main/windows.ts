import { join } from 'node:path';
import { BrowserWindow, screen, shell, type BrowserWindowConstructorOptions } from 'electron';
import { OverlayChannel, SettingsChannel, StudentChannel, TeacherChannel, type OverlayPayload } from '@shared/ipc';
import type { Settings, StudentSettings, WidgetDisplay, WidgetRole } from '@shared/types';
import { attachToDesktop, desktopMode, detachFromDesktop, setDesktopBounds } from './desktopLayer';
import { findDisplay, listDisplays, listMonitors, toAbsolute, toRelative } from './monitors';
import type { SettingsStore } from './store';

type PageName = 'student' | 'teacher' | 'settings' | 'identify' | 'overlay';

function loadPage(win: BrowserWindow, page: PageName, hash = ''): void {
  const wc = win.webContents;
  wc.on('preload-error', (_e, path, error) => console.error(`[${page}] preload 오류 ${path}:`, error));
  wc.on('did-fail-load', (_e, code, desc) => console.error(`[${page}] 로드 실패 ${code} ${desc}`));
  wc.on('render-process-gone', (_e, details) => console.error(`[${page}] 렌더러 종료:`, details.reason));
  wc.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.error(`[${page}] ${e.level}: ${e.message}`);
  });
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html${hash ? `#${hash}` : ''}`);
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`), { hash });
}

function preloadPath(name: 'student' | 'teacher' | 'settings' | 'overlay'): string {
  return join(__dirname, `../preload/${name}.js`);
}

/** 학생 창에 보낼 설정: 구글 연동 등 교사 관련 항목 제외 */
export function toStudentSettings(s: Settings): StudentSettings {
  const { google: _google, autoLaunch: _autoLaunch, teacherHideShortcut: _shortcut, display, ...rest } = s;
  return { ...rest, display: display.student };
}

const PROGRAMMATIC_MOVE_MS = 600;

export class WindowManager {
  private widgets: Partial<Record<WidgetRole, BrowserWindow>> = {};
  private settingsWin: BrowserWindow | null = null;
  private identifyWins: BrowserWindow[] = [];
  private overlayWin: BrowserWindow | null = null;
  private overlayTimer: NodeJS.Timeout | undefined;
  /** 프로그램이 직접 옮긴 직후의 moved/resized 이벤트는 저장하지 않는다 (임시 보정 위치가 저장되는 것 방지) */
  private ignoreMovesUntil: Record<WidgetRole, number> = { student: 0, teacher: 0 };
  private saveTimers: Partial<Record<WidgetRole, NodeJS.Timeout>> = {};
  /** 종료 중이면 위젯 창이 닫혀도 다시 만들지 않는다. */
  quitting = false;

  constructor(private readonly store: SettingsStore) {
    store.on('change', (next, prev) => this.onSettingsChange(next, prev));
    const onDisplays = () => this.onDisplaysChanged();
    screen.on('display-added', onDisplays);
    screen.on('display-removed', onDisplays);
    screen.on('display-metrics-changed', onDisplays);
  }

  /** IPC 요청이 해당 역할의 창에서 왔는지 확인한다. */
  isSender(role: WidgetRole | 'settings' | 'overlay', sender: Electron.WebContents): boolean {
    const win = role === 'settings' ? this.settingsWin : role === 'overlay' ? this.overlayWin : this.widgets[role];
    return !!win && !win.isDestroyed() && win.webContents === sender;
  }

  createWidgets(): void {
    this.createWidget('student');
    this.createWidget('teacher');
  }

  private createWidget(role: WidgetRole): void {
    const display = this.store.get().display[role];
    const options: BrowserWindowConstructorOptions = {
      show: false,
      frame: false,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: role === 'student' ? '우리반 시계 - 학생' : '우리반 시계 - 교사',
      backgroundColor: display.theme === 'dark' ? '#16181d' : '#ffffff',
      webPreferences: {
        preload: preloadPath(role),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        // 학생 창에서 알림음을 사용자 조작 없이 재생한다.
        autoplayPolicy: 'no-user-gesture-required',
      },
    };
    const win = new BrowserWindow(options);
    this.widgets[role] = win;
    loadPage(win, role);

    const scheduleSave = () => {
      if (Date.now() < this.ignoreMovesUntil[role]) return;
      clearTimeout(this.saveTimers[role]);
      this.saveTimers[role] = setTimeout(() => this.saveBounds(role), 300);
    };
    win.on('moved', scheduleSave);
    win.on('resized', scheduleSave);
    win.on('closed', () => {
      if (this.widgets[role] === win) delete this.widgets[role];
      // 탐색기 재시작 등으로 바탕화면(WorkerW)과 함께 창이 사라지면 다시 만든다.
      if (!this.quitting) setTimeout(() => !this.quitting && !this.widgets[role] && this.createWidget(role), 1000);
    });
    win.once('ready-to-show', () => this.applyWidget(role));
  }

  /** 설정에 맞춰 창 위치·레이어·불투명도·잠금을 적용한다. */
  private applyWidget(role: WidgetRole): void {
    const win = this.widgets[role];
    if (!win || win.isDestroyed()) return;
    const cfg = this.store.get().display[role];
    let display = findDisplay(cfg.monitorId);

    if (!display) {
      if (role === 'teacher') {
        // 교사 모니터가 없으면 학생 화면으로 옮기지 않고 숨긴다 (개인정보 보호).
        detachFromDesktop(win);
        win.hide();
        return;
      }
      display = screen.getPrimaryDisplay();
    }

    this.ignoreMovesUntil[role] = Date.now() + PROGRAMMATIC_MOVE_MS;
    this.applyAppearance(win, cfg);
    const bounds = toAbsolute(display, cfg.bounds);
    setDesktopBounds(win, bounds);
    // 바탕화면에 붙이면 Electron이 테두리를 나중에 다시 계산하므로 잠시 뒤 한 번 더 맞춘다.
    if (desktopMode(win) === 'desktop') setTimeout(() => !win.isDestroyed() && desktopMode(win) === 'desktop' && setDesktopBounds(win, bounds), 200);
    if (!win.isVisible()) win.showInactive();
  }

  private applyAppearance(win: BrowserWindow, cfg: WidgetDisplay): void {
    win.setOpacity(cfg.opacity);
    // 잠금(크기 조절 여부)을 먼저 바꾼다: 바탕화면에 붙인 뒤 바꾸면 Electron이 테두리 스타일을 다시 넣는다.
    win.setMovable(!cfg.locked);
    win.setResizable(!cfg.locked);
    this.applyLayer(win, cfg);
  }

  private applyLayer(win: BrowserWindow, cfg: WidgetDisplay): void {
    if (cfg.layer === 'alwaysOnTop') {
      detachFromDesktop(win);
      win.setAlwaysOnTop(true, 'floating');
      return;
    }
    // 바탕화면 고정은 위치를 잠갔을 때만 바탕화면 창에 붙인다.
    // 잠금을 풀면 '항상 아래' 일반 창이 되어 끌어서 옮기고 크기를 바꿀 수 있다.
    const wantDesktop = cfg.layer === 'desktop' && cfg.locked;
    const current = desktopMode(win);
    if (wantDesktop ? current === 'desktop' : current === 'bottom') return;
    const mode = attachToDesktop(win, !wantDesktop);
    if (!mode) win.setAlwaysOnTop(false);
  }

  private saveBounds(role: WidgetRole): void {
    const win = this.widgets[role];
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const abs = win.getBounds();
    const display = screen.getDisplayMatching(abs);
    this.store.mutate((s) => ({
      ...s,
      display: {
        ...s.display,
        [role]: { ...s.display[role], monitorId: String(display.id), bounds: toRelative(display, abs) },
      },
    }));
  }

  private onDisplaysChanged(): void {
    this.applyWidget('student');
    this.applyWidget('teacher');
    this.sendToSettings(SettingsChannel.monitorsChanged, listMonitors());
  }

  private onSettingsChange(next: Settings, prev: Settings): void {
    const student = this.widgets.student;
    if (student && !student.isDestroyed()) student.webContents.send(StudentChannel.settingsChanged, toStudentSettings(next));
    const teacher = this.widgets.teacher;
    if (teacher && !teacher.isDestroyed()) teacher.webContents.send(TeacherChannel.settingsChanged, next);
    this.sendToSettings(SettingsChannel.settingsChanged, next);

    for (const role of ['student', 'teacher'] as const) {
      const a = prev.display[role];
      const b = next.display[role];
      if (a === b) continue;
      const win = this.widgets[role];
      if (!win || win.isDestroyed()) continue;
      // 모니터·레이어·잠금이 바뀌면 저장된 위치까지 다시 적용하고, 나머지는 모양만 바꾼다.
      if (a.monitorId !== b.monitorId || a.layer !== b.layer || a.locked !== b.locked) this.applyWidget(role);
      else this.applyAppearance(win, b);
      if (a.theme !== b.theme) win.setBackgroundColor(b.theme === 'dark' ? '#16181d' : '#ffffff');
    }
  }

  private sendToSettings(channel: string, payload: unknown): void {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) this.settingsWin.webContents.send(channel, payload);
  }

  openSettings(): void {
    if (this.settingsWin && !this.settingsWin.isDestroyed()) {
      if (this.settingsWin.isMinimized()) this.settingsWin.restore();
      this.settingsWin.focus();
      return;
    }
    // 설정 창은 교사 모니터 가운데에 띄운다.
    const display = findDisplay(this.store.get().display.teacher.monitorId) ?? screen.getPrimaryDisplay();
    const wa = display.workArea;
    const width = Math.min(960, wa.width);
    const height = Math.min(720, wa.height);
    const win = new BrowserWindow({
      x: wa.x + Math.round((wa.width - width) / 2),
      y: wa.y + Math.round((wa.height - height) / 2),
      width,
      height,
      minWidth: 720,
      minHeight: 520,
      show: false,
      title: '우리반 시계 설정',
      autoHideMenuBar: true,
      webPreferences: { preload: preloadPath('settings'), contextIsolation: true, sandbox: true },
    });
    win.removeMenu();
    // 연동 안내의 링크는 기본 브라우저로 연다 (구글 도메인만 허용).
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\/(script|myaccount|support)\.google\.com\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    this.settingsWin = win;
    loadPage(win, 'settings');
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      this.settingsWin = null;
    });
  }

  /** 각 모니터에 번호를 3초간 크게 띄운다. */
  identifyMonitors(): void {
    for (const w of this.identifyWins) if (!w.isDestroyed()) w.close();
    this.identifyWins = listDisplays().map((d, i) => {
      const size = 360;
      const win = new BrowserWindow({
        x: d.bounds.x + Math.round((d.bounds.width - size) / 2),
        y: d.bounds.y + Math.round((d.bounds.height - size) / 2),
        width: size,
        height: size,
        frame: false,
        transparent: true,
        resizable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        webPreferences: { contextIsolation: true, sandbox: true },
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setIgnoreMouseEvents(true);
      const primary = d.id === screen.getPrimaryDisplay().id;
      loadPage(win, 'identify', `n=${i + 1}${primary ? '&primary=1' : ''}`);
      win.once('ready-to-show', () => win.showInactive());
      setTimeout(() => !win.isDestroyed() && win.close(), 3000);
      return win;
    });
  }

  /** 교사 위젯으로만 보낸다. 교사 개인 데이터(구글 일정·할 일)는 이 경로로만 나간다. */
  sendToTeacher(channel: (typeof TeacherChannel)[keyof typeof TeacherChannel], payload?: unknown): void {
    const win = this.widgets.teacher;
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  /** 학생 위젯으로 보낸다. 학생 창에는 이 메서드로 학생용 데이터만 전달한다. */
  sendToStudent(channel: (typeof StudentChannel)[keyof typeof StudentChannel], payload: unknown): void {
    const win = this.widgets.student;
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  /** 학생 모니터 전체에 알림 오버레이를 띄우고 seconds초 뒤 닫는다. */
  showOverlay(payload: OverlayPayload): void {
    this.closeOverlay();
    const display = findDisplay(this.store.get().display.student.monitorId) ?? screen.getPrimaryDisplay();
    const win = new BrowserWindow({
      ...display.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      title: '우리반 시계 - 알림',
      webPreferences: { preload: preloadPath('overlay'), contextIsolation: true, sandbox: true },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    this.overlayWin = win;
    loadPage(win, 'overlay');
    win.webContents.once('did-finish-load', () => {
      win.webContents.send(OverlayChannel.show, payload);
      win.showInactive();
    });
    win.on('closed', () => {
      if (this.overlayWin === win) this.overlayWin = null;
    });
    this.overlayTimer = setTimeout(() => this.closeOverlay(), payload.seconds * 1000);
  }

  closeOverlay(): void {
    clearTimeout(this.overlayTimer);
    if (this.overlayWin && !this.overlayWin.isDestroyed()) this.overlayWin.close();
    this.overlayWin = null;
  }

  setAllLocked(locked: boolean): void {
    this.store.mutate((s) => ({
      ...s,
      display: {
        student: { ...s.display.student, locked },
        teacher: { ...s.display.teacher, locked },
      },
    }));
  }
}
