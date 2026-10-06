// '바탕화면 고정' 레이어 (Windows 전용).
// 1순위: 위젯 창을 바탕화면(아이콘 층 SHELLDLL_DefView의 부모 창) 자식으로 붙이고 아이콘 위에 둔다.
//   → 다른 창 아래에 있고 Win+D(바탕화면 보기)에도 사라지지 않으며, 클릭·입력도 된다.
//   (아이콘 뒤 WorkerW에 붙이면 아이콘 층이 클릭을 가로채 위젯을 조작할 수 없다.)
// 실패하면 '항상 아래' 방식: 창을 z-order 맨 아래로 계속 내려 둔다.
import { screen, type BrowserWindow, type Rectangle } from 'electron';
import koffi from 'koffi';

type Hwnd = number;

interface User32 {
  FindWindowW(cls: string | null, name: string | null): Hwnd;
  FindWindowExW(parent: Hwnd, after: Hwnd, cls: string | null, name: string | null): Hwnd;
  SendMessageTimeoutW(hwnd: Hwnd, msg: number, w: number, l: number, flags: number, timeout: number, out: number[]): number;
  SetParent(child: Hwnd, parent: Hwnd): Hwnd;
  GetAncestor(hwnd: Hwnd, flags: number): Hwnd;
  IsWindow(hwnd: Hwnd): boolean;
  GetWindowRect(hwnd: Hwnd, rect: { left: number; top: number; right: number; bottom: number }): boolean;
  GetClientRect(hwnd: Hwnd, rect: { left: number; top: number; right: number; bottom: number }): boolean;
  ClientToScreen(hwnd: Hwnd, point: { x: number; y: number }): boolean;
  SetWindowPos(hwnd: Hwnd, after: Hwnd, x: number, y: number, cx: number, cy: number, flags: number): boolean;
  GetWindowLongPtrW(hwnd: Hwnd, index: number): number;
  SetWindowLongPtrW(hwnd: Hwnd, index: number, value: number): number;
}

const HWND_TOP = 0;
const HWND_BOTTOM = 1;
const GA_PARENT = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const GWL_STYLE = -16;
/** 자식 창이 되면 보이게 되는 테두리·제목 표시줄 스타일 */
const FRAME_STYLES = 0x00040000 /* WS_THICKFRAME */ | 0x00c00000; /* WS_CAPTION */
/** Progman에 WorkerW를 만들어 달라고 요청하는 비공개 메시지 */
const SPAWN_WORKERW = 0x052c;

let user32: User32 | null | undefined;

function api(): User32 | null {
  if (user32 !== undefined) return user32;
  if (process.platform !== 'win32') return (user32 = null);
  try {
    const lib = koffi.load('user32.dll');
    const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' });
    user32 = {
      FindWindowW: lib.func('intptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *name)'),
      FindWindowExW: lib.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *cls, const char16_t *name)'),
      SendMessageTimeoutW: lib.func(
        'intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t w, intptr_t l, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)',
      ),
      SetParent: lib.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
      GetAncestor: lib.func('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)'),
      IsWindow: lib.func('bool __stdcall IsWindow(intptr_t hwnd)'),
      GetWindowRect: lib.func('GetWindowRect', 'bool', ['intptr_t', koffi.out(koffi.pointer(RECT))]),
      GetClientRect: lib.func('GetClientRect', 'bool', ['intptr_t', koffi.out(koffi.pointer(RECT))]),
      ClientToScreen: lib.func('ClientToScreen', 'bool', ['intptr_t', koffi.inout(koffi.pointer(POINT))]),
      SetWindowPos: lib.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
      GetWindowLongPtrW: lib.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
      SetWindowLongPtrW: lib.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    } as User32;
  } catch (err) {
    console.error('user32.dll을 불러오지 못해 바탕화면 고정을 쓸 수 없어요:', err);
    user32 = null;
  }
  return user32;
}

function hwndOf(win: BrowserWindow): Hwnd {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

/** 바탕화면 아이콘 층(SHELLDLL_DefView)을 품은 창을 찾는다. 없으면 0 */
function findDesktopHost(u: User32): Hwnd {
  const progman = u.FindWindowW('Progman', null);
  if (!progman) return 0;
  // 바탕화면 창 구성을 확정시킨다 (배경화면 프로그램들이 쓰는 방식).
  const out = [0];
  u.SendMessageTimeoutW(progman, SPAWN_WORKERW, 0xd, 0x1, 0, 1000, out);

  // Windows 11 24H2 이후: 아이콘 층이 Progman 바로 아래에 있다.
  if (u.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null)) return progman;

  // 이전 Windows: 아이콘 층을 가진 최상위 WorkerW
  let top = 0;
  while ((top = u.FindWindowExW(0, top, 'WorkerW', null))) {
    if (u.FindWindowExW(top, 0, 'SHELLDLL_DefView', null)) return top;
  }
  return 0;
}

export type DesktopMode = 'desktop' | 'bottom';

/** 창별 바탕화면 고정 상태 */
const attached = new Map<BrowserWindow, { mode: DesktopMode; parent: Hwnd; style?: number; onBlur?: () => void }>();

