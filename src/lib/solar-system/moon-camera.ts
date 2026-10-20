// The chase camera. What makes a third-person game feel quick is mostly
// here: the camera answers the stick at once and trails the crew by a
// fraction of a second, not by a leash. The focus point is sprung toward the
// target — tight horizontally, softer vertically so a lunar bound does not
// yank the horizon — and led slightly by velocity so the crew runs into the
// frame rather than out of it. On the move the view sits over one shoulder
// (swappable), standing it drifts halfway back to the middle, and a second
// and a half after the last look input it eases round behind the direction
// of travel. The springs are solved exactly, so a long frame lands them
// closer and never throws them past their mark. A marched ray
// pulls the camera in front of anything between it and the crew, at once,
// and lets it back out gently. Speed widens the lens a little; shake is a
// smooth decaying wobble rather than per-frame noise. Weight comes from the
// feet, not a sine: each footfall and each landing kicks a small spring that
// dips the view and lets it come back.

import * as THREE from 'three';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import { getSettings } from '@/game/settings';

export interface ChaseTarget {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** The target's own heading, rad, +Z forward at 0. */
  yaw: number;
  /** Look height above `position`, m, and preferred distance, m. */
  height: number;
  distance: number;
  /** 0 standing … 1 flat out, for the lens and the pull-back. */
  speedFrac: number;
  /** Extra lens, degrees: a sprint. */
  fovExtra?: number;
}

export interface ChaseTuning {
  /** How fast yaw eases behind the heading when moving, 1/s. */
  follow: number;
  /** Velocity lead, s, and its cap, m. */
  lead: number;
  leadMax: number;
  /** Extra field of view at full speed, degrees. */
  fovKick: number;
  /** Spring stiffness of the focus, horizontal and vertical (rad/s). */
  horizontal: number;
  vertical: number;
  /** Keep the camera under a roof and inside a radius (a habitat interior). */
  room?: { x: number; z: number; y: number; r: number } | null;
  /** Somewhere the camera may not be, for a place built of walls rather than
   *  of round footprints. Given it, the ground and the colliders are not
   *  consulted at all: this is the whole answer. */
  blocked?: ((x: number, y: number, z: number) => boolean) | null;
  /** Look past the crew's shoulder rather than through their pack: the
   *  focus sits this far to the side the rig has chosen, m. */
  shoulder?: number;
}

export interface CameraRig {
  yaw: number;
  pitch: number;
  /** First-person look pitch. */
  lookPitch: number;
  /** User zoom: the preferred chase distance, m. */
  distance: number;
  /** Which shoulder the view looks over: +1 right, −1 left. */
  shoulderSide: number;
  swapShoulder: () => void;
  /** Mouse, touch drag and right stick all come through here. */
  orbit: (dx: number, dy: number, firstPerson: boolean) => void;
  /** Wheel steps, + out; returns true when pushed out past the far stop. */
  zoom: (steps: number) => boolean;
  /** The player changed the lens in the settings. */
  setBaseFov: (deg: number) => void;
  chase: (dt: number, target: ChaseTarget, tune: ChaseTuning) => void;
  /** Look from a point along camera yaw and look pitch (helmet, seat, mast). */
  firstPerson: (dt: number, eye: THREE.Vector3, smooth: number) => void;
  /** Jump straight to the target next chase, with no spring. */
  snap: () => void;
  /** Add a shake impulse, 0…1. */
  shake: (amount: number) => void;
  /** A boot came down, 0…1 how hard; `weight` scales the dip (heavy gaits only). */
  footfall: (hard: number, weight?: number) => void;
  /** The body landed at this vertical speed, m/s. */
  land: (impact: number) => void;
  /** Seconds since the pointer last turned the camera. */
  dragAge: () => number;
  update: (dt: number) => void;
}

const CAM_MIN = 2.6;
const CAM_MAX = 10;
/** The footfall spring's stiffness and damping, and the longest step it is integrated in, s. */
const BOB_K = 110;
const BOB_C = 13;
const BOB_STEP = 1 / 120;
const AXES = ['x', 'y', 'z'] as const;

/** A critically damped spring toward `goal`, solved exactly over `dt`
 *  rather than stepped: a long frame lands it closer, never past. Stiffness
 *  `horizontal` on x and z, `vertical` on y (rad/s). */
export function springTo(pos: THREE.Vector3, vel: THREE.Vector3, goal: THREE.Vector3, horizontal: number, vertical: number, dt: number) {
  for (const axis of AXES) {
    const omega = axis === 'y' ? vertical : horizontal;
    const d = pos[axis] - goal[axis];
    const e = Math.exp(-omega * dt);
    const k = (vel[axis] + omega * d) * dt;
    pos[axis] = goal[axis] + (d + k) * e;
    vel[axis] = (vel[axis] - omega * k) * e;
  }
}
/** Seconds after the last look input before the view recentres behind the movement. */
const RECENTER_AFTER = 1.5;

