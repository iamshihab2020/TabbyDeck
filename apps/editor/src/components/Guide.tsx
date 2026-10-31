import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { Icon, Mark } from '@tabbydeck/ui';
import { useApi, useSnapshot } from '../state.ts';
import { ConnectPanel } from './Connect.tsx';
import { ApproveModal, type PendingDevice } from './ApproveModal.tsx';
import { TEMPLATES } from '@tabbydeck/shared/templates';

/** First run: connect a device (or skip), pick ready-made decks, then an optional tour. Ends by saving guideDone, so it shows once. */
export function Guide({ onTour }: { onTour(): void }) {
  const api = useApi();
  const { state } = useSnapshot();
  const [step, setStep] = useState<'connect' | 'decks' | 'tour'>('connect');
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const addDecks = async () => {
    setAdding(true);
    for (const id of picked) await api.cmd('profile.template', { id }).catch(() => {});
    setAdding(false); setStep('tour');
  };
  const [approving, setApproving] = useState<PendingDevice | null>(null);
  const s = state!;
  const connected = s.devices.find(d => d.approved && !d.blocked);
  const finish = (tour: boolean) => { void api.cmd('settings.update', { patch: { guideDone: true } }).catch(() => {}); if (tour) onTour(); };

  return (
    <div class="modal-backdrop guide-backdrop">
      <section class="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <header class="guide-head">
          <Mark size={34} />
          <div>
            <h1 id="guide-title" class="guide-title">{step === 'connect' ? 'Welcome to TabbyDeck' : step === 'decks' ? 'Pick ready-made decks' : connected ? 'You are connected' : 'Take a quick look around'}</h1>
            <p class="muted">Your phone or tablet becomes a deck of buttons for this PC.</p>
          </div>
          <ol class="guide-steps" aria-label="Setup steps">
            <li class={step === 'connect' ? 'on' : 'done'}><span>{step === 'connect' ? '1' : <Icon name="check" size={12} />}</span>Connect a device</li>
            <li class={step === 'decks' ? 'on' : step === 'tour' ? 'done' : ''}><span>{step === 'tour' ? <Icon name="check" size={12} /> : '2'}</span>Pick decks</li>
            <li class={step === 'tour' ? 'on' : ''}><span>3</span>Learn the editor</li>
          </ol>
        </header>

        {step === 'connect' ? <>
          {connected
            ? <div class="guide-done"><Icon name="check-circle" size={28} /><div><b>{connected.name} is connected.</b><span class="muted">Everything you build here shows on it straight away.</span></div></div>
            : <>
              <ConnectPanel />
              <ol class="guide-how">
                <li>On your phone or tablet, scan the code with the camera, or type the address into Chrome on Android or Safari on iPhone and iPad.</li>
                <li>It shows a 6-digit code. TabbyDeck asks you for it here.</li>
                <li>Type the code and choose Allow. That device can now use your deck.</li>
              </ol>
              {s.pending.map(p => (
                <div key={p.deviceId} class="guide-pending">
                  <Icon name="device-mobile" size={20} />
                  <span><b>{p.name}</b> wants to connect</span>
                  <button type="button" class="btn primary" onClick={() => setApproving(p)}>Type its code</button>
                </div>
              ))}
              {!s.pending.length && <p class="guide-wait"><span class="guide-dot" aria-hidden="true" />Waiting for a device…</p>}
              <p class="muted small">Not connecting? Both devices must be on the same Wi-Fi. If Windows asked about the firewall, allow TabbyDeck, or run “Allow phones to connect” in the TabbyDeck folder.</p>
            </>}
          <div class="modal-actions guide-actions">
            {!connected && <button type="button" class="btn ghost" onClick={() => setStep('decks')}>Skip for now</button>}
            <button type="button" class="btn primary" disabled={!connected} onClick={() => setStep('decks')}>Next</button>
          </div>
        </> : step === 'decks' ? <>
          <p class="modal-text">Each one is added as its own profile; swipe the keys on your phone to move between them. Keys for apps this PC does not have stay hidden. You can delete any of them later.</p>
          <div class="template-list">
            {TEMPLATES.map(t => {
              const on = picked.includes(t.id);
              return (
                <button key={t.id} type="button" class="template" aria-pressed={on} onClick={() => setPicked(on ? picked.filter(x => x !== t.id) : [...picked, t.id])}>
                  <Icon name={on ? 'check-circle' : t.icon} size={22} /><span><b>{t.name}</b><span class="muted">{t.description}</span></span>
                </button>
              );
            })}
          </div>
          <div class="modal-actions guide-actions">
            <button type="button" class="btn ghost" onClick={() => setStep('tour')}>Not now</button>
            <button type="button" class="btn primary" disabled={!picked.length || adding} onClick={addDecks}>{adding ? 'Adding…' : picked.length > 1 ? `Add ${picked.length} decks` : 'Add deck'}</button>
          </div>
        </> : <>
          <p class="modal-text">{connected
            ? 'Now a one-minute tour of the editor: adding buttons and apps, changing the grid, and making a button do what you want.'
            : 'You can connect a device any time from Devices; TabbyDeck will remind you until one is connected. Meanwhile, here is how the editor works.'}</p>
          <div class="modal-actions guide-actions">
            <button type="button" class="btn ghost" onClick={() => finish(false)}>I will explore myself</button>
            <button type="button" class="btn primary" onClick={() => finish(true)}>Show me around</button>
          </div>
        </>}
      </section>
      {approving && <ApproveModal device={approving} onClose={() => setApproving(null)} />}
    </div>
  );
}

