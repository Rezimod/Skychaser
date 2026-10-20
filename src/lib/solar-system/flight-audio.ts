// Flight audio: the few things Explore Mode is allowed to make a noise
// about. The deck itself is silent — no engine hum, no RCS puffs, no radio
// chatter — so that the moments that do sound land: the drive winding up
// and letting go, a system reached, a discovery, a hit, a hull lost, and
// the organ that rises as a black hole fills the glass. Everything is
// synthesised in Web Audio, built lazily after the first user gesture, and
// silent if the browser refuses or the pilot turned the sound off.

import { onSoundChange, soundLevel } from '@/lib/solar-system/sound-prefs';

export interface FlightAudio {
  /** The flight begins: a slow organ swell out of nothing. */
  launch: () => void;
  /** Cannon shot. */
  laser: () => void;
  /** An explosion: a hull, a station, a world. */
  boom: () => void;
  /** Entering and leaving light speed. */
  whoosh: () => void;
  /** A star system reached: the chord that resolves after the exit flash. */
  arrive: () => void;
  /** The drive winding up: a swell that climbs for `dur` and then stops. */
  charge: (dur: number) => void;
  /** Cut the charge short — the jump was refused or interrupted. */
  stopCharge: () => void;
  /** An entry in the expedition log. */
  discovery: () => void;
  /** Something struck the ship; heavier when the hull took it. */
  hit: (hull: boolean) => void;
  /** Shields down or hull critical: two falling notes, once. */
  warn: () => void;
  /** Docked, released, or a landing accepted. */
  confirm: () => void;
  /** The black hole's organ, 0 far away and 1 at the horizon. Call every frame. */
  drone: (k: number) => void;
  /** The roar of air on a re-entry heat shield, 0 silent … 1 at peak heating. Call every frame. */
  reentry: (k: number) => void;
  /** Down through the speed of sound: the double thud of the ship's own
   *  shock waves going past, the bow's and then the tail's. */
  sonicBoom: () => void;
  /** Hold everything while the deck is paused. */
  setPaused: (paused: boolean) => void;
  dispose: () => void;
}

/** Deliberately quiet — a shot is a tick, a jump is a swell. */
const MASTER_GAIN = 0.07;
/** Two hits inside this window sound as one. */
const HIT_GAP = 0.2;

