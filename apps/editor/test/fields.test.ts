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
  it('names installed apps by their app, not their long Windows id', () => {
    const app = (id: string) => stepSummary('Open app or file', { path: `shell:AppsFolder\\${id}`, args: '' });
    expect(app('com.tinyspeck.slackdesktop_8yrtsj140pw4g!Slack')).toBe('Open app or file: Slack');
    expect(app('Microsoft.VisualStudioCode')).toBe('Open app or file: VisualStudioCode');
    expect(app('Chrome')).toBe('Open app or file: Chrome');
    expect(app('C:\\Users\\me\\FilePilot\\FPilot.exe')).toBe('Open app or file: FPilot.exe');
  });
  it('shows a choice by its label, and leaves out a sound output\'s Windows id', () => {
    const meeting = { app: { type: 'enum' as const, title: 'Meeting app', options: ['teams', 'zoom'], labels: ['Microsoft Teams', 'Zoom'] } };
    expect(stepSummary('Meeting: camera', { app: 'zoom' }, meeting)).toBe('Meeting: camera: Zoom');
    expect(stepSummary('Switch sound output', { output: '{0.0.0.00000000}.{071a706f}' }, { output: { type: 'audioOutput', title: 'Output' } })).toBe('Switch sound output');
  });
});
