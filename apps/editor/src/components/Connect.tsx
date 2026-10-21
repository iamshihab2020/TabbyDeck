import { useState } from 'preact/hooks';
import { Icon } from '@tabbydeck/ui';
import { useSnapshot } from '../state.ts';
import { qrSvg } from './qr.ts';
import { toast } from './Toast.tsx';

/** QR code and address for connecting a phone or tablet. When several networks exist, the best guess comes first. */
export function ConnectPanel() {
  const { state } = useSnapshot();
  const urls = state!.connect.urls;
  const [i, setI] = useState(0);
  const url = urls[Math.min(i, urls.length - 1)];
  if (!url) {
    return (
      <div class="connect empty">
        <Icon name="wifi-slash" size={28} />
        <p>This PC is not on a network a phone can reach. Connect to Wi-Fi, then come back here.</p>
      </div>
    );
  }
  const copy = () => void navigator.clipboard.writeText(url).then(() => toast('Address copied', 'ok'), () => toast('Could not copy. Select the address instead.', 'error'));
  return (
    <div class="connect">
      {/* qrSvg emits only fixed SVG tags and numbers (the URL is encoded as modules, never as markup), so this is safe. */}
      <div class="qr" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: qrSvg(url) }} />
      <div class="connect-text">
        <h2>Connect a phone or tablet</h2>
        <p class="muted">Scan the code with the camera, or open this address in Chrome. Both devices must be on the same Wi-Fi.</p>
        <div class="url-pill">
          <span class="url">{url.replace(/\/$/, '')}</span>
          <button type="button" class="icon-btn" title="Copy address" onClick={copy}><Icon name="copy" size={16} /></button>
        </div>
        {urls.length > 1 && (
          <label class="field net-pick">
            <span class="field-label">Network</span>
            <select class="input" value={String(i)} onChange={e => setI(Number((e.target as HTMLSelectElement).value))}>
              {urls.map((u, n) => <option key={u} value={String(n)}>{state!.connect.interfaces[n]?.name ?? 'Network'} ({u.replace(/^http:\/\/|:\d+\/$/g, '')})</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
