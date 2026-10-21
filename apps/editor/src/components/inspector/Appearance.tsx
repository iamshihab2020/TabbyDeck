import { useRef, useState } from 'preact/hooks';
import type { Look } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi } from '../../state.ts';
import { IconPicker } from '../IconPicker.tsx';
import { toast } from '../Toast.tsx';

const BACKGROUNDS = ['#25221f', '#33302b', '#1e3a5f', '#0b3d62', '#16302b', '#14532d', '#3b2a4d', '#2b2440', '#2b2d6e', '#450a0a', '#3a1d1d', '#3a2f12', '#f5a524', '#efeae3'];
const TEXTS = ['#efeae3', '#ffffff', '#9aa3ad', '#f5a524', '#fca5a5', '#86efac', '#7dd3fc', '#c4b5fd', '#fcd34d', '#2a1a00', '#121110'];

export function Appearance({ look, onChange }: { look: Look; onChange(patch: Partial<Look>): void }) {
  const api = useApi();
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const upload = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1024 * 1024) return toast('That image is over 1 MB. Use a smaller one.', 'error');
    const r = new FileReader();
    r.onload = () => void api.cmd<{ id: string }>('asset.upload', { name: f.name, dataUrl: String(r.result) }).then(a => onChange({ image: a.id })).catch(() => {});
    r.readAsDataURL(f);
  };

  return (
    <div class="look">
      <section class="look-group" aria-label="Icon or image">
        <div class="look-row">
          <button type="button" class="icon-choice" onClick={() => setPicking(true)} aria-label={`Icon: ${look.icon ?? 'none'}. Change icon`} disabled={!!look.image}>
            <Icon name={look.icon ?? 'question'} size={22} />
            <span>{look.image ? 'Using an image' : 'Change icon'}</span>
          </button>
          {look.image
            ? <button type="button" class="btn small" onClick={() => onChange({ image: undefined })}>Use icon</button>
            : <button type="button" class="btn small" onClick={() => file.current?.click()}><Icon name="image" size={16} />Image</button>}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onChange={e => upload((e.target as HTMLInputElement).files?.[0])} />
        </div>
        {!look.image && <Slider label="Icon size" value={look.iconScale} min={0.5} max={1.8} step={0.05} format={v => `${Math.round(v * 100)}%`} onChange={v => onChange({ iconScale: v })} />}
      </section>

      <section class="look-group" aria-label="Label">
        <Slider label="Text size" value={look.labelSize} min={9} max={24} step={1} format={v => `${v}`} onChange={v => onChange({ labelSize: v })} />
        <div class="field">
          <span class="field-label">Text position</span>
          <div class="segmented" role="radiogroup" aria-label="Text position">
            {(['top', 'center', 'bottom'] as const).map(p => (
              <button key={p} type="button" role="radio" aria-checked={look.labelPos === p} class={look.labelPos === p ? 'seg on' : 'seg'} onClick={() => onChange({ labelPos: p })}>
                {p === 'top' ? 'Top' : p === 'center' ? 'Middle' : 'Bottom'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section class="look-group" aria-label="Colours">
        <Swatches label="Background" value={look.bg} colors={BACKGROUNDS} onChange={c => onChange({ bg: c })} />
        <Swatches label="Text and icon" value={look.fg} colors={TEXTS} onChange={c => onChange({ fg: c })} />
      </section>

      <section class="look-group" aria-label="Shape">
        <Slider label="Corner roundness" value={look.radius} min={0} max={32} step={1} format={v => `${v}`} onChange={v => onChange({ radius: v })} />
        <Slider label="Border" value={look.border?.width ?? 0} min={0} max={4} step={1} format={v => (v ? `${v}px` : 'None')}
          onChange={v => onChange({ border: v ? { width: v, color: look.border?.color ?? '#f5a524' } : undefined })} />
        {look.border && <Swatches label="Border colour" value={look.border.color} colors={TEXTS} onChange={c => onChange({ border: { width: look.border!.width, color: c } })} />}
      </section>
      {picking && <IconPicker current={look.icon} onPick={n => onChange({ icon: n })} onClose={() => setPicking(false)} />}
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format(v: number): string; onChange(v: number): void }) {
  return (
    <label class="slider">
      <span class="slider-head"><span class="field-label">{label}</span><output>{format(value)}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onInput={e => onChange(Number((e.target as HTMLInputElement).value))} />
    </label>
  );
}

function Swatches({ label, value, colors, onChange }: { label: string; value: string; colors: string[]; onChange(c: string): void }) {
  const custom = !colors.includes(value.toLowerCase());
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="swatches" role="radiogroup" aria-label={label}>
        {colors.map(c => (
          <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c} aria-label={c} class={value.toLowerCase() === c ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => onChange(c)} />
        ))}
        <label class={custom ? 'swatch custom on' : 'swatch custom'} title="Pick any colour" style={custom ? { background: value } : undefined}>
          <Icon name="eyedropper" size={14} />
          <input type="color" value={value} onInput={e => onChange((e.target as HTMLInputElement).value)} aria-label={`Custom ${label.toLowerCase()} colour`} />
        </label>
      </div>
    </div>
  );
}
