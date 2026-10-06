import { globalShortcut } from 'electron';
import type { SettingsStore } from './store';

/** 교사 위젯 가리기 단축키를 등록하고, 설정이 바뀌면 다시 등록한다. */
export function registerShortcuts(store: SettingsStore, toggleCover: () => void): void {
  let current = '';
  const apply = (accelerator: string) => {
    if (accelerator === current) return;
    if (current) globalShortcut.unregister(current);
    current = '';
    if (!accelerator) return;
    try {
      if (globalShortcut.register(accelerator, toggleCover)) current = accelerator;
      else console.error(`단축키 ${accelerator}를 등록하지 못했어요 (다른 프로그램이 사용 중).`);
    } catch (err) {
      console.error(`단축키 형식이 올바르지 않아요: ${accelerator}`, err);
    }
  };
  apply(store.get().teacherHideShortcut);
  store.on('change', (next) => apply(next.teacherHideShortcut));
}
