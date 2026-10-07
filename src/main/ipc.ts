import { readFile, writeFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { appEdition } from './autoLaunch';
import { toDateKey } from '@shared/schedule';
import { OverlayChannel, SettingsChannel, StudentChannel, TeacherChannel, type PauseMode, type UpdateResult } from '@shared/ipc';
import type { AlertKind } from '@shared/schedule';
import type { AlertService } from './alerts';
import type { GoogleService } from './google';
import type { UpdateService } from './updater';
import type { MorningTasks, Settings, WidgetRole } from '@shared/types';
import { listMonitors } from './monitors';
import { SettingsError, type SettingsStore } from './store';
import { toStudentSettings, type WindowManager } from './windows';

export function registerIpc(
  store: SettingsStore,
  windows: WindowManager,
  alerts: AlertService,
  google: GoogleService,
  updates: UpdateService,
): void {
  const tryUpdate = (patch: Partial<Settings>): UpdateResult<Settings> => {
    try {
      return { ok: true, settings: store.update(patch) };
    } catch (err) {
      if (err instanceof SettingsError) return { ok: false, message: err.message, details: err.details };
      throw err;
    }
  };

  /** 지정한 창에서 온 요청만 처리한다. 다른 창이 다른 역할의 채널을 호출하면 거부. */
  const handle = <A extends unknown[], R>(
    role: WidgetRole | 'settings' | 'overlay',
    channel: string,
    fn: (event: IpcMainInvokeEvent, ...args: A) => R,
  ) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!windows.isSender(role, event.sender)) throw new Error(`forbidden: ${channel}`);
      return fn(event, ...(args as A));
    });

  // 학생 창: 교사 데이터가 빠진 설정만 받는다.
  handle('student', StudentChannel.getSettings, () => toStudentSettings(store.get()));

  // 교사 위젯
  handle('teacher', TeacherChannel.getSettings, () => store.get());
  handle('teacher', TeacherChannel.openSettings, () => windows.openSettings());
  handle('teacher', TeacherChannel.setPause, (_e, mode: PauseMode) => alerts.setPause(mode));
  // 구글 데이터는 교사 위젯에서만 받는다.
  handle('teacher', TeacherChannel.getGoogle, () => google.snapshot());
  handle('teacher', TeacherChannel.refreshGoogle, () => google.refresh());
  // 아침 할 일은 교사 위젯에서 바로 고친다 (학생 화면에 즉시 반영)
  handle('teacher', TeacherChannel.updateMorningTasks, (_e, morningTasks: MorningTasks) => tryUpdate({ morningTasks }));

  // 설정 창
  handle('settings', SettingsChannel.get, () => store.get());
  handle('settings', SettingsChannel.listMonitors, () => listMonitors());
  handle('settings', SettingsChannel.identifyMonitors, () => windows.identifyMonitors());
  handle('settings', SettingsChannel.reset, () => store.reset());
  handle('settings', SettingsChannel.previewAlert, (_e, kind: AlertKind) => alerts.preview(kind));
  handle('settings', SettingsChannel.pickSoundFile, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: '알림음 파일 선택',
      properties: ['openFile'],
      filters: [{ name: '소리 파일', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
    };
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });
  handle('settings', SettingsChannel.googleTest, (_e, url: string, token: string) => google.test(url, token));
  handle('settings', SettingsChannel.googleInfo, () => google.info());
  handle('settings', SettingsChannel.googleSetToken, (_e, token: string) => {
    google.setToken(token);
    return google.info();
  });
  handle('settings', SettingsChannel.appInfo, () => ({
    version: app.getVersion(),
    edition: appEdition(),
    canAutoLaunch: appEdition() !== 'dev',
  }));
  handle('settings', SettingsChannel.updateStatus, () => updates.get());
  handle('settings', SettingsChannel.checkUpdate, () => updates.check());
  handle('settings', SettingsChannel.installUpdate, () => updates.install());
  handle('settings', SettingsChannel.openDownloadPage, () => updates.openDownloadPage());
  handle('settings', SettingsChannel.exportSettings, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.SaveDialogOptions = {
      title: '설정 내보내기',
      defaultPath: `우리반시계-설정-${toDateKey(new Date())}.json`,
      filters: [{ name: '우리반 시계 설정', extensions: ['json'] }],
    };
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (res.canceled || !res.filePath) return null;
    await writeFile(res.filePath, JSON.stringify(store.exportData(), null, 2), 'utf8');
    return res.filePath;
  });
  handle('settings', SettingsChannel.importSettings, async (event): Promise<UpdateResult<Settings> | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: '설정 가져오기',
      properties: ['openFile'],
      filters: [{ name: '우리반 시계 설정', extensions: ['json'] }],
    };
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (res.canceled || !res.filePaths[0]) return null;
    let data: unknown;
    try {
      // 메모장 등이 붙이는 BOM 제거
      data = JSON.parse((await readFile(res.filePaths[0], 'utf8')).replace(/^﻿/, ''));
    } catch {
      return { ok: false, message: '파일을 읽을 수 없어요. JSON 형식인지 확인하세요.' };
    }
    try {
      return { ok: true, settings: store.importData(data) };
    } catch (err) {
      if (err instanceof SettingsError) return { ok: false, message: err.message, details: err.details };
      throw err;
    }
  });
  handle('settings', SettingsChannel.readSoundFile, async (_e, path: string) => {
    if (!/\.(mp3|wav|ogg|m4a)$/i.test(path)) return null;
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      return null;
    }
  });

  // 알림 오버레이: 클릭하면 닫힘
  ipcMain.on(OverlayChannel.close, (event) => {
    if (windows.isSender('overlay', event.sender)) windows.closeOverlay();
  });
  handle('settings', SettingsChannel.update, (_e, patch: Partial<Settings>) => tryUpdate(patch));
}
