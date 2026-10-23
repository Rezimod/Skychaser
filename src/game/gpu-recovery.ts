// When the GPU takes a WebGL context away (memory pressure on a phone, a
// driver reset, a long sleep), each scene rebuilds itself on a new one. A
// rebuild at the same quality right away tends to be lost again for the same
// reason, and a scene that rebuilds over and over is what a player sees as
// the game freezing or restarting by itself. So the losses are counted
// across the scenes: each one after the first steps the automatic quality
// down, the rebuilds back off, and none starts while the page is hidden.
import { stepQualityDown } from '@/game/quality';

/** A healthy stretch this long forgives the earlier losses. */
const FORGIVE_MS = 120_000;
const DELAYS_MS = [1000, 2500, 6000, 12000];

let losses = 0;
let lastLoss = -Infinity;

/** Count a loss and say how long to wait before rebuilding. */
export function noteContextLoss(now = Date.now()): number {
  if (now - lastLoss > FORGIVE_MS) losses = 0;
  losses += 1;
  lastLoss = now;
  if (losses >= 2) stepQualityDown();
  return DELAYS_MS[Math.min(losses - 1, DELAYS_MS.length - 1)];
}

export function contextLosses(): number {
  return losses;
}

/** Tests: forget every loss. */
export function resetContextLosses() {
  losses = 0;
  lastLoss = -Infinity;
}

/** Run `fn` after `delayMs`, and only once the page is visible: a rebuild
 *  for a tab in the background waits for the player to come back. Returns a
 *  cancel. */
export function rebuildWhenVisible(fn: () => void, delayMs: number): () => void {
  let timer = 0;
  let done = false;
  const onVis = () => {
    if (document.hidden || done) return;
    document.removeEventListener('visibilitychange', onVis);
    done = true;
    fn();
  };
  timer = window.setTimeout(() => {
    if (document.hidden) document.addEventListener('visibilitychange', onVis);
    else { done = true; fn(); }
  }, delayMs);
  return () => {
    done = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** A frame loop's guard: the first error is reported, later ones now and
 *  then, and a loop that keeps failing frame after frame asks for a rebuild
 *  (once) rather than showing one still picture for good. */
export function makeLoopGuard(name: string, onStuck: () => void, stuckAfter = 90) {
  let streak = 0;
  let total = 0;
  let asked = false;
  return {
    ok() { streak = 0; },
    fail(e: unknown) {
      streak += 1;
      total += 1;
      if (total === 1 || total % 300 === 0) console.error(`[${name}] frame failed (${total})`, e);
      if (typeof window !== 'undefined') {
        const w = window as Window & { __stellarLoopErrors?: Record<string, number> };
        (w.__stellarLoopErrors ??= {})[name] = total;
      }
      if (streak >= stuckAfter && !asked) {
        asked = true;
        onStuck();
      }
    },
  };
}
