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
import { registerWindows } from './windows.ts';
import { registerMedia } from './media.ts';
import { registerMeeting } from './meeting.ts';
import { InfoKeys, registerInfo } from '../engine/info.ts';

/** The built-ins, in catalogue order: Keyboard, Mouse, System, Audio, Media, Meetings, Display, Info, Deck. */
export function registerBuiltins(registry: ActionRegistry, deps: { native: Native; held: HeldKeys; store: Store; info?: InfoKeys }): void {
  registerKeyboard(registry, { input: deps.native.input, held: deps.held });
  registerMouse(registry, { input: deps.native.input });
  registerSystem(registry, { native: deps.native });
  registerWindows(registry, { native: deps.native });
  registerAudio(registry, { native: deps.native });
  registerMedia(registry, { native: deps.native });
  registerMeeting(registry, { native: deps.native });
  registerDisplay(registry, { native: deps.native });
  registerInfo(registry, { store: deps.store, info: deps.info ?? new InfoKeys({ store: deps.store, native: deps.native }) });
  registerDeck(registry, { store: deps.store });
}
