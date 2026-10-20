// Side jobs: the ordinary work that keeps an outpost running. The mission
// computer hands them out one at a time. Each job is a short list of steps —
// go somewhere, tap something, hold a tool, bring the rover in, or align
// something by hand (hold to turn it, let go on the peak). The steps drive
// real things in the scene: the array actually swings back onto the sun, the
// dish actually comes round to Earth, the package actually sits where it was
// put.
//
// Finished jobs are remembered; the one in progress is not — a reload hands
// it out again from the start. One job only exists for a crew that has come
// back out of the Backrooms: mark the sinkhole so nobody else walks into it.

import * as THREE from 'three';
import type { Interactable } from '@/lib/solar-system/moon-interactions';
import type { Anchor, AnchorId } from '@/lib/solar-system/moon-base-zones';
import { BEACON } from '@/lib/solar-system/moon-sinkhole';

export type JobId = 'solar' | 'seismo' | 'samples' | 'rover' | 'comms' | 'sinkhole';
export const JOB_ORDER: JobId[] = ['solar', 'samples', 'comms', 'rover', 'seismo', 'sinkhole'];

export interface JobWorld {
  anchors: Record<AnchorId, Anchor>;
  heightAt: (x: number, z: number) => number;
  /** The faulty array's offset from the sun, and the dish's from Earth, rad. */
  arrayFault: { yaw: number };
  dishFault: { yaw: number; pitch: number };
  setStatus: (which: 'power' | 'comms' | 'isru' | 'charger', state: 'ok' | 'warn' | 'fault') => void;
  rover: () => { x: number; z: number; yaw: number };
  setRoverFault: (on: boolean) => void;
  /** The expedition has put the crew on the mission computer. */
  briefed: () => boolean;
  /** The crew has been down the sinkhole and back: the beacon job is on the board. */
  backroomsEscaped?: () => boolean;
  setBeacon?: (on: boolean) => void;
}

export interface JobsTelemetry {
  active: JobId | '';
  /** Key under solarSystem.moon.jobs. */
  objective: string;
  distance: number;
  bearing: number;
  /** An alignment meter, 0…1, or −1. */
  meter: number;
  banner: string;
  bannerHold: number;
  done: JobId[];
}

export interface JobsContext { crewX: number; crewZ: number; driving: boolean }

export interface JobsHandle {
  group: THREE.Group;
  telemetry: JobsTelemetry;
  interactables: Interactable[];
  /** Hand out a job: the named one, or the next not yet done. */
  start: (id?: JobId) => JobId | null;
  update: (dt: number, ctx: JobsContext) => void;
  onEvent: ((kind: 'step' | 'reward') => void) | null;
  dispose: () => void;
}

type StepKind = 'go' | 'tap' | 'hold' | 'align' | 'roverTo';
interface Step {
  objective: string;
  kind: StepKind;
  label?: string;
  target: () => { x: number; z: number; r: number };
  seconds?: number;
  /** For an alignment: read and write the offset being taken out. */
  offset?: { get: () => number; set: (v: number) => void };
  /** A tap step that needs several taps (the samples). */
  count?: () => number;
  onDone?: () => void;
}
interface Job { id: JobId; setup: () => void; steps: Step[]; finish: () => void }

const STORE = 'stellar_moon_jobs_v1';
export const SEISMO_POINT = { x: -74, z: 46 };
export const SAMPLE_ROCKS: { x: number; z: number }[] = [{ x: -58, z: 31 }, { x: -69, z: 12 }];
const ALIGN_RATE = 0.32;
const ALIGN_SPAN = 0.7;
const ALIGN_TOLERANCE = 0.045;

function loadDone(): JobId[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '{}') as { done?: unknown };
    return Array.isArray(v.done) ? v.done.filter((d): d is JobId => JOB_ORDER.includes(d as JobId)) : [];
  } catch {
    return [];
  }
}
/** Which side jobs are finished, for the mission list outside the scene. */
export function readJobsDone(): JobId[] {
  return loadDone();
}
function saveDone(done: JobId[]) {
  try { localStorage.setItem(STORE, JSON.stringify({ done })); } catch { /* keep playing */ }
}

