import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DeckView, TriggerKind, WidgetView } from '@tabbydeck/shared';
import { flowLayout } from '@tabbydeck/shared/layout'; // the subpath keeps zod out of the client bundle
import { Grid, Icon, gridCellSize } from '@tabbydeck/ui';
import type { Connection } from '../connection.ts';
import { createPressTracker } from '../press.ts';
import { canFullscreen, fromHomeScreen, isFullscreen, isIOS, toggleFullscreen } from '../fullscreen.ts';
import { DIM_CHOICES } from '../idle.ts';
import { BluetoothPanel, BrightnessPanel, VolumePanel } from './Brightness.tsx';
import { TrackpadPanel } from './Trackpad.tsx';
import { Cat, catSize, type Mood } from './Cat.tsx';
import { WeekCard } from './Week.tsx';
import type { StatsSummary } from '@tabbydeck/shared';
import { SWIPE_START, profileAfterSwipe, swipeDir } from '../swipe.ts';

export interface DeckProps {
  view: DeckView;
  conn: Connection;
  flash: { id: string; kind: 'error' | 'ok' } | null;
  name: string;
  onRename(name: string): void;
  dimAfter: number;
  onDimAfter(ms: number): void;
  /** What the PC is doing, for the cat's outfit. Whether it shows, and its name, come with the view. */
  mood: Mood;
  /** The "Your week" card's numbers, once the PC has sent them; onAskStats asks again. */
  stats: StatsSummary | null;
  onAskStats(): void;
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

export function DeckScreen({ view, conn, flash, name, onRename, dimAfter, onDimAfter, mood, stats, onAskStats }: DeckProps) {
  const cat = view.cat?.on !== false, catName = view.cat?.name || 'Tabby';
  const [week, setWeek] = useState(false);
  // Where a finger last touched empty space: the cat runs there.
  const [chase, setChase] = useState<{ x: number; n: number } | null>(null);
  const chaseTo = (e: PointerEvent) => { if (cat && !(e.target as Element).closest('.tb-tile, button')) setChase(c => ({ x: e.clientX, n: (c?.n ?? 0) + 1 })); };
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
  const padSend = useMemo(() => (m: Parameters<Parameters<typeof TrackpadPanel>[0]['onSend']>[0]) => { if (panel) conn.send({ t: 'pointer', widgetId: panel, ...m }); }, [conn, panel]);
  const inFolder = view.path.length > 1;
  // A swipe can go back or to another profile, so keys wait for the finger to lift (as when scrolling).
  const swipes = inFolder || view.profiles.length > 1;
  const lift = scroll || swipes;
  const [slide, setSlide] = useState(''); // which side the new profile's keys come in from

  const send = (widgetId: string, kind: TriggerKind) => conn.send({ t: 'press', widgetId, kind });
  const trackers = useMemo(() => new Map<string, ReturnType<typeof createPressTracker>>(), [view.folderId, lift]);
  const tracker = (w: WidgetView) => {
    const id = w.id;
    let t = trackers.get(id);
    if (!t) {
      // Level keys (Volume +) keep going while held: 400 ms, then a step every 150 ms. While scrolling, keys fire on lift.
      // A key with a warning and its own hold (Screen off): a tap asks first, holding runs the hold at once.
      const onPress = () => { if (lift && navigator.vibrate) navigator.vibrate(10); if (w.confirm && w.hold) setAsk(w); else send(id, 'press'); };
      t = createPressTracker({ onPress, onLong: () => send(id, 'long'), onDouble: () => send(id, 'double'), onRelease: () => send(id, 'release') },
        { ...(w.repeat ? { longMs: 400, doubleMs: 300, repeatMs: 150 } : { longMs: 500, doubleMs: 300 }), tap: lift, holdOnly: !!w.hold });
      trackers.set(id, t);
    }
    return t;
  };
  const back = () => conn.send({ t: 'open', folderId: null });

  // Swipe the keys: in a folder, right goes back; at the top, left and right go to the next and previous profile.
  // Only the key area listens, so dragging a slider in the volume or brightness panel never switches.
  useEffect(() => {
    const el = area.current; if (!el) return;
    let x0 = 0, y0 = 0, one = false;
    const s = (e: TouchEvent) => { one = e.touches.length === 1; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
    // A finger that moves is swiping or dragging, not tapping: the key it started on never fires, and no key it
    // passes over or lifts on fires either (keys only fire for a touch that started and ended on them).
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (tap.current && Math.max(Math.abs(t.clientX - x0), Math.abs(t.clientY - y0)) > SWIPE_START) {
        trackers.get(tap.current)?.cancel(); tap.current = null; setPressed(null);
      }
    };
    const end = (e: TouchEvent) => {
      if (!one || !swipes) return; one = false;
      const t = e.changedTouches[0], dir = swipeDir(t.clientX - x0, t.clientY - y0);
      if (!dir) return;
      if (inFolder) { if (dir === 1) back(); return; }
      const to = profileAfterSwipe(view.profiles.map(p => p.id), view.profileId, dir);
      if (to) { setSlide(dir < 0 ? 'from-right' : 'from-left'); conn.send({ t: 'profile', profileId: to }); }
    };
    el.addEventListener('touchstart', s, { passive: true }); el.addEventListener('touchmove', move, { passive: true }); el.addEventListener('touchend', end, { passive: true });
    return () => { el.removeEventListener('touchstart', s); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); };
  }, [swipes, inFolder, view.folderId, view.profileId, view.profiles, trackers]);
  // The slide only shapes how the new keys arrive; drop it afterwards so a folder opens with the usual rise.
  useEffect(() => { if (!slide) return; const t = setTimeout(() => setSlide(''), 1000); return () => clearTimeout(t); }, [slide, view.profileId]);

