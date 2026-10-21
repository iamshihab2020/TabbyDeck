import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DeckView, TriggerKind, WidgetView } from '@tabbydeck/shared';
import { flowLayout } from '@tabbydeck/shared/layout'; // the subpath keeps zod out of the client bundle
import { Grid, Icon, gridCellSize } from '@tabbydeck/ui';
import type { Connection } from '../connection.ts';
import { createPressTracker } from '../press.ts';
import { isFullscreen, toggleFullscreen } from '../fullscreen.ts';
import { DIM_CHOICES } from '../idle.ts';
import { BluetoothPanel, BrightnessPanel, VolumePanel } from './Brightness.tsx';

export interface DeckProps {
  view: DeckView;
  conn: Connection;
  flash: { id: string; kind: 'error' | 'ok' } | null;
  name: string;
  onRename(name: string): void;
  dimAfter: number;
  onDimAfter(ms: number): void;
}

const assetUrl = (id: string) => `assets/u/${encodeURIComponent(id)}`;

// Smallest key that is still easy to hit with a thumb. Below it the deck switches to scrolling (a phone).
const MIN_KEY = 72, MAX_SCROLL_KEY = 112, SCROLL_GAP = 10;

/** The deck area's content size. Window events, not ResizeObserver: the client floor is Chrome 60. */
function useAreaSize(el: { current: HTMLElement | null }): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const e = el.current; if (!e) return;
      const cs = getComputedStyle(e);
      setSize({ w: e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: e.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) });
    };
    measure();
    const late = setTimeout(measure, 250); // orientation change reports old sizes first on some Android builds
    window.addEventListener('resize', measure); window.addEventListener('orientationchange', measure);
    return () => { clearTimeout(late); window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, [el]);
  return size;
}

/**
 * The grid as drawn here. When every key fits at a comfortable size it is the deck as built. Otherwise (a phone) the
 * keys keep their size and the page scrolls: same columns if they fit across, else fewer columns in reading order.
 */
export function layoutFor(view: DeckView, area: { w: number; h: number } | null): { view: DeckView; cell: { w: number; h: number }; scroll: boolean } {
  if (!area) return { view, cell: { w: 64, h: 64 }, scroll: false };
  const fit = gridCellSize(area.w, area.h, view.cols, view.rows, view.gap);
  if (Math.min(fit.w, fit.h) >= MIN_KEY) return { view, cell: fit, scroll: false };
  const gap = Math.min(view.gap, SCROLL_GAP);
  const cols = Math.max(2, Math.min(view.cols, Math.floor((area.w + gap) / (MIN_KEY + gap))));
  const side = Math.min(MAX_SCROLL_KEY, Math.floor((area.w - gap * (cols - 1)) / cols));
  const flowed = cols === view.cols ? { widgets: view.widgets, rows: view.rows } : flowLayout(view.widgets, cols);
  return { view: { ...view, cols, gap, rows: flowed.rows, widgets: flowed.widgets }, cell: { w: side, h: side }, scroll: true };
}

