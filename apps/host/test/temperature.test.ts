import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type Widget } from '@tabbydeck/shared';
import { createFakeNative } from '../src/native/fake.ts';
import { InfoKeys } from '../src/engine/info.ts';
import { Weather } from '../src/engine/weather.ts';
import type { Store } from '../src/store/store.ts';

const key = (params: Record<string, unknown>): Widget => ({ id: 'w', folderId: 'f', x: 0, y: 0, w: 1, h: 1, look: DEFAULT_LOOK, config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 's', action: 'info.temperature', params }] } } });
const settle = () => new Promise(r => setTimeout(r, 0));
const store = { profiles: () => [] } as unknown as Store;

/** A fetch that answers Open-Meteo's two calls; counts calls, and fails while offline is set. */
function fakeMeteo() {
  const m = { calls: [] as string[], offline: false, temp: 23.6 };
  const fetch = (async (url: string) => {
    m.calls.push(url);
    if (m.offline) throw new Error('offline');
    const body = url.includes('geocoding') ? { results: url.includes('nowhere') ? undefined : [{ latitude: 23.7, longitude: 90.4, name: 'Dhaka' }] } : { current: { temperature_2m: m.temp } };
    return { ok: true, json: async () => body } as Response;
  }) as typeof globalThis.fetch;
  return { m, fetch };
}

describe('temperature key', () => {
  it('CPU shows the PC\'s reading in °C or °F, read again every 10 seconds, or a dash when the PC does not report one', async () => {
    let now = 0; const native = createFakeNative();
    const info = new InfoKeys({ store, native, now: () => now });
    expect(info.liveOf(key({ source: 'cpu' }))).toEqual({ big: '…' }); // first read in flight
    await settle();
    expect(info.liveOf(key({ source: 'cpu', unit: 'f' })).big).toBe('126°F');
    native.tempC = null; now = 11_000; info.liveOf(key({ source: 'cpu' })); await settle();
    expect(info.liveOf(key({ source: 'cpu' }))).toMatchObject({ big: '—', look: { label: 'Not reported' } });
    // The phone keeps a patched label, so a reading puts the key's own label back.
    native.tempC = 52; now = 22_000; info.liveOf(key({ source: 'cpu' })); await settle();
    expect(info.liveOf({ ...key({ source: 'cpu', unit: 'c' }), look: { ...DEFAULT_LOOK, label: 'CPU temp' } })).toEqual({ big: '52°C', look: { label: 'CPU temp' } });
  });

  it('weather looks the city up once, shows its temperature and name, refreshes after 15 minutes and says when it cannot', async () => {
    let now = 0; const { m, fetch } = fakeMeteo();
    const info = new InfoKeys({ store, native: createFakeNative(), now: () => now, weather: new Weather({ fetch, now: () => now }) });
    expect(info.liveOf(key({ source: 'weather', city: ' ' }))).toMatchObject({ big: '—', look: { label: 'Set a city' } });
    expect(info.liveOf(key({ source: 'weather', city: 'dhaka' })).big).toBe('…');
    await settle(); await settle();
    expect(info.liveOf(key({ source: 'weather', city: 'Dhaka' }))).toMatchObject({ big: '24°C', look: { label: 'Dhaka' } });
    expect(m.calls).toHaveLength(2);
    m.temp = 30; now = 16 * 60_000; info.liveOf(key({ source: 'weather', city: 'Dhaka' })); await settle();
    expect(info.liveOf(key({ source: 'weather', city: 'Dhaka', unit: 'f' })).big).toBe('86°F');
    expect(m.calls.filter(u => u.includes('geocoding'))).toHaveLength(1);
    m.offline = true; now = 32 * 60_000; info.liveOf(key({ source: 'weather', city: 'Dhaka' })); await settle();
    expect(info.liveOf(key({ source: 'weather', city: 'Dhaka' }))).toMatchObject({ big: '—', look: { label: 'Offline' } });
    m.offline = false; info.liveOf(key({ source: 'weather', city: 'nowhere' })); await settle();
    expect(info.liveOf(key({ source: 'weather', city: 'nowhere' }))).toMatchObject({ big: '—', look: { label: 'City not found' } });
  });
});
