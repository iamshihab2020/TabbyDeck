import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@tabbydeck/ui';
import { useApi, useSnapshot } from '../state.ts';
import { Tree, type Selection } from '../components/Tree.tsx';
import { Canvas } from '../components/Canvas.tsx';
import { Inspector } from '../components/Inspector.tsx';

const assetUrl = (id: string) => `/assets/u/${encodeURIComponent(id)}`;

export function DeckPage() {
  const api = useApi();
  const { state } = useSnapshot();
  const profiles = state!.profiles;
  const [sel, setSel] = useState<Selection>(() => ({ profileId: profiles[0].profile.id, folderId: profiles[0].profile.rootFolderId }));
  const [selected, setSelected] = useState<string | null>(null);

  // Keep the selection valid as the deck changes underneath (another editor window, deletes, imports).
  const file = profiles.find(p => p.profile.id === sel.profileId) ?? profiles[0];
  const folderId = file.folders.some(d => d.id === sel.folderId) ? sel.folderId : file.profile.rootFolderId;
  // A just-created button is selected before the host's update arrives, so only clear a selection that was seen and then vanished.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const here = new Set(file.widgets.filter(w => w.folderId === folderId).map(w => w.id));
    if (selected && seen.current.has(selected) && !here.has(selected)) setSelected(null);
    seen.current = here;
  }, [file, folderId, selected]);

  const path: { id: string; name: string }[] = [];
  for (let d = file.folders.find(x => x.id === folderId); d; d = d.parentId ? file.folders.find(x => x.id === d!.parentId) : undefined) path.unshift({ id: d.id, name: d.id === file.profile.rootFolderId ? file.profile.name : d.name });

  const grid = (patch: { cols?: number; rows?: number; gap?: number }) => void api.cmd('profile.update', { id: file.profile.id, patch }).catch(() => {});
  const p = file.profile;
  const widget = file.widgets.find(w => w.id === selected) ?? null;

  return (
    <div class="deck-page">
      <Tree profiles={profiles} sel={{ profileId: file.profile.id, folderId }} onSelect={s => { setSel({ profileId: s.profileId, folderId: s.folderId || (profiles.find(x => x.profile.id === s.profileId)?.profile.rootFolderId ?? '') }); setSelected(null); }} />
      <section class="workspace" aria-label="Deck">
        <header class="workspace-bar">
          <nav class="crumbs" aria-label="Folder">
            {path.length > 1 && <button type="button" class="icon-btn" title="Back" onClick={() => setSel({ profileId: file.profile.id, folderId: path[path.length - 2].id })}><Icon name="caret-left" size={18} /></button>}
            {path.map((c, i) => (
              <button key={c.id} type="button" class={i === path.length - 1 ? 'crumb current' : 'crumb'} onClick={() => setSel({ profileId: file.profile.id, folderId: c.id })}>{c.name}</button>
            ))}
          </nav>
          <div class="grid-controls" role="group" aria-label="Grid size">
            <Stepper label="Columns" value={p.cols} min={1} max={12} onChange={v => grid({ cols: v })} />
            <span class="times" aria-hidden="true">×</span>
            <Stepper label="Rows" value={p.rows} min={1} max={8} onChange={v => grid({ rows: v })} />
            <Stepper label="Gap" value={p.gap} min={0} max={24} step={2} onChange={v => grid({ gap: v })} />
          </div>
        </header>
        <Canvas file={file} folderId={folderId} profiles={profiles} selected={selected} onSelect={setSelected}
          onOpenFolder={id => { setSel({ profileId: file.profile.id, folderId: id }); setSelected(null); }} assetUrl={assetUrl} />
        <p class="workspace-hint">Click an empty cell to add a button. Drag to move, drag the corner to resize, right-click for more.</p>
      </section>
      <Inspector widget={widget} key={widget?.id ?? 'none'} />
    </div>
  );
}

function Stepper({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange(v: number): void }) {
  return (
    <label class="stepper">
      <span class="stepper-label">{label}</span>
      <button type="button" class="stepper-btn" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}><Icon name="minus" size={14} /></button>
      <span class="stepper-value" aria-live="polite">{value}</span>
      <button type="button" class="stepper-btn" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}><Icon name="plus" size={14} /></button>
    </label>
  );
}
