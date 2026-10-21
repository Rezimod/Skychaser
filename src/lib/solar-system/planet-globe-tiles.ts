// The globe's level of detail: a cube-sphere quadtree of chunks.
//
// Six root faces, each split into four children as the camera comes close,
// down to a level where a chunk's vertices are ten or twenty metres apart.
// Which chunks are drawn is decided afresh every frame by a greedy pass that
// always splits the chunk with the worst screen-space error next, so the
// budget of draw calls is spent where the eye is and never exceeded: a
// chunk is split only when all its visible children are built, and until
// they are, the parent is drawn and the children are asked for.
//
// A chunk's vertices are built relative to its own centre (km, float64 in
// here, float32 on the GPU) and its mesh is placed at the centre, so the
// camera can be a metre above a 6371 km sphere and still see a still ground:
// three multiplies the camera and model matrices in float64 on the CPU.
//
// Pure: the maths and the typed arrays. The meshes are made in planet-globe.ts.

import * as THREE from 'three';

export type Vec3 = [number, number, number];

// ── Cube → sphere ─────────────────────────────────────────────────────────

/** Per face: the outward axis n and the tangents s, t with s × t = n, so a
 *  grid laid out along +s, +t winds counter-clockwise seen from outside. */
const FACES: { n: Vec3; s: Vec3; t: Vec3 }[] = [
  { n: [1, 0, 0], s: [0, 1, 0], t: [0, 0, 1] },
  { n: [-1, 0, 0], s: [0, 0, 1], t: [0, 1, 0] },
  { n: [0, 1, 0], s: [0, 0, 1], t: [1, 0, 0] },
  { n: [0, -1, 0], s: [1, 0, 0], t: [0, 0, 1] },
  { n: [0, 0, 1], s: [1, 0, 0], t: [0, 1, 0] },
  { n: [0, 0, -1], s: [0, 1, 0], t: [1, 0, 0] },
];

export const FACE_COUNT = 6;

/**
 * Face coordinates (u, v in −1…1) → unit direction. The tangent warp makes
 * the cells nearly equal in area across a face (a plain gnomonic cube is
 * five times denser at the corners than at the centre).
 */
export function faceToDir(face: number, u: number, v: number, out: number[] = [0, 0, 0]): number[] {
  const f = FACES[face];
  const a = Math.tan(u * Math.PI / 4); const b = Math.tan(v * Math.PI / 4);
  const x = f.n[0] + a * f.s[0] + b * f.t[0];
  const y = f.n[1] + a * f.s[1] + b * f.t[1];
  const z = f.n[2] + a * f.s[2] + b * f.t[2];
  const l = Math.sqrt(x * x + y * y + z * z);
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

/** The inverse: which face a direction falls on, and where. */
export function dirToFace(x: number, y: number, z: number): { face: number; u: number; v: number } {
  const ax = Math.abs(x); const ay = Math.abs(y); const az = Math.abs(z);
  let face: number;
  if (ax >= ay && ax >= az) face = x > 0 ? 0 : 1;
  else if (ay >= az) face = y > 0 ? 2 : 3;
  else face = z > 0 ? 4 : 5;
  const f = FACES[face];
  const d = x * f.n[0] + y * f.n[1] + z * f.n[2];
  const a = (x * f.s[0] + y * f.s[1] + z * f.s[2]) / d;
  const b = (x * f.t[0] + y * f.t[1] + z * f.t[2]) / d;
  return { face, u: Math.atan(a) * 4 / Math.PI, v: Math.atan(b) * 4 / Math.PI };
}

function angle(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const cx = a[1] * b[2] - a[2] * b[1]; const cy = a[2] * b[0] - a[0] * b[2]; const cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

// ── Nodes ─────────────────────────────────────────────────────────────────

export interface QuadNode {
  readonly face: number;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly key: string;
  readonly parent: QuadNode | null;
  children: QuadNode[] | null;
  /** Face-coordinate bounds. */
  readonly u0: number; readonly v0: number; readonly u1: number; readonly v1: number;
  /** Unit direction of the centre. */
  readonly centre: Vec3;
  /** Largest angle from the centre to any corner or edge midpoint, rad. */
  readonly angRadius: number;
  /** Edge length on the reference sphere, km; grid spacing, km. */
  readonly edgeKm: number;
  readonly spacingKm: number;
  /** Height bounds used for culling, m: the world's until built, then the chunk's own. */
  hMin: number;
  hMax: number;
  /** Bounding sphere, km (recomputed when the height bounds change). */
  sphere: THREE.Sphere;
  /** The frame the selection last visited it (pruning). */
  seen: number;
}

export interface TreeParams {
  radiusKm: number;
  /** Quads per chunk edge (32 → 33 × 33 vertices). */
  segments: number;
  /** World height bounds, m. */
  hMin: number;
  hMax: number;
}

const SAMPLE_UV = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5], [0.5, 0.5]];

