# Changelog

## 0.2.0 (2026-10-23)

### Ready-made decks
- Developer, Office, Streamer and Music decks. Pick them in the first-run guide, or from New profile in the editor; each one is its own profile, and you can delete it like any other.
- Each deck gets only as many columns as fill its rows (25 keys make 5 by 5), and its app keys open the app found on this PC, with its own icon.
- Keys for apps this PC does not have (Spotify on a PC without it) stay off the decks and come back once the app is installed. The keys after them close up, so no gap is left. The editor marks such keys "Not on this PC".

### On the phone
- Swipe the keys left or right to change profile; dots by the profile name show where you are. Sliders in the panels are not affected, and a key the finger slides over never fires.
- Trackpad and keyboard: a key opens a touchpad. One finger moves the pointer, a tap clicks, two fingers scroll or right-click, Left and Right can be held to drag, and a box types on the PC, with Enter and Backspace.
- Live keys: CPU, memory, battery and the time, shown large on the key.
- Timer and Pomodoro keys: press to start or pause, hold to reset. Every deck gets a message when the time is up or the break starts.
- Add TabbyDeck to the home screen: it opens full screen from its own icon. The deck's settings explain how.
- iPhone and iPad: the deck works in Safari on iOS 13 or newer, and from the home screen. Holding a key no longer selects its label or opens the callout menu, and an iPad is named iPad instead of Browser.

### Sound and media
- Volume mixer: the Volume panel has a slider and mute for each app with sound, and a choice of output.
- Switch sound output key: goes to a chosen output, or to the next one each press, and shows which one plays.
- Now playing key: the title, the artist and the cover of what is playing. Tap to play or pause, hold for the next track.

### Meetings
- Mute, camera, raise hand and leave keys, for the app you are in a call with: Teams, Zoom, Google Meet, Slack huddles or Discord, found by which app is using the microphone. You can still choose one app. Leave asks first.
- The Camera key lights while an app uses the camera.

### Windows and apps
- Do not disturb key: turns Windows notifications off and on, and lights while they are off.
- Decks follow the app in front: give a profile its apps with Follow apps, and phones switch to it while one of them is in front, then back. Each device can turn this off on the Devices page.
- One button can open several apps together: in Apps on this PC, choose Pick several, tick the apps, then Add button.
- Move window step and keys: snap a window to a half, maximize, minimize or send it to the other screen. It waits for an app that is still opening.
- Wait step, for buttons that open apps and then arrange them.
- Open app or file opens folders too, and every Open app step can choose an installed app from a list.
- Switch to window can pick an app that is open now, and finds it by its program (code.exe) as well as by title.

### Editor
- Themes: a new page in the sidebar sets how the keys look, for every profile at once or one at a time. Six styles: Keycap (as before), Sunken, Soft, Glass, Pad and Outline. The Keys button above the grid sets it for the profile you are editing, and the grid in the editor shows the style too.
- Put profiles in any order: drag them in the profile list, or use the up and down arrows beside each one. Phones swipe through them in that order.
- Click anywhere on a profile or folder in the list to open it.
- Steps read better: they show the app's name and the choice made (Microsoft Teams, not teams), and a long list of choices is a menu.
- The Integrations page describes every group and lists what each can do, uses the whole window, and scrolls.
- The editor reloads by itself when TabbyDeck restarts, so it always matches the running version.
- Phone can't connect? Under the QR code, TabbyDeck says whether any phone has reached the PC, checks the Wi-Fi, the firewall and VPNs on the PC, and lists what to try on the phone (mobile data, VPN or Secure Wi-Fi, Private DNS, guest networks).

### Fixes
- Switch app goes to the app used before, on any screen, instead of sending Alt+Tab (which did not always reach Windows).
- Mute microphone could fail with an error after the volume panel had been opened.

### For developers
- Releases are built and published from this PC with `npm run release`; there are no GitHub Actions.

## 0.1.0 (2026-10-22)

The first release.

- Use any Android phone or tablet on your Wi-Fi as a deck of buttons for your Windows PC, in Chrome or Edge.
- Pair a device by typing the 6-digit code it shows. Block or forget devices at any time.
- Build decks in the editor: drag, resize, folders, profiles, colours, icons and images.
- Add any installed app with its own icon from Apps on this PC.
- Hotkeys, typing, mouse, app launching, links, media keys, volume, mute, microphone, sleep, lock and shut down.
- Volume and brightness sliders, with brightness per monitor (laptop screens and DDC/CI monitors).
- Bluetooth panel: turn Bluetooth on or off and connect paired headphones or speakers.
- Night light, screen projection, screenshot, snip and emoji.
- Keys show live state: Play / Pause, mute, mic, night light, Bluetooth, and volume and brightness levels.
- Phones get thumb-sized keys that scroll; tablets show the whole deck.
- First-run guide and editor tour.
- Backup and restore.
- Runs in the tray, starts with Windows, and uses under 80 MB of RAM.
