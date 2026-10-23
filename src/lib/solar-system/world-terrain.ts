// Ground for the other worlds: the same heightfield idea as the lunar mare
// — layered noise, old craters, a levelled pad — but coloured by the world.
// The vertex colours carry the real palette (the plain, its dark patches and
// its pale streaks), the tiled ground map only adds grain, so Mars can be
// rust with basalt in it and Proxima b can be violet soil with moss where
// the ground is damp, out of one builder. Dunes ripple the plains; a basin
// can hold water.
//
// The giants have no ground. Over them the floor is the outpost's deck, a
// flat disc at the site datum (y = 0), and round and under it is a sea of
// cloud (world-cloud-sea) some tens of metres down: `heightAt` is the deck
// inside its radius and the cloud tops outside it, so everything that
// stands on the ground — the crew, the ship's gear, the camera's floor —
// stands on the deck.

import * as THREE from 'three';
import { fbm, ringEdge } from '@/lib/solar-system/moon-terrain';
import { withHaze } from '@/lib/solar-system/world-earth-haze';
import { makeCloudSea } from '@/lib/solar-system/world-cloud-sea';
import type { WorldDeck, WorldProfile } from '@/lib/solar-system/world-profiles';

export const WORLD_SIZE = 360;
export const PAD_RADIUS = 40;

/** Flat treads and steep risers: 0…1 in, 0…1 out, in `n` steps. */
export function terrace(m: number, n: number): number {
  if (n <= 0) return m;
  const s = Math.min(m, 0.9999) * n;
  const i = Math.floor(s); const f = s - i;
  return (i + smooth(Math.max(0, (f - 0.72) / 0.28))) / n;
}

/** The sun's direction as the ground shaders read it (world space); set by the scene. */
const sunWorld = { value: new THREE.Vector3(0, 1, 0) };
export function setGroundSun(dir: THREE.Vector3) { sunWorld.value.copy(dir).normalize(); }

/** GLSL shared by everything made of this world's rock: a rim of the star's
 *  light along edges seen against it, so a boulder or a spire reads as a
 *  solid against the haze instead of a flat silhouette. */
export const RIM_GLSL = /* glsl */`
  {
    vec3 rNw = inverseTransformDirection( normal, viewMatrix );
    vec3 rVw = normalize( cameraPosition - vEarthPos );
    float rim = pow( 1.0 - max( dot( rNw, rVw ), 0.0 ), 3.5 );
    float toward = smoothstep( -0.25, 0.55, dot( rNw, uSunW ) ) * smoothstep( -0.4, 0.6, dot( -rVw, uSunW ) );
    reflectedLight.indirectDiffuse += uRimColor * rim * toward * diffuseColor.rgb * 2.2;
  }
`;
export function injectRim(shader: THREE.WebGLProgramParametersWithUniforms, rimColor: THREE.Color) {
  shader.uniforms.uSunW = sunWorld;
  shader.uniforms.uRimColor = { value: rimColor };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uSunW; uniform vec3 uRimColor;')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${RIM_GLSL}`);
}

