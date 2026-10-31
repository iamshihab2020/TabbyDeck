import { useEffect, useRef, useState } from 'preact/hooks';
import { newId } from '@tabbydeck/shared/ids';
import type { ButtonConfig, Step, TriggerKind, Widget } from '@tabbydeck/shared';
import { Icon } from '@tabbydeck/ui';
import { useApi, useSnapshot, errorText } from '../../state.ts';
import { ParamForm } from '../ParamForm.tsx';
import { StepPicker } from '../StepPicker.tsx';
import { toast } from '../Toast.tsx';
import { fieldError, stepSummary } from '../fields/logic.ts';

const TRIGGERS: { kind: TriggerKind; label: string }[] = [
  { kind: 'press', label: 'Press' }, { kind: 'long', label: 'Hold' }, { kind: 'double', label: 'Double' }, { kind: 'release', label: 'Release' },
];
const POLICIES: { id: ButtonConfig['policy']; label: string; hint: string }[] = [
  { id: 'ignore', label: 'Ignore', hint: 'Taps while it is still running are ignored' },
  { id: 'queue', label: 'Queue', hint: 'Taps while it is running wait their turn' },
  { id: 'cancel', label: 'Restart', hint: 'A new tap stops the current run and starts again' },
];

/** What the button does: steps per trigger, run in order. Changes save automatically. */
export function Actions({ widget }: { widget: Widget }) {
  const api = useApi();
  const { state } = useSnapshot();
  const [config, setConfig] = useState(widget.config as ButtonConfig);
  const [trigger, setTrigger] = useState<TriggerKind>('press');
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<ButtonConfig | null>(null);

  const flush = () => { clearTimeout(timer.current); if (pending.current) void api.cmd('widget.update', { id: widget.id, patch: { config: pending.current } }).catch(() => {}); pending.current = null; };
  useEffect(() => flush, []);
  const save = (next: ButtonConfig, now = false) => { setConfig(next); pending.current = next; clearTimeout(timer.current); timer.current = setTimeout(flush, now ? 0 : 300); };

  const steps = config.triggers[trigger] ?? [];
  const setSteps = (s: Step[], now = true) => save({ ...config, triggers: { ...config.triggers, [trigger]: s } }, now);
  const catalogue = state!.catalogue;
  const def = (s: Step) => catalogue.find(a => a.id === s.action);

  const test = async (s: Step) => {
    try { await api.cmd('action.test', { step: s }); toast(`${def(s)?.name ?? s.action} ran on this PC`, 'ok'); }
    catch (e) { toast(errorText((e as Error).message), 'error'); }
  };
  const move = (i: number, d: number) => { const s = [...steps]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); setSteps(s); };

  return (
    <div class="actions">
      <div class="segmented triggers" role="tablist" aria-label="When">
        {TRIGGERS.map(t => {
          const n = config.triggers[t.kind]?.length ?? 0;
          return <button key={t.kind} type="button" role="tab" aria-selected={trigger === t.kind} class={trigger === t.kind ? 'seg on' : 'seg'} onClick={() => { setTrigger(t.kind); setOpen(null); }}>{t.label}{n ? <span class="count">{n}</span> : null}</button>;
        })}
      </div>

      <ol class="steps" aria-label="Steps, run in order">
        {steps.map((s, i) => {
          const d = def(s);
          const bad = !d || Object.entries(d.schema).some(([k, f]) => fieldError(f, s.params[k] ?? f.default));
          // A Wait is a pause between steps, so it sits on the line between them, not as a step of its own.
          const wait = s.action === 'deck.wait';
          const n = steps.slice(0, i + 1).filter(x => x.action !== 'deck.wait').length;
          const summary = d ? stepSummary(d.name, s.params, d.schema) : `Unknown action ${s.action}`;
          const detail = d && summary.startsWith(`${d.name}: `) ? summary.slice(d.name.length + 2) : '';
          return (
            <li key={s.id} class={`step${wait ? ' wait' : ''}${open === s.id ? ' open' : ''}`}>
              <div class="step-head">
                <button type="button" class="step-title" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                  {wait ? <span class="step-n wait" aria-hidden="true"><Icon name="hourglass-medium" size={12} /></span> : <span class="step-n" aria-hidden="true">{n}</span>}
                  <span class="step-text">
                    <b>{wait ? `Wait ${Number(s.params.seconds ?? 1)} s` : d?.name ?? summary}</b>
                    {!wait && detail && <span class="step-detail">{detail}</span>}
                  </span>
                  {bad && <Icon name="warning-circle" size={16} class="step-warn" />}
                </button>
                {!wait && <button type="button" class="btn small ghost step-try" onClick={() => void test(s)} disabled={bad || d?.danger}
                  title={d?.danger ? 'Not tried from here: this action can close apps, lose work or turn the PC off. Try it from the deck.' : 'Run this step on this PC now'}><Icon name="play" size={12} />Try</button>}
              </div>
              {open === s.id && d && (
                <div class="step-body">
                  <ParamForm schema={d.schema} params={s.params} onChange={p => { const n = [...steps]; n[i] = { ...s, params: p }; setSteps(n, false); }} />
                  <label class="check"><input type="checkbox" checked={!!s.continueOnError} onChange={e => { const n = [...steps]; n[i] = { ...s, continueOnError: (e.target as HTMLInputElement).checked || undefined }; setSteps(n); }} />Keep going if this step fails</label>
                  <div class="step-tools">
                    <button type="button" class="btn small ghost" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="caret-up" size={14} /></button>
                    <button type="button" class="btn small ghost" title="Move down" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><Icon name="caret-down" size={14} /></button>
                    <button type="button" class="btn small ghost" onClick={() => { const n = [...steps]; n.splice(i + 1, 0, { ...structuredClone(s), id: newId() }); setSteps(n); }}><Icon name="copy" size={14} />Duplicate</button>
                    <span class="grow" />
                    <button type="button" class="btn small ghost danger" onClick={() => { setSteps(steps.filter(x => x.id !== s.id)); setOpen(null); }}><Icon name="trash" size={14} />Remove</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {steps.length === 0 && <p class="muted small steps-empty">Nothing happens on {TRIGGERS.find(t => t.kind === trigger)!.label.toLowerCase()} yet.</p>}
      <button type="button" class={steps.length ? 'btn add-step on-line' : 'btn add-step'} onClick={() => setPicking(true)}><Icon name="plus" size={16} />{steps.length ? 'Add a step' : 'Add action'}</button>

      {steps.length > 0 && (
        <div class="field policy">
          <span class="field-label">If pressed again while it runs</span>
          <div class="segmented" role="radiogroup" aria-label="If pressed again while it runs">
            {POLICIES.map(p => <button key={p.id} type="button" role="radio" aria-checked={config.policy === p.id} class={config.policy === p.id ? 'seg on' : 'seg'} onClick={() => save({ ...config, policy: p.id }, true)}>{p.label}</button>)}
          </div>
          <p class="muted small policy-hint">{POLICIES.find(p => p.id === config.policy)?.hint}.</p>
        </div>
      )}
      {picking && <StepPicker catalogue={catalogue} onClose={() => setPicking(false)} onPick={a => {
        const params: Record<string, unknown> = {};
        for (const [k, f] of Object.entries(a.schema)) if (f.default !== undefined) params[k] = f.default;
        const s: Step = { id: newId(), action: a.id, params };
        setSteps([...steps, s]);
        setOpen(s.id);
      }} />}
    </div>
  );
}
