// The working outpost around the habitats: each zone is a job the crew
// actually does. Power to the east (vertical tracking arrays, batteries, the
// conditioning cabinet), life support to the west (regolith in, oxygen and
// water out), comms to the north-east, the geology lab west of the landing
// zone (the mission computer is indoors, in OPS-B), the rover bay south-east, and the landing zone itself kept well clear
// of anything pressurised. Props are few and placed with intent: numbered
// cargo, worn paths between the places people walk, a crate somebody left
// open, a tool rack with a gap in it.
//
// Positions are world metres; the pad centre is PAD_CENTER (0, -6) and the
// habitats sit north of it at z ≈ -18…-26.

import * as THREE from 'three';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { Kit } from '@/lib/solar-system/moon-kit';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import { pivot } from '@/lib/solar-system/moon-batch';
import { acquireModel, firstMesh } from '@/game/models';
import { TELESCOPE_PAD } from '@/lib/solar-system/moon-terrain';
import { currentQuality } from '@/game/quality';

/** The supply crate, built in Blender (assets-src/blender/crate.py). */
const CRATE_MODEL = '/explore/models/crate.glb';
/** The modular base kit: every piece a named root node (assets-src/blender/base_kit.py). */
const KIT_MODEL = '/explore/models/base-kit.glb';
/** The telescope station: up on the western ridge, well away from the landing zone's dust. */
export const TELESCOPE_SITE = { x: TELESCOPE_PAD.x, z: TELESCOPE_PAD.z, yaw: 0.9 };
const UP = new THREE.Vector3(0, 1, 0);

export interface Anchor { x: number; z: number; y: number; yaw: number }
export type AnchorId =
  | 'scienceTerminal' | 'sampleStore' | 'workbench'
  | 'powerCabinet' | 'faultyArray'
  | 'isruPanel' | 'commsControl'
  | 'charger' | 'serviceBay' | 'telescope';

/** A patch of regolith to darken (compacted, k < 0) or brighten (blasted, k > 0). */
export interface GroundMark { x: number; z: number; r: number; k: number }

export interface ZonesHandle {
  anchors: Record<AnchorId, Anchor>;
  /** Where the crew walks every day, and where the rover has been. */
  paths: [number, number][][];
  tracks: [number, number][][];
  groundMarks: GroundMark[];
  /** The three tracking array heads; the middle one is the one that faults. */
  arrays: THREE.Object3D[];
  /** How far the faulty array is off the sun, rad. The power job zeroes it. */
  arrayFault: { yaw: number };
  /** How far the dish is off Earth, rad. The comms job zeroes it. */
  dishFault: { yaw: number; pitch: number };
  /** Status lamps a job can turn: 'ok' green, 'warn' amber, 'fault' red. */
  setStatus: (which: 'power' | 'comms' | 'isru' | 'charger', state: 'ok' | 'warn' | 'fault') => void;
  /** The base's power, 0 dark … 1 on: status lamps and the comms light scale by it. Set by moon-base. */
  power: { k: number };
  /** The telescope dome's shutters, opened or shut (they swing there). */
  setDome: (open: boolean) => void;
  /** The rover charger live: its ring pulses. */
  setCharging: (on: boolean) => void;
  update: (dt: number, t: number, earthDir: THREE.Vector3) => void;
  dispose: () => void;
}

const STATUS = { ok: 0x4dff88, warn: 0xffb347, fault: 0xff3b2e } as const;

/** The laid landing pad, as the reference sheets draw it: radius in metres. */
const PAD_R = 11.5;

