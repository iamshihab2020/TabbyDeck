type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export const isFullscreen = (): boolean => { const d = document as FsDoc; return !!(d.fullscreenElement || d.webkitFullscreenElement); };

/** Opened from its home-screen icon: the browser already shows TabbyDeck full screen, with no address bar. */
export const fromHomeScreen = (): boolean => !!window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;

export function toggleFullscreen(): void {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch { /* not allowed here */ }
}
