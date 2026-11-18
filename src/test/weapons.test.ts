import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MISSILE_DAMAGE, MISSILE_LOCK_SEC, MISSILE_MAX, MISSILE_REGEN_SEC, PLASMA_CHARGE_SEC, PLASMA_MIN_CHARGE,
  plasmaShot, simulateBattle, sustainedDps, MAX_HULL,
} from '@/lib/solar-system/combat-balance';
import { makeArmory, type ArmoryFrame } from '@/lib/solar-system/armory';
import { makeWeaponFx, MISSILE_SLOTS } from '@/lib/solar-system/weapon-fx';
import type { AlienEnemy } from '@/lib/solar-system/aliens';
import { createFlightSession, createPlayerShip, FLIGHT_UNIT, type FlightWorld } from '@/lib/solar-system/player-ship';
import { readShot, trimShots, type ShotMsg } from '@/lib/multiplayer/room-link';

const U = FLIGHT_UNIT;
const H = 0.044 * U;
const DT = 1 / 60;

// jsdom has no 2D canvas; the sprite textures only need a context that swallows calls.
beforeAll(() => {
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

const quiet = { missile() {}, plasma() {}, lock() {}, empty() {}, blast() {} };

function enemy(x: number, y: number, z: number, hp = 100): AlienEnemy {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  return { group, hp, maxHp: hp, radius: 0.0028 * 0.5, hostile: true };
}

/** An armory over a few fake craft, the ship at the origin looking down +Z. */
function bench(enemies: AlienEnemy[]) {
  const fx = makeWeaponFx({ unit: H * 4, lite: false });
  const hits: { e: AlienEnemy; killed: boolean }[] = [];
  const launches: string[] = [];
  const armory = makeArmory({ unit: U, hull: H }, fx, quiet, {
    onHit: (e, killed) => hits.push({ e, killed }),
    onLaunch: (k) => launches.push(k),
  });
  const aliens = {
    enemies,
    damage(e: AlienEnemy, amount: number) {
      if (e.hp <= 0) return false;
      e.hp -= amount;
      if (e.hp > 0) return false;
      e.group.visible = false;
      return true;
    },
    spawnSparks() {},
  };
  const f: ArmoryFrame = {
    dt: DT, trigger: false, ready: true,
    origin: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), aim: new THREE.Vector3(0, 0, 1), vel: new THREE.Vector3(),
    energy: 1, aliens, bodies: [],
  };
  let energy = 1;
  const run = (seconds: number, trigger: boolean) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      f.trigger = trigger;
      f.energy = energy;
      energy = Math.max(0, energy - armory.update(f));
      fx.update(DT);
    }
  };
  return { fx, armory, hits, launches, f, run, get energy() { return energy; }, set energy(v: number) { energy = v; } };
}

describe('weapons: switching', () => {
  it('steps through the three guns both ways and picks one by name', () => {
    const b = bench([]);
    expect(b.armory.weapon).toBe('pulse');
    b.armory.step(1);
    expect(b.armory.weapon).toBe('missile');
    b.armory.step(1);
    expect(b.armory.weapon).toBe('plasma');
    b.armory.step(1);
    expect(b.armory.weapon).toBe('pulse');
    b.armory.step(-1);
    expect(b.armory.weapon).toBe('plasma');
    b.armory.select('missile');
    expect(b.armory.weapon).toBe('missile');
  });

  it('the ship takes the weapon keys and reports the gun on the telemetry', () => {
    const session = createFlightSession();
    const ship = createPlayerShip(session);
    const world: FlightWorld = {
      bodies: [], pois: [],
      home: { position: new THREE.Vector3(1, 0, 0.2), lookAt: new THREE.Vector3(1, 0, 10), yaw: 0 },
      jump: { name: 'alphaCentauri', distanceLy: 4.37, position: new THREE.Vector3(-14, -25, 8), lookAt: new THREE.Vector3(-15, -26, 8), yaw: 0 },
      systemName: 'sol',
    };
    const fakeAliens = { group: new THREE.Group(), enemies: [], damage: () => false, spawnSparks: () => undefined } as never;
    const camera = new THREE.PerspectiveCamera();
    ship.spawn(world.home);
    const fired: string[] = [];
    ship.onFire = (_from, _vel, w) => fired.push(w);
    const step = (n: number) => { for (let i = 0; i < n; i++) ship.update(DT, 0, camera, fakeAliens, world); };
    session.input.weaponStep = 1;
    step(1);
    expect(session.telemetry.weapon).toBe('missile');
    // A missile with no lock flies straight, and the rack shows it gone.
    session.input.fire = true;
    step(2);
    session.input.fire = false;
    step(1);
    expect(fired).toEqual(['missile']);
    expect(session.telemetry.missiles).toBe(MISSILE_MAX - 1);
    // Plasma: the charge builds while held, and one ball goes on release.
    session.input.weaponPick = 'plasma';
    session.input.fire = true;
    step(30);
    expect(session.telemetry.charge).toBeGreaterThan(0.3);
    session.input.fire = false;
    step(1);
    expect(fired).toEqual(['missile', 'plasma']);
    expect(session.telemetry.charge).toBe(0);
    expect(session.telemetry.energy).toBeLessThan(0.95);
    // Back to the cannon: bolts, named as such for the room.
    session.input.weaponPick = 'pulse';
    session.input.fire = true;
    step(30);
    session.input.fire = false;
    expect(fired.filter((w) => w === 'pulse').length).toBeGreaterThan(2);
    // The sight is on the glass while the guns are up.
    expect(session.telemetry.aim.on).toBe(1);
    // A hit from the camera's right shows on the right of the rim.
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    ship.takeDamage(5, ship.group.position.clone().addScaledVector(right, 0.01));
    step(1);
    expect(session.telemetry.hurtT).toBeGreaterThan(0.9);
    expect(session.telemetry.hurtAngle).toBeCloseTo(Math.PI / 2, 1);
    ship.dispose();
  });
});

