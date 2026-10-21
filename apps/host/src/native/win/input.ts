import type { MouseButton, NativeInput } from '../types.ts';
import { EXTENDED } from './keys.ts';
import { win32 } from './win32.ts';

const INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x1, KEYEVENTF_KEYUP = 0x2, KEYEVENTF_UNICODE = 0x4;
const MOUSEEVENTF_MOVE = 0x1, MOUSEEVENTF_ABSOLUTE = 0x8000, MOUSEEVENTF_WHEEL = 0x800, MOUSEEVENTF_HWHEEL = 0x1000;
const BUTTON_FLAGS: Record<MouseButton, [down: number, up: number]> = { left: [0x2, 0x4], right: [0x8, 0x10], middle: [0x20, 0x40] };
const SM_CXSCREEN = 0, SM_CYSCREEN = 1;
const MAPVK_VK_TO_VSC = 0;

/** Keyboard and mouse injection through SendInput. Sends both the VK and its scan code for app compatibility. */
export function createWinInput(): NativeInput {
  const w = win32();
  const send = (inputs: unknown[]) => {
    const n = w.SendInput(inputs.length, inputs, w.inputSize);
    if (n !== inputs.length) throw new Error('SendInput was blocked (an elevated window may have focus)');
  };
  const key = (vk: number, up: boolean) => ({
    type: INPUT_KEYBOARD,
    u: { ki: { wVk: vk, wScan: w.MapVirtualKeyW(vk, MAPVK_VK_TO_VSC), dwFlags: (up ? KEYEVENTF_KEYUP : 0) | (EXTENDED.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0), time: 0, dwExtraInfo: 0 } },
  });
  const mouse = (dx: number, dy: number, mouseData: number, flags: number) => ({ type: INPUT_MOUSE, u: { mi: { dx, dy, mouseData: mouseData >>> 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });

  return {
    keyDown: vk => send([key(vk, false)]),
    keyUp: vk => send([key(vk, true)]),
    typeText: text => {
      const inputs: unknown[] = [];
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i) === 10 ? 13 : text.charCodeAt(i); // newline → Enter
        const base = { wVk: 0, wScan: c, time: 0, dwExtraInfo: 0 };
        inputs.push({ type: INPUT_KEYBOARD, u: { ki: { ...base, dwFlags: KEYEVENTF_UNICODE } } }, { type: INPUT_KEYBOARD, u: { ki: { ...base, dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP } } });
      }
      for (let i = 0; i < inputs.length; i += 200) send(inputs.slice(i, i + 200));
    },
    mouseMove: (x, y, absolute) => {
      if (!absolute) return send([mouse(Math.round(x), Math.round(y), 0, MOUSEEVENTF_MOVE)]);
      const { w: sw, h: sh } = { w: w.GetSystemMetrics(SM_CXSCREEN), h: w.GetSystemMetrics(SM_CYSCREEN) };
      send([mouse(Math.round((x * 65535) / Math.max(1, sw - 1)), Math.round((y * 65535) / Math.max(1, sh - 1)), 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)]);
    },
    mouseButton: (b, down) => send([mouse(0, 0, 0, BUTTON_FLAGS[b][down ? 0 : 1])]),
    scroll: (dy, dx) => {
      const inputs = [];
      if (dy) inputs.push(mouse(0, 0, Math.round(dy * 120), MOUSEEVENTF_WHEEL));
      if (dx) inputs.push(mouse(0, 0, Math.round(dx * 120), MOUSEEVENTF_HWHEEL));
      if (inputs.length) send(inputs);
    },
    screenSize: () => ({ w: w.GetSystemMetrics(SM_CXSCREEN), h: w.GetSystemMetrics(SM_CYSCREEN) }),
  };
}