/** The pad's face: sintered regolith, its painted rings, bearing ticks and touchdown mark. */
function padMarkings(): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const ctx = c.getContext('2d')!;
  const mid = n / 2;
  ctx.fillStyle = '#3c3a36';
  ctx.fillRect(0, 0, n, n);
  // Sintered plates, laid in rings.
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 2;
  for (let r = 0.18; r < 1; r += 0.2) {
    ctx.beginPath();
    ctx.arc(mid, mid, mid * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(mid + Math.cos(a) * mid * 0.18, mid + Math.sin(a) * mid * 0.18);
    ctx.lineTo(mid + Math.cos(a) * mid, mid + Math.sin(a) * mid);
    ctx.stroke();
  }
  // The painted rings and the bearing ticks between them.
  ctx.strokeStyle = '#d9821a';
  ctx.lineWidth = 7;
  for (const r of [0.94, 0.62]) {
    ctx.beginPath();
    ctx.arc(mid, mid, mid * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 5;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(mid + Math.cos(a) * mid * 0.74, mid + Math.sin(a) * mid * 0.74);
    ctx.lineTo(mid + Math.cos(a) * mid * 0.88, mid + Math.sin(a) * mid * 0.88);
    ctx.stroke();
  }
  // The touchdown mark.
  ctx.fillStyle = '#e8e4da';
  const bar = mid * 0.07; const tall = mid * 0.36;
  ctx.fillRect(mid - mid * 0.22, mid - tall / 2, bar, tall);
  ctx.fillRect(mid + mid * 0.22 - bar, mid - tall / 2, bar, tall);
  ctx.fillRect(mid - mid * 0.22, mid - bar / 2, mid * 0.44, bar);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildZones(
  kit: Kit,
  group: THREE.Group,
  heightAt: (x: number, z: number) => number,
  colliders: Collider[],
  pois: PointOfInterest[],
  sunDir: THREE.Vector3,
): ZonesHandle {
  const m = kit.mat;
  const owned: THREE.Material[] = [];
  const own = <T extends THREE.Material>(x: T) => { owned.push(x); return x; };
  const statusMat = () => own(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: new THREE.Color(STATUS.ok), emissiveIntensity: 1.8, roughness: 0.4 }));
  const status = { power: statusMat(), comms: statusMat(), isru: statusMat(), charger: statusMat() };
  const blinkRed = own(new THREE.MeshStandardMaterial({ color: 0x1a0404, emissive: new THREE.Color(0xff3b2e), emissiveIntensity: 2, roughness: 0.4 }));
  const reflector = own(new THREE.MeshStandardMaterial({ color: 0x2a1a06, emissive: new THREE.Color(0xffa23a), emissiveIntensity: 0.7, roughness: 0.5 }));
  const hopperMat = own(new THREE.MeshStandardMaterial({ color: 0x70757c, roughness: 0.5, metalness: 0.75, side: THREE.DoubleSide }));
  let padTexture: THREE.Texture | null = null;

  const place = (x: number, z: number, yaw = 0): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = yaw;
    group.add(g);
    return g;
  };
  /** A point in a placed group's frame, in world metres. */
  const world = (g: THREE.Object3D, lx: number, lz: number) => {
    const c = Math.cos(g.rotation.y); const s = Math.sin(g.rotation.y);
    const x = g.position.x + lx * c + lz * s; const z = g.position.z - lx * s + lz * c;
    return { x, z };
  };
  const solid = (g: THREE.Object3D, lx: number, lz: number, r: number, h?: number) => { const p = world(g, lx, lz); colliders.push(h === undefined ? { x: p.x, z: p.z, r } : { x: p.x, z: p.z, r, h }); };
  const anchorAt = (g: THREE.Object3D, lx: number, lz: number, yaw = 0): Anchor => {
    const p = world(g, lx, lz);
    return { x: p.x, z: p.z, y: heightAt(p.x, p.z), yaw: g.rotation.y + yaw };
  };
  const poi = (id: string, g: THREE.Object3D, lx: number, lz: number, r: number) => { const p = world(g, lx, lz); pois.push({ id, x: p.x, z: p.z, r }); };
  /** A cable or pipe lying on the ground between world points. */
  const groundRun = (pts: [number, number][], r: number, mat: THREE.Material) => {
    kit.tube(group, pts.map(([x, z]) => [x, heightAt(x, z) + r + 0.02, z]), r, mat, pts.length * 10);
  };
  const noShadow = (o: THREE.Mesh) => { o.castShadow = false; return o; };
  // The base kit's pieces (assets-src/blender/base_kit.py): each placed as a
  // copy of its named node once the file is in; `onPlaced` wires its hinges.
  const kitSpots: { name: string; parent: THREE.Object3D; onPlaced?: (o: THREE.Object3D) => void }[] = [];
  const kitAt = (name: string, parent: THREE.Object3D, lx = 0, lz = 0, yaw = 0, onPlaced?: (o: THREE.Object3D) => void) => {
    const holder = new THREE.Group();
    holder.position.set(lx, 0, lz);
    holder.rotation.y = yaw;
    parent.add(holder);
    kitSpots.push({ name, parent: holder, onPlaced });
    return holder;
  };

  // ── Power: three vertical tracking arrays down a service corridor, the
  // battery units and the conditioning cabinet at its foot. ──
  const sunYaw = Math.atan2(sunDir.x, sunDir.z);
  const power = place(37, -12, 0);
  const arrays: THREE.Object3D[] = [];
  const sunTilt = -Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1));
  for (let i = 0; i < 3; i++) {
    const lz = (i - 1) * 8.5;
    kitAt('SolarArray', power, 0, lz, 0, (o) => {
      const panel = o.getObjectByName('SolarArray_Panel');
      if (!panel) return;
      // Yaw turns the tilted panel: the tilt faces it up to the sun's height.
      panel.rotation.order = 'YXZ';
      panel.rotation.x = sunTilt;
      arrays[i] = panel;
    });
    solid(power, 0, lz, 1.2);
  }
  // Batteries and cabinet on the corridor side nearest the habitats.
  for (let i = 0; i < 2; i++) {
    kitAt('BatteryBank', power, -4.2, -5 + i * 3.2, Math.PI / 2);
    solid(power, -4.2, -5 + i * 3.2, 1.45);
  }
  const cabinet = new THREE.Group();
  cabinet.position.set(-4.2, 0, 2.6);
  cabinet.rotation.y = -Math.PI / 2;
  power.add(cabinet);
  kit.rbox(cabinet, 1.3, 1.9, 0.7, 0.05, m.shellDusty, 0, 0.95, 0);
  noShadow(kit.box(cabinet, 0.02, 1.6, 0.02, m.carbon, 0, 1.0, 0.36));
  noShadow(kit.box(cabinet, 0.5, 0.3, 0.02, m.screen, -0.3, 1.45, 0.36));
  noShadow(kit.box(cabinet, 0.12, 0.12, 0.03, status.power, 0.35, 1.5, 0.37));
  noShadow(kit.box(cabinet, 0.7, 0.2, 0.02, kit.label(['PCU-1 · ARRAY STRINGS A B C']), 0, 1.78, 0.36));
  kit.rbox(cabinet, 0.35, 0.3, 0.2, 0.03, m.carbon, 0.7, 0.25, 0.1);
  solid(power, -4.2, 2.6, 0.95);
  poi('solar', power, -4, 0, 10);
  const anchors = {} as Record<AnchorId, Anchor>;
  anchors.powerCabinet = anchorAt(power, -3.1, 2.6, -Math.PI / 2);
  anchors.faultyArray = anchorAt(power, -1.9, 0);

  // ── Life support: the regolith plant. A hopper takes regolith, the plant
  // bakes oxygen out of it, tanks hold what it makes, radiators dump its heat.
  // A service platform with the panel at the front. ──
  const isru = place(-40, -14, 0.55);
  kit.box(isru, 4.0, 0.3, 3.2, m.anodised, 0, 0.15, 0);
  kit.rbox(isru, 3.4, 2.2, 2.6, 0.12, m.shellDusty, 0, 1.4, 0);
  kit.box(isru, 3.3, 0.12, 2.5, m.blanket, 0, 2.56, 0);
  noShadow(kit.box(isru, 1.4, 0.3, 0.02, kit.label(['ISRU-1', 'REGOLITH O2 PLANT'], { w: 256, h: 64 }), 0.6, 2.05, 1.31));
  kit.box(isru, 0.2, 0.2, 0.03, status.isru, -1.2, 2.05, 1.32);
  // The hopper on its legs, and the conveyor up to it.
  const hopper = kit.mesh(isru, new THREE.CylinderGeometry(1.15, 0.28, 1.4, kit.seg(18), 1, true), hopperMat, -3.3, 2.6, 0.5);
  hopper.castShadow = true;
  for (const [hx, hz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) kit.strut(isru, -3.3 + hx, 0, 0.5 + hz, -3.3 + hx * 0.8, 2.1, 0.5 + hz * 0.8, 0.05, m.steel);
  kit.strut(isru, -3.3, 1.9, 0.5, -1.7, 1.2, 0.5, 0.12, m.carbon);
  kit.strut(isru, -5.6, 0.2, 0.5, -3.6, 3.2, 0.5, 0.09, m.anodised);
  // Tanks: oxygen, water, nitrogen.
  ['O2', 'H2O', 'N2'].forEach((name, i) => {
    const tz = -1.1 + i * 1.1;
    kit.cyl(isru, 0.45, 0.45, 2.3, m.shell, 2.8, 1.45, tz, 18);
    kit.mesh(isru, new THREE.SphereGeometry(0.45, kit.seg(18), 8, 0, Math.PI * 2, 0, Math.PI / 2), m.shell, 2.8, 2.6, tz);
    for (const y of [0.7, 2.1]) noShadow(kit.mesh(isru, new THREE.TorusGeometry(0.46, 0.03, 6, kit.seg(20)), m.anodised, 2.8, y, tz)).rotation.x = Math.PI / 2;
    const tag = noShadow(kit.box(isru, 0.02, 0.24, 0.42, kit.label([name], { w: 128, h: 64 }), 3.26, 1.6, tz));
    tag.rotation.y = 0;
  });
  kit.tube(isru, [[1.7, 1.0, -1.1], [2.2, 0.5, -1.1], [2.8, 0.35, -0.6], [2.8, 0.35, 1.1]], 0.06, m.alu, 30);
  kit.tube(isru, [[1.7, 1.8, 0.4], [2.35, 1.9, 0.4], [2.6, 2.0, 0.0]], 0.05, m.alu, 20);
  // Radiators on posts behind the plant.
  for (const rx of [-1.2, 1.2]) {
    kit.box(isru, 2.2, 1.5, 0.05, m.radiator, rx, 2.4, -2.3);
    kit.strut(isru, rx, 0.3, -2.3, rx, 1.65, -2.3, 0.05, m.steel);
  }
  // Service platform, steps, rail, the control panel.
  kit.box(isru, 2.4, 0.08, 1.3, m.deck, 0, 0.62, 2.05);
  noShadow(kit.box(isru, 2.4, 0.02, 0.12, m.hazard, 0, 0.67, 2.66));
  for (let s = 0; s < 2; s++) kit.box(isru, 0.9, 0.06, 0.34, m.deck, -0.7, 0.18 + s * 0.22, 2.95 - s * 0.3);
  kit.strut(isru, 1.15, 0.62, 2.65, 1.15, 1.6, 2.65, 0.03, m.steel);
  kit.strut(isru, 1.15, 0.62, 1.45, 1.15, 1.6, 1.45, 0.03, m.steel);
  kit.strut(isru, 1.15, 1.6, 1.45, 1.15, 1.6, 2.65, 0.03, m.steel);
  const isruPanel = kit.rbox(isru, 0.6, 0.5, 0.14, 0.03, m.carbon, 0.3, 1.35, 1.4);
  noShadow(kit.mesh(isruPanel, new THREE.PlaneGeometry(0.44, 0.26), m.screen, 0, 0.04, 0.075));
  solid(isru, 0, 0, 2.3);
  solid(isru, -3.3, 0.5, 1.4);
  solid(isru, 2.8, 0, 1.7);
  solid(isru, 0, -2.3, 1.2);
  poi('tanks', isru, 0, 3, 7);
  anchors.isruPanel = anchorAt(isru, 0.3, 2.35, 0);

  // ── Comms: the high-gain dish on its pedestal, the electronics enclosure,
  // two whips and a beacon. ──
  const comms = place(22, -36, -0.4);
  let dishYaw: THREE.Object3D | null = null;
  let dishPitch: THREE.Object3D | null = null;
  kitAt('Dish', comms, 0, 0, 0, (o) => { dishYaw = o.getObjectByName('Dish_Yaw') ?? null; dishPitch = o.getObjectByName('Dish_Pitch') ?? null; });
  kitAt('CommsMast', comms, -3.4, -1.8, 0.3);
  solid(comms, -3.4, -1.8, 1.0);
  const enclosure = new THREE.Group();
  enclosure.position.set(2.1, 0, 1.2);
  comms.add(enclosure);
  kit.rbox(enclosure, 1.5, 1.2, 0.9, 0.06, m.blanket, 0, 0.62, 0);
  noShadow(kit.box(enclosure, 0.5, 0.3, 0.02, m.screen, -0.3, 0.8, 0.46));
  noShadow(kit.box(enclosure, 0.1, 0.1, 0.03, status.comms, 0.3, 0.9, 0.46));
  noShadow(kit.box(enclosure, 0.9, 0.18, 0.02, kit.label(['COMMS · S/Ka BAND']), 0, 1.1, 0.46));
  kit.cyl(enclosure, 0.015, 0.02, 2.4, m.steel, -0.55, 2.4, -0.25, 6);
  kit.cyl(enclosure, 0.015, 0.02, 1.8, m.steel, 0.55, 2.1, -0.25, 6);
  solid(comms, 0, 0, 1.6);
  solid(comms, 2.1, 1.2, 0.9);
  poi('dish', comms, 0, 3.5, 7);
  anchors.commsControl = anchorAt(comms, 2.1, 2.2, 0);
  groundRun([[22.5, -33.5], [14, -30], [5, -26]], 0.05, m.cable);

  // ── The geology lab: a PV canopy over the bench, the sealed sample
  // store, the mission computer, instrument racks, the drill string rack
  // and the environmental mast. ──
  const lab = place(-31, 6, -0.9);
  for (const [cx, cz] of [[-2.1, -1.4], [2.1, -1.4], [-2.1, 1.4], [2.1, 1.4]]) kit.cyl(lab, 0.05, 0.06, 2.7, m.steel, cx, 1.35, cz, 8);
  kit.box(lab, 4.6, 0.05, 3.2, m.solar, 0, 2.72, 0);
  kit.box(lab, 4.7, 0.08, 0.08, m.alu, 0, 2.7, 1.62);
  kit.box(lab, 4.7, 0.08, 0.08, m.alu, 0, 2.7, -1.62);
  // Bench, and what is on it.
  kit.box(lab, 2.6, 0.08, 0.9, m.anodised, 0, 0.95, 0);
  for (const [bx, bz] of [[-1.2, -0.38], [1.2, -0.38], [-1.2, 0.38], [1.2, 0.38]]) kit.box(lab, 0.06, 0.92, 0.06, m.steel, bx, 0.46, bz);
  kit.rbox(lab, 0.34, 0.26, 0.3, 0.03, m.shell, -0.8, 1.12, -0.1);
  kit.cyl(lab, 0.05, 0.07, 0.34, m.carbon, -0.8, 1.42, -0.1, 10);
  for (let k = 0; k < 4; k++) kit.rbox(lab, 0.16, 0.07, 0.2, 0.02, m.shell, 0.2 + k * 0.22, 1.03, 0.12);
  kit.box(lab, 0.5, 0.04, 0.3, m.carbon, 0.8, 1.01, -0.2);
  const lamp = kit.cyl(lab, 0.1, 0.14, 0.12, m.carbon, 0.9, 2.3, 0, 12);
  noShadow(kit.cyl(lamp, 0.09, 0.09, 0.02, m.work, 0, -0.07, 0, 12));
  kit.strut(lab, 1.2, 0.99, 0.35, 0.9, 2.25, 0, 0.02, m.steel);
  solid(lab, -0.7, 0, 0.75);
  solid(lab, 0.7, 0, 0.75);
  // The sealed sample store: six drawers, each with its lock lamp.
  const store = new THREE.Group();
  store.position.set(3.2, 0, -0.6);
  store.rotation.y = -Math.PI / 2;
  lab.add(store);
  kit.rbox(store, 1.5, 1.1, 0.75, 0.05, m.shell, 0, 0.58, 0);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      noShadow(kit.box(store, 0.42, 0.4, 0.02, m.carbon, -0.47 + c * 0.47, 0.35 + r * 0.46, 0.38));
      noShadow(kit.box(store, 0.05, 0.05, 0.03, m.amber, -0.3 + c * 0.47, 0.45 + r * 0.46, 0.39));
    }
  }
  noShadow(kit.box(store, 1.0, 0.16, 0.02, kit.label(['SAMPLE STORE · SEALED']), 0, 1.2, 0.38));
  solid(lab, 3.2, -0.6, 0.9);
  anchors.sampleStore = anchorAt(lab, 2.1, -0.6, 0);
  // The mission computer is in OPS-B, behind the airlock (moon-base sets its anchor).
  anchors.workbench = anchorAt(lab, 0, 1.2, 0);
  // Instrument racks.
  for (let k = 0; k < 2; k++) {
    const rack = new THREE.Group();
    rack.position.set(-0.8 + k * 1.3, 0, -2.3);
    lab.add(rack);
    for (const [px, pz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) kit.box(rack, 0.04, 1.6, 0.04, m.steel, px, 0.8, pz);
    for (const y of [0.35, 0.85, 1.35]) kit.box(rack, 1.15, 0.04, 0.55, m.anodised, 0, y, 0);
    kit.rbox(rack, 0.5, 0.3, 0.4, 0.03, m.shell, -0.25, 0.53, 0);
    kit.rbox(rack, 0.4, 0.25, 0.35, 0.03, m.carbon, 0.3, 1.0, 0);
    noShadow(kit.box(rack, 0.05, 0.05, 0.02, k ? m.cool : m.green, 0.3, 1.05, 0.19));
    solid(lab, -0.8 + k * 1.3, -2.3, 0.75);
  }
  // The drill string rack and a core box.
  for (let k = 0; k < 6; k++) {
    const rod = kit.cyl(lab, 0.04, 0.04, 1.9, m.steel, -2.9 + k * 0.1, 0.95, -2.2, 8);
    rod.rotation.z = 0.12;
  }
  kit.box(lab, 0.9, 0.06, 0.2, m.anodised, -2.65, 1.7, -2.3);
  kit.box(lab, 0.7, 0.12, 0.5, m.orange, -2.6, 0.06, -1.4);
  solid(lab, -2.7, -2.2, 0.55);
  // The environmental mast.
  kit.cyl(lab, 0.035, 0.05, 4.6, m.alu, -4.3, 2.3, -2.4, 8);
  kit.box(lab, 1.0, 0.04, 0.04, m.steel, -4.3, 4.2, -2.4);
  kit.rbox(lab, 0.18, 0.14, 0.14, 0.02, m.shell, -4.75, 4.1, -2.4);
  kit.rbox(lab, 0.18, 0.14, 0.14, 0.02, m.shell, -3.85, 4.1, -2.4);
  const envLamp = noShadow(kit.cyl(lab, 0.035, 0.035, 0.06, m.cool, -4.3, 4.65, -2.4, 8));
  envLamp.castShadow = false;
  solid(lab, -4.3, -2.4, 0.3);
  poi('science', lab, 0, 2.5, 7);
  groundRun([[-29, 5], [-24, -2], [-20, -8]], 0.05, m.cable);

  // ── The seismometer: well out on natural ground, away from the base's
  // own footfalls, under its thermal shroud with its own little panel. ──
  const seis = place(-48, 24, 0.4);
  noShadow(kit.mesh(seis, new THREE.ConeGeometry(0.75, 0.32, kit.seg(20), 1, true), m.blanket, 0, 0.16, 0));
  kit.cyl(seis, 0.2, 0.24, 0.16, m.carbon, 0, 0.08, 0, 14);
  kit.tube(seis, [[0.7, 0.03, 0], [1.3, 0.04, 0.3], [1.9, 0.04, 0.2]], 0.015, m.cable, 12);
  kit.rbox(seis, 0.34, 0.26, 0.26, 0.03, m.shell, 2.0, 0.13, 0.2);
  noShadow(kit.box(seis, 0.05, 0.05, 0.03, m.green, 2.0, 0.22, 0.34));
  const seisPanel = kit.box(seis, 0.8, 0.03, 0.5, m.solar, 2.0, 0.6, -0.5);
  seisPanel.rotation.x = -0.7;
  kit.cyl(seis, 0.02, 0.02, 0.55, m.steel, 2.0, 0.28, -0.4, 6);
  kit.cyl(seis, 0.012, 0.012, 1.2, m.orange, -0.9, 0.6, -0.6, 6);
  pois.push({ id: 'seismometer', x: -48, z: 24, r: 4 });

  // ── The rover bay: a marked stand, the charger, the pallets, the tool
  // rack, a spare wheel. ──
  const bay = place(22, 10, -0.6);
  kitAt('Garage', bay, 0, 0, 0, (o) => {
    const door = o.getObjectByName('Garage_Door');
    if (door) door.position.y += 1.95;
    // The charger's lights are the charging status: they pulse while it charges.
    const charge = o.getObjectByName('Garage_Charge') as THREE.Mesh | undefined;
    if (charge?.isMesh) charge.material = status.charger;
  });
  // The garage walls: back and sides (the front is the open bay).
  for (const lx of [-3, -1, 1, 3]) solid(bay, lx, -3.3, 0.55);
  for (const lz of [-2, 0, 2]) { solid(bay, -4.1, lz, 0.5); solid(bay, 4.1, lz, 0.5); }
  for (const lx of [-1.95, 1.95]) noShadow(kit.box(bay, 0.14, 0.02, 5.8, m.hazard, lx, 0.012, 0));
  noShadow(kit.box(bay, 4.0, 0.02, 0.14, m.hazard, 0, 0.012, -2.9));
  noShadow(kit.box(bay, 1.2, 0.02, 0.5, m.hazard, 0, 0.012, -1.6));
  anchors.charger = anchorAt(bay, -2.2, -1.2, 0);
  anchors.serviceBay = anchorAt(bay, 0, 0, 0);
  // Pallets of cargo, one crate opened and not closed again. The crate is a
  // real model: every copy is one instance of it, placed once the file is in.
  const crateSpots: { parent: THREE.Object3D; x: number; y: number; z: number; yaw: number }[] = [];
  const crate = (parent: THREE.Object3D, x: number, y: number, z: number, yaw = 0) => { crateSpots.push({ parent, x, y, z, yaw }); };
  kit.box(bay, 1.8, 0.12, 1.3, m.anodised, 6.3, 0.06, -1.6);
  crate(bay, 5.9, 0.12, -1.9);
  crate(bay, 6.7, 0.12, -1.9, 0.06);
  crate(bay, 6.3, 0.72, -1.9, -0.04);
  crate(bay, 6.1, 0.12, -1.25, 0.12);
  solid(bay, 6.3, -1.6, 1.2);
  kit.box(bay, 1.8, 0.12, 1.3, m.anodised, 6.5, 0.06, 1.4);
  crate(bay, 6.2, 0.12, 1.4, -0.1);
  const lid = kit.box(bay, 0.78, 0.05, 0.62, m.orange, 7.05, 0.5, 1.5);
  lid.rotation.z = -1.15;
  for (let k = 0; k < 3; k++) kit.cyl(bay, 0.08, 0.08, 0.28, m.shell, 6.85 + (k % 2) * 0.18, 0.27, 1.2 + k * 0.2, 10);
  // Low enough to vault at a run.
  solid(bay, 6.5, 1.4, 1.1, 0.75);
  // The tool rack: scoop, rake, tongs, hammer — and one empty hook.
  const rack = new THREE.Group();
  rack.position.set(-5.8, 0, 1.3);
  rack.rotation.y = Math.PI / 2;
  bay.add(rack);
  kit.box(rack, 1.6, 0.06, 0.06, m.steel, 0, 1.55, 0);
  for (const px of [-0.8, 0.8]) kit.box(rack, 0.06, 1.6, 0.06, m.steel, px, 0.8, 0);
  const tools: [number, number][] = [[-0.55, 0.9], [-0.2, 0.95], [0.15, 0.85], [0.5, 0.8]];
  tools.forEach(([tx, len]) => {
    kit.cyl(rack, 0.018, 0.018, len, m.alu, tx, 1.5 - len / 2, 0.06, 6);
  });
  kit.box(rack, 0.2, 0.14, 0.03, m.anodised, -0.55, 1.05, 0.06);
  kit.box(rack, 0.24, 0.03, 0.08, m.anodised, -0.2, 1.03, 0.06);
  kit.box(rack, 0.1, 0.05, 0.05, m.steel, 0.5, 1.09, 0.06);
  solid(bay, -5.8, 1.3, 0.8);
  // The spare wheel against the rack.
  const spare = new THREE.Group();
  spare.position.set(-5.35, 0.55, 2.4);
  spare.rotation.set(0, 0.2, 1.25);
  bay.add(spare);
  kit.cylX(spare, 0.55, 0.4, m.anodised, 0, 0, 0, 24);
  kit.cylX(spare, 0.22, 0.44, m.carbon, 0, 0, 0, 12);
  pois.push({ id: 'logistics', x: 22, z: 10, r: 7 });

  // ── The landing zone: the laid pad the reference sheets draw — a shallow
  // sintered disc with its painted rings and touchdown mark — inside a ring
  // of reflector stakes, four nav lamps, a warning board, and the cargo
  // earlier landings left behind. ──
  const lz = { x: 0, z: 20 };
  {
    const g = place(lz.x, lz.z);
    kit.cyl(g, PAD_R, PAD_R + 0.25, 0.16, m.carbon, 0, -0.03, 0, 48).castShadow = false;
    const marks = padMarkings();
    padTexture = marks;
    const face = noShadow(kit.mesh(g, new THREE.CircleGeometry(PAD_R - 0.1, 48), own(new THREE.MeshStandardMaterial({ map: marks, roughness: 0.92, metalness: 0.05 })), 0, 0.055, 0));
    face.rotation.x = -Math.PI / 2;
    // The rim the dust is swept off, and the tie-down rings round it.
    noShadow(kit.mesh(g, new THREE.TorusGeometry(PAD_R - 0.05, 0.07, 4, 48), m.hazard, 0, 0.06, 0)).rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      noShadow(kit.mesh(g, new THREE.TorusGeometry(0.22, 0.04, 4, 10), m.steel, Math.cos(a) * (PAD_R - 1.1), 0.07, Math.sin(a) * (PAD_R - 1.1))).rotation.x = Math.PI / 2;
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const x = lz.x + Math.cos(a) * 12.5; const z = lz.z + Math.sin(a) * 12.5;
    const stake = place(x, z, -a);
    kit.cyl(stake, 0.025, 0.03, 0.65, m.alu, 0, 0.32, 0, 6);
    noShadow(kit.box(stake, 0.12, 0.2, 0.02, reflector, 0, 0.58, 0.03));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = lz.x + Math.cos(a) * 16; const z = lz.z + Math.sin(a) * 16;
    const post = place(x, z);
    kit.cyl(post, 0.05, 0.07, 1.9, m.steel, 0, 0.95, 0, 8);
    kit.rbox(post, 0.3, 0.25, 0.3, 0.04, m.shellDusty, 0, 0.2, 0);
    noShadow(kit.cyl(post, 0.08, 0.08, 0.14, blinkRed, 0, 1.95, 0, 10));
    colliders.push({ x, z, r: 0.3 });
  }
  const warn = place(-7, 7.5, Math.PI + 0.2);
  for (const sx of [-0.7, 0.7]) kit.cyl(warn, 0.03, 0.03, 1.6, m.steel, sx, 0.8, 0, 6);
  noShadow(kit.box(warn, 1.8, 0.6, 0.02, kit.label(['LANDING ZONE', 'KEEP CLEAR DURING DESCENT'], { w: 512, h: 160, bg: '#d9a21a', fg: '#15181d' }), 0, 1.3, 0.02));
  colliders.push({ x: -7, z: 7.5, r: 0.8 });
  // Cargo from earlier landings: a foil-wrapped container, and one opened on site.
  const cargoA = place(14, 31, 0.6);
  kit.rbox(cargoA, 2.2, 1.4, 1.6, 0.08, m.gold, 0, 0.7, 0);
  for (const cx of [-1.1, 1.1]) kit.box(cargoA, 0.08, 1.5, 1.7, m.anodised, cx, 0.75, 0);
  noShadow(kit.box(cargoA, 0.02, 0.2, 0.7, kit.label(['DROP 03'], { w: 256, h: 64 }), 1.15, 1.1, 0));
  colliders.push({ x: 14, z: 31, r: 1.5 });
  const cargoB = place(-9, 34, -0.3);
  kit.box(cargoB, 1.8, 0.9, 1.3, m.shellDusty, 0, 0.45, 0);
  const cargoLid = kit.box(cargoB, 1.8, 0.06, 1.3, m.blanket, 0, 0.3, 1.15);
  cargoLid.rotation.x = 1.35;
  crate(cargoB, -1.4, 0, 0.9, 0.35);
  colliders.push({ x: -9, z: 34, r: 1.4 });
  pois.push({ id: 'landingZone', x: lz.x, z: lz.z, r: 11 });

  // ── The telescope station: a deck on the ridge, its dome, its mount. The
  // model comes from the base kit; the station's state is kept here. ──
  const scope = place(TELESCOPE_SITE.x, TELESCOPE_SITE.z, TELESCOPE_SITE.yaw);
  solid(scope, 0, 0, 3.2);
  poi('telescope', scope, 0, 4, 8);
  anchors.telescope = anchorAt(scope, 0, 3.4, Math.PI);
  const telescope = {
    open: false,
    /** 0 shut … 1 open, as drawn. */
    k: 0,
    shutters: [] as { node: THREE.Object3D; side: number }[],
    update(dt: number) {
      telescope.k += ((telescope.open ? 1 : 0) - telescope.k) * (1 - Math.exp(-dt * 0.9));
      for (const s of telescope.shutters) s.node.rotation.z = s.side * telescope.k * 1.45;
    },
  };

  // ── Cables from each zone to the cluster. ──
  groundRun([[33, -8], [26, -12], [21.5, -12.5]], 0.06, m.cable);
  groundRun([[-37, -11], [-30, -12], [-25.5, -14]], 0.06, m.cable);
  groundRun([[19.8, 8.3], [12, 0], [6, -12]], 0.04, m.cable);

  const groundMarks: GroundMark[] = [
    { x: lz.x, z: lz.z, r: 10, k: -0.07 },
    { x: lz.x, z: lz.z, r: 22, k: 0.05 },
    { x: 22, z: 10, r: 4.5, k: -0.06 },
    { x: -31, z: 6, r: 5, k: -0.05 },
    { x: -40, z: -14, r: 6, k: -0.05 },
    { x: 0, z: -12, r: 7, k: -0.04 },
  ];
  const paths: [number, number][][] = [
    [[0, -14], [0.5, -4], [0, 4], [0, 9]],
    [[-18.4, -9.1], [-24, -2], [-29, 4]],
    [[-19, -9], [-28, -10], [-36, -11]],
    [[18.4, -9.1], [26, -8], [32.5, -10]],
    [[20.8, -9.5], [23, -20], [23.5, -32]],
    [[2, -13], [10, -2], [19.5, 8]],
    [[20, 12], [12, 16], [6, 18]],
  ];
  const tracks: [number, number][][] = [
    [[22, 13], [16, 22], [2, 32], [-24, 42], [-60, 52], [-90, 60]],
    [[24, 7], [34, 4], [44, 12], [40, 26], [26, 22]],
    // Out to the telescope: round the south of the habitats and up the ridge.
    [[20, 6], [8, -2], [-12, 2], [-36, -4], [-50, -24], [-56, -39]],
  ];

  let crates: THREE.InstancedMesh | null = null;
  let releaseCrate: (() => void) | null = null;
  let disposed = false;
  acquireModel(CRATE_MODEL).then(({ scene, release }) => {
    const src = firstMesh(scene);
    if (disposed || !src) { release(); return; }
    releaseCrate = release;
    const inst = new THREE.InstancedMesh(src.geometry, src.material, crateSpots.length);
    const mat = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const one = new THREE.Vector3(1, 1, 1);
    crateSpots.forEach((s, i) => {
      s.parent.updateMatrix();
      inst.setMatrixAt(i, mat.compose(p.set(s.x, s.y, s.z), q.setFromAxisAngle(UP, s.yaw), one).premultiply(s.parent.matrix));
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    inst.name = 'crates';
    group.add(inst);
    crates = inst;
  }, () => undefined);

  // The kit's pieces, placed once the file is in: each a copy of its named node.
  kitAt('TelescopePlatform', scope, 0, 0, 0, (o) => {
    // The clamshell: the +X half opens with negative roll, the -X half positive.
    for (const [n, side] of [['Telescope_ShutterL', -1], ['Telescope_ShutterR', 1]] as const) {
      const node = o.getObjectByName(n);
      if (node) telescope.shutters.push({ node, side });
    }
  });

  // Floodlight masts over the working areas, beacons at the garage apron,
  // and the small things a working base has lying about.
  for (const [x, z, yaw] of [[9, 3, -2.4], [-13, -1, 2.3], [31, -3, -1.2], [-25, 13, 2.6], [-47, -30, 2.2]] as const) kitAt('LightMast', place(x, z), 0, 0, yaw);
  for (const lx of [-3, 3]) kitAt('NavBeacon', bay, lx, 4.6);
  kitAt('O2Tanks', isru, 4.9, 1.6, -Math.PI / 2);
  solid(isru, 4.9, 1.6, 1.4);
  kitAt('CargoContainer', place(18, 28), 0, 0, 0.5);
  colliders.push({ x: 18, z: 28, r: 1.5 });
  kitAt('CargoContainer', place(-14, 30), 0, 0, -0.2);
  colliders.push({ x: -14, z: 30, r: 1.5 });
  kitAt('ToolRack', place(3.6, -15.5), 0, 0, -0.3);
  colliders.push({ x: 3.6, z: -15.5, r: 1.0 });
  kitAt('UtilityBox', place(14, -30), 0, 0, 0.4);
  kitAt('CableSpool', place(15.6, -29), 0, 0, 1.1);
  kitAt('UtilityBox', place(26.5, -13), 0, 0, -0.2);

  let releaseKit: (() => void) | null = null;
  const kitPlaced: THREE.Object3D[] = [];
  // The kit's lamps are the base's own: they follow its power.
  let kitLamp: THREE.MeshStandardMaterial | null = null;
  let kitLampFull = 1;
  acquireModel(KIT_MODEL, true).then(({ scene, release }) => {
    if (disposed) { release(); return; }
    releaseKit = release;
    for (const spot of kitSpots) {
      const src = scene.getObjectByName(spot.name);
      if (!src) continue;
      const o = src.clone(true);
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true; mesh.receiveShadow = true;
        const mt = mesh.material as THREE.MeshStandardMaterial;
        if (mt.name === 'KitLamp') {
          if (!kitLamp) { kitLamp = mt.clone(); kitLampFull = mt.emissiveIntensity; owned.push(kitLamp); }
          mesh.material = kitLamp;
        }
      });
      // Far off, the lighter body stands in for the full one.
      const body = o.getObjectByName(`${spot.name}_Body`);
      const far = o.getObjectByName(`${spot.name}_LOD1`);
      if (body && far) {
        const lod = new THREE.LOD();
        body.removeFromParent(); far.removeFromParent();
        lod.addLevel(body, 0);
        lod.addLevel(far, currentQuality().lodDistance * 1.75);
        o.add(lod);
      }
      spot.parent.add(o);
      kitPlaced.push(o);
      spot.onPlaced?.(o);
    }
  }, () => undefined);

  const aim = new THREE.Vector3();
  const setStatus: ZonesHandle['setStatus'] = (which, state) => status[which].emissive.setHex(STATUS[state]);

  let charging = true;
  const statusFull = 1.8;

  const handle: ZonesHandle = {
    anchors, paths, tracks, groundMarks, arrays,
    arrayFault: { yaw: 0 },
    dishFault: { yaw: 0, pitch: 0 },
    setStatus,
    power: { k: 1 },
    setDome(open) { telescope.open = open; },
    setCharging(on) { charging = on; },
    update(dt, t, earthDir) {
      const k = handle.power.k;
      status.power.emissiveIntensity = statusFull * k;
      status.comms.emissiveIntensity = statusFull * k;
      status.isru.emissiveIntensity = statusFull * k;
      status.charger.emissiveIntensity = charging ? statusFull * (0.55 + 0.45 * Math.sin(t * 3.1)) * k : 0.15 * k;
      telescope.update(dt);
      arrays.forEach((head, i) => { head.rotation.y = sunYaw + (i === 1 ? handle.arrayFault.yaw : 0); });
      // The dish tracks Earth, less whatever the job has knocked it off by.
      const c = Math.cos(handle.dishFault.yaw); const s = Math.sin(handle.dishFault.yaw);
      aim.set(earthDir.x * c + earthDir.z * s, earthDir.y + handle.dishFault.pitch, -earthDir.x * s + earthDir.z * c).normalize();
      if (dishYaw && dishPitch) {
        // Azimuth in the dish's own frame, then elevation: pitching up is negative about X.
        dishYaw.rotation.y = Math.atan2(aim.x, aim.z) - comms.rotation.y;
        dishPitch.rotation.x = -Math.asin(THREE.MathUtils.clamp(aim.y, -1, 1));
      }
      if (kitLamp) kitLamp.emissiveIntensity = kitLampFull * k;
      const blink = Math.sin(t * 2.6) > 0.55 ? 2.2 : 0.12;
      blinkRed.emissiveIntensity = blink * k;
      reflector.emissiveIntensity = 0.55 + 0.15 * Math.sin(t * 0.7);
    },
    dispose() {
      disposed = true;
      for (const o of owned) o.dispose();
      padTexture?.dispose();
      crates?.removeFromParent();
      crates?.dispose();
      releaseCrate?.();
      for (const o of kitPlaced) o.removeFromParent();
      releaseKit?.();
    },
  };
  return handle;
}
