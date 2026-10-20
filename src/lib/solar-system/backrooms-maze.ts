// The Backrooms' floor plan: an endless office level on a seeded grid, with
// no rendering in it so it can be tested.
//
// Cells are 3 m, eight to a 24 m chunk. The plan repeats every PERIOD chunks
// (288 m), which nobody can see through 35 m of haze, and which lets the
// distance to the way out be known exactly from anywhere.
//
// Connectivity is by construction. Every border between two chunks is decided
// by the chunk that owns it and always has a door; inside a chunk a random
// spanning tree joins every cell to every other and so to every door. After
// that walls are only ever taken away — loops, rooms, pillar halls, long
// corridors carved through — and taking a wall away cannot disconnect
// anything. The one exit is a steel door in a dead end; the spawn is chosen a
// fair walk from it, and the walk between them is marked the way somebody
// before you marked it: arrows on the wallpaper and a trail of patches.

export const CELL = 3;
export const CHUNK = 8;
export const PERIOD = 12;
export const CEILING = 2.7;
export const SIDE = CHUNK * PERIOD;
export const CHUNK_M = CELL * CHUNK;
/** The plan is laid out in these units and drawn this many times over around
 *  a crew of ordinary size: the rooms are huge and the explorers small in them. */
export const SCALE = 4;

/** 0 open, 1 full wall, 2 half-height wall. */
export type Edge = 0 | 1 | 2;
/** +x, +z, −x, −z. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0] as const;
export const DZ = [0, 1, 0, -1] as const;

export interface ChunkPlan {
  /** Wall on each cell's +x edge and +z edge, indexed b·CHUNK + a (local cell a along x, b along z). */
  east: Edge[];
  north: Edge[];
  /** Pillar centres, chunk-local metres. */
  pillars: [number, number][];
  /** Room rectangles in local cells [a0, b0, a1, b1) — for the look, not the walls. */
  rooms: [number, number, number, number][];
}

export interface Arrow { i: number; j: number; wall: Dir; /** Direction the arrow points, in world axes. */ point: Dir }
export interface Patch { x: number; z: number; spin: number }

export interface Maze {
  seed: number;
  chunk: (cx: number, cz: number) => ChunkPlan;
  /** The edge between global cell (i, j) and its neighbour in direction d. */
  edge: (i: number, j: number, d: Dir) => Edge;
  open: (i: number, j: number, d: Dir) => boolean;
  /** The exit cell and the wall its door is in (torus coordinates). */
  exit: { i: number; j: number; wall: Dir };
  spawn: { i: number; j: number };
  /** Walking distance to the exit in cells, from any cell (wrapped onto the torus). */
  distance: (i: number, j: number) => number;
  /** The next cell toward the exit from here. */
  toward: (i: number, j: number) => Dir | -1;
  /** The shortest walk from spawn to exit, cell by cell. */
  path: { i: number; j: number }[];
  arrows: Arrow[];
  patches: Patch[];
  /** Panel state per torus cell: 0 lit, 1 flickers, 2 dead, 3 missing. */
  panel: (i: number, j: number) => number;
}

export const mod = (a: number, n: number) => ((a % n) + n) % n;

export function hash(a: number, b: number, c: number, d: number): number {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041) + Math.imul(d, 2246822519)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = Math.imul(n ^ (n >>> 16), 2654435761);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/** Does this chunk carry a long corridor along x (its row), and one along z (its column)? */
function corridors(seed: number, pcx: number, pcz: number): { row: number; col: number } {
  // The row depends only on the chunk row, so corridors line up across chunks.
  const row = 1 + Math.floor(hash(seed, 0, pcz, 71) * 6);
  const col = 1 + Math.floor(hash(seed, pcx, 0, 73) * 6);
  return {
    row: hash(seed, pcx, pcz, 75) < 0.5 ? row : -1,
    col: hash(seed, pcx, pcz, 77) < 0.4 ? col : -1,
  };
}

