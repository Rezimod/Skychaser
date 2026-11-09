/**
 * The home page's scroll scenes, without a library.
 *
 * Native scroll does the scrolling; scenes that hold still while they play are
 * CSS `position: sticky`, so nothing is ever re-parented or spaced out by
 * script and the page cannot jump. Each scene maps a stretch of the page to a
 * progress from 0 to 1 and writes transforms and opacity, nothing that makes
 * the browser lay the page out again.
 *
 * Where things are on the page is measured once, and again only when the page
 * changes size (a font arrives, an image loads, the window turns), never while
 * scrolling. One animation frame runs while the page moves and stops as soon as
 * every scene has settled, so an idle page costs nothing.
 *
 * Progress eases toward the scroll position over a few frames, enough to round
 * off the steps of a mouse wheel without the page feeling like it lags behind.
 */

export type Range = { start: number; end: number };

export type Scene = {
  /** Where the scene starts and ends, in page pixels. Called on load and resize only. */
  measure: (scrollY: number, vh: number) => Range;
  /** Draws the scene at a progress from 0 to 1. Only ever writes styles. */
  draw: (p: number) => void;
  /** False to follow the scroll exactly (parallax that must stay glued to the page). */
  smooth?: boolean;
};

type Live = Scene & { range: Range; p: number; drawn: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The part of 0..1 between a and b, as 0..1. */
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Eases out, for things arriving. */
export const out3 = (t: number) => 1 - (1 - t) ** 3;

/** How long the eased progress takes to close most of the gap, in ms. */
const LAG = 70;

export function runScenes(scenes: Scene[], watch: Element): () => void {
  const live: Live[] = scenes.map((s) => ({ ...s, range: { start: 0, end: 1 }, p: -1, drawn: -1 }));
  let raf = 0;
  let last = 0;

  const target = (s: Live, y: number) => {
    const { start, end } = s.range;
    return end <= start ? (y >= start ? 1 : 0) : clamp01((y - start) / (end - start));
  };

  const tick = (now: number) => {
    raf = 0;
    const y = window.scrollY;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    const k = 1 - Math.exp(-dt / LAG);
    let moving = false;
    for (const s of live) {
      const t = target(s, y);
      if (s.p < 0 || s.smooth === false) s.p = t;
      else {
        s.p += (t - s.p) * k;
        if (Math.abs(t - s.p) < 0.0004) s.p = t;
        else moving = true;
      }
      if (Math.abs(s.p - s.drawn) > 0.00005) {
        s.drawn = s.p;
        s.draw(s.p);
      }
    }
    if (moving) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const measure = () => {
    const y = window.scrollY;
    const vh = window.innerHeight;
    for (const s of live) s.range = s.measure(y, vh);
    // A new layout draws at once, with no easing toward it.
    for (const s of live) s.p = -1;
    kick();
  };

  // Sizes settle a few times while the page loads; one measure per frame at most.
  let pending = 0;
  const remeasure = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      measure();
    });
  };

  measure();
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });
  const ro = new ResizeObserver(remeasure);
  ro.observe(watch);
  document.fonts?.ready.then(remeasure).catch(() => {});

  return () => {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(pending);
    window.removeEventListener('scroll', kick);
    window.removeEventListener('resize', remeasure);
    ro.disconnect();
  };
}

/** The top of an element on the page, in page pixels, read while the page is still. */
export const pageTop = (el: Element, scrollY: number) => el.getBoundingClientRect().top + scrollY;
