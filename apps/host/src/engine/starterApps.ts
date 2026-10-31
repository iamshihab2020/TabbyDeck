import type { Native } from '../native/types.ts';
import type { Store } from '../store/store.ts';
import type { AssetStore } from '../assets/store.ts';

/**
 * A fresh install's decks name apps by their usual Start id. Once, on the first start, each such key is pointed at the
 * app this PC has (found by id, or else by the key's name) and given the app's own icon. Keys for apps the PC does not
 * have are left as they are; the decks leave them off until the app is installed.
 */
export async function fitStarterApps(d: { store: Store; assets: AssetStore; native: Native }): Promise<void> {
  const list = await d.native.system.listApps().catch(() => []);
  const ids = new Map(list.map(a => [a.id.toLowerCase(), a.id])), names = new Map(list.map(a => [a.name.toLowerCase(), a.id]));
  for (const w of d.store.profiles().flatMap(f => f.widgets)) {
    if (w.config.kind !== 'button' || w.look.image) continue;
    const press = w.config.triggers.press ?? [];
    const i = press.findIndex(s => s.action === 'system.launch' && /^shell:AppsFolder\\/i.test(String(s.params.path)));
    if (i < 0) continue;
    const id = ids.get(String(press[i].params.path).slice(17).toLowerCase()) ?? names.get((w.look.label ?? '').toLowerCase());
    if (!id) continue;
    // a key that does more than open the app (Warp + Claude) keeps its own icon
    const png = press.length === 1 ? await d.native.system.appIcon(id, 128).catch(() => null) : null;
    const image = png ? (await d.assets.save(`${w.look.label}.png`, `data:image/png;base64,${png.toString('base64')}`)).id : undefined;
    const fixed = press.map((s, j) => j === i ? { ...s, params: { ...s.params, path: `shell:AppsFolder\\${id}` } } : s);
    d.store.updateWidget(w.id, { look: { ...w.look, ...(image ? { image, imageFit: 'icon' as const } : {}) }, config: { ...w.config, triggers: { ...w.config.triggers, press: fixed } } });
  }
}
