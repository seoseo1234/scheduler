import { useEffect } from 'react';
import type { FontScale, WidgetDisplay } from '@shared/types';

const FONT_SCALE: Record<FontScale, number> = { small: 0.85, normal: 1, large: 1.25, xlarge: 1.6 };

/** 테마·글자 크기·잠금 상태를 문서 루트에 반영한다. */
export function useWidgetDisplay(display: WidgetDisplay | undefined): void {
  useEffect(() => {
    if (!display) return;
    const root = document.documentElement;
    root.dataset.theme = display.theme;
    root.dataset.locked = String(display.locked);
    root.style.setProperty('--scale', String(FONT_SCALE[display.fontScale]));
  }, [display]);
}