export function makeJobs(world: JobWorld): JobsHandle {
  const group = new THREE.Group();
  group.name = 'jobs';
  const geoms: THREE.BufferGeometry[] = [];
  const shell = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.55, metalness: 0.05 });
  const tag = new THREE.MeshStandardMaterial({ color: 0x06202a, emissive: new THREE.Color(0x5eead4), emissiveIntensity: 1.2, roughness: 0.4 });
  const status = new THREE.MeshStandardMaterial({ color: 0x100404, emissive: new THREE.Color(0xff3b2e), emissiveIntensity: 1.6, roughness: 0.4 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.95, metalness: 0.02 });
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geoms.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // The two sample rocks, each with a survey tag stuck beside it.
  const rocks = SAMPLE_ROCKS.map((p, i) => {
    const g = new THREE.Group();
    g.position.set(p.x, world.heightAt(p.x, p.z), p.z);
    g.visible = false;
    group.add(g);
    add(g, new THREE.DodecahedronGeometry(0.28 + i * 0.05, 0), rockMat, 0, 0.12, 0).scale.set(1.2, 0.7, 1);
    add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5), shell, 0.5, 0.4, 0);
    add(g, new THREE.BoxGeometry(0.16, 0.1, 0.01), tag, 0.58, 0.74, 0).castShadow = false;
    return g;
  });
  // The seismometer package, carried out and set down.
  const pkg = new THREE.Group();
  pkg.visible = false;
  group.add(pkg);
  add(pkg, new THREE.CylinderGeometry(0.22, 0.26, 0.24, 14), shell, 0, 0.12, 0);
  add(pkg, new THREE.ConeGeometry(0.55, 0.26, 16, 1, true), shell, 0, 0.13, 0).castShadow = false;
  add(pkg, new THREE.BoxGeometry(0.06, 0.06, 0.02), status, 0, 0.28, 0.2).castShadow = false;

  const collected = new Set<number>();
  let carrying = false;
  let level = 0;
  const done = loadDone();
  const telemetry: JobsTelemetry = { active: '', objective: '', distance: -1, bearing: 0, meter: -1, banner: '', bannerHold: 0, done };
  const a = world.anchors;
  const at = (p: { x: number; z: number }, r: number) => () => ({ x: p.x, z: p.z, r });

  const jobs: Job[] = [
    {
      id: 'solar',
      setup: () => { world.arrayFault.yaw = 0.55; world.setStatus('power', 'fault'); },
      steps: [
        { objective: 'solar.go', kind: 'go', target: at(a.powerCabinet, 3) },
        { objective: 'solar.breaker', kind: 'tap', label: 'resetBreaker', target: at(a.powerCabinet, 2.6), onDone: () => world.setStatus('power', 'warn') },
        { objective: 'solar.reset', kind: 'hold', label: 'holdReset', seconds: 2, target: at(a.powerCabinet, 2.6) },
        { objective: 'solar.align', kind: 'align', label: 'alignArray', target: at(a.faultyArray, 3.2), offset: { get: () => world.arrayFault.yaw, set: (v) => { world.arrayFault.yaw = v; } } },
      ],
      finish: () => { world.arrayFault.yaw = 0; world.setStatus('power', 'ok'); },
    },
    {
      id: 'samples',
      setup: () => { collected.clear(); rocks.forEach((r) => { r.visible = true; }); },
      steps: [
        {
          objective: 'samples.collect', kind: 'tap', label: 'collectSample',
          target: () => {
            let best = SAMPLE_ROCKS[0]; let bestD = Infinity;
            SAMPLE_ROCKS.forEach((p, i) => {
              if (collected.has(i)) return;
              const d = Math.hypot(p.x - crewX, p.z - crewZ);
              if (d < bestD) { bestD = d; best = p; }
            });
            return { x: best.x, z: best.z, r: 2.4 };
          },
          count: () => SAMPLE_ROCKS.length - collected.size,
          onDone: () => {
            const i = SAMPLE_ROCKS.findIndex((p, k) => !collected.has(k) && Math.hypot(p.x - crewX, p.z - crewZ) < 2.4);
            if (i >= 0) { collected.add(i); rocks[i].visible = false; }
          },
        },
        { objective: 'samples.return', kind: 'tap', label: 'depositSamples', target: at(a.sampleStore, 2.6) },
      ],
      finish: () => {},
    },
    {
      id: 'comms',
      setup: () => { world.dishFault.yaw = 0.5; world.dishFault.pitch = -0.15; world.setStatus('comms', 'fault'); },
      steps: [
        { objective: 'comms.go', kind: 'go', target: at(a.commsControl, 3) },
        { objective: 'comms.panel', kind: 'tap', label: 'openPanel', target: at(a.commsControl, 2.6), onDone: () => world.setStatus('comms', 'warn') },
        { objective: 'comms.align', kind: 'align', label: 'alignDish', target: at(a.commsControl, 2.6), offset: { get: () => world.dishFault.yaw, set: (v) => { world.dishFault.yaw = v; world.dishFault.pitch = -v * 0.3; } } },
      ],
      finish: () => { world.dishFault.yaw = 0; world.dishFault.pitch = 0; world.setStatus('comms', 'ok'); },
    },
    {
      id: 'rover',
      setup: () => world.setRoverFault(true),
      steps: [
        { objective: 'rover.bring', kind: 'roverTo', target: at(a.serviceBay, 4.5) },
        {
          objective: 'rover.wheel', kind: 'hold', label: 'serviceWheel', seconds: 3,
          target: () => {
            const r = world.rover();
            const c = Math.cos(r.yaw); const s = Math.sin(r.yaw);
            // The rear left wheel, and a step out from it.
            const lx = -1.9; const lz = -1.55;
            return { x: r.x + lx * c + lz * s, z: r.z - lx * s + lz * c, r: 2.2 };
          },
        },
      ],
      finish: () => world.setRoverFault(false),
    },
    {
      id: 'seismo',
      setup: () => { carrying = false; level = 0.45; pkg.visible = false; },
      steps: [
        { objective: 'seismo.take', kind: 'tap', label: 'takePackage', target: at(a.sampleStore, 2.6), onDone: () => { carrying = true; } },
        { objective: 'seismo.go', kind: 'go', target: at(SEISMO_POINT, 4) },
        {
          objective: 'seismo.place', kind: 'hold', label: 'placePackage', seconds: 1.5, target: at(SEISMO_POINT, 4),
          onDone: () => {
            carrying = false;
            pkg.position.set(crewX, world.heightAt(crewX, crewZ), crewZ);
            pkg.visible = true;
          },
        },
        { objective: 'seismo.level', kind: 'align', label: 'levelPackage', target: () => ({ x: pkg.position.x, z: pkg.position.z, r: 2.4 }), offset: { get: () => level, set: (v) => { level = v; } } },
        { objective: 'seismo.activate', kind: 'tap', label: 'activate', target: () => ({ x: pkg.position.x, z: pkg.position.z, r: 2.4 }), onDone: () => status.emissive.setHex(0x4dff88) },
      ],
      finish: () => {},
    },
    {
      id: 'sinkhole',
      setup: () => world.setBeacon?.(false),
      steps: [
        { objective: 'sinkhole.go', kind: 'go', target: at(BEACON, 3) },
        { objective: 'sinkhole.place', kind: 'hold', label: 'placeBeacon', seconds: 2, target: at(BEACON, 3), onDone: () => world.setBeacon?.(true) },
        { objective: 'sinkhole.log', kind: 'tap', label: 'logSinkhole', target: at(a.scienceTerminal, 2.6) },
      ],
      finish: () => world.setBeacon?.(true),
    },
  ];
  const available = (id: JobId) => id !== 'sinkhole' || (world.backroomsEscaped?.() ?? false);

  let active: Job | null = null;
  let stepIndex = 0;
  let holdT = 0;
  let heldThisStep = false;
  let heldLast = false;
  let crewX = 0; let crewZ = 0;

  const step = () => (active ? active.steps[stepIndex] : null);
  const advance = () => {
    if (!active) return;
    step()?.onDone?.();
    holdT = 0;
    const s = step();
    if (s?.count && s.count() > 0) return;
    stepIndex += 1;
    handle.onEvent?.('step');
    if (stepIndex >= active.steps.length) {
      active.finish();
      if (!done.includes(active.id)) done.push(active.id);
      saveDone(done);
      telemetry.banner = `done.${active.id}`;
      telemetry.bannerHold = 5;
      handle.onEvent?.('reward');
      active = null;
      telemetry.active = '';
    }
  };

  const jobInteractable: Interactable = {
    id: 'job', priority: 2,
    where: () => {
      const s = step();
      if (!s || s.kind === 'go' || s.kind === 'roverTo') return null;
      return s.target();
    },
    kind: () => (step()?.kind === 'tap' ? 'tap' : 'hold'),
    label: () => step()?.label ?? '',
    use: (dt) => {
      const s = step();
      if (!s) return;
      if (s.kind === 'tap') { advance(); return; }
      heldThisStep = true;
      if (s.kind === 'hold') {
        holdT += dt;
        if (holdT >= (s.seconds ?? 1)) advance();
      } else if (s.kind === 'align' && s.offset) {
        // Held, the thing turns steadily; past the far stop it comes round again.
        let v = s.offset.get() - ALIGN_RATE * dt;
        if (v < -ALIGN_SPAN) v = ALIGN_SPAN;
        s.offset.set(v);
      }
    },
    progress: () => {
      const s = step();
      if (!s) return -1;
      if (s.kind === 'hold') return holdT / (s.seconds ?? 1);
      if (s.kind === 'align' && s.offset) return Math.max(0, 1 - Math.abs(s.offset.get()) / 0.35);
      return -1;
    },
  };
  const board: Interactable = {
    id: 'jobBoard', priority: 1,
    where: () => (world.briefed() && !active ? { x: a.scienceTerminal.x, z: a.scienceTerminal.z, r: 2.6 } : null),
    kind: () => 'tap', label: () => 'jobBoard',
    use: () => { handle.start(); },
  };

  const handle: JobsHandle = {
    group, telemetry, interactables: [jobInteractable, board], onEvent: null,
    start(id) {
      if (active) return active.id;
      // Every job done: the board has nothing left to hand out.
      const pick = id ?? JOB_ORDER.find((j) => !done.includes(j) && available(j));
      active = pick ? jobs.find((j) => j.id === pick) ?? null : null;
      if (!active) return null;
      stepIndex = 0;
      holdT = 0;
      active.setup();
      telemetry.active = active.id;
      telemetry.banner = `start.${active.id}`;
      telemetry.bannerHold = 4.5;
      handle.onEvent?.('step');
      return active.id;
    },
    update(dt, ctx) {
      crewX = ctx.crewX; crewZ = ctx.crewZ;
      const s = step();
      // Alignment completes when the key comes up on the peak.
      if (s?.kind === 'align' && s.offset && heldLast && !heldThisStep && Math.abs(s.offset.get()) < ALIGN_TOLERANCE) {
        s.offset.set(0);
        advance();
      }
      heldLast = heldThisStep;
      heldThisStep = false;
      const cur = step();
      if (cur) {
        const tg = cur.target();
        const dx = tg.x - ctx.crewX; const dz = tg.z - ctx.crewZ;
        telemetry.distance = Math.hypot(dx, dz);
        telemetry.bearing = Math.atan2(dx, -dz);
        telemetry.objective = cur.objective;
        telemetry.meter = cur.kind === 'align' && cur.offset ? Math.max(0, 1 - Math.abs(cur.offset.get()) / 0.35) : -1;
        if (cur.kind === 'go' && !ctx.driving && telemetry.distance < tg.r) advance();
        if (cur.kind === 'roverTo') {
          const r = world.rover();
          telemetry.distance = Math.hypot(tg.x - r.x, tg.z - r.z);
          if (telemetry.distance < tg.r) advance();
        }
      } else {
        telemetry.distance = -1;
        telemetry.meter = -1;
        telemetry.objective = '';
      }
      if (carrying) pkg.visible = false;
      telemetry.bannerHold = Math.max(0, telemetry.bannerHold - dt);
      if (telemetry.bannerHold <= 0) telemetry.banner = '';
    },
    dispose() {
      for (const g of geoms) g.dispose();
      shell.dispose(); tag.dispose(); status.dispose(); rockMat.dispose();
    },
  };
  return handle;
}
