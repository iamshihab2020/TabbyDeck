import type { ParamField } from '@tabbydeck/shared';
import type { ActionRegistry } from '../engine/registry.ts';
import type { Native, ProjectMode } from '../native/types.ts';

const MODE: ParamField = { type: 'enum', title: 'Mode', options: ['toggle', 'on', 'off'], default: 'toggle' };
const SCREEN: ParamField = { type: 'screen', title: 'Screen', default: 'all' };
const resolve = (mode: unknown, current: boolean) => (mode === 'toggle' ? !current : mode === 'on');

export function registerDisplay(registry: ActionRegistry, deps: { native: Native }): void {
  const { display } = deps.native;
  // The screens a key moves: every screen, or the one it names.
  const targets = async (screen: unknown) => {
    const all = await display.screens();
    const list = screen === 'all' ? all : all.filter(s => s.id === screen);
    if (!list.length) throw new Error(all.length ? 'That screen is not connected' : 'No screen here lets Windows change its brightness');
    return list;
  };
  registry.register({
    id: 'display.brightness', name: 'Set brightness', group: 'Display', description: 'The laptop screen, and monitors that allow it',
    schema: { percent: { type: 'number', title: 'Brightness %', required: true, min: 0, max: 100 }, screen: SCREEN },
    run: async p => { for (const s of await targets(p.screen)) await display.setScreenBrightness(s.id, Number(p.percent)); },
  });
  registry.register({
    id: 'display.brightnessStep', name: 'Brightness up or down', group: 'Display', description: 'The laptop screen, and monitors that allow it',
    schema: { delta: { type: 'number', title: 'Change (e.g. 10 or -10)', default: 10, min: -100, max: 100 }, screen: SCREEN },
    run: async p => { for (const s of await targets(p.screen)) await display.setScreenBrightness(s.id, Math.max(0, Math.min(100, s.brightness + Number(p.delta)))); },
  });
  registry.register({
    id: 'display.brightnessPanel', name: 'Brightness for each screen', group: 'Display', description: 'Opens a panel on the tablet with a slider for every screen',
    schema: {},
    run: async () => {}, // the tablet opens the panel itself; its sliders set each screen
  });
  registry.register({
    id: 'display.project', name: 'Screens (extend or duplicate)', group: 'Display', description: 'The same choices as Win+P, for two or more screens',
    schema: { mode: { type: 'enum', title: 'Show on', options: ['extend', 'duplicate', 'pc-only', 'second-only'], default: 'extend' } },
    run: p => display.project(p.mode as ProjectMode),
  });
  registry.register({
    id: 'system.energySaver', name: 'Power saver', group: 'Display', description: 'Switches the Windows power mode to Best power efficiency, and back to your usual mode. Windows does not let apps turn on its Energy saver.',
    schema: { mode: MODE },
    run: async p => deps.native.system.setEnergySaver(resolve(p.mode, await deps.native.system.getEnergySaver())),
  });
  registry.register({
    id: 'system.bluetooth', name: 'Bluetooth', group: 'System', description: 'Turns Bluetooth on or off, like the switch in Quick Settings',
    schema: { mode: MODE },
    run: async p => deps.native.system.setBluetooth(resolve(p.mode, await deps.native.system.getBluetooth())),
  });
  registry.register({
    id: 'system.bluetoothPanel', name: 'Bluetooth panel', group: 'System', description: 'Opens a panel on the tablet to turn Bluetooth on or off and connect headphones or speakers',
    schema: {},
    run: async () => {}, // the tablet opens the panel itself
  });
  registry.register({
    id: 'system.dnd', name: 'Do not disturb', group: 'System', description: 'Turns Windows notifications off and on, like the bell in the notification centre. The centre opens for a moment while it switches.',
    schema: { mode: MODE },
    run: async p => deps.native.system.setDnd(resolve(p.mode, await deps.native.system.getDnd())),
  });
  registry.register({
    id: 'display.screensOff', name: 'Screens off', group: 'Display', description: 'Turns the screens dark while the PC keeps running, for long jobs. All screens: the PC stays awake until you use its mouse or keyboard. One monitor: press again to turn it back on.',
    schema: { screen: SCREEN },
    run: p => display.screensOff(String(p.screen ?? 'all')),
  });
  registry.register({
    id: 'display.nightLight', name: 'Night light', group: 'Display', description: 'Warmer colours that are easier on the eyes at night',
    schema: { mode: MODE },
    run: async p => display.setNightLight(resolve(p.mode, await display.getNightLight())),
  });
}
