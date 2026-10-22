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
  const cls = 'tb-tile' + (p.flash ? ` tb-flash-${p.flash}` : '') + (p.selected ? ' tb-selected' : '') + (p.pressed ? ' tb-pressed' : '') + (p.widget.active ? ' tb-active' : '') + (p.widget.disabled ? ' tb-disabled' : '');
  return (
    <button
      type="button"
      class={cls}
      aria-label={[name, p.widget.big, p.widget.value].filter(Boolean).join(', ')}
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
