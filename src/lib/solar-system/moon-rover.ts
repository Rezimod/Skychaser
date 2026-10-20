// The rover, driveable. A rocker-bogie six-wheeler on the heightfield: six
// wheels that each find their own ground, the body riding a sprung average
// of them and leaning with the slope; moon-rover-dress draws all of that.
//
// The drive is a real vehicle rather than a cursor. Heading is steered
// directly — so it never fishtails — but velocity is not: grip limits how
// fast sideways motion can be taken out, so ask for more turn than the
// regolith can give at speed and the rover drifts wide, then bites again as
// soon as the wheel is straightened. The handbrake lets the back go on
// purpose. The hill takes speed going up. Weight shifts under the throttle
// and into a turn — a lot, in one-sixth g, on a soft suspension — and over
// a crest at speed the wheels leave the ground: the body flies under the
// world's own gravity, the stick trims its pitch and roll, and it comes
// down with a jolt.
//
// Four gears. Creep turns inside its own length and parks. Cruise is the
// drive out to a site. Sprint is for crossing the mare against the oxygen
// clock and will slide if you ask too much of it. Ion is the fourth, and the
// crew does not have it until the thing in the crater has been opened.

import * as THREE from 'three';
import { MOON_G, type DustHandle } from '@/lib/solar-system/moon-fx';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { PrintsHandle } from '@/lib/solar-system/moon-prints';
import type { TerrainHandle } from '@/lib/solar-system/moon-terrain';
import type { LightPool } from '@/lib/solar-system/moon-lights';
import { makeRoverDress, type DressState } from '@/lib/solar-system/moon-rover-dress';

/** The parts of the rover the drive articulates, built by moon-rover-mesh. */
export interface RoverParts {
  spin: THREE.Object3D[];
  /** The four corner uprights, turned to steer, in ROVER_CORNERS order. */
  steer: THREE.Object3D[];
  /** The four wishbone arms, rotated about Z as the suspension takes up the twist. */
  arms: THREE.Object3D[];
  /** Where each wheel meets the ground, in the body's frame, in ROVER_CORNERS
   *  order: the −X side front and rear, then the +X side. */
  wheelXZ: [number, number][];
  mast: THREE.Object3D;
  /** The driver's eye, for the cockpit view. */
  seat: THREE.Object3D;
  /** Where the headlight is; the light itself is asked of the pool each frame. */
  headlight: THREE.Object3D;
  /** The arm's shoulder and elbow: stowed on the move, unfolded at rest. */
  arm: THREE.Object3D[];
  brakeLight: THREE.MeshStandardMaterial;
  ionMat: THREE.MeshStandardMaterial;
}

export type RoverGear = 'creep' | 'cruise' | 'sprint' | 'ion';

interface GearSpec {
  top: number;
  accel: number;
  coast: number;
  brake: number;
  /** Yaw rate at full lock, rad/s, and the speed over which it halves. */
  steer: number;
  steerFade: number;
  /** Sideways acceleration the wheels can take out, m/s². */
  grip: number;
  pivot: boolean;
}
const SPEC: Record<RoverGear, GearSpec> = {
  creep: { top: 3.0, accel: 2.6, coast: 3.2, brake: 5.5, steer: 1.05, steerFade: 6, grip: 9, pivot: true },
  cruise: { top: 8.0, accel: 3.2, coast: 2.3, brake: 5.0, steer: 0.95, steerFade: 9, grip: 7, pivot: false },
  sprint: { top: 15.0, accel: 4.4, coast: 1.7, brake: 4.8, steer: 0.9, steerFade: 11, grip: 4.2, pivot: false },
  ion: { top: 26.0, accel: 7.2, coast: 1.0, brake: 5.8, steer: 0.85, steerFade: 14, grip: 3.2, pivot: false },
};

export interface RoverHandle {
  /** Signed speed along the heading, m/s. */
  speed: number;
  /** Sideways speed, m/s: how much it is sliding. */
  slip: number;
  yaw: number;
  yawRate: number;
  driving: boolean;
  /** All six wheels off the ground. */
  airborne: boolean;
  gear: RoverGear;
  gears: RoverGear[];
  shift: (dir: number) => void;
  select: (index: number) => void;
  unlock: (gear: RoverGear) => void;
  top: number;
  battery: number;
  charge: (dt: number) => void;
  /** A meaningful jolt this step, 0…1, for the camera. */
  bump: number;
  /** Where the body is, smoothed: the camera anchor. */
  position: THREE.Vector3;
  update: (dt: number, throttle: number, steer: number, colliders: Collider[], walkRadius: number, handbrake?: boolean) => void;
  present: (alpha: number) => void;
  /** Once a frame: the headlight, while it is on. */
  light: (pool: LightPool) => void;
}

