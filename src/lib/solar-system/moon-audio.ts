// What you hear inside the helmet. There is no sound outside it — the Moon
// is silent — so everything here is the suit: the low hum of the life
// support pack, boot strikes and landings carried up through the suit, a
// comms bleep when the base names something. Synthesised in Web Audio,
// created on the first gesture.
//
// Two rules keep it honest. Anything happening out on the regolith — boots,
// the rover's motor, the descent engine — reaches the crew as vibration
// through the suit or the frame they are touching, so it is low-passed to
// the point of being felt rather than heard. Anything that needs air —
// the airlock's hiss, a habitat's machinery — sounds only while there is air
// to carry it, which is to say while the chamber is coming up to pressure or
// the crew is inside. The radio is the exception: it is carried on a wire.

import { onSoundChange, soundLevel } from '@/lib/solar-system/sound-prefs';

const MASTER_GAIN = 0.22;

/** A voice that runs for as long as the thing making it does. */
interface Bed {
  gain: GainNode;
  /** Follow whatever the frame is doing — a motor's load, a hiss's pressure. */
  tune?: (k: number) => void;
}

export interface SuitAudio {
  /** Call from a user gesture; safe to call repeatedly. */
  start: () => void;
  /** An act of the expedition closed, a job paid: a short chord through the helmet. */
  milestone: () => void;
  /** Exertion 0..1 lifts the pack a little. Inside the helmet the suit is louder. */
  update: (dt: number, exertion: number, helmet: boolean) => void;
  step: (hard: number) => void;
  bleep: () => void;
  thump: (distance: number) => void;
  /** The drill through the suit: pitch and weight follow the bit's load. */
  drill: (load: number, running: boolean) => void;
  /** The rover's motor through the seat: 0…1 of its top speed. Every frame. */
  motor: (load: number, running: boolean) => void;
  /** The descent engine through the frame, 0…1 of throttle. Every frame. */
  engine: (throttle: number) => void;
  /** The jetpack on the back, 0…1 of throttle: a roar through the shell whose pitch climbs with it, and a click as it lights. Every frame. */
  jet: (throttle: number) => void;
  /** Air moving in the chamber, 0 none … 1 a full cycle. Every frame. */
  hiss: (k: number) => void;
  /** A habitat's machinery, heard only in air: 0 outside, 1 on a live deck. */
  hum: (k: number) => void;
  /** A burst of radio: the base saying something the crew will read on the glass. */
  chatter: () => void;
  dispose: () => void;
}

