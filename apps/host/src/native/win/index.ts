import type { Native } from '../types.ts';
import { createSysInfo } from '../sysinfo.ts';
import { createWinInput } from './input.ts';
import { createWinSystem } from './system.ts';
import { createWinAudio } from './audio.ts';
import { createWinDisplay } from './display.ts';
import { PowerShellHost } from './ps.ts';
import { win32 } from './win32.ts';

// BatteryFlag 128 means no battery; ACLineStatus 1 is plugged in.
const battery = () => {
  const s = { ACLineStatus: 0, BatteryFlag: 0, BatteryLifePercent: 0, SystemStatusFlag: 0, BatteryLifeTime: 0, BatteryFullLifeTime: 0 };
  if (!win32().GetSystemPowerStatus(s) || s.BatteryFlag === 128 || s.BatteryFlag === 255 || s.BatteryLifePercent > 100) return null;
  return { percent: s.BatteryLifePercent, charging: s.ACLineStatus === 1 };
};

// The Thermal Zone counters are readable without admin (MSAcpi_ThermalZoneTemperature is not); tenths of a kelvin.
const THERMAL = '(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation | Measure-Object HighPrecisionTemperature -Maximum).Maximum';
const cpuTemp = (ps: PowerShellHost) => async () => {
  const c = Number((await ps.call(THERMAL, 8000).catch(() => '')).trim()) / 10 - 273.15;
  return c > 0 && c < 150 ? c : null;
};

/** The Windows native layer. The PowerShell host starts lazily on the first audio or clipboard call. */
export function createWinNative(opts: { dataDir: string }): Native {
  const ps = new PowerShellHost();
  return {
    input: createWinInput(),
    system: createWinSystem(ps, opts.dataDir),
    audio: createWinAudio(ps),
    display: createWinDisplay(ps),
    sysinfo: createSysInfo(battery, cpuTemp(ps)),
    dispose: async () => ps.dispose(),
  };
}
