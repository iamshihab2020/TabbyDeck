import { z } from 'zod';
import { LookSchema, TriggerKindSchema, type Device, type Look, type ProfileFile, type Settings, type TriggerKind } from './model.ts';
import type { ActionDefPublic } from './catalogue.ts';
import { BADGE_IDS } from './badges.ts';

// ---- client <-> host (LAN WebSocket) ----

/** How the deck was used over some days: presses per day, keys and apps by use (apps by minutes in front). */
export const StatsSummarySchema = z.object({
  days: z.array(z.object({ date: z.string(), presses: z.number() })),
  total: z.number(),
  busiest: z.object({ date: z.string(), presses: z.number() }).nullable(),
  /** id is the key's widget id, so the editor can light that very key. */
  keys: z.array(z.object({ id: z.string().optional(), label: z.string(), n: z.number() })),
  apps: z.array(z.object({ app: z.string(), minutes: z.number() })),
  /** Badges earned in the period, newest first. */
  badges: z.array(z.object({ id: z.enum(BADGE_IDS), date: z.string() })),
  /** The focus garden: Pomodoro focus stretches finished (a plant grows) and given up (one wilts), per day. */
  garden: z.array(z.object({ date: z.string(), plants: z.number(), wilted: z.number() })).optional(),
});
export type StatsSummary = z.infer<typeof StatsSummarySchema>;

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
/** A picture from the phone as a data: URL; the asset store still checks its type and its 1 MB limit. */
const PhoneImage = z.string().max(1_500_000).startsWith('data:image/');

