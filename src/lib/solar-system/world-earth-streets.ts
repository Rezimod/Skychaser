// What lies on the ground between the buildings: OpenStreetMap's streets,
// steps and paths draped over the terrain, the bridges across the Mtkvari
// carried level from bank to bank (and walkable), the river and the lakes as
// water, the trees — mapped ones where they are mapped, and woods and parks
// filled from the land cover — and after dark the street lights, which are a
// point each: sodium orange on the older side streets, LED white on the
// avenues, and the glow of the rest of the city out to the edge of the grid.

import * as THREE from 'three';
import {
  COVER, ROAD, centroid, coverAt, makeRiverLevel, type EarthData, type HeightGrid, type Pt,
} from '@/lib/solar-system/world-earth-data';
import { withHaze } from '@/lib/solar-system/world-earth-haze';
import { cellKey } from '@/lib/solar-system/world-earth-city';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface StreetsHandle {
  group: THREE.Group;
  /** A bridge deck under (x, z), or NaN. */
  deckAt: (x: number, z: number) => number;
  /** Open water under (x, z) that nobody can walk on. */
  isWater: (x: number, z: number) => boolean;
  riverLevel: (x: number, z: number) => number;
  update: (dt: number, cameraPos: THREE.Vector3, night: number) => void;
  dispose: () => void;
}

const ROAD_REACH = 2100;
const STREET_CELL = 1000;
const TREE_CELL = 700;

