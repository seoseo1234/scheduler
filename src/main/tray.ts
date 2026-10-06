import { join } from 'node:path';
import { app, Menu, nativeImage, Tray } from 'electron';
import { isPaused } from '@shared/schedule';
import type { AlertService } from './alerts';
import type { SettingsStore } from './store';
import type { WindowManager } from './windows';

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(__dirname, '../../resources/tray.png');
}

export function createTray(store: SettingsStore, windows: WindowManager, alerts: AlertService): Tray {
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
        { label: '종료', click: () => app.quit() },
      ]),
    );
  };

  build();
  store.on('change', build);
  // 일시정지 만료를 메뉴에 반영
  setInterval(build, 60_000).unref();
  tray.on('double-click', () => windows.openSettings());
  return tray;
}
