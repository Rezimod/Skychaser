// Achievement records: written once, kept across a reload, and never worth
// a network call. Plus the rules for what the Moon's glass shows.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  localRewardSink, memoryRewardSink, MISSION_ACHIEVEMENTS, OBJECTIVE_ACHIEVEMENTS,
} from '@/lib/solar-system/achievements';
import { MISSION_IDS } from '@/lib/solar-system/moon-missions';
import en from '@/messages/en.json';
import ka from '@/messages/ka.json';

const KEY = 'stellar_explore_achievements_v1';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('reward sink', () => {
  it('records one achievement per id', () => {
    const sink = memoryRewardSink(() => 1000);
    expect(sink.record('explore.power_restored')).toBe(true);
    expect(sink.record('explore.power_restored')).toBe(false);
    expect(sink.list()).toEqual([{ id: 'explore.power_restored', at: 1000 }]);
  });

  it('keeps a detail when one is given', () => {
    const sink = memoryRewardSink(() => 5);
    sink.record('explore.telescope_calibrated', 'jupiter');
    expect(sink.list()[0].detail).toBe('jupiter');
  });

  it('survives a reload', () => {
    localRewardSink(() => 42).record('explore.first_steps');
    expect(localRewardSink().list()).toEqual([{ id: 'explore.first_steps', at: 42 }]);
  });

  it('starts empty on nonsense in storage', () => {
    localStorage.setItem(KEY, '{not json');
    const sink = localRewardSink(() => 7);
    expect(sink.list()).toEqual([]);
    expect(sink.record('explore.comms_restored')).toBe(true);
  });

  it('drops entries that are not achievements', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'ok', at: 1 }, { id: 5 }, null, { at: 2 }]));
    expect(localRewardSink().list()).toEqual([{ id: 'ok', at: 1 }]);
  });

  it('plays on in a window that refuses to store', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const sink = localRewardSink(() => 3);
    expect(sink.record('explore.lunar_geology')).toBe(true);
    expect(sink.list()).toHaveLength(1);
  });

  it('has a record, and a name in both languages, for every mission', () => {
    const records: Record<string, string> = en.solarSystem.moon.missions.records;
    const kaRecords: Record<string, string> = ka.solarSystem.moon.missions.records;
    for (const id of MISSION_IDS) {
      const key = MISSION_ACHIEVEMENTS[id];
      expect(key, id).toBeTruthy();
      const slug = key.split('.').pop()!;
      expect(records[slug], slug).toBeTruthy();
      expect(kaRecords[slug], slug).toBeTruthy();
    }
    for (const key of Object.values(OBJECTIVE_ACHIEVEMENTS)) {
      const slug = key.split('.').pop()!;
      expect(records[slug], slug).toBeTruthy();
      expect(kaRecords[slug], slug).toBeTruthy();
    }
  });
});