const hash2 = (x: number, z: number, s = 0) => {
  let n = (Math.round(x * 7) * 374761393 + Math.round(z * 7) * 668265263 + s * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const ASPHALT = srgb(0.27, 0.27, 0.28);
const STONE = srgb(0.52, 0.49, 0.45);
const STEPS = srgb(0.6, 0.57, 0.52);

export function makeStreets(data: EarthData, heightAt: (x: number, z: number) => number, lite: boolean): StreetsHandle {
  const group = new THREE.Group();
  group.name = 'earth-streets';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const walk = data.grids[0];
  const city = data.grids[1];
  const riverLevel = makeRiverLevel(data.manifest.river);

  // ── Bridges: level from one bank to the other. ──
  interface Deck { pts: Pt[]; y0: number; y1: number; len: number; half: number }
  const decks: Deck[] = [];
  const deckHash = new Map<number, Deck[]>();
  for (const r of data.roads) {
    if (!r.bridge || r.pts.length < 2) continue;
    let len = 0;
    for (let k = 1; k < r.pts.length; k++) len += Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]);
    const [ax, az] = r.pts[0]; const [bx, bz] = r.pts[r.pts.length - 1];
    const d: Deck = { pts: r.pts, y0: heightAt(ax, az) + 0.2, y1: heightAt(bx, bz) + 0.2, len, half: Math.max(1.4, r.width / 2) };
    // Clear the water: a deck never sags under the river's own banks.
    const mid = centroid(r.pts);
    const floor = riverLevel(mid[0], mid[1]) + 5;
    if (Math.max(d.y0, d.y1) < floor) { d.y0 = Math.max(d.y0, floor); d.y1 = Math.max(d.y1, floor); }
    decks.push(d);
    for (const [x, z] of r.pts) {
      const key = cellKey(Math.floor(x / 50), Math.floor(z / 50));
      let list = deckHash.get(key);
      if (!list) { list = []; deckHash.set(key, list); }
      if (!list.includes(d)) list.push(d);
    }
  }
  const deckAt = (x: number, z: number): number => {
    let best = NaN;
    const i = Math.floor(x / 50); const j = Math.floor(z / 50);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const list = deckHash.get(cellKey(i + di, j + dj));
      if (!list) continue;
      for (const d of list) {
        let run = 0;
        for (let k = 0; k + 1 < d.pts.length; k++) {
          const [ax, az] = d.pts[k]; const [bx, bz] = d.pts[k + 1];
          const dx = bx - ax; const dz = bz - az; const l = Math.hypot(dx, dz) || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l)));
          const dist = Math.hypot(x - ax - dx * t, z - az - dz * t);
          if (dist <= d.half) {
            const y = d.y0 + ((d.y1 - d.y0) * (run + t * l)) / (d.len || 1);
            if (Number.isNaN(best) || y > best) best = y;
          }
          run += l;
        }
      }
    }
    return best;
  };

  // ── Streets: ribbons in 1 km cells. ──
  const streetMat = withHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 'street');
  materials.push(streetMat);
  const cells = new Map<string, { pos: number[]; col: number[]; idx: number[] }>();
  const deckSides: number[] = [];
  const deckIdx: number[] = [];
  for (const r of data.roads) {
    if (r.tunnel || r.pts.length < 2) continue;
    // Paths and service lanes only near the crew; streets out to the edge of the walk area.
    const reach = r.cls >= ROAD.service ? (lite ? 800 : 1300) : ROAD_REACH;
    if (!r.pts.some(([x, z]) => Math.abs(x) < reach && Math.abs(z) < reach)) continue;
    const c = r.cls === ROAD.steps ? STEPS : r.cls >= ROAD.pedestrian ? STONE : ASPHALT;
    const half = Math.max(0.8, r.width / 2);
    const deck = r.bridge ? decks.find((d) => d.pts === r.pts) ?? null : null;
    // Resample to a few metres so the ribbon follows the ground.
    const line: [number, number, number][] = [];
    let run = 0;
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, az] = r.pts[k]; const [bx, bz] = r.pts[k + 1];
      const l = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(l / 6));
      for (let s = 0; s < n; s++) line.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n, run + (l * s) / n]);
      run += l;
    }
    line.push([r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1], run]);
    const mid = line[Math.floor(line.length / 2)];
    const key = `${Math.floor(mid[0] / STREET_CELL)},${Math.floor(mid[1] / STREET_CELL)}`;
    if (!cells.has(key)) cells.set(key, { pos: [], col: [], idx: [] });
    const cell = cells.get(key)!;
    const start = cell.pos.length / 3;
    for (let k = 0; k < line.length; k++) {
      const [x, z, at] = line[k];
      const [px, pz] = line[Math.max(0, k - 1)]; const [nx, nz] = line[Math.min(line.length - 1, k + 1)];
      let tx = nx - px; let tz = nz - pz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const ox = -tz * half; const oz = tx * half;
      for (const s of [-1, 1]) {
        const vx = x + ox * s; const vz = z + oz * s;
        const y = deck ? deck.y0 + ((deck.y1 - deck.y0) * at) / (deck.len || 1) : heightAt(vx, vz) + 0.12;
        cell.pos.push(vx, y, vz);
        const shade = 0.92 + hash2(vx, vz) * 0.12;
        cell.col.push(c.r * shade, c.g * shade, c.b * shade);
      }
      if (k > 0) { const a = start + (k - 1) * 2; cell.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      if (deck) {
        // The deck's edge beams, a metre and a half deep.
        const base = deckSides.length / 3;
        const y = deck.y0 + ((deck.y1 - deck.y0) * at) / (deck.len || 1);
        for (const s of [-1, 1]) { deckSides.push(x + ox * s, y + 0.02, z + oz * s, x + ox * s, y - 1.5, z + oz * s); }
        if (k > 0) {
          const a = base - 4;
          deckIdx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4, a + 2, a + 6, a + 3, a + 3, a + 6, a + 7);
        }
      }
    }
  }
  const streetMeshes: THREE.Mesh[] = [];
  for (const cell of cells.values()) {
    if (!cell.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cell.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cell.col, 3));
    const nrm = new Float32Array(cell.pos.length);
    for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(cell.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(cell.idx, 1) : new THREE.Uint16BufferAttribute(cell.idx, 1));
    g.computeBoundingSphere();
    geometries.push(g);
    const m = new THREE.Mesh(g, streetMat);
    m.receiveShadow = true;
    m.name = 'streets';
    group.add(m);
    streetMeshes.push(m);
  }
  if (deckIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(deckSides, 3));
    g.setIndex(deckIdx);
    g.computeVertexNormals();
    geometries.push(g);
    const mat = withHaze(new THREE.MeshStandardMaterial({ color: srgb(0.55, 0.53, 0.5), roughness: 0.8, side: THREE.DoubleSide }), 'deck');
    materials.push(mat);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // ── Water: the Mtkvari at its own level, lakes at their shore. ──
  const waterNormal = { value: 0 };
  const waterMat = withHaze(new THREE.MeshStandardMaterial({ color: srgb(0.24, 0.23, 0.17), roughness: 0.1, metalness: 0, envMapIntensity: 1.3 }), 'water', false, (shader) => {
    shader.uniforms.uWaterT = waterNormal;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterT;\nfloat wn(vec2 p) { return sin(p.x) * cos(p.y * 0.9 + p.x * 0.3); }')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          // The current runs south-east; small wind ripples over it.
          vec2 q = vEarthPos.xz * 0.35 + vec2(-0.7, -0.7) * uWaterT * 0.9;
          vec2 r = vEarthPos.xz * 1.1 + vec2(0.4, -0.2) * uWaterT * 1.7;
          float ex = wn(q) * 0.05 + wn(r.yx) * 0.03;
          float ez = wn(q.yx + 1.7) * 0.05 + wn(r) * 0.03;
          normal = normalize((viewMatrix * vec4(normalize(vec3(ex, 1.0, ez)), 0.0)).xyz);
        }`);
  });
  materials.push(waterMat);
  {
    const pos: number[] = []; const idx: number[] = [];
    for (const w of data.water) {
      const outer = w.rings.find((r) => !r.inner)?.pts;
      if (!outer || outer.length < 3) continue;
      const holes = w.rings.filter((r) => r.inner).map((r) => r.pts);
      const c = centroid(outer);
      const nearRiver = data.manifest.river.some(([x, z]) => Math.hypot(x - c[0], z - c[1]) < 900) || outer.length > 200;
      let shore = Infinity;
      if (!nearRiver) for (const [x, z] of outer) shore = Math.min(shore, heightAt(x, z));
      let tris: number[][];
      try {
        tris = THREE.ShapeUtils.triangulateShape(outer.map(([x, z]) => new THREE.Vector2(x, z)), holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z))));
      } catch { continue; }
      const all = [...outer, ...holes.flat()];
      const base = pos.length / 3;
      for (const [x, z] of all) pos.push(x, nearRiver ? riverLevel(x, z) : shore - 0.4, z);
      for (const [a, b, cc] of tris) {
        const [ax, az] = all[a]; const [bx, bz] = all[b]; const [cx, cz] = all[cc];
        if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0) idx.push(base + a, base + b, base + cc);
        else idx.push(base + a, base + cc, base + b);
      }
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const nrm = new Float32Array(pos.length);
      for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      geometries.push(g);
      const m = new THREE.Mesh(g, waterMat);
      m.receiveShadow = true;
      m.name = 'water';
      group.add(m);
    }
  }
  const isWater = (x: number, z: number) => coverAt(walk, x, z) === COVER.water && Number.isNaN(deckAt(x, z));

  // ── Trees: mapped ones, and woods and parks filled from the land cover. ──
  // A broadleaf crown of a few lumpy lobes, a slim trunk; a pine as stacked cones. Unit tree ≈ 4.2 m.
  const lobes: THREE.BufferGeometry[] = [];
  for (const [ox, oy, oz, r] of [[0, 2.7, 0, 1], [0.55, 2.35, 0.25, 0.75], [-0.45, 2.45, -0.3, 0.78]] as const) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k); const y = p.getY(k); const z = p.getZ(k);
      const n = 1 + Math.sin(x * 7.1 + z * 5.3 + ox * 9) * 0.1 + Math.cos(y * 6.2 + oz * 7) * 0.08;
      p.setXYZ(k, x * n + ox, y * n * 0.9 + oy, z * n + oz);
    }
    lobes.push(g.index ? g.toNonIndexed() : g);
  }
  // Welded so the normals come out smooth: a crown reads as leaves, not facets.
  const crown = mergeVertices(mergeGeometries(lobes)!.deleteAttribute('normal').deleteAttribute('uv'), 0.02);
  crown.computeVertexNormals();
  for (const g of lobes) g.dispose();
  const trunk = new THREE.CylinderGeometry(0.07, 0.12, 2.2, 6).translate(0, 1.1, 0).deleteAttribute('uv');
  // Crown and trunk in one mesh, told apart by vertex colour: one draw call a cell, not two.
  const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const broad = mergeGeometries([paint(crown, new THREE.Color(1, 1, 1)), paint(trunk, srgb(0.55, 0.42, 0.34))])!;
  crown.dispose(); trunk.dispose();
  const coneFaceted = mergeGeometries([
    new THREE.ConeGeometry(0.62, 1.6, lite ? 6 : 9).translate(0, 1.4, 0),
    new THREE.ConeGeometry(0.5, 1.5, lite ? 6 : 9).translate(0, 2.3, 0),
    new THREE.ConeGeometry(0.34, 1.3, lite ? 6 : 9).translate(0, 3.1, 0),
    new THREE.CylinderGeometry(0.05, 0.08, 1.2, 5).translate(0, 0.6, 0),
  ].map((g) => g.toNonIndexed()))!;
  const cone = paint(mergeVertices(coneFaceted.deleteAttribute('normal').deleteAttribute('uv'), 0.01), new THREE.Color(1, 1, 1));
  cone.computeVertexNormals();
  coneFaceted.dispose();
  geometries.push(broad, cone);
  const leafMat = withHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 }), 'leaves');
  materials.push(leafMat);
  const treeCells = new Map<string, { broad: THREE.Matrix4[]; broadCol: THREE.Color[]; conifer: THREE.Matrix4[]; conCol: THREE.Color[] }>();
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0);
  const s3 = new THREE.Vector3(); const p3 = new THREE.Vector3();
  const addTree = (x: number, z: number, conifer: boolean, height: number) => {
    if (isWater(x, z)) return;
    const key = `${Math.floor(x / TREE_CELL)},${Math.floor(z / TREE_CELL)}`;
    if (!treeCells.has(key)) treeCells.set(key, { broad: [], broadCol: [], conifer: [], conCol: [] });
    const cell = treeCells.get(key)!;
    const h = height > 0 ? height : conifer ? 7 + hash2(x, z, 3) * 9 : 6 + hash2(x, z, 3) * 8;
    q.setFromAxisAngle(up, hash2(x, z, 5) * Math.PI * 2);
    p3.set(x, heightAt(x, z) - 0.2, z);
    if (conifer) {
      s3.set(h / 5.5, h / 3.8, h / 5.5);
      m4.compose(p3, q, s3);
      cell.conifer.push(m4.clone());
      cell.conCol.push(srgb(0.2 + hash2(x, z, 7) * 0.05, 0.27 + hash2(x, z, 8) * 0.05, 0.17));
    } else {
      const crown = h / 4.2;
      s3.set(crown * (0.8 + hash2(x, z, 9) * 0.3), crown, crown * (0.8 + hash2(x, z, 11) * 0.3));
      m4.compose(p3, q, s3);
      cell.broad.push(m4.clone());
      const dry = hash2(x, z, 13);
      cell.broadCol.push(srgb(0.27 + dry * 0.12, 0.35 + dry * 0.06, 0.17));
    }
  };
  for (const t of data.trees) addTree(t.x, t.z, t.conifer, t.height);
  {
    const step = walk.cell;
    const reach = lite ? 1200 : 1800;
    for (let j = 0; j < walk.n; j++) for (let i = 0; i < walk.n; i++) {
      const x = -walk.size / 2 + i * step; const z = -walk.size / 2 + j * step;
      if (Math.abs(x) > reach || Math.abs(z) > reach) continue;
      const c = walk.cover[j * walk.n + i];
      const chance = c === COVER.forest ? 0.38 : c === COVER.grass ? 0.08 : c === COVER.scrub ? 0.1 : 0;
      if (!chance || hash2(i, j, 21) > chance) continue;
      const jx = x + (hash2(i, j, 22) - 0.5) * step; const jz = z + (hash2(i, j, 23) - 0.5) * step;
      // Planted pines on the slopes under Mtatsminda and Narikala; broadleaf elsewhere.
      addTree(jx, jz, c === COVER.forest && heightAt(jx, jz) > 520 && hash2(i, j, 24) < 0.45, 0);
    }
  }
  const treeMeshes: { mesh: THREE.InstancedMesh; cx: number; cz: number }[] = [];
  const instance = (geom: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], cols: THREE.Color[] | null, cx: number, cz: number) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geom, mat, list.length);
    list.forEach((mm, k) => { im.setMatrixAt(k, mm); if (cols) im.setColorAt(k, cols[k]); });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.receiveShadow = true;
    group.add(im);
    treeMeshes.push({ mesh: im, cx, cz });
  };
  for (const [key, cell] of treeCells) {
    const [ci, cj] = key.split(',').map(Number);
    const cx = (ci + 0.5) * TREE_CELL; const cz = (cj + 0.5) * TREE_CELL;
    instance(broad, leafMat, cell.broad, cell.broadCol, cx, cz);
    instance(cone, leafMat, cell.conifer, cell.conCol, cx, cz);
  }

  // ── Lights: street lamps along the lit streets, the rest of the city as points. ──
  const lampPos: number[] = []; const lampCol: number[] = []; const lampSize: number[] = [];
  const sodium = [1.0, 0.56, 0.2]; const led = [0.9, 0.93, 1.0];
  const lamp = (x: number, y: number, z: number, white: boolean, size: number) => {
    lampPos.push(x, y, z);
    const c = white ? led : sodium;
    lampCol.push(c[0], c[1], c[2]);
    lampSize.push(size);
  };
  for (const r of data.roads) {
    if (r.tunnel || r.cls > ROAD.pedestrian || r.pts.length < 2) continue;
    const spacing = r.cls <= ROAD.secondary ? 28 : 36;
    const white = r.cls <= ROAD.tertiary ? hash2(r.pts[0][0], r.pts[0][1], 31) < 0.7 : hash2(r.pts[0][0], r.pts[0][1], 31) < 0.35;
    let carry = spacing * hash2(r.pts[0][0], r.pts[0][1], 33);
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, az] = r.pts[k]; const [bx, bz] = r.pts[k + 1];
      const l = Math.hypot(bx - ax, bz - az);
      for (let s = carry; s < l; s += spacing) {
        const x = ax + ((bx - ax) * s) / l; const z = az + ((bz - az) * s) / l;
        const side = r.width / 2 + 0.6;
        const ox = (-(bz - az) / l) * side; const oz = ((bx - ax) / l) * side;
        const dk = r.bridge ? deckAt(x, z) : NaN;
        lamp(x + ox, (Number.isNaN(dk) ? heightAt(x + ox, z + oz) : dk) + (r.cls <= ROAD.tertiary ? 9 : 6.5), z + oz, white, r.cls <= ROAD.tertiary ? 1.3 : 1);
      }
      carry = ((carry - l) % spacing + spacing) % spacing;
    }
  }
  for (const [x, z] of data.lamps) lamp(x, heightAt(x, z) + 4, z, false, 1);
  // Beyond the mapped streets: the lit city to the edge of the city grid.
  addCityGlow(city, heightAt, lamp);
  const lampGeom = new THREE.BufferGeometry();
  lampGeom.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  lampGeom.setAttribute('aColor', new THREE.Float32BufferAttribute(lampCol, 3));
  lampGeom.setAttribute('aSize', new THREE.Float32BufferAttribute(lampSize, 1));
  geometries.push(lampGeom);
  const lampUniforms = { uNight: { value: 0 }, uScale: { value: 1 } };
  const lampMat = new THREE.ShaderMaterial({
    uniforms: lampUniforms,
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; uniform float uNight; uniform float uScale; varying vec3 vColor; varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        vFade = uNight * clamp(1.0 - d / 16000.0, 0.0, 1.0);
        vColor = aColor;
        gl_PointSize = clamp(aSize * uScale * 900.0 / max(d, 1.0), 1.2, 14.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vFade;
      void main() { vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 16.0); if (vFade * a < 0.01) discard; gl_FragColor = vec4(vColor * a * vFade * 2.6, a * vFade); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  materials.push(lampMat);
  lampGeom.computeBoundingSphere();
  const lamps = new THREE.Points(lampGeom, lampMat);
  lamps.name = 'lamps';
  group.add(lamps);

  let t = 0;
  let frame = 0;
  return {
    group, deckAt, isWater, riverLevel,
    update(dt, cameraPos, night) {
      t += dt;
      waterNormal.value = t;
      lampUniforms.uNight.value = night;
      lamps.visible = night > 0.01;
      // Asphalt under sodium light glows a little; stone under LED stays cold.
      streetMat.emissive.setRGB(0.9, 0.55, 0.28).multiplyScalar(0.03 * night);
      if ((frame++ & 15) !== 0) return;
      for (const tm of treeMeshes) {
        const d = Math.hypot(cameraPos.x - tm.cx, cameraPos.z - tm.cz);
        tm.mesh.visible = d < (lite ? 550 : 950);
        tm.mesh.castShadow = d < 300 && !lite;
      }
      for (const m of streetMeshes) {
        const s = m.geometry.boundingSphere!;
        m.visible = Math.hypot(cameraPos.x - s.center.x, cameraPos.z - s.center.z) < 3400;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const tm of treeMeshes) tm.mesh.dispose();
    },
  };
}

/** Points where the city grid says street or building, past the mapped streets, thinned. */
function addCityGlow(city: HeightGrid, heightAt: (x: number, z: number) => number, lamp: (x: number, y: number, z: number, white: boolean, size: number) => void) {
  for (let j = 0; j < city.n; j++) for (let i = 0; i < city.n; i++) {
    const x = -city.size / 2 + i * city.cell; const z = -city.size / 2 + j * city.cell;
    if (Math.abs(x) < 4000 && Math.abs(z) < 4000) continue;
    const c = city.cover[j * city.n + i];
    if (c !== COVER.road && c !== COVER.building) continue;
    const h = hash2(i, j, 41);
    if (h > (c === COVER.road ? 0.6 : 0.18)) continue;
    const jx = x + (hash2(i, j, 42) - 0.5) * city.cell; const jz = z + (hash2(i, j, 43) - 0.5) * city.cell;
    lamp(jx, heightAt(jx, jz) + 8, jz, hash2(i, j, 44) < 0.45, c === COVER.road ? 1.6 : 1.1);
  }
}
