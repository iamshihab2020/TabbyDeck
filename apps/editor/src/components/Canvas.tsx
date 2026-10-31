import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_LOOK, type ProfileFile, type Widget } from '@tabbydeck/shared';
import { planReflow } from '@tabbydeck/shared/layout';
import { Icon, Tile, cellOffset, cellSpan, useCellSize } from '@tabbydeck/ui';
import { useApi, useSnapshot } from '../state.ts';
import { cellFromPointer, planMove, planResize } from '../canvas/drag.ts';
import { freeCells, toView } from '../canvas/view.ts';
import { ContextMenu, type MenuItem } from './ContextMenu.tsx';
import { toast } from './Toast.tsx';
import { PresetPicker, appWidget, appsWidget, presetWidget, type PresetChoice } from './PresetPicker.tsx';

type Clip = Pick<Widget, 'w' | 'h' | 'look' | 'config'>;
let clipboard: Clip | null = null;

type Moves = { id: string; x: number; y: number }[];
interface Drag { id: string; mode: 'move' | 'resize'; x0: number; y0: number; grabX: number; grabY: number; moved: boolean; preview: { x: number; y: number; w: number; h: number } | null; ok: boolean; plan: Moves }

export interface CanvasProps {
  file: ProfileFile;
  folderId: string;
  profiles: ProfileFile[];
  selected: string | null;
  onSelect(id: string | null): void;
  onOpenFolder(folderId: string): void;
  assetUrl(id: string): string;
}

