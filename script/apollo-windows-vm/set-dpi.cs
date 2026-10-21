// Apollo global prep-cmd: set Windows DPI scaling of the streamed display by client resolution.
// Shorter side >= 2160 -> 200%, >= 1440 -> 150%, else 100%.
// Build: C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /optimize /out:set-dpi.exe set-dpi.cs
// Usage: set-dpi.exe [width height]   (defaults to APOLLO_CLIENT_WIDTH/HEIGHT)
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

static class SetDpi {
  [StructLayout(LayoutKind.Sequential)] struct LUID { public uint Low; public int High; }
  [StructLayout(LayoutKind.Sequential, Size = 72)] struct PATH {
    public LUID srcAdapter; public uint srcId; public uint srcModeIdx; public uint srcFlags;
  }
  [StructLayout(LayoutKind.Explicit, Size = 64)] struct MODE {
    [FieldOffset(0)] public int infoType; [FieldOffset(4)] public uint id; [FieldOffset(8)] public LUID adapter;
    [FieldOffset(16)] public uint width; [FieldOffset(20)] public uint height;
  }
  // Undocumented DISPLAYCONFIG_DEVICE_INFO_GET/SET_DPI_SCALE (-3/-4); scale values are step offsets from the recommended DPI
  [StructLayout(LayoutKind.Sequential)] struct HDR { public int type; public int size; public LUID adapter; public uint id; }
  [StructLayout(LayoutKind.Sequential)] struct GET { public HDR h; public int min; public int cur; public int max; }
  [StructLayout(LayoutKind.Sequential)] struct SET { public HDR h; public int scale; }
  [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint f, out uint np, out uint nm);
  [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint f, ref uint np, [Out] PATH[] p, ref uint nm, [Out] MODE[] m, IntPtr t);
  [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref GET p);
  [DllImport("user32.dll")] static extern int DisplayConfigSetDeviceInfo(ref SET p);

  static readonly int[] Steps = { 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500 };
  static readonly string LogPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "set-dpi.log");

  struct Source { public LUID Adapter; public uint Id; public uint W, H; }

  static void Log(string m) {
    try { File.AppendAllText(LogPath, DateTime.Now.ToString("s") + " " + m + Environment.NewLine); } catch { }
  }

  static List<Source> GetSources() {
    var list = new List<Source>();
    uint np, nm;
    if (GetDisplayConfigBufferSizes(2, out np, out nm) != 0) return list;
    var p = new PATH[np]; var m = new MODE[nm];
    if (QueryDisplayConfig(2, ref np, p, ref nm, m, IntPtr.Zero) != 0) return list;
    for (int i = 0; i < np; i++) {
      if (p[i].srcModeIdx >= nm || m[p[i].srcModeIdx].infoType != 1) continue;
      list.Add(new Source { Adapter = p[i].srcAdapter, Id = p[i].srcId, W = m[p[i].srcModeIdx].width, H = m[p[i].srcModeIdx].height });
    }
    return list;
  }

  static HDR Header(int type, int size, Source s) {
    return new HDR { type = type, size = size, adapter = s.Adapter, id = s.Id };
  }

  static int Main(string[] args) {
    uint width, height;
    if (args.Length >= 2) { uint.TryParse(args[0], out width); uint.TryParse(args[1], out height); }
    else {
      uint.TryParse(Environment.GetEnvironmentVariable("APOLLO_CLIENT_WIDTH"), out width);
      uint.TryParse(Environment.GetEnvironmentVariable("APOLLO_CLIENT_HEIGHT"), out height);
    }
    uint shortSide = Math.Min(width, height);
    int want = shortSide >= 2160 ? 200 : shortSide >= 1440 ? 150 : 100;

    // Wait for the virtual display to report the client's resolution; fall back to all active sources
    List<Source> all = null, targets = new List<Source>();
    for (int t = 0; t < 20 && targets.Count == 0; t++) {
      all = GetSources();
      targets = all.FindAll(s => s.W == width && s.H == height);
      if (targets.Count == 0) Thread.Sleep(250);
    }
    if (targets.Count == 0) {
      targets = all;
      Log(string.Format("no source at {0}x{1}, using all: {2}", width, height,
        string.Join(",", all.ConvertAll(s => s.W + "x" + s.H).ToArray())));
    }

    foreach (var s in targets) {
      var g = new GET { h = Header(-3, Marshal.SizeOf(typeof(GET)), s) };
      int rc = -1;
      // A freshly created virtual display can reject the query for a moment
      for (int t = 0; t < 20; t++) {
        rc = DisplayConfigGetDeviceInfo(ref g);
        if (rc == 0) break;
        Thread.Sleep(250);
      }
      if (rc != 0) { Log(string.Format("get failed rc={0} source={1}", rc, s.Id)); continue; }

      int rec = Math.Abs(g.min);
      int was = Steps[rec + g.cur];
      int rel = Math.Max(g.min, Math.Min(g.max, Array.IndexOf(Steps, want) - rec));
      var set = new SET { h = Header(-4, Marshal.SizeOf(typeof(SET)), s), scale = rel };
      rc = DisplayConfigSetDeviceInfo(ref set);
      DisplayConfigGetDeviceInfo(ref g);
      Log(string.Format("client {0}x{1} source={2} {3}x{4} recommended={5}% was={6}% set={7}% rc={8} now={9}%",
        width, height, s.Id, s.W, s.H, Steps[rec], was, Steps[rec + rel], rc, Steps[rec + g.cur]));
    }
    return 0;
  }
}
