// TabbyDeck's tray icon. Host -> helper, JSON lines on stdin:
//   {"state":{"paused":bool,"pending":bool}}  {"balloon":{"title":"..","text":".."}}  {"quit":true}
// Helper -> host on stdout: {"click":"open|devices|pause|quit|balloon"}. Exits when stdin closes (the host is gone).
// Argument: the path of tabbydeck.exe, when there is one. The editor window (Edge app mode) is then given TabbyDeck's taskbar
// identity, so pinning it pins TabbyDeck with its icon instead of Edge.
// Kept lean on purpose (ApplicationContext, classic ContextMenu, x86, trimmed working set): see docs/spike-results.md.
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Drawing2D;
using System.Threading; using System.Windows.Forms; using System.Web.Script.Serialization;
using System.Runtime.InteropServices; using System.Text;

static class TrayMain {
  [System.Runtime.InteropServices.DllImport("kernel32.dll")] static extern bool SetProcessWorkingSetSize(IntPtr p, IntPtr min, IntPtr max);
  static NotifyIcon icon; static MenuItem pause; static Icon normal, paused, pending;

  [STAThread] static void Main(string[] args) {
    normal = Draw(Color.FromArgb(0xf5, 0xa5, 0x24), false);
    paused = Draw(Color.FromArgb(0x8a, 0x8f, 0x98), false);
    pending = Draw(Color.FromArgb(0xf5, 0xa5, 0x24), true);
    pause = new MenuItem("Pause actions", (s, e) => Emit("pause"));
    var open = new MenuItem("Open TabbyDeck", (s, e) => Emit("open")) { DefaultItem = true };
    var menu = new ContextMenu(new[] { open, new MenuItem("Devices", (s, e) => Emit("devices")), pause, new MenuItem("-"), new MenuItem("Quit TabbyDeck", (s, e) => Emit("quit")) });
    icon = new NotifyIcon { Icon = normal, Text = "TabbyDeck", Visible = true, ContextMenu = menu };
    icon.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) Emit("open"); };
    icon.BalloonTipClicked += (s, e) => Emit("balloon");
    var ui = new WindowsFormsSynchronizationContext();
    var json = new JavaScriptSerializer();
    new Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) { var l = line; ui.Post(_ => Handle(json, l), null); }
      ui.Post(_ => Quit(), null);
    }) { IsBackground = true }.Start();
    GC.Collect(); SetProcessWorkingSetSize(System.Diagnostics.Process.GetCurrentProcess().Handle, (IntPtr)(-1), (IntPtr)(-1));
    if (args.Length > 0) { var tag = new System.Windows.Forms.Timer { Interval = 1500 }; tag.Tick += (s, e) => TagEditorWindows(args[0]); tag.Start(); }
    Emit("ready");
    Application.Run(new ApplicationContext());
  }

  static void Handle(JavaScriptSerializer json, string line) {
    try {
      var m = json.Deserialize<Dictionary<string, object>>(line);
      object v;
      if (m.TryGetValue("state", out v)) {
        var s = (Dictionary<string, object>)v;
        bool p = Flag(s, "paused"), w = Flag(s, "pending");
        pause.Checked = p;
        icon.Icon = p ? paused : w ? pending : normal;
        icon.Text = p ? "TabbyDeck (paused)" : w ? "TabbyDeck: a device wants to connect" : "TabbyDeck";
      }
      if (m.TryGetValue("balloon", out v)) {
        var b = (Dictionary<string, object>)v;
        icon.ShowBalloonTip(6000, Convert.ToString(b["title"]), Convert.ToString(b["text"]), ToolTipIcon.Info);
      }
      if (m.ContainsKey("quit")) Quit();
    } catch (Exception) { /* a bad line never takes the icon down */ }
  }

  static bool Flag(Dictionary<string, object> d, string k) { object v; return d.TryGetValue(k, out v) && v is bool && (bool)v; }
  static void Quit() { icon.Visible = false; Application.Exit(); }
  static void Emit(string id) { Console.Out.WriteLine(id == "ready" ? "{\"ready\":true}" : "{\"click\":\"" + id + "\"}"); Console.Out.Flush(); }

  // Taskbar identity for the editor window. Edge's app window is titled with the page title, "TabbyDeck"; a normal Edge
  // window always has " - Microsoft Edge" after it, so an exact title match only finds ours.
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore { int GetCount(out uint n); int GetAt(uint i, out PropKey k); int GetValue(ref PropKey k, out PropVar v); int SetValue(ref PropKey k, ref PropVar v); int Commit(); }
  [StructLayout(LayoutKind.Sequential)] struct PropKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] struct PropVar { public ushort vt; ushort a, b, c; public IntPtr p; IntPtr p2; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore ps);
  static readonly HashSet<IntPtr> tagged = new HashSet<IntPtr>();

  static void TagEditorWindows(string exe) {
    EnumWindows((h, l) => {
      if (tagged.Contains(h) || !IsWindowVisible(h)) return true;
      var t = new StringBuilder(64); GetWindowText(h, t, 64);
      if (t.ToString() != "TabbyDeck") return true;
      var c = new StringBuilder(64); GetClassName(h, c, 64);
      if (c.ToString() != "Chrome_WidgetWin_1") return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      try { if (System.Diagnostics.Process.GetProcessById((int)pid).ProcessName != "msedge") return true; } catch (Exception) { return true; }
      try { Tag(h, exe); tagged.Add(h); } catch (Exception) { /* leave it as an Edge window */ }
      return true;
    }, IntPtr.Zero);
  }

  static void Tag(IntPtr h, string exe) {
    var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore ps;
    Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(h, ref iid, out ps));
    try {
      // The relaunch values only count once the id is set, so the id goes last.
      Set(ps, 2, "\"" + exe + "\"");   // RelaunchCommand
      Set(ps, 3, exe + ",0");          // RelaunchIconResource
      Set(ps, 4, "TabbyDeck");             // RelaunchDisplayNameResource
      Set(ps, 5, "TabbyDeck.App");   // ID
      ps.Commit();
    } finally { Marshal.ReleaseComObject(ps); }
  }

  static void Set(IPropertyStore ps, uint id, string value) {
    var k = new PropKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = id };
    var v = new PropVar { vt = 31 /* VT_LPWSTR */, p = Marshal.StringToCoTaskMemUni(value) };
    try { Marshal.ThrowExceptionForHR(ps.SetValue(ref k, ref v)); } finally { Marshal.FreeCoTaskMem(v.p); }
  }

  // The tile mark: an amber rounded square holding four dark tiles; grey when paused; a red dot while a device waits.
  static Icon Draw(Color c, bool dot) {
    int n = SystemInformation.SmallIconSize.Width;
    var bmp = new Bitmap(n, n);
    using (var g = Graphics.FromImage(bmp)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      float d = n / 2f, e = n - 1 - d;
      var shape = new GraphicsPath();
      shape.AddArc(0, 0, d, d, 180, 90); shape.AddArc(e, 0, d, d, 270, 90); shape.AddArc(e, e, d, d, 0, 90); shape.AddArc(0, e, d, d, 90, 90);
      shape.CloseFigure();
      using (var b = new SolidBrush(c)) g.FillPath(b, shape);
      float t = n * 0.24f, gap = n * 0.1f, o = (n - 2 * t - gap) / 2f;
      using (var k = new SolidBrush(Color.FromArgb(0x1d, 0x21, 0x28)))
        for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) g.FillRectangle(k, o + i * (t + gap), o + j * (t + gap), t, t);
      if (dot) {
        float s = n * 0.45f;
        using (var w = new SolidBrush(Color.White)) g.FillEllipse(w, n - s, 0, s, s);
        using (var r = new SolidBrush(Color.FromArgb(0xe5, 0x48, 0x4d))) g.FillEllipse(r, n - s + 1, 1, s - 2, s - 2);
      }
    }
    return Icon.FromHandle(bmp.GetHicon());
  }
}
