import type { ParamField, ParamSchema } from '@tabbydeck/shared';

type Result = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

let hotkeyValidator: (s: string) => string | null = () => null;
/** Injected by the keyboard integration so this module does not depend on it. Returns an error message or null. */
export function setHotkeyValidator(fn: (s: string) => string | null): void { hotkeyValidator = fn; }

const STRINGY = new Set(['string', 'text', 'path', 'profile', 'folder', 'variable', 'hotkey', 'screen', 'window', 'audioOutput']);

function check(key: string, f: ParamField, v: unknown): string | null {
  if (STRINGY.has(f.type)) {
    if (typeof v !== 'string') return `${f.title} must be text`;
    if (f.required && !v.trim()) return `${f.title} is required`;
    if (f.type === 'hotkey' && v.trim()) return hotkeyValidator(v);
    return null;
  }
  if (f.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${f.title} must be a number`;
    if (f.min !== undefined && v < f.min) return `${f.title} must be at least ${f.min}`;
    if (f.max !== undefined && v > f.max) return `${f.title} must be at most ${f.max}`;
    return null;
  }
  if (f.type === 'boolean') return typeof v === 'boolean' ? null : `${f.title} must be on or off`;
  if (f.type === 'enum') return typeof v === 'string' && (f.options ?? []).includes(v) ? null : `${f.title} must be one of ${(f.options ?? []).join(', ')}`;
  return `unknown field type for ${key}`;
}

/** Apply defaults, check required fields and types; unknown keys are dropped. */
export function validateParams(schema: ParamSchema, params: unknown): Result {
  if (params === undefined || params === null) params = {};
  if (typeof params !== 'object' || Array.isArray(params)) return { ok: false, error: 'parameters must be an object' };
  const input = params as Record<string, unknown>;
  const value: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(schema)) {
    let v = input[key];
    if (v === undefined || v === '') v = f.default ?? v;
    if (v === undefined) {
      if (f.required) return { ok: false, error: `${f.title} is required` };
      continue;
    }
    const err = check(key, f, v);
    if (err) return { ok: false, error: err };
    value[key] = v;
  }
  return { ok: true, value };
}