export function nodeSphere(n: Pick<QuadNode, 'face' | 'u0' | 'v0' | 'u1' | 'v1'>, radiusKm: number, hMin: number, hMax: number, out = new THREE.Sphere()): THREE.Sphere {
  const pts: number[][] = [];
  const d = [0, 0, 0];
  for (const [a, b] of SAMPLE_UV) {
    faceToDir(n.face, n.u0 + (n.u1 - n.u0) * a, n.v0 + (n.v1 - n.v0) * b, d);
    for (const h of [hMin, hMax]) {
      const r = radiusKm + h / 1000;
      pts.push([d[0] * r, d[1] * r, d[2] * r]);
    }
  }
  let cx = 0; let cy = 0; let cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= pts.length; cy /= pts.length; cz /= pts.length;
  let r2 = 0;
  for (const p of pts) r2 = Math.max(r2, (p[0] - cx) ** 2 + (p[1] - cy) ** 2 + (p[2] - cz) ** 2);
  // The sphere bulges past the chords between the samples: a margin covers it.
  out.center.set(cx, cy, cz);
  out.radius = Math.sqrt(r2) * 1.03 + 1e-3;
  return out;
}

export function makeNode(p: TreeParams, face: number, level: number, x: number, y: number, parent: QuadNode | null): QuadNode {
  const size = 2 / 2 ** level;
  const u0 = -1 + x * size; const v0 = -1 + y * size;
  const u1 = u0 + size; const v1 = v0 + size;
  const centre = faceToDir(face, (u0 + u1) / 2, (v0 + v1) / 2) as Vec3;
  let ang = 0;
  const d = [0, 0, 0];
  for (const [a, b] of SAMPLE_UV) {
    faceToDir(face, u0 + size * a, v0 + size * b, d);
    ang = Math.max(ang, angle(centre, d));
  }
  const c00 = faceToDir(face, u0, v0); const c10 = faceToDir(face, u1, v0);
  const edgeKm = angle(c00, c10) * p.radiusKm;
  const hMin = parent ? parent.hMin : p.hMin;
  const hMax = parent ? parent.hMax : p.hMax;
  const node: QuadNode = {
    face, level, x, y, key: `${face}/${level}/${x}/${y}`, parent, children: null,
    u0, v0, u1, v1, centre, angRadius: ang, edgeKm, spacingKm: edgeKm / p.segments,
    hMin, hMax, sphere: new THREE.Sphere(), seen: 0,
  };
  // Until a child is built, its bounds are its parent's widened by what a
  // finer grid can add: a fifth of its own edge, within the world's.
  if (parent) {
    const m = edgeKm * 200;
    node.hMin = Math.max(p.hMin, hMin - m);
    node.hMax = Math.min(p.hMax, hMax + m);
  }
  nodeSphere(node, p.radiusKm, node.hMin, node.hMax, node.sphere);
  return node;
}

export class QuadTree {
  readonly roots: QuadNode[];
  readonly params: TreeParams;
  private count = 6;

  constructor(params: TreeParams) {
    this.params = params;
    this.roots = [];
    for (let f = 0; f < FACE_COUNT; f++) this.roots.push(makeNode(params, f, 0, 0, 0, null));
  }

  children(n: QuadNode): QuadNode[] {
    if (!n.children) {
      const l = n.level + 1; const x = n.x * 2; const y = n.y * 2;
      n.children = [
        makeNode(this.params, n.face, l, x, y, n),
        makeNode(this.params, n.face, l, x + 1, y, n),
        makeNode(this.params, n.face, l, x, y + 1, n),
        makeNode(this.params, n.face, l, x + 1, y + 1, n),
      ];
      this.count += 4;
    }
    return n.children;
  }

