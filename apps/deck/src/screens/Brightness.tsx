import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { AppSound, AudioOutput, Bluetooth, Screen } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';

const SEND_EVERY_MS = 120; // while a slider is dragged
const HOLD_MS = 1500;      // after a touch, the slider keeps the finger's value over the PC's (slower) report

interface Row {
  id: string; name: string; icon: string; level: number;
  /** A small heading above this row, starting a group (the apps under the PC's volume). */
  head?: string;
  /** The row has its own mute button. */
  mute?: { on: boolean; set(on: boolean): void };
}

/** A sheet of sliders, one per row, each with − / + for exact steps. Brightness and volume both use it. */
function LevelPanel({ title, icon, rows, step, empty, onSet, onClose, children, extra }: {
  title: string; icon: string; rows?: Row[]; step: number; empty: string;
  onSet(id: string, percent: number): void; onClose(): void; children?: ComponentChildren;
  /** Shown under the rows, above the buttons. */
  extra?: ComponentChildren;
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
            return [
              r.head && <h2 key={`h-${r.id}`} class="sheet-h">{r.head}</h2>,
              <div key={r.id} class={r.mute?.on ? 'bright-row muted' : 'bright-row'}>
                <div class="bright-head">
                  <Icon name={r.icon} size={18} />
                  <span class="bright-name">{r.name}</span>
                  <span class="bright-pct">{v}%</span>
                  {r.mute && <button type="button" class={r.mute.on ? 'bright-mute on' : 'bright-mute'} aria-pressed={r.mute.on} aria-label={`Mute ${r.name}`} onClick={() => r.mute!.set(!r.mute!.on)}>
                    <Icon name={r.mute.on ? 'speaker-x' : 'speaker-high'} size={18} />
                  </button>}
                </div>
                <div class="bright-ctl">
                  <button type="button" class="bright-step" aria-label={`${r.name} down`} disabled={v <= 0} onClick={() => set(r.id, v - step, true)}><Icon name="minus" size={20} /></button>
                  <input type="range" class="bright-range" min={0} max={100} step={1} value={v} aria-label={r.name}
                    style={{ backgroundSize: `${v}% 100%` }}
                    onInput={e => set(r.id, Number((e.target as HTMLInputElement).value))}
                    onChange={e => set(r.id, Number((e.target as HTMLInputElement).value), true)} />
                  <button type="button" class="bright-step" aria-label={`${r.name} up`} disabled={v >= 100} onClick={() => set(r.id, v + step, true)}><Icon name="plus" size={20} /></button>
                </div>
              </div>,
            ];
          })}
        {extra}
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

const OUTPUT_HOLD_MS = 4000; // a chosen output shows as chosen until the PC reports it, or for this long

/** "Speakers (Realtek(R) Audio)" -> "Speakers": the driver's name does not fit on a chip. */
const short = (name: string) => name.replace(/\s+\(.*\)\s*$/, '') || name;

/**
 * The PC's volume, then each app with sound open (its own slider and mute, as in Windows' volume mixer), then the
 * outputs to play through. Mute for the whole PC sits beside Done.
 */
export function VolumePanel({ level, muted, apps, outputs, onSet, onMute, onApp, onOutput, onClose }: {
  level?: number; muted?: boolean; apps?: AppSound[]; outputs?: AudioOutput[];
  onSet(percent: number): void; onMute(on: boolean): void; onApp(id: string, change: { percent?: number; mute?: boolean }): void; onOutput(id: string): void; onClose(): void;
}) {
  const [chosen, setChosen] = useState<{ id: string; at: number } | null>(null);
  const rows: Row[] | undefined = level === undefined ? undefined : [
    { id: 'volume', name: muted ? 'Volume (muted)' : 'Volume', icon: muted ? 'speaker-x' : 'speaker-high', level },
    ...(apps ?? []).map((a, i) => ({
      id: `app:${a.id}`, name: a.name, icon: 'app-window', level: a.level, head: i === 0 ? 'Apps' : undefined,
      mute: { on: a.muted, set: (on: boolean) => onApp(a.id, { mute: on }) },
    })),
  ];
  const playing = outputs?.find(o => o.isDefault)?.id;
  const shown = chosen && chosen.id !== playing && Date.now() - chosen.at < OUTPUT_HOLD_MS ? chosen.id : playing;
  const extra = outputs && outputs.length > 1 && <>
    <h2 class="sheet-h">Plays through</h2>
    <div class="chips" role="radiogroup" aria-label="Sound output">
      {outputs.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === shown} class={o.id === shown ? 'chip on' : 'chip'}
          onClick={() => { if (o.id !== shown) { setChosen({ id: o.id, at: Date.now() }); onOutput(o.id); } }}>{short(o.name)}</button>
      ))}
    </div>
  </>;
  return (
    <LevelPanel title="Volume" icon="speaker-high" rows={rows} step={5} empty="" extra={extra}
      onSet={(id, v) => id === 'volume' ? onSet(v) : onApp(id.slice(4), { percent: v })} onClose={onClose}>
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
