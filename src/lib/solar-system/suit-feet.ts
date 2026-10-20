// Where the boots go. A planted boot does not move until it is lifted, and
// the next one lands where the body will be: walking, one swings while the
// other holds; running, the flight is real and the lead boot reaches for
// the touchdown; in the air they tuck and reach; down, they trail; carried
// by a script they follow the body. The stride machinery lives here so the
// state machine only says which kind of step is being taken.

import type { GaitProfile } from '@/lib/solar-system/gait-profile';
import type { Vec3 } from '@/lib/solar-system/suit-collision';

export interface Foot {
  side: number;
  x: number; y: number; z: number;
  planted: boolean;
  fromX: number; fromY: number; fromZ: number;
  toX: number; toZ: number;
}

export interface StepEvent { x: number; y: number; z: number; yaw: number; side: number; hard: number }

export type FootMode = 'stand' | 'walk' | 'stride' | 'air' | 'down' | 'carried';

export interface FeetContext {
  mode: FootMode;
  P: GaitProfile;
  yaw: number;
  speed: number;
  airborne: boolean;
  altitude: number;
  /** A standing turn under way: where it is turning to, and 0…1 through it. */
  turnTo: number | null;
  turnK: number;
  heightAt: (x: number, z: number) => number;
}

export interface FeetRig {
  feet: [Foot, Foot];
  /** The last step's length and 0…1 through the current one, which boot. */
  stride: number;
  stepPhase: number;
  stepSide: number;
  onStep: ((e: StepEvent) => void) | null;
  settle: (yaw: number) => void;
  /** The body left the ground: both boots come up. */
  liftAll: () => void;
  /** Start a running stride's flight: which boot leads. */
  launchStride: () => void;
  /** A standing turn begins: the inside boot moves first. */
  beginTurn: (dir: number) => void;
  /** Coming down: plant what is reaching, and report how hard. */
  land: (hard: number, oneBoot: boolean) => void;
  update: (dt: number, ctx: FeetContext) => void;
}

const HIP_W = 0.13;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

