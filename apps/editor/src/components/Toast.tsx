import { useEffect, useState } from 'preact/hooks';
import { Icon } from '@tabbydeck/ui';

export interface ToastItem { id: number; text: string; tone: 'info' | 'error' | 'ok'; action?: { label: string; run(): void } }
let push: ((t: Omit<ToastItem, 'id'>) => void) | null = null;
let seq = 0;

/** Show a toast from anywhere in the editor. */
export const toast = (text: string, tone: ToastItem['tone'] = 'info', action?: ToastItem['action']) => push?.({ text, tone, action });

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    push = t => {
      const id = ++seq;
      setItems(x => [...x.slice(-3), { ...t, id }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), t.action ? 12000 : 4500);
    };
    return () => { push = null; };
  }, []);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} class={`toast ${t.tone}`}>
          <Icon name={t.tone === 'error' ? 'warning-circle' : t.tone === 'ok' ? 'check-circle' : 'info'} size={18} />
          <span>{t.text}</span>
          {t.action && <button type="button" class="btn small" onClick={() => { t.action!.run(); setItems(x => x.filter(i => i.id !== t.id)); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}
