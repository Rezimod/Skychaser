// Something that stands at the far end of a long corridor, where the haze
// starts, a little off to the side of where you are looking. Tall enough to
// stoop under the ceiling, far too thin, no face, its outline never quite
// holding still. It is gone when you look straight at it, when you get near,
// or after a few seconds. It never comes closer and it never touches anyone.
//
// This file only decides where and when; the look is in backrooms-scene.

import { CELL, DX, DZ, hash, type Dir, type Maze } from '@/lib/solar-system/backrooms-maze';

export interface Sighting { x: number; z: number; /** Facing back along the corridor, rad. */ yaw: number }

/** Nothing in the first minute. */
export const QUIET_START = 60;
const MIN_CELLS = 6;
const MAX_CELLS = 11;
/** How far off the centre of view it may stand, rad. */
const ANGLE_MIN = 0.45;
const ANGLE_MAX = 0.86;

/**
 * A place at the end of a straight, open run of at least 18 m from the
 * walker's cell, 25–50° off the view direction — or null.
 */
export function chooseSighting(maze: Maze, x: number, z: number, yaw: number, elapsed: number, salt: number): Sighting | null {
  if (elapsed < QUIET_START) return null;
  const i = Math.floor(x / CELL); const j = Math.floor(z / CELL);
  const fx = Math.sin(yaw); const fz = Math.cos(yaw);
  const options: Sighting[] = [];
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    let run = 0;
    let ci = i; let cj = j;
    while (run < MAX_CELLS && maze.edge(ci, cj, d) !== 1) { ci += DX[d]; cj += DZ[d]; run += 1; }
    if (run < MIN_CELLS) continue;
    const sx = (ci + 0.5) * CELL; const sz = (cj + 0.5) * CELL;
    const dx = sx - x; const dz = sz - z;
    const dist = Math.hypot(dx, dz);
    if (dist < 18) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / dist)));
    if (ang < ANGLE_MIN || ang > ANGLE_MAX) continue;
    options.push({ x: sx, z: sz, yaw: Math.atan2(-DX[d], -DZ[d]) });
  }
  if (!options.length) return null;
  return options[Math.floor(hash(maze.seed, i, j, salt) * options.length)];
}

/** Should a sighting already up be taken away? */
export function sightingEnds(s: Sighting, x: number, z: number, yaw: number, age: number): boolean {
  const dx = s.x - x; const dz = s.z - z;
  const dist = Math.hypot(dx, dz);
  if (age > 4 || dist < 12) return true;
  const ang = Math.acos(Math.max(-1, Math.min(1, (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.max(1e-3, dist))));
  return ang < 0.17;
}
