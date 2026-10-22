import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { DeckView, WidgetView } from '@tabbydeck/shared';
import { Tile, type TileProps } from './Tile.tsx';
import { cellOffset, cellSpan, gridCellSize, type CellSize } from './looks.ts';

export interface GridProps {
  view: DeckView;
  cell: CellSize;
  assetUrl: (id: string) => string;
  /** Per-tile extra props (press handlers, pressed state, flash). */
  tileProps?: (w: WidgetView) => Partial<TileProps>;
  children?: ComponentChildren;
}

export function Grid({ view, cell, assetUrl, tileProps, children }: GridProps) {
  const { cols, rows, gap } = view;
  return (
    <div class={`tb-grid tiles-${view.tiles ?? 'keycap'}`} style={{ width: `${cellSpan(cols, cell.w, gap)}px`, height: `${cellSpan(rows, cell.h, gap)}px` }}>
      {view.widgets.map(w => (
        <Tile key={w.id} widget={w} cell={cell} assetUrl={assetUrl} {...tileProps?.(w)}
          style={{ left: `${cellOffset(w.x, cell.w, gap)}px`, top: `${cellOffset(w.y, cell.h, gap)}px`, width: `${cellSpan(w.w, cell.w, gap)}px`, height: `${cellSpan(w.h, cell.h, gap)}px`,
            // read only by the client's entrance ripple: keys rise along the diagonal from the top left
            animationDelay: `${Math.min(240, (w.x + w.y) * 18)}ms` }} />
      ))}
      {children}
    </div>
  );
}

/**
 * Cell size for a grid inside an element. Uses window resize and orientation events, not ResizeObserver,
 * because ResizeObserver needs Chrome 64 and the client floor is Chrome 60.
 */
export function useCellSize(el: { current: HTMLElement | null }, cols: number, rows: number, gap: number): CellSize {
  const [size, setSize] = useState<CellSize>({ w: 64, h: 64 });
  useEffect(() => {
    const measure = () => {
      const e = el.current; if (!e) return;
      const cs = getComputedStyle(e); // clientWidth includes padding; the grid must fit the content box
      const w = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = e.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setSize(gridCellSize(w, h, cols, rows, gap));
    };
    measure();
    const late = setTimeout(measure, 250); // orientation change reports old sizes first on some Android builds
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => { clearTimeout(late); window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, [el, cols, rows, gap]);
  return size;
}
