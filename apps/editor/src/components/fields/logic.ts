import type { ParamField } from '@tabbydeck/shared';
import { parseHotkey } from '@tabbydeck/shared/keys';

type KeyLike = { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean };

const CODE_NAMES: Record<string, string> = {
  Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  PrintScreen: 'PrintScreen', Pause: 'Pause', CapsLock: 'CapsLock', NumLock: 'NumLock', ScrollLock: 'ScrollLock', ContextMenu: 'Menu',
  MediaPlayPause: 'MediaPlayPause', MediaTrackNext: 'MediaNext', MediaTrackPrevious: 'MediaPrev', MediaStop: 'MediaStop',
  AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  NumpadAdd: 'NumAdd', NumpadSubtract: 'NumSubtract', NumpadMultiply: 'NumMultiply', NumpadDivide: 'NumDivide', NumpadDecimal: 'NumDecimal',
};
const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/** Hotkey text for a key press, modifiers first (Ctrl, Alt, Shift, Win); null for a lone modifier or an unsendable key. */
export function hotkeyFromEvent(e: KeyLike): string | null {
  if (MODIFIER_CODES.test(e.code)) return null;
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else if (/^Numpad\d$/.test(e.code)) key = `Num${e.code.slice(6)}`;
  else key = CODE_NAMES[e.code];
  if (!key) return null;
  const parts = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win', key].filter(Boolean) as string[];
  return parts.join('+');
}

/** The message to show under a field, or null when the value is fine. Mirrors the host's validation. */
export function fieldError(f: ParamField, v: unknown): string | null {
  const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim());
  if (empty) return f.required && f.default === undefined ? `${f.title} is required` : null;
  if (f.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${f.title} must be a number`;
    if (f.min !== undefined && v < f.min) return `${f.title} must be at least ${f.min}`;
    if (f.max !== undefined && v > f.max) return `${f.title} must be at most ${f.max}`;
  }
  if (f.type === 'hotkey') { const r = parseHotkey(String(v)); if (!r.ok) return r.error; }
  return null;
}

/** One-line description of a step for the list, from its action name and the first meaningful parameter. */
export function stepSummary(name: string, params: Record<string, unknown>): string {
  const first = Object.values(params).find(v => typeof v === 'string' && v.trim() !== '') as string | undefined
    ?? Object.values(params).find(v => typeof v === 'number') as number | undefined;
  if (first === undefined) return name;
  const shown = typeof first === 'string' && /[\\/]/.test(first) ? first.split(/[\\/]/).pop()! : String(first);
  return `${name}: ${shown.length > 40 ? shown.slice(0, 39) + '…' : shown}`;
}
