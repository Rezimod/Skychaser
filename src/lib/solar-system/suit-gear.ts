// The hardware bolted onto the EVA suit, built in code and hung on the rig's
// joints: the jet module under the life-support pack with its twin nozzles
// and side tanks, a folding antenna, the chest console with its screen and
// status lights, the shoulder lamps and the helmet's ring light. The glTF
// cannot be rebuilt here (no Blender on this machine), so everything that
// makes the silhouette bulkier and brighter than the bare model is made at
// attach time from primitives and merged, per joint, into one mesh a
// material — a dozen draw calls, not sixty.
//
// Two things stay separate on purpose. The flames are live shader meshes the
// owner scales every frame, so they are kept out of the merge; and the small
// fittings — bolts, straps, LEDs, the antenna — are a mesh of their own per
// joint so they can be hidden with the body's far LOD, where they are a
// pixel each and cost a draw call each.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { keep, mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';

/** The joints the gear hangs on (a subset of SuitRig, so a test can pass bare bones). */
export interface GearJoints {
  pack: THREE.Object3D;
  chest: THREE.Object3D;
  helmet: THREE.Object3D;
}

export interface SuitGear {
  /** The nozzle mouths, in the pack's frame: where the sparks and the light come from. */
  nozzles: THREE.Object3D[];
  /** The flames' throttle, 0…1, and the clock they flicker on. Every frame. */
  setThrottle: (k: number, t: number) => void;
  /** The lamps and the ring light, bright with the headlamp. */
  setLamps: (on: boolean) => void;
  /** Near: every fitting; far (the body's LOD1): only the big shapes. */
  setDetail: (near: boolean) => void;
  /** The visor's reflections, once the model is in. */
  setEnvMap: (map: THREE.Texture | null, intensity: number) => void;
  /** Triangles drawn at full detail (the flames left out). */
  triangles: number;
  dispose: () => void;
}

/** Screen teal, the suit's one accent, ×3 for the bloom. */
export const SCREEN_TEAL = new THREE.Color(0.25, 0.92, 0.83);
const LAMP_ON = 2.6;
const LAMP_OFF = 0.12;
const RING_ON = 1.8;
const RING_OFF = 0.45;
/** Rig rest pivots (moon-suit-mesh): the gear is laid out in rig space and moved into each joint's frame. */
const PACK = new THREE.Vector3(0, 1.43, -0.34);
const CHEST = new THREE.Vector3(0, 1.11, 0);
const NECK = new THREE.Vector3(0, 1.69, 0.01);
const HELMET_C = 0.2;
/** Where the nozzle mouths are, rig space. */
const NOZZLE_Y = 0.85;
const NOZZLE_Z = -0.4;
const NOZZLE_X = 0.11;

/** A flame that is out: drawn at no size, so its program stays warm. */
const OFF = 1e-3;

const FLAME_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FLAME_FRAG = /* glsl */ `
  uniform float uK; uniform float uT;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // v is 1 at the nozzle mouth and 0 at the tip; u is mirrored so the
    // cone's seam never shows in the noise.
    float v = vUv.y;
    float u = abs(vUv.x * 2.0 - 1.0);
    float n = noise(vec2(u * 4.0, v * 4.0 + uT * 7.0));
    float n2 = noise(vec2(u * 9.0 + 3.0, v * 9.0 + uT * 13.0));
    float shape = smoothstep(0.0, 0.4, v) * (0.5 + 0.5 * n) * (0.7 + 0.3 * n2);
    vec3 core = vec3(0.8, 0.92, 1.0);
    vec3 mid = vec3(0.4, 0.62, 1.0);
    vec3 tip = vec3(1.0, 0.5, 0.18);
    vec3 col = mix(tip, mix(mid, core, smoothstep(0.55, 1.0, v)), smoothstep(0.0, 0.6, v));
    // Additive, HDR: the blue-white core is well over 1.0 and blooms; the tips fade to nothing.
    gl_FragColor = vec4(col * (2.0 + 2.0 * v) * shape * uK, 1.0);
  }`;

