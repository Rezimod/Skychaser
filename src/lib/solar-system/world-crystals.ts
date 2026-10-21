// Crystal clusters for the crew to collect: a few hexagonal shards leaning
// out of a dark bed, glowing in HDR (the colour times the profile's glow,
// so the bloom takes them), pulsing slowly, brighter along their edges.
// Two cuts on instanced meshes; the nearest few borrow a light from the
// pool so the ground round them glows too. A tap within reach pops the
// cluster — it swells and shrinks away — and the count goes up. Which ones
// are gone is kept on the device per world (CRYSTALS_KEY), so a cluster
// collected today is not standing there tomorrow.
//
// Placement is seeded and pure (placeCrystals): inside the walk radius,
// clear of the pad, the base, the lake and the village, and of each other.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm } from '@/lib/solar-system/moon-terrain';
import { withHaze } from '@/lib/solar-system/world-earth-haze';
import { PAD_RADIUS } from '@/lib/solar-system/world-terrain';
import type { LightPool } from '@/lib/solar-system/moon-lights';
import type { WorldProfile } from '@/lib/solar-system/world-profiles';
import type { KeepOut } from '@/lib/solar-system/world-formations';

export const CRYSTALS_KEY = 'stellar_explore_crystals_v1';
/** How close a crew must be to pick a cluster, m. */
export const COLLECT_RANGE = 2.2;

export interface CrystalSave { v: 1; worlds: Record<string, string[]> }
type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadCrystalSave(store: Store | null = storage()): CrystalSave {
  try {
    const raw = store?.getItem(CRYSTALS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<CrystalSave>;
      if (v && v.v === 1 && v.worlds && typeof v.worlds === 'object') {
        const worlds: Record<string, string[]> = {};
        for (const [k, ids] of Object.entries(v.worlds)) if (Array.isArray(ids)) worlds[k] = ids.filter((s): s is string => typeof s === 'string');
        return { v: 1, worlds };
      }
    }
  } catch { /* unreadable: start clean */ }
  return { v: 1, worlds: {} };
}

export function saveCrystalSave(save: CrystalSave, store: Store | null = storage()) {
  try { store?.setItem(CRYSTALS_KEY, JSON.stringify(save)); } catch { /* private mode: the count still shows this visit */ }
}

export interface CrystalSpot { id: string; x: number; z: number; scale: number; phase: number; cut: number }

export interface CrystalOptions {
  density: number;
  keepOut: KeepOut[];
  walkRadius: number;
}

function hash(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** Where the clusters grow. Pure, seeded by the world; ids are stable across densities. */
export function placeCrystals(profile: WorldProfile, opts: CrystalOptions): CrystalSpot[] {
  const C = profile.crystals;
  if (!C) return [];
  const seed = profile.ground.seed + 1300;
  const pad = profile.pad;
  const water = profile.ground.water;
  const keep: KeepOut[] = [{ x: pad.x, z: pad.z, r: PAD_RADIUS + 6 }, ...opts.keepOut];
  if (water) keep.push({ x: water.x, z: water.z, r: water.r * 1.05 });
  const out: CrystalSpot[] = [];
  const want = Math.round(C.count * Math.min(1.5, opts.density));
  const reach = opts.walkRadius - 8;
  for (let i = 0; i < want * 10 && out.length < want; i++) {
    const a = hash(i, 1, seed) * Math.PI * 2;
    const d = (PAD_RADIUS + 10) + Math.sqrt(hash(i, 2, seed)) * (reach - PAD_RADIUS - 10);
    const x = pad.x + Math.cos(a) * d; const z = pad.z + Math.sin(a) * d;
    if (Math.abs(x) > 170 || Math.abs(z) > 170) continue;
    if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 1.5)) continue;
    if (out.some((o) => Math.hypot(x - o.x, z - o.z) < 9)) continue;
    // Clusters gather: a slow noise makes veins where they are likelier.
    if (fbm(x / 45, z / 45, 2, seed + 3) < -0.25 && hash(i, 4, seed) < 0.7) continue;
    out.push({ id: `c${i}`, x, z, scale: 0.7 + hash(i, 5, seed) * 0.7, phase: hash(i, 6, seed) * Math.PI * 2, cut: i % 2 });
  }
  return out;
}

export interface CrystalCluster extends CrystalSpot {
  y: number;
  collected: boolean;
}