export function Canvas({ file, folderId, profiles, selected, onSelect, onOpenFolder, assetUrl }: CanvasProps) {
  const api = useApi();
  const screen = useRef<HTMLDivElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);
  const view = toView(file, folderId, profiles);
  const { cols, rows, gap } = view;
  const cell = useCellSize(screen, cols, rows, gap);
  const widgets = file.widgets.filter(w => w.folderId === folderId);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const { state } = useSnapshot();
  const danger = new Set(state?.catalogue.filter(a => a.danger).map(a => a.id));
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  // Where the grid and the tablet sit inside the stage, so the rulers line up with the cells.
  const stageEl = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ gx: 0, gy: 0, bx: 0, by: 0 });
  useLayoutEffect(() => {
    const s = stageEl.current?.getBoundingClientRect(), g = gridEl.current?.getBoundingClientRect(), b = screen.current?.parentElement?.getBoundingClientRect();
    if (!s || !g || !b) return;
    const next = { gx: Math.round(g.left - s.left), gy: Math.round(g.top - s.top), bx: Math.round(b.left - s.left), by: Math.round(b.top - s.top) };
    if (next.gx !== at.gx || next.gy !== at.gy || next.bx !== at.bx || next.by !== at.by) setAt(next);
  });

  const pos = (r: { x: number; y: number; w: number; h: number }) => ({
    left: `${cellOffset(r.x, cell.w, gap)}px`, top: `${cellOffset(r.y, cell.h, gap)}px`,
    width: `${cellSpan(r.w, cell.w, gap)}px`, height: `${cellSpan(r.h, cell.h, gap)}px`,
  });

  // ---- commands ----
  const create = async (x: number, y: number, kind: 'button' | 'folder') => {
    if (kind === 'button') {
      const r = await api.cmd<{ id: string }>('widget.create', { folderId, widget: { x, y, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'New button', icon: 'cursor-click' }, config: { kind: 'button', policy: 'ignore', triggers: {} } } }).catch(() => null);
      if (r) onSelect(r.id);
    } else {
      const f = await api.cmd<{ id: string }>('folder.create', { profileId: file.profile.id, parentId: folderId, name: 'New folder' }).catch(() => null);
      if (!f) return;
      const r = await api.cmd<{ id: string }>('widget.create', { folderId, widget: { x, y, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'New folder', icon: 'folder', bg: '#2b2440' }, config: { kind: 'folder', targetFolderId: f.id } } }).catch(() => null);
      if (r) { onSelect(r.id); toast('Folder added. Double-click it to fill it with buttons.', 'ok'); }
    }
  };
  const pick = async (p: PresetChoice) => {
    const at = picker; setPicker(null); if (!at) return;
    if (p === 'blank' || p === 'folder') return create(at.x, at.y, p === 'blank' ? 'button' : 'folder');
    let widget;
    if ('app' in p) {
      // The icon is kept with the deck as an image, so it shows on the tablet and survives export.
      const icon = await api.cmd<{ dataUrl: string | null }>('apps.icon', { id: p.app.id }).catch(() => null);
      const saved = icon?.dataUrl ? await api.cmd<{ id: string }>('asset.upload', { name: `${p.app.name}.png`, dataUrl: icon.dataUrl }).catch(() => null) : null;
      widget = appWidget(p.app, saved?.id, at.x, at.y);
    } else if ('apps' in p) widget = appsWidget(p.apps, at.x, at.y);
    else widget = presetWidget(p, at.x, at.y);
    const r = await api.cmd<{ id: string }>('widget.create', { folderId, widget }).catch(() => null);
    if (r) onSelect(r.id);
  };
  const remove = (id: string) => {
    const w = widgets.find(x => x.id === id); if (!w) return;
    void api.cmd('widget.delete', { id }).then(() => {
      onSelect(null);
      toast(`Deleted ${w.look.label || 'button'}`, 'info', { label: 'Undo', run: () => void api.cmd('widget.create', { folderId, widget: { x: w.x, y: w.y, w: w.w, h: w.h, look: w.look, config: w.config } }) });
    }).catch(() => {});
  };
  const duplicate = (id: string) => void api.cmd<{ id: string }>('widget.duplicate', { id }).then(r => onSelect(r.id)).catch(() => {});
  const copy = (id: string) => { const w = widgets.find(x => x.id === id); if (w) { clipboard = structuredClone({ w: w.w, h: w.h, look: w.look, config: w.config }); toast('Copied', 'ok'); } };
  const paste = (at?: { x: number; y: number }) => {
    if (!clipboard) return;
    const spot = at && planMove([...widgets, { id: '__clip', x: at.x, y: at.y, w: clipboard.w, h: clipboard.h }], '__clip', at.x, at.y, cols, rows)
      ? at : freeCells(widgets, cols, rows).find(c => planMove([...widgets, { id: '__clip', x: c.x, y: c.y, w: clipboard!.w, h: clipboard!.h }], '__clip', c.x, c.y, cols, rows));
    if (!spot) return toast('No free space for that button. Make the grid bigger first.', 'error');
    void api.cmd<{ id: string }>('widget.create', { folderId, widget: { ...structuredClone(clipboard), ...spot } }).then(r => onSelect(r.id)).catch(() => {});
  };
  const nudge = (id: string, dx: number, dy: number) => {
    const w = widgets.find(x => x.id === id); if (!w) return;
    const plan = planReflow(widgets, id, w.x + dx, w.y + dy, cols, rows);
    if (!plan?.length) return;
    void (plan.length === 1 ? api.cmd('widget.move', { id, x: plan[0].x, y: plan[0].y, w: w.w, h: w.h }) : api.cmd('widget.moveMany', { moves: plan })).catch(() => {});
  };

  // ---- pointer drag (move and resize) ----
  const startDrag = (e: PointerEvent, id: string, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    onSelect(id);
    const w = widgets.find(x => x.id === id)!;
    const r = gridEl.current!.getBoundingClientRect();
    const c = cellFromPointer(r, cols, rows, gap, cell, e.clientX, e.clientY);
    setDrag({ id, mode, x0: e.clientX, y0: e.clientY, grabX: c.x - w.x, grabY: c.y - w.y, moved: false, preview: null, ok: true, plan: [] });
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current!; const w = widgets.find(x => x.id === d.id); if (!w) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      const c = cellFromPointer(gridEl.current!.getBoundingClientRect(), cols, rows, gap, cell, e.clientX, e.clientY);
      if (d.mode === 'move') {
        const tx = Math.max(0, Math.min(cols - w.w, c.x - d.grabX)), ty = Math.max(0, Math.min(rows - w.h, c.y - d.grabY));
        // Dropping on a taken cell shuffles the neighbours along, like a phone home screen.
        const plan = planReflow(widgets, d.id, tx, ty, cols, rows);
        setDrag({ ...d, moved: true, preview: { x: tx, y: ty, w: w.w, h: w.h }, ok: !!plan, plan: plan ?? [] });
      } else {
        const nw = Math.max(1, Math.min(cols - w.x, c.x - w.x + 1)), nh = Math.max(1, Math.min(rows - w.y, c.y - w.y + 1));
        const ok = planResize(widgets, d.id, nw, nh, cols, rows);
        setDrag({ ...d, moved: true, preview: { x: w.x, y: w.y, w: nw, h: nh }, ok: !!ok });
      }
    };
    const up = () => {
      const d = dragRef.current; setDrag(null);
      if (!d?.moved || !d.preview || !d.ok) { if (d?.moved && !d.ok) toast(d.mode === 'move' ? 'A wide button can only swap with one the same size.' : 'Resizing there would cover another button.', 'error'); return; }
      const w = widgets.find(x => x.id === d.id); if (!w) return;
      if (d.mode === 'move' && d.plan.length > 1) { void api.cmd('widget.moveMany', { moves: d.plan }).catch(() => {}); return; }
      const p = d.preview;
      if (p.x !== w.x || p.y !== w.y || p.w !== w.w || p.h !== w.h) void api.cmd('widget.move', { id: d.id, ...p }).catch(() => {});
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag?.id, drag?.mode, cell.w, cell.h, folderId, file]);

  // ---- keyboard ----
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { onSelect(null); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
    if (!selected) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selected); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(selected); }
    else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(selected); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      nudge(selected, e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0);
    }
  };

  const tileMenu = (e: MouseEvent, w: Widget) => {
    e.preventDefault(); onSelect(w.id);
    setMenu({ x: e.clientX, y: e.clientY, items: [
      ...(w.config.kind === 'folder' ? [{ label: 'Open folder', icon: 'folder-open', run: () => onOpenFolder((w.config as { targetFolderId: string }).targetFolderId) }] : []),
      { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', run: () => duplicate(w.id) },
      { label: 'Copy', icon: 'clipboard', shortcut: 'Ctrl+C', run: () => copy(w.id) },
      { label: 'Paste', icon: 'clipboard-text', shortcut: 'Ctrl+V', disabled: !clipboard, run: () => paste() },
      { label: 'Delete', icon: 'trash', shortcut: 'Del', danger: true, run: () => remove(w.id) },
    ] });
  };
  const slotMenu = (e: MouseEvent, x: number, y: number) => {
    e.preventDefault(); e.stopPropagation(); onSelect(null);
    setMenu({ x: e.clientX, y: e.clientY, items: [
      { label: 'Choose a ready-made button', icon: 'squares-four', run: () => setPicker({ x, y }) },
      { label: 'Add blank button', icon: 'plus-circle', run: () => void create(x, y, 'button') },
      { label: 'Add folder', icon: 'folder-plus', run: () => void create(x, y, 'folder') },
      { label: 'Paste here', icon: 'clipboard-text', disabled: !clipboard, run: () => paste({ x, y }) },
    ] });
  };

  const sel = widgets.find(w => w.id === selected);
  // The rulers light the columns and rows the selected key (or the one being dragged) covers.
  const lit = drag?.moved && drag.preview ? drag.preview : sel;
  const on = (i: number, from?: number, span?: number) => from !== undefined && span !== undefined && i >= from && i < from + span;
  return (
    <div class="stage" ref={stageEl} onKeyDown={onKey} tabIndex={0} aria-label="Deck canvas. Arrow keys move the selected button." onMouseDown={e => { if (e.target === e.currentTarget) onSelect(null); }}>
      <div class="bezel">
        <div class="screen" ref={screen} style={{ background: view.bgImage ? `url("${assetUrl(view.bgImage)}") center / cover no-repeat, ${view.bg}` : view.bg }}>
          <div class={`canvas-grid tiles-${file.profile.tiles ?? 'keycap'}`} ref={gridEl} style={{ width: `${cellSpan(cols, cell.w, gap)}px`, height: `${cellSpan(rows, cell.h, gap)}px` }}>
            {freeCells(widgets, cols, rows).map(c => (
              <button key={`${c.x},${c.y}`} type="button" class="slot" style={pos({ ...c, w: 1, h: 1 })} aria-label={`Empty cell, column ${c.x + 1}, row ${c.y + 1}. Add a button.`}
                onClick={() => { onSelect(null); setPicker({ x: c.x, y: c.y }); }} onContextMenu={e => slotMenu(e as unknown as MouseEvent, c.x, c.y)}>
                <Icon name="plus" size={Math.max(14, Math.round(Math.min(cell.w, cell.h) * 0.22))} />
              </button>
            ))}
            {view.widgets.map(wv => {
              const w = widgets.find(x => x.id === wv.id)!;
              const lifted = drag?.id === w.id && drag.moved && drag.mode === 'move';
              // While dragging, the held key follows the pointer and its neighbours slide to where the drop would put them.
              const shift = drag?.moved && drag.mode === 'move' ? drag.plan.find(m => m.id === w.id && m.id !== drag.id) : undefined;
              const gone = state?.missing?.includes(w.id);
              const at = lifted && drag!.preview ? { ...w, x: drag!.preview.x, y: drag!.preview.y } : shift ? { ...w, ...shift } : w;
              return (
                <div key={w.id} class={`canvas-tile${w.id === selected ? ' selected' : ''}${lifted ? ' lifted' : ''}${lifted && !drag!.ok ? ' blocked' : ''}${gone ? ' missing' : ''}`} style={pos(at)}
                  title={gone ? 'This app is not on this PC, so the decks hide this key' : undefined}
                  onPointerDown={e => startDrag(e as unknown as PointerEvent, w.id, 'move')}
                  onDblClick={() => { if (w.config.kind === 'folder') onOpenFolder(w.config.targetFolderId); }}
                  onContextMenu={e => tileMenu(e as unknown as MouseEvent, w)}>
                  <Tile widget={wv} cell={cell} assetUrl={assetUrl} tabIndex={-1} style={{ left: '0', top: '0', width: '100%', height: '100%' }} />
                  {gone && <span class="missing-tag">Not on this PC</span>}
                </div>
              );
            })}
            {drag?.moved && drag.preview && (drag.mode === 'resize' || !drag.ok) && <div class={drag.ok ? 'drop-preview' : 'drop-preview bad'} style={pos(drag.preview)} aria-hidden="true" />}
            {sel && !drag?.moved && (
              <div class="selection" style={pos(sel)} aria-hidden="true">
                <span class="resize-handle" title="Drag to resize" onPointerDown={e => startDrag(e as unknown as PointerEvent, sel.id, 'resize')} />
              </div>
            )}
          </div>
        </div>
      </div>
      {cell.w > 0 && <>
        <div class="ruler cols" aria-hidden="true" style={{ top: `${at.by - 24}px` }}>
          {Array.from({ length: cols }, (_, i) => <span key={i} class={on(i, lit?.x, lit?.w) ? 'on' : ''} style={{ left: `${at.gx + cellOffset(i, cell.w, gap)}px`, width: `${cell.w}px` }}>{i + 1}</span>)}
        </div>
        <div class="ruler rows" aria-hidden="true" style={{ left: `${at.bx - 26}px` }}>
          {Array.from({ length: rows }, (_, i) => <span key={i} class={on(i, lit?.y, lit?.h) ? 'on' : ''} style={{ top: `${at.gy + cellOffset(i, cell.h, gap)}px`, height: `${cell.h}px` }}>{i + 1}</span>)}
        </div>
      </>}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {picker && <PresetPicker danger={danger} onPick={p => void pick(p)} onClose={() => setPicker(null)} />}
    </div>
  );
}
