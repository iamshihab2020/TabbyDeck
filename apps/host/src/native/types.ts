import type { AppSound, AudioOutput, BrowserProfile, BtDevice } from '@tabbydeck/shared';

export type { AppSound, AudioOutput };

export type MouseButton = 'left' | 'right' | 'middle';

export interface NativeInput {
  keyDown(vk: number): void;
  keyUp(vk: number): void;
  typeText(text: string): void;
  mouseMove(x: number, y: number, absolute: boolean): void;
  mouseButton(button: MouseButton, down: boolean): void;
  scroll(dy: number, dx: number): void;
  screenSize(): { w: number; h: number };
}

export interface NativeSystem {
  launch(path: string, args: string[]): Promise<void>;
  openUrl(url: string): Promise<void>;
  run(cmd: string, timeoutMs: number): Promise<{ code: number; out: string }>;
  kill(processName: string): Promise<number>;
  /** Bring the first window that matches to the front: a program file (code.exe) or text in its title. */
  focusWindow(match: string): Promise<boolean>;
  /** Bring forward the app used just before the one in front, on any screen, as a quick Alt+Tab does. False when there is none. */
  switchApp(): Promise<boolean>;
  activeWindowTitle(): string;
  /** The app windows open now (what Alt+Tab lists), and the one in front. */
  windows(): WindowInfo[];
  foregroundWindow(): WindowInfo | null;
  /** Move, size, maximize or minimize the first window that matches, as focusWindow does, or the window in front for ''. False when none matches yet. */
  placeWindow(match: string, place: WindowPlace): boolean;
  /** What is playing in the media session Windows shows in its volume flyout, or null when nothing is. */
  nowPlaying(): Promise<NowPlaying | null>;
  /** The cover art of what is playing, as an image file, or null when it has none. */
  nowPlayingArt(): Promise<{ data: Buffer; type: string } | null>;
  /** Whether an app is using a camera now (the camera light, as Windows' privacy settings record it). */
  cameraInUse(): Promise<boolean>;
  /** The apps using a microphone now, lowercased: a program's file name (zoom.exe) or a Store app's package name. */
  micUsers(): Promise<string[]>;
  lock(): Promise<void>;
  sleep(): Promise<void>;
  shutdown(restart: boolean): Promise<void>;
  clipboardSet(text: string): Promise<void>;
  screenshotToClipboard(): Promise<void>;
  /** Energy saver here means Windows' "Best power efficiency" power mode (Settings > Power > Power mode). */
  getEnergySaver(): Promise<boolean>;
  setEnergySaver(on: boolean): Promise<void>;
  /** Windows' Do not disturb (the bell in the notification centre). */
  getDnd(): Promise<boolean>;
  setDnd(on: boolean): Promise<void>;
  /** The apps in the Start menu (desktop, Store and web apps), by name. Each opens with shell:AppsFolder\<id>. */
  /** The Bluetooth radio, as the Bluetooth switch in Quick Settings. Throws when the PC has no Bluetooth. */
  getBluetooth(): Promise<boolean>;
  setBluetooth(on: boolean): Promise<void>;
  /** Paired devices, classic and Bluetooth LE. */
  bluetoothDevices(): Promise<BtDevice[]>;
  /** Connects or disconnects paired headphones or speakers. Throws for other devices: Windows connects those itself. */
  connectBluetooth(id: string, on: boolean): Promise<void>;
  /** Whether an app is playing media now (what the Play / Pause key would pause). */
  mediaPlaying(): Promise<boolean>;
  listApps(): Promise<{ id: string; name: string }[]>;
  /** The profiles of Chrome, Edge and Brave on this PC, with the program that opens each. */
  browserProfiles(): Promise<(BrowserProfile & { exe: string; dir: string })[]>;
  /**
   * What on this PC could stop a phone reaching TabbyDeck: the Wi-Fi it is on (its name and whether Windows calls it
   * Public or Private), whether the firewall lets this program take connections there, and VPN adapters that are on.
   * Read only: it changes nothing.
   */
  networkCheck(program: string): Promise<NetworkCheck>;
  /** Whether an app is registered for links that start with scheme: (spotify, discord, steam). */
  hasUrlHandler(scheme: string): Promise<boolean>;
  /** An app's icon as PNG, about px square with transparency, or null when Windows has none. */
  appIcon(id: string, px: number): Promise<Buffer | null>;
}

export interface NativeAudio {
  getVolume(): Promise<number>;
  setVolume(pct: number): Promise<void>;
  getMute(): Promise<boolean>;
  setMute(on: boolean): Promise<void>;
  getMicMute(): Promise<boolean>;
  setMicMute(on: boolean): Promise<void>;
  /** The sound outputs plugged in or connected, and which one Windows plays through. */
  outputs(): Promise<AudioOutput[]>;
  /** Play everything through this output from now on. Throws when it is gone. */
  setOutput(id: string): Promise<void>;
  /** The apps with sound open on the current output, with their own volume, as in Windows' volume mixer. */
  apps(): Promise<AppSound[]>;
  /** Change one app's volume or mute. Throws when the app has closed its sound. */
  setApp(id: string, change: { percent?: number; mute?: boolean }): Promise<void>;
}

export interface NetworkCheck { network: string; category: string; firewall: 'allowed' | 'blocked' | 'missing' | 'unknown'; vpn: string[] }
export interface WindowInfo { title: string; exe: string }
export type WindowPlace = 'left' | 'right' | 'top' | 'bottom' | 'maximize' | 'minimize' | 'restore' | 'next-screen';
export interface NowPlaying { title: string; artist: string; playing: boolean }

export interface NativeDisplay {
  /** The screens whose brightness Windows can change, left to right, with their brightness 0-100. */
  screens(): Promise<ScreenInfo[]>;
  /** Throws when the screen is gone or will not take the change. */
  setScreenBrightness(id: string, pct: number): Promise<void>;
  getNightLight(): Promise<boolean>;
  setNightLight(on: boolean): Promise<void>;
  /** Same choices as Win+P. */
  project(mode: ProjectMode): Promise<void>;
  /** 'all': every screen goes dark and the PC stays awake until someone uses its mouse or keyboard. One monitor: off, or back on if it is off (over the cable, when the monitor allows it). */
  screensOff(id: string): Promise<void>;
  /** True when the screens were turned off by screensOff('all') and nobody has come back yet; ends the keep-awake. */
  screensBack(): boolean;
  /** Whether screensOff('all') is still in effect. */
  screensDark(): boolean;
}

export interface ScreenInfo { id: string; name: string; brightness: number }

export type ProjectMode = 'extend' | 'duplicate' | 'pc-only' | 'second-only';

export interface NativeSysInfo {
  cpuPercent(): number;
  ramPercent(): number;
  /** The battery's charge, and whether the PC is plugged in; null on a PC without a battery. */
  battery(): { percent: number; charging: boolean } | null;
}

export interface Native {
  input: NativeInput;
  system: NativeSystem;
  audio: NativeAudio;
  display: NativeDisplay;
  sysinfo: NativeSysInfo;
  dispose(): Promise<void>;
}
