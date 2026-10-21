import { describe, expect, it } from 'vitest';
import { newId, ProfileFileSchema, StepSchema, WidgetSchema, defaultProfileFile, DEFAULT_LOOK, DEFAULT_SETTINGS, SettingsSchema } from '../src/index.ts';

describe('newId', () => {
  it('is 16 chars from a-z0-9', () => {
    const id = newId();
    expect(id).toMatch(/^[a-z0-9]{16}$/);
    expect(newId()).not.toBe(id);
  });
});

describe('defaultProfileFile', () => {
  it('parses with the schema', () => {
    expect(() => ProfileFileSchema.parse(defaultProfileFile())).not.toThrow();
  });
  it('is a 5x3 Main profile with a Notepad button at 0,0', () => {
    const f = defaultProfileFile();
    expect(f.profile).toMatchObject({ name: 'Main', cols: 5, rows: 3 });
    expect(f.folders).toHaveLength(1);
    expect(f.folders[0]).toMatchObject({ id: f.profile.rootFolderId, parentId: null });
    const w = f.widgets[0];
    expect(w).toMatchObject({ x: 0, y: 0, w: 1, h: 1, folderId: f.profile.rootFolderId });
    expect(w.look.label).toBe('Notepad');
    expect(w.look.icon).toBe('notepad');
    expect(w.config.kind).toBe('button');
    if (w.config.kind === 'button') expect(w.config.triggers.press?.[0]).toMatchObject({ action: 'system.launch', params: { path: 'notepad.exe' } });
  });
});

describe('schemas', () => {
  it('allows a widget that overflows the grid (layout is the store job)', () => {
    const f = defaultProfileFile();
    expect(() => WidgetSchema.parse({ ...f.widgets[0], x: 4, w: 3 })).not.toThrow();
  });
  it('rejects a step without id', () => {
    expect(() => StepSchema.parse({ action: 'x', params: {} })).toThrow();
  });
  it('defaults match the spec', () => {
    expect(DEFAULT_LOOK).toMatchObject({ bg: '#25221f', fg: '#efeae3', iconScale: 1, iconX: 0, iconY: 0, iconOpacity: 1, labelPos: 'bottom', labelSize: 14, radius: 16 });
    expect(DEFAULT_SETTINGS).toEqual({ schemaVersion: 1, port: 8191, editorPort: 8192, bindAddress: '', autoStart: false, theme: 'dark', openEditorOnStart: true, guideDone: false });
    expect(SettingsSchema.parse({ schemaVersion: 1, port: 8191, editorPort: 8192, bindAddress: '', autoStart: false, theme: 'dark', openEditorOnStart: true }).guideDone).toBe(false); // settings saved before the guide existed
    expect(() => SettingsSchema.parse(DEFAULT_SETTINGS)).not.toThrow();
  });
});
