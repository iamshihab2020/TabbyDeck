import { Icon, Mark } from '@tabbydeck/ui';

export type PageId = 'deck' | 'devices' | 'themes' | 'integrations' | 'log' | 'settings';
const PAGES: { id: PageId; label: string; icon: string }[] = [
  { id: 'deck', label: 'Deck', icon: 'squares-four' },
  { id: 'devices', label: 'Devices', icon: 'device-tablet' },
  { id: 'themes', label: 'Themes', icon: 'palette' },
  { id: 'integrations', label: 'Integrations', icon: 'plugs-connected' },
  { id: 'log', label: 'Log', icon: 'file-text' },
  { id: 'settings', label: 'Settings', icon: 'gear-six' },
];

export function Rail({ page, onPage, badges }: { page: PageId; onPage(p: PageId): void; badges: Partial<Record<PageId, number>> }) {
  return (
    <nav class="rail" aria-label="Sections">
      <div class="rail-mark" aria-hidden="true"><Mark size={28} /></div>
      {PAGES.map(p => (
        <button key={p.id} type="button" class={p.id === page ? 'rail-btn on' : 'rail-btn'} aria-current={p.id === page ? 'page' : undefined} title={p.label} onClick={() => onPage(p.id)}>
          <Icon name={p.icon} size={22} />
          <span class="rail-label">{p.label}</span>
          {badges[p.id] ? <span class="rail-badge" aria-label={`${badges[p.id]} waiting`}>{badges[p.id]}</span> : null}
        </button>
      ))}
    </nav>
  );
}
