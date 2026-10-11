// Moon Mode: the surface scene that takes over when the ship lands. One
// renderer, one hard sun with a shadow map that follows the crew, earthshine,
// Earth with its clouds over the base, the Milky Way, the terrain, the
// outpost, the dust, the prints, the meteors, the rover — and the camera rig.
// The React overlay owns the DOM and feeds `input`; this file owns the frame.
//
// It opens with the landing, which is flown rather than watched, and then
// hands the crew the surface: six camera positions, a rover with four gears,
// three habitats behind airlocks, an outpost with work to do, and an
// expedition that runs from the mission computer out to a crater nobody has
// opened.
//
// Movement is simulated at a fixed 120 Hz and drawn interpolated, so it feels
// the same at 30 frames a second as at 144; the camera, the effects and the
// glass run once per drawn frame.

import * as THREE from 'three';
import { makeMoonSky } from '@/lib/solar-system/moon-sky';
import { makeMoonTerrain, makeMoonHorizon, TERRAIN_WALK_RADIUS, PAD_CENTER } from '@/lib/solar-system/moon-terrain';
import { makeMoonDust } from '@/lib/solar-system/moon-fx';
import { makeCosmonaut, type SuitAnim, type WalkInput } from '@/lib/solar-system/moon-cosmonaut';
import type { Gait, Mode, Track } from '@/lib/solar-system/suit-locomotion';
import { walkTrack } from '@/lib/solar-system/suit-scripted';
import { headlamp, makeFixedStep, makePressEdge, makeSprintLatch, sprintFrom, walkFromStick, type FootStick } from '@/lib/solar-system/surface-input';
import { makeAirlockRun, EQUALISE_SECONDS, type AirlockContext, type AirlockRun } from '@/lib/solar-system/moon-airlock';
import { bailVelocity, boardTrack, doorSide, doorSpot, seatSpotInto, type RoverFrame, type Spot } from '@/lib/solar-system/moon-rover-seat';
import { makeMoonBase, DOOR_Z, type Airlock, type BaseState } from '@/lib/solar-system/moon-base';
import { makeMeteors } from '@/lib/solar-system/moon-meteors';
import { makePrints } from '@/lib/solar-system/moon-prints';
import { makeSuitAudio } from '@/lib/solar-system/moon-audio';
import { makeRover, type RoverGear } from '@/lib/solar-system/moon-rover';
import { makeLander, type LanderInput, type LanderTelemetry } from '@/lib/solar-system/moon-lander';
import { makeMission, missionComplete, type MissionContext, type MissionTelemetry } from '@/lib/solar-system/moon-mission';
import { makeJobs, type JobId, type JobsTelemetry } from '@/lib/solar-system/moon-jobs';
import { makeMoonMissions } from '@/lib/solar-system/moon-missions';
import { localRewardSink, MISSION_ACHIEVEMENTS, OBJECTIVE_ACHIEVEMENTS, type Achievement } from '@/lib/solar-system/achievements';
import type { MissionsTelemetry } from '@/lib/solar-system/missions';
import type { MissionPropsTelemetry } from '@/lib/solar-system/moon-mission-props';
import type { PerfSample } from '@/lib/solar-system/moon-perf';
import { makeSurfaceHost } from '@/lib/solar-system/surface-host';
import { onQualityChange } from '@/game/quality';
import { makeKit } from '@/lib/solar-system/moon-kit';
import { makeCameraRig, type ChaseTarget, type ChaseTuning } from '@/lib/solar-system/moon-camera';
import { getSettings, onSettingsChange } from '@/game/settings';
import { makeInteractions, type InteractionContext, type InteractionPrompt } from '@/lib/solar-system/moon-interactions';
import { MOON_G } from '@/lib/solar-system/moon-fx';

/** Three ways to watch the crew, three to ride the rover. */
export type SurfaceView = 'chase' | 'helmet' | 'wide' | 'rover' | 'cockpit' | 'mast';
const FOOT_VIEWS: SurfaceView[] = ['chase', 'helmet', 'wide'];
const ROVER_VIEWS: SurfaceView[] = ['rover', 'cockpit', 'mast'];

export interface SurfaceInput {
  /** Stick, camera frame: x right, y forward, each in [-1, 1]. */
  moveX: number;
  moveY: number;
  jump: boolean;
  run: boolean;
  /** Held: the sprint key (a tap latches while the stick is held); the walk key. */
  sprint: boolean;
  walk: boolean;
  crouch: boolean;
  /** Edge-triggered: look over the other shoulder. Consumed. */
  shoulderSwap: boolean;
  /** Pointer drag since last frame, CSS px; consumed by the camera. */
  orbitDX: number;
  orbitDY: number;
  /** Wheel / pinch steps since last frame; consumed. */
  zoom: number;
  /** Edge-triggered: the action key went down. Consumed. */
  interact: boolean;
  /** The action key (or the tool key) is held. */
  use: boolean;
  /** Edge-triggered: in and out of the helmet on foot; round the rover's views in it. Consumed. */
  viewToggle: boolean;
  /** Edge-triggered: walk the camera round every view (the touch camera key). Consumed. */
  viewCycle: boolean;
  /** Edge-triggered: the headlamp on or off. Consumed. */
  headlamp: boolean;
  /** Held: the descent engine, 0…1, while there is still a vehicle to fly. */
  throttle: number;
  /** Edge-triggered: the gear to put the rover in, by its place in `telemetry.gears`. Consumed. */
  gearRequest: number | null;
}

export interface AirlockTelemetry {
  near: boolean;
  state: Airlock['state'];
  cycle: number;
}

export interface SurfaceOptions {
  /** Open on the surface beside the vehicle rather than on the way down. */
  startOnSurface?: boolean;
  /** The GPU took the context away; the owner should rebuild the scene. */
  onContextLost?: () => void;
}

export interface SurfaceTelemetry {
  /** Programs are compiled and frames are being drawn. */
  ready: boolean;
  phase: 'descent' | 'touchdown' | 'surface' | 'ascent';
  /** The lander has climbed out of sight: orbit can take over. */
  ascended: boolean;
  touchdownIn: number;
  landing: LanderTelemetry;
  grade: string;
  view: SurfaceView;
  driving: boolean;
  headlamp: boolean;
  poiId: string;
  poiDist: number;
  impactDist: number;
  impactHold: number;
  airborne: boolean;
  altitude: number;
  speed: number;
  hint: 'walk' | 'jump' | '';
  craters: number;
  o2: number;
  /** Per cent left in the suit's battery: the lamp and the cold both cost. */
  suitPower: number;
  /** Seconds since the suit was last pressurised or vented. */
  pressureAgo: number;
  heartRate: number;
  suitTemp: number;
  evaSeconds: number;
  distanceM: number;
  roverSpeed: number;
  gear: RoverGear;
  gears: RoverGear[];
  roverTop: number;
  battery: number;
  charging: boolean;
  roverFault: boolean;
  crouched: boolean;
  stumbling: boolean;
  sliding: boolean;
  anim: SuitAnim;
  gait: Gait;
  mode: Mode;
  sprinting: boolean;
  stamina: number;
  /** m/s², and the last step's length (m) and rate (steps/s). */
  gravity: number;
  stride: number;
  cadence: number;
  grounded: boolean;
  /** Where the crew is on the mare, for the base map. */
  crewX: number;
  crewZ: number;
  fallen: boolean;
  /** Where the crew is looking, degrees clockwise from north. */
  heading: number;
  mission: MissionTelemetry;
  /** The five Moon missions: what is in hand and what has been done. */
  missions: MissionsTelemetry;
  /** What the mission props have to say: the scanner, the scope, the hands. */
  props: MissionPropsTelemetry;
  jobs: JobsTelemetry;
  /** The one thing the action key will do right now. */
  prompt: InteractionPrompt;
  /** What the crew did up there, in order. Records, not rewards. */
  achievements: Achievement[];
  airlock: AirlockTelemetry;
  /** A status panel somebody is reading: a key under `moon.readout`, and how long it stays up. */
  readout: string;
  readoutHold: number;
  inside: string;
}