export const ClientMsgSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    deviceId: z.string().min(1).max(64),
    name: z.string().max(64),
    token: z.string().max(128).optional(),
    clientVersion: z.string().max(32),
    caps: z.object({ vibrate: z.boolean(), wakeLock: z.boolean() }),
  }),
  z.object({ t: z.literal('press'), widgetId: z.string(), kind: TriggerKindSchema }),
  z.object({ t: z.literal('open'), folderId: z.string().nullable() }),
  z.object({ t: z.literal('profile'), profileId: z.string() }),
  z.object({ t: z.literal('ping'), sent: z.number() }),
  /** The "Your week" card asks for the last seven days. */
  z.object({ t: z.literal('stats') }),
  /** From the brightness panel: set one screen. widgetId is the panel's key, so only decks that have one can do this. */
  z.object({ t: z.literal('brightness'), widgetId: z.string(), screen: z.string().max(64), percent: z.number().min(0).max(100) }),
  /** From the volume panel: set the volume, or mute. widgetId is the panel's key, as for brightness. */
  z.object({
    t: z.literal('volume'), widgetId: z.string(), percent: z.number().min(0).max(100).optional(), mute: z.boolean().optional(),
    /** The level and mute are for this app only (an id from the panel's apps), not the whole PC. */
    app: z.string().max(64).regex(/^[^\u0000-\u001f'"`\u2018-\u201b]+$/, 'not an app name').optional(),
    /** Play through this output from now on (an id from the panel's outputs). */
    output: z.string().max(256).optional(),
  }),
  /** From the Bluetooth panel: turn Bluetooth on or off, or connect or disconnect a paired device (by its address). */
  z.object({ t: z.literal('bluetooth'), widgetId: z.string(), power: z.boolean().optional(), device: z.string().regex(/^[0-9a-f]{12}$/).optional(), connect: z.boolean().optional() }),
  /** From the trackpad: move the pointer by dx, dy; press or let go of a button; scroll (in notches, + is up); type text or press a key. */
  z.object({
    t: z.literal('pointer'), widgetId: z.string(),
    dx: z.number().min(-2000).max(2000).optional(), dy: z.number().min(-2000).max(2000).optional(),
    button: z.enum(['left', 'right', 'middle']).optional(), down: z.boolean().optional(),
    scroll: z.number().min(-50).max(50).optional(), scrollX: z.number().min(-50).max(50).optional(),
    text: z.string().max(2000).optional(), key: z.enum(['Enter', 'Backspace', 'Tab', 'Escape']).optional(),
  }),
  /**
   * Edit mode on the deck: change a key of the current profile, move it to x, y, or remove it. image is a data: URL
   * the phone made (a photo or GIF), null takes the picture off. Only devices the PC lets edit can do this.
   */
  z.object({
    t: z.literal('edit'), widgetId: z.string().max(64),
    label: z.string().max(40).optional(), icon: z.string().regex(/^[a-z0-9-]{1,48}$/).nullable().optional(),
    bg: Hex.optional(), image: PhoneImage.nullable().optional(),
    x: z.number().int().min(0).max(11).optional(), y: z.number().int().min(0).max(7).optional(),
    /** A Timer key's minutes, or a Pomodoro key's focus and break minutes. */
    minutes: z.number().int().min(1).max(600).optional(), focus: z.number().int().min(1).max(180).optional(), rest: z.number().int().min(1).max(60).optional(),
    remove: z.literal(true).optional(),
  }),
  /** Edit mode: the current profile's background, a ready-made one (isBackground) or a photo; image null removes the photo. */
  z.object({ t: z.literal('background'), bg: z.string().max(200).optional(), image: PhoneImage.nullable().optional() }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export const ScreenSchema = z.object({ id: z.string(), name: z.string(), brightness: z.number() });
export type Screen = z.infer<typeof ScreenSchema>;

/** A paired Bluetooth device. id is its address; audio devices (headphones, speakers) can be connected from the tablet. */
export const BtDeviceSchema = z.object({ id: z.string(), name: z.string(), audio: z.boolean(), connected: z.boolean() });
export type BtDevice = z.infer<typeof BtDeviceSchema>;
/** A sound output (speakers, headphones, a monitor's speakers); isDefault is the one Windows plays through. */
export const AudioOutputSchema = z.object({ id: z.string(), name: z.string(), isDefault: z.boolean() });
export type AudioOutput = z.infer<typeof AudioOutputSchema>;
/** A profile of a browser on this PC (Chrome, Edge, Brave): id is "chrome:Profile 5", name is what the browser calls it. */
export const BrowserProfileSchema = z.object({ id: z.string(), browser: z.string(), name: z.string() });
export type BrowserProfile = z.infer<typeof BrowserProfileSchema>;
/** One app in the volume mixer. id is its program name (chrome), the same for all its windows and tabs. */
export const AppSoundSchema = z.object({ id: z.string(), name: z.string(), level: z.number(), muted: z.boolean() });
export type AppSound = z.infer<typeof AppSoundSchema>;
export const BluetoothSchema = z.object({ available: z.boolean(), on: z.boolean(), devices: z.array(BtDeviceSchema) });
export type Bluetooth = z.infer<typeof BluetoothSchema>;

export const WidgetViewSchema = z.object({
  id: z.string(),
  kind: z.enum(['button', 'folder']),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  look: LookSchema,
  value: z.string().optional(),
  /** For buttons that show a PC state: how the key looks while it is on, and whether it is on now. */
  alt: LookSchema.partial().optional(),
  active: z.boolean().optional(),
  /** A key that opens or switches to an app: whether that app has a window open on the PC now. */
  running: z.boolean().optional(),
  /** A level key (Volume +) that can go no further: shown greyed out, presses do nothing. */
  disabled: z.boolean().optional(),
  /** Holding the key repeats it (Volume +, Brightness −). */
  repeat: z.boolean().optional(),
  /** The key has its own Long press steps: holding does only those, and a press goes on release. */
  hold: z.boolean().optional(),
  /** The key opens a panel on the tablet; for brightness, the screens it lists; for volume, the level and mute. */
  panel: z.enum(['brightness', 'volume', 'bluetooth', 'trackpad']).optional(),
  /** Large text in place of the icon: a level (CPU 23%), the time, a timer's countdown. */
  big: z.string().optional(),
  bluetooth: BluetoothSchema.optional(),
  screens: z.array(ScreenSchema).optional(),
  level: z.number().optional(),
  muted: z.boolean().optional(),
  /** The volume panel's mixer: each app's own volume, and the outputs to choose from. */
  apps: z.array(AppSoundSchema).optional(),
  outputs: z.array(AudioOutputSchema).optional(),
  /** Set for buttons that turn the PC off, lock it and the like: the tablet asks first and shows this text. */
  confirm: z.string().optional(),
  /** A Timer key's minutes, or a Pomodoro key's focus and break minutes, for edit mode on the tablet. */
  timer: z.object({ minutes: z.number().optional(), focus: z.number().optional(), rest: z.number().optional() }).optional(),
});
export type WidgetView = z.infer<typeof WidgetViewSchema>;

export const DeckViewSchema = z.object({
  profileId: z.string(),
  profileName: z.string(),
  profiles: z.array(z.object({ id: z.string(), name: z.string() })),
  folderId: z.string(),
  path: z.array(z.object({ id: z.string(), name: z.string() })),
  cols: z.number(), rows: z.number(), gap: z.number(),
  bg: z.string(),
  bgImage: z.string().optional(),
  /** How the keys are drawn (keycap when missing). */
  tiles: z.enum(['keycap', 'sunken', 'soft', 'glass', 'pad', 'outline']).optional(),
  /** The cat under the keys, as set on the PC. */
  cat: z.object({ on: z.boolean(), name: z.string() }).optional(),
  /** Snow and pumpkins on the keys in their season; off when the PC turned them off. */
  season: z.boolean().optional(),
  /** For this device: whether it may edit keys, and whether it shows "What's new" after an update. */
  edit: z.boolean().optional(),
  news: z.boolean().optional(),
  widgets: z.array(WidgetViewSchema),
});
export type DeckView = z.infer<typeof DeckViewSchema>;

export const HostMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('pairRequired'), code: z.string().regex(/^\d{6}$/) }),
  z.object({ t: z.literal('welcome'), token: z.string(), deviceId: z.string(), name: z.string() }),
  z.object({ t: z.literal('denied') }),
  z.object({ t: z.literal('blocked') }),
  z.object({ t: z.literal('timeout') }),
  z.object({ t: z.literal('deck'), view: DeckViewSchema }),
  z.object({ t: z.literal('patch'), widgetId: z.string(), look: LookSchema.partial().optional(), value: z.string().optional(), flash: z.enum(['error', 'ok']).optional(), active: z.boolean().optional(), running: z.boolean().optional(), disabled: z.boolean().optional(), screens: z.array(ScreenSchema).optional(), level: z.number().optional(), muted: z.boolean().optional(), bluetooth: BluetoothSchema.optional(), apps: z.array(AppSoundSchema).optional(), outputs: z.array(AudioOutputSchema).optional(), big: z.string().optional() }),
  /** alarm: a timer or Pomodoro stretch ran out, so the deck rings as well. */
  z.object({ t: z.literal('notify'), text: z.string(), vibrate: z.boolean().optional(), alarm: z.boolean().optional() }),
  /** What the PC is up to, for the deck's cat: music playing (it wears headphones), a Pomodoro focus running (glasses). */
  z.object({ t: z.literal('mood'), playing: z.boolean(), focus: z.boolean(), meeting: z.boolean().optional(), timer: z.boolean().optional(),
    /** Today's focus garden: plants grown and wilted. */
    plants: z.number().optional(), wilted: z.number().optional() }),
  z.object({ t: z.literal('stats'), summary: StatsSummarySchema }),
  /** A badge was just earned: every deck shows it for a moment. */
  z.object({ t: z.literal('badge'), id: z.enum(BADGE_IDS) }),
  z.object({ t: z.literal('pong'), sent: z.number(), hostTime: z.number() }),
]);
export type HostMsg = z.infer<typeof HostMsgSchema>;