function buildChunk(seed: number, pcx: number, pcz: number): ChunkPlan {
  const N = CHUNK;
  const east: Edge[] = new Array(N * N).fill(1);
  const north: Edge[] = new Array(N * N).fill(1);
  const r = (k: number, salt: number) => hash(seed, pcx * 131 + pcz, k, salt);
  const here = corridors(seed, pcx, pcz);
  const eastNb = corridors(seed, mod(pcx + 1, PERIOD), pcz);
  const northNb = corridors(seed, pcx, mod(pcz + 1, PERIOD));

  // ── Borders this chunk owns: its +x and +z sides. Two doors at least, and
  // wide open wherever a corridor runs through. ──
  for (let b = 0; b < N; b++) {
    const k = b * N + (N - 1);
    east[k] = 1;
    if (r(b, 11) < 0.28) east[k] = 0;
  }
  east[Math.floor(r(0, 12) * N) * N + (N - 1)] = 0;
  east[Math.floor(r(1, 12) * N) * N + (N - 1)] = 0;
  if (here.row >= 0 && eastNb.row === here.row) east[here.row * N + (N - 1)] = 0;
  for (let a = 0; a < N; a++) {
    const k = (N - 1) * N + a;
    north[k] = 1;
    if (r(a, 13) < 0.28) north[k] = 0;
  }
  north[(N - 1) * N + Math.floor(r(0, 14) * N)] = 0;
  north[(N - 1) * N + Math.floor(r(1, 14) * N)] = 0;
  if (here.col >= 0 && northNb.col === here.col) north[(N - 1) * N + here.col] = 0;

  // ── Corridors: the run is forced open, its sides forced shut but for two gaps. ──
  const forceOpen = new Set<string>();
  const forceShut = new Set<string>();
  if (here.row >= 0) {
    const b = here.row;
    for (let a = 0; a < N - 1; a++) forceOpen.add(`e${b * N + a}`);
    const gaps = [Math.floor(r(2, 15) * N), Math.floor(r(3, 15) * N)];
    for (let a = 0; a < N; a++) {
      if (!gaps.includes(a)) { forceShut.add(`n${b * N + a}`); forceShut.add(`n${(b - 1) * N + a}`); }
    }
  }
  if (here.col >= 0) {
    const a = here.col;
    for (let b = 0; b < N - 1; b++) forceOpen.add(`n${b * N + a}`);
    const gaps = [Math.floor(r(4, 16) * N), Math.floor(r(5, 16) * N)];
    for (let b = 0; b < N; b++) {
      if (!gaps.includes(b)) { forceShut.add(`e${b * N + a}`); forceShut.add(`e${b * N + a - 1}`); }
    }
  }
  for (const k of forceOpen) forceShut.delete(k);

  // ── A spanning tree over the interior (randomised Kruskal). ──
  const parent = Array.from({ length: N * N }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (x: number, y: number) => { const a = find(x); const b = find(y); if (a === b) return false; parent[a] = b; return true; };
  const edges: { key: string; a: number; b: number; w: number }[] = [];
  for (let b = 0; b < N; b++) {
    for (let a = 0; a < N; a++) {
      const c = b * N + a;
      if (a < N - 1) edges.push({ key: `e${c}`, a: c, b: c + 1, w: r(c, 21) });
      if (b < N - 1) edges.push({ key: `n${c}`, a: c, b: c + N, w: r(c, 22) });
    }
  }
  const openEdge = (key: string) => { const i = Number(key.slice(1)); if (key[0] === 'e') east[i] = 0; else north[i] = 0; };
  for (const e of edges) if (forceOpen.has(e.key)) { unite(e.a, e.b); openEdge(e.key); }
  edges.sort((x, y) => x.w - y.w);
  // Shut corridor sides only after everything else, if nothing else will join the two sides.
  for (const e of edges) if (!forceOpen.has(e.key) && !forceShut.has(e.key) && unite(e.a, e.b)) openEdge(e.key);
  for (const e of edges) if (forceShut.has(e.key) && unite(e.a, e.b)) openEdge(e.key);

  // ── Loops: a fair share of what is left comes down. ──
  for (const e of edges) {
    if (forceShut.has(e.key)) continue;
    if (r(Number(e.key.slice(1)), e.key[0] === 'e' ? 31 : 32) < 0.3) openEdge(e.key);
  }

  // ── Rooms and pillar halls: everything inside comes down. ──
  const rooms: [number, number, number, number][] = [];
  const pillars: [number, number][] = [];
  const roomCount = Math.floor(r(0, 41) * 2.4);
  for (let n = 0; n < roomCount; n++) {
    const w = 2 + Math.floor(r(n, 42) * 3);
    const h = 2 + Math.floor(r(n, 43) * 3);
    const a0 = Math.floor(r(n, 44) * (N - w + 1));
    const b0 = Math.floor(r(n, 45) * (N - h + 1));
    rooms.push([a0, b0, a0 + w, b0 + h]);
    for (let b = b0; b < b0 + h; b++) {
      for (let a = a0; a < a0 + w; a++) {
        if (a < a0 + w - 1) east[b * N + a] = 0;
        if (b < b0 + h - 1) north[b * N + a] = 0;
      }
    }
    if (w >= 3 && h >= 3 && r(n, 46) < 0.75) {
      for (let b = b0 + 1; b < b0 + h; b++) for (let a = a0 + 1; a < a0 + w; a++) pillars.push([a * CELL, b * CELL]);
    }
  }
  // ── Some of the remaining interior walls stop at waist height. ──
  for (let c = 0; c < N * N; c++) {
    if ((c % N) < N - 1 && east[c] === 1 && r(c, 51) < 0.08) east[c] = 2;
    if (Math.floor(c / N) < N - 1 && north[c] === 1 && r(c, 52) < 0.08) north[c] = 2;
  }
  return { east, north, pillars, rooms };
}

export function makeMaze(seed: number): Maze {
  const cache = new Map<number, ChunkPlan>();
  const chunk = (cx: number, cz: number): ChunkPlan => {
    const pcx = mod(cx, PERIOD); const pcz = mod(cz, PERIOD);
    const key = pcz * PERIOD + pcx;
    let c = cache.get(key);
    if (!c) { c = buildChunk(seed, pcx, pcz); cache.set(key, c); }
    return c;
  };
  const edge = (i: number, j: number, d: Dir): Edge => {
    // The −x and −z edges belong to the neighbour's +x and +z.
    const ii = d === 2 ? i - 1 : i;
    const jj = d === 3 ? j - 1 : j;
    const cx = Math.floor(ii / CHUNK); const cz = Math.floor(jj / CHUNK);
    const a = mod(ii, CHUNK); const b = mod(jj, CHUNK);
    const plan = chunk(cx, cz);
    return d === 0 || d === 2 ? plan.east[b * CHUNK + a] : plan.north[b * CHUNK + a];
  };
  const open = (i: number, j: number, d: Dir) => edge(i, j, d) === 0;

  // ── The exit: a dead end (or as near as there is) in chunk (0, 0). ──
  let exit = { i: 0, j: 0, wall: 1 as Dir };
  let best = -1;
  for (let j = 1; j < CHUNK - 1; j++) {
    for (let i = 1; i < CHUNK - 1; i++) {
      let shut = 0; let wall: Dir = 0; let full = false;
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const e = edge(i, j, d);
        if (e !== 0) shut += 1;
        if (e === 1 && !full) { wall = d; full = true; }
      }
      const score = full ? shut * 10 + hash(seed, i, j, 61) : -1;
      if (score > best) { best = score; exit = { i, j, wall }; }
    }
  }

  // ── Distance to the exit over the whole torus. ──
  const dist = new Int32Array(SIDE * SIDE).fill(-1);
  const queue = new Int32Array(SIDE * SIDE);
  let qh = 0; let qt = 0;
  dist[exit.j * SIDE + exit.i] = 0;
  queue[qt++] = exit.j * SIDE + exit.i;
  while (qh < qt) {
    const c = queue[qh++];
    const i = c % SIDE; const j = (c - i) / SIDE;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if (!open(i, j, d)) continue;
      const n = mod(j + DZ[d], SIDE) * SIDE + mod(i + DX[d], SIDE);
      if (dist[n] >= 0) continue;
      dist[n] = dist[c] + 1;
      queue[qt++] = n;
    }
  }
  const distance = (i: number, j: number) => dist[mod(j, SIDE) * SIDE + mod(i, SIDE)];
  const toward = (i: number, j: number): Dir | -1 => {
    const here = distance(i, j);
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if (open(i, j, d) && distance(i + DX[d], j + DZ[d]) === here - 1) return d;
    }
    return -1;
  };

  // ── Spawn: a fair walk out, 60–140 cells. ──
  let spawn = { i: SIDE / 2, j: SIDE / 2 };
  for (let k = 0; k < 4000; k++) {
    const i = Math.floor(hash(seed, k, 3, 81) * SIDE);
    const j = Math.floor(hash(seed, k, 5, 82) * SIDE);
    const d = distance(i, j);
    if (d >= 70 && d <= 120) { spawn = { i, j }; break; }
  }

  // ── The walk between, and what someone left along it. ──
  const path: { i: number; j: number }[] = [{ ...spawn }];
  for (let guard = 0; guard < SIDE * SIDE; guard++) {
    const last = path[path.length - 1];
    const d = toward(last.i, last.j);
    if (d === -1) break;
    path.push({ i: last.i + DX[d], j: last.j + DZ[d] });
  }
  const arrows: Arrow[] = [];
  const patches: Patch[] = [];
  for (let k = 1; k < path.length - 1; k++) {
    const p = path[k];
    const inDir = dirOf(path[k - 1], p);
    const outDir = dirOf(p, path[k + 1]);
    let openings = 0;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (open(p.i, p.j, d)) openings += 1;
    const decision = outDir !== inDir || openings >= 3;
    if (decision && k < path.length * 0.85 && hash(seed, p.i, p.j, 91) < 0.62) {
      // The wall you face arriving, else one beside you; never the one behind.
      const back = ((inDir + 2) % 4) as Dir;
      const candidates = [inDir, ((inDir + 1) % 4) as Dir, ((inDir + 3) % 4) as Dir];
      const wall = candidates.find((d) => edge(p.i, p.j, d) === 1 && d !== back && d !== outDir && ((d + 2) % 4) !== outDir);
      if (wall !== undefined) arrows.push({ i: p.i, j: p.j, wall, point: outDir });
    }
    if (k > path.length / 3 && k < (path.length * 2) / 3 && k % 9 === 0) {
      patches.push({
        x: (p.i + 0.3 + hash(seed, k, 1, 93) * 0.4) * CELL,
        z: (p.j + 0.3 + hash(seed, k, 2, 93) * 0.4) * CELL,
        spin: hash(seed, k, 3, 93) * Math.PI * 2,
      });
    }
  }

  const panel = (i: number, j: number) => {
    const h = hash(seed, mod(i, SIDE), mod(j, SIDE), 101);
    return h < 0.07 ? 2 : h < 0.1 ? 3 : h < 0.16 ? 1 : 0;
  };

  return { seed, chunk, edge, open, exit, spawn, distance, toward, path, arrows, patches, panel };
}