  /** A built chunk's own height range tightens its culling bounds. */
  setBounds(n: QuadNode, hMin: number, hMax: number): void {
    n.hMin = hMin; n.hMax = hMax;
    nodeSphere(n, this.params.radiusKm, hMin, hMax, n.sphere);
  }

  /** Drop subtrees the selection has not visited for a while and that hold
   *  nothing `keep` wants kept (a built chunk in the cache). */
  prune(frame: number, maxAge: number, keep: (n: QuadNode) => boolean): void {
    const walk = (n: QuadNode): boolean => {
      let busy = keep(n) || frame - n.seen < maxAge;
      if (n.children) {
        let kidsBusy = false;
        for (const c of n.children) if (walk(c)) kidsBusy = true;
        if (!kidsBusy) { this.count -= 4; n.children = null; }
        busy = busy || kidsBusy;
      }
      return busy;
    };
    for (const r of this.roots) walk(r);
  }

  size(): number {
    return this.count;
  }
}

// ── Culling ───────────────────────────────────────────────────────────────

/**
 * Is any part of the node above the horizon? A point at radius ρ is seen
 * from a camera at distance d over an occluding sphere of radius r₀ when
 * its angle from the camera's direction is under acos(r₀/d) + acos(r₀/ρ).
 * The node's nearest point is its centre's angle less its angular radius,
 * and its highest ground is at hMax, so the test only ever keeps too much.
 */
export function aboveHorizon(n: Pick<QuadNode, 'centre' | 'angRadius' | 'hMax'>, cam: ArrayLike<number>, radiusKm: number, occluderKm: number): boolean {
  const d = Math.sqrt(cam[0] * cam[0] + cam[1] * cam[1] + cam[2] * cam[2]);
  if (d < 1e-9) return true;
  const camDir = [cam[0] / d, cam[1] / d, cam[2] / d];
  const r0 = Math.min(occluderKm, d);
  const top = Math.max(r0, radiusKm + n.hMax / 1000);
  const limit = Math.acos(Math.min(1, r0 / d)) + Math.acos(Math.min(1, r0 / top));
  return angle(n.centre, camDir) - n.angRadius < limit;
}

/** Is the whole node inside the patch the surface scene draws (rad round the site)? */
export function insidePatch(n: Pick<QuadNode, 'centre' | 'angRadius'>, site: ArrayLike<number>, patchAngle: number): boolean {
  return patchAngle > 0 && angle(n.centre, site) + n.angRadius < patchAngle;
}

// ── Selection ─────────────────────────────────────────────────────────────

export interface SelectView {
  /** Camera position, km, planet-centred. */
  cam: ArrayLike<number>;
  /** The camera's frustum in the globe frame, or null to skip the test. */
  frustum: THREE.Frustum | null;
  /** Pixels per radian at the screen's centre: viewport height / (2 tan(fov/2)). */
  pxPerRad: number;
}

export interface SelectOptions {
  radiusKm: number;
  /** Radius nothing is hidden behind (reference sphere + world's lowest ground), km. */
  occluderKm: number;
  /** Split while a grid cell spans more than this many pixels. */
  targetPx: number;
  maxLevel: number;
  /** Most chunks drawn. */
  maxChunks: number;
  /** Site direction and the patch angle skipped round it (0: none). */
  site: ArrayLike<number>;
  patchAngle: number;
  /** Built and drawable. */
  ready: (n: QuadNode) => boolean;
  /** Was split last frame: kept split down to a lower error (hysteresis). */
  wasSplit?: (n: QuadNode) => boolean;
  frame?: number;
}

export interface Selection {
  /** Chunks to draw this frame. */
  draw: QuadNode[];
  /** Chunks wanted and not built, with how much they matter (higher first). */
  want: { node: QuadNode; priority: number }[];
  /** Nodes split this frame (next frame's hysteresis). */
  split: Set<string>;
  /** Visited nodes culled as out of view, under the horizon or inside the patch. */
  culled: number;
}

