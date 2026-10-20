// The sound of Level 0, synthesised: the mains hum of a thousand ballasts at
// 60 Hz and its harmonics with a buzz riding on top, the click of a tube that
// will not strike, damp carpet under a boot, your own breathing once the
// helmet is off, and far away, now and then, a thump that has no reason.
// Radio static for a set that hears nothing. On the surface near the
// sinkhole the same hum leaks faintly into the comms. The one sound switch
// silences all of it.

import { onSoundChange, soundLevel } from '@/lib/solar-system/sound-prefs';

const MASTER_GAIN = 0.2;

export interface BackroomsAudio {
  start: () => void;
  /** Hum level 0…1 and how much of it comes through the suit radio instead of the air (0 air, 1 radio). */
  hum: (level: number, radio: number) => void;
  /** Exertion drives breathing; `open` is helmet off. */
  breathe: (dt: number, exertion: number, open: boolean) => void;
  step: (hard: number, wet: number) => void;
  flick: () => void;
  thump: () => void;
  statics: (seconds: number) => void;
  dispose: () => void;
}

export function makeBackroomsAudio(): BackroomsAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let humGain: GainNode | null = null;
  let humFilter: BiquadFilterNode | null = null;
  let breathGain: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let breathT = 0;
  let rate = 0.25;
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
        humGain = ctx.createGain();
        humGain.gain.value = 0;
        humFilter = ctx.createBiquadFilter();
        humFilter.type = 'lowpass';
        humFilter.frequency.value = 6000;
        humGain.connect(humFilter);
        humFilter.connect(master);
        for (const [f, g, type] of [[60, 0.5, 'sine'], [120, 0.32, 'sine'], [180, 0.14, 'triangle'], [240, 0.08, 'sine'], [360, 0.03, 'sine']] as const) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = f;
          const og = ctx.createGain();
          og.gain.value = g;
          o.connect(og); og.connect(humGain);
          o.start();
        }
        // The ballast buzz: a thin sawtooth through a narrow band, wobbling a little.
        const buzz = ctx.createOscillator();
        buzz.type = 'sawtooth';
        buzz.frequency.value = 120;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass'; band.frequency.value = 2400; band.Q.value = 6;
        const bg = ctx.createGain();
        bg.gain.value = 0.05;
        const wob = ctx.createOscillator();
        wob.frequency.value = 0.23;
        const wg = ctx.createGain();
        wg.gain.value = 0.03;
        wob.connect(wg); wg.connect(bg.gain);
        buzz.connect(band); band.connect(bg); bg.connect(humGain);
        buzz.start(); wob.start();
        const breath = ctx.createBufferSource();
        breath.buffer = noise; breath.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
        breathGain = ctx.createGain();
        breathGain.gain.value = 0;
        breath.connect(bp); bp.connect(breathGain); breathGain.connect(master);
        breath.start();
      }
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      ctx = null;
    }
  };
  const one = (fn: (c: AudioContext, m: GainNode, n: AudioBuffer) => void) => {
    if (!ctx || !master || !noise) return;
    try { fn(ctx, master, noise); } catch { /* silent */ }
  };
  const burst = (c: AudioContext, m: GainNode, n: AudioBuffer, type: BiquadFilterType, freq: number, q: number, level: number, length: number, offset = 0) => {
    const src = c.createBufferSource();
    src.buffer = n;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t0 = c.currentTime + offset;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    src.connect(f); f.connect(g); g.connect(m);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + length + 0.05);
    return f;
  };

  return {
    start,
    hum(level, radio) {
      if (!ctx || !humGain || !humFilter) return;
      humGain.gain.setTargetAtTime(level * 0.55, ctx.currentTime, 0.4);
      humFilter.frequency.setTargetAtTime(radio > 0.5 ? 420 : 6000, ctx.currentTime, 0.3);
    },
    breathe(dt, exertion, open) {
      if (!ctx || !breathGain) return;
      rate += ((0.26 + exertion * 0.6) - rate) * (1 - Math.exp(-dt * 0.6));
      breathT += dt * rate;
      const ph = breathT % 1;
      const env = ph < 0.4 ? Math.sin(ph / 0.4 * Math.PI) : ph < 0.85 ? Math.sin((ph - 0.4) / 0.45 * Math.PI) * 0.7 : 0;
      breathGain.gain.setTargetAtTime(open ? env * (0.03 + exertion * 0.1) : 0, ctx.currentTime, 0.05);
    },
    step(hard, wet) {
      one((c, m, n) => {
        // The boot: a dull, short thud into a pad of carpet.
        burst(c, m, n, 'lowpass', 180 + hard * 120, 0.7, 0.12 + hard * 0.25, 0.1 + hard * 0.08);
        // The squelch: water pressed out of the pile, a quick rising hiss.
        if (wet > 0.05) {
          const f = burst(c, m, n, 'bandpass', 900, 3, 0.02 + wet * 0.08, 0.18 + wet * 0.12, 0.03);
          f.frequency.setValueAtTime(700, c.currentTime + 0.03);
          f.frequency.exponentialRampToValueAtTime(1900, c.currentTime + 0.2);
        }
      });
    },
    flick() {
      one((c, m, n) => {
        burst(c, m, n, 'highpass', 3000, 0.7, 0.05, 0.03);
        burst(c, m, n, 'highpass', 2600, 0.7, 0.035, 0.03, 0.07);
      });
    },
    thump() {
      one((c, m, n) => {
        // Far off through a lot of rooms: all low, a slow tail, a second softer one.
        for (const [delay, level] of [[0, 0.5], [0.42, 0.18]] as const) {
          const t0 = c.currentTime + delay;
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(48, t0);
          o.frequency.exponentialRampToValueAtTime(26, t0 + 1.1);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(level, t0 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
          o.connect(g); g.connect(m);
          o.start(t0); o.stop(t0 + 1.7);
          burst(c, m, n, 'lowpass', 110, 0.8, level * 0.5, 0.7, delay);
        }
      });
    },
    statics(seconds) {
      one((c, m, n) => {
        const src = c.createBufferSource();
        src.buffer = n; src.loop = true;
        const f = c.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 0.9;
        const g = c.createGain();
        const t0 = c.currentTime;
        g.gain.setValueAtTime(0.0001, t0);
        // A set searching: static that breaks up in bursts.
        for (let k = 0; k < seconds * 12; k++) g.gain.setValueAtTime(Math.random() < 0.7 ? 0.05 + Math.random() * 0.05 : 0.004, t0 + k / 12);
        g.gain.setValueAtTime(0.0001, t0 + seconds);
        src.connect(f); f.connect(g); g.connect(m);
        src.start(t0); src.stop(t0 + seconds + 0.05);
      });
    },
    dispose() {
      unsubscribe();
      if (ctx) void ctx.close();
      ctx = null;
    },
  };
}
