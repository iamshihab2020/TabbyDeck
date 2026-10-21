import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Bluetooth, Screen } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';

const SEND_EVERY_MS = 120; // while a slider is dragged
const HOLD_MS = 1500;      // after a touch, the slider keeps the finger's value over the PC's (slower) report

interface Row { id: string; name: string; icon: string; level: number }

/** A sheet of sliders, one per row, each with − / + for exact steps. Brightness and volume both use it. */
function LevelPanel({ title, icon, rows, step, empty, onSet, onClose, children }: {
  title: string; icon: string; rows?: Row[]; step: number; empty: string;
  onSet(id: string, percent: number): void; onClose(): void; children?: ComponentChildren;
}) {
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
  // The tap that opened the panel ends over the backdrop; ignore backdrop taps for a moment so it cannot close itself.
  const opened = useMemo(() => Date.now(), []);
  const level = (r: Row) => { const m = mine[r.id]; return m && Date.now() - m.at < HOLD_MS ? m.v : r.level; };

  return (
    <div class="sheet-backdrop" onClick={() => { if (Date.now() - opened > 500) onClose(); }}>
      <section class="sheet bright" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        <h2 class="bright-title"><Icon name={icon} size={20} />{title}</h2>
        {!rows ? <p class="hint">Reading from the PC…</p>
          : !rows.length ? <p class="hint">{empty}</p>
          : rows.map(r => {
            const v = level(r);
            return (
              <div key={r.id} class="bright-row">
                <div class="bright-head">
                  <Icon name={r.icon} size={18} />
                  <span class="bright-name">{r.name}</span>
                  <span class="bright-pct">{v}%</span>
                </div>
                <div class="bright-ctl">
                  <button type="button" class="bright-step" aria-label={`${r.name} down`} disabled={v <= 0} onClick={() => set(r.id, v - step, true)}><Icon name="minus" size={20} /></button>
                  <input type="range" class="bright-range" min={0} max={100} step={1} value={v} aria-label={r.name}
                    style={{ backgroundSize: `${v}% 100%` }}
                    onInput={e => set(r.id, Number((e.target as HTMLInputElement).value))}
                    onChange={e => set(r.id, Number((e.target as HTMLInputElement).value), true)} />
                  <button type="button" class="bright-step" aria-label={`${r.name} up`} disabled={v >= 100} onClick={() => set(r.id, v + step, true)}><Icon name="plus" size={20} /></button>
                </div>
              </div>
            );
          })}
        <div class="sheet-row">{children}<button type="button" class="btn primary" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

/** One row per screen: its name and level, a slider, and − / + for exact steps. */
export function BrightnessPanel({ screens, onSet, onClose }: { screens?: Screen[]; onSet(screen: string, percent: number): void; onClose(): void }) {
  const rows = screens?.map(s => ({ id: s.id, name: s.name, icon: s.name === 'Laptop screen' ? 'laptop' : 'monitor', level: s.brightness }));
  return <LevelPanel title="Brightness" icon="sun" rows={rows} step={10} empty="No screen here lets Windows change its brightness." onSet={onSet} onClose={onClose} />;
}

/** The PC's volume as one slider, with Mute beside Done. */
export function VolumePanel({ level, muted, onSet, onMute, onClose }: { level?: number; muted?: boolean; onSet(percent: number): void; onMute(on: boolean): void; onClose(): void }) {
  const rows = level === undefined ? undefined : [{ id: 'volume', name: muted ? 'Volume (muted)' : 'Volume', icon: muted ? 'speaker-x' : 'speaker-high', level }];
  return (
    <LevelPanel title="Volume" icon="speaker-high" rows={rows} step={5} empty="" onSet={(_id, v) => onSet(v)} onClose={onClose}>
      <button type="button" class={muted ? 'btn danger' : 'btn'} aria-pressed={!!muted} onClick={() => onMute(!muted)}>
        <Icon name={muted ? 'speaker-high' : 'speaker-x'} size={18} />{muted ? 'Unmute' : 'Mute'}
      </button>
    </LevelPanel>
  );
}

const PENDING_MS = 12000; // Windows can take this long to connect; after it the row shows what the PC reports again

/** Bluetooth on or off, then the paired devices: headphones and speakers connect from here, others show their state. */
export function BluetoothPanel({ bt, onPower, onDevice, onClose }: { bt?: Bluetooth; onPower(on: boolean): void; onDevice(id: string, connect: boolean): void; onClose(): void }) {
  const [want, setWant] = useState<Record<string, { on: boolean; at: number }>>({});
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const opened = useMemo(() => Date.now(), []);
  // A request is pending until the PC reports the wanted state, or for PENDING_MS at most.
  const pending = (id: string, now: boolean) => { const w = want[id]; return w && w.on !== now && Date.now() - w.at < PENDING_MS ? w : undefined; };
  const ask = (id: string, on: boolean) => setWant(w => ({ ...w, [id]: { on, at: Date.now() } }));
  const power = bt && pending('power', bt.on);
  const on = power ? power.on : !!bt?.on;

  return (
    <div class="sheet-backdrop" onClick={() => { if (Date.now() - opened > 500) onClose(); }}>
      <section class="sheet bright" role="dialog" aria-label="Bluetooth" onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        <h2 class="bright-title"><Icon name="bluetooth" size={20} />Bluetooth</h2>
        {!bt ? <p class="hint">Reading from the PC…</p>
          : !bt.available ? <p class="hint">This PC has no Bluetooth.</p>
          : <>
            <button type="button" class={on ? 'bt-power on' : 'bt-power'} role="switch" aria-checked={on} disabled={!!power}
              onClick={() => { ask('power', !on); onPower(!on); }}>
              <span>{power ? (power.on ? 'Turning on…' : 'Turning off…') : on ? 'On' : 'Off'}</span><i class="bt-knob" />
            </button>
            {on && !bt.devices.length && <p class="hint">No paired devices. Pair one in Windows Settings first.</p>}
            {on && bt.devices.map(d => {
              const p = pending(d.id, d.connected), state = p ? (p.on ? 'Connecting…' : 'Disconnecting…') : d.connected ? 'Connected' : d.audio ? 'Not connected' : 'Connects by itself when switched on';
              return (
                <div key={d.id} class={d.connected ? 'bright-row bt-row on' : 'bright-row bt-row'}>
                  <Icon name={d.audio ? 'headphones' : 'bluetooth'} size={20} />
                  <div class="bt-text"><span class="bright-name">{d.name}</span><span class="bt-state">{state}</span></div>
                  {d.audio && <button type="button" class={d.connected ? 'btn' : 'btn primary'} disabled={!!p}
                    onClick={() => { ask(d.id, !d.connected); onDevice(d.id, !d.connected); }}>{d.connected ? 'Disconnect' : 'Connect'}</button>}
                </div>
              );
            })}
            {!on && <p class="hint">Turn Bluetooth on to connect headphones or speakers.</p>}
          </>}
        <div class="sheet-row"><button type="button" class="btn primary" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}
