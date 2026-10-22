import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { ClientMsgSchema, panelOf, type HostMsg, type Look, type TriggerKind, type Widget } from '@tabbydeck/shared';
import type { Logger } from '../log/logger.ts';
import type { Store } from '../store/store.ts';
import type { Pairing } from '../auth/pairing.ts';
import { RateLimiter, resolveHello } from '../auth/pairing.ts';
import type { Sessions } from '../auth/sessions.ts';
import { buildDeckView } from '../view/deckView.ts';
import type { Live } from '../engine/states.ts';

export interface ClientSession {
  readonly id: number;
  readonly ip: string;
  deviceId?: string;
  name: string;
  authed: boolean;
  profileId: string;
  folderId: string;
}

type PressFn = (s: ClientSession, w: Widget, kind: TriggerKind) => void;
interface ClientsEvents { deviceConnected: [{ deviceId: string; ip: string }]; deviceDisconnected: [{ deviceId: string }]; pairRequest: [{ deviceId: string; name: string; ip: string }] }

interface Conn extends ClientSession {
  sock: WebSocket; token?: string;
  /** Set while the app in front chose the profile: the one the device was on before, to return to. */
  home?: string;
}

export class Clients extends EventEmitter<ClientsEvents> {
  private conns = new Set<Conn>();
  private seq = 0;
  private limiter = new RateLimiter(10, 60_000);
  private store: Store; private pairing: Pairing; private sessions: Sessions; private log: Logger;
  onPress: PressFn;
  onBrightness: (c: ClientSession, screen: string, percent: number) => void = () => {};
  onVolume: (c: ClientSession, m: { percent?: number; mute?: boolean; app?: string; output?: string }) => void = () => {};
  onBluetooth: (c: ClientSession, m: { power?: boolean; device?: string; connect?: boolean }) => void = () => {};
  onPointer: (c: ClientSession, m: Extract<import('@tabbydeck/shared').ClientMsg, { t: 'pointer' }>) => void = () => {};

  constructor(opts: { store: Store; pairing: Pairing; sessions: Sessions; log: Logger; onPress: PressFn }) {
    super();
    this.store = opts.store; this.pairing = opts.pairing; this.sessions = opts.sessions; this.log = opts.log; this.onPress = opts.onPress;

    this.store.on('profile', id => this.broadcastDeckFor(id));
    this.store.on('profileDeleted', id => { for (const c of this.conns) if (c.authed && c.profileId === id) this.goToProfile(c, this.firstProfileId()); });
    this.store.on('devices', () => this.enforceDevices());
    this.pairing.on('approved', ({ deviceId, token }) => {
      for (const c of this.conns) if (c.deviceId === deviceId && !c.authed) this.welcome(c, token);
    });
    this.pairing.on('denied', ({ deviceId }) => this.toDevice(deviceId, { t: 'denied' }, false));
    this.pairing.on('timeout', ({ deviceId }) => this.toDevice(deviceId, { t: 'timeout' }, false));
  }

  handle(sock: WebSocket, req: IncomingMessage): void {
    const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    const c: Conn = { id: ++this.seq, ip, sock, name: '', authed: false, profileId: '', folderId: '' };
    this.conns.add(c);
    sock.on('message', (data, isBinary) => {
      if (isBinary) return sock.close(1003, 'binary not supported');
      let parsed;
      try { parsed = ClientMsgSchema.safeParse(JSON.parse(String(data))); } catch { parsed = null; }
      if (!parsed?.success) { this.log.debug('clients', 'malformed message', { ip }); return sock.close(1003, 'malformed'); }
      try { this.onMessage(c, parsed.data); } catch (e) { this.log.error('clients', 'message handler failed', { error: String(e) }); }
    });
    sock.on('close', () => {
      this.conns.delete(c);
      if (c.authed && c.deviceId) { this.emit('deviceDisconnected', { deviceId: c.deviceId }); this.log.info('clients', 'disconnected', { deviceId: c.deviceId }); }
    });
    sock.on('error', () => {});
  }

