import { useState } from 'preact/hooks';
import { Icon, Mark } from '@tabbydeck/ui';
import type { ConnState } from '../connection.ts';

export interface PairProps {
  state: ConnState;
  code: string | null;
  name: string;
  onRename(name: string): void;
  onFullscreen(): void;
}

export function Pair({ state, code, name, onRename, onFullscreen }: PairProps) {
  const [draft, setDraft] = useState(name);
  const commit = () => { const n = draft.trim().slice(0, 40); if (n && n !== name) onRename(n); else setDraft(name); };
  const waiting = state === 'pairing' && code;
  return (
    <main class="pair">
      <header class="pair-top">
        <span class="brand"><Mark size={22} class="brand-mark" />TabbyDeck</span>
        <button type="button" class="icon-btn" aria-label="Fullscreen" onClick={onFullscreen}><Icon name="arrows-out" size={20} /></button>
      </header>

      <section class="pair-body" aria-live="polite">
        {waiting ? (
          <>
            <p class="pair-lead">Type this code in TabbyDeck on your computer</p>
            <p class="pair-code" aria-label={`Pairing code ${code!.split('').join(' ')}`}>
              {code!.split('').map((d, i) => <span key={code + i} class={i === 2 ? 'pair-key gap' : 'pair-key'} style={{ animationDelay: `${i * 55}ms` }}>{d}</span>)}
            </p>
            <p class="pair-status"><span class="live-dot" />Waiting for approval</p>
          </>
        ) : (
          <>
            <p class="pair-lead">Connecting to your computer</p>
            <p class="pair-status"><span class="live-dot" />{state === 'closed' ? 'Retrying' : 'Connecting'}</p>
          </>
        )}
      </section>

      <footer class="pair-foot">
        <label class="field">
          <span class="field-label">This device</span>
          <input value={draft} maxLength={40} autoComplete="off" spellcheck={false}
            onInput={e => setDraft((e.target as HTMLInputElement).value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </label>
        <p class="hint">Not connecting? Both devices must be on the same WiFi.</p>
      </footer>
    </main>
  );
}
