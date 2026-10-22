// The Sun's other planets: every world the surface scene can be built for
// has a profile, a landing ceiling and its words in both languages; the
// giants' floor is a deck over the clouds, and a ship coming down over one
// ends up on it; each small outpost builds, with its pad, its walls and its
// places to read.

import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  LANDING_SITES, WORLDS, WORLD_IDS, equatorialDir, isDeckWorld, isWorldId, type WorldId, type WorldProfile,
} from '@/lib/solar-system/world-profiles';
import { DECK_APRON, deckHeights, makeWorldTerrain } from '@/lib/solar-system/world-terrain';
import { DECK_GUIDE_ALT, OUTPOST_WORLDS, PAD_PAINT, holdOverDeck, landingPad, type Outpost, type OutpostWorld } from '@/lib/solar-system/world-outpost';
import { makeLander } from '@/lib/solar-system/moon-lander';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import type { LightPool } from '@/lib/solar-system/moon-lights';
import { gaitProfile } from '@/lib/solar-system/gait-profile';
import { isGlobeWorld } from '@/lib/solar-system/planet-frame';
import { makeRingArc } from '@/lib/solar-system/world-ring-arc';
import { placeFormations } from '@/lib/solar-system/world-formations';
import { PAD_RADIUS } from '@/lib/solar-system/world-terrain';

// The kit draws its labels on canvas; jsdom has none, so hand it a stub.
const gradient = { addColorStop: () => {} };
const ctx = new Proxy({}, {
  get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => gradient
      : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
});
const getContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => ctx) as never; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = getContext; });

const NEW_WORLDS: WorldId[] = ['mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune'];
const GIANTS: WorldId[] = ['jupiter', 'saturn', 'uranus', 'neptune'];
const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };
const lights: LightPool = { lights: [], request: vi.fn(), flush: vi.fn() };
const flat = () => 0;
const heightsFor = (p: WorldProfile) => (p.deck ? deckHeights(p.deck).heightAt : flat);

async function buildOutpost(world: OutpostWorld): Promise<{ outpost: Outpost; read: string[] }> {
  const { makeKit } = await import('@/lib/solar-system/moon-kit');
  const { makeOutpost } = await import('@/lib/solar-system/world-outpost');
  const read: string[] = [];
  const profile = WORLDS[world];
  const outpost = makeOutpost(world, profile, makeKit(true), heightsFor(profile), true, (k) => read.push(k));
  return { outpost, read };
}

type Messages = Record<string, unknown>;
const lookup = (m: Messages, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m);

