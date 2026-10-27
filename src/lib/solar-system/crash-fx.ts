// The ship blowing up: on a world, or in open space.
//
// A white flash, then a fireball of billowing flame that climbs and darkens
// into a smoke column, sparks streaking out and falling back, a shock shell
// and a ring racing over the ground, a scorch that glows and cools, and the
// hull's own fragments thrown up glowing, trailing smoke, coming down under
// the world's gravity and lying where they land. In open space the same
// burst with no ground: everything flies outward and nothing falls.
//
// The flame, smoke, sparks and trails are camera-facing quads, one instanced
// draw each, moved on the GPU from what was thrown at the trigger: the CPU
// work per frame is the fragments and their trails. The materials live in
// the scene from the start (hidden), so the warm-up compiles them and the
// crash itself costs no shader build.

import * as THREE from 'three';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';

export interface CrashGround {
  position: THREE.Vector3;
  radius: number;
  /** m/s² at the surface. */
  surfaceG: number;
}

export interface CrashFx {
  group: THREE.Group;
  /** `body` null = destroyed in open space: no gravity, debris drifts.
   *  `scale` multiplies the whole burst — 1 is a ship, hundreds is a world. */
  trigger: (point: THREE.Vector3, normal: THREE.Vector3, body: CrashGround | null, impactVel: THREE.Vector3, scale?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

const FIRE_N = 46;
const SMOKE_N = 64;
const SPARK_N = 130;
const DEBRIS_N = 18;
const TRAIL_N = 256;
const TRAIL_LIFE = 1.0;
/** Seconds the whole thing lasts, for a ship. */
const LIFE = 3.4;

/** A puff of flame or smoke: lumpy soft blobs, so that eroding it with age
 *  breaks it into billows rather than shrinking a disc. */
function puffTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * s * 0.27;
      const x = s / 2 + Math.cos(a) * d;
      const y = s / 2 + Math.sin(a) * d;
      const r = s * (0.1 + rnd() * 0.16);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const k = 0.28 + rnd() * 0.25;
      grad.addColorStop(0, `rgba(255,255,255,${k})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function ringTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0)');
    grad.addColorStop(0.8, 'rgba(255,220,180,0.9)');
    grad.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A quad per instance; the shaders place and face it. */
function quads(n: number, attrs: Record<string, number>): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  for (const [name, size] of Object.entries(attrs)) {
    g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(n * size), size));
  }
  g.instanceCount = n;
  return g;
}

const PUFF_VERT = /* glsl */ `
attribute vec3 aDir;
attribute vec4 aParams; // speed, size, delay, life
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uDrag;
uniform float uRise;
uniform float uGrow;
uniform vec3 uUp;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
void main() {
  float t = uTime - aParams.z;
  float age = t / aParams.w;
  vAge = age;
  vSeed = aSeed;
  vUv = uv;
  if (t < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float travel = aParams.x * (1.0 - exp(-uDrag * t)) / uDrag;
  vec3 c = (aDir * travel + uUp * uRise * t * t) * uScale;
  float size = aParams.y * uScale * (0.3 + uGrow * (1.0 - exp(-2.2 * t)));
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float a = aSeed * 6.2831 + t * (aSeed - 0.5) * 1.6;
  vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * position.xy;
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
}`;

const FIRE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
void main() {
  float d = texture2D(uMap, vUv).r;
  // Eaten away as it ages: the billows break up rather than shrink.
  float cut = 0.05 + vAge * 0.55;
  float shape = smoothstep(cut, cut + 0.28, d);
  if (shape <= 0.0) discard;
  float a = vAge;
  vec3 hot = vec3(4.0, 3.4, 2.6);
  vec3 yel = vec3(3.2, 1.6, 0.3);
  vec3 org = vec3(2.2, 0.48, 0.04);
  vec3 red = vec3(0.45, 0.04, 0.0);
  vec3 col = a < 0.1 ? mix(hot, yel, a / 0.1) : a < 0.32 ? mix(yel, org, (a - 0.1) / 0.22) : mix(org, red, clamp((a - 0.32) / 0.5, 0.0, 1.0));
  // The thick middle of a billow burns brighter than its edge.
  col *= 0.55 + 0.9 * smoothstep(cut, 1.0, d);
  float fade = smoothstep(0.0, 0.04, a) * (1.0 - smoothstep(0.45, 0.9, a));
  gl_FragColor = vec4(col, shape * fade * uOpacity);
}`;

const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform vec3 uTint;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
void main() {
  float d = texture2D(uMap, vUv).r;
  float cut = 0.06 + vAge * 0.45;
  float shape = smoothstep(cut, cut + 0.4, d);
  if (shape <= 0.0) discard;
  // Lit from inside by the fire while it is young, then plain smoke.
  // Lumpy: the thick of each billow a little lighter, as if lit through.
  vec3 smoke = uTint * (0.6 + 0.8 * vSeed) * (0.8 + 0.4 * smoothstep(cut, 1.0, d));
  vec3 col = mix(vec3(0.75, 0.22, 0.04), smoke, smoothstep(0.02, 0.2, vAge));
  float fade = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge));
  gl_FragColor = vec4(col, shape * fade * 0.7 * uOpacity);
}`;

const SPARK_VERT = /* glsl */ `
attribute vec3 aDir;
attribute vec4 aParams; // speed, width, delay, life
uniform float uTime;
uniform float uScale;
uniform vec3 uGrav;
uniform vec3 uUp;
uniform float uGround;
varying vec2 vUv;
varying float vAge;
void main() {
  float t = uTime - aParams.z;
  float age = t / aParams.w;
  vAge = age;
  vUv = uv;
  vec3 v0 = aDir * aParams.x;
  vec3 p = v0 * t + 0.5 * uGrav * t * t;
  if (t < 0.0 || age > 1.0 || (uGround > 0.5 && dot(p, uUp) < 0.0)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 v = v0 + uGrav * t;
  vec4 mv = modelViewMatrix * vec4(p * uScale, 1.0);
  vec3 vv = (modelViewMatrix * vec4(v * uScale, 0.0)).xyz;
  float sp = length(vv.xy);
  vec2 along = sp > 1e-6 ? vv.xy / sp : vec2(0.0, 1.0);
  vec2 side = vec2(-along.y, along.x);
  float w = aParams.y * uScale;
  float len = w * 2.0 + sp * 0.05;
  // The head at the spark, the tail trailing back along its path.
  mv.xy += along * (position.y - 1.0) * 0.5 * len + side * position.x * w;
  gl_Position = projectionMatrix * mv;
}`;

const SPARK_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
varying float vAge;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = vUv.y;
  float a = across * across * along;
  vec3 col = mix(vec3(4.0, 3.2, 2.0), vec3(2.2, 0.6, 0.12), smoothstep(0.0, 0.6, vAge));
  gl_FragColor = vec4(col, a * (1.0 - smoothstep(0.5, 1.0, vAge)) * uOpacity);
}`;

/** The fragments' trails: puffs dropped where each fragment was. */
const TRAIL_VERT = /* glsl */ `
attribute vec4 aPos; // x, y, z, born
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uLife;
uniform vec3 uUp;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
void main() {
  float t = uTime - aPos.w;
  float age = t / uLife;
  vAge = age;
  vSeed = aSeed;
  vUv = uv;
  if (aPos.w < 0.0 || t < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 c = aPos.xyz + uUp * t * 0.6 * uScale;
  float size = uScale * (0.08 + 0.42 * sqrt(age)) * (0.7 + 0.6 * aSeed);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float a = aSeed * 6.2831;
  vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * position.xy;
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
}`;

const SHOCK_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const SHOCK_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = 1.0 - abs(dot(vN, vV));
  rim = pow(rim, 3.0);
  gl_FragColor = vec4(vec3(2.2, 1.7, 1.25) * rim, rim * uOpacity);
}`;

interface Fragment {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  settled: boolean;
  /** Seconds to the next puff of its trail. */
  puff: number;
}

/**
 * `H` is the ship's unit of length (a hull is eight of them), and `oneG`
 * the flight model's one gravity in the same world units per second².
 */
export function makeCrashFx(H: number, oneG: number): CrashFx {
  const group = new THREE.Group();
  group.name = 'playerCrash';
  group.visible = false;
  const glowTex = softSpriteTexture();
  const puffTex = puffTexture();
  const ringTex = ringTexture();
  const up = new THREE.Vector3(0, 1, 0);

  // ── Flame and smoke: GPU-moved billboards. ──
  const puffAttrs = { aDir: 3, aParams: 4, aSeed: 1 };
  const fireGeom = quads(FIRE_N, puffAttrs);
  const fireMat = new THREE.ShaderMaterial({
    vertexShader: PUFF_VERT, fragmentShader: FIRE_FRAG,
    uniforms: {
      uTime: { value: 0 }, uScale: { value: H }, uDrag: { value: 2.4 }, uRise: { value: 1.1 }, uGrow: { value: 2.0 },
      uUp: { value: up }, uMap: { value: puffTex }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const fire = new THREE.Mesh(fireGeom, fireMat);
  fire.frustumCulled = false;
  fire.renderOrder = 2;

  const smokeGeom = quads(SMOKE_N, puffAttrs);
  const smokeMat = new THREE.ShaderMaterial({
    vertexShader: PUFF_VERT, fragmentShader: SMOKE_FRAG,
    uniforms: {
      uTime: { value: 0 }, uScale: { value: H }, uDrag: { value: 1.5 }, uRise: { value: 0.75 }, uGrow: { value: 2.6 },
      uUp: { value: up }, uMap: { value: puffTex }, uOpacity: { value: 1 }, uTint: { value: new THREE.Color(0.075, 0.068, 0.062) },
    },
    transparent: true, depthWrite: false,
  });
  const smoke = new THREE.Mesh(smokeGeom, smokeMat);
  smoke.frustumCulled = false;
  smoke.renderOrder = 1;

  // ── Sparks: velocity-stretched streaks under gravity. ──
  const sparkGeom = quads(SPARK_N, { aDir: 3, aParams: 4 });
  const grav = new THREE.Vector3();
  const sparkMat = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
    uniforms: {
      uTime: { value: 0 }, uScale: { value: H }, uGrav: { value: grav }, uUp: { value: up }, uGround: { value: 1 }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Mesh(sparkGeom, sparkMat);
  sparks.frustumCulled = false;
  sparks.renderOrder = 3;

  // ── The fragments' smoke trails: puffs written where the fragments are. ──
  const trailGeom = quads(TRAIL_N, { aPos: 4, aSeed: 1 });
  const trailPos = trailGeom.getAttribute('aPos') as THREE.InstancedBufferAttribute;
  const trailSeed = trailGeom.getAttribute('aSeed') as THREE.InstancedBufferAttribute;
  for (let i = 0; i < TRAIL_N; i++) trailSeed.setX(i, Math.random());
  const trailMat = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERT, fragmentShader: SMOKE_FRAG,
    uniforms: {
      uTime: { value: 0 }, uScale: { value: H }, uLife: { value: TRAIL_LIFE }, uUp: { value: up },
      uMap: { value: puffTex }, uOpacity: { value: 0.6 }, uTint: { value: new THREE.Color(0.13, 0.12, 0.11) },
    },
    transparent: true, depthWrite: false,
  });
  const trails = new THREE.Mesh(trailGeom, trailMat);
  trails.frustumCulled = false;
  trails.renderOrder = 1;
  let trailNext = 0;

  // ── The flash, the shock shell, the ground ring and the scorch. ──
  const flashMat = new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(6, 5, 4), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Sprite(flashMat);
  flash.renderOrder = 4;

  const shockMat = new THREE.ShaderMaterial({
    vertexShader: SHOCK_VERT, fragmentShader: SHOCK_FRAG,
    uniforms: { uOpacity: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const shockGeom = new THREE.SphereGeometry(1, 32, 16);
  const shock = new THREE.Mesh(shockGeom, shockMat);
  shock.frustumCulled = false;

  const planeGeom = new THREE.PlaneGeometry(1, 1);
  const ringMat = new THREE.MeshBasicMaterial({
    map: ringTex, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(planeGeom, ringMat);
  const scorchMat = new THREE.MeshBasicMaterial({
    map: glowTex, color: new THREE.Color(2.4, 0.7, 0.16), transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const scorch = new THREE.Mesh(planeGeom, scorchMat);

  // ── The hull's fragments: bent plates and lumps, glowing as they fly. ──
  const fragSkin = new THREE.MeshStandardMaterial({
    color: 0xb4bac2, roughness: 0.45, metalness: 0.7, emissive: new THREE.Color(1, 0.36, 0.08), emissiveIntensity: 0, transparent: true,
  });
  const fragDark = new THREE.MeshStandardMaterial({
    color: 0x2a2e35, roughness: 0.7, metalness: 0.45, emissive: new THREE.Color(1, 0.36, 0.08), emissiveIntensity: 0, transparent: true,
  });
  const fragGeoms: THREE.BufferGeometry[] = [];
  const frags: Fragment[] = [];
  for (let i = 0; i < DEBRIS_N; i++) {
    // Torn hull plates, mostly, and a few lengths of pipe and strut.
    const pipe = i % 4 === 3;
    const geom = pipe ? new THREE.CylinderGeometry(0.09, 0.09, 1, 7) : new THREE.BoxGeometry(1, 0.05, 0.7, 3, 1, 3);
    const p = geom.getAttribute('position') as THREE.BufferAttribute;
    if (!pipe) {
      // Bent and torn: curled along one edge, ragged at the corners.
      const curl = (Math.random() - 0.5) * 0.9;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v); const z = p.getZ(v);
        p.setY(v, p.getY(v) + curl * x * x + (Math.random() - 0.5) * 0.04);
        p.setX(v, x * (1 + (Math.random() - 0.5) * 0.35));
        p.setZ(v, z * (1 + (Math.random() - 0.5) * 0.35));
      }
    } else {
      geom.rotateZ((Math.random() - 0.5) * 0.4);
    }
    geom.computeVertexNormals();
    const s = (0.25 + Math.random() * 0.4) * H * (i < 4 ? 1.5 : 1);
    geom.scale(s * (0.8 + Math.random() * 0.6), s, s * (0.8 + Math.random() * 0.6));
    fragGeoms.push(geom);
    const mesh = new THREE.Mesh(geom, i % 3 === 0 ? fragDark : fragSkin);
    mesh.visible = false;
    group.add(mesh);
    frags.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), settled: false, puff: 0 });
  }

  group.add(scorch, ring, smoke, trails, fire, sparks, shock, flash);

  let life = -1;
  let fxScale = 1;
  let tk = 1;
  let gH = 0;
  let body: CrashGround | null = null;
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);

  /** A direction thrown off the impact: up the normal, spread by `spread`, or anywhere in open space. */
  const throwDir = (out: THREE.Vector3, spread: number, flat = 0) => {
    if (!body) return out.randomDirection();
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    return out.copy(normal).multiplyScalar(1 - flat)
      .addScaledVector(tangent, Math.cos(a) * r)
      .addScaledVector(bitangent, Math.sin(a) * r)
      .normalize();
  };

  const fillPuffs = (geom: THREE.InstancedBufferGeometry, n: number, f: (i: number) => [number, number, number, number, number, number]) => {
    const dir = geom.getAttribute('aDir') as THREE.InstancedBufferAttribute;
    const par = geom.getAttribute('aParams') as THREE.InstancedBufferAttribute;
    const seed = geom.getAttribute('aSeed') as THREE.InstancedBufferAttribute | undefined;
    for (let i = 0; i < n; i++) {
      const [spread, flat, speed, size, delay, span] = f(i);
      throwDir(tmp, spread, flat);
      dir.setXYZ(i, tmp.x, tmp.y, tmp.z);
      par.setXYZW(i, speed, size, delay, span);
      seed?.setX(i, Math.random());
    }
    dir.needsUpdate = par.needsUpdate = true;
    if (seed) seed.needsUpdate = true;
  };

  return {
    group,
    trigger(at, n, hitBody, impactVel, scale = 1) {
      life = 0;
      fxScale = scale;
      tk = Math.min(2.5, Math.sqrt(scale));
      body = hitBody;
      point.copy(at);
      normal.copy(n).normalize();
      up.copy(normal);
      tangent.set(0, 1, 0);
      if (Math.abs(normal.dot(tangent)) > 0.9) tangent.set(1, 0, 0);
      tangent.cross(normal).normalize();
      bitangent.crossVectors(normal, tangent);
      group.position.copy(point);
      group.visible = true;
      const hs = H * scale;
      // How hard it went in: a fast hit throws everything further.
      const kick = Math.min(1.5, 0.75 + impactVel.length() / (H * 160));
      gH = body ? THREE.MathUtils.clamp((Math.min(30, body.surfaceG) / 9.81) * oneG / H, 5, 30) : 0;
      grav.copy(normal).multiplyScalar(-gH);

      for (const m of [fireMat, smokeMat, sparkMat, trailMat]) m.uniforms.uScale.value = hs;
      fireMat.uniforms.uRise.value = body ? 1.1 : 0;
      smokeMat.uniforms.uRise.value = body ? 0.75 : 0;
      sparkMat.uniforms.uGround.value = body ? 1 : 0;
      trailMat.uniforms.uTime.value = 0;

      // The main fireball, then a couple of late secondary blasts.
      fillPuffs(fireGeom, FIRE_N, (i) => {
        const late = i >= FIRE_N - 10;
        return [body ? 1.25 : 1, 0.15, (2.5 + Math.random() * 9) * kick, 1.1 + Math.random() * 1.9,
          late ? 0.22 + Math.random() * 0.45 : Math.random() * 0.12, 0.85 + Math.random() * 0.9];
      });
      fillPuffs(smokeGeom, SMOKE_N, () => [body ? 1.1 : 1, 0, (2 + Math.random() * 8) * kick, 0.8 + Math.random() * 1.4,
        0.12 + Math.random() * 0.5, 1.8 + Math.random() * 1.4]);
      fillPuffs(sparkGeom, SPARK_N, () => [body ? 1.6 : 1, 0.25, (9 + Math.random() * 34) * kick, 0.04 + Math.random() * 0.07,
        Math.random() * 0.12, 0.6 + Math.random() * 1.1]);

      flash.scale.setScalar(0.1);
      flash.position.copy(normal).multiplyScalar(0.6 * hs);
      shock.position.set(0, 0, 0);
      ring.visible = scorch.visible = !!body;
      ring.position.copy(normal).multiplyScalar(0.05 * hs);
      ring.quaternion.setFromUnitVectors(zAxis, normal);
      scorch.position.copy(normal).multiplyScalar(0.04 * hs);
      scorch.quaternion.copy(ring.quaternion);

      for (let i = 0; i < TRAIL_N; i++) trailPos.setW(i, -1);
      trailPos.needsUpdate = true;
      trailNext = 0;
      for (const f of frags) {
        f.mesh.visible = true;
        f.mesh.scale.setScalar(scale);
        f.settled = false;
        f.puff = Math.random() * 0.05;
        f.mesh.position.copy(normal).multiplyScalar(0.4 * hs);
        f.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        throwDir(f.vel, body ? 1.1 : 1, 0.1);
        f.vel.multiplyScalar((3 + Math.random() * 12) * kick * hs * (body ? 1 : 0.5));
        f.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12);
      }
      fragSkin.emissiveIntensity = fragDark.emissiveIntensity = 1.4;
      fragSkin.opacity = fragDark.opacity = 1;
    },
    update(dt) {
      if (life < 0) return;
      life += dt;
      if (life > LIFE * tk) {
        life = -1;
        group.visible = false;
        for (const f of frags) f.mesh.visible = false;
        return;
      }
      const t = life / tk;
      const hs = H * fxScale;
      fireMat.uniforms.uTime.value = t;
      smokeMat.uniforms.uTime.value = t;
      sparkMat.uniforms.uTime.value = t;
      trailMat.uniforms.uTime.value = t;

      // The flash: a white-hot bloom for a quarter of a second.
      const fk = Math.min(1, t / 0.08);
      flash.scale.setScalar((3 + 15 * fk) * hs);
      flashMat.opacity = t < 0.08 ? fk : Math.max(0, 1 - (t - 0.08) / 0.3);
      // The shock shell, racing out and thinning.
      const sk = Math.min(1, t / 0.7);
      shock.scale.setScalar((1 + 30 * (1 - (1 - sk) * (1 - sk))) * hs);
      shockMat.uniforms.uOpacity.value = (1 - sk) * 0.9;
      shock.visible = sk < 1;
      if (body) {
        const rk = Math.min(1, t / 1.1);
        ring.scale.setScalar((1 + 34 * Math.sqrt(rk)) * hs);
        ringMat.opacity = (1 - rk) * 0.9;
        // The scorch: up with the blast, cooling for the rest of it.
        scorch.scale.setScalar(9 * hs);
        scorchMat.opacity = Math.min(1, t / 0.15) * Math.max(0, 1 - t / LIFE) * 0.85;
      }

      // The fragments: thrown, tumbling, glowing, trailing smoke, falling back.
      // White-hot for a moment, then dull red, then dark metal.
      const cool = Math.max(0, 1 - t / 1.6);
      fragSkin.emissiveIntensity = fragDark.emissiveIntensity = 1.4 * cool * cool * cool;
      const floor = body ? body.radius : 0;
      let wrote = false;
      for (let i = 0; i < frags.length; i++) {
        const f = frags[i];
        if (f.settled) continue;
        f.vel.addScaledVector(normal, -gH * hs * dt);
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
        f.mesh.rotation.z += f.spin.z * dt;
        if (body) {
          tmp.copy(f.mesh.position).add(point).sub(body.position);
          if (tmp.length() < floor + 0.1 * hs) {
            tmp.normalize().multiplyScalar(floor + 0.1 * hs).add(body.position).sub(point);
            f.mesh.position.copy(tmp);
            f.settled = true;
          }
        }
        // The big pieces smoke as they fly.
        if (i < 6 && t < 2) {
          f.puff -= dt;
          if (f.puff <= 0) {
            f.puff += 0.022;
            trailPos.setXYZW(trailNext, f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, t);
            trailNext = (trailNext + 1) % TRAIL_N;
            wrote = true;
          }
        }
      }
      if (wrote) trailPos.needsUpdate = true;
      // The last second: the pieces fade out with the smoke.
      fragSkin.opacity = fragDark.opacity = Math.max(0, Math.min(1, LIFE - t));
    },
    dispose() {
      for (const m of [fireMat, smokeMat, sparkMat, trailMat, shockMat, flashMat, ringMat, scorchMat, fragSkin, fragDark]) m.dispose();
      for (const g of [fireGeom, smokeGeom, sparkGeom, trailGeom, shockGeom, planeGeom, ...fragGeoms]) g.dispose();
      puffTex.dispose();
      ringTex.dispose();
    },
  };
}
