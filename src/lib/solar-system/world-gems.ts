// The gems, drawn and picked up. One builder for every surface, the Moon
// included; where they are comes from gem-layout (the same on every device
// and on the server), what has been taken from gem-progress.
//
// Two draw calls for the whole field:
// - the stones: one InstancedMesh of a faceted brilliant that morphs, per
//   instance, into a rough lump (a gold nugget, a meteorite). They spin and
//   bob in the vertex shader; the fragment adds a fresnel glow in the kind's
//   colour, in HDR for the bloom, and white glints off facets that catch a
//   light wheeling round them, so a stone sparkles as it turns.
// - the markers: one additive InstancedMesh of a thin light beam standing
//   over each stone (it fades in with distance, so it is a beacon from far
//   off and nothing close to) and a camera-facing star glint that twinkles.
// No per-frame allocation: the clock is a uniform, and only a stone being
// taken has its matrix written (the pop: a swell, then gone).
//
// A crew picks a gem up by touching it — walking into one on the ground,
// flying through one in the air. The surface does the rest (the burst, the
// sound, the line on the glass) from `onCollect`.

import * as THREE from 'three';
import { GEM_INFO, GEM_GROUND_ALT, gemLayout, type GemKind, type GemSpot, type GemWorld } from '@/lib/solar-system/gem-layout';
import { collectedOn, recordGem, type GemStore } from '@/lib/solar-system/gem-progress';
import { withHaze } from '@/lib/solar-system/world-earth-haze';
import type { LightPool } from '@/lib/solar-system/moon-lights';

/** How close the crew's body (a metre over their feet) must come to a gem's centre, m. */
export const GEM_PICK_RANGE = 1.9;
const POP = 0.5;

/** How big each kind is drawn (the unit stone is about 2 wide and 1.4 tall), and how it is stretched. */
const LOOK: Record<GemKind, { scale: number; stretch: [number, number, number]; glow: number; body: [number, number, number]; spin: number }> = {
  diamond: { scale: 0.5, stretch: [1, 1, 1], glow: 3.4, body: [0.75, 0.82, 0.9], spin: 0.9 },
  emerald: { scale: 0.44, stretch: [1.25, 0.9, 0.85], glow: 3.0, body: [0.1, 0.5, 0.22], spin: 0.7 },
  ruby: { scale: 0.42, stretch: [1, 1, 1], glow: 3.2, body: [0.55, 0.04, 0.08], spin: 0.8 },
  sapphire: { scale: 0.42, stretch: [1, 1.1, 1], glow: 3.0, body: [0.08, 0.16, 0.6], spin: 0.8 },
  ice: { scale: 0.42, stretch: [0.75, 1.8, 0.75], glow: 2.6, body: [0.55, 0.78, 0.9], spin: 0.5 },
  gold: { scale: 0.42, stretch: [1.15, 0.85, 1], glow: 1.5, body: [1.0, 0.68, 0.2], spin: 0.6 },
  meteorite: { scale: 0.52, stretch: [1.1, 0.9, 1], glow: 1.9, body: [0.1, 0.085, 0.08], spin: 0.4 },
};

export interface GemInstance extends GemSpot {
  /** Where it is drawn: the layout's spot, moved off anything solid or up onto a perch. */
  px: number;
  py: number;
  pz: number;
  collected: boolean;
}

export interface GemsOptions {
  world: GemWorld;
  /** The floor under a point (terrain, deck, a bridge). */
  floorAt: (x: number, z: number) => number;
  lite: boolean;
  /** The worlds' air (world-earth-haze). The Moon has none. */
  haze?: boolean;
  /** Footprints to keep a ground gem out of (buildings, rocks): it is moved to their edge. */
  colliders?: readonly { x: number; z: number; r: number }[];
  /** Rock tops a perching gem may sit on (spires, hoodoos, arches): `top` is the height of the top. */
  perches?: readonly { x: number; z: number; top: number }[];
  /** How far the markers are drawn, m. */
  far?: number;
  store?: GemStore | null;
  onCollect?: (gem: GemInstance) => void;
}

