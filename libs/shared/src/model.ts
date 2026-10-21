import { z } from 'zod';
import { newId } from './ids.ts';

/** Ids are used in file names, so they are restricted to a safe alphabet. */
export const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid id');

export const TriggerKindSchema = z.enum(['press', 'long', 'double', 'release']);
export type TriggerKind = z.infer<typeof TriggerKindSchema>;
export const TRIGGER_KINDS = TriggerKindSchema.options;

export const LookSchema = z.object({
  bg: z.string(),
  fg: z.string(),
  icon: z.string().optional(),
  image: z.string().optional(),
  /** 'icon' draws the image at icon size with the label below (app icons); otherwise it fills the tile. */
  imageFit: z.enum(['cover', 'icon']).optional(),
  iconScale: z.number(),
  iconX: z.number(),
  iconY: z.number(),
  iconOpacity: z.number(),
  label: z.string().optional(),
  labelPos: z.enum(['top', 'center', 'bottom']),
  labelSize: z.number(),
  font: z.string().optional(),
  radius: z.number(),
  border: z.object({ color: z.string(), width: z.number() }).optional(),
});
export type Look = z.infer<typeof LookSchema>;

export const ProfileSchema = z.object({
  id: IdSchema,
  name: z.string(),
  cols: z.number().int().min(1).max(12),
  rows: z.number().int().min(1).max(8),
  gap: z.number().min(0).max(24),
  bg: z.string(),
  bgImage: z.string().optional(),
  rootFolderId: IdSchema,
  order: z.number(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const FolderSchema = z.object({
  id: IdSchema,
  profileId: IdSchema,
  parentId: IdSchema.nullable(),
  name: z.string(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const StepSchema = z.object({
  id: IdSchema,
  action: z.string(),
  params: z.record(z.string(), z.unknown()),
  continueOnError: z.boolean().optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const ButtonConfigSchema = z.object({
  kind: z.literal('button'),
  triggers: z.object({
    press: z.array(StepSchema).optional(),
    long: z.array(StepSchema).optional(),
    double: z.array(StepSchema).optional(),
    release: z.array(StepSchema).optional(),
  }),
  policy: z.enum(['ignore', 'queue', 'cancel']),
});
export type ButtonConfig = z.infer<typeof ButtonConfigSchema>;

export const FolderConfigSchema = z.object({ kind: z.literal('folder'), targetFolderId: IdSchema });
export type FolderConfig = z.infer<typeof FolderConfigSchema>;

export const WidgetSchema = z.object({
  id: IdSchema,
  folderId: IdSchema,
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  look: LookSchema,
  config: z.discriminatedUnion('kind', [ButtonConfigSchema, FolderConfigSchema]),
});
export type Widget = z.infer<typeof WidgetSchema>;

export const DeviceSchema = z.object({
  id: IdSchema,
  name: z.string(),
  approved: z.boolean(),
  blocked: z.boolean(),
  profileId: IdSchema.optional(),
  tokenHash: z.string().optional(),
  lastSeen: z.string(),
  createdAt: z.string(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const VariableSchema = z.object({
  key: z.string(),
  type: z.enum(['string', 'number', 'boolean']),
  value: z.union([z.string(), z.number(), z.boolean()]),
  persist: z.boolean(),
  source: z.string(),
});
export type Variable = z.infer<typeof VariableSchema>;

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  port: z.number().int().min(1).max(65535),
  editorPort: z.number().int().min(1).max(65535),
  bindAddress: z.string(),
  autoStart: z.boolean(),
  theme: z.enum(['dark', 'light']),
  openEditorOnStart: z.boolean(),
  /** The first-run guide was finished or skipped. */
  guideDone: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const ProfileFileSchema = z.object({
  version: z.literal(1),
  profile: ProfileSchema,
  folders: z.array(FolderSchema),
  widgets: z.array(WidgetSchema),
});
export type ProfileFile = z.infer<typeof ProfileFileSchema>;

export const DEFAULT_LOOK: Look = {
  bg: '#25221f', fg: '#efeae3', iconScale: 1, iconX: 0, iconY: 0, iconOpacity: 1,
  labelPos: 'bottom', labelSize: 14, radius: 16,
};

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1, port: 8191, editorPort: 8192, bindAddress: '', autoStart: false, theme: 'dark', openEditorOnStart: true, guideDone: false,
};

/** A new profile file with an empty root folder. */
export function newProfileFile(name: string, cols: number, rows: number, order = 0): ProfileFile {
  const id = newId();
  const rootFolderId = newId();
  return {
    version: 1,
    profile: { id, name, cols, rows, gap: 8, bg: '#121110', rootFolderId, order },
    folders: [{ id: rootFolderId, profileId: id, parentId: null, name }],
    widgets: [],
  };
}

/** First-run profile: 5x3 "Main" with one Notepad button at 0,0. */
export function defaultProfileFile(): ProfileFile {
  const f = newProfileFile('Main', 5, 3);
  f.widgets.push({
    id: newId(), folderId: f.profile.rootFolderId, x: 0, y: 0, w: 1, h: 1,
    look: { ...DEFAULT_LOOK, label: 'Notepad', icon: 'notepad' },
    config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: newId(), action: 'system.launch', params: { path: 'notepad.exe' } }] } },
  });
  return f;
}
