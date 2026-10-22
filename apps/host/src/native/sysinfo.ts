import os from 'node:os';
import type { NativeSysInfo } from './types.ts';

/** CPU from the change in os.cpus() tick counters between calls (os.loadavg is always 0 on Windows); RAM from os. */
export function createSysInfo(battery: NativeSysInfo['battery'] = () => null): NativeSysInfo {
  const ticks = () => os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { idle: 0, total: 0 });
  let last = ticks();
  return {
    cpuPercent: () => {
      const now = ticks();
      const total = now.total - last.total, idle = now.idle - last.idle;
      last = now;
      return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
    },
    ramPercent: () => Math.round((1 - os.freemem() / os.totalmem()) * 100),
    battery,
  };
}
