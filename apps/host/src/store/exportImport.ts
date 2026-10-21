import { z } from 'zod';
import {
  DeviceSchema, ProfileFileSchema, VariableSchema, newId,
  type ProfileFile, type Variable, type Device, type Step,
} from '@tabbydeck/shared';
import { profileFileProblem, type Store } from './store.ts';
import type { AssetStore } from '../assets/store.ts';
import { contentTypeOf } from '../assets/source.ts';

const ExportSchema = z.object({
  format: z.literal('tabbydeck-export'),
  version: z.literal(1),
  exportedAt: z.string(),
  profiles: z.array(ProfileFileSchema),
  devices: z.array(DeviceSchema.omit({ tokenHash: true })),
  variables: z.array(VariableSchema),
  settings: z.object({ theme: z.enum(['dark', 'light']), autoStart: z.boolean(), openEditorOnStart: z.boolean() }),
  assets: z.array(z.object({ id: z.string(), dataUrl: z.string() })),
});
export type TabbyExport = z.infer<typeof ExportSchema>;
export interface ImportResult { profiles: number; widgets: number; assets: number; warnings: string[] }

/** Everything needed to rebuild the deck elsewhere. Device tokens and network settings are left out on purpose. */
export function exportAll(store: Store, assets: AssetStore): TabbyExport {
  const s = store.settings();
  return {
    format: 'tabbydeck-export', version: 1, exportedAt: new Date().toISOString(),
    profiles: store.profiles(),
    devices: store.devices().map(({ tokenHash: _t, ...d }) => d),
    variables: store.variables().filter(v => v.persist),
    settings: { theme: s.theme, autoStart: s.autoStart, openEditorOnStart: s.openEditorOnStart },
    assets: assets.list().map(a => ({ id: a.id, dataUrl: `data:${contentTypeOf(a.id)};base64,${assets.read(a.id)!.toString('base64')}` })),
  };
}

/** Give every id in a profile a fresh one, keeping folder links, parents and step parameters pointing at the right things. */
function reId(f: ProfileFile): ProfileFile {
  const map = new Map<string, string>();
  const fresh = (old: string) => { if (!map.has(old)) map.set(old, newId()); return map.get(old)!; };
  fresh(f.profile.id);
  for (const d of f.folders) fresh(d.id);
  const m = (id: string) => map.get(id) ?? id;
  const steps = (l?: Step[]) => l?.map(s => ({ ...s, id: newId(), params: Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, typeof v === 'string' ? m(v) : v])) }));
  return {
    version: 1,
    profile: { ...f.profile, id: m(f.profile.id), rootFolderId: m(f.profile.rootFolderId) },
    folders: f.folders.map(d => ({ ...d, id: m(d.id), profileId: m(d.profileId), parentId: d.parentId ? m(d.parentId) : null })),
    widgets: f.widgets.map(w => ({
      ...w, id: newId(), folderId: m(w.folderId),
      config: w.config.kind === 'folder'
        ? { kind: 'folder' as const, targetFolderId: m(w.config.targetFolderId) }
        : { ...w.config, triggers: { press: steps(w.config.triggers.press), long: steps(w.config.triggers.long), double: steps(w.config.triggers.double), release: steps(w.config.triggers.release) } },
    })),
  };
}

/**
 * Restore a backup. "replace" swaps the whole deck for the backup (ids kept); "merge" adds the backup's profiles
 * alongside the current ones with fresh ids. Everything is validated before anything changes.
 */
export async function importAll(store: Store, assets: AssetStore, data: unknown, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const parsed = ExportSchema.safeParse(data);
  if (!parsed.success) throw new Error('This file is not a TabbyDeck backup');
  const ex = parsed.data;
  for (const f of ex.profiles) { const p = profileFileProblem(f); if (p) throw new Error(`The backup has a damaged profile "${f.profile.name}": ${p}`); }
  if (mode === 'replace' && ex.profiles.length === 0) throw new Error('The backup has no profiles');

  let assetCount = 0;
  for (const a of ex.assets) { try { await assets.save(a.id, a.dataUrl); assetCount++; } catch { /* skipped; reported per button below */ } }
  const have = new Set(assets.list().map(a => a.id));

  const warnings: string[] = [];
  const files = ex.profiles.map(f => {
    const g = mode === 'merge' ? reId(f) : structuredClone(f);
    for (const w of g.widgets) {
      if (w.look.image && !have.has(w.look.image)) {
        warnings.push(`"${w.look.label ?? 'A button'}" in ${g.profile.name} lost its image, which was not in the backup`);
        delete w.look.image;
      }
    }
    return g;
  });

  const before = store.profiles().map(f => f.profile.id);
  const base = mode === 'merge' ? before.length : 0;
  files.forEach((f, i) => store.putProfileFile({ ...f, profile: { ...f.profile, order: base + i } }));
  if (mode === 'replace') for (const id of before) if (!files.some(f => f.profile.id === id)) store.deleteProfile(id);

  for (const v of ex.variables as Variable[]) store.setVariable(v.key, v.value, { persist: true, source: v.source });
  for (const d of ex.devices as Device[]) if (!store.device(d.id)) store.upsertDevice({ ...d, approved: false });
  store.updateSettings(ex.settings);

  return { profiles: files.length, widgets: files.reduce((n, f) => n + f.widgets.length, 0), assets: assetCount, warnings };
}
