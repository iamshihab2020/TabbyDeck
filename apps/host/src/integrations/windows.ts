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
      // A window that just opened can still be resizing itself; place it once more a moment later. Not for the next
      // screen: a second move would go on to the screen after that (with two screens, back where it started).
      const again = p.place !== 'next-screen';
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