interface TourStep { target: string; title: string; text: string; fallback?: string }

// Each step points at a part of the Deck page. A step whose part is missing (a full grid, no buttons yet) uses its
// fallback target and says so in its text.
const STEPS: TourStep[] = [
  { target: '.slot', fallback: '.canvas-grid', title: 'Add a button', text: 'Click any empty cell. Choose a ready-made button, or open Apps on this PC to add any installed app with its own icon.' },
  { target: '.stand-size', title: 'Columns and rows', text: 'Make the grid bigger or smaller here, under the deck. Spacing sets the space between buttons. The tablet follows at once.' },
  { target: '.canvas-tile', fallback: '.canvas-grid', title: 'Move and resize', text: 'Drag a button to move it; the others make room. Drag its corner to make it bigger. Right-click for copy, duplicate and delete.' },
  { target: '.inspector', title: 'Look and actions', text: 'Select a button to change it here. Look sets the label, icon and colours. Actions sets what happens on press, hold or double tap, and Try it now runs it on this PC.' },
  { target: '.tree', title: 'Profiles and folders', text: 'Keep separate decks, for example Work and Games, and folders that open more buttons.' },
  { target: '.rail-btn[title="Devices"]', title: 'Devices', text: 'Connect more phones and tablets, rename them, and choose which profile each one opens.' },
  { target: '.rail-btn[title="Settings"]', title: 'Settings', text: 'Start TabbyDeck with Windows, save a backup, and open this guide again whenever you like.' },
];

/** A spotlight over one part of the editor at a time, with a card that explains it. */
export function Tour({ onDone }: { onDone(): void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];
  useLayoutEffect(() => {
    const find = () => {
      const el = document.querySelector(step.target) ?? (step.fallback ? document.querySelector(step.fallback) : null);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    window.addEventListener('resize', find);
    return () => window.removeEventListener('resize', find);
  }, [i]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); if (e.key === 'ArrowRight' || e.key === 'Enter') next(); if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1)); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const next = () => (i === STEPS.length - 1 ? onDone() : setI(i + 1));

  // The card sits beside the spotlight, on whichever side has room, and stays on screen.
  const W = 320, pad = 14;
  let left = 24, top = 24;
  if (rect) {
    const right = rect.right + pad + W < innerWidth;
    left = right ? rect.right + pad : rect.left - pad - W >= 0 ? rect.left - pad - W : Math.max(16, Math.min(innerWidth - W - 16, rect.left));
    top = right || rect.left - pad - W >= 0 ? rect.top : rect.bottom + pad;
    top = Math.max(16, Math.min(innerHeight - 220, top));
  }
  return (
    <div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? <div class="tour-spot" style={{ left: `${rect.left - 6}px`, top: `${rect.top - 6}px`, width: `${rect.width + 12}px`, height: `${rect.height + 12}px` }} />
        : <div class="tour-dim" />}
      <div class="tour-card" key={i} style={{ left: `${left}px`, top: `${top}px`, width: `${W}px` }}>
        <span class="tour-count">{i + 1} of {STEPS.length}</span>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div class="tour-actions">
          <button type="button" class="btn ghost" onClick={onDone}>Skip tour</button>
          <span class="tour-gap" />
          {i > 0 && <button type="button" class="btn" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" class="btn primary" onClick={next} autoFocus>{i === STEPS.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

/** Until a device is connected, a strip at the top of every page says so, with the way to fix it. */
export function ConnectReminder({ onConnect }: { onConnect(): void }) {
  const { state } = useSnapshot();
  if (state!.devices.some(d => d.approved && !d.blocked)) return null;
  return (
    <div class="banner remind" role="status">
      <Icon name="device-mobile" size={18} />
      <span>No phone or tablet is connected yet. Connect one to use your deck.</span>
      <button type="button" class="btn primary small" onClick={onConnect}>Connect a device</button>
    </div>
  );
}