/** `open`: no helmet and no pack, so no bed at all. */
export function makeSuitAudio(open = false): SuitAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let fanGain: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let helmetK = 0;
  let drillOsc: OscillatorNode | null = null;
  let drillGain: GainNode | null = null;
  let jetLit = false;
  const unsubscribe = onSoundChange((_on, level) => {
    if (master && ctx) master.gain.setTargetAtTime(level * MASTER_GAIN, ctx.currentTime, 0.05);
  });

  const start = () => {
    try {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = soundLevel() * MASTER_GAIN;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        // The pack: a low hum and nothing else. There used to be a band of
        // noise at 900 Hz for the air and a second one breathing at 520 Hz;
        // both sat right in the ear's most sensitive octaves and never
        // stopped, and under a scene you play for twenty minutes that reads
        // as someone blowing into the microphone. The lowpass now sits at
        // 190 Hz so no part of the bed can be heard as moving air.
        const fan = ctx.createOscillator();
        fan.type = 'triangle';
        fan.frequency.value = 78;
        const fanLp = ctx.createBiquadFilter();
        fanLp.type = 'lowpass';
        fanLp.frequency.value = 190;
        fanGain = ctx.createGain();
        fanGain.gain.value = 0.03;
        fan.connect(fanLp); fanLp.connect(fanGain); fanGain.connect(master);
        fan.start();
      }
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      // No audio — the suit is silent.
    }
  };
  const one = (fn: (c: AudioContext, m: GainNode) => void) => {
    if (!ctx || !master) return;
    try { fn(ctx, master); } catch { /* silent */ }
  };
  /** Continuous voices, each built the first time it is actually needed. */
  const beds = new Map<string, Bed>();
  const bed = (name: string, live: boolean, build: (c: AudioContext, m: GainNode) => Bed): Bed | null => {
    const held = beds.get(name);
    if (held) return held;
    if (!live || !ctx || !master) return null;
    try {
      const made = build(ctx, master);
      beds.set(name, made);
      return made;
    } catch {
      return null;
    }
  };
  /** A band of noise: the raw material of air moving and of ground rumble. */
  const noiseBed = (c: AudioContext, type: BiquadFilterType, freq: number, q: number): { gain: GainNode; filter: BiquadFilterNode } => {
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain);
    src.start();
    return { gain, filter };
  };
  const ramp = (b: Bed, level: number, seconds: number) => {
    if (ctx) b.gain.gain.setTargetAtTime(level, ctx.currentTime, seconds);
  };
  return {
    start,
    milestone() {
      one((c, m) => {
        // A major triad on soft pipes, held a moment, let go slowly.
        const t0 = c.currentTime;
        const env = c.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(0.16, t0 + 0.35);
        env.gain.setValueAtTime(0.16, t0 + 1.1);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1400;
        env.connect(lp); lp.connect(m);
        const voices = [220, 277.18, 329.63, 440].map((f) => {
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const g = c.createGain(); g.gain.value = 0.3;
          o.connect(g); g.connect(env);
          o.start(t0); o.stop(t0 + 3.3);
          return o;
        });
        voices[0].onended = () => { for (const o of voices) o.disconnect(); env.disconnect(); lp.disconnect(); };
      });
    },
    update(dt, exertion, helmet) {
      if (!ctx || !fanGain) return;
      helmetK += ((open ? 0 : helmet ? 1 : 0.45) - helmetK) * (1 - Math.exp(-dt * 4));
      // Working harder is heard as the pack sitting a little louder, not as
      // air. Out in the open there is no pack, so there is nothing to hear.
      fanGain.gain.setTargetAtTime((0.026 + exertion * 0.012) * helmetK, ctx.currentTime, 0.2);
    },
    step(hard) {
      one((c, m) => {
        const g = c.createGain();
        const level = 0.05 + hard * 0.25;
        g.gain.setValueAtTime(level, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12 + hard * 0.25);
        g.connect(m);
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(70 + hard * 30, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(35, c.currentTime + 0.15);
        o.connect(g); o.start(); o.stop(c.currentTime + 0.4);
        if (noise) {
          const n = c.createBufferSource(); n.buffer = noise;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300 + hard * 400;
          const ng = c.createGain(); ng.gain.setValueAtTime(level * 0.6, c.currentTime); ng.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08 + hard * 0.1);
          n.connect(lp); lp.connect(ng); ng.connect(m); n.start(); n.stop(c.currentTime + 0.3);
        }
      });
    },
    bleep() {
      one((c, m) => {
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.08, c.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
        g.connect(m);
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(1240, c.currentTime);
        o.frequency.setValueAtTime(1660, c.currentTime + 0.08);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        o.connect(lp); lp.connect(g); o.start(); o.stop(c.currentTime + 0.2);
      });
    },
    thump(distance) {
      one((c, m) => {
        const g = c.createGain();
        const level = 0.9 * Math.max(0.06, 1 - distance / 170);
        g.gain.setValueAtTime(level, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.6);
        g.connect(m);
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(54, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(22, c.currentTime + 1.3);
        o.connect(g); o.start(); o.stop(c.currentTime + 1.6);
        if (noise) {
          const n = c.createBufferSource(); n.buffer = noise;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
          const ng = c.createGain(); ng.gain.setValueAtTime(level * 0.7, c.currentTime); ng.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
          n.connect(lp); lp.connect(ng); ng.connect(m); n.start(); n.stop(c.currentTime + 0.7);
        }
      });
    },
    drill(load, running) {
      if (!ctx || !master) return;
      if (!drillOsc && running) {
        try {
          drillOsc = ctx.createOscillator();
          drillOsc.type = 'sawtooth';
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 420;
          drillGain = ctx.createGain();
          drillGain.gain.value = 0;
          drillOsc.connect(lp); lp.connect(drillGain); drillGain.connect(master);
          drillOsc.start();
        } catch { drillOsc = null; }
      }
      if (!drillOsc || !drillGain) return;
      drillOsc.frequency.setTargetAtTime(62 + load * 70, ctx.currentTime, 0.08);
      drillGain.gain.setTargetAtTime(running ? 0.025 + load * 0.06 : 0, ctx.currentTime, 0.1);
    },
    motor(load, running) {
      // Felt through the seat and the suit: a low whine with the ground under
      // it, never the airborne motor sound a driver on Earth would hear.
      const b = bed('motor', running, (c, m) => {
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 44;
        const grind = noiseBed(c, 'lowpass', 150, 0.7);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 190;
        const gain = c.createGain();
        gain.gain.value = 0;
        osc.connect(lp); lp.connect(gain); grind.gain.connect(gain); gain.connect(m);
        grind.gain.gain.value = 0.35;
        osc.start();
        return { gain, tune: (k) => { if (ctx) osc.frequency.setTargetAtTime(38 + k * 74, ctx.currentTime, 0.15); } };
      });
      if (!b) return;
      b.tune?.(Math.min(1, Math.max(0, load)));
      ramp(b, running ? 0.02 + Math.min(1, Math.max(0, load)) * 0.055 : 0, 0.15);
    },
    engine(throttle) {
      // The descent engine has no air to shout through either: what reaches
      // the crew is the frame shaking under them.
      const k = Math.min(1, Math.max(0, throttle));
      const b = bed('engine', k > 0.01, (c, m) => {
        const low = c.createOscillator();
        low.type = 'sine';
        low.frequency.value = 38;
        const rumble = noiseBed(c, 'lowpass', 220, 0.6);
        const gain = c.createGain();
        gain.gain.value = 0;
        low.connect(gain); rumble.gain.connect(gain); gain.connect(m);
        rumble.gain.gain.value = 0.5;
        low.start();
        return { gain };
      });
      if (!b) return;
      ramp(b, k * 0.09, 0.08);
    },
    jet(throttle) {
      // The pack is bolted to the suit, so unlike the descent engine its
      // roar is not a distant shake but the shell itself buzzing: a band of
      // noise the throttle pushes up in pitch, over a low pulse from the
      // pumps, and the valve's click as it lights.
      const k = Math.min(1, Math.max(0, throttle));
      const lit = k > 0.02;
      if (lit && !jetLit) {
        one((c, m) => {
          const t0 = c.currentTime;
          const g = c.createGain();
          g.gain.setValueAtTime(0.14, t0);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
          g.connect(m);
          if (noise) {
            const n = c.createBufferSource(); n.buffer = noise;
            const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
            n.connect(hp); hp.connect(g); n.start(t0); n.stop(t0 + 0.08);
          }
          const o = c.createOscillator();
          o.type = 'square';
          o.frequency.setValueAtTime(320, t0);
          o.frequency.exponentialRampToValueAtTime(90, t0 + 0.05);
          o.connect(g); o.start(t0); o.stop(t0 + 0.07);
        });
      }
      jetLit = lit;
      const b = bed('jet', lit, (c, m) => {
        const roar = noiseBed(c, 'bandpass', 420, 0.6);
        const pulse = c.createOscillator();
        pulse.type = 'triangle';
        pulse.frequency.value = 52;
        const pulseLp = c.createBiquadFilter();
        pulseLp.type = 'lowpass'; pulseLp.frequency.value = 160;
        const pulseGain = c.createGain();
        pulseGain.gain.value = 0.4;
        const gain = c.createGain();
        gain.gain.value = 0;
        roar.gain.gain.value = 1;
        roar.gain.connect(gain);
        pulse.connect(pulseLp); pulseLp.connect(pulseGain); pulseGain.connect(gain);
        gain.connect(m);
        pulse.start();
        return {
          gain,
          tune: (q) => {
            if (!ctx) return;
            roar.filter.frequency.setTargetAtTime(380 + q * 720, ctx.currentTime, 0.06);
            pulse.frequency.setTargetAtTime(44 + q * 30, ctx.currentTime, 0.1);
          },
        };
      });
      if (!b) return;
      b.tune?.(k);
      ramp(b, k * 0.11, 0.06);
    },
    hiss(k) {
      // Only while the chamber has air in it: in vacuum this is silence.
      const level = Math.min(1, Math.max(0, k));
      const b = bed('hiss', level > 0.01, (c, m) => {
        const air = noiseBed(c, 'bandpass', 1700, 0.7);
        air.gain.connect(m);
        return { gain: air.gain };
      });
      if (!b) return;
      ramp(b, level * 0.06, 0.12);
    },
    hum(k) {
      // A live deck: pumps, fans, a transformer somewhere behind the wall.
      const level = Math.min(1, Math.max(0, k));
      const b = bed('hum', level > 0.01, (c, m) => {
        const gain = c.createGain();
        gain.gain.value = 0;
        gain.connect(m);
        for (const [f, g] of [[58, 0.6], [116, 0.25], [174, 0.12]] as const) {
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const og = c.createGain();
          og.gain.value = g;
          o.connect(og); og.connect(gain);
          o.start();
        }
        const air = noiseBed(c, 'bandpass', 420, 0.4);
        air.gain.gain.value = 0.18;
        air.gain.connect(gain);
        return { gain };
      });
      if (!b) return;
      ramp(b, level * 0.035, 0.4);
    },
    chatter() {
      // Carrier, a couple of syllables in the vocoder band, carrier off.
      one((c, m) => {
        const t0 = c.currentTime;
        const env = c.createGain();
        env.gain.value = 0;
        env.connect(m);
        if (noise) {
          const n = c.createBufferSource();
          n.buffer = noise;
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1;
          const ng = c.createGain();
          ng.gain.setValueAtTime(0.05, t0);
          ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62);
          n.connect(bp); bp.connect(ng); ng.connect(m);
          n.start(t0); n.stop(t0 + 0.7);
        }
        const o = c.createOscillator();
        o.type = 'square';
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 2.2;
        o.connect(bp); bp.connect(env);
        // Three clipped syllables, each a step apart: speech, not a tune.
        const syllables = [[0.02, 0.13, 620], [0.2, 0.15, 520], [0.42, 0.12, 700]] as const;
        for (const [at, len, hz] of syllables) {
          o.frequency.setValueAtTime(hz, t0 + at);
          env.gain.setValueAtTime(0.0001, t0 + at);
          env.gain.exponentialRampToValueAtTime(0.045, t0 + at + 0.02);
          env.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        }
        o.start(t0); o.stop(t0 + 0.62);
        o.onended = () => { o.disconnect(); bp.disconnect(); env.disconnect(); };
      });
    },
    dispose() {
      unsubscribe();
      beds.clear();
      if (ctx) void ctx.close();
      ctx = null;
    },
  };
}
