import { execFile } from 'node:child_process';
import type { NativeDisplay, ProjectMode, ScreenInfo } from '../types.ts';
import type { PowerShellHost } from './ps.ts';

const NO_BRIGHTNESS = 'This screen does not let Windows change its brightness';

// Each screen is found by its monitor code (e.g. AUO2992, XMIC001). The laptop panel is the one Windows dims itself
// (WMI); other monitors are dimmed over the cable (DDC/CI, VCP code 0x10) when they allow it. Screens neither way
// can change are left out. Ordered left to right as arranged in Settings > Display.
const SCREENS_CS = String.raw`
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public static class Screens {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct PM { public IntPtr h; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string d; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct MI { public int size, l, t, r, b, wl, wt, wr, wb, flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dev; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct DD { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string name; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string str; public int flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string id; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string key; }
  delegate bool MEP(IntPtr m, IntPtr dc, IntPtr r, IntPtr d);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MEP f, IntPtr d);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MI i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string dev, uint i, ref DD d, uint f);
  [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr m, out uint n);
  [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr m, uint n, [Out] PM[] a);
  [DllImport("dxva2.dll")] static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr h, byte c, IntPtr t, out uint cur, out uint max);
  [DllImport("dxva2.dll")] static extern bool SetVCPFeature(IntPtr h, byte c, uint v);
  [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint n, PM[] a);
  // One line per screen: code, left edge, primary, DDC level (-1 if the monitor will not say). Set(code, pct) when given.
  public static string Run(string setId, int pct) {
    var sb = new StringBuilder(); var seen = new Dictionary<string, int>(); string result = "missing";
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (m, dc, r, x) => {
      var i = new MI(); i.size = Marshal.SizeOf(i); GetMonitorInfo(m, ref i);
      var d = new DD(); d.cb = Marshal.SizeOf(d); EnumDisplayDevices(i.dev, 0, ref d, 0);
      var parts = (d.id ?? "").Split('\\'); var code = parts.Length > 1 ? parts[1] : "SCREEN";
      int k; seen[code] = k = seen.ContainsKey(code) ? seen[code] + 1 : 1; if (k > 1) code += "#" + k;
      uint n; GetNumberOfPhysicalMonitorsFromHMONITOR(m, out n); var a = new PM[n]; int level = -1;
      if (n > 0 && GetPhysicalMonitorsFromHMONITOR(m, n, a)) {
        uint cur, max;
        if (!string.IsNullOrEmpty(setId) && setId == code) result = GetVCPFeatureAndVCPFeatureReply(a[0].h, 0x10, IntPtr.Zero, out cur, out max) && max > 0 && SetVCPFeature(a[0].h, 0x10, (uint)Math.Round(pct * max / 100.0)) ? "ok" : "none";
        else if (string.IsNullOrEmpty(setId) && GetVCPFeatureAndVCPFeatureReply(a[0].h, 0x10, IntPtr.Zero, out cur, out max) && max > 0) level = (int)Math.Round(cur * 100.0 / max);
        DestroyPhysicalMonitors(n, a);
      }
      sb.Append(code + "\t" + i.l + "\t" + ((i.flags & 1) == 1 ? 1 : 0) + "\t" + level + "\n");
      return true;
    }, IntPtr.Zero);
    return string.IsNullOrEmpty(setId) ? sb.ToString() : result;
  }
}`;
const SCREENS_PRELUDE = { key: 'screens', script: `Add-Type -TypeDefinition @'\n${SCREENS_CS}\n'@` };
const CODE_OF = '$_.InstanceName.Split([char]92)[1]';
const WMI_LEVELS = `$wmi = @{}; try { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | % { $wmi[${CODE_OF}] = [int]$_.CurrentBrightness } } catch {}`;
const LIST = [
  WMI_LEVELS,
  `$names = @{}; try { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorID -ErrorAction Stop | % { $names[${CODE_OF}] = -join [char[]]($_.UserFriendlyName | ? { $_ }) } } catch {}`,
  '$list = foreach ($l in ([Screens]::Run($null, 0) -split "`n" | ? { $_ })) { $c, $x, $p, $d = $l -split "`t"; $base = $c.Split("#")[0]',
  '  if ($wmi.ContainsKey($base)) { [pscustomobject]@{ id = $c; name = "Laptop screen"; brightness = $wmi[$base]; x = [int]$x } }',
  '  elseif ([int]$d -ge 0) { $nm = $names[$base]; if (-not $nm) { $nm = "Monitor" }; [pscustomobject]@{ id = $c; name = $nm; brightness = [int]$d; x = [int]$x } } }',
  '@($list | Sort-Object x | Select-Object id, name, brightness) | ConvertTo-Json -Compress',
].join('\n');
const SET = [
  WMI_LEVELS,
  `if ($wmi.ContainsKey($id.Split('#')[0])) { try { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]0; Brightness = [byte]$pct } | Out-Null; "ok" } catch { "none" } }`,
  'else { [Screens]::Run($id, $pct) }',
].join('\n');

