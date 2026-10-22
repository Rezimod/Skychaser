// The gems on the device: what a pickup writes, what the menus read, what
// the old crystal save turns into, and what the platform sync is handed.
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GEM_INFO, GEM_WORLDS, gemLayout } from '@/lib/solar-system/gem-layout';
import {
  CRYSTALS_KEY, GEMS_KEY, gemSummary, legacyGemIds, loadGemSave, markGemsSent, mergeGems, onGemsChange, recordGem, unsentGems,
  worldGemProgress, type GemStore,
} from '@/lib/solar-system/gem-progress';
import { GEM_PICK_RANGE, gemGeometry, makeGems, resolveGem } from '@/lib/solar-system/world-gems';
import { resetGemSyncForTests, syncGems } from '@/lib/solar-system/gem-sync';

function memory(seed: Record<string, string> = {}): GemStore & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

describe('the gem save', () => {
  it('starts empty, keeps a pickup once, and refuses an id that is not in the layout', () => {
    const store = memory();
    expect(loadGemSave(store).worlds).toEqual({});
    const id = gemLayout('moon')[3].id;
    expect(recordGem('moon', id, store)).toBe(true);
    expect(recordGem('moon', id, store)).toBe(false);
    expect(recordGem('moon', 'g99', store)).toBe(false);
    expect(loadGemSave(store).worlds.moon).toEqual([id]);
  });

  it('tells its listeners about a pickup', () => {
    const store = memory();
    const fn = vi.fn();
    const off = onGemsChange(fn);
    recordGem('mars', gemLayout('mars')[0].id, store);
    off();
    recordGem('mars', gemLayout('mars')[1].id, store);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('survives junk and drops ids a layout no longer has', () => {
    expect(loadGemSave(memory({ [GEMS_KEY]: '{not json' })).worlds).toEqual({});
    const store = memory({ [GEMS_KEY]: JSON.stringify({ v: 1, migrated: true, worlds: { moon: ['g00', 'g00', 'zz', 7], pluto: ['g01'] } }) });
    expect(loadGemSave(store).worlds).toEqual({ moon: ['g00'] });
  });

  it('sums each world and the whole', () => {
    const store = memory();
    const mars = gemLayout('mars');
    recordGem('mars', mars[0].id, store);
    recordGem('mars', mars[1].id, store);
    recordGem('neptune', gemLayout('neptune')[5].id, store);
    const s = gemSummary(store);
    expect(s.worlds.map((w) => w.world)).toEqual([...GEM_WORLDS]);
    expect(s.collected).toBe(3);
    expect(s.total).toBe(GEM_WORLDS.reduce((n, w) => n + gemLayout(w).length, 0));
    const m = worldGemProgress('mars', loadGemSave(store));
    expect(m.collected).toBe(2);
    expect(m.points).toBe(GEM_INFO[mars[0].kind].points + GEM_INFO[mars[1].kind].points);
    expect(s.points).toBe(m.points + GEM_INFO[gemLayout('neptune')[5].kind].points);
  });
});

describe('the crystals, carried over', () => {
  const old = (worlds: Record<string, string[]>) => memory({ [CRYSTALS_KEY]: JSON.stringify({ v: 1, worlds }) });

  it('turns each crystal held into one gem on its world, the cheapest first', () => {
    const store = old({ mars: ['c1', 'c4', 'c9'], proximaB: ['c0', 'c2'], earth: [] });
    const save = loadGemSave(store);
    expect(save.migrated).toBe(true);
    expect(save.worlds.mars).toHaveLength(3);
    expect(save.worlds.proximaB).toHaveLength(2);
    expect(save.worlds.earth).toBeUndefined();
    expect(save.worlds.mars).toEqual(legacyGemIds('mars', 3));
    const cheapest = Math.min(...gemLayout('mars').map((g) => GEM_INFO[g.kind].points));
    for (const id of save.worlds.mars!) expect(GEM_INFO[gemLayout('mars').find((g) => g.id === id)!.kind].points).toBe(cheapest);
    // Written through, so the count survives the next visit.
    expect(JSON.parse(store.data[GEMS_KEY]).worlds.mars).toHaveLength(3);
  });

  it('only once: gems picked up afterwards are not swallowed by a second migration', () => {
    const store = old({ mars: ['c1', 'c4'] });
    loadGemSave(store);
    const extra = gemLayout('mars').find((g) => !legacyGemIds('mars', 2).includes(g.id))!;
    recordGem('mars', extra.id, store);
    expect(loadGemSave(store).worlds.mars).toHaveLength(3);
    expect(loadGemSave(store).worlds.mars).toHaveLength(3);
  });

  it('never more gems than the world has, and nothing from a broken old save', () => {
    const many = Array.from({ length: 80 }, (_, i) => `c${i}`);
    expect(loadGemSave(old({ mars: many })).worlds.mars).toHaveLength(gemLayout('mars').length);
    expect(loadGemSave(memory({ [CRYSTALS_KEY]: 'garbage' })).worlds).toEqual({});
  });
});

describe('what the platform is handed', () => {
  beforeEach(() => resetGemSyncForTests());

  it('per account: everything held until it is marked stored', () => {
    const store = memory();
    const [a, b] = gemLayout('venus');
    recordGem('venus', a.id, store);
    recordGem('venus', b.id, store);
    expect(unsentGems('me', store)).toEqual([{ world: 'venus', gemIds: [a.id, b.id] }]);
    markGemsSent('me', 'venus', [a.id], store);
    expect(unsentGems('me', store)).toEqual([{ world: 'venus', gemIds: [b.id] }]);
    // Another account on the same device has been told nothing.
    expect(unsentGems('other', store)).toEqual([{ world: 'venus', gemIds: [a.id, b.id] }]);
  });

  it('takes back what the account holds from another device', () => {
    const store = memory();
    expect(mergeGems({ moon: ['g01', 'g02', 'bogus'], pluto: ['g00'] }, store)).toBe(2);
    expect(loadGemSave(store).worlds.moon).toEqual(['g01', 'g02']);
    expect(mergeGems({ moon: ['g01'] }, store)).toBe(0);
  });

  it('a sync reads back once, then posts each world’s new pickups and marks what was stored', async () => {
    const store = memory();
    recordGem('mars', 'g00', store);
    recordGem('moon', 'g03', store);
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init?.method) return new Response(JSON.stringify({ worlds: { moon: ['g05'] }, points: 0, gems: 1, rank: 4, players: 9 }));
      const body = JSON.parse(String(init.body)) as { world: string; gemIds: string[] };
      return new Response(JSON.stringify({ world: body.world, accepted: body.gemIds, stored: body.gemIds.length, points: 120, gems: 3, rank: 2, players: 9 }));
    }) as unknown as typeof fetch;
    const s = await syncGems({ account: 'did:me', getToken: async () => 'tok', fetch: fetchImpl, store });
    expect(s).toEqual({ points: 120, gems: 3, rank: 2, players: 9 });
    expect(loadGemSave(store).worlds.moon).toEqual(['g03', 'g05']);
    const posts = calls.filter((c) => c.init?.method === 'POST').map((c) => JSON.parse(String(c.init!.body)));
    expect(posts).toEqual([{ world: 'moon', gemIds: ['g03'] }, { world: 'mars', gemIds: ['g00'] }]);
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(unsentGems('did:me', store)).toEqual([]);
    // Nothing new: the second pass neither reads back nor posts.
    calls.length = 0;
    await syncGems({ account: 'did:me', getToken: async () => 'tok', fetch: fetchImpl, store });
    expect(calls).toEqual([]);
  });

  it('keeps the pickups for later when the store is down or there is no token', async () => {
    const store = memory();
    recordGem('saturn', 'g01', store);
    const down = vi.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    expect(await syncGems({ account: 'a', getToken: async () => 'tok', fetch: down, store })).toBeNull();
    expect(unsentGems('a', store)).toHaveLength(1);
    const never = vi.fn() as unknown as typeof fetch;
    expect(await syncGems({ account: 'a', getToken: async () => null, fetch: never, store })).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});

describe('the gems in a scene', () => {
  it('one stone geometry that morphs vertex for vertex into a rock', () => {
    const g = gemGeometry(false);
    const p = g.getAttribute('position'); const p2 = g.getAttribute('position2');
    expect(p.count).toBe(p2.count);
    expect(g.getAttribute('normal2').count).toBe(p.count);
    g.dispose();
  });

  it('two draw calls for a world, restored from the save, picked up by touch only when allowed', () => {
    const store = memory();
    const first = gemLayout('mercury')[0];
    recordGem('mercury', first.id, store);
    const taken = vi.fn();
    const gems = makeGems({ world: 'mercury', floorAt: () => 2, lite: true, store, onCollect: taken });
    const meshes = gems.group.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh);
    expect(meshes).toHaveLength(2);
    expect(gems.total).toBe(gemLayout('mercury').length);
    expect(gems.count).toBe(1);
    const target = gems.gems.find((g) => !g.collected && g.tier === 'near')!;
    expect(target.py).toBeCloseTo(2 + target.alt);
    // Standing next to it in the ship: nothing.
    expect(gems.update(0.016, target.px, target.py - 1, target.pz, null, false)).toBeNull();
    // Just out of reach: nothing; touching it: taken, once.
    expect(gems.update(0.016, target.px + GEM_PICK_RANGE + 0.2, target.py - 1, target.pz, null)).toBeNull();
    expect(gems.update(0.016, target.px + 0.5, target.py - 1, target.pz, null)?.id).toBe(target.id);
    expect(gems.update(0.016, target.px + 0.5, target.py - 1, target.pz, null)).toBeNull();
    expect(taken).toHaveBeenCalledTimes(1);
    expect(gems.count).toBe(2);
    expect(gems.points).toBe(GEM_INFO[first.kind].points + GEM_INFO[target.kind].points);
    expect(loadGemSave(store).worlds.mercury).toContain(target.id);
    gems.dispose();
  });

  it('a gem in the air is not taken from the ground under it', () => {
    const store = memory();
    const gems = makeGems({ world: 'jupiter', floorAt: () => 0, lite: true, store });
    const high = gems.gems.find((g) => g.alt > 20)!;
    expect(gems.update(0.016, high.px, 0, high.pz, null)).toBeNull();
    expect(gems.update(0.016, high.px, high.py - 1, high.pz, null)?.id).toBe(high.id);
    gems.dispose();
  });

  it('steps a ground gem off a building, and perches a high one on a rock', () => {
    const spot = { id: 'g00', kind: 'ruby' as const, tier: 'near' as const, x: 10, z: 0, alt: 0.55 };
    const at = resolveGem(spot, { floorAt: () => 0, colliders: [{ x: 9, z: 0, r: 4 }] }, new Set());
    expect(Math.hypot(at.x - 9, at.z)).toBeGreaterThan(4.5);
    const high = { ...spot, tier: 'high' as const, alt: 40, perch: true };
    const taken = new Set<number>();
    expect(resolveGem(high, { floorAt: () => 0, perches: [{ x: 30, z: 0, top: 22 }] }, taken)).toEqual({ x: 30, y: 23.3, z: 0 });
    // That rock is taken: the next one floats where the layout put it.
    expect(resolveGem(high, { floorAt: () => 0, perches: [{ x: 30, z: 0, top: 22 }] }, taken)).toEqual({ x: 10, y: 40, z: 0 });
  });
});
