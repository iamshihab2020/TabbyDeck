import type { ActionRegistry } from '../engine/registry.ts';
import { setHotkeyValidator } from '../engine/params.ts';
import type { NativeInput } from '../native/types.ts';
import type { HeldKeys } from '../native/win/held.ts';
import { hotkeyError, parseHotkey } from '../native/win/keys.ts';

const keysOf = (s: unknown) => { const r = parseHotkey(String(s)); if (!r.ok) throw new Error(r.error); return r.keys; };

export function registerKeyboard(registry: ActionRegistry, deps: { input: NativeInput; held: HeldKeys }): void {
  setHotkeyValidator(hotkeyError);
  const { input, held } = deps;

  registry.register({
    id: 'keyboard.hotkey', name: 'Press hotkey', group: 'Keyboard', description: 'Press a key combination, such as Ctrl+Shift+S',
    schema: { hotkey: { type: 'hotkey', title: 'Keys', required: true } },
    run: async p => {
      const keys = keysOf(p.hotkey);
      const pressed: number[] = [];
      try {
        for (const vk of keys) { held.keyDown(vk); pressed.push(vk); }
      } finally {
        for (const vk of pressed.reverse()) held.keyUp(vk);
      }
    },
  });

  registry.register({
    id: 'keyboard.type', name: 'Type text', group: 'Keyboard', description: 'Type text into the focused app',
    schema: { text: { type: 'text', title: 'Text', required: true } },
    run: async p => input.typeText(String(p.text)),
  });

  registry.register({
    id: 'keyboard.hold', name: 'Hold keys', group: 'Keyboard', description: 'Press keys down and keep them held until a Release step',
    schema: { hotkey: { type: 'hotkey', title: 'Keys', required: true } },
    run: async p => { for (const vk of keysOf(p.hotkey)) held.keyDown(vk); },
  });

  registry.register({
    id: 'keyboard.release', name: 'Release keys', group: 'Keyboard',
    schema: { hotkey: { type: 'hotkey', title: 'Keys', required: true } },
    run: async p => { for (const vk of keysOf(p.hotkey).reverse()) held.keyUp(vk); },
  });
}
