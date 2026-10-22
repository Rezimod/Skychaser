import { beforeEach, describe, expect, it } from 'vitest';
import { markRelocale, takeRelocale, writeCheckpoint, readCheckpoint } from '@/game/save';
import { missionStates } from '@/components/play/MissionsPanel';
import { resumableScene } from '@/components/play/TitleScreen';

describe('missions panel: the five Moon missions as the store has them', () => {
  it('a fresh crew has First Steps up next and the rest locked behind it', () => {
    expect(missionStates([], '')).toEqual([
      { id: 'firstSteps', state: 'next' },
      { id: 'power', state: 'locked' },
      { id: 'telescope', state: 'locked' },
      { id: 'comms', state: 'locked' },
      { id: 'expedition', state: 'locked' },
    ]);
  });

  it('power done opens both of the missions it unlocks; the active one is next', () => {
    const s = missionStates(['firstSteps', 'power'], 'comms');
    expect(s.map((m) => m.state)).toEqual(['done', 'done', 'open', 'next', 'locked']);
    // Without an active one, the first open mission is next.
    expect(missionStates(['firstSteps', 'power'], '').map((m) => m.state)).toEqual(['done', 'done', 'next', 'open', 'locked']);
  });

  it('an active id that is already done or unknown does not count as next', () => {
    expect(missionStates(['firstSteps'], 'firstSteps')[1]).toEqual({ id: 'power', state: 'next' });
    expect(missionStates([], 'nonsense')[0]).toEqual({ id: 'firstSteps', state: 'next' });
  });

  it('a mission waiting for its Academy lesson says so, and is never up next', () => {
    const gate = (id: string) => id !== 'power';
    const s = missionStates(['firstSteps'], 'power', gate);
    expect(s[1]).toEqual({ id: 'power', state: 'lesson' });
    expect(s.filter((m) => m.state === 'next')).toHaveLength(0);
    expect(missionStates([], '', () => false)[0]).toEqual({ id: 'firstSteps', state: 'lesson' });
  });

  it('everything done is five done', () => {
    expect(missionStates(['firstSteps', 'power', 'telescope', 'comms', 'expedition'], '').every((m) => m.state === 'done')).toBe(true);
  });
});

describe('title: continue from the checkpoint', () => {
  beforeEach(() => localStorage.clear());

  it('offers a surface, never orbit (Enter already opens it), and nothing without a save', () => {
    expect(resumableScene(readCheckpoint()?.scene)).toBeNull();
    writeCheckpoint('mars');
    expect(resumableScene(readCheckpoint()?.scene)).toBe('mars');
    writeCheckpoint('orbit');
    expect(resumableScene(readCheckpoint()?.scene)).toBeNull();
  });
});

describe('language switch mid-game', () => {
  beforeEach(() => sessionStorage.clear());

  it('the reload goes back to the scene being played, once', () => {
    markRelocale({ state: 'paused', scene: 'moon' });
    expect(takeRelocale()).toBe('moon');
    expect(takeRelocale()).toBeNull();
  });

  it('from the title there is nothing to go back to', () => {
    markRelocale({ state: 'playing', scene: 'orbit' });
    markRelocale({ state: 'title', scene: 'orbit' });
    expect(takeRelocale()).toBeNull();
  });

  it('a stale or forged value is refused', () => {
    sessionStorage.setItem('stellar_explore_relocale', 'pluto');
    expect(takeRelocale()).toBeNull();
  });
});
