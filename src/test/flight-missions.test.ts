// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DISCOVERIES, HELIOPAUSE_SCENE, makeMissionTracker, type MissionContext } from '@/lib/solar-system/flight-missions';

const ctx = (over: Partial<MissionContext> = {}): MissionContext => ({
  nearId: '', altRadii: 99, sunDist: 1, speedFrac: 0, mode: 'cruise', systemName: 'sol',
  kills: 0, scanned: false, probeDist: Infinity, targetId: '', ...over,
});

describe('expedition log', () => {
  beforeEach(() => localStorage.clear());

  it('has a unique id and a name in both languages for every discovery', async () => {
    const en = (await import('@/messages/en.json')).default as { solarSystem: { flight: { discoveries: Record<string, { title: string; fact: string }> } } };
    const ka = (await import('@/messages/ka.json')).default as { solarSystem: { flight: { discoveries: Record<string, { title: string; fact: string }> } } };
    const ids = DISCOVERIES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(en.solarSystem.flight.discoveries[id]?.title, `en ${id}`).toBeTruthy();
      expect(ka.solarSystem.flight.discoveries[id]?.title, `ka ${id}`).toBeTruthy();
    }
  });

  it('unlocks one discovery per frame and then waits before the next', () => {
    const m = makeMissionTracker();
    // Close to the Moon, target the ISS in Earth's orbit: two are earned at once.
    const c = ctx({ nearId: 'moon', altRadii: 0.5, mode: 'jump' });
    expect(m.tick(c, 0.016)).toBe('moonPass');
    expect(m.tick(c, 0.016)).toBe('');
    expect(m.tick(c, 3)).toBe('');
    // The tick that runs the cooldown out still returns nothing; the next one unlocks.
    expect(m.tick(c, 3.1)).toBe('');
    expect(m.tick(c, 0.016)).toBe('lightSpeed');
    expect(m.count()).toBe(2);
    expect(m.has('moonPass')).toBe(true);
  });

  it('remembers across sessions and survives a corrupt store', () => {
    const m = makeMissionTracker();
    m.tick(ctx({ sunDist: HELIOPAUSE_SCENE + 1 }), 0.016);
    expect(JSON.parse(localStorage.getItem('stellar_expedition_log')!)).toEqual(['heliopause']);
    expect(makeMissionTracker().has('heliopause')).toBe(true);
    localStorage.setItem('stellar_expedition_log', '{not json');
    const fresh = makeMissionTracker();
    expect(fresh.count()).toBe(0);
    expect(fresh.total).toBe(DISCOVERIES.length);
    localStorage.setItem('stellar_expedition_log', JSON.stringify([1, null, 'marsVisit']));
    expect(makeMissionTracker().count()).toBe(1);
  });

  it('keeps Earth orbit above the surface and the probe within reach', () => {
    const m = makeMissionTracker();
    expect(m.tick(ctx({ nearId: 'earth', altRadii: 0.1 }), 0.016)).toBe('');
    expect(m.tick(ctx({ nearId: 'earth', altRadii: 0.5 }), 0.016)).toBe('earthOrbit');
    const p = makeMissionTracker();
    expect(p.tick(ctx({ probeDist: 0.5 }), 0.016)).toBe('');
    expect(p.tick(ctx({ probeDist: 0.05 }), 0.016)).toBe('probeFound');
  });
});