export interface MoonSurfaceHandle {
  input: SurfaceInput;
  telemetry: SurfaceTelemetry;
  startAudio: () => void;
  /** Development hooks. */
  nudgeMeteor: () => void;
  teleport: (x: number, z: number) => void;
  /** Point the camera so that "forward" is this world direction. */
  face: (dx: number, dz: number) => void;
  where: () => { x: number; z: number; y: number };
  /** Where the camera is, whether the base says it may be there, and its height over the ground. */
  cameraAt: () => { x: number; y: number; z: number; blocked: boolean; clearance: number; view: SurfaceView };
  /** Places the camera is hardest to keep clear: a door ramp, inside a dome, against a hull, by the rover, on the steepest ground. */
  cameraSpots: () => { id: string; x: number; z: number }[];
  advanceMission: () => void;
  startJob: (id?: JobId) => void;
  /** Take on one of the five missions; development, and the mission list later. */
  startMission: (id?: string) => string | null;
  /** Use the thing with this id, wherever the crew is and whatever it asks
   *  for first: development only, for scripted runs. */
  forceInteract: (id: string, seconds?: number) => boolean;
  skipDescent: () => void;
  perf: () => PerfSample;
  /** Development: draw calls per scene layer. */
  probe: (within?: string) => Record<string, number>;
  /** What the base shows: power, dish, dome, charger (missions flip these; development toggles them). */
  baseState: (next?: Partial<BaseState>) => Readonly<BaseState>;
  /** Development: hold the camera at this offset from the crew (world metres), looking at them; null lets it go. */
  devCamera: (offset: [number, number, number] | null) => void;
  /** The game shell's pause: no frames, no sim, no sound until resumed. */
  setPaused: (on: boolean) => void;
  roverAt: () => { x: number; z: number };
  dispose: () => void;
}

declare global {
  interface Window {
    __skychaserMoon?: MoonSurfaceHandle;
  }
}

/** How long the touchdown plaque stays up before the crew steps out. */
const EGRESS_HOLD = 4.2;
const STEP = 1 / 120;
const MAX_STEPS = 12;
// Near the south pole the Sun never climbs far: a low sun out of the south-west,
// long shadows across the base. Earth's direction is real, from moon-sky.
const SUN_DIR = new THREE.Vector3(-0.62, 0.3, 0.72).normalize();

export function starfield(count: number, band: number): THREE.Points {
  const total = count + band;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.1, 0.4, 0.3));
  const v = new THREE.Vector3();
  for (let i = 0; i < total; i++) {
    const inBand = i >= count;
    if (inBand) {
      const a = Math.random() * Math.PI * 2;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.22;
      v.set(Math.cos(a), g, Math.sin(a)).normalize().applyQuaternion(tilt);
    } else {
      const u = Math.random() * 2 - 1; const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      v.set(r * Math.cos(a), u, r * Math.sin(a));
    }
    pos[i * 3] = v.x * 1800; pos[i * 3 + 1] = v.y * 1800; pos[i * 3 + 2] = v.z * 1800;
    const b = inBand ? 0.04 + Math.pow(Math.random(), 2) * 0.16 : 0.35 + Math.pow(Math.random(), 3) * 0.9;
    const warm = Math.random();
    col[i * 3] = b * (0.85 + warm * 0.15);
    col[i * 3 + 1] = b * 0.9;
    col[i * 3 + 2] = b * (1.05 - warm * 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/** A tiny environment for the visor and the metal: black sky, bright regolith below, one sun. */
function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
  scene.add(sky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: 0x8a8884 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  scene.add(ground);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(30, 28, 24) }));
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  sky.geometry.dispose(); (sky.material as THREE.Material).dispose();
  ground.geometry.dispose(); (ground.material as THREE.Material).dispose();
  sun.geometry.dispose(); (sun.material as THREE.Material).dispose();
  return target;
}