describe('weapons: missiles', () => {
  it('locks a hostile held in the cone ahead, and not one off to the side', () => {
    const ahead = enemy(0.002, 0, 0.15);
    const aside = enemy(0.15, 0, 0.05);
    const b = bench([ahead, aside]);
    b.armory.select('missile');
    b.run(0.1, false);
    expect(b.armory.lock).toBe('seek');
    expect(b.armory.lockTarget).toBe(ahead);
    b.run(MISSILE_LOCK_SEC, false);
    expect(b.armory.lock).toBe('locked');
    // Turn away: the lock is let go after a short grace.
    b.f.fwd.set(-1, 0, 0);
    b.run(0.6, false);
    expect(b.armory.lock).toBe('');
  });

  it('a missile fired on a lock homes in on a target that moves off the line', () => {
    const target = enemy(0, 0, 0.12, 30);
    const b = bench([target]);
    b.armory.select('missile');
    b.run(MISSILE_LOCK_SEC + 0.1, false);
    expect(b.armory.lock).toBe('locked');
    b.run(DT, true);
    b.run(DT, false);
    expect(b.launches).toEqual(['missile']);
    // The target slides well off the launch line; the missile follows it.
    for (let i = 0; i < 180 && b.hits.length === 0; i++) {
      target.group.position.x += 0.0004;
      b.run(DT, false);
    }
    expect(target.group.position.x).toBeGreaterThan(0.01);
    expect(b.hits.length).toBeGreaterThan(0);
    expect(b.hits[0].e).toBe(target);
    expect(target.hp).toBeLessThanOrEqual(30 - MISSILE_DAMAGE);
  });

  it('without a lock it flies straight past a target off the line', () => {
    const target = enemy(0.03, 0, 0.12);
    const b = bench([target]);
    b.armory.select('missile');
    b.run(DT, true);
    b.run(4, false);
    expect(b.launches.length).toBe(1);
    expect(b.hits.length).toBe(0);
  });

  it('the rack empties, refuses, and refills one missile at a time', () => {
    const b = bench([]);
    b.armory.select('missile');
    // The refill clock runs from the first launch.
    b.run(2, true);
    expect(b.launches.length).toBe(MISSILE_MAX);
    expect(b.armory.missiles).toBe(0);
    b.run(1, true);
    expect(b.launches.length).toBe(MISSILE_MAX);
    b.run(MISSILE_REGEN_SEC - 4, false);
    expect(b.armory.missiles).toBe(0);
    expect(b.armory.missileRegen).toBeGreaterThan(0.7);
    b.run(1.2, false);
    expect(b.armory.missiles).toBe(1);
    b.run(MISSILE_REGEN_SEC * MISSILE_MAX, false);
    expect(b.armory.missiles).toBe(MISSILE_MAX);
  });
});

