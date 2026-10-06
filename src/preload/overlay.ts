// 1분 전 알림 오버레이 창 preload: 표시할 문구만 받는다.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { OverlayApi } from '@shared/api';
import type { OverlayChannel as Channels, OverlayPayload } from '@shared/ipc';

// sandbox preload는 다른 파일(공유 청크)을 require할 수 없어, 런타임 값은 이 파일 안에만 둔다.
const OverlayChannel = {
  show: 'overlay:show',
  close: 'overlay:close',
} as const satisfies typeof Channels;

const api: OverlayApi = {
  onShow: (cb) => {
    const listener = (_e: IpcRendererEvent, p: OverlayPayload) => cb(p);
    ipcRenderer.on(OverlayChannel.show, listener);
    return () => ipcRenderer.removeListener(OverlayChannel.show, listener);
  },
  close: () => ipcRenderer.send(OverlayChannel.close),
};

contextBridge.exposeInMainWorld('api', api);