export function DeckScreen({ view, conn, flash, name, onRename, dimAfter, onDimAfter }: DeckProps) {
  const area = useRef<HTMLDivElement>(null);
  const { view: shown, cell, scroll } = layoutFor(view, useAreaSize(area));
  const tap = useRef<string | null>(null); // a panel or careful key touched while scrolling: it opens on lift
  const [pressed, setPressed] = useState<string | null>(null);
  // The full screen button shows which way it will go; the browser can also leave full screen by itself (back gesture).
  const [full, setFull] = useState(() => isFullscreen());
  useEffect(() => {
    const on = () => setFull(isFullscreen());
    document.addEventListener('fullscreenchange', on); document.addEventListener('webkitfullscreenchange', on);
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on); };
  }, []);
  const [ripple, setRipple] = useState<{ id: string; x: number; y: number; n: number } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [ask, setAsk] = useState<WidgetView | null>(null); // a careful key waiting for a yes
  const [panel, setPanel] = useState<string | null>(null); // the brightness key whose panel is open
  const panelKey = panel ? view.widgets.find(w => w.id === panel) : undefined;
  const inFolder = view.path.length > 1;

  const send = (widgetId: string, kind: TriggerKind) => conn.send({ t: 'press', widgetId, kind });
  const trackers = useMemo(() => new Map<string, ReturnType<typeof createPressTracker>>(), [view.folderId, scroll]);
  const tracker = (w: WidgetView) => {
    const id = w.id;
    let t = trackers.get(id);
    if (!t) {
      // Level keys (Volume +) keep going while held: 400 ms, then a step every 150 ms. While scrolling, keys fire on lift.
      const onPress = () => { if (scroll && navigator.vibrate) navigator.vibrate(10); send(id, 'press'); };
      t = createPressTracker({ onPress, onLong: () => send(id, 'long'), onDouble: () => send(id, 'double'), onRelease: () => send(id, 'release') },
        { ...(w.repeat ? { longMs: 400, doubleMs: 300, repeatMs: 150 } : { longMs: 500, doubleMs: 300 }), tap: scroll });
      trackers.set(id, t);
    }
    return t;
  };
  const back = () => conn.send({ t: 'open', folderId: null });

  // swipe right to go back
  useEffect(() => {
    const el = area.current; if (!el || !inFolder) return;
    let x0 = 0, y0 = 0;
    const s = (e: TouchEvent) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
    const end = (e: TouchEvent) => { const t = e.changedTouches[0]; if (t.clientX - x0 > 80 && Math.abs(t.clientY - y0) < 40) back(); };
    el.addEventListener('touchstart', s, { passive: true }); el.addEventListener('touchend', end, { passive: true });
    return () => { el.removeEventListener('touchstart', s); el.removeEventListener('touchend', end); };
  }, [inFolder, view.folderId]);

  const bar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const barDown = () => { bar.current = setTimeout(() => setSheet(true), 600); };
  const barUp = () => clearTimeout(bar.current);

  return (
    <div class="deck" style={{ background: view.bg }}>
      <header class="deck-bar" onPointerDown={barDown} onPointerUp={barUp} onPointerLeave={barUp}>
        <span class="bar-side">
          {inFolder && <button type="button" class="bar-btn" aria-label="Back" onClick={back}><Icon name="caret-left" size={22} /></button>}
        </span>
        <nav class="crumbs" aria-label="Folder path">
          {view.path.map((p, i) => <span key={p.id} class={i === view.path.length - 1 ? 'crumb current' : 'crumb'}>{i === 0 ? view.profileName : p.name}</span>)}
        </nav>
        <span class="bar-side end">
          <button type="button" class="bar-btn" aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}><Icon name={full ? 'arrows-in' : 'arrows-out'} size={20} /></button>
          <button type="button" class="bar-btn" aria-label="Settings" onClick={() => setSheet(true)}><Icon name="gear-six" size={20} /></button>
        </span>
      </header>

      <div class={scroll ? 'deck-area scroll' : 'deck-area'} ref={area}>
        {view.widgets.length === 0
          ? <p class="empty">Nothing here yet. Add buttons in TabbyDeck on your computer.</p>
          : <Grid view={shown} cell={cell} assetUrl={assetUrl} tileProps={w => ({
              pressed: pressed === w.id,
              ripple: ripple && ripple.id === w.id ? ripple : undefined,
              flash: flash && flash.id === w.id ? flash.kind : undefined,
              onPointerDown: e => {
                if (w.disabled) return; // at 100% (or 0%): nothing to do, and the key already says so
                const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect();
                setRipple({ id: w.id, x: e.clientX - r.left, y: e.clientY - r.top, n: (ripple?.n ?? 0) + 1 });
                setPressed(w.id);
                if (scroll) { tap.current = w.id; if (!w.panel && !w.confirm) tracker(w).down(); return; } // the browser may still take this touch to scroll
                el.setPointerCapture?.(e.pointerId); if (navigator.vibrate) navigator.vibrate(10);
                if (w.panel) setPanel(w.id); else if (w.confirm) setAsk(w); else tracker(w).down();
              },
              onPointerUp: () => {
                setPressed(null);
                if (scroll && tap.current === w.id && (w.panel || w.confirm)) { tap.current = null; if (w.panel) setPanel(w.id); else setAsk(w); return; }
                tap.current = null; tracker(w).up();
              },
              onPointerCancel: () => { setPressed(null); tap.current = null; tracker(w).cancel(); },
              onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (w.disabled) return; if (w.panel) setPanel(w.id); else if (w.confirm) setAsk(w); else { send(w.id, 'press'); send(w.id, 'release'); } } },
            })} />}
      </div>

      {ask && <Confirm w={ask} onCancel={() => setAsk(null)} onConfirm={() => { send(ask.id, 'press'); send(ask.id, 'release'); setAsk(null); }} />}
      {panelKey?.panel === 'brightness' && <BrightnessPanel screens={panelKey.screens} onSet={(screen, percent) => conn.send({ t: 'brightness', widgetId: panelKey.id, screen, percent })} onClose={() => setPanel(null)} />}
      {panelKey?.panel === 'volume' && <VolumePanel level={panelKey.level} muted={panelKey.muted} onSet={percent => conn.send({ t: 'volume', widgetId: panelKey.id, percent })} onMute={mute => conn.send({ t: 'volume', widgetId: panelKey.id, mute })} onClose={() => setPanel(null)} />}
      {panelKey?.panel === 'bluetooth' && <BluetoothPanel bt={panelKey.bluetooth} onPower={power => conn.send({ t: 'bluetooth', widgetId: panelKey.id, power })} onDevice={(device, connect) => conn.send({ t: 'bluetooth', widgetId: panelKey.id, device, connect })} onClose={() => setPanel(null)} />}
      {sheet && <Sheet view={view} conn={conn} name={name} onRename={onRename} dimAfter={dimAfter} onDimAfter={onDimAfter} onClose={() => setSheet(false)} />}
    </div>
  );
}

