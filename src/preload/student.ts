// 학생 창 preload: 학생 채널만 노출한다. 교사 데이터(캘린더·할 일) 채널은 여기서 접근할 수 없다.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { StudentApi } from '@shared/api';
import type { StudentChannel as Channels } from '@shared/ipc';

// sandbox preload는 다른 파일(공유 청크)을 require할 수 없어, 런타임 값은 이 파일 안에만 둔다.
// 채널 이름은 satisfies로 공유 정의와 일치하는지 타입 검사한다.
const StudentChannel = {
  getSettings: 'student:get-settings',
  settingsChanged: 'student:settings-changed',
  alert: 'student:alert',
  playSound: 'student:play-sound',
} as const satisfies typeof Channels;

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: StudentApi = {
  getSettings: () => ipcRenderer.invoke(StudentChannel.getSettings),
  onSettings: (cb) => subscribe(StudentChannel.settingsChanged, cb),
  onBanner: (cb) => subscribe(StudentChannel.alert, cb),
  onSound: (cb) => subscribe(StudentChannel.playSound, cb),
};

contextBridge.exposeInMainWorld('api', api);
