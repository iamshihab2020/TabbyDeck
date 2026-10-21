import { describe, expect, it } from 'vitest';
import { confirmText, levelOf, levelView, panelOf, statefulAction, starterProfileFile } from '../src/index.ts';

const btn = (action: string, params: Record<string, unknown> = {}) => ({ config: { kind: 'button' as const, policy: 'ignore' as const, triggers: { press: [{ id: 'a', action, params }] } } });

describe('keys that ask first', () => {
  it('shut down, restart, sleep, lock and the careful system actions ask, with words for each', () => {
    expect(confirmText(btn('system.shutdown', { restart: false }))).toMatch(/turns off/);
    expect(confirmText(btn('system.shutdown', { restart: true }))).toMatch(/restarts/);
    expect(confirmText(btn('system.sleep'))).toMatch(/sleep/);
    expect(confirmText(btn('system.lock'))).toMatch(/locks/);
    expect(confirmText(btn('system.run', { command: 'x' }))).toBeDefined();
    expect(confirmText(btn('keyboard.hotkey', { hotkey: 'Ctrl+C' }))).toBeUndefined();
  });
  it('in the starter deck exactly Sleep, Lock and Shut down ask, Play, Mute, Mic, Night light and Bluetooth show state, and Volume, Brightness and Bluetooth open panels', () => {
    const ws = starterProfileFile().widgets;
    expect(ws.filter(w => confirmText(w)).map(w => w.look.label)).toEqual(['Sleep', 'Lock', 'Shut down']);
    expect(ws.filter(w => statefulAction(w)).map(w => w.look.label)).toEqual(['Play', 'Mute', 'Mic', 'Night light', 'Bluetooth']);
    expect(ws.filter(w => panelOf(w)).map(w => w.look.label)).toEqual(['Volume', 'Brightness', 'Bluetooth']);
  });
});

describe('level keys', () => {
  it('volume and brightness steps show their level and grey out at the end they push towards', () => {
    expect(levelOf(btn('system.volumeStep', { delta: 5 }))).toEqual({ level: 'volume', dir: 1 });
    expect(levelOf(btn('display.brightnessStep', { delta: -10 }))).toEqual({ level: 'screens', dir: -1, screen: 'all' });
    expect(levelOf(btn('keyboard.hotkey', { hotkey: 'VolumeUp' }))).toBeUndefined();
    expect(levelView(1, [100])).toEqual({ value: '100%', disabled: true });
    expect(levelView(1, [99.6])).toEqual({ value: '100%', disabled: false });
    expect(levelView(-1, [0])).toEqual({ value: '0%', disabled: true });
    expect(levelView(-1, [100])).toEqual({ value: '100%', disabled: false });
    expect(levelView(0, [100]).disabled).toBe(false);
  });
  it('a key moving two screens shows their range, and greys out only when both are at the end', () => {
    expect(levelOf(btn('display.brightnessStep', { delta: 10, screen: 'MON1' }))).toEqual({ level: 'screens', dir: 1, screen: 'MON1' });
    expect(levelView(1, [50, 100])).toEqual({ value: '50–100%', disabled: false });
    expect(levelView(1, [100, 100])).toEqual({ value: '100%', disabled: true });
    expect(panelOf(btn('display.brightnessPanel'))).toBe('brightness');
    expect(panelOf(btn('display.brightnessStep', { delta: 10 }))).toBeUndefined();
  });
});
