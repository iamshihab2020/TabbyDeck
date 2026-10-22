import { useEffect, useState } from 'preact/hooks';
import type { ProfileFile } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi } from '../state.ts';
import { Modal } from './Modal.tsx';

const EXE = /^[^\/:*?"<>|]{1,60}\.exe$/i;
/** "Code" or "code.exe" -> "code.exe"; anything that cannot be a program file -> null. */
export function toExe(s: string): string | null {
  const t = s.trim().toLowerCase(); if (!t) return null;
  const e = t.endsWith('.exe') ? t : `${t}.exe`;
  return EXE.test(e) ? e : null;
}

/** The profile's apps: while one of them is in front on the PC, phones and tablets switch to this profile. */
export function FollowApps({ file }: { file: ProfileFile }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const apps = file.profile.apps ?? [];
  return (
    <>
      <button type="button" class={apps.length ? 'btn small on' : 'btn small'} title="Switch to this profile while chosen apps are in front" onClick={() => setOpen(true)}>
        <Icon name="app-window" size={14} />{apps.length ? `Follows ${apps.length === 1 ? apps[0] : `${apps.length} apps`}` : 'Follow apps'}
      </button>
      {open && <FollowAppsDialog file={file} onSave={next => void api.cmd('profile.update', { id: file.profile.id, patch: { apps: next } }).catch(() => {})} onClose={() => setOpen(false)} />}
    </>
  );
}

function FollowAppsDialog({ file, onSave, onClose }: { file: ProfileFile; onSave(apps: string[]): void; onClose(): void }) {
  const api = useApi();
  const apps = file.profile.apps ?? [];
  const [windows, setWindows] = useState<{ exe: string; title: string }[] | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { api.cmd<{ exe: string; title: string }[]>('windows.list', {}).then(setWindows, () => setWindows([])); }, []);
  const add = (exe: string | null) => { if (exe && !apps.includes(exe)) onSave([...apps, exe]); };
  const typedExe = toExe(typed);
  const others = (windows ?? []).filter(w => !apps.includes(w.exe));
  return (
    <Modal title={`Open ${file.profile.name} with apps`} onClose={onClose} width={520}>
      <p class="muted small">While one of these apps is in front on the PC, phones and tablets switch to this profile, and go back when you switch away. A profile picked on the phone stays until you pick another. Each device can turn this off on the Devices page.</p>
      {apps.length ? (
        <ul class="follow-list">
          {apps.map(a => (
            <li key={a}><Icon name="app-window" size={14} /><span>{a}</span>
              <button type="button" class="icon-btn" aria-label={`Remove ${a}`} onClick={() => onSave(apps.filter(x => x !== a))}><Icon name="x" size={14} /></button></li>
          ))}
        </ul>
      ) : <p class="follow-empty">No apps yet.</p>}
      <span class="field-label">Add an app that is open now</span>
      <div class="follow-open">
        {!windows ? <span class="muted small">Looking for open apps…</span>
          : !others.length ? <span class="muted small">No other apps are open. Open the app on the PC, or type its program file below.</span>
          : others.map(w => <button key={w.exe} type="button" class="btn small" title={w.title} onClick={() => add(w.exe)}><Icon name="plus" size={12} />{w.exe}</button>)}
      </div>
      <span class="field-label">Or type its program file</span>
      <div class="hotkey">
        <input class="input" value={typed} placeholder="code.exe" spellcheck={false} onInput={e => setTyped((e.target as HTMLInputElement).value)}
          onKeyDown={e => { if (e.key === 'Enter' && typedExe) { add(typedExe); setTyped(''); } }} />
        <button type="button" class="btn small" disabled={!typedExe} onClick={() => { add(typedExe); setTyped(''); }}>Add</button>
      </div>
      <div class="modal-actions"><button type="button" class="btn primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}