const EARTH_G = 9.81;
/** How far the wheels can drop before the body is flying, m. */
const AIR_GAP = 0.32;

export function makeRover(group: THREE.Group, collider: Collider, parts: RoverParts, terrain: TerrainHandle, dust: DustHandle, prints: PrintsHandle, gears: RoverGear[] = ['creep', 'cruise', 'sprint'], g = MOON_G): RoverHandle {
  const up = new THREE.Vector3(0, 1, 0);
  const yawQ = new THREE.Quaternion();
  const tiltQ = new THREE.Quaternion();
  const tilt = new THREE.Euler();
  const heights = new Float32Array(4);
  const dress = makeRoverDress(parts, terrain, dust, prints);
  // Suspension tuned to the load it carries: softer and slower under less weight.
  const heaveW = 13 * Math.pow(g / EARTH_G, 0.25);
  const heaveZ = 0.72;
  // A given push shifts more weight when there is less of it holding the body down.
  const transfer = Math.sqrt(EARTH_G / g);
  let vx = 0; let vz = 0;
  let pitch = 0; let roll = 0;
  let heave = group.position.y; let heaveVel = 0;
  let lastSpeed = 0;
  let spin = 0;
  let lamp = 0;
  const lampAt = new THREE.Vector3();
  const prevPos = new THREE.Vector3().copy(group.position);
  const curPos = new THREE.Vector3().copy(group.position);
  const prevQ = new THREE.Quaternion().copy(group.quaternion);
  const curQ = new THREE.Quaternion().copy(group.quaternion);
  const ds: DressState = {
    x: 0, z: 0, yaw: 0, speed: 0, slip: 0, spin: 0, driving: false, steer: 0, pivot: false, braking: false, airborne: false,
    heights, pitch: 0, gearIon: false, ionOwned: false, vx: 0, vz: 0,
  };

  const handle: RoverHandle = {
    speed: 0, slip: 0, yaw: group.rotation.y, yawRate: 0, driving: false, airborne: false, gear: 'cruise', gears, top: SPEC.cruise.top,
    battery: 1, bump: 0, position: curPos,
    shift(dir) { handle.select(handle.gears.indexOf(handle.gear) + dir); },
    select(index) {
      const list = handle.gears;
      handle.gear = list[THREE.MathUtils.clamp(Math.round(index), 0, list.length - 1)];
      handle.top = SPEC[handle.gear].top;
    },
    unlock(gear) { if (!handle.gears.includes(gear)) handle.gears.push(gear); },
    charge(dt) { handle.battery = Math.min(1, handle.battery + dt * 0.08); },
    update(dt, throttleIn, steerIn, colliders, walkRadius, handbrake = false) {
      prevPos.copy(curPos);
      prevQ.copy(curQ);
      lamp += ((handle.driving ? 1 : 0) - lamp) * (1 - Math.exp(-dt * 4));
      // Parked, and nothing moving: no ground to sample, nothing to push off.
      if (!handle.driving && !handle.airborne && Math.abs(handle.speed) < 0.01 && Math.abs(heaveVel) < 0.01 && handle.bump < 0.001 && Math.abs(vx) + Math.abs(vz) < 0.01) {
        handle.speed = 0; handle.slip = 0; handle.yawRate = 0; vx = 0; vz = 0; lastSpeed = 0;
        ds.speed = 0; ds.slip = 0; ds.spin = 0; ds.driving = false; ds.steer = 0; ds.braking = false; ds.airborne = false; ds.vx = 0; ds.vz = 0;
        ds.gearIon = handle.gear === 'ion'; ds.ionOwned = handle.gears.includes('ion');
        dress(dt, ds);
        return;
      }
      const spec = SPEC[handle.gear];
      const top = handle.battery < 0.04 ? Math.min(spec.top, 3) : spec.top;
      handle.top = spec.top;
      const throttle = Math.sign(throttleIn) * Math.pow(Math.abs(throttleIn), 1.35);
      const steer = Math.sign(steerIn) * Math.pow(Math.abs(steerIn), 1.2);
      const airborne = handle.airborne;
      const speedBefore = Math.abs(vx * Math.sin(handle.yaw) + vz * Math.cos(handle.yaw));
      const goingBack = vx * Math.sin(handle.yaw) + vz * Math.cos(handle.yaw) < -0.2;
      const authority = spec.pivot ? 1 : THREE.MathUtils.clamp(speedBefore / 2.0, 0, 1);
      // With the back let go, the nose comes round faster than the wheels would take it.
      const brakeTurn = handbrake && speedBefore > 1.5 ? 1.8 : 1;
      const wantRate = handle.driving && !airborne ? -steer * spec.steer * authority * brakeTurn / (1 + speedBefore / spec.steerFade) * (goingBack ? -1 : 1) : airborne ? handle.yawRate : 0;
      handle.yawRate += (wantRate - handle.yawRate) * (1 - Math.exp(-dt * 8));
      handle.yaw += handle.yawRate * dt;
      const c = Math.cos(handle.yaw); const s = Math.sin(handle.yaw);
      let fwd = vx * s + vz * c;
      let lat = vx * c - vz * s;
      spin *= Math.exp(-dt * 6);
      if (airborne) {
        // Nothing to push against.
      } else if (handle.driving && !handbrake) {
        const target = throttle >= 0 ? throttle * top : throttle * Math.min(top * 0.4, 4);
        const opposing = Math.abs(fwd) > 0.2 && target !== 0 && Math.sign(target) !== Math.sign(fwd);
        const launch = 1 + 0.8 * Math.max(0, 1 - Math.abs(fwd) / (spec.top * 0.35));
        const rate = opposing ? spec.brake : Math.abs(target) < Math.abs(fwd) ? spec.coast : spec.accel * launch;
        const asked = Math.min(Math.abs(target - fwd) / dt, rate);
        fwd += THREE.MathUtils.clamp(target - fwd, -rate * dt, rate * dt);
        // Torque beyond what the regolith holds spins the wheels — a show, and dust.
        if (!opposing && Math.abs(throttle) > 0.5) spin = Math.max(spin, THREE.MathUtils.clamp((asked - 0.9 * g) / (2 * g), 0, 1));
      } else if (handle.driving) {
        fwd -= THREE.MathUtils.clamp(fwd, -spec.brake * 0.7 * dt, spec.brake * 0.7 * dt);
      } else {
        fwd *= Math.exp(-dt * 2);
      }
      const slope = (heights[0] + heights[2] - heights[1] - heights[3]) / 2 / 2.24;
      if (!airborne) fwd -= g * THREE.MathUtils.clamp(slope, -0.6, 0.6) * dt;
      if (!handle.driving && !airborne && Math.abs(fwd) < 0.6) fwd -= THREE.MathUtils.clamp(fwd, -6 * dt, 6 * dt);

      const speed = Math.abs(fwd);
      // Grip takes the sideways motion out at the rate the gear allows; a locked back axle barely does.
      const grip = airborne ? 0 : handbrake ? spec.grip * 0.22 : spec.grip;
      lat -= THREE.MathUtils.clamp(lat, -grip * dt, grip * dt);
      vx = fwd * s + lat * c;
      vz = fwd * c - lat * s;

      let x = curPos.x + vx * dt;
      let z = curPos.z + vz * dt;
      const rr = Math.hypot(x, z);
      const edge = walkRadius - 2;
      if (rr > edge) {
        x *= edge / rr; z *= edge / rr;
        const vn = (vx * x + vz * z) / edge;
        if (vn > 0) { vx -= vn * x / edge; vz -= vn * z / edge; }
      }
      handle.bump *= Math.exp(-dt * 6);
      for (const col of colliders) {
        if (col === collider) continue;
        const dx = x - col.x; const dz = z - col.z;
        const d = Math.hypot(dx, dz);
        const min = col.r + collider.r;
        if (d < min && d > 1e-4) {
          const nx = dx / d; const nz = dz / d;
          x += nx * (min - d);
          z += nz * (min - d);
          const vn = vx * nx + vz * nz;
          if (vn < 0) {
            vx -= vn * nx; vz -= vn * nz;
            handle.bump = Math.max(handle.bump, Math.min(1, -vn / 6));
          }
        }
      }
      curPos.x = x; curPos.z = z;
      collider.x = x; collider.z = z;
      handle.speed = vx * s + vz * c;
      handle.slip = Math.abs(vx * c - vz * s);
      handle.battery = Math.max(0, handle.battery - Math.abs(handle.speed) * dt * 0.00011);

      // ── Four wheels, four grounds. On them, the body rides a sprung mean
      // and leans with the slope and the load shift; off them, it flies. ──
      for (let i = 0; i < 4; i++) {
        const [lx, lz] = parts.wheelXZ[i];
        heights[i] = terrain.heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
      }
      const left = (heights[0] + heights[1]) / 2;
      const right = (heights[2] + heights[3]) / 2;
      const front = (heights[0] + heights[2]) / 2;
      const rear = (heights[1] + heights[3]) / 2;
      const ground = (left + right) / 2;
      const was = heaveVel;
      if (heave - ground > AIR_GAP) {
        // Over a crest and off it: gravity alone.
        handle.airborne = true;
        heaveVel -= g * dt;
      } else {
        heaveVel += ((ground - heave) * heaveW * heaveW - heaveVel * 2 * heaveZ * heaveW) * dt;
        if (airborne) handle.bump = Math.max(handle.bump, Math.min(1, -was / 4));
        handle.airborne = false;
      }
      heave += heaveVel * dt;
      let highest = -Infinity;
      for (let i = 0; i < 4; i++) if (heights[i] > highest) highest = heights[i];
      if (heave < highest - 0.14) { heave = highest - 0.14; heaveVel = Math.max(0, heaveVel); }
      const jolt = Math.abs(heaveVel - was) / dt;
      if (jolt > 26) handle.bump = Math.max(handle.bump, Math.min(1, (jolt - 26) / 60));
      curPos.y = heave;
      const k = 1 - Math.exp(-dt * 10);
      const accel = THREE.MathUtils.clamp((handle.speed - lastSpeed) / dt, -6, 6);
      if (handle.airborne) {
        // The stick trims the body in the air; nothing else does.
        pitch += (handle.driving ? -throttle * 0.6 : 0) * dt;
        roll += (handle.driving ? steer * 0.5 : 0) * dt;
      } else {
        pitch += (-Math.atan2(front - rear, 2.24) + accel * 0.006 * transfer - pitch) * k;
        roll += (Math.atan2(right - left, 1.6) + handle.yawRate * handle.speed * 0.004 * transfer - roll) * k;
      }
      yawQ.setFromAxisAngle(up, handle.yaw);
      tilt.set(pitch, 0, roll);
      tiltQ.setFromEuler(tilt);
      curQ.copy(yawQ).multiply(tiltQ);
      const braking = Math.abs(handle.speed) < Math.abs(lastSpeed) - 0.01 && Math.abs(handle.speed) > 0.2;
      lastSpeed = handle.speed;
      ds.x = x; ds.z = z; ds.yaw = handle.yaw; ds.speed = handle.speed; ds.slip = handle.slip; ds.spin = spin;
      ds.driving = handle.driving; ds.steer = steer; ds.pivot = spec.pivot; ds.braking = braking || (handbrake && speed > 0.2);
      ds.airborne = handle.airborne; ds.pitch = pitch; ds.gearIon = handle.gear === 'ion'; ds.ionOwned = handle.gears.includes('ion');
      ds.vx = vx; ds.vz = vz;
      dress(dt, ds);
    },
    present(alpha) {
      group.position.lerpVectors(prevPos, curPos, alpha);
      group.quaternion.slerpQuaternions(prevQ, curQ, alpha);
    },
    light(pool) {
      if (lamp < 0.02) return;
      parts.headlight.getWorldPosition(lampAt);
      // A little ahead and down, so the beam reads on the ground.
      pool.request(lampAt.x + Math.sin(handle.yaw) * 3, lampAt.y - 0.5, lampAt.z + Math.cos(handle.yaw) * 3, 0xfff4dc, lamp * 9, 24, 1.6);
    },
  };
  curPos.y = heave = terrain.heightAt(curPos.x, curPos.z);
  prevPos.copy(curPos);
  return handle;
}
