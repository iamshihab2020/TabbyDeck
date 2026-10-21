import { z } from 'zod';
import { LookSchema, TriggerKindSchema, type Device, type Look, type ProfileFile, type Settings, type TriggerKind } from './model.ts';
import type { ActionDefPublic } from './catalogue.ts';

// ---- client <-> host (LAN WebSocket) ----

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
  /** From the brightness panel: set one screen. widgetId is the panel's key, so only decks that have one can do this. */
  z.object({ t: z.literal('brightness'), widgetId: z.string(), screen: z.string().max(64), percent: z.number().min(0).max(100) }),
  /** From the volume panel: set the volume, or mute. widgetId is the panel's key, as for brightness. */
  z.object({ t: z.literal('volume'), widgetId: z.string(), percent: z.number().min(0).max(100).optional(), mute: z.boolean().optional() }),
  /** From the Bluetooth panel: turn Bluetooth on or off, or connect or disconnect a paired device (by its address). */
  z.object({ t: z.literal('bluetooth'), widgetId: z.string(), power: z.boolean().optional(), device: z.string().regex(/^[0-9a-f]{12}$/).optional(), connect: z.boolean().optional() }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export const ScreenSchema = z.object({ id: z.string(), name: z.string(), brightness: z.number() });
export type Screen = z.infer<typeof ScreenSchema>;

/** A paired Bluetooth device. id is its address; audio devices (headphones, speakers) can be connected from the tablet. */
export const BtDeviceSchema = z.object({ id: z.string(), name: z.string(), audio: z.boolean(), connected: z.boolean() });
export type BtDevice = z.infer<typeof BtDeviceSchema>;
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
  /** A level key (Volume +) that can go no further: shown greyed out, presses do nothing. */
  disabled: z.boolean().optional(),
  /** Holding the key repeats it (Volume +, Brightness −). */
  repeat: z.boolean().optional(),
  /** The key opens a panel on the tablet; for brightness, the screens it lists; for volume, the level and mute. */
  panel: z.enum(['brightness', 'volume', 'bluetooth']).optional(),
  bluetooth: BluetoothSchema.optional(),
  screens: z.array(ScreenSchema).optional(),
  level: z.number().optional(),
  muted: z.boolean().optional(),
  /** Set for buttons that turn the PC off, lock it and the like: the tablet asks first and shows this text. */
  confirm: z.string().optional(),
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
  z.object({ t: z.literal('patch'), widgetId: z.string(), look: LookSchema.partial().optional(), value: z.string().optional(), flash: z.enum(['error', 'ok']).optional(), active: z.boolean().optional(), disabled: z.boolean().optional(), screens: z.array(ScreenSchema).optional(), level: z.number().optional(), muted: z.boolean().optional(), bluetooth: BluetoothSchema.optional() }),
  z.object({ t: z.literal('notify'), text: z.string(), vibrate: z.boolean().optional() }),
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
  'action.test', 'settings.update', 'export', 'import', 'log.clear', 'editor.openDataDir', 'host.pause', 'display.screens', 'apps.list', 'apps.icon',
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
}

export type HostToEditorMsg =
  | { t: 'state'; state: EditorState }
  | { t: 'result'; id: string; ok: boolean; error?: string; data?: unknown }
  | { t: 'event'; kind: 'pairRequest' | 'log' | 'actionError' | 'deviceConnected' | 'deviceDisconnected'; data: unknown };

export type { Look, TriggerKind };