describe('weapons: plasma', () => {
  it('a tap below the minimum charge fizzles; a held charge fires one ball', () => {
    const b = bench([]);
    b.armory.select('plasma');
    b.run(PLASMA_CHARGE_SEC * PLASMA_MIN_CHARGE * 0.5, true);
    b.run(DT, false);
    expect(b.launches).toEqual([]);
    b.run(PLASMA_CHARGE_SEC * 0.5, true);
    const k = b.armory.charge;
    expect(k).toBeGreaterThan(0.4);
    expect(k).toBeLessThan(0.6);
    b.run(DT, false);
    expect(b.launches).toEqual(['plasma']);
    expect(b.armory.charge).toBe(0);
    expect(1 - b.energy).toBeCloseTo(plasmaShot(k).energy, 2);
  });

  it('the charge stops at full, and a full ball hits hardest', () => {
    const target = enemy(0, 0, 0.05, 500);
    const b = bench([target]);
    b.armory.select('plasma');
    b.run(PLASMA_CHARGE_SEC * 2, true);
    expect(b.armory.charge).toBe(1);
    b.run(1, false);
    expect(b.hits.length).toBe(1);
    expect(500 - target.hp).toBeCloseTo(plasmaShot(1).damage, 5);
    expect(plasmaShot(1).damage).toBeGreaterThan(plasmaShot(0.5).damage);
    expect(plasmaShot(0.1).damage).toBe(0);
  });

  it('a low bank fires a smaller ball, and an empty one none at all', () => {
    const b = bench([]);
    b.armory.select('plasma');
    b.energy = 0.05;
    b.run(PLASMA_CHARGE_SEC * 1.2, true);
    b.run(DT, false);
    expect(b.launches).toEqual([]);
    b.energy = 0.2;
    b.run(PLASMA_CHARGE_SEC * 1.2, true);
    b.run(DT, false);
    expect(b.launches).toEqual(['plasma']);
    expect(b.energy).toBeGreaterThanOrEqual(0);
  });
});

describe('weapons: pools never grow', () => {
  it('a long fight with every gun keeps the effects inside their caps', () => {
    const b = bench([]);
    const children = () => { let n = 0; b.fx.group.traverse(() => { n += 1; }); return n; };
    const before = children();
    const at = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      at.set(Math.random(), Math.random(), Math.random());
      b.fx.explode(at, H * 6);
      b.fx.impact(at, new THREE.Color(1, 1, 1), H);
      b.fx.flicker(b.fx.group, H);
      b.fx.muzzle(at, new THREE.Vector3(0, 0, 1), new THREE.Color(1, 1, 1));
      const s = b.fx.stats();
      expect(s.explosions).toBeLessThanOrEqual(b.fx.caps.explosions);
      expect(s.sprites).toBeLessThanOrEqual(b.fx.caps.sprites);
      expect(s.debris).toBeLessThanOrEqual(b.fx.caps.debris);
      b.fx.update(DT);
    }
    // Missiles as fast as the rack allows, refilled by hand.
    b.armory.select('missile');
    for (let i = 0; i < 40; i++) {
      b.run(0.65, true);
      expect(b.armory.live().missiles).toBeLessThanOrEqual(MISSILE_SLOTS);
      expect(b.fx.stats().smoke).toBeLessThanOrEqual(b.fx.caps.smoke);
    }
    expect(children()).toBe(before);
  });

  it('the lite set is smaller and leaves out the ring and the flicker', () => {
    const full = makeWeaponFx({ unit: H, lite: false });
    const lite = makeWeaponFx({ unit: H, lite: true });
    expect(lite.caps.explosions).toBeLessThan(full.caps.explosions);
    expect(lite.caps.sprites).toBeLessThan(full.caps.sprites);
    expect(lite.caps.smoke).toBeLessThan(full.caps.smoke);
    lite.flicker(lite.group, H);
    expect(lite.stats().sprites).toBe(0);
  });
});