export function visible(n: QuadNode, view: SelectView, o: SelectOptions): boolean {
  if (insidePatch(n, o.site, o.patchAngle)) return false;
  if (!aboveHorizon(n, view.cam, o.radiusKm, o.occluderKm)) return false;
  if (view.frustum && !view.frustum.intersectsSphere(n.sphere)) return false;
  return true;
}

/** How many pixels one grid cell of the node spans, seen from the camera at its nearest. */
export function cellPixels(n: QuadNode, view: SelectView): number {
  const c = n.sphere.center;
  const dx = view.cam[0] - c.x; const dy = view.cam[1] - c.y; const dz = view.cam[2] - c.z;
  const dist = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy + dz * dz) - n.sphere.radius);
  return (n.spacingKm / dist) * view.pxPerRad;
}

/**
 * The greedy pass. Start from the visible roots; repeatedly take the leaf
 * whose cells look biggest on screen; split it if that is still over the
 * target, the budget allows its visible children, and they are all built;
 * otherwise leave it drawn and, if only readiness stood in the way, ask
 * for its children. Stops when nothing left is worth splitting.
 */
export function selectChunks(tree: QuadTree, view: SelectView, o: SelectOptions): Selection {
  const frame = o.frame ?? 0;
  const draw = new Set<QuadNode>();
  const want: { node: QuadNode; priority: number }[] = [];
  const split = new Set<string>();
  let culled = 0;
  // Max-heap on the score (cell pixels over the node's own threshold).
  const heap: { n: QuadNode; s: number }[] = [];
  const push = (n: QuadNode) => {
    const thr = o.wasSplit && o.wasSplit(n) ? o.targetPx * 0.75 : o.targetPx;
    const item = { n, s: cellPixels(n, view) / thr };
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].s >= heap[i].s) break;
      [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < heap.length && heap[l].s > heap[m].s) m = l;
        if (r < heap.length && heap[r].s > heap[m].s) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  for (const r of tree.roots) {
    r.seen = frame;
    if (!visible(r, view, o)) { culled++; continue; }
    if (!o.ready(r)) { want.push({ node: r, priority: 1e9 }); continue; }
    draw.add(r);
    push(r);
  }
  while (heap.length) {
    const { n, s } = pop();
    if (s <= 1) break;
    if (n.level >= o.maxLevel) continue;
    const kids = tree.children(n);
    const shown: QuadNode[] = [];
    for (const k of kids) {
      k.seen = frame;
      if (visible(k, view, o)) shown.push(k); else culled++;
    }
    if (draw.size - 1 + shown.length > o.maxChunks) continue;
    const missing = shown.filter((k) => !o.ready(k));
    if (missing.length) {
      for (const k of missing) want.push({ node: k, priority: s });
      continue;
    }
    draw.delete(n);
    split.add(n.key);
    for (const k of shown) { draw.add(k); push(k); }
  }
  want.sort((a, b) => b.priority - a.priority);
  return { draw: [...draw], want, split, culled };
}

// ── Chunk geometry ────────────────────────────────────────────────────────

export interface ChunkArrays {
  /** Vertex positions relative to `origin`, km. */
  position: Float32Array;
  /** Unit normals in the globe frame. */
  normal: Float32Array;
  /** The height sampled (m), before the floor: Earth's sea depth survives here. */
  height: Float32Array;
  index: Uint16Array | Uint32Array;
  /** Where the mesh goes, km (float64). */
  origin: Vec3;
  /** Range of the drawn heights, m. */
  hMin: number;
  hMax: number;
}

/** Vertices in a chunk: the grid plus one skirt vertex under every edge vertex. */
export function chunkVertexCount(segments: number): number {
  const n = segments + 1;
  return n * n + 4 * n;
}

