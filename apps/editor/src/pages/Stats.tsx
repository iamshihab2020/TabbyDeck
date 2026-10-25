import { useEffect, useState } from 'preact/hooks';
import type { StatsSummary } from '@tabbydeck/shared';
import { BadgeArt, Icon } from '@tabbydeck/ui';
import { BADGES } from '@tabbydeck/shared/badges';
import { useApi } from '../state.ts';

const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const when = (date: string, long: boolean) => {
  const d = new Date(`${date}T12:00:00`);
  return long ? `${FULL[d.getDay()]} ${d.getDate()} ${d.toLocaleString(undefined, { month: 'short' })}` : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
};
const hours = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/** How the deck was used, as counted on this PC: presses per day, every key and every app by use. */
export function StatsPage() {
  const api = useApi();
  const [days, setDays] = useState(7);
  const [s, setS] = useState<StatsSummary | null>(null);
  useEffect(() => { setS(null); api.cmd<StatsSummary>('stats.get', { days }).then(setS, () => {}); }, [days]);
  const most = s ? Math.max(1, ...s.days.map(d => d.presses)) : 1, topKey = s ? Math.max(1, s.keys[0]?.n ?? 1) : 1, topApp = s ? Math.max(1, s.apps[0]?.minutes ?? 1) : 1;
  return (
    <section class="simple-page stats-page" aria-labelledby="h-stats">
      <h1 id="h-stats">Stats</h1>
      <p class="muted">How you use your decks. Counted on this PC only; nothing is sent anywhere.</p>
      <div class="segmented stats-range" role="radiogroup" aria-label="Period">
        {[7, 30].map(n => <button key={n} type="button" role="radio" aria-checked={days === n} class={days === n ? 'seg on' : 'seg'} onClick={() => setDays(n)}>Last {n} days</button>)}
      </div>
      {!s ? <p class="muted">Reading…</p> : <>
        <div class="stats-cards">
          <div class="stats-card"><Icon name="squares-four" size={20} /><b>{s.total}</b><span class="muted">key presses</span></div>
          <div class="stats-card"><Icon name="trophy" size={20} /><b>{s.busiest ? when(s.busiest.date, true) : '—'}</b><span class="muted">{s.busiest ? `busiest day, ${s.busiest.presses} presses` : 'no busiest day yet'}</span></div>
          <div class="stats-card"><Icon name="app-window" size={20} /><b>{s.apps[0]?.app ?? '—'}</b><span class="muted">{s.apps[0] ? `most time in front, ${hours(s.apps[0].minutes)}` : 'no app time yet'}</span></div>
        </div>
        <div class={`stats-bars${days > 7 ? ' many' : ''}`} role="img" aria-label={s.days.map(d => `${when(d.date, true)}: ${d.presses}`).join(', ')}>
          {s.days.map(d => (
            <div key={d.date} class={s.busiest?.date === d.date ? 'stats-day top' : 'stats-day'} title={`${when(d.date, true)}: ${d.presses} presses`}>
              <span class="stats-bar" style={{ height: `${Math.round((d.presses / most) * 100)}%` }} />
              {days <= 7 && <span class="stats-label">{when(d.date, false)}</span>}
            </div>
          ))}
        </div>
        <h2 class="custom-h">Badges</h2>
        {!s.badges.length ? <p class="muted">None yet in this period. Early bird: a key before 7 am. Night owl: a key after 2 am. Speed run: 50 presses in a minute. Zen: two hours of Do not disturb in a day.</p> : (
          <div class="stats-badges">{s.badges.map(b => (
            <div key={b.id + b.date} class="stats-badge"><BadgeArt id={b.id} size={44} /><span><b>{BADGES[b.id].name}</b><span class="muted">{BADGES[b.id].text} {when(b.date, true)}</span></span></div>
          ))}</div>
        )}
        <div class="stats-lists">
          <div>
            <h2 class="custom-h">Keys</h2>
            {!s.keys.length ? <p class="muted">No keys pressed in this period.</p> : (
              <ol class="stats-list">{s.keys.map((k, i) => <li key={i}><span class="stats-name">{k.label}</span><span class="stats-meter"><i style={{ width: `${(k.n / topKey) * 100}%` }} /></span><span class="stats-num">{k.n}</span></li>)}</ol>
            )}
          </div>
          <div>
            <h2 class="custom-h">Apps in front</h2>
            {!s.apps.length ? <p class="muted">No app time counted in this period.</p> : (
              <ol class="stats-list">{s.apps.map(a => <li key={a.app}><span class="stats-name">{a.app}</span><span class="stats-meter"><i style={{ width: `${(a.minutes / topApp) * 100}%` }} /></span><span class="stats-num">{hours(a.minutes)}</span></li>)}</ol>
            )}
          </div>
        </div>
      </>}
    </section>
  );
}
