import type { KV } from './device.ts';

const KEY = 'tabbydeck.dimAfter';
/** Choices offered in the settings sheet, in ms; 0 means never dim. */
export const DIM_CHOICES = [0, 30_000, 60_000, 300_000];
export const DIM_DEFAULT = 60_000;

export function loadDimAfter(kv: KV): number {
  try { const n = Number(kv.getItem(KEY)); return DIM_CHOICES.includes(n) && kv.getItem(KEY) !== null ? n : DIM_DEFAULT; } catch { return DIM_DEFAULT; }
}
export function saveDimAfter(kv: KV, ms: number): void {
  try { kv.setItem(KEY, String(ms)); } catch { /* private mode: lasts for this page only */ }
}

/** Calls onChange(true) after `ms` without a touch, and onChange(false) on the next touch. */
export function createIdleDimmer(ms: number, onChange: (dimmed: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dimmed = false;
  const arm = () => { clearTimeout(timer); if (ms > 0) timer = setTimeout(() => { dimmed = true; onChange(true); }, ms); };
  arm();
  return {
    touch() { if (dimmed) { dimmed = false; onChange(false); } arm(); },
    stop() { clearTimeout(timer); },
  };
}
