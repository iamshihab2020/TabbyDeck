import { useEffect, useRef, useState } from 'preact/hooks';

const SEND_EVERY_MS = 120; // while a slider is dragged or a wheel turned
const HOLD_MS = 1500;      // after a touch, the control keeps the finger's value over the PC's (slower) report

/**
 * Levels the finger sets with a slider or a wheel: sent at most every SEND_EVERY_MS while it moves (at once when `now`),
 * and shown over what the PC reports until HOLD_MS after the last touch, so a slow report cannot pull the control back.
 */
export function useLevels(onSet: (id: string, percent: number) => void) {
  const [mine, setMine] = useState<Record<string, { v: number; at: number }>>({});
  const timers = useRef<Record<string, { last: number; t?: ReturnType<typeof setTimeout> }>>({});
  useEffect(() => () => { for (const k in timers.current) clearTimeout(timers.current[k].t); }, []);
  // Re-render once the hold runs out so the PC's value shows again.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 500); return () => clearInterval(t); }, []);

  const set = (id: string, v: number, now = false) => {
    v = Math.max(0, Math.min(100, Math.round(v)));
    setMine(m => ({ ...m, [id]: { v, at: Date.now() } }));
    const s = timers.current[id] ??= { last: 0 };
    clearTimeout(s.t);
    const wait = now ? 0 : SEND_EVERY_MS - (Date.now() - s.last);
    if (wait <= 0) { s.last = Date.now(); onSet(id, v); } else s.t = setTimeout(() => { s.last = Date.now(); onSet(id, v); }, wait);
  };
  const level = (id: string, pc: number) => { const m = mine[id]; return m && Date.now() - m.at < HOLD_MS ? m.v : pc; };
  return { set, level };
}
