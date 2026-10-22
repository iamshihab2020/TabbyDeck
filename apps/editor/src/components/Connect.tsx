import { useState } from 'preact/hooks';
import { useApi } from '../state.ts';
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
    <>
    <div class="connect">
      {/* qrSvg emits only fixed SVG tags and numbers (the URL is encoded as modules, never as markup), so this is safe. */}
      <div class="qr" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: qrSvg(url) }} />
      <div class="connect-text">
        <h2>Connect a phone or tablet</h2>
        <p class="muted">Scan the code with the camera, or open this address in Chrome (Android) or Safari (iPhone and iPad). Both devices must be on the same Wi-Fi.</p>
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
    <Trouble url={url} />
    </>
  );
}

interface Check { network: string; category: string; firewall: 'allowed' | 'blocked' | 'missing' | 'unknown'; vpn: string[]; lastVisit: { ip: string; at: string } | null; port: number }

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(iso).toLocaleString();
};

/**
 * Why a phone cannot connect. First whether any phone has reached this PC at all (if one has, the network is fine),
 * then what this PC can check itself (firewall, VPN, which Wi-Fi), then what only the phone can fix.
 */
function Trouble({ url }: { url: string }) {
  const api = useApi();
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); void api.cmd<Check>('network.check', {}).then(setCheck, () => {}).finally(() => setBusy(false)); };
  const ip = url.replace(/^http:\/\/|:\d+\/?$/g, ''), prefix = ip.split('.').slice(0, 3).join('.') + '.';
  const fw = check?.firewall;
  return (
    <details class="trouble" onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open && !check) run(); }}>
      <summary>Phone can't connect?</summary>
      {!check ? <p class="muted">{busy ? 'Checking this PC…' : ''}</p> : <>
        <p class={check.lastVisit ? 'trouble-lead ok' : 'trouble-lead'}>
          {check.lastVisit
            ? `A device at ${check.lastVisit.ip} opened the deck ${ago(check.lastVisit.at)}. If that was your phone, it can reach this PC: reload the page on it.`
            : fw === 'allowed' && !check.vpn.length
            ? 'No phone or tablet has reached this PC yet, and this PC is ready. So the phone, or the router between them, is in the way: try the steps under On the phone.'
            : 'No phone or tablet has reached this PC yet. Fix what is marked in red below first.'}
        </p>
        <h3>On this PC</h3>
        <ul class="trouble-list">
          <li class="ok"><Icon name="wifi-high" size={16} /><span>This PC is on <b>{check.network || 'a network'}</b>{check.category ? ` (${check.category})` : ''}, at {ip}. The phone must be on the same Wi-Fi.</span></li>
          <li class={fw === 'allowed' ? 'ok' : fw === 'unknown' ? '' : 'bad'}>
            <Icon name={fw === 'allowed' ? 'shield-check' : 'shield'} size={16} />
            <span>{fw === 'allowed' ? `Windows Firewall lets phones in on ${check.category || 'this'} networks.`
              : fw === 'blocked' ? <>Windows Firewall <b>blocks</b> TabbyDeck on {check.category || 'this'} networks. Open Windows Security, then Firewall &amp; network protection, then Allow an app through firewall: find TabbyDeck and tick Private and Public.</>
              : fw === 'missing' ? <>Windows Firewall has no rule for TabbyDeck. Open the TabbyDeck folder and run <b>Allow phones to connect</b>, then choose Yes.</>
              : 'Could not read the firewall settings. If phones cannot connect, run Allow phones to connect in the TabbyDeck folder.'}</span>
          </li>
          <li class={check.vpn.length ? 'bad' : 'ok'}><Icon name="globe" size={16} />
            <span>{check.vpn.length ? <>A VPN is on: <b>{check.vpn.join(', ')}</b>. It can stop phones reaching this PC; turn it off, or allow local network access in it.</> : 'No VPN is on.'}</span>
          </li>
        </ul>
        <h3>On the phone</h3>
        <ul class="trouble-list phone">
          <li><span>Connect to the same Wi-Fi{check.network ? ` (${check.network})` : ''}, not mobile data. In its Wi-Fi details the IP address should start with <b>{prefix}</b></span></li>
          <li><span>Type <b>{url.replace(/\/$/, '')}</b> with http, not https, rather than using an old bookmark or home-screen icon.</span></li>
          <li><span>Turn off any VPN or ad blocker on the phone, Samsung's Secure Wi-Fi, and Private DNS (set it to Off or Automatic).</span></li>
          <li><span>Not a guest network. If the phone is on the same Wi-Fi and still cannot connect, the router may keep devices apart (AP or client isolation): turn that off in its settings.</span></li>
        </ul>
        <button type="button" class="btn small" disabled={busy} onClick={run}><Icon name="arrows-clockwise" size={14} />{busy ? 'Checking…' : 'Check again'}</button>
      </>}
    </details>
  );
}