function hash(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

interface Crater { x: number; z: number; r: number; depth: number }
function craterProfile(d: number, c: Crater): number {
  const q = d / c.r;
  if (q >= 1.55) return 0;
  const rim = c.depth * 0.38;
  if (q < 1) {
    const bowl = 1 - q * q;
    return -c.depth * bowl * bowl + rim * smooth(Math.max(0, (q - 0.55) / 0.45));
  }
  return rim * (1 - smooth((q - 1) / 0.55));
}

export interface WorldTerrain {
  mesh: THREE.Mesh;
  rocks: THREE.Group;
  horizon: THREE.Mesh;
  heightAt: (x: number, z: number) => number;
  normalAt: (x: number, z: number, out: THREE.Vector3) => THREE.Vector3;
  /** Firm ground for boots: the water surface where there is water. */
  floorAt: (x: number, z: number) => number;
  /** The ground anywhere the eye can reach: the square inside, the horizon ring's hills beyond it. */
  groundAt: (x: number, z: number) => number;
  /** The grain normal map, for anything else made of this ground. */
  grain: THREE.Texture;
  /** Slope 0…1 (1 − normal.y) off the heightfield. */
  slopeAt: (x: number, z: number) => number;
  /** Anything that moves on its own: the giants' cloud sea. */
  update?: (dt: number) => void;
  dispose: () => void;
}

/** Past the deck's edge the camera's floor stays at the deck for this far, m,
 *  so a camera swung out over the rail does not drop toward the clouds. */
export const DECK_APRON = 30;

/** The deck's own heights: the deck inside its radius, the cloud tops outside. Pure, for the tests. */
export function deckHeights(deck: WorldDeck) {
  const r2 = deck.radius * deck.radius;
  const apron2 = (deck.radius + DECK_APRON) ** 2;
  const sea = -deck.seaDepth;
  return {
    heightAt: (x: number, z: number) => (x * x + z * z <= r2 ? 0 : sea),
    floorAt: (x: number, z: number) => (x * x + z * z <= apron2 ? 0 : sea),
  };
}

/** A giant's floor: the deck, over a sea of cloud. */
function makeDeckTerrain(profile: WorldProfile, deck: WorldDeck, lite: boolean, density: number): WorldTerrain {
  const clouds = makeCloudSea(profile, deck, lite, density);
  const { heightAt, floorAt } = deckHeights(deck);
  // Nothing on a giant is made of its ground; this stands in for the grain map.
  const grain = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  grain.needsUpdate = true;
  const rocks = new THREE.Group();
  rocks.name = 'world-rocks';
  rocks.add(clouds.towers);
  return {
    mesh: clouds.sea, rocks, horizon: clouds.scud,
    heightAt, floorAt, groundAt: heightAt,
    normalAt: (_x, _z, out) => out.set(0, 1, 0),
    slopeAt: () => 0,
    grain,
    update: clouds.update,
    dispose() { clouds.dispose(); grain.dispose(); },
  };
}

/** Grain, pits and clasts, tinted by the world; cached by world. */
const canvasCache = new Map<string, HTMLCanvasElement[]>();
function groundCanvases(key: string, size: number, seed: number, warm: number): HTMLCanvasElement[] {
  const cached = canvasCache.get(key);
  if (cached) return cached;
  const h = new Float32Array(size * size);
  const per = (x: number, y: number, period: number, s: number) => {
    const ix = Math.floor(x); const iy = Math.floor(y);
    const fx = smooth(x - ix); const fy = smooth(y - iy);
    const x0 = ((ix % period) + period) % period; const x1 = (x0 + 1) % period;
    const y0 = ((iy % period) + period) % period; const y1 = (y0 + 1) % period;
    const a = hash(x0, y0, s); const b = hash(x1, y0, s); const c = hash(x0, y1, s); const d = hash(x1, y1, s);
    return (a + (b - a) * fx) + ((c - a) + (a - b - c + d) * fx) * fy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0; let amp = 1; let norm = 0; let f = 34;
      for (let o = 0; o < 5; o++) {
        n += (per((x / size) * f, (y / size) * f, f, seed + o * 17) * 2 - 1) * amp;
        norm += amp; amp *= 0.55; f *= 2;
      }
      h[y * size + x] = (n / norm) * 0.7;
    }
  }
  for (let i = 0; i < 90; i++) {
    const cx = hash(i, 3, seed) * size; const cy = hash(i, 7, seed) * size;
    const r = 3 + hash(i, 11, seed) * 12;
    const dpt = 0.3 + hash(i, 13, seed) * 0.4;
    for (let y = -r * 1.6; y <= r * 1.6; y++) {
      for (let x = -r * 1.6; x <= r * 1.6; x++) {
        const q = Math.hypot(x, y) / r;
        if (q > 1.6) continue;
        const px = ((Math.round(cx + x) % size) + size) % size;
        const py = ((Math.round(cy + y) % size) + size) % size;
        const bowl = q < 1 ? -(1 - q * q) * (1 - q * q) : 0;
        const rim = q > 0.6 ? 0.25 * (1 - Math.abs(q - 1.05) / 0.55) : 0;
        h[py * size + px] += dpt * (bowl + Math.max(0, rim));
      }
    }
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const map = mk(); const nrm = mk(); const rgh = mk();
  const mc = map.getContext('2d')!; const nc = nrm.getContext('2d')!; const rc = rgh.getContext('2d')!;
  const mi = mc.createImageData(size, size); const ni = nc.createImageData(size, size); const ri = rc.createImageData(size, size);
  const at = (x: number, y: number) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = at(x, y);
      const grain = hash(x, y, 91) - 0.5;
      const clast = hash(x, y, 97) > 0.996 ? 0.4 : 0;
      const g = clamp01(0.74 + v * 0.14 + grain * 0.14 + clast);
      mi.data[i] = Math.round(g * 255);
      mi.data[i + 1] = Math.round(g * 255 * (1 - warm * 0.06));
      mi.data[i + 2] = Math.round(g * 255 * (1 - warm * 0.12));
      mi.data[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.4 + grain * 0.3;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.4 + (hash(x, y, 93) - 0.5) * 0.3;
      const len = Math.hypot(dx, dy, 1);
      ni.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      ni.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      ni.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      ni.data[i + 3] = 255;
      const r = clamp01(0.92 - clast * 0.7 + grain * 0.1);
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.round(r * 255);
      ri.data[i + 3] = 255;
    }
  }
  mc.putImageData(mi, 0, 0); nc.putImageData(ni, 0, 0); rc.putImageData(ri, 0, 0);
  const out = [map, nrm, rgh];
  // Only the latest world's set is kept: each is three 1024² canvases (~12 MB). Canvases
  // hold no GPU memory, and a live scene's textures keep their own reference, so dropping is enough.
  canvasCache.clear();
  canvasCache.set(key, out);
  return out;
}