describe('every world has what the scene and the flight ask of it', () => {
  it('a profile under its own id, a landing ceiling of about one radius, and a place in the id list', () => {
    expect([...WORLD_IDS].sort()).toEqual(Object.keys(WORLDS).sort());
    for (const id of WORLD_IDS) {
      expect(WORLDS[id].id).toBe(id);
      expect(isWorldId(id)).toBe(true);
      expect(LANDING_SITES[id]).toBeGreaterThan(0);
    }
    expect(LANDING_SITES.mercury).toBe(3000);
    expect(LANDING_SITES.venus).toBe(6000);
    expect(LANDING_SITES.jupiter).toBe(70000);
    expect(LANDING_SITES.saturn).toBe(58000);
    expect(LANDING_SITES.uranus).toBe(25000);
    expect(LANDING_SITES.neptune).toBe(25000);
  });

  it('real gravity and believable temperatures at the sites', () => {
    const g = Object.fromEntries(NEW_WORLDS.map((id) => [id, WORLDS[id].gravity]));
    expect(g).toEqual({ mercury: 3.7, venus: 8.87, jupiter: 24.79, saturn: 10.44, uranus: 8.69, neptune: 11.15 });
    expect(WORLDS.venus.ambientC).toBeGreaterThan(450);
    // Mercury near the dawn line: hot, but inside a suit's rating (about 120 °C).
    expect(WORLDS.mercury.ambientC).toBeLessThan(120);
    expect(WORLDS.mercury.sunDir.y).toBeLessThan(0.15);
    for (const id of GIANTS) expect(WORLDS[id].ambientC).toBeLessThan(-100);
    expect(WORLDS.neptune.ambientC).toBeLessThan(WORLDS.jupiter.ambientC);
  });

  it('the Sun dims with distance, and only the airless world shows stars', () => {
    const order: WorldId[] = ['mercury', 'jupiter', 'saturn', 'uranus', 'neptune'];
    for (let i = 1; i < order.length; i++) expect(WORLDS[order[i]].sun.intensity).toBeLessThan(WORLDS[order[i - 1]].sun.intensity);
    expect(WORLDS.mercury.sky.stars).toBe(1);
    for (const id of ['venus', ...GIANTS] as WorldId[]) expect(WORLDS[id].sky.stars).toBe(0);
  });

  it('the giants have their decks, their moons and (Saturn, Uranus) their rings; nothing grows or glitters on them', () => {
    for (const id of GIANTS) {
      const p = WORLDS[id];
      expect(isDeckWorld(id)).toBe(true);
      expect(p.deck!.seaDepth).toBeGreaterThanOrEqual(30);
      expect(p.deck!.seaDepth).toBeLessThanOrEqual(80);
      expect(p.walkRadius).toBeLessThan(p.deck!.radius);
      expect(p.formations).toBeNull();
      expect(p.crystals).toBeNull();
      expect(p.sky.moons.length).toBeGreaterThan(0);
      // The ship parks in the middle of the deck.
      expect(landingPad(p)).toEqual({ x: 0, z: 0 });
    }
    expect(isDeckWorld('mercury')).toBe(false);
    expect(isDeckWorld('mars')).toBe(false);
    expect(WORLDS.saturn.sky.rings?.kind).toBe('saturn');
    expect(WORLDS.uranus.sky.rings?.kind).toBe('uranus');
    expect(WORLDS.jupiter.sky.moons.map((m) => m.id)).toEqual(['io', 'europa', 'ganymede', 'callisto']);
    expect(WORLDS.neptune.sky.moons.map((m) => m.id)).toEqual(['triton']);
  });

  it('a body in the equatorial plane is up in the sky toward the equator', () => {
    // From the south (Jupiter's site), Io is in the northern sky; from the north, the other way.
    const south = equatorialDir(-14, 5.9, -62);
    expect(south.y).toBeGreaterThan(0.3);
    expect(south.z).toBeLessThan(0);
    const north = equatorialDir(24, 20, -90);
    expect(north.z).toBeGreaterThan(0);
  });

  it('Saturn\'s rings arch high across the southern sky from 24° N', () => {
    const arc = makeRingArc(WORLDS.saturn.sky.rings!, WORLDS.saturn.sunDir, 1, 0.3, true);
    const pos = arc.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    let top = new THREE.Vector3(0, -1, 0);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).normalize(); if (v.y > top.y) top = v.clone(); }
    expect(top.y).toBeGreaterThan(Math.sin((30 * Math.PI) / 180));
    expect(top.z).toBeGreaterThan(0);
    arc.dispose();
  });

  it('the crew can still walk at 2.5 g', () => {
    const p = gaitProfile(WORLDS.jupiter.gravity, true);
    expect(p.walk).toBeGreaterThan(0.3);
    expect(Number.isFinite(p.hop)).toBe(true);
    expect(p.hop).toBeGreaterThan(0);
  });
});

