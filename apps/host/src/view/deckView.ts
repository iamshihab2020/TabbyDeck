import { flowLayout } from '@tabbydeck/shared/layout';
import { STATEFUL, confirmText, levelOf, panelOf, statefulAction, type DeckView, type Widget } from '@tabbydeck/shared';
import { StoreError, type Store } from '../store/store.ts';
import type { Live } from '../engine/states.ts';

/** What one client sees for a profile and folder. Pure function of store state. */
export function buildDeckView(store: Store, profileId: string, folderId: string, liveOf: (w: Widget) => Live = () => ({}), hidden: (w: Widget) => boolean = () => false): DeckView {
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
  // Keys for apps this PC does not have are left out, and the rest close up in reading order so no gap is left.
  const inFolder = f.widgets.filter(w => w.folderId === folderId), shown = inFolder.filter(w => !hidden(w));
  const packed = shown.length < inFolder.length ? flowLayout(shown, p.cols) : { widgets: shown, rows: p.rows };
  return {
    profileId: p.id, profileName: p.name,
    profiles: store.profiles().map(x => ({ id: x.profile.id, name: x.profile.name })),
    folderId, path, cols: p.cols, rows: Math.max(1, packed.rows), gap: p.gap, bg: p.bg, ...(p.bgImage ? { bgImage: p.bgImage } : {}), ...(p.tiles ? { tiles: p.tiles } : {}),
    widgets: packed.widgets.map(w => {
      const s = statefulAction(w), { look: liveLook, ...live } = liveOf(w), confirm = confirmText(w), repeat = (levelOf(w)?.dir ?? 0) !== 0, panel = panelOf(w);
      return {
        id: w.id, kind: w.config.kind, x: w.x, y: w.y, w: w.w, h: w.h, look: { ...structuredClone(w.look), ...liveLook },
        ...(s ? { alt: { ...STATEFUL[s] } } : {}), ...live, ...(confirm ? { confirm } : {}), ...(repeat ? { repeat } : {}), ...(panel ? { panel } : {}),
      };
    }),
  };
}
