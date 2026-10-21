import { Icon } from '@tabbydeck/ui';
import { useSnapshot } from '../state.ts';

const ABOUT: Record<string, { icon: string; text: string }> = {
  Keyboard: { icon: 'keyboard', text: 'Hotkeys, typing text, holding keys down.' },
  Mouse: { icon: 'mouse', text: 'Move, click and scroll.' },
  System: { icon: 'desktop', text: 'Open apps, files and links, lock, sleep, screenshots, clipboard.' },
  Audio: { icon: 'speaker-high', text: 'Volume, mute and microphone.' },
  Display: { icon: 'sun', text: 'Brightness for each screen, night light, power saver, extend or duplicate screens.' },
  Deck: { icon: 'squares-four', text: 'Switch profiles, open folders, variables and messages on the device.' },
};

// Planned integrations with other apps; listed so it is clear what TabbyDeck cannot do yet.
const LATER: { name: string; icon: string; text: string }[] = [
  { name: 'OBS Studio', icon: 'record', text: 'Switch scenes, start and stop recording or streaming, mute sources.' },
  { name: 'Spotify', icon: 'spotify-logo', text: 'Play a playlist, like a song, show what is playing on the key.' },
  { name: 'Discord', icon: 'discord-logo', text: 'Mute, deafen and push to talk in voice calls.' },
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
              <span class="int-count">{state!.catalogue.filter(a => a.group === g).length} actions</span>
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
