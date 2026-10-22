import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '@tabbydeck/ui';
import type { ClientMsg } from '@tabbydeck/shared';

type Pointer = Omit<Extract<ClientMsg, { t: 'pointer' }>, 't' | 'widgetId'>;

const TAP_MS = 250, TAP_MOVE = 8;      // a touch shorter and stiller than this is a click
const SCROLL_PX = 36;                   // finger travel for one wheel notch

/** Pointer speed: slow moves stay precise, quick flicks cross the screen. */
export const gain = (dx: number, dy: number) => 1.4 + Math.min(2.6, Math.sqrt(dx * dx + dy * dy) / 9);

/**
 * The phone as a touchpad: one finger moves the pointer, a tap clicks, two fingers scroll (or right-click on a tap).
 * Moves are added up and sent once per frame; the buttons below hold down for dragging. The box types on the PC.
 */
export function TrackpadPanel({ onSend, onClose }: { onSend(m: Pointer): void; onClose(): void }) {
  const pad = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const opened = useMemo(() => Date.now(), []);

  useEffect(() => {
    const el = pad.current; if (!el) return;
    let x = 0, y = 0, t0 = 0, travel = 0, most = 0, frame = 0;
    const acc = { dx: 0, dy: 0, scroll: 0, scrollX: 0 };
    const flush = () => {
      frame = 0;
      const m: Pointer = {};
      const take = (k: keyof typeof acc) => { const v = Math.trunc(acc[k]); acc[k] -= v; return v; };
      const dx = take('dx'), dy = take('dy');
      if (dx || dy) { m.dx = dx; m.dy = dy; }
      // Scroll goes in fractions of a notch for smooth scrolling.
      if (acc.scroll || acc.scrollX) { m.scroll = +acc.scroll.toFixed(2); m.scrollX = +acc.scrollX.toFixed(2); acc.scroll = acc.scrollX = 0; }
      if (Object.keys(m).length) onSend(m);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(flush); };
    const mid = (e: TouchEvent) => {
      let sx = 0, sy = 0; const n = e.touches.length;
      for (let i = 0; i < n; i++) { sx += e.touches[i].clientX; sy += e.touches[i].clientY; }
      return { x: sx / n, y: sy / n };
    };
    const start = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) { t0 = Date.now(); travel = 0; most = 0; }
      most = Math.max(most, e.touches.length);
      ({ x, y } = mid(e)); // a new finger moves the middle point; start again from there
    };
    const move = (e: TouchEvent) => {
      e.preventDefault();
      const p = mid(e), dx = p.x - x, dy = p.y - y;
      x = p.x; y = p.y; travel += Math.abs(dx) + Math.abs(dy);
      if (e.touches.length === 1) { const g = gain(dx, dy); acc.dx += dx * g; acc.dy += dy * g; }
      else { acc.scroll += dy / SCROLL_PX; acc.scrollX -= dx / SCROLL_PX; } // content follows the fingers, as on the phone
      queue();
    };
    const end = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length) { ({ x, y } = mid(e)); return; }
      if (Date.now() - t0 < TAP_MS && travel < TAP_MOVE) { onSend({ button: most > 1 ? 'right' : 'left' }); if (navigator.vibrate) navigator.vibrate(8); }
    };
    el.addEventListener('touchstart', start, { passive: false }); el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false }); el.addEventListener('touchcancel', end, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end);
    };
  }, [onSend]);

  const hold = (button: 'left' | 'right') => ({
    onPointerDown: (e: PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); onSend({ button, down: true }); },
    onPointerUp: () => onSend({ button, down: false }),
    onPointerCancel: () => onSend({ button, down: false }),
  });
  const typeIt = () => { if (text) { onSend({ text }); setText(''); } };

  return (
    <div class="sheet-backdrop" onClick={() => { if (Date.now() - opened > 500) onClose(); }}>
      <section class="sheet pad-sheet" role="dialog" aria-label="Trackpad" onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        <div class="pad" ref={pad} aria-label="Touchpad: move one finger to point, tap to click, two fingers to scroll">
          <span class="pad-hint"><Icon name="hand-pointing" size={18} />One finger points, tap clicks, two fingers scroll</span>
        </div>
        <div class="pad-buttons">
          <button type="button" class="pad-btn" {...hold('left')}>Left</button>
          <button type="button" class="pad-btn" {...hold('right')}>Right</button>
        </div>
        <form class="pad-type" onSubmit={e => { e.preventDefault(); typeIt(); }}>
          <input class="input" value={text} placeholder="Type here, then Send" autocomplete="off" autocapitalize="off" spellcheck={false}
            onInput={e => setText((e.target as HTMLInputElement).value)} />
          <button type="submit" class="btn" disabled={!text}>Send</button>
        </form>
        <div class="sheet-row">
          <button type="button" class="btn" aria-label="Backspace" onClick={() => onSend({ key: 'Backspace' })}><Icon name="backspace" size={18} /></button>
          <button type="button" class="btn" onClick={() => onSend({ key: 'Enter' })}>Enter</button>
          <button type="button" class="btn primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}
