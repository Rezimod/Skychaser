// The sound of a gem being picked up: a short bright arpeggio on soft bells,
// higher and longer for the rarer kinds, with a shimmer of high partials for
// the diamonds. Its own little AudioContext, made on the first pickup (by
// then the player has pressed something, so the browser lets it play), at
// the game's master level and silent when sound is off.

import { onSoundChange, soundLevel } from '@/lib/solar-system/sound-prefs';
import { closeAudio, holdAudio } from '@/lib/solar-system/audio-lifecycle';
import { GEM_INFO, type GemKind } from '@/lib/solar-system/gem-layout';

const GAIN = 0.16;

export interface GemChime {
  play: (kind: GemKind) => void;
  dispose: () => void;
}

export function makeGemChime(): GemChime {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  // Suspended, not just silent, while the page is hidden or the game paused.
  const hold = holdAudio(() => ctx);
  const unsub = onSoundChange((_on, level) => {
    if (ctx && master) master.gain.setTargetAtTime(level * GAIN, ctx.currentTime, 0.05);
    hold.apply();
  });
  const ensure = (): AudioContext | null => {
    try {
      if (!ctx) {
        const AC = typeof window === 'undefined' ? null : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = soundLevel() * GAIN;
        master.connect(ctx.destination);
      }
      hold.apply();
      return ctx;
    } catch { return null; }
  };
  const bell = (c: AudioContext, out: GainNode, freq: number, at: number, len: number, level: number) => {
    for (const [mult, amp] of [[1, 1], [2.76, 0.32], [5.4, 0.12]] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = c.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level * amp, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len / mult ** 0.3);
      o.connect(g); g.connect(out);
      o.start(at); o.stop(at + len + 0.05);
    }
  };
  return {
    play(kind) {
      const c = ensure();
      if (!c || !master || soundLevel() <= 0) return;
      try {
        const t0 = c.currentTime + 0.01;
        const value = GEM_INFO[kind].points;
        // The rarer the stone, the higher it starts and the more notes it runs.
        const base = value >= 50 ? 880 : value >= 30 ? 784 : value >= 20 ? 659 : 587;
        const steps = value >= 40 ? [0, 4, 7, 12, 16] : value >= 20 ? [0, 4, 7, 12] : [0, 7, 12];
        steps.forEach((st, i) => bell(c, master!, base * 2 ** (st / 12), t0 + i * 0.055, 0.5 + i * 0.08, 0.22));
        if (value >= 50) for (let i = 0; i < 6; i++) bell(c, master, 2600 + i * 410, t0 + 0.25 + i * 0.04, 0.3, 0.05);
      } catch { /* silent */ }
    },
    dispose() {
      unsub();
      hold.dispose();
      closeAudio(ctx);
      ctx = null; master = null;
    },
  };
}
