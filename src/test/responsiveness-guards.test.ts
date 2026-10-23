// The guards against a game that freezes or restarts: a load that can always
// be left, a pause that waits for the scene, GPU losses that back off, a
// compile that cannot hang, a frame loop that survives an error, and the
// approach that slows the ship over a world.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { game } from '@/game/state';
import { contextLosses, makeLoopGuard, noteContextLoss, rebuildWhenVisible, resetContextLosses } from '@/game/gpu-recovery';
import { settleWithin } from '@/lib/solar-system/gpu-warm';
import { approachSpeedCap, isLandable } from '@/lib/solar-system/flight-approach';
import { retryImport } from '@/game/retry-import';

describe('loads that can always be left', () => {
  beforeEach(() => { localStorage.clear(); game.reset(); });

  it('a pause asked for while loading comes up as the pause menu, not a held ship', () => {
    game.boot();
    game.start('orbit');
    game.pause();
    expect(game.get().state).toBe('loading');
    game.progress('ready');
    expect(game.get().state).toBe('paused');
    game.resume();
    expect(game.get().state).toBe('playing');
  });

  it('a pause that came before a travel does not carry into the next scene', () => {
    game.boot();
    game.start('orbit');
    game.pause();
    game.toTitle();
    game.start('moon');
    game.progress('ready');
    expect(game.get().state).toBe('playing');
  });

  it('travel says whether it happened', () => {
    game.boot();
    game.start('orbit');
    expect(game.travel('moon', { seamless: true })).toBe(false);
    game.progress('ready');
    expect(game.travel('moon', { seamless: true })).toBe(true);
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'moon', seamless: true });
  });

  it('a stuck handover shows its loader, and the way out goes to a fresh orbit, then the title', () => {
    game.boot();
    game.start('orbit');
    game.progress('ready');
    game.travel('earth', { seamless: true });
    game.unseam();
    expect(game.get().seamless).toBe(false);
    const gen = game.get().generation;
    game.rescue();
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'orbit', seamless: false });
    expect(game.get().generation).toBe(gen + 1);
    game.rescue();
    expect(game.get().state).toBe('title');
  });

  it('a world that failed starts again from a fresh orbit', () => {
    game.boot();
    game.start('mars');
    game.progress('ready');
    const gen = game.get().generation;
    game.recover();
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'orbit' });
    expect(game.get().generation).toBe(gen + 1);
  });

  it('the title can be reached from a load', () => {
    game.boot();
    game.start('earth');
    game.toTitle();
    expect(game.get().state).toBe('title');
  });
});

describe('GPU losses', () => {
  beforeEach(() => resetContextLosses());
  afterEach(() => vi.useRealTimers());

  it('back off, and are forgiven after a healthy stretch', () => {
    const t0 = 1_000_000;
    const delays = [noteContextLoss(t0), noteContextLoss(t0 + 5000), noteContextLoss(t0 + 9000), noteContextLoss(t0 + 15000), noteContextLoss(t0 + 20000)];
    expect(delays[0]).toBe(1000);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    expect(contextLosses()).toBe(5);
    expect(noteContextLoss(t0 + 20000 + 130_000)).toBe(1000);
    expect(contextLosses()).toBe(1);
  });

  it('a rebuild waits for the page to be visible', () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const fn = vi.fn();
    rebuildWhenVisible(fn, 1000);
    vi.advanceTimersByTime(1500);
    expect(fn).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fn).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });

  it('a cancelled rebuild never runs', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const cancel = rebuildWhenVisible(fn, 1000);
    cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('frame loops and compiles', () => {
  it('a loop that keeps failing asks for one rebuild; one bad frame does not', () => {
    const stuck = vi.fn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const g = makeLoopGuard('test', stuck, 5);
    g.fail(new Error('once'));
    g.ok();
    for (let i = 0; i < 4; i++) g.fail(new Error('again'));
    expect(stuck).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) g.fail(new Error('again'));
    expect(stuck).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('a compile that never settles lets the game go on after the limit', async () => {
    vi.useFakeTimers();
    const never = new Promise<number>(() => {});
    const p = settleWithin(never, 8000);
    vi.advanceTimersByTime(8000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('a compile that fails is settled, not thrown', async () => {
    await expect(settleWithin(Promise.reject(new Error('lost')), 1000)).resolves.toBeUndefined();
    await expect(settleWithin(Promise.resolve(3), 1000)).resolves.toBe(3);
  });

  it('a chunk that fails to load is asked for again', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const load = () => (++calls < 3 ? Promise.reject(new Error('ChunkLoadError')) : Promise.resolve('ok'));
    const p = retryImport(load, 3, 10);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe('ok');
    expect(calls).toBe(3);
    vi.useRealTimers();
  });
});

describe('the approach slows the ship', () => {
  it('only over the worlds there is a way down to', () => {
    for (const id of ['earth', 'moon', 'mars', 'jupiter', 'neptune']) expect(isLandable(id)).toBe(true);
    expect(isLandable('sun')).toBe(false);
    expect(isLandable('pluto')).toBe(false);
  });

  it('falls with the height and keeps a floor, so the dive is a glide', () => {
    expect(approachSpeedCap(1.2)).toBeCloseTo(0.12);
    expect(approachSpeedCap(0.5)).toBeLessThan(approachSpeedCap(1));
    expect(approachSpeedCap(0.05)).toBe(0.02);
    expect(approachSpeedCap(-1)).toBe(0.02);
  });
});
