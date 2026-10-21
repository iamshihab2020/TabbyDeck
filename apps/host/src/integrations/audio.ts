import type { ParamField } from '@tabbydeck/shared';
import type { ActionRegistry } from '../engine/registry.ts';
import type { Native } from '../native/types.ts';

const MODE: ParamField = { type: 'enum', title: 'Mode', options: ['toggle', 'on', 'off'], default: 'toggle' };
const resolve = (mode: unknown, current: boolean) => (mode === 'toggle' ? !current : mode === 'on');

export function registerAudio(registry: ActionRegistry, deps: { native: Native }): void {
  const { audio } = deps.native;
  registry.register({
    id: 'system.volume', name: 'Set volume', group: 'Audio',
    schema: { percent: { type: 'number', title: 'Volume %', required: true, min: 0, max: 100 } },
    run: p => audio.setVolume(Number(p.percent)),
  });
  registry.register({
    id: 'system.volumeStep', name: 'Volume up or down', group: 'Audio',
    schema: { delta: { type: 'number', title: 'Change (e.g. 5 or -5)', default: 5, min: -100, max: 100 } },
    run: async p => audio.setVolume(Math.max(0, Math.min(100, (await audio.getVolume()) + Number(p.delta)))),
  });
  registry.register({
    id: 'system.volumePanel', name: 'Volume slider', group: 'Audio', description: 'Opens a panel on the tablet to drag the volume, or mute',
    schema: {},
    run: async () => {}, // the tablet opens the panel itself; its slider sets the volume
  });
  registry.register({ id: 'system.mute', name: 'Mute sound', group: 'Audio', schema: { mode: MODE }, run: async p => audio.setMute(resolve(p.mode, await audio.getMute())) });
  registry.register({ id: 'system.micMute', name: 'Mute microphone', group: 'Audio', schema: { mode: MODE }, run: async p => audio.setMicMute(resolve(p.mode, await audio.getMicMute())) });
}
