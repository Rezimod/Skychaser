// The ship's other two weapons, beside the cannon in player-ship.ts:
//
//   missile — the seeker locks a hostile that sits in a cone ahead for a
//             moment; a missile fired on a lock homes on it, one fired
//             without flies straight. A small rack that refills slowly. A
//             hit, a near miss (the proximity fuse) or the end of its fuel
//             sets it off, and the blast hurts everything close.
//   plasma  — hold the trigger to charge, let go to fire one slow ball.
//             The charge sets its size, its damage and the energy it takes.
//
// Numbers are in combat-balance.ts. Projectiles are a fixed pool, the
// visuals are weapon-fx.ts's, and nothing allocates per frame.

import * as THREE from 'three';
import {
  MISSILE_BLAST, MISSILE_DAMAGE, MISSILE_LOCK_SEC, MISSILE_MAX, MISSILE_REFIRE, MISSILE_REGEN_SEC, MISSILE_SPLASH,
  PLASMA_CHARGE_SEC, PLASMA_ENERGY_MAX, PLASMA_ENERGY_MIN, PLASMA_MIN_CHARGE, plasmaShot, type WeaponKind,
} from '@/lib/solar-system/combat-balance';
import type { AlienEnemy, AlienHandle } from '@/lib/solar-system/aliens';
import { MISSILE_SLOTS, PLASMA_SLOTS, type WeaponFx } from '@/lib/solar-system/weapon-fx';

export type { WeaponKind } from '@/lib/solar-system/combat-balance';
export const WEAPONS: readonly WeaponKind[] = ['pulse', 'missile', 'plasma'];
export type LockState = '' | 'seek' | 'locked';

/** The aliens' saucer unit (aliens.ts): blast radii are set in it. */
const S = 0.0028;

export interface ArmoryOptions {
  /** One flight unit (player-ship's U): speeds are in it. */
  unit: number;
  /** One hull (player-ship's H): sizes are in it. */
  hull: number;
}

/** Something solid a shot can strike: a world or a station. */
export interface ArmoryBody {
  id: string;
  kind: string;
  position: THREE.Vector3;
  radius: number;
  destroyed?: boolean;
}

export interface ArmoryFrame {
  dt: number;
  /** The trigger, as the pilot holds it. */
  trigger: boolean;
  /** The ship can fight this frame (armed, flying, not wrecked or jumping). */
  ready: boolean;
  /** Where shots leave from, which way the nose points, and the ship's velocity. */
  origin: THREE.Vector3;
  fwd: THREE.Vector3;
  /** Where the plasma goes (unit vector, aim help already applied). */
  aim: THREE.Vector3;
  vel: THREE.Vector3;
  energy: number;
  aliens: Pick<AlienHandle, 'enemies' | 'damage' | 'spawnSparks'>;
  bodies: readonly ArmoryBody[];
}

export interface ArmorySounds {
  missile: () => void;
  plasma: (k: number) => void;
  lock: () => void;
  empty: () => void;
  blast: (big: boolean) => void;
}

export interface ArmoryHooks {
  /** A missile or plasma ball leaves (for the room). */
  onLaunch?: (kind: WeaponKind, from: THREE.Vector3, velocity: THREE.Vector3) => void;
  /** Something went off: a missile, a big plasma ball (for the room and the camera). */
  onBlast?: (at: THREE.Vector3, size: number) => void;
  /** A craft took a hit; `killed` when that finished it. */
  onHit?: (enemy: AlienEnemy, killed: boolean, at: THREE.Vector3) => void;
  /** A world or station was struck, worth `hits` cannon bolts. */
  onBodyHit?: (body: ArmoryBody, at: THREE.Vector3, hits: number) => void;
}

interface Missile {
  slot: number;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  carry: THREE.Vector3;
  speed: number;
  life: number; // <0 idle
  target: AlienEnemy | null;
}

interface Ball {
  slot: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number; // <0 idle
  charge: number;
  size: number;
}

export interface Armory {
  readonly weapon: WeaponKind;
  readonly missiles: number;
  /** 0..1 toward the next missile. */
  readonly missileRegen: number;
  /** 0..1 plasma charge held. */
  readonly charge: number;
  readonly lock: LockState;
  /** The craft being locked (or seeking), or null. */
  readonly lockTarget: AlienEnemy | null;
  select: (w: WeaponKind) => void;
  step: (dir: number) => void;
  /** Run a frame; returns the energy spent. */
  update: (f: ArmoryFrame) => number;
  /** Projectiles in flight, for the tests. */
  live: () => { missiles: number; plasma: number };
  clear: () => void;
}

