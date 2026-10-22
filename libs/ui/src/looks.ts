import type { Look } from '@tabbydeck/shared';

type Css = Record<string, string | number>;

/** Label sizes are authored for a 96 px cell and scale with the actual cell. */
export const REFERENCE_CELL = 96;

/** Icon size as a share of the tile's shorter side (owner asked for smaller icons, 2026-10-21). */
export const ICON_FRACTION = 0.3;

const JUSTIFY = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const;

/** "#1e3a5f" or "#fff" -> { [name]: "30, 58, 95" }; nothing for other colour formats. */
export function rgbVar(name: string, hex: string | undefined): Css {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return {};
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return { [name]: [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') };
}

/** Pure mapping from a Look to inline styles for a tile of the given cell size. */
export function tileStyle(look: Look, cellPx: number, labelLines = 1): { style: Css; innerStyle: Css; iconStyle: Css; labelStyle: Css; iconPx: number } {
  const k = cellPx / REFERENCE_CELL;
  const iconPx = Math.round(cellPx * ICON_FRACTION * look.iconScale);
  const labelBelowIcon = look.labelPos === 'bottom' && look.label;
  const style: Css = {
    // A colour, not the background shorthand, so a key style can lay its own light and shading over it; the rgb parts
    // let a style use the key's colours see-through (glass, outline) on browsers without color-mix.
    backgroundColor: look.bg,
    ...rgbVar('--key-rgb', look.bg), ...rgbVar('--fg-rgb', look.fg),
    color: look.fg,
    borderRadius: `${look.radius}px`,
    justifyContent: JUSTIFY[look.labelPos],
  };
  if (look.border && look.border.width > 0) style.border = `${look.border.width}px solid ${look.border.color}`;
  if (look.font) style.fontFamily = look.font;
  // The icon rises to leave the label room; more when the label wraps to two lines.
  const lift = labelBelowIcon ? (labelLines > 1 ? -0.15 : -0.09) : 0;
  const iconStyle: Css = {
    width: `${iconPx}px`, height: `${iconPx}px`,
    opacity: look.iconOpacity,
    transform: `translate(calc(-50% + ${look.iconX * cellPx}px), calc(-50% + ${(look.iconY + lift) * cellPx}px))`,
  };
  // Labels grow with the tile only a little: big tiles should show more room, not shouting text.
  const labelStyle: Css = { fontSize: `${Math.round(look.labelSize * Math.min(1.3, Math.max(0.75, k)))}px` };
  // The bottom pad clears the keycap's 3 px lip, so a label sits on the key face, not on its edge.
  const innerStyle: Css = { justifyContent: JUSTIFY[look.labelPos], padding: `${Math.round(cellPx * 0.1)}px ${Math.round(cellPx * 0.07)}px ${Math.round(cellPx * 0.12) + 3}px` };
  return { style, innerStyle, iconStyle, labelStyle, iconPx };
}

export interface CellSize { w: number; h: number }

/** Cells never get more than this much longer on one side, so tiles stay tile-shaped. */
export const MAX_CELL_ASPECT = 1.35;

/** Largest tile side in CSS px, so tiles stay compact on big screens (owner asked for small tiles, 2026-10-21). */
export const MAX_CELL_PX = 128;

/** Cell size that fills a box with a cols x rows grid, stretching cells up to MAX_CELL_ASPECT. */
export function gridCellSize(width: number, height: number, cols: number, rows: number, gap: number): CellSize {
  let w = Math.max(16, Math.floor((width - gap * (cols - 1)) / cols));
  let h = Math.max(16, Math.floor((height - gap * (rows - 1)) / rows));
  if (w > h * MAX_CELL_ASPECT) w = Math.floor(h * MAX_CELL_ASPECT);
  if (h > w * MAX_CELL_ASPECT) h = Math.floor(w * MAX_CELL_ASPECT);
  return { w: Math.min(w, MAX_CELL_PX), h: Math.min(h, MAX_CELL_PX) };
}

export const cellOffset = (n: number, cellPx: number, gap: number) => n * (cellPx + gap);
export const cellSpan = (n: number, cellPx: number, gap: number) => n * cellPx + (n - 1) * gap;