export function makeCameraRig(
  camera: THREE.PerspectiveCamera,
  floorAt: (x: number, z: number) => number,
  colliders: () => Collider[],
  baseFovIn: number,
): CameraRig {
  const focus = new THREE.Vector3();
  const focusVel = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const want = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const look = new THREE.Vector3();
  let snapNext = true;
  let actualDist = 5;
  let drag = 99;
  let baseFov = baseFovIn;
  let fov = baseFov;
  let shakeAmp = 0;
  let shakeT = 0;
  let bob = 0;
  let bobVel = 0;
  let shoulderK = 1;
  /** How far over the shoulder the view sits: all the way on the move, half standing. */
  let framing = 0.5;
  let desiredNow = -1;
  const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  /** How far along focus→want the view is clear, 0…1. */
  const clearance = (roomY: number | null, blocked?: ((x: number, y: number, z: number) => boolean) | null): number => {
    const steps = 10;
    if (blocked) {
      for (let i = 1; i <= steps; i++) {
        probe.lerpVectors(focus, want, i / steps);
        if (blocked(probe.x, probe.y, probe.z)) return (i - 1) / steps;
      }
      return 1;
    }
    const cols = colliders();
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      probe.lerpVectors(focus, want, f);
      if (probe.y < floorAt(probe.x, probe.z) + 0.35) return (i - 1) / steps;
      if (roomY !== null) continue;
      for (const c of cols) {
        if (probe.y > focus.y + 5) break;
        const rr = c.r + 0.3;
        // What the target is standing in (a ramp, the rover it drives) is not in the way.
        const fx = focus.x - c.x; const fz = focus.z - c.z;
        if (fx * fx + fz * fz < rr * rr) continue;
        const dx = probe.x - c.x; const dz = probe.z - c.z;
        if (dx * dx + dz * dz < rr * rr) return (i - 1) / steps;
      }
    }
    return 1;
  };

  const rig: CameraRig = {
    yaw: Math.PI, pitch: 0.3, lookPitch: 0, distance: 5.2, shoulderSide: 1,
    swapShoulder() { rig.shoulderSide = -rig.shoulderSide; },
    orbit(dx, dy, firstPerson) {
      if (dx === 0 && dy === 0) return;
      const s = getSettings();
      dx *= s.sensitivity;
      dy *= s.invertY ? -s.sensitivity : s.sensitivity;
      rig.yaw -= dx * (firstPerson ? 0.0036 : 0.0052);
      if (firstPerson) rig.lookPitch = THREE.MathUtils.clamp(rig.lookPitch - dy * 0.0032, -1.2, 1.1);
      else rig.pitch = THREE.MathUtils.clamp(rig.pitch + dy * 0.004, -0.12, 1.15);
      drag = 0;
    },
    setBaseFov(deg) { baseFov = deg; },
    zoom(steps) {
      if (!steps) return false;
      const past = steps > 0 && rig.distance >= CAM_MAX - 1e-6;
      rig.distance = THREE.MathUtils.clamp(rig.distance * Math.pow(1.12, steps), CAM_MIN, CAM_MAX);
      return past;
    },
    snap() { snapNext = true; },
    shake(amount) { shakeAmp = Math.max(shakeAmp, amount); },
    footfall(hard, weight = 1) { bobVel -= (0.05 + hard * 0.3) * weight; },
    land(impact) { bobVel -= Math.min(1.6, impact * 0.28); },
    dragAge: () => drag,
    update(dt) {
      drag += dt;
      shakeAmp *= Math.exp(-dt * 3.2);
      shakeT += dt;
      // Underdamped, so it is stepped finely: a hitch must not throw the view.
      for (let left = dt; left > 1e-6; left -= BOB_STEP) {
        const h = Math.min(BOB_STEP, left);
        bobVel += (-bob * BOB_K - bobVel * BOB_C) * h;
        bob += bobVel * h;
      }
      shoulderK += (rig.shoulderSide - shoulderK) * (1 - Math.exp(-dt * 6));
    },
    chase(dt, target, tune) {
      // Ease round behind the direction of travel — only when going forward
      // relative to the view, so backing toward the camera never spins it.
      const vx = target.velocity.x; const vz = target.velocity.z;
      const sp = Math.hypot(vx, vz);
      if (drag > RECENTER_AFTER && sp > 0.8) {
        const forward = (-Math.sin(rig.yaw) * vx - Math.cos(rig.yaw) * vz) / sp;
        if (forward > -0.2) {
          const rate = tune.follow * Math.min(1, sp / 2.5) * (0.35 + 0.65 * Math.max(0, forward));
          rig.yaw += wrap(target.yaw + Math.PI - rig.yaw) * (1 - Math.exp(-dt * rate));
        }
      }
      const leadX = THREE.MathUtils.clamp(vx * tune.lead, -tune.leadMax, tune.leadMax);
      const leadZ = THREE.MathUtils.clamp(vz * tune.lead, -tune.leadMax, tune.leadMax);
      goal.set(target.position.x + leadX, target.position.y + target.height, target.position.z + leadZ);
      framing += ((sp > 0.6 ? 1 : 0.5) - framing) * (1 - Math.exp(-dt * 1.8));
      if (tune.shoulder) {
        const side = tune.shoulder * shoulderK * framing;
        goal.x += Math.cos(rig.yaw) * side; goal.z -= Math.sin(rig.yaw) * side;
      }
      if (snapNext) {
        focus.copy(goal);
        focusVel.set(0, 0, 0);
      } else {
        springTo(focus, focusVel, goal, tune.horizontal, tune.vertical, dt);
      }
      // The preferred distance itself eases — into a tighter interior framing, back out through a door.
      const wantDist = target.distance * (1 + 0.14 * target.speedFrac);
      if (snapNext || desiredNow < 0) desiredNow = wantDist;
      else desiredNow += (wantDist - desiredNow) * (1 - Math.exp(-dt * 3.5));
      const desired = desiredNow;
      const cp = Math.cos(rig.pitch);
      want.set(focus.x + Math.sin(rig.yaw) * desired * cp, focus.y + Math.sin(rig.pitch) * desired, focus.z + Math.cos(rig.yaw) * desired * cp);
      if (tune.room) {
        const dx = want.x - tune.room.x; const dz = want.z - tune.room.z;
        const r = Math.hypot(dx, dz);
        if (r > tune.room.r) { want.x = tune.room.x + dx / r * tune.room.r; want.z = tune.room.z + dz / r * tune.room.r; }
        if (want.y > tune.room.y) want.y = tune.room.y;
      }
      const clear = clearance(tune.room ? tune.room.y : null, tune.blocked);
      // Somewhere built of walls, the camera comes all the way in rather than
      // stopping at a comfortable distance inside one: a corridor is narrower
      // than any distance that would look good in the open.
      const closest = tune.blocked ? 0.55 : 1.2;
      const hitDist = Math.max(closest, desired * clear - (clear < 1 ? 0.3 : 0));
      // In at once, out gently.
      if (snapNext || hitDist < actualDist) actualDist = hitDist;
      else actualDist += (hitDist - actualDist) * (1 - Math.exp(-dt * 3));
      snapNext = false;
      camera.position.lerpVectors(focus, want, actualDist / desired);
      // Pulled right in, the camera climbs and looks over the helmet rather
      // than filling the frame with the pack.
      const tuck = tune.blocked ? THREE.MathUtils.clamp(1 - actualDist / 1.4, 0, 1) : 0;
      camera.position.y += tuck * 0.42;
      const floor = floorAt(camera.position.x, camera.position.z) + 0.45;
      if (camera.position.y < floor) camera.position.y = floor;
      if (shakeAmp > 0.002) {
        const a = shakeAmp * 0.2;
        camera.position.x += Math.sin(shakeT * 31.7) * Math.sin(shakeT * 13.1) * a;
        camera.position.y += Math.sin(shakeT * 27.3 + 1.3) * a * 0.7;
        camera.position.z += Math.sin(shakeT * 23.9 + 2.1) * Math.sin(shakeT * 11.3) * a;
      }
      camera.position.y += bob * 0.5;
      look.copy(focus);
      look.y += bob * 0.2 + tuck * 0.22;
      camera.lookAt(look);
      fov += (baseFov + tune.fovKick * target.speedFrac + (target.fovExtra ?? 0) - fov) * (1 - Math.exp(-dt * 2.5));
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
    firstPerson(dt, eye, smooth) {
      if (smooth > 0 && !snapNext) camera.position.lerp(eye, 1 - Math.exp(-dt * smooth));
      else camera.position.copy(eye);
      snapNext = false;
      if (shakeAmp > 0.002) camera.position.y += Math.sin(shakeT * 29) * shakeAmp * 0.05;
      camera.position.y += bob;
      const cpitch = Math.cos(rig.lookPitch);
      look.set(camera.position.x - Math.sin(rig.yaw) * cpitch, camera.position.y + Math.sin(rig.lookPitch), camera.position.z - Math.cos(rig.yaw) * cpitch);
      camera.lookAt(look);
      fov += (baseFov - fov) * (1 - Math.exp(-dt * 4));
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
  return rig;
}
