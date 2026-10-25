import type { WindowInfo, WindowPlace } from '../types.ts';
import { win32 } from './win32.ts';
import { matchesWindow } from '../match.ts';

const GW_OWNER = 4, GWL_EXSTYLE = -20, WS_EX_TOOLWINDOW = 0x80, DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000, MONITOR_DEFAULTTONEAREST = 2;
const SW_MAXIMIZE = 3, SW_MINIMIZE = 6, SW_RESTORE = 9, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
const PER_MONITOR_AWARE_V2 = -4;
const VK_MENU = 0x12, KEYEVENTF_KEYUP = 0x2;

interface Rect { left: number; top: number; right: number; bottom: number }

const text = (h: unknown) => {
  const w = win32(), len = w.GetWindowTextLengthW(h); if (len <= 0) return '';
  const buf = new Uint16Array(len + 1); w.GetWindowTextW(h, buf, len + 1);
  return String.fromCharCode(...buf.subarray(0, len));
};

/** The program file of a window, lowercase (code.exe), or '' when Windows will not say (an elevated app). */
function exeOf(h: unknown, cache?: Map<number, string>): string {
  const w = win32(), pid = [0];
  w.GetWindowThreadProcessId(h, pid);
  const hit = cache?.get(pid[0]); if (hit !== undefined) return hit;
  let exe = '';
  const p = w.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
  if (p) {
    try { const buf = new Uint16Array(1024), size = [1024]; if (w.QueryFullProcessImageNameW(p, 0, buf, size)) exe = String.fromCharCode(...buf.subarray(0, size[0])).split(/[\\/]/).pop()!.toLowerCase(); }
    finally { w.CloseHandle(p); }
  }
  cache?.set(pid[0], exe);
  return exe;
}

/** A window a person would call an app window: visible, titled, not hidden by Windows, not a tool palette or a dialog. */
function isAppWindow(h: unknown): boolean {
  const w = win32();
  if (!w.IsWindowVisible(h) || w.GetWindowTextLengthW(h) <= 0 || w.GetWindow(h, GW_OWNER)) return false;
  if (Number(w.GetWindowLongPtrW(h, GWL_EXSTYLE)) & WS_EX_TOOLWINDOW) return false;
  const cloaked = [0];
  return !(w.DwmCloaked(h, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0]);
}

function appWindows(): { h: unknown; info: WindowInfo }[] {
  const w = win32(), found: unknown[] = [];
  const cb = w.koffi.register((h: unknown) => { if (isAppWindow(h)) found.push(h); return true; }, w.koffi.pointer(w.EnumProc));
  try { w.EnumWindows(cb, 0); } finally { w.koffi.unregister(cb); }
  const cache = new Map<number, string>();
  return found.map(h => ({ h, info: { title: text(h), exe: exeOf(h, cache) } }));
}

export const listWindows = (): WindowInfo[] => appWindows().map(x => x.info);

export const findWindow = (match: string): unknown => appWindows().find(x => matchesWindow(match, x.info))?.h ?? null;

/**
 * The app window just behind the one in front: the one a quick Alt+Tab goes to, on any screen. EnumWindows lists
 * windows front to back, so it is the first app window after the window in front (or the first, if none is in front).
 */
export function previousAppWindow(): unknown {
  const all = appWindows(), front = win32().GetForegroundWindow();
  const at = all.findIndex(x => same(x.h, front));
  return (at < 0 ? all[0] : all.slice(at + 1)[0])?.h ?? null;
}
const same = (a: unknown, b: unknown) => !!a && !!b && win32().koffi.address(a) === win32().koffi.address(b);

export function foregroundWindow(): WindowInfo | null {
  const w = win32(), h = w.GetForegroundWindow();
  return h ? { title: text(h), exe: exeOf(h) } : null;
}

function monitorOf(h: unknown): { monitor: Rect; work: Rect } {
  const w = win32(), info = { cbSize: 40, rcMonitor: {} as Rect, rcWork: {} as Rect, dwFlags: 0 };
  w.GetMonitorInfoW(w.MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), info);
  return { monitor: info.rcMonitor, work: info.rcWork };
}