export function makeMoonSurface(mount: HTMLElement, opts: SurfaceOptions = {}): MoonSurfaceHandle {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  // One hard sun; the host owns it, its shadow box and the light pool.
  const host = makeSurfaceHost(mount, { clearColor: 0x000000, exposure: 1.08, sun: { color: 0xfff8ee, intensity: 3.6 }, near: 0.05, far: 4000, onContextLost: opts.onContextLost });
  const { renderer, scene, camera, lightPool, post, perf, lite, quality } = host;
  const envTarget = makeEnvironment(renderer);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.45;
  let baseFov = getSettings().fov;

  // ── A faint bounce off the regolith from below, and earthshine. No sky to
  // scatter light, but the sunlit ground bounces a warm grey up into every
  // shadow: that is what keeps a shaded suit readable. ──
  scene.add(new THREE.HemisphereLight(0x11141b, 0x6f6b65, 0.4));
  const sky = makeMoonSky(SUN_DIR, { faint: quality.stars, band: quality.band });
  scene.add(sky.group);
  const earthFill = new THREE.DirectionalLight(0xa9bde0, 0.12);
  earthFill.position.copy(sky.earthDir);
  scene.add(earthFill);

  const terrain = makeMoonTerrain(lite, quality.propDensity);
  scene.add(terrain.mesh);
  scene.add(terrain.rocks);
  const dust = makeMoonDust(1600, quality.dustMax);
  scene.add(dust.points);
  const prints = makePrints(900, quality.printsMax);
  scene.add(prints.mesh);
  const kit = makeKit(lite);
  const base = makeMoonBase(terrain.heightAt, lite, kit, SUN_DIR, lightPool);
  scene.add(base.group);
  // The ground the crew uses every day: compacted where people walk and
  // park, scoured where the landers set down; boot prints and tracks already
  // in it from the crews before.
  for (const g of base.zones.groundMarks) terrain.tint(g.x, g.z, g.r, g.k);
  for (const p of base.zones.paths) terrain.tintPath(p, 1.1, -0.07);
  for (const tr of base.zones.tracks) terrain.tintPath(tr, 1.9, -0.035);
  const history = makePrints(1200, quality.historyMax);
  scene.add(history.mesh);
  const unsubQuality = onQualityChange((q) => { dust.setCap(q.dustMax); prints.setCap(q.printsMax); history.setCap(q.historyMax); });
  {
    let side = 1;
    for (const path of base.zones.paths) {
      for (let s = 0; s < path.length - 1; s++) {
        const [ax, az] = path[s]; const [bx, bz] = path[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const yaw = Math.atan2(bx - ax, bz - az);
        for (let d = 0; d < len; d += 0.8) {
          const wob = Math.sin(d * 1.7 + s) * 0.35;
          const x = ax + (bx - ax) * (d / len) + Math.cos(yaw) * wob;
          const z = az + (bz - az) * (d / len) - Math.sin(yaw) * wob;
          history.stamp(x, terrain.heightAt(x, z), z, yaw + (side > 0 ? 0 : Math.PI) * (d % 3.2 < 1.6 ? 0 : 1), side);
          side = -side;
        }
      }
    }
    for (const tr of base.zones.tracks) {
      for (let s = 0; s < tr.length - 1; s++) {
        const [ax, az] = tr[s]; const [bx, bz] = tr[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const yaw = Math.atan2(bx - ax, bz - az);
        for (let d = 0; d < len; d += 0.9) {
          for (const off of [-1.35, 1.35]) {
            const x = ax + (bx - ax) * (d / len) + Math.cos(yaw) * off;
            const z = az + (bz - az) * (d / len) - Math.sin(yaw) * off;
            history.track(x, terrain.heightAt(x, z), z, yaw, 0.36);
          }
        }
      }
    }
  }
  for (const path of base.zones.paths) terrain.clearRocks(path, 1.4);
  for (const tr of base.zones.tracks) terrain.clearRocks(tr, 2.2);
  /** A crater dug now: the ground, its rocks and the prints on it all agree. */
  const dig = (x: number, z: number, r: number, depth: number) => {
    terrain.stampCrater(x, z, r, depth);
    prints.clear(x, z, r * 1.2);
    history.clear(x, z, r * 1.2);
  };
  const horizon = makeMoonHorizon(terrain, lite);
  scene.add(horizon);

  const cosmonaut = makeCosmonaut(dust, lite);
  cosmonaut.setCeiling(base.ceilingAt);
  cosmonaut.position.copy(base.spawn);
  cosmonaut.yaw = Math.PI;
  cosmonaut.settle();
  scene.add(cosmonaut.group);
  const audio = makeSuitAudio();
  cosmonaut.onStep = (e) => {
    if (!base.inside) prints.stamp(e.x, e.y, e.z, e.yaw, e.side);
    audio.step(e.hard);
    // Only the heavy gaits put weight into the view.
    cam.footfall(e.hard, cosmonaut.state.gait === 'run' || cosmonaut.state.gait === 'sprint' ? 1 : 0.25);
  };
  const gears: RoverGear[] = missionComplete() ? ['creep', 'cruise', 'sprint', 'ion'] : ['creep', 'cruise', 'sprint'];
  const rover = makeRover(base.rover, base.roverCollider, base.roverParts, terrain, dust, prints, gears);
  const lander = makeLander(PAD_CENTER.x, PAD_CENTER.y + 26, terrain.heightAt, dust, lite, lightPool);
  scene.add(lander.group);
  const mission = makeMission(terrain.heightAt, dig, dust, lite, lightPool, base.zones.anchors.scienceTerminal);
  scene.add(mission.group);
  base.colliders.push(...mission.colliders);
  base.walkColliders.push(...mission.colliders);
  const meteors = makeMeteors({
    heightAt: terrain.heightAt, stampCrater: dig, dust, colliders: base.colliders,
    walkRadius: TERRAIN_WALK_RADIUS, first: 24, every: 58, lights: lightPool,
  });
  scene.add(meteors.group);
  let roverFault = false;
  const jobs = makeJobs({
    anchors: base.zones.anchors, heightAt: terrain.heightAt,
    arrayFault: base.zones.arrayFault, dishFault: base.zones.dishFault, setStatus: base.zones.setStatus,
    rover: () => ({ x: rover.position.x, z: rover.position.z, yaw: rover.yaw }),
    setRoverFault: (on) => { roverFault = on; },
    briefed: () => mission.telemetry.briefed,
  });
  scene.add(jobs.group);

  /** The ground under the crew: the base's own floors where it has them. */
  const floorHeight = (x: number, z: number) => {
    const ground = terrain.heightAt(x, z);
    const floor = base.floorAt(x, z);
    return floor === null ? ground : Math.max(floor, ground);
  };
  const cam = makeCameraRig(camera, floorHeight, () => base.colliders, baseFov);
  const unsubSettings = onSettingsChange((s) => { baseFov = s.fov; cam.setBaseFov(s.fov); });
  cam.distance = isMobile ? 5.6 : 5.2;

  const input: SurfaceInput = {
    moveX: 0, moveY: 0, jump: false, run: false, sprint: false, walk: false, crouch: false, shoulderSwap: false, orbitDX: 0, orbitDY: 0, zoom: 0,
    interact: false, use: false, viewToggle: false, viewCycle: false, headlamp: false, throttle: 0, gearRequest: null,
  };
  const interactions = makeInteractions();
  // What the crew earns up here is a record of what they did, kept on the
  // device: no Stars are awarded and nothing is minted from the Moon.
  const sink = localRewardSink();
  // The five missions: their props, their engine, and the world changes they
  // make. They own the base's power, dish, dome and charger from here on.
  const moonMissions = makeMoonMissions({
    heightAt: terrain.heightAt,
    anchors: base.zones.anchors,
    lander: () => ({ x: lander.position.x, z: lander.position.z }),
    earthDir: sky.earthDir,
    state: base.state,
    setState: base.setState,
    arrayFault: base.zones.arrayFault,
    dishFault: base.zones.dishFault,
    setStatus: base.zones.setStatus,
    carry: interactions.carry,
    bus: interactions.bus,
  });
  scene.add(moonMissions.props.group);
  const telemetry: SurfaceTelemetry = {
    ready: false, phase: 'descent', ascended: false, touchdownIn: 0, landing: lander.telemetry, grade: '',
    view: 'chase', driving: false, headlamp: false, poiId: '', poiDist: 0, impactDist: 0, impactHold: 0,
    airborne: false, altitude: 0, speed: 0, hint: 'walk', craters: 0,
    o2: 97.4, suitPower: 100, pressureAgo: 1e4, heartRate: 64, suitTemp: 21.5, evaSeconds: 0, distanceM: 0,
    roverSpeed: 0, gear: rover.gear, gears: rover.gears, roverTop: rover.top, battery: 1, charging: false, roverFault: false,
    crouched: false, stumbling: false, sliding: false, anim: 'idle', gait: 'stand', mode: 'idle', sprinting: false, stamina: 1, gravity: cosmonaut.state.gravity, stride: 0, cadence: 0,
    grounded: true, fallen: false, heading: 0, crewX: 0, crewZ: 0,
    mission: mission.telemetry, missions: moonMissions.missions.telemetry, props: moonMissions.props.telemetry,
    jobs: jobs.telemetry, prompt: interactions.prompt, achievements: sink.list(),
    airlock: { near: false, state: 'closed', cycle: 0 }, readout: '', readoutHold: 0, inside: '',
  };

  // ── Everything the one key can do. ──
  let view: SurfaceView = 'chase';
  const driving = () => ROVER_VIEWS.includes(view);
  const setView = (next: SurfaceView, snap = true) => {
    view = next;
    telemetry.view = next;
    // The crew is drawn from outside — walking, or in the saddle — and never from their own eyes.
    cosmonaut.setHelmetView(next === 'helmet');
    cosmonaut.group.visible = next !== 'helmet' && next !== 'cockpit' && next !== 'mast';
    post.setHelmet(next === 'helmet' || next === 'cockpit' ? 1 : 0);
    if (next === 'helmet') { cam.yaw = cosmonaut.yaw + Math.PI; cam.lookPitch = 0; }
    if (next === 'cockpit' || next === 'mast') { cam.yaw = rover.yaw + Math.PI; cam.lookPitch = next === 'mast' ? -0.08 : -0.05; }
    if (next === 'rover' && snap) { cam.yaw = rover.yaw + Math.PI; cam.pitch = 0.3; }
    if (next === 'chase' && snap) cam.pitch = 0.3;
    if (next === 'wide' && snap) cam.pitch = 0.5;
    if (snap) cam.snap();
  };
  /** The crew is being carried along a track (a vault, a door, a climb). */
  const TRACKED: Mode[] = ['vault', 'enterDoor', 'exitDoor', 'enterVehicle', 'exitVehicle'];
  const tracking = () => TRACKED.includes(cosmonaut.state.mode);
  const queue: { track: Track; then: Mode }[] = [];
  const chain = (tracks: Track[], then: Mode) => {
    queue.length = 0;
    tracks.forEach((track, i) => queue.push({ track, then: i === tracks.length - 1 ? then : 'idle' }));
    cosmonaut.hold(true);
  };
  const rframe: RoverFrame = { x: 0, y: 0, z: 0, yaw: 0 };
  const roverFrame = () => { rframe.x = rover.position.x; rframe.y = rover.position.y; rframe.z = rover.position.z; rframe.yaw = rover.yaw; return rframe; };
  const seat: Spot = { x: 0, y: 0, z: 0, yaw: 0 };
  const clearSpot = (x: number, z: number) => !base.walkColliders.some((col) => col !== base.roverCollider && Math.hypot(x - col.x, z - col.z) < col.r + 0.6);
  let airlockRun: AirlockRun | null = null;
  let airlockDoor: Airlock | null = null;
  let bailHold = 0;
  const cycleView = () => {
    const set = driving() ? ROVER_VIEWS : FOOT_VIEWS;
    setView(set[(set.indexOf(view) + 1) % set.length]);
  };
  /** Into the helmet and back out to whichever outside view it was. */
  let outside: SurfaceView = 'chase';
  const toggleHelmet = () => {
    if (driving()) { cycleView(); return; }
    if (view === 'helmet') setView(outside);
    else { outside = view; setView('helmet'); }
  };
  const readout = (key: string) => { telemetry.readout = key; telemetry.readoutHold = 6; audio.bleep(); };
  for (const i of mission.interactables) interactions.add(i);
  for (const i of jobs.interactables) interactions.add(i);
  for (const i of moonMissions.props.interactables) interactions.add(i);
  base.airlocks.forEach((a, k) => interactions.add({
    id: `airlock${k}`, priority: 2,
    where: () => {
      if (airlockRun || tracking()) return null;
      const d = base.doorway(a);
      // From inside, the whole deck is near enough: the crew walks to the chamber themselves.
      const inside = base.inside?.id === a.habitat;
      const p = inside ? d.inside : d.outside;
      return { x: p.x, z: p.z, r: inside ? 6 : 3.2 };
    },
    kind: () => 'tap',
    label: () => (base.inside?.id === a.habitat ? 'exitAirlock' : 'enterAirlock'),
    use: () => {
      airlockRun = makeAirlockRun(base.doorway(a), base.inside?.id === a.habitat ? 'exit' : 'enter');
      airlockDoor = a;
      cosmonaut.hold(true);
      audio.bleep();
    },
  }));
  // Getting in: walk to the nearer clear side, climb up and sit. Out: the reverse, on a clear side.
  interactions.add({
    id: 'roverEnter', priority: 1,
    where: () => (tracking() || airlockRun || Math.abs(rover.speed) > 0.5 ? null : { x: base.roverCollider.x, z: base.roverCollider.z, r: base.roverCollider.r + 2.8 }),
    kind: () => 'tap', label: () => 'getIn',
    use: () => {
      const frame = roverFrame();
      const side = doorSide(frame, cosmonaut.position.x, cosmonaut.position.z, clearSpot);
      const mark = doorSpot(frame, side, 0);
      const spot = { ...mark, y: floorHeight(mark.x, mark.z) };
      const from = { x: cosmonaut.position.x, y: cosmonaut.position.y, z: cosmonaut.position.z, yaw: cosmonaut.yaw };
      chain([walkTrack('enterVehicle', from, spot, 1.3), boardTrack('enterVehicle', frame, side, spot.y, MOON_G < 5)], 'seated');
      audio.bleep();
    },
  });
  interactions.add({
    id: 'roverExit', mode: 'rover',
    where: () => (tracking() ? null : { x: rover.position.x, z: rover.position.z, r: 1e6 }),
    kind: () => (Math.abs(rover.speed) < 1.2 ? 'tap' : 'hold'),
    label: () => (Math.abs(rover.speed) < 1.2 ? 'getOut' : 'bailOut'),
    progress: () => (Math.abs(rover.speed) >= 1.2 ? bailHold / 0.4 : -1),
    use: (dt) => {
      const speed = Math.abs(rover.speed);
      const frame = roverFrame();
      if (speed < 1.2) {
        rover.driving = false;
        const side = doorSide(frame, cosmonaut.position.x + Math.cos(rover.yaw), cosmonaut.position.z - Math.sin(rover.yaw), clearSpot);
        const spot = doorSpot(frame, side, 0);
        chain([boardTrack('exitVehicle', frame, side, floorHeight(spot.x, spot.z), MOON_G < 5)], 'idle');
        setView('chase', false);
        audio.bleep();
        return;
      }
      // Holding the key on the move: over the side, and take the landing as it comes.
      bailHold += dt;
      if (bailHold < 0.4) return;
      bailHold = 0;
      rover.driving = false;
      // The driver sits on the left, and goes out that way.
      const side = -1;
      const v = bailVelocity(frame, side, rover.speed, MOON_G < 5);
      const out = doorSpot(frame, side, frame.y + 1.0);
      cosmonaut.position.set(out.x, out.y, out.z);
      cosmonaut.release(v.vx, v.vy, v.vz, 'bail');
      cosmonaut.hold(false);
      setView('chase', false);
      cam.shake(0.4);
      audio.bleep();
    },
  });
  const anchors = base.zones.anchors;
  for (const [id, anchor, key] of [['isru', anchors.isruPanel, 'isru'], ['power', anchors.powerCabinet, 'power'], ['comms', anchors.commsControl, 'comms'], ['charger', anchors.charger, 'charger']] as const) {
    interactions.add({
      id: `readout-${id}`, priority: 0,
      where: () => ({ x: anchor.x, z: anchor.z, r: 2.4 }),
      kind: () => 'tap', label: () => `read.${key}`,
      use: () => readout(key),
    });
  }
  mission.onEvent = (kind, x, z) => {
    if (kind === 'bite') audio.step(0.45);
    else if (kind === 'rumble') { audio.thump(25); cam.shake(0.4); }
    else if (kind === 'meteor' && x !== undefined && z !== undefined) meteors.strike(x, z);
    else if (kind === 'reward') audio.milestone();
    else audio.bleep();
    if (kind === 'reward' && mission.telemetry.stage === 'done') rover.unlock('ion');
  };
  jobs.onEvent = (kind) => { if (kind === 'reward') audio.milestone(); else audio.bleep(); };
  moonMissions.missions.onEvent = (kind, id) => {
    if (kind === 'mission') {
      audio.milestone();
      audio.chatter();
      const key = MISSION_ACHIEVEMENTS[id];
      // The telescope's record carries what it was pointed at, so the log can
      // send the crew to that object over their own sky tonight.
      if (key) sink.record(key, id === 'telescope' ? moonMissions.props.telemetry.observed : undefined);
    } else {
      audio.bleep();
      const key = OBJECTIVE_ACHIEVEMENTS[id];
      if (key) { sink.record(key); audio.chatter(); }
    }
  };

  /** The lander is down: a thing to walk around, and a place to find again. */
  const settleLander = () => {
    base.pois.push({ id: 'ourLander', x: lander.position.x, z: lander.position.z, r: 8 });
    const hull = { x: lander.position.x, z: lander.position.z, r: 3.4 };
    base.colliders.push(hull);
    base.walkColliders.push(hull);
    // The way home: climb aboard and go back up.
    interactions.add({
      id: 'boardLander', priority: 4,
      where: () => (telemetry.phase === 'surface' && !driving() ? { x: lander.position.x, z: lander.position.z, r: 5.2 } : null),
      kind: () => 'tap', label: () => 'boardLander',
      use: () => {
        telemetry.phase = 'ascent';
        cosmonaut.group.visible = false;
        lander.launch();
        audio.thump(12);
        cam.shake(0.5);
        ascentFrom.copy(camera.position);
      },
    });
  };
  const ascentFrom = new THREE.Vector3();

  // ── Frame state. ──
  let t = 0;
  const clock = makeFixedStep(STEP, MAX_STEPS);
  const jumpPress = makePressEdge();
  let jumped = false;
  let walked = false;
  let lastPoi = '';
  let exertion = 0;
  /** Air moving in the chamber: set when a cycle starts, gone when it ends. */
  let hissK = 0;
  let egressHold = 0;
  const walk: WalkInput = { moveX: 0, moveZ: 0, jump: false, run: false, crouch: false, work: false };
  const tmp = new THREE.Vector3();
  const roverVel = new THREE.Vector3();
  const descentFocus = new THREE.Vector3();
  const descentPos = new THREE.Vector3();
  const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  const sprintLatch = makeSprintLatch();
  const stick: FootStick = { moveX: 0, moveY: 0, jump: false, run: false, sprint: false, walk: false, crouch: false };
  const simStep = (h: number) => {
    const jump = jumpPress.take();
    if (driving()) {
      rover.update(h, input.moveY, input.moveX, base.colliders, TERRAIN_WALK_RADIUS, input.jump);
      // In the saddle: the crew sits where the seat is, facing the way the rover does.
      seatSpotInto(roverFrame(), seat);
      cosmonaut.update(h, walk, floorHeight, base.walkColliders, TERRAIN_WALK_RADIUS);
      cosmonaut.position.set(seat.x, seat.y, seat.z);
      cosmonaut.yaw = rover.yaw;
      return;
    }
    rover.update(h, 0, 0, base.colliders, TERRAIN_WALK_RADIUS);
    const moving = Math.hypot(input.moveX, input.moveY) > 0.2;
    stick.moveX = input.moveX; stick.moveY = input.moveY; stick.run = input.run; stick.walk = input.walk; stick.crouch = input.crouch;
    stick.sprint = sprintFrom(sprintLatch, input.sprint, moving, h);
    walkFromStick(walk, stick, cam.yaw, jump, interactions.prompt.holding);
    const wasTracking = tracking();
    cosmonaut.update(h, walk, floorHeight, base.walkColliders, TERRAIN_WALK_RADIUS);
    if (!wasTracking && !tracking()) base.confine(cosmonaut.position);
    if (cosmonaut.state.impact > 1) cam.land(cosmonaut.state.impact);
    if (cosmonaut.state.landing === 'hard' || cosmonaut.state.landing === 'fall') cam.shake(0.5);
  };

  const landerIn: LanderInput = { throttle: 0, moveX: 0, moveY: 0 };
  const ictx: InteractionContext = { x: 0, z: 0, yaw: 0, driving: false, press: false, held: false };
  const mctx: MissionContext = { crewX: 0, crewZ: 0, driving: false };
  const actx: AirlockContext = { doorOpen: 0, cycling: false, tracking: false, from: { x: 0, y: 0, z: 0, yaw: 0 } };
  const chaseTarget: ChaseTarget = { position: cosmonaut.group.position, velocity: cosmonaut.velocity, yaw: 0, height: 1.35, distance: 5, speedFrac: 0, fovExtra: 0 };
  const ROVER_CHASE: ChaseTuning = { follow: 3.5, lead: 0.2, leadMax: 3, fovKick: 9, horizontal: 11, vertical: 4.5 };
  const WIDE_CHASE: ChaseTuning = { follow: 1, lead: 0, leadMax: 0, fovKick: 0, horizontal: 4, vertical: 3 };
  const FOOT_CHASE: ChaseTuning = { follow: 2.4, lead: 0.3, leadMax: 0.8, fovKick: 4, horizontal: 9, vertical: 4, shoulder: 0.4, blocked: null };
  let devCam: [number, number, number] | null = null;
  const frame = (dt: number) => {
    t += dt;
    cam.update(dt);
    cam.orbit(input.orbitDX, input.orbitDY, view === 'helmet' || view === 'cockpit' || view === 'mast');
    input.orbitDX = input.orbitDY = 0;
    const zoomIn = input.zoom < 0;
    const zoomPast = cam.zoom(input.zoom);
    input.zoom = 0;
    const crew = cosmonaut.position;
    if (telemetry.phase === 'ascent') {
      // ── Going home: the camera stays on the ground a moment, then follows the vehicle up. ──
      landerIn.throttle = 0; landerIn.moveX = 0; landerIn.moveY = 0;
      lander.update(dt, landerIn, terrain.heightAt);
      input.interact = false;
      const climb = lander.telemetry.climb;
      tmp.copy(lander.position).y += 2.5;
      descentPos.copy(ascentFrom).lerp(tmp, THREE.MathUtils.smoothstep(climb, 1.5, 6) * 0.55);
      descentPos.y = Math.max(ascentFrom.y, descentPos.y);
      camera.position.lerp(descentPos, 1 - Math.exp(-dt * 3));
      camera.lookAt(tmp);
      rover.update(dt, 0, 0, base.colliders, TERRAIN_WALK_RADIUS);
      rover.present(1);
      if (climb > 7.5) telemetry.ascended = true;
    } else if (telemetry.phase !== 'surface') {
      // ── The landing. The vehicle is flown; the camera rides low on its
      // quarter, so it looms, and it sways with the engine. ──
      const lt = lander.telemetry;
      if (!lt.landed) {
        landerIn.throttle = input.throttle; landerIn.moveX = input.moveX; landerIn.moveY = input.moveY;
        lander.update(dt, landerIn, terrain.heightAt);
        if (lt.landed) {
          telemetry.phase = 'touchdown';
          telemetry.grade = lt.touchdown < 0.9 ? 'feather' : lt.touchdown < 1.9 ? 'good' : lt.touchdown < 3.2 ? 'firm' : 'hard';
          egressHold = EGRESS_HOLD;
          audio.thump(lt.touchdown < 1.5 ? 40 : 6);
          cam.shake(Math.min(1, 0.25 + lt.touchdown * 0.2));
          settleLander();
        }
      } else {
        landerIn.throttle = 0; landerIn.moveX = 0; landerIn.moveY = 0;
        lander.update(dt, landerIn, terrain.heightAt);
      }
      input.interact = false;
      telemetry.touchdownIn = lt.descent > 0.2 ? lt.altitude / lt.descent : 0;
      const close = THREE.MathUtils.clamp(1 - lt.altitude / 80, 0, 1);
      tmp.copy(lander.position).y += 3.0;
      descentFocus.lerp(tmp, t < dt * 2 ? 1 : 1 - Math.exp(-dt * 3.5));
      const dist = 17 + close * 4;
      const pitch = cam.pitch - 0.26 + close * 0.34;
      const sway = lt.throttle * 0.18;
      descentPos.set(
        descentFocus.x + Math.sin(cam.yaw) * dist * Math.cos(pitch) + Math.sin(t * 0.9) * sway,
        descentFocus.y + Math.sin(pitch) * dist + Math.sin(t * 1.3) * sway * 0.5,
        descentFocus.z + Math.cos(cam.yaw) * dist * Math.cos(pitch),
      );
      const floor = terrain.heightAt(descentPos.x, descentPos.z) + 2.2;
      if (descentPos.y < floor) descentPos.y = floor;
      if (t < dt * 2) camera.position.copy(descentPos);
      else camera.position.lerp(descentPos, 1 - Math.exp(-dt * 4.5));
      if (lt.throttle > 0.05 && lt.altitude < 40) camera.position.y += Math.sin(t * 37) * 0.02 * lt.throttle;
      camera.lookAt(descentFocus);
      const wantFov = baseFov + 6;
      if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 2)); camera.updateProjectionMatrix(); }
      crew.set(lt.egressX, terrain.heightAt(lt.egressX, lt.egressZ), lt.egressZ);
      cosmonaut.settle();
      cosmonaut.group.visible = false;
      rover.update(dt, 0, 0, base.colliders, TERRAIN_WALK_RADIUS);
      rover.present(1);
      if (telemetry.phase === 'touchdown') {
        egressHold -= dt;
        if (egressHold <= 0) {
          telemetry.phase = 'surface';
          cosmonaut.position.set(lt.egressX, terrain.heightAt(lt.egressX, lt.egressZ), lt.egressZ);
          cosmonaut.yaw = Math.PI;
          cosmonaut.settle();
          cam.yaw = 0;
          setView('chase');
          audio.bleep();
        }
      }
    } else {
      // ── Edges and the keys that are not movement. ──
      const press = input.interact;
      input.interact = false;
      jumpPress.see(input.jump);
      if (input.viewToggle) {
        input.viewToggle = false;
        toggleHelmet();
      }
      if (input.viewCycle) {
        input.viewCycle = false;
        cycleView();
      }
      // Out past the far stop is the wide view; any step back in returns to the shoulder.
      if (zoomPast && view === 'chase') setView('wide', false);
      else if (zoomIn && view === 'wide') setView('chase', false);
      if (input.headlamp) {
        input.headlamp = false;
        telemetry.headlamp = !telemetry.headlamp;
        cosmonaut.lamps(telemetry.headlamp);
        audio.bleep();
      }
      if (input.shoulderSwap) {
        input.shoulderSwap = false;
        cam.swapShoulder();
      }
      if (input.gearRequest !== null) {
        const want = input.gearRequest;
        input.gearRequest = null;
        const was = rover.gear;
        rover.select(want);
        if (roverFault && (rover.gear === 'sprint' || rover.gear === 'ion')) rover.select(1);
        if (rover.gear !== was) audio.bleep();
      }

      // ── The simulation, at its own fixed rate. ──
      const alpha = clock.advance(dt, simStep);
      cosmonaut.present(alpha);
      rover.present(alpha);

      // ── Scripted moves: the next track in a chain, the airlock's sequence, the seat. ──
      if (queue.length && !tracking()) {
        const next = queue.shift()!;
        cosmonaut.script(next.track, next.then);
        if (!queue.length && next.then !== 'seated') cosmonaut.hold(false);
      }
      if (!queue.length && !tracking() && cosmonaut.state.mode === 'seated' && !driving()) {
        rover.driving = true;
        cosmonaut.hold(false);
        setView('rover', false);
      }
      if (airlockRun && airlockDoor) {
        const a = airlockDoor;
        actx.doorOpen = a.open; actx.cycling = a.state === 'cycling'; actx.tracking = tracking();
        actx.from.x = cosmonaut.position.x; actx.from.y = cosmonaut.position.y; actx.from.z = cosmonaut.position.z; actx.from.yaw = cosmonaut.yaw;
        const ev = airlockRun.update(dt, actx);
        if (ev?.kind === 'track') cosmonaut.script(ev.track, 'idle');
        else if (ev?.kind === 'open') { if (a.state === 'closed') base.cycleAirlock(a); audio.bleep(); }
        else if (ev?.kind === 'close') { if (a.state === 'open') base.cycleAirlock(a); audio.bleep(); }
        else if (ev?.kind === 'pressurised') { cosmonaut.setGravity(MOON_G, false); cosmonaut.visor(true); audio.bleep(); hissK = 1; telemetry.pressureAgo = 0; }
        else if (ev?.kind === 'depressurised') { cosmonaut.setGravity(MOON_G, true); cosmonaut.visor(false); audio.bleep(); hissK = 1; telemetry.pressureAgo = 0; }
        else if (ev?.kind === 'done') { airlockRun = null; airlockDoor = null; cosmonaut.hold(false); }
      }
      if (!driving()) cosmonaut.indoors = !!base.inside;

      // ── The one key. ──
      ictx.x = crew.x; ictx.z = crew.z; ictx.yaw = driving() ? rover.yaw : cosmonaut.yaw; ictx.driving = driving(); ictx.press = press; ictx.held = input.use || press;
      interactions.update(dt, ictx);
      if (!interactions.prompt.holding) bailHold = 0;
      mctx.crewX = crew.x; mctx.crewZ = crew.z; mctx.driving = driving();
      mission.update(dt, t, mctx);
      jobs.update(dt, mctx);
      moonMissions.props.update(dt, { x: crew.x, z: crew.z, yaw: driving() ? rover.yaw : cosmonaut.yaw });
      moonMissions.missions.update(dt, { x: crew.x, z: crew.z, driving: driving() });

      // ── The camera. ──
      if (driving()) {
        roverVel.set(Math.sin(rover.yaw) * rover.speed, 0, Math.cos(rover.yaw) * rover.speed);
        if (view === 'rover') {
          chaseTarget.position = base.rover.position; chaseTarget.velocity = roverVel; chaseTarget.yaw = rover.yaw + rover.yawRate * 0.35;
          chaseTarget.height = 1.9; chaseTarget.distance = Math.max(cam.distance, 6.2); chaseTarget.speedFrac = Math.min(1, Math.abs(rover.speed) / 26); chaseTarget.fovExtra = 0;
          cam.chase(dt, chaseTarget, ROVER_CHASE);
        } else {
          (view === 'mast' ? base.roverParts.mast : base.roverParts.seat).getWorldPosition(tmp);
          if (view === 'mast') tmp.y += 0.12;
          cam.firstPerson(dt, tmp, view === 'mast' ? 20 : 28);
        }
        cam.shake(rover.bump * 0.5);
      } else if (view === 'helmet') {
        const rel = wrap(cam.yaw + Math.PI - cosmonaut.yaw);
        if (cosmonaut.state.speed < 0.3 && Math.abs(rel) > 0.9) cosmonaut.yaw += rel * (1 - Math.exp(-dt * 4));
        cosmonaut.look(wrap(cam.yaw + Math.PI - cosmonaut.yaw), cam.lookPitch);
        cosmonaut.eye(tmp);
        cam.firstPerson(dt, tmp, 0);
      } else {
        const inside = base.inside;
        const wide = view === 'wide' && !inside;
        // Near a habitat the walls are the whole answer to where the camera may be.
        let nearHab = false;
        for (const a of base.airlocks) if (Math.hypot(a.x - crew.x, a.z - crew.z) < 15) { nearHab = true; break; }
        chaseTarget.position = cosmonaut.group.position; chaseTarget.velocity = cosmonaut.velocity; chaseTarget.yaw = cosmonaut.yaw;
        chaseTarget.height = wide ? 2.2 : 1.35;
        chaseTarget.distance = wide ? cam.distance * 4.2 + 14 : inside ? Math.min(cam.distance, 2.8) : cam.distance;
        chaseTarget.speedFrac = cosmonaut.state.speedFrac;
        chaseTarget.fovExtra = cosmonaut.state.sprinting ? 5 : 0;
        FOOT_CHASE.blocked = nearHab ? base.blocked : null;
        cam.chase(dt, chaseTarget, wide ? WIDE_CHASE : FOOT_CHASE);
      }
      if (!walked && cosmonaut.state.speed > 0.5) walked = true;
      if (!jumped && cosmonaut.state.airborne && cosmonaut.state.altitude > 0.3) jumped = true;
      telemetry.hint = !walked ? 'walk' : !jumped ? 'jump' : '';
    }
    cam.shake(meteors.shake * 0.8);

    // ── The glass. ──
    const onRover = driving();
    telemetry.driving = onRover;
    telemetry.airborne = cosmonaut.state.airborne;
    telemetry.altitude = cosmonaut.state.altitude;
    telemetry.speed = onRover ? Math.abs(rover.speed) : cosmonaut.state.speed;
    telemetry.roverSpeed = rover.speed;
    telemetry.gear = rover.gear;
    telemetry.roverTop = rover.top;
    telemetry.battery = rover.battery;
    telemetry.roverFault = roverFault;
    const charger = anchors.charger;
    telemetry.charging = Math.hypot(rover.position.x - charger.x, rover.position.z - charger.z) < 4 && Math.abs(rover.speed) < 0.3 && rover.battery < 0.995;
    if (telemetry.charging) rover.charge(dt);
    base.zones.setStatus('charger', telemetry.charging ? 'warn' : 'ok');
    telemetry.crouched = cosmonaut.state.crouched;
    telemetry.stumbling = cosmonaut.state.stumble > 0;
    telemetry.sliding = cosmonaut.state.sliding;
    telemetry.anim = cosmonaut.state.anim;
    telemetry.gait = cosmonaut.state.gait;
    telemetry.mode = cosmonaut.state.mode;
    telemetry.sprinting = cosmonaut.state.sprinting;
    telemetry.stamina = cosmonaut.state.stamina;
    telemetry.gravity = cosmonaut.state.gravity;
    telemetry.stride = cosmonaut.state.stride;
    telemetry.cadence = cosmonaut.state.cadence;
    telemetry.grounded = cosmonaut.state.grounded;
    telemetry.fallen = cosmonaut.state.fallen;
    // A map, not a mirror: north is -Z, east +X (the base's own layout), so what is on your right is right on the ribbon.
    telemetry.heading = (THREE.MathUtils.radToDeg(Math.atan2(-Math.sin(cam.yaw), Math.cos(cam.yaw))) + 360) % 360;
    telemetry.crewX = crew.x;
    telemetry.crewZ = crew.z;

    const work = onRover ? 0.1 : Math.min(1, cosmonaut.state.effort + (interactions.prompt.holding ? 0.35 : 0));
    exertion += (work - exertion) * (1 - Math.exp(-dt * 0.35));
    if (telemetry.phase === 'surface') {
      telemetry.evaSeconds += dt;
      telemetry.pressureAgo += dt;
      telemetry.distanceM += telemetry.speed * dt;
      telemetry.o2 = Math.max(0, telemetry.o2 - dt * 0.0011 * (1 + exertion * 2.2));
      // The pack runs the fan, the heaters and — when it is on — the lamp.
      // Indoors the suit is on the habitat's power and gets some of it back.
      const draw = base.inside ? -0.004 : 0.0006 * (1 + exertion * 0.8) + (telemetry.headlamp ? 0.0004 : 0);
      telemetry.suitPower = Math.max(0, Math.min(100, telemetry.suitPower - dt * draw * 100));
      telemetry.heartRate += ((64 + exertion * 68 + (cosmonaut.state.landed ? 6 : 0)) - telemetry.heartRate) * (1 - Math.exp(-dt * 0.6));
      telemetry.suitTemp += ((21.5 + exertion * 1.8) - telemetry.suitTemp) * (1 - Math.exp(-dt * 0.2));
    }
    audio.update(dt, exertion, view === 'helmet' || view === 'cockpit');
    const dr = mission.telemetry.drill;
    audio.drill(dr.load, mission.telemetry.stage === 'drill' && dr.engaged && !dr.stalled && !dr.ready);
    // The motor through the seat, the descent engine through the frame: both
    // are felt, not heard. The hiss and the habitat's machinery need air, so
    // they sound only in a chamber that has some and on a deck that is lit.
    audio.motor(Math.min(1, Math.abs(rover.speed) / Math.max(1, rover.top)), onRover && Math.abs(rover.speed) > 0.2);
    audio.engine(telemetry.phase === 'descent' || telemetry.phase === 'ascent' ? lander.telemetry.throttle : 0);
    hissK = Math.max(0, hissK - dt / EQUALISE_SECONDS);
    audio.hiss(hissK);
    audio.hum(base.inside && base.state.power ? 1 : 0);

    let best = ''; let bestD = 1e9;
    for (const poi of base.pois) {
      const d = Math.hypot(poi.x - crew.x, poi.z - crew.z);
      if (d < poi.r && d < bestD) { bestD = d; best = poi.id; }
    }
    if (best && best !== lastPoi && telemetry.phase === 'surface') audio.bleep();
    lastPoi = best;
    telemetry.poiId = best;
    telemetry.poiDist = best ? bestD : 0;
    let nearLock: Airlock | null = null;
    for (const a of base.airlocks) if (Math.hypot(a.x - crew.x, a.z - crew.z) < 8) nearLock = a;
    telemetry.airlock.near = !!nearLock && !onRover;
    if (nearLock) { telemetry.airlock.state = nearLock.state; telemetry.airlock.cycle = nearLock.cycle; }
    telemetry.inside = base.inside?.id ?? '';
    telemetry.readoutHold = Math.max(0, telemetry.readoutHold - dt);
    if (telemetry.readoutHold <= 0) telemetry.readout = '';

    const impact = telemetry.phase === 'surface' ? meteors.update(dt, crew.x, crew.z) : null;
    if (impact) {
      telemetry.impactDist = impact.distance;
      telemetry.impactHold = 6;
      telemetry.craters += 1;
      audio.thump(impact.distance);
    }
    telemetry.impactHold = Math.max(0, telemetry.impactHold - dt);

    dust.update(dt, terrain.heightAt);
    rover.light(lightPool);
    if (telemetry.headlamp && !driving()) headlamp(lightPool, crew, view === 'helmet' ? cam.yaw + Math.PI : cosmonaut.yaw);
    base.update(dt, t, sky.earthDir, crew.x, crew.z);
    terrain.setSunView(tmp.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse));
    if (devCam) {
      camera.position.set(crew.x + devCam[0], crew.y + devCam[1], crew.z + devCam[2]);
      camera.lookAt(crew.x, crew.y + 1.0, crew.z);
    }
    host.followShadow(crew, SUN_DIR);
    lightPool.flush(crew.x, crew.y, crew.z);
    sky.update(dt, camera, renderer.getPixelRatio());
    host.render(dt);
  };
  host.start(frame, () => { telemetry.ready = true; }, cosmonaut.ready);

  const release = () => {
    lander.dispose();
    mission.dispose();
    jobs.dispose();
    moonMissions.dispose();
    meteors.dispose();
    cosmonaut.dispose();
    base.dispose();
    kit.dispose();
    prints.dispose();
    history.dispose();
    dust.dispose();
    terrain.dispose();
    horizon.geometry.dispose();
    sky.dispose();
    envTarget.dispose();
  };

  const handle: MoonSurfaceHandle = {
    input,
    telemetry,
    startAudio: audio.start,
    nudgeMeteor: meteors.nudge,
    teleport(x, z) {
      queue.length = 0;
      airlockRun = null; airlockDoor = null;
      if (driving()) { rover.driving = false; setView('chase'); }
      cosmonaut.hold(false);
      cosmonaut.release(0, 0, 0, 'idle');
      cosmonaut.position.set(x, floorHeight(x, z), z);
      cosmonaut.velocity.set(0, 0, 0);
      cosmonaut.settle();
      cam.snap();
    },
    face(dx, dz) { cam.yaw = Math.atan2(-dx, -dz); cam.snap(); },
    where: () => ({ x: cosmonaut.position.x, y: cosmonaut.position.y, z: cosmonaut.position.z }),
    cameraAt: () => {
      const p = camera.position;
      return { x: p.x, y: p.y, z: p.z, blocked: base.blocked(p.x, p.y, p.z), clearance: p.y - floorHeight(p.x, p.z), view };
    },
    cameraSpots() {
      const a = base.airlocks[0]; const b = base.airlocks[1] ?? a;
      const ax = Math.sin(a.yaw); const az = Math.cos(a.yaw);
      const bx = Math.sin(b.yaw); const bz = Math.cos(b.yaw);
      let slope = { x: 0, z: 0, g: -1 };
      for (let r = 40; r < TERRAIN_WALK_RADIUS - 10; r += 6) {
        for (let k = 0; k < 48; k++) {
          const x = Math.cos(k / 48 * Math.PI * 2) * r; const z = Math.sin(k / 48 * Math.PI * 2) * r;
          const g = Math.hypot(terrain.heightAt(x + 1, z) - terrain.heightAt(x - 1, z), terrain.heightAt(x, z + 1) - terrain.heightAt(x, z - 1)) / 2;
          if (g > slope.g && g < 0.5) slope = { x, z, g };
        }
      }
      return [
        { id: 'ramp', x: a.x + ax * 3, z: a.z + az * 3 },
        { id: 'dome', x: a.x - ax * DOOR_Z, z: a.z - az * DOOR_Z },
        { id: 'hull', x: b.x - bx * DOOR_Z + bz * 6.4, z: b.z - bz * DOOR_Z - bx * 6.4 },
        { id: 'rover', x: base.roverCollider.x + base.roverCollider.r + 0.6, z: base.roverCollider.z },
        { id: 'slope', x: slope.x, z: slope.z },
      ];
    },
    advanceMission: mission.advance,
    startJob: (id) => { jobs.start(id); },
    startMission: (id) => moonMissions.missions.start(id),
    forceInteract(id, seconds = 3) {
      const i = moonMissions.props.interactables.find((p) => p.id === id) ?? interactions.find(id);
      if (!i) return false;
      if (i.kind() === 'tap') { i.use(0); interactions.bus.emit({ type: 'interaction:completed', id }); return true; }
      // A hold: run it to the end in one go, as holding the key would.
      for (let k = 0; k < Math.ceil(seconds / 0.05) + 1; k++) i.use(0.05);
      interactions.bus.emit({ type: 'interaction:completed', id });
      return true;
    },
    skipDescent() {
      if (telemetry.phase === 'surface') return;
      lander.position.set(PAD_CENTER.x, terrain.heightAt(PAD_CENTER.x, PAD_CENTER.y + 26) + 0.35, PAD_CENTER.y + 26);
      lander.telemetry.landed = true;
      lander.telemetry.touchdown = 0.6;
      lander.telemetry.egressX = lander.position.x;
      lander.telemetry.egressZ = lander.position.z + 4.2;
      settleLander();
      telemetry.phase = 'touchdown';
      telemetry.grade = 'feather';
      egressHold = 0.2;
    },
    perf: perf.sample,
    probe: host.probe,
    baseState(next) { if (next) base.setState(next); return base.state; },
    devCamera(offset) { devCam = offset; },
    setPaused: host.setPaused,
    roverAt: () => ({ x: base.roverCollider.x, z: base.roverCollider.z }),
    dispose() {
      if (window.__skychaserMoon === handle) delete window.__skychaserMoon;
      unsubSettings();
      unsubQuality();
      audio.dispose();
      host.dispose(release);
    },
  };
  if (opts.startOnSurface) handle.skipDescent();
  if (process.env.NODE_ENV !== 'production') window.__skychaserMoon = handle;
  return handle;
}
