import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Screen } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useLevels } from '../levels.ts';
import { angleAt, levelAngle, pointAt, turn } from '../wheel.ts';

// The knob is drawn in a 260 x 260 box, seen from a little above: a soft shadow, the ridged side showing below the
// top, the top lit from the upper left with a dimple to turn it by, and a ring of 20 lights round it for the level.
const SIZE = 260, C = SIZE / 2, K = 84, SIDE = 15, LIGHTS = 20, RL = 119;
// The ridges of the side: short lines out to the edge, all the way round; the top hides all but the lower ones.
let RIDGES = '';
for (let i = 0; i < 96; i++) {
  const a = i * 360 / 96, [x1, y1] = pointAt(a, K - SIDE - 4, C, C + SIDE), [x2, y2] = pointAt(a, K - 0.5, C, C + SIDE);
  RIDGES += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
const LED = Array.from({ length: LIGHTS }, (_, i) => pointAt(levelAngle((i + 0.5) * 100 / LIGHTS), RL, C, C));

/**
 * A knob to turn: drag round it as a real one, and the level follows how far the finger goes. The ring of lights and
 * the number under the knob show the level. The phone gives a light tick every 5% where it can vibrate; arrow keys
 * turn it by `step`.
 */
function Dial({ value, label, muted, step, onTurn }: { value: number; label: string; muted?: boolean; step: number; onTurn(v: number, now?: boolean): void }) {
  const drag = useRef<{ at: number; v: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // iOS can scroll the sheet under a turning finger unless the touch itself is held.
  useEffect(() => {
    const el = svg.current!, hold = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, []);
  const angle = (e: PointerEvent) => { const b = svg.current!.getBoundingClientRect(); return angleAt(e.clientX, e.clientY, b.left + b.width / 2, b.top + b.height / 2); };
  const a = levelAngle(value), lit = Math.round(value * LIGHTS / 100);
  return (
    <div class="wheel">
      <svg ref={svg} class={muted ? 'wheel-dial muted' : 'wheel-dial'} viewBox={`0 0 ${SIZE} ${SIZE}`} role="slider" tabIndex={0}
        aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}
        onPointerDown={e => { svg.current!.setPointerCapture?.(e.pointerId); drag.current = { at: angle(e), v: value }; }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const at = angle(e), v = turn(d.v, d.at, at);
          if (Math.floor(v / 5) !== Math.floor(d.v / 5) && navigator.vibrate) navigator.vibrate(4);
          drag.current = { at, v };
          onTurn(v);
        }}
        onPointerUp={() => { if (drag.current) onTurn(drag.current.v, true); drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={e => {
          const k = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? step : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -step : 0;
          if (k) { e.preventDefault(); onTurn(value + k, true); }
        }}>
        <defs>
          <radialGradient id="tb-k-shadow"><stop offset="0.6" stop-color="#000" stop-opacity="0.55" /><stop offset="1" stop-color="#000" stop-opacity="0" /></radialGradient>
          <linearGradient id="tb-k-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505" /><stop offset="0.8" stop-color="#1b1b1b" /><stop offset="1" stop-color="#0b0b0b" /></linearGradient>
          {/* A flat matte top: light falls evenly from above, a little brighter towards the back edge. */}
          <radialGradient id="tb-k-top" cx="0.5" cy="0" r="1.15"><stop offset="0" stop-color="#2e2e2e" /><stop offset="0.65" stop-color="#1c1c1c" /><stop offset="1" stop-color="#161616" /></radialGradient>
          <linearGradient id="tb-k-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.3" /><stop offset="0.45" stop-color="#fff" stop-opacity="0.04" /><stop offset="1" stop-color="#fff" stop-opacity="0" /></linearGradient>
          {/* The dimple is lit from the same corner however far the knob turns: its light turns back against the knob. */}
          <radialGradient id="tb-k-dimple" cx="0.36" cy="0.32" r="0.75" gradientTransform={`rotate(${-a} 0.5 0.5)`}><stop offset="0" stop-color="#060606" /><stop offset="0.6" stop-color="#121212" /><stop offset="1" stop-color="#303030" /></radialGradient>
        </defs>
        {LED.map(([x, y], i) => <circle key={i} class={i < lit ? 'wheel-led lit' : 'wheel-led'} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3.6} />)}
        <ellipse cx={C} cy={C + SIDE + 14} rx={K + 14} ry={K + 4} fill="url(#tb-k-shadow)" />
        <circle cx={C} cy={C + SIDE} r={K} fill="url(#tb-k-side)" />
        <path class="wheel-ridges" d={RIDGES} transform={`rotate(${a} ${C} ${C + SIDE})`} />
        <circle cx={C} cy={C} r={K} fill="url(#tb-k-top)" />
        <circle cx={C} cy={C} r={K} fill="none" stroke="#000" stroke-opacity={0.75} stroke-width={1.5} />
        <circle cx={C} cy={C} r={K - 2.5} fill="none" stroke="url(#tb-k-edge)" stroke-width={3} />
        <g transform={`rotate(${a} ${C} ${C})`}>
          <circle cx={C} cy={C - K * 0.6} r={17} fill="url(#tb-k-dimple)" />
          <circle cx={C} cy={C - K * 0.6} r={17} fill="none" stroke="#fff" stroke-opacity={0.07} />
        </g>
      </svg>
      <div class="wheel-read" aria-hidden="true"><b>{Math.round(value)}%</b><span>{label}</span></div>
    </div>
  );
}

/** The sheet a wheel sits in, as the other panels: a title, the wheel (or why there is none), then the buttons. */
function WheelSheet({ title, icon, children, buttons, onClose }: { title: string; icon: string; children: ComponentChildren; buttons?: ComponentChildren; onClose(): void }) {
  // The tap that opened the sheet ends over the backdrop; ignore backdrop taps for a moment so it cannot close itself.
  const opened = useMemo(() => Date.now(), []);
  return (
    <div class="sheet-backdrop" onClick={() => { if (Date.now() - opened > 500) onClose(); }}>
      <section class="sheet bright" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        <h2 class="bright-title"><Icon name={icon} size={20} />{title}</h2>
        {children}
        <div class="sheet-row">{buttons}<button type="button" class="btn primary" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

/** The Volume wheel: the PC's volume, with Mute beside Done. */
export function VolumeWheelPanel({ level, muted, onSet, onMute, onClose }: { level?: number; muted?: boolean; onSet(percent: number): void; onMute(on: boolean): void; onClose(): void }) {
  const { set, level: held } = useLevels((_id, v) => onSet(v));
  return (
    <WheelSheet title="Volume" icon="speaker-high" onClose={onClose}
      buttons={level !== undefined && <button type="button" class={muted ? 'btn danger' : 'btn'} aria-pressed={!!muted} onClick={() => onMute(!muted)}>
        <Icon name={muted ? 'speaker-high' : 'speaker-x'} size={18} />{muted ? 'Unmute' : 'Mute'}
      </button>}>
      {level === undefined ? <p class="hint">Reading from the PC…</p>
        : <Dial value={held('volume', level)} label={muted ? 'Muted' : 'Volume'} muted={muted} step={5} onTurn={(v, now) => set('volume', v, now)} />}
    </WheelSheet>
  );
}

/**
 * The Brightness wheel: every screen at once, starting from their average, or one screen chosen above the wheel when
 * the PC has more than one.
 */
export function BrightnessWheelPanel({ screens, onSet, onClose }: { screens?: Screen[]; onSet(screen: string, percent: number): void; onClose(): void }) {
  const [which, setWhich] = useState('all');
  const { set, level: held } = useLevels((id, v) => { for (const s of screens ?? []) if (id === 'all' || s.id === id) onSet(s.id, v); });
  const on = screens?.filter(s => which === 'all' || s.id === which) ?? [];
  const pc = on.length ? Math.round(on.reduce((n, s) => n + s.brightness, 0) / on.length) : 0;
  return (
    <WheelSheet title="Brightness" icon="sun" onClose={onClose}>
      {!screens ? <p class="hint">Reading from the PC…</p>
        : !screens.length ? <p class="hint">No screen here lets Windows change its brightness.</p>
        : <>
          {screens.length > 1 && <div class="chips wheel-chips" role="radiogroup" aria-label="Screen">
            {[{ id: 'all', name: 'All screens' }, ...screens].map(s => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === which} class={s.id === which ? 'chip on' : 'chip'} onClick={() => setWhich(s.id)}>{s.name}</button>
            ))}
          </div>}
          <Dial value={held(which, pc)} label={screens.length > 1 && which === 'all' ? 'All screens' : on[0]?.name ?? ''} step={10} onTurn={(v, now) => set(which, v, now)} />
        </>}
    </WheelSheet>
  );
}
