import type { NativeAudio } from '../types.ts';
import type { PowerShellHost } from './ps.ts';
import { AUDIO_CS } from './audio-cs.ts';
import { MIXER_CS } from './mixer-cs.ts';
import { psQuote } from './ps.ts';

const MIXER = { key: 'mixer', script: `Add-Type -TypeDefinition @'
${MIXER_CS}
'@` };
const json = <T>(s: string): T[] => { const t = s.trim(); return t ? [].concat(JSON.parse(t)) as T[] : []; }; // one item comes back as an object

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
    outputs: async () => json(await ps.call('ConvertTo-Json -Compress -InputObject @([Tabby.Mixer]::Outputs())', 10000, MIXER)),
    setOutput: async id => {
      if (!(await json<{ id: string }>(await ps.call('ConvertTo-Json -Compress -InputObject @([Tabby.Mixer]::Outputs())', 10000, MIXER))).some(o => o.id === id)) throw new Error('That sound output is not connected');
      const hr = (await ps.call(`[Tabby.Mixer]::SetOutput(${psQuote(id)})`, 10000, MIXER)).trim();
      if (hr !== '0') throw new Error(`Windows did not switch the sound output (${hr})`);
    },
    apps: async () => json(await ps.call('ConvertTo-Json -Compress -InputObject @([Tabby.Mixer]::Apps())', 10000, MIXER)),
    setApp: async (id, c) => {
      const level = c.percent === undefined ? -1 : Math.round(Math.max(0, Math.min(100, c.percent))), mute = c.mute === undefined ? -1 : c.mute ? 1 : 0;
      const n = Number((await ps.call(`[Tabby.Mixer]::SetApp(${psQuote(id)}, ${level}, ${mute})`, 10000, MIXER)).trim());
      if (!n) throw new Error('That app has closed its sound');
    },
  };
}
