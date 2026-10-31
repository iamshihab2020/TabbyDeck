import { useState } from 'preact/hooks';
import type { Device } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi, useSnapshot } from '../state.ts';
import { ConnectPanel } from '../components/Connect.tsx';
import { ApproveModal, type PendingDevice } from '../components/ApproveModal.tsx';
import { Modal } from '../components/Modal.tsx';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function DevicesPage() {
  const api = useApi();
  const { state } = useSnapshot();
  const [approving, setApproving] = useState<PendingDevice | null>(null);
  const [forgetting, setForgetting] = useState<Device | null>(null);
  const s = state!;
  const online = new Set(s.connected.map(c => c.deviceId));
  const pendingIds = new Set(s.pending.map(p => p.deviceId));
  const known = s.devices.filter(d => d.approved || d.blocked).sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || b.lastSeen.localeCompare(a.lastSeen));

  return (
    <section class="devices-page" aria-labelledby="h-devices">
      <h1 id="h-devices">Devices</h1>
      <ConnectPanel />

      {s.pending.length > 0 && (
        <div class="dev-section">
          <h2>Waiting for you</h2>
          {s.pending.map(p => (
            <div key={p.deviceId} class="dev-row pending">
              <Icon name="device-mobile" size={22} />
              <div class="dev-main"><span class="dev-name">{p.name}</span><span class="dev-meta">{p.ip}</span></div>
              <button type="button" class="btn primary" onClick={() => setApproving(p)}>Approve</button>
              <button type="button" class="btn" onClick={() => void api.cmd('device.deny', { deviceId: p.deviceId }).catch(() => {})}>Deny</button>
            </div>
          ))}
        </div>
      )}

      <div class="dev-section">
        <h2>Your devices</h2>
        {known.length === 0 && <p class="muted">No devices yet. Scan the code above on a phone or tablet to add one.</p>}
        {known.map(d => (
          <div key={d.id} class={d.blocked ? 'dev-row blocked' : 'dev-row'}>
            <span class={online.has(d.id) ? 'dot on' : 'dot'} aria-hidden="true" />
            <div class="dev-main">
              <input class="dev-name-input" defaultValue={d.name} maxLength={40} aria-label="Device name"
                onBlur={e => { const n = (e.target as HTMLInputElement).value.trim(); if (n && n !== d.name) void api.cmd('device.update', { id: d.id, name: n }).catch(() => {}); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              <span class="dev-meta">{d.blocked ? 'Blocked' : online.has(d.id) ? 'Connected now' : `Last seen ${ago(d.lastSeen)}`}</span>
            </div>
            {!d.blocked && (
              <label class="dev-profile">
                <span class="field-label">Opens</span>
                <select class="input" value={d.profileId ?? ''} onChange={e => { const v = (e.target as HTMLSelectElement).value; void api.cmd('device.update', { id: d.id, profileId: v || null }).catch(() => {}); }}>
                  <option value="">First profile</option>
                  {s.profiles.map(p => <option key={p.profile.id} value={p.profile.id}>{p.profile.name}</option>)}
                </select>
              </label>
            )}
            {!d.blocked && s.profiles.some(p => p.profile.apps?.length) && (
              <label class="check dev-follow" title="Profiles that list apps open by themselves when one of those apps is in front">
                <input type="checkbox" checked={d.followApps !== false} onChange={e => void api.cmd('device.update', { id: d.id, followApps: (e.target as HTMLInputElement).checked }).catch(() => {})} />
                Follow apps
              </label>
            )}
            {!d.blocked && (
              <label class="check dev-follow" title="Change keys, their pictures and the background from this device's deck">
                <input type="checkbox" checked={d.edit !== false} onChange={e => void api.cmd('device.update', { id: d.id, edit: (e.target as HTMLInputElement).checked }).catch(() => {})} />
                Can edit keys
              </label>
            )}
            {!d.blocked && (
              <label class="check dev-follow" title="After an update, the deck shows what is new until it is read">
                <input type="checkbox" checked={d.news !== false} onChange={e => void api.cmd('device.update', { id: d.id, news: (e.target as HTMLInputElement).checked }).catch(() => {})} />
                What's new
              </label>
            )}
            {d.blocked
              ? <button type="button" class="btn" onClick={() => void api.cmd('device.unblock', { id: d.id }).catch(() => {})}>Unblock</button>
              : <button type="button" class="btn" onClick={() => void api.cmd('device.block', { id: d.id }).catch(() => {})}>Block</button>}
            <button type="button" class="icon-btn" title="Forget this device" onClick={() => setForgetting(d)}><Icon name="trash" size={16} /></button>
          </div>
        ))}
        {s.devices.some(d => !d.approved && !d.blocked && !pendingIds.has(d.id)) && <p class="muted small">Devices that asked to connect but were never approved are not listed.</p>}
      </div>

      {approving && <ApproveModal device={approving} onClose={() => setApproving(null)} />}
      {forgetting && (
        <Modal title={`Forget ${forgetting.name}?`} onClose={() => setForgetting(null)}>
          <p class="modal-text">It will be disconnected and must show a new code before it can use your deck again.</p>
          <div class="modal-actions">
            <button type="button" class="btn" onClick={() => setForgetting(null)}>Keep it</button>
            <button type="button" class="btn danger" onClick={() => { void api.cmd('device.forget', { id: forgetting.id }).catch(() => {}); setForgetting(null); }}>Forget device</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
