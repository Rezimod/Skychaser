// The Rike–Narikala cable car, on the line OpenStreetMap maps for it: from
// the lower station in Rike Park over the Mtkvari to the upper station under
// Narikala, pylons at the mapped bends, two cables, eight-seat cabins going
// up on one and down on the other. OSM gives the ride as three minutes; the
// cabins keep that pace. One cabin can carry the crew.

import * as THREE from 'three';
import { keep, mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import type { Pt } from '@/lib/solar-system/world-earth-data';
import { withHaze } from '@/lib/solar-system/world-earth-haze';

export const RIDE_SECONDS = 180;
const GAUGE = 2.6;

export interface CableCar {
  group: THREE.Group;
  length: number;
  /** Where the cable is at `s` metres from the bottom, on the up (+1) or down (−1) side. */
  pointAt: (s: number, side: number, out: THREE.Vector3) => THREE.Vector3;
  bottom: { x: number; z: number; y: number };
  top: { x: number; z: number; y: number };
  /** Metres a second along the line. */
  speed: number;
  /** The crew's cabin: set `rideS` ≥ 0 to show it there, −1 to park it. Returns the floor. */
  placeRide: (s: number, out: THREE.Vector3) => THREE.Vector3;
  update: (dt: number, cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export function makeCableCar(line: Pt[], heightAt: (x: number, z: number) => number, lite: boolean): CableCar | null {
  if (line.length < 2) return null;
  // Bottom first: the lower end.
  const pts = heightAt(line[0][0], line[0][1]) <= heightAt(line[line.length - 1][0], line[line.length - 1][1]) ? line : [...line].reverse();
  const group = new THREE.Group();
  group.name = 'cable-car';
  const geometries: THREE.BufferGeometry[] = [];
  const steel = withHaze(new THREE.MeshStandardMaterial({ color: srgb(0.62, 0.63, 0.65), roughness: 0.45, metalness: 0.8 }), 'cc-steel');
  const paint = withHaze(new THREE.MeshStandardMaterial({ color: srgb(0.85, 0.86, 0.84), roughness: 0.5, metalness: 0.2 }), 'cc-paint');
  const glass = withHaze(new THREE.MeshStandardMaterial({ color: srgb(0.4, 0.5, 0.55), roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.45 }), 'cc-glass');
  const cableMat = new THREE.LineBasicMaterial({ color: 0x2a2c30 });
  const materials: THREE.Material[] = [steel, paint, glass, cableMat];
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geometries.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true; o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // Heights at the mapped points: stations low, pylons tall enough to clear the ground between.
  const ground = pts.map(([x, z]) => heightAt(x, z));
  const support = pts.map((_, k) => ground[k] + (k === 0 || k === pts.length - 1 ? 7 : 24));
  const run: number[] = [0];
  for (let k = 1; k < pts.length; k++) run.push(run[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const length = run[run.length - 1];
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k + 1 < pts.length; k++) {
      const span = run[k + 1] - run[k];
      for (let s = 0; s <= span; s += 6) {
        const t = s / span;
        const [ax, az] = pts[k]; const [bx, bz] = pts[k + 1];
        const g = heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
        const sag = span * 0.03 * 4 * t * (1 - t);
        const y = support[k] + (support[k + 1] - support[k]) * t - sag;
        if (y < g + 12) {
          const need = g + 12 - y;
          if (k > 0) support[k] += need * (1 - t);
          if (k + 1 < pts.length - 1) support[k + 1] += need * t;
        }
      }
    }
  }
  const dirAt = (k: number) => {
    const a = pts[Math.max(0, k - 1)]; const b = pts[Math.min(pts.length - 1, k + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const pointAt = (s: number, side: number, out: THREE.Vector3) => {
    const d = Math.max(0, Math.min(length, s));
    let k = 0;
    while (k + 2 < pts.length && run[k + 1] < d) k++;
    const span = run[k + 1] - run[k];
    const t = (d - run[k]) / (span || 1);
    const [ax, az] = pts[k]; const [bx, bz] = pts[k + 1];
    const tx = (bx - ax) / (span || 1); const tz = (bz - az) / (span || 1);
    const sag = span * 0.03 * 4 * t * (1 - t);
    return out.set(ax + (bx - ax) * t - tz * GAUGE * side, support[k] + (support[k + 1] - support[k]) * t - sag, az + (bz - az) * t + tx * GAUGE * side);
  };

  // ── The cables: a line is a pixel wide at any range, so they go when the camera is far. ──
  const cables: THREE.Line[] = [];
  for (const side of [-1, 1]) {
    const cps: THREE.Vector3[] = [];
    for (let s = 0; s <= length; s += 4) cps.push(pointAt(s, side, new THREE.Vector3()));
    cps.push(pointAt(length, side, new THREE.Vector3()));
    const g = new THREE.BufferGeometry().setFromPoints(cps);
    geometries.push(g);
    const line = keep(new THREE.Line(g, cableMat));
    cables.push(line);
    group.add(line);
  }
  // ── Pylons and stations. ──
  for (let k = 0; k < pts.length; k++) {
    const [x, z] = pts[k];
    const [dx, dz] = dirAt(k);
    const yaw = Math.atan2(dx, dz);
    const station = k === 0 || k === pts.length - 1;
    const node = new THREE.Group();
    node.position.set(x, ground[k], z);
    node.rotation.y = yaw;
    if (station) {
      add(node, new THREE.BoxGeometry(12, 0.5, 20), paint, 0, support[k] - ground[k] + 2.5, 0);
      add(node, new THREE.CylinderGeometry(GAUGE + 0.3, GAUGE + 0.3, 0.6, 20), steel, 0, support[k] - ground[k] + 0.2, k === 0 ? -4 : 4);
      for (const sx of [-5, 5]) for (const sz of [-8, 8]) add(node, new THREE.BoxGeometry(0.5, support[k] - ground[k] + 2.5, 0.5), steel, sx, (support[k] - ground[k] + 2.5) / 2, sz);
    } else {
      const h = support[k] - ground[k];
      add(node, new THREE.CylinderGeometry(0.6, 1.1, h, 10), steel, 0, h / 2, 0);
      add(node, new THREE.BoxGeometry(GAUGE * 2 + 1.5, 0.7, 1), steel, 0, h + 0.2, 0);
    }
    group.add(node);
  }

  // ── Cabins. ──
  const cabinGeo = (parent: THREE.Object3D) => {
    add(parent, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), steel, 0, -1.3, 0);
    add(parent, new THREE.BoxGeometry(2.2, 0.25, 2.2), paint, 0, -4.7, 0);
    add(parent, new THREE.BoxGeometry(2.2, 0.35, 2.2), paint, 0, -2.5, 0);
    add(parent, new THREE.BoxGeometry(2.1, 1.9, 2.1), glass, 0, -3.6, 0).castShadow = false;
  };
  const spacing = lite ? 90 : 60;
  const cabins: { obj: THREE.Object3D; side: number; offset: number }[] = [];
  for (const side of [1, -1]) {
    for (let s = 0; s < length; s += spacing) {
      const c = pivot(new THREE.Group());
      cabinGeo(c);
      group.add(c);
      cabins.push({ obj: c, side, offset: s });
    }
  }
  const ride = pivot(new THREE.Group());
  cabinGeo(ride);
  ride.visible = false;
  group.add(ride);
  const merged = mergeStatic(group, { cell: 200, minCaster: 0.3 });

  const speed = length / RIDE_SECONDS;
  const bottomP = pointAt(0, 0, new THREE.Vector3());
  let phase = 0;
  const tmp = new THREE.Vector3(); const ahead = new THREE.Vector3();
  const place = (obj: THREE.Object3D, s: number, side: number) => {
    pointAt(s, side, tmp);
    pointAt(s + side * 2, side, ahead);
    obj.position.copy(tmp);
    obj.rotation.y = Math.atan2(ahead.x - tmp.x, ahead.z - tmp.z);
  };
  return {
    group, length, pointAt, speed,
    bottom: { x: pts[0][0], z: pts[0][1], y: ground[0] },
    top: { x: pts[pts.length - 1][0], z: pts[pts.length - 1][1], y: ground[pts.length - 1] },
    placeRide(s, out) {
      ride.visible = s >= 0;
      if (s < 0) return out.set(bottomP.x, bottomP.y, bottomP.z);
      place(ride, s, 1);
      return out.copy(ride.position).setY(ride.position.y - 4.6);
    },
    update(dt, cameraPos) {
      const near = Math.hypot(cameraPos.x - (pts[0][0] + pts[pts.length - 1][0]) / 2, cameraPos.z - (pts[0][1] + pts[pts.length - 1][1]) / 2) < length + 600;
      for (const c of cables) c.visible = near;
      phase = (phase + dt * speed) % (length * 2);
      for (const c of cabins) {
        // A loop: up one side, round the bullwheel, down the other.
        const u = (phase + c.offset + (c.side > 0 ? 0 : length)) % (length * 2);
        if (u < length) place(c.obj, u, 1); else place(c.obj, length * 2 - u, -1);
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const g of merged.geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
