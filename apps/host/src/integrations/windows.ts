import type { ActionRegistry } from '../engine/registry.ts';
import type { Native, WindowPlace } from '../native/types.ts';

export const PLACES: Record<WindowPlace, string> = {
  left: 'Left half', right: 'Right half', top: 'Top half', bottom: 'Bottom half',
  maximize: 'Maximize', minimize: 'Minimize', restore: 'Restore', 'next-screen': 'Move to the next screen',
};

/** Resolves after ms, or rejects as soon as the button's run is cancelled. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Cancelled'));
    const t = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
    const stop = () => { clearTimeout(t); reject(new Error('Cancelled')); };
    signal.addEventListener('abort', stop, { once: true });
  });
}

export function registerWindows(registry: ActionRegistry, deps: { native: Native }): void {
  const { system } = deps.native;
  registry.register({
    id: 'system.placeWindow', name: 'Move window', group: 'System',
    description: 'Snap an app\'s window to half the screen, maximize it, or move it to the other screen. Waits for an app that is still opening.',
    schema: {
      window: { type: 'window', title: 'App or window title' },
      place: { type: 'enum', title: 'Where', options: Object.keys(PLACES), labels: Object.values(PLACES), default: 'left' },
      wait: { type: 'number', title: 'Wait for it to open (seconds)', default: 10, min: 0, max: 60 },
    },
    run: async (p, ctx) => {
      const match = String(p.window ?? ''), until = Date.now() + Number(p.wait) * 1000;
      // An app that just opened can still be resizing its window; place it once more a moment later. Only for a named
      // app: the window in front is already open, and placing "the window in front" twice could reach a second window
      // (after a minimize another one is in front). Never for the next screen, where a second move goes on again.
      const again = !!match.trim() && p.place !== 'next-screen';
      for (;;) {
        if (system.placeWindow(match, p.place as WindowPlace)) { if (again) { await pause(400, ctx.signal); system.placeWindow(match, p.place as WindowPlace); } return; }
        if (Date.now() >= until) throw new Error(match.trim() ? `No window matches "${match}"` : 'No window is in front');
        await pause(250, ctx.signal);
      }
    },
  });
  registry.register({
    id: 'system.switchApp', name: 'Switch app', group: 'System', description: 'Go back to the app you used before this one, on any screen, as a quick Alt+Tab does',
    schema: {},
    run: async () => { if (!(await system.switchApp())) throw new Error('No other app is open'); },
  });
}