export function buildSuitGear(joints: GearJoints, bareHead = false): SuitGear {
  const owned: { dispose: () => void }[] = [];
  const own = <T extends { dispose: () => void }>(o: T): T => { owned.push(o); return o; };
  const std = (o: THREE.MeshStandardMaterialParameters) => own(new THREE.MeshStandardMaterial(o));
  // ── Materials: an off-white hard shell, dark pads, brushed fittings, and the things that glow. ──
  const shell = std({ color: 0xe6e3dc, roughness: 0.45, metalness: 0.1 });
  const pad = std({ color: 0x2b2d31, roughness: 0.85, metalness: 0.05 });
  const metal = std({ color: 0xa8abb0, roughness: 0.32, metalness: 0.9 });
  const screen = std({ color: 0x06201f, emissive: SCREEN_TEAL, emissiveIntensity: 3, roughness: 0.3, metalness: 0 });
  const strip = std({ color: 0x06201f, emissive: SCREEN_TEAL, emissiveIntensity: 2, roughness: 0.4 });
  const ledGreen = std({ color: 0x0c2a12, emissive: new THREE.Color(0.3, 1, 0.4), emissiveIntensity: 2.5 });
  const ledAmber = std({ color: 0x2a1a06, emissive: new THREE.Color(1, 0.6, 0.15), emissiveIntensity: 2.5 });
  const ledRed = std({ color: 0x2a0808, emissive: new THREE.Color(1, 0.2, 0.15), emissiveIntensity: 2.5 });
  const lamp = std({ color: 0xfff3e0, emissive: 0xfff1dc, emissiveIntensity: LAMP_OFF, roughness: 0.2 });
  const ring = std({ color: 0xdfe8ff, emissive: 0xcfe0ff, emissiveIntensity: RING_OFF, roughness: 0.3 });
  const rim = std({ color: 0x555a60, emissive: 0xff8a3c, emissiveIntensity: 0, roughness: 0.4, metalness: 0.8 });
  const flameMat = own(new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uT: { value: 0 } },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  // No 2D canvas (a test, a locked-down browser): the sprites go without a map rather than the suit without its gear.
  let spriteMap: THREE.Texture | null = null;
  try { spriteMap = softSpriteTexture(); } catch { spriteMap = null; }
  const coreMat = own(new THREE.SpriteMaterial({ map: spriteMap, color: new THREE.Color(2.5, 2.8, 3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  const glowMat = own(new THREE.SpriteMaterial({ map: spriteMap, color: new THREE.Color(0.5, 0.75, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));

  const geoms: THREE.BufferGeometry[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geoms.push(g); return g; };
  const rbox = (w: number, h: number, d: number, r = 0.01, seg = 2) => geo(new RoundedBoxGeometry(w, h, d, seg, r));
  const cyl = (rt: number, rb: number, h: number, seg = 14, open = false) => geo(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  /** A part at a rig-space point, moved into `pivot`'s frame. */
  const part = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, at: THREE.Vector3, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x - at.x, y - at.y, z - at.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const assemblies: THREE.Group[] = [];
  const fittings: THREE.Group[] = [];
  /** One joint's gear: a group the merge folds, and a pivot inside it for what the far LOD drops. */
  const assembly = (parent: THREE.Object3D, name: string) => {
    const g = new THREE.Group();
    g.name = name;
    const small = pivot(new THREE.Group());
    small.name = `${name}-fittings`;
    g.add(small);
    parent.add(g);
    assemblies.push(g);
    fittings.push(small);
    return { g, small };
  };

  const nozzles: THREE.Object3D[] = [];
  const flames: THREE.Object3D[] = [];
  const cores: THREE.Sprite[] = [];
  const glows: THREE.Sprite[] = [];

  // ── The jet module: under the pack, between the hips, with a tank each side. ──
  if (!bareHead) {
    const { g, small } = assembly(joints.pack, 'jet-module');
    part(g, rbox(0.44, 0.24, 0.26, 0.03), shell, PACK, 0, 1.06, -0.39);
    // A dark vent inset on the module's back face, and a lit status strip up the pack.
    part(g, rbox(0.34, 0.14, 0.02, 0.004, 1), pad, PACK, 0, 1.06, -0.525);
    part(g, rbox(0.02, 0.2, 0.012, 0.003, 1), strip, PACK, 0.2, 1.45, -0.492);
    for (const s of [-1, 1]) {
      // Side tanks outside the pack's rails, capped in metal, banded at the shoulders and the waist.
      part(g, cyl(0.075, 0.075, 0.5), shell, PACK, s * 0.37, 1.42, -0.36);
      part(g, cyl(0.05, 0.075, 0.05), metal, PACK, s * 0.37, 1.695, -0.36);
      part(g, cyl(0.075, 0.05, 0.05), metal, PACK, s * 0.37, 1.145, -0.36);
      for (const y of [1.27, 1.57]) part(small, cyl(0.08, 0.08, 0.03), metal, PACK, s * 0.37, y, -0.36);
      // A short pipe from each tank into the module.
      const pipe = part(small, cyl(0.014, 0.014, 0.16, 8), metal, PACK, s * 0.3, 1.16, -0.4);
      pipe.rotation.z = Math.PI / 2;
      // The nozzle: a bell in metal with a rim that glows with the burn, and the mouth the fire comes out of.
      part(g, cyl(0.045, 0.065, 0.11, 14, true), metal, PACK, s * NOZZLE_X, NOZZLE_Y + 0.055, NOZZLE_Z);
      const torus = geo(new THREE.TorusGeometry(0.062, 0.008, 6, 20));
      torus.rotateX(Math.PI / 2);
      part(g, torus, rim, PACK, s * NOZZLE_X, NOZZLE_Y, NOZZLE_Z);
      const mouth = keep(new THREE.Object3D());
      mouth.name = 'nozzle';
      mouth.position.set(s * NOZZLE_X - PACK.x, NOZZLE_Y - PACK.y, NOZZLE_Z - PACK.z);
      g.add(mouth);
      nozzles.push(mouth);
      // The flame hangs from the mouth and is scaled about it: a cone open at the mouth, tip down.
      const flame = keep(new THREE.Object3D());
      // Off, the flame and its sprites are scaled to nothing rather than
      // hidden, so the host's compile pass builds their programs with the
      // scene's and the first ignition does not stall on the shader compiler.
      const cone = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.058, 0.006, 0.85, 12, 4, true)), flameMat);
      cone.position.y = -0.425;
      cone.frustumCulled = false;
      flame.add(cone);
      flame.scale.setScalar(OFF);
      mouth.add(flame);
      flames.push(flame);
      const core = new THREE.Sprite(coreMat);
      core.scale.setScalar(OFF);
      mouth.add(core);
      cores.push(core);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(OFF);
      glow.position.y = -0.12;
      mouth.add(glow);
      glows.push(glow);
    }
    // The folding antenna: a hinge on the pack's top, a rod leaning out and back, a red bead at its tip.
    part(small, rbox(0.03, 0.03, 0.03, 0.004, 1), metal, PACK, -0.24, 1.905, -0.33);
    const hinge = new THREE.Group();
    hinge.position.set(-0.24 - PACK.x, 1.92 - PACK.y, -0.33 - PACK.z);
    hinge.rotation.set(-0.3, 0, 0.25);
    const rod = new THREE.Mesh(cyl(0.004, 0.004, 0.36, 6), metal);
    rod.position.y = 0.18;
    hinge.add(rod);
    const bead = new THREE.Mesh(geo(new THREE.SphereGeometry(0.012, 8, 6)), ledRed);
    bead.position.y = 0.37;
    hinge.add(bead);
    small.add(hinge);
  }

  // ── The chest: the console with its screen and lights, the shoulder lamps, the straps. ──
  {
    const { g, small } = assembly(joints.chest, 'chest-gear');
    part(g, rbox(0.2, 0.12, 0.05, 0.01), shell, CHEST, 0, 1.41, 0.275);
    part(g, geo(new THREE.PlaneGeometry(0.15, 0.07)), screen, CHEST, 0, 1.42, 0.301);
    const leds = [ledGreen, ledAmber, screen];
    for (let i = 0; i < 3; i++) part(small, rbox(0.014, 0.014, 0.006, 0.002, 1), leds[i], CHEST, -0.05 + i * 0.05, 1.365, 0.301);
    for (const s of [-1, 1]) {
      part(small, rbox(0.07, 0.02, 0.3, 0.005, 1), pad, CHEST, s * 0.17, 1.675, 0);
      // The lamp housings sit on the collar, inboard of the shoulder bearings, lenses forward.
      part(g, rbox(0.075, 0.05, 0.09, 0.008), pad, CHEST, s * 0.24, 1.665, 0.09);
      const lens = geo(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 12));
      lens.rotateX(Math.PI / 2);
      part(g, lens, lamp, CHEST, s * 0.24, 1.665, 0.14);
      part(small, rbox(0.02, 0.03, 0.02, 0.003, 1), metal, CHEST, s * 0.24, 1.63, 0.09);
    }
  }

  // ── The helmet: a ring light over the brow, an arc open at the back. ──
  if (!bareHead) {
    const { g } = assembly(joints.helmet, 'helmet-ring');
    const arc = 3.6;
    // Proud of the helmet's shell (about 0.2 m across at the brow), so it reads as a ring and not a seam.
    const torus = geo(new THREE.TorusGeometry(0.215, 0.012, 6, 28, arc));
    // The torus lies in XY with its arc from +x; laid flat and turned so the arc's middle faces +z.
    torus.rotateX(Math.PI / 2);
    torus.rotateY(arc / 2 - Math.PI / 2);
    part(g, torus, ring, NECK, 0, NECK.y + HELMET_C + 0.09, NECK.z);
  }

  // ── Merge each joint's parts into one mesh a material; count what is left. ──
  for (const g of assemblies) mergeStatic(g);
  for (const g of geoms) g.dispose();
  let triangles = 0;
  for (const g of assemblies) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.material === flameMat) return;
      owned.push(m.geometry);
      triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    });
  }

  return {
    nozzles,
    triangles,
    setThrottle(k, t) {
      const on = k > 0.02;
      flameMat.uniforms.uK.value = k;
      flameMat.uniforms.uT.value = t;
      rim.emissiveIntensity = k * 4;
      for (let i = 0; i < flames.length; i++) {
        const flicker = 0.85 + 0.15 * Math.sin(t * 37 + i * 2.1) + 0.06 * Math.sin(t * 91 + i);
        if (on) flames[i].scale.set(0.8 + 0.2 * k, k * flicker, 0.8 + 0.2 * k); else flames[i].scale.setScalar(OFF);
        cores[i].scale.setScalar(on ? 0.1 + 0.1 * k * flicker : OFF);
        glows[i].scale.setScalar(on ? 0.3 + 0.35 * k : OFF);
      }
      glowMat.opacity = 0.6 * k;
      coreMat.opacity = Math.min(1, k * 1.5);
    },
    setLamps(on) {
      lamp.emissiveIntensity = on ? LAMP_ON : LAMP_OFF;
      ring.emissiveIntensity = on ? RING_ON : RING_OFF;
    },
    setDetail(near) {
      for (const f of fittings) f.visible = near;
    },
    setEnvMap(map, intensity) {
      for (const m of [metal, shell, ring]) { m.envMap = map; m.envMapIntensity = intensity; m.needsUpdate = true; }
    },
    dispose() {
      for (const g of assemblies) g.removeFromParent();
      for (const o of owned) o.dispose();
    },
  };
}
