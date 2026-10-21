import { useEffect, useMemo, useState } from 'preact/hooks';
import { SpriteDefs, Icon, Mark } from '@tabbydeck/ui';
import { createApi } from './api.ts';
import { ApiContext, errorText, useSnapshot } from './state.ts';
import { Rail, type PageId } from './components/Rail.tsx';
import { Toasts, toast } from './components/Toast.tsx';
import { DeckPage } from './pages/Deck.tsx';
import { DevicesPage } from './pages/Devices.tsx';
import { IntegrationsPage } from './pages/Integrations.tsx';
import { LogPage } from './pages/Log.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { ApproveModal, type PendingDevice } from './components/ApproveModal.tsx';
import { useApi } from './state.ts';
import { ConnectReminder, Guide, Tour } from './components/Guide.tsx';

export function App() {
  const api = useMemo(() => {
    const token = new URLSearchParams(location.search).get('token') ?? '';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return createApi({ url: `${proto}//${location.host}/editor-ws?token=${encodeURIComponent(token)}` });
  }, []);
  useEffect(() => api.onError(code => toast(errorText(code), 'error')), [api]);
  return (
    <ApiContext.Provider value={api}>
      <SpriteDefs />
      <Shell />
      <Toasts />
    </ApiContext.Provider>
  );
}

function Shell() {
  const { state, connected } = useSnapshot();
  const [page, setPage] = useState<PageId>(() => (location.hash.slice(1) as PageId) || 'deck');
  useEffect(() => { history.replaceState(null, '', `${location.search}#${page}`); }, [page]);
  useEffect(() => { const f = () => setPage((location.hash.slice(1) as PageId) || 'deck'); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  // A device asking to pair is announced wherever you are, with a button straight to the approval dialog.
  const api = useApi();
  const [approving, setApproving] = useState<PendingDevice | null>(null);
  const [touring, setTouring] = useState(false);
  useEffect(() => api.onEvent('pairRequest', d => {
    const p = d as PendingDevice;
    toast(`${p.name} wants to use your deck`, 'info', { label: 'Approve', run: () => setApproving(p) });
  }), [api]);
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.settings.theme; }, [state?.settings.theme]);

  if (!state) {
    return (
      <div class="boot">
        <Mark size={30} class="boot-mark" />
        <p>{connected ? 'Loading your deck' : 'Connecting to TabbyDeck'}</p>
      </div>
    );
  }
  return (
    <div class="shell">
      <Rail page={page} onPage={setPage} badges={{ devices: state.pending.length }} />
      <main class="page" aria-live="off">
        {!connected && <div class="banner" role="alert"><Icon name="wifi-slash" size={18} />Lost the connection to TabbyDeck. Reconnecting.</div>}
        {state.settings.guideDone && page !== 'devices' && <ConnectReminder onConnect={() => setPage('devices')} />}
        {page === 'deck' && <DeckPage />}
        {page === 'devices' && <DevicesPage />}
        {page === 'integrations' && <IntegrationsPage />}
        {page === 'log' && <LogPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
      {approving && <ApproveModal device={approving} onClose={() => setApproving(null)} />}
      {!state.settings.guideDone && <Guide onTour={() => { setPage('deck'); setTouring(true); }} />}
      {touring && page === 'deck' && <Tour onDone={() => setTouring(false)} />}
    </div>
  );
}
