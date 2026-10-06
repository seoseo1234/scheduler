import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { TeacherApi } from '@shared/api';
import type { TeacherChannel as Channels } from '@shared/ipc';

// sandbox preload는 다른 파일(공유 청크)을 require할 수 없어, 런타임 값은 이 파일 안에만 둔다.
// 채널 이름은 satisfies로 공유 정의와 일치하는지 타입 검사한다.
const TeacherChannel = {
  getSettings: 'teacher:get-settings',
  settingsChanged: 'teacher:settings-changed',
  openSettings: 'teacher:open-settings',
  setPause: 'teacher:set-pause',
  updateMorningTasks: 'teacher:update-morning-tasks',
  getGoogle: 'teacher:get-google',
  refreshGoogle: 'teacher:refresh-google',
  googleChanged: 'teacher:google-changed',
  toggleCover: 'teacher:toggle-cover',
} as const satisfies typeof Channels;

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: TeacherApi = {
  getSettings: () => ipcRenderer.invoke(TeacherChannel.getSettings),
  onSettings: (cb) => subscribe(TeacherChannel.settingsChanged, cb),
  openSettings: () => ipcRenderer.invoke(TeacherChannel.openSettings),
  setPause: (mode) => ipcRenderer.invoke(TeacherChannel.setPause, mode),
  updateMorningTasks: (tasks) => ipcRenderer.invoke(TeacherChannel.updateMorningTasks, tasks),
  getGoogle: () => ipcRenderer.invoke(TeacherChannel.getGoogle),
  refreshGoogle: () => ipcRenderer.invoke(TeacherChannel.refreshGoogle),
  onGoogle: (cb) => subscribe(TeacherChannel.googleChanged, cb),
  onToggleCover: (cb) => subscribe(TeacherChannel.toggleCover, cb),
};

contextBridge.exposeInMainWorld('api', api);
