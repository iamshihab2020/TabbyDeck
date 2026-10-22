import { useState } from 'preact/hooks';
import { DEFAULT_LOOK, TILE_STYLES, type ProfileFile, type TileStyle, type WidgetView } from '@tabbydeck/shared';
import { Icon, Tile } from '@tabbydeck/ui';
import { useApi } from '../state.ts';
import { Modal } from './Modal.tsx';

const ABOUT: Record<TileStyle, { name: string; text: string }> = {
  keycap: { name: 'Keycap', text: 'Raised keys with a lip that press down, like a mechanical keyboard.' },
  sunken: { name: 'Sunken', text: 'Set into the panel like a dashboard switch; a press goes deeper.' },
  soft: { name: 'Soft', text: 'Soft-touch rubber lit from one side. Pressing sinks the key into the surface.' },
  glass: { name: 'Glass', text: 'Tinted see-through acrylic with a bright edge and a glow behind the deck.' },
  pad: { name: 'Pad', text: 'Matte drum-machine pads with a strip of light that fills the key when pressed.' },
  outline: { name: 'Outline', text: 'Clear keys drawn with a thin line. Quiet, for decks with many keys.' },
};

// Three keys from this profile (or stand-ins) so each style is judged on the deck's own colours.
const sample = (file: ProfileFile): WidgetView[] => {
  const own = file.widgets.filter(w => w.folderId === file.profile.rootFolderId && !w.look.image).slice(0, 3).map(w => w.look);
  const looks = own.length === 3 ? own : [
    { ...DEFAULT_LOOK, label: 'Play', icon: 'play', bg: '#f5a524', fg: '#2a1a00' },
    { ...DEFAULT_LOOK, label: 'Volume', icon: 'speaker-high' },
    { ...DEFAULT_LOOK, label: 'Night', icon: 'moon-stars', bg: '#2b2440', fg: '#fcd34d' },
  ];
  return looks.map((look, i) => ({ id: `s${i}`, kind: 'button', x: i, y: 0, w: 1, h: 1, look: { ...look, labelSize: 11 } }));
};

/**
 * The six styles as cards, each drawing three keys from the given profile in that style. used lists, per style, the
 * profiles that use it now (the Themes page shows them); on marks the chosen one.
 */
export function StyleCards({ file, on, used, onPick }: { file: ProfileFile; on?: TileStyle; used?: Partial<Record<TileStyle, string[]>>; onPick(s: TileStyle): void }) {
  const keys = sample(file), cell = { w: 66, h: 66 };
  return (
    <div class="style-grid" role="radiogroup" aria-label="Key style">
      {TILE_STYLES.map(s => (
        <button key={s} type="button" role="radio" aria-checked={on === s} class={on === s ? 'style-card on' : 'style-card'} onClick={() => onPick(s)}>
          <span class={`style-stage tb-grid tiles-${s}`} style={{ background: file.profile.bg }} aria-hidden="true">
            {keys.map((w, i) => (
              <Tile key={w.id} widget={w} cell={cell} assetUrl={() => ''} tabIndex={-1}
                style={{ left: `${14 + i * (cell.w + 12)}px`, top: '16px', width: `${cell.w}px`, height: `${cell.h}px` }} />
            ))}
          </span>
          <span class="style-text"><b>{ABOUT[s].name}</b><span class="muted">{ABOUT[s].text}</span></span>
          {used?.[s]?.length ? <span class="style-used">{used[s]!.join(', ')}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const styleName = (s: TileStyle) => ABOUT[s].name;

/** How this profile's keys are drawn on every device. */
export function KeyStyle({ file }: { file: ProfileFile }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const cur = file.profile.tiles ?? 'keycap';
  const pick = (tiles: TileStyle) => void api.cmd('profile.update', { id: file.profile.id, patch: { tiles } }).catch(() => {});
  return (
    <>
      <button type="button" class="btn small" title="How the keys look on every device" onClick={() => setOpen(true)}>
        <Icon name="palette" size={14} />Keys: {ABOUT[cur].name}
      </button>
      {open && (
        <Modal title="Key style" onClose={() => setOpen(false)} width={720}>
          <p class="modal-text">For every key in {file.profile.name}, on every phone and tablet. Each profile can have its own; the Themes page sets them all at once.</p>
          <StyleCards file={file} on={cur} onPick={pick} />
          <div class="modal-actions"><button type="button" class="btn primary" onClick={() => setOpen(false)}>Done</button></div>
        </Modal>
      )}
    </>
  );
}
