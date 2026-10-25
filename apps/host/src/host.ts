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
import { startAppFollower } from './engine/follow.ts';
import { InfoKeys } from './engine/info.ts';
import { Installed } from './engine/installed.ts';
import { Stats } from './engine/stats.ts';
import { appUsingMic } from './integrations/meeting.ts';
import { parseHotkey } from './native/win/keys.ts';
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
  store: Store; assets: AssetStore; native: Native; installed: Installed; stats: Stats;
  /** The last phone or tablet that opened the deck page (not this PC itself): shows whether phones reach the PC at all. */
  readonly lastVisit: { ip: string; at: string } | null; registry: ActionRegistry; engine: Engine; vars: Vars;
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
  // The engine reaches devices through the client registry, which is created just below.
  let clients!: Clients;
  const info = new InfoKeys({ store, native, patch: (id, live) => clients.patch(id, live), notify: text => clients.notify('all', text, true) });
  registerBuiltins(registry, { native, held, store, info });
  const vars = new Vars(store);
  const assets = new AssetStore(store);

  const sessions = new Sessions(store);
  const pairing = new Pairing({ store, sessions, log: o.log });
  const hostApi: HostApi = {
    switchProfile: (d, p) => clients.switchProfile(d, p),
    openFolder: (d, f) => clients.openFolder(d, f),
    notify: (d, t, v) => clients.notify(d, t, v),
    flash: (w, k) => clients.patch(w, { flash: k }),
  };
  const engine = new Engine(registry, { vars, host: hostApi, log: o.log });
  engine.on('paused', e => { if (e.deviceId) clients.notify(e.deviceId, 'TabbyDeck is paused', false); });
  clients = new Clients({ store, pairing, sessions, log: o.log, onPress: (s, w, kind) => {
    if (w.config.kind !== 'button' || !(w.config.triggers[kind] ?? w.config.triggers.press)?.some(st => st.action === 'display.screensOff')) { if (native.display.screensBack()) native.input.mouseMove(0, 0, false); }
    engine.trigger(w, kind, { deviceId: s.deviceId }); if (kind === 'press') { states.afterPress(w); stats.press(w); } } });
  const stats = new Stats({ dir: o.dataDir, native });
  clients.statsOf = () => stats.summary(7);
  stats.on('badge', id => clients.broadcast({ t: 'badge', id }));
  const states = new StateWatcher({ store, native, clients });
  clients.liveOf = w => ({ ...states.liveOf(w), ...info.liveOf(w) });
  clients.on('deviceConnected', () => void states.refresh());
  const installed = new Installed({ store, native });
  installed.on('change', ids => { for (const id of ids) clients.broadcastDeckFor(id); });
  clients.hidden = installed.missing;
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
  // Same for the volume sliders (the PC's, and each app's): only the newest level is applied; mute and output go through at once.
  const wantedLevel = new Map<string, number>(); let settingVolume = false;
  clients.onVolume = async (s, m) => {
    if (engine.paused) return clients.notify(s.deviceId!, 'TabbyDeck is paused', false);
    const fail = (e: unknown) => { o.log.warn('audio', 'could not change the sound', { error: String(e) }); if (m.app || m.output) clients.notify(s.deviceId!, e instanceof Error ? e.message : String(e), false); };
    if (m.output) await native.audio.setOutput(m.output).catch(fail);
    if (m.mute !== undefined) await (m.app ? native.audio.setApp(m.app, { mute: m.mute }) : native.audio.setMute(m.mute)).catch(fail);
    if (m.percent !== undefined) {
      wantedLevel.set(m.app ?? '', m.percent); // '' is the PC's own volume
      if (settingVolume) return;
      settingVolume = true;
      try {
        for (let next = wantedLevel.entries().next(); !next.done; next = wantedLevel.entries().next()) {
          const [app, v] = next.value; wantedLevel.delete(app);
          await (app ? native.audio.setApp(app, { percent: v }) : native.audio.setVolume(v)).catch(fail);
        }
      } finally { settingVolume = false; }
    }
    for (const k of ['sound', 'volume', 'system.mute', ...(m.output ? ['outputs'] : [])]) void states.refresh(k);
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

  // The trackpad: pointer moves and scrolls go straight to Windows; typing goes as text, keys as a tap.
  clients.onPointer = (s, m) => {
    if (engine.paused) return clients.notify(s.deviceId!, 'TabbyDeck is paused', false);
    const i = native.input;
    if (m.dx || m.dy) i.mouseMove(m.dx ?? 0, m.dy ?? 0, false);
    if (m.button) { if (m.down === undefined) { i.mouseButton(m.button, true); i.mouseButton(m.button, false); } else i.mouseButton(m.button, m.down); }
    if (m.scroll || m.scrollX) i.scroll(m.scroll ?? 0, m.scrollX ?? 0);
    if (m.text) i.typeText(m.text);
    if (m.key) { const k = parseHotkey(m.key); if (k.ok) for (const vk of k.keys) { i.keyDown(vk); i.keyUp(vk); } }
  };

  // The cover of what is playing, for Now playing keys. It lives in memory and changes with the track.
  const artRoute: Route = {
    method: 'GET', path: /^\/assets\/u\/(np-[0-9a-f]{12}\.(?:png|jpg|gif|webp|bmp))$/,
    handler(_req, res, m) {
      const a = states.art;
      if (!a || a.id !== m![1]) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': a.type, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
      res.end(a.data);
    },
  };
  let lastVisit: { ip: string; at: string } | null = null;
  const noteVisit = (r: Route): Route => ({ ...r, handler: (req, res, m) => {
    const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (ip && ip !== '127.0.0.1' && ip !== '::1') lastVisit = { ip, at: new Date().toISOString() };
    return r.handler(req, res, m);
  } });
  const routes = [artRoute, assetRoute(assets), ...(o.extraRoutes ?? []), ...(o.clientAssets ? [noteVisit(serveStatic(o.clientAssets, '/'))] : [])];
  const startLan = async (address: string, port: number) => {
    const h = await startHttp({ host: address || '0.0.0.0', port, routes, log: o.log });
    attachWs(h.server, '/ws', (sock, req) => clients.handle(sock, req));
    return h;
  };
  let lan = await startLan(o.lanHost ?? store.settings().bindAddress, o.lanPort ?? store.settings().port);
  const stopPoller = startSysInfoPoller(native, vars, () => clients.count());
  const stopStates = states.start();
  const stopInfo = info.start();
  const stopInstalled = installed.start();
  const stopStats = stats.start();
  // The decks' cat dresses for what the PC is doing: headphones while media plays, glasses during a focus session.
  // The cat's other outfits: a headset while a call uses the mic, a hard hat while a timer runs.
  let mood = { playing: false, focus: false, meeting: false, timer: false };
  const readMood = async () => {
    if (!clients.count()) return;
    const next = {
      playing: await native.system.mediaPlaying().catch(() => false), focus: info.focusing(),
      meeting: !!appUsingMic(await native.system.micUsers().catch(() => [])), timer: info.timing(),
    };
    if (JSON.stringify(next) !== JSON.stringify(mood)) { mood = next; clients.broadcast({ t: 'mood', ...mood }); }
  };
  const moodTimer = setInterval(() => void readMood(), 4000); moodTimer.unref?.();
  clients.on('deviceConnected', () => clients.broadcast({ t: 'mood', ...mood }));
  const stopFollow = startAppFollower({ store, native, clients });

  return {
    store, assets, native, installed, stats, registry, engine, vars, pairing, sessions, clients,
    get lan() { return lan; },
    get lastVisit() { return lastVisit; },
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
      stopInfo();
      stopInstalled();
      stopStats();
      clearInterval(moodTimer);
      stopFollow();
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