function monitors(): { monitor: Rect; work: Rect }[] {
  const w = win32(), out: { monitor: Rect; work: Rect }[] = [];
  const cb = w.koffi.register((m: unknown) => {
    const info = { cbSize: 40, rcMonitor: {} as Rect, rcWork: {} as Rect, dwFlags: 0 };
    if (w.GetMonitorInfoW(m, info)) out.push({ monitor: info.rcMonitor, work: info.rcWork });
    return true;
  }, w.koffi.pointer(w.MonitorProc));
  try { w.EnumDisplayMonitors(null, null, cb, 0); } finally { w.koffi.unregister(cb); }
  return out.sort((a, b) => a.monitor.left - b.monitor.left || a.monitor.top - b.monitor.top);
}

/** Move the window so its visible edges (not the invisible resize border Windows 10 and 11 add) land on r. */
function moveTo(h: unknown, r: Rect) {
  const w = win32(), outer = {} as Rect, frame = {} as Rect;
  w.GetWindowRect(h, outer);
  const ok = w.DwmFrameBounds(h, DWMWA_EXTENDED_FRAME_BOUNDS, frame, 16) === 0;
  const l = ok ? frame.left - outer.left : 0, t = ok ? frame.top - outer.top : 0, rr = ok ? outer.right - frame.right : 0, b = ok ? outer.bottom - frame.bottom : 0;
  w.SetWindowPos(h, null, r.left - l, r.top - t, r.right - r.left + l + rr, r.bottom - r.top + t + b, SWP_NOZORDER | SWP_NOACTIVATE);
}

/** The part of a screen's work area (the screen without the taskbar) a placement fills. */
export function placeRect(work: Rect, place: 'left' | 'right' | 'top' | 'bottom'): Rect {
  const midX = Math.round((work.left + work.right) / 2), midY = Math.round((work.top + work.bottom) / 2);
  if (place === 'left') return { ...work, right: midX };
  if (place === 'right') return { ...work, left: midX };
  if (place === 'top') return { ...work, bottom: midY };
  return { ...work, top: midY };
}

// The window a "window in front" minimize just put away. Once minimized it is no longer in front, so the next
// "window in front" maximize brings this one back instead of maximizing whatever is in front now.
let putAway: unknown = null;

/** Place the first window that matches, or the window in front when match is empty. False when no window matches (yet). */
export function placeWindow(match: string, place: WindowPlace): boolean {
  const w = win32();
  // Work in real pixels: without this, Windows scales the numbers for windows on a zoomed (125 %, 150 %) screen.
  const prev = w.SetThreadDpiAwarenessContext(PER_MONITOR_AWARE_V2);
  try {
    const front = !match.trim(), back = front && place === 'maximize' && putAway && w.IsWindow(putAway) && w.IsIconic(putAway);
    const h = back ? putAway : front ? w.GetForegroundWindow() : findWindow(match); if (!h) return false;
    if (place === 'minimize') { w.ShowWindow(h, SW_MINIMIZE); if (front) putAway = h; return true; }
    if (place === 'maximize') {
      if (front) putAway = null;
      if (w.IsIconic(h)) w.ShowWindow(h, SW_RESTORE);
      w.ShowWindow(h, SW_MAXIMIZE);
      // A background process may only take focus right after input; a lone Alt tap satisfies that rule.
      if (back) { w.keybd_event(VK_MENU, 0, 0, 0); w.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0); w.SetForegroundWindow(h); }
      return true;
    }
    const wasMax = w.IsZoomed(h);
    if (wasMax || w.IsIconic(h)) w.ShowWindow(h, SW_RESTORE);
    if (place === 'restore') return true;
    const cur = monitorOf(h);
    if (place === 'next-screen') {
      const all = monitors(); if (all.length < 2) return true;
      const i = all.findIndex(m => m.monitor.left === cur.monitor.left && m.monitor.top === cur.monitor.top);
      const to = all[(i + 1) % all.length].work, r = {} as Rect; w.GetWindowRect(h, r);
      const width = Math.min(r.right - r.left, to.right - to.left), height = Math.min(r.bottom - r.top, to.bottom - to.top);
      const x = Math.min(to.left + Math.max(0, r.left - cur.work.left), to.right - width), y = Math.min(to.top + Math.max(0, r.top - cur.work.top), to.bottom - height);
      w.SetWindowPos(h, null, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
      if (wasMax) w.ShowWindow(h, SW_MAXIMIZE);
      return true;
    }
    moveTo(h, placeRect(cur.work, place));
    return true;
  } finally { w.SetThreadDpiAwarenessContext(prev); }
}
