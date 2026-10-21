import { describe, expect, it } from 'vitest';
import { ActionRegistry, type ActionDef } from '../src/engine/registry.ts';
import { setHotkeyValidator, validateParams } from '../src/engine/params.ts';

const def = (id: string, extra: Partial<ActionDef> = {}): ActionDef => ({
  id, name: id, group: 'Test', schema: { text: { type: 'string', title: 'Text', required: true } }, run: async () => {}, ...extra,
});

describe('ActionRegistry', () => {
  it('lists public definitions without run', () => {
    const r = new ActionRegistry();
    r.register(def('a.one', { danger: true }));
    expect(r.list()).toEqual([{ id: 'a.one', name: 'a.one', group: 'Test', danger: true, schema: { text: { type: 'string', title: 'Text', required: true } } }]);
    expect('run' in r.list()[0]).toBe(false);
    expect(r.get('a.one')?.run).toBeTypeOf('function');
  });
  it('throws on a duplicate id', () => {
    const r = new ActionRegistry();
    r.register(def('a.one'));
    expect(() => r.register(def('a.one'))).toThrow(/duplicate/i);
  });
});

describe('validateParams', () => {
  it('fills defaults', () => {
    const r = validateParams({ n: { type: 'number', title: 'N', default: 3 }, b: { type: 'boolean', title: 'B', default: false } }, {});
    expect(r).toEqual({ ok: true, value: { n: 3, b: false } });
  });
  it('rejects a missing required field and names it', () => {
    const r = validateParams({ path: { type: 'path', title: 'Program', required: true } }, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Program');
  });
  it('rejects an empty required string', () => {
    expect(validateParams({ path: { type: 'path', title: 'Program', required: true } }, { path: '  ' }).ok).toBe(false);
  });
  it('rejects an enum value not in options', () => {
    const r = validateParams({ mode: { type: 'enum', title: 'Mode', options: ['on', 'off', 'toggle'] } }, { mode: 'maybe' });
    expect(r.ok).toBe(false);
  });
  it('enforces number bounds and types', () => {
    const s = { v: { type: 'number' as const, title: 'Volume', min: 0, max: 100 } };
    expect(validateParams(s, { v: 101 }).ok).toBe(false);
    expect(validateParams(s, { v: 'x' }).ok).toBe(false);
    expect(validateParams(s, { v: 50 })).toEqual({ ok: true, value: { v: 50 } });
  });
  it('drops unknown keys', () => {
    expect(validateParams({ a: { type: 'string', title: 'A' } }, { a: 'x', evil: 1 })).toEqual({ ok: true, value: { a: 'x' } });
  });
  it('uses the injected hotkey validator', () => {
    setHotkeyValidator(s => (s === 'Ctrl+C' ? null : `bad hotkey ${s}`));
    const s = { k: { type: 'hotkey' as const, title: 'Keys', required: true } };
    expect(validateParams(s, { k: 'Ctrl+C' }).ok).toBe(true);
    const bad = validateParams(s, { k: 'Ctrl+Nope' });
    expect(!bad.ok && bad.error).toContain('bad hotkey');
  });
  it('rejects a non-object params value', () => {
    expect(validateParams({}, 'x').ok).toBe(false);
  });
});