// ---- editor <-> host (loopback WebSocket) ----

export const EDITOR_COMMANDS = [
  'profile.create', 'profile.update', 'profile.delete', 'profile.reorder',
  'folder.create', 'folder.update', 'folder.delete',
  'widget.create', 'widget.update', 'widget.move', 'widget.moveMany', 'widget.delete', 'widget.duplicate',
  'asset.upload', 'asset.delete',
  'device.approve', 'device.deny', 'device.block', 'device.unblock', 'device.forget', 'device.update',
  'action.test', 'settings.update', 'export', 'import', 'log.clear', 'editor.openDataDir', 'host.pause', 'display.screens', 'apps.list', 'apps.icon', 'windows.list', 'audio.outputs', 'browsers.list', 'profile.template', 'network.check', 'stats.get',
] as const;
export type EditorCommandName = (typeof EDITOR_COMMANDS)[number];

export const EditorMsgSchema = z.object({ t: z.literal('cmd'), id: z.string(), name: z.enum(EDITOR_COMMANDS), args: z.unknown() });
export type EditorMsg = z.infer<typeof EditorMsgSchema>;

export interface LogLine {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  msg: string;
  data?: Record<string, unknown>;
}

export interface EditorState {
  profiles: ProfileFile[];
  devices: Device[];
  connected: { deviceId: string; folderId: string; ip: string }[];
  pending: { deviceId: string; name: string; ip: string; since: string }[];
  settings: Settings;
  catalogue: ActionDefPublic[];
  connect: { urls: string[]; interfaces: { name: string; ip: string }[] };
  assets: { id: string; name: string }[];
  log: LogLine[];
  version: string;
  paused: boolean;
  /** Keys that open an app this PC does not have: the decks leave them out. */
  missing: string[];
  /** When this TabbyDeck started. An editor page that sees it change reloads, so it runs the code that host serves. */
  startedAt?: number;
}

export type HostToEditorMsg =
  | { t: 'state'; state: EditorState }
  | { t: 'result'; id: string; ok: boolean; error?: string; data?: unknown }
  | { t: 'event'; kind: 'pairRequest' | 'log' | 'actionError' | 'deviceConnected' | 'deviceDisconnected'; data: unknown };

export type { Look, TriggerKind };
