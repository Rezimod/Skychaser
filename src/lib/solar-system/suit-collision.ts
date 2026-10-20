// The capsule against the world: round footprints to slide along, a step
// the boots take without thinking, a ledge that is a wall, a drop that is a
// fall, a roof over the head indoors, and the low things a running crew can
// vault. Pure geometry on the heightfield; nothing here knows about gravity.

export interface Collider {
  x: number;
  z: number;
  r: number;
  /** Top of a low obstacle, m above the ground: a crate or a berm a crew can vault. Absent, it is a wall. */
  h?: number;
}

export interface Vec3 { x: number; y: number; z: number }

export const SUIT_RADIUS = 0.55;
/** A rise the boots take in stride; a drop the boots follow without leaving the ground. */
export const STEP_UP = 0.35;
export const STEP_DOWN = 0.45;
/** Regolith holds a standing boot up to about thirty degrees. */
export const SLOPE_LIMIT = Math.tan((30 * Math.PI) / 180);
/** How high a vault reaches, and how far ahead the probe looks. */
export const VAULT_MAX = { suited: 0.9, soft: 1.15 };
const VAULT_REACH = 1.3;

/** Push the body out of every round footprint it overlaps, sliding along rather than stopping. */
export function slideColliders(p: Vec3, v: Vec3, colliders: readonly Collider[], radius = SUIT_RADIUS): boolean {
  let touched = false;
  for (const c of colliders) {
    const dx = p.x - c.x; const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + radius;
    if (d >= min || d <= 1e-4) continue;
    const nx = dx / d; const nz = dz / d;
    p.x += nx * (min - d); p.z += nz * (min - d);
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
    touched = true;
  }
  return touched;
}

export type GroundContact = 'stepUp' | 'blocked' | 'stepDown' | 'ledge' | 'none';

/**
 * The ground after a step, for a body that was standing. A small rise is
 * stepped up (the hips ease over it), a big one is a wall the move is taken
 * back from, a small drop is followed, a big one is left to gravity.
 */
export function stepGround(p: Vec3, v: Vec3, prevX: number, prevZ: number, groundY: number): GroundContact {
  const rise = groundY - p.y;
  if (rise > 0.02) {
    if (rise <= STEP_UP) { p.y = groundY; return 'stepUp'; }
    // Too high to step: undo the horizontal move and stop the push into it.
    const mx = p.x - prevX; const mz = p.z - prevZ;
    const m = Math.hypot(mx, mz);
    p.x = prevX; p.z = prevZ;
    if (m > 1e-6) {
      const vn = (v.x * mx + v.z * mz) / m;
      if (vn > 0) { v.x -= vn * mx / m; v.z -= vn * mz / m; }
    }
    return 'blocked';
  }
  if (-rise <= STEP_DOWN) { p.y = groundY; return -rise > 0.02 ? 'stepDown' : 'none'; }
  return 'ledge';
}

/**
 * Slope under a point: the gradient's components and how steep it is. A
 * kerb or a cliff edge is not a slope — one side of it is flat — so the
 * steepness is the gentler of the two one-sided gradients.
 */
export interface Slope { sx: number; sz: number; steep: number }
const slopeScratch: Slope = { sx: 0, sz: 0, steep: 0 };
const gentle = (a: number, b: number) => (Math.sign(a) !== Math.sign(b) ? 0 : Math.min(Math.abs(a), Math.abs(b)));
export function slopeAt(heightAt: (x: number, z: number) => number, x: number, z: number, out: Slope = slopeScratch): Slope {
  const h = heightAt(x, z);
  const xa = (h - heightAt(x - 0.5, z)) * 2; const xb = (heightAt(x + 0.5, z) - h) * 2;
  const za = (h - heightAt(x, z - 0.5)) * 2; const zb = (heightAt(x, z + 0.5) - h) * 2;
  out.sx = (xa + xb) / 4; out.sz = (za + zb) / 4;
  out.steep = Math.hypot(gentle(xa, xb), gentle(za, zb));
  return out;
}

export interface Vault {
  over: Collider;
  /** Where the boots come down on the far side, and the height of the top. */
  toX: number; toZ: number; toY: number;
  top: number;
}

/**
 * A low obstacle in the way of a crew facing (dx, dz): the first vaultable
 * footprint the forward probe crosses, provided the far side is clear ground.
 */
export function vaultProbe(
  p: Vec3, dx: number, dz: number, colliders: readonly Collider[], heightAt: (x: number, z: number) => number, maxTop: number,
): Vault | null {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;
  const ux = dx / len; const uz = dz / len;
  let best: Vault | null = null; let bestT = Infinity;
  for (const c of colliders) {
    if (c.h === undefined || c.h <= STEP_UP || c.h > maxTop || c.r > 1.6) continue;
    // Closest approach of the probe segment to the footprint's centre.
    const cx = c.x - p.x; const cz = c.z - p.z;
    const t = cx * ux + cz * uz;
    if (t < 0 || t > VAULT_REACH + c.r) continue;
    const off = Math.abs(cx * uz - cz * ux);
    if (off > c.r * 0.8) continue;
    if (t >= bestT) continue;
    const beyond = t + c.r + SUIT_RADIUS + 0.25;
    const toX = p.x + ux * beyond; const toZ = p.z + uz * beyond;
    const toY = heightAt(toX, toZ);
    if (Math.abs(toY - p.y) > 0.5) continue;
    const blocked = colliders.some((o) => o !== c && Math.hypot(toX - o.x, toZ - o.z) < o.r + SUIT_RADIUS);
    if (blocked) continue;
    bestT = t;
    best = { over: c, toX, toZ, toY, top: heightAt(c.x, c.z) + c.h };
  }
  return best;
}
