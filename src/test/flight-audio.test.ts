// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFlightAudio } from '@/lib/solar-system/flight-audio';
import { makeSuitAudio } from '@/lib/solar-system/moon-audio';
import { onSoundChange, setSoundOn, soundOn } from '@/lib/solar-system/sound-prefs';

/** A stand-in for Web Audio: every node is a Proxy that accepts any call
 *  and hands back more of itself, and the pieces the code reads (gain,
 *  frequency, state, currentTime) are real enough to assert on. */
function fakeAudio() {
  const created: string[] = [];
  const gains: { value: number; targets: number[] }[] = [];
  const param = () => {
    const p = { value: 0, targets: [] as number[] };
    return new Proxy(p, {
      get(t, k) {
        if (typeof k === 'string' && k in t) return t[k as keyof typeof t];
        if (k === 'setTargetAtTime') return (v: number) => { t.targets.push(v); };
        return () => undefined;
      },
    });
  };
  const node = (kind: string): unknown => {
    created.push(kind);
    const self: Record<string, unknown> = {
      connect: () => self,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
    };
    if (kind === 'gain') gains.push(self.gain as { value: number; targets: number[] });
    return new Proxy(self, {
      get(t, k) {
        if (typeof k === 'string' && k in t) return t[k];
        return () => undefined;
      },
      set(t, k, v) { t[k as string] = v; return true; },
    });
  };
  class FakeContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 48000;
    destination = node('destination');
    closed = false;
    suspended = 0;
    resumed = 0;
    createGain() { return node('gain'); }
    createOscillator() { return node('osc'); }
    createBiquadFilter() { return node('filter'); }
    createBufferSource() { return node('source'); }
    createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
    resume() { this.resumed += 1; return Promise.resolve(); }
    suspend() { this.suspended += 1; this.state = 'suspended'; return Promise.resolve(); }
    close() { this.closed = true; return Promise.resolve(); }
  }
  const contexts: FakeContext[] = [];
  const Ctor = new Proxy(FakeContext, { construct(T) { const c = new T(); contexts.push(c); return c; } });
  return { Ctor, created, gains, contexts };
}

describe('sound preference', () => {
  beforeEach(() => { localStorage.clear(); setSoundOn(true); });
  it('defaults to on, persists off, and tells listeners', () => {
    expect(soundOn()).toBe(true);
    const heard: boolean[] = [];
    const off = onSoundChange((v) => heard.push(v));
    setSoundOn(false);
    expect(soundOn()).toBe(false);
    expect(localStorage.getItem('stellar_sound')).toBe('off');
    setSoundOn(true);
    expect(localStorage.getItem('stellar_sound')).toBeNull();
    off();
    setSoundOn(false);
    expect(heard).toEqual([false, true]);
  });
});

describe('flight audio', () => {
  let fake: ReturnType<typeof fakeAudio>;
  beforeEach(() => {
    localStorage.clear();
    setSoundOn(true);
    fake = fakeAudio();
    vi.stubGlobal('AudioContext', fake.Ctor);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays every cue without throwing and builds one context', () => {
    const a = makeFlightAudio();
    a.launch(); a.laser(); a.boom(); a.whoosh(); a.arrive(); a.charge(3); a.stopCharge();
    a.discovery(); a.hit(true); a.hit(false); a.warn(); a.confirm();
    expect(fake.contexts).toHaveLength(1);
    expect(fake.created.filter((k) => k === 'osc').length).toBeGreaterThan(10);
    a.dispose();
    expect(fake.contexts[0].closed).toBe(true);
  });

  it('is silent until asked and stays cheap when far from the black hole', () => {
    const a = makeFlightAudio();
    a.drone(0);
    expect(fake.contexts).toHaveLength(0);
    a.drone(0.5);
    expect(fake.contexts).toHaveLength(1);
    const oscBefore = fake.created.filter((k) => k === 'osc').length;
    a.drone(0.5);
    a.drone(0.9);
    a.drone(0);
    expect(fake.created.filter((k) => k === 'osc').length).toBe(oscBefore);
    a.dispose();
  });

  it('opens muted when the switch is off and follows it afterwards', () => {
    setSoundOn(false);
    const a = makeFlightAudio();
    a.laser();
    const master = fake.gains[0];
    expect(master.value).toBe(0);
    setSoundOn(true);
    expect(master.targets.at(-1)).toBeGreaterThan(0);
    setSoundOn(false);
    expect(master.targets.at(-1)).toBe(0);
    a.dispose();
    setSoundOn(true);
    // Disposed: no longer listening.
    expect(master.targets.at(-1)).toBe(0);
  });

  it('folds two hits inside the same instant into one', () => {
    const a = makeFlightAudio();
    a.hit(false);
    const n = fake.created.length;
    a.hit(false);
    expect(fake.created.length).toBe(n);
    fake.contexts[0].currentTime = 1;
    a.hit(false);
    expect(fake.created.length).toBeGreaterThan(n);
    a.dispose();
  });

  it('holds the context while paused and lets it go on resume', () => {
    const a = makeFlightAudio();
    a.setPaused(true);
    expect(fake.contexts).toHaveLength(0);
    a.setPaused(false);
    a.laser();
    a.setPaused(true);
    expect(fake.contexts[0].suspended).toBe(1);
    a.setPaused(false);
    expect(fake.contexts[0].resumed).toBeGreaterThanOrEqual(1);
    a.dispose();
  });

  it('stays silent, not broken, where Web Audio is missing', () => {
    vi.stubGlobal('AudioContext', undefined);
    const a = makeFlightAudio();
    expect(() => { a.launch(); a.boom(); a.drone(1); a.setPaused(true); a.dispose(); }).not.toThrow();
  });
});

describe('suit audio', () => {
  let fake: ReturnType<typeof fakeAudio>;
  beforeEach(() => {
    localStorage.clear();
    setSoundOn(true);
    fake = fakeAudio();
    vi.stubGlobal('AudioContext', fake.Ctor);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing before the first gesture, then plays every cue', () => {
    const s = makeSuitAudio();
    s.step(1); s.bleep(); s.milestone(); s.update(0.016, 0.5, true);
    expect(fake.contexts).toHaveLength(0);
    s.start();
    s.step(1); s.bleep(); s.thump(10); s.milestone(); s.drill(0.5, true); s.drill(0, false); s.update(0.016, 0.5, true);
    expect(fake.contexts).toHaveLength(1);
    s.dispose();
    expect(fake.contexts[0].closed).toBe(true);
  });

  it('respects the sound switch', () => {
    setSoundOn(false);
    const s = makeSuitAudio();
    s.start();
    expect(fake.gains[0].value).toBe(0);
    setSoundOn(true);
    expect(fake.gains[0].targets.at(-1)).toBeGreaterThan(0);
    s.dispose();
  });
});
