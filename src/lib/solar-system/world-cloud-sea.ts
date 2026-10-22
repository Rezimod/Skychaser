// The sea of cloud under a giant's outpost. A gas giant has no ground: the
// outpost's deck rides the cloud tops near the 1-bar level, and below and
// around it is cloud as far as the haze lets the eye go. Three parts, one
// draw call each:
//
// - the sea: a wide disc some tens of metres under the deck, shaded from a
//   tiling noise texture — sampled twice at two scales through a slow warp,
//   all drifting on the wind — into the planet's own palette, with an
//   analytic relief normal so the tops catch the light and the gaps between
//   them fall into shadow, and the same air as the rest of the scene;
// - the scud: a thin, broken layer between the sea and the deck, moving
//   faster, so cloud visibly streams past under the platform;
// - the towers: instanced lumps of cloud stacked into columns, standing out
//   of the sea round the outpost, some of them taller than the deck.
//
// The noise is built on the CPU into a DataTexture once per size and kept,
// so a second landing reuses it and the tests need no canvas.

import * as THREE from 'three';
import { fbm } from '@/lib/solar-system/moon-terrain';
import { haze, withHaze } from '@/lib/solar-system/world-earth-haze';
import type { WorldDeck, WorldProfile } from '@/lib/solar-system/world-profiles';

/** How far the sea reaches from the deck, m: well into the haze, inside the camera's far plane. */
export const SEA_RADIUS = 3200;
/** The scud layer's reach, m, and how far down it sits, as a fraction of the sea's depth. */
const SCUD_RADIUS = 760;
const SCUD_DEPTH = 0.42;
/** Metres of sea per repeat of the noise texture. */
const SEA_TILE = 150;

function hash(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Periodic value noise: the lattice wraps every `period` cells, so the texture tiles. */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = smooth(x - ix); const fy = smooth(y - iy);
  const x0 = ((ix % period) + period) % period; const x1 = (x0 + 1) % period;
  const y0 = ((iy % period) + period) % period; const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed); const b = hash(x1, y0, seed); const c = hash(x0, y1, seed); const d = hash(x1, y1, seed);
  return (a + (b - a) * fx) + ((c - a) + (a - b - c + d) * fx) * fy;
}

/** Tiling fbm, 0…1, at texel (x, y) of a `size` texture. */
function tileFbm(x: number, y: number, size: number, base: number, octaves: number, seed: number): number {
  let n = 0; let amp = 1; let norm = 0; let f = base;
  for (let o = 0; o < octaves; o++) {
    n += periodicNoise((x / size) * f, (y / size) * f, f, seed + o * 31) * amp;
    norm += amp; amp *= 0.52; f *= 2;
  }
  return n / norm;
}

const noiseCache = new Map<number, THREE.DataTexture>();
/**
 * The sea's noise, `size` texels square, tiling: R the height of the cloud
 * tops (billowed, so the tops are round and the gaps sharp), G and B its
 * slope in x and in y (0.5 is flat), A a second, independent field for the
 * scud's broken edges. Cached by size; the caller must not dispose it.
 */
export function seaNoise(size: number): THREE.DataTexture {
  const hit = noiseCache.get(size);
  if (hit) return hit;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = tileFbm(x, y, size, 4, 5, 701);
      // Billows: folded noise rounds the tops and pinches the gaps.
      h[y * size + x] = 1 - Math.abs(n * 2 - 1);
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const k = size / 24;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      data[i] = Math.round(Math.min(1, Math.max(0, at(x, y))) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, 0.5 + dx)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, 0.5 + dy)) * 255);
      data[i + 3] = Math.round(tileFbm(x, y, size, 3, 4, 977) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  noiseCache.set(size, tex);
  return tex;
}

