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
  Info: { icon: 'gauge', text: 'Keys that show CPU, memory, battery or the time, and timers with a Pomodoro.' },
  Deck: { icon: 'squares-four', text: 'Switch profiles, open folders, variables and messages on the device.' },
};

// Planned integrations with other apps; listed so it is clear what TabbyDeck cannot do yet.
const LATER: { name: string; icon: string; text: string }[] = [
  { name: 'OBS Studio', icon: 'record', text: 'Switch scenes, start and stop recording or streaming, mute sources.' },
  { name: 'Spotify', icon: 'spotify-logo', text: 'Play a playlist and like a song (what is playing already shows, from the Media keys).' },
  { name: 'Discord', icon: 'discord-logo', text: 'Deafen and push to talk (mute works now, from the Meetings keys).' },
  { name: 'Home Assistant', icon: 'house', text: 'Lights, plugs and scenes in your home.' },
];

/** What TabbyDeck can do today, then the integrations that are planned but not built yet. */
export function IntegrationsPage() {
  const { state } = useSnapshot();
  const groups = [...new Set(state!.catalogue.map(a => a.group))];
  return (
    <section class="simple-page" aria-labelledby="h-int">
      <h1 id="h-int">Integrations</h1>
      <p class="muted">Built in and always on.</p>
      <div class="int-grid">
        {groups.map(g => (
          <div key={g} class="int-card">
            <Icon name={ABOUT[g]?.icon ?? 'lightning'} size={22} />
            <div>
              <h2>{g}</h2>
              <p class="muted">{ABOUT[g]?.text}</p>
              <ul class="int-actions" aria-label={`${g} actions`}>
                {state!.catalogue.filter(a => a.group === g).map(a => <li key={a.id}>{a.name}</li>)}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <h2 class="int-later-h">Not yet available</h2>
      <p class="muted">Planned for the next release. Until then, a hotkey button can often do the job, for example the app's own shortcut.</p>
      <div class="int-grid">
        {LATER.map(l => (
          <div key={l.name} class="int-card later" aria-label={`${l.name}, not yet available`}>
            <Icon name={l.icon} size={22} />
            <div>
              <h2>{l.name}</h2>
              <p class="muted">{l.text}</p>
              <span class="int-soon">Not yet</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
