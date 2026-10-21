export interface Rect { id?: string; x: number; y: number; w: number; h: number }

/** True when the candidate lies inside the grid and overlaps no other widget (its own id is ignored). */
export function fits(widgets: Rect[], cols: number, rows: number, c: Rect): boolean {
  if (c.x < 0 || c.y < 0 || c.w < 1 || c.h < 1 || c.x + c.w > cols || c.y + c.h > rows) return false;
  return !widgets.some(o => o.id !== undefined && o.id === c.id ? false
    : c.x < o.x + o.w && o.x < c.x + c.w && c.y < o.y + o.h && o.y < c.y + c.h);
}

/** Row-major scan for the first top-left cell where a w x h widget fits, or null. */
export function firstFreeCell(widgets: Rect[], cols: number, rows: number, w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= rows; y++) for (let x = 0; x + w <= cols; x++) if (fits(widgets, cols, rows, { x, y, w, h })) return { x, y };
  return null;
}

/**
 * Where everything goes when a widget is dropped with its top-left at (tx, ty), phone home-screen style.
 * A free target is a plain move. A 1x1 widget dropped on another 1x1 widget takes its cell, and the 1x1 widgets
 * in between shift one cell (in reading order) towards the gap that opens, stopping at the nearest empty cell;
 * bigger widgets stay put and are flowed around. A bigger widget can only swap with one widget of the same size
 * sitting exactly on the target. Returns the moves (changed widgets only), or null when the drop is refused.
 */
export function planReflow(widgets: (Rect & { id: string })[], id: string, tx: number, ty: number, cols: number, rows: number): { id: string; x: number; y: number }[] | null {
  const d = widgets.find(w => w.id === id);
  if (!d) return null;
  if (tx < 0 || ty < 0 || tx + d.w > cols || ty + d.h > rows) return null;
  if (tx === d.x && ty === d.y) return [];
  if (fits(widgets, cols, rows, { id, x: tx, y: ty, w: d.w, h: d.h })) return [{ id, x: tx, y: ty }];

  const others = widgets.filter(w => w.id !== id);
  if (d.w > 1 || d.h > 1) {
    const hit = others.filter(o => tx < o.x + o.w && o.x < tx + d.w && ty < o.y + o.h && o.y < ty + d.h);
    if (hit.length !== 1 || hit[0].x !== tx || hit[0].y !== ty || hit[0].w !== d.w || hit[0].h !== d.h) return null;
    return [{ id, x: tx, y: ty }, { id: hit[0].id, x: d.x, y: d.y }];
  }

  // Slots: every cell not covered by a bigger widget, in reading order; each holds a 1x1 widget id or null.
  const big = others.filter(o => o.w > 1 || o.h > 1);
  const covered = (x: number, y: number) => big.some(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
  const slots: { x: number; y: number }[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!covered(x, y)) slots.push({ x, y });
  const at = (x: number, y: number) => slots.findIndex(s => s.x === x && s.y === y);
  const to = at(tx, ty), from = at(d.x, d.y);
  if (to < 0 || from < 0) return null;
  const items: (string | null)[] = slots.map(s => others.find(o => o.w === 1 && o.h === 1 && o.x === s.x && o.y === s.y)?.id ?? null);
  items[from] = null;
  if (from > to) { let k = to; while (items[k] !== null) k++; for (let i = k; i > to; i--) items[i] = items[i - 1]; }
  else { let k = to; while (items[k] !== null) k--; for (let i = k; i < to; i++) items[i] = items[i + 1]; }
  items[to] = id;

  const moves: { id: string; x: number; y: number }[] = [];
  items.forEach((wid, i) => {
    if (!wid) return;
    const w = widgets.find(v => v.id === wid)!;
    if (w.x !== slots[i].x || w.y !== slots[i].y) moves.push({ id: wid, ...slots[i] });
  });
  return moves;
}

/**
 * Lay the same keys out in fewer columns for a narrow screen (a phone held upright): reading order is kept (top row
 * first, left to right), each key goes in the first spot it fits, and the grid grows downwards to scroll.
 */
export function flowLayout<T extends Rect>(widgets: T[], cols: number): { widgets: T[]; rows: number } {
  const taken: boolean[][] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (taken[r]?.[c]) return false;
    return true;
  };
  let rows = 0;
  const placed = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x).map(k => {
    const w = Math.min(k.w, cols);
    for (let y = 0; ; y++) for (let x = 0; x + w <= cols; x++) {
      if (!free(x, y, w, k.h)) continue;
      for (let r = y; r < y + k.h; r++) for (let c = x; c < x + w; c++) (taken[r] ??= [])[c] = true;
      rows = Math.max(rows, y + k.h);
      return { ...k, x, y, w };
    }
  });
  return { widgets: placed, rows };
}
