/** What a weather key shows: the temperature and the place's own name, or why there is none. */
export type Reading = { tempC: number; place: string } | { error: 'City not found' | 'Offline' };

const FRESH = 15 * 60_000, RETRY = 60_000;

/**
 * The temperature outside in a city, from Open-Meteo (free, no account or key). A city is looked up once; its
 * temperature is read again every 15 minutes, or a minute after a failure. Reads never wait: get() returns the last
 * reading and fetches a new one in the background.
 */
export class Weather {
  private places = new Map<string, { lat: number; lon: number; name: string } | null>();
  private readings = new Map<string, { at: number; r: Reading }>();
  private busy = new Set<string>();

  constructor(private d: { fetch?: typeof fetch; now?: () => number } = {}) {}

  get(city: string): Reading | undefined {
    const key = city.trim().toLowerCase();
    const last = this.readings.get(key), now = this.d.now?.() ?? Date.now();
    if (key && !this.busy.has(key) && (!last || now - last.at > ('error' in last.r ? RETRY : FRESH))) {
      this.busy.add(key);
      void this.read(key).then(r => this.readings.set(key, { at: this.d.now?.() ?? Date.now(), r }), () => {}).finally(() => this.busy.delete(key));
    }
    return last?.r;
  }

  private async json(url: string): Promise<any> {
    const res = await (this.d.fetch ?? fetch)(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async read(key: string): Promise<Reading> {
    try {
      if (!this.places.has(key)) {
        const g = (await this.json(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(key)}`)).results?.[0];
        this.places.set(key, g ? { lat: g.latitude, lon: g.longitude, name: g.name } : null);
      }
      const p = this.places.get(key);
      if (!p) return { error: 'City not found' };
      const t = (await this.json(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m`)).current?.temperature_2m;
      return typeof t === 'number' ? { tempC: t, place: p.name } : { error: 'Offline' };
    } catch { return { error: 'Offline' }; }
  }
}
