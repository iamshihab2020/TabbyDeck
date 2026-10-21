import { EventEmitter } from 'node:events';
import type { Step, TriggerKind, Widget } from '@tabbydeck/shared';
import type { Logger } from '../log/logger.ts';
import type { ActionContext, ActionRegistry, HostApi, VariableApi } from './registry.ts';
import { validateParams } from './params.ts';

interface EngineEvents {
  actionError: [{ widgetId: string; stepId: string; message: string }];
  paused: [{ deviceId?: string; widgetId: string }];
  pauseChange: [paused: boolean];
}
interface Run { ctrl: AbortController; done: Promise<void> }
interface Lane { running: Run | null; queued: number }

/** Runs a widget trigger's steps in order. One lane per widget + trigger kind, governed by the widget's policy. */
export class Engine extends EventEmitter<EngineEvents> {
  private isPaused = false;
  get paused() { return this.isPaused; }
  set paused(v: boolean) { if (v === this.isPaused) return; this.isPaused = v; this.emit('pauseChange', v); }
  private lanes = new Map<string, Lane>();
  private all = new Set<Run>();

  constructor(private registry: ActionRegistry, private deps: { vars: VariableApi; host: HostApi; log: Logger }) { super(); }

  trigger(widget: Widget, kind: TriggerKind, who: { deviceId?: string }): void {
    if (widget.config.kind !== 'button') return;
    const steps = widget.config.triggers[kind];
    if (!steps?.length) return;
    if (this.paused) { this.emit('paused', { deviceId: who.deviceId, widgetId: widget.id }); return; }
    const key = `${widget.id}:${kind}`;
    const lane = this.lanes.get(key) ?? { running: null, queued: 0 };
    this.lanes.set(key, lane);
    const policy = widget.config.policy;
    if (lane.running) {
      if (policy === 'ignore') return;
      if (policy === 'queue') { lane.queued++; return; }
      lane.running.ctrl.abort();
    }
    this.start(lane, key, steps, widget.id, who.deviceId);
  }

  private start(lane: Lane, key: string, steps: Step[], widgetId: string, deviceId?: string) {
    const ctrl = new AbortController();
    const run: Run = { ctrl, done: Promise.resolve() };
    lane.running = run;
    this.all.add(run);
    run.done = this.execute(steps, widgetId, deviceId, ctrl.signal, true)
      .catch(() => {})
      .finally(() => {
        this.all.delete(run);
        if (lane.running !== run) return; // replaced by a cancel
        lane.running = null;
        if (lane.queued > 0) { lane.queued--; this.start(lane, key, steps, widgetId, deviceId); }
        else this.lanes.delete(key);
      });
  }

  /** Run steps for a widget; reports errors as events when `report`, otherwise rethrows. */
  private async execute(steps: Step[], widgetId: string, deviceId: string | undefined, signal: AbortSignal, report: boolean): Promise<void> {
    const ctx: ActionContext = { deviceId, widgetId, signal, vars: this.deps.vars, host: this.deps.host, log: this.deps.log };
    for (const step of steps) {
      if (signal.aborted) return;
      try {
        const def = this.registry.get(step.action);
        if (!def) throw new Error(`Unknown action: ${step.action}`);
        const p = validateParams(def.schema, step.params);
        if (!p.ok) throw new Error(p.error);
        await def.run(p.value, ctx);
      } catch (e) {
        if (signal.aborted) return;
        const message = e instanceof Error ? e.message : String(e);
        if (!report) throw e instanceof Error ? e : new Error(message);
        this.deps.log.error('engine', 'step failed', { widgetId, action: step.action, message });
        this.emit('actionError', { widgetId, stepId: step.id, message }); // not 'error': Node throws on unhandled 'error' events
        if (!step.continueOnError) { this.deps.host.flash(widgetId, 'error'); return; }
      }
    }
  }

  /** Run a list of steps once, outside any lane (the editor's Test button). Rejects on the first error. */
  runSteps(steps: Step[], who: { deviceId?: string; widgetId?: string }): Promise<void> {
    const ctrl = new AbortController();
    return this.execute(steps, who.widgetId ?? 'test', who.deviceId, ctrl.signal, false);
  }

  async shutdown(): Promise<void> {
    for (const r of this.all) r.ctrl.abort();
    for (const l of this.lanes.values()) l.queued = 0;
    await Promise.allSettled([...this.all].map(r => r.done));
  }
}

