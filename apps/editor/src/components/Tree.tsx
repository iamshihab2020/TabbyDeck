import { useState } from 'preact/hooks';
import type { Folder, ProfileFile } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi } from '../state.ts';
import { Modal } from './Modal.tsx';
import { toast } from './Toast.tsx';

export interface Selection { profileId: string; folderId: string }

/** Profiles and their nested folders. Select to edit; rename by double-click; add and remove from the row's buttons. */
export function Tree({ profiles, sel, onSelect }: { profiles: ProfileFile[]; sel: Selection; onSelect(s: Selection): void }) {
  const api = useApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'profile' | 'folder'; id: string; name: string; count: number } | null>(null);

  const rename = async (kind: 'profile' | 'folder', id: string, name: string) => {
    setEditing(null);
    if (!name.trim()) return;
    if (kind === 'profile') await api.cmd('profile.update', { id, patch: { name: name.trim() } }).catch(() => {});
    else await api.cmd('folder.update', { id, name: name.trim() }).catch(() => {});
  };
  const addProfile = async () => {
    const r = await api.cmd<{ id: string }>('profile.create', { name: `Profile ${profiles.length + 1}`, cols: 8, rows: 4 }).catch(() => null);
    if (r) { onSelect({ profileId: r.id, folderId: '' }); setEditing(r.id); }
  };
  const addFolder = async (f: ProfileFile, parentId: string) => {
    const r = await api.cmd<{ id: string }>('folder.create', { profileId: f.profile.id, parentId, name: 'New folder' }).catch(() => null);
    if (r) { onSelect({ profileId: f.profile.id, folderId: r.id }); setEditing(r.id); toast('Folder added. Add a folder button on the deck to open it.', 'info'); }
  };
  const remove = async () => {
    if (!confirm) return;
    const c = confirm; setConfirm(null);
    if (c.kind === 'profile') await api.cmd('profile.delete', { id: c.id }).catch(() => {});
    else await api.cmd('folder.delete', { id: c.id }).catch(() => {});
    if (c.id === sel.profileId || c.id === sel.folderId) onSelect({ profileId: profiles[0].profile.id, folderId: '' });
  };

  const name = (id: string, value: string, kind: 'profile' | 'folder') => editing === id
    ? <input class="tree-input" value={value} maxLength={40} autoFocus onBlur={e => rename(kind, id, (e.target as HTMLInputElement).value)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
    : <span class="tree-name" onDblClick={() => setEditing(id)}>{value}</span>;

  const folderRows = (f: ProfileFile, parentId: string, depth: number): preact.JSX.Element[] =>
    f.folders.filter(d => d.parentId === parentId).flatMap((d: Folder) => [
      <div key={d.id} class={sel.folderId === d.id ? 'tree-row on' : 'tree-row'} style={{ paddingLeft: `${12 + depth * 16}px` }}>
        <button type="button" class="tree-hit" onClick={() => onSelect({ profileId: f.profile.id, folderId: d.id })} aria-label={`Open folder ${d.name}`}>
          <Icon name="folder-simple" size={16} />
        </button>
        {name(d.id, d.name, 'folder')}
        <span class="tree-actions">
          <button type="button" class="icon-btn tiny" title="Add a folder inside" onClick={() => addFolder(f, d.id)}><Icon name="folder-plus" size={15} /></button>
          <button type="button" class="icon-btn tiny" title="Delete folder" onClick={() => setConfirm({ kind: 'folder', id: d.id, name: d.name, count: f.widgets.filter(w => w.folderId === d.id).length })}><Icon name="trash" size={15} /></button>
        </span>
      </div>,
      ...folderRows(f, d.id, depth + 1),
    ]);

  return (
    <aside class="tree" aria-label="Profiles and folders">
      <div class="tree-head">
        <h2>Profiles</h2>
        <button type="button" class="icon-btn" title="New profile" onClick={addProfile}><Icon name="plus" size={18} /></button>
      </div>
      <div class="tree-body">
        {profiles.map(f => {
          const root = f.profile.rootFolderId;
          const active = sel.profileId === f.profile.id;
          return (
            <div key={f.profile.id} class="tree-group">
              <div class={active && (sel.folderId === root || !sel.folderId) ? 'tree-row profile on' : 'tree-row profile'}>
                <button type="button" class="tree-hit" onClick={() => onSelect({ profileId: f.profile.id, folderId: root })} aria-label={`Open profile ${f.profile.name}`}>
                  <Icon name="squares-four" size={16} />
                </button>
                {name(f.profile.id, f.profile.name, 'profile')}
                <span class="tree-meta">{f.widgets.length}</span>
                <span class="tree-actions">
                  <button type="button" class="icon-btn tiny" title="Add a folder" onClick={() => addFolder(f, root)}><Icon name="folder-plus" size={15} /></button>
                  <button type="button" class="icon-btn tiny" title="Delete profile" disabled={profiles.length === 1} onClick={() => setConfirm({ kind: 'profile', id: f.profile.id, name: f.profile.name, count: f.widgets.length })}><Icon name="trash" size={15} /></button>
                </span>
              </div>
              {folderRows(f, root, 1)}
            </div>
          );
        })}
      </div>
      {confirm && (
        <Modal title={`Delete ${confirm.name}?`} onClose={() => setConfirm(null)}>
          <p class="modal-text">{confirm.count ? `Its ${confirm.count} button${confirm.count === 1 ? '' : 's'} and any folders inside will be deleted too.` : 'This cannot be undone.'}</p>
          <div class="modal-actions">
            <button type="button" class="btn" onClick={() => setConfirm(null)}>Keep it</button>
            <button type="button" class="btn danger" onClick={remove}>Delete {confirm.kind}</button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
