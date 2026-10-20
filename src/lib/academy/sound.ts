// Small, soft sounds for Stellar Academy, made on the spot with Web Audio:
// no files to load, nothing loud. The context is made on the first sound,
// which always follows a tap, so browsers allow it.

type Cue = 'tap' | 'right' | 'wrong' | 'done' | 'capsule';

/** Notes for each cue: [frequency Hz, start s, length s]. */
const CUES: Record<Cue, [number, number, number][]> = {
  tap: [[660, 0, 0.05]],
  right: [[660, 0, 0.09], [990, 0.08, 0.16]],
  wrong: [[330, 0, 0.12], [262, 0.1, 0.2]],
  done: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]],
  capsule: [[784, 0, 0.08], [988, 0.07, 0.08], [1175, 0.14, 0.08], [1568, 0.21, 0.35]],
};

let ctx: AudioContext | null = null;

export function playCue(cue: Cue, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime + 0.01;
    for (const [freq, at, len] of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cue === 'wrong' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    }
  } catch {
    /* no audio on this device: the lesson carries on silently */
  }
}
