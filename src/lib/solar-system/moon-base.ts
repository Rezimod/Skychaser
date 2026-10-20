// The outpost's core, built to Stellar's own concept sheets
// (~/Desktop/stellar-explore/refs/base/): three rigid habitat modules — a faceted
// drum on a skirt, battened down every seam, a shoulder up to a glazed
// penthouse ring and a shallow cap, the five-cross flag and the wordmark on
// the flank — each with a hard airlock module at the front, its control panel
// and status lamp, and a ramp down to the regolith. Pressurised corridors run
// between them and out to the horizontal capsule modules on OPS-B's arms,
// which is what gives the outpost its radial plan. The crew walks inside: up
// the ramp, cycle the airlock, onto a deck with bunks, benches and a gym under
// the deckhead. Around them moon-base-zones builds the working outpost,
// moon-rover-mesh the rover; the first crew's descent stage stands out past
// the landing zone, where it came down; the flag and the sign between.
//
// Everything sits on the terrain's own height. Every footprint is a
// collider — the habitats only for vehicles, since the crew goes in.

import * as THREE from 'three';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import { PAD_CENTER } from '@/lib/solar-system/moon-terrain';
import type { RoverParts } from '@/lib/solar-system/moon-rover';
import { keep, mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import type { LightPool } from '@/lib/solar-system/moon-lights';
import type { Kit } from '@/lib/solar-system/moon-kit';
import { buildRover } from '@/lib/solar-system/moon-rover-mesh';
import { buildZones, type ZonesHandle } from '@/lib/solar-system/moon-base-zones';
import { acquireModel } from '@/game/models';

/** The lander the first crew came down in, built in Blender (assets-src/blender/lander.py). */
const LANDER_MODEL = '/explore/models/lander.glb';

export interface PointOfInterest {
  id: string;
  x: number;
  z: number;
  /** Approach radius that names it on the HUD. */
  r: number;
}

export interface Airlock {
  habitat: string;
  /** The door, world metres, and the module's facing. */
  x: number; z: number; yaw: number;
  panel: THREE.Mesh;
  /** 0 shut … 1 open, as drawn. */
  open: number;
  state: 'closed' | 'cycling' | 'open';
  /** 0…1 through an equalisation cycle. */
  cycle: number;
  lamp: THREE.MeshStandardMaterial;
}

/** A habitat the crew can stand in. */
export interface Inside { id: string; x: number; z: number; y: number; pressurised: boolean }

/** The way in through an airlock: a mark on the landing outside, the middle of the chamber, a spot on the deck inside. */
export interface Doorway {
  outside: { x: number; y: number; z: number };
  chamber: { x: number; y: number; z: number };
  inside: { x: number; y: number; z: number };
  /** Facing when walking in. */
  yawIn: number;
}

/** What later missions switch, shown on the base itself rather than written into mission code. */
export interface BaseState {
  /** The base's power: lamps, screens, status lights, the habitats' lights. */
  power: boolean;
  /** The high-gain dish on Earth, or knocked off it. */
  dishAligned: boolean;
  /** The telescope dome's shutters open. */
  domeOpen: boolean;
  /** The rover charger live. */
  charging: boolean;
}

export interface BaseHandle {
  group: THREE.Group;
  /** Every footprint — what the rover and the meteoroids keep out of. */
  colliders: Collider[];
  /** The footprints the crew keeps out of on foot: not the habitats. */
  walkColliders: Collider[];
  /** The floor under a point on the base's own structure, or null on open ground. */
  floorAt: (x: number, z: number) => number | null;
  /** The roof over a point inside a habitat, or null under the sky. */
  ceilingAt: (x: number, z: number) => number | null;
  /** Somewhere the camera may not be: inside a module's shell or the airlock module's walls. */
  blocked: (x: number, y: number, z: number) => boolean;
  doorway: (a: Airlock) => Doorway;
  /** Keep a walker on the ramps, inside the module walls, out of the modules
   *  from outside, and on their own side of a shut airlock door. */
  confine: (p: { x: number; z: number }) => void;
  inside: Inside | null;
  pois: PointOfInterest[];
  spawn: THREE.Vector3;
  airlocks: Airlock[];
  /** Start an equalisation cycle, or shut an open door. */
  cycleAirlock: (a: Airlock) => void;
  rover: THREE.Group;
  roverCollider: Collider;
  roverParts: RoverParts;
  zones: ZonesHandle;
  state: Readonly<BaseState>;
  setState: (s: Partial<BaseState>) => void;
  update: (dt: number, t: number, earthDir: THREE.Vector3, crewX: number, crewZ: number) => void;
  dispose: () => void;
}

/** Georgia's five-cross flag, drawn — it is the founder's, and Astroman's. */
function georgianFlag(): THREE.CanvasTexture {
  const w = 300; const h = 200;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d0202a';
  ctx.fillRect(w / 2 - 20, 0, 40, h);
  ctx.fillRect(0, h / 2 - 20, w, 40);
  const bolnisi = (cx: number, cy: number, s: number) => {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(k * Math.PI / 2);
      ctx.moveTo(-s * 0.18, -s * 0.18);
      ctx.lineTo(-s * 0.3, -s);
      ctx.lineTo(s * 0.3, -s);
      ctx.lineTo(s * 0.18, -s * 0.18);
      ctx.restore();
    }
    ctx.fill();
  };
  for (const [qx, qy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) bolnisi(w * qx, h * qy, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CYCLE_SECONDS = 1.4;
const LAMP = { closed: 0xff3b2e, cycling: 0xffb347, open: 0x4dff88 } as const;

/** The mission computer in OPS-B: its bearing from the dome's middle (rad) and radius (m). */
const TERMINAL = { a: 0.95, r: 3.2 };

/** How far the airlock door slides up when it opens: all 2.1 m of it, past the lintel. */
const DOOR_RISE = 2.3;

/** How far a habitat's door stands in front of the middle of its dome, m. */
export const DOOR_Z = 6.72;

export function makeMoonBase(
  heightAt: (x: number, z: number) => number,
  lite: boolean,
  kit: Kit,
  sunDir: THREE.Vector3,
  lights?: LightPool,
): BaseHandle {
  const group = new THREE.Group();
  group.name = 'moon-base';
  // The base's lamps and screens are its own: its power can fail without the rover's.
  const baseKit: Kit = { ...kit, mat: { ...kit.mat } };
  const lampMats = ['amber', 'cool', 'green', 'screen', 'work'] as const;
  for (const k of lampMats) baseKit.mat[k] = kit.mat[k].clone();
  const m = baseKit.mat;
  const colliders: Collider[] = [];
  const pois: PointOfInterest[] = [];
  let releaseLander: (() => void) | null = null;
  let disposed = false;
  const airlocks: Airlock[] = [];
  const textures: THREE.Texture[] = [];
  const std = (p: THREE.MeshStandardMaterialParameters) => { const x = new THREE.MeshStandardMaterial(p); owned.push(x); return x; };
  const owned: THREE.Material[] = [];
  // Inside the habitats.
  const innerWall = std({ color: 0xb4b2ab, roughness: 0.95, metalness: 0, side: THREE.BackSide });
  const chamber = std({ color: 0x9aa0a8, roughness: 0.6, side: THREE.BackSide });
  const locker = std({ color: 0xb9bdc3, roughness: 0.5, metalness: 0.3 });
  const lockerDark = std({ color: 0x2e3238, roughness: 0.5, metalness: 0.4 });
  const roomLight = std({ color: 0xffffff, emissive: new THREE.Color(0xfff3dc), emissiveIntensity: 2.2 });
  const bedding = std({ color: 0x1f3f8a, roughness: 0.95, metalness: 0 });
  const pillow = std({ color: 0xeeeee8, roughness: 0.95, metalness: 0 });
  const wood = std({ color: 0x8a6a48, roughness: 0.7, metalness: 0 });
  const leaf = std({ color: 0x3e8a35, roughness: 0.8 });
  const soil = std({ color: 0x3b2c22, roughness: 1 });
  const beacon = std({ color: 0x2a1a06, emissive: new THREE.Color(0xffb347), emissiveIntensity: 2 });
  // The warm structural trim the reference sheets run along every module
  // seam and frame: worn ochre anodising, not the lander's bright foil.
  const trim = std({ color: 0xa8873f, roughness: 0.62, metalness: 0.5 });
  const mesh = kit.mesh;
  const noShadow = <T extends THREE.Mesh>(o: T) => { o.castShadow = false; return o; };
  const place = (x: number, z: number, yaw = 0): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = yaw;
    group.add(g);
    return g;
  };
  const seg = lite ? 24 : 40;

  // ── Habitats. ──
  interface Hab { id: string; x: number; z: number; yaw: number; cy: number; glow: number; airlock: Airlock }
  const habs: Hab[] = [];
  const habColliders = new Set<Collider>();
  const habCollider = (c: Collider) => { colliders.push(c); habColliders.add(c); };
  /** Floor levels in a habitat's own frame: the deck over the skirt,
   *  the airlock landing, and the ramp running down from it. */
  const FLOOR = 1.95;
  const LANDING = 1.74;
  const DOME_R = 5.0;
  const RAMP_END = 11.9;
  const rampY = (lz: number) => LANDING - (lz - 6.7) * (1.56 / 5.2);
  /** The gap left in the drum for the doorway, centred on the airlock. */
  const DOOR_GAP = 0.42;
  const DOOR_HALF = 1.05;
  const APRON = 3.4;
  /** The module, as the reference sheets draw it: a faceted drum on a skirt,
   *  a shoulder taper, a glazed penthouse ring and a shallow cap. */
  const FACETS = 16;
  const SHELL_R = 5.4;
  const DRUM_TOP = 6.2;
  const SHOULDER_TOP = 7.1;
  const PENT_R = 3.3;
  const PENT_TOP = 8.3;
  const DOME_TOP = 9.0;
  /** The drum's flats sit inside its circumradius; anything laid on one goes there. */
  const FACE_R = SHELL_R * Math.cos(Math.PI / FACETS);
  /** The inside of the shell, and the deckhead under the shoulder. */
  const WALL_R = 5.25;
  const CEILING = DRUM_TOP - 0.15;
  /** Seam i of the drum, and the middle of facet i, measured from the door. */
  const FACET_SPAN = (Math.PI * 2 - DOOR_GAP) / FACETS;
  const seamAngle = (i: number) => DOOR_GAP / 2 + i * FACET_SPAN;
  const facetAngle = (i: number) => DOOR_GAP / 2 + (i + 0.5) * FACET_SPAN;
  const habitat = (x: number, z: number, yaw: number, id: string, code: string) => {
    const g = place(x, z, yaw);
    // Legs on pads, regolith banked over the feet.
    for (const [lx, lz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
      kit.cyl(g, 0.16, 0.2, 1.1, m.steel, lx, 0.55, lz, 10);
      kit.cyl(g, 0.6, 0.6, 0.08, m.steel, lx, 0.04, lz, 12);
      const berm = noShadow(mesh(g, new THREE.SphereGeometry(0.9, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), m.regolith, lx, -0.04, lz));
      berm.scale.set(1, 0.3, 1);
    }
    mesh(g, new THREE.CylinderGeometry(5.4, 5.6, 0.9, seg), m.shellDusty, 0, 1.5, 0);
    // Equipment on the skirt and radiators standing off it, all clear of the door.
    for (const a of [1.9, -1.9, Math.PI]) {
      const box = new THREE.Group();
      box.position.set(Math.sin(a) * 5.55, 1.5, Math.cos(a) * 5.55);
      box.rotation.y = a;
      g.add(box);
      kit.rbox(box, 1.0, 0.62, 0.32, 0.04, m.anodised, 0, 0, 0.12);
      noShadow(kit.box(box, 0.07, 0.06, 0.02, m.green, 0.36, 0.18, 0.29));
    }
    for (const a of [2.6, -2.6]) {
      const rad = new THREE.Group();
      rad.position.set(Math.sin(a) * 6.3, 0, Math.cos(a) * 6.3);
      rad.rotation.y = a;
      g.add(rad);
      kit.box(rad, 2.0, 1.3, 0.05, m.radiator, 0, 1.25, 0);
      for (const sx of [-0.85, 0.85]) kit.strut(rad, sx, 0, 0.35, sx, 0.62, 0, 0.04, m.steel);
    }
    // The pressure shell: a faceted drum with the doorway left out of it
    // where the airlock module covers it, a shoulder up to the glazed
    // penthouse ring, and the cap over that. Cylinder θ runs from +Z, so
    // the gap sits on the door's own centreline.
    mesh(g, new THREE.CylinderGeometry(SHELL_R, SHELL_R, DRUM_TOP - FLOOR, FACETS, 1, true, DOOR_GAP / 2, Math.PI * 2 - DOOR_GAP), m.shell, 0, (DRUM_TOP + FLOOR) / 2, 0);
    mesh(g, new THREE.CylinderGeometry(PENT_R, SHELL_R, SHOULDER_TOP - DRUM_TOP, FACETS, 1, true), m.shell, 0, (SHOULDER_TOP + DRUM_TOP) / 2, 0);
    mesh(g, new THREE.CylinderGeometry(PENT_R, PENT_R, PENT_TOP - SHOULDER_TOP, FACETS, 1, true), m.shellDusty, 0, (PENT_TOP + SHOULDER_TOP) / 2, 0);
    noShadow(mesh(g, new THREE.SphereGeometry(PENT_R, FACETS, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.shell, 0, PENT_TOP, 0)).scale.set(1, (DOME_TOP - PENT_TOP) / PENT_R, 1);
    // Panel battens down every facet seam and the belt rails round it — the
    // warm trim the sheets carry at every edge.
    for (let i = 0; i <= FACETS; i++) {
      const a = seamAngle(i);
      const batten = noShadow(mesh(g, new THREE.BoxGeometry(0.1, DRUM_TOP - FLOOR - 0.1, 0.07), trim, Math.sin(a) * (SHELL_R - 0.02), (DRUM_TOP + FLOOR) / 2, Math.cos(a) * (SHELL_R - 0.02)));
      batten.rotation.y = a;
    }
    for (const [yh, r] of [[FLOOR + 0.12, SHELL_R], [DRUM_TOP - 0.12, SHELL_R], [PENT_TOP - 0.1, PENT_R]] as const) {
      noShadow(mesh(g, new THREE.TorusGeometry(r, 0.055, 4, FACETS), trim, 0, yh, 0)).rotation.x = Math.PI / 2;
    }
    // The penthouse ring's windows, between its uprights.
    for (let i = 0; i < FACETS / 2; i++) {
      const a = (i / (FACETS / 2)) * Math.PI * 2 + Math.PI / FACETS;
      const win = noShadow(mesh(g, new THREE.PlaneGeometry(0.9, 0.62), m.glass, Math.sin(a) * (PENT_R + 0.02), (PENT_TOP + SHOULDER_TOP) / 2 + 0.05, Math.cos(a) * (PENT_R + 0.02)));
      win.rotation.y = a;
    }
    // The hard collar on top: hatch, whip, beacon.
    kit.cyl(g, 1.25, 1.4, 0.36, m.shell, 0, DOME_TOP - 0.06, 0, seg);
    kit.cyl(g, 0.62, 0.62, 0.12, m.anodised, 0, DOME_TOP + 0.18, 0, 20);
    kit.cyl(g, 0.012, 0.02, 1.3, m.steel, 0.85, DOME_TOP + 0.75, 0.25, 6);
    noShadow(mesh(g, new THREE.SphereGeometry(0.14, 10, 8), beacon, 0, DOME_TOP + 0.34, 0));
    // Markings on the flank: the five-cross flag, the wordmark, the module's code.
    const flagTex = georgianFlag();
    textures.push(flagTex);
    for (const [facet, mt, w, h] of [[3, std({ map: flagTex, roughness: 0.85 }), 1.5, 1.0], [12, kit.logo, 2.0, 0.5]] as const) {
      const a = facetAngle(facet);
      const decal = noShadow(mesh(g, new THREE.PlaneGeometry(w, h), mt, Math.sin(a) * (FACE_R + 0.02), 4.4, Math.cos(a) * (FACE_R + 0.02)));
      decal.rotation.y = a;
    }
    // The airlock module: a faceted box trimmed at every corner as the sheets
    // draw it, the lit chamber behind the door, the door that slides up, its
    // lintel and status lamp.
    kit.box(g, 3.0, 2.8, 2.2, m.shell, 0, 2.8, 5.6);
    kit.box(g, 3.08, 0.16, 2.28, m.shellDusty, 0, 4.28, 5.6);
    for (const sx of [-1.52, 1.52]) {
      for (const lz of [4.52, 6.68]) kit.box(g, 0.1, 2.8, 0.1, trim, sx, 2.8, lz);
      kit.box(g, 0.1, 0.1, 2.2, trim, sx, 4.18, 5.6);
    }
    for (const lz of [4.52, 6.68]) kit.box(g, 3.04, 0.1, 0.1, trim, 0, 4.18, lz);
    mesh(g, new THREE.BoxGeometry(DOOR_HALF * 2, 2.2, 2.5), chamber, 0, 3.05, 5.5).castShadow = false;
    noShadow(mesh(g, new THREE.BoxGeometry(DOOR_HALF * 2, 0.06, 2.5), m.deck, 0, FLOOR, 5.5));
    noShadow(kit.box(g, 0.8, 0.04, 0.8, m.cool, 0, 3.7, 5.9));
    // The doorway reads as a recess: a dark surround, then the hatch in it.
    noShadow(kit.box(g, DOOR_HALF * 2 + 0.26, 2.5, 0.06, m.carbon, 0, 2.85, DOOR_Z - 0.06));
    const door = keep(mesh(g, new THREE.BoxGeometry(DOOR_HALF * 2 - 0.1, 2.1, 0.1), m.anodised, 0, 2.65, DOOR_Z));
    mesh(door, new THREE.BoxGeometry(0.34, 0.34, 0.06), m.glass, 0.0, 0.55, 0.06);
    noShadow(kit.box(door, DOOR_HALF * 2 - 0.3, 0.05, 0.03, trim, 0, -0.5, 0.07));
    kit.box(g, DOOR_HALF * 2 + 0.3, 0.14, 0.18, m.anodised, 0, 3.8, DOOR_Z);
    // The housing the door rises into: it clears the whole doorway, out of sight.
    kit.box(g, DOOR_HALF * 2 + 0.3, DOOR_RISE, 0.34, m.shell, 0, 3.8 + DOOR_RISE / 2, DOOR_Z + 0.02);
    const lamp = std({ color: 0x100404, emissive: new THREE.Color(LAMP.closed), emissiveIntensity: 1.8, roughness: 0.4 });
    noShadow(mesh(g, new THREE.BoxGeometry(0.9, 0.07, 0.05), lamp, 0, 4.02, DOOR_Z + 0.21));
    // The control panel beside the door, and the handrails.
    const cp = kit.rbox(g, 0.36, 0.5, 0.1, 0.03, m.carbon, 1.3, 2.75, DOOR_Z + 0.06);
    noShadow(mesh(cp, new THREE.PlaneGeometry(0.26, 0.2), m.screen, 0, 0.08, 0.055));
    noShadow(mesh(cp, new THREE.BoxGeometry(0.08, 0.08, 0.03), lamp, 0, -0.14, 0.05));
    for (const sx of [-1.42, 1.62]) kit.strut(g, sx, 2.1, DOOR_Z + 0.14, sx, 3.4, DOOR_Z + 0.14, 0.022, m.alu);
    const idPlate = noShadow(mesh(g, new THREE.PlaneGeometry(1.4, 0.35), kit.label([code], { w: 256, h: 64 }), 1.515, 3.3, 5.6));
    idPlate.rotation.y = Math.PI / 2;
    const logo = noShadow(mesh(g, new THREE.PlaneGeometry(1.6, 0.4), kit.logo, -1.515, 3.3, 5.6));
    logo.rotation.y = -Math.PI / 2;
    const airlock: Airlock = { habitat: id, x: x + Math.sin(yaw) * DOOR_Z, z: z + Math.cos(yaw) * DOOR_Z, yaw, panel: door, open: 0, state: 'closed', cycle: 0, lamp };
    airlocks.push(airlock);
    // The ramp, its cleats, rails and landing, a hazard strip at the foot.
    const ramp = mesh(g, new THREE.BoxGeometry(DOOR_HALF * 2 + 0.3, 0.12, 5.2), m.deck, 0, 0.9, 9.3);
    ramp.rotation.x = Math.atan2(1.5, 5);
    for (let i = 0; i < 9; i++) {
      const cleat = noShadow(mesh(g, new THREE.BoxGeometry(DOOR_HALF * 2, 0.04, 0.09), m.steel, 0, 1.63 - i * 0.174, 7.1 + i * 0.58));
      cleat.rotation.x = Math.atan2(1.5, 5);
    }
    for (const s of [-1, 1]) {
      const rail = mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 5.3, 6), m.alu, s * (DOOR_HALF + 0.12), 1.75, 9.3);
      rail.rotation.x = Math.PI / 2 + Math.atan2(1.5, 5);
      for (let i = 0; i < 4; i++) mesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), m.steel, s * (DOOR_HALF + 0.12), 1.2 - i * 0.26, 7.6 + i * 1.3);
    }
    mesh(g, new THREE.BoxGeometry(DOOR_HALF * 2 + 0.3, 0.12, 1.2), m.deck, 0, 1.68, 6.9);
    noShadow(mesh(g, new THREE.BoxGeometry(DOOR_HALF * 2 + 0.3, 0.015, 0.3), m.hazard, 0, 0.02, RAMP_END + 0.2));
    habCollider({ x: x + Math.sin(yaw) * 9.3, z: z + Math.cos(yaw) * 9.3, r: 2.2 });
    // Two portholes, each set in the middle of its own facet.
    for (const facet of [2, 13]) {
      const pa = facetAngle(facet);
      const ph = new THREE.Group();
      ph.position.set(Math.sin(pa) * FACE_R, 4.4, Math.cos(pa) * FACE_R);
      ph.rotation.y = pa;
      g.add(ph);
      mesh(ph, new THREE.TorusGeometry(0.62, 0.09, 8, 20), m.alu);
      noShadow(mesh(ph, new THREE.CircleGeometry(0.58, 20), m.glass));
    }
    habCollider({ x, z, r: 5.9 });
    habCollider({ x: x + Math.sin(yaw) * 6.5, z: z + Math.cos(yaw) * 6.5, r: 1.5 });
    pois.push({ id, x: x + Math.sin(yaw) * 9, z: z + Math.cos(yaw) * 9, r: 6 });
    pois.push({ id, x, z, r: 5.3 });

    // ── Inside: the drum's wall seen from within under a flat deckhead, a
    // deck over the skirt, a ring of lockers clear of the door, a light ring,
    // and what the module is for. ──
    noShadow(mesh(g, new THREE.CylinderGeometry(WALL_R, WALL_R, CEILING - FLOOR, FACETS, 1, true, DOOR_GAP / 2, Math.PI * 2 - DOOR_GAP), innerWall, 0, (CEILING + FLOOR) / 2, 0));
    noShadow(mesh(g, new THREE.CircleGeometry(WALL_R, FACETS), innerWall, 0, CEILING, 0)).rotation.x = -Math.PI / 2;
    noShadow(mesh(g, new THREE.CylinderGeometry(DOME_R + 0.1, DOME_R + 0.1, 0.06, seg), m.deck, 0, FLOOR, 0));
    for (let i = 0; i < 4; i++) noShadow(mesh(g, new THREE.BoxGeometry(0.03, 0.005, DOME_R * 2), lockerDark, 0, FLOOR + 0.035, 0)).rotation.y = (i / 4) * Math.PI;
    noShadow(mesh(g, new THREE.TorusGeometry(2.7, 0.06, 8, seg), roomLight, 0, CEILING - 0.35, 0)).rotation.x = Math.PI / 2;
    noShadow(mesh(g, new THREE.CylinderGeometry(0.5, 0.5, 0.04, 20), roomLight, 0, CEILING - 0.1, 0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.6) continue;
      const unit = noShadow(mesh(g, new THREE.BoxGeometry(0.95, 1.9, 0.42), i % 3 === 0 ? lockerDark : locker, Math.sin(a) * 4.35, FLOOR + 0.98, Math.cos(a) * 4.35));
      unit.rotation.y = a + Math.PI;
      if (i % 3 === 1) noShadow(mesh(unit, new THREE.PlaneGeometry(0.62, 0.36), m.screen, 0, 0.4, 0.215));
      else noShadow(mesh(unit, new THREE.BoxGeometry(0.06, 0.4, 0.03), lockerDark, 0.3, 0, 0.22));
    }
    const at = (a: number, r: number, geometry: THREE.BufferGeometry, mt: THREE.Material, dy: number, dx = 0) => {
      const o = noShadow(mesh(g, geometry, mt, Math.sin(a) * r + Math.cos(a) * dx, FLOOR + dy, Math.cos(a) * r - Math.sin(a) * dx));
      o.rotation.y = a;
      return o;
    };
    if (id === 'habitatA') {
      for (const a of [1.7, 2.6, -1.7, -2.6]) {
        at(a, 3.5, new THREE.BoxGeometry(2.0, 0.34, 0.9), locker, 0.45);
        at(a, 3.5, new THREE.BoxGeometry(1.94, 0.1, 0.84), bedding, 0.67);
        at(a, 3.5, new THREE.BoxGeometry(0.5, 0.1, 0.5), pillow, 0.75, -0.7);
        at(a, 3.9, new THREE.BoxGeometry(2.0, 0.34, 0.9), locker, 1.55);
        at(a, 3.9, new THREE.BoxGeometry(1.94, 0.1, 0.84), bedding, 1.77);
      }
      at(0, 0, new THREE.CylinderGeometry(0.85, 0.85, 0.05, 24), wood, 0.78);
      at(0, 0, new THREE.CylinderGeometry(0.08, 0.12, 0.76, 10), m.steel, 0.38);
      for (const a of [0.6, 2.7, 4.8]) at(a, 1.35, new THREE.CylinderGeometry(0.2, 0.2, 0.46, 12), lockerDark, 0.23);
    } else if (id === 'habitatB') {
      // The mission computer: the day's work comes from here, behind the airlock.
      const pedestal = at(TERMINAL.a, TERMINAL.r, new THREE.CylinderGeometry(0.12, 0.2, 1.05, 12), m.anodised, 0.52);
      pedestal.castShadow = false;
      for (const [geometry, mt, dr] of [[new THREE.BoxGeometry(0.82, 0.54, 0.08), m.carbon, 0], [new THREE.PlaneGeometry(0.7, 0.42), m.screen, -0.05]] as const) {
        const o = at(TERMINAL.a, TERMINAL.r + dr, geometry, mt, 1.22);
        o.rotation.order = 'YXZ';
        o.rotation.set(-0.5, TERMINAL.a + Math.PI, 0);
      }
      at(TERMINAL.a, TERMINAL.r - 0.21, new THREE.PlaneGeometry(0.7, 0.14), kit.label(['MISSION COMPUTER']), 0.75).rotation.y = TERMINAL.a + Math.PI;
      for (const a of [2.1, -2.1]) {
        at(a, 3.3, new THREE.BoxGeometry(2.4, 0.9, 0.75), locker, 0.45);
        at(a, 3.3, new THREE.BoxGeometry(2.36, 0.04, 0.72), lockerDark, 0.92);
        at(a, 3.3, new THREE.CylinderGeometry(0.06, 0.08, 0.5, 10), m.steel, 1.17, 0.6);
        at(a, 3.3, new THREE.BoxGeometry(0.4, 0.3, 0.3), lockerDark, 1.1, -0.5);
        for (const dx of [-0.75, 0, 0.75]) at(a, 4.0, new THREE.PlaneGeometry(0.6, 0.38), m.screen, 1.75, dx).rotation.y = a + Math.PI;
      }
      at(Math.PI, 3.6, new THREE.BoxGeometry(2.6, 0.9, 0.7), locker, 0.45);
      at(Math.PI, 3.6, new THREE.BoxGeometry(2.56, 0.04, 0.66), lockerDark, 0.92);
      at(Math.PI, 3.6, new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), m.steel, 0.95, 0.7);
      at(Math.PI, 3.6, new THREE.BoxGeometry(0.34, 0.42, 0.34), lockerDark, 1.15, -0.8);
      at(-0.95, 4.3, new THREE.BoxGeometry(2.4, 1.5, 0.08), lockerDark, 1.85).rotation.y = -0.95 + Math.PI;
      const board = kit.label(['DEEP CORE', 'MAGNETIC ANOMALY 3', 'BEARING 312 · 118 M'], { w: 512, h: 320, bg: '#07141c', fg: '#5eead4', px: 40, emissive: 0.55 });
      at(-0.95, 4.24, new THREE.PlaneGeometry(2.2, 1.34), board, 1.85).rotation.y = -0.95 + Math.PI;
    } else {
      at(2.3, 3.4, new THREE.BoxGeometry(2.0, 0.55, 0.85), pillow, 0.5);
      at(2.3, 3.4, new THREE.BoxGeometry(2.0, 0.08, 0.85), locker, 0.2);
      at(2.3, 3.4, new THREE.BoxGeometry(0.45, 0.1, 0.5), bedding, 0.82, -0.7);
      at(2.3, 4.1, new THREE.PlaneGeometry(0.7, 0.42), m.screen, 1.85).rotation.y = 2.3 + Math.PI;
      at(-2.3, 3.2, new THREE.BoxGeometry(0.85, 0.22, 1.9), m.rubber, 0.11);
      at(-2.3, 3.2, new THREE.BoxGeometry(0.3, 0.9, 0.06), m.steel, 0.6, 0.55);
      at(-2.3, 3.2, new THREE.BoxGeometry(0.3, 0.9, 0.06), m.steel, 0.6, -0.55);
      at(-2.3, 3.2, new THREE.BoxGeometry(1.3, 0.06, 0.06), m.steel, 1.03);
      at(Math.PI, 3.8, new THREE.BoxGeometry(1.8, 1.9, 0.5), locker, 0.95);
      at(Math.PI, 3.8, new THREE.PlaneGeometry(1.6, 1.2), m.glass, 1.05);
      at(Math.PI + 0.9, 3.4, new THREE.CylinderGeometry(0.16, 0.16, 1.0, 12), m.steel, 0.5);
      at(Math.PI + 0.9, 3.4, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), lockerDark, 1.02);
    }
    habs.push({ id, x, z, yaw, cy: g.position.y, glow: 0, airlock });
  };
  const px = PAD_CENTER.x; const pz = PAD_CENTER.y;
  habitat(px - 21, pz - 12, 0.28, 'habitatA', 'HAB-A · 01');
  habitat(px, pz - 20, 0, 'habitatB', 'OPS-B · 02');
  habitat(px + 21, pz - 12, -0.28, 'habitatC', 'MED-C · 03');

  // ── Pressurised tunnels between the domes: a segmented shell with a
  // glazed strip down each side over the grow beds. ──
  const tunnel = (x: number, z: number, yaw: number, len: number) => {
    const g = place(x, z, yaw);
    // Angles measured from the top: turned onto its side about X, a
    // cylinder's own θ = π/2 is what points up.
    const shellPart = (from: number, span: number, mt: THREE.Material) => {
      const o = mesh(g, new THREE.CylinderGeometry(2.2, 2.2, len, seg, 1, true, from + Math.PI / 2, span), mt, 0, 0.75, 0);
      o.rotation.z = Math.PI / 2;
      return o;
    };
    shellPart(-0.55, 1.1, m.shellDusty);
    noShadow(shellPart(0.55, 0.35, m.glass));
    shellPart(0.9, 0.7, m.shellDusty);
    noShadow(shellPart(-0.9, 0.35, m.glass));
    shellPart(-1.6, 0.7, m.shellDusty);
    for (let i = 0; i <= 3; i++) {
      const rib = mesh(g, new THREE.TorusGeometry(2.25, 0.07, 6, seg, Math.PI), m.anodised, -len / 2 + (i / 3) * len, 0.75, 0);
      rib.rotation.y = Math.PI / 2;
    }
    mesh(g, new THREE.BoxGeometry(len, 0.5, 4.6), m.shellDusty, 0, 0.45, 0);
    for (const s of [-1, 1]) {
      noShadow(mesh(g, new THREE.BoxGeometry(len - 0.6, 0.5, 1.3), soil, 0, 0.95, s * 1.25));
      for (let k = 0; k < Math.floor(len / 1.1); k++) {
        const leafy = noShadow(mesh(g, new THREE.SphereGeometry(0.4, 8, 6), leaf, -len / 2 + 0.8 + k * 1.1, 1.42, s * 1.25));
        leafy.scale.set(1, 0.7, 1);
      }
      noShadow(mesh(g, new THREE.BoxGeometry(len - 0.6, 0.04, 0.06), roomLight, 0, 2.5, s * 1.2));
    }
    colliders.push({ x, z, r: len / 2 });
  };
  tunnel(px - 10.5, pz - 15.5, 0.36, 9);
  tunnel(px + 10.5, pz - 15.5, -0.36, 9);
  pois.push({ id: 'greenhouse', x: px - 10.5, z: pz - 10, r: 5 });
  pois.push({ id: 'greenhouse', x: px + 10.5, z: pz - 10, r: 5 });

  // ── The horizontal capsule modules of the reference sheets: a laid-up
  // cylinder on a low frame, trimmed at both ends, its window band down one
  // flank, a hatch at the end the corridor comes in at. They stand on the
  // arms off OPS-B, which is what gives the outpost its radial plan. ──
  const CAP_R = 2.1;
  const capsule = (x: number, z: number, yaw: number, len: number, id: string, code: string) => {
    const g = place(x, z, yaw);
    const half = len / 2;
    // The shell runs along local Z, so the corridor meets it end-on.
    const shell = mesh(g, new THREE.CylinderGeometry(CAP_R, CAP_R, len, FACETS, 1, true), m.shell, 0, 1.55, 0);
    shell.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      kit.cyl(g, CAP_R, CAP_R, 0.12, m.shellDusty, 0, 1.55, s * half, FACETS).rotation.x = Math.PI / 2;
      noShadow(mesh(g, new THREE.TorusGeometry(CAP_R, 0.06, 4, FACETS), trim, 0, 1.55, s * (half - 0.1))).rotation.y = Math.PI / 2;
    }
    // Battens down the flanks, and the window band on the sunward side.
    for (let i = 0; i < FACETS; i++) {
      const a = (i / FACETS) * Math.PI * 2;
      const batten = noShadow(mesh(g, new THREE.BoxGeometry(0.07, len - 0.3, 0.06), trim, Math.sin(a) * (CAP_R - 0.01), 1.55 + Math.cos(a) * (CAP_R - 0.01), 0));
      batten.rotation.set(Math.PI / 2, 0, -a, 'ZYX');
    }
    for (let k = 0; k < 3; k++) {
      const win = noShadow(mesh(g, new THREE.PlaneGeometry(0.8, 0.5), m.glass, CAP_R * 0.99, 2.2, -half + len * (k + 1) / 4));
      win.rotation.y = Math.PI / 2;
    }
    // The frame it stands on, and the hatch at the corridor end.
    for (const s of [-1, 1]) {
      kit.box(g, 0.18, 1.1, 0.18, m.steel, s * 1.45, 0.55, half - 1.0);
      kit.box(g, 0.18, 1.1, 0.18, m.steel, s * 1.45, 0.55, -half + 1.0);
    }
    kit.box(g, 3.2, 0.2, len - 1.2, m.anodised, 0, 1.05, 0);
    kit.rbox(g, 1.5, 1.8, 0.14, 0.05, m.shellDusty, 0, 1.5, -half - 0.08);
    noShadow(kit.box(g, 0.5, 0.06, 0.04, m.cool, 0, 2.25, -half - 0.16));
    const plate = noShadow(mesh(g, new THREE.PlaneGeometry(1.7, 0.42), kit.label([code], { w: 256, h: 64 }), -CAP_R * 0.99, 2.2, 0));
    plate.rotation.y = -Math.PI / 2;
    colliders.push({ x, z, r: half + 0.4 });
    pois.push({ id, x, z, r: 6 });
  };
  /** A capsule on an arm off a habitat: turned to face it, with the corridor
   *  run from the habitat's shell to the capsule's near end cap. */
  const arm = (hx: number, hz: number, cx: number, cz: number, len: number, id: string, code: string) => {
    const dx = cx - hx; const dz = cz - hz;
    const d = Math.hypot(dx, dz);
    // The capsule's own −Z is its hatch end, so it looks back down the arm.
    capsule(cx, cz, Math.atan2(dx / d, dz / d), len, id, code);
    const from = SHELL_R - 0.3; const to = d - len / 2 - 0.1;
    tunnel(hx + (dx / d) * (from + to) / 2, hz + (dz / d) * (from + to) / 2, Math.atan2(-dz, dx), to - from);
  };
  arm(px, pz - 20, px - 13, pz - 28, 8.4, 'lab', 'LAB-D · 04');
  arm(px, pz - 20, px + 13, pz - 28, 8.4, 'store', 'STO-E · 05');

  // ── The working outpost, and the rover parked in its bay. ──
  const zones = buildZones(baseKit, group, heightAt, colliders, pois, sunDir);
  // Where the crew stands to use the mission computer: in OPS-B, in front of it.
  {
    const ops = habs.find((h) => h.id === 'habitatB')!;
    const r = TERMINAL.r - 0.8;
    const c = Math.cos(ops.yaw); const s = Math.sin(ops.yaw);
    const lx = Math.sin(TERMINAL.a) * r; const lz = Math.cos(TERMINAL.a) * r;
    zones.anchors.scienceTerminal = { x: ops.x + lx * c + lz * s, z: ops.z - lx * s + lz * c, y: ops.cy + FLOOR, yaw: ops.yaw + TERMINAL.a + Math.PI };
  }
  const builtRover = buildRover(kit, lite);
  const rover = builtRover.group;
  const bay = zones.anchors.serviceBay;
  rover.position.set(bay.x, heightAt(bay.x, bay.z), bay.z);
  rover.rotation.y = bay.yaw;
  group.add(rover);
  const roverCollider: Collider = { x: bay.x, z: bay.z, r: 1.9 };
  colliders.push(roverCollider);
  pois.push({ id: 'rover', x: bay.x, z: bay.z, r: 5.5 });
  const roverParts = builtRover.parts;

  // ── The first crew's lander, out past the landing zone where it came
  // down: the same vehicle the crew flies, left standing, with its plaque. ──
  {
    const g = place(px - 22, pz + 36, 0.4);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const lx = Math.sin(a) * 3.1; const lz = Math.cos(a) * 3.1;
      noShadow(mesh(g, new THREE.SphereGeometry(1.0, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), m.regolith, lx, -0.05, lz)).scale.set(1, 0.22, 1);
    }
    noShadow(mesh(g, new THREE.PlaneGeometry(1.3, 0.34), kit.label(['STELLAR I · 2031'], { w: 256, h: 64 }), 0, 1.7, 1.96));
    acquireModel(LANDER_MODEL, true).then((handle) => {
      if (disposed) { handle.release(); return; }
      releaseLander = handle.release;
      const shell = handle.scene.clone(true);
      shell.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = !lite; } });
      g.add(shell);
    }, () => undefined);
    colliders.push({ x: px - 22, z: pz + 36, r: 3.4 });
    pois.push({ id: 'lander', x: px - 22, z: pz + 36, r: 7 });
  }

  // ── The flag. ──
  {
    const g = place(px + 3, pz + 18, 0);
    kit.cyl(g, 0.02, 0.025, 2.6, m.alu, 0, 1.3, 0, 8);
    kit.cylX(g, 0.015, 1.25, m.alu, 0.62, 2.55, 0, 6);
    const tex = georgianFlag();
    textures.push(tex);
    const fm = std({ map: tex, roughness: 0.8, side: THREE.DoubleSide });
    const flag = mesh(g, new THREE.PlaneGeometry(1.2, 0.8, 12, 4), fm, 0.62, 2.14, 0);
    const fp = flag.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 7) * 0.03 * (fp.getX(i) + 0.6));
    flag.geometry.computeVertexNormals();
    pois.push({ id: 'flag', x: px + 3, z: pz + 18, r: 3.5 });
  }

  // ── The base sign. ──
  {
    const g = place(px, pz + 12, 0);
    for (const s of [-1, 1]) kit.cyl(g, 0.04, 0.04, 2.2, m.steel, s * 1.3, 1.1, 0, 8);
    const signMat = kit.label(['STELLAR BASE', 'ASTROMAN · TBILISI', '41.71 N · 44.83 E'], { w: 512, h: 256, px: 38 });
    const face = noShadow(mesh(g, new THREE.PlaneGeometry(2.8, 1.4), signMat, 0, 1.75, -0.03));
    face.rotation.y = Math.PI;
    kit.box(g, 2.9, 1.5, 0.04, m.carbon, 0, 1.75, 0);
    colliders.push({ x: px, z: pz + 12, r: 1.7 });
    pois.push({ id: 'sign', x: px, z: pz + 13, r: 3 });
  }

  // Fold the outpost into a few draw calls per material. The rover's
  // articulated parts, the array heads, the dish and the airlock doors keep moving.
  rover.traverse((o) => { if ((o as THREE.Group).isGroup) pivot(o); });
  const merged = mergeStatic(group, { cell: 48, minCaster: 0.3 });

  const spawn = new THREE.Vector3(px, heightAt(px, pz + 4), pz + 4);
  const roverPoi = pois.find((p) => p.id === 'rover')!;
  const walkColliders = colliders.filter((c) => !habColliders.has(c));

  // ── Standing on a habitat. ──
  const lp = { x: 0, z: 0 };
  const local = (h: Hab, x: number, z: number) => {
    const dx = x - h.x; const dz = z - h.z;
    const c = Math.cos(h.yaw); const s = Math.sin(h.yaw);
    lp.x = dx * c - dz * s;
    lp.z = dx * s + dz * c;
  };
  const structure = (h: Hab, lx: number, lz: number): number | null => {
    if (Math.hypot(lx, lz) < DOME_R) return h.cy + FLOOR;
    if (Math.abs(lx) < DOOR_HALF) {
      if (lz >= 4.2 && lz < 6.75) return h.cy + FLOOR;
      if (lz >= 6.75 && lz < 7.5) return h.cy + LANDING;
      if (lz >= 7.5 && lz <= RAMP_END) return h.cy + rampY(lz);
    }
    return null;
  };
  const floorAt = (x: number, z: number): number | null => {
    for (const h of habs) {
      local(h, x, z);
      if (Math.hypot(lp.x, lp.z) > 13) continue;
      const y = structure(h, lp.x, lp.z);
      if (y !== null) return y;
    }
    return null;
  };
  const ceilingAt = (x: number, z: number): number | null => {
    for (const h of habs) {
      local(h, x, z);
      const r = Math.hypot(lp.x, lp.z);
      if (r < DOME_R) return h.cy + CEILING;
      if (Math.abs(lp.x) < DOOR_HALF && lp.z >= 4.2 && lp.z < 6.75) return h.cy + 4.1;
    }
    return null;
  };
  const blocked = (x: number, y: number, z: number): boolean => {
    for (const h of habs) {
      local(h, x, z);
      const lx = lp.x; const lz = lp.z;
      const r = Math.hypot(lx, lz);
      if (r > 16) continue;
      const doorway = Math.abs(lx) < DOOR_HALF && lz > 3.8;
      // The shell, the deck under it, and the roof over it.
      if (r < 5.8 && !doorway) {
        if (y < h.cy + FLOOR + 0.05 && r < DOME_R) return true;
        if (y < h.cy + DOME_TOP && y > h.cy + FLOOR && r > WALL_R - 0.15) return true;
        if (y > h.cy + CEILING - 0.1 && y < h.cy + DOME_TOP) return true;
      }
      // The airlock module: solid but for its chamber.
      if (Math.abs(lx) < 1.65 && lz > 4.3 && lz < 6.95 && y > h.cy + 1.8 && y < h.cy + 4.45) {
        // The chamber is drawn as a box seen from within, so a camera in its
        // dome-side half would look at its back face: only the door half is open to it.
        const chamber = Math.abs(lx) < DOOR_HALF - 0.05 && lz > 5.0 && lz < 6.75 && y < h.cy + 4.0 && y > h.cy + FLOOR + 0.05;
        if (!chamber) return true;
      }
    }
    return false;
  };
  const worldOf = (h: Hab, lx: number, ly: number, lz: number) => {
    const c = Math.cos(h.yaw); const s = Math.sin(h.yaw);
    return { x: h.x + lx * c + lz * s, y: h.cy + ly, z: h.z - lx * s + lz * c };
  };
  const doorway = (a: Airlock): Doorway => {
    const h = habs.find((hh) => hh.airlock === a) ?? habs[0];
    return { outside: worldOf(h, 0, rampY(7.7), 7.7), chamber: worldOf(h, 0, FLOOR, 5.4), inside: worldOf(h, 0, FLOOR, 2.8), yawIn: h.yaw + Math.PI };
  };
  /** Going indoors takes walking at the door and cycling the lock: the apron
   *  in front of the ramp gathers an approach onto the centreline, and a shut
   *  door holds the walker on the side they are on. */
  const RAIL = DOOR_HALF - 0.14;
  const confine = (p: { x: number; z: number }) => {
    for (const h of habs) {
      local(h, p.x, p.z);
      let lx = lp.x; let lz = lp.z;
      const r = Math.hypot(lx, lz);
      if (r > 16) continue;
      let moved = false;
      if (structure(h, lx, lz) !== null) {
        if (r < DOME_R) {
          const doorway = Math.abs(lx) < DOOR_HALF && lz > 3.8;
          if (!doorway && r > DOME_R - 0.55) { const k = (DOME_R - 0.55) / r; lx *= k; lz *= k; moved = true; }
        } else if (Math.abs(lx) > RAIL) {
          lx = Math.sign(lx) * RAIL; moved = true;
        }
        if (h.airlock.open < 0.85 && Math.abs(lx) < DOOR_HALF && lz > DOOR_Z - 0.38 && lz < DOOR_Z + 0.38) {
          lz = lz < DOOR_Z ? DOOR_Z - 0.38 : DOOR_Z + 0.38;
          moved = true;
        }
      } else if (r < 5.95 && !(Math.abs(lx) < DOOR_HALF && lz > 4.0)) {
        const k = 5.95 / r; lx *= k; lz *= k; moved = true;
      } else if (Math.abs(lx) < 1.6 && lz > 4.0 && lz < RAMP_END - 0.4) {
        lx = Math.abs(lx) < 1.32 ? Math.sign(lx || 1) * (DOOR_HALF - 0.1) : Math.sign(lx || 1) * 1.6;
        moved = true;
      } else if (lz >= RAMP_END - 0.4 && lz < RAMP_END + APRON && Math.abs(lx) < 2.8) {
        const pull = 1 - (lz - (RAMP_END - 0.4)) / (APRON + 0.4);
        lx *= 1 - 0.55 * pull * pull;
        moved = true;
      }
      if (moved) {
        const c = Math.cos(h.yaw); const s = Math.sin(h.yaw);
        p.x = h.x + lx * c + lz * s;
        p.z = h.z - lx * s + lz * c;
      }
    }
  };

  const setLamp = (a: Airlock) => a.lamp.emissive.setHex(LAMP[a.state]);
  // ── Power: everything that runs off the base scales by one level that
  // eases (with a stutter on the way back), so a brown-out reads at 50 m. ──
  const state: BaseState = { power: true, dishAligned: true, domeOpen: false, charging: true };
  const powered = [m.amber, m.cool, m.green, m.screen, m.work, roomLight].map((mt) => ({ mt, full: mt.emissiveIntensity }));
  let powerK = 1; let shownK = 1;
  const DISH_OFF = { yaw: 0.6, pitch: -0.25 };

  const handle: BaseHandle = {
    state,
    setState(next) {
      Object.assign(state, next);
      zones.dishFault.yaw = state.dishAligned ? 0 : DISH_OFF.yaw;
      zones.dishFault.pitch = state.dishAligned ? 0 : DISH_OFF.pitch;
      zones.setDome(state.domeOpen);
      zones.setCharging(state.charging && state.power);
    },
    group, colliders, walkColliders, pois, spawn, airlocks, rover, roverCollider, roverParts, zones, floorAt, ceilingAt, blocked, doorway, confine, inside: null,
    cycleAirlock(a) {
      if (a.state === 'closed') { a.state = 'cycling'; a.cycle = 0; }
      else if (a.state === 'open') a.state = 'closed';
      setLamp(a);
    },
    update(dt, t, earthDir, crewX, crewZ) {
      const want = state.power ? 1 : 0;
      powerK += (want - powerK) * (1 - Math.exp(-dt * (state.power ? 2.2 : 6)));
      const k = state.power && powerK < 0.9 && Math.sin(t * 31) > 0.2 ? powerK * 0.35 : powerK;
      if (Math.abs(k - shownK) > 1e-3) {
        shownK = k;
        for (const p of powered) p.mt.emissiveIntensity = p.full * k;
        zones.power.k = k;
      }
      let inside: Inside | null = null;
      for (const h of habs) {
        local(h, crewX, crewZ);
        const r = Math.hypot(lp.x, lp.z);
        const here = r < DOME_R || (Math.abs(lp.x) < DOOR_HALF && lp.z >= 4.2 && lp.z < 6.75);
        if (here) inside = { id: h.id, x: h.x, z: h.z, y: h.cy + FLOOR, pressurised: true };
        h.glow += ((here ? 1 : 0) - h.glow) * (1 - Math.exp(-dt * 3));
        if (h.glow > 0.01 && shownK > 0.02) lights?.request(h.x, h.cy + 4.6, h.z, 0xfff1dc, h.glow * 1.9 * shownK, 22, 1.5);
      }
      handle.inside = inside;
      beacon.emissiveIntensity = (Math.sin(t * 2.2) > 0.6 ? 1 : 0.15) * 2 * shownK;
      for (const a of airlocks) {
        if (a.state === 'cycling') {
          a.cycle = Math.min(1, a.cycle + dt / CYCLE_SECONDS);
          a.lamp.emissiveIntensity = Math.sin(t * 14) > 0 ? 2.2 : 0.4;
          if (a.cycle >= 1) { a.state = 'open'; a.lamp.emissiveIntensity = 1.8; setLamp(a); }
        } else if (a.state === 'open' && Math.hypot(crewX - a.x, crewZ - a.z) > 8.5) {
          a.state = 'closed';
          setLamp(a);
        }
        a.open += ((a.state === 'open' ? 1 : 0) - a.open) * (1 - Math.exp(-dt * 3.2));
        a.panel.position.y = 2.65 + a.open * DOOR_RISE;
      }
      zones.update(dt, t, earthDir);
      roverPoi.x = roverCollider.x;
      roverPoi.z = roverCollider.z;
    },
    dispose() {
      disposed = true;
      releaseLander?.();
      for (const g of merged.geometries) g.dispose();
      for (const o of owned) o.dispose();
      for (const k of lampMats) m[k].dispose();
      for (const tx of textures) tx.dispose();
      zones.dispose();
      builtRover.dispose();
    },
  };
  return handle;
}
