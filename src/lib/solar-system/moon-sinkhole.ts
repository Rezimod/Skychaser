// Out past the comms mast the regolith has fallen into a lava tube. A ring of
// slumped ground, broken crust leaning in, and a black shaft that the Sun
// never reaches the bottom of. Stand near it and the radio picks up a hum it
// should not; step onto the edge and the ground goes.
//
// The fall is scripted and slow, because it is one-sixth g: the crust tips,
// the suit drops, turns over, hits the wall of the shaft, hits it again —
// the visor cracks on the second — and everything goes black.
//
// Also here: the maintenance hatch near the base that the crew climbs out of
// afterwards, and the warning beacon a side job leaves at the rim.

import * as THREE from 'three';
import type { Collider, CosmonautHandle } from '@/lib/solar-system/moon-cosmonaut';
import type { DustBurst, DustHandle } from '@/lib/solar-system/moon-fx';
import type { TerrainHandle } from '@/lib/solar-system/moon-terrain';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import type { CameraRig } from '@/lib/solar-system/moon-camera';
import { keep, mergeStatic } from '@/lib/solar-system/moon-batch';

export const SINKHOLE = { x: 94, z: -72, r: 3.4 };
export const HATCH = { x: 26, z: 39 };
/** Where the beacon job sends the crew: a safe step back from the rim, toward the base. */
export const BEACON = { x: SINKHOLE.x - 7.5, z: SINKHOLE.z + 5 };
/** The radio starts to hum within this, m. */
export const HINT_RANGE = 60;

export interface SinkholeHandle {
  group: THREE.Group;
  pois: PointOfInterest[];
  /** Keep the rover out of the hole; keep boots off the hatch. */
  roverColliders: Collider[];
  walkColliders: Collider[];
  /** Is a crew standing here on the edge that gives? */
  onEdge: (x: number, z: number) => boolean;
  setHatchOpen: (open: boolean) => void;
  setBeacon: (on: boolean) => void;
  update: (dt: number, t: number) => void;
  dispose: () => void;
}

