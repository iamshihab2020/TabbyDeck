type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export const isFullscreen = (): boolean => { const d = document as FsDoc; return !!(d.fullscreenElement || d.webkitFullscreenElement); };

/** Opened from its home-screen icon: the browser already shows TabbyDeck full screen, with no address bar. */
export const fromHomeScreen = (): boolean => (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  (!!window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);

/** False on iPhone, where Safari has no full-screen mode for pages; the home-screen icon is the way there. */
export const canFullscreen = (): boolean => { const d = document as FsDoc; return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled); };

/** iPhone or iPad. iPadOS reports itself as a Mac, so a Mac with a touch screen counts as an iPad. */
export const isIOS = (ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0): boolean =>
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);

export function toggleFullscreen(): void {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch { /* not allowed here */ }
}
