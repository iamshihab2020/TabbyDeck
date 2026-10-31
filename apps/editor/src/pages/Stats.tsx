import { useEffect, useRef, useState } from 'preact/hooks';
import type { ProfileFile, StatsSummary } from '@tabbydeck/shared';
import { BadgeArt, Tile, cellOffset, cellSpan, useCellSize } from '@tabbydeck/ui';
import { BADGES } from '@tabbydeck/shared/badges';
import { useApi, useSnapshot } from '../state.ts';
import { toView } from '../canvas/view.ts';

const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const day = (date: string) => new Date(`${date}T12:00:00`);
const when = (date: string, long: boolean) => {
  const d = day(date);
  return long ? `${FULL[d.getDay()]} ${d.getDate()} ${d.toLocaleString(undefined, { month: 'short' })}` : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
};
const hours = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const assetUrl = (id: string) => `/assets/u/${encodeURIComponent(id)}`;
const SHORT = 10;

/** One profile's main page as it looks on the deck, each key lit by how often it was pressed in the period. */
function HeatDeck({ file, profiles, counts }: { file: ProfileFile; profiles: ProfileFile[]; counts: Map<string, number> }) {
  const screen = useRef<HTMLDivElement>(null);
  const view = toView(file, file.profile.rootFolderId, profiles);
  const { cols, rows, gap } = view;
  const cell = useCellSize(screen, cols, rows, gap);
  const top = Math.max(1, ...view.widgets.map(w => counts.get(w.id) ?? 0));
  const pos = (r: { x: number; y: number; w: number; h: number }) => ({
    left: `${cellOffset(r.x, cell.w, gap)}px`, top: `${cellOffset(r.y, cell.h, gap)}px`,
    width: `${cellSpan(r.w, cell.w, gap)}px`, height: `${cellSpan(r.h, cell.h, gap)}px`,
  });
  return (
    <div class="heat-bezel">
      <div class="screen heat-screen" ref={screen} style={{ background: view.bgImage ? `url("${assetUrl(view.bgImage)}") center / cover no-repeat, ${view.bg}` : view.bg }}>
        <div class={`canvas-grid tiles-${file.profile.tiles ?? 'keycap'}`} style={{ width: `${cellSpan(cols, cell.w, gap)}px`, height: `${cellSpan(rows, cell.h, gap)}px` }}>
          {view.widgets.map(wv => {
            const n = counts.get(wv.id) ?? 0;
            return (
              <div key={wv.id} class={n ? 'heat-key' : 'heat-key cold'} style={{ ...pos(wv), '--heat': (0.25 + 0.75 * n / top).toFixed(2) }}
                title={`${wv.look.label || 'Key'}: ${n ? `${n} ${n === 1 ? 'press' : 'presses'}` : 'not pressed'}`}>
                <Tile widget={wv} cell={cell} assetUrl={assetUrl} tabIndex={-1} style={{ left: '0', top: '0', width: '100%', height: '100%' }} />
                {n > 0 && <span class="heat-count">{n}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** How the deck was used, as counted on this PC: presses per day, every key and every app by use. */
export function StatsPage() {
  const api = useApi();
  const { state } = useSnapshot();
  const [days, setDays] = useState(7);
  const [s, setS] = useState<StatsSummary | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [allKeys, setAllKeys] = useState(false);
  const [allApps, setAllApps] = useState(false);
  useEffect(() => { setS(null); api.cmd<StatsSummary>('stats.get', { days }).then(setS, () => {}); }, [days]);

  const profiles = state?.profiles ?? [];
  const counts = new Map((s?.keys ?? []).filter(k => k.id).map(k => [k.id!, k.n]));
  const pressesOn = (f: ProfileFile) => f.widgets.reduce((n, w) => n + (counts.get(w.id) ?? 0), 0);
  // Open on the deck that saw the most presses, until a deck is picked.
  const busiestDeck = [...profiles].sort((a, b) => pressesOn(b) - pressesOn(a))[0];
  const shown = profiles.find(f => f.profile.id === pick) ?? busiestDeck;
  const most = s ? Math.max(1, ...s.days.map(d => d.presses)) : 1, topKey = s ? Math.max(1, s.keys[0]?.n ?? 1) : 1, topApp = s ? Math.max(1, s.apps[0]?.minutes ?? 1) : 1;
  // One row per badge, with every day it was earned (they come newest first).
  const byBadge = new Map<StatsSummary['badges'][number]['id'], string[]>();
  for (const b of s?.badges ?? []) byBadge.set(b.id, [...(byBadge.get(b.id) ?? []), b.date]);
  const badges = [...byBadge].map(([id, dates]) => ({ id, dates }));
  const plants = s?.garden?.reduce((n, d) => n + d.plants, 0) ?? 0, wilted = s?.garden?.reduce((n, d) => n + d.wilted, 0) ?? 0;

  return (
    <section class="simple-page stats-page" aria-labelledby="h-stats">
      <header class="stats-head">
        <div>
          <h1 id="h-stats">Stats</h1>
          <p class="muted">Counted on this PC only; nothing is sent anywhere.</p>
        </div>
        <div class="segmented stats-range" role="radiogroup" aria-label="Period">
          {[7, 30].map(n => <button key={n} type="button" role="radio" aria-checked={days === n} class={days === n ? 'seg on' : 'seg'} onClick={() => setDays(n)}>Last {n} days</button>)}
        </div>
      </header>

      {!s ? <p class="muted">Reading…</p> : <>
        <p class="stats-lede">
          {s.total
            ? <>{s.total} {s.total === 1 ? 'press' : 'presses'} in the last {days} days.{s.busiest && <> <span class="nowrap">{when(s.busiest.date, true)}</span> was the busiest, with {s.busiest.presses}.</>}</>
            : <>No presses in the last {days} days. Press a key on a deck and it shows up here.</>}
          {s.apps[0] && <span class="stats-lede-2">{s.apps[0].app} was in front longest: {hours(s.apps[0].minutes)}.</span>}
        </p>

        <div class={`stats-bars${days > 7 ? ' many' : ''}`} role="img" aria-label={s.days.map(d => `${when(d.date, true)}: ${d.presses}`).join(', ')}>
          {s.days.map(d => (
            <div key={d.date} class={s.busiest?.date === d.date ? 'stats-day top' : 'stats-day'} title={`${when(d.date, true)}: ${d.presses} presses`}>
              {days <= 7 && <span class="stats-n">{d.presses || ''}</span>}
              <span class="stats-bar" style={{ height: `${Math.round((d.presses / most) * 100)}%` }} />
              {days <= 7 && <span class="stats-label">{when(d.date, false)}</span>}
            </div>
          ))}
        </div>

        {shown && <>
          <div class="stats-heat-head">
            <h2 class="custom-h">Where your presses went</h2>
            {profiles.length > 1 && (
              <div class="segmented heat-pick" role="radiogroup" aria-label="Deck">
                {profiles.map(f => <button key={f.profile.id} type="button" role="radio" aria-checked={f === shown} class={f === shown ? 'seg on' : 'seg'} onClick={() => setPick(f.profile.id)}>{f.profile.name}</button>)}
              </div>
            )}
          </div>
          <p class="muted heat-note">Brighter keys were pressed more; the number is how many times. Keys inside folders are not shown.</p>
          <HeatDeck file={shown} profiles={profiles} counts={counts} />
        </>}

        <div class="stats-lists">
          <div>
            <h2 class="custom-h">Keys</h2>
            {!s.keys.length ? <p class="muted">No keys pressed in this period.</p> : (
              <ol class="stats-list">{(allKeys ? s.keys : s.keys.slice(0, SHORT)).map((k, i) => <li key={k.id ?? i}><span class="stats-name">{k.label}</span><span class="stats-meter"><i style={{ width: `${(k.n / topKey) * 100}%` }} /></span><span class="stats-num">{k.n}</span></li>)}</ol>
            )}
            {s.keys.length > SHORT && <button type="button" class="btn small ghost stats-more" onClick={() => setAllKeys(!allKeys)}>{allKeys ? 'Show the top 10' : `Show all ${s.keys.length} keys`}</button>}
          </div>
          <div>
            <h2 class="custom-h">Apps in front</h2>
            {!s.apps.length ? <p class="muted">No app time counted in this period.</p> : (
              <ol class="stats-list">{(allApps ? s.apps : s.apps.slice(0, SHORT)).map(a => <li key={a.app}><span class="stats-name">{a.app}</span><span class="stats-meter"><i style={{ width: `${(a.minutes / topApp) * 100}%` }} /></span><span class="stats-num">{hours(a.minutes)}</span></li>)}</ol>
            )}
            {s.apps.length > SHORT && <button type="button" class="btn small ghost stats-more" onClick={() => setAllApps(!allApps)}>{allApps ? 'Show the top 10' : `Show all ${s.apps.length} apps`}</button>}
          </div>
        </div>

        <div class="stats-lists">
          <div>
            <h2 class="custom-h">Badges</h2>
            {!badges.length ? <p class="muted">None yet in this period. Early bird: a key before 7 am. Night owl: a key after 2 am. Speed run: 50 presses in a minute. Zen: two hours of Do not disturb in a day.</p> : (
              <ul class="stats-badges">{badges.map(b => (
                <li key={b.id}>
                  <BadgeArt id={b.id} size={40} />
                  <span><b>{BADGES[b.id].name}{b.dates.length > 1 && <span class="badge-times"> ×{b.dates.length}</span>}</b>
                    <span class="muted">{BADGES[b.id].text} {b.dates.map(d => when(d, false)).join(', ')}</span></span>
                </li>
              ))}</ul>
            )}
          </div>
          <div>
            <h2 class="custom-h">Focus garden</h2>
            {!plants && !wilted ? <p class="muted">Nothing growing yet. Each Pomodoro focus that runs to the end grows a plant on the decks; one you reset part way wilts.</p> : (
              <p class="muted"><b class="stats-garden">{plants}</b> {plants === 1 ? 'plant' : 'plants'} grown, {wilted} wilted in this period.</p>
            )}
          </div>
        </div>
      </>}
    </section>
  );
}
