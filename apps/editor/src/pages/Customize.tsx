import { useState } from 'preact/hooks';
import type { TileStyle } from '@tabbydeck/shared';
import { useApi, useSnapshot } from '../state.ts';
import { StyleCards, styleName } from '../components/KeyStyle.tsx';
import { toast } from '../components/Toast.tsx';
import { BACKGROUNDS } from '@tabbydeck/shared/backgrounds';

/** How TabbyDeck looks and feels on phones and tablets: the key style, the background, the cat and the seasons. */
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
      <BackgroundSettings ids={one ? [one.profile.id] : profiles.map(f => f.profile.id)} name={one?.profile.name} current={(one ?? profiles[0]).profile} />
      <CatSettings />
      <SeasonSettings />
    </section>
  );
}

/** Behind the keys: a ready-made colour or gradient, your own colour, or a photo. Phones can set it too, in edit mode. */
function BackgroundSettings({ ids, name, current }: { ids: string[]; name?: string; current: { bg: string; bgImage?: string } }) {
  const api = useApi();
  const set = async (patch: { bg?: string; bgImage?: string | null }, text: string) => {
    for (const id of ids) await api.cmd('profile.update', { id, patch }).catch(() => {});
    toast(name ? `${name}: ${text}` : `Every profile: ${text}`, 'ok');
  };
  const upload = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1024 * 1024) return toast('That image is over 1 MB. Use a smaller one.', 'error');
    const r = new FileReader();
    r.onload = () => void api.cmd<{ id: string }>('asset.upload', { name: f.name, dataUrl: String(r.result) }).then(a => set({ bgImage: a.id }, 'photo background')).catch(() => {});
    r.readAsDataURL(f);
  };
  const plain = /^#[0-9a-f]{6}$/i.test(current.bg) ? current.bg : '#121110';
  return (
    <>
      <h2 class="custom-h">Background</h2>
      <p class="muted">Behind the keys on every phone and tablet. Glass keys show it through them. A photo covers the colour.</p>
      <div class="bg-choices" role="radiogroup" aria-label="Background">
        {BACKGROUNDS.map(b => {
          const on = !current.bgImage && current.bg === b.bg;
          return <button key={b.name} type="button" role="radio" aria-checked={on} class={on ? 'bg-choice on' : 'bg-choice'} style={{ background: b.bg }} onClick={() => void set({ bg: b.bg, bgImage: null }, `${b.name} background`)}><span>{b.name}</span></button>;
        })}
      </div>
      <div class="bg-actions">
        <label class="btn small">Your colour<input type="color" value={plain} onChange={e => void set({ bg: (e.target as HTMLInputElement).value, bgImage: null }, 'your colour')} /></label>
        <label class="btn small">Photo<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const i = e.target as HTMLInputElement; upload(i.files?.[0]); i.value = ''; }} /></label>
        {current.bgImage && <button type="button" class="btn small" onClick={() => void set({ bgImage: null }, 'photo removed')}>Remove photo</button>}
      </div>
    </>
  );
}

/** Snow on the keys in December, pumpkins in the last week of October. */
function SeasonSettings() {
  const api = useApi();
  const { state } = useSnapshot();
  const on = state!.settings.seasonOn !== false;
  const save = (seasonOn: boolean) => void api.cmd('settings.update', { patch: { seasonOn } }).catch(() => {});
  return (
    <>
      <h2 class="custom-h">Seasonal touches</h2>
      <p class="muted">Snow settles on the tops of the keys in December, and pumpkins sit on some keys in the last week of October.</p>
      <div class="segmented cat-toggle" role="radiogroup" aria-label="Seasonal touches">
        <button type="button" role="radio" aria-checked={on} class={on ? 'seg on' : 'seg'} onClick={() => save(true)}>On</button>
        <button type="button" role="radio" aria-checked={!on} class={!on ? 'seg on' : 'seg'} onClick={() => save(false)}>Off</button>
      </div>
    </>
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
