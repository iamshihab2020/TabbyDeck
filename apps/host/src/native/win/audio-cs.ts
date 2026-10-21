// Core Audio COM interop, compiled once per PowerShell host with Add-Type. Proven in the Milestone 0 spike.
export const AUDIO_CS = `using System;
using System.Runtime.InteropServices;
namespace Tabby {
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p);
    int GetChannelCount(out int c); int SetMasterVolumeLevel(float l, Guid g); int SetMasterVolumeLevelScalar(float l, Guid g);
    int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l);
    int SetChannelVolumeLevel(uint c, float l, Guid g); int SetChannelVolumeLevelScalar(uint c, float l, Guid g);
    int GetChannelVolumeLevel(uint c, out float l); int GetChannelVolumeLevelScalar(uint c, out float l);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, Guid g); int GetMute(out bool m);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int NotImpl1(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  public static class Audio {
    static IAudioEndpointVolume Ep(int flow) {
      var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator()); IMMDevice d;
      Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(flow, 1, out d));
      var iid = typeof(IAudioEndpointVolume).GUID; object o;
      Marshal.ThrowExceptionForHR(d.Activate(ref iid, 23, IntPtr.Zero, out o));
      return (IAudioEndpointVolume)o;
    }
    public static int GetVolume() { float l; Marshal.ThrowExceptionForHR(Ep(0).GetMasterVolumeLevelScalar(out l)); return (int)Math.Round(l * 100); }
    public static void SetVolume(int p) { Marshal.ThrowExceptionForHR(Ep(0).SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, p)) / 100f, Guid.Empty)); }
    public static bool GetMute(int flow) { bool m; Marshal.ThrowExceptionForHR(Ep(flow).GetMute(out m)); return m; }
    public static void SetMute(int flow, bool m) { Marshal.ThrowExceptionForHR(Ep(flow).SetMute(m, Guid.Empty)); }
  }
}
`;
