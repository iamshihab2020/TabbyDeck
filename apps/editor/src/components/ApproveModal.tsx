import { useState } from 'preact/hooks';
import { useApi } from '../state.ts';
import { Modal } from './Modal.tsx';
import { toast } from './Toast.tsx';

export interface PendingDevice { deviceId: string; name: string; ip: string }

/** Approve a device by typing the 6-digit code it shows. Three wrong codes and the host turns it away. */
export function ApproveModal({ device, onClose }: { device: PendingDevice; onClose(): void }) {
  const api = useApi();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(3);
  const [shake, setShake] = useState(0);

  const allow = async () => {
    try {
      await api.cmd('device.approve', { deviceId: device.deviceId, code });
      toast(`${device.name} can now use your deck`, 'ok');
      onClose();
    } catch (e) {
      const m = (e as Error).message;
      if (m === 'wrong_code') {
        const left = tries - 1; setTries(left); setShake(s => s + 1); setCode('');
        if (left <= 0) { toast(`${device.name} was turned away after three wrong codes`, 'error'); onClose(); }
        else setError(`That code doesn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
      } else { setError("This device stopped waiting. Ask it to connect again."); }
    }
  };
  const deny = () => void api.cmd('device.deny', { deviceId: device.deviceId }).finally(onClose);

  return (
    <Modal title={`Let ${device.name} use your deck?`} onClose={onClose}>
      <p class="modal-text">It is connecting from {device.ip}. Type the 6-digit code showing on its screen.</p>
      <form onSubmit={e => { e.preventDefault(); if (code.length === 6) void allow(); }}>
        {/* Six keys, like the phone shows. One real input sits over them, so typing, pasting and screen readers just work. */}
        <div key={shake} class={error ? 'code-keys invalid shake' : 'code-keys'}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <span key={i} aria-hidden="true" class={'code-key' + (code[i] ? ' filled' : '') + (i === code.length ? ' next' : '') + (i === 2 ? ' gap' : '')}>
              {code[i] ? <span key={code[i]} class="code-digit">{code[i]}</span> : null}
            </span>
          ))}
          <input class="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
            aria-label="Code shown on the device" value={code}
            onInput={e => { setCode((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)); setError(null); }} />
        </div>
        {error && <p class="field-error" role="alert">{error}</p>}
        <div class="modal-actions">
          <button type="button" class="btn danger" onClick={deny}>Deny</button>
          <button type="submit" class="btn primary" disabled={code.length !== 6}>Allow</button>
        </div>
      </form>
    </Modal>
  );
}
