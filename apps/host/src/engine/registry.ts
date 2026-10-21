import type { ActionDefPublic, Variable } from '@tabbydeck/shared';
import type { Logger } from '../log/logger.ts';

export interface VariableApi {
  get(key: string): Variable | undefined;
  set(key: string, value: string | number | boolean, source?: string): void;
}

export interface HostApi {
  switchProfile(deviceId: string, profileId: string): void;
  openFolder(deviceId: string, folderId: string | null): void;
  notify(deviceId: string | 'all', text: string, vibrate?: boolean): void;
  flash(widgetId: string, kind: 'error' | 'ok'): void;
}

export interface ActionContext {
  deviceId?: string;
  widgetId?: string;
  signal: AbortSignal;
  vars: VariableApi;
  host: HostApi;
  log: Logger;
}

export interface ActionDef extends ActionDefPublic {
  run(params: Record<string, unknown>, ctx: ActionContext): Promise<void>;
}

export class ActionRegistry {
  private defs = new Map<string, ActionDef>();
  register(def: ActionDef): void {
    if (this.defs.has(def.id)) throw new Error(`duplicate action id ${def.id}`);
    this.defs.set(def.id, def);
  }
  get(id: string): ActionDef | undefined { return this.defs.get(id); }
  list(): ActionDefPublic[] {
    return [...this.defs.values()].map(({ run: _run, ...pub }) => pub);
  }
}
