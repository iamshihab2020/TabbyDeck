/**
 * Keep the screen on while the deck is visible. Wake Lock needs a secure context, which a LAN http page
 * is not, so the usual path on phones is a muted looping 1.5 KB video; Android keeps the screen on while
 * a video plays. Newer Chrome only counts a video that is on screen at a real size, so it fills the
 * viewport behind the deck, nearly transparent. Playback needs a user gesture and Chrome pauses it in the
 * background, so every touch re-arms it if it has stopped.
 */
export function keepAwake(): () => void {
  let lock: { release(): Promise<void> } | null = null;
  let video: HTMLVideoElement | null = null;
  const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };

  const viaLock = () => nav.wakeLock!.request('screen').then(l => { lock = l; }).catch(() => viaVideo());
  const viaVideo = () => {
    if (!video) {
      video = document.createElement('video');
      video.setAttribute('muted', ''); video.muted = true;
      video.setAttribute('playsinline', ''); video.loop = true;
      video.setAttribute('aria-hidden', 'true');
      video.src = 'keepawake.mp4';
      video.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;object-fit:cover;opacity:0.01;pointer-events:none;z-index:-1';
      document.body.appendChild(video);
    }
    if (video.paused) void video.play().catch(() => {});
  };
  const arm = () => {
    if (window.isSecureContext && nav.wakeLock) { if (!lock) void viaLock(); }
    else viaVideo();
  };
  // The browser drops a wake lock whenever the page is hidden; take a new one when it comes back.
  const onVisible = () => { if (document.visibilityState === 'visible') arm(); else lock = null; };

  // A touch only counts as a gesture that may start playback when the finger lifts (Safari is strict about it).
  document.addEventListener('pointerdown', arm, true);
  document.addEventListener('pointerup', arm, true);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    document.removeEventListener('pointerdown', arm, true);
    document.removeEventListener('pointerup', arm, true);
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => {});
    if (video) { video.pause(); video.remove(); video = null; }
  };
}