export interface Gems {
  group: THREE.Group;
  gems: readonly GemInstance[];
  /** Taken on this world, this save, and the points they are worth. */
  count: number;
  total: number;
  points: number;
  maxPoints: number;
  /** Pick up whatever the crew touches (when `pick`: on foot or flying, not in the ship); light the nearest few. Returns the gem taken this frame, if any. */
  update: (dt: number, crewX: number, crewY: number, crewZ: number, lights: LightPool | null, pick?: boolean) => GemInstance | null;
  /** Take one by id (tests, the dev hook). False when it is gone or unknown. */
  collect: (id: string) => boolean;
  dispose: () => void;
}

function hash(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/**
 * The unit stone: a round brilliant (table, crown, girdle, pavilion to a
 * culet), flat-faceted, non-indexed. `position2`/`normal2` are the same
 * vertices pushed out to a lumpy rounded rock, so one mesh draws both.
 */
export function gemGeometry(lite: boolean): THREE.BufferGeometry {
  const N = lite ? 8 : 10;
  const ring = (r: number, y: number, off: number) => Array.from({ length: N }, (_, i) => {
    const a = ((i + off) / N) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
  const table = ring(0.56, 0.42, 0);
  const girdle = ring(1, 0, 0.5);
  const tc = new THREE.Vector3(0, 0.42, 0);
  const culet = new THREE.Vector3(0, -0.95, 0);
  const tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tris.push([tc, table[i], table[j]]);
    tris.push([table[i], girdle[i], table[j]]);
    tris.push([table[j], girdle[i], girdle[j]]);
    tris.push([girdle[i], culet, girdle[j]]);
  }
  // The rock: every corner moved along its own direction by a seeded lump,
  // keyed on where it is so shared corners move together.
  const lump = (v: THREE.Vector3) => {
    const d = v.clone().setY(v.y + 0.25);
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    d.normalize();
    const k = hash(Math.round(v.x * 100), Math.round(v.z * 100) + Math.round(v.y * 100) * 7, 31);
    const r = 0.68 * (0.82 + k * 0.4);
    return new THREE.Vector3(d.x * r, d.y * r * 0.78 + 0.08, d.z * r);
  };
  const pos: number[] = []; const nrm: number[] = [];
  const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const n = new THREE.Vector3(); const c = new THREE.Vector3();
  const face = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, P: number[], Nn: number[], centre: THREE.Vector3) => {
    e1.subVectors(b, a); e2.subVectors(d, a); n.crossVectors(e1, e2).normalize();
    c.copy(a).add(b).add(d).multiplyScalar(1 / 3).sub(centre);
    const flip = n.dot(c) < 0;
    const order = flip ? [a, d, b] : [a, b, d];
    if (flip) n.negate();
    for (const v of order) { P.push(v.x, v.y, v.z); Nn.push(n.x, n.y, n.z); }
  };
  const mid = new THREE.Vector3(0, -0.1, 0); const mid2 = new THREE.Vector3(0, 0.05, 0);
  for (const [a, b, d] of tris) face(a, b, d, pos, nrm, mid);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  // The rock follows the stone's own vertex order, so a stone's corner k morphs to rock corner k.
  const p2: number[] = []; const n2: number[] = [];
  for (let t = 0; t < pos.length; t += 9) {
    const vs = [0, 1, 2].map((k) => lump(new THREE.Vector3(pos[t + k * 3], pos[t + k * 3 + 1], pos[t + k * 3 + 2])));
    e1.subVectors(vs[1], vs[0]); e2.subVectors(vs[2], vs[0]); n.crossVectors(e1, e2).normalize();
    c.copy(vs[0]).add(vs[1]).add(vs[2]).multiplyScalar(1 / 3).sub(mid2);
    if (n.dot(c) < 0) n.negate();
    for (const v of vs) { p2.push(v.x, v.y, v.z); n2.push(n.x, n.y, n.z); }
  }
  g.setAttribute('position2', new THREE.Float32BufferAttribute(p2, 3));
  g.setAttribute('normal2', new THREE.Float32BufferAttribute(n2, 3));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius = 1.3;
  return g;
}

/** The marker: a beam (two crossed quads, 0…1 up) and a star glint (one quad, ±1), told apart by `aPart`. */
function markerGeometry(): THREE.BufferGeometry {
  const P: number[] = []; const U: number[] = []; const A: number[] = []; const I: number[] = [];
  const quad = (corners: number[][], part: number) => {
    const b = P.length / 3;
    for (const [x, y, z, u, v] of corners) { P.push(x, y, z); U.push(u, v); A.push(part); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad([[-0.5, 0, 0, 0, 0], [0.5, 0, 0, 1, 0], [0.5, 1, 0, 1, 1], [-0.5, 1, 0, 0, 1]], 0);
  quad([[0, 0, -0.5, 0, 0], [0, 0, 0.5, 1, 0], [0, 1, 0.5, 1, 1], [0, 1, -0.5, 0, 1]], 0);
  quad([[-1, -1, 0, 0, 0], [1, -1, 0, 1, 0], [1, 1, 0, 1, 1], [-1, 1, 0, 0, 1]], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(I);
  return g;
}

const MARKER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uBeamH;
  uniform float uFar;
  attribute float aPart;
  attribute vec3 aFx;
  varying vec2 vUv;
  varying float vPart;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec3 P = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    float d = distance( P, cameraPosition );
    float alive = aFx.y;
    float flash = aFx.z;
    vec3 W;
    if ( aPart < 0.5 ) {
      // Wider with range, so a far beam keeps a pixel or two.
      float w = 0.14 + d * 0.0035;
      W = P + vec3( position.x * w, position.y * uBeamH * ( 0.35 + 0.65 * alive ) - 0.3, position.z * w );
      vA = smoothstep( 5.0, 36.0, d ) * alive + flash * 0.8;
    } else {
      float tw = 0.78 + 0.22 * sin( uTime * 3.3 + aFx.x * 40.0 );
      float s = min( ( 0.5 + d * 0.011 ) * tw, 5.0 ) * ( 1.0 + flash * 3.5 );
      vec3 right = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
      vec3 up = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
      float a = uTime * 0.35 + aFx.x * 6.2832;
      float c = cos( a ); float sn = sin( a );
      vec2 q = vec2( c * position.x - sn * position.y, sn * position.x + c * position.y );
      W = P + ( right * q.x + up * q.y ) * s;
      vA = max( alive * 0.85, flash );
    }
    vA *= 1.0 - smoothstep( uFar * 0.55, uFar, d );
    vUv = uv;
    vPart = aPart;
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3( 1.0 );
    #endif
    gl_Position = projectionMatrix * viewMatrix * vec4( W, 1.0 );
  }
`;

const MARKER_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vPart;
  varying vec3 vCol;
  varying float vA;
  void main() {
    if ( vA <= 0.002 ) discard;
    vec3 col;
    if ( vPart < 0.5 ) {
      float across = 1.0 - abs( vUv.x * 2.0 - 1.0 );
      float k = across * across * pow( 1.0 - vUv.y, 1.7 ) * ( 0.75 + 0.25 * sin( vUv.y * 22.0 - uTime * 3.0 ) );
      col = vCol * k * 1.5;
    } else {
      vec2 p = vUv * 2.0 - 1.0;
      float core = exp( -dot( p, p ) * 16.0 );
      float rays = exp( -abs( p.x ) * 38.0 ) * exp( -abs( p.y ) * 2.6 ) + exp( -abs( p.y ) * 38.0 ) * exp( -abs( p.x ) * 2.6 );
      col = mix( vCol, vec3( 1.0 ), 0.55 ) * ( core * 2.6 + rays * 1.4 );
    }
    gl_FragColor = vec4( col * vA, 1.0 );
  }
`;

/** Where a gem is drawn: up onto a perch, or off anything solid, then onto the floor. */
export function resolveGem(spot: GemSpot, opts: Pick<GemsOptions, 'floorAt' | 'colliders' | 'perches'>, taken: Set<number>): { x: number; y: number; z: number } {
  let x = spot.x; let z = spot.z;
  if (spot.perch && opts.perches?.length) {
    let best = -1; let bd = 70;
    opts.perches.forEach((p, k) => {
      if (taken.has(k)) return;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = k; }
    });
    if (best >= 0) {
      taken.add(best);
      const p = opts.perches[best];
      return { x: p.x, y: p.top + 1.3, z: p.z };
    }
  }
  if (spot.alt <= GEM_GROUND_ALT + 0.01 && opts.colliders?.length) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of opts.colliders) {
        const dx = x - c.x; const dz = z - c.z; const d = Math.hypot(dx, dz);
        if (d >= c.r + 0.9) continue;
        const k = d < 1e-3 ? 1 : 1 / d;
        x = c.x + (d < 1e-3 ? 1 : dx * k) * (c.r + 1.2);
        z = c.z + (d < 1e-3 ? 0 : dz * k) * (c.r + 1.2);
        moved = true;
      }
      if (!moved) break;
    }
  }
  return { x, y: opts.floorAt(x, z) + spot.alt, z };
}