  private onMessage(c: Conn, m: import('@tabbydeck/shared').ClientMsg) {
    switch (m.t) {
      case 'hello': return this.onHello(c, m);
      case 'ping': return this.send(c, { t: 'pong', sent: m.sent, hostTime: Date.now() });
      default: break;
    }
    if (!c.authed) return;
    if (m.t === 'press') {
      const w = this.store.widget(m.widgetId);
      if (!w) return this.log.debug('clients', 'press on unknown widget', { widgetId: m.widgetId });
      const f = this.store.profile(c.profileId);
      if (!f || !f.widgets.includes(w)) return this.log.debug('clients', 'press on widget outside the current profile', { widgetId: m.widgetId });
      if (w.config.kind === 'folder') { if (m.kind === 'press') this.goToFolder(c, w.config.targetFolderId); return; }
      this.onPress(c, w, m.kind);
    } else if (m.t === 'open') {
      if (m.folderId === null) {
        const cur = this.store.folder(c.folderId);
        if (cur?.parentId) this.goToFolder(c, cur.parentId);
      } else this.goToFolder(c, m.folderId);
    } else if (m.t === 'brightness') {
      const w = this.store.widget(m.widgetId), f = this.store.profile(c.profileId);
      if (!w || !f?.widgets.includes(w) || panelOf(w) !== 'brightness') return this.log.debug('clients', 'brightness from a deck without the panel', { widgetId: m.widgetId });
      this.onBrightness(c, m.screen, m.percent);
    } else if (m.t === 'volume') {
      const w = this.store.widget(m.widgetId), f = this.store.profile(c.profileId);
      if (!w || !f?.widgets.includes(w) || panelOf(w) !== 'volume') return this.log.debug('clients', 'volume from a deck without the panel', { widgetId: m.widgetId });
      this.onVolume(c, m);
    } else if (m.t === 'bluetooth') {
      const w = this.store.widget(m.widgetId), f = this.store.profile(c.profileId);
      if (!w || !f?.widgets.includes(w) || panelOf(w) !== 'bluetooth') return this.log.debug('clients', 'bluetooth from a deck without the panel', { widgetId: m.widgetId });
      this.onBluetooth(c, m);
    } else if (m.t === 'pointer') {
      const w = this.store.widget(m.widgetId), f = this.store.profile(c.profileId);
      if (!w || !f?.widgets.includes(w) || panelOf(w) !== 'trackpad') return this.log.debug('clients', 'pointer from a deck without the trackpad', { widgetId: m.widgetId });
      this.onPointer(c, m);
    } else if (m.t === 'profile') {
      if (this.store.profile(m.profileId)) { c.home = undefined; this.goToProfile(c, m.profileId); }
      else this.log.debug('clients', 'unknown profile requested', { profileId: m.profileId });
    }
  }

  private onHello(c: Conn, m: Extract<import('@tabbydeck/shared').ClientMsg, { t: 'hello' }>) {
    if (!this.limiter.allow(c.ip)) { this.log.warn('clients', 'hello rate limited', { ip: c.ip }); return c.sock.close(1008, 'rate_limited'); }
    if (c.authed) return;
    c.name = m.name.trim().slice(0, 40) || 'Device';
    const r = resolveHello(this.store, this.sessions, m);
    if (r.kind === 'blocked') { this.send(c, { t: 'blocked' }); return c.sock.close(1008, 'blocked'); }
    c.deviceId = r.deviceId;
    if (r.kind === 'welcome') {
      const d = this.store.device(r.deviceId)!;
      this.store.upsertDevice({ ...d, name: c.name, lastSeen: new Date().toISOString() });
      return this.welcome(c, m.token!);
    }
    const { code } = this.pairing.request(r.deviceId, c.name, c.ip);
    this.emit('pairRequest', { deviceId: r.deviceId, name: c.name, ip: c.ip });
    this.send(c, { t: 'pairRequired', code });
  }

  private welcome(c: Conn, token: string) {
    const d = this.store.device(c.deviceId!);
    if (!d) return;
    c.authed = true; c.token = token;
    this.send(c, { t: 'welcome', token, deviceId: d.id, name: d.name });
    const profileId = d.profileId && this.store.profile(d.profileId) ? d.profileId : this.firstProfileId();
    this.goToProfile(c, profileId);
    this.emit('deviceConnected', { deviceId: d.id, ip: c.ip });
    this.log.info('clients', 'connected', { deviceId: d.id, ip: c.ip });
  }

  private firstProfileId() { return this.store.profiles()[0].profile.id; }