const SEA_VERT = /* glsl */`
  varying vec3 vEarthPos;
  void main() {
    #include <begin_vertex>
    vec4 wp = modelMatrix * vec4( transformed, 1.0 );
    vEarthPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

/** The shared head of the sea and the scud: the noise, the palette, the light, the air. */
const SEA_HEAD = /* glsl */`
  uniform sampler2D uNoise; uniform float uTime; uniform vec2 uWind; uniform float uTile;
  uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyCol;
  uniform vec3 uHazeColor; uniform vec3 uHazeSunColor; uniform vec3 uHazeSunDir; uniform float uHazeBeta; uniform float uHazeLift;
  varying vec3 vEarthPos;
  vec3 palette( float k ) {
    vec3 c = mix( uC0, uC1, smoothstep( 0.0, 0.42, k ) );
    c = mix( c, uC2, smoothstep( 0.38, 0.76, k ) );
    return mix( c, uC3, smoothstep( 0.72, 1.0, k ) );
  }
  vec3 air( vec3 col ) {
    vec3 ray = vEarthPos - cameraPosition;
    float d = length( ray );
    float t = exp( -d * uHazeBeta * uHazeLift );
    float s = pow( max( dot( ray / max( d, 1e-3 ), uHazeSunDir ), 0.0 ), 7.0 );
    return col * t + mix( uHazeColor, uHazeSunColor, s ) * ( 1.0 - t );
  }`;

const SEA_FRAG = /* glsl */`
  ${SEA_HEAD}
  void main() {
    vec2 p = vEarthPos.xz / uTile;
    vec2 drift = uWind * uTime / uTile;
    // A slow, broad field bends where the detail is read, so the cells are not a grid.
    vec4 w = texture2D( uNoise, p * 0.17 + drift * 0.3 + vec2( 0.37, 0.11 ) );
    vec2 q = p + ( w.gb - 0.5 ) * 1.4 + ( w.r - 0.5 ) * 0.3;
    vec4 a = texture2D( uNoise, q + drift );
    vec4 b = texture2D( uNoise, q * 3.1 - drift * 1.7 + vec2( 0.52, 0.21 ) );
    float h = a.r * 0.66 + b.r * 0.34;
    vec2 g = ( a.gb - 0.5 ) + ( b.gb - 0.5 ) * 1.6;
    // The relief fades with distance before it can shimmer.
    float dist = length( vEarthPos - cameraPosition );
    g *= 1.0 - smoothstep( 300.0, 1400.0, dist ) * 0.8;
    vec3 n = normalize( vec3( -g.x * 1.5, 1.0, -g.y * 1.5 ) );
    float k = smoothstep( 0.22, 0.86, h ) * ( 0.82 + 0.36 * w.a );
    vec3 col = palette( clamp( k, 0.0, 1.0 ) );
    float ndl = dot( n, uSunDir );
    // Cloud is translucent: wrapped light, and light through the thin edges toward the sun.
    vec3 V = normalize( cameraPosition - vEarthPos );
    float through = pow( max( dot( -V, uSunDir ), 0.0 ), 5.0 ) * ( 1.0 - k ) * 0.5;
    vec3 lit = col * ( uSunCol * ( 0.35 * max( ndl, 0.0 ) + 0.45 * ( ndl * 0.5 + 0.5 ) + through ) + uSkyCol * ( 0.55 + 0.45 * n.y ) );
    gl_FragColor = vec4( air( lit ), 1.0 );
  }`;

const SCUD_FRAG = /* glsl */`
  ${SEA_HEAD}
  uniform float uReach;
  void main() {
    vec2 p = vEarthPos.xz / ( uTile * 1.6 );
    vec2 drift = uWind * uTime * 2.2 / ( uTile * 1.6 );
    vec4 a = texture2D( uNoise, p + drift + vec2( 0.13, 0.71 ) );
    vec4 b = texture2D( uNoise, p * 2.7 + drift * 1.3 );
    float m = a.a * 0.7 + b.a * 0.3;
    float alpha = smoothstep( 0.5, 0.74, m ) * 0.62;
    // Gone well before its edge, so the disc never shows.
    float r = length( vEarthPos.xz ) / uReach;
    alpha *= 1.0 - smoothstep( 0.55, 1.0, r );
    if ( alpha < 0.01 ) discard;
    vec3 col = mix( uC2, uC3, smoothstep( 0.55, 0.9, m ) );
    vec3 lit = col * ( uSunCol * 0.8 + uSkyCol );
    gl_FragColor = vec4( air( lit ), alpha );
  }`;

export interface CloudSea {
  /** The sea itself, the scud over it, and the towers. */
  sea: THREE.Mesh;
  scud: THREE.Mesh;
  towers: THREE.Group;
  /** The height of the cloud tops, m (below the deck at 0). */
  level: number;
  update: (dt: number) => void;
  dispose: () => void;
}

/** Light for a hand-lit material, matching what three's standard material does with the scene's own lights. */
function lightFrom(profile: WorldProfile) {
  const sun = new THREE.Color(profile.sun.color).multiplyScalar(profile.sun.intensity / Math.PI);
  // The hemisphere fill, mostly its sky half, and the environment's share on top.
  const sky = new THREE.Color(profile.sky.fillGround).lerp(new THREE.Color(profile.sky.fillSky), 0.75)
    .multiplyScalar((profile.sky.fill / Math.PI) * 1.3);
  return { sun, sky };
}

/** A lumpy ball for the towers: an icosahedron pushed out by noise, flattened underneath. */
function puffGeometry(detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + fbm(v.x * 1.9 + 3, v.y * 1.9 + v.z * 1.3, 3, 811) * 0.34);
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.35;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function makeCloudSea(profile: WorldProfile, deck: WorldDeck, lite: boolean, density = 1): CloudSea {
  const level = -deck.seaDepth;
  const noise = seaNoise(lite ? 256 : 512);
  const { sun, sky } = lightFrom(profile);
  const [c0, c1, c2, c3] = deck.sea.map((s) => new THREE.Color(...s));
  const shared = {
    uNoise: { value: noise }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(...deck.wind) }, uTile: { value: SEA_TILE },
    uC0: { value: c0 }, uC1: { value: c1 }, uC2: { value: c2 }, uC3: { value: c3 },
    uSunDir: { value: profile.sunDir.clone().normalize() }, uSunCol: { value: sun }, uSkyCol: { value: sky },
    uHazeColor: haze.uHazeColor, uHazeSunColor: haze.uHazeSunColor, uHazeSunDir: haze.uHazeSunDir,
    uHazeBeta: haze.uHazeBeta, uHazeLift: haze.uHazeLift,
  };

  // ── The sea: denser rings near the deck, where the eye is close. ──
  const seaGeom = new THREE.CircleGeometry(SEA_RADIUS, lite ? 48 : 96);
  seaGeom.rotateX(-Math.PI / 2);
  const seaMat = new THREE.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: shared });
  const sea = new THREE.Mesh(seaGeom, seaMat);
  sea.position.y = level;
  sea.name = `${profile.id}-cloud-sea`;
  sea.frustumCulled = false;

  // ── The scud: cloud streaming past between the sea and the deck. ──
  const scudGeom = new THREE.CircleGeometry(SCUD_RADIUS, lite ? 32 : 64);
  scudGeom.rotateX(-Math.PI / 2);
  const scudMat = new THREE.ShaderMaterial({
    vertexShader: SEA_VERT, fragmentShader: SCUD_FRAG, uniforms: { ...shared, uReach: { value: SCUD_RADIUS } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const scud = new THREE.Mesh(scudGeom, scudMat);
  scud.position.y = level * SCUD_DEPTH;
  scud.renderOrder = 2;
  scud.name = `${profile.id}-cloud-scud`;

  // ── The towers: columns of puffs, out where the haze softens them. ──
  const towers = new THREE.Group();
  towers.name = `${profile.id}-cloud-towers`;
  const puff = puffGeometry(lite ? 1 : 2);
  const puffMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0,
    // Cloud lets light through: the shadowed side is never black.
    emissive: c2.clone().multiplyScalar(0.18),
  });
  withHaze(puffMat, `cloud-towers|${profile.id}`);
  const count = Math.max(4, Math.round(deck.towers * density * (lite ? 0.6 : 1)));
  const parts: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
  const seed = profile.ground.seed;
  for (let i = 0; i < count; i++) {
    const a = hash(i, 1, seed) * Math.PI * 2;
    const r = 240 + Math.pow(hash(i, 2, seed), 0.7) * 1250;
    const x = Math.cos(a) * r; const z = Math.sin(a) * r;
    // Most stay low; a few climb past the deck.
    const tall = Math.pow(hash(i, 3, seed), 2.2);
    const height = 40 + tall * (deck.seaDepth + 150);
    const base = 18 + hash(i, 4, seed) * 30;
    const layers = 2 + Math.round(height / 45);
    for (let k = 0; k < layers; k++) {
      const f = k / Math.max(1, layers - 1);
      const rad = base * (1 - f * 0.55) * (0.8 + hash(i, 10 + k, seed) * 0.4);
      p.set(
        x + (hash(i, 20 + k, seed) - 0.5) * base * 0.8,
        level - 8 + f * height,
        z + (hash(i, 30 + k, seed) - 0.5) * base * 0.8,
      );
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, hash(i, 40 + k, seed) * Math.PI * 2);
      s.set(rad * 1.25, rad * 0.8, rad * 1.1);
      m.compose(p, q, s);
      const tone = 0.55 + 0.45 * f;
      parts.push({ m: m.clone(), c: c2.clone().lerp(c3, tone) });
    }
  }
  const im = new THREE.InstancedMesh(puff, puffMat, parts.length);
  parts.forEach((pt, k) => { im.setMatrixAt(k, pt.m); im.setColorAt(k, pt.c); });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = false;
  im.receiveShadow = false;
  towers.add(im);

  let t = 0;
  return {
    sea, scud, towers, level,
    update(dt) {
      t += dt;
      shared.uTime.value = t;
      // The towers go slowly round: the platform turns as it rides the wind.
      towers.rotation.y = t * 0.0025;
    },
    dispose() {
      seaGeom.dispose(); scudGeom.dispose(); puff.dispose();
      seaMat.dispose(); scudMat.dispose(); puffMat.dispose();
      im.dispose();
    },
  };
}
