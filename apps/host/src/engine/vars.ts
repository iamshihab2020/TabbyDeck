import { EventEmitter } from 'node:events';
import type { Variable } from '@tabbydeck/shared';
import type { Store } from '../store/store.ts';
import type { Native } from '../native/types.ts';
import type { VariableApi } from './registry.ts';

/** Variables backed by the store; emits `change` with the keys that changed. */
export class Vars extends EventEmitter<{ change: [keys: string[]] }> implements VariableApi {
  constructor(private store: Store) {
    super();
    store.on('variables', keys => this.emit('change', keys));
  }
  get(key: string): Variable | undefined { return this.store.variable(key); }
  set(key: string, value: string | number | boolean, source = 'user'): void { this.store.setVariable(key, value, { source }); }
}

/** Refresh system.* variables every 2 s, but only while at least one device is connected. */
export function startSysInfoPoller(native: Native, vars: VariableApi, connectedCount: () => number, intervalMs = 2000): () => void {
  const t = setInterval(() => {
    if (connectedCount() === 0) return;
    vars.set('system.cpu', native.sysinfo.cpuPercent(), 'system');
    vars.set('system.ram', native.sysinfo.ramPercent(), 'system');
    const b = native.sysinfo.battery();
    if (b) vars.set('system.battery', b.percent, 'system');
    vars.set('system.activeWindow', native.system.activeWindowTitle(), 'system');
  }, intervalMs);
  t.unref?.();
  return () => clearInterval(t);
}
