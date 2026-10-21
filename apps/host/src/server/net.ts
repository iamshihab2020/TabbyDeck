import os from 'node:os';
import type { Settings } from '@tabbydeck/shared';

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

/** IPv4 addresses a phone on the same network could reach: private ranges only, no loopback or link-local. */
export function listLanInterfaces(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): { name: string; ip: string }[] {
  const out: { name: string; ip: string }[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (PRIVATE.some(r => r.test(i.address))) out.push({ name, ip: i.address });
    }
  }
  return out;
}

/** Real Wi-Fi first, then Ethernet, then the rest; virtual adapters (WSL, Hyper-V, Docker, VPNs) last — a phone cannot reach those. */
function rank(name: string): number {
  if (/vethernet|wsl|hyper-v|docker|vmware|virtualbox|vpn|tailscale|zerotier|loopback/i.test(name)) return 3;
  if (/wi-?fi|wlan|wireless/i.test(name)) return 0;
  if (/ethernet|\blan\b/i.test(name)) return 1;
  return 2;
}
export const sortInterfaces = <T extends { name: string }>(l: T[]) => [...l].sort((a, b) => rank(a.name) - rank(b.name));

/** URLs to show next to the QR code: the bound address, or every LAN interface (best first) when bound to all. */
export function connectUrls(settings: Settings, port: number, ifaces = listLanInterfaces()): string[] {
  if (settings.bindAddress && settings.bindAddress !== '0.0.0.0') return [`http://${settings.bindAddress}:${port}/`];
  return sortInterfaces(ifaces).map(i => `http://${i.ip}:${port}/`);
}
