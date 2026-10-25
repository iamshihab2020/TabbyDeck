import { useState } from 'preact/hooks';
import type { TileStyle } from '@tabbydeck/shared';
import { useApi, useSnapshot } from '../state.ts';
import { StyleCards, styleName } from '../components/KeyStyle.tsx';
import { toast } from '../components/Toast.tsx';

/** How TabbyDeck looks and feels on phones and tablets: the key style, and the cat. */
export function CustomizePage() {
  const api = useApi();
  const { state } = useSnapshot();
  const profiles = state!.profiles;
  const [target, setTarget] = useState<string>('all'); // 'all' or a profile id
  const one = profiles.find(f => f.profile.id === target);
  const styleOf = (id: string) => profiles.find(f => f.profile.id === id)?.profile.tiles ?? 'keycap';
  const used: Partial<Record<TileStyle, string[]>> = {};
  for (const f of profiles) (used[f.profile.tiles ?? 'keycap'] ??= []).push(f.profile.name);
  const same = new Set(profiles.map(f => f.profile.tiles ?? 'keycap')).size === 1;
  const pick = async (tiles: TileStyle) => {
    const ids = one ? [one.profile.id] : profiles.map(f => f.profile.id);
    for (const id of ids) await api.cmd('profile.update', { id, patch: { tiles } }).catch(() => {});
    toast(one ? `${one.profile.name} uses ${styleName(tiles)} keys` : `Every profile uses ${styleName(tiles)} keys`, 'ok');
  };
  return (
    <section class="simple-page themes-page" aria-labelledby="h-custom">
      <h1 id="h-custom">Customize</h1>
      <p class="muted">How TabbyDeck looks and feels on your phones and tablets.</p>
      <h2 class="custom-h">Key style</h2>
      <p class="muted">Choose one style for every profile, or a different one for each.</p>
      <div class="chips theme-target" role="radiogroup" aria-label="Apply to">
        <button type="button" role="radio" aria-checked={target === 'all'} class={target === 'all' ? 'chip on' : 'chip'} onClick={() => setTarget('all')}>All profiles</button>
        {profiles.map(f => (
          <button key={f.profile.id} type="button" role="radio" aria-checked={target === f.profile.id} class={target === f.profile.id ? 'chip on' : 'chip'} onClick={() => setTarget(f.profile.id)}>{f.profile.name}</button>
        ))}
      </div>
      <StyleCards file={one ?? profiles[0]} on={one ? styleOf(one.profile.id) : same ? styleOf(profiles[0].profile.id) : undefined}
        used={one ? undefined : used} onPick={s => void pick(s)} />
      <CatSettings />
    </section>
  );
}

/** The cat under the keys on every deck: on or off, and its name. */
function CatSettings() {
  const api = useApi();
  const { state } = useSnapshot();
  const on = state!.settings.catOn !== false, saved = state!.settings.catName || 'Tabby';
  const [name, setName] = useState(saved);
  const save = (patch: { catOn?: boolean; catName?: string }) => void api.cmd('settings.update', { patch }).catch(() => {});
  return (
    <>
      <h2 class="custom-h">The cat</h2>
      <p class="muted">A tabby cat lives under the keys on every phone and tablet. It naps when the deck is idle, runs to where you tap empty space, and dresses for the season and for what your PC is doing.</p>
      <div class="cat-settings">
        <div class="segmented cat-toggle" role="radiogroup" aria-label="Show the cat">
          <button type="button" role="radio" aria-checked={on} class={on ? 'seg on' : 'seg'} onClick={() => save({ catOn: true })}>On</button>
          <button type="button" role="radio" aria-checked={!on} class={!on ? 'seg on' : 'seg'} onClick={() => save({ catOn: false })}>Off</button>
        </div>
        <label class="field cat-name-field">
          <span class="field-label">Its name</span>
          <input class="input" value={name} maxLength={20} placeholder="Tabby" disabled={!on}
            onInput={e => setName((e.target as HTMLInputElement).value)}
            onBlur={() => { const n = name.trim() || 'Tabby'; setName(n); if (n !== saved) { save({ catName: n }); toast(`The cat is called ${n}`, 'ok'); } }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </label>
      </div>
    </>
  );
}
