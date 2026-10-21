import { STATEFUL, confirmText, levelOf, panelOf, statefulAction, type DeckView, type Widget } from '@tabbydeck/shared';
import { StoreError, type Store } from '../store/store.ts';
import type { Live } from '../engine/states.ts';

/** What one client sees for a profile and folder. Pure function of store state. */
export function buildDeckView(store: Store, profileId: string, folderId: string, liveOf: (w: Widget) => Live = () => ({})): DeckView {
  const f = store.profile(profileId);
  if (!f) throw new StoreError('not_found', `profile ${profileId}`);
  const byId = new Map(f.folders.map(d => [d.id, d]));
  if (!byId.has(folderId)) throw new StoreError('not_found', `folder ${folderId}`);
  const path: DeckView['path'] = [];
  const seen = new Set<string>();
  for (let d = byId.get(folderId); d; d = d.parentId ? byId.get(d.parentId) : undefined) {
    if (seen.has(d.id)) throw new StoreError('invalid', 'folder cycle');
    seen.add(d.id);
    path.unshift({ id: d.id, name: d.name });
  }
  const p = f.profile;
  return {
    profileId: p.id, profileName: p.name,
    profiles: store.profiles().map(x => ({ id: x.profile.id, name: x.profile.name })),
    folderId, path, cols: p.cols, rows: p.rows, gap: p.gap, bg: p.bg, ...(p.bgImage ? { bgImage: p.bgImage } : {}),
    widgets: f.widgets.filter(w => w.folderId === folderId).map(w => {
      const s = statefulAction(w), live = liveOf(w), confirm = confirmText(w), repeat = (levelOf(w)?.dir ?? 0) !== 0, panel = panelOf(w);
      return {
        id: w.id, kind: w.config.kind, x: w.x, y: w.y, w: w.w, h: w.h, look: structuredClone(w.look),
        ...(s ? { alt: { ...STATEFUL[s] } } : {}), ...live, ...(confirm ? { confirm } : {}), ...(repeat ? { repeat } : {}), ...(panel ? { panel } : {}),
      };
    }),
  };
}
