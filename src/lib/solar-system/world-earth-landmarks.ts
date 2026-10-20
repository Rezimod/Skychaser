// The Tbilisi you would know from one photograph, modelled by hand but put
// where OpenStreetMap has them and at the heights on record: Narikala's
// walls along the ridge (every mapped wall, raised on the ground under it)
// and its towers; Kartlis Deda, twenty metres of aluminium with the bowl
// and the sword; Sameba on Elia hill, eighty-seven metres to the cross with
// the gold dome; the TV tower on Mtatsminda, 274.5 m; the 65 m wheel beside
// it; the Bridge of Peace's wave of a glass roof; Fuksas's two tubes in Rike
// Park; the brick domes of the Abanotubani baths; and carved wooden
// balconies on the Old Town's houses.
//
// Everything that moves (the wheel, its cabins) is a pivot before the merge.

import * as THREE from 'three';
import { keep, mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import {
  KIND, ROAD, centroid, insideRing, ringArea, type EarthData, type Pt,
} from '@/lib/solar-system/world-earth-data';
import { withHaze } from '@/lib/solar-system/world-earth-haze';

export interface Landmarks {
  group: THREE.Group;
  colliders: Collider[];
  pois: PointOfInterest[];
  /** Where each landmark stands, for bearings and tests: base height is the ground under it. */
  sites: Record<string, { x: number; z: number; base: number; top: number }>;
  update: (dt: number, night: number) => void;
  dispose: () => void;
}

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export function makeLandmarks(data: EarthData, heightAt: (x: number, z: number) => number, lite: boolean): Landmarks {
  const L = data.manifest.landmarks;
  const group = new THREE.Group();
  group.name = 'earth-landmarks';
  const colliders: Collider[] = [];
  const pois: PointOfInterest[] = [];
  const sites: Landmarks['sites'] = {};
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const seg = lite ? 16 : 28;
  const glow = { value: 0 };

  const mat = (key: string, p: THREE.MeshStandardMaterialParameters, lit = 0) => {
    const m = withHaze(new THREE.MeshStandardMaterial(p), `lm-${key}`, false, lit > 0 ? (shader) => {
      shader.uniforms.uGlowNight = glow;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlowNight;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.86, 0.66) * uGlowNight * ${lit.toFixed(3)};`);
    } : undefined);
    materials.push(m);
    return m;
  };
  const stone = mat('stone', { color: srgb(0.6, 0.53, 0.43), roughness: 0.95 }, 0.35);
  const stoneWall = mat('stoneWall', { color: srgb(0.6, 0.53, 0.43), roughness: 0.95, side: THREE.DoubleSide }, 0.35);
  const brick = mat('brick', { color: srgb(0.58, 0.38, 0.28), roughness: 0.9 }, 0.2);
  const sandstone = mat('sandstone', { color: srgb(0.8, 0.72, 0.58), roughness: 0.85 }, 0.55);
  const gold = mat('gold', { color: srgb(0.95, 0.74, 0.34), roughness: 0.28, metalness: 1 }, 0.6);
  const alu = mat('alu', { color: srgb(0.8, 0.81, 0.82), roughness: 0.35, metalness: 0.9 }, 0.9);
  const steelWhite = mat('steelWhite', { color: srgb(0.9, 0.9, 0.88), roughness: 0.45, metalness: 0.4 });
  const steelGrey = mat('steelGrey', { color: srgb(0.55, 0.56, 0.58), roughness: 0.5, metalness: 0.7 });
  // Clear glass: almost no body colour of its own, mostly the sky it reflects.
  const glass = mat('glass', { color: srgb(0.16, 0.2, 0.22), roughness: 0.04, metalness: 0.6, envMapIntensity: 1.4, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const tubeSkin = mat('tube', { color: srgb(0.74, 0.76, 0.78), roughness: 0.3, metalness: 0.75 });
  const blueTile = mat('blueTile', { color: srgb(0.2, 0.42, 0.62), roughness: 0.4 }, 0.3);
  const wood = mat('wood', { color: srgb(0.44, 0.3, 0.2), roughness: 0.85 });
  const woodLight = mat('woodLight', { color: srgb(0.62, 0.5, 0.36), roughness: 0.8 });
  const cabinRed = mat('cabinRed', { color: srgb(0.75, 0.2, 0.18), roughness: 0.5 });
  const redLamp = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  materials.push(redLamp);
  const textures: THREE.Texture[] = [];

  const add = <G extends THREE.BufferGeometry>(parent: THREE.Object3D, g: G, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geometries.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  /** A bar from a to b with a square section. */
  const bar = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, w: number, m: THREE.Material) => {
    const len = a.distanceTo(b);
    if (len < 1e-3) return null;
    const o = add(parent, new THREE.BoxGeometry(w, len, w), m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return o;
  };
  const faceToward = (from: Pt, to: Pt) => Math.atan2(to[0] - from[0], to[1] - from[1]);
  const oldTown: Pt = [0, 350];

  // ── Narikala: every mapped wall on the ground under it. ──
  if (L.narikalaWalls.length) {
    const walls = new THREE.Group();
    walls.name = 'narikala';
    const pos: number[] = []; const idx: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
      const s = pos.length / 3;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    };
    const v = () => new THREE.Vector3();
    const [a0, a1, b0, b1, c0, c1, d0, d1] = [v(), v(), v(), v(), v(), v(), v(), v()];
    let wx = 0; let wz = 0; let wn = 0;
    for (const w of L.narikalaWalls) {
      const pts = w.pts;
      const H = 9; const T = 1.1;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, az] = pts[k]; const [bx, bz] = pts[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.3) continue;
        const nx = -(bz - az) / len * T; const nz = (bx - ax) / len * T;
        const ya = heightAt(ax, az); const yb = heightAt(bx, bz);
        a0.set(ax + nx, ya - 3, az + nz); a1.set(ax + nx, ya + H, az + nz);
        b0.set(bx + nx, yb - 3, bz + nz); b1.set(bx + nx, yb + H, bz + nz);
        c0.set(ax - nx, ya - 3, az - nz); c1.set(ax - nx, ya + H, az - nz);
        d0.set(bx - nx, yb - 3, bz - nz); d1.set(bx - nx, yb + H, bz - nz);
        quad(a0, b0, b1, a1); quad(c0, d0, d1, c1); quad(a1, b1, d1, c1);
        // Merlons along the top.
        for (let s = 1.2; s < len - 0.6; s += 2.6) {
          const t = s / len;
          const x = ax + (bx - ax) * t; const z = az + (bz - az) * t;
          const merlon = add(walls, new THREE.BoxGeometry(1.3, 1.4, T * 2), stone, x, ya + (yb - ya) * t + H + 0.7, z);
          merlon.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
          merlon.castShadow = false;
        }
        if (k % 3 === 0) colliders.push({ x: (ax + bx) / 2, z: (az + bz) / 2, r: Math.min(3, len / 2) });
        wx += ax; wz += az; wn += 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    add(walls, g, stoneWall);
    for (const [x, z] of L.narikalaTowers) {
      const y = heightAt(x, z);
      add(walls, new THREE.CylinderGeometry(4.6, 5.4, 16, seg), stone, x, y + 6, z);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        add(walls, new THREE.BoxGeometry(1.4, 1.5, 1.2), stone, x + Math.cos(a) * 4.4, y + 14.7, z + Math.sin(a) * 4.4).rotation.y = -a;
      }
      colliders.push({ x, z, r: 5.4 });
    }
    group.add(walls);
    if (wn) {
      const cx = wx / wn; const cz = wz / wn;
      sites.narikala = { x: cx, z: cz, base: heightAt(cx, cz), top: heightAt(cx, cz) + 9 };
      pois.push({ id: 'narikala', x: cx, z: cz, r: 90 });
    }
  }

  // ── Kartlis Deda. ──
  if (L.kartlisDeda) {
    const [x, z] = L.kartlisDeda.at;
    let y = Infinity;
    for (const [px, pz] of L.kartlisDeda.outline) y = Math.min(y, heightAt(px, pz));
    const H = L.kartlisDeda.height;
    const kd = new THREE.Group();
    kd.position.set(x, y, z);
    // She looks out over the Old Town and the river.
    kd.rotation.y = faceToward([x, z], oldTown);
    add(kd, new THREE.BoxGeometry(6.4, 1.2, 5.2), stone, 0, 0.6, 0);
    add(kd, new THREE.BoxGeometry(4.2, 1.4, 3.6), stone, 0, 1.9, 0);
    const s = (H - 2.6) / 17.4;
    const body = new THREE.Group();
    body.position.y = 2.6;
    body.scale.setScalar(s);
    kd.add(body);
    add(body, new THREE.LatheGeometry([[0, 0], [1.55, 0], [1.4, 3], [1.05, 7], [0.78, 9.6], [0.72, 10.6], [0.9, 12.2], [0.88, 13.2], [0.5, 14], [0, 14.1]].map(([r, h]) => new THREE.Vector2(r, h)), seg), alu);
    add(body, new THREE.SphereGeometry(0.62, seg, seg / 2), alu, 0, 14.75, 0.05);
    add(body, new THREE.CylinderGeometry(0.28, 0.34, 0.6, 10), alu, 0, 14.05, 0);
    // Left arm forward with the bowl of wine for friends.
    const la = new THREE.Group(); la.position.set(0.95, 12.6, 0); body.add(la);
    bar(la, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, -1.3, 1.0), 0.42, alu);
    bar(la, new THREE.Vector3(0.5, -1.3, 1.0), new THREE.Vector3(0.6, -0.9, 2.5), 0.36, alu);
    add(la, new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), alu, 0.62, -0.62, 2.75);
    // Right arm down with the sword for enemies.
    const ra = new THREE.Group(); ra.position.set(-0.95, 12.6, 0); body.add(ra);
    bar(ra, new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.45, -2.2, 0.35), 0.42, alu);
    bar(ra, new THREE.Vector3(-0.45, -2.2, 0.35), new THREE.Vector3(-0.55, -4.2, 0.9), 0.36, alu);
    bar(ra, new THREE.Vector3(-0.6, -4.3, 0.95), new THREE.Vector3(-0.72, -9.3, 2.3), 0.16, alu);
    bar(ra, new THREE.Vector3(-1.1, -4.4, 0.85), new THREE.Vector3(-0.05, -4.2, 1.05), 0.14, alu);
    group.add(kd);
    colliders.push({ x, z, r: 3.6 });
    sites.kartlisDeda = { x, z, base: y, top: y + H };
    pois.push({ id: 'kartlisDeda', x, z, r: 30 });
  }

  // ── Sameba: a Georgian cross-dome, 70.45 × 64.68 m in plan and 86.1 m to
  // the top of its 7.5 m gilded cross, on a stepped stone podium. The four
  // arms end in tall gables with arched windows, the altar end in an apse,
  // and over the crossing a square base, a twelve-sided drum of arched
  // windows, and the gold dome. ──
  if (L.sameba.outline) {
    const out = L.sameba.outline;
    const [cx, cz] = centroid(out);
    let y = Infinity;
    for (const [px, pz] of out) y = Math.min(y, heightAt(px, pz));
    const H = L.sameba.height;
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    let lx = 1; let lz = 0; let best = 0;
    for (let k = 0; k < out.length; k++) {
      const [ax, az] = out[k]; const [bx, bz] = out[(k + 1) % out.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len > best) { best = len; lx = (bx - ax) / len; lz = (bz - az) / len; }
    }
    g.rotation.y = Math.atan2(lx, lz);
    // In the church's own frame: the long arm along z (70.45 m), the transept along x (64.68 m).
    const LEN = 70.45; const WID = 64.68; const ARM = 24; const EAVES = 30;
    const darkWin = mat('samebaWindow', { color: srgb(0.07, 0.08, 0.1), roughness: 0.2, metalness: 0.6 });
    const roofLead = mat('samebaRoof', { color: srgb(0.42, 0.45, 0.43), roughness: 0.55, metalness: 0.5 });
    add(g, new THREE.BoxGeometry(WID + 12, 2.4, LEN + 12), stone, 0, 1.2, 0);
    add(g, new THREE.BoxGeometry(WID + 6, 1.6, LEN + 6), stone, 0, 3.2, 0);
    const base = 4;
    add(g, new THREE.BoxGeometry(ARM, EAVES, LEN - 12), sandstone, 0, base + EAVES / 2, 0);
    add(g, new THREE.BoxGeometry(WID, EAVES, ARM), sandstone, 0, base + EAVES / 2, 0);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      add(g, new THREE.BoxGeometry((WID - ARM) / 2 - 4, EAVES * 0.72, (LEN - ARM) / 2 - 8), sandstone, sx * (ARM / 2 + (WID - ARM) / 4 - 2), base + EAVES * 0.36, sz * (ARM / 2 + (LEN - ARM) / 4 - 4));
    }
    // The apse at the altar end, and its half-dome.
    add(g, new THREE.CylinderGeometry(ARM / 2, ARM / 2, EAVES * 0.85, seg, 1, false, -Math.PI / 2, Math.PI), sandstone, 0, base + EAVES * 0.425, (LEN - 12) / 2);
    add(g, new THREE.SphereGeometry(ARM / 2, seg, seg / 2, -Math.PI / 2, Math.PI, 0, Math.PI / 2), roofLead, 0, base + EAVES * 0.85, (LEN - 12) / 2);
    // Gabled roofs over the arms: a ridge along each, the gables at the ends.
    const gable = (length: number, width: number, rise: number) => {
      const shape = new THREE.Shape([new THREE.Vector2(-width / 2 - 0.6, 0), new THREE.Vector2(width / 2 + 0.6, 0), new THREE.Vector2(0, rise)]);
      return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false }).translate(0, 0, -length / 2);
    };
    add(g, gable(LEN - 12, ARM, 7), roofLead, 0, base + EAVES, 0);
    add(g, gable(WID, ARM, 7), roofLead, 0, base + EAVES, 0).rotation.y = Math.PI / 2;
    // Tall arched windows on every gable end and along the arms.
    const archWindow = (w: number, h: number) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2);
      s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
      s.lineTo(-w / 2, 0);
      return new THREE.ShapeGeometry(s, 6);
    };
    const windowOn = (px: number, py: number, pz: number, ry: number, w: number, h: number) => {
      const o = add(g, archWindow(w, h), darkWin, px, py, pz);
      o.rotation.y = ry;
      o.castShadow = false;
    };
    for (const k of [-1, 0, 1]) {
      windowOn(k * 6, base + 8, -(LEN - 12) / 2 - 0.05, Math.PI, 2.6, 14);
      windowOn(-WID / 2 - 0.05, base + 8, k * 6, -Math.PI / 2, 2.6, 14);
      windowOn(WID / 2 + 0.05, base + 8, k * 6, Math.PI / 2, 2.6, 14);
    }
    windowOn(0, base + EAVES + 1.5, -(LEN - 12) / 2 - 0.05, Math.PI, 1.6, 4);
    // Over the crossing: the square base, the drum, the dome, the cross.
    const drumBase = base + EAVES + 4;
    add(g, new THREE.BoxGeometry(22, 8, 22), sandstone, 0, drumBase - 1, 0);
    const drumR = 9.2; const drumH = 22;
    add(g, new THREE.CylinderGeometry(drumR, drumR, drumH, 12), sandstone, 0, drumBase + 3 + drumH / 2, 0);
    for (let k = 0; k < 12; k++) {
      const a = ((k + 0.5) / 12) * Math.PI * 2;
      windowOn(Math.sin(a) * (drumR + 0.05), drumBase + 7, Math.cos(a) * (drumR + 0.05), a, 1.8, 11);
      add(g, new THREE.BoxGeometry(0.9, drumH, 0.6), stone, Math.sin((k / 12) * Math.PI * 2) * drumR, drumBase + 3 + drumH / 2, Math.cos((k / 12) * Math.PI * 2) * drumR).rotation.y = (k / 12) * Math.PI * 2;
    }
    add(g, new THREE.CylinderGeometry(drumR + 0.8, drumR + 0.8, 1.2, 12), stone, 0, drumBase + 3 + drumH, 0);
    const domeFoot = drumBase + 3 + drumH + 0.6;
    const crossFoot = H - 7.5 - 1.5;
    const domeH = crossFoot - domeFoot;
    // The dome's profile: a gilded, gently pointed helmet.
    const prof: [number, number][] = [[drumR + 0.6, 0], [drumR + 0.4, domeH * 0.18], [drumR * 0.92, domeH * 0.4], [drumR * 0.7, domeH * 0.62], [drumR * 0.4, domeH * 0.82], [drumR * 0.14, domeH * 0.96], [0, domeH]];
    add(g, new THREE.LatheGeometry(prof.map(([r, hh]) => new THREE.Vector2(r, hh)), seg + 8), gold, 0, domeFoot, 0);
    add(g, new THREE.CylinderGeometry(0.7, 1.1, 1.5, 12), gold, 0, crossFoot + 0.75, 0);
    add(g, new THREE.BoxGeometry(0.55, 7.5, 0.55), gold, 0, H - 3.75, 0);
    add(g, new THREE.BoxGeometry(4, 0.55, 0.55), gold, 0, H - 2.3, 0);
    add(g, new THREE.BoxGeometry(2.4, 0.4, 0.4), gold, 0, H - 4.6, 0).rotation.z = -0.3;
    group.add(g);
    colliders.push({ x: cx, z: cz, r: Math.max(LEN, WID) * 0.5 });
    sites.sameba = { x: cx, z: cz, base: y, top: y + H };
    pois.push({ id: 'sameba', x: cx, z: cz, r: LEN * 0.5 + 40 });
  }

  // ── The TV tower on Mtatsminda, 274.5 m: a Soviet steel lattice on a
  // tripod base. Three legs splay out over the plateau and draw in to a
  // slender lattice shaft; two enclosed equipment platforms; above them the
  // antenna mast in aviation red and white. After dark its frame is lit in
  // slowly changing colour, as the city knows it. ──
  let tvLamps: THREE.Mesh | null = null;
  let tvGlow: THREE.MeshStandardMaterial | null = null;
  if (L.tvTower.at) {
    const [x, z] = L.tvTower.at;
    const y = heightAt(x, z);
    const H = L.tvTower.height;
    const tw = new THREE.Group();
    tw.position.set(x, y, z);
    tvGlow = new THREE.MeshStandardMaterial({ color: srgb(0.62, 0.64, 0.66), roughness: 0.45, metalness: 0.7, emissive: new THREE.Color(0, 0, 0) });
    withHaze(tvGlow, 'tv-lattice');
    materials.push(tvGlow);
    const red = mat('tvRed', { color: srgb(0.78, 0.12, 0.1), roughness: 0.55, metalness: 0.3 });
    const LEGS = 3;
    const SHAFT = H * 0.64;
    const radius = (h: number) => {
      // Legs curve in from 26 m to 4 m over the first third, then the shaft tapers to 2.2 m.
      const k = h / (SHAFT * 0.38);
      return k < 1 ? 4 + 22 * Math.pow(1 - k, 1.8) : 4 - 1.8 * ((h - SHAFT * 0.38) / (SHAFT * 0.62));
    };
    const corner = (k: number, h: number) => { const a = (k / LEGS) * Math.PI * 2 + Math.PI / 6; const r = radius(h); return new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r); };
    const panels = lite ? 16 : 30;
    for (let l = 0; l < panels; l++) {
      const h0 = (l / panels) * SHAFT; const h1 = ((l + 1) / panels) * SHAFT;
      for (let k = 0; k < LEGS; k++) {
        const a0 = corner(k, h0); const a1 = corner(k, h1);
        const b0 = corner((k + 1) % LEGS, h0); const b1 = corner((k + 1) % LEGS, h1);
        bar(tw, a0, a1, l < panels * 0.4 ? 1.1 : 0.7, tvGlow);
        bar(tw, a1, b1, 0.35, tvGlow);
        // X-bracing on every face.
        bar(tw, a0, b1, 0.25, tvGlow);
        bar(tw, b0, a1, 0.25, tvGlow);
      }
    }
    // Two enclosed platforms: six-sided cabins with a gallery rail.
    for (const [ph, r, hh] of [[0.36, 9, 7], [0.58, 7, 5.5]] as const) {
      const py = SHAFT * ph;
      add(tw, new THREE.CylinderGeometry(r, r, hh, 6), steelWhite, 0, py + hh / 2, 0);
      add(tw, new THREE.CylinderGeometry(r + 1.2, r + 1.2, 0.5, 6), steelGrey, 0, py, 0);
      add(tw, new THREE.CylinderGeometry(r + 0.05, r + 0.05, hh * 0.35, 6, 1, true), mat('tvCabinGlass', { color: srgb(0.1, 0.12, 0.14), roughness: 0.1, metalness: 0.6 }), 0, py + hh * 0.6, 0);
    }
    // The mast: segments of red and white, narrowing to the tip.
    const mastH = H - SHAFT;
    const seg8 = 10;
    for (let s = 0; s < seg8; s++) {
      const h0 = SHAFT + (s / seg8) * mastH;
      const r0 = 1.8 - (s / seg8) * 1.4; const r1 = 1.8 - ((s + 1) / seg8) * 1.4;
      add(tw, new THREE.CylinderGeometry(r1, r0, mastH / seg8, 8), s % 2 ? steelWhite : red, 0, h0 + mastH / seg8 / 2, 0);
    }
    tvLamps = keep(add(tw, new THREE.SphereGeometry(0.9, 8, 6), redLamp, 0, H + 0.4, 0));
    tvLamps.castShadow = false;
    group.add(tw);
    sites.tvTower = { x, z, base: y, top: y + H };
  }

  // ── The wheel beside it. ──
  let rotor: THREE.Group | null = null;
  const cabins: THREE.Object3D[] = [];
  if (L.ferrisWheel) {
    const [x, z] = L.ferrisWheel.at;
    const y = heightAt(x, z);
    // OSM has no height here; the park gives 65 m.
    const H = L.ferrisWheel.height ?? 65;
    const R = H / 2 - 3;
    const wh = new THREE.Group();
    wh.position.set(x, y, z);
    wh.rotation.y = faceToward([x, z], oldTown) + Math.PI / 2;
    for (const s of [-1, 1]) {
      bar(wh, new THREE.Vector3(-14, 0, s * 5), new THREE.Vector3(0, R + 3, s * 1.6), 1.1, steelWhite);
      bar(wh, new THREE.Vector3(14, 0, s * 5), new THREE.Vector3(0, R + 3, s * 1.6), 1.1, steelWhite);
    }
    rotor = pivot(new THREE.Group());
    rotor.position.y = R + 3;
    wh.add(rotor);
    for (const s of [-1, 1]) add(rotor, new THREE.TorusGeometry(R, 0.45, 6, lite ? 48 : 80), steelWhite, 0, 0, s * 1.4);
    const n = lite ? 16 : 30;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      bar(rotor, new THREE.Vector3(0, 0, 1.4), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 1.4), 0.18, steelGrey);
      bar(rotor, new THREE.Vector3(0, 0, -1.4), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, -1.4), 0.18, steelGrey);
      const cab = pivot(new THREE.Group());
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      rotor.add(cab);
      add(cab, new THREE.BoxGeometry(2.2, 2.4, 2.0), k % 3 ? steelWhite : cabinRed, 0, -1.6, 0).castShadow = false;
      cabins.push(cab);
    }
    add(rotor, new THREE.CylinderGeometry(1.4, 1.4, 4, 12), steelGrey, 0, 0, 0).rotation.x = Math.PI / 2;
    group.add(wh);
    sites.ferrisWheel = { x, z, base: y, top: y + H };
  }

  // ── The Bridge of Peace: 150 m of footbridge under a bow-shaped roof of
  // triangular glass panes in a tubular steel lattice, over a steel box deck
  // with glass balustrades, carried on low steel arches. At night thousands
  // of LEDs in the roof's nodes spell their patterns. ──
  const deck = L.bridgeOfPeace.deck;
  let bridgeLeds: THREE.ShaderMaterial | null = null;
  if (deck && deck.length >= 2) {
    const br = new THREE.Group();
    br.name = 'bridge-of-peace';
    let total = 0;
    for (let k = 0; k + 1 < deck.length; k++) total += Math.hypot(deck[k + 1][0] - deck[k][0], deck[k + 1][1] - deck[k][1]);
    const y0 = heightAt(deck[0][0], deck[0][1]) + 0.2; const y1 = heightAt(deck[deck.length - 1][0], deck[deck.length - 1][1]) + 0.2;
    const at = (s: number) => {
      let run = 0;
      for (let k = 0; k + 1 < deck.length; k++) {
        const l = Math.hypot(deck[k + 1][0] - deck[k][0], deck[k + 1][1] - deck[k][1]);
        if (run + l >= s || k === deck.length - 2) {
          const t = Math.min(1, (s - run) / (l || 1));
          return new THREE.Vector3(deck[k][0] + (deck[k + 1][0] - deck[k][0]) * t, 0, deck[k][1] + (deck[k + 1][1] - deck[k][1]) * t);
        }
        run += l;
      }
      return new THREE.Vector3(deck[0][0], 0, deck[0][1]);
    };
    const frameAt = (s: number) => {
      const p = at(s);
      const dir = at(Math.min(total, s + 1)).sub(at(Math.max(0, s - 1))).setY(0).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const deckY = y0 + ((y1 - y0) * s) / total;
      return { p, side, deckY };
    };
    const HALF = 4.6;
    const U = lite ? 26 : 44; const V = lite ? 6 : 8;
    // The roof's surface: an arch across the deck whose height swells and
    // falls along the span, low at both banks, highest past the middle.
    const roofPoint = (u: number, v: number, out: THREE.Vector3) => {
      const s = u * total;
      const { p, side, deckY } = frameAt(s);
      const swell = Math.pow(Math.sin(Math.PI * u), 0.9) * (0.75 + 0.25 * Math.sin(Math.PI * (u * 1.3 - 0.15)));
      const rise = 2.4 + 5.2 * swell;
      const a = v * Math.PI;
      const w = HALF * (1 + 0.12 * swell) * Math.cos(a);
      return out.set(p.x + side.x * w, deckY + 1.1 + rise * Math.pow(Math.sin(a), 0.8), p.z + side.z * w);
    };
    const nodes: THREE.Vector3[][] = [];
    for (let i = 0; i <= U; i++) {
      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= V; j++) row.push(roofPoint(i / U, j / V, new THREE.Vector3()));
      nodes.push(row);
    }
    // Glass in triangles, the steel along their edges.
    const glassPos: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => glassPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
      const a = nodes[i][j]; const b = nodes[i + 1][j]; const c = nodes[i][j + 1]; const d = nodes[i + 1][j + 1];
      if ((i + j) % 2) { tri(a, b, d); tri(a, d, c); bar(br, a, d, 0.16, steelWhite); }
      else { tri(a, b, c); tri(b, d, c); bar(br, b, c, 0.16, steelWhite); }
      bar(br, a, b, 0.2, steelWhite);
      bar(br, a, c, 0.14, steelWhite);
    }
    for (let j = 0; j < V; j++) bar(br, nodes[U][j], nodes[U][j + 1], 0.14, steelWhite);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glassPos, 3));
    gg.computeVertexNormals();
    const glassMesh = add(br, gg, glass);
    glassMesh.castShadow = false;
    keep(glassMesh);
    // The deck: a steel box with a fascia, glass balustrades, a handrail, and the arches under it.
    const deckSteps = Math.max(8, Math.round(total / 6));
    // The walking surface: a strip between the balustrades.
    const floor: number[] = [];
    for (let i = 0; i < deckSteps; i++) {
      const A = frameAt((i / deckSteps) * total); const B = frameAt(((i + 1) / deckSteps) * total);
      const al = A.p.clone().addScaledVector(A.side, -HALF).setY(A.deckY); const ar = A.p.clone().addScaledVector(A.side, HALF).setY(A.deckY);
      const bl = B.p.clone().addScaledVector(B.side, -HALF).setY(B.deckY); const brr = B.p.clone().addScaledVector(B.side, HALF).setY(B.deckY);
      floor.push(al.x, al.y, al.z, bl.x, bl.y, bl.z, ar.x, ar.y, ar.z, ar.x, ar.y, ar.z, bl.x, bl.y, bl.z, brr.x, brr.y, brr.z);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(floor, 3));
    fg.computeVertexNormals();
    add(br, fg, mat('bridgeDeck', { color: srgb(0.46, 0.44, 0.42), roughness: 0.8, side: THREE.DoubleSide })).castShadow = false;
    for (let i = 0; i < deckSteps; i++) {
      const A = frameAt((i / deckSteps) * total); const B = frameAt(((i + 1) / deckSteps) * total);
      for (const sgn of [-1, 1]) {
        const a = A.p.clone().addScaledVector(A.side, HALF * sgn).setY(A.deckY);
        const b = B.p.clone().addScaledVector(B.side, HALF * sgn).setY(B.deckY);
        bar(br, a.clone().setY(a.y - 0.6), b.clone().setY(b.y - 0.6), 0.9, steelWhite);
        bar(br, a.clone().setY(a.y + 1.1), b.clone().setY(b.y + 1.1), 0.08, steelGrey);
        const pane = add(br, new THREE.PlaneGeometry(a.distanceTo(b), 1.0), glass, (a.x + b.x) / 2, (a.y + b.y) / 2 + 0.55, (a.z + b.z) / 2);
        pane.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
        pane.castShadow = false;
        keep(pane);
        if (i % 2 === 0) bar(br, a.clone().setY(a.y - 0.1), a.clone().setY(a.y + 1.1), 0.1, steelGrey);
      }
    }
    for (const sgn of [-1, 1]) {
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const f = frameAt(u * total);
        const cur = f.p.clone().addScaledVector(f.side, (HALF - 0.8) * sgn).setY(f.deckY - 1.2 - 5 * (1 - Math.sin(Math.PI * u)));
        if (prev) bar(br, prev, cur, 0.7, steelWhite);
        prev = cur;
      }
    }
    // LEDs: a point at every node of the roof, lit after dark and twinkling in their rows.
    const ledPos: number[] = []; const ledSeed: number[] = [];
    for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) { ledPos.push(nodes[i][j].x, nodes[i][j].y + 0.12, nodes[i][j].z); ledSeed.push(i * 0.37 + j * 1.3); }
    const ledGeom = new THREE.BufferGeometry();
    ledGeom.setAttribute('position', new THREE.Float32BufferAttribute(ledPos, 3));
    ledGeom.setAttribute('aSeed', new THREE.Float32BufferAttribute(ledSeed, 1));
    geometries.push(ledGeom);
    bridgeLeds = new THREE.ShaderMaterial({
      uniforms: { uNight: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `attribute float aSeed; uniform float uNight; uniform float uTime; varying float vOn;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Rows of light running along the span, like a message passing over.
          float wave = step(0.55, fract(aSeed * 0.21 - uTime * 0.35)) * step(0.3, fract(sin(aSeed * 12.9) * 43758.5));
          vOn = uNight * (0.25 + 0.75 * wave);
          gl_PointSize = clamp(260.0 / max(-mv.z, 1.0), 1.0, 6.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vOn; void main() { vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 14.0) * vOn; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * a * 2.4, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    materials.push(bridgeLeds);
    const leds = new THREE.Points(ledGeom, bridgeLeds);
    leds.frustumCulled = false;
    br.add(keep(leds));
    group.add(br);
    const mid = frameAt(total / 2);
    sites.bridgeOfPeace = { x: mid.p.x, z: mid.p.z, base: (y0 + y1) / 2, top: (y0 + y1) / 2 + 8 };
    sites.bridgeWest = deck[0][0] < deck[deck.length - 1][0] ? { x: deck[0][0], z: deck[0][1], base: y0, top: y0 } : { x: deck[deck.length - 1][0], z: deck[deck.length - 1][1], base: y1, top: y1 };
    pois.push({ id: 'bridgeOfPeace', x: mid.p.x, z: mid.p.z, r: 80 });
  }

  // ── Rike Park's two tubes, along the long axis of their footprint. ──
  if (L.rikeTubes) {
    const out = L.rikeTubes.outline;
    const [cx, cz] = centroid(out);
    let sxx = 0; let szz = 0; let sxz = 0;
    for (const [x, z] of out) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const ux = Math.cos(ang); const uz = Math.sin(ang);
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
    for (const [x, z] of out) {
      const u = (x - cx) * ux + (z - cz) * uz; const v = -(x - cx) * uz + (z - cz) * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const len = maxU - minU; const wid = maxV - minV;
    const tubes = new THREE.Group();
    for (const [side, scale, lift] of [[-0.25, 0.9, 0], [0.25, 1, 5]] as const) {
      const r = (wid / 4) * scale;
      const along = (s: number) => [cx + ux * (minU + len * s) - uz * (minV + wid * (0.5 + side)), cz + uz * (minU + len * s) + ux * (minV + wid * (0.5 + side))] as Pt;
      const a = along(0.04); const b = along(0.96);
      const ya = heightAt(a[0], a[1]); const yb = heightAt(b[0], b[1]);
      const p0 = new THREE.Vector3(a[0], Math.min(ya, yb) + r * 0.75, a[1]);
      const p1 = new THREE.Vector3(b[0], Math.max(ya, yb) + r * 0.75 + lift, b[1]);
      const curve = new THREE.CatmullRomCurve3([p0, p0.clone().lerp(p1, 0.5).add(new THREE.Vector3(0, r * 0.2, 0)), p1]);
      const geom = new THREE.TubeGeometry(curve, lite ? 12 : 24, r, seg, false);
      // Flared ends.
      const pp = geom.attributes.position as THREE.BufferAttribute;
      const tmp = new THREE.Vector3(); const ctr = new THREE.Vector3();
      for (let k = 0; k < pp.count; k++) {
        const ring = Math.floor(k / (seg + 1)) / (lite ? 12 : 24);
        const flare = 1 + 0.35 * Math.pow(Math.abs(ring - 0.5) * 2, 3);
        curve.getPointAt(ring, ctr);
        tmp.fromBufferAttribute(pp, k).sub(ctr).multiplyScalar(flare).add(ctr);
        pp.setXYZ(k, tmp.x, tmp.y, tmp.z);
      }
      geom.computeVertexNormals();
      add(tubes, geom, tubeSkin);
      for (const [p, n] of [[p0, p0.clone().sub(p1)], [p1, p1.clone().sub(p0)]] as const) {
        const cap = add(tubes, new THREE.CircleGeometry(r * 1.3, seg), glass, p.x, p.y, p.z);
        cap.lookAt(p.clone().add(n));
        cap.castShadow = false;
        keep(cap);
      }
      colliders.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, r: r * 1.1 });
      colliders.push({ x: a[0] * 0.8 + b[0] * 0.2, z: a[1] * 0.8 + b[1] * 0.2, r });
      colliders.push({ x: a[0] * 0.2 + b[0] * 0.8, z: a[1] * 0.2 + b[1] * 0.8, r });
    }
    group.add(tubes);
    sites.rikeTubes = { x: cx, z: cz, base: heightAt(cx, cz), top: heightAt(cx, cz) + wid / 2 };
    pois.push({ id: 'rikeTubes', x: cx, z: cz, r: len / 2 + 15 });
  }

  // ── Abanotubani: the bath houses, low under their brick domes. ──
  for (const b of L.baths) {
    if (!b.outline || b.outline.length < 3) continue;
    const out = b.outline;
    const area = Math.abs(ringArea(out));
    const [cx, cz] = centroid(out);
    let y = Infinity;
    for (const [px, pz] of out) y = Math.min(y, heightAt(px, pz));
    const chreli = /Chreli/i.test(b.name);
    const wallH = chreli ? 8.5 : 1.6;
    const shape = new THREE.Shape(out.map(([x, z]) => new THREE.Vector2(x - cx, -(z - cz))));
    const body = add(group, new THREE.ExtrudeGeometry(shape, { depth: wallH + 2, bevelEnabled: false }), chreli ? blueTile : brick, cx, y - 2, cz);
    body.rotation.x = -Math.PI / 2;
    if (!chreli) {
      const n = Math.max(1, Math.min(9, Math.round(area / 70)));
      const cols = Math.ceil(Math.sqrt(n));
      let placed = 0;
      for (let i = 0; i < cols && placed < n; i++) for (let j = 0; j < cols && placed < n; j++) {
        const px = cx + (i - (cols - 1) / 2) * 6.5; const pz = cz + (j - (cols - 1) / 2) * 6.5;
        if (!insideRing(px, pz, out)) continue;
        add(group, new THREE.SphereGeometry(2.9, seg, seg / 2, 0, Math.PI * 2, 0, Math.PI / 2), brick, px, y + wallH, pz);
        add(group, new THREE.CylinderGeometry(0.45, 0.55, 0.9, 8), glass, px, y + wallH + 3.2, pz).castShadow = false;
        placed += 1;
      }
    }
    sites[`bath-${b.id}`] = { x: cx, z: cz, base: y, top: y + wallH };
  }
  if (L.baths.length) {
    const [bx, bz] = L.baths.reduce((s, b) => [s[0] + b.at[0] / L.baths.length, s[1] + b.at[1] / L.baths.length], [0, 0]);
    pois.push({ id: 'abanotubani', x: bx, z: bz, r: 60 });
  }

  // ── Carved wooden balconies on the Old Town's houses, facing their streets. ──
  {
    const streets = data.roads.filter((r) => r.cls >= ROAD.residential && r.cls <= ROAD.footway && r.pts.some(([x, z]) => Math.hypot(x - oldTown[0], z - oldTown[1]) < 900));
    const near = new Map<string, Pt[]>();
    for (const r of streets) for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, az] = r.pts[k]; const [bx, bz] = r.pts[k + 1];
      const l = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= l; s += 4) {
        const p: Pt = [ax + ((bx - ax) * s) / (l || 1), az + ((bz - az) * s) / (l || 1)];
        const key = `${Math.floor(p[0] / 20)},${Math.floor(p[1] / 20)}`;
        if (!near.has(key)) near.set(key, []);
        near.get(key)!.push(p);
      }
    }
    const streetDist = (x: number, z: number) => {
      let best = Infinity;
      const i = Math.floor(x / 20); const j = Math.floor(z / 20);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const p of near.get(`${i + di},${j + dj}`) ?? []) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z));
      return best;
    };
    const lattice = (() => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, 128, 64);
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.strokeRect(2, 2, 124, 60);
      for (let k = 0; k < 8; k++) {
        const x = 8 + k * 16;
        g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 58); g.stroke();
        g.beginPath(); g.arc(x + 8, 32, 6, 0, Math.PI * 2); g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      textures.push(t);
      return t;
    })();
    const latticeMat = withHaze(new THREE.MeshStandardMaterial({ color: srgb(0.5, 0.36, 0.24), alphaMap: lattice, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide }), 'lattice');
    materials.push(latticeMat);
    const slab = new THREE.BoxGeometry(1, 0.18, 1.4); slab.translate(0, 0, 0.7);
    const rail = new THREE.PlaneGeometry(1, 1.05); rail.translate(0, 0.62, 1.4);
    const roof = new THREE.BoxGeometry(1.08, 0.1, 1.6); roof.translate(0, 2.75, 0.75);
    const post = new THREE.BoxGeometry(0.12, 2.7, 0.12); post.translate(0, 1.35, 1.36);
    geometries.push(slab, rail, roof, post);
    const mats: THREE.Matrix4[] = []; const posts: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
    let count = 0;
    const limit = lite ? 160 : 420;
    for (const b of data.buildings) {
      if (count >= limit) break;
      if (b.kind !== KIND.house && b.kind !== KIND.generic && b.kind !== KIND.apartments && b.kind !== KIND.historic) continue;
      if (b.height < 6 || b.height > 17) continue;
      const out = b.rings.find((r) => !r.inner)?.pts;
      if (!out || out.length < 4) continue;
      const [cx, cz] = centroid(out);
      if (Math.hypot(cx - oldTown[0], cz - oldTown[1]) > 850) continue;
      let base = Infinity;
      for (const [x, z] of out) base = Math.min(base, heightAt(x, z));
      const ccw = ringArea(out) > 0;
      let pick = -1; let pickScore = Infinity;
      for (let k = 0; k < out.length; k++) {
        const [ax, az] = out[k]; const [bx, bz] = out[(k + 1) % out.length];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 5) continue;
        const d = streetDist((ax + bx) / 2, (az + bz) / 2);
        if (d < pickScore && d < 9) { pickScore = d; pick = k; }
      }
      if (pick < 0) continue;
      const [ax, az] = out[pick]; const [bx, bz] = out[(pick + 1) % out.length];
      const len = Math.hypot(bx - ax, bz - az);
      let nx = (bz - az) / len; let nz = -(bx - ax) / len;
      if (!ccw) { nx = -nx; nz = -nz; }
      const w = Math.min(len * 0.7, 9);
      const levels = Math.max(1, Math.min(3, Math.round(b.height / 3.6) - 1));
      for (let lv = 1; lv <= levels && count < limit; lv++) {
        const y = base + lv * 3.6;
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nx, 0, nz));
        m4.compose(new THREE.Vector3((ax + bx) / 2, y, (az + bz) / 2), q, new THREE.Vector3(w, 1, 1));
        mats.push(m4.clone());
        for (const s of [-0.5, 0, 0.5]) {
          const pxz = new THREE.Vector3((ax + bx) / 2, y, (az + bz) / 2).addScaledVector(new THREE.Vector3(bx - ax, 0, bz - az).normalize(), s * w);
          m4.compose(pxz, q, new THREE.Vector3(1, 1, 1));
          posts.push(m4.clone());
        }
        count += 1;
      }
    }
    const inst = (g: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[]) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(g, m, list.length);
      list.forEach((mm, k) => im.setMatrixAt(k, mm));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true; im.receiveShadow = true;
      group.add(keep(im));
    };
    inst(slab, wood, mats); inst(rail, latticeMat, mats); inst(roof, woodLight, mats); inst(post, wood, posts);
  }

  const merged = mergeStatic(group, { cell: 400, minCaster: 0.8 });
  let t = 0;
  return {
    group, colliders, pois, sites,
    update(dt, night) {
      t += dt;
      glow.value = night;
      if (rotor) {
        // One turn in about eleven minutes.
        rotor.rotation.z += dt * ((Math.PI * 2) / 660);
        for (const c of cabins) c.rotation.z = -rotor.rotation.z;
      }
      if (tvLamps) tvLamps.visible = night > 0.2 && Math.sin(t * 3) > 0;
      if (tvGlow) tvGlow.emissive.setHSL((t * 0.02) % 1, 0.8, 0.28 * night);
      if (bridgeLeds) { bridgeLeds.uniforms.uNight.value = night; bridgeLeds.uniforms.uTime.value = t; }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const g of merged.geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const tx of textures) tx.dispose();
    },
  };
}
