import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '@tabbydeck/ui';

export interface MenuItem { label: string; icon: string; shortcut?: string; danger?: boolean; disabled?: boolean; run(): void }

/** A small menu at a screen point; closes on outside click, Escape, or after a choice. Arrow keys move focus. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose(): void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = el.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus();
    const down = (e: MouseEvent) => { if (!el.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = [...el.current!.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length]?.focus();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, []);
  const left = Math.min(x, window.innerWidth - 220), top = Math.min(y, window.innerHeight - items.length * 36 - 16);
  return (
    <div class="menu" role="menu" ref={el} style={{ left: `${left}px`, top: `${top}px` }}>
      {items.map(i => (
        <button key={i.label} type="button" role="menuitem" class={i.danger ? 'menu-item danger' : 'menu-item'} disabled={i.disabled}
          onClick={() => { onClose(); i.run(); }}>
          <Icon name={i.icon} size={16} /><span>{i.label}</span>{i.shortcut && <kbd>{i.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
