import { join } from 'node:path';
import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import { isPaused } from '@shared/schedule';
import type { AlertService } from './alerts';
import type { SettingsStore } from './store';
import type { UpdateService } from './updater';
import type { WindowManager } from './windows';

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(__dirname, '../../resources/tray.png');
}

function updateMenuItem(updates: UpdateService): MenuItemConstructorOptions {
  const status = updates.get();
  switch (status.state) {
    case 'downloaded':
      return { label: `업데이트 설치 후 다시 시작 (v${status.version})`, click: () => updates.install() };
    case 'manual':
      return { label: `새 버전 내려받기 (v${status.version})`, click: () => updates.openDownloadPage() };
    case 'downloading':
      return { label: `업데이트 받는 중… (v${status.version})`, enabled: false };
    case 'checking':
      return { label: '업데이트 확인 중…', enabled: false };
    default:
      return { label: '업데이트 확인', click: () => void updates.check() };
  }
}

export function createTray(store: SettingsStore, windows: WindowManager, alerts: AlertService, updates: UpdateService): Tray {
  const tray = new Tray(nativeImage.createFromPath(iconPath()));
  tray.setToolTip('우리반 시계');

  const build = () => {
    const s = store.get();
    const locked = s.display.student.locked && s.display.teacher.locked;
    const paused = isPaused(s.alerts, new Date());
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '설정 열기', click: () => windows.openSettings() },
        { label: '모니터 확인', click: () => windows.identifyMonitors() },
        { type: 'separator' },
        { label: '위젯 위치 잠금', type: 'checkbox', checked: locked, click: () => windows.setAllLocked(!locked) },
        {
          label: paused ? '알림 일시정지 중' : '알림 일시정지',
          submenu: [
            { label: '오늘 알림 끄기', click: () => alerts.setPause('today') },
            { label: '1시간 알림 끄기', click: () => alerts.setPause('hour') },
            { label: '알림 다시 켜기', enabled: paused, click: () => alerts.setPause('off') },
          ],
        },
        {
          label: '알림 미리보기',
          submenu: [
            { label: '3분 전 배너', click: () => alerts.preview('banner') },
            { label: '1분 전 전체 화면', click: () => alerts.preview('overlay') },
            { label: '수업 시작', click: () => alerts.preview('start') },
          ],
        },
        { type: 'separator' },
        updateMenuItem(updates),
        { label: '종료', click: () => app.quit() },
      ]),
    );
  };

  build();
  store.on('change', build);
  // 진행률은 1%마다 오므로 메뉴는 상태가 바뀔 때만 다시 만든다.
  let lastState = updates.get().state;
  updates.on('change', (status) => {
    if (status.state !== lastState) build();
    lastState = status.state;
  });
  // 일시정지 만료를 메뉴에 반영
  setInterval(build, 60_000).unref();
  tray.on('double-click', () => windows.openSettings());
  return tray;
}
