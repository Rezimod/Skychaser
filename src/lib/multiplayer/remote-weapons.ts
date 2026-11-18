// The other explorers' missiles, plasma and blasts, as remote-fleet.ts hands
// them over off the wire. A missile is drawn flying on the line it was
// launched on (its homing is the sender's own business) until the sender's
// blast arrives, which takes it down and goes off where the sender saw it.
// The lighter effects set, and fixed pools: a busy room cannot grow them.

import * as THREE from 'three';
import { makeWeaponFx, MISSILE_SLOTS, PLASMA_SLOTS } from '@/lib/solar-system/weapon-fx';
import type { ShotWeapon } from '@/lib/multiplayer/room-link';

const MISSILE_LIFE_S = 3.4;
/** The motor's push after launch, and how much speed it adds at most, in
 *  flight units (armory.ts), so a remote missile keeps pace with the real one. */
const MISSILE_ACCEL = 40;
const MISSILE_GAIN = 26;
const PLASMA_LIFE_S = 1.4;
const MISSILE_COL = new THREE.Color(3, 1.6, 0.6);

interface Flier {
  slot: number;
  owner: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  dir: THREE.Vector3;
  life: number; // <0 idle
}

export interface RemoteWeapons {
  group: THREE.Group;
  /** A shot of gun `w` from `owner`, at `pos` with `vel`, already `age` seconds old. */
  spawn: (w: ShotWeapon, owner: string, pos: THREE.Vector3, vel: THREE.Vector3, age: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

export function makeRemoteWeapons(hull: number): RemoteWeapons {
  const fx = makeWeaponFx({ unit: hull * 4, lite: true });
  const fliers = (n: number) => Array.from({ length: n }, (_, slot): Flier => ({
    slot, owner: '', pos: new THREE.Vector3(), vel: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), life: -1,
  }));
  const missiles = fliers(MISSILE_SLOTS);
  const balls = fliers(PLASMA_SLOTS);
  const tmp = new THREE.Vector3();
  /** Flight units, from the hull (player-ship: H = 0.044 U). */
  const U = hull / 0.044;

  const launch = (list: Flier[], owner: string, pos: THREE.Vector3, vel: THREE.Vector3, age: number) => {
    const f = list.find((x) => x.life < 0);
    if (!f) return null;
    f.owner = owner;
    f.vel.copy(vel);
    f.pos.copy(pos).addScaledVector(vel, age);
    const speed = vel.length();
    if (speed > 1e-9) f.dir.copy(vel).divideScalar(speed);
    f.life = age;
    return f;
  };

  return {
    group: fx.group,
    spawn(w, owner, pos, vel, age) {
      if (w === 'm') {
        const f = launch(missiles, owner, pos, vel, age);
        if (f) fx.setMissile(f.slot, f.pos, f.dir);
      } else if (w === 'p') {
        const f = launch(balls, owner, pos, vel, age);
        if (f) fx.setPlasma(f.slot, f.pos, hull * 4);
      } else {
        // The sender's missile nearest the blast is the one that went off.
        let best: Flier | null = null;
        let bestD = Infinity;
        for (const m of missiles) {
          if (m.life < 0 || m.owner !== owner) continue;
          const d = m.pos.distanceToSquared(pos);
          if (d < bestD) { bestD = d; best = m; }
        }
        if (best) {
          best.life = -1;
          fx.setMissile(best.slot, null);
        }
        fx.explode(pos, hull * 6);
      }
    },
    update(dt) {
      for (const m of missiles) {
        if (m.life < 0) continue;
        m.life += dt;
        if (m.life > MISSILE_LIFE_S) {
          m.life = -1;
          fx.setMissile(m.slot, null);
          fx.impact(m.pos, MISSILE_COL, hull * 4);
          continue;
        }
        m.pos.addScaledVector(m.vel, dt).addScaledVector(m.dir, Math.min(MISSILE_GAIN, MISSILE_ACCEL * m.life) * U * dt);
        fx.setMissile(m.slot, m.pos, m.dir);
      }
      for (const b of balls) {
        if (b.life < 0) continue;
        b.life += dt;
        if (b.life > PLASMA_LIFE_S) {
          b.life = -1;
          fx.setPlasma(b.slot, null);
          continue;
        }
        b.pos.addScaledVector(b.vel, dt);
        fx.setPlasma(b.slot, tmp.copy(b.pos), hull * 4);
      }
      fx.update(dt);
    },
    dispose() {
      fx.dispose();
    },
  };
}