// Night light has no public API. Its state lives in a CloudStore blob: byte 18 is 0x15 when on and 0x13 when off,
// and "on" carries an extra 10 00 field after the inner header. Windows only applies a change with a newer timestamp
// (bytes 10-14, a 5-byte varint of Unix seconds). Checked on Windows 11 build 26300.
const NIGHT_KEY = "'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate'";
const NIGHT_READ = `$d = [byte[]](Get-ItemProperty ${NIGHT_KEY} -ErrorAction Stop).Data`;

// DisplaySwitch.exe is what Win+P runs; it returns at once and Windows rearranges the screens a moment later.
const SWITCH: Record<ProjectMode, string> = { extend: '/extend', duplicate: '/clone', 'pc-only': '/internal', 'second-only': '/external' };

export function createWinDisplay(ps: PowerShellHost): NativeDisplay {
  return {
    async screens() {
      const out = (await ps.call(LIST, 8000, SCREENS_PRELUDE)).trim();
      if (!out) return [];
      const r = JSON.parse(out) as ScreenInfo | ScreenInfo[];
      return Array.isArray(r) ? r : [r];
    },
    async setScreenBrightness(id, pct) {
      if (!/^[A-Za-z0-9#]+$/.test(id)) throw new Error('Unknown screen');
      const n = Math.round(Math.max(0, Math.min(100, pct)));
      const out = (await ps.call(`$id = '${id}'; $pct = ${n}
${SET}`, 8000, SCREENS_PRELUDE)).trim();
      if (out === 'missing') throw new Error('That screen is not connected');
      if (out !== 'ok') throw new Error(NO_BRIGHTNESS);
    },
    project: mode => new Promise((resolve, reject) => {
      execFile('DisplaySwitch.exe', [SWITCH[mode]], { windowsHide: true, timeout: 10000 }, err => err ? reject(new Error(`Could not switch screens: ${err.message}`)) : resolve());
    }),
    async getNightLight() {
      return (await ps.call(`${NIGHT_READ}; $d[18] -eq 0x15`)).trim() === 'True';
    },
    async setNightLight(on) {
      await ps.call([
        NIGHT_READ,
        '$isOn = $d[18] -eq 0x15',
        `if ($isOn -ne $${on}) {`,
        `  if ($${on}) { $n = [byte[]]($d[0..22] + [byte[]](0x10, 0x00) + $d[23..($d.Length - 1)]); $n[18] = 0x15 }`,
        '  else { $n = [byte[]]($d[0..22] + $d[25..($d.Length - 1)]); $n[18] = 0x13 }',
        '  $t = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()',
        '  for ($i = 10; $i -lt 15; $i++) { $b = $t -band 0x7f; $t = $t -shr 7; if ($i -lt 14) { $b = $b -bor 0x80 }; $n[$i] = [byte]$b }',
        `  Set-ItemProperty ${NIGHT_KEY} -Name Data -Value $n`,
        '}',
      ].join('\n'));
    },
  };
}
