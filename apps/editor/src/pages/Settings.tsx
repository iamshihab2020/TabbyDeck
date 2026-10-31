import { useRef, useState } from 'preact/hooks';
import type { Settings } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi, useSnapshot, errorText } from '../state.ts';
import { Modal } from '../components/Modal.tsx';
import { showNews } from '../components/WhatsNew.tsx';
import { toast } from '../components/Toast.tsx';

export function SettingsPage() {
  const api = useApi();
  const { state } = useSnapshot();
  const s = state!.settings;
  const [port, setPort] = useState(String(s.port));
  const [restore, setRestore] = useState<{ data: unknown; name: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const save = (patch: Partial<Settings>, ok?: string) => api.cmd('settings.update', { patch }).then(() => { if (ok) toast(ok, 'ok'); }).catch(() => {});
  const applyPort = () => {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) { toast('Choose a port between 1024 and 65535.', 'error'); setPort(String(s.port)); return; }
    if (n !== s.port) void save({ port: n }, `Phones now connect on port ${n}. Scan the new code on the Devices page.`).then(() => setPort(String(state!.settings.port)));
  };
  const backup = async () => {
    try {
      const data = await api.cmd('export', {});
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `tabbydeck-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Backup saved to your Downloads folder', 'ok');
    } catch { /* toast shown by the api */ }
  };
  const pick = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { setRestore({ data: JSON.parse(String(r.result)), name: f.name }); } catch { toast('That file is not a TabbyDeck backup.', 'error'); } };
    r.readAsText(f);
  };
  const doRestore = async (mode: 'merge' | 'replace') => {
    const r = restore; setRestore(null); if (!r) return;
    try {
      const res = await api.cmd<{ profiles: number; widgets: number; warnings: string[] }>('import', { data: r.data, mode });
      toast(`Restored ${res.profiles} profile${res.profiles === 1 ? '' : 's'} with ${res.widgets} buttons`, 'ok');
      for (const w of res.warnings.slice(0, 3)) toast(w, 'error');
    } catch (e) { toast(errorText((e as Error).message), 'error'); }
  };

  return (
    <section class="settings-page" aria-labelledby="h-settings">
      <h1 id="h-settings">Settings</h1>

      <div class="set-group">
        <h2>Connecting devices</h2>
        <div class="set-row">
          <div><span class="set-title">Network</span><span class="set-help">Which network phones and tablets use to reach this PC.</span></div>
          <select class="input set-control" value={s.bindAddress} onChange={e => void save({ bindAddress: (e.target as HTMLSelectElement).value }, 'Network changed. Scan the new code on the Devices page.')}>
            <option value="">All networks</option>
            {state!.connect.interfaces.map(i => <option key={i.ip} value={i.ip}>{i.name} ({i.ip})</option>)}
          </select>
        </div>
        <div class="set-row">
          <div><span class="set-title">Port</span><span class="set-help">Change this only if another app already uses {s.port}.</span></div>
          <input class="input set-control narrow" inputMode="numeric" value={port} aria-label="Port"
            onInput={e => setPort((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 5))}
            onBlur={applyPort} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </div>
      </div>

      <div class="set-group">
        <h2>On this PC</h2>
        <div class="set-row">
          <div><span class="set-title">Look</span></div>
          <div class="segmented set-control" role="radiogroup" aria-label="Look">
            {(['dark', 'light'] as const).map(t => <button key={t} type="button" role="radio" aria-checked={s.theme === t} class={s.theme === t ? 'seg on' : 'seg'} onClick={() => void save({ theme: t })}>{t === 'dark' ? 'Dark' : 'Light'}</button>)}
          </div>
        </div>
        <Toggle title="Start TabbyDeck with Windows" help="TabbyDeck waits quietly in the tray until a device connects." on={s.autoStart} onChange={v => void save({ autoStart: v })} />
        <Toggle title="Open this window when TabbyDeck starts" help="Turn off to start in the tray only." on={s.openEditorOnStart} onChange={v => void save({ openEditorOnStart: v })} />
      </div>

      <div class="set-group">
        <h2>Backup</h2>
        <div class="set-row">
          <div><span class="set-title">Save a backup</span><span class="set-help">Every profile, button, action and image in one file. Device approvals are not included.</span></div>
          <button type="button" class="btn" onClick={() => void backup()}><Icon name="download-simple" size={16} />Save backup</button>
        </div>
        <div class="set-row">
          <div><span class="set-title">Restore from a backup</span><span class="set-help">Add its profiles to yours, or replace everything.</span></div>
          <button type="button" class="btn" onClick={() => file.current?.click()}><Icon name="upload-simple" size={16} />Restore</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { pick((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
        </div>
      </div>

      <div class="set-group">
        <h2>About</h2>
        <div class="set-row">
          <div>
            <span class="set-title">Guide</span>
            <span class="set-help">Connecting a device and a tour of the editor, as on the first start.</span>
          </div>
          <button type="button" class="btn" onClick={() => void save({ guideDone: false })}><Icon name="compass" size={16} />Show the guide again</button>
        </div>
        <div class="set-row">
          <div><span class="set-title">What's new</span><span class="set-help">The new things in this version of TabbyDeck.</span></div>
          <button type="button" class="btn" onClick={showNews}><Icon name="sparkle" size={16} />What's new</button>
        </div>
        <div class="set-row">
          <div><span class="set-title">TabbyDeck {state!.version}</span><span class="set-help">Your profiles, images and logs are kept in TabbyDeck's data folder.</span></div>
          <button type="button" class="btn" onClick={() => void api.cmd('editor.openDataDir', {}).catch(() => {})}><Icon name="folder-open" size={16} />Open data folder</button>
        </div>
      </div>

      {restore && (
        <Modal title={`Restore ${restore.name}?`} onClose={() => setRestore(null)}>
          <p class="modal-text">Add keeps your current profiles and adds the backup's beside them. Replace swaps your whole deck for the backup.</p>
          <div class="modal-actions">
            <button type="button" class="btn" onClick={() => setRestore(null)}>Cancel</button>
            <button type="button" class="btn danger" onClick={() => void doRestore('replace')}>Replace everything</button>
            <button type="button" class="btn primary" onClick={() => void doRestore('merge')}>Add profiles</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Toggle({ title, help, on, onChange }: { title: string; help: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <div class="set-row">
      <div><span class="set-title">{title}</span><span class="set-help">{help}</span></div>
      <button type="button" role="switch" aria-checked={on} aria-label={title} class={on ? 'switch on' : 'switch'} onClick={() => onChange(!on)}><span /></button>
    </div>
  );
}
