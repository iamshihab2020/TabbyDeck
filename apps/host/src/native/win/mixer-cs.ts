// Core Audio for the sound outputs (speakers, headphones) and the volume of each app, as in Windows' volume mixer.
// Compiled once per PowerShell host with Add-Type, like AUDIO_CS.
export const MIXER_CS = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Tabby {
  public class Output { public string id { get; set; } public string name { get; set; } public bool isDefault { get; set; } }
  public class AppSound { public string id { get; set; } public string name { get; set; } public int level { get; set; } public bool muted { get; set; } }

  public static class Mixer {
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
      [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection c);
      [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d);
      [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice d);
    }
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection { [PreserveSig] int GetCount(out uint n); [PreserveSig] int Item(uint i, out IMMDevice d); }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
      [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
      [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore s);
      [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    }
    [StructLayout(LayoutKind.Sequential)] struct PropKey { public Guid fmtid; public int pid; }
    [StructLayout(LayoutKind.Sequential)] struct PropVariant { public ushort vt; ushort r1, r2, r3; public IntPtr p; IntPtr p2; }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore {
      [PreserveSig] int GetCount(out uint n);
      [PreserveSig] int GetAt(uint i, out PropKey k);
      [PreserveSig] int GetValue(ref PropKey k, out PropVariant v);
    }
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant v);

    // Undocumented, but it is how every sound switcher (and Windows' own Settings) sets the default output.
    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyConfigClient {}
    [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPolicyConfig {
      [PreserveSig] int GetMixFormat(); [PreserveSig] int GetDeviceFormat(); [PreserveSig] int ResetDeviceFormat(); [PreserveSig] int SetDeviceFormat();
      [PreserveSig] int GetProcessingPeriod(); [PreserveSig] int SetProcessingPeriod(); [PreserveSig] int GetShareMode(); [PreserveSig] int SetShareMode();
      [PreserveSig] int GetPropertyValue(); [PreserveSig] int SetPropertyValue();
      [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2 {
      [PreserveSig] int GetAudioSessionControl(); [PreserveSig] int GetSimpleAudioVolume();
      [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
    }
    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator {
      [PreserveSig] int GetCount(out int n);
      [PreserveSig] int GetSession(int i, [MarshalAs(UnmanagedType.IUnknown)] out object s);
    }
    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2 {
      [PreserveSig] int GetState(out int s); [PreserveSig] int GetDisplayName(); [PreserveSig] int SetDisplayName(); [PreserveSig] int GetIconPath();
      [PreserveSig] int SetIconPath(); [PreserveSig] int GetGroupingParam(); [PreserveSig] int SetGroupingParam(); [PreserveSig] int RegisterAudioSessionNotification();
      [PreserveSig] int UnregisterAudioSessionNotification(); [PreserveSig] int GetSessionIdentifier(); [PreserveSig] int GetSessionInstanceIdentifier();
      [PreserveSig] int GetProcessId(out uint pid);
      [PreserveSig] int IsSystemSoundsSession();
    }
    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume {
      [PreserveSig] int SetMasterVolume(float l, ref Guid g); [PreserveSig] int GetMasterVolume(out float l);
      [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g); [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
    }

    const int RENDER = 0, ACTIVE = 1, CLSCTX_ALL = 23, EXPIRED = 2;
    static IMMDeviceEnumerator Enum() { return (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"))); }

    static string Name(IMMDevice d) {
      IPropertyStore s; if (d.OpenPropertyStore(0, out s) != 0) return null;
      var k = new PropKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 }; // PKEY_Device_FriendlyName
      PropVariant v; if (s.GetValue(ref k, out v) != 0) return null;
      try { return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null; } finally { PropVariantClear(ref v); }
    }

    /// <summary>The sound outputs that are plugged in or connected, and which one Windows plays through.</summary>
    public static List<Output> Outputs() {
      var e = Enum(); var list = new List<Output>();
      IMMDevice def; string defId = null;
      if (e.GetDefaultAudioEndpoint(RENDER, 1, out def) == 0) def.GetId(out defId);
      IMMDeviceCollection c; if (e.EnumAudioEndpoints(RENDER, ACTIVE, out c) != 0) return list;
      uint n; c.GetCount(out n);
      for (uint i = 0; i < n; i++) {
        IMMDevice d; string id; if (c.Item(i, out d) != 0 || d.GetId(out id) != 0) continue;
        list.Add(new Output { id = id, name = Name(d) ?? id, isDefault = id == defId });
      }
      return list;
    }

    /// <summary>Make an output the default for everything (games, music and calls), as the sound menu does.</summary>
    public static int SetOutput(string id) {
      var p = (IPolicyConfig)new PolicyConfigClient();
      for (int role = 0; role < 3; role++) { int hr = p.SetDefaultEndpoint(id, role); if (hr != 0) return hr; }
      return 0;
    }

    // Every live session on the default output, with the name of the program it belongs to.
    static List<KeyValuePair<string, object>> Sessions(out Dictionary<string, string> names) {
      names = new Dictionary<string, string>();
      var list = new List<KeyValuePair<string, object>>();
      IMMDevice d; if (Enum().GetDefaultAudioEndpoint(RENDER, 1, out d) != 0) return list;
      var iid = typeof(IAudioSessionManager2).GUID; object o;
      if (d.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o) != 0) return list;
      IAudioSessionEnumerator e; if (((IAudioSessionManager2)o).GetSessionEnumerator(out e) != 0) return list;
      int n; e.GetCount(out n);
      for (int i = 0; i < n; i++) {
        object s; if (e.GetSession(i, out s) != 0) continue;
        var c = (IAudioSessionControl2)s; int state; uint pid;
        if (c.GetState(out state) != 0 || state == EXPIRED || c.IsSystemSoundsSession() == 0 || c.GetProcessId(out pid) != 0 || pid == 0) continue;
        string key, name;
        try {
          var p = Process.GetProcessById((int)pid);
          key = p.ProcessName.ToLowerInvariant(); name = Describe((int)pid) ?? Tidy(p.ProcessName);
        } catch { continue; } // the process has ended
        if (!names.ContainsKey(key)) names[key] = name;
        list.Add(new KeyValuePair<string, object>(key, s));
      }
      return list;
    }

    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, System.Text.StringBuilder path, ref int size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    // The program's own description (Google Chrome, Spotify). Asks for the file with the least access, since
    // Process.MainModule fails for Store apps and processes of another bitness.
    static string Describe(int pid) {
      var h = OpenProcess(0x1000, false, pid); if (h == IntPtr.Zero) return null;
      try {
        var sb = new System.Text.StringBuilder(1024); int n = sb.Capacity;
        if (!QueryFullProcessImageName(h, 0, sb, ref n)) return null;
        var path = sb.ToString(); var v = FileVersionInfo.GetVersionInfo(path); var d = v.FileDescription;
        var file = System.IO.Path.GetFileNameWithoutExtension(path);
        Func<string, bool> good = x => !string.IsNullOrWhiteSpace(x) && !string.Equals(x.Trim(), file, StringComparison.OrdinalIgnoreCase);
        if (good(d)) return d.Trim();
        if (good(v.ProductName)) return v.ProductName.Trim(); // copilotapphost.exe describes itself as copilotapphost, but is Copilot
        // A Store app often describes itself by its file name; its package (Microsoft.Copilot_1.2_x64__8wekyb3d8bbwe) names it better.
        var m = System.Text.RegularExpressions.Regex.Match(path, @"\\WindowsApps\\([^\\_]+)_", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success) { var parts = m.Groups[1].Value.Split('.'); return parts[parts.Length - 1]; }
        return string.IsNullOrWhiteSpace(d) ? null : d.Trim();
      } catch { return null; } finally { CloseHandle(h); }
    }
    // copilotapphost -> Copilotapphost: at least it reads as a name.
    static string Tidy(string n) { return n.Length == 0 ? n : char.ToUpperInvariant(n[0]) + n.Substring(1); }

    /// <summary>The apps that have sound open, one entry per program (Chrome's many sessions count once).</summary>
    public static List<AppSound> Apps() {
      Dictionary<string, string> names; var byApp = new Dictionary<string, AppSound>(); var order = new List<AppSound>();
      foreach (var kv in Sessions(out names)) {
        if (byApp.ContainsKey(kv.Key)) continue;
        var v = (ISimpleAudioVolume)kv.Value; float l; bool m;
        if (v.GetMasterVolume(out l) != 0 || v.GetMute(out m) != 0) continue;
        var a = new AppSound { id = kv.Key, name = names[kv.Key], level = (int)Math.Round(l * 100), muted = m };
        byApp[kv.Key] = a; order.Add(a);
      }
      order.Sort((x, y) => string.Compare(x.name, y.name, StringComparison.OrdinalIgnoreCase));
      return order;
    }

    /// <summary>Set the volume (0-100, or -1 to leave it) and mute (-1 leave, 0 off, 1 on) of every session of one program. Returns how many changed.</summary>
    public static int SetApp(string id, int level, int mute) {
      Dictionary<string, string> names; int done = 0; var g = Guid.Empty;
      foreach (var kv in Sessions(out names)) {
        if (kv.Key != id) continue;
        var v = (ISimpleAudioVolume)kv.Value;
        if (level >= 0) v.SetMasterVolume(Math.Max(0, Math.Min(100, level)) / 100f, ref g);
        if (mute >= 0) v.SetMute(mute == 1, ref g);
        done++;
      }
      return done;
    }
  }
}
`;