export function makeGems(opts: GemsOptions): Gems {
  const group = new THREE.Group();
  group.name = 'gems';
  const store = opts.store;
  const held = store === undefined ? collectedOn(opts.world) : collectedOn(opts.world, store);
  const perchTaken = new Set<number>();
  const gems: GemInstance[] = gemLayout(opts.world).map((s) => {
    const at = resolveGem(s, opts, perchTaken);
    return { ...s, px: at.x, py: at.y, pz: at.z, collected: held.has(s.id) };
  });
  const n = gems.length;
  let maxPoints = 0;
  for (const g of gems) maxPoints += GEM_INFO[g.kind].points;

  const clock = { value: 0 };
  // ── The stones. ──
  const stoneGeom = gemGeometry(opts.lite);
  const aGem = new Float32Array(n * 4);
  const aBody = new Float32Array(n * 3);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, roughness: 0.1, metalness: 0.2, envMapIntensity: 1.4 });
  const patch = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute vec3 position2;
        attribute vec3 normal2;
        attribute vec4 aGem;
        attribute vec3 aBody;
        varying vec3 vGemW;
        varying vec3 vBody;
        varying float vRough;
        varying float vGlow;
        varying float vPhase;`)
      .replace('#include <beginnormal_vertex>', `
        float gA = uTime * aGem.w + aGem.x * 6.2832;
        float gc = cos( gA ); float gs = sin( gA );
        vec3 objectNormal = mix( normal, normal2, aGem.y );
        objectNormal = vec3( gc * objectNormal.x + gs * objectNormal.z, objectNormal.y, -gs * objectNormal.x + gc * objectNormal.z );`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = mix( position, position2, aGem.y );
        transformed = vec3( gc * transformed.x + gs * transformed.z, transformed.y, -gs * transformed.x + gc * transformed.z );
        transformed.y += sin( uTime * 1.7 + aGem.x * 6.2832 ) * 0.22;
        vRough = aGem.y; vGlow = aGem.z; vPhase = aGem.x; vBody = aBody;`)
      .replace('#include <fog_vertex>', `vGemW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
        #include <fog_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vGemW;
        varying vec3 vBody;
        varying float vRough;
        varying float vGlow;
        varying float vPhase;`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vBody;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.06, 0.5, vRough );')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix( 0.1, 0.9, vRough );')
      .replace('#include <emissivemap_fragment>', `
        {
          vec3 gN = normalize( inverseTransformDirection( normal, viewMatrix ) );
          vec3 gV = normalize( cameraPosition - vGemW );
          float fres = pow( 1.0 - max( dot( gN, gV ), 0.0 ), 2.0 );
          vec3 gL = normalize( vec3( cos( uTime * 0.9 + vPhase * 7.0 ), 0.8, sin( uTime * 0.9 + vPhase * 7.0 ) ) );
          float glint = pow( max( dot( reflect( -gV, gN ), gL ), 0.0 ), 42.0 );
          float cut = 1.0 - vRough;
          vec3 gCol = vec3( 1.0 );
          #ifdef USE_INSTANCING_COLOR
            gCol = vColor;
          #endif
          totalEmissiveRadiance = gCol * vGlow * ( mix( 0.28, 0.6, cut ) + fres * mix( 0.6, 1.3, cut ) ) + vec3( glint * mix( 1.2, 6.0, cut ) * vGlow );
        }`);
  };
  if (opts.haze) withHaze(stoneMat, `world-gem|${opts.world}`, false, patch);
  else {
    stoneMat.onBeforeCompile = patch;
    stoneMat.customProgramCacheKey = () => 'world-gem|airless';
  }
  const stones = new THREE.InstancedMesh(stoneGeom, stoneMat, n);
  stones.name = 'gem-stones';
  stones.castShadow = false;
  stones.receiveShadow = false;

  // ── The markers. ──
  const markerGeom = markerGeometry();
  const aFx = new Float32Array(n * 3);
  const markerMat = new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uBeamH: { value: 22 }, uFar: { value: opts.far ?? 700 } },
    vertexShader: MARKER_VERT, fragmentShader: MARKER_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const markers = new THREE.InstancedMesh(markerGeom, markerMat, n);
  markers.name = 'gem-markers';
  markers.castShadow = false;
  markers.receiveShadow = false;
  markers.frustumCulled = false;
  markers.renderOrder = 2;

  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
  const tilt = new THREE.Euler();
  const tint = new THREE.Color();
  const seat = (k: number, scale: number) => {
    const g = gems[k];
    const look = LOOK[g.kind];
    const big = g.tier === 'high' ? 1.35 : 1;
    p.set(g.px, g.py, g.pz);
    tilt.set(0.18 * Math.sin(k * 2.3), 0, 0.18 * Math.cos(k * 1.7));
    q.setFromEuler(tilt);
    const u = look.scale * big * scale;
    s.set(look.stretch[0] * u, look.stretch[1] * u, look.stretch[2] * u);
    stones.setMatrixAt(k, m.compose(p, q, s));
  };
  gems.forEach((g, k) => {
    const look = LOOK[g.kind];
    const info = GEM_INFO[g.kind];
    seat(k, g.collected ? 0 : 1);
    aGem[k * 4] = hash(k, 3, 77);
    aGem[k * 4 + 1] = info.rough;
    aGem[k * 4 + 2] = look.glow;
    aGem[k * 4 + 3] = look.spin * (hash(k, 4, 77) < 0.5 ? -1 : 1);
    aBody.set(look.body, k * 3);
    tint.setRGB(...info.color);
    stones.setColorAt(k, tint);
    markers.setColorAt(k, tint);
    m.makeTranslation(g.px, g.py, g.pz);
    markers.setMatrixAt(k, m);
    aFx[k * 3] = aGem[k * 4];
    aFx[k * 3 + 1] = g.collected ? 0 : 1;
    aFx[k * 3 + 2] = 0;
  });
  stoneGeom.setAttribute('aGem', new THREE.InstancedBufferAttribute(aGem, 4));
  stoneGeom.setAttribute('aBody', new THREE.InstancedBufferAttribute(aBody, 3));
  const fxAttr = new THREE.InstancedBufferAttribute(aFx, 3);
  fxAttr.setUsage(THREE.DynamicDrawUsage);
  markerGeom.setAttribute('aFx', fxAttr);
  stones.instanceMatrix.needsUpdate = true;
  if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
  if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
  stones.computeBoundingSphere();
  if (n > 0) group.add(stones, markers);

  // Gems being taken: index → seconds since.
  const dying = new Float32Array(n).fill(-1);
  let anyDying = false;
  const lightColor = gems.map((g) => tint.setRGB(...GEM_INFO[g.kind].color).getHex());

  const light = (lights: LightPool, k: number) => {
    const g = gems[k];
    lights.request(g.px, g.py + 0.2, g.pz, lightColor[k], 2.4 * LOOK[g.kind].glow, 7, 2);
  };

  const handle: Gems = {
    group, gems, total: n, maxPoints,
    count: gems.filter((g) => g.collected).length,
    points: gems.reduce((sum, g) => sum + (g.collected ? GEM_INFO[g.kind].points : 0), 0),
    collect(id) {
      const k = gems.findIndex((g) => g.id === id);
      if (k < 0 || gems[k].collected) return false;
      const g = gems[k];
      g.collected = true;
      handle.count += 1;
      handle.points += GEM_INFO[g.kind].points;
      dying[k] = 0;
      anyDying = true;
      if (store === undefined) recordGem(opts.world, id); else recordGem(opts.world, id, store);
      opts.onCollect?.(g);
      return true;
    },
    update(dt, crewX, crewY, crewZ, lights, pick = true) {
      clock.value += dt;
      let taken: GemInstance | null = null;
      const bodyY = crewY + 1.0;
      // The two nearest standing gems light the ground round them.
      let n1 = -1; let d1 = 30; let n2 = -1; let d2 = 30;
      for (let k = 0; k < n; k++) {
        const g = gems[k];
        if (g.collected) continue;
        const dx = g.px - crewX; const dz = g.pz - crewZ;
        if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
        const dy = g.py - bodyY;
        if (pick && !taken && Math.abs(dx) < GEM_PICK_RANGE && Math.abs(dz) < GEM_PICK_RANGE && Math.abs(dy) < GEM_PICK_RANGE + 0.6
          && dx * dx + dz * dz + dy * dy * 0.6 < GEM_PICK_RANGE * GEM_PICK_RANGE) {
          if (handle.collect(g.id)) { taken = g; continue; }
        }
        const d = Math.hypot(dx, dz, dy);
        if (d < d1) { n2 = n1; d2 = d1; n1 = k; d1 = d; } else if (d < d2) { n2 = k; d2 = d; }
      }
      if (lights) {
        if (n1 >= 0) light(lights, n1);
        if (n2 >= 0) light(lights, n2);
      }
      if (anyDying) {
        anyDying = false;
        for (let k = 0; k < n; k++) {
          if (dying[k] < 0) continue;
          const t = dying[k] + dt;
          const u = Math.min(1, t / POP);
          const scale = u < 0.3 ? 1 + u * 1.4 : Math.max(0, 1.42 * (1 - (u - 0.3) / 0.7));
          seat(k, scale);
          // A flash of the stone's colour on everything round it as it goes.
          if (lights && u < 0.6) lights.request(gems[k].px, gems[k].py, gems[k].pz, lightColor[k], 14 * (1 - u / 0.6), 12, 2);
          aFx[k * 3 + 1] = 0;
          aFx[k * 3 + 2] = u < 1 ? 1 - u : 0;
          if (u >= 1) dying[k] = -1; else { dying[k] = t; anyDying = true; }
        }
        stones.instanceMatrix.needsUpdate = true;
        fxAttr.needsUpdate = true;
      }
      return taken;
    },
    dispose() {
      stones.dispose(); markers.dispose();
      stoneGeom.dispose(); markerGeom.dispose();
      stoneMat.dispose(); markerMat.dispose();
    },
  };
  return handle;
}