const DIM_LABEL: Record<number, string> = { 0: 'Never', 30000: '30 s', 60000: '1 min', 300000: '5 min' };

function Sheet({ view, conn, name, onRename, dimAfter, onDimAfter, onClose }: { view: DeckView; conn: Connection; name: string; onRename(n: string): void; dimAfter: number; onDimAfter(ms: number): void; onClose(): void }) {
  const [draft, setDraft] = useState(name);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <section class="sheet" role="dialog" aria-label="Deck settings" onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        {view.profiles.length > 1 && <>
          <h2 class="sheet-h">Profile</h2>
          <div class="chips">
            {view.profiles.map(p => (
              <button key={p.id} type="button" class={p.id === view.profileId ? 'chip on' : 'chip'} aria-pressed={p.id === view.profileId}
                onClick={() => { conn.send({ t: 'profile', profileId: p.id }); onClose(); }}>{p.name}</button>
            ))}
          </div>
        </>}
        <h2 class="sheet-h">Dim the screen when idle</h2>
        <div class="chips" role="radiogroup" aria-label="Dim the screen when idle">
          {DIM_CHOICES.map(ms => (
            <button key={ms} type="button" role="radio" aria-checked={ms === dimAfter} class={ms === dimAfter ? 'chip on' : 'chip'} onClick={() => onDimAfter(ms)}>{DIM_LABEL[ms]}</button>
          ))}
        </div>
        <h2 class="sheet-h">This device</h2>
        <input class="input" value={draft} maxLength={40} onInput={e => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => { const n = draft.trim(); if (n && n !== name) onRename(n); }} />
        <div class="sheet-row">
          <button type="button" class="btn" onClick={toggleFullscreen}><Icon name="arrows-out" size={18} />Fullscreen</button>
          <button type="button" class="btn primary" onClick={onClose}>Done</button>
        </div>
        <p class="hint">Connected to {location.host}</p>
      </section>
    </div>
  );
}

/** Asks before a key that turns the PC off, locks it and the like. Closes by itself if nobody answers. */
function Confirm({ w, onCancel, onConfirm }: { w: WidgetView; onCancel(): void; onConfirm(): void }) {
  useEffect(() => { const t = setTimeout(onCancel, 6000); return () => clearTimeout(t); }, [w.id]);
  // The tap that opened this card ends over the backdrop; ignore backdrop taps for a moment so it cannot cancel itself.
  const opened = useMemo(() => Date.now(), [w.id]);
  const label = w.look.label || 'Run this';
  return (
    <div class="sheet-backdrop confirm-backdrop" onClick={() => { if (Date.now() - opened > 500) onCancel(); }}>
      <section class="confirm" role="alertdialog" aria-label={`${label}?`} onClick={e => e.stopPropagation()}>
        <div class="confirm-icon" style={{ background: w.look.bg, color: w.look.fg }}><Icon name={w.look.icon ?? 'warning'} size={26} /></div>
        <h2 class="confirm-title">{label}?</h2>
        <p class="confirm-text">{w.confirm}</p>
        <div class="sheet-row">
          <button type="button" class="btn" onClick={onCancel}>Cancel</button>
          <button type="button" class="btn danger" onClick={onConfirm}>{label}</button>
        </div>
      </section>
    </div>
  );
}
