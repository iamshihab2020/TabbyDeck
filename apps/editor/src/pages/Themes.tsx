import { useState } from 'preact/hooks';
import type { TileStyle } from '@tabbydeck/shared';
import { useApi, useSnapshot } from '../state.ts';
import { StyleCards, styleName } from '../components/KeyStyle.tsx';
import { toast } from '../components/Toast.tsx';

/** How the keys look on phones and tablets: one style for every profile, or a different one for each. */
export function ThemesPage() {
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
    <section class="simple-page themes-page" aria-labelledby="h-themes">
      <h1 id="h-themes">Themes</h1>
      <p class="muted">How the keys look on your phones and tablets. Choose one style for every profile, or a different one for each.</p>
      <div class="chips theme-target" role="radiogroup" aria-label="Apply to">
        <button type="button" role="radio" aria-checked={target === 'all'} class={target === 'all' ? 'chip on' : 'chip'} onClick={() => setTarget('all')}>All profiles</button>
        {profiles.map(f => (
          <button key={f.profile.id} type="button" role="radio" aria-checked={target === f.profile.id} class={target === f.profile.id ? 'chip on' : 'chip'} onClick={() => setTarget(f.profile.id)}>{f.profile.name}</button>
        ))}
      </div>
      <StyleCards file={one ?? profiles[0]} on={one ? styleOf(one.profile.id) : same ? styleOf(profiles[0].profile.id) : undefined}
        used={one ? undefined : used} onPick={s => void pick(s)} />
    </section>
  );
}
