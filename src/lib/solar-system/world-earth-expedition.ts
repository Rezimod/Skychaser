// The Tbilisi expedition, in five acts, and what it brings back down to the
// ground: the thing Stellar is for, a telescope under a real evening sky.
//
//   1. Cross the Bridge of Peace into the Old Town.
//   2. Ride the cable car from Rike up to Narikala.
//   3. From the walls, find Sameba, the TV tower and the Bridge of Peace by
//      bearing — the compass the telescope will need.
//   4. On a flat roof in Avlabari (chosen by the bake for the lowest southern
//      skyline), put the telescope together and align the mount on north.
//   5. First light: at this evening's real dusk, slew to what is really up
//      over Tbilisi and look.
//
// This file owns the state, the props on the roof and the interactions on
// them; the scene owns the ride, the stairwell and the clock. Progress is
// kept on the device.

import * as THREE from 'three';
import { mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import type { Interactable } from '@/lib/solar-system/moon-interactions';
import type { SkyTarget } from '@/lib/solar-system/world-earth-tonight';

export type TbilisiStage = 'bridge' | 'cable' | 'overlook' | 'rooftop' | 'firstLight' | 'done';
export const TBILISI_STAGES: TbilisiStage[] = ['bridge', 'cable', 'overlook', 'rooftop', 'firstLight', 'done'];
export const EXPEDITION_KEY = 'stellar_tbilisi_expedition_v1';
export const SPOT_TARGETS = ['sameba', 'tvTower', 'bridgeOfPeace'] as const;
export const PARTS = ['tripod', 'mount', 'tube'] as const;
/** Degrees either side of a bearing that count as looking at it, and how long to hold it. */
export const SPOT_TOLERANCE = 5;
export const SPOT_SECONDS = 1.5;
export const PART_SECONDS = 2.5;
export const ALIGN_TOLERANCE = 6;
export const ALIGN_SECONDS = 2;
export const LOOK_SECONDS = 6;
const SLEW_RATE = 18;

export interface Site { x: number; z: number }
export interface ExpeditionSites {
  bridgeWest: Site;
  cableBottom: Site;
  cableTop: Site;
  sameba: Site;
  tvTower: Site;
  bridgeOfPeace: Site;
  rooftopDoor: Site;
  /** The telescope's place on the roof, and the roof's height. */
  telescope: Site & { y: number };
}

export interface ExpeditionContext {
  x: number;
  z: number;
  /** Where the crew is looking, degrees clockwise from true north. */
  heading: number;
  riding: boolean;
  onRoof: boolean;
}

export type ExpeditionEvent = 'step' | 'reward' | 'board' | 'roofUp' | 'roofDown' | 'dusk' | 'eyepiece' | 'radio';

export interface ExpeditionTelemetry {
  stage: TbilisiStage;
  objective: string;
  distance: number;
  /** Degrees clockwise from true north, −1 with nowhere to go. */
  bearing: number;
  found: string[];
  spotting: string;
  spotWork: number;
  parts: number;
  work: number;
  aligned: boolean;
  target: SkyTarget | null;
  /** The telescope's pointing, degrees. */
  scopeAz: number;
  scopeAlt: number;
  eyepiece: boolean;
  banner: string;
  bannerHold: number;
  complete: boolean;
}

export interface TbilisiExpedition {
  group: THREE.Group;
  telemetry: ExpeditionTelemetry;
  interactables: Interactable[];
  onEvent: ((kind: ExpeditionEvent) => void) | null;
  update: (dt: number, ctx: ExpeditionContext) => void;
  /** The ride reached the top. */
  arrived: () => void;
  setTarget: (target: SkyTarget) => void;
  /** Development only: finish the current act. */
  advance: () => void;
  dispose: () => void;
}

interface Saved { stage: TbilisiStage; found: string[]; parts: number; aligned: boolean }

export function loadExpedition(): Saved {
  const fresh: Saved = { stage: 'bridge', found: [], parts: 0, aligned: false };
  try {
    const raw = localStorage.getItem(EXPEDITION_KEY);
    if (!raw) return fresh;
    const v = JSON.parse(raw) as Partial<Saved>;
    const stage = TBILISI_STAGES.includes(v.stage as TbilisiStage) ? (v.stage as TbilisiStage) : 'bridge';
    const found = Array.isArray(v.found) ? v.found.filter((f): f is string => (SPOT_TARGETS as readonly string[]).includes(f as string)) : [];
    const parts = Number.isInteger(v.parts) ? Math.max(0, Math.min(PARTS.length, v.parts as number)) : 0;
    return { stage, found: [...new Set(found)], parts, aligned: v.aligned === true };
  } catch {
    return fresh;
  }
}

/** Bearing from one point to another, degrees clockwise from north (−z). */
export const bearingTo = (fx: number, fz: number, tx: number, tz: number) => ((Math.atan2(tx - fx, -(tz - fz)) * 180) / Math.PI + 360) % 360;
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export function makeTbilisiExpedition(sites: ExpeditionSites, build = true): TbilisiExpedition {
  const saved = loadExpedition();
  const telemetry: ExpeditionTelemetry = {
    stage: saved.stage, objective: '', distance: -1, bearing: -1, found: saved.found, spotting: '', spotWork: 0,
    parts: saved.parts, work: 0, aligned: saved.aligned, target: null, scopeAz: 180, scopeAlt: 30, eyepiece: false,
    banner: '', bannerHold: 0, complete: saved.stage === 'done',
  };
  const persist = () => {
    try {
      localStorage.setItem(EXPEDITION_KEY, JSON.stringify({ stage: telemetry.stage, found: telemetry.found, parts: telemetry.parts, aligned: telemetry.aligned }));
    } catch { /* private window */ }
  };
  let spotT = 0;
  let partWork = 0;
  let alignWork = 0;
  let lookT = 0;
  let slewing = false;
  let riding = false;
  let duskAsked = false;
  let onRoof = false;
  let heading = 0;

  // ── The roof kit: a tripod, an alt-az mount, a refractor. ──
  const group = new THREE.Group();
  group.name = 'tbilisi-expedition';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const own = <M extends THREE.Material>(m: M) => { materials.push(m); return m; };
  const tripod = pivot(new THREE.Group());
  const mount = pivot(new THREE.Group());
  const tube = pivot(new THREE.Group());
  let merged: THREE.BufferGeometry[] = [];
  if (build) {
    const black = own(new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.4 }));
    const white = own(new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.35, metalness: 0.1 }));
    const chrome = own(new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.2, metalness: 1 }));
    const add = (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      geometries.push(g);
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true; o.receiveShadow = true;
      p.add(o);
      return o;
    };
    const root = new THREE.Group();
    root.position.set(sites.telescope.x, sites.telescope.y, sites.telescope.z);
    group.add(root);
    root.add(tripod);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = add(tripod, new THREE.CylinderGeometry(0.025, 0.02, 1.25, 8), chrome, Math.sin(a) * 0.3, 0.58, Math.cos(a) * 0.3);
      leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
    }
    add(tripod, new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), black, 0, 1.15, 0);
    mount.position.y = 1.2;
    root.add(mount);
    add(mount, new THREE.BoxGeometry(0.14, 0.22, 0.12), black, 0, 0.11, 0);
    add(mount, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), chrome, 0.1, 0.2, 0).rotation.z = Math.PI / 2;
    tube.position.set(0.18, 0.22, 0);
    mount.add(tube);
    const ota = add(tube, new THREE.CylinderGeometry(0.055, 0.055, 0.78, 20), white, 0, 0, 0.1);
    ota.rotation.x = Math.PI / 2;
    const dew = add(tube, new THREE.CylinderGeometry(0.066, 0.066, 0.2, 20, 1, true), black, 0, 0, 0.58);
    dew.rotation.x = Math.PI / 2;
    const focuser = add(tube, new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12), black, 0, 0, -0.36);
    focuser.rotation.x = Math.PI / 2;
    add(tube, new THREE.CylinderGeometry(0.018, 0.018, 0.08, 10), chrome, 0, 0.05, -0.43);
    // A folding chair and the case it came in.
    add(root, new THREE.BoxGeometry(0.62, 0.28, 0.42), black, -1.1, 0.14, 0.6);
    add(root, new THREE.BoxGeometry(0.44, 0.04, 0.44), black, 0.9, 0.46, 0.7);
    merged = mergeStatic(group, { minCaster: 0.02 }).geometries;
  }
  const showParts = () => {
    tripod.visible = telemetry.parts >= 1;
    mount.visible = telemetry.parts >= 2;
    tube.visible = telemetry.parts >= 3;
  };
  showParts();

  const handle: TbilisiExpedition = {
    group, telemetry, interactables: [], onEvent: null,
    update: () => {}, arrived: () => {}, setTarget: () => {}, advance: () => {},
    dispose() {
      for (const g of geometries) g.dispose();
      for (const g of merged) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
  const banner = (key: string) => { telemetry.banner = key; telemetry.bannerHold = 5.5; };
  const enter = (stage: TbilisiStage, reward = false) => {
    telemetry.stage = stage;
    telemetry.complete = stage === 'done';
    telemetry.work = 0;
    spotT = 0; partWork = 0; alignWork = 0; lookT = 0;
    banner(stage);
    persist();
    handle.onEvent?.(reward ? 'reward' : 'step');
    if (stage === 'firstLight') { duskAsked = true; handle.onEvent?.('dusk'); }
  };

  const T = sites.telescope;
  handle.interactables = [
    {
      id: 'board', priority: 3,
      where: () => (telemetry.stage === 'cable' && !riding ? { x: sites.cableBottom.x, z: sites.cableBottom.z, r: 9 } : null),
      kind: () => 'tap', label: () => 'board',
      use: () => { riding = true; handle.onEvent?.('board'); },
    },
    {
      id: 'climb', priority: 3, mode: 'foot',
      where: () => (TBILISI_STAGES.indexOf(telemetry.stage) >= TBILISI_STAGES.indexOf('rooftop') ? { x: sites.rooftopDoor.x, z: sites.rooftopDoor.z, r: 3 } : null),
      kind: () => 'tap', label: () => 'climb',
      use: () => handle.onEvent?.('roofUp'),
    },
    {
      id: 'descend', priority: 1,
      where: () => (onRoof ? { x: T.x - 2.5, z: T.z - 2.5, r: 2.2 } : null),
      kind: () => 'tap', label: () => 'descend',
      use: () => handle.onEvent?.('roofDown'),
    },
    {
      id: 'assemble', priority: 3,
      where: () => (onRoof && telemetry.stage === 'rooftop' && telemetry.parts < PARTS.length ? { x: T.x, z: T.z, r: 2.6 } : null),
      kind: () => 'hold', label: () => `part.${PARTS[telemetry.parts]}`,
      use: (dt) => {
        partWork += dt / PART_SECONDS;
        telemetry.work = Math.min(1, partWork);
        if (partWork >= 1) {
          partWork = 0;
          telemetry.parts += 1;
          telemetry.work = 0;
          showParts();
          persist();
          handle.onEvent?.('step');
        }
      },
      progress: () => telemetry.work,
    },
    {
      id: 'align', priority: 3,
      where: () => (onRoof && telemetry.stage === 'rooftop' && telemetry.parts >= PARTS.length ? { x: T.x, z: T.z, r: 2.6 } : null),
      kind: () => 'hold', label: () => (angleDiff(heading, 0) <= ALIGN_TOLERANCE ? 'align' : 'faceNorth'),
      use: (dt) => {
        if (angleDiff(heading, 0) > ALIGN_TOLERANCE) { alignWork = Math.max(0, alignWork - dt); return; }
        alignWork += dt / ALIGN_SECONDS;
        telemetry.work = Math.min(1, alignWork);
        if (alignWork >= 1) { telemetry.aligned = true; enter('firstLight', true); }
      },
      progress: () => telemetry.work,
    },
    {
      id: 'slew', priority: 3,
      where: () => (onRoof && telemetry.stage === 'firstLight' && telemetry.target && !telemetry.eyepiece ? { x: T.x, z: T.z, r: 2.6 } : null),
      kind: () => 'hold', label: () => 'slew',
      use: () => { slewing = true; },
      progress: () => telemetry.work,
    },
    {
      id: 'eyepiece', priority: 2,
      where: () => (onRoof && telemetry.stage === 'done' ? { x: T.x, z: T.z, r: 2.6 } : null),
      kind: () => 'tap', label: () => (telemetry.eyepiece ? 'closeEyepiece' : 'eyepiece'),
      use: () => { telemetry.eyepiece = !telemetry.eyepiece; handle.onEvent?.('eyepiece'); },
    },
  ];

  const point = (s: Site, ctx: ExpeditionContext) => {
    telemetry.distance = Math.hypot(s.x - ctx.x, s.z - ctx.z);
    telemetry.bearing = bearingTo(ctx.x, ctx.z, s.x, s.z);
  };

  handle.update = (dt, ctx) => {
    onRoof = ctx.onRoof;
    heading = ctx.heading;
    riding = ctx.riding;
    telemetry.distance = -1;
    telemetry.bearing = -1;
    telemetry.spotting = '';
    const stage = telemetry.stage;
    if (stage === 'bridge') {
      telemetry.objective = 'bridge';
      point(sites.bridgeWest, ctx);
      if (telemetry.distance < 12) enter('cable', true);
    } else if (stage === 'cable') {
      telemetry.objective = riding ? 'riding' : 'cable';
      if (!riding) point(sites.cableBottom, ctx);
    } else if (stage === 'overlook') {
      telemetry.objective = 'overlook';
      const left = SPOT_TARGETS.filter((s) => !telemetry.found.includes(s));
      // Look for the one nearest the line of sight.
      let best = ''; let bestD = Infinity;
      for (const id of left) {
        const s = sites[id];
        const d = angleDiff(bearingTo(ctx.x, ctx.z, s.x, s.z), ctx.heading);
        if (d < bestD) { bestD = d; best = id; }
      }
      telemetry.spotting = best;
      if (best && bestD <= SPOT_TOLERANCE && !ctx.riding) {
        spotT += dt;
        if (spotT >= SPOT_SECONDS) {
          telemetry.found = [...telemetry.found, best];
          spotT = 0;
          persist();
          handle.onEvent?.('step');
          if (telemetry.found.length >= SPOT_TARGETS.length) enter('rooftop', true);
        }
      } else {
        spotT = Math.max(0, spotT - dt * 2);
      }
      telemetry.spotWork = spotT / SPOT_SECONDS;
    } else if (stage === 'rooftop') {
      telemetry.objective = !onRoof ? 'rooftop' : telemetry.parts < PARTS.length ? 'assemble' : 'align';
      if (!onRoof) point(sites.rooftopDoor, ctx);
    } else if (stage === 'firstLight') {
      if (!duskAsked) { duskAsked = true; handle.onEvent?.('dusk'); }
      telemetry.objective = !onRoof ? 'backToRoof' : telemetry.eyepiece ? 'look' : 'slew';
      if (!onRoof) point(sites.rooftopDoor, ctx);
      const tg = telemetry.target;
      if (tg && slewing && !telemetry.eyepiece) {
        const dAz = ((tg.az - telemetry.scopeAz + 540) % 360) - 180;
        const dAlt = tg.alt - telemetry.scopeAlt;
        const stepDeg = SLEW_RATE * dt;
        const len = Math.hypot(dAz, dAlt);
        if (len <= stepDeg) { telemetry.scopeAz = tg.az; telemetry.scopeAlt = tg.alt; }
        else { telemetry.scopeAz = (telemetry.scopeAz + (dAz / len) * stepDeg + 360) % 360; telemetry.scopeAlt += (dAlt / len) * stepDeg; }
        const left = Math.hypot(((tg.az - telemetry.scopeAz + 540) % 360) - 180, tg.alt - telemetry.scopeAlt);
        telemetry.work = 1 - Math.min(1, left / 90);
        if (left < 0.3) { telemetry.eyepiece = true; telemetry.work = 0; handle.onEvent?.('eyepiece'); }
      }
      if (telemetry.eyepiece) {
        lookT += dt;
        if (lookT >= LOOK_SECONDS) { enter('done', true); telemetry.eyepiece = true; }
      }
    } else {
      telemetry.objective = onRoof ? 'doneRoof' : 'done';
    }
    slewing = false;
    telemetry.bannerHold = Math.max(0, telemetry.bannerHold - dt);
    if (telemetry.bannerHold <= 0) telemetry.banner = '';
    if (build) {
      // The mount turns in azimuth, the tube in altitude. Zero yaw looks down +z (south).
      mount.rotation.y = Math.PI - (telemetry.scopeAz * Math.PI) / 180;
      tube.rotation.x = -(telemetry.scopeAlt * Math.PI) / 180;
    }
  };
  handle.arrived = () => {
    riding = false;
    if (telemetry.stage === 'cable') enter('overlook', true);
  };
  handle.setTarget = (target) => { telemetry.target = target; };
  handle.advance = () => {
    const s = telemetry.stage;
    if (s === 'bridge') enter('cable', true);
    else if (s === 'cable') enter('overlook', true);
    else if (s === 'overlook') { telemetry.found = [...SPOT_TARGETS]; enter('rooftop', true); }
    else if (s === 'rooftop') { telemetry.parts = PARTS.length; telemetry.aligned = true; showParts(); enter('firstLight', true); }
    else if (s === 'firstLight') { if (telemetry.target) { telemetry.scopeAz = telemetry.target.az; telemetry.scopeAlt = telemetry.target.alt; } telemetry.eyepiece = true; enter('done', true); }
  };
  return handle;
}
