import { beforeEach, describe, expect, it, vi } from 'vitest';
import { game, STAGE_PROGRESS } from '@/game/state';
import { readCheckpoint, writeCheckpoint } from '@/game/save';
import { defaultSettings, getSettings, resetSettings, updateSettings } from '@/game/settings';
import { settle } from '@/game/settle';
import { onSoundChange, setSoundOn, setSoundPaused, setSoundVolume, soundLevel, soundVolume } from '@/lib/solar-system/sound-prefs';

describe('game state machine', () => {
  beforeEach(() => { localStorage.clear(); game.reset(); });

  it('boots to the title, continues into a scene, and plays once the first frame is drawn', () => {
    const seen: string[] = [];
    const off = game.subscribe(() => seen.push(game.get().state));
    game.boot();
    expect(game.get().state).toBe('title');
    game.start('moon');
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'moon', stage: 'module' });
    game.progress('build');
    game.progress('compile');
    expect(game.get().stage).toBe('compile');
    expect(STAGE_PROGRESS.compile).toBeGreaterThan(STAGE_PROGRESS.build);
    game.progress('ready');
    expect(game.get().state).toBe('playing');
    expect(readCheckpoint()?.scene).toBe('moon');
    off();
    expect(seen).toEqual(['title', 'loading', 'loading', 'loading', 'playing']);
  });

  it('a deep link skips the title', () => {
    game.boot('mars');
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'mars' });
  });

  it('pauses only while playing, silences the mix, and resumes it', () => {
    game.boot('moon');
    game.pause();
    expect(game.get().state).toBe('loading');
    game.progress('ready');
    game.pause();
    expect(game.get().state).toBe('paused');
    expect(soundLevel()).toBe(0);
    game.openOverlay('settings');
    expect(game.get().overlay).toBe('settings');
    game.resume();
    expect(game.get()).toMatchObject({ state: 'playing', overlay: 'none' });
    expect(soundLevel()).toBe(1);
  });

  it('restart reloads the same scene with a new generation', () => {
    game.boot('moon');
    game.progress('ready');
    game.pause();
    const g = game.get().generation;
    game.restart();
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'moon', generation: g + 1 });
  });

  it('travel moves between scenes while playing, and exit is final', () => {
    game.boot('moon');
    game.progress('ready');
    game.travel('orbit');
    expect(game.get()).toMatchObject({ state: 'loading', scene: 'orbit' });
    game.progress('ready');
    game.exit();
    expect(game.get().state).toBe('exiting');
    game.pause();
    expect(game.get().state).toBe('exiting');
  });

  it('overlays open from the title and the pause menu only', () => {
    game.boot();
    game.openOverlay('missions');
    expect(game.get().overlay).toBe('missions');
    game.closeOverlay();
    game.start('moon');
    game.openOverlay('settings');
    expect(game.get().overlay).toBe('none');
  });
});

describe('checkpoint', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips a scene and rejects junk', () => {
    expect(readCheckpoint()).toBeNull();
    writeCheckpoint('proximaB');
    expect(readCheckpoint()?.scene).toBe('proximaB');
    localStorage.setItem('stellar_explore_save', JSON.stringify({ v: 1, scene: 'pluto' }));
    expect(readCheckpoint()).toBeNull();
    localStorage.setItem('stellar_explore_save', '{');
    expect(readCheckpoint()).toBeNull();
  });
});

describe('settings', () => {
  beforeEach(() => { localStorage.clear(); resetSettings(); });
  it('defaults, clamps, persists without the volume, and reads back', () => {
    expect(getSettings()).toEqual(defaultSettings());
    updateSettings({ sensitivity: 9, fov: 10, invertY: true, volume: 0.4 });
    expect(getSettings()).toMatchObject({ sensitivity: 3, fov: 45, invertY: true, volume: 0.4 });
    const stored = JSON.parse(localStorage.getItem('stellar_explore_settings')!);
    expect(stored).toEqual({ v: 1, quality: 'auto', sensitivity: 3, invertY: true, fov: 45 });
    expect(soundVolume()).toBe(0.4);
    resetSettings();
    expect(getSettings()).toEqual(defaultSettings());
    expect(localStorage.getItem('stellar_explore_settings')).toBeNull();
  });
  it('ignores a save from another version', () => {
    localStorage.setItem('stellar_explore_settings', JSON.stringify({ v: 0, sensitivity: 2 }));
    resetSettings();
    localStorage.setItem('stellar_explore_settings', JSON.stringify({ v: 0, sensitivity: 2 }));
    updateSettings({});
    expect(getSettings().sensitivity).toBe(1);
  });
});

describe('sound level', () => {
  beforeEach(() => { localStorage.clear(); setSoundOn(true); setSoundVolume(1); setSoundPaused(false); });
  it('is the volume, unless the switch is off or the game is paused', () => {
    const heard: number[] = [];
    const off = onSoundChange((_on, level) => heard.push(level));
    setSoundVolume(0.5);
    expect(soundLevel()).toBe(0.5);
    expect(localStorage.getItem('stellar_sound_level')).toBe('0.50');
    setSoundPaused(true);
    expect(soundLevel()).toBe(0);
    setSoundPaused(false);
    setSoundOn(false);
    expect(soundLevel()).toBe(0);
    expect(soundVolume()).toBe(0.5);
    off();
    expect(heard).toEqual([0.5, 0, 0.5, 0]);
  });
});

describe('settle', () => {
  it('waits for the frames and the minimum time, or for the deck to go idle', () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const rafs: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafs.push(cb); return rafs.length; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const step = () => { const cb = rafs.shift(); cb?.(now); };
    let frame = 0;
    let idle = false;
    const settled = vi.fn();
    settle({ minMs: 100, frames: 2, frame: () => frame, idle: () => idle, onSettled: settled });
    frame = 5; now = 50; step();
    expect(settled).not.toHaveBeenCalled();
    now = 120; step();
    expect(settled).toHaveBeenCalledTimes(1);
    frame = 0; now = 0;
    settle({ minMs: 10, frames: 2, frame: () => frame, idle: () => idle, onSettled: settled });
    now = 20; step();
    expect(settled).toHaveBeenCalledTimes(1);
    idle = true; step();
    expect(settled).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
});
