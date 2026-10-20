// Traffic on Tbilisi's streets. The road network is OpenStreetMap's: every
// street vertex a node, the streets that share a vertex joined at it. Cars
// keep to the right, take a turning at a junction, slow for the bend, keep a
// gap to the car in front, and stop for the pilot, the pilot's car and
// anyone in the road. They appear out of sight round the crew and go again
// once the crew has left them behind.
//
// Three bodies — a hatchback, a saloon and the yellow marshrutka — each one
// instanced mesh with its lamps in a second, so the whole of the traffic is
// six draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD, type EarthData, type Pt } from '@/lib/solar-system/world-earth-data';
import { withHaze } from '@/lib/solar-system/world-earth-haze';
import type { Mover } from '@/lib/solar-system/world-earth-people';

export interface TrafficHandle {
  group: THREE.Group;
  /** Cars near a point, as circles, for the crew and the player's car to bump into. */
  movers: (x: number, z: number, r: number, out: Mover[]) => Mover[];
  update: (dt: number, crewX: number, crewZ: number, obstacles: Mover[], night: number, floorAt: (x: number, z: number) => number) => void;
  dispose: () => void;
}

const CARS = 30;
const NEAR = 650;
const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const PAINT = [srgb(0.92, 0.92, 0.9), srgb(0.08, 0.08, 0.09), srgb(0.6, 0.62, 0.64), srgb(0.55, 0.08, 0.08), srgb(0.14, 0.22, 0.4), srgb(0.78, 0.76, 0.7), srgb(0.2, 0.2, 0.22)];
const hash = (n: number) => { const s = Math.sin(n * 91.3 + 17.1) * 43758.5453; return s - Math.floor(s); };

interface Node { x: number; z: number; out: number[] }
interface Edge { a: number; b: number; len: number; cls: number; lane: number }
interface Car {
  active: boolean; edge: number; s: number; speed: number; variant: number; colour: THREE.Color;
  x: number; z: number; y: number; yaw: number;
}

/** A car body along +z, 0 at the ground, with its colour in the vertex colours: white is paint, the rest keep their own. */
function bodyGeometry(kind: 'hatch' | 'saloon' | 'van'): { body: THREE.BufferGeometry; lamps: THREE.BufferGeometry; length: number } {
  const L = kind === 'van' ? 5.4 : kind === 'saloon' ? 4.6 : 3.9;
  const W = kind === 'van' ? 2.0 : 1.76;
  const parts: THREE.BufferGeometry[] = [];
  const lamps: THREE.BufferGeometry[] = [];
  const paint = new THREE.Color(1, 1, 1);
  const glass = new THREE.Color(0.06, 0.08, 0.1);
  const dark = new THREE.Color(0.04, 0.04, 0.04);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, list = parts) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    list.push(g);
  };
  if (kind === 'van') {
    box(W, 1.35, L, 0, 1.2, 0, paint);
    box(W * 0.98, 0.55, L * 0.72, 0, 1.55, -0.3, glass);
    box(W * 0.9, 0.5, 0.05, 0, 1.45, L / 2 + 0.01, glass);
    box(W, 0.45, L, 0, 0.55, 0, paint);
  } else {
    const cabin = kind === 'saloon' ? L * 0.45 : L * 0.55;
    box(W, 0.62, L, 0, 0.66, 0, paint);
    box(W * 0.9, 0.5, cabin, 0, 1.22, kind === 'saloon' ? -0.1 : -0.25, paint);
    box(W * 0.92, 0.38, cabin * 0.94, 0, 1.24, kind === 'saloon' ? -0.1 : -0.25, glass);
  }
  for (const zx of [L * 0.32, -L * 0.32]) for (const s of [-1, 1]) {
    const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10).toNonIndexed().rotateZ(Math.PI / 2).translate(s * (W / 2 - 0.08), 0.32, zx);
    const n = w.attributes.position.count;
    const col = new Float32Array(n * 3).fill(dark.r);
    w.setAttribute('color', new THREE.BufferAttribute(col, 3));
    w.deleteAttribute('uv');
    parts.push(w);
  }
  const white = new THREE.Color(1, 0.95, 0.85);
  const red = new THREE.Color(1, 0.08, 0.05);
  for (const s of [-1, 1]) {
    box(0.3, 0.12, 0.04, s * (W / 2 - 0.3), 0.78, L / 2 + 0.01, white, lamps);
    box(0.28, 0.14, 0.04, s * (W / 2 - 0.26), 0.86, -L / 2 - 0.01, red, lamps);
  }
  const body = mergeGeometries(parts)!;
  body.computeVertexNormals();
  for (const p of parts) p.dispose();
  const lampGeom = mergeGeometries(lamps)!;
  for (const p of lamps) p.dispose();
  return { body, lamps: lampGeom, length: L };
}

