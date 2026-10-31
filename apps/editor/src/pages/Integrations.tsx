import { useState } from 'preact/hooks';
import { Icon } from '@tabbydeck/ui';
import { useSnapshot } from '../state.ts';

const ABOUT: Record<string, { icon: string; text: string }> = {
  Keyboard: { icon: 'keyboard', text: 'Hotkeys, typing text, and holding keys down.' },
  Mouse: { icon: 'mouse', text: 'Move, click and scroll, plus a trackpad and keyboard on the phone.' },
  System: { icon: 'desktop', text: 'Open apps, files and links, arrange windows, Do not disturb, Bluetooth, lock, sleep, screenshots and the clipboard.' },
  Audio: { icon: 'speaker-high', text: "Volume, mute and microphone, each app's own volume, and switching between speakers and headphones." },
  Media: { icon: 'music-notes', text: 'What is playing, with its title, artist and cover, in any music or video app.' },
  Meetings: { icon: 'video-camera', text: 'Mute, camera, raise hand and leave, in the call you are in: Teams, Zoom, Google Meet, Slack or Discord.' },
  Display: { icon: 'sun', text: 'Brightness for each screen, night light, power saver, and extend or duplicate screens.' },
  Info: { icon: 'gauge', text: 'Keys that show CPU, memory, battery, temperature or the time, and timers with a Pomodoro.' },
  Deck: { icon: 'squares-four', text: 'Switch profiles, open folders, variables and messages on the device.' },
};

// Planned integrations with other apps; listed so it is clear what TabbyDeck cannot do yet.
const LATER: { name: string; icon: string; text: string }[] = [
  { name: 'OBS Studio', icon: 'record', text: 'Switch scenes, start and stop recording or streaming, mute sources.' },
  { name: 'Spotify', icon: 'spotify-logo', text: 'Play a playlist and like a song (what is playing already shows, from the Media keys).' },
  { name: 'Discord', icon: 'discord-logo', text: 'Deafen and push to talk (mute works now, from the Meetings keys).' },
  { name: 'Home Assistant', icon: 'house', text: 'Lights, plugs and scenes in your home.' },
];

const anchor = (g: string) => `int-${g.toLowerCase().replace(/\W+/g, '-')}`;

/** Everything a key can do, by group and searchable, then the integrations that are planned but not built yet. */
export function IntegrationsPage() {
  const { state } = useSnapshot();
  const [q, setQ] = useState('');
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const all = state!.catalogue;
  const found = all.filter(a => words.every(w => `${a.name} ${a.group} ${a.description ?? ''}`.toLowerCase().includes(w)));
  const groups = [...new Set(all.map(a => a.group))].map(g => ({ g, list: found.filter(a => a.group === g) })).filter(x => x.list.length);
  const later = LATER.filter(l => words.every(w => `${l.name} ${l.text}`.toLowerCase().includes(w)));
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  return (
    <section class="simple-page int-page" aria-labelledby="h-int">
      <header class="int-head">
        <div>
          <h1 id="h-int">Integrations</h1>
          <p class="muted">Everything a key can do. All of it is built in, so there is nothing to install.</p>
        </div>
        <label class="int-search">
          <Icon name="magnifying-glass" size={18} />
          <input class="input" type="search" placeholder={`Find an action among ${all.length}`} aria-label="Find an action" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} />
        </label>
      </header>

      <div class="int-body">
        <nav class="int-index" aria-label="Groups">
          {groups.map(({ g, list }) => (
            <button key={g} type="button" onClick={() => jump(anchor(g))}>
              <Icon name={ABOUT[g]?.icon ?? 'lightning'} size={16} /><span>{g}</span><span class="int-count">{list.length}</span>
            </button>
          ))}
          {later.length > 0 && <button type="button" class="int-index-later" onClick={() => jump('int-later')}><Icon name="hourglass-medium" size={16} /><span>Not yet available</span><span class="int-count">{later.length}</span></button>}
        </nav>

        <div class="int-list">
          {!groups.length && !later.length && (
            <p class="int-empty">No action matches “{q.trim()}”. A key that presses the app's own shortcut can often do the job: use Press hotkey.</p>
          )}
          {groups.map(({ g, list }) => (
            <section key={g} id={anchor(g)} class="int-group" aria-labelledby={`${anchor(g)}-h`}>
              <div class="int-group-head">
                <Icon name={ABOUT[g]?.icon ?? 'lightning'} size={22} />
                <h2 id={`${anchor(g)}-h`}>{g}</h2>
                <p class="muted">{ABOUT[g]?.text}</p>
              </div>
              <ul class="int-actions">
                {list.map(a => (
                  <li key={a.id}>
                    <b>{a.name}</b>
                    {a.danger && <span class="int-care">Use with care</span>}
                    {a.description && <span class="muted">{a.description}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {later.length > 0 && (
            <section id="int-later" class="int-group later" aria-labelledby="int-later-h">
              <div class="int-group-head">
                <Icon name="hourglass-medium" size={22} />
                <h2 id="int-later-h">Not yet available</h2>
                <p class="muted">Planned for a later release. Until then, a Press hotkey key with the app's own shortcut can often do the job.</p>
              </div>
              <ul class="int-actions">
                {later.map(l => <li key={l.name}><b><Icon name={l.icon} size={16} />{l.name}</b><span class="muted">{l.text}</span></li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
