import { useEffect, useState } from 'preact/hooks';
import type { AudioOutput, ParamSchema, ParamField, Screen } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi, useSnapshot } from '../state.ts';
import { fieldError, hotkeyFromEvent } from './fields/logic.ts';
import { Modal } from './Modal.tsx';
import { AppList } from './PresetPicker.tsx';

/** Form for an action's parameters, generated from its schema. Errors show under each field as you type. */
export function ParamForm({ schema, params, onChange }: { schema: ParamSchema; params: Record<string, unknown>; onChange(p: Record<string, unknown>): void }) {
  const entries = Object.entries(schema);
  if (!entries.length) return <p class="muted small">Nothing to set up for this action.</p>;
  return (
    <div class="param-form">
      {entries.map(([key, f]) => {
        const value = params[key] ?? f.default;
        const err = fieldError(f, value);
        const set = (v: unknown) => onChange({ ...params, [key]: v });
        return (
          <div class="field" key={key}>
            {f.type !== 'boolean' && <span class="field-label">{f.title}{f.required ? '' : ' (optional)'}</span>}
            <Field f={f} value={value} onChange={set} invalid={!!err} />
            {err && <span class="field-error" role="alert">{err}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Field({ f, value, onChange, invalid }: { f: ParamField; value: unknown; onChange(v: unknown): void; invalid: boolean }) {
  const { state } = useSnapshot();
  const cls = invalid ? 'input invalid' : 'input';
  switch (f.type) {
    case 'hotkey': return <HotkeyField label={f.title} value={String(value ?? '')} onChange={onChange} invalid={invalid} />;
    case 'text': return <textarea aria-label={f.title} class={`${cls} area`} rows={3} value={String(value ?? '')} onInput={e => onChange((e.target as HTMLTextAreaElement).value)} />;
    case 'number': return <input aria-label={f.title} class={cls} type="number" value={value === undefined ? '' : String(value)} min={f.min} max={f.max}
      onInput={e => { const t = (e.target as HTMLInputElement).value; onChange(t === '' ? undefined : Number(t)); }} />;
    case 'boolean': return (
      <label class="check"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange((e.target as HTMLInputElement).checked)} />{f.title}</label>
    );
    case 'enum': {
      const opts = f.options ?? [], label = (o: string, i: number) => f.labels?.[i] ?? o[0].toUpperCase() + o.slice(1);
      // A few short choices read best side by side; a longer list (where to put a window) is a menu.
      if (opts.length > 4) return (
        <select aria-label={f.title} class={cls} value={String(value ?? '')} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
          {opts.map((o, i) => <option key={o} value={o}>{label(o, i)}</option>)}
        </select>
      );
      return (
        <div class="segmented" role="radiogroup" aria-label={f.title}>
          {opts.map((o, i) => <button key={o} type="button" role="radio" aria-checked={value === o} class={value === o ? 'seg on' : 'seg'} onClick={() => onChange(o)}>{label(o, i)}</button>)}
        </div>
      );
    }
    case 'profile': return (
      <select aria-label={f.title} class={cls} value={String(value ?? '')} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
        <option value="">Choose a profile</option>
        {state!.profiles.map(p => <option key={p.profile.id} value={p.profile.id}>{p.profile.name}</option>)}
      </select>
    );
    case 'folder': return (
      <select aria-label={f.title} class={cls} value={String(value ?? '')} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
        <option value="">Choose a folder</option>
        {state!.profiles.map(p => (
          <optgroup key={p.profile.id} label={p.profile.name}>
            {p.folders.filter(d => d.parentId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </optgroup>
        ))}
      </select>
    );
    case 'screen': return <ScreenField label={f.title} value={String(value ?? 'all')} onChange={onChange} />;
    case 'window': return <WindowField label={f.title} value={String(value ?? '')} onChange={onChange} required={f.required} />;
    case 'audioOutput': return <OutputField label={f.title} value={String(value ?? '')} onChange={onChange} />;
    case 'path': return <PathField label={f.title} value={String(value ?? '')} onChange={onChange} invalid={invalid} />;
    default: return <input aria-label={f.title} class={cls} value={String(value ?? '')} spellcheck={false} onInput={e => onChange((e.target as HTMLInputElement).value)} />;
  }
}

/** A program or file path, or an installed app chosen from the list (saved as its shell:AppsFolder path). */
function PathField({ label, value, onChange, invalid }: { label: string; value: string; onChange(v: string): void; invalid: boolean }) {
  const [choosing, setChoosing] = useState(false);
  const [q, setQ] = useState('');
  return (
    <div class="hotkey">
      <input aria-label={label} class={invalid ? 'input invalid' : 'input'} value={value} placeholder="Choose an app, or type notepad.exe" spellcheck={false} onInput={e => onChange((e.target as HTMLInputElement).value)} />
      <button type="button" class="btn small" onClick={() => setChoosing(true)}><Icon name="app-window" size={14} />Choose app</button>
      {choosing && (
        <Modal title="Choose an app" onClose={() => setChoosing(false)} width={660}>
          <AppList q={q} setQ={setQ} onPick={a => { onChange(`shell:AppsFolder\\${a.id}`); setChoosing(false); }} />
        </Modal>
      )}
    </div>
  );
}

/** A program file or window title, typed or picked from the apps open now (saved as their program file, e.g. code.exe). */
function WindowField({ label, value, onChange, required }: { label: string; value: string; onChange(v: string): void; required?: boolean }) {
  const api = useApi();
  const [open, setOpen] = useState<{ exe: string; title: string }[] | null>(null);
  useEffect(() => { api.cmd<{ exe: string; title: string }[]>('windows.list', {}).then(setOpen, () => setOpen([])); }, []);
  return (
    <div class="field-stack">
      <input aria-label={label} class="input" value={value} placeholder={required ? 'code.exe, or words from its title' : 'Empty: the window in front'} spellcheck={false} onInput={e => onChange((e.target as HTMLInputElement).value)} />
      <select aria-label="Pick an open app" class="input" value="" onChange={e => { const v = (e.target as HTMLSelectElement).value; if (v) onChange(v); }}>
        <option value="">{open?.length ? 'Or pick an app that is open now' : 'No apps are open'}</option>
        {(open ?? []).map(w => <option key={w.exe} value={w.exe}>{w.title.length > 50 ? `${w.title.slice(0, 50)}…` : w.title} ({w.exe})</option>)}
      </select>
    </div>
  );
}

/** "Speakers (Realtek(R) Audio)" -> "Speakers". */
const shortOutput = (name: string) => name.replace(/\s+\(.*\)\s*$/, '') || name;

/** The sound outputs connected now, or "the next one" (empty) to go round them all. A saved output that is unplugged stays listed. */
function OutputField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  const api = useApi();
  const [outputs, setOutputs] = useState<AudioOutput[] | null>(null);
  useEffect(() => { api.cmd<AudioOutput[]>('audio.outputs', {}).then(setOutputs, () => setOutputs([])); }, []);
  const known = !outputs || !value || outputs.some(o => o.id === value);
  return (
    <select aria-label={label} class="input" value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
      <option value="">The next output, each press</option>
      {(outputs ?? []).map(o => <option key={o.id} value={o.id}>{shortOutput(o.name)}</option>)}
      {!known && <option value={value}>An output that is not connected</option>}
    </select>
  );
}

/** The screens this PC can dim, read when the field opens. A saved screen that is unplugged stays listed so it is not lost. */
function ScreenField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  const api = useApi();
  const [screens, setScreens] = useState<Screen[] | null>(null);
  useEffect(() => { api.cmd<Screen[]>('display.screens', {}).then(setScreens, () => setScreens([])); }, []);
  const known = !screens || value === 'all' || screens.some(s => s.id === value);
  return (
    <>
      <select aria-label={label} class="input" value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
        <option value="all">All screens</option>
        {(screens ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        {!known && <option value={value}>A screen that is not connected</option>}
      </select>
      {screens && screens.length < 2 && <span class="muted small">{screens.length ? 'Only one screen can be dimmed right now. Connect a second monitor to choose between them.' : 'No screen here lets Windows change its brightness.'}</span>}
    </>
  );
}

/** Click Record and press the keys; or type a combination such as Win+Shift+S (Windows keeps Win-key combos from the browser). */
function HotkeyField({ label, value, onChange, invalid }: { label: string; value: string; onChange(v: string): void; invalid: boolean }) {
  const [rec, setRec] = useState(false);
  return (
    <div class="hotkey">
      <input aria-label={label} class={invalid ? 'input invalid' : 'input'} value={value} placeholder={rec ? 'Press the keys now' : 'Ctrl+Shift+S'} spellcheck={false}
        readOnly={rec}
        onKeyDown={e => {
          if (!rec) return;
          e.preventDefault();
          if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) { setRec(false); return; }
          const combo = hotkeyFromEvent(e);
          if (combo) { onChange(combo); setRec(false); }
        }}
        onBlur={() => setRec(false)}
        onInput={e => { if (!rec) onChange((e.target as HTMLInputElement).value); }} />
      <button type="button" class={rec ? 'btn small primary' : 'btn small'} onMouseDown={e => e.preventDefault()}
        onClick={e => { setRec(r => !r); ((e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement).focus(); }}>
        <Icon name="record" size={14} />{rec ? 'Listening' : 'Record'}
      </button>
    </div>
  );
}
