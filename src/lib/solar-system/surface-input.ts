// What the stick means on foot, for every surface and every controller.
// The stick is in the camera's frame; the walk wants it in the world's. Its
// length picks the gait — a nudge is a walk, most of the way is a jog, hard
// over is a run — and Shift is a sprint whether held or tapped: a tap
// latches until the stick is let go, so a thumb on a phone gets the same
// deal as a finger on a key.

import type { LightPool } from '@/lib/solar-system/moon-lights';
import type { WalkInput } from '@/lib/solar-system/suit-locomotion';

export interface FootStick {
  /** Camera frame: x right, y forward, each in [−1, 1]. */
  moveX: number;
  moveY: number;
  jump: boolean;
  run: boolean;
  sprint: boolean;
  walk: boolean;
  crouch: boolean;
  /** Held: the jetpack (the jump key kept down in the air, or its own key). */
  jet?: boolean;
}

export interface SprintLatch {
  /** A tap of the sprint key latches until the stick is let go. */
  latched: boolean;
  wasDown: boolean;
  downFor: number;
}

export function makeSprintLatch(): SprintLatch { return { latched: false, wasDown: false, downFor: 0 }; }

/** Resolve hold-or-tap sprint: held is a sprint; a tap shorter than a third of a second latches one. */
export function sprintFrom(latch: SprintLatch, down: boolean, moving: boolean, dt: number): boolean {
  if (down) latch.downFor += dt;
  if (!down && latch.wasDown && latch.downFor < 0.33 && moving) latch.latched = true;
  if (!down) latch.downFor = 0;
  if (!moving) latch.latched = false;
  latch.wasDown = down;
  return down || latch.latched;
}

/** Fill the walk's world-space intent from the camera-frame stick and the camera's yaw. */
export function walkFromStick(out: WalkInput, s: FootStick, camYaw: number, jumpEdge: boolean, work: boolean): WalkInput {
  const fx = -Math.sin(camYaw); const fz = -Math.cos(camYaw);
  const rx = -fz; const rz = fx;
  const len = Math.hypot(s.moveX, s.moveY);
  const k = len > 1 ? 1 / len : 1;
  out.moveX = (fx * s.moveY + rx * s.moveX) * k;
  out.moveZ = (fz * s.moveY + rz * s.moveX) * k;
  out.run = s.run && !s.crouch;
  out.sprint = s.sprint && !s.crouch;
  out.walk = s.walk;
  out.crouch = s.crouch;
  out.jump = jumpEdge;
  out.jet = !!s.jet && !s.crouch;
  out.work = work;
  return out;
}

/** The walk's clock: frames of any length in, whole fixed steps out, so
 *  the crew moves the same at 30 frames a second as at 144. */
export interface FixedStep {
  /** Run the steps this frame owes; returns how far the frame ends into the next one, 0…1. */
  advance: (dt: number, step: (h: number) => void) => number;
}

export function makeFixedStep(h: number, maxSteps: number): FixedStep {
  let acc = 0;
  return {
    advance(dt, step) {
      acc += dt;
      let n = 0;
      // A hair of slack: 144 frames of 1/144 s are 120 steps, not 119.
      while (acc >= h - 1e-9 && n < maxSteps) { step(h); acc -= h; n += 1; }
      acc = n === maxSteps ? 0 : Math.max(0, acc);
      return acc / h;
    },
  };
}

/** A press, kept until a step takes it: at a high frame rate some frames run no step at all. */
export interface PressEdge {
  /** The key's state this frame. */
  see: (down: boolean) => void;
  /** True once per press, to the first step that asks. */
  take: () => boolean;
}

export function makePressEdge(): PressEdge {
  let was = false;
  let pending = false;
  return {
    see(down) { if (down && !was) pending = true; was = down; },
    take() { const p = pending; pending = false; return p; },
  };
}

/** The helmet lamp: a warm pool of light a couple of metres ahead of the visor. */
export function headlamp(pool: LightPool, crew: { x: number; y: number; z: number }, yaw: number) {
  pool.request(crew.x + Math.sin(yaw) * 2.4, crew.y + 1.1, crew.z + Math.cos(yaw) * 2.4, 0xfff1dc, 7, 14, 1.6);
}

/** The jet's flame: a blue-white light under the pack, behind the crew, as strong as the throttle `k`. */
export function jetLight(pool: LightPool, crew: { x: number; y: number; z: number }, yaw: number, k: number) {
  if (k <= 0.02) return;
  pool.request(crew.x - Math.sin(yaw) * 0.45, crew.y + 0.7, crew.z - Math.cos(yaw) * 0.45, 0x9fd0ff, 9 * k, 6, 1.6);
}
