import type { ParamField } from '@tabbydeck/shared';
import type { ActionRegistry } from '../engine/registry.ts';
import type { MouseButton, NativeInput } from '../native/types.ts';

const BUTTON: ParamField = { type: 'enum', title: 'Button', options: ['left', 'right', 'middle'], default: 'left' };
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>(r => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }); });

export function registerMouse(registry: ActionRegistry, deps: { input: NativeInput }): void {
  const { input } = deps;
  registry.register({
    id: 'mouse.move', name: 'Move pointer', group: 'Mouse',
    schema: { x: { type: 'number', title: 'X', required: true }, y: { type: 'number', title: 'Y', required: true }, absolute: { type: 'boolean', title: 'Screen position (off = move by)', default: true } },
    run: async p => input.mouseMove(Number(p.x), Number(p.y), Boolean(p.absolute)),
  });
  registry.register({
    id: 'mouse.click', name: 'Click', group: 'Mouse',
    schema: { button: BUTTON, count: { type: 'number', title: 'Clicks', default: 1, min: 1, max: 3 } },
    run: async (p, ctx) => {
      const b = p.button as MouseButton;
      for (let i = 0; i < Number(p.count); i++) {
        if (i > 0) await wait(40, ctx.signal);
        input.mouseButton(b, true); input.mouseButton(b, false);
      }
    },
  });
  registry.register({
    id: 'mouse.scroll', name: 'Scroll', group: 'Mouse',
    schema: { dy: { type: 'number', title: 'Lines (negative scrolls down)', required: true, min: -50, max: 50 }, dx: { type: 'number', title: 'Sideways', default: 0, min: -50, max: 50 } },
    run: async p => input.scroll(Number(p.dy), Number(p.dx)),
  });
  registry.register({
    id: 'mouse.trackpad', name: 'Trackpad and keyboard', group: 'Mouse', description: 'Opens a touchpad on the tablet: move the pointer, tap to click, two fingers to scroll or right-click, and a box that types on the PC',
    schema: {},
    run: async () => {}, // the tablet opens the panel itself
  });
  registry.register({ id: 'mouse.hold', name: 'Hold button', group: 'Mouse', schema: { button: BUTTON }, run: async p => input.mouseButton(p.button as MouseButton, true) });
  registry.register({ id: 'mouse.release', name: 'Release button', group: 'Mouse', schema: { button: BUTTON }, run: async p => input.mouseButton(p.button as MouseButton, false) });
}
