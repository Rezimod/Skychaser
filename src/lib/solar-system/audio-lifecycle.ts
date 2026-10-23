// Every synthesiser owns an AudioContext, and a context left running keeps
// the audio thread awake: on a phone in a pocket that is battery for nothing.
// These helpers suspend a context while the page is hidden or the game is
// paused, resume it when both clear, and never let a refused promise (iOS
// says no outside a gesture, a closed context says no to everything) reach
// the console as an unhandled rejection.

import { soundPaused } from '@/lib/solar-system/sound-prefs';

/** iOS parks a context in 'interrupted' after a call or Siri; it resumes like a suspended one. */
export function needsResume(ctx: BaseAudioContext): boolean {
  const s = ctx.state as string;
  return s === 'suspended' || s === 'interrupted';
}

export function resumeAudio(ctx: AudioContext | null | undefined) {
  if (!ctx || !needsResume(ctx)) return;
  try { ctx.resume().catch(() => {}); } catch { /* closed */ }
}

export function suspendAudio(ctx: AudioContext | null | undefined) {
  if (!ctx || ctx.state !== 'running') return;
  try { ctx.suspend().catch(() => {}); } catch { /* closed */ }
}

export function closeAudio(ctx: AudioContext | null | undefined) {
  if (!ctx || (ctx.state as string) === 'closed') return;
  try { ctx.close().catch(() => {}); } catch { /* already closed */ }
}

/** Stop or disconnect a node that may already be stopped: older WebKit
 *  throws InvalidStateError, and this runs inside the render loop. */
export function quiet(fn: () => void) {
  try { fn(); } catch { /* already stopped */ }
}

export interface AudioHold {
  /** Whether the context should be running now (not hidden, not paused). */
  live: () => boolean;
  /** Suspend or resume to match `live()`. */
  apply: () => void;
  dispose: () => void;
}

/**
 * Keep a context suspended while the page is hidden, the game shell holds
 * every mix (`setSoundPaused`), or the module's own `paused()` says so.
 */
export function holdAudio(ctx: () => AudioContext | null, paused: () => boolean = () => false): AudioHold {
  const live = () =>
    !(typeof document !== 'undefined' && document.hidden) && !soundPaused() && !paused();
  const apply = () => {
    const c = ctx();
    if (!c) return;
    if (live()) resumeAudio(c);
    else suspendAudio(c);
  };
  const onVisibility = () => apply();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  return {
    live,
    apply,
    dispose() {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
