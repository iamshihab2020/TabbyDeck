import { describe, expect, it } from 'vitest';
import type os from 'node:os';
import { DEFAULT_SETTINGS } from '@tabbydeck/shared';
import { connectUrls, listLanInterfaces } from '../src/server/net.ts';

const ni = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false) => ({ address, family, internal, netmask: '', mac: '', cidr: null }) as os.NetworkInterfaceInfo;

describe('listLanInterfaces', () => {
  it('keeps private IPv4 addresses and drops loopback, link-local, IPv6 and public ones', () => {
    const r = listLanInterfaces({
      'Wi-Fi': [ni('192.168.1.20'), ni('fe80::1', 'IPv6')],
      Loopback: [ni('127.0.0.1', 'IPv4', true)],
      APIPA: [ni('169.254.10.2')],
      VPN: [ni('10.8.0.5')],
      Docker: [ni('172.20.0.1')],
      Public: [ni('8.8.8.8')],
    });
    expect(r).toEqual([{ name: 'Wi-Fi', ip: '192.168.1.20' }, { name: 'VPN', ip: '10.8.0.5' }, { name: 'Docker', ip: '172.20.0.1' }]);
  });
});

describe('connectUrls', () => {
  const ifaces = [{ name: 'Wi-Fi', ip: '192.168.1.20' }, { name: 'VPN', ip: '10.8.0.5' }];
  it('lists every interface when bound to all', () => {
    expect(connectUrls(DEFAULT_SETTINGS, 8191, ifaces)).toEqual(['http://192.168.1.20:8191/', 'http://10.8.0.5:8191/']);
  });
  it('lists only the bound address', () => {
    expect(connectUrls({ ...DEFAULT_SETTINGS, bindAddress: '192.168.1.20' }, 8191, ifaces)).toEqual(['http://192.168.1.20:8191/']);
  });
  it('puts a Wi-Fi or Ethernet adapter first', () => {
    expect(connectUrls(DEFAULT_SETTINGS, 8191, [{ name: 'vEthernet (WSL)', ip: '172.20.0.1' }, { name: 'Wi-Fi', ip: '192.168.1.20' }])[0]).toBe('http://192.168.1.20:8191/');
  });
});