/** Missile flight: launch speed, acceleration, top speed, turn rate, fuel. */
const MISSILE_LAUNCH = 4;
const MISSILE_ACCEL = 40;
const MISSILE_TOP = 30;
const MISSILE_TURN = 3.2;
const MISSILE_LIFE = 3.4;
/** The seeker: how far and how wide it looks, and how long it holds a lock out of the cone. */
const LOCK_RANGE = 52;
const LOCK_CONE = 0.3;
const LOCK_GRACE = 0.3;
const PLASMA_SPEED = 20;
const PLASMA_LIFE = 1.4;

const MISSILE_FLASH = new THREE.Color(3, 1.6, 0.6);
const PLASMA_COL = new THREE.Color(1.4, 1.1, 3.4);

const alive = (e: AlienEnemy | null) => !!e && e.hp > 0 && e.group.visible;

export function makeArmory(o: ArmoryOptions, fx: WeaponFx, sounds: ArmorySounds, hooks: ArmoryHooks = {}): Armory {
  const U = o.unit;
  const H = o.hull;
  let weapon: WeaponKind = 'pulse';
  let missilesLeft = MISSILE_MAX;
  let regen = 0;
  let refire = 0;
  let charge = 0;
  let wasTrigger = false;
  let lock: LockState = '';
  let seekTarget: AlienEnemy | null = null;
  let seekT = 0;
  let lostT = 0;
  let emptyWarned = false;

  const missiles: Missile[] = Array.from({ length: MISSILE_SLOTS }, (_, slot) => ({
    slot, pos: new THREE.Vector3(), dir: new THREE.Vector3(), carry: new THREE.Vector3(), speed: 0, life: -1, target: null,
  }));
  const balls: Ball[] = Array.from({ length: PLASMA_SLOTS }, (_, slot) => ({
    slot, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: -1, charge: 0, size: 0,
  }));
  const prev = new THREE.Vector3();
  const seg = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const v = new THREE.Vector3();

  /** Where along this frame's path a sphere is first touched, or -1. */
  const sweep = (from: THREE.Vector3, to: THREE.Vector3, center: THREE.Vector3, r: number): number => {
    seg.copy(to).sub(from);
    const len2 = seg.lengthSq();
    tmp.copy(center).sub(from);
    const t = len2 > 0 ? THREE.MathUtils.clamp(tmp.dot(seg) / len2, 0, 1) : 0;
    tmp2.copy(from).addScaledVector(seg, t);
    return tmp2.distanceToSquared(center) < r * r ? t : -1;
  };

  const hitEnemy = (f: ArmoryFrame, e: AlienEnemy, dmg: number, at: THREE.Vector3) => {
    const killed = f.aliens.damage(e, dmg);
    hooks.onHit?.(e, killed, at);
  };

  /** A missile goes off at `at`; `direct` already took the full hit. */
  const detonate = (f: ArmoryFrame, at: THREE.Vector3, direct: AlienEnemy | null) => {
    const r = MISSILE_BLAST * S;
    fx.explode(at, r * 0.55);
    f.aliens.spawnSparks(at, S * 5);
    sounds.blast(true);
    hooks.onBlast?.(at, r);
    // The enemies list compacts as craft die: walk a snapshot of its length backwards.
    for (let i = f.aliens.enemies.length - 1; i >= 0; i--) {
      const e = f.aliens.enemies[i];
      if (!e || e === direct || !alive(e)) continue;
      const d = e.group.position.distanceTo(at) - e.radius;
      if (d < r) hitEnemy(f, e, MISSILE_SPLASH, at);
    }
  };

  const freeMissile = (m: Missile) => {
    m.life = -1;
    m.target = null;
    fx.setMissile(m.slot, null);
  };
  const freeBall = (b: Ball) => {
    b.life = -1;
    fx.setPlasma(b.slot, null);
  };

  const launchMissile = (f: ArmoryFrame): boolean => {
    const m = missiles.find((x) => x.life < 0);
    if (!m) return false;
    m.pos.copy(f.origin);
    m.dir.copy(f.fwd);
    m.carry.copy(f.vel);
    m.speed = MISSILE_LAUNCH * U;
    m.life = 0;
    m.target = lock === 'locked' && alive(seekTarget) ? seekTarget : null;
    fx.setMissile(m.slot, m.pos, m.dir);
    fx.muzzle(f.origin, f.fwd, MISSILE_FLASH, 1.4);
    sounds.missile();
    if (hooks.onLaunch) {
      v.copy(m.dir).multiplyScalar(m.speed).add(m.carry);
      hooks.onLaunch('missile', m.pos, v);
    }
    return true;
  };

  const launchBall = (f: ArmoryFrame, k: number): number => {
    const b = balls.find((x) => x.life < 0);
    if (!b) return 0;
    // What the bank can pay for: a low bank fires a smaller ball.
    const affordable = PLASMA_MIN_CHARGE + (1 - PLASMA_MIN_CHARGE) * THREE.MathUtils.clamp((f.energy - PLASMA_ENERGY_MIN) / (PLASMA_ENERGY_MAX - PLASMA_ENERGY_MIN), 0, 1);
    if (f.energy < PLASMA_ENERGY_MIN) {
      sounds.empty();
      return 0;
    }
    const c = Math.min(k, affordable);
    const shot = plasmaShot(c);
    b.charge = c;
    b.size = H * (2.2 + 4 * c);
    b.pos.copy(f.origin);
    b.vel.copy(f.aim).multiplyScalar(PLASMA_SPEED * U).add(f.vel);
    b.life = 0;
    fx.setPlasma(b.slot, b.pos, b.size);
    fx.muzzle(f.origin, f.aim, PLASMA_COL, 1 + 2 * c);
    sounds.plasma(c);
    hooks.onLaunch?.('plasma', b.pos, b.vel);
    return shot.energy;
  };

  /** The seeker: the hostile nearest the nose inside the cone, held for a moment. */
  const seek = (f: ArmoryFrame) => {
    let best: AlienEnemy | null = null;
    let bestDot = Math.cos(LOCK_CONE);
    const range2 = (LOCK_RANGE * U) ** 2;
    for (const e of f.aliens.enemies) {
      if (e.hostile === false || !alive(e)) continue;
      tmp.copy(e.group.position).sub(f.origin);
      const d2 = tmp.lengthSq();
      if (d2 > range2 || d2 < 1e-12) continue;
      const dot = tmp.divideScalar(Math.sqrt(d2)).dot(f.fwd);
      // The one held already keeps it against a near tie.
      const bias = e === seekTarget ? 0.004 : 0;
      if (dot + bias > bestDot) {
        bestDot = dot + bias;
        best = e;
      }
    }
    if (best && best === seekTarget) {
      seekT += f.dt;
      lostT = 0;
    } else if (!best && seekTarget && lock === 'locked' && alive(seekTarget) && lostT < LOCK_GRACE) {
      // Slipped out of the cone: hold the lock a moment before letting go.
      lostT += f.dt;
    } else {
      seekTarget = best;
      seekT = 0;
      lostT = 0;
    }
    const was = lock;
    lock = !seekTarget ? '' : seekT >= MISSILE_LOCK_SEC ? 'locked' : 'seek';
    if (lock === 'locked' && was !== 'locked') sounds.lock();
  };

  const armory: Armory = {
    get weapon() { return weapon; },
    get missiles() { return missilesLeft; },
    get missileRegen() { return missilesLeft >= MISSILE_MAX ? 1 : regen / MISSILE_REGEN_SEC; },
    get charge() { return charge; },
    get lock() { return lock; },
    get lockTarget() { return seekTarget; },
    select(w) {
      if (w === weapon || !WEAPONS.includes(w)) return;
      weapon = w;
      charge = 0;
      lock = '';
      seekTarget = null;
      seekT = 0;
    },
    step(dir) {
      const i = WEAPONS.indexOf(weapon);
      armory.select(WEAPONS[(i + (dir < 0 ? WEAPONS.length - 1 : 1)) % WEAPONS.length]);
    },
    update(f) {
      const dt = f.dt;
      let spent = 0;
      // The rack refills one at a time, whichever weapon is up.
      if (missilesLeft < MISSILE_MAX) {
        regen += dt;
        if (regen >= MISSILE_REGEN_SEC) {
          regen -= MISSILE_REGEN_SEC;
          missilesLeft += 1;
        }
      } else regen = 0;
      refire = Math.max(0, refire - dt);
      const pressed = f.trigger && !wasTrigger;

      if (!f.ready) {
        charge = 0;
        lock = '';
        seekTarget = null;
      } else if (weapon === 'missile') {
        seek(f);
        if (f.trigger && refire <= 0) {
          if (missilesLeft > 0) {
            if (launchMissile(f)) {
              missilesLeft -= 1;
              refire = MISSILE_REFIRE;
              emptyWarned = false;
            }
          } else if (pressed || !emptyWarned) {
            sounds.empty();
            emptyWarned = true;
          }
        }
      } else if (weapon === 'plasma') {
        if (f.trigger) {
          charge = Math.min(1, charge + dt / PLASMA_CHARGE_SEC);
        } else if (wasTrigger && charge > 0) {
          if (charge >= PLASMA_MIN_CHARGE) spent += launchBall(f, charge);
          charge = 0;
        }
      }
      if (weapon !== 'missile') { lock = ''; seekTarget = null; }
      if (weapon !== 'plasma') charge = 0;
      fx.setCharge(tmp.copy(f.origin).addScaledVector(f.fwd, H * 1.2), charge);
      wasTrigger = f.trigger;

      // ── Missiles in flight. ──
      for (const m of missiles) {
        if (m.life < 0) continue;
        m.life += dt;
        if (m.target && !alive(m.target)) m.target = null;
        if (m.target) {
          // Turn toward the target at a limited rate.
          tmp.copy(m.target.group.position).sub(m.pos).normalize();
          const ang = Math.acos(THREE.MathUtils.clamp(m.dir.dot(tmp), -1, 1));
          if (ang > 1e-5) m.dir.lerp(tmp, Math.min(1, (MISSILE_TURN * dt) / ang)).normalize();
        }
        m.speed = Math.min(MISSILE_TOP * U, m.speed + MISSILE_ACCEL * U * dt);
        // The ship's own way bleeds off as the motor takes over.
        m.carry.multiplyScalar(Math.exp(-dt * 1.5));
        prev.copy(m.pos);
        m.pos.addScaledVector(m.dir, m.speed * dt).addScaledVector(m.carry, dt);
        let boom = false;
        let direct: AlienEnemy | null = null;
        const enemies = f.aliens.enemies;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!alive(e)) continue;
          // The proximity fuse: a near miss counts.
          if (sweep(prev, m.pos, e.group.position, e.radius + 0.25 * U) >= 0) {
            m.pos.copy(tmp2);
            direct = e;
            boom = true;
            break;
          }
        }
        if (!boom) {
          for (const b of f.bodies) {
            if (b.destroyed) continue;
            if (sweep(prev, m.pos, b.position, b.radius + (b.kind === 'station' ? 3 * H : 0)) >= 0) {
              m.pos.copy(tmp2);
              hooks.onBodyHit?.(b, m.pos, 3);
              boom = true;
              break;
            }
          }
        }
        if (direct) hitEnemy(f, direct, MISSILE_DAMAGE, m.pos);
        if (boom || m.life > MISSILE_LIFE) {
          detonate(f, m.pos, direct);
          freeMissile(m);
          continue;
        }
        fx.setMissile(m.slot, m.pos, m.dir);
      }

      // ── Plasma balls. ──
      for (const b of balls) {
        if (b.life < 0) continue;
        b.life += dt;
        if (b.life > PLASMA_LIFE) {
          fx.impact(b.pos, PLASMA_COL, b.size * 1.5);
          freeBall(b);
          continue;
        }
        prev.copy(b.pos);
        b.pos.addScaledVector(b.vel, dt);
        let spentBall = false;
        const enemies = f.aliens.enemies;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!alive(e)) continue;
          if (sweep(prev, b.pos, e.group.position, e.radius + b.size * 0.4) >= 0) {
            b.pos.copy(tmp2);
            hitEnemy(f, e, plasmaShot(b.charge).damage, b.pos);
            spentBall = true;
            break;
          }
        }
        if (!spentBall) {
          for (const body of f.bodies) {
            if (body.destroyed) continue;
            if (sweep(prev, b.pos, body.position, body.radius + (body.kind === 'station' ? 3 * H : 0)) >= 0) {
              b.pos.copy(tmp2);
              hooks.onBodyHit?.(body, b.pos, b.charge > 0.7 ? 3 : 2);
              spentBall = true;
              break;
            }
          }
        }
        if (spentBall) {
          fx.explode(b.pos, b.size * 0.9);
          f.aliens.spawnSparks(b.pos, S * (2 + 3 * b.charge));
          sounds.blast(b.charge > 0.7);
          if (b.charge > 0.7) hooks.onBlast?.(b.pos, b.size);
          freeBall(b);
          continue;
        }
        fx.setPlasma(b.slot, b.pos, b.size);
      }
      return spent;
    },
    live() {
      return {
        missiles: missiles.filter((m) => m.life >= 0).length,
        plasma: balls.filter((b) => b.life >= 0).length,
      };
    },
    clear() {
      for (const m of missiles) freeMissile(m);
      for (const b of balls) freeBall(b);
      charge = 0;
      lock = '';
      seekTarget = null;
      seekT = 0;
      wasTrigger = false;
    },
  };
  return armory;
}
