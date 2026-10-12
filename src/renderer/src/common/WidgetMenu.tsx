import { useEffect, useState } from 'react';
import type { WidgetMenuApi } from '@shared/api';
import type { MenuPoint, WidgetMenuAction } from '@shared/ipc';

const MENU_WIDTH = 190;
const MENU_HEIGHT = 96;

/**
 * 위젯 오른쪽 클릭 메뉴. 화면 안에 직접 그린다.
 * 잠금 상태에서는 화면의 contextmenu 이벤트로, 잠금을 풀었을 때는 메인이 보내 준 위치로 연다.
 */
export function WidgetMenu({ api, name }: { api: WidgetMenuApi; name: string }) {
  const [pos, setPos] = useState<MenuPoint | null>(null);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPos(null);
    };
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);
    const off = api.onShowMenu(setPos);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, [api]);

  if (!pos) return null;
  const run = (action: WidgetMenuAction) => {
    setPos(null);
    void api.menuAction(action);
  };
  // 창 밖으로 잘리지 않게 안쪽으로 당긴다.
  const left = Math.max(4, Math.min(pos.x, window.innerWidth - MENU_WIDTH - 4));
  const top = Math.max(4, Math.min(pos.y, window.innerHeight - MENU_HEIGHT - 4));

  return (
    // 메뉴 밖을 누르면 닫힌다.
    <div className="widget-menu-backdrop no-drag" onMouseDown={() => setPos(null)}>
      <div className="widget-menu" role="menu" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <button role="menuitem" onClick={() => run('hide')}>
          🙈 {name} 위젯 숨기기
        </button>
        <button role="menuitem" onClick={() => run('settings')}>
          ⚙️ 설정 열기
        </button>
      </div>
    </div>
  );
}
