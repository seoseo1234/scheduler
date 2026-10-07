import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { SettingsApi } from '@shared/api';
import type { SettingsChannel as Channels } from '@shared/ipc';

// sandbox preload는 다른 파일(공유 청크)을 require할 수 없어, 런타임 값은 이 파일 안에만 둔다.
// 채널 이름은 satisfies로 공유 정의와 일치하는지 타입 검사한다.
const SettingsChannel = {
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
} as const satisfies typeof Channels;

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: SettingsApi = {
  get: () => ipcRenderer.invoke(SettingsChannel.get),
  update: (patch) => ipcRenderer.invoke(SettingsChannel.update, patch),
  reset: () => ipcRenderer.invoke(SettingsChannel.reset),
  listMonitors: () => ipcRenderer.invoke(SettingsChannel.listMonitors),
  identifyMonitors: () => ipcRenderer.invoke(SettingsChannel.identifyMonitors),
  previewAlert: (kind) => ipcRenderer.invoke(SettingsChannel.previewAlert, kind),
  pickSoundFile: () => ipcRenderer.invoke(SettingsChannel.pickSoundFile),
  readSoundFile: (path) => ipcRenderer.invoke(SettingsChannel.readSoundFile, path),
  googleTest: (url, token) => ipcRenderer.invoke(SettingsChannel.googleTest, url, token),
  googleSetToken: (token) => ipcRenderer.invoke(SettingsChannel.googleSetToken, token),
  googleInfo: () => ipcRenderer.invoke(SettingsChannel.googleInfo),
  exportSettings: () => ipcRenderer.invoke(SettingsChannel.exportSettings),
  importSettings: () => ipcRenderer.invoke(SettingsChannel.importSettings),
  appInfo: () => ipcRenderer.invoke(SettingsChannel.appInfo),
  onSettings: (cb) => subscribe(SettingsChannel.settingsChanged, cb),
  onMonitors: (cb) => subscribe(SettingsChannel.monitorsChanged, cb),
  updateStatus: () => ipcRenderer.invoke(SettingsChannel.updateStatus),
  checkUpdate: () => ipcRenderer.invoke(SettingsChannel.checkUpdate),
  installUpdate: () => ipcRenderer.invoke(SettingsChannel.installUpdate),
  openDownloadPage: () => ipcRenderer.invoke(SettingsChannel.openDownloadPage),
  onUpdate: (cb) => subscribe(SettingsChannel.updateChanged, cb),
};

contextBridge.exposeInMainWorld('api', api);
