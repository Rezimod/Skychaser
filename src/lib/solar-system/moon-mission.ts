// The expedition: one long job of work on the surface, in five acts.
//
// The mission computer in the geology lab has a magnetic anomaly on the
// survey map. The crew goes out with a bearing and a rough range, and a
// scanner that finds the exact spot. The drill wants a steady hand: feed it
// too hard and the load and heat climb, too gently and it barely bites. The
// core comes up with metal in it that has no business being there, and its
// signature points across the mare to a crater nobody has walked. Under the
// regolith there is a hull. Clear it patch by patch, the seam finds its
// power, the hatch unlocks, and the crew opens it.
//
// This file owns the props — the survey marker, the drill rig, the buried
// craft — the interactions on them, and the state machine. Progress is kept
// in localStorage; a crew that has made contact comes back to a craft that is
// still lit and a rover with the fourth gear.

import * as THREE from 'three';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { DustBurst, DustHandle } from '@/lib/solar-system/moon-fx';
import { fbm } from '@/lib/solar-system/moon-terrain';
import { keep, mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import type { LightPool } from '@/lib/solar-system/moon-lights';
import type { Interactable } from '@/lib/solar-system/moon-interactions';

export type MissionStage = 'survey' | 'drill' | 'trace' | 'excavate' | 'contact' | 'done';
export type MissionTask = '' | 'scan' | 'drill' | 'clear' | 'open';

export interface DrillTelemetry {
  engaged: boolean;
  /** Metres of core drawn. */
  depth: number;
  /** Bit load and temperature, 0…1; the green band is DRILL_BAND. */
  load: number;
  heat: number;
  /** Overheated: the bit stops until it cools. */
  stalled: boolean;
  /** The core is out and waiting in the tray. */
  ready: boolean;
  /** In a hard basalt layer. */
  hard: boolean;
}

export interface MissionTelemetry {
  stage: MissionStage;
  /** The line on the glass, a key under `solarSystem.moon.mission`. */
  objective: string;
  /** Range and world bearing to where the crew is being sent; −1 when nowhere. */
  distance: number;
  bearing: number;
  /** The range is a rough one. */
  approx: boolean;
  /** A small world marker is up (only close in). */
  hasMarker: boolean;
  /** Scanner strength 0…1, or −1 with no scanner running. */
  signal: number;
  /** A trace pulse this moment. */
  ping: boolean;
  task: MissionTask;
  /** Progress of whatever the task is, 0…1. */
  work: number;
  atSite: boolean;
  drill: DrillTelemetry;
  cleared: number;
  patches: number;
  /** A line to throw up big for a few seconds when an act ends. */
  banner: string;
  bannerHold: number;
  /** A call from base, a key under `solarSystem.moon.mission.radio`. */
  radio: string;
  radioHold: number;
  rewards: string[];
  complete: boolean;
  briefed: boolean;
}

export interface MissionContext {
  crewX: number;
  crewZ: number;
  /** Riding the rover — you cannot drill from the saddle. */
  driving: boolean;
}

export type MissionEvent = 'step' | 'bite' | 'reward' | 'rumble' | 'meteor' | 'radio';

export interface MissionHandle {
  group: THREE.Group;
  colliders: Collider[];
  telemetry: MissionTelemetry;
  marker: THREE.Vector3 | null;
  interactables: Interactable[];
  /** Fired when something happens that the scene makes noise or weather for. */
  onEvent: ((kind: MissionEvent, x?: number, z?: number) => void) | null;
  update: (dt: number, t: number, ctx: MissionContext) => void;
  /** Development only: skip to the end of the current act. */
  advance: () => void;
  dispose: () => void;
}

/** The exact anomaly, the survey area the map gives around it, the craft. */
export const SURVEY_SITE = new THREE.Vector2(-96, 62);
export const SURVEY_AREA = new THREE.Vector2(-88, 55);
export const ANOMALY_SITE = new THREE.Vector2(108, 84);
/** Where the mission computer stands, if the scene does not say. */
export const SCIENCE_TERMINAL = { x: -33.4, z: 7.0 };
export const DRILL_BAND: [number, number] = [0.4, 0.82];
export const CORE_DEPTH = 5.2;
export const PATCHES = 4;
const HARD_LAYER: [number, number] = [2.1, 2.9];
const SCAN_RADIUS = 16;
const LOCK_SECONDS = 1.3;
const PATCH_SECONDS = 2.8;
const HATCH_REACH = 3.4;
const STORE = 'stellar_moon_expedition_v2';
const STORE_V1 = 'stellar_moon_expedition_v1';

interface Saved { stage: MissionStage; rewards: string[]; briefed: boolean; cleared: number[] }
const STAGES: MissionStage[] = ['survey', 'drill', 'trace', 'excavate', 'contact', 'done'];

function load(): Saved {
  const fresh: Saved = { stage: 'survey', rewards: [], briefed: false, cleared: [] };
  try {
    const raw = localStorage.getItem(STORE) ?? localStorage.getItem(STORE_V1);
    if (!raw) return fresh;
    const v = JSON.parse(raw) as Partial<Saved>;
    const stage = STAGES.includes(v.stage as MissionStage) ? (v.stage as MissionStage) : 'survey';
    const rewards = Array.isArray(v.rewards) ? v.rewards.filter((r): r is string => typeof r === 'string').slice(0, 8) : [];
    // A crew from before the briefing existed was briefed once past the survey.
    const briefed = typeof v.briefed === 'boolean' ? v.briefed : stage !== 'survey';
    const past = STAGES.indexOf(stage) > STAGES.indexOf('excavate');
    const cleared = Array.isArray(v.cleared)
      ? [...new Set(v.cleared.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < PATCHES))]
      : past ? [0, 1, 2, 3] : [];
    // Every patch cleared but the stage not yet advanced: nothing on the
    // surface could move it on, so move it on here.
    return { stage: stage === 'excavate' && cleared.length >= PATCHES ? 'contact' : stage, rewards, briefed, cleared };
  } catch {
    return fresh;
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
    localStorage.removeItem(STORE_V1);
  } catch { /* private window: play it through anyway */ }
}