export function dirOf(a: { i: number; j: number }, b: { i: number; j: number }): Dir {
  const di = b.i - a.i; const dj = b.j - a.j;
  return (di === 1 ? 0 : dj === 1 ? 1 : di === -1 ? 2 : 3) as Dir;
}

/** The global cell a world point is in. */
export const cellOf = (x: number, z: number) => ({ i: Math.floor(x / CELL), j: Math.floor(z / CELL) });

const WALL_HALF = 0.07;
const PILLAR_HALF = 0.3;

/**
 * Push a walker of radius r out of the walls and pillars around it, and take
 * the velocity into them away. Axis-aligned boxes, two passes.
 */
export function collide(maze: Maze, p: { x: number; z: number }, v: { x: number; z: number }, r: number): void {
  for (let pass = 0; pass < 2; pass++) {
    const { i, j } = cellOf(p.x, p.z);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ci = i + di; const cj = j + dj;
        // The +x wall of the cell: a thin box along z.
        if (maze.edge(ci, cj, 0) !== 0) box(p, v, (ci + 1) * CELL, (cj + 0.5) * CELL, WALL_HALF, CELL / 2 + WALL_HALF, r);
        if (maze.edge(ci, cj, 1) !== 0) box(p, v, (ci + 0.5) * CELL, (cj + 1) * CELL, CELL / 2 + WALL_HALF, WALL_HALF, r);
      }
    }
    const cx = Math.floor(p.x / CHUNK_M); const cz = Math.floor(p.z / CHUNK_M);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const plan = maze.chunk(cx + dx, cz + dz);
        for (const [px, pz] of plan.pillars) {
          const wx = (cx + dx) * CHUNK_M + px; const wz = (cz + dz) * CHUNK_M + pz;
          if (Math.abs(wx - p.x) < 2 && Math.abs(wz - p.z) < 2) box(p, v, wx, wz, PILLAR_HALF, PILLAR_HALF, r);
        }
      }
    }
  }
}

function box(p: { x: number; z: number }, v: { x: number; z: number }, cx: number, cz: number, hx: number, hz: number, r: number) {
  const ox = (hx + r) - Math.abs(p.x - cx);
  const oz = (hz + r) - Math.abs(p.z - cz);
  if (ox <= 0 || oz <= 0) return;
  if (ox < oz) {
    const s = Math.sign(p.x - cx) || 1;
    p.x += ox * s;
    if (v.x * s < 0) v.x = 0;
  } else {
    const s = Math.sign(p.z - cz) || 1;
    p.z += oz * s;
    if (v.z * s < 0) v.z = 0;
  }
}