function rockGeometry(seed: number, detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const sx = 0.7 + hash(seed, 1, 5) * 0.6; const sy = 0.5 + hash(seed, 2, 5) * 0.4; const sz = 0.7 + hash(seed, 3, 5) * 0.6;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + fbm(v.x * 1.7 + seed, v.y * 1.7 + v.z * 0.9, 4, seed + 40) * 0.42);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25;
    v.x *= sx; v.y *= sy; v.z *= sz;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** `density` scales the rock count (the preset's prop density). */
export function makeWorldTerrain(profile: WorldProfile, lite: boolean, density = 1): WorldTerrain {
  if (profile.deck) return makeDeckTerrain(profile, profile.deck, lite, density);
  // Ultra (prop density 1.5 and up) gets a finer grid: the same field, sampled closer.
  const N = lite ? 160 : density >= 1.5 ? 448 : 320;
  const size = WORLD_SIZE;
  const half = size / 2;
  const cell = size / N;
  const heights = new Float32Array((N + 1) * (N + 1));
  const G = profile.ground;
  const seed = G.seed;
  const pad = profile.pad;
  const water = G.water;

  const craters: Crater[] = [];
  for (let i = 0; i < G.craters; i++) {
    const r = 3 + Math.pow(hash(i, 21, seed), 2) * 24;
    const x = (hash(i, 22, seed) - 0.5) * size * 0.92;
    const z = (hash(i, 23, seed) - 0.5) * size * 0.92;
    if (Math.hypot(x - pad.x, z - pad.z) < PAD_RADIUS + r * 1.6) continue;
    if (water && Math.hypot(x - water.x, z - water.z) < water.r + r) continue;
    craters.push({ x, z, r, depth: r * (0.12 + hash(i, 24, seed) * 0.1) });
  }
  const rawHeight = (x: number, z: number): number => {
    // The relief is read through a bent lens: a second noise shifts where
    // the first is sampled, so ridges curl and basins are not round.
    const wx = x + fbm(x / 70 + 11, z / 70, 2, seed + 51) * G.warp;
    const wz = z + fbm(x / 70, z / 70 + 7, 2, seed + 53) * G.warp;
    let h = fbm(wx / 110, wz / 110, 4, seed) * G.relief;
    if (G.mesas > 0) {
      // Plateaus: where a broad noise is high the ground steps up in
      // terraces — the strata of the mesas outside, at a size a crew can climb.
      const macro = fbm(wx / 85 + 3, wz / 85, 3, seed + 61);
      const m = clamp01((macro - 0.10) / 0.5);
      h += terrace(m, G.terraces) * G.mesas * smooth(clamp01(m * 4));
    }
    h += fbm(x / 24, z / 24, 3, seed + 9) * 1.1;
    // Dunes: long ripples across the plain, bent by the wind's own noise.
    const bend = fbm(x / 60, z / 60, 2, seed + 41) * 6;
    h += (0.5 + 0.5 * Math.sin((x * 0.45 + z * 0.9) / 3.4 + bend)) * 0.55 * G.dunes;
    h += fbm(x / 2.4, z / 2.4, 2, seed + 13) * 0.1;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * 1.55) h += craterProfile(d, c);
    }
    if (water) {
      // The basin: a shallow bowl below the water line, with a soft shore.
      const q = Math.hypot(x - water.x, z - water.z) / water.r;
      if (q < 1.3) {
        const bowl = q < 1 ? (1 - q * q) : 0;
        const shore = 1 - smooth(Math.min(1, Math.max(0, (q - 0.8) / 0.5)));
        h = h * (1 - shore) + (water.level + 0.35 - bowl * 1.5) * shore;
      }
      // The shore, and the ground for a way beyond it, stays above the water line.
      if (q >= 0.95 && q < 2.2) h = Math.max(h, water.level + 0.5 + Math.max(0, q - 1.1) * 1.5);
    }
    return h;
  };
  const padHeight = rawHeight(pad.x, pad.z) * 0.3;
  const heightFn = (x: number, z: number): number => {
    const h = rawHeight(x, z);
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d >= PAD_RADIUS + 22) return h;
    const t = d <= PAD_RADIUS ? 0 : smooth((d - PAD_RADIUS) / 22);
    const flat = padHeight + fbm(x / 2.2, z / 2.2, 2, seed + 13) * 0.05;
    return flat + (h - flat) * t;
  };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) heights[j * (N + 1) + i] = heightFn(-half + i * cell, -half + j * cell);

  const heightAt = (x: number, z: number): number => {
    const fx = THREE.MathUtils.clamp((x + half) / cell, 0, N - 1e-6);
    const fz = THREE.MathUtils.clamp((z + half) / cell, 0, N - 1e-6);
    const i = Math.floor(fx); const j = Math.floor(fz);
    const tx = fx - i; const tz = fz - j;
    const h00 = heights[j * (N + 1) + i]; const h10 = heights[j * (N + 1) + i + 1];
    const h01 = heights[(j + 1) * (N + 1) + i]; const h11 = heights[(j + 1) * (N + 1) + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };
  const normalAt = (x: number, z: number, out: THREE.Vector3): THREE.Vector3 => {
    const e = 0.6;
    return out.set(-(heightAt(x + e, z) - heightAt(x - e, z)), 2 * e, -(heightAt(x, z + e) - heightAt(x, z - e))).normalize();
  };
  const floorAt = (x: number, z: number): number => {
    const h = heightAt(x, z);
    return water && Math.hypot(x - water.x, z - water.z) < water.r * 1.3 ? Math.max(h, water.level - 0.4) : h;
  };
  const slopeTmp = new THREE.Vector3();
  const slopeAt = (x: number, z: number): number => 1 - normalAt(x, z, slopeTmp).y;

  // ── The colour of the ground: the plain, its dark patches, its pale streaks;
  // bare rock where it is steep, sand where it is flat and low. ──
  const colorAt = (x: number, z: number, out: number[]) => {
    const dark = clamp01(fbm(x / 34, z / 34, 3, seed + 33) * 1.6 + 0.1);
    const pale = clamp01(fbm(x / 18 + 40, z / 52, 3, seed + 37) * 2.2 - 0.55);
    const grain = 1 + fbm(x / 5, z / 5, 2, seed + 35) * 0.12;
    const slope = slopeAt(x, z);
    const rock = smooth(clamp01((slope - 0.22) / 0.3));
    const sand = (1 - smooth(clamp01(slope / 0.08))) * clamp01(fbm(x / 28 + 9, z / 28, 2, seed + 39) * 1.8 + 0.2);
    let wet = 0;
    if (water) wet = clamp01(1 - (Math.hypot(x - water.x, z - water.z) - water.r) / 22);
    for (let k = 0; k < 3; k++) {
      let v = G.plain[k] * (1 - dark) + G.dark[k] * dark;
      v = v * (1 - pale) + G.pale[k] * pale;
      v = v * (1 - sand * 0.6) + G.sand[k] * sand * 0.6;
      v = v * (1 - rock) + G.slopeRock[k] * rock;
      // Damp ground is darker and, on a living world, greener where the moss takes.
      if (wet > 0) v = v * (1 - wet * 0.45) + (k === 1 ? 0.22 : 0.08) * wet;
      out[k] = v * grain;
    }
    // Crater floors darker; ejecta a shade paler.
    for (const c of craters) {
      const q = Math.hypot(x - c.x, z - c.z) / c.r;
      if (q < 0.85) for (let k = 0; k < 3; k++) out[k] *= 1 - 0.18 * (1 - q / 0.85);
      else if (q < 2) for (let k = 0; k < 3; k++) out[k] = out[k] * 0.92 + G.pale[k] * 0.08 * (1 - (q - 0.85) / 1.15);
    }
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d < PAD_RADIUS + 8) for (let k = 0; k < 3; k++) out[k] *= 1 + 0.08 * (1 - d / (PAD_RADIUS + 8));
  };

  const geom = new THREE.PlaneGeometry(size, size, N, N);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const rgb = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const z = pos.getZ(i);
    const gi = Math.round((x + half) / cell); const gj = Math.round((z + half) / cell);
    pos.setY(i, heights[gj * (N + 1) + gi]);
    colorAt(x, z, rgb);
    colors[i * 3] = rgb[0]; colors[i * 3 + 1] = rgb[1]; colors[i * 3 + 2] = rgb[2];
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  const repeat = size / 6;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat, uv.getY(i) * repeat);

  const [mapC, nrmC, rghC] = groundCanvases(profile.id, lite ? 512 : 1024, seed, profile.id === 'mars' ? 1 : 0.3);
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = density >= 1.5 ? 16 : 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const maps = { map: tex(mapC, true), normal: tex(nrmC, false), rough: tex(rghC, false) };
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map, normalMap: maps.normal, normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: maps.rough, roughness: 1, metalness: 0, vertexColors: true, color: 0xffffff,
  });
  const slopeRock = new THREE.Color(...G.slopeRock);
  const sandColor = new THREE.Color(...G.sand);
  const rimColor = new THREE.Color(...profile.atmosphere.hazeSun);
  // The air (world-earth-haze) in place of the fog, then the ground's own
  // shading: a finer second normal sample breaks the tiling; on a steep
  // face the grain is projected sideways off the world position (a rock
  // wall is not a stretched floor), and the vertex colours' rock/sand blend
  // is sharpened per pixel by the geometric slope; on the flat, the dunes'
  // ripples are an analytic normal, not geometry — a sawtooth sine across
  // the wind, bent by a slow noise, faded out before it could alias.
  withHaze(mat, `world-ground|${profile.id}`, false, (shader) => {
    shader.uniforms.uSlopeRock = { value: slopeRock };
    shader.uniforms.uSand = { value: sandColor };
    shader.uniforms.uDunes = { value: G.dunes };
    injectRim(shader, rimColor);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSlope;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvSlope = 1.0 - objectNormal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vSlope; uniform vec3 uSlopeRock; uniform vec3 uSand; uniform float uDunes;
        float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float gNoise( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( gHash( i ), gHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gHash( i + vec2( 0.0, 1.0 ) ), gHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`)
      .replace('#include <normal_fragment_maps>', `
        float steep = smoothstep( 0.22, 0.5, vSlope );
        vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 6.37 + vec2( 0.31, 0.77 ) ).xyz * 2.0 - 1.0;
        if ( steep > 0.001 ) {
          // Sideways projections of the same grain, weighted by which way the face looks.
          vec3 gN = abs( inverseTransformDirection( normal, viewMatrix ) );
          vec3 side = texture2D( normalMap, vEarthPos.zy / 4.5 ).xyz * 2.0 - 1.0;
          vec3 side2 = texture2D( normalMap, vEarthPos.xy / 4.5 + 0.5 ).xyz * 2.0 - 1.0;
          vec3 wall = ( side * gN.x + side2 * gN.z ) / max( gN.x + gN.z, 1e-3 );
          mapN = mix( mapN, wall, steep );
        }
        vec2 ripple = vec2( 0.0 );
        if ( uDunes > 0.0 ) {
          float rDist = length( vEarthPos - cameraPosition );
          float rMask = uDunes * ( 1.0 - steep ) * ( 1.0 - smoothstep( 45.0, 120.0, rDist ) );
          if ( rMask > 0.001 ) {
            vec2 k = normalize( vec2( 0.45, 0.9 ) ) * 6.98;
            float bend = gNoise( vEarthPos.xz / 25.0 ) * 4.0;
            float ph = dot( k, vEarthPos.xz ) + bend;
            float dh = cos( ph ) + 0.5 * cos( 2.0 * ph );
            ripple = -k * dh * 0.022 * rMask;
          }
        }
        mapN = normalize( vec3( mapN.xy * normalScale + mapN2.xy * normalScale * 0.55 + ripple, mapN.z * mapN2.z ) );
        normal = normalize( tbn * mapN );`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float cSteep = smoothstep( 0.24, 0.5, vSlope );
          float cFlat = 1.0 - smoothstep( 0.0, 0.1, vSlope );
          float cSand = cFlat * smoothstep( 0.35, 0.7, gNoise( vEarthPos.xz / 22.0 ) ) * 0.5;
          diffuseColor.rgb = mix( diffuseColor.rgb, uSand * ( 0.85 + 0.3 * gNoise( vEarthPos.xz * 0.7 ) ), cSand );
          diffuseColor.rgb = mix( diffuseColor.rgb, uSlopeRock * ( 0.8 + 0.4 * gNoise( vEarthPos.zy * 0.9 + vEarthPos.x * 0.3 ) ), cSteep * 0.75 );
        }`);
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.name = `${profile.id}-terrain`;

  // ── The horizon: hills to the fog, mountains past it. ──
  const ringHeightAt = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    const near = heightAt(x, z) - 0.08;
    if (r <= 250) return near;
    const far = Math.min(1, (r - 300) / 600);
    let hills = fbm(x / 260, z / 260, 4, seed + 71) * G.relief * 4 + Math.pow(Math.max(0, fbm(x / 520 + 9, z / 520, 3, seed + 77)), 1.4) * 140 * far;
    // The mesa country goes on past the fence: broad terraced tables out to the mountains.
    if (G.mesas > 0) hills += terrace(clamp01((fbm(x / 210 + 5, z / 210, 3, seed + 63) - 0.05) / 0.5), G.terraces + 1) * G.mesas * 5 * Math.min(1, (r - 250) / 200);
    const k = Math.min(1, (r - 250) / 90);
    const t = k * k * (3 - 2 * k);
    // Back down to the datum by the outer edge, where the globe takes over.
    return (near * (1 - t) + hills * t) * (1 - ringEdge(r));
  };
  const groundAt = (x: number, z: number): number => (Math.hypot(x, z) < 172 && Math.abs(x) < half && Math.abs(z) < half ? heightAt(x, z) : ringHeightAt(x, z));
  const hGeom = new THREE.RingGeometry(172, 1500, lite ? 96 : 160, lite ? 10 : 18);
  hGeom.rotateX(-Math.PI / 2);
  const hp = hGeom.attributes.position as THREE.BufferAttribute;
  const hc = new Float32Array(hp.count * 3);
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i); const z = hp.getZ(i);
    hp.setY(i, ringHeightAt(x, z));
    colorAt(x, z, rgb);
    // Toward the plain's own colour at the outer edge: the globe past it
    // takes that colour on round the patch (siteColor), so the seam is one tone.
    const e = ringEdge(Math.hypot(x, z));
    const plain = profile.ground.plain;
    hc[i * 3] = rgb[0] + (plain[0] - rgb[0]) * e; hc[i * 3 + 1] = rgb[1] + (plain[1] - rgb[1]) * e; hc[i * 3 + 2] = rgb[2] + (plain[2] - rgb[2]) * e;
  }
  hGeom.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  hGeom.computeVertexNormals();
  const huv = hGeom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < huv.count; i++) huv.setXY(i, hp.getX(i) / 6, hp.getZ(i) / 6);
  const horizon = new THREE.Mesh(hGeom, mat);
  horizon.receiveShadow = true;

  // ── Rocks: three cuts in two stones, chunked so the camera culls them. ──
  const rockGeoms = [rockGeometry(1, 1), rockGeometry(2, lite ? 1 : 2), rockGeometry(3, lite ? 1 : 2)];
  // Two stones in one material: the colour rides on the instance.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.02, normalMap: maps.normal, normalScale: new THREE.Vector2(0.7, 0.7) });
  // Boulders take the air and the rim, and a finer second grain so the stone is not a smooth potato up close.
  withHaze(rockMat, `world-rock|${profile.id}`, false, (shader) => {
    injectRim(shader, rimColor);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
      vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 4.13 + vec2( 0.17, 0.61 ) ).xyz * 2.0 - 1.0;
      mapN = normalize( vec3( mapN.xy * normalScale + mapN2.xy * normalScale * 0.6, mapN.z * mapN2.z ) );
      normal = normalize( tbn * mapN );`);
  });
  const stones = [new THREE.Color(G.rockA), new THREE.Color(G.rockB)];
  const perCut = Math.round((lite ? 80 : 160) * density);
  const rocks = new THREE.Group();
  rocks.name = 'world-rocks';
  const instanced: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const spin = new THREE.Quaternion();
  const s = new THREE.Vector3(); const p = new THREE.Vector3();
  const nrm = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
  const CH = 3;
  const chunkOf = (v: number) => THREE.MathUtils.clamp(Math.floor((v + half) / size * CH), 0, CH - 1);
  rockGeoms.forEach((rg, cut) => {
    const buckets: { m: THREE.Matrix4; stone: number }[][] = Array.from({ length: CH * CH }, () => []);
    let placed = 0;
    for (let i = 0; i < perCut * 5 && placed < perCut; i++) {
      const k = i + cut * 1000;
      const x = (hash(k, 51, seed) - 0.5) * size * 0.95;
      const z = (hash(k, 52, seed) - 0.5) * size * 0.95;
      const d = Math.hypot(x - pad.x, z - pad.z);
      const scale = 0.18 + Math.pow(hash(k, 53, seed), 3) * 2.4;
      if ((d < PAD_RADIUS && scale > 0.5) || d < 12) continue;
      if (water && Math.hypot(x - water.x, z - water.z) < water.r * 0.9) continue;
      p.set(x, heightAt(x, z) - scale * 0.22, z);
      normalAt(x, z, nrm);
      q.setFromUnitVectors(up, nrm);
      spin.setFromAxisAngle(up, hash(k, 54, seed) * Math.PI * 2);
      q.multiply(spin);
      s.set(scale * (0.8 + hash(k, 55, seed) * 0.5), scale * (0.7 + hash(k, 56, seed) * 0.5), scale * (0.8 + hash(k, 57, seed) * 0.5));
      m.compose(p, q, s);
      buckets[chunkOf(z) * CH + chunkOf(x)].push({ m: m.clone(), stone: hash(k, 58, seed) < 0.7 ? 0 : 1 });
      placed += 1;
    }
    for (const bucket of buckets) {
      if (bucket.length === 0) continue;
      const im = new THREE.InstancedMesh(rg, rockMat, bucket.length);
      im.castShadow = true;
      im.receiveShadow = true;
      bucket.forEach((r, k) => { im.setMatrixAt(k, r.m); im.setColorAt(k, stones[r.stone]); });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      rocks.add(im);
      instanced.push(im);
    }
  });

  return {
    mesh, rocks, horizon, heightAt, normalAt, floorAt, groundAt, slopeAt, grain: maps.normal,
    dispose() {
      geom.dispose(); hGeom.dispose(); mat.dispose();
      maps.map.dispose(); maps.normal.dispose(); maps.rough.dispose();
      for (const g of rockGeoms) g.dispose();
      rockMat.dispose();
      for (const im of instanced) im.dispose();
    },
  };
}
