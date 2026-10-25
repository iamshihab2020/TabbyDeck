import { useMemo } from 'preact/hooks';
import type { StatsSummary } from '@tabbydeck/shared';
import { BadgeArt, Icon } from '@tabbydeck/ui';
import { BADGES } from '@tabbydeck/shared/badges';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (date: string) => new Date(`${date}T12:00:00`).getDay();

/** 754 -> "12 h 34 min"; 40 -> "40 min". */
export const hoursText = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`);

/** The headline: the key pressed most this week, in a sentence. */
export function headline(s: StatsSummary): string {
  const top = s.keys[0];
  if (!top) return 'No keys pressed yet this week.';
  return `You pressed ${top.label} ${top.n} time${top.n === 1 ? '' : 's'} this week.`;
}

/** "Your week": the key used most, a bar for each of the last seven days, the busiest day and the app most in front. */
export function WeekCard({ stats, onClose }: { stats: StatsSummary | null; onClose(): void }) {
  const opened = useMemo(() => Date.now(), []);
  const most = stats ? Math.max(1, ...stats.days.map(d => d.presses)) : 1;
  return (
    <div class="sheet-backdrop" onClick={() => { if (Date.now() - opened > 500) onClose(); }}>
      <section class="sheet week" role="dialog" aria-label="Your week" onClick={e => e.stopPropagation()}>
        <div class="sheet-handle" />
        <h2 class="bright-title"><Icon name="chart-bar" size={20} />Your week</h2>
        {!stats ? <p class="hint">Reading from the PC…</p> : <>
          <p class="week-head">{headline(stats)}</p>
          <div class="week-bars" role="img" aria-label={stats.days.map(d => `${FULL[weekday(d.date)]} ${d.presses}`).join(', ')}>
            {stats.days.map(d => (
              <div key={d.date} class={stats.busiest?.date === d.date ? 'week-day top' : 'week-day'}>
                <span class="week-n">{d.presses || ''}</span>
                <span class="week-bar" style={{ height: `${Math.round((d.presses / most) * 100)}%` }} />
                <span class="week-label">{DAY[weekday(d.date)]}</span>
              </div>
            ))}
          </div>
          <ul class="week-facts">
            <li><Icon name="trophy" size={18} /><span>{stats.busiest ? <>Busiest day: <b>{FULL[weekday(stats.busiest.date)]}</b>, {stats.busiest.presses} presses</> : 'No busiest day yet'}</span></li>
            <li><Icon name="app-window" size={18} /><span>{stats.apps[0] ? <>Most time in <b>{stats.apps[0].app}</b>: {hoursText(stats.apps[0].minutes)}</> : 'No app time counted yet'}</span></li>
            <li><Icon name="squares-four" size={18} /><span><b>{stats.total}</b> key presses in all</span></li>
          </ul>
          {stats.badges.length > 0 && <div class="week-badges">{stats.badges.map(b => <span key={b.id + b.date} class="week-badge"><BadgeArt id={b.id} size={26} />{BADGES[b.id].name} · {DAY[weekday(b.date)]}</span>)}</div>}
          <p class="hint">Counted on your PC only. The editor's Stats page has every key and app.</p>
        </>}
        <div class="sheet-row"><button type="button" class="btn primary" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}