export function makeTraffic(data: EarthData, lite: boolean): TrafficHandle {
  const group = new THREE.Group();
  group.name = 'earth-traffic';

  // ── The network. ──
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const index = new Map<string, number>();
  const nodeAt = ([x, z]: Pt) => {
    const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    let i = index.get(k);
    if (i === undefined) { i = nodes.length; nodes.push({ x, z, out: [] }); index.set(k, i); }
    return i;
  };
  for (const r of data.roads) {
    if (r.tunnel || r.cls > ROAD.service || r.pts.length < 2) continue;
    if (!r.pts.some(([x, z]) => Math.hypot(x, z) < 2600)) continue;
    const lane = Math.min(3.2, Math.max(1.3, r.width / 4));
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const a = nodeAt(r.pts[k]); const b = nodeAt(r.pts[k + 1]);
      if (a === b) continue;
      const len = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z);
      // Both ways: OSM's one-way tags are not in the bake.
      for (const [from, to] of [[a, b], [b, a]]) {
        nodes[from].out.push(edges.length);
        edges.push({ a: from, b: to, len, cls: r.cls, lane });
      }
    }
  }

  // ── Bodies. ──
  const kinds = [bodyGeometry('hatch'), bodyGeometry('saloon'), bodyGeometry('van')];
  const bodyMat = withHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.45 }), 'traffic');
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x111111 });
  const bodies = kinds.map((k) => {
    const m = new THREE.InstancedMesh(k.body, bodyMat, CARS);
    m.castShadow = !lite; m.receiveShadow = true; m.count = 0;
    m.boundingSphere = new THREE.Sphere();
    group.add(m);
    return m;
  });
  const lamps = kinds.map((k) => {
    const m = new THREE.InstancedMesh(k.lamps, lampMat, CARS);
    m.count = 0;
    m.boundingSphere = new THREE.Sphere();
    group.add(m);
    return m;
  });

  const cars: Car[] = Array.from({ length: CARS }, (_, i) => ({
    active: false, edge: 0, s: 0, speed: 0, variant: hash(i) < 0.12 ? 2 : hash(i) < 0.5 ? 1 : 0,
    colour: hash(i) < 0.12 ? srgb(0.95, 0.72, 0.1) : PAINT[Math.floor(hash(i + 5) * PAINT.length)], x: 0, z: 0, y: 0, yaw: 0,
  }));

  const limit = (cls: number) => (cls <= ROAD.primary ? 15 : cls <= ROAD.tertiary ? 12 : cls === ROAD.residential ? 8 : 5);
  const pose = (c: Car, dt: number) => {
    const e = edges[c.edge];
    const A = nodes[e.a]; const B = nodes[e.b];
    const t = Math.min(1, c.s / (e.len || 1));
    const dx = (B.x - A.x) / (e.len || 1); const dz = (B.z - A.z) / (e.len || 1);
    // Keep right: the car's right, facing along the edge, is (−dz, dx).
    c.x = A.x + (B.x - A.x) * t - dz * e.lane;
    c.z = A.z + (B.z - A.z) * t + dx * e.lane;
    const want = Math.atan2(dx, dz);
    let d = want - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    // Fresh off a spawn the nose snaps to the road; on the move it comes round at a fixed rate in time, not frames.
    c.yaw += d * (dt < 0 ? 1 : 1 - Math.exp(-dt * 17));
  };
  const spawn = (c: Car, cx: number, cz: number) => {
    for (let tries = 0; tries < 12; tries++) {
      const edge = Math.floor(Math.random() * edges.length);
      const A = nodes[edges[edge].a];
      const d = Math.hypot(A.x - cx, A.z - cz);
      if (d < 120 || d > 520) continue;
      c.edge = edge; c.s = 0; c.speed = limit(edges[edge].cls) * 0.7; c.active = true;
      const e = edges[edge];
      c.yaw = Math.atan2(nodes[e.b].x - A.x, nodes[e.b].z - A.z);
      pose(c, -1);
      return;
    }
  };
  const next = (c: Car) => {
    const e = edges[c.edge];
    const options = nodes[e.b].out.filter((o) => edges[o].b !== e.a);
    const pool = options.length ? options : nodes[e.b].out;
    if (!pool.length) { c.active = false; return; }
    // Mostly straight on, sometimes a turning.
    const dx = nodes[e.b].x - nodes[e.a].x; const dz = nodes[e.b].z - nodes[e.a].z;
    let best = pool[0]; let bestScore = -Infinity;
    for (const o of pool) {
      const f = edges[o];
      const fx = nodes[f.b].x - nodes[f.a].x; const fz = nodes[f.b].z - nodes[f.a].z;
      const straight = (dx * fx + dz * fz) / ((Math.hypot(dx, dz) * Math.hypot(fx, fz)) || 1);
      const score = straight + Math.random() * 1.1;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    c.s -= e.len;
    c.edge = best;
  };

  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  // One circle per car, written in place: a query hands back the same objects every frame.
  const moverPool: Mover[] = cars.map(() => ({ x: 0, z: 0, vx: 0, vz: 0, r: 1.9 }));
  return {
    group,
    movers(x, z, r, out) {
      out.length = 0;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c.active || Math.abs(c.x - x) > r || Math.abs(c.z - z) > r) continue;
        const m = moverPool[i];
        m.x = c.x; m.z = c.z; m.vx = Math.sin(c.yaw) * c.speed; m.vz = Math.cos(c.yaw) * c.speed; m.r = c.variant === 2 ? 2.4 : 1.9;
        out.push(m);
      }
      return out;
    },
    update(dt, cx, cz, obstacles, night, floorAt) {
      if (!edges.length) return;
      const counts = [0, 0, 0];
      for (const c of cars) {
        if (!c.active) { spawn(c, cx, cz); if (!c.active) continue; }
        if (Math.hypot(c.x - cx, c.z - cz) > NEAR) { c.active = false; continue; }
        const e = edges[c.edge];
        let target = limit(e.cls);
        // Slow for the bend at the end of this stretch.
        const remain = e.len - c.s;
        if (remain < 18) target = Math.min(target, 5 + remain * 0.4);
        const fx = Math.sin(c.yaw); const fz = Math.cos(c.yaw);
        const gap = (x: number, z: number, r: number) => {
          const dx = x - c.x; const dz = z - c.z;
          const along = dx * fx + dz * fz;
          const across = Math.abs(dx * fz - dz * fx);
          return along > 0 && across < 1.8 + r ? along - r : Infinity;
        };
        let clear = Infinity;
        for (const o of cars) if (o !== c && o.active) clear = Math.min(clear, gap(o.x, o.z, 2.2));
        for (const o of obstacles) clear = Math.min(clear, gap(o.x, o.z, o.r));
        // A gap of two seconds, and a full stop short of anything in the road.
        if (clear < 4) target = 0;
        else if (clear < 4 + c.speed * 2) target = Math.min(target, (clear - 4) / 2);
        const accel = target > c.speed ? 2.2 : 6.5;
        c.speed += Math.max(-accel * dt, Math.min(accel * dt, target - c.speed));
        c.s += c.speed * dt;
        while (c.active && c.s >= edges[c.edge].len) next(c);
        if (!c.active) continue;
        pose(c, dt);
        c.y = floorAt(c.x, c.z);
        const k = counts[c.variant]++;
        q.setFromAxisAngle(up, c.yaw);
        m4.compose(p.set(c.x, c.y, c.z), q, one);
        bodies[c.variant].setMatrixAt(k, m4);
        bodies[c.variant].setColorAt(k, c.colour);
        lamps[c.variant].setMatrixAt(k, m4);
      }
      // Every live car is within NEAR of the crew: one sphere there is the mesh's bound, and it culls.
      for (let v = 0; v < 3; v++) {
        bodies[v].boundingSphere!.set(p.set(cx, floorAt(cx, cz), cz), NEAR + 8);
        lamps[v].boundingSphere!.copy(bodies[v].boundingSphere!);
        bodies[v].count = counts[v]; lamps[v].count = counts[v];
        bodies[v].instanceMatrix.needsUpdate = true; lamps[v].instanceMatrix.needsUpdate = true;
        const colours = bodies[v].instanceColor;
        if (colours) colours.needsUpdate = true;
      }
      // Lamps are dark by day and burn at night.
      lampMat.color.setScalar(0.07 + night * 2.2);
    },
    dispose() {
      for (const k of kinds) { k.body.dispose(); k.lamps.dispose(); }
      for (const m of [...bodies, ...lamps]) m.dispose();
      bodyMat.dispose(); lampMat.dispose();
    },
  };
}
