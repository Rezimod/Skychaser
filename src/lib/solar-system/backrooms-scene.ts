// Level 0: the scene the crew wakes up in after the sinkhole, and everything
// that happens there until they climb out.
//
// It shares the Moon's renderer, camera, camera rig and cosmonaut; it owns
// its own scene, fog, chunks, the thing at the end of the corridor, the
// stairwell and the shaft. Moon Mode steps it inside its own fixed-step loop
// and draws whichever scene is current.
//
// The visit runs in phases. Waking: black, then a ceiling, then getting up.
// Exploring: in Earth gravity, the suit still sealed until the helmet comes
// off. The door: it swings, and the dark behind it takes you. The stairs:
// walked. The shaft: climbed, and gravity falls away on the way up.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  makeMaze, collide, CELL, CEILING, DX, DZ, SCALE, SIDE, hash, mod, type Dir, type Maze,
} from '@/lib/solar-system/backrooms-maze';
import { makeChunkKit, PANEL_COLOR, type ChunkBuild } from '@/lib/solar-system/backrooms-chunks';
import { makeChunkWindow } from '@/lib/solar-system/backrooms-window';
import { chooseSighting, sightingEnds, type Sighting } from '@/lib/solar-system/backrooms-entity';
import type { BackroomsAudio } from '@/lib/solar-system/backrooms-audio';
import type { CosmonautHandle, WalkInput } from '@/lib/solar-system/moon-cosmonaut';
import type { CameraRig } from '@/lib/solar-system/moon-camera';
import { compileFor } from '@/lib/solar-system/gpu-warm';

export type BackroomsPhase = 'wake' | 'explore' | 'door' | 'stairs' | 'climb' | 'out';

export interface BackroomsTelemetry {
  phase: BackroomsPhase;
  /** Seconds since waking. */
  seconds: number;
  /** 0…1: how black the screen is. */
  black: number;
  /** The helmet is still on. */
  helmet: boolean;
  /** What the suit reads, m/s². */
  gravity: number;
  /** The key: a label under solarSystem.moon.backrooms.act, tap or hold, and a hold's progress. */
  prompt: { active: boolean; label: string; kind: 'tap' | 'hold'; progress: number };
  /** A line under solarSystem.moon.backrooms.radio, and a suit readout under .readout. */
  radio: string;
  readout: string;
  /** The panels are leading the way. */
  guiding: boolean;
  /** Cells of walking to the exit. */
  exitCells: number;
  sighting: boolean;
  chunks: number;
  /** 0…1 visor HUD flicker while the helmet is on. */
  glitch: number;
}

export interface BackroomsDeps {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  cosmonaut: CosmonautHandle;
  cam: CameraRig;
  audio: BackroomsAudio;
  /** The post chain's target, which the compile has to aim at (gpu-warm.ts). */
  target: THREE.WebGLRenderTarget;
  seed: number;
  lite: boolean;
  /** Metres to the side of the plan's spawn to wake at, so a crew waking together does not wake in one body. */
  spawnShift?: number;
}

export interface BackroomsHandle {
  scene: THREE.Scene;
  maze: Maze;
  telemetry: BackroomsTelemetry;
  /** Resolves once every program is compiled. */
  ready: Promise<void>;
  /** One fixed simulation step. */
  step: (h: number, walk: WalkInput) => void;
  /** Once a drawn frame: the camera, the lights, the watcher, the key. */
  frame: (dt: number, press: boolean, held: boolean) => void;
  /** The climb is over: the owner puts the crew on the surface. */
  done: boolean;
  teleportToExit: () => void;
  /** Development: stand somewhere, facing somewhere; put the watcher somewhere. Plan metres (world ÷ SCALE). */
  teleport: (x: number, z: number, yaw: number) => void;
  showWatcher: (x: number, z: number, yaw: number) => void;
  /** Skip to the top of the shaft. */
  finish: () => void;
  dispose: () => void;
}

const STAIR_Y = -40;
const WAKE_BLACK = 2.2;
const WAKE_UP = 5.2;
const WAKE_END = 8.6;
const HELMET_PROMPT = 3;
const CLIMB = 7;
const LOST_AFTER = 360;
const STALL_AFTER = 180;
const HAZE = 0xb3a56a;

