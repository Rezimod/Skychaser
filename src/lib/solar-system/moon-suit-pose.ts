// Putting the body on top of the motion. The boots are wherever the
// locomotion planted them and the legs are solved onto them (two bones,
// knee and hip limited by the suit), so a planted boot cannot slide; the
// hips ride as high as the planted legs allow, drop on a landing and ease
// over a step; the torso leans into the push the boots are making and into
// a turn; the arms counter-swing the legs on springs and reach for a vault;
// the pack lags the bounce; the chest breathes with the effort. Sitting,
// rolling, vaulting and going down are poses blended in over all of that.

import * as THREE from 'three';
import { HELMET_C, HIP_H, SHIN, THIGH, type SuitRig } from '@/lib/solar-system/moon-suit-mesh';
import type { Locomotion } from '@/lib/solar-system/suit-locomotion';

/** Blend weights, 0…1, eased by the owner so nothing snaps. */
export interface PoseBlend {
  crouch: number;
  work: number;
  climb: number;
  brake: number;
  look: number;
  fall: number;
  run: number;
  sprint: number;
  vault: number;
  seat: number;
  roll: number;
  tuck: number;
  /** Landing compression, a spring the owner integrates. */
  squat: number;
  /** Riding the jetpack: a lean into the thrust, legs trailing, arms out. */
  jet: number;
  /** Seconds in the air this flight. */
  airT: number;
  clock: number;
  /** Helmet view: head follows the look; otherwise it idles. */
  lookYaw: number | null;
  lookPitch: number;
  breath: number;
  /** Visor up, 0…1. */
  visor: number;
}

/** Ankle to the sole's tread, m. */
export const SOLE = 0.12;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const hipAt = new THREE.Vector3();

/**
 * Two bones onto a point, in the hip's parent (pelvis) frame. Three's Euler
 * order is XYZ, so a leg point p is rotated Rx(α)·Rz(θ)·p: θ swings the leg
 * out, α swings it fore and aft, and the knee folds back by β.
 */
export function solveLeg(tx: number, ty: number, tz: number, kneeMax: number): { alpha: number; theta: number; beta: number } {
  const T = THIGH; const S = SHIN;
  const d = clamp(Math.hypot(tx, ty, tz), 0.25, T + S - 1e-3);
  const theta = clamp(Math.atan2(tx, -ty), -0.35, 0.35);
  const py = -Math.hypot(tx, ty) * (ty > 0 ? -1 : 1);
  const phi = Math.atan2(-tz, -py);
  const alpha = phi - Math.acos(clamp((T * T + d * d - S * S) / (2 * T * d), -1, 1));
  const cosGamma = clamp((T * T + S * S - d * d) / (2 * T * S), -1, 1);
  const beta = clamp(Math.PI - Math.acos(cosGamma), 0.02, kneeMax);
  return { alpha: clamp(alpha, -1.15, 0.65), theta, beta };
}

export interface SuitPoser {
  /** Legs onto the boots, hips as high as they allow — in the frame of the drawn (interpolated) suit. */
  legs: (b: PoseBlend) => void;
  /** Torso, arms, pack and head from the motion; call once per simulation step. */
  body: (dt: number, b: PoseBlend) => void;
  eyeLocal: THREE.Vector3;
}