describe('weapons: balance', () => {
  it('neither new gun out-damages the cannon over a fight', () => {
    expect(sustainedDps('missile')).toBeLessThan(sustainedDps('pulse'));
    expect(sustainedDps('plasma')).toBeLessThan(sustainedDps('pulse'));
    // …but a full plasma ball is a real burst.
    expect(plasmaShot(1).damage).toBeGreaterThan(3 * 15);
  });

  it('the early fights are still survived with a pilot mixing the guns', () => {
    // A third of the cannon's sustained rate plus a missile now and then.
    const dps = sustainedDps('pulse') / 10 + sustainedDps('missile') * 0.5;
    const r = simulateBattle(['raider', 'raider', 'raider'], { playerDps: dps, hitChance: 0.35, duty: 0.6, seconds: 150, fight: 2 });
    expect(r.survived).toBe(true);
    expect(r.killedAll).toBe(true);
    expect(r.minHull / MAX_HULL).toBeGreaterThan(0.75);
  });
});

describe('weapons: on the wire', () => {
  const base = { id: 'a', b: 'earth', p: [0, 0, 0], v: [1, 0, 0] };
  it('reads the gun field, and refuses one it does not know', () => {
    expect(readShot(base)?.w).toBeUndefined();
    expect(readShot({ ...base, w: 'm' })?.w).toBe('m');
    expect(readShot({ ...base, w: 'p' })?.w).toBe('p');
    expect(readShot({ ...base, w: 'x' })?.w).toBe('x');
    expect(readShot({ ...base, w: 'nuke' })).toBeNull();
    expect(readShot({ ...base, w: 3 })).toBeNull();
    expect(readShot({ ...base, w: 'm', p: [0, Infinity, 0] })).toBeNull();
  });

  it('a held trigger never crowds a missile or a blast out of the queue', () => {
    const q: ShotMsg[] = [
      { ...base, w: 'm' }, { ...base }, { ...base }, { ...base, w: 'x' }, { ...base }, { ...base },
    ];
    trimShots(q, 3);
    expect(q.length).toBe(3);
    expect(q.map((s) => s.w ?? '-')).toEqual(['m', 'x', '-']);
    const all: ShotMsg[] = Array.from({ length: 5 }, () => ({ ...base, w: 'x' as const }));
    trimShots(all, 3);
    expect(all.length).toBe(3);
  });
});

describe('weapons: a real fight', () => {
  it('every gun takes raiders down, the pilot lives, and the ship builds nothing new', async () => {
    const { makeAlienEncounters } = await import('@/lib/solar-system/aliens');
    const session = createFlightSession();
    const ship = createPlayerShip(session);
    const earth = { id: 'earth', kind: 'planet' as const, position: new THREE.Vector3(1, 0, 0), radius: 0.028, radiusKm: 6371, surfaceG: 9.81, atmosphere: 1.25 };
    const world: FlightWorld = {
      bodies: [earth], pois: [],
      home: { position: new THREE.Vector3(1, 0, 0.14), lookAt: new THREE.Vector3(1, 0, 10), yaw: 0 },
      jump: { name: 'alphaCentauri', distanceLy: 4.37, position: new THREE.Vector3(-14, -25, 8), lookAt: new THREE.Vector3(-15, -26, 8), yaw: 0 },
      systemName: 'sol',
    };
    ship.spawn(world.home);
    const aliens = makeAlienEncounters();
    aliens.setHostile({ group: ship.group, onHit: (d, from) => ship.takeDamage(d, from), onRepair: (h, s) => ship.repair(h, s), status: session.telemetry });
    const camera = new THREE.PerspectiveCamera();
    const count = () => { let n = 0; for (const g of [ship.fxGroup, ship.boltGroup]) g.traverse(() => { n += 1; }); return n; };
    const before = count();
    let clock = 0;
    let crashed = false;
    for (const gun of ['missile', 'plasma', 'pulse'] as const) {
      aliens.stage('raiders');
      session.input.weaponPick = gun;
      for (let i = 0; i < 60 * 40 && aliens.enemies.some((e) => e.hostile); i++) {
        clock += DT;
        const e = aliens.enemies.find((x) => x.hostile && x.group.visible);
        if (e) ship.group.lookAt(e.group.position);
        // Plasma: charge a second, let go.
        session.input.fire = gun === 'plasma' ? (clock % 1.2) < 1 : true;
        ship.update(DT, clock, camera, aliens, world);
        aliens.update(DT, earth.position);
        if (session.telemetry.crashed) crashed = true;
      }
      session.input.fire = false;
      expect(aliens.enemies.filter((e) => e.hostile).length).toBe(0);
    }
    expect(crashed).toBe(false);
    expect(session.telemetry.kills).toBeGreaterThanOrEqual(6);
    expect(count()).toBe(before);
    ship.dispose();
    aliens.dispose();
  });
});
