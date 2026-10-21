/// <reference path="./env.d.ts" />
import names from './icons/names.json';
import sprite from './icons/sprite.svg?raw';

export const ICON_NAMES: string[] = names;
const KNOWN = new Set(ICON_NAMES);
export const FALLBACK_ICON = 'question';

export function Icon({ name, size = 24, class: cls, style }: { name: string; size?: number; class?: string; style?: Record<string, string | number> }) {
  const n = KNOWN.has(name) ? name : FALLBACK_ICON;
  return (
    <svg class={cls} style={style} width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false" fill="currentColor">
      <use href={`#i-${n}`} />
    </svg>
  );
}

/** Inline the sprite once per page so every <Icon> can reference it. The sprite is generated at build time from Phosphor Icons, never from user input. */
export function SpriteDefs() {
  return <div aria-hidden="true" style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: sprite }} />;
}