export function makeFlightAudio(): FlightAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  /** The drive's wind-up, while it is sounding. */
  let chargeVoice: { stop: () => void } | null = null;
  /** The black hole's organ, once it has been heard. */
  let droneGain: GainNode | null = null;
  let droneK = 0;
  let roar: { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode; rumble: OscillatorNode } | null = null;
  let lastHit = -1;
  let paused = false;
  let disposed = false;
  const unsubscribe = onSoundChange((_on, level) => {
    if (master && ctx) master.gain.setTargetAtTime(level * MASTER_GAIN, ctx.currentTime, 0.05);
  });

  const ready = (): AudioContext => {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = soundLevel() * MASTER_GAIN;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && !paused) void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  };
  const safe = (fn: (c: AudioContext) => void) => {
    if (disposed) return;
    try {
      fn(ready());
    } catch {
      // No audio available (autoplay policy, missing API) — the flight stays silent.
    }
  };
  const tone = (c: AudioContext, type: OscillatorType, f0: number, f1: number, gain: number, dur: number, at = 0) => {
    if (!master) return;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    osc.connect(g).connect(master);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };
  const burst = (c: AudioContext, filter: BiquadFilterType, f0: number, f1: number, gain: number, dur: number) => {
    if (!noise || !master) return;
    const t0 = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    const flt = c.createBiquadFilter();
    flt.type = filter;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    src.connect(flt).connect(g).connect(master);
    src.onended = () => {
      src.disconnect();
      flt.disconnect();
      g.disconnect();
    };
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  };
  /** A church organ, roughly: each note a sine with a soft octave above it,
   *  the whole chord under one slow envelope and a low-pass that keeps it warm. */
  const organ = (c: AudioContext, notes: number[], attack: number, hold: number, release: number, gain: number, at = 0) => {
    if (!master) return;
    const t0 = c.currentTime + at;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.setValueAtTime(gain, t0 + attack + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(1800, t0 + attack);
    env.connect(lp).connect(master);
    const end = t0 + attack + hold + release + 0.05;
    const voices: OscillatorNode[] = [];
    for (const f of notes) {
      for (const [mult, level, type] of [[1, 1, 'sine'], [2, 0.28, 'triangle']] as const) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        o.detune.value = (Math.random() - 0.5) * 6;
        const g = c.createGain();
        g.gain.value = level / notes.length;
        o.connect(g).connect(env);
        o.start(t0);
        o.stop(end);
        voices.push(o);
      }
    }
    voices[0].onended = () => {
      for (const o of voices) o.disconnect();
      env.disconnect();
      lp.disconnect();
    };
  };
  const bell = (c: AudioContext, f: number, gain: number, dur: number, at: number) => {
    if (!master) return;
    const t0 = c.currentTime + at;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(master);
    const voices = [[1, 1], [2.76, 0.22], [5.4, 0.06]].map(([mult, level]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const vg = c.createGain();
      vg.gain.value = level;
      o.connect(vg).connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
      return o;
    });
    voices[0].onended = () => {
      for (const o of voices) o.disconnect();
      g.disconnect();
    };
  };

  return {
    launch() {
      safe((c) => organ(c, [55, 82.41, 110, 164.81], 2.4, 1.2, 3.2, 0.7));
    },
    laser() {
      safe((c) => {
        tone(c, 'sawtooth', 640, 190, 0.5, 0.1);
        tone(c, 'square', 1280, 300, 0.12, 0.06);
      });
    },
    boom() {
      safe((c) => {
        burst(c, 'lowpass', 900, 60, 1.6, 1.8);
        tone(c, 'sine', 90, 28, 1.1, 1.4);
      });
    },
    whoosh() {
      chargeVoice?.stop();
      chargeVoice = null;
      safe((c) => {
        burst(c, 'lowpass', 200, 4200, 1.2, 1.2);
        tone(c, 'sine', 60, 900, 0.5, 0.9);
      });
    },
    arrive() {
      safe((c) => organ(c, [110, 164.81, 220, 277.18], 0.5, 1.0, 2.8, 0.55, 0.45));
    },
    charge(dur) {
      chargeVoice?.stop();
      chargeVoice = null;
      safe((c) => {
        // Two detuned saws climbing an octave and a half into the jump,
        // opened up by a filter as they go.
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.6, c.currentTime + dur * 0.85);
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 6;
        filter.frequency.setValueAtTime(220, c.currentTime);
        filter.frequency.exponentialRampToValueAtTime(2600, c.currentTime + dur);
        gain.connect(filter);
        filter.connect(master!);
        const oscs = [0, 4].map((detune) => {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.detune.value = detune;
          o.frequency.setValueAtTime(110, c.currentTime);
          o.frequency.exponentialRampToValueAtTime(300, c.currentTime + dur);
          o.connect(gain);
          o.start();
          o.stop(c.currentTime + dur + 0.1);
          return o;
        });
        chargeVoice = {
          stop() {
            const now = c.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
            for (const o of oscs) o.stop(now + 0.16);
          },
        };
      });
    },
    stopCharge() {
      chargeVoice?.stop();
      chargeVoice = null;
    },
    discovery() {
      safe((c) => {
        bell(c, 880, 0.32, 1.4, 0);
        bell(c, 1174.66, 0.26, 1.8, 0.16);
      });
    },
    hit(hull) {
      safe((c) => {
        if (c.currentTime - lastHit < HIT_GAP) return;
        lastHit = c.currentTime;
        burst(c, 'lowpass', hull ? 520 : 1400, 70, hull ? 1.0 : 0.45, hull ? 0.32 : 0.18);
        tone(c, 'sine', hull ? 130 : 260, 40, hull ? 0.7 : 0.3, hull ? 0.3 : 0.16);
      });
    },
    warn() {
      safe((c) => {
        tone(c, 'triangle', 660, 640, 0.28, 0.16);
        tone(c, 'triangle', 440, 420, 0.28, 0.24, 0.2);
      });
    },
    confirm() {
      safe((c) => {
        tone(c, 'triangle', 523, 528, 0.22, 0.12);
        tone(c, 'triangle', 784, 790, 0.22, 0.26, 0.11);
      });
    },
    drone(k) {
      const next = k > 0.01 ? Math.min(1, k) : 0;
      if (next === droneK) return;
      if (!droneGain && next === 0) return;
      droneK = next;
      safe((c) => {
        if (!master) return;
        if (!droneGain) {
          // Three low pipes a fifth apart, the lowest barely a note, the
          // whole thing breathing under a slow tremolo.
          droneGain = c.createGain();
          droneGain.gain.value = 0;
          const lp = c.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 420;
          droneGain.connect(lp).connect(master);
          const trem = c.createGain();
          trem.gain.value = 1;
          trem.connect(droneGain);
          const lfo = c.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 0.11;
          const lfoDepth = c.createGain();
          lfoDepth.gain.value = 0.18;
          lfo.connect(lfoDepth).connect(trem.gain);
          lfo.start();
          for (const [f, level, type] of [[41.2, 0.55, 'sine'], [61.74, 0.4, 'sine'], [82.41, 0.3, 'triangle'], [123.47, 0.12, 'triangle']] as const) {
            const o = c.createOscillator();
            o.type = type;
            o.frequency.value = f;
            const g = c.createGain();
            g.gain.value = level;
            o.connect(g).connect(trem);
            o.start();
          }
        }
        droneGain.gain.setTargetAtTime(droneK * 1.1, c.currentTime, droneK > 0 ? 0.9 : 0.5);
      });
    },
    reentry(k) {
      const next = Math.max(0, Math.min(1, k));
      if (!roar && next < 0.01) return;
      safe((c) => {
        if (!master || !noise) return;
        if (!roar) {
          // Air torn apart at the shield: brown-ish noise through a moving low-pass, and a rumble under it.
          const src = c.createBufferSource();
          src.buffer = noise;
          src.loop = true;
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 200;
          filter.Q.value = 0.7;
          const gain = c.createGain();
          gain.gain.value = 0;
          const rumble = c.createOscillator();
          rumble.type = 'sine';
          rumble.frequency.value = 38;
          const rg = c.createGain();
          rg.gain.value = 0.5;
          src.connect(filter).connect(gain).connect(master);
          rumble.connect(rg).connect(gain);
          src.start();
          rumble.start();
          roar = { gain, filter, src, rumble };
        }
        roar.gain.gain.setTargetAtTime(next * 2.4, c.currentTime, 0.15);
        roar.filter.frequency.setTargetAtTime(180 + next * 1400, c.currentTime, 0.2);
        roar.rumble.frequency.setTargetAtTime(30 + next * 16, c.currentTime, 0.3);
        if (next < 0.01) {
          const r = roar;
          roar = null;
          window.setTimeout(() => { try { r.src.stop(); r.rumble.stop(); r.gain.disconnect(); } catch { /* already gone */ } }, 900);
        }
      });
    },
    sonicBoom() {
      safe((c) => {
        // Two low cracks a beat apart, each a noise burst over a falling sine.
        burst(c, 'lowpass', 520, 45, 1.5, 0.55);
        tone(c, 'sine', 70, 26, 1.2, 0.5);
        tone(c, 'sine', 64, 24, 1.0, 0.5, 0.16);
        if (!noise || !master) return;
        const t0 = c.currentTime + 0.16;
        const src = c.createBufferSource();
        src.buffer = noise;
        const flt = c.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(460, t0);
        flt.frequency.exponentialRampToValueAtTime(40, t0 + 0.6);
        const g = c.createGain();
        g.gain.setValueAtTime(1.2, t0);
        g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.6);
        src.connect(flt).connect(g).connect(master);
        src.onended = () => { src.disconnect(); flt.disconnect(); g.disconnect(); };
        src.start(t0);
        src.stop(t0 + 0.62);
      });
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      if (!ctx) return;
      try {
        if (next) void ctx.suspend();
        else void ctx.resume();
      } catch {
        // Nothing to hold.
      }
    },
    dispose() {
      disposed = true;
      unsubscribe();
      chargeVoice?.stop();
      chargeVoice = null;
      droneGain = null;
      droneK = 0;
      void ctx?.close();
      ctx = null;
      master = null;
      noise = null;
    },
  };
}
