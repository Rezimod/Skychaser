// Mars Base — what a first outpost would actually be: three habitat modules
// half-buried under regolith berms against the radiation, a greenhouse dome,
// a Sabatier plant turning the air into methane and oxygen with its two
// tanks and its radiators, two Kilopower reactors under their umbrellas at a
// safe distance, a solar field, a high-gain dish, a weather mast, a parked
// rover, and the cargo ship that brought it all standing on the pad. Built
// from the same kit as the Moon outpost and folded into a few draw calls.

import * as THREE from 'three';
import { keep, mergeStatic } from '@/lib/solar-system/moon-batch';
import type { Kit } from '@/lib/solar-system/moon-kit';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import type { Interactable } from '@/lib/solar-system/moon-interactions';
import type { LightPool } from '@/lib/solar-system/moon-lights';

export interface MarsBase {
  group: THREE.Group;
  colliders: Collider[];
  pois: PointOfInterest[];
  interactables: Interactable[];
  update: (dt: number, t: number, crewX: number, crewZ: number, lights: LightPool) => void;
  dispose: () => void;
}

/** How close the crew must be for the per-frame work — the flag's cloth, the greenhouse light — to run, m. */
const NEAR_WORK = 60;

function flagTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 192, 128);
  g.fillStyle = '#d0021b';
  g.fillRect(84, 0, 24, 128); g.fillRect(0, 52, 192, 24);
  const bolnisi = (x: number, y: number) => {
    g.fillRect(x - 12, y - 4, 24, 8); g.fillRect(x - 4, y - 12, 8, 24);
  };
  for (const [x, y] of [[42, 26], [150, 26], [42, 102], [150, 102]]) bolnisi(x, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeMarsBase(kit: Kit, heightAt: (x: number, z: number) => number, lite: boolean, readout: (key: string) => void): MarsBase {
  const group = new THREE.Group();
  group.name = 'mars-base';
  const M = kit.mat;
  const colliders: Collider[] = [];
  const pois: PointOfInterest[] = [];
  const interactables: Interactable[] = [];
  const owned: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const at = (x: number, z: number) => heightAt(x, z);
  const berm = new THREE.MeshStandardMaterial({ color: 0x9a5a34, roughness: 1, metalness: 0, normalMap: M.regolith.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
  owned.push(berm);
  let flagCloth: { pos: THREE.BufferAttribute; geom: THREE.PlaneGeometry; x: number; z: number } | null = null;
  const collide = (x: number, z: number, r: number) => colliders.push({ x, z, r });
  const poi = (id: string, x: number, z: number, r: number) => pois.push({ id, x, z, r });

  // ── Habitats: three horizontal modules on legs, bermed with regolith, tunnels between. ──
  const habitats: [number, number, number][] = [[-16, -52, 0.1], [0, -58, 0], [16, -52, -0.1]];
  habitats.forEach(([x, z, yaw], i) => {
    const y = at(x, z);
    const h = new THREE.Group();
    h.position.set(x, y, z);
    h.rotation.y = yaw;
    const body = kit.cylX(h, 3.2, 13, M.shellDusty, 0, 3.5, 0, kit.seg(24));
    body.castShadow = true;
    kit.cylX(h, 3.25, 0.3, M.anodised, -6.6, 3.5, 0, kit.seg(24));
    kit.cylX(h, 3.25, 0.3, M.anodised, 6.6, 3.5, 0, kit.seg(24));
    for (const sx of [-4.5, 0, 4.5]) for (const sz of [-2.2, 2.2]) kit.cyl(h, 0.16, 0.2, 1.6, M.steel, sx, 0.8, sz, 8);
    // The berm: regolith heaped over the top and sides, leaving the ends and a window strip.
    const heap = kit.mesh(h, new THREE.SphereGeometry(1, kit.seg(20), 10, 0, Math.PI * 2, 0, Math.PI * 0.55), berm, 0, 1.2, 0);
    heap.scale.set(8.5, 5.4, 5.6);
    heap.receiveShadow = true;
    for (const sx of [-3.2, -1.1, 1.1, 3.2]) kit.box(h, 0.9, 0.55, 0.12, M.glass, sx, 4.1, 3.24);
    kit.box(h, 1.3, 0.55, 0.12, M.screen, 0, 3.0, 3.24);
    // The airlock end: a hatch and a porch with a ladder.
    kit.cyl(h, 1.0, 1.0, 0.4, M.steel, 6.9, 3.2, 0, kit.seg(16)).rotation.z = Math.PI / 2;
    kit.box(h, 0.6, 1.3, 0.9, M.hazard, 7.2, 3.2, 0);
    kit.box(h, 1.6, 0.1, 1.6, M.deck, 7.8, 2.2, 0);
    group.add(h);
    collide(x, z, 6.4);
    poi(`habitat${i}`, x, z, 12);
  });
  for (const [ax, az, bx, bz] of [[-10, -52, -6, -58], [6, -58, 10, -52]] as const) {
    const tunnel = kit.tube(group, [[ax, at(ax, az) + 2.2, az], [bx, at(bx, bz) + 2.2, bz]], 1.1, M.shell, 8);
    tunnel.castShadow = true;
  }
  const habPanel = { x: 8.4, z: -52 };
  interactables.push({
    id: 'habPanel', priority: 0, where: () => ({ x: habPanel.x, z: habPanel.z, r: 2.6 }),
    kind: () => 'tap', label: () => 'read.habitat', use: () => readout('habitat'),
  });

  // ── Greenhouse: a dome of glass over rows of green, lit from inside. ──
  const gh = { x: -30, z: -36 };
  {
    const y = at(gh.x, gh.z);
    const g = new THREE.Group();
    g.position.set(gh.x, y, gh.z);
    kit.cyl(g, 7.2, 7.4, 0.5, M.deck, 0, 0.25, 0, kit.seg(28));
    const dome = kit.mesh(g, new THREE.SphereGeometry(7, kit.seg(28), 14, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, 0, 0.5, 0);
    dome.castShadow = false;
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) {
      kit.box(g, 1.2, 0.6, 9, M.alu, s * (1.4 + r * 1.9), 0.8, 0);
      kit.box(g, 1.1, 0.35, 8.8, M.green, s * (1.4 + r * 1.9), 1.25, 0);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rib = kit.mesh(g, new THREE.TorusGeometry(7.05, 0.06, 6, kit.seg(28), Math.PI), M.alu, 0, 0.5, 0);
      rib.rotation.set(0, a, 0);
    }
    kit.box(g, 1.2, 2.2, 1.6, M.shell, 0, 1.1, 7.6);
    group.add(g);
    collide(gh.x, gh.z, 7.6);
    poi('greenhouse', gh.x, gh.z, 13);
    interactables.push({
      id: 'greenhouse', priority: 0, where: () => ({ x: gh.x, z: gh.z + 8.6, r: 2.4 }),
      kind: () => 'tap', label: () => 'read.greenhouse', use: () => readout('greenhouse'),
    });
  }

  // ── The Sabatier plant: reactor, two tanks, pipes, radiators. ──
  const isru = { x: 34, z: -34 };
  {
    const y = at(isru.x, isru.z);
    const g = new THREE.Group();
    g.position.set(isru.x, y, isru.z);
    kit.box(g, 9, 0.3, 7, M.deck, 0, 0.15, 0);
    kit.cyl(g, 1.1, 1.1, 3.4, M.steel, -2.6, 2.0, 0, kit.seg(18));
    kit.cyl(g, 0.5, 0.5, 1.2, M.hazard, -2.6, 4.3, 0, kit.seg(12));
    for (const [tx, m, id] of [[1.2, M.shell, 'CH4'], [3.4, M.cool, 'O2']] as const) {
      const tank = kit.mesh(g, new THREE.SphereGeometry(1.25, kit.seg(20), 12), m, tx, 1.75, -1.2);
      tank.castShadow = true;
      kit.cyl(g, 0.12, 0.14, 0.9, M.steel, tx - 0.7, 0.75, -0.6, 6);
      kit.cyl(g, 0.12, 0.14, 0.9, M.steel, tx + 0.7, 0.75, -1.8, 6);
      kit.mesh(g, new THREE.PlaneGeometry(1.0, 0.3), kit.label([id], { w: 128, h: 40 }), tx, 1.75, 0.12).castShadow = false;
    }
    kit.tube(g, [[-1.6, 3.2, 0], [0.2, 3.2, 0], [1.2, 3.0, -1.2]], 0.09, M.cable, 6);
    kit.tube(g, [[-1.6, 2.4, 0.4], [2.2, 2.4, 0.9], [3.4, 2.9, -0.6]], 0.09, M.cable, 6);
    for (let i = 0; i < 3; i++) kit.box(g, 0.08, 2.2, 1.6, M.radiator, 1.2 + i * 1.1, 1.4, 2.4);
    kit.box(g, 0.6, 1.1, 0.4, M.screen, -4.2, 1.3, 2.9);
    group.add(g);
    collide(isru.x - 2.6, isru.z, 1.6); collide(isru.x + 2.3, isru.z - 1.2, 2.6);
    poi('isru', isru.x, isru.z, 10);
    interactables.push({
      id: 'isru', priority: 0, where: () => ({ x: isru.x - 4.2, z: isru.z + 2.9, r: 2.4 }),
      kind: () => 'tap', label: () => 'read.isru', use: () => readout('isru'),
    });
  }

  // ── Two Kilopower reactors, far enough out, each under its radiator umbrella. ──
  for (const [x, z] of [[62, -70], [70, -58]]) {
    const y = at(x, z);
    kit.cyl(group, 0.7, 0.8, 2.6, M.steel, x, y + 1.3, z, kit.seg(14));
    kit.cyl(group, 0.25, 0.25, 3.0, M.alu, x, y + 4.1, z, 8);
    const brolly = kit.mesh(group, new THREE.ConeGeometry(3.6, 1.4, kit.seg(16), 1, true), M.radiator, x, y + 5.6, z);
    brolly.rotation.x = Math.PI;
    brolly.castShadow = false;
    kit.mesh(group, new THREE.PlaneGeometry(1.2, 0.36), kit.label(['KILOPOWER · 10 kWe'], { w: 256, h: 64, bg: '#f2c744', fg: '#1a1a1a' }), x, y + 1.7, z + 0.82).castShadow = false;
    collide(x, z, 1.4);
  }
  poi('power', 66, -64, 12);
  interactables.push({
    id: 'power', priority: 0, where: () => ({ x: 62, z: -67, r: 2.6 }),
    kind: () => 'tap', label: () => 'read.power', use: () => readout('power'),
  });

  // ── The solar field: rows of panels leaning at the sun, dust on the older ones. ──
  {
    const panel = new THREE.BoxGeometry(2.4, 0.06, 1.3);
    kit.geometries.push(panel);
    const rows = 4; const cols = lite ? 5 : 7;
    const im = new THREE.InstancedMesh(panel, M.solar, rows * cols);
    im.castShadow = true; im.receiveShadow = true;
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0));
    const p = new THREE.Vector3(); const s = new THREE.Vector3(1, 1, 1);
    let k = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -58 + c * 2.9; const z = -60 - r * 3.4;
      p.set(x, at(x, z) + 1.0, z);
      m.compose(p, q, s);
      im.setMatrixAt(k++, m);
      kit.cyl(group, 0.06, 0.06, 1.0, M.steel, x, at(x, z) + 0.5, z + 0.3, 6);
    }
    im.instanceMatrix.needsUpdate = true;
    keep(im);
    group.add(im);
    poi('solar', -49, -65, 12);
  }

  // ── The dish, the weather mast, the flag, the sign. ──
  {
    const x = 44; const z = -50; const y = at(x, z);
    kit.cyl(group, 0.5, 0.7, 0.6, M.deck, x, y + 0.3, z, 10);
    kit.cyl(group, 0.12, 0.14, 5.5, M.alu, x, y + 3.2, z, 8);
    const dish = kit.mesh(group, new THREE.SphereGeometry(2.4, kit.seg(20), 10, 0, Math.PI * 2, 0, 0.6), M.silver, x, y + 6.2, z);
    dish.rotation.x = 0.9;
    kit.cyl(group, 0.03, 0.03, 1.6, M.steel, x, y + 6.9, z + 0.8, 6).rotation.x = 0.9;
    collide(x, z, 0.8);
    poi('dish', x, z, 7);
    const wx = 20; const wz = -30; const wy = at(wx, wz);
    kit.cyl(group, 0.05, 0.07, 6, M.alu, wx, wy + 3, wz, 6);
    kit.box(group, 0.5, 0.12, 0.12, M.steel, wx + 0.3, wy + 5.6, wz);
    kit.mesh(group, new THREE.ConeGeometry(0.12, 0.35, 8), M.orange, wx + 0.55, wy + 5.6, wz).rotation.z = -Math.PI / 2;
    for (let i = 0; i < 3; i++) kit.box(group, 0.4, 0.05, 0.05, M.steel, wx - 0.2, wy + 3.2 + i * 0.8, wz);
    collide(wx, wz, 0.3);
    poi('weather', wx, wz, 4);
    const fx = -6; const fz = -22; const fy = at(fx, fz);
    kit.cyl(group, 0.04, 0.05, 3.2, M.alu, fx, fy + 1.6, fz, 6);
    const flag = new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.9, side: THREE.DoubleSide });
    owned.push(flag); textures.push(flag.map as THREE.Texture);
    const cloth = kit.mesh(group, new THREE.PlaneGeometry(1.2, 0.8, 8, 1), flag, fx + 0.62, fy + 2.75, fz);
    keep(cloth);
    poi('flag', fx, fz, 4);
    const sx = 6; const sz = -22; const sy = at(sx, sz);
    kit.cyl(group, 0.05, 0.05, 1.6, M.steel, sx, sy + 0.8, sz, 6);
    const sign = kit.mesh(group, new THREE.PlaneGeometry(2.2, 0.7), kit.label(['MARS BASE · JEZERO', 'FOUNDED BY ASTROMAN · TBILISI'], { w: 512, h: 160, px: 34 }), sx, sy + 1.6, sz);
    sign.castShadow = false;
    keep(sign);
    poi('sign', sx, sz, 4);
    const clothPos = (cloth.geometry as THREE.PlaneGeometry).attributes.position as THREE.BufferAttribute;
    flagCloth = { pos: clothPos, geom: cloth.geometry as THREE.PlaneGeometry, x: fx, z: fz };
  }

  // ── The cargo ship on the pad's far side: stainless, fins, legs, a hatch open. ──
  const ship = { x: -42, z: 6 };
  {
    const y = at(ship.x, ship.z);
    const g = new THREE.Group();
    g.position.set(ship.x, y, ship.z);
    const hull = kit.cyl(g, 4.5, 4.5, 34, M.silver, 0, 19.5, 0, kit.seg(28));
    hull.castShadow = true;
    kit.mesh(g, new THREE.ConeGeometry(4.5, 12, kit.seg(28)), M.silver, 0, 42.5, 0).castShadow = true;
    kit.cyl(g, 4.6, 4.6, 0.5, M.carbon, 0, 8.5, 0, kit.seg(28));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const fin = kit.box(g, 0.4, 9, 3.4, M.carbon, Math.sin(a) * 5.4, 6, Math.cos(a) * 5.4);
      fin.rotation.y = a;
      const leg = kit.cyl(g, 0.35, 0.5, 3.2, M.steel, Math.sin(a) * 5.8, 1.6, Math.cos(a) * 5.8, 8);
      leg.rotation.z = -Math.sin(a) * 0.3; leg.rotation.x = Math.cos(a) * 0.3;
      kit.cyl(g, 1.0, 0.8, 0.3, M.steel, Math.sin(a) * 6.4, 0.15, Math.cos(a) * 6.4, 10);
    }
    for (let i = 0; i < 6; i++) kit.mesh(g, new THREE.ConeGeometry(0.55, 1.2, 10, 1, true), M.carbon, Math.sin(i) * 2.2, 2.2, Math.cos(i) * 2.2).rotation.x = Math.PI;
    kit.box(g, 2.6, 3.2, 0.3, M.carbon, 0, 10, 4.5);
    kit.box(g, 2.2, 0.2, 6, M.deck, 0, 8.8, 7.5).rotation.x = 0.25;
    for (let k = 0; k < 4; k++) kit.box(g, 1.2, 1.2, 1.2, M.orange, -3 + k * 2, 0.6, 12);
    group.add(g);
    collide(ship.x, ship.z, 6.8);
    for (let k = 0; k < 4; k++) collide(ship.x - 3 + k * 2, ship.z + 12, 0.8);
    poi('cargoShip', ship.x, ship.z, 16);
  }

  // ── A rover parked by the habitats. ──
  {
    const x = 24; const z = -40; const y = at(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = 0.6;
    kit.rbox(g, 2.4, 0.8, 3.4, 0.15, M.shell, 0, 1.3, 0);
    kit.box(g, 2.6, 0.1, 3.8, M.solar, 0, 1.78, 0);
    kit.cyl(g, 0.06, 0.06, 1.4, M.alu, 0.6, 2.5, 1.2, 6);
    kit.box(g, 0.5, 0.3, 0.3, M.steel, 0.6, 3.2, 1.2);
    for (const sx of [-1.3, 1.3]) for (const sz of [-1.2, 0, 1.2]) {
      const w = kit.cyl(g, 0.42, 0.42, 0.3, M.rubber, sx, 0.42, sz, kit.seg(14));
      w.rotation.z = Math.PI / 2;
      kit.strut(g, sx * 0.7, 1.0, sz, sx, 0.42, sz, 0.05, M.steel);
    }
    group.add(g);
    collide(x, z, 2.2);
    poi('rover', x, z, 6);
  }

  // ── Pad beacons: a ring of lamps, red and white, the touchdown ring in the middle. ──
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff3020, emissiveIntensity: 1.6 });
  owned.push(lampMat, redMat);
  const lampGeom = new THREE.SphereGeometry(0.16, 8, 6);
  kit.geometries.push(lampGeom);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * 30; const z = 20 + Math.sin(a) * 30;
    const lamp = new THREE.Mesh(lampGeom, i % 3 === 0 ? redMat : lampMat);
    lamp.position.set(x, at(x, z) + 0.5, z);
    keep(lamp);
    group.add(lamp);
    kit.cyl(group, 0.05, 0.06, 0.5, M.steel, x, at(x, z) + 0.25, z, 6);
  }
  poi('landingZone', 0, 20, 30);

  // ── Dust devils out on the plain: tall, faint, wandering. ──
  const devils: { mesh: THREE.Mesh; x: number; z: number; vx: number; vz: number; spin: number }[] = [];
  const devilMat = new THREE.MeshBasicMaterial({ color: 0xd9a77a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  owned.push(devilMat);
  const devilGeom = new THREE.CylinderGeometry(9, 2.2, 90, 12, 1, true);
  kit.geometries.push(devilGeom);
  for (let i = 0; i < (lite ? 1 : 2); i++) {
    const mesh = new THREE.Mesh(devilGeom, devilMat);
    mesh.castShadow = false;
    keep(mesh);
    group.add(mesh);
    const a = i * 2.4 + 1;
    devils.push({ mesh, x: Math.cos(a) * 140, z: Math.sin(a) * 140, vx: 1.6, vz: 0.9, spin: 0 });
  }

  const merged = mergeStatic(group, { cell: 70, minCaster: 0.12 });
  const geoms = merged.geometries;

  let blink = 0;
  const tmpV = new THREE.Vector3();
  return {
    group, colliders, pois, interactables,
    update(dt, t, crewX, crewZ, lights) {
      blink += dt;
      redMat.emissiveIntensity = 0.5 + 1.4 * (Math.sin(blink * 2.4) > 0.5 ? 1 : 0);
      // The greenhouse glows from inside; it lights the ground round it at dusk — when the crew is near enough to see it.
      if (Math.hypot(gh.x - crewX, gh.z - crewZ) < NEAR_WORK) lights.request(gh.x, at(gh.x, gh.z) + 2.5, gh.z, 0xbfffb0, 18, 22, 1.6);
      for (const d of devils) {
        d.x += d.vx * dt; d.z += d.vz * dt;
        d.spin += dt * 1.8;
        const r = Math.hypot(d.x, d.z);
        if (r > 170 || r < 60 || Math.hypot(d.x - crewX, d.z - crewZ) < 25) {
          const a = Math.random() * Math.PI * 2;
          d.x = Math.cos(a) * 150; d.z = Math.sin(a) * 150;
          d.vx = -Math.cos(a + 0.6) * 1.8; d.vz = -Math.sin(a + 0.6) * 1.8;
        }
        d.mesh.position.set(d.x, at(d.x, d.z) + 44, d.z);
        d.mesh.rotation.y = d.spin;
        d.mesh.rotation.z = Math.sin(t * 0.7) * 0.06;
      }
      // The cloth is a few pixels past sixty metres: it holds still out there.
      if (flagCloth && Math.hypot(flagCloth.x - crewX, flagCloth.z - crewZ) < NEAR_WORK) {
        const { pos, geom } = flagCloth;
        for (let i = 0; i < pos.count; i++) {
          tmpV.fromBufferAttribute(pos, i);
          const u = (tmpV.x + 0.6) / 1.2;
          pos.setZ(i, Math.sin(u * 5 - t * 4.2) * 0.06 * u + Math.sin(u * 11 - t * 6.5) * 0.02 * u);
        }
        pos.needsUpdate = true;
        geom.computeVertexNormals();
      }
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of owned) m.dispose();
      for (const tx of textures) tx.dispose();
    },
  };
}
