import { screen, type Display, type Rectangle } from 'electron';
import type { Bounds, MonitorInfo } from '@shared/types';

/** 화면 왼쪽→오른쪽, 위→아래 순으로 번호를 매긴다. 모니터 확인 창과 설정 화면이 같은 순서를 쓴다. */
export function listDisplays(): Display[] {
  return [...screen.getAllDisplays()].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
}

export function listMonitors(): MonitorInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return listDisplays().map((d, i) => ({
    id: String(d.id),
    number: i + 1,
    primary: d.id === primaryId,
    label: `${i + 1}번 모니터${d.id === primaryId ? ' (주 모니터)' : ''} · ${d.size.width}×${d.size.height}`,
    bounds: { ...d.bounds },
  }));
}

export function findDisplay(monitorId: string): Display | undefined {
  return screen.getAllDisplays().find((d) => String(d.id) === monitorId);
}

/** 처음 실행 시 기본 배치: 학생 = 주 모니터가 아닌 첫 모니터(없으면 주 모니터), 교사 = 주 모니터 */
export function defaultMonitors(): { student: string; teacher: string } {
  const primary = screen.getPrimaryDisplay();
  const secondary = listDisplays().find((d) => d.id !== primary.id);
  return { student: String((secondary ?? primary).id), teacher: String(primary.id) };
}

/** 모니터 workArea 기준 상대 좌표 → 화면 절대 좌표. 모니터 밖으로 나가지 않게 보정한다. */
export function toAbsolute(display: Display, rel: Bounds): Rectangle {
  const wa = display.workArea;
  const width = Math.round(Math.min(Math.max(rel.width, 200), wa.width));
  const height = Math.round(Math.min(Math.max(rel.height, 150), wa.height));
  const x = Math.round(Math.min(Math.max(rel.x, 0), wa.width - width));
  const y = Math.round(Math.min(Math.max(rel.y, 0), wa.height - height));
  return { x: wa.x + x, y: wa.y + y, width, height };
}

export function toRelative(display: Display, abs: Rectangle): Bounds {
  const wa = display.workArea;
  return { x: abs.x - wa.x, y: abs.y - wa.y, width: abs.width, height: abs.height };
}
