import type { ActionContext, ActionRegistry } from '../engine/registry.ts';
import type { Store } from '../store/store.ts';
import { pause } from './windows.ts';

const device = (ctx: ActionContext) => {
  if (!ctx.deviceId) throw new Error('This action needs a device; press it from the deck to try it');
  return ctx.deviceId;
};
/** "3" → 3, "true"/"false" → booleans, anything else stays text. */
const parseValue = (s: string): string | number | boolean => {
  const t = s.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  return s;
};

export function registerDeck(registry: ActionRegistry, deps: { store: Store }): void {
  const { store } = deps;
  registry.register({
    id: 'deck.switchProfile', name: 'Switch profile', description: 'Shows another profile on this device', group: 'Deck',
    schema: { profile: { type: 'profile', title: 'Profile', required: true } },
    run: async (p, ctx) => {
      if (!store.profile(String(p.profile))) throw new Error('That profile no longer exists');
      ctx.host.switchProfile(device(ctx), String(p.profile));
    },
  });
  registry.register({
    id: 'deck.openFolder', name: 'Open folder', description: 'Opens a folder of keys on this device', group: 'Deck',
    schema: { folder: { type: 'folder', title: 'Folder', required: true } },
    run: async (p, ctx) => {
      if (!store.folder(String(p.folder))) throw new Error('That folder no longer exists');
      ctx.host.openFolder(device(ctx), String(p.folder));
    },
  });
  registry.register({
    id: 'deck.wait', name: 'Wait', group: 'Deck', description: 'Pause before the next step, for example while an app opens',
    schema: { seconds: { type: 'number', title: 'Seconds', default: 1, min: 0.1, max: 60 } },
    run: (p, ctx) => pause(Number(p.seconds) * 1000, ctx.signal),
  });
  registry.register({ id: 'deck.back', name: 'Go back', description: 'Goes back from a folder to the keys before it', group: 'Deck', schema: {}, run: async (_p, ctx) => ctx.host.openFolder(device(ctx), null) });
  registry.register({
    id: 'deck.setVar', name: 'Set variable', description: 'Sets a variable to a value, for keys that show or use it', group: 'Deck',
    schema: { variable: { type: 'variable', title: 'Variable', required: true }, value: { type: 'string', title: 'Value', default: '' } },
    run: async (p, ctx) => ctx.vars.set(String(p.variable), parseValue(String(p.value ?? '')), 'deck'),
  });
  registry.register({
    id: 'deck.incVar', name: 'Add to variable', description: 'Adds a number to a variable, for counters', group: 'Deck',
    schema: { variable: { type: 'variable', title: 'Variable', required: true }, by: { type: 'number', title: 'Add', default: 1 } },
    run: async (p, ctx) => {
      const cur = ctx.vars.get(String(p.variable))?.value;
      ctx.vars.set(String(p.variable), (typeof cur === 'number' ? cur : 0) + Number(p.by), 'deck');
    },
  });
  registry.register({
    id: 'deck.toggleVar', name: 'Toggle variable', description: 'Switches a variable between true and false', group: 'Deck',
    schema: { variable: { type: 'variable', title: 'Variable', required: true } },
    run: async (p, ctx) => ctx.vars.set(String(p.variable), ctx.vars.get(String(p.variable))?.value !== true, 'deck'),
  });
  registry.register({
    id: 'deck.notify', name: 'Show message on device', description: 'Shows a short message on the device that pressed the key', group: 'Deck',
    schema: { text: { type: 'string', title: 'Message', required: true }, vibrate: { type: 'boolean', title: 'Vibrate', default: true } },
    run: async (p, ctx) => ctx.host.notify(device(ctx), String(p.text), Boolean(p.vibrate)),
  });
  registry.register({ id: 'deck.vibrate', name: 'Vibrate device', description: 'Buzzes the device that pressed the key, where the device can', group: 'Deck', schema: {}, run: async (_p, ctx) => ctx.host.notify(device(ctx), '', true) });
}
