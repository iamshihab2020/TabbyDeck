import { useMemo, useState } from 'preact/hooks';
import type { ActionDefPublic } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { Modal } from './Modal.tsx';

const GROUP_ICON: Record<string, string> = { Keyboard: 'keyboard', Mouse: 'mouse', System: 'desktop', Audio: 'speaker-high', Deck: 'squares-four' };

/** Searchable list of every action, grouped by where it comes from. */
export function StepPicker({ catalogue, onPick, onClose }: { catalogue: ActionDefPublic[]; onPick(a: ActionDefPublic): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const s = q.toLowerCase().trim();
    const hit = catalogue.filter(a => !s || `${a.name} ${a.group} ${a.description ?? ''}`.toLowerCase().includes(s));
    return [...new Set(hit.map(a => a.group))].map(g => ({ g, items: hit.filter(a => a.group === g) }));
  }, [q, catalogue]);
  return (
    <Modal title="Add an action" onClose={onClose} width={560}>
      <input class="input" type="search" placeholder="Search, for example hotkey, volume or open" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} aria-label="Search actions" />
      <div class="picker-list">
        {groups.map(({ g, items }) => (
          <section key={g} aria-label={g}>
            <h3 class="picker-group"><Icon name={GROUP_ICON[g] ?? 'lightning'} size={16} />{g}</h3>
            {items.map(a => (
              <button key={a.id} type="button" class="picker-item" onClick={() => { onPick(a); onClose(); }}>
                <span class="picker-name">{a.name}{a.danger && <span class="danger-badge" title="This can close apps, lose work or turn the PC off">Careful</span>}</span>
                {a.description && <span class="picker-desc">{a.description}</span>}
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p class="muted icon-empty">No actions match "{q}".</p>}
      </div>
    </Modal>
  );
}
