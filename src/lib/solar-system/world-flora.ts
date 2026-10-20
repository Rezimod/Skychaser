// Life on Proxima b. Under a red dwarf a leaf that wants every photon is
// near black, so the canopy is dark — violet, wine, ink — and the colour
// is all in what the biosphere says to itself: lantern trees hang pods that
// glow in the tree's own colour, the reed fields carry light down their
// stems in slow pulses, fungi ring the lake in teal and gold, and spores
// drift lit through the twilight. The villagers' settlement sits by the
// water: grown pods with lit doorways, a stone that carries their script.
//
// Every kind is one instanced mesh, and the glow is per instance, so the
// whole biosphere costs a dozen draw calls.

import * as THREE from 'three';
import { fbm } from '@/lib/solar-system/moon-terrain';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import type { WorldTerrain } from '@/lib/solar-system/world-terrain';
import type { WorldProfile } from '@/lib/solar-system/world-profiles';

export interface Flora {
  group: THREE.Group;
  colliders: Collider[];
  pois: PointOfInterest[];
  /** Where the villagers live and wander: the pods and the council stone. */
  village: { x: number; z: number; r: number; stone: { x: number; z: number } };
  update: (dt: number, t: number) => void;
  dispose: () => void;
}

/** The palette the biosphere glows in: teal, magenta, amber, lime, violet, sky. */
const GLOW = [
  new THREE.Color(0.3, 2.4, 2.0), new THREE.Color(2.6, 0.5, 2.0), new THREE.Color(2.8, 1.6, 0.4),
  new THREE.Color(1.2, 2.6, 0.5), new THREE.Color(1.4, 0.8, 2.8), new THREE.Color(0.6, 1.6, 2.8),
];

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function glyphTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#100a16'; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = '#7ff5e0'; g.lineWidth = 5; g.lineCap = 'round';
  const rnd = seeded(91);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 32 + col * 56; const y = 40 + row * 50;
      g.beginPath();
      g.arc(x, y, 8 + rnd() * 10, rnd() * 6, rnd() * 6 + 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x - 14, y + 14); g.lineTo(x + rnd() * 20 - 4, y - rnd() * 18);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeFlora(profile: WorldProfile, terrain: WorldTerrain, lite: boolean): Flora {
  const group = new THREE.Group();
  group.name = 'flora';
  const colliders: Collider[] = [];
  const pois: PointOfInterest[] = [];
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const water = profile.ground.water!;
  const pad = profile.pad;
  const rnd = seeded(profile.ground.seed);
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0); const nrm = new THREE.Vector3();
  const heightAt = terrain.heightAt;
  const clear = (x: number, z: number, keepOut: number) =>
    Math.hypot(x - pad.x, z - pad.z) > keepOut && Math.hypot(x - water.x, z - water.z) > water.r * 0.95;

  // The settlement sits back from the shore: its outer pods reach the water, its stone does not.
  const village = { x: water.x - 62, z: water.z + 4, r: 22, stone: { x: water.x - 62, z: water.z + 4 } };

  // ── The pulse in every stem: a slow wave of light that runs up the plant. ──
  const clock = { value: 0 };
  const glowing = (base: THREE.MeshStandardMaterialParameters, sway: number) => {
    const mat = new THREE.MeshStandardMaterial({ ...base, emissive: 0xffffff, emissiveIntensity: 1 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = clock;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vH; varying vec3 vGlow;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vH = position.y;
          #ifdef USE_INSTANCING_COLOR
            vGlow = instanceColor.rgb;
          #else
            vGlow = vec3(1.0);
          #endif
          {
            vec3 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            float w = sin(uTime * 0.9 + wp.x * 0.3 + wp.z * 0.2) * ${sway.toFixed(3)} * position.y * position.y;
            transformed.x += w; transformed.z += w * 0.6;
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vH; varying vec3 vGlow;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float pulse = 0.55 + 0.45 * sin(uTime * 1.6 - vH * 2.2 + vGlow.r * 3.0);
          totalEmissiveRadiance = vGlow * pulse * ${(base.emissiveIntensity ?? 1).toFixed(2)};`);
    };
    // The sway and glow are baked into the shader text: each pair is its own program.
    mat.customProgramCacheKey = () => `flora-glow|${sway.toFixed(3)}|${(base.emissiveIntensity ?? 1).toFixed(2)}`;
    mats.push(mat);
    return mat;
  };
  const dark = (color: number, rough = 0.85) => { const mt = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 }); mats.push(mt); return mt; };

  const place = (
    geom: THREE.BufferGeometry, mat: THREE.Material, count: number, opts: {
      near?: { x: number; z: number; r: number; band?: number }; keepOut: number; scale: [number, number]; sink?: number;
      seat?: boolean; collide?: number; glow?: boolean; tilt?: number; shadow?: boolean;
    },
  ) => {
    geoms.push(geom);
    const im = new THREE.InstancedMesh(geom, mat, count);
    im.castShadow = opts.shadow !== false;
    im.receiveShadow = true;
    let k = 0;
    for (let i = 0; i < count * 8 && k < count; i++) {
      let x: number; let z: number;
      if (opts.near) {
        const a = rnd() * Math.PI * 2;
        const r = opts.near.band !== undefined ? opts.near.r + (rnd() - 0.5) * opts.near.band : rnd() * opts.near.r;
        x = opts.near.x + Math.cos(a) * r; z = opts.near.z + Math.sin(a) * r;
      } else {
        x = (rnd() - 0.5) * 320; z = (rnd() - 0.5) * 320;
      }
      if (!clear(x, z, opts.keepOut)) continue;
      if (Math.hypot(x - village.x, z - village.z) < village.r * 0.8 && !opts.near) continue;
      const density = fbm(x / 40, z / 40, 3, 88) + 0.35;
      if (!opts.near && rnd() > density) continue;
      const sc = opts.scale[0] + rnd() * (opts.scale[1] - opts.scale[0]);
      p.set(x, heightAt(x, z) - (opts.sink ?? 0) * sc, z);
      if (opts.seat) { terrain.normalAt(x, z, nrm); q.setFromUnitVectors(up, nrm); } else q.identity();
      const spin = new THREE.Quaternion().setFromAxisAngle(up, rnd() * Math.PI * 2);
      if (opts.tilt) spin.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * opts.tilt, 0, (rnd() - 0.5) * opts.tilt)));
      q.multiply(spin);
      s.set(sc * (0.85 + rnd() * 0.3), sc, sc * (0.85 + rnd() * 0.3));
      m.compose(p, q, s);
      im.setMatrixAt(k, m);
      if (opts.glow) im.setColorAt(k, GLOW[Math.floor(rnd() * GLOW.length)]);
      if (opts.collide) colliders.push({ x, z, r: opts.collide * sc });
      k += 1;
    }
    im.count = k;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };

  // ── Lantern trees: a dark bole, a flat ink canopy, and a ring of lit pods under it. ──
  {
    const trunk = new THREE.CylinderGeometry(0.22, 0.5, 7, 7);
    trunk.translate(0, 3.5, 0);
    const canopy = new THREE.IcosahedronGeometry(3.2, 1);
    canopy.scale(1, 0.42, 1);
    canopy.translate(0, 7.4, 0);
    const pods = new THREE.SphereGeometry(0.34, 7, 6);
    const podRing: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const g = pods.clone();
      g.translate(Math.cos(a) * 2.2, 6.2 - (i % 2) * 0.6, Math.sin(a) * 2.2);
      podRing.push(g);
    }
    pods.dispose();
    const n = lite ? 60 : 110;
    place(trunk, dark(0x241a2e, 0.9), n, { keepOut: 46, scale: [0.8, 1.7], collide: 0.5, tilt: 0.12 });
    // The same seeds again for the canopy and the pods, so they sit on the same trunks.
    const canopyMat = dark(0x1a1024, 0.95);
    const trunks = group.children[group.children.length - 1] as THREE.InstancedMesh;
    const canopies = new THREE.InstancedMesh(canopy, canopyMat, trunks.count);
    const podMat = glowing({ color: 0x1a1020, roughness: 0.4, emissiveIntensity: 2.2 }, 0.004);
    const podGeom = mergeRing(podRing);
    const lanterns = new THREE.InstancedMesh(podGeom, podMat, trunks.count);
    for (let i = 0; i < trunks.count; i++) {
      trunks.getMatrixAt(i, m);
      canopies.setMatrixAt(i, m);
      lanterns.setMatrixAt(i, m);
      lanterns.setColorAt(i, GLOW[i % GLOW.length]);
    }
    canopies.castShadow = true; canopies.receiveShadow = true;
    lanterns.castShadow = false;
    canopies.instanceMatrix.needsUpdate = true; lanterns.instanceMatrix.needsUpdate = true;
    if (lanterns.instanceColor) lanterns.instanceColor.needsUpdate = true;
    canopies.computeBoundingSphere(); lanterns.computeBoundingSphere();
    group.add(canopies, lanterns);
    geoms.push(canopy, podGeom);
  }

  // ── Reed fields: thin dark blades that carry light up the stem. ──
  {
    const blade = new THREE.ConeGeometry(0.09, 2.2, 5);
    blade.translate(0, 1.1, 0);
    place(blade, glowing({ color: 0x1c1428, roughness: 0.8, emissiveIntensity: 0.9 }, 0.02), lite ? 600 : 1400, {
      keepOut: 44, scale: [0.6, 1.6], glow: true, tilt: 0.25, shadow: false,
    });
  }
  // ── Fungi round the lake, and out under the trees. ──
  {
    const cap = new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.55, 1);
    cap.translate(0, 0.35, 0);
    const stem = new THREE.CylinderGeometry(0.12, 0.16, 0.4, 6);
    stem.translate(0, 0.2, 0);
    const fungus = mergeRing([cap, stem]);
    place(fungus, glowing({ color: 0x2a1c30, roughness: 0.5, emissiveIntensity: 1.8 }, 0), lite ? 160 : 320, {
      near: { x: water.x, z: water.z, r: water.r + 6, band: 14 }, keepOut: 20, scale: [0.5, 1.8], glow: true, seat: true,
    });
    place(fungus, glowing({ color: 0x2a1c30, roughness: 0.5, emissiveIntensity: 1.8 }, 0), lite ? 120 : 260, {
      keepOut: 44, scale: [0.4, 1.3], glow: true, seat: true,
    });
  }

  // ── The lake: still, dark, and lit from below by the plankton. ──
  {
    const geom = new THREE.CircleGeometry(water.r * 1.0, 48);
    geom.rotateX(-Math.PI / 2);
    geoms.push(geom);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x06121a, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.9,
      emissive: 0x0c3a36, emissiveIntensity: 0.35, clearcoat: 1, clearcoatRoughness: 0.08,
    });
    mats.push(mat);
    const lake = new THREE.Mesh(geom, mat);
    lake.position.set(water.x, water.level, water.z);
    lake.receiveShadow = true;
    group.add(lake);
    pois.push({ id: 'lake', x: water.x, z: water.z, r: water.r + 8 });
  }

  // ── Spores: a slow, lit drift over the fields. ──
  const sporeCount = lite ? 350 : 800;
  const sporePos = new Float32Array(sporeCount * 3);
  const sporeCol = new Float32Array(sporeCount * 3);
  const sporeSeed = new Float32Array(sporeCount);
  for (let i = 0; i < sporeCount; i++) {
    const x = (rnd() - 0.5) * 300; const z = (rnd() - 0.5) * 300;
    sporePos[i * 3] = x; sporePos[i * 3 + 1] = heightAt(x, z) + 0.5 + rnd() * 9; sporePos[i * 3 + 2] = z;
    const c = GLOW[Math.floor(rnd() * GLOW.length)];
    sporeCol[i * 3] = c.r * 0.5; sporeCol[i * 3 + 1] = c.g * 0.5; sporeCol[i * 3 + 2] = c.b * 0.5;
    sporeSeed[i] = rnd() * 6.28;
  }
  const sporeGeom = new THREE.BufferGeometry();
  sporeGeom.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
  sporeGeom.setAttribute('color', new THREE.BufferAttribute(sporeCol, 3));
  geoms.push(sporeGeom);
  sporeGeom.setAttribute('aSeed', new THREE.BufferAttribute(sporeSeed, 1));
  // The drift is a pure function of time and each spore's seed, so the GPU integrates it: nothing is uploaded after the build.
  const sporeMat = new THREE.PointsMaterial({ map: softSpriteTexture(), size: 0.22, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  sporeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.x += sin(uTime * 0.3 + aSeed) * 1.3;
        transformed.y += sin(uTime * 0.5 + aSeed * 1.3) * 0.5;
        transformed.z += sin(uTime * 0.27 + aSeed * 0.7) * 1.5;`);
  };
  sporeMat.customProgramCacheKey = () => 'proxima-spores';
  mats.push(sporeMat);
  const spores = new THREE.Points(sporeGeom, sporeMat);
  sporeGeom.computeBoundingSphere();
  sporeGeom.boundingSphere!.radius += 2;
  group.add(spores);

  // ── The settlement: grown pods with lit doors round the council stone. ──
  {
    const podGeom = new THREE.SphereGeometry(1, 16, 10);
    podGeom.scale(1, 0.8, 1);
    geoms.push(podGeom);
    const shell = new THREE.MeshPhysicalMaterial({ color: 0x3b2a4a, roughness: 0.35, metalness: 0.1, iridescence: 0.7, iridescenceIOR: 1.4, sheen: 0.6, sheenColor: new THREE.Color(0x9a6cff) });
    mats.push(shell);
    const doorMat = glowing({ color: 0x1a1020, roughness: 0.4, emissiveIntensity: 2.6 }, 0);
    const doorGeom = new THREE.PlaneGeometry(0.9, 1.7);
    geoms.push(doorGeom);
    const n = 7;
    const podsIm = new THREE.InstancedMesh(podGeom, shell, n);
    const doorsIm = new THREE.InstancedMesh(doorGeom, doorMat, n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const r = 11 + (i % 2) * 5;
      const x = village.x + Math.cos(a) * r; const z = village.z + Math.sin(a) * r;
      const sc = 2.6 + (i % 3) * 0.7;
      p.set(x, heightAt(x, z) + sc * 0.5, z);
      q.setFromAxisAngle(up, -a);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      podsIm.setMatrixAt(i, m);
      // The door faces the stone.
      const dx = village.x - x; const dz = village.z - z;
      const yaw = Math.atan2(dx, dz);
      p.set(x + Math.sin(yaw) * sc * 0.96, heightAt(x, z) + 1.0, z + Math.cos(yaw) * sc * 0.96);
      q.setFromAxisAngle(up, yaw);
      s.set(1, 1, 1);
      m.compose(p, q, s);
      doorsIm.setMatrixAt(i, m);
      doorsIm.setColorAt(i, GLOW[i % GLOW.length]);
      colliders.push({ x, z, r: sc * 0.95 });
    }
    podsIm.castShadow = true; podsIm.receiveShadow = true;
    doorsIm.castShadow = false;
    podsIm.instanceMatrix.needsUpdate = true; doorsIm.instanceMatrix.needsUpdate = true;
    if (doorsIm.instanceColor) doorsIm.instanceColor.needsUpdate = true;
    group.add(podsIm, doorsIm);
    // The council stone: a tall slab with their script lit into it.
    const slabGeom = new THREE.BoxGeometry(2.2, 4.4, 0.7);
    geoms.push(slabGeom);
    const glyph = glyphTexture();
    textures.push(glyph);
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.7, emissiveMap: glyph, emissive: 0x7ff5e0, emissiveIntensity: 1.4, map: glyph });
    mats.push(slabMat);
    const slab = new THREE.Mesh(slabGeom, slabMat);
    const sy = heightAt(village.stone.x, village.stone.z);
    slab.position.set(village.stone.x, sy + 2.0, village.stone.z);
    slab.rotation.y = 0.4;
    slab.castShadow = true;
    group.add(slab);
    colliders.push({ x: village.stone.x, z: village.stone.z, r: 1.5 });
    pois.push({ id: 'village', x: village.x, z: village.z, r: 20 });
    pois.push({ id: 'stone', x: village.stone.x, z: village.stone.z, r: 5 });
  }

  return {
    group, colliders, pois, village,
    update(_dt, t) {
      clock.value = t;
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const mt of mats) mt.dispose();
      for (const tx of textures) tx.dispose();
      for (const o of group.children) if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    },
  };
}

/** Fold a few small geometries into one, positions already placed. */
function mergeRing(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of parts) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3); const nor = new Float32Array(count * 3); const uv = new Float32Array(count * 2);
  const index: number[] = [];
  let off = 0;
  for (const g of parts) {
    const gp = g.attributes.position as THREE.BufferAttribute; const gn = g.attributes.normal as THREE.BufferAttribute; const gu = g.attributes.uv as THREE.BufferAttribute;
    pos.set(gp.array as Float32Array, off * 3); nor.set(gn.array as Float32Array, off * 3); uv.set(gu.array as Float32Array, off * 2);
    const idx = g.index!;
    for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + off);
    off += gp.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(index);
  return out;
}
