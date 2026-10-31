<div align="center">

# TabbyDeck

**Turn your phone or tablet into a Stream Deck for Windows. Free and open source.**

[![Download](https://img.shields.io/github/v/release/iamshihab2020/TabbyDeck?label=Download&color=f5a524)](https://github.com/iamshihab2020/TabbyDeck/releases/latest)
[![Licence](https://img.shields.io/badge/licence-Apache%202.0-blue)](LICENSE)
![Windows 10 and 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4)
![Android](https://img.shields.io/badge/Android-5%2B-3ddc84)
![iPhone and iPad](https://img.shields.io/badge/iOS-13%2B-555555)

![Tap a key on the tablet and the PC reacts](docs/screens/demo.gif)

</div>

TabbyDeck puts a grid of buttons on any phone or tablet on your Wi-Fi: Android, iPhone or iPad. Each button does something on your PC: play or pause music, change the volume, dim a screen, open an app, press a shortcut, connect your headphones, lock or shut down. No account, no cloud: the deck runs in Chrome or Safari, or in the TabbyDeck app on Android, and talks straight to your PC.

## Download and start

1. Download **TabbyDeck-0.4.0-windows-x64.zip** from the [latest release](https://github.com/iamshihab2020/TabbyDeck/releases/latest).
2. Unzip it anywhere, for example `Documents\TabbyDeck`.
3. Double-click `tabbydeck.exe`. When Windows asks whether TabbyDeck may use the network, allow **Private networks**.
4. On your phone or tablet, scan the code TabbyDeck shows, or type the address into Chrome (Android) or Safari (iPhone and iPad).
5. The phone shows six digits. Type them into TabbyDeck on the PC and choose **Allow**.

Your deck appears on the phone. Windows may warn that the app is from an unknown publisher, because the exe is not signed yet: choose **More info**, then **Run anyway**.

### The Android app

On Android 5.0 or newer, the TabbyDeck app shows your deck full screen and keeps the screen on, with no browser around it.

1. On the phone, download [**TabbyDeck-android.apk**](https://github.com/iamshihab2020/TabbyDeck/releases/latest/download/TabbyDeck-android.apk).
2. Open it. Android asks before it installs an app from outside the Play Store: allow it for your browser or Files, then choose **Install**.
3. With TabbyDeck running on the PC, open the app. It finds your PC on the Wi-Fi by itself, or type the address the PC shows.
4. Pair it with the six digits, as above.

Back shows the list of PCs, and so does **Change PC** in the deck's settings. The deck comes from your PC, so the app always matches the version on the PC.

### Add TabbyDeck to your home screen

So it opens like an app, full screen, from its own icon:

**Android:**

1. Open your deck in **Chrome** on the phone or tablet.
2. Tap the **⋮** menu, then **Add to Home screen**, then **Add**.
3. Open TabbyDeck from the new icon. It stays paired, so there's no code to type again.

**iPhone and iPad:**

1. Open your deck in **Safari**.
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open TabbyDeck from the new icon and pair it once more. iOS keeps the icon's storage apart from Safari's, so it needs its own code the first time.

The icon remembers your PC's address. If your router gives the PC a new address, open the new address once and add the icon again. You'll find the same steps in the deck's settings (the gear icon at the top).

## What it can do

- **Ready-made decks:** start with a Developer, Office, Streamer or Music deck, from the first-run guide or **New profile** in the editor. Each one opens the apps found on your PC, with their icons, and is sized to fill its rows. Keys for apps you don't have stay hidden until you install them.
- **Swipe between decks:** swipe the keys left or right on the phone to go to the next profile. Put your profiles in any order by dragging them in the editor.
- **Customize:** pick how the keys look: Keycap, Sunken, Soft, Glass, Pad or Outline, for all your profiles or a different one for each. Name the cat that lives under the keys, or turn it off.
- **Claude Code:** the Developer deck starts Claude in your repo from VS Code and has keys for compact, usage, model, effort, mode, plan, pasting a screenshot, stop and yes.
- **Trackpad and keyboard:** a key turns the phone into a touchpad for the PC: point, tap to click, two fingers to scroll or right-click, and a box that types on the PC. Handy from the couch.
- **Sound and screen:** play, pause, next and previous; a volume slider with mute; mic mute; a brightness slider for each screen, including external monitors; night light.
- **Now playing:** a key shows the song or video that is playing, with its cover. Tap to play or pause, hold to skip.
- **Volume mixer:** the Volume panel also has a slider and mute for each app (Spotify, Discord, a game), and lets you choose which speakers or headphones to play through. An Output key switches between them in one tap.
- **Decks that follow your apps:** give a profile its apps (in the editor, **Follow apps**), and your phone switches to it while one of them is in front, then back when you leave.
- **Meetings:** mute, camera, raise hand and leave, in whichever call you are in: Microsoft Teams, Zoom, Google Meet, a Slack huddle or Discord. TabbyDeck finds the call by the app using your microphone. The Camera key lights while an app uses your camera.
- **Do not disturb:** one key turns Windows notifications off and on, and lights while they are off.
- **Bluetooth:** turn it on or off and connect your paired headphones or speakers from the phone.
- **Your apps:** add any installed app with its real icon, from the list of apps on your PC.
- **Several apps at once:** one button can open a whole set, for example VS Code, GitHub Desktop, Slack and Chrome for work. In **Apps on this PC**, choose **Pick several**, tick the apps, then **Add button**.
- **Shortcuts:** any key combination, typing text, mouse clicks and scrolling.
- **Windows:** Task View, desktop, search, emoji, screenshots and snips, extend or duplicate screens; snap the window in front to half the screen, maximize or minimize it with one key, or send it to your other screen.
- **Workspace buttons:** one button can open your apps, websites and folders, wait for them, then put each window in its place. Add **Open app or file**, **Wait** and **Move window** steps in the button's actions.
- **Power:** sleep, lock and shut down, with a confirmation first.
- **Screen off:** turn the screens dark while the PC keeps running, for long jobs. Any key or mouse move, or any other deck key, turns them back on.
- **Browser profiles:** a key opens Chrome, Edge or Brave in the profile you choose, on a website if you like.
- **Stats and badges:** see your presses per day, top keys and top apps on the Stats page and in Your week on the phone, counted on your PC only. Earn badges like Early bird and Night owl.
- **Live keys:** Mute, Mic, Night light, Bluetooth, Do not disturb and Play / Pause show what is happening on the PC, and level keys show the percentage. Info keys show CPU, memory, battery, the time, the weather in your city or how hot the PC is.
- **Timer and Pomodoro:** press to start or pause, hold to reset. Your phone rings and shows a message when the time is up or it is time for a break. Each finished focus grows a plant in the cat's garden.
- **Edit on the phone:** in the deck's settings, **Edit keys** lets you change a key's label, icon and colour, give it a photo or GIF from the gallery or camera, move it, or set a background behind the keys. Each phone can also pick its own key sound.

| The editor on your PC | On a phone | Bluetooth |
|---|---|---|
| ![Editor](docs/screens/editor.png) | ![Phone](docs/screens/phone.png) | ![Bluetooth panel](docs/screens/bluetooth.png) |

Build your deck in the editor on the PC: drag buttons around, resize them, pick icons and colours, make folders and profiles. The phone updates the moment you change something. Phones get thumb-sized keys that scroll; tablets show the whole deck.

## Private by design

- Only devices you approve with a code can use your deck. You can block or forget a device at any time.
- The editor only listens on your own PC.
- TabbyDeck sends no data about you anywhere. It goes online only for a Weather key, to ask the free Open-Meteo service for the temperature in the city you typed.

## Build from source

You need Windows 10 or 11 and [Node.js 24](https://nodejs.org).

```
npm install
npm run dev        # the host with a fake native layer, plus the editor
npm test           # all tests
npm run typecheck
npm run package    # builds out/TabbyDeck/tabbydeck.exe
npm run release    # maintainer only: test, build and publish a GitHub release
```

```
apps/
  host/     the Windows app: server, store, action engine, Windows calls, tray, build
  editor/   the editor window on the PC
  deck/     the deck on the phone or tablet (under 100 KB, runs on Chrome 60 and Safari on iOS 13)
  android/  the Android app: finds the PC and shows its deck full screen (Kotlin; build with gradlew assembleRelease)
libs/
  shared/   data model, protocol and the list of actions
  ui/       tiles, grid, icons and design tokens
```

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/iamshihab2020/TabbyDeck/issues). Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request.

## Licence

TabbyDeck is made by [Sheikh Shihab Hossain](https://github.com/iamshihab2020) and released under the [Apache License 2.0](LICENSE).

You may use, change and share it, including in your own products. If you publish TabbyDeck or a version based on it, you must keep the [NOTICE](NOTICE) file crediting the original author and say what you changed. The TabbyDeck name and logo are not part of the licence, so a modified version must use its own name.