  private goToProfile(c: Conn, profileId: string) {
    const f = this.store.profile(profileId); if (!f) return;
    c.profileId = profileId; c.folderId = f.profile.rootFolderId;
    this.pushDeck(c);
  }
  private goToFolder(c: Conn, folderId: string) {
    const f = this.store.profile(c.profileId);
    if (!f?.folders.some(d => d.id === folderId)) return this.log.debug('clients', 'open of a folder outside the profile', { folderId });
    c.folderId = folderId;
    this.pushDeck(c);
  }
  private pushDeck(c: Conn) {
    try { this.send(c, { t: 'deck', view: buildDeckView(this.store, c.profileId, c.folderId, this.liveOf, this.hidden) }); }
    catch (e) { this.log.error('clients', 'deck view failed', { error: String(e) }); }
  }
  private send(c: Conn, m: HostMsg) { if (c.sock.readyState === 1) c.sock.send(JSON.stringify(m)); }
  private toDevice(deviceId: string, m: HostMsg, authedOnly: boolean) { for (const c of this.conns) if (c.deviceId === deviceId && (!authedOnly || c.authed)) this.send(c, m); }

  /** Close sessions whose device was blocked, forgotten or had its token revoked. */
  private enforceDevices() {
    for (const c of this.conns) {
      if (!c.authed || !c.deviceId) continue;
      const d = this.store.device(c.deviceId);
      if (d?.blocked) { this.send(c, { t: 'blocked' }); c.sock.close(1008, 'blocked'); }
      else if (!d || !d.approved || !this.sessions.verify(d.id, c.token)) c.sock.close(4001, 'forgotten');
    }
  }

  // ---- used by the engine, editor and main ----
  broadcastDeckFor(profileId: string): void {
    for (const c of this.conns) {
      if (!c.authed || c.profileId !== profileId) continue;
      if (!this.store.folder(c.folderId)) c.folderId = this.store.profile(profileId)?.profile.rootFolderId ?? c.folderId;
      this.pushDeck(c);
    }
  }
  /** Whether a stateful button is on right now; set by the host's state watcher. */
  liveOf: (w: Widget) => Live = () => ({});
  /** Keys left off the decks: they open an app this PC does not have. */
  hidden: (w: Widget) => boolean = () => false;
  patch(widgetId: string, p: { look?: Partial<Look>; flash?: 'error' | 'ok' } & Live): void {
    const w = this.store.widget(widgetId); if (!w) return;
    for (const c of this.conns) if (c.authed && c.folderId === w.folderId) this.send(c, { t: 'patch', widgetId, ...p });
  }
  notify(target: string | 'all', text: string, vibrate = false): void {
    for (const c of this.conns) if (c.authed && (target === 'all' || c.deviceId === target)) this.send(c, { t: 'notify', text, vibrate });
  }
  switchProfile(deviceId: string, profileId: string): void { for (const c of this.conns) if (c.authed && c.deviceId === deviceId) { c.home = undefined; this.goToProfile(c, profileId); } }
  /**
   * The app in front changed. Devices that follow apps go to profileId, the profile that lists the app, remembering
   * where they were; with null (an app no profile lists) they go back there. A profile picked by hand stays.
   */
  followApp(profileId: string | null): void {
    for (const c of this.conns) {
      if (!c.authed || !c.deviceId || this.store.device(c.deviceId)?.followApps === false) continue;
      if (profileId) {
        if (c.profileId === profileId || !this.store.profile(profileId)) continue;
        c.home ??= c.profileId;
        this.goToProfile(c, profileId);
      } else if (c.home !== undefined) {
        const home = c.home; c.home = undefined;
        if (home !== c.profileId) this.goToProfile(c, this.store.profile(home) ? home : this.firstProfileId());
      }
    }
  }
  openFolder(deviceId: string, folderId: string | null): void {
    for (const c of this.conns) {
      if (!c.authed || c.deviceId !== deviceId) continue;
      if (folderId === null) { const cur = this.store.folder(c.folderId); if (cur?.parentId) this.goToFolder(c, cur.parentId); }
      else this.goToFolder(c, folderId);
    }
  }
  connected(): { deviceId: string; folderId: string; ip: string }[] {
    return [...this.conns].filter(c => c.authed && c.deviceId).map(c => ({ deviceId: c.deviceId!, folderId: c.folderId, ip: c.ip }));
  }
  count(): number { return [...this.conns].filter(c => c.authed).length; }
  closeAll(): void { for (const c of this.conns) c.sock.close(1001, 'host shutting down'); }
}