export function makeSinkhole(terrain: TerrainHandle, lite: boolean): SinkholeHandle {
  const { x, z, r } = SINKHOLE;
  // The slump first, then the shaft through its floor.
  terrain.stampCrater(x, z, r * 3.2, 1.4);
  terrain.punch(x, z, r, 22);
  terrain.tint(x, z, r * 4, -0.1);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.4;
    const len = r * (1.4 + ((k * 37) % 10) / 10);
    terrain.tintPath([[x + Math.cos(a) * r * 1.1, z + Math.sin(a) * r * 1.1], [x + Math.cos(a + 0.12) * (r + len), z + Math.sin(a + 0.12) * (r + len)]], 0.35, -0.18);
  }

  const group = new THREE.Group();
  group.name = 'sinkhole';
  const geoms: THREE.BufferGeometry[] = [];
  const crust = new THREE.MeshStandardMaterial({ color: 0x8e8a83, roughness: 1, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9097, roughness: 0.5, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.6, metalness: 0.3 });
  const amber = new THREE.MeshStandardMaterial({ color: 0x2a1a06, emissive: new THREE.Color(0xffb347), emissiveIntensity: 0 });
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mats = [crust, steel, dark, amber, voidMat];
  const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
    geoms.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(px, py, pz);
    o.castShadow = m !== voidMat;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // The dark at the bottom, and crust slabs tipped in round the rim.
  const floor = terrain.heightAt(x, z);
  mesh(group, new THREE.CircleGeometry(r * 1.2, 20).rotateX(-Math.PI / 2), voidMat, x, floor + 0.5, z);
  const slabs = lite ? 9 : 14;
  for (let k = 0; k < slabs; k++) {
    const a = (k / slabs) * Math.PI * 2 + Math.sin(k * 2.3) * 0.2;
    const d = r + 0.2 + Math.abs(Math.sin(k * 5.1)) * 0.9;
    const sx = x + Math.cos(a) * d; const sz = z + Math.sin(a) * d;
    const w = 0.7 + Math.abs(Math.sin(k * 1.7)) * 1.1;
    const s = mesh(group, new THREE.BoxGeometry(w, 0.16, 0.9 + Math.abs(Math.cos(k * 3.1)) * 0.8), crust, sx, terrain.heightAt(sx, sz) - 0.05, sz);
    s.rotation.set(0, -a + Math.PI / 2, 0);
    s.rotateX(-0.35 - Math.abs(Math.sin(k * 7.7)) * 0.5);
  }
  for (let k = 0; k < (lite ? 10 : 20); k++) {
    const a = k * 2.399;
    const d = r * 1.3 + (k % 5) * 0.8;
    const rx = x + Math.cos(a) * d; const rz = z + Math.sin(a) * d;
    mesh(group, new THREE.DodecahedronGeometry(0.12 + (k % 4) * 0.08, 0), crust, rx, terrain.heightAt(rx, rz) + 0.05, rz).rotation.set(k, k * 1.3, 0);
  }

  // ── The hatch: a square steel frame flush in the regolith, a round lid on a hinge, a vent. ──
  const hatch = new THREE.Group();
  hatch.position.set(HATCH.x, terrain.heightAt(HATCH.x, HATCH.z), HATCH.z);
  hatch.rotation.y = Math.atan2(-HATCH.x, -HATCH.z);
  group.add(hatch);
  mesh(hatch, new THREE.BoxGeometry(1.8, 0.14, 1.8), steel, 0, 0.04, 0);
  mesh(hatch, new THREE.CylinderGeometry(0.6, 0.6, 0.02, 20), voidMat, 0, 0.12, 0);
  mesh(hatch, new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), dark, 0.75, 0.45, -0.75);
  mesh(hatch, new THREE.BoxGeometry(0.3, 0.12, 0.3), dark, 0.75, 0.94, -0.75);
  const lid = keep(new THREE.Group());
  lid.position.set(0, 0.13, -0.62);
  hatch.add(lid);
  mesh(lid, new THREE.CylinderGeometry(0.66, 0.66, 0.08, 22), steel, 0, 0.04, 0.62);
  mesh(lid, new THREE.BoxGeometry(0.5, 0.06, 0.08), dark, 0, 0.1, 0.62);

  // ── The beacon: a tripod and an amber lamp, only once somebody has put it there. ──
  const beacon = keep(new THREE.Group());
  beacon.position.set(BEACON.x, terrain.heightAt(BEACON.x, BEACON.z), BEACON.z);
  beacon.visible = false;
  group.add(beacon);
  for (let k = 0; k < 3; k++) {
    const leg = mesh(beacon, new THREE.CylinderGeometry(0.02, 0.025, 1.3, 6), steel, Math.sin(k * 2.09) * 0.25, 0.6, Math.cos(k * 2.09) * 0.25);
    leg.rotation.set(Math.cos(k * 2.09) * -0.35, 0, Math.sin(k * 2.09) * 0.35);
  }
  mesh(beacon, new THREE.SphereGeometry(0.11, 12, 8), amber, 0, 1.3, 0);

  const merged = mergeStatic(group, { minCaster: 0.2 });
  let hatchOpen = false;

  return {
    group,
    pois: [{ id: 'sinkhole', x, z, r: 16 }, { id: 'hatch', x: HATCH.x, z: HATCH.z, r: 5 }],
    roverColliders: [{ x, z, r: r + 2.4 }],
    walkColliders: [{ x: HATCH.x, z: HATCH.z, r: 0.5 }],
    onEdge: (px, pz) => Math.hypot(px - x, pz - z) < r + 0.9,
    setHatchOpen(open) { hatchOpen = open; },
    setBeacon(on) { beacon.visible = on; },
    update(dt, t) {
      lid.rotation.x += ((hatchOpen ? -1.9 : 0) - lid.rotation.x) * (1 - Math.exp(-dt * 2));
      amber.emissiveIntensity = beacon.visible ? (Math.sin(t * 4) > 0.2 ? 2.6 : 0.2) : 0;
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const g of merged.geometries) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

export interface FallHandle {
  active: boolean;
  done: boolean;
  t: number;
  /** 0…1 how black. */
  black: number;
  /** The visor has cracked. */
  crack: boolean;
  start: () => void;
  update: (dt: number) => void;
  reset: () => void;
}

export interface FallDeps {
  cosmonaut: CosmonautHandle;
  camera: THREE.PerspectiveCamera;
  cam: CameraRig;
  dust: DustHandle;
  /** A thump through the suit at this "distance" (smaller is louder). */
  thump: (distance: number) => void;
  g: number;
}

const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

export function makeFall(deps: FallDeps): FallHandle {
  const { cosmonaut, camera, cam, dust } = deps;
  const from = new THREE.Vector3();
  const drift = new THREE.Vector2();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const puff: DustBurst = { x: 0, y: 0, z: 0, count: 60, speedMin: 0.6, speedMax: 3, cone: 1.4, size: 0.16 };
  const events = [0, 1.25, 2.05];
  let fired = 0;
  const burst = (px: number, py: number, pz: number, count: number) => {
    puff.x = px; puff.y = py; puff.z = pz; puff.count = count;
    dust.burst(puff);
  };
  const fall: FallHandle = {
    active: false, done: false, t: 0, black: 0, crack: false,
    start() {
      fall.active = true; fall.done = false; fall.t = 0; fall.black = 0; fall.crack = false; fired = 0;
      from.copy(cosmonaut.position);
      drift.set(SINKHOLE.x - from.x, SINKHOLE.z - from.z);
      cosmonaut.hold(true);
      cosmonaut.velocity.set(0, 0, 0);
      cosmonaut.setHelmetView(false);
      cosmonaut.group.visible = true;
    },
    reset() { fall.active = false; fall.done = false; fall.t = 0; fall.black = 0; fall.crack = false; },
    update(dt) {
      if (!fall.active) return;
      fall.t += dt;
      const t = fall.t;
      while (fired < events.length && t >= events[fired]) {
        const p = cosmonaut.position;
        if (fired === 0) { burst(p.x, p.y, p.z, 90); deps.thump(8); cam.shake(0.6); }
        if (fired === 1) { burst(p.x, p.y, p.z, 50); deps.thump(0); cam.shake(1); }
        if (fired === 2) { deps.thump(2); cam.shake(0.8); fall.crack = true; }
        fired += 1;
      }
      // The crust tips for a quarter second, then it is ballistic in one-sixth g, drifting to the middle.
      const drop = Math.max(0, t - 0.25);
      const k = smooth(t / 1.6) * 0.85;
      cosmonaut.position.set(from.x + drift.x * k, from.y - 0.5 * deps.g * drop * drop - (t < 0.25 ? t * 0.4 : 0.1), from.z + drift.y * k);
      cosmonaut.velocity.set(0, 0, 0);
      cosmonaut.settle();
      // Turning over, knocked sideways by the first hit.
      cosmonaut.group.rotation.x = -t * 1.1 - (t > events[1] ? 0.9 : 0);
      cosmonaut.group.rotation.z = Math.sin(t * 1.7) * 0.5 + (t > events[1] ? 0.6 : 0);
      if (t < events[1]) {
        // From the rim, looking down at the suit going in.
        look.copy(cosmonaut.position);
        camera.position.set(from.x - drift.x * 0.25, from.y + 3.2, from.z - drift.y * 0.25);
        camera.lookAt(look);
      } else {
        // Then from inside the helmet, turning over.
        cosmonaut.setHelmetView(true);
        cosmonaut.eye(eye);
        camera.position.copy(eye);
        look.set(eye.x + Math.sin(t * 2.3), eye.y - 0.6 + Math.cos(t * 1.9) * 0.8, eye.z + Math.cos(t * 2.3));
        camera.lookAt(look);
        camera.rotateZ(t * 2.2);
      }
      fall.black = smooth((t - 2.35) / 0.55);
      if (t >= 3.1) { fall.done = true; fall.active = false; }
    },
  };
  return fall;
}