export interface Crystals {
  group: THREE.Group;
  clusters: readonly CrystalCluster[];
  /** Collected on this world, this save. */
  count: number;
  total: number;
  /** The nearest standing cluster within `within` metres, or null. */
  nearest: (x: number, z: number, within?: number) => CrystalCluster | null;
  /** Take it: false when it is already gone or unknown. */
  collect: (id: string) => boolean;
  update: (dt: number, crewX: number, crewY: number, crewZ: number, lights: LightPool | null) => void;
  dispose: () => void;
}

/** A cluster: shards of a hexagonal prism with a pointed tip, leaning out of the centre. */
function clusterGeometry(seed: number, lite: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = lite ? 5 : 8;
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const h = big ? 1.0 : 0.35 + hash(i, 1, seed) * 0.5;
    const r = (big ? 0.16 : 0.07 + hash(i, 2, seed) * 0.07) * (0.8 + h * 0.4);
    const body = new THREE.CylinderGeometry(r * 0.72, r, h * 0.78, 6, 1, false);
    body.translate(0, h * 0.39, 0);
    const tip = new THREE.ConeGeometry(r * 0.72, h * 0.22, 6, 1, false);
    tip.translate(0, h * 0.78 + h * 0.11, 0);
    const shard = mergeGeometries([body, tip], false)!;
    body.dispose(); tip.dispose();
    const a = hash(i, 3, seed) * Math.PI * 2;
    const tilt = big ? 0.12 : 0.25 + hash(i, 4, seed) * 0.6;
    e.set(Math.cos(a) * tilt, hash(i, 5, seed) * Math.PI * 2, Math.sin(a) * tilt);
    q.setFromEuler(e);
    const d = big ? 0 : 0.12 + hash(i, 6, seed) * 0.22;
    m.compose(new THREE.Vector3(Math.cos(a) * d, -0.05, Math.sin(a) * d), q, new THREE.Vector3(1, 1, 1));
    shard.applyMatrix4(m);
    parts.push(shard);
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** The dark bed the shards grow from: a flattened, roughened ball. */
function bedGeometry(seed: number, detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.42, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + fbm(v.x * 3 + seed, v.z * 3 + v.y, 3, seed) * 0.35);
    v.y *= 0.45;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const POP = 0.45;

export function makeCrystals(
  profile: WorldProfile,
  ground: { heightAt: (x: number, z: number) => number; normalAt: (x: number, z: number, out: THREE.Vector3) => THREE.Vector3 },
  opts: CrystalOptions & { lite: boolean; store?: Store | null },
): Crystals {
  const group = new THREE.Group();
  group.name = 'crystals';
  const C = profile.crystals;
  const store = opts.store === undefined ? storage() : opts.store;
  const save = loadCrystalSave(store);
  const gone = new Set(save.worlds[profile.id] ?? []);
  const spots = placeCrystals(profile, opts);
  const clusters: CrystalCluster[] = spots.map((s) => ({ ...s, y: ground.heightAt(s.x, s.z), collected: gone.has(s.id) }));
  const empty: Crystals = {
    group, clusters, count: clusters.filter((c) => c.collected).length, total: clusters.length,
    nearest: () => null, collect: () => false, update: () => {}, dispose: () => {},
  };
  if (!C || clusters.length === 0) return empty;

  const color = new THREE.Color(...C.color);
  const clock = { value: 0 };
  const shardMat = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.25), emissive: color, emissiveIntensity: C.glow, roughness: 0.22, metalness: 0.15,
  });
  // The glow: brighter along the edges (a fresnel on the emissive), with a
  // slow pulse offset per cluster so the field does not breathe in step.
  withHaze(shardMat, `world-crystal|${profile.id}`, false, (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING_COLOR
          vGlow = instanceColor.rgb;
        #else
          vGlow = vec3( 1.0 );
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 cN = inverseTransformDirection( normal, viewMatrix );
          vec3 cV = normalize( cameraPosition - vEarthPos );
          float fres = pow( 1.0 - max( dot( cN, cV ), 0.0 ), 2.0 );
          float pulse = 0.82 + 0.18 * sin( uTime * 1.7 + vGlow.b * 6.0 );
          totalEmissiveRadiance *= vGlow * pulse * ( 0.55 + 0.9 * fres );
        }`);
  });
  const bedMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...profile.ground.dark).multiplyScalar(0.7), roughness: 0.95, metalness: 0 });
  withHaze(bedMat, `world-crystal-bed|${profile.id}`);

  const shardGeoms = [clusterGeometry(profile.ground.seed + 1, opts.lite), clusterGeometry(profile.ground.seed + 2, opts.lite)];
  const bedGeom = bedGeometry(profile.ground.seed + 3, opts.lite ? 1 : 2);
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const spin = new THREE.Quaternion();
  const p = new THREE.Vector3(); const s = new THREE.Vector3(); const nrm = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  interface Seat { im: THREE.InstancedMesh; k: number; bedK: number }
  const seats = new Map<string, Seat>();
  const meshes: THREE.InstancedMesh[] = [];
  const bed = new THREE.InstancedMesh(bedGeom, bedMat, clusters.length);
  bed.name = 'crystal-beds';
  bed.castShadow = true; bed.receiveShadow = true;
  const seatMatrix = (c: CrystalCluster, scale: number) => {
    p.set(c.x, c.y - 0.06, c.z);
    ground.normalAt(c.x, c.z, nrm);
    q.setFromUnitVectors(up, nrm);
    spin.setFromAxisAngle(up, c.phase);
    q.multiply(spin);
    s.setScalar(c.scale * scale);
    return m.compose(p, q, s);
  };
  const byCut = [0, 1].map((cut) => clusters.filter((c) => c.cut === cut));
  byCut.forEach((list, cut) => {
    if (list.length === 0) return;
    const im = new THREE.InstancedMesh(shardGeoms[cut], shardMat, list.length);
    im.name = `crystals-${cut}`;
    im.castShadow = false; im.receiveShadow = false;
    list.forEach((c, k) => {
      im.setMatrixAt(k, seatMatrix(c, c.collected ? 0 : 1));
      // A little hue drift per cluster; the blue channel doubles as the pulse's phase.
      tint.setRGB(0.9 + hash(k, 7, cut) * 0.2, 0.9 + hash(k, 8, cut) * 0.2, hash(k, 9, cut));
      im.setColorAt(k, tint);
      const bedK = clusters.indexOf(c);
      bed.setMatrixAt(bedK, seatMatrix(c, c.collected ? 0 : 1));
      seats.set(c.id, { im, k, bedK });
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
    meshes.push(im);
  });
  bed.instanceMatrix.needsUpdate = true;
  bed.computeBoundingSphere();
  group.add(bed);

  const dying = new Map<string, number>();
  const lightColor = color.getHex();
  const handle: Crystals = {
    group, clusters, count: empty.count, total: clusters.length,
    nearest(x, z, within = COLLECT_RANGE) {
      let best: CrystalCluster | null = null; let bd = within;
      for (const c of clusters) {
        if (c.collected) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
    collect(id) {
      const c = clusters.find((k) => k.id === id);
      if (!c || c.collected) return false;
      c.collected = true;
      handle.count += 1;
      dying.set(id, 0);
      gone.add(id);
      save.worlds[profile.id] = [...gone];
      saveCrystalSave(save, store);
      return true;
    },
    update(dt, crewX, crewY, crewZ, lights) {
      clock.value += dt;
      // The pop: a swell, then gone.
      for (const [id, t0] of dying) {
        const t = t0 + dt;
        const c = clusters.find((k) => k.id === id)!;
        const seat = seats.get(id)!;
        const k = Math.min(1, t / POP);
        const scale = k < 0.3 ? 1 + k * 0.9 : Math.max(0, 1.27 * (1 - (k - 0.3) / 0.7));
        seat.im.setMatrixAt(seat.k, seatMatrix(c, scale));
        seat.im.instanceMatrix.needsUpdate = true;
        bed.setMatrixAt(seat.bedK, seatMatrix(c, k >= 1 ? 0 : 1));
        bed.instanceMatrix.needsUpdate = true;
        if (k >= 1) dying.delete(id); else dying.set(id, t);
      }
      // The nearest few light the ground round them.
      if (lights) {
        let lit = 0;
        const near = clusters
          .filter((c) => !c.collected && Math.abs(c.x - crewX) < 34 && Math.abs(c.z - crewZ) < 34)
          .sort((a, b) => Math.hypot(a.x - crewX, a.z - crewZ) - Math.hypot(b.x - crewX, b.z - crewZ));
        for (const c of near) {
          if (lit >= 3) break;
          lights.request(c.x, c.y + 0.5 * c.scale, c.z, lightColor, 2.6 * C.glow * c.scale, 7 + c.scale * 3, 2);
          lit += 1;
        }
      }
      void crewY;
    },
    dispose() {
      for (const im of meshes) im.dispose();
      bed.dispose();
      for (const g of shardGeoms) g.dispose();
      bedGeom.dispose();
      shardMat.dispose(); bedMat.dispose();
    },
  };
  return handle;
}
