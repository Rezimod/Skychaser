import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ALIEN_SPECS, HOSTILE_ENCOUNTERS, MAX_HULL, MAX_SHIELD, ZONE_TABLE,
  alienZone, expectedDps, pickEncounter, simulateBattle,
  type AlienZone, type EncounterKind,
} from '@/lib/solar-system/combat-balance';
import { createFlightSession, createPlayerShip, type FlightBody, type FlightWorld } from '@/lib/solar-system/player-ship';
import { makeAlienEncounters, type AlienHandle } from '@/lib/solar-system/aliens';

const DT = 1 / 60;

// jsdom has no 2D canvas; the glow sprites only need a context that swallows calls.
beforeAll(() => {
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

describe('regions', () => {
  const orbits = { mars: 1.5, jupiter: 5, neptune: 30 };
  it('places the ship in the right part of the system', () => {
    expect(alienZone('sol', 'earth', 1, orbits)).toBe('home');
    expect(alienZone('sol', 'moon', 1, orbits)).toBe('home');
    expect(alienZone('sol', 'venus', 0.7, orbits)).toBe('inner');
    expect(alienZone('sol', 'mars', 1.5, orbits)).toBe('inner');
    expect(alienZone('sol', '', 2.6, orbits)).toBe('belt');
    expect(alienZone('sol', 'ceres', 2.6, orbits)).toBe('belt');
    expect(alienZone('sol', 'jupiter', 5, orbits)).toBe('giants');
    expect(alienZone('sol', 'titan', 9.5, orbits)).toBe('giants');
    expect(alienZone('sol', 'pluto', 39, orbits)).toBe('deep');
    expect(alienZone('alphaCentauri', 'proximaB', 0.1, orbits)).toBe('deep');
    // A world without the planets still answers.
    expect(alienZone('sol', 'earth', NaN, { mars: NaN, jupiter: NaN, neptune: NaN })).toBe('home');
  });

  it('keeps home peaceful and puts the big ships far out', () => {
    for (const k of Object.keys(ZONE_TABLE.home) as EncounterKind[]) expect(HOSTILE_ENCOUNTERS.has(k)).toBe(false);
    expect(ZONE_TABLE.belt.raiders).toBeGreaterThan(0);
    expect(ZONE_TABLE.belt.mines).toBeGreaterThan(0);
    expect(ZONE_TABLE.deep.gunship).toBeGreaterThan(0);
    for (const z of ['home', 'inner', 'belt', 'giants'] as AlienZone[]) expect(ZONE_TABLE[z].gunship ?? 0).toBe(0);
    const seen = new Set<EncounterKind>();
    for (let i = 0; i < 200; i++) seen.add(pickEncounter('belt', i / 200));
    expect(seen.has('raiders')).toBe(true);
    expect(seen.has('mines')).toBe(true);
  });
});

describe('balance: a numeric early battle', () => {
  // A middling pilot: one bolt in three lands while the cannon fires at its
  // sustained rate — about six damage a second. Alien gunners land a third
  // of their shots and spend a bit over half their time pointed at the ship.
  const typical = { playerDps: 6, hitChance: 0.35, duty: 0.6, seconds: 150 };

  it('the first raider fight is survived with most of the ship left', () => {
    const r = simulateBattle(['raider', 'raider'], { ...typical, fight: 1 });
    expect(r.survived).toBe(true);
    expect(r.killedAll).toBe(true);
    expect(r.mercyUsed).toBe(false);
    // Never close: the shields alone soak the fight.
    expect(r.minHull).toBe(MAX_HULL);
    expect(r.minShield).toBeGreaterThan(MAX_SHIELD * 0.6);
  });

  it('early patrols and packs leave real margin without needing mercy', () => {
    for (const [roster, fight] of [
      [['raider', 'raider', 'raider'], 2],
      [['saucer', 'dart', 'dart'], 3],
      [['drone', 'drone', 'drone', 'drone', 'drone'], 3],
    ] as const) {
      const r = simulateBattle([...roster], { ...typical, fight });
      expect(r.survived).toBe(true);
      expect(r.mercyUsed).toBe(false);
      expect(r.minHull / MAX_HULL).toBeGreaterThan(0.75);
    }
  });

  it('a pilot who never hits anything still lives through a boss, thanks to the break-off', () => {
    const r = simulateBattle(['gunship', 'drone', 'drone', 'drone', 'drone'], { playerDps: 0, hitChance: 0.6, duty: 0.9, seconds: 240, fight: 6 });
    expect(r.survived).toBe(true);
    expect(r.minHull).toBeGreaterThan(MAX_HULL * 0.2);
  });

  it('every armed craft does less than the shields regenerate in a quiet moment', () => {
    for (const k of Object.keys(ALIEN_SPECS) as (keyof typeof ALIEN_SPECS)[]) {
      // Even at full scale and perfect aim, one craft cannot out-damage a
      // pilot who breaks contact for a few seconds.
      expect(expectedDps(k, 0.85, 1, 1)).toBeLessThan(12);
    }
  });
});

/** A real ship and the real encounters, flown together. */
function rig() {
  const session = createFlightSession();
  const body = (id: string, x: number, radius: number): FlightBody => ({
    id, kind: 'planet', position: new THREE.Vector3(x, 0, 0), radius, radiusKm: 6371, surfaceG: 9.81, atmosphere: 1.25,
  });
  const earth = body('earth', 1, 0.028);
  const world: FlightWorld = {
    bodies: [body('sun', 0, 0.152), earth],
    pois: [],
    // Out past Earth, nose pointing at open space.
    home: { position: new THREE.Vector3(1, 0, 0.14), lookAt: new THREE.Vector3(1, 0, 10), yaw: 0 },
    jump: { name: 'alphaCentauri', distanceLy: 4.37, position: new THREE.Vector3(-14, -25, 8), lookAt: new THREE.Vector3(-15, -26, 8), yaw: 0 },
    systemName: 'sol',
  };
  const ship = createPlayerShip(session);
  ship.spawn(world.home);
  const aliens: AlienHandle = makeAlienEncounters();
  const hits: number[] = [];
  const callouts: string[] = [];
  aliens.setHostile({
    group: ship.group,
    onHit: (d) => { hits.push(d); ship.takeDamage(d); },
    onRepair: (h, s) => ship.repair(h, s),
    status: session.telemetry,
  });
  const camera = new THREE.PerspectiveCamera();
  const tel = session.telemetry;
  let clock = 0;
  let seq = 0;
  let minHp = Infinity;
  let crashed = false;
  const fly = (seconds: number, thrust = 0.6, weave = 0) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      clock += DT;
      session.input.thrust = thrust;
      session.input.yaw = Math.sin(clock * 0.3) * weave;
      ship.update(DT, clock, camera, aliens, world);
      aliens.update(DT, earth.position);
      if (aliens.calloutSeq !== seq) {
        seq = aliens.calloutSeq;
        callouts.push(aliens.callout);
      }
      minHp = Math.min(minHp, tel.hp);
      if (tel.crashed) crashed = true;
    }
  };
  return { session, ship, aliens, tel, hits, callouts, fly, world, get minHp() { return minHp; }, get crashed() { return crashed; } };
}

