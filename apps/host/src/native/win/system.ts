import { execFile, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BtDevice } from '@tabbydeck/shared';
import type { NativeSystem } from '../types.ts';
import type { PowerShellHost } from './ps.ts';
import { psQuote } from './ps.ts';
import { win32 } from './win32.ts';

const SW_RESTORE = 9;
const VK_MENU = 0x12, KEYEVENTF_KEYUP = 0x2;

const exec = (file: string, args: string[], timeout = 15000) => new Promise<{ code: number; out: string }>(res => {
  execFile(file, args, { windowsHide: true, timeout }, (err, stdout, stderr) => res({ code: err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? (err as unknown as { code: number }).code : 1) : 0, out: `${stdout}${stderr}` }));
});

/** Start a program without a shell, resolving once it has spawned (or rejecting if it cannot be found). */
const startDetached = (file: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const c = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false });
  c.once('spawn', () => { c.unref(); resolve(); });
  c.once('error', e => reject(new Error(`Could not start ${file}: ${(e as NodeJS.ErrnoException).code ?? e.message}`)));
});

// Windows has no public switch for its Energy saver while plugged in, so this drives the power mode instead,
// through the overlay-scheme calls behind Settings > Power > Power mode.
const BEST_EFFICIENCY = '961cc777-2547-4f9d-8174-7d86181b8a7a';
const POWER_PRELUDE = { key: 'power-overlay', script: `Add-Type -Namespace Tabby -Name Power -MemberDefinition '[DllImport("powrprof.dll")] public static extern uint PowerGetEffectiveOverlayScheme(out Guid g); [DllImport("powrprof.dll")] public static extern uint PowerSetActiveOverlayScheme(Guid g);'` };
const GET_MODE = '$g = [Guid]::Empty; [void][Tabby.Power]::PowerGetEffectiveOverlayScheme([ref]$g); $g.ToString()';

