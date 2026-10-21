import type { BtDevice } from '@tabbydeck/shared';

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
  focusWindow(titleSubstring: string): Promise<boolean>;
  activeWindowTitle(): string;
  lock(): Promise<void>;
  sleep(): Promise<void>;
  shutdown(restart: boolean): Promise<void>;
  clipboardSet(text: string): Promise<void>;
  screenshotToClipboard(): Promise<void>;
  /** Energy saver here means Windows' "Best power efficiency" power mode (Settings > Power > Power mode). */
  getEnergySaver(): Promise<boolean>;
  setEnergySaver(on: boolean): Promise<void>;
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
}

export interface NativeDisplay {
  /** The screens whose brightness Windows can change, left to right, with their brightness 0-100. */
  screens(): Promise<ScreenInfo[]>;
  /** Throws when the screen is gone or will not take the change. */
  setScreenBrightness(id: string, pct: number): Promise<void>;
  getNightLight(): Promise<boolean>;
  setNightLight(on: boolean): Promise<void>;
  /** Same choices as Win+P. */
  project(mode: ProjectMode): Promise<void>;
}

export interface ScreenInfo { id: string; name: string; brightness: number }

export type ProjectMode = 'extend' | 'duplicate' | 'pc-only' | 'second-only';

export interface NativeSysInfo {
  cpuPercent(): number;
  ramPercent(): number;
  batteryPercent(): number | null;
}

export interface Native {
  input: NativeInput;
  system: NativeSystem;
  audio: NativeAudio;
  display: NativeDisplay;
  sysinfo: NativeSysInfo;
  dispose(): Promise<void>;
}
