import { useEffect, useRef, useState } from 'preact/hooks';
import type { Look, Widget } from '@tabbydeck/shared';
import { Icon, Tile } from '@tabbydeck/ui';
import { useApi } from '../state.ts';
import { Appearance } from './inspector/Appearance.tsx';
import { Actions } from './inspector/Actions.tsx';

const assetUrl = (id: string) => `/assets/u/${encodeURIComponent(id)}`;

/** Right-hand panel for the selected button: live preview, label, then the Look and Actions tabs. */
export function Inspector({ widget }: { widget: Widget | null }) {
  const api = useApi();
  const [look, setLook] = useState<Look | null>(widget?.look ?? null);
  const [tab, setTab] = useState<'look' | 'actions'>('look');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingLook = useRef<Look | null>(null);

  // Saves are debounced; flush the last one when the panel closes or the selection changes.
  const flush = () => {
    clearTimeout(timer.current);
    if (widget && pendingLook.current) void api.cmd('widget.update', { id: widget.id, patch: { look: pendingLook.current } }).catch(() => {});
    pendingLook.current = null;
  };
  useEffect(() => flush, []);

  if (!widget || !look) {
    return (
      <aside class="inspector empty" aria-label="Button settings">
        <Icon name="cursor-click" size={28} />
        <p>Select a button to change how it looks and what it does.</p>
      </aside>
    );
  }
  const change = (patch: Partial<Look>) => {
    const next = { ...look, ...patch };
    for (const k of Object.keys(patch) as (keyof Look)[]) if (patch[k] === undefined) delete next[k];
    setLook(next);
    pendingLook.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 150);
  };

  const isFolder = widget.config.kind === 'folder';
  return (
    <aside class="inspector" aria-label="Button settings">
      <div class="preview" aria-hidden="true">
        <div class="preview-tile" style={{ width: `${widget.w > 1 ? 196 : 112}px` }}>
          <Tile widget={{ id: widget.id, kind: widget.config.kind, x: 0, y: 0, w: 1, h: 1, look }} cell={{ w: widget.w > 1 ? 196 : 112, h: 112 }} assetUrl={assetUrl} tabIndex={-1} style={{ left: '0', top: '0', width: '100%', height: '100%' }} />
        </div>
      </div>
      <label class="field">
        <span class="field-label">Label</span>
        <input class="input" value={look.label ?? ''} maxLength={40} placeholder="No label"
          onInput={e => change({ label: (e.target as HTMLInputElement).value || undefined })} />
      </label>
      {!isFolder && (
        <div class="tabs" role="tablist" aria-label="Button settings">
          <button type="button" role="tab" aria-selected={tab === 'look'} class={tab === 'look' ? 'tab on' : 'tab'} onClick={() => setTab('look')}>Look</button>
          <button type="button" role="tab" aria-selected={tab === 'actions'} class={tab === 'actions' ? 'tab on' : 'tab'} onClick={() => setTab('actions')}>Actions</button>
        </div>
      )}
      {(isFolder || tab === 'look') && <Appearance look={look} onChange={change} />}
      {!isFolder && tab === 'actions' && <Actions widget={widget} />}
    </aside>
  );
}
