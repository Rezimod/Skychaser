// The one "wait for it to have flown" timer behind every launch and ascent
// screen: it stays up at least `minMs`, and until the deck has drawn
// `frames` frames — or has stopped drawing, which is the same thing to a
// screen that must not sit over a paused deck.

export interface SettleOptions {
  minMs: number;
  frames: number;
  /** The deck's frame counter. */
  frame: () => number;
  /** True when no more frames are coming (the sim is inactive or paused). */
  idle: () => boolean;
  onSettled: () => void;
}

/** Starts watching at once; returns the cancel. */
export function settle(opts: SettleOptions): () => void {
  const from = opts.frame();
  const t0 = performance.now();
  let raf = 0;
  const wait = () => {
    const flown = opts.idle() || opts.frame() - from >= opts.frames;
    if (flown && performance.now() - t0 >= opts.minMs) { raf = 0; opts.onSettled(); return; }
    raf = requestAnimationFrame(wait);
  };
  raf = requestAnimationFrame(wait);
  return () => { if (raf) cancelAnimationFrame(raf); };
}
