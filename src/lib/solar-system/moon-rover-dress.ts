// What the rover looks like doing what the drive decides: the wishbones
// taking up the twist the body's own lean leaves over, the corner wheels
// steering, the hubs spinning (and spinning up when the regolith lets go),
// the mast head looking into the turn, the headlights and brake lights, the
// arm folding out at rest, dust off the wheels and tracks left behind.

import * as THREE from 'three';
import type { DustBurst, DustHandle } from '@/lib/solar-system/moon-fx';
import type { PrintsHandle } from '@/lib/solar-system/moon-prints';
import type { RoverParts } from '@/lib/solar-system/moon-rover';

export interface DressState {
  x: number; z: number; yaw: number;
  speed: number; slip: number;
  /** How much faster the driven wheels turn than the ground goes by, 0…1. */
  spin: number;
  driving: boolean;
  steer: number;
  pivot: boolean;
  braking: boolean;
  airborne: boolean;
  heights: Float32Array;
  pitch: number;
  gearIon: boolean;
  ionOwned: boolean;
  vx: number; vz: number;
}

const STEER_LOCK = 0.42;
/** How far the wheel stands out from its wishbone pivot, m, and the travel
 *  the arm is allowed either way. */
const ARM_SPAN = 0.5;
const ARM_TRAVEL = 0.22;

export function makeRoverDress(parts: RoverParts, terrain: { heightAt: (x: number, z: number) => number }, dust: DustHandle, prints: PrintsHandle) {
  const puff: DustBurst = { x: 0, y: 0, z: 0, count: 1, speedMin: 0.4, speedMax: 1, cone: 0.9, size: 0.14, dirX: 0, dirZ: 0, bias: 1.2 };
  const armTilt = [0, 0, 0, 0];
  let steerAngle = 0;
  let mastYaw = 0;
  let idle = 0;
  let armOut = 0;
  let wheelSpin = 0;
  let trackAcc = 0;
  let dustAcc = 0;

  return (dt: number, s: DressState) => {
    const k = 1 - Math.exp(-dt * 10);
    const c = Math.cos(s.yaw); const sn = Math.sin(s.yaw);
    const h = s.heights;
    // The body already leans with the mean plane through the four contacts;
    // what the plane cannot reach — the twist — is what each wishbone takes.
    const mean = (h[0] + h[1] + h[2] + h[3]) / 4;
    const lean = ((h[2] + h[3]) - (h[0] + h[1])) / 4;
    const nose = ((h[0] + h[2]) - (h[1] + h[3])) / 4;
    for (let i = 0; i < 4; i++) {
      const sx = parts.wheelXZ[i][0] < 0 ? -1 : 1;
      const sz = parts.wheelXZ[i][1] < 0 ? -1 : 1;
      const residual = s.airborne ? 0 : h[i] - (mean + sx * lean + sz * nose);
      const want = Math.asin(Math.max(-1, Math.min(1, residual / ARM_SPAN))) * sx;
      armTilt[i] += (Math.max(-ARM_TRAVEL, Math.min(ARM_TRAVEL, want)) - armTilt[i]) * k;
      parts.arms[i].rotation.z = armTilt[i];
    }
    const lock = s.pivot && s.speed < 0.6 ? 0.75 : STEER_LOCK;
    steerAngle += ((s.driving ? -s.steer * lock : 0) - steerAngle) * (1 - Math.exp(-dt * 7));
    for (let i = 0; i < parts.steer.length; i++) parts.steer[i].rotation.y = i % 2 === 0 ? steerAngle : -steerAngle;
    idle = s.driving && s.speed > 0.3 ? 0 : idle + dt;
    const mastTarget = s.driving ? steerAngle * 1.6 : Math.sin(idle * 0.4) * 0.8;
    mastYaw += (mastTarget - mastYaw) * (1 - Math.exp(-dt * 2.5));
    parts.mast.rotation.y = mastYaw;
    parts.brakeLight.emissiveIntensity += ((s.braking ? 2.6 : 0.15) - parts.brakeLight.emissiveIntensity) * (1 - Math.exp(-dt * 8));
    parts.ionMat.emissiveIntensity = s.gearIon ? 1.3 + 0.4 * Math.sin(idle + wheelSpin * 0.2) : s.ionOwned ? 0.35 : 0;
    armOut += ((idle > 2.5 ? 1 : 0) - armOut) * (1 - Math.exp(-dt * 1.4));
    parts.arm[0].rotation.y = -1.3 * armOut;
    parts.arm[0].rotation.x = 0.35 * armOut;
    parts.arm[1].rotation.x = -0.9 + 1.5 * armOut;
    // Hubs turn with the ground, and faster when the regolith lets go under the torque.
    const ground = s.airborne ? Math.sign(s.speed) * Math.max(Math.abs(s.speed), 2) : s.speed;
    wheelSpin += (ground * (1 + s.spin * 1.6)) / 0.44 * dt;
    for (const w of parts.spin) w.rotation.x = wheelSpin;

    if (s.airborne) return;
    // Dust — more from the rear pair, a slide, and spinning wheels — and tracks under all six.
    const speed = Math.abs(s.speed);
    dustAcc = Math.min(2, dustAcc + dt * 30);
    if ((speed > 0.6 || s.slip > 1 || s.spin > 0.2) && dustAcc >= 1) {
      dustAcc %= 1;
      const kk = Math.min(1, speed / 15) + Math.min(0.6, s.slip / 6) + s.spin * 0.7;
      const fx = Math.sin(s.yaw); const fz = Math.cos(s.yaw);
      for (let i = 0; i < 4; i++) {
        const [lx, lz] = parts.wheelXZ[i];
        const isRear = lz < 0;
        if (!isRear && Math.random() > kk * 0.6) continue;
        puff.x = s.x + lx * c + lz * sn; puff.y = h[i]; puff.z = s.z - lx * sn + lz * c;
        puff.count = Math.round(1 + kk * (isRear ? 5 : 2));
        puff.speedMax = 1 + kk * 3;
        puff.dirX = -fx; puff.dirZ = -fz;
        dust.burst(puff);
      }
    }
    if (speed > 0.6 || s.slip > 1) {
      trackAcc += Math.hypot(s.vx, s.vz) * dt;
      if (trackAcc > 0.7) {
        trackAcc = 0;
        for (let side = -1; side <= 1; side += 2) {
          const tx = s.x + c * side * 0.8; const tz = s.z - sn * side * 0.8;
          prints.track(tx, terrain.heightAt(tx, tz), tz, s.yaw, 0.32);
        }
      }
    }
  };
}
