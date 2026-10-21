import { useMemo, useState } from 'preact/hooks';
import { Icon, ICON_NAMES } from '@tabbydeck/ui';
import { Modal } from './Modal.tsx';

/** Searchable grid of every bundled icon. Typing filters by name; "logo" finds the brand icons. */
export function IconPicker({ current, onPick, onClose }: { current?: string; onPick(name: string): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return ICON_NAMES.filter(n => words.every(w => n.includes(w)));
  }, [q]);
  return (
    <Modal title="Choose an icon" onClose={onClose} width={640}>
      <input class="input" type="search" placeholder="Search icons, for example music, volume or logo" value={q}
        onInput={e => setQ((e.target as HTMLInputElement).value)} aria-label="Search icons" />
      <div class="icon-grid" role="listbox" aria-label="Icons">
        {shown.map(n => (
          <button key={n} type="button" role="option" aria-selected={n === current} class={n === current ? 'icon-cell on' : 'icon-cell'} title={n.replace(/-/g, ' ')}
            onClick={() => { onPick(n); onClose(); }}>
            <Icon name={n} size={24} />
          </button>
        ))}
        {shown.length === 0 && <p class="muted icon-empty">No icons match "{q}". Try a shorter word, or upload your own image.</p>}
      </div>
    </Modal>
  );
}
