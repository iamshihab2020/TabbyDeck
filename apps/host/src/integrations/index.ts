import type { ActionRegistry } from '../engine/registry.ts';
import type { Native } from '../native/types.ts';
import type { HeldKeys } from '../native/win/held.ts';
import type { Store } from '../store/store.ts';
import { registerKeyboard } from './keyboard.ts';
import { registerMouse } from './mouse.ts';
import { registerSystem } from './system.ts';
import { registerAudio } from './audio.ts';
import { registerDisplay } from './display.ts';
import { registerDeck } from './deck.ts';

/** Release 1 built-ins, in catalogue order: Keyboard, Mouse, System, Audio, Display, Deck. */
export function registerBuiltins(registry: ActionRegistry, deps: { native: Native; held: HeldKeys; store: Store }): void {
  registerKeyboard(registry, { input: deps.native.input, held: deps.held });
  registerMouse(registry, { input: deps.native.input });
  registerSystem(registry, { native: deps.native });
  registerAudio(registry, { native: deps.native });
  registerDisplay(registry, { native: deps.native });
  registerDeck(registry, { store: deps.store });
}