export function makeSuitPoser(rig: SuitRig, loco: Locomotion, bareHead: boolean): SuitPoser {
  const { group, body, pelvis, chest, pack, neck, visor, sides, shoulders, elbows, hands, hips, knees, ankles } = rig;
  const ls = loco.state;
  const arm = [0, 0]; const armVel = [0, 0];
  let packRot = 0; let packVel = 0; let lastBodyVy = 0; let lastBodyY = 0;
  let stumbleRoll = 1;
  const eyeLocal = bareHead ? new THREE.Vector3(0, 0.16, 0.1) : new THREE.Vector3(0, HELMET_C, 0.08);

  const legs = (b: PoseBlend) => {
    const P = loco.profile;
    const cy = Math.cos(group.rotation.y); const sy = Math.sin(group.rotation.y);
    const local = (i: number, out: THREE.Vector3) => {
      const f = loco.feet[i];
      const dx = f.x - group.position.x; const dz = f.z - group.position.z;
      return out.set(dx * cy - dz * sy, f.y - group.position.y, dx * sy + dz * cy);
    };
    const reach = (THIGH + SHIN + SOLE) * 0.985;
    let top = 0.03;
    for (let i = 0; i < 2; i++) {
      if (!loco.feet[i].planted && !ls.fallen) continue;
      local(i, v);
      const hd = Math.hypot(v.x - sides[i] * 0.125, v.z);
      if (hd > reach * 0.9) continue;
      top = Math.min(top, v.y + Math.sqrt(reach * reach - hd * hd) - HIP_H);
    }
    // A step just taken: the hips are still catching up with the boots.
    const want = top - ls.stepUp * 0.7 - b.squat * 0.16 - b.crouch * 0.42 - b.work * 0.1 - b.fall * 0.5 - b.roll * 0.45 - b.vault * 0.22 - b.seat * 0.55;
    body.position.y = want;
    q.setFromEuler(e.set(pelvis.rotation.x, pelvis.rotation.y, pelvis.rotation.z)).invert();
    const kneeMax = P.kneeMax + b.crouch * 0.7 + b.fall * 0.8 + b.work * 0.3 + b.roll * 1.0 + b.seat * 0.9 + b.vault * 0.6;
    for (let i = 0; i < 2; i++) {
      local(i, v);
      v.y += SOLE;
      hipAt.set(sides[i] * 0.125, 0, 0).applyEuler(e.set(pelvis.rotation.x, pelvis.rotation.y, pelvis.rotation.z));
      v.x -= hipAt.x; v.y -= body.position.y + HIP_H + hipAt.y; v.z -= hipAt.z;
      v.applyQuaternion(q);
      const sol = solveLeg(v.x, v.y, v.z, kneeMax);
      // Sitting and vaulting are poses, not places for the boots.
      // Under the jet the boots hang behind the thrust line, knees a little bent, one lower than the other.
      const hx = lerp(lerp(lerp(sol.alpha, -1.35, b.seat), -1.0 + (i === 0 ? -0.2 : 0.2), b.vault * Math.sin(ls.scriptK * Math.PI)), 0.32 + i * 0.12, b.jet);
      const kx = lerp(lerp(lerp(sol.beta, 1.5, b.seat), 1.6, b.vault * Math.sin(ls.scriptK * Math.PI)), 0.75 - i * 0.15, b.jet);
      hips[i].rotation.x = hx;
      hips[i].rotation.z = sol.theta * (1 - b.seat);
      knees[i].rotation.x = kx;
      const pitch = loco.feet[i].planted ? -Math.atan(ls.grade) * 0.8 : 0.25 * Math.min(1, b.airT * 3);
      ankles[i].rotation.x = clamp(-(pelvis.rotation.x + hx + kx) - pitch, -0.7, 0.7) * (1 - b.seat);
    }
  };

  const body_ = (dt: number, b: PoseBlend) => {
    const airborne = ls.airborne && !ls.striding;
    const speed = ls.speed;
    if (ls.impact > 0.6 && ls.stumble > 0) stumbleRoll = Math.sign(loco.velocity.x * Math.cos(loco.yaw) - loco.velocity.z * Math.sin(loco.yaw) || 1);
    // ── Torso: into the push, into the turn, and over on a roll. ──
    const lean = clamp(ls.lean, -0.5, 0.9);
    // A runner carries the body a little ahead of the feet, a sprinter more so;
    // a walker stands tall; the jet tips the whole body into its thrust.
    pelvis.rotation.x = lean * 0.55 + b.squat * 0.25 + b.crouch * 0.22 + b.fall * 1.05 + b.roll * 1.3 + b.vault * 0.5 + b.run * 0.12 + b.sprint * 0.115 - b.seat * 0.15 + b.jet * 0.24 + (ls.stumble > 0 ? -0.2 : 0);
    chest.rotation.x = lean * 0.35 + b.work * 0.2 + b.climb * 0.15 + b.roll * 0.5 + b.sprint * 0.115 + b.seat * 0.1 + b.jet * 0.1;
    const phase = ls.stepPhase * Math.PI * ls.stepSide;
    const moving = airborne ? 0 : Math.min(1, speed / 0.6);
    const twist = moving * (1 - b.run * 0.6);
    pelvis.rotation.y = Math.sin(phase) * 0.06 * twist;
    chest.rotation.y = -Math.sin(phase) * (0.12 + b.sprint * 0.06) * twist + b.look * Math.sin(b.clock * 0.3) * 0.08;
    const flailRoll = ls.stumble > 0 ? Math.sin(ls.stumble * 22) * 0.16 * ls.stumble * stumbleRoll : 0;
    // The body banks into a turn with the sideways push.
    pelvis.rotation.z = clamp(ls.leanSide, -0.35, 0.35) * 0.9 + flailRoll + b.look * Math.sin(b.clock * 0.21) * 0.03;
    chest.scale.y = 1 + Math.sin(b.breath) * (0.005 + ls.effort * 0.012);

    // ── Arms: springs toward swinging with the opposite leg (the left arm
    // comes forward as the right leg does), hanging close in a walk, bent
    // at the elbow and pumping in a run. ──
    const flail = airborne ? Math.sin(b.airT * 2.6) * 0.07 : 0;
    const catchArm = Math.max(ls.stumble > 0 ? ls.stumble : 0, b.fall);
    for (let i = 0; i < 2; i++) {
      const s = sides[i];
      // A suit's shoulder bearings keep the swing short: never much above the
      // chest, though a sprinter pumps harder than a jogger.
      const counter = clamp(hips[1 - i].rotation.x * (0.6 + b.run * 0.22 + b.sprint * 0.28) - 0.04 - b.run * 0.06, -0.75, 0.55);
      let target = lerp(counter, -0.95, b.work) * (1 - b.tuck) - b.brake * 0.3 + b.tuck * -0.45 + flail - catchArm * 0.9;
      // Reaching for the crate's top, then the controller of the rover; out for balance on the jet.
      target = lerp(target, -1.5, b.vault);
      target = lerp(target, -0.9, b.seat);
      target = lerp(target, -0.6, b.roll);
      target = lerp(target, -0.4 + Math.sin(b.clock * 2.2 + i * 1.7) * 0.06, b.jet);
      armVel[i] += ((target - arm[i]) * 110 - armVel[i] * 15) * dt;
      arm[i] += armVel[i] * dt;
      shoulders[i].rotation.x = arm[i];
      shoulders[i].rotation.z = s * (0.2 + b.tuck * 0.45 + catchArm * 0.7 + b.work * 0.08 + b.roll * 0.3 - b.seat * 0.1 + b.jet * 0.5);
      // The forearm swings through more than the upper arm does: bent most as the arm comes forward.
      const pump = Math.max(0, -arm[i]) * 0.5 * b.run;
      elbows[i].rotation.x = -(0.22 + b.run * 0.9 + pump + b.tuck * 0.2 + b.work * 0.75 - b.fall * 0.15 + b.seat * 0.9 + b.roll * 0.5 - b.vault * 0.1 + b.jet * 0.3);
      hands[i].rotation.x = -b.work * 0.3 + (b.work > 0.5 ? Math.sin(b.clock * 7 + i) * 0.08 * b.work : 0);
    }
    // ── The pack hangs off the shoulders and lags the bounce. ──
    const bodyWorldY = loco.position.y + body.position.y;
    const bodyVy = (bodyWorldY - lastBodyY) / dt;
    const bodyAy = clamp((bodyVy - lastBodyVy) / dt, -40, 40);
    lastBodyY = bodyWorldY; lastBodyVy = bodyVy;
    packVel += (-bodyAy * 0.004 - packRot * 85 - packVel * 11) * dt;
    packRot += packVel * dt;
    pack.rotation.x = packRot;
    // ── The head stays level; idle, the crew looks about; the visor hinges up indoors. ──
    if (b.lookYaw !== null) {
      neck.rotation.y = clamp(b.lookYaw, -1.1, 1.1);
      neck.rotation.x = clamp(-b.lookPitch, -0.7, 0.7);
      neck.rotation.z = 0;
    } else {
      neck.rotation.y = b.look * Math.sin(b.clock * 0.42) * 0.6 + (speed < 0.3 ? 0 : Math.sin(b.clock * 0.8) * 0.05);
      neck.rotation.x = -(pelvis.rotation.x + chest.rotation.x) * 0.55 + (airborne ? -0.1 : 0.04) + b.work * 0.35;
      neck.rotation.z = -pelvis.rotation.z * 0.6;
    }
    visor.rotation.x = -1.35 * b.visor;
  };

  return { legs, body: body_, eyeLocal };
}