describe('encounters in flight', () => {
  it('the first fight of a flight does not trouble a pilot who just flies on', () => {
    const r = rig();
    r.aliens.stage('raiders');
    expect(r.aliens.callout).toBe('raiders');
    expect(r.aliens.enemies.length).toBe(2);
    expect(r.aliens.enemies.every((e) => e.hostile)).toBe(true);
    r.fly(80);
    expect(r.hits.length).toBeGreaterThan(3); // they did shoot, and hit
    expect(r.crashed).toBe(false);
    expect(r.minHp).toBe(MAX_HULL); // the shields held throughout
    // They gave up and warped out; a breather later the shields are full.
    r.fly(25);
    expect(r.aliens.encounter).not.toBe('raiders');
    expect(r.tel.shield).toBe(MAX_SHIELD);
  });

  it('five patrols in a row cannot kill a pilot who sits still', () => {
    const r = rig();
    for (let i = 0; i < 5; i++) {
      r.aliens.stage('patrol');
      r.fly(80, 0);
    }
    expect(r.hits.length).toBeGreaterThan(40);
    expect(r.crashed).toBe(false);
    expect(r.minHp).toBeGreaterThan(MAX_HULL * 0.3);
  });

  it('only a couple of craft are ever firing at once', () => {
    const r = rig();
    r.aliens.stage('raiders'); // first fight: one at a time
    r.aliens.stage('gunship');
    // Count bolts in flight at the player every frame: a burst is three
    // shots, two shooters at most, so never much more than six.
    let worst = 0;
    const redBolts = () => {
      let n = 0;
      r.aliens.group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.visible && (o.material as THREE.MeshBasicMaterial).color?.r > 2 && (o.geometry as THREE.CylinderGeometry).parameters?.height > 0.002) n += 1;
      });
      return n;
    };
    for (let s = 0; s < 60; s++) {
      r.fly(1, 0);
      worst = Math.max(worst, redBolts());
    }
    expect(worst).toBeLessThanOrEqual(7);
  });

  it('a won fight leaves salvage that repairs the ship', () => {
    const r = rig();
    r.aliens.stage('raiders');
    // Let them close in to fighting range.
    r.fly(14);
    r.ship.takeDamage(MAX_SHIELD + 40);
    const hp = r.tel.hp;
    expect(hp).toBeLessThanOrEqual(MAX_HULL - 40);
    // Shoot the whole pack down.
    for (const e of [...r.aliens.enemies]) {
      let killed = false;
      for (let i = 0; i < 10 && !killed; i++) killed = r.aliens.damage(e, 15);
      expect(killed).toBe(true);
    }
    r.fly(0.1);
    expect(r.callouts).toContain('clear');
    // The salvage drifts in to the ship and patches it up.
    r.fly(10, 0);
    expect(r.callouts).toContain('salvage');
    expect(r.tel.hp).toBeGreaterThan(hp + 30);
  });

  it('a greeter flies alongside, leaves a gift, and never fires', () => {
    const r = rig();
    r.ship.takeDamage(MAX_SHIELD);
    r.aliens.stage('greeter');
    expect(r.aliens.enemies[0]?.hostile).toBe(false);
    r.fly(0.1);
    expect(r.aliens.contactState).toBe('scan');
    r.fly(26, 0.4);
    expect(r.callouts).toEqual(['greeter', 'gift']);
    expect(r.hits.length).toBe(0);
    expect(r.tel.shield).toBeGreaterThan(50);
  });

  it('shooting a greeter scares it off without a gift', () => {
    const r = rig();
    r.aliens.stage('greeter');
    r.fly(1);
    r.aliens.damage(r.aliens.enemies[0], 15);
    r.fly(5);
    expect(r.callouts).toEqual(['greeter', 'spooked']);
    expect(r.aliens.enemies.length).toBe(0);
  });

  it('a minefield across the path hurts, but not much', () => {
    const r = rig();
    r.aliens.stage('mines');
    expect(r.aliens.enemies.length).toBe(5);
    // Boost straight through the middle of it.
    r.session.input.boost = true;
    r.fly(30, 1);
    expect(r.crashed).toBe(false);
    const total = r.hits.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(MAX_SHIELD * 0.6);
  });

  it('every kind of craft can be shot down', () => {
    const r = rig();
    const kinds = new Set<string>();
    for (const enc of ['scout', 'greeter', 'trader', 'beacon', 'wreck', 'raiders', 'swarm', 'mines', 'patrol', 'carrier', 'gunship'] as EncounterKind[]) {
      r.aliens.stage(enc);
      r.fly(0.5, 0);
      for (const e of [...r.aliens.enemies]) {
        kinds.add(e.kind ?? '');
        let killed = false;
        for (let i = 0; i < 40 && !killed; i++) killed = r.aliens.damage(e, 15);
        expect(killed).toBe(true);
      }
      expect(r.aliens.enemies.length).toBe(0);
    }
    expect([...kinds].sort()).toEqual(
      ['beacon', 'dart', 'drone', 'gunship', 'hauler', 'lantern', 'mine', 'mothership', 'probe', 'raider', 'saucer', 'wreck'],
    );
  });

  it('near home, a long cruise brings only friendly company — and something new comes along regularly', () => {
    const r = rig();
    // Holding station off Earth, so the whole quarter-hour is spent at home.
    r.fly(15 * 60, 0);
    const starts = r.callouts.filter((c) => (Object.keys(ZONE_TABLE.home) as string[]).includes(c) || HOSTILE_ENCOUNTERS.has(c as EncounterKind));
    expect(starts.length).toBeGreaterThanOrEqual(8);
    expect(starts.some((c) => HOSTILE_ENCOUNTERS.has(c as EncounterKind))).toBe(false);
    expect(r.hits.length).toBe(0);
  });

  it('builds nothing new as encounters come and go', () => {
    const r = rig();
    const count = () => {
      let n = 0;
      r.aliens.group.traverse(() => { n += 1; });
      return n;
    };
    const before = count();
    for (const enc of ['gunship', 'carrier', 'swarm', 'wreck', 'greeter', 'mines'] as EncounterKind[]) {
      r.aliens.stage(enc);
      r.fly(10, 0.3);
    }
    expect(count()).toBe(before);
    r.aliens.dispose();
  });
});
