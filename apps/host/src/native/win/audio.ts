import type { NativeAudio } from '../types.ts';
import type { PowerShellHost } from './ps.ts';
import { AUDIO_CS } from './audio-cs.ts';

const RENDER = 0, CAPTURE = 1;

/** Volume and mute through Core Audio in the shared PowerShell host. The type is compiled on first use (~2 s), and again if the host restarts. */
export function createWinAudio(ps: PowerShellHost): NativeAudio {
  const ensure = `if (-not ('Tabby.Audio' -as [type])) { Add-Type -TypeDefinition @'\n${AUDIO_CS}\n'@ }\n`;
  const call = (expr: string) => ps.call(ensure + expr, 15000);
  const bool = async (expr: string) => (await call(expr)).trim().toLowerCase() === 'true';
  return {
    getVolume: async () => Number((await call('[Tabby.Audio]::GetVolume()')).trim()),
    setVolume: async pct => { await call(`[Tabby.Audio]::SetVolume(${Math.round(Math.max(0, Math.min(100, pct)))})`); },
    getMute: () => bool(`[Tabby.Audio]::GetMute(${RENDER})`),
    setMute: async on => { await call(`[Tabby.Audio]::SetMute(${RENDER}, $${on})`); },
    getMicMute: () => bool(`[Tabby.Audio]::GetMute(${CAPTURE})`),
    setMicMute: async on => { await call(`[Tabby.Audio]::SetMute(${CAPTURE}, $${on})`); },
  };
}