export function makeFeet(position: Vec3, velocity: Vec3): FeetRig {
  const foot = (side: number): Foot => ({ side, x: 0, y: 0, z: 0, planted: true, fromX: 0, fromY: 0, fromZ: 0, toX: 0, toZ: 0 });
  const feet: [Foot, Foot] = [foot(-1), foot(1)];
  let walkDist = 0;
  let swing = 0;
  let lead = 1;
  let flightT = 0;
  let stanceT = 0;
  let yawNow = 0;

  const lift = (f: Foot) => { if (!f.planted) return; f.planted = false; f.fromX = f.x; f.fromY = f.y; f.fromZ = f.z; };
  const plant = (f: Foot, y: number, hard: number) => {
    if (f.planted) return;
    f.planted = true; f.y = y;
    rig.onStep?.({ x: f.x, y, z: f.z, yaw: yawNow, side: f.side, hard });
  };
  const neutral = (f: Foot, yaw: number, x: number, z: number) => {
    f.toX = x + Math.cos(yaw) * f.side * HIP_W;
    f.toZ = z - Math.sin(yaw) * f.side * HIP_W;
  };
  const beginWalk = () => {
    walkDist = 0;
    const back0 = (feet[0].x - position.x) * velocity.x + (feet[0].z - position.z) * velocity.z;
    const back1 = (feet[1].x - position.x) * velocity.x + (feet[1].z - position.z) * velocity.z;
    swing = back0 < back1 ? 0 : 1;
  };
  let wasMode: FootMode = 'stand';

  const rig: FeetRig = {
    feet, stride: 0, stepPhase: 0, stepSide: 1, onStep: null,
    settle(yaw) {
      yawNow = yaw;
      for (const f of feet) {
        neutral(f, yaw, position.x, position.z);
        f.x = f.toX; f.z = f.toZ; f.y = position.y; f.planted = true;
        f.fromX = f.x; f.fromZ = f.z; f.fromY = f.y;
      }
      walkDist = 0; stanceT = 0; flightT = 0;
    },
    liftAll() { for (const f of feet) lift(f); },
    launchStride() { lead = -lead; flightT = 0; stanceT = 0; for (const f of feet) lift(f); },
    beginTurn(dir) {
      const f = feet[dir > 0 ? 0 : 1];
      if (feet[0].planted && feet[1].planted) { lift(f); swing = dir > 0 ? 0 : 1; }
    },
    land(hard, oneBoot) {
      const landing = oneBoot ? [feet[lead > 0 ? 0 : 1]] : feet;
      for (const f of landing) plant(f, f.y, hard);
      stanceT = 0;
      beginWalk();
    },
    update(dt, ctx) {
      yawNow = ctx.yaw;
      const { P, speed, heightAt } = ctx;
      const ux = speed > 1e-3 ? velocity.x / speed : Math.sin(ctx.yaw);
      const uz = speed > 1e-3 ? velocity.z / speed : Math.cos(ctx.yaw);
      if (ctx.mode !== wasMode) { if (ctx.mode === 'walk') beginWalk(); wasMode = ctx.mode; }
      if (ctx.mode === 'carried') {
        for (const f of feet) {
          f.planted = false;
          neutral(f, ctx.yaw, position.x, position.z);
          f.x += (f.toX - f.x) * (1 - Math.exp(-dt * 12)); f.z += (f.toZ - f.z) * (1 - Math.exp(-dt * 12));
          f.y = position.y;
        }
        rig.stepPhase = 0;
        return;
      }
      if (ctx.mode === 'down') {
        for (const f of feet) {
          neutral(f, ctx.yaw, position.x - Math.sin(ctx.yaw) * 0.55, position.z - Math.cos(ctx.yaw) * 0.55);
          f.x += (f.toX - f.x) * (1 - Math.exp(-dt * 8)); f.z += (f.toZ - f.z) * (1 - Math.exp(-dt * 8));
          f.y = heightAt(f.x, f.z);
        }
        return;
      }
      if (ctx.mode === 'air') {
        for (const f of feet) {
          lift(f);
          neutral(f, ctx.yaw, position.x + velocity.x * 0.12, position.z + velocity.z * 0.12);
          f.x += (f.toX - f.x) * (1 - Math.exp(-dt * 10)); f.z += (f.toZ - f.z) * (1 - Math.exp(-dt * 10));
          f.y = position.y + Math.min(0.25, ctx.altitude * 0.4);
        }
        rig.stepPhase = 0;
        return;
      }
      if (ctx.mode === 'stride') {
        const inAir = ctx.airborne || ctx.altitude > 1e-3;
        if (inAir) flightT += dt; else stanceT += dt;
        const remain = (velocity.y + Math.sqrt(Math.max(0, velocity.y * velocity.y + 2 * P.g * Math.max(0, ctx.altitude)))) / P.g;
        const reachAhead = speed * P.stance * 0.5;
        const k = inAir ? smooth(flightT / Math.max(1e-3, flightT + remain)) : 0;
        rig.stepPhase = inAir ? 0.5 + 0.5 * k : 0.5 * Math.min(1, stanceT / P.stance);
        rig.stepSide = lead;
        // A boot left behind past what the leg can reach comes up: legs do not stretch out flat.
        for (const f of feet) if (f.planted && Math.hypot(f.x - position.x, f.z - position.z) > P.reach + 0.2) lift(f);
        for (const f of feet) {
          if (f.planted) continue;
          const ahead = reachAhead + (f.side === lead ? 0.12 : -0.05);
          if (inAir) {
            neutral(f, ctx.yaw, position.x + velocity.x * remain + ux * ahead, position.z + velocity.z * remain + uz * ahead);
            // The boot comes through early, as a leg does, rather than trailing
            // on the ground behind a body that has flown on without it...
            const kf = 1 - Math.pow(1 - k, 2.2);
            f.x = lerp(f.fromX, f.toX, kf); f.z = lerp(f.fromZ, f.toZ, kf);
            const gy = heightAt(f.x, f.z);
            // ...and the trailing one folds up behind first: the heel kick.
            const behind = Math.max(0, -((f.x - position.x) * ux + (f.z - position.z) * uz));
            const kick = Math.min(0.32, behind * 0.45) * Math.sin(Math.PI * Math.min(1, k * 1.6));
            f.y = Math.max(gy, lerp(f.fromY, gy, k) + Math.sin(Math.PI * k) * 0.12 + kick);
          } else {
            neutral(f, ctx.yaw, position.x + ux * ahead, position.z + uz * ahead);
            const r = 1 - Math.exp(-dt * 14);
            f.x += (f.toX - f.x) * r; f.z += (f.toZ - f.z) * r;
            f.y = heightAt(f.x, f.z) + 0.1;
          }
        }
        rig.stride = speed * (P.flight + P.stance);
        return;
      }
      // ── The walk. ──
      const stepLen = clamp(0.32 + 0.34 * speed, 0.3, P.reach);
      const f = feet[swing]; const other = feet[1 - swing];
      if (ctx.mode === 'walk' && speed > 0.08) {
        walkDist += speed * dt;
        if (f.planted) lift(f);
        const p = Math.min(1, walkDist / stepLen);
        const remainT = Math.max(0, stepLen - walkDist) / speed;
        neutral(f, ctx.yaw, position.x + velocity.x * remainT + ux * stepLen * 0.5, position.z + velocity.z * remainT + uz * stepLen * 0.5);
        f.x = lerp(f.fromX, f.toX, smooth(p)); f.z = lerp(f.fromZ, f.toZ, smooth(p));
        const gy = heightAt(f.x, f.z);
        f.y = lerp(f.fromY, gy, p) + Math.sin(Math.PI * p) * (P.suited ? 0.07 : 0.1);
        rig.stepPhase = p; rig.stepSide = f.side;
        if (walkDist >= stepLen) {
          walkDist -= stepLen;
          f.x = f.toX; f.z = f.toZ;
          plant(f, gy, Math.min(1, 0.12 + speed / P.run * 0.45));
          rig.stride = stepLen;
          swing = 1 - swing;
          lift(other);
        }
        return;
      }
      // Standing, or turning on the spot a step at a time.
      walkDist = 0;
      const turning = ctx.turnTo !== null;
      const dur = turning ? P.turnStep : 0.3;
      for (let i = 0; i < 2; i++) {
        const b = feet[i];
        neutral(b, turning ? (ctx.turnTo as number) : ctx.yaw, position.x, position.z);
        if (b.planted) {
          const off = Math.hypot(b.x - b.toX, b.z - b.toZ);
          if (off > (turning ? 0.12 : 0.28) && feet[1 - i].planted) lift(b);
          continue;
        }
        const moved = Math.hypot(b.toX - b.fromX, b.toZ - b.fromZ);
        const step = (moved / dur + 0.4) * dt;
        const dx = b.toX - b.x; const dz = b.toZ - b.z;
        const d = Math.hypot(dx, dz);
        if (d <= step) { b.x = b.toX; b.z = b.toZ; plant(b, heightAt(b.x, b.z), 0.08); }
        else {
          b.x += dx / d * step; b.z += dz / d * step;
          const p = moved > 1e-3 ? 1 - d / moved : 1;
          b.y = lerp(b.fromY, heightAt(b.x, b.z), p) + Math.sin(Math.PI * clamp(p, 0, 1)) * 0.05;
        }
      }
      rig.stepPhase = 0;
    },
  };
  return rig;
}
