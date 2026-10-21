import { Icon } from '@tabbydeck/ui';
import type { ConnState } from './connection.ts';

/** Full-screen states that sit over the deck (or over the pairing screen for terminal states). */
export function Overlay({ state, hasDeck, onRetry }: { state: ConnState; hasDeck: boolean; onRetry(): void }) {
  let body: { icon: string; title: string; action?: string } | null = null;
  if (state === 'denied') body = { icon: 'x-circle', title: 'The host declined this device', action: 'Try again' };
  else if (state === 'blocked') body = { icon: 'prohibit', title: 'This device was blocked by the host' };
  else if (state === 'timeout') body = { icon: 'hourglass', title: 'No answer from the host', action: 'Try again' };
  else if (hasDeck && state === 'closed') body = { icon: 'wifi-slash', title: 'Lost the host. Reconnecting…', action: 'Retry now' };
  else if (hasDeck && state === 'connecting') body = { icon: 'arrows-clockwise', title: 'Connecting…' };
  if (!body) return null;
  return (
    <div class={hasDeck ? 'overlay over-deck' : 'overlay'} role="alertdialog" aria-live="assertive" aria-label={body.title}>
      <div class="overlay-card">
        <Icon name={body.icon} size={32} class="overlay-icon" />
        <p class="overlay-title">{body.title}</p>
        {body.action && <button type="button" class="btn primary" onClick={onRetry}>{body.action}</button>}
      </div>
    </div>
  );
}