/** Triangle indices of the grid and its skirts, shared by every chunk of that size. */
export function chunkIndices(segments: number): Uint16Array | Uint32Array {
  const n = segments + 1;
  const tris = segments * segments * 2 + 4 * segments * 2;
  const out = chunkVertexCount(segments) > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let k = 0;
  for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
    const a = j * n + i; const b = a + 1; const c = a + n; const d = c + 1;
    out[k++] = a; out[k++] = b; out[k++] = d;
    out[k++] = a; out[k++] = d; out[k++] = c;
  }
  // Skirts hang from the four edges; the winding faces outward on each.
  const base = n * n;
  const edge = (e: number, i: number) => base + e * n + i;
  const at = (i: number, j: number) => j * n + i;
  for (let i = 0; i < segments; i++) {
    // v = 0 edge (outward is −t): top a→b, skirt below.
    let a = at(i, 0); let b = at(i + 1, 0); let sa = edge(0, i); let sb = edge(0, i + 1);
    out[k++] = a; out[k++] = sa; out[k++] = sb; out[k++] = a; out[k++] = sb; out[k++] = b;
    // v = 1 edge (outward +t).
    a = at(i, segments); b = at(i + 1, segments); sa = edge(1, i); sb = edge(1, i + 1);
    out[k++] = a; out[k++] = b; out[k++] = sb; out[k++] = a; out[k++] = sb; out[k++] = sa;
    // u = 0 edge (outward −s).
    a = at(0, i); b = at(0, i + 1); sa = edge(2, i); sb = edge(2, i + 1);
    out[k++] = a; out[k++] = b; out[k++] = sb; out[k++] = a; out[k++] = sb; out[k++] = sa;
    // u = 1 edge (outward +s).
    a = at(segments, i); b = at(segments, i + 1); sa = edge(3, i); sb = edge(3, i + 1);
    out[k++] = a; out[k++] = sa; out[k++] = sb; out[k++] = a; out[k++] = sb; out[k++] = b;
  }
  return out;
}

export type ChunkHeight = (x: number, y: number, z: number) => number;

/**
 * Builds one chunk a row at a time, so a frame can stop when its budget is
 * spent and pick up where it left off. The heights are sampled on the grid
 * plus a one-cell ring round it, so the normals at the edge are the same
 * whichever neighbour computes them.
 */
export class ChunkBuilder {
  readonly node: QuadNode;
  private readonly n: number;
  private readonly m: number;
  private readonly dirs: Float64Array;
  private readonly heights: Float64Array;
  private row = 0;
  private result: ChunkArrays | null = null;

  constructor(
    node: QuadNode,
    private readonly segments: number,
    private readonly radiusKm: number,
    private readonly height: ChunkHeight,
    /** Drawn heights never go under this (Earth's sea at 0). */
    private readonly floor = -Infinity,
  ) {
    this.node = node;
    this.n = segments + 1;
    this.m = segments + 3;
    this.dirs = new Float64Array(this.m * this.m * 3);
    this.heights = new Float64Array(this.m * this.m);
  }

  get done(): boolean {
    return this.result !== null;
  }

  /** Work until `more()` says stop (at least one row); true once finished. */
  step(more: () => boolean = () => true): boolean {
    if (this.result) return true;
    const { node, segments, m } = this;
    const du = (node.u1 - node.u0) / segments; const dv = (node.v1 - node.v0) / segments;
    const d = [0, 0, 0];
    do {
      if (this.row >= m) break;
      const j = this.row;
      for (let i = 0; i < m; i++) {
        faceToDir(node.face, node.u0 + (i - 1) * du, node.v0 + (j - 1) * dv, d);
        const k = j * m + i;
        this.dirs[k * 3] = d[0]; this.dirs[k * 3 + 1] = d[1]; this.dirs[k * 3 + 2] = d[2];
        this.heights[k] = this.height(d[0], d[1], d[2]);
      }
      this.row++;
    } while (more());
    if (this.row < m) return false;
    this.result = this.finish();
    return true;
  }

  /** The arrays, once `step` has returned true. */
  arrays(): ChunkArrays {
    if (!this.result) throw new Error('chunk not built');
    return this.result;
  }