// Bluetooth through WinRT: the radio (the Quick Settings switch) and the paired devices. PowerShell 5.1 cannot await WinRT
// calls, so Await-Tabby wraps them in .NET tasks. Headphones and speakers connect through BtAudio (below).
const BTAUDIO_CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Tabby {
  // Connects and disconnects paired Bluetooth headphones and speakers, as the Connect button in Windows' sound menu does:
  // each Bluetooth audio endpoint leads to its driver (a KS filter), which takes the one-shot reconnect and disconnect calls.
  public static class BtAudio {
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
      [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection c);
      [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d);
      [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice d);
    }
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection {
      [PreserveSig] int GetCount(out uint n);
      [PreserveSig] int Item(uint i, out IMMDevice d);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
      [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    }
    [ComImport, Guid("2A07407E-6497-4A18-9787-32F79BD0D98F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDeviceTopology {
      [PreserveSig] int GetConnectorCount(out uint n);
      [PreserveSig] int GetConnector(uint i, out IConnector c);
    }
    [ComImport, Guid("9c2c4058-23f5-41de-877a-df3af236a09e"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IConnector {
      [PreserveSig] int GetType(out int t);
      [PreserveSig] int GetDataFlow(out int f);
      [PreserveSig] int ConnectTo(IntPtr c);
      [PreserveSig] int Disconnect();
      [PreserveSig] int IsConnected(out int b);
      [PreserveSig] int GetConnectedTo(out IntPtr c);
      [PreserveSig] int GetConnectorIdConnectedTo([MarshalAs(UnmanagedType.LPWStr)] out string id);
      [PreserveSig] int GetDeviceIdConnectedTo([MarshalAs(UnmanagedType.LPWStr)] out string id);
    }
    [StructLayout(LayoutKind.Sequential)]
    struct KsProp { public Guid Set; public uint Id; public uint Flags; }
    [ComImport, Guid("28F54685-06FD-11D2-B27A-00A0C9223196"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IKsControl {
      [PreserveSig] int KsProperty(ref KsProp p, uint pLen, IntPtr data, uint dataLen, out uint returned);
    }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}

    static readonly Guid BtAudioProps = new Guid("7FA06C40-B8F6-4C7E-8556-E8C33A12E54D");
    const uint ONESHOT_RECONNECT = 0, ONESHOT_DISCONNECT = 1, KSPROPERTY_TYPE_GET = 1;
    const int ALL_FLOWS = 2, ALL_STATES = 0xF, CLSCTX_ALL = 23;

    // The audio drivers (KS filters) of every Bluetooth endpoint, present or not, whose id holds this address.
    static List<string> Filters(IMMDeviceEnumerator e, string address) {
      var found = new List<string>();
      IMMDeviceCollection c;
      if (e.EnumAudioEndpoints(ALL_FLOWS, ALL_STATES, out c) != 0) return found;
      uint n; c.GetCount(out n);
      var topo = typeof(IDeviceTopology).GUID;
      for (uint i = 0; i < n; i++) {
        IMMDevice d; object o; IConnector con; string f;
        if (c.Item(i, out d) != 0 || d.Activate(ref topo, CLSCTX_ALL, IntPtr.Zero, out o) != 0) continue;
        if (((IDeviceTopology)o).GetConnector(0, out con) != 0 || con.GetDeviceIdConnectedTo(out f) != 0 || f == null) continue;
        if (f.IndexOf("BTHENUM", StringComparison.OrdinalIgnoreCase) >= 0 && f.IndexOf(address, StringComparison.OrdinalIgnoreCase) >= 0 && !found.Contains(f)) found.Add(f);
      }
      return found;
    }

    /// <summary>Returns the number of audio drivers that took the call: 0 means this is not a Bluetooth audio device here.</summary>
    public static int Run(string address, bool connect) {
      var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      var ks = typeof(IKsControl).GUID;
      int done = 0;
      foreach (var f in Filters(e, address)) {
        IMMDevice d; object o;
        if (e.GetDevice(f, out d) != 0 || d.Activate(ref ks, CLSCTX_ALL, IntPtr.Zero, out o) != 0) continue;
        var p = new KsProp { Set = BtAudioProps, Id = connect ? ONESHOT_RECONNECT : ONESHOT_DISCONNECT, Flags = KSPROPERTY_TYPE_GET };
        uint got;
        if (((IKsControl)o).KsProperty(ref p, (uint)Marshal.SizeOf(typeof(KsProp)), IntPtr.Zero, 0, out got) >= 0) done++;
      }
      return done;
    }

    /// <summary>For checking: the audio drivers found for an address.</summary>
    public static string[] Find(string address) { return Filters((IMMDeviceEnumerator)new MMDeviceEnumerator(), address).ToArray(); }
  }
}
`;
const WINRT_PS = `Add-Type -AssemblyName System.Runtime.WindowsRuntime
$global:TabbyAsTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function global:Await-Tabby($op, $type) { $t = $global:TabbyAsTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }`;
const BT_PRELUDE = { key: 'bluetooth', script: `${WINRT_PS}
Add-Type -TypeDefinition @'
${BTAUDIO_CS}
'@
[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
function global:Get-TabbyBluetooth {
  [void](Await-Tabby ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]))
  Await-Tabby ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]) | Where-Object { $_.Kind -eq 'Bluetooth' } | Select-Object -First 1
}
# One query per kind (classic, LE) with the properties asked for up front; opening each device is ten times slower.
$global:TabbyBtProps = [System.Collections.Generic.List[string]]::new()
'System.Devices.Aep.IsConnected', 'System.Devices.Aep.DeviceAddress', 'System.Devices.Aep.Bluetooth.Cod.Major' | ForEach-Object { $global:TabbyBtProps.Add($_) }
function global:Get-TabbyBtDevices {
  $out = @()
  foreach ($sel in [Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromPairingState($true), [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelectorFromPairingState($true)) {
    $all = Await-Tabby ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($sel, $global:TabbyBtProps)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
    foreach ($d in $all) {
      $p = @{}; foreach ($e in $d.Properties) { $p[$e.Key] = $e.Value } # PowerShell cannot index a WinRT map directly
      $addr = [string]$p['System.Devices.Aep.DeviceAddress']
      if ($addr) { $out += [pscustomobject]@{ id = $addr.Replace(':', '').ToLower(); name = $d.Name; audio = ($p['System.Devices.Aep.Bluetooth.Cod.Major'] -eq 4); connected = ($p['System.Devices.Aep.IsConnected'] -eq $true) } }
    }
  }
  ConvertTo-Json -Compress -InputObject @($out)
}` };
const BT_GET = "$r = Get-TabbyBluetooth; if ($r) { [string]$r.State } else { 'none' }";
const BT_SET = (on: boolean) => `$r = Get-TabbyBluetooth; if ($r) { [string](Await-Tabby ($r.SetStateAsync('${on ? 'On' : 'Off'}')) ([Windows.Devices.Radios.RadioAccessStatus])) } else { 'none' }`;
const BT_ADDRESS = /^[0-9a-f]{12}$/;

// What is playing, from the media sessions Windows shows in its volume flyout.
const MEDIA_PRELUDE = { key: 'media', script: `${WINRT_PS}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$global:TabbyMedia = Await-Tabby ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])` };
const MEDIA_GET = "$s = $global:TabbyMedia.GetCurrentSession(); if ($s) { [string]$s.GetPlaybackInfo().PlaybackStatus } else { 'none' }";

// App icons through the shell, the same pictures as the Start menu. Copies the 32-bit DIB by hand: Image.FromHbitmap drops alpha.
const APPICON_CS = String.raw`
using System; using System.Runtime.InteropServices; using System.Drawing; using System.Drawing.Imaging; using System.IO;
public static class AppIcon {
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr hbmp); }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)] static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory f);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int type, width, height, widthBytes; public ushort planes, bpp; public IntPtr bits; }
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int n, ref BITMAP b);
  // PNG (base64) of the app's icon at size px, alpha kept; null when the shell has none.
  public static string Png(string appId, int size, int flags) {
    var iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"); IShellItemImageFactory f;
    try { SHCreateItemFromParsingName("shell:AppsFolder\\" + appId, IntPtr.Zero, ref iid, out f); } catch { return null; }
    IntPtr h; if (f.GetImage(new SIZE { cx = size, cy = size }, flags, out h) != 0) return null;
    try {
      var b = new BITMAP(); GetObject(h, Marshal.SizeOf(b), ref b);
      if (b.bpp != 32 || b.bits == IntPtr.Zero) { using (var img = Image.FromHbitmap(h)) return Save(img); }
      using (var bmp = new Bitmap(b.width, b.height, PixelFormat.Format32bppArgb)) {
        var d = bmp.LockBits(new Rectangle(0, 0, b.width, b.height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        var row = new byte[b.widthBytes];
        for (int y = 0; y < b.height; y++) { // DIB sections are bottom-up
          Marshal.Copy(new IntPtr(b.bits.ToInt64() + (long)(b.height - 1 - y) * b.widthBytes), row, 0, b.widthBytes);
          Marshal.Copy(row, 0, new IntPtr(d.Scan0.ToInt64() + (long)y * d.Stride), Math.Min(b.widthBytes, d.Stride));
        }
        bmp.UnlockBits(d);
        // A program with only a small icon comes back inside a faint grey frame; read the program file's own icon
        // when there is one, else crop inside the frame.
        bool framed = bmp.Width > 8 && bmp.GetPixel(1, 1).A > 20 && bmp.GetPixel(1, 1).A < 140 && bmp.GetPixel(4, 4).A == 0;
        if (framed && File.Exists(appId)) { var e = ExeIcon(appId, size); if (e != null) return e; }
        return Save(Trim(bmp, framed ? 3 : 0));
      }
    } finally { DeleteObject(h); }
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] icons, uint[] ids, uint n, uint flags);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr h);
  static string ExeIcon(string file, int size) {
    var h = new IntPtr[1]; var ids = new uint[1];
    if (PrivateExtractIcons(file, 0, size, size, h, ids, 1, 0) == 0 || h[0] == IntPtr.Zero) return null;
    try { using (var i = Icon.FromHandle(h[0])) using (var b = i.ToBitmap()) return Save(Trim(b, 0)); } finally { DestroyIcon(h[0]); }
  }
  // Crop the transparent margin (apps with only a small icon come centred in a big empty square), keeping it square.
  static Bitmap Trim(Bitmap b, int skip) {
    int l = b.Width, t = b.Height, r = -1, btm = -1;
    for (int y = skip; y < b.Height - skip; y++) for (int x = skip; x < b.Width - skip; x++) if (b.GetPixel(x, y).A > 8) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > btm) btm = y; }
    if (r < 0) return b;
    int side = Math.Max(r - l + 1, btm - t + 1), cx = (l + r + 1) / 2, cy = (t + btm + 1) / 2;
    if (side >= b.Width - 2) return b;
    var o = new Bitmap(side, side, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(o)) g.DrawImage(b, new Rectangle(0, 0, side, side), new Rectangle(cx - side / 2, cy - side / 2, side, side), GraphicsUnit.Pixel);
    return o;
  }
  static string Save(Image i) { using (var m = new MemoryStream()) { i.Save(m, ImageFormat.Png); return Convert.ToBase64String(m.ToArray()); } }
}`;
// Store apps ship their own logos (up to 256 px and more); the newest unplated (transparent) one is used.
const PKG_LOGO_PS = String.raw`
function Get-TabbyPkgLogo([string]$id) {
  $fam, $app = $id.Split('!')
  $p = Get-AppxPackage -Name ($fam.Split('_')[0]) | ? { $_.PackageFamilyName -eq $fam } | Select-Object -First 1
  if (-not $p) { return $null }
  $m = [xml](Get-Content -Raw (Join-Path $p.InstallLocation 'AppxManifest.xml'))
  $ve = ($m.Package.Applications.Application | ? { $_.Id -eq $app } | Select-Object -First 1).VisualElements
  if (-not $ve) { return $null }
  $logo = $ve.Square44x44Logo
  $dir = Join-Path $p.InstallLocation (Split-Path $logo); $base = [IO.Path]::GetFileNameWithoutExtension($logo)
  $files = @(Get-ChildItem -LiteralPath $dir -Filter "$base*.png" -ErrorAction SilentlyContinue)
  $best = $files | ? { $_.Name -match 'targetsize-(\d+)_altform-unplated\.png$' } | Sort-Object { [int]($_.Name -replace '.*targetsize-(\d+).*', '$1') } -Descending | Select-Object -First 1
  if (-not $best) { $best = $files | Sort-Object Length -Descending | Select-Object -First 1 }
  if ($best) { $best.FullName }
}`;
const APPICON_PRELUDE = { key: 'app-icon', script: `Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
${APPICON_CS}
'@
${PKG_LOGO_PS}` };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createWinSystem(ps: PowerShellHost, dataDir?: string): NativeSystem {
  // The mode to return to when the power saver goes off, kept on disk so a TabbyDeck restart cannot lose it.
  const beforeFile = dataDir ? path.join(dataDir, 'power-mode.txt') : null;
  const readBefore = () => { try { const g = beforeFile ? readFileSync(beforeFile, 'utf8').trim() : ''; return GUID.test(g) ? g : null; } catch { return null; } };
  const saveBefore = (g: string) => { try { if (beforeFile) writeFileSync(beforeFile, g); } catch { /* the in-memory copy still works */ } };
  let before: string | null = readBefore();
  const setMode = async (guid: string) => {
    const r = (await ps.call(`[Tabby.Power]::PowerSetActiveOverlayScheme([Guid]'${guid}')`, 5000, POWER_PRELUDE)).trim();
    if (r !== '0') throw new Error(`Windows refused to change the power mode (${r})`);
  };
  return {
    // Programs start directly; documents, shortcuts and folders open through Explorer (no cmd.exe parsing).
    // shell: paths (shell:AppsFolder\<app id>) and documents open through Explorer; programs start directly.
    launch: (path, args) => /^shell:/i.test(path) ? startDetached('explorer.exe', [path]) : /\.(exe|com)$/i.test(path) || !/\.[a-z0-9]{1,5}$/i.test(path) ? startDetached(path, args) : startDetached('explorer.exe', [path]),
    openUrl: url => startDetached('explorer.exe', [url]),
    run: (cmd, timeoutMs) => new Promise(res => {
      execFile('cmd.exe', ['/d', '/s', '/c', cmd], { windowsHide: true, timeout: timeoutMs, windowsVerbatimArguments: true }, (err, stdout, stderr) =>
        res({ code: err ? ((err as unknown as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}`.slice(0, 4000) }));
    }),
    kill: async name => {
      const r = await exec('taskkill.exe', ['/IM', name, '/F']);
      return (r.out.match(/SUCCESS/g) ?? []).length;
    },
    focusWindow: async title => {
      const w = win32(); const needle = title.toLowerCase();
      let found: unknown = null;
      const cb = w.koffi.register((hwnd: unknown) => {
        if (!w.IsWindowVisible(hwnd)) return true;
        const len = w.GetWindowTextLengthW(hwnd);
        if (len <= 0) return true;
        const buf = new Uint16Array(len + 1);
        w.GetWindowTextW(hwnd, buf, len + 1);
        if (String.fromCharCode(...buf.subarray(0, len)).toLowerCase().includes(needle)) { found = hwnd; return false; }
        return true;
      }, w.koffi.pointer(w.EnumProc));
      try { w.EnumWindows(cb, 0); } finally { w.koffi.unregister(cb); }
      if (!found) return false;
      if (w.IsIconic(found)) w.ShowWindow(found, SW_RESTORE);
      // A background process may only take focus right after input; a lone Alt tap satisfies that rule.
      w.keybd_event(VK_MENU, 0, 0, 0); w.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
      return w.SetForegroundWindow(found);
    },
    activeWindowTitle: () => {
      const w = win32(); const h = w.GetForegroundWindow(); if (!h) return '';
      const len = w.GetWindowTextLengthW(h); if (len <= 0) return '';
      const buf = new Uint16Array(len + 1); w.GetWindowTextW(h, buf, len + 1);
      return String.fromCharCode(...buf.subarray(0, len));
    },
    lock: async () => { await exec('rundll32.exe', ['user32.dll,LockWorkStation']); },
    sleep: async () => { await exec('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']); },
    shutdown: async restart => { await exec('shutdown.exe', [restart ? '/r' : '/s', '/t', '0']); },
    getBluetooth: async () => {
      const s = (await ps.call(BT_GET, 10000, BT_PRELUDE)).trim();
      if (s === 'none') throw new Error('This PC has no Bluetooth');
      return s === 'On';
    },
    setBluetooth: async on => {
      const r = (await ps.call(BT_SET(on), 10000, BT_PRELUDE)).trim();
      if (r === 'none') throw new Error('This PC has no Bluetooth');
      if (r !== 'Allowed') throw new Error(`Windows did not let TabbyDeck change Bluetooth (${r})`);
    },
    bluetoothDevices: async () => {
      const raw = JSON.parse((await ps.call('Get-TabbyBtDevices', 15000, BT_PRELUDE)).trim() || '[]') as BtDevice[];
      // A Bluetooth LE device can be listed once per address it uses; show it once, connected if any is.
      const byName = new Map<string, BtDevice>();
      for (const d of raw) {
        if (!d.name) continue;
        const had = byName.get(d.name);
        if (!had) byName.set(d.name, d); else had.connected ||= d.connected;
      }
      return [...byName.values()];
    },
    connectBluetooth: async (id, on) => {
      if (!BT_ADDRESS.test(id)) throw new Error('That is not a Bluetooth device');
      const n = Number((await ps.call(`[Tabby.BtAudio]::Run('${id}', $${on})`, 15000, BT_PRELUDE)).trim());
      if (!n) throw new Error('Windows connects this device by itself when it is switched on');
    },
    mediaPlaying: async () => (await ps.call(MEDIA_GET, 5000, MEDIA_PRELUDE)).trim() === 'Playing',
    getEnergySaver: async () => (await ps.call(GET_MODE, 5000, POWER_PRELUDE)).trim() === BEST_EFFICIENCY,
    setEnergySaver: async on => {
      const now = (await ps.call(GET_MODE, 5000, POWER_PRELUDE)).trim();
      if (on && now !== BEST_EFFICIENCY) { before = now; saveBefore(now); await setMode(BEST_EFFICIENCY); }
      if (!on && now === BEST_EFFICIENCY) await setMode(before ?? '00000000-0000-0000-0000-000000000000');
    },
    listApps: async () => {
      const out = (await ps.call('@(Get-StartApps | Select-Object Name, AppID) | ConvertTo-Json -Compress', 15000)).trim();
      const raw = (out ? JSON.parse(out) : []) as { Name: string; AppID: string }[];
      const seen = new Set<string>();
      return raw.filter(a => a.AppID && a.Name && !/uninstall/i.test(a.Name) && !seen.has(a.AppID) && seen.add(a.AppID))
        .map(a => ({ id: a.AppID, name: a.Name })).sort((a, b) => a.name.localeCompare(b.name));
    },
    appIcon: async (id, px) => {
      // Store app (family!app): its logo file, else the shell icon without ICONONLY (which gives some of them a blank
      // page). Desktop app: the shell icon (BIGGERSIZEOK | ICONONLY), margin trimmed.
      const q = psQuote(id), n = Math.round(px);
      const out = (await ps.call(id.includes('!')
        ? `$f = Get-TabbyPkgLogo ${q}; if ($f) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($f)) } else { [AppIcon]::Png(${q}, ${n}, 1) }`
        : `[AppIcon]::Png(${q}, ${n}, 5)`, 8000, APPICON_PRELUDE)).trim();
      return out ? Buffer.from(out, 'base64') : null;
    },
    clipboardSet: async text => { await ps.call(`Set-Clipboard -Value ${psQuote(text)}`); },
    screenshotToClipboard: async () => {
      await ps.call([
        'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
        '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen',
        '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
        '$g = [System.Drawing.Graphics]::FromImage($bmp)',
        '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)',
        '[System.Windows.Forms.Clipboard]::SetImage($bmp)',
        '$g.Dispose(); $bmp.Dispose()',
      ].join('\n'), 10000);
    },
  };
}
