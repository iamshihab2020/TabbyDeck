import type { ActionRegistry } from '../engine/registry.ts';
import type { Native } from '../native/types.ts';
import { VK } from '../native/win/keys.ts';

const tap = (n: Native, vk: number) => { n.input.keyDown(vk); n.input.keyUp(vk); };

export function registerMedia(registry: ActionRegistry, deps: { native: Native }): void {
  const n = deps.native;
  registry.register({
    id: 'media.nowPlaying', name: 'Now playing', group: 'Media',
    description: 'Shows the song or video that is playing, with its cover. Press to play or pause.',
    schema: {}, run: async () => tap(n, VK.MediaPlayPause),
  });
}
