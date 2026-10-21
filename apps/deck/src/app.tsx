import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DeckView, HostMsg } from '@tabbydeck/shared';
import { SpriteDefs } from '@tabbydeck/ui';
import { browserKV, loadDevice, saveDevice } from './device.ts';
import { createConnection, type ConnState, type Connection } from './connection.ts';
import { Pair } from './screens/Pair.tsx';
import { DeckScreen } from './screens/Deck.tsx';
import { Overlay } from './overlays.tsx';
import { keepAwake } from './wake.ts';
import { toggleFullscreen } from './fullscreen.ts';
import { createIdleDimmer, loadDimAfter, saveDimAfter } from './idle.ts';

const VERSION = '0.1.0';

export function App() {
  const kv = useMemo(browserKV, []);
  const [state, setState] = useState<ConnState>('connecting');
  const [code, setCode] = useState<string | null>(null);
  const [view, setView] = useState<DeckView | null>(null);
  const [name, setName] = useState(() => loadDevice(kv).name);
  const [flash, setFlash] = useState<{ id: string; kind: 'error' | 'ok'; n: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [conn, setConn] = useState<Connection | null>(null);
  const [dimAfter, setDimAfter] = useState(() => loadDimAfter(kv));
  const [dimmed, setDimmed] = useState(false);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const c = createConnection(`${proto}//${location.host}/ws`, kv, {
      onState: s => { setState(s); if (s === 'open') setCode(null); },
      onDeck: v => setView(v),
      onPatch: (m: Extract<HostMsg, { t: 'patch' }>) => {
        if (m.flash) setFlash({ id: m.widgetId, kind: m.flash, n: Date.now() });
        const { look, value, active, disabled, screens, level, muted, bluetooth } = m;
        const live = { value, active, disabled, screens, level, muted, bluetooth };
        for (const k of Object.keys(live) as (keyof typeof live)[]) if (live[k] === undefined) delete live[k];
        if (look || Object.keys(live).length) setView(v => v && { ...v, widgets: v.widgets.map(w => w.id === m.widgetId ? { ...w, look: { ...w.look, ...look }, ...live } : w) });
      },
      onNotify: m => { setToast(m.text); if (m.vibrate && navigator.vibrate) navigator.vibrate(30); },
      onPairRequired: c2 => setCode(c2),
    }, { WebSocket, caps: { vibrate: 'vibrate' in navigator, wakeLock: 'wakeLock' in navigator }, version: VERSION });
    setConn(c);
    const stopWake = keepAwake();
    return () => { c.close(); stopWake(); };
  }, [kv]);

  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 500); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const rename = (n: string) => { const d = loadDevice(kv); saveDevice(kv, { ...d, name: n }); setName(n); conn?.rehello(); };
  const showDeck = !!view && (state === 'open' || state === 'closed' || state === 'connecting');

  // Dim the deck after a while without touches. The touch that wakes it lands on the veil, so it presses nothing.
  useEffect(() => {
    if (!showDeck) return;
    const d = createIdleDimmer(dimAfter, setDimmed);
    const touch = () => d.touch();
    document.addEventListener('pointerdown', touch, true);
    return () => { d.stop(); document.removeEventListener('pointerdown', touch, true); setDimmed(false); };
  }, [dimAfter, showDeck]);
  const chooseDim = (ms: number) => { saveDimAfter(kv, ms); setDimAfter(ms); };

  return (
    <>
      <SpriteDefs />
      {showDeck
        ? <DeckScreen view={view!} conn={conn!} flash={flash} name={name} onRename={rename} dimAfter={dimAfter} onDimAfter={chooseDim} />
        : <Pair state={state} code={code} name={name} onRename={rename} onFullscreen={toggleFullscreen} />}
      <Overlay state={state} hasDeck={!!view} onRetry={() => conn?.retry()} />
      {toast && <div class="toast" role="status">{toast}</div>}
      {dimmed && showDeck && <div class="dim-veil" aria-hidden="true" onPointerDown={e => e.preventDefault()} />}
    </>
  );
}
