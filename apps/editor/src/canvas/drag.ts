import { fits, type Rect } from '@tabbydeck/shared/layout';

type Box = { left: number; top: number };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Grid cell under a pointer; points in a gap belong to the cell before it; outside points clamp to the edge. */
export function cellFromPointer(rect: Box, cols: number, rows: number, gap: number, cell: { w: number; h: number }, clientX: number, clientY: number): { x: number; y: number } {
  const x = Math.floor((clientX - rect.left) / (cell.w + gap));
  const y = Math.floor((clientY - rect.top) / (cell.h + gap));
  return { x: clamp(x, 0, cols - 1), y: clamp(y, 0, rows - 1) };
}

/** Where a widget would land if dropped with its top-left at (toX, toY); shifted to stay inside, null if it overlaps. */
export function planMove(widgets: (Rect & { id: string })[], id: string, toX: number, toY: number, cols: number, rows: number): { x: number; y: number } | null {
  const w = widgets.find(x => x.id === id);
  if (!w) return null;
  const x = clamp(toX, 0, cols - w.w), y = clamp(toY, 0, rows - w.h);
  return fits(widgets, cols, rows, { id, x, y, w: w.w, h: w.h }) ? { x, y } : null;
}

/** New span for a widget, clamped to 1x1 and the grid edge; null if it would cover a neighbour. */
export function planResize(widgets: (Rect & { id: string })[], id: string, toW: number, toH: number, cols: number, rows: number): { w: number; h: number } | null {
  const cur = widgets.find(x => x.id === id);
  if (!cur) return null;
  const w = clamp(toW, 1, cols - cur.x), h = clamp(toH, 1, rows - cur.y);
  return fits(widgets, cols, rows, { id, x: cur.x, y: cur.y, w, h }) ? { w, h } : null;
}
