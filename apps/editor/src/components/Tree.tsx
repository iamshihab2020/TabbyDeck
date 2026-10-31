import { useState } from 'preact/hooks';
import type { Folder, ProfileFile } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi } from '../state.ts';
import { Modal } from './Modal.tsx';
import { toast } from './Toast.tsx';
import { TEMPLATES } from '@tabbydeck/shared/templates';

export interface Selection { profileId: string; folderId: string }

/** A thumbnail of the profile's main page: each key as a block of its own colour, where it sits on the grid. */
function MiniMap({ f }: { f: ProfileFile }) {
  const { cols, rows, rootFolderId, bg } = f.profile;
  return (
    <span class="minimap" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, background: bg }}>
      {f.widgets.filter(w => w.folderId === rootFolderId && w.x < cols && w.y < rows).map(w => (
        <i key={w.id} style={{ gridColumn: `${w.x + 1} / span ${Math.min(w.w, cols - w.x)}`, gridRow: `${w.y + 1} / span ${Math.min(w.h, rows - w.y)}`, background: w.look.bg }} />
      ))}
    </span>
  );
}

/** Profiles and their nested folders. Select to edit; rename by double-click; add and remove from the row's buttons. */
export function Tree({ profiles, sel, onSelect }: { profiles: ProfileFile[]; sel: Selection; onSelect(s: Selection): void }) {
  const api = useApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'profile' | 'folder'; id: string; name: string; count: number } | null>(null);
  const [adding, setAdding] = useState(false);

  const rename = async (kind: 'profile' | 'folder', id: string, name: string) => {
    setEditing(null);
    if (!name.trim()) return;
    if (kind === 'profile') await api.cmd('profile.update', { id, patch: { name: name.trim() } }).catch(() => {});
    else await api.cmd('folder.update', { id, name: name.trim() }).catch(() => {});
  };
  const addProfile = async (template?: string) => {
    setAdding(false);
    const r = await (template
      ? api.cmd<{ id: string }>('profile.template', { id: template })
      : api.cmd<{ id: string }>('profile.create', { name: `Profile ${profiles.length + 1}`, cols: 8, rows: 4 })).catch(() => null);
    if (!r) return;
    onSelect({ profileId: r.id, folderId: '' });
    if (template) toast('Deck added. Swipe the keys on your phone to reach it.', 'info'); else setEditing(r.id);
  };
  const addFolder = async (f: ProfileFile, parentId: string) => {
    const r = await api.cmd<{ id: string }>('folder.create', { profileId: f.profile.id, parentId, name: 'New folder' }).catch(() => null);
    if (r) { onSelect({ profileId: f.profile.id, folderId: r.id }); setEditing(r.id); toast('Folder added. Add a folder button on the deck to open it.', 'info'); }
  };
  // The order here is the order phones swipe through.
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= profiles.length) return;
    const ids = profiles.map(f => f.profile.id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    void api.cmd('profile.reorder', { ids }).catch(() => {});
  };
  const move = (i: number, by: -1 | 1) => reorder(i, i + by);
  // Or drag a profile row onto another: it takes that place.
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
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

  // A click anywhere on a row opens it, except on its buttons and while renaming.
  const pick = (s: Selection) => (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.tree-actions, input')) onSelect(s); };

  const folderRows = (f: ProfileFile, parentId: string, depth: number): preact.JSX.Element[] =>
    f.folders.filter(d => d.parentId === parentId).flatMap((d: Folder) => [
      <div key={d.id} class={sel.folderId === d.id ? 'tree-row on' : 'tree-row'} style={{ paddingLeft: `${12 + depth * 16}px` }} onClick={pick({ profileId: f.profile.id, folderId: d.id })}>
        <button type="button" class="tree-hit" onClick={e => { e.stopPropagation(); onSelect({ profileId: f.profile.id, folderId: d.id }); }} aria-label={`Open folder ${d.name}`}>
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
        <button type="button" class="icon-btn" title="New profile" onClick={() => setAdding(true)}><Icon name="plus" size={18} /></button>
      </div>
      <div class="tree-body">
        {profiles.map((f, i) => {
          const root = f.profile.rootFolderId;
          const active = sel.profileId === f.profile.id;
          return (
            <div key={f.profile.id} class="tree-group">
              <div class={`${active && (sel.folderId === root || !sel.folderId) ? 'tree-row profile on' : 'tree-row profile'}${over === i && dragged !== i ? ' drop' : ''}`}
                draggable={editing !== f.profile.id} title="Drag to change the order"
                onDragStart={e => { setDragged(i); e.dataTransfer?.setData('text/plain', f.profile.id); }}
                onDragOver={e => { if (dragged !== null) { e.preventDefault(); setOver(i); } }}
                onDragLeave={() => setOver(o => (o === i ? null : o))}
                onDrop={e => { e.preventDefault(); if (dragged !== null) reorder(dragged, i); setDragged(null); setOver(null); }}
                onDragEnd={() => { setDragged(null); setOver(null); }}
                onClick={pick({ profileId: f.profile.id, folderId: root })}>
                <button type="button" class="tree-hit" onClick={e => { e.stopPropagation(); onSelect({ profileId: f.profile.id, folderId: root }); }} aria-label={`Open profile ${f.profile.name}`}>
                  <MiniMap f={f} />
                </button>
                <span class="tree-card">
                  {name(f.profile.id, f.profile.name, 'profile')}
                  <span class="tree-meta">{f.profile.cols} × {f.profile.rows}, {f.widgets.length} {f.widgets.length === 1 ? 'key' : 'keys'}</span>
                </span>
                <span class="tree-actions">
                  <button type="button" class="icon-btn tiny" title="Move up" aria-label={`Move ${f.profile.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="caret-up" size={15} /></button>
                  <button type="button" class="icon-btn tiny" title="Move down" aria-label={`Move ${f.profile.name} down`} disabled={i === profiles.length - 1} onClick={() => move(i, 1)}><Icon name="caret-down" size={15} /></button>
                  <button type="button" class="icon-btn tiny" title="Add a folder" onClick={() => addFolder(f, root)}><Icon name="folder-plus" size={15} /></button>
                  <button type="button" class="icon-btn tiny" title="Delete profile" disabled={profiles.length === 1} onClick={() => setConfirm({ kind: 'profile', id: f.profile.id, name: f.profile.name, count: f.widgets.length })}><Icon name="trash" size={15} /></button>
                </span>
              </div>
              {folderRows(f, root, 1)}
            </div>
          );
        })}
      </div>
      {adding && (
        <Modal title="New profile" onClose={() => setAdding(false)} width={560}>
          <p class="modal-text">Start empty, or from a ready-made deck. Keys for apps this PC does not have stay hidden until you install them.</p>
          <div class="template-list">
            <button type="button" class="template" onClick={() => addProfile()}>
              <Icon name="squares-four" size={22} /><span><b>Empty</b><span class="muted">An 8 by 4 grid to fill yourself.</span></span>
            </button>
            {TEMPLATES.map(t => (
              <button key={t.id} type="button" class="template" onClick={() => addProfile(t.id)}>
                <Icon name={t.icon} size={22} /><span><b>{t.name}</b><span class="muted">{t.description}</span></span>
              </button>
            ))}
          </div>
        </Modal>
      )}
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
