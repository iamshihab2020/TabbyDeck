import { useEffect, useState } from 'preact/hooks';
import { latestNews, splitLabel } from '@tabbydeck/shared/news';
import changelog from '../../../../CHANGELOG.md?raw';
import { useApi, useSnapshot } from '../state.ts';
import { Modal } from './Modal.tsx';
import type { PageId } from './Rail.tsx';

const NEWS = latestNews(changelog);
// A line that starts with a page's name ("Customize: …") gets a button to that page.
const PAGES: Record<string, PageId> = { deck: 'deck', devices: 'devices', customize: 'customize', stats: 'stats', integrations: 'integrations', settings: 'settings' };

let open: (() => void) | null = null;
/** Open "What's new" again (the Settings page has a button for it). */
export const showNews = () => open?.();

/**
 * "What's new in 0.x", from the newest release in the changelog. It opens by itself the first time the editor runs
 * after an update, and never on a first install (the guide covers that). The version it showed is kept in the settings.
 */
export function WhatsNew({ onPage }: { onPage(p: PageId): void }) {
  const api = useApi();
  const { state } = useSnapshot();
  const [shown, setShown] = useState(false);
  useEffect(() => { open = () => setShown(true); return () => { open = null; }; }, []);
  const seen = () => { if (NEWS) void api.cmd('settings.update', { patch: { newsSeen: NEWS.version } }).catch(() => {}); };
  useEffect(() => {
    if (!NEWS || !state || state.settings.newsSeen === NEWS.version) return;
    if (!state.settings.newsSeen && !state.settings.guideDone) seen(); // a first install
    else setShown(true);
  }, [!!state]);
  if (!shown || !NEWS) return null;
  const close = () => { seen(); setShown(false); };
  return (
    <Modal title={`What's new in ${NEWS.version}`} onClose={close} width={600}>
      <div class="news">
        {NEWS.sections.map(s => (
          <section key={s.title}>
            <h3 class="news-h">{s.title}</h3>
            <ul class="news-list">
              {s.items.map(item => {
                const { label, text } = splitLabel(item), page = label ? PAGES[label.toLowerCase()] : undefined;
                return (
                  <li key={item}>
                    {label && <b>{label}. </b>}{text}
                    {page && <button type="button" class="btn small news-try" onClick={() => { close(); onPage(page); }}>Try it</button>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div class="modal-actions"><button type="button" class="btn primary" onClick={close}>Got it</button></div>
    </Modal>
  );
}