  private finish(): ChunkArrays {
    const { n, m, segments, radiusKm, dirs, heights, floor, node } = this;
    const R = radiusKm;
    const drawn = (k: number) => Math.max(floor, heights[k]);
    // Every ring point in km (float64), for the normals.
    const P = new Float64Array(m * m * 3);
    for (let k = 0; k < m * m; k++) {
      const r = R + drawn(k) / 1000;
      P[k * 3] = dirs[k * 3] * r; P[k * 3 + 1] = dirs[k * 3 + 1] * r; P[k * 3 + 2] = dirs[k * 3 + 2] * r;
    }
    const origin: Vec3 = [node.centre[0] * R, node.centre[1] * R, node.centre[2] * R];
    const count = chunkVertexCount(segments);
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const height = new Float32Array(count);
    let hMin = Infinity; let hMax = -Infinity;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j + 1) * m + (i + 1);
      const v = j * n + i;
      position[v * 3] = P[k * 3] - origin[0];
      position[v * 3 + 1] = P[k * 3 + 1] - origin[1];
      position[v * 3 + 2] = P[k * 3 + 2] - origin[2];
      // Central differences across the ring: (right − left) × (up − down),
      // which points outward because s × t does.
      const l = k - 1; const r = k + 1; const dn = k - m; const up = k + m;
      const ax = P[r * 3] - P[l * 3]; const ay = P[r * 3 + 1] - P[l * 3 + 1]; const az = P[r * 3 + 2] - P[l * 3 + 2];
      const bx = P[up * 3] - P[dn * 3]; const by = P[up * 3 + 1] - P[dn * 3 + 1]; const bz = P[up * 3 + 2] - P[dn * 3 + 2];
      let nx = ay * bz - az * by; let ny = az * bx - ax * bz; let nz = ax * by - ay * bx;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      normal[v * 3] = nx; normal[v * 3 + 1] = ny; normal[v * 3 + 2] = nz;
      height[v] = heights[k];
      const h = drawn(k);
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
    // Skirts: each edge vertex again, dropped by a depth that covers the
    // largest step a neighbour at another level can leave (a few cells' slope).
    const skirtKm = Math.max(0.02, Math.min(node.edgeKm * 0.08, (hMax - hMin) / 1000 * 0.5 + node.spacingKm * 0.5));
    const base = n * n;
    const edgeIdx = (e: number, i: number): number => {
      if (e === 0) return i;
      if (e === 1) return segments * n + i;
      if (e === 2) return i * n;
      return i * n + segments;
    };
    for (let e = 0; e < 4; e++) for (let i = 0; i < n; i++) {
      const src = edgeIdx(e, i);
      const dst = base + e * n + i;
      const px = position[src * 3] + origin[0]; const py = position[src * 3 + 1] + origin[1]; const pz = position[src * 3 + 2] + origin[2];
      const l = Math.sqrt(px * px + py * py + pz * pz);
      const s = (l - skirtKm) / l;
      position[dst * 3] = px * s - origin[0];
      position[dst * 3 + 1] = py * s - origin[1];
      position[dst * 3 + 2] = pz * s - origin[2];
      normal[dst * 3] = normal[src * 3]; normal[dst * 3 + 1] = normal[src * 3 + 1]; normal[dst * 3 + 2] = normal[src * 3 + 2];
      height[dst] = height[src];
    }
    return { position, normal, height, index: chunkIndices(segments), origin, hMin, hMax };
  }
}

// ── Budget per world and preset ───────────────────────────────────────────

export interface LodBudget {
  segments: number;
  maxChunks: number;
  targetPx: number;
  /** Built chunks kept round after they stop being drawn. */
  cache: number;
  /** Building per frame, ms. */
  buildMs: number;
}

export function lodBudget(level: 'performance' | 'balanced' | 'high' | 'ultra', lite: boolean): LodBudget {
  if (lite || level === 'performance') return { segments: 32, maxChunks: 40, targetPx: 14, cache: 48, buildMs: 1.5 };
  if (level === 'balanced') return { segments: 32, maxChunks: 60, targetPx: 11, cache: 80, buildMs: 2 };
  if (level === 'high') return { segments: 32, maxChunks: 72, targetPx: 9, cache: 96, buildMs: 2 };
  return { segments: 32, maxChunks: 90, targetPx: 7, cache: 128, buildMs: 2 };
}

/** The deepest level a world splits to: where cells reach about `cellM` metres. */
export function maxLevelFor(radiusKm: number, segments: number, cellM: number): number {
  const faceKm = (radiusKm * Math.PI) / 2;
  return Math.max(0, Math.ceil(Math.log2((faceKm * 1000) / (segments * cellM))));
}
