import type { Native } from '../types.ts';
import { createSysInfo } from '../sysinfo.ts';
import { createWinInput } from './input.ts';
import { createWinSystem } from './system.ts';
import { createWinAudio } from './audio.ts';
import { createWinDisplay } from './display.ts';
import { PowerShellHost } from './ps.ts';

/** The Windows native layer. The PowerShell host starts lazily on the first audio or clipboard call. */
export function createWinNative(opts: { dataDir: string }): Native {
  const ps = new PowerShellHost();
  return {
    input: createWinInput(),
    system: createWinSystem(ps, opts.dataDir),
    audio: createWinAudio(ps),
    display: createWinDisplay(ps),
    sysinfo: createSysInfo(),
    dispose: async () => ps.dispose(),
  };
}
