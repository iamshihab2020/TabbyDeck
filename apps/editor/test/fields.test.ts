import { describe, expect, it } from 'vitest';
import { hotkeyFromEvent, fieldError, stepSummary } from '../src/components/fields/logic.ts';

const ev = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({ code, key: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe('hotkeyFromEvent', () => {
  it('turns Ctrl+Shift+S into text', () => {
    expect(hotkeyFromEvent(ev('KeyS', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+S');
  });
  it('orders modifiers Ctrl, Alt, Shift, Win', () => {
    expect(hotkeyFromEvent(ev('KeyT', { shiftKey: true, metaKey: true, altKey: true, ctrlKey: true }))).toBe('Ctrl+Alt+Shift+Win+T');
  });
  it('maps digits, function, arrows, media and punctuation keys', () => {
    expect(hotkeyFromEvent(ev('Digit1', { altKey: true }))).toBe('Alt+1');
    expect(hotkeyFromEvent(ev('F13'))).toBe('F13');
    expect(hotkeyFromEvent(ev('ArrowLeft', { ctrlKey: true }))).toBe('Ctrl+Left');
    expect(hotkeyFromEvent(ev('MediaPlayPause'))).toBe('MediaPlayPause');
    expect(hotkeyFromEvent(ev('AudioVolumeUp'))).toBe('VolumeUp');
    expect(hotkeyFromEvent(ev('Escape'))).toBe('Esc');
    expect(hotkeyFromEvent(ev('Period', { metaKey: true }))).toBe('Win+.');
    expect(hotkeyFromEvent(ev('Numpad5'))).toBe('Num5');
  });
  it('returns null for a lone modifier press (wait for the real key)', () => {
    expect(hotkeyFromEvent(ev('ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(hotkeyFromEvent(ev('ShiftRight', { shiftKey: true }))).toBeNull();
  });
  it('returns null for keys TabbyDeck cannot send', () => {
    expect(hotkeyFromEvent(ev('Fn'))).toBeNull();
  });
});

describe('fieldError', () => {
  it('flags an empty required field', () => {
    expect(fieldError({ type: 'string', title: 'Program', required: true }, '')).toBe('Program is required');
    expect(fieldError({ type: 'string', title: 'Program', required: true }, 'notepad.exe')).toBeNull();
  });
  it('checks number bounds', () => {
    expect(fieldError({ type: 'number', title: 'Volume', min: 0, max: 100 }, 140)).toBe('Volume must be at most 100');
    expect(fieldError({ type: 'number', title: 'Volume', min: 0, max: 100 }, 40)).toBeNull();
  });
  it('refuses Ctrl+Alt+Del', () => {
    expect(fieldError({ type: 'hotkey', title: 'Keys', required: true }, 'Ctrl+Alt+Del')).toMatch(/cannot be sent/);
  });
});

describe('stepSummary', () => {
  it('describes a step in plain words from its params', () => {
    expect(stepSummary('Press hotkey', { hotkey: 'Ctrl+C' })).toBe('Press hotkey: Ctrl+C');
    expect(stepSummary('Lock computer', {})).toBe('Lock computer');
    expect(stepSummary('Open app or file', { path: 'C:/Program Files/App/app.exe' })).toBe('Open app or file: app.exe');
  });
});
