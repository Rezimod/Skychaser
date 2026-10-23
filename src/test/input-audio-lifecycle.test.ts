// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachSurfaceControls, type FootInputs } from '@/game/surface-controls';
import { attachDesktopControls } from '@/lib/solar-system/flight-input';
import { createFlightSession } from '@/lib/solar-system/player-ship';
import { makeFlightAudio } from '@/lib/solar-system/flight-audio';
import { makeCityAmbience } from '@/lib/solar-system/world-earth-audio';
import { setSoundOn, setSoundPaused } from '@/lib/solar-system/sound-prefs';

const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, ...init }));

const footInputs = (): FootInputs => ({
  moveX: 0, moveY: 0, jump: false, run: false, sprint: false, walk: false, crouch: false, use: false, throttle: 0,
  orbitDX: 0, orbitDY: 0, zoom: 0, interact: false, viewToggle: false, viewCycle: false, headlamp: false, shoulderSwap: false,
});

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('flight keys', () => {
  afterEach(() => setHidden(false));

  it('a key still held after re-attach (only repeats) thrusts; one-shots wait for a fresh stroke', () => {
    const session = createFlightSession();
    const detach = attachDesktopControls(session, document.createElement('div'), () => undefined);
    key('keydown', 'KeyW', { repeat: true });
    expect(session.input.thrust).toBe(1);
    key('keydown', 'KeyC', { repeat: true });
    expect(session.input.viewToggle).toBe(false);
    key('keyup', 'KeyW');
    expect(session.input.thrust).toBe(0);
    detach();
  });

  it('a Cmd chord, or hiding the page, lets go of every held key', () => {
    const session = createFlightSession();
    const detach = attachDesktopControls(session, document.createElement('div'), () => undefined);
    key('keydown', 'KeyW');
    expect(session.input.thrust).toBe(1);
    key('keydown', 'MetaLeft', { metaKey: true });
    expect(session.input.thrust).toBe(0);
    key('keydown', 'KeyW');
    key('keydown', 'KeyD');
    setHidden(true);
    expect(session.input.thrust).toBe(0);
    expect(session.input.yaw).toBe(0);
    detach();
  });
});

describe('surface keys', () => {
  it('a held key that only repeats still walks, and a repeat presses nothing', () => {
    const input = footInputs();
    const c = attachSurfaceControls({ mount: document.createElement('div'), input, touch: false, paused: () => false, wake: () => undefined, onCrouch: () => undefined, onPauseRequest: () => undefined, selectable: '.help' });
    key('keydown', 'KeyW', { repeat: true });
    expect(input.moveY).toBe(1);
    key('keydown', 'KeyE', { repeat: true });
    expect(input.interact).toBe(false);
    key('keyup', 'KeyW');
    expect(input.moveY).toBe(0);
    c.detach();
  });

  it('Cmd held loses the keyup on macOS, so any Cmd event lets go of all', () => {
    const input = footInputs();
    const c = attachSurfaceControls({ mount: document.createElement('div'), input, touch: false, paused: () => false, wake: () => undefined, onCrouch: () => undefined, onPauseRequest: () => undefined, selectable: '.help' });
    key('keydown', 'KeyW');
    key('keydown', 'KeyA', { metaKey: true });
    expect(input.moveY).toBe(0);
    key('keydown', 'KeyW');
    key('keyup', 'MetaLeft');
    expect(input.moveY).toBe(0);
    c.detach();
  });
});

describe('audio lifecycle', () => {
  class Ctx {
    state: string = 'running';
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    suspends = 0;
    resumes = 0;
    closes = 0;
    node(): unknown {
      const p: Record<string, unknown> = {};
      const self: unknown = new Proxy(p, {
        get: (t, k) => {
          if (k in t) return t[k as string];
          if (k === 'gain' || k === 'frequency' || k === 'Q' || k === 'detune' || k === 'playbackRate') return new Proxy({}, { get: () => () => undefined });
          if (k === 'connect') return () => self;
          return () => undefined;
        },
      });
      return self;
    }
    createGain() { return this.node(); }
    createOscillator() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createBufferSource() { return this.node(); }
    createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
    resume() { this.resumes += 1; this.state = 'running'; return Promise.reject(new Error('not allowed')); }
    suspend() { this.suspends += 1; this.state = 'suspended'; return Promise.reject(new Error('nope')); }
    close() { this.closes += 1; this.state = 'closed'; return Promise.reject(new Error('gone')); }
  }
  let made: Ctx[];
  const unhandled = vi.fn();
  beforeEach(() => {
    made = [];
    setSoundOn(true);
    vi.stubGlobal('AudioContext', class extends Ctx { constructor() { super(); made.push(this); } });
    process.on('unhandledRejection', unhandled);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.off('unhandledRejection', unhandled);
    setSoundPaused(false);
    setHidden(false);
  });

  it('suspends a surface context while hidden or paused and resumes it after, swallowing refusals', async () => {
    const a = makeCityAmbience();
    a.start();
    const c = made[0];
    setHidden(true);
    expect(c.suspends).toBe(1);
    setHidden(false);
    expect(c.resumes).toBe(1);
    setSoundPaused(true);
    expect(c.suspends).toBe(2);
    a.start(); // a tap on the pause menu must not wake it
    expect(c.resumes).toBe(1);
    setSoundPaused(false);
    expect(c.resumes).toBe(2);
    // iOS after a phone call.
    c.state = 'interrupted';
    a.start();
    expect(c.resumes).toBe(3);
    a.dispose();
    expect(c.closes).toBe(1);
    setHidden(true);
    expect(c.suspends).toBe(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('flight: a charge stopped twice does not throw, and pause suspends', async () => {
    const a = makeFlightAudio();
    a.charge(2);
    a.stopCharge();
    a.charge(2);
    a.whoosh();
    a.setPaused(true);
    expect(made[0].suspends).toBe(1);
    a.setPaused(false);
    expect(made[0].resumes).toBe(1);
    a.dispose();
    expect(made[0].closes).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).not.toHaveBeenCalled();
  });
});
