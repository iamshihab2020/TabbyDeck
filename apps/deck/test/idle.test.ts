import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleDimmer, loadDimAfter, saveDimAfter, DIM_DEFAULT } from '../src/idle.ts';

const memKV = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('idle dimming', () => {
  it('dims after the idle time and brightens on the next touch', () => {
    const seen: boolean[] = [];
    const d = createIdleDimmer(60_000, x => seen.push(x));
    vi.advanceTimersByTime(59_000); expect(seen).toEqual([]);
    d.touch(); vi.advanceTimersByTime(59_000); expect(seen).toEqual([]); // a touch restarts the wait
    vi.advanceTimersByTime(1_000); expect(seen).toEqual([true]);
    d.touch(); expect(seen).toEqual([true, false]);
    d.stop();
  });
  it('never dims when set to 0', () => {
    const seen: boolean[] = [];
    createIdleDimmer(0, x => seen.push(x));
    vi.advanceTimersByTime(3_600_000); expect(seen).toEqual([]);
  });
  it('remembers the choice, and ignores values that are not offered', () => {
    const kv = memKV();
    expect(loadDimAfter(kv)).toBe(DIM_DEFAULT);
    saveDimAfter(kv, 0); expect(loadDimAfter(kv)).toBe(0);
    saveDimAfter(kv, 12345); expect(loadDimAfter(kv)).toBe(DIM_DEFAULT);
  });
});