  const bar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const barDown = () => { bar.current = setTimeout(() => setSheet(true), 600); };
  const barUp = () => clearTimeout(bar.current);

  return (
    <div class={cat ? 'deck with-cat' : 'deck'} style={{ background: view.bg }}>
      <header class="deck-bar" onPointerDown={barDown} onPointerUp={barUp} onPointerLeave={barUp}>
        <span class="bar-side">
          {inFolder && <button type="button" class="bar-btn" aria-label="Back" onClick={back}><Icon name="caret-left" size={22} /></button>}
        </span>
        <nav class="crumbs" aria-label="Folder path">
          {view.path.map((p, i) => <span key={p.id} class={i === view.path.length - 1 ? 'crumb current' : 'crumb'}>{i === 0 ? view.profileName : p.name}</span>)}
          {!inFolder && view.profiles.length > 1 && <span class="dots" aria-hidden="true">{view.profiles.map(p => <i key={p.id} class={p.id === view.profileId ? 'on' : ''} />)}</span>}
        </nav>
        <span class="bar-side end">
          {!fromHomeScreen() && canFullscreen() && <button type="button" class="bar-btn" aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}><Icon name={full ? 'arrows-in' : 'arrows-out'} size={20} /></button>}
          <button type="button" class="bar-btn" aria-label="Settings" onClick={() => setSheet(true)}><Icon name="gear-six" size={20} /></button>
        </span>
      </header>