/** 창 내용(클라이언트) 영역의 화면 좌표(물리 픽셀)와 창 테두리 두께 */
function measure(u: User32, hwnd: Hwnd) {
  const w = { left: 0, top: 0, right: 0, bottom: 0 };
  const c = { left: 0, top: 0, right: 0, bottom: 0 };
  const origin = { x: 0, y: 0 };
  u.GetWindowRect(hwnd, w);
  u.GetClientRect(hwnd, c);
  u.ClientToScreen(hwnd, origin);
  const client = { x: origin.x, y: origin.y, width: c.right, height: c.bottom };
  const insets = {
    left: origin.x - w.left,
    top: origin.y - w.top,
    right: w.right - (origin.x + c.right),
    bottom: w.bottom - (origin.y + c.bottom),
  };
  return { client, insets };
}

/**
 * 실제 창 위치(DIP, 내용 영역 기준 = BrowserWindow#getBounds와 같은 기준).
 * 자식 창이 되면 getBounds 값이 틀어져 직접 잰다.
 */
function nativeBounds(u: User32, win: BrowserWindow): Rectangle {
  return screen.screenToDipRect(win, measure(u, hwndOf(win)).client);
}

/**
 * 창을 바탕화면 레이어에 붙인다. 성공한 방식을 돌려준다.
 * forceBottom이면 바탕화면 창에 붙이지 않고 '항상 아래'만 쓴다.
 */
export function attachToDesktop(win: BrowserWindow, forceBottom = false): DesktopMode | null {
  const u = api();
  if (!u) return null;
  detachFromDesktop(win);
  win.setAlwaysOnTop(false);
  const hwnd = hwndOf(win);

  if (!forceBottom) {
    const host = findDesktopHost(u);
    if (host) {
      const bounds = win.getBounds();
      const style = u.GetWindowLongPtrW(hwnd, GWL_STYLE);
      u.SetParent(hwnd, host);
      if (u.GetAncestor(hwnd, GA_PARENT) === host) {
        // 테두리를 없애고 아이콘 층보다 위에 둔다.
        u.SetWindowLongPtrW(hwnd, GWL_STYLE, style & ~FRAME_STYLES);
        u.SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        attached.set(win, { mode: 'desktop', parent: host, style });
        setDesktopBounds(win, bounds);
        return 'desktop';
      }
      u.SetParent(hwnd, 0);
    }
  }

  // 대체: 항상 아래
  const toBottom = () => {
    if (!win.isDestroyed()) u.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  };
  toBottom();
  win.on('blur', toBottom);
  attached.set(win, { mode: 'bottom', parent: 0, onBlur: toBottom });
  return 'bottom';
}

export function detachFromDesktop(win: BrowserWindow): void {
  const state = attached.get(win);
  if (!state) return;
  attached.delete(win);
  if (state.onBlur) win.removeListener('blur', state.onBlur);
  const u = api();
  if (state.mode === 'desktop' && u && !win.isDestroyed()) {
    const bounds = nativeBounds(u, win);
    const hwnd = hwndOf(win);
    // 자식 창일 때 바뀐 크기 조절 가능 여부는 원래 스타일에 반영해 되돌린다.
    if (state.style !== undefined) state.style = win.isResizable() ? state.style | 0x00040000 : state.style & ~0x00040000;
    u.SetParent(hwnd, 0);
    if (state.style !== undefined) {
      u.SetWindowLongPtrW(hwnd, GWL_STYLE, state.style);
      u.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
    win.setBounds(bounds);
  }
}

export function desktopMode(win: BrowserWindow): DesktopMode | null {
  return attached.get(win)?.mode ?? null;
}

/**
 * 창 위치를 설정한다. 바탕화면 창의 자식일 때는 화면 좌표가 아니라
 * 부모 창 기준 좌표(물리 픽셀)로 옮겨야 한다.
 */
export function setDesktopBounds(win: BrowserWindow, bounds: Rectangle): void {
  const state = attached.get(win);
  const u = api();
  if (state?.mode !== 'desktop' || !u) {
    win.setBounds(bounds);
    return;
  }
  const hwnd = hwndOf(win);
  const parentRect = { left: 0, top: 0, right: 0, bottom: 0 };
  u.GetWindowRect(state.parent, parentRect);
  // 내용 영역이 bounds에 오도록 테두리 두께만큼 창을 넓혀 놓는다.
  const want = screen.dipToScreenRect(win, bounds);
  // 테두리 두께는 크기를 바꾼 뒤 달라질 수 있어 한 번 더 재서 맞춘다.
  for (let i = 0; i < 3; i++) {
    const { client, insets } = measure(u, hwnd);
    if (i > 0 && client.x === want.x && client.y === want.y && client.width === want.width && client.height === want.height) break;
    u.SetWindowPos(
      hwnd,
      0,
      want.x - insets.left - parentRect.left,
      want.y - insets.top - parentRect.top,
      want.width + insets.left + insets.right,
      want.height + insets.top + insets.bottom,
      SWP_NOZORDER | SWP_NOACTIVATE,
    );
  }
}