const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** A figure made of stretched boxes: too tall, too thin, stooped. */
function watcherGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d, 1, 4, 1);
    g.rotateX(rx); g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  box(0.1, 1.25, 0.08, 0.07, 0.62, 0, 0, 0.02);
  box(0.1, 1.25, 0.08, -0.07, 0.62, 0, 0, -0.02);
  box(0.26, 0.95, 0.12, 0, 1.68, 0.04, 0.12);
  box(0.06, 1.2, 0.06, 0.19, 1.55, 0.1, 0.08, 0.06);
  box(0.06, 1.25, 0.06, -0.19, 1.52, 0.08, 0.05, -0.05);
  box(0.05, 0.28, 0.05, 0, 2.2, 0.14, 0.4);
  box(0.16, 0.24, 0.16, 0, 2.38, 0.24, 0.35);
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
  for (const p of parts) p.dispose();
  return g;
}

export function makeBackrooms(deps: BackroomsDeps): BackroomsHandle {
  const { renderer, camera, cosmonaut, cam, audio, lite } = deps;
  const maze = makeMaze(deps.seed);
  const scene = new THREE.Scene();
  scene.name = 'backrooms';
  const haze = new THREE.Color(HAZE);
  scene.background = haze.clone();
  scene.fog = new THREE.Fog(HAZE, 9 * SCALE, (lite ? 40 : 52) * SCALE);
  const kit = makeChunkKit(maze);
  // Chunks, doors and the watcher are built in plan metres; the crew walks in world metres.
  const root = new THREE.Group();
  root.scale.setScalar(SCALE);
  scene.add(root);
  // The walls carry their own light in their shader; the crew does not, and
  // stood pitch black in the middle of a lit office. A fluorescent sky over
  // carpet, and a tube that keeps station over the crew's head.
  const fill = new THREE.HemisphereLight(0xfff2c2, 0x6a5c33, 0.9);
  scene.add(fill);
  const crewLamp = new THREE.PointLight(0xfff0c4, 8, 14, 1.7);
  scene.add(crewLamp);
  const doors: ChunkBuild['door'][] = [];
  const win = makeChunkWindow<ChunkBuild>(2, 3, (cx, cz) => {
    const c = kit.build(cx, cz);
    root.add(c.group);
    if (c.door) doors.push(c.door);
    return c;
  }, (c) => {
    const k = doors.indexOf(c.door);
    if (k >= 0) doors.splice(k, 1);
    kit.free(c);
  });

  // ── The watcher. ──
  const watcherGeom = watcherGeometry();
  const watcherTime = { value: 0 };
  const watcherMat = new THREE.MeshBasicMaterial({ color: 0x0d0b07 });
  watcherMat.onBeforeCompile = (shader) => {
    shader.uniforms.uJit = watcherTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uJit;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // The outline boils: every vertex jumps a little, on a stepped clock, never smoothly.
          float tick = floor(uJit * 24.0);
          float n = fract(sin(dot(position.xy * 17.0 + tick, vec2(12.9898, 78.233))) * 43758.5453);
          float m = fract(sin(dot(position.zy * 13.0 - tick, vec2(39.3468, 11.135))) * 24634.6345);
          transformed.x += (n - 0.5) * 0.06;
          transformed.z += (m - 0.5) * 0.04;
          transformed.x += step(0.93, fract(tick * 0.137)) * 0.12;
        }`);
  };
  watcherMat.customProgramCacheKey = () => 'br-watcher';
  const watcher = new THREE.Mesh(watcherGeom, watcherMat);
  watcher.visible = false;
  root.add(watcher);

  // ── The stairwell and the shaft: concrete, one caged bulb, light baked into the vertices. ──
  const stairs = new THREE.Group();
  stairs.position.y = STAIR_Y;
  stairs.scale.setScalar(SCALE);
  stairs.visible = false;
  scene.add(stairs);
  const stairGeoms: THREE.BufferGeometry[] = [];
  const concrete = new THREE.MeshBasicMaterial({ vertexColors: true });
  const bulb = new THREE.Vector3(0, 3.0 + 2.2, 11.2);
  const baked = (g: THREE.BufferGeometry, tint: number) => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3(); const n = new THREE.Vector3(); const l = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      p.fromBufferAttribute(pos, k); n.fromBufferAttribute(nrm, k);
      l.subVectors(bulb, p);
      const d2 = l.lengthSq();
      const lam = Math.max(0, n.dot(l.normalize()));
      const shaft = p.y > 6 ? Math.max(0, 0.6 + 0.4 * Math.sin(p.y * 1.2)) * 0.5 : 0;
      const v = (0.08 + (0.2 + 0.8 * lam) * 2.2 / (1 + d2 * 0.35) + shaft * 0.5) * tint;
      const noise = 0.9 + hash(k, pos.count, 3, 7) * 0.2;
      col[k * 3] = v * 0.95 * noise; col[k * 3 + 1] = v * 0.93 * noise; col[k * 3 + 2] = v * 0.86 * noise;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    stairGeoms.push(g);
    stairs.add(new THREE.Mesh(g, concrete));
  };
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number, tint = 1) => {
    const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w)), Math.max(1, Math.round(h * 2)), Math.max(1, Math.round(d)));
    g.translate(x, y, z);
    baked(g, tint);
  };
  slab(2.8, 0.2, 2.4, 0, -0.1, 0);
  for (let s = 0; s < 18; s++) slab(2.4, 0.17 * (s + 1), 0.5, 0, 0.085 * (s + 1), 1.45 + s * 0.5, 0.95);
  slab(2.8, 0.2, 2.2, 0, 2.96, 11.3);
  slab(0.2, 9, 13.6, -1.3, 3.5, 5.6, 0.85);
  slab(0.2, 9, 13.6, 1.3, 3.5, 5.6, 0.85);
  slab(2.8, 9, 0.2, 0, 3.5, -1.2, 0.8);
  slab(2.8, 0.2, 11, 0, 6.2, 5.6, 0.7);
  // The shaft: a tall tube over the landing, a ladder up its wall.
  const tube = new THREE.CylinderGeometry(0.9, 0.9, 16, 14, 16, true);
  tube.scale(-1, 1, 1);
  tube.translate(0, 3 + 8, 11.4);
  baked(tube, 0.75);
  for (let r = 0; r < 44; r++) slab(0.5, 0.04, 0.04, 0, 3.3 + r * 0.32, 12.2, 1.4);
  slab(0.04, 14, 0.05, -0.26, 10, 12.22, 1.2);
  slab(0.04, 14, 0.05, 0.26, 10, 12.22, 1.2);
  const cage = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2) }));
  cage.position.copy(bulb);
  stairs.add(cage);
  stairGeoms.push(cage.geometry);
  const stairFloor = (_x: number, z: number) => {
    const lz = z / SCALE;
    if (lz < 1.2) return STAIR_Y;
    if (lz < 10.2) return STAIR_Y + ((lz - 1.2) / 9) * 3.06 * SCALE;
    return STAIR_Y + 3.06 * SCALE;
  };

  // ── State. ──
  const telemetry: BackroomsTelemetry = {
    phase: 'wake', seconds: 0, black: 1, helmet: true, gravity: 9.81,
    prompt: { active: false, label: '', kind: 'tap', progress: -1 },
    radio: '', readout: '', guiding: false, exitCells: 0, sighting: false, chunks: 0, glitch: 0,
  };
  let t = 0;
  let exploreT = 0;
  let doorT = 0;
  let door: NonNullable<ChunkBuild['door']> | null = null;
  let climbHold = 0;
  let climbT = 0;
  let stairsT = 0;
  let sighting: Sighting | null = null;
  let sightAge = 0;
  let nextSight = 70;
  let nextThump = 45 + hash(deps.seed, 1, 2, 3) * 40;
  let best = Infinity;
  let bestAt = 0;
  let guideT = 0;
  let radioHold = 0;
  let readoutHold = 0;
  let flickT = 0;
  const shift = deps.spawnShift ?? 0;
  const spawnX = (maze.spawn.i + 0.5) * CELL * SCALE;
  const spawnZ = (maze.spawn.j + 0.5) * CELL * SCALE;
  const eye = new THREE.Vector3();
  const lying = new THREE.Vector3();
  // Where the camera may not go. Corridors are one cell wide, so the chase
  // spends most of its life pulled in against a wall — which is what a
  // corridor is for.
  const probe = { x: 0, z: 0 };
  const still = { x: 0, z: 0 };
  const walled = (x: number, y: number, z: number) => {
    if (y < 0.35 || y > CEILING * SCALE - 0.25) return true;
    probe.x = x / SCALE; probe.z = z / SCALE;
    still.x = 0; still.z = 0;
    collide(maze, probe, still, 0.24 / SCALE);
    return Math.abs(probe.x * SCALE - x) > 1e-6 || Math.abs(probe.z * SCALE - z) > 1e-6;
  };
  /** The crew against the walls, in plan metres. */
  const plan = { x: 0, z: 0 };
  const tmp = new THREE.Vector3();
  const guided = new Set<number>();

  // Face the longest open run from the spawn: the first thing seen is a long way.
  let spawnYaw = 0; let longest = -1;
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    let run = 0; let i = maze.spawn.i; let j = maze.spawn.j;
    while (run < 12 && maze.open(i, j, d)) { i += DX[d]; j += DZ[d]; run += 1; }
    if (run > longest) { longest = run; spawnYaw = Math.atan2(DX[d], DZ[d]); }
  }

  const say = (radio: string, seconds = 6) => { telemetry.radio = radio; radioHold = seconds; };
  const read = (key: string, seconds = 6) => { telemetry.readout = key; readoutHold = seconds; };

  const place = (x: number, y: number, z: number, yaw: number) => {
    cosmonaut.position.set(x, y, z);
    cosmonaut.velocity.set(0, 0, 0);
    cosmonaut.yaw = yaw;
    cosmonaut.settle();
    cam.yaw = yaw + Math.PI;
    cam.lookPitch = 0;
    cam.snap();
  };
  const wakeX = spawnX + Math.cos(spawnYaw) * shift;
  const wakeZ = spawnZ - Math.sin(spawnYaw) * shift;
  place(wakeX, 0, wakeZ, spawnYaw);
  cosmonaut.hold(true);
  cosmonaut.setGravity(9.81, true);
  cosmonaut.setHelmetView(true);
  cosmonaut.group.visible = false;
  lying.set(wakeX - Math.sin(spawnYaw) * 0.6, 0.26, wakeZ - Math.cos(spawnYaw) * 0.6);
  win.update(wakeX / SCALE, wakeZ / SCALE);

  // Compile with everything shown once, so nothing stalls later.
  const hiddenForCompile = [watcher, stairs];
  for (const o of hiddenForCompile) o.visible = true;
  const ready = compileFor(renderer, deps.target, () => renderer.compileAsync(scene, camera)).then(() => undefined, () => undefined).finally(() => {
    for (const o of hiddenForCompile) o.visible = false;
  });

  /** Panel light for every loaded instance: base, flicker, the guide. */
  const flicker = (i: number, j: number) => {
    const n = hash(deps.seed, Math.floor(t * 12 + i * 3.7), j, 5);
    return n < 0.14 ? 0.1 : n < 0.2 ? 0.6 : 1;
  };
  const paintPanels = () => {
    const data = kit.panelData;
    let changed = false;
    const col = new THREE.Color();
    for (const c of win.values()) {
      const mesh = c.panels;
      for (let k = 0; k < mesh.count; k++) {
        const cell = c.cells[k];
        const i = cell % SIDE; const j = (cell - i) / SIDE;
        const state = maze.panel(i, j);
        let v = state === 0 ? 1 : state === 1 ? flicker(i, j) : 0.08;
        const g = guided.has(cell) ? data[cell * 4 + 3] / 255 : 0;
        if (telemetry.guiding && g === 0 && state === 0) v *= 0.55;
        const r = Math.min(255, Math.round((state === 2 ? 0 : v) * 255));
        if (data[cell * 4] !== r) { data[cell * 4] = r; changed = true; }
        col.copy(PANEL_COLOR).multiplyScalar(Math.max(v, g * 1.3));
        if (state === 2) col.setRGB(0.22, 0.21, 0.17);
        mesh.setColorAt(k, col);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (changed) kit.panelTexture.needsUpdate = true;
  };

  /** Lost for long enough: the panels ahead come on one after another toward the exit. */
  const guide = (dt: number, i: number, j: number) => {
    const d = maze.distance(i, j);
    if (d < best) { best = d; bestAt = exploreT; }
    const lost = exploreT > LOST_AFTER || exploreT - bestAt > STALL_AFTER;
    if (lost && !telemetry.guiding) { telemetry.guiding = true; say('guide', 7); }
    if (!telemetry.guiding) return;
    guideT += dt;
    const data = kit.panelData;
    for (const cell of guided) data[cell * 4 + 3] = 0;
    guided.clear();
    const pulse = (guideT * 3) % 16;
    let ci = i; let cj = j;
    for (let k = 0; k < 16; k++) {
      const dir = maze.toward(ci, cj);
      if (dir === -1) break;
      ci += DX[dir]; cj += DZ[dir];
      const cell = mod(cj, SIDE) * SIDE + mod(ci, SIDE);
      const lit = Math.max(0, 1 - Math.abs(k - pulse) * 0.3) + (k < pulse ? 0.35 : 0);
      data[cell * 4 + 3] = Math.round(Math.min(1, lit) * 255);
      guided.add(cell);
    }
    kit.panelTexture.needsUpdate = true;
  };

  const handle: BackroomsHandle = {
    scene, maze, telemetry, ready, done: false,
    step(h, walk) {
      const phase = telemetry.phase;
      const inStairs = phase === 'stairs' || phase === 'climb';
      cosmonaut.hold(phase !== 'explore' && phase !== 'stairs');
      cosmonaut.update(h, walk, inStairs ? stairFloor : () => 0, [], 1e9);
      if (phase === 'explore') {
        const p = cosmonaut.position;
        plan.x = p.x / SCALE; plan.z = p.z / SCALE;
        collide(maze, plan, cosmonaut.velocity, 0.32 / SCALE);
        p.x = plan.x * SCALE; p.z = plan.z * SCALE;
      } else if (inStairs) {
        const p = cosmonaut.position; const v = cosmonaut.velocity;
        if (p.x < -1.0 * SCALE) { p.x = -1.0 * SCALE; v.x = Math.max(0, v.x); }
        if (p.x > 1.0 * SCALE) { p.x = 1.0 * SCALE; v.x = Math.min(0, v.x); }
        if (p.z < -0.8 * SCALE) { p.z = -0.8 * SCALE; v.z = Math.max(0, v.z); }
        if (p.z > 11.5 * SCALE) { p.z = 11.5 * SCALE; v.z = Math.min(0, v.z); }
      }
    },
    frame(dt, press, held) {
      t += dt;
      telemetry.seconds = t;
      watcherTime.value = t;
      radioHold = Math.max(0, radioHold - dt);
      if (radioHold <= 0) telemetry.radio = '';
      readoutHold = Math.max(0, readoutHold - dt);
      if (readoutHold <= 0) telemetry.readout = '';
      telemetry.prompt.active = false;
      telemetry.prompt.progress = -1;
      const p = cosmonaut.position;
      const px = p.x / SCALE; const pz = p.z / SCALE;
      const phase = telemetry.phase;
      const cellI = Math.floor(px / CELL); const cellJ = Math.floor(pz / CELL);

      if (phase === 'wake') {
        telemetry.black = t < WAKE_BLACK ? 1 : 1 - smooth((t - WAKE_BLACK) / 1.4);
        // On the carpet, looking at the ceiling; then up, the slow way.
        const up = smooth((t - WAKE_UP) / (WAKE_END - WAKE_UP));
        cosmonaut.eye(eye);
        tmp.lerpVectors(lying, eye, up);
        cam.lookPitch = 1.25 * (1 - up) + Math.sin(t * 0.7) * 0.03 * (1 - up);
        cam.firstPerson(dt, tmp, 0);
        camera.rotateZ((1 - up) * 0.35);
        telemetry.glitch = 0.6 + 0.4 * Math.sin(t * 13);
        if (t > WAKE_BLACK + 0.3 && t - dt <= WAKE_BLACK + 0.3) { audio.statics(3); say('static', 4); }
        if (t >= WAKE_END) {
          telemetry.phase = 'explore';
          read('air', 7);
        }
      } else if (phase === 'explore' || phase === 'door') {
        telemetry.black = phase === 'door' ? smooth((doorT - 1.9) / 0.6) : 0;
        exploreT += dt;
        win.update(px, pz);
        telemetry.chunks = win.size();
        telemetry.exitCells = maze.distance(cellI, cellJ);

        // The helmet: the suit says the air is fine, which it cannot be.
        if (telemetry.helmet) {
          telemetry.glitch = Math.max(0, Math.sin(t * 9.3) * Math.sin(t * 2.1));
          if (exploreT > HELMET_PROMPT) {
            telemetry.prompt = { active: true, label: 'removeHelmet', kind: 'tap', progress: -1 };
            if (press) {
              telemetry.helmet = false;
              cosmonaut.setGravity(9.81, false);
              read('gravity', 6);
              audio.thump();
            }
          } else if (exploreT > 1 && !telemetry.readout) read('gravity', 5);
        } else {
          telemetry.glitch = 0;
        }

        // The door.
        if (phase === 'explore') {
          door = null;
          for (const d of doors) if (d && Math.hypot(d.x - px, d.z - pz) < 3 / SCALE) door = d;
          if (door && !telemetry.helmet) {
            telemetry.prompt = { active: true, label: 'openDoor', kind: 'tap', progress: -1 };
            if (press) { telemetry.phase = 'door'; doorT = 0; audio.flick(); }
          }
        } else if (door) {
          doorT += dt;
          door.pivot.rotation.y = -smooth(doorT / 1.1) * 1.5;
          if (doorT > 1.1) {
            // Walked through, into the dark behind it.
            const k = smooth((doorT - 1.1) / 1.4);
            p.x += ((door.x - door.nx * 1.4) * SCALE - p.x) * k * dt * 3;
            p.z += ((door.z - door.nz * 1.4) * SCALE - p.z) * k * dt * 3;
          }
          if (doorT > 2.6) {
            telemetry.phase = 'stairs';
            root.visible = false;
            stairs.visible = true;
            (scene.fog as THREE.Fog).color.setHex(0x1a1814);
            (scene.background as THREE.Color).setHex(0x1a1814);
            place(0, STAIR_Y, -0.4 * SCALE, 0);
            win.clear();
            telemetry.chunks = 0;
            watcher.visible = false;
          }
        }

        // The watcher.
        if (sighting) {
          sightAge += dt;
          if (sightingEnds(sighting, px, pz, cam.yaw + Math.PI, sightAge)) {
            sighting = null;
            watcher.visible = false;
            nextSight = exploreT + 45 + hash(deps.seed, Math.floor(exploreT), 9, 9) * 45;
            audio.flick();
          }
        } else if (phase === 'explore' && exploreT > nextSight && Math.floor(exploreT * 2) !== Math.floor((exploreT - dt) * 2)) {
          sighting = chooseSighting(maze, px, pz, cam.yaw + Math.PI, exploreT, Math.floor(exploreT));
          if (sighting) {
            sightAge = 0;
            watcher.position.set(sighting.x, 0, sighting.z);
            watcher.rotation.y = sighting.yaw;
            watcher.visible = true;
          }
        }
        telemetry.sighting = !!sighting;

        if (phase === 'explore') guide(dt, cellI, cellJ);
        paintPanels();

        // Now and then, far away, something heavy.
        if (exploreT > nextThump) { audio.thump(); nextThump = exploreT + 50 + hash(deps.seed, Math.floor(exploreT), 4, 4) * 70; }
        flickT -= dt;
        if (flickT <= 0) {
          flickT = 1.5 + hash(deps.seed, Math.floor(t * 10), 6, 6) * 4;
          if (maze.panel(cellI, cellJ) === 1) audio.flick();
        }
        const near = Math.min(1, Math.max(0, (telemetry.exitCells - 4) / 56));
        audio.hum((0.35 + 0.65 * near) * (sighting ? 0.55 : 1), 0);
      } else if (phase === 'stairs' || phase === 'climb') {
        telemetry.exitCells = 0;
        stairsT += dt;
        telemetry.black = phase === 'climb' ? smooth((climbT - (CLIMB - 0.8)) / 0.8) : 1 - smooth(stairsT / 0.9);
        audio.hum(0.12, 0);
        if (phase === 'stairs' && pz > 10.4) {
          telemetry.prompt = { active: true, label: 'climb', kind: 'hold', progress: climbHold / 0.6 };
          climbHold = held ? climbHold + dt : 0;
          if (climbHold >= 0.6) { telemetry.phase = 'climb'; climbT = 0; }
        }
        if (phase === 'climb') {
          climbT += dt;
          const k = climbT / CLIMB;
          // The gravity comes off on the way up, and the suit seals.
          telemetry.gravity = 9.81 + (1.62 - 9.81) * smooth((k - 0.2) / 0.7);
          if (k > 0.5 && !telemetry.helmet) { telemetry.helmet = true; read('repress', 4); audio.statics(1.5); }
          if (climbT >= CLIMB) { telemetry.phase = 'out'; handle.done = true; }
        }
      }
      if (telemetry.phase !== 'climb') telemetry.gravity = cosmonaut.state.gravity;

      // Over the crew, well under a ceiling this far up, and not so close it burns the helmet out.
      crewLamp.position.set(cosmonaut.position.x, 4.2, cosmonaut.position.z);

      // ── The camera. ──
      if (telemetry.phase === 'explore' || telemetry.phase === 'stairs' || telemetry.phase === 'door') {
        // Over the shoulder down here, not behind the eyes: the thing at the
        // end of the corridor is worth having something between you and it.
        cam.chase(dt, {
          position: cosmonaut.position, velocity: cosmonaut.velocity, yaw: cosmonaut.yaw,
          height: 2.0, distance: Math.max(cam.distance, 7.5), fovExtra: 18,
          speedFrac: Math.min(1, cosmonaut.state.speed / cosmonaut.profile.run),
        }, { follow: 2.4, lead: 0.22, leadMax: 0.5, fovKick: 3, horizontal: 10, vertical: 5, blocked: walled, shoulder: 0.38 });
      } else if (telemetry.phase === 'climb' || telemetry.phase === 'out') {
        const k = smooth(climbT / CLIMB);
        cosmonaut.eye(eye);
        eye.set(0, STAIR_Y + (3.06 + k * 12) * SCALE + 1.6, 11.75 * SCALE);
        cam.lookPitch = 0.35 + Math.sin(climbT * 5.5) * 0.04;
        cam.firstPerson(dt, eye, 0);
      }
      audio.breathe(dt, cosmonaut.state.effort, !telemetry.helmet);
    },
    teleportToExit() {
      const ex = maze.exit;
      // The nearest copy of the exit to where the crew is.
      const p = cosmonaut.position;
      const ci = Math.floor(p.x / SCALE / CELL); const cj = Math.floor(p.z / SCALE / CELL);
      const gi = ex.i + Math.round((ci - ex.i) / SIDE) * SIDE;
      const gj = ex.j + Math.round((cj - ex.j) / SIDE) * SIDE;
      const x = (gi + 0.5) * CELL; const z = (gj + 0.5) * CELL;
      place((x - DX[ex.wall] * 0.3) * SCALE, 0, (z - DZ[ex.wall] * 0.3) * SCALE, Math.atan2(DX[ex.wall], DZ[ex.wall]));
      if (telemetry.phase === 'wake') telemetry.phase = 'explore';
      telemetry.helmet = false;
      cosmonaut.setGravity(9.81, false);
      win.update(x, z);
    },
    teleport(x, z, yaw) {
      place(x * SCALE, 0, z * SCALE, yaw);
      if (telemetry.phase === 'wake') { telemetry.phase = 'explore'; t = WAKE_END; }
      win.update(x, z);
    },
    showWatcher(x, z, yaw) {
      sighting = { x, z, yaw };
      sightAge = -30;
      watcher.position.set(x, 0, z);
      watcher.rotation.y = yaw;
      watcher.visible = true;
    },
    finish() {
      telemetry.phase = 'out';
      telemetry.gravity = 1.62;
      handle.done = true;
    },
    dispose() {
      win.clear();
      kit.dispose();
      watcherGeom.dispose();
      watcherMat.dispose();
      concrete.dispose();
      (cage.material as THREE.Material).dispose();
      for (const g of stairGeoms) g.dispose();
    },
  };
  return handle;
}