      <div class={`deck-area${scroll ? ' scroll' : ''}${slide ? ` ${slide}` : ''}`} ref={area} onPointerDown={chaseTo}>
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
                if (lift) { tap.current = w.id; if (!w.panel && !(w.confirm && !w.hold)) tracker(w).down(); return; } // the touch may still turn into a scroll or swipe
                el.setPointerCapture?.(e.pointerId); if (navigator.vibrate) navigator.vibrate(10);
                if (w.panel) setPanel(w.id); else if (w.confirm && !w.hold) setAsk(w); else tracker(w).down();
              },
              onPointerUp: () => {
                setPressed(null);
                if (lift && tap.current === w.id && (w.panel || (w.confirm && !w.hold))) { tap.current = null; if (w.panel) setPanel(w.id); else setAsk(w); return; }
                if (tap.current && tap.current !== w.id) trackers.get(tap.current)?.cancel(); // lifted on another key
                tap.current = null; tracker(w).up();
              },
              onPointerCancel: () => { setPressed(null); tap.current = null; tracker(w).cancel(); },
              onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (w.disabled) return; if (w.panel) setPanel(w.id); else if (w.confirm) setAsk(w); else { send(w.id, 'press'); send(w.id, 'release'); } } },
            })} />}
      </div>

      {cat && <div onPointerDown={chaseTo}><Cat mood={mood} chase={chase} size={catSize(Math.min(innerWidth, innerHeight))} name={catName} /></div>}

      {ask && <Confirm w={ask} onCancel={() => setAsk(null)} onConfirm={() => { send(ask.id, 'press'); send(ask.id, 'release'); setAsk(null); }} />}
      {panelKey?.panel === 'brightness' && <BrightnessPanel screens={panelKey.screens} onSet={(screen, percent) => conn.send({ t: 'brightness', widgetId: panelKey.id, screen, percent })} onClose={() => setPanel(null)} />}
      {panelKey?.panel === 'volume' && <VolumePanel level={panelKey.level} muted={panelKey.muted} apps={panelKey.apps} outputs={panelKey.outputs}
        onSet={percent => conn.send({ t: 'volume', widgetId: panelKey.id, percent })} onMute={mute => conn.send({ t: 'volume', widgetId: panelKey.id, mute })}
        onApp={(app, c) => conn.send({ t: 'volume', widgetId: panelKey.id, app, ...c })} onOutput={output => conn.send({ t: 'volume', widgetId: panelKey.id, output })}
        onClose={() => setPanel(null)} />}
      {panelKey?.panel === 'bluetooth' && <BluetoothPanel bt={panelKey.bluetooth} onPower={power => conn.send({ t: 'bluetooth', widgetId: panelKey.id, power })} onDevice={(device, connect) => conn.send({ t: 'bluetooth', widgetId: panelKey.id, device, connect })} onClose={() => setPanel(null)} />}
      {panelKey?.panel === 'trackpad' && <TrackpadPanel onSend={padSend} onClose={() => setPanel(null)} />}
      {sheet && <Sheet view={view} conn={conn} name={name} onRename={onRename} dimAfter={dimAfter} onDimAfter={onDimAfter} onWeek={() => { setSheet(false); onAskStats(); setWeek(true); }} onClose={() => setSheet(false)} />}
      {week && <WeekCard stats={stats} onClose={() => setWeek(false)} />}
    </div>
  );
}

const DIM_LABEL: Record<number, string> = { 0: 'Never', 30000: '30 s', 60000: '1 min', 300000: '5 min' };

function Sheet({ view, conn, name, onRename, dimAfter, onDimAfter, onWeek, onClose }: { view: DeckView; conn: Connection; name: string; onRename(n: string): void; dimAfter: number; onDimAfter(ms: number): void; onWeek(): void; onClose(): void }) {
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
        <button type="button" class="btn week-btn" onClick={onWeek}><Icon name="chart-bar" size={18} />Your week</button>
        <h2 class="sheet-h">Dim the screen when idle</h2>
        <div class="chips" role="radiogroup" aria-label="Dim the screen when idle">
          {DIM_CHOICES.map(ms => (
            <button key={ms} type="button" role="radio" aria-checked={ms === dimAfter} class={ms === dimAfter ? 'chip on' : 'chip'} onClick={() => onDimAfter(ms)}>{DIM_LABEL[ms]}</button>
          ))}
        </div>
        <p class="hint">Name the cat or turn it off in TabbyDeck on your PC, under Customize.</p>
        <h2 class="sheet-h">This device</h2>
        <input class="input" value={draft} maxLength={40} onInput={e => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => { const n = draft.trim(); if (n && n !== name) onRename(n); }} />
        {!fromHomeScreen() && <>
          <h2 class="sheet-h">Add to your home screen</h2>
          <p class="hint">{isIOS()
            ? 'In Safari, tap Share and then Add to Home Screen. TabbyDeck then opens full screen from its own icon. The icon keeps its own storage, so pair it once more the first time you open it.'
            : 'In Chrome, tap ⋮ and then Add to Home screen. TabbyDeck then opens full screen from its own icon, and stays paired.'}</p>
        </>}
        <div class="sheet-row">
          {!fromHomeScreen() && canFullscreen() && <button type="button" class="btn" onClick={toggleFullscreen}><Icon name="arrows-out" size={18} />Fullscreen</button>}
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