/** Has this crew made contact before? The rover's fourth gear depends on it. */
export function missionComplete(): boolean {
  return load().stage === 'done';
}
/** Where the expedition stands, for the mission list outside the scene. */
export function readExpeditionStage(): MissionStage {
  return load().stage;
}

const ease = (rate: number, dt: number) => 1 - Math.exp(-dt * rate);

export function makeMission(
  heightAt: (x: number, z: number) => number,
  stampCrater: (x: number, z: number, r: number, depth: number) => void,
  dust: DustHandle,
  lite: boolean,
  lights?: LightPool,
  terminal: { x: number; z: number } = SCIENCE_TERMINAL,
): MissionHandle {
  // Dig the crater the thing is lying in before anything reads a height.
  stampCrater(ANOMALY_SITE.x, ANOMALY_SITE.y, 15, 2.3);
  const group = new THREE.Group();
  group.name = 'expedition';
  const geoms: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const seg = lite ? 18 : 32;
  const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geoms.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const own = <T extends THREE.Material>(m: T) => { owned.push(m); return m; };
  const puff: DustBurst = { x: 0, y: 0, z: 0, count: 4, speedMin: 0.5, speedMax: 1.6, cone: 1.1, size: 0.1 };

  const steel = own(new THREE.MeshStandardMaterial({ color: 0x767b83, roughness: 0.42, metalness: 0.82 }));
  const white = own(new THREE.MeshStandardMaterial({ color: 0xd2d2cc, roughness: 0.62, metalness: 0.05 }));
  const dark = own(new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.4 }));
  const amber = own(new THREE.MeshStandardMaterial({ color: 0x2a1a06, emissive: new THREE.Color(0xffb347), emissiveIntensity: 2 }));
  const drillScreen = own(new THREE.MeshStandardMaterial({ color: 0x06202a, emissive: new THREE.Color(0x4dff88), emissiveIntensity: 0.9, roughness: 0.3 }));
  const spoil = own(new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 1, metalness: 0 }));
  /** The hull: oily and almost a mirror, never a silhouette. */
  const hullMat = own(new THREE.MeshStandardMaterial({ color: 0x3b4a66, roughness: 0.28, metalness: 0.82, envMapIntensity: 3.2, emissive: new THREE.Color(0x1b4a6a), emissiveIntensity: 0 }));
  const ribMat = own(new THREE.MeshStandardMaterial({ color: 0x5a6a8c, roughness: 0.2, metalness: 0.9, envMapIntensity: 3.4 }));
  const glyphMat = own(new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: new THREE.Color(0x35e0ff), emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.6 }));
  const glowMat = own(new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beaconMat = own(new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const metalCore = own(new THREE.MeshStandardMaterial({ color: 0x2b3444, roughness: 0.2, metalness: 0.95, emissive: new THREE.Color(0x335577), emissiveIntensity: 0.5 }));

  // ── The marker: a ring on the ground and a small turning diamond. Only
  // close in — out on the mare the crew navigates by bearing and scanner. ──
  const beacon = pivot(new THREE.Group());
  group.add(beacon);
  const ring = keep(mesh(beacon, new THREE.RingGeometry(1.6, 2.1, seg), beaconMat, 0, 0.1));
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = false;
  const pip = keep(mesh(beacon, new THREE.OctahedronGeometry(0.35), beaconMat, 0, 2.2));
  pip.castShadow = false;

  // ── The drill rig at the anomaly: a tripod over a turning bit, a spoil
  // collar, a console, a core tray. It folds out when the site is pinned. ──
  const rig = pivot(new THREE.Group());
  rig.position.set(SURVEY_SITE.x, heightAt(SURVEY_SITE.x, SURVEY_SITE.y), SURVEY_SITE.y);
  group.add(rig);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    const leg = mesh(rig, new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8), steel, Math.sin(a) * 0.95, 1.7, Math.cos(a) * 0.95);
    leg.rotation.z = -Math.sin(a) * 0.5;
    leg.rotation.x = Math.cos(a) * 0.5;
    mesh(rig, new THREE.CylinderGeometry(0.28, 0.24, 0.1, 10), steel, Math.sin(a) * 1.85, 0.05, Math.cos(a) * 1.85);
  }
  mesh(rig, new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12), white, 0, 3.4);
  mesh(rig, new THREE.SphereGeometry(0.1, 8, 6), amber, 0, 3.66);
  const mast = pivot(new THREE.Group());
  rig.add(mast);
  mesh(mast, new THREE.CylinderGeometry(0.13, 0.13, 2.6, 10), steel, 0, 2.0);
  const bit = pivot(new THREE.Group());
  bit.position.y = 0.7;
  mast.add(bit);
  mesh(bit, new THREE.CylinderGeometry(0.16, 0.1, 0.6, 10), dark);
  for (let f = 0; f < 3; f++) mesh(bit, new THREE.BoxGeometry(0.05, 0.62, 0.3), steel).rotation.y = f * Math.PI / 3;
  const collar = keep(mesh(rig, new THREE.TorusGeometry(0.8, 0.26, 8, seg), spoil, 0, 0.12));
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 1, 0.5);
  collar.castShadow = false;
  const console3d = mesh(rig, new THREE.BoxGeometry(0.7, 0.9, 0.45), white, 1.9, 0.5, 0.6);
  console3d.rotation.y = -0.5;
  mesh(console3d, new THREE.PlaneGeometry(0.5, 0.3), drillScreen, 0, 0.28, 0.23).rotation.x = -0.3;
  mesh(rig, new THREE.BoxGeometry(1.5, 0.08, 0.36), dark, -1.9, 0.3, 0.3).rotation.y = 0.4;
  const cores: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const c = keep(mesh(rig, new THREE.CylinderGeometry(0.07, 0.07, 0.26, 8), i === 4 ? metalCore : spoil,
      -1.9 + (i - 2) * 0.27 * Math.cos(0.4), 0.42, 0.3 - (i - 2) * 0.27 * Math.sin(0.4)));
    c.rotation.set(Math.PI / 2, 0, 0);
    c.rotateZ(0.4);
    c.visible = false;
    cores.push(c);
  }

  // ── The craft: a long teardrop hull on its side, most of it under the
  // regolith, a spine and three ribs, a seam in five sections that light in
  // turn, and a hatch that slides out of it. ──
  const craft = new THREE.Group();
  craft.position.set(ANOMALY_SITE.x, heightAt(ANOMALY_SITE.x, ANOMALY_SITE.y), ANOMALY_SITE.y);
  craft.rotation.y = 0.7;
  group.add(craft);
  const SX = 4.6; const SY = 4.6 * 0.52; const SZ = 4.6 * 2.15; const CY = 0.6;
  mesh(craft, new THREE.SphereGeometry(4.6, seg, seg / 2), hullMat, 0, CY, 0).scale.set(1, 0.52, 2.15);
  const spine = mesh(craft, new THREE.TorusGeometry(4.55, 0.16, 8, seg, Math.PI), ribMat, 0, CY, 0);
  spine.rotation.set(0, Math.PI / 2, 0);
  spine.scale.set(2.17, 0.53, 1);
  for (let i = -1; i <= 1; i++) {
    const k = Math.sqrt(1 - Math.pow(i * 3.1 / 9.89, 2));
    mesh(craft, new THREE.TorusGeometry(4.3, 0.1, 8, seg), ribMat, 0, CY, i * 3.1).scale.set(4.6 * k / 4.3, 2.39 * k / 4.3, 1);
  }
  const seamMats: THREE.MeshStandardMaterial[] = [];
  for (let s = 0; s < 5; s++) {
    const sm = own(new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: new THREE.Color(0x35e0ff), emissiveIntensity: 0, roughness: 0.3, metalness: 0.6 }));
    seamMats.push(sm);
    const piece = mesh(craft, new THREE.BoxGeometry(0.14, 0.06, 1.02), sm, 3.35, 1.5, -2.16 + s * 1.08);
    piece.rotation.z = -0.35;
  }
  const hatch = pivot(new THREE.Group());
  craft.add(hatch);
  mesh(hatch, new THREE.BoxGeometry(0.22, 2.0, 2.6), ribMat, 3.5, 1.35, 0).rotation.z = -0.35;
  const doorGlow = mesh(hatch, new THREE.PlaneGeometry(2.1, 1.9), glowMat, 3.62, 1.35, 0);
  doorGlow.rotation.y = Math.PI / 2;
  doorGlow.castShadow = false;
  const moundGeom = new THREE.SphereGeometry(5.6, seg, seg / 2, 0, Math.PI * 2, 0, Math.PI / 2);
  {
    const pos = moundGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      const n = 1 + (fbm(x * 0.5 + 40, z * 0.5, 3, 811) - 0.5) * 0.5;
      pos.setXYZ(i, x * n, y * (0.85 + n * 0.2), z * n);
    }
    moundGeom.computeVertexNormals();
  }
  // Low enough that a length of the spine breaks the surface: the strange
  // geometry that brings the crew over.
  const mound = keep(mesh(craft, moundGeom, spoil, 0, -0.4, 0));
  mound.scale.set(1.04, 0.6, 2.0);
  mound.castShadow = false;

  // ── The four patches: a heap of regolith over each, and what is under it —
  // a plate of the hull with markings on it, lying along the surface. ──
  const patchLocal: [number, number, number][] = [[3.0, 1.9, -5.2], [3.9, 1.6, 0.8], [2.6, 2.0, 5.6], [-3.0, 2.1, -1.5]];
  const patchHeaps: THREE.Mesh[] = [];
  const patchReveal: THREE.Group[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const nrm = new THREE.Vector3();
  patchLocal.forEach(([x, y, z], idx) => {
    const heap = keep(mesh(craft, new THREE.SphereGeometry(1.35, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), spoil, x, y - 0.15, z));
    heap.scale.set(1, 0.55, 1);
    heap.castShadow = false;
    patchHeaps.push(heap);
    const reveal = keep(new THREE.Group());
    reveal.position.set(x, y - 0.1, z);
    nrm.set(x / (SX * SX), (y - CY) / (SY * SY), z / (SZ * SZ)).normalize();
    reveal.quaternion.setFromUnitVectors(up, nrm);
    reveal.visible = false;
    craft.add(reveal);
    mesh(reveal, new THREE.BoxGeometry(1.5, 0.05, 1.1), ribMat, 0, 0, 0);
    // Markings: a different line of them under each patch.
    for (let g = 0; g < 5; g++) {
      const w = 0.08 + ((idx * 7 + g * 3) % 4) * 0.05;
      mesh(reveal, new THREE.BoxGeometry(w, 0.02, 0.06 + ((idx + g) % 3) * 0.08), glyphMat, -0.5 + g * 0.25, 0.035, ((g + idx) % 2 ? 0.2 : -0.15));
    }
    patchReveal.push(reveal);
  });

  const colliders: Collider[] = [{ x: rig.position.x, z: rig.position.z, r: 2.0 }];
  for (const [lz, r] of [[-6.4, 3.0], [0, 4.5], [6.4, 3.0]] as [number, number][]) {
    colliders.push({ x: craft.position.x - Math.sin(craft.rotation.y) * lz, z: craft.position.z - Math.cos(craft.rotation.y) * lz, r });
  }
  const merged = mergeStatic(group, { cell: 24, minCaster: 0.12 });
  group.updateMatrixWorld(true);
  const craftLightAt = craft.localToWorld(new THREE.Vector3(4.4, 1.6, 0));
  const patchWorld = patchLocal.map(([x, y, z]) => craft.localToWorld(new THREE.Vector3(x, y, z)));
  const hatchAt = { x: craft.position.x + Math.cos(craft.rotation.y) * 4.6, z: craft.position.z - Math.sin(craft.rotation.y) * 4.6 };

  // ── State. ──
  const saved = load();
  const drill: DrillTelemetry = { engaged: false, depth: 0, load: 0, heat: 0, stalled: false, ready: false, hard: false };
  const telemetry: MissionTelemetry = {
    stage: saved.stage, objective: '', distance: -1, bearing: 0, approx: false, hasMarker: false, signal: -1, ping: false,
    task: '', work: 0, atSite: false, drill, cleared: saved.cleared.length, patches: PATCHES,
    banner: '', bannerHold: 0, radio: '', radioHold: 0, rewards: saved.rewards, complete: saved.stage === 'done', briefed: saved.briefed,
  };
  const cleared = new Set(saved.cleared);
  const patchWork: number[] = patchLocal.map((_, i) => (cleared.has(i) ? 1 : 0));
  let lock = 0;
  let deploy = saved.stage === 'survey' ? 0 : 1;
  let feeding = false;
  let stallT = 0;
  let bitSpin = 0;
  let lastBite = 0;
  let awake = 0;
  let seqT = 0;
  let hatchOpen = saved.stage === 'done';
  let pingT = 0;
  const said = new Set<string>();
  const marker = new THREE.Vector3();

  const persist = () => save({ stage: telemetry.stage, rewards: telemetry.rewards, briefed: telemetry.briefed, cleared: [...cleared] });
  const banner = (key: string) => { telemetry.banner = key; telemetry.bannerHold = 5.5; };
  const radio = (key: string) => { telemetry.radio = key; telemetry.radioHold = 6; handle.onEvent?.('radio'); };
  const enter = (stage: MissionStage, reward?: string) => {
    telemetry.stage = stage;
    telemetry.complete = stage === 'done';
    telemetry.work = 0;
    lock = 0;
    seqT = 0;
    if (reward && !telemetry.rewards.includes(reward)) telemetry.rewards.push(reward);
    banner(`banner.${stage}`);
    persist();
    handle.onEvent?.(reward ? 'reward' : 'step');
  };
  const near = (x: number, z: number, ctxX: number, ctxZ: number, r: number) => Math.hypot(x - ctxX, z - ctxZ) < r;

  const interactables: Interactable[] = [
    {
      id: 'terminal', priority: 3,
      where: () => (!telemetry.briefed ? { x: terminal.x, z: terminal.z, r: 2.6 } : null),
      kind: () => 'tap', label: () => 'terminal',
      use: () => {
        telemetry.briefed = true;
        banner('banner.brief');
        persist();
        handle.onEvent?.('step');
      },
    },
    {
      id: 'drill', priority: 2,
      where: () => (telemetry.stage === 'drill' && deploy > 0.95 ? { x: rig.position.x, z: rig.position.z, r: 3.4 } : null),
      kind: () => (drill.ready || !drill.engaged ? 'tap' : 'hold'),
      label: () => (drill.ready ? 'collectCore' : drill.engaged ? 'drillFeed' : 'drillStart'),
      use: () => {
        if (drill.ready) { enter('trace', 'core'); return; }
        if (!drill.engaged) { drill.engaged = true; handle.onEvent?.('step'); return; }
        feeding = true;
      },
      progress: () => (drill.engaged ? drill.depth / CORE_DEPTH : -1),
    },
    ...patchWorld.map((p, i): Interactable => ({
      id: `patch${i}`, priority: 2,
      where: () => (telemetry.stage === 'excavate' && !cleared.has(i) ? { x: p.x, z: p.z, r: 2.8 } : null),
      kind: () => 'hold', label: () => 'clear',
      use: (dt) => {
        patchWork[i] = Math.min(1, patchWork[i] + dt / PATCH_SECONDS);
        if (t0 - lastBite > 0.25) {
          lastBite = t0;
          handle.onEvent?.('bite');
          puff.x = p.x; puff.y = p.y; puff.z = p.z; puff.count = 7; puff.speedMin = 0.6; puff.speedMax = 2.2; puff.cone = 1.2; puff.size = 0.13;
          dust.burst(puff);
        }
        if (patchWork[i] >= 1) {
          cleared.add(i);
          telemetry.cleared = cleared.size;
          persist();
          handle.onEvent?.('step');
          if (cleared.size >= PATCHES) enter('contact', 'hull');
        }
      },
      progress: () => patchWork[i],
    })),
    {
      id: 'hatch', priority: 3,
      where: () => (telemetry.stage === 'contact' && seqT > 6 && !hatchOpen ? { x: hatchAt.x, z: hatchAt.z, r: 3.8 } : null),
      kind: () => 'tap', label: () => 'openHatch',
      use: () => { hatchOpen = true; handle.onEvent?.('rumble'); },
    },
  ];

  let t0 = 0;
  const handle: MissionHandle = {
    group, colliders, telemetry, marker, interactables, onEvent: null,
    update: () => {},
    advance: () => {},
    dispose() {
      for (const g of geoms) g.dispose();
      for (const g of merged.geometries) g.dispose();
      for (const m of owned) m.dispose();
    },
  };

  const point = (x: number, z: number, ctx: MissionContext) => {
    const dx = x - ctx.crewX; const dz = z - ctx.crewZ;
    telemetry.distance = Math.hypot(dx, dz);
    telemetry.bearing = Math.atan2(dx, -dz);
  };

  handle.update = (dt, t, ctx) => {
    t0 = t;
    const stage = telemetry.stage;
    telemetry.hasMarker = false;
    telemetry.signal = -1;
    telemetry.ping = false;
    telemetry.approx = false;
    telemetry.task = '';
    telemetry.atSite = false;
    let markX = 0; let markZ = 0;

    if (stage === 'survey') {
      if (!telemetry.briefed) {
        telemetry.objective = 'obj.brief';
        point(terminal.x, terminal.z, ctx);
      } else {
        telemetry.objective = 'obj.survey';
        point(SURVEY_AREA.x, SURVEY_AREA.y, ctx);
        telemetry.approx = telemetry.distance > 40;
        const dExact = Math.hypot(SURVEY_SITE.x - ctx.crewX, SURVEY_SITE.y - ctx.crewZ);
        const inArea = telemetry.distance < SCAN_RADIUS;
        // Out on the mare the scanner only says "that way"; in the area it
        // peaks over the exact spot.
        // The peak is wide enough to lock from outside the rig's own
        // collider (2 m plus the suit): the crew can never stand on the spot.
        telemetry.signal = inArea ? Math.exp(-(dExact * dExact) / 60) : Math.max(0, 1 - telemetry.distance / 220) * 0.3;
        if (inArea && !ctx.driving) {
          telemetry.task = 'scan';
          telemetry.objective = 'obj.scan';
          telemetry.atSite = true;
          if (telemetry.signal > 0.86) lock = Math.min(1, lock + dt / LOCK_SECONDS);
          else lock = Math.max(0, lock - dt * 0.6);
          telemetry.work = lock;
          if (lock >= 1) enter('drill');
        }
        if (telemetry.distance < 30) { telemetry.hasMarker = true; markX = SURVEY_AREA.x; markZ = SURVEY_AREA.y; }
      }
    } else if (stage === 'drill') {
      point(rig.position.x, rig.position.z, ctx);
      const close = telemetry.distance < 5 && !ctx.driving;
      if (drill.engaged && !close) drill.engaged = false;
      drill.hard = drill.depth > HARD_LAYER[0] && drill.depth < HARD_LAYER[1];
      const hardness = drill.hard ? 1.3 : 1;
      const feed = feeding;
      feeding = false;
      if (drill.engaged && !drill.ready) {
        drill.load += ((feed ? 0.9 * hardness : 0.12) - drill.load) * ease(feed ? 1.3 : 1.8, dt);
        if (drill.stalled) {
          stallT -= dt;
          drill.heat = Math.max(0, drill.heat - dt * 0.35);
          if (stallT <= 0 && drill.heat < 0.6) drill.stalled = false;
        } else {
          const [lo, hi] = DRILL_BAND;
          const eff = drill.load < lo ? (drill.load / lo) * 0.45 : drill.load <= hi ? 1 : Math.max(0.25, 1 - (drill.load - hi) * 2);
          drill.depth = Math.min(CORE_DEPTH, drill.depth + (0.3 / hardness) * eff * dt * (feed ? 1 : 0.15));
          drill.heat = THREE.MathUtils.clamp(drill.heat + (drill.load > hi ? (drill.load - hi) * 1.2 : -0.14) * dt, 0, 1);
          if (drill.heat >= 1) { drill.stalled = true; stallT = 2.2; handle.onEvent?.('rumble'); }
        }
        bitSpin += dt * (4 + drill.load * 14) * (drill.stalled ? 0 : 1);
        if (!drill.stalled && t - lastBite > 0.5 - drill.load * 0.3) {
          lastBite = t;
          handle.onEvent?.('bite');
          puff.x = rig.position.x; puff.y = rig.position.y + 0.15; puff.z = rig.position.z;
          puff.count = Math.round(2 + drill.load * 6); puff.speedMin = 0.5; puff.speedMax = 1 + drill.load * 1.6; puff.cone = 1.1; puff.size = 0.1;
          dust.burst(puff);
        }
        if (drill.depth >= CORE_DEPTH) { drill.ready = true; drill.engaged = true; handle.onEvent?.('step'); }
      } else {
        drill.load += (0 - drill.load) * ease(2, dt);
        drill.heat = Math.max(0, drill.heat - dt * 0.2);
      }
      telemetry.task = 'drill';
      telemetry.atSite = close;
      telemetry.work = drill.depth / CORE_DEPTH;
      telemetry.objective = drill.ready ? 'obj.collect' : drill.engaged ? 'obj.drillFeed' : 'obj.drill';
      if (telemetry.distance > 12) { telemetry.hasMarker = true; markX = rig.position.x; markZ = rig.position.z; }
      // The rig shows it: the mast walks down, the collar grows, the screen
      // goes amber over the band and red when it stalls, the frame shivers.
      mast.position.y = -drill.depth / CORE_DEPTH * 1.1;
      bit.rotation.y = bitSpin;
      collar.scale.set(1 + telemetry.work * 0.5, 1 + telemetry.work * 0.5, 0.5);
      const [lo, hi] = DRILL_BAND;
      drillScreen.emissive.setHex(drill.stalled || drill.heat > 0.85 ? 0xff3b2e : drill.load > hi || drill.load < lo * 0.6 ? 0xffb347 : 0x4dff88);
      const shiver = drill.engaged && !drill.stalled ? drill.load * 0.012 : 0;
      rig.position.x = SURVEY_SITE.x + Math.sin(t * 61) * shiver;
      rig.position.z = SURVEY_SITE.y + Math.cos(t * 53) * shiver;
      for (let i = 0; i < cores.length; i++) cores[i].visible = drill.depth > ((i + 0.85) / cores.length) * CORE_DEPTH;
    } else if (stage === 'trace') {
      telemetry.objective = 'obj.trace';
      point(ANOMALY_SITE.x, ANOMALY_SITE.y, ctx);
      telemetry.approx = telemetry.distance > 40;
      pingT += dt;
      if (pingT > 4) pingT = 0;
      telemetry.ping = pingT < 0.6;
      telemetry.signal = telemetry.ping ? Math.max(0.08, 1 - telemetry.distance / 260) : 0;
      const fromRig = Math.hypot(rig.position.x - ctx.crewX, rig.position.z - ctx.crewZ);
      const total = Math.hypot(ANOMALY_SITE.x - SURVEY_SITE.x, ANOMALY_SITE.y - SURVEY_SITE.y);
      if (fromRig > 25 && !said.has('rover')) { said.add('rover'); radio('radio.rover'); }
      if (telemetry.distance < total * 0.55 && !said.has('half')) {
        said.add('half');
        radio('radio.half');
        // Something comes down out on the mare, well ahead and to one side.
        const ax = Math.sin(telemetry.bearing); const az = Math.cos(telemetry.bearing);
        handle.onEvent?.('meteor', ctx.crewX + ax * 45 + az * 22, ctx.crewZ + az * 45 - ax * 22);
      }
      if (telemetry.distance < 45 && !said.has('close')) { said.add('close'); radio('radio.close'); }
      if (telemetry.distance < 30) { telemetry.hasMarker = true; markX = ANOMALY_SITE.x; markZ = ANOMALY_SITE.y; }
      if (telemetry.distance < SCAN_RADIUS) enter('excavate');
    } else if (stage === 'excavate') {
      telemetry.objective = 'obj.excavate';
      // Point at the nearest patch still buried.
      let best = -1; let bestD = Infinity;
      patchWorld.forEach((p, i) => {
        if (cleared.has(i)) return;
        const d = Math.hypot(p.x - ctx.crewX, p.z - ctx.crewZ);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) {
        point(patchWorld[best].x, patchWorld[best].z, ctx);
        telemetry.task = 'clear';
        telemetry.atSite = bestD < 2.8;
        telemetry.work = patchWork[best];
      }
    } else if (stage === 'contact') {
      const was = seqT;
      seqT += dt;
      if (was === 0) handle.onEvent?.('rumble');
      if (was < 4.8 && seqT >= 4.8) handle.onEvent?.('rumble');
      point(hatchAt.x, hatchAt.z, ctx);
      telemetry.objective = seqT < 6 ? 'obj.contactWait' : hatchOpen ? 'obj.enter' : 'obj.open';
      telemetry.task = seqT >= 6 && !hatchOpen ? 'open' : '';
      telemetry.atSite = telemetry.distance < HATCH_REACH;
      if (hatchOpen && hatch.position.x < -1.2 && near(hatchAt.x, hatchAt.z, ctx.crewX, ctx.crewZ, HATCH_REACH)) enter('done', 'contact');
    } else {
      telemetry.objective = 'obj.done';
      telemetry.distance = -1;
    }

    // ── The rig unfolds once the site is pinned. ──
    const wantDeploy = stage === 'survey' ? 0 : 1;
    deploy += (wantDeploy - deploy) * ease(2.2, dt);
    rig.visible = deploy > 0.02;
    rig.scale.set(1, Math.max(0.02, deploy), 1);

    // ── The craft: how much is out of the ground, and how awake it is. ──
    const past = STAGES.indexOf(stage) > STAGES.indexOf('excavate');
    const clearedFrac = past ? 1 : cleared.size / PATCHES;
    mound.scale.y += ((0.6 * (1 - 0.85 * clearedFrac)) - mound.scale.y) * ease(1.2, dt);
    mound.visible = mound.scale.y > 0.1;
    for (let i = 0; i < PATCHES; i++) {
      const done = past || cleared.has(i);
      const work = done ? 1 : patchWork[i];
      patchHeaps[i].scale.y = 0.55 * (1 - work * 0.95);
      patchHeaps[i].visible = !done || patchHeaps[i].scale.y > 0.03;
      patchReveal[i].visible = done;
    }
    const wantAwake = stage === 'done' ? 1 : stage === 'contact' ? Math.min(1, seqT / 5) : clearedFrac * 0.3;
    awake += (wantAwake - awake) * ease(1.4, dt);
    const pulse = 0.65 + 0.35 * Math.sin(t * 1.9);
    for (let s = 0; s < 5; s++) {
      const lit = stage === 'done' || (stage === 'contact' && seqT > s * 1.0) ? 1 : clearedFrac * 0.15;
      seamMats[s].emissiveIntensity += (lit * 2.6 * pulse - seamMats[s].emissiveIntensity) * ease(4, dt);
    }
    glyphMat.emissiveIntensity = 0.25 + awake * 1.4 * pulse;
    hullMat.emissiveIntensity = awake * 0.5 * pulse;
    const open = hatchOpen ? 1 : 0;
    hatch.position.x += ((open ? -1.5 : 0) - hatch.position.x) * ease(1.6, dt);
    hatch.position.y += ((open ? 0.2 : 0) - hatch.position.y) * ease(1.6, dt);
    glowMat.opacity = awake * (open ? 0.85 : 0.1) * pulse;
    lights?.request(craftLightAt.x, craftLightAt.y, craftLightAt.z, 0x7fe9ff, awake * (open ? 9 : 1.5) * pulse, 26, 1.8);

    // ── The marker. ──
    beacon.visible = telemetry.hasMarker;
    if (telemetry.hasMarker) {
      marker.set(markX, heightAt(markX, markZ), markZ);
      beacon.position.copy(marker);
      pip.rotation.y = t * 0.8;
      pip.position.y = 2.2 + Math.sin(t * 1.5) * 0.2;
      ring.rotation.z = t * 0.35;
      beaconMat.opacity = 0.35 + 0.2 * Math.sin(t * 2.4);
    }
    handle.marker = telemetry.hasMarker ? marker : null;

    telemetry.bannerHold = Math.max(0, telemetry.bannerHold - dt);
    if (telemetry.bannerHold <= 0) telemetry.banner = '';
    telemetry.radioHold = Math.max(0, telemetry.radioHold - dt);
    if (telemetry.radioHold <= 0) telemetry.radio = '';
  };

  handle.advance = () => {
    const stage = telemetry.stage;
    if (stage === 'survey') { telemetry.briefed = true; enter('drill'); }
    else if (stage === 'drill') { drill.depth = CORE_DEPTH; drill.ready = true; enter('trace', 'core'); }
    else if (stage === 'trace') enter('excavate');
    else if (stage === 'excavate') { for (let i = 0; i < PATCHES; i++) cleared.add(i); telemetry.cleared = PATCHES; enter('contact', 'hull'); }
    else if (stage === 'contact') { hatchOpen = true; enter('done', 'contact'); }
  };

  return handle;
}
