/** Windows virtual-key codes by canonical name. */
export const VK: Record<string, number> = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0d, Shift: 0x10, Ctrl: 0x11, Alt: 0x12, Pause: 0x13, CapsLock: 0x14,
  Esc: 0x1b, Space: 0x20, PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24,
  Left: 0x25, Up: 0x26, Right: 0x27, Down: 0x28, PrintScreen: 0x2c, Insert: 0x2d, Delete: 0x2e,
  Win: 0x5b, RWin: 0x5c, Menu: 0x5d,
  Num0: 0x60, Num1: 0x61, Num2: 0x62, Num3: 0x63, Num4: 0x64, Num5: 0x65, Num6: 0x66, Num7: 0x67, Num8: 0x68, Num9: 0x69,
  NumMultiply: 0x6a, NumAdd: 0x6b, NumSubtract: 0x6d, NumDecimal: 0x6e, NumDivide: 0x6f,
  NumLock: 0x90, ScrollLock: 0x91,
  BrowserBack: 0xa6, BrowserForward: 0xa7, BrowserRefresh: 0xa8, BrowserHome: 0xac,
  VolumeMute: 0xad, VolumeDown: 0xae, VolumeUp: 0xaf,
  MediaNext: 0xb0, MediaPrev: 0xb1, MediaStop: 0xb2, MediaPlayPause: 0xb3,
  ';': 0xba, '=': 0xbb, ',': 0xbc, '-': 0xbd, '.': 0xbe, '/': 0xbf, '`': 0xc0, '[': 0xdb, '\\': 0xdc, ']': 0xdd, "'": 0xde,
};
for (let i = 0; i < 26; i++) VK[String.fromCharCode(65 + i)] = 0x41 + i;
for (let i = 0; i <= 9; i++) VK[String(i)] = 0x30 + i;
for (let i = 1; i <= 24; i++) VK[`F${i}`] = 0x6f + i;

const ALIASES: Record<string, string> = {
  control: 'Ctrl', ctl: 'Ctrl', cmd: 'Win', command: 'Win', super: 'Win', meta: 'Win', windows: 'Win', option: 'Alt',
  escape: 'Esc', return: 'Enter', del: 'Delete', ins: 'Insert', pgup: 'PageUp', pgdn: 'PageDown', prtsc: 'PrintScreen',
  arrowleft: 'Left', arrowright: 'Right', arrowup: 'Up', arrowdown: 'Down', plus: '=', minus: '-',
  playpause: 'MediaPlayPause', next: 'MediaNext', previous: 'MediaPrev', prev: 'MediaPrev', mute: 'VolumeMute',
};
const BY_LOWER = new Map(Object.keys(VK).map(k => [k.toLowerCase(), k]));
const NAME_OF = new Map(Object.entries(VK).map(([k, v]) => [v, k]));

/** Keys that need KEYEVENTF_EXTENDEDKEY when sent with SendInput. */
export const EXTENDED = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2c, 0x2d, 0x2e, 0x5b, 0x5c, 0x5d, 0x6f, 0x90,
  0xa6, 0xa7, 0xa8, 0xac, 0xad, 0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3]);

export const MODIFIERS = [VK.Shift, VK.Ctrl, VK.Alt, VK.Win];

export type ParsedHotkey = { ok: true; keys: number[] } | { ok: false; error: string };

/** Parse "Ctrl+Shift+S" style text (case-insensitive, aliases allowed) into VK codes in the given order. */
export function parseHotkey(text: string): ParsedHotkey {
  const parts = text.split('+').map(p => p.trim()).filter(Boolean);
  // "Ctrl++" means Ctrl and the "=" key position is ambiguous; a trailing "+" is the plus key
  if (/\+\s*\+\s*$/.test(text)) parts.push('=');
  if (!parts.length) return { ok: false, error: 'Press at least one key' };
  const keys: number[] = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    const name = BY_LOWER.get(lower) ?? (ALIASES[lower] ? ALIASES[lower] : undefined);
    const vk = name !== undefined ? VK[name] : undefined;
    if (vk === undefined) return { ok: false, error: `Unknown key "${p}"` };
    if (keys.includes(vk)) return { ok: false, error: `"${p}" appears twice` };
    keys.push(vk);
  }
  if (keys.includes(VK.Ctrl) && keys.includes(VK.Alt) && keys.includes(VK.Delete)) return { ok: false, error: 'Ctrl+Alt+Del cannot be sent by software' };
  return { ok: true, keys };
}

export function formatHotkey(keys: number[]): string {
  return keys.map(k => NAME_OF.get(k) ?? `0x${k.toString(16)}`).join('+');
}

/** For params validation: null when valid, otherwise the message. */
export const hotkeyError = (s: string) => { const r = parseHotkey(s); return r.ok ? null : r.error; };