describe('the words, in English and in Georgian', () => {
  /** Every key the surface scene, the flight deck, the room and the loader can ask for, per world. */
  async function keysFor(id: WorldId): Promise<string[]> {
    const w = `solarSystem.worlds.${id}`;
    const keys = [
      'place', 'loading', 'loadingDetail', 'outside', 'crystals', 'run',
      'hints.walk', 'hints.jump', 'hints.walkTouch', 'hints.jumpTouch',
      'keys.r5', 'keys.r6', 'keys.r7', 'keys.t5', 'keys.t6',
      'banner.arrived', 'act.boardLander', 'pois.ourLander',
    ].map((k) => `${w}.${k}`);
    keys.push(`solarSystem.flight.landOn.${id}`, `solarSystem.room.places.${id}`, `play.loading.scene.${id}`);
    for (const k of ['name', 'descriptors', 'temp']) keys.push(`solarSystem.flight.worlds.${id}.${k}`);
    if (isGlobeWorld(id)) keys.push(`play.loading.insertion.${id}`);
    if ((OUTPOST_WORLDS as readonly string[]).includes(id)) {
      // Walk the outpost itself: every place it names, every prompt, every readout.
      const { outpost, read } = await buildOutpost(id as OutpostWorld);
      for (const p of outpost.pois) keys.push(`${w}.pois.${p.id}`);
      for (const i of outpost.interactables) { keys.push(`${w}.act.${i.label()}`); i.use(0); }
      for (const r of read) keys.push(`${w}.readout.${r}`);
      outpost.dispose();
    }
    return [...new Set(keys)];
  }

  it.each(NEW_WORLDS)('%s has every key it can ask for, in both files', async (id) => {
    const en = (await import('@/messages/en.json')).default as Messages;
    const ka = (await import('@/messages/ka.json')).default as Messages;
    const keys = await keysFor(id);
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) {
      for (const [lang, m] of [['en', en], ['ka', ka]] as const) {
        const v = lookup(m, k);
        expect(typeof v, `${lang}: ${k}`).toBe('string');
        expect((v as string).length, `${lang}: ${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('the Georgian is Georgian, and the two files hold the same keys for the new worlds', async () => {
    const en = (await import('@/messages/en.json')).default as Messages;
    const ka = (await import('@/messages/ka.json')).default as Messages;
    const leaves = (o: unknown, at = ''): string[] => (o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, at ? `${at}.${k}` : k)) : [at]);
    for (const id of NEW_WORLDS) {
      const e = leaves(lookup(en, `solarSystem.worlds.${id}`)).sort();
      expect(leaves(lookup(ka, `solarSystem.worlds.${id}`)).sort()).toEqual(e);
      for (const k of ['place', 'loading', 'hints.walk', 'keys.r6']) expect(lookup(ka, `solarSystem.worlds.${id}.${k}`)).toMatch(/[ა-ჿ]/);
    }
  });

  it('the floating stations say so', async () => {
    const en = (await import('@/messages/en.json')).default as Messages;
    for (const id of GIANTS) {
      expect(lookup(en, `solarSystem.worlds.${id}.keys.r6`)).toMatch(/floating station, not ground/);
      expect(lookup(en, `solarSystem.flight.worlds.${id}.descriptors`)).toMatch(/Floating station/);
    }
  });
});

describe('a giant\'s floor is the deck', () => {
  it.each(GIANTS)('on %s: the deck height inside the deck, and below it outside', (id) => {
    const p = WORLDS[id];
    const D = p.deck!;
    const { heightAt, floorAt } = deckHeights(D);
    for (const [x, z] of [[0, 0], [D.radius - 0.5, 0], [0, -(D.radius - 0.5)], [20, 20]]) expect(heightAt(x, z)).toBe(0);
    for (const [x, z] of [[D.radius + 0.5, 0], [0, 200], [-900, 300]]) expect(heightAt(x, z)).toBeLessThan(-29);
    // The camera's floor stays at the deck a way past the rail, then drops to the clouds.
    expect(floorAt(D.radius + DECK_APRON - 1, 0)).toBe(0);
    expect(floorAt(D.radius + DECK_APRON + 1, 0)).toBeLessThan(-29);
    // The crew's fence is inside the deck.
    expect(p.walkRadius).toBeLessThan(D.radius - 1);
  });

  it.each(GIANTS)('on %s the terrain is the cloud sea, well below the deck', (id) => {
    const p = WORLDS[id];
    const terrain = makeWorldTerrain(p, true, 1);
    expect(terrain.heightAt(0, 0)).toBe(0);
    expect(terrain.heightAt(p.deck!.radius + 5, 0)).toBe(-p.deck!.seaDepth);
    expect(terrain.mesh.position.y).toBeLessThan(-29);
    expect(terrain.horizon.position.y).toBeLessThan(0);
    expect(terrain.horizon.position.y).toBeGreaterThan(terrain.mesh.position.y);
    expect(terrain.rocks.children.length).toBeGreaterThan(0);
    terrain.update?.(1 / 60);
    terrain.dispose();
  });

  const pilots = [
    ['hands off', { throttle: 0, moveX: 0, moveY: 0 }],
    ['pushing off the deck', { throttle: 0, moveX: 1, moveY: 0 }],
    ['hovering wide', { throttle: 0.45, moveX: -1, moveY: -0.6 }],
  ] as const;
  it.each(GIANTS.flatMap((id) => pilots.map(([who, stick]) => [id, who, stick] as const)))('on %s a ship comes down on the deck (%s)', (id, _who, stick) => {
    const p = WORLDS[id];
    const D = p.deck!;
    const heightAt = deckHeights(D).heightAt;
    const pad = landingPad(p);
    for (const kind of ['lander', 'cruiser'] as const) {
      const lander = makeLander(pad.x, pad.z, heightAt, dust, true, undefined, p.gravity, undefined, { kind });
      const DT = 1 / 60;
      for (let i = 0; i < 60 * 120 && !lander.telemetry.landed; i++) {
        holdOverDeck(lander.telemetry, lander.position.x, lander.position.y, lander.position.z, pad, D);
        lander.update(DT, stick, heightAt);
      }
      expect(lander.telemetry.landed).toBe(true);
      const off = Math.hypot(lander.position.x - pad.x, lander.position.z - pad.z);
      expect(off + lander.hull).toBeLessThan(D.radius);
      expect(lander.telemetry.ground).toBe(0);
    }
  });

  it('the guidance leaves a pilot over the pad alone, and only steps in low down', () => {
    const t = { landed: false, assist: false } as Parameters<typeof holdOverDeck>[0];
    const D = WORLDS.jupiter.deck!;
    holdOverDeck(t, 3, 40, 2, { x: 0, z: 0 }, D);
    expect(t.assist).toBe(false);
    holdOverDeck(t, 60, DECK_GUIDE_ALT + 20, 0, { x: 0, z: 0 }, D);
    expect(t.assist).toBe(false);
    holdOverDeck(t, 30, DECK_GUIDE_ALT - 1, 0, { x: 0, z: 0 }, D);
    expect(t.assist).toBe(true);
  });
});

describe('the ground on Mercury and Venus', () => {
  it.each(['mercury', 'venus'] as const)('%s has ground with a levelled pad, and loose rock clear of it', (id) => {
    const p = WORLDS[id];
    const terrain = makeWorldTerrain(p, true, 1);
    const pad = landingPad(p);
    // The levelled ground round the pad is flat to a few centimetres.
    const h0 = terrain.heightAt(pad.x, pad.z);
    for (const [dx, dz] of [[8, 0], [-8, 4], [0, -30], [20, -20]]) expect(Math.abs(terrain.heightAt(pad.x + dx, pad.z + dz) - h0)).toBeLessThan(0.25);
    terrain.dispose();
    const placed = placeFormations(p, { density: 1, keepOut: [], walkRadius: p.walkRadius });
    expect(placed.length).toBeGreaterThan(5);
    for (const f of placed) {
      expect(f.kind).toBe('boulder');
      expect(Math.hypot(f.x - p.pad.x, f.z - p.pad.z) - f.r).toBeGreaterThan(PAD_RADIUS);
    }
  });
});

describe('the outposts', () => {
  it.each(OUTPOST_WORLDS)('the %s outpost builds, with its pad, its walls and its panels', async (world) => {
    const { outpost, read } = await buildOutpost(world);
    const profile = WORLDS[world];
    expect(outpost.group.children.length).toBeGreaterThan(0);
    expect(outpost.pad).toEqual(landingPad(profile));
    expect(outpost.colliders.length).toBeGreaterThan(8);
    const ids = new Set(outpost.pois.map((p) => p.id));
    for (const id of ['landingZone', 'habitat0', 'habitat1', 'power', 'dish', 'sign']) expect(ids.has(id), id).toBe(true);
    const acts = outpost.interactables.map((i) => i.id);
    for (const id of ['habPanel', 'power', 'comms']) expect(acts).toContain(id);
    expect(acts.length).toBe(4);
    for (const i of outpost.interactables) i.use(0);
    expect(read).toEqual(expect.arrayContaining(['habitat', 'power', 'comms']));
    // Nothing stands on the pad: the ship has room to set down.
    for (const c of outpost.colliders) expect(Math.hypot(c.x - outpost.pad.x, c.z - outpost.pad.z) - c.r).toBeGreaterThan(PAD_PAINT + 2);
    if (profile.deck) {
      // On a giant everything the crew can reach is on the deck, inside the rail.
      for (const c of outpost.colliders) expect(Math.hypot(c.x, c.z)).toBeLessThan(profile.walkRadius);
      for (const p of outpost.pois) expect(Math.hypot(p.x, p.z)).toBeLessThan(profile.deck.radius);
      expect(ids.has('envelope')).toBe(true);
      expect(ids.has('railing')).toBe(true);
    } else {
      // On the ground, inside the levelled ground round the pad.
      for (const c of outpost.colliders) expect(Math.hypot(c.x - profile.pad.x, c.z - profile.pad.z)).toBeLessThan(40);
    }
    outpost.update(1 / 60, 0, outpost.pad.x, outpost.pad.z, lights);
    outpost.dispose();
  });

  it('each world asks for its own: a sun wall on Mercury, a cooler on Venus, balloons on the giants', async () => {
    const extra = async (w: OutpostWorld) => (await buildOutpost(w)).outpost.interactables.map((i) => i.id).find((id) => !['habPanel', 'power', 'comms'].includes(id));
    expect(await extra('mercury')).toBe('sunshade');
    expect(await extra('venus')).toBe('cooler');
    for (const w of ['jupiter', 'saturn', 'uranus', 'neptune'] as const) expect(await extra(w)).toBe('envelope');
  });
});
