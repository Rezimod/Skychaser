// The Explore game's connection to the platform: what a record is worth, and
// how a record reaches the wallet — once, and not lost while signed out.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  localRewardSink, memoryRewardSink, syncedRewardSink, MISSION_ACHIEVEMENTS, OBJECTIVE_ACHIEVEMENTS,
  type Achievement, type AchievementSubmit,
} from '@/lib/solar-system/achievements';
import {
  EXPLORE_ACHIEVEMENT_IDS, EXPLORE_ACHIEVEMENT_STARS, EXPLORE_MAX_STARS,
  exploreLedgerGame, exploreLedgerTarget, exploreStarsFor, isExploreAchievement,
} from '@/lib/games/explore';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe('the catalogue', () => {
  it('prices every record the Moon can write', () => {
    for (const id of [...Object.values(MISSION_ACHIEVEMENTS), ...Object.values(OBJECTIVE_ACHIEVEMENTS)]) {
      expect(isExploreAchievement(id), id).toBe(true);
      expect(exploreStarsFor(id), id).toBeGreaterThan(0);
    }
  });

  it('prices nothing it does not know', () => {
    expect(isExploreAchievement('explore.moon_cheese')).toBe(false);
    expect(isExploreAchievement(42)).toBe(false);
    expect(isExploreAchievement('__proto__')).toBe(false);
    expect(exploreStarsFor('constructor')).toBe(0);
  });

  it('adds up to the figure the cards advertise', () => {
    const sum = EXPLORE_ACHIEVEMENT_IDS.reduce((a, id) => a + EXPLORE_ACHIEVEMENT_STARS[id], 0);
    expect(EXPLORE_MAX_STARS).toBe(sum);
    expect(EXPLORE_MAX_STARS).toBe(95);
  });

  it('names ledger rows per achievement, never per day', () => {
    expect(exploreLedgerTarget('explore.first_steps')).toBe('game:explore:explore.first_steps');
    expect(exploreLedgerGame('explore.first_steps')).toBe('explore:explore.first_steps');
  });
});

describe('the synced sink', () => {
  it('reports a new record and remembers that it was credited', async () => {
    const submit = vi.fn<AchievementSubmit>(async () => true);
    const sink = syncedRewardSink(memoryRewardSink(() => 1), submit);
    expect(sink.record('explore.first_steps')).toBe(true);
    await flushMicrotasks();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0]).toMatchObject({ id: 'explore.first_steps', at: 1 });
    expect(sink.credited()).toEqual(['explore.first_steps']);
    await sink.flush();
    expect(submit).toHaveBeenCalledOnce();
  });

  it('does not report a record it already holds', async () => {
    const submit = vi.fn<AchievementSubmit>(async () => true);
    const local = memoryRewardSink();
    local.record('explore.power_restored');
    const sink = syncedRewardSink(local, submit);
    expect(sink.record('explore.power_restored')).toBe(false);
    await flushMicrotasks();
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps a record the platform could not take and tries again on the next flush', async () => {
    let online = false;
    const submit = vi.fn<AchievementSubmit>(async () => online);
    const sink = syncedRewardSink(memoryRewardSink(), submit);
    sink.record('explore.comms_restored');
    await flushMicrotasks();
    expect(submit).toHaveBeenCalledOnce();
    expect(sink.credited()).toEqual([]);
    online = true;
    await sink.flush();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(sink.credited()).toEqual(['explore.comms_restored']);
  });

  it('treats a report that throws as one to try again', async () => {
    const submit = vi.fn<AchievementSubmit>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    const sink = syncedRewardSink(memoryRewardSink(), submit);
    sink.record('explore.lunar_geology');
    await flushMicrotasks();
    expect(sink.credited()).toEqual([]);
    await sink.flush();
    expect(sink.credited()).toEqual(['explore.lunar_geology']);
  });

  it('reports records made before the player signed in, once they have', async () => {
    // Earlier session, signed out: the local sink alone.
    localRewardSink(() => 5).record('explore.first_steps');
    localRewardSink(() => 6).record('explore.earthrise_photo');
    const submit = vi.fn<AchievementSubmit>(async () => true);
    const sink = syncedRewardSink(localRewardSink(), submit);
    await sink.flush();
    expect(submit.mock.calls.map((c) => c[0].id).sort()).toEqual(['explore.earthrise_photo', 'explore.first_steps']);
    // Next visit: what was credited is remembered on the device.
    const again = syncedRewardSink(localRewardSink(), submit);
    await again.flush();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('skips what the platform says it already credited', async () => {
    const local = memoryRewardSink();
    local.record('explore.first_steps');
    local.record('explore.power_restored');
    const submit = vi.fn<AchievementSubmit>(async () => true);
    const sink = syncedRewardSink(local, submit);
    sink.markCredited(['explore.first_steps']);
    await sink.flush();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0].id).toBe('explore.power_restored');
  });

  it('runs one flush at a time', async () => {
    let resolve: (v: boolean) => void = () => {};
    const submit = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    const sink = syncedRewardSink(memoryRewardSink(), submit);
    sink.record('explore.first_steps');
    const a = sink.flush();
    const b = sink.flush();
    expect(a).toBe(b);
    resolve(true);
    await a;
    expect(submit).toHaveBeenCalledOnce();
  });

  it('still plays when storage refuses the credited list', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const sink = syncedRewardSink(memoryRewardSink(), async () => true);
    expect(sink.record('explore.first_steps')).toBe(true);
    await flushMicrotasks();
    expect(sink.credited()).toEqual(['explore.first_steps']);
  });
});
