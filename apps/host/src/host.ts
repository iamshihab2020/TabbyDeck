import type { ProfileFile } from '@tabbydeck/shared';
import { Store } from './store/store.ts';
import type { Logger } from './log/logger.ts';
import { Pairing } from './auth/pairing.ts';
import { Sessions } from './auth/sessions.ts';
import { Clients } from './server/clients.ts';
import { attachWs, serveStatic, startHttp, type HttpHandle, type Route } from './server/http.ts';
import type { AssetSource } from './assets/source.ts';
import { createNative, type Native } from './native/index.ts';
import { HeldKeys, releaseAllOnStart } from './native/win/held.ts';
import { ActionRegistry, type HostApi } from './engine/registry.ts';
import { Engine } from './engine/engine.ts';
import { Vars, startSysInfoPoller } from './engine/vars.ts';
import { StateWatcher } from './engine/states.ts';
import { registerBuiltins } from './integrations/index.ts';
import { AssetStore, assetRoute } from './assets/store.ts';

export interface HostOptions {
  dataDir: string;
  log: Logger;
  fakeNative?: boolean;
  /** Address the phone-facing server binds to ('' = all interfaces). */
  lanHost?: string;
  /** Defaults to the saved settings. */
  lanPort?: number;
  /** Built client app; omitted in tests that only use the WebSocket. */
  clientAssets?: AssetSource;
  extraRoutes?: Route[];
  /** Deck for an empty data folder; defaults to the one-button profile. */
  firstRun?: () => ProfileFile;
}

export interface Host {
  store: Store; assets: AssetStore; native: Native; registry: ActionRegistry; engine: Engine; vars: Vars;
  pairing: Pairing; sessions: Sessions; clients: Clients; readonly lan: HttpHandle; readonly lanPort: number;
  /** Move the phone-facing server to a new address or port. The new one opens before the old one closes. */
  rebind(address: string, port: number): Promise<void>;
  close(): Promise<void>;
}

/** Assemble the whole host: storage, native layer, actions, engine, pairing and the phone-facing server. */
export async function createHost(o: HostOptions): Promise<Host> {
  const store = new Store({ dir: o.dataDir, log: o.log, firstRun: o.firstRun });
  await store.load();
  const native = await createNative({ fake: o.fakeNative, dataDir: o.dataDir, echo: line => o.log.info('native', line) });
  releaseAllOnStart(native.input, o.dataDir);
  const held = new HeldKeys(o.dataDir, native.input);
  const registry = new ActionRegistry();
  registerBuiltins(registry, { native, held, store });
  const vars = new Vars(store);
  const assets = new AssetStore(store);

  const sessions = new Sessions(store);
  const pairing = new Pairing({ store, sessions, log: o.log });
  // The engine reaches devices through the client registry, which is created just below.
  let clients!: Clients;
  const hostApi: HostApi = {
    switchProfile: (d, p) => clients.switchProfile(d, p),
    openFolder: (d, f) => clients.openFolder(d, f),
    notify: (d, t, v) => clients.notify(d, t, v),
    flash: (w, k) => clients.patch(w, { flash: k }),
  };
  const engine = new Engine(registry, { vars, host: hostApi, log: o.log });
  engine.on('paused', e => { if (e.deviceId) clients.notify(e.deviceId, 'TabbyDeck is paused', false); });
  clients = new Clients({ store, pairing, sessions, log: o.log, onPress: (s, w, kind) => { engine.trigger(w, kind, { deviceId: s.deviceId }); if (kind === 'press') states.afterPress(w); } });
  const states = new StateWatcher({ store, native, clients });
  clients.liveOf = states.liveOf;
  clients.on('deviceConnected', () => void states.refresh());
  // Panel sliders send many values while dragged; only the newest per screen is applied, one change at a time.
  const wanted = new Map<string, number>(); let applying = false;
  clients.onBrightness = async (s, screen, pct) => {
    if (engine.paused) return clients.notify(s.deviceId!, 'TabbyDeck is paused', false);
    wanted.set(screen, pct);
    if (applying) return;
    applying = true;
    try {
      for (let next = wanted.entries().next(); !next.done; next = wanted.entries().next()) {
        const [id, p] = next.value; wanted.delete(id);
        await native.display.setScreenBrightness(id, p).catch(e => o.log.warn('display', 'could not set brightness', { screen: id, error: String(e) }));
      }
    } finally { applying = false; }
    void states.refresh('screens');
  };
  // Same for the volume slider: only the newest level is applied; mute goes through at once.
  let wantedVolume: number | undefined, settingVolume = false;
  clients.onVolume = async (s, pct, mute) => {
    if (engine.paused) return clients.notify(s.deviceId!, 'TabbyDeck is paused', false);
    const fail = (e: unknown) => o.log.warn('audio', 'could not change the volume', { error: String(e) });
    if (mute !== undefined) await native.audio.setMute(mute).catch(fail);
    if (pct !== undefined) {
      wantedVolume = pct;
      if (settingVolume) return;
      settingVolume = true;
      try { while (wantedVolume !== undefined) { const v = wantedVolume; wantedVolume = undefined; await native.audio.setVolume(v).catch(fail); } } finally { settingVolume = false; }
    }
    for (const k of ['sound', 'volume', 'system.mute']) void states.refresh(k);
  };

  // Connecting takes Windows a few seconds, so the panel looks again shortly after.
  clients.onBluetooth = async (s, m) => {
    if (engine.paused) return clients.notify(s.deviceId!, 'TabbyDeck is paused', false);
    try {
      if (m.power !== undefined) await native.system.setBluetooth(m.power);
      if (m.device) await native.system.connectBluetooth(m.device, m.connect ?? true);
    } catch (e) {
      o.log.warn('bluetooth', 'could not change Bluetooth', { error: String(e) });
      clients.notify(s.deviceId!, e instanceof Error ? e.message : String(e), false);
    }
    const again = () => void states.refresh('bluetoothPanel');
    again();
    for (const ms of [2500, 7000]) setTimeout(again, ms).unref();
  };

  const routes = [assetRoute(assets), ...(o.extraRoutes ?? []), ...(o.clientAssets ? [serveStatic(o.clientAssets, '/')] : [])];
  const startLan = async (address: string, port: number) => {
    const h = await startHttp({ host: address || '0.0.0.0', port, routes, log: o.log });
    attachWs(h.server, '/ws', (sock, req) => clients.handle(sock, req));
    return h;
  };
  let lan = await startLan(o.lanHost ?? store.settings().bindAddress, o.lanPort ?? store.settings().port);
  const stopPoller = startSysInfoPoller(native, vars, () => clients.count());
  const stopStates = states.start();

  return {
    store, assets, native, registry, engine, vars, pairing, sessions, clients,
    get lan() { return lan; },
    get lanPort() { return lan.port; },
    async rebind(address: string, port: number) {
      const next = await startLan(address, port);
      const old = lan; lan = next;
      clients.closeAll();
      await old.close();
      o.log.info('host', 'phone server moved', { address: address || 'all', port: next.port });
    },
    async close() {
      stopPoller();
      stopStates();
      await engine.shutdown();
      held.releaseAll();
      clients.closeAll();
      pairing.dispose();
      await lan.close();
      await native.dispose();
      await store.flush();
    },
  };
}
