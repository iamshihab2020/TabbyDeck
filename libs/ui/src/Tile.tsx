import type { TargetedPointerEvent, TargetedKeyboardEvent } from 'preact';
import type { WidgetView } from '@tabbydeck/shared';
import { Icon } from './Icon.tsx';
import { tileStyle, type CellSize } from './looks.ts';

/** Full-colour app icons fill their box edge to edge, so they get a little more room than line icons to look the same size. */
const APP_ICON = 1.2;

export interface TileProps {
  widget: WidgetView;
  /** Size of one grid cell; icon and label scale from its shorter side. */
  cell: CellSize;
  assetUrl: (id: string) => string;
  pressed?: boolean;
  flash?: 'error' | 'ok';
  selected?: boolean;
  /** Where the finger landed, in px from the tile's top left; n restarts the light ripple on every press. */
  ripple?: { x: number; y: number; n: number };
  style?: Record<string, string | number>;
  onPointerDown?: (e: TargetedPointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: TargetedPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (e: TargetedPointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (e: TargetedKeyboardEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
  dataId?: boolean;
  /** A seasonal touch: snow on the key's top edge, or a small pumpkin in its corner. */
  deco?: 'snow' | 'pumpkin';
  /** Being dragged to a new place (edit mode on the deck). */
  dragging?: boolean;
}

export function Tile(p: TileProps) {
  // A stateful key that is on (muted, night light) takes its "on" look and lights its status light.
  const look = p.widget.active && p.widget.alt ? { ...p.widget.look, ...p.widget.alt } : p.widget.look;
  const cellPx = Math.min(p.cell.w, p.cell.h);
  // Labels are measured by estimate (~0.58 em per character) so the tile can lay out before the browser does.
  const width = p.cell.w * p.widget.w * 0.86;
  const base = tileStyle(look, cellPx);
  const px = parseInt(String(base.labelStyle.fontSize), 10);
  const lines = look.label && look.label.length * px * 0.58 > width ? 2 : 1;
  const t = lines > 1 ? tileStyle(look, cellPx, lines) : base;
  // A single word too long for the tile shrinks to fit rather than breaking mid-word.
  if (look.label) {
    const longest = look.label.split(/\s+/).reduce((n, word) => Math.max(n, word.length), 0);
    const fit = Math.floor(width / (longest * 0.58));
    if (fit < px) t.labelStyle.fontSize = `${Math.max(8, fit)}px`;
  }
  const name = look.label || (look.icon ?? (p.widget.kind === 'folder' ? 'Folder' : 'Button'));
  const cls = 'tb-tile' + (p.flash ? ` tb-flash-${p.flash}` : '') + (p.selected ? ' tb-selected' : '') + (p.pressed ? ' tb-pressed' : '') + (p.widget.active ? ' tb-active' : '') + (p.widget.running ? ' tb-running' : '') + (p.widget.disabled ? ' tb-disabled' : '') + (p.dragging ? ' tb-dragging' : '');
  return (
    <button
      type="button"
      class={cls}
      aria-label={[name, p.widget.big, p.widget.value, p.widget.running && 'open'].filter(Boolean).join(', ')}
      aria-disabled={p.widget.disabled || undefined}
      data-widget={p.widget.id}
      tabIndex={p.tabIndex}
      style={{ ...t.style, ...p.style }}
      onPointerDown={p.onPointerDown}
      onPointerUp={p.onPointerUp}
      onPointerCancel={p.onPointerCancel}
      onKeyDown={p.onKeyDown}
      onContextMenu={e => e.preventDefault()}
    >
      {p.ripple && <span key={p.ripple.n} class="tb-ripple" style={{ left: `${p.ripple.x}px`, top: `${p.ripple.y}px` }} />}
      {p.widget.active && <span class="tb-led" />}
      {p.widget.running && <span class="tb-open" />}
      {p.deco === 'snow' && <span class="tb-snow" aria-hidden="true" />}
      {p.deco === 'pumpkin' && <Pumpkin size={Math.max(14, Math.round(cellPx * 0.2))} />}
      {p.widget.value && <span class="tb-value" style={{ fontSize: `${Math.max(10, Math.round(cellPx * 0.13))}px` }}>{p.widget.value}</span>}
      <span class="tb-tile-inner" style={t.innerStyle}>
      {p.widget.big
        ? <span class="tb-big" style={{ fontSize: `${Math.round(Math.min(cellPx * 0.32, width / (p.widget.big.length * 0.6)))}px` }}>{p.widget.big}</span>
        : look.image && look.imageFit === 'icon'
        ? <img class="tb-tile-icon" src={p.assetUrl(look.image)} alt="" draggable={false} style={{ ...t.iconStyle, width: `${Math.round(t.iconPx * APP_ICON)}px`, height: `${Math.round(t.iconPx * APP_ICON)}px` }} />
        : look.image
        ? <><img class="tb-tile-img" src={p.assetUrl(look.image)} alt="" draggable={false} />{look.label && <span class="tb-scrim" />}</>
        : (look.icon || p.widget.kind === 'folder') && <Icon class="tb-tile-icon" name={look.icon ?? 'folder'} size={t.iconPx} style={t.iconStyle} />}
      {p.widget.kind === 'folder' && look.icon && <Icon class="tb-tile-folder-mark" name="folder" size={Math.max(10, Math.round(cellPx * 0.14))} />}
      {look.label && <span class="tb-tile-label" style={t.labelStyle}>{look.label}</span>}
      </span>
    </button>
  );
}

const Pumpkin = ({ size }: { size: number }) => (
  <svg class="tb-pumpkin" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 4.5c.3-1.6 1.2-2.6 2.6-3" stroke="#4d7c0f" stroke-width="1.8" fill="none" stroke-linecap="round" />
    <ellipse cx="6.5" cy="12" rx="5" ry="6" fill="#ea7a1c" /><ellipse cx="13.5" cy="12" rx="5" ry="6" fill="#ea7a1c" /><ellipse cx="10" cy="12" rx="4.2" ry="6.6" fill="#f59a3a" />
    <path d="M7 11l1.4-1.6L9.6 11zM10.4 11l1.2-1.6L13 11zM7.2 14q2.8 2 5.6 0" fill="#3b1d0a" stroke="#3b1d0a" stroke-width="0.6" />
  </svg>
);
