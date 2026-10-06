import { app } from 'electron';
import type { SettingsStore } from './store';

/** 실행 형태: 설치형(NSIS), 무설치(portable exe), 개발 실행 */
export function appEdition(): 'installed' | 'portable' | 'dev' {
  if (!app.isPackaged) return 'dev';
  return process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'installed';
}

/**
 * 윈도우 로그인 시 자동 실행. 무설치판은 압축 해제 임시 폴더가 아니라
 * 원래 exe 경로를 등록해야 한다.
 */
export function registerAutoLaunch(store: SettingsStore): void {
  if (appEdition() === 'dev') return; // 개발 중에는 electron.exe가 등록되지 않게 건너뛴다.
  const apply = (enabled: boolean) => {
    const path = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;
    app.setLoginItemSettings({ openAtLogin: enabled, path, args: [] });
  };
  let current = store.get().autoLaunch;
  apply(current);
  store.on('change', (next) => {
    if (next.autoLaunch !== current) apply((current = next.autoLaunch));
  });
}
