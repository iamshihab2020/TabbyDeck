import type { DeckView, ProfileFile, Widget } from '@tabbydeck/shared';

/** The same DeckView the phone receives, built in the editor so the canvas renders exactly what the device will. */
export function toView(f: ProfileFile, folderId: string, profiles: ProfileFile[]): DeckView {
  const byId = new Map(f.folders.map(d => [d.id, d]));
  const path: DeckView['path'] = [];
  const seen = new Set<string>();
  for (let d = byId.get(folderId); d && !seen.has(d.id); d = d.parentId ? byId.get(d.parentId) : undefined) { seen.add(d.id); path.unshift({ id: d.id, name: d.name }); }
  const p = f.profile;
  return {
    profileId: p.id, profileName: p.name, profiles: profiles.map(x => ({ id: x.profile.id, name: x.profile.name })),
    folderId, path, cols: p.cols, rows: p.rows, gap: p.gap, bg: p.bg, ...(p.bgImage ? { bgImage: p.bgImage } : {}),
    widgets: f.widgets.filter(w => w.folderId === folderId).map(w => ({ id: w.id, kind: w.config.kind, x: w.x, y: w.y, w: w.w, h: w.h, look: w.look })),
  };
}

/** Cells of a folder not covered by any widget, row by row. */
export function freeCells(widgets: Pick<Widget, 'x' | 'y' | 'w' | 'h'>[], cols: number, rows: number): { x: number; y: number }[] {
  const taken = new Set<string>();
  for (const w of widgets) for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) taken.add(`${x},${y}`);
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!taken.has(`${x},${y}`)) out.push({ x, y });
  return out;
}
