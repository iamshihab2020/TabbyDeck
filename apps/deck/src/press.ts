export interface PressHandlers { onPress(): void; onLong(): void; onDouble(): void; onRelease(): void }

export interface PressOptions {
  longMs: number;
  doubleMs: number;
  /** Holding repeats press every repeatMs after longMs, instead of firing long (Volume +). */
  repeatMs?: number;
  /**
   * The deck scrolls (a phone): press waits for the finger to lift, so a swipe that scrolls presses nothing. A hold
   * still presses once longMs passes. The browser cancels the pointer when it starts scrolling.
   */
  tap?: boolean;
}

/**
 * Press semantics: press fires on down (instant feedback and action start), long once at longMs while held,
 * double on a second down within doubleMs (the second press is still delivered), release on up.
 */
export function createPressTracker(h: PressHandlers, opts: PressOptions = { longMs: 500, doubleMs: 300 }) {
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;
  let lastDown = -Infinity;
  let isDown = false, pressed = false;
  const stop = () => { clearTimeout(longTimer); clearInterval(repeat); };
  const press = () => {
    pressed = true;
    const now = Date.now();
    h.onPress();
    if (now - lastDown <= opts.doubleMs) { h.onDouble(); lastDown = -Infinity; } else lastDown = now;
  };
  return {
    down() {
      isDown = true; pressed = false;
      stop();
      if (!opts.tap) press();
      longTimer = setTimeout(() => {
        if (!isDown) return;
        if (!pressed) press();
        if (opts.repeatMs) repeat = setInterval(() => { if (isDown) h.onPress(); }, opts.repeatMs); else h.onLong();
      }, opts.longMs);
    },
    up() {
      stop();
      if (!isDown) return;
      isDown = false;
      if (!pressed) press();
      h.onRelease();
    },
    cancel() { stop(); isDown = false; },
  };
}
