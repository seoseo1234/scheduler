import { app, globalShortcut } from 'electron';
import { TeacherChannel } from '@shared/ipc';
import { AlertService } from './alerts';
import { registerAutoLaunch } from './autoLaunch';
import { GoogleService } from './google';
import { registerShortcuts } from './shortcuts';
import { registerIpc } from './ipc';
import { defaultMonitors, findDisplay } from './monitors';
import { SettingsStore } from './store';
import { createTray } from './tray';
import { WindowManager } from './windows';

// 중복 실행 방지: 두 번째 실행은 기존 프로그램의 설정 창을 연다.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('kr.classroom.clock');
  let windows: WindowManager | null = null;

  app.on('second-instance', () => windows?.openSettings());

  // 위젯은 트레이로 계속 살아 있으므로 창이 모두 닫혀도 종료하지 않는다.
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('before-quit', () => {
    if (windows) windows.quitting = true;
  });

  void app.whenReady().then(() => {
    const store = new SettingsStore();

    // 처음 실행이면 모니터를 자동 지정한다.
    const { student, teacher } = store.get().display;
    if (!student.monitorId || !teacher.monitorId) {
      const defaults = defaultMonitors();
      store.mutate((s) => ({
        ...s,
        display: {
          student: { ...s.display.student, monitorId: s.display.student.monitorId || defaults.student },
          teacher: { ...s.display.teacher, monitorId: s.display.teacher.monitorId || defaults.teacher },
        },
      }));
    }

    windows = new WindowManager(store);
    const alerts = new AlertService(store, windows);
    const google = new GoogleService(store);
    google.on('change', (snapshot) => windows?.sendToTeacher(TeacherChannel.googleChanged, snapshot));
    registerIpc(store, windows, alerts, google);
    windows.createWidgets();
    createTray(store, windows, alerts);
    registerShortcuts(store, () => windows?.sendToTeacher(TeacherChannel.toggleCover));
    registerAutoLaunch(store);
    alerts.start();
    google.start();

    // 교사 모니터가 없어 교사 위젯이 숨겨진 상태라면 설정 창을 열어 알려준다.
    if (!findDisplay(store.get().display.teacher.monitorId)) windows.openSettings();
  });
}
