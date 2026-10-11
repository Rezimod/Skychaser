// World Mode: the surface scene for Mars, for Proxima b and for Earth, built
// from one profile. The descent is flown, then the crew is handed the ground: three
// camera positions, the suit, the world's own sky and weather, and what is
// there — on Mars the base and its readouts, on Proxima b the biosphere and
// the people who live in it; on Earth, Tbilisi (world-earth), with its own
// ground, sky and air, a short re-entry before the descent, and no helmet.
// The Moon's rig (camera, suit, dust, prints, lights, post, perf) is reused
// as it is; only gravity, gait and colour change.
//
// Movement is simulated at a fixed 120 Hz and drawn interpolated; the
// camera, the effects and the glass run once per drawn frame.

import * as THREE from 'three';
import { makeMoonDust } from '@/lib/solar-system/moon-fx';
import { makeCosmonaut, type WalkInput } from '@/lib/solar-system/moon-cosmonaut';
import { headlamp, makeFixedStep, makePressEdge, makeSprintLatch, sprintFrom, walkFromStick } from '@/lib/solar-system/surface-input';
import { makePrints } from '@/lib/solar-system/moon-prints';
import { makeSuitAudio } from '@/lib/solar-system/moon-audio';
import { makeLander, type LanderTelemetry } from '@/lib/solar-system/moon-lander';
import type { PerfSample } from '@/lib/solar-system/moon-perf';
import { makeSurfaceHost } from '@/lib/solar-system/surface-host';
import { onQualityChange } from '@/game/quality';
import { makeKit } from '@/lib/solar-system/moon-kit';
import { makeCameraRig } from '@/lib/solar-system/moon-camera';
import { makeInteractions, type InteractionPrompt } from '@/lib/solar-system/moon-interactions';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import { makeWorldTerrain } from '@/lib/solar-system/world-terrain';
import { makeWorldSky } from '@/lib/solar-system/world-sky';
import { makeMarsBase } from '@/lib/solar-system/world-mars-base';
import { makeFlora } from '@/lib/solar-system/world-flora';
import { makeAliens, type AlienTelemetry } from '@/lib/solar-system/world-aliens';
import { WORLDS, type WorldId, type WorldProfile } from '@/lib/solar-system/world-profiles';
import type { EarthData } from '@/lib/solar-system/world-earth-data';
import { EARTH_DESCENT, EARTH_WALK_RADIUS, makeEarthWorld, type EarthState } from '@/lib/solar-system/world-earth';
import { makeEarthEntry } from '@/lib/solar-system/world-earth-entry';
import { haze } from '@/lib/solar-system/world-earth-haze';
import { makeFlightAudio } from '@/lib/solar-system/flight-audio';
import { getSettings, onSettingsChange } from '@/game/settings';
import { EARTH_CHASE, earthGait } from '@/lib/solar-system/world-earth-gait';

export type WorldView = 'chase' | 'helmet' | 'wide';
const VIEWS: WorldView[] = ['chase', 'helmet', 'wide'];

export interface WorldInput {
  moveX: number;
  moveY: number;
  jump: boolean;
  run: boolean;
  sprint: boolean;
  walk: boolean;
  crouch: boolean;
  shoulderSwap: boolean;
  orbitDX: number;
  orbitDY: number;
  zoom: number;
  interact: boolean;
  use: boolean;
  /** Edge-triggered: in and out of first person. Consumed. */
  viewToggle: boolean;
  /** Edge-triggered: round every view (the touch camera key). Consumed. */
  viewCycle: boolean;
  /** Edge-triggered: the headlamp on or off. Consumed. */
  headlamp: boolean;
  throttle: number;
}

export interface WorldOptions {
  startOnSurface?: boolean;
  onContextLost?: () => void;
  /** Earth only: the baked Tbilisi data, loaded before the scene is built. */
  earth?: EarthData;
}

export interface WorldTelemetry {
  ready: boolean;
  phase: 'descent' | 'touchdown' | 'surface' | 'ascent';
  /** The lander has climbed out of sight: the scene is done and orbit can take over. */
  ascended: boolean;
  landing: LanderTelemetry;
  grade: string;
  view: WorldView;
  headlamp: boolean;
  poiId: string;
  altitude: number;
  speed: number;
  hint: 'walk' | 'jump' | 'drive' | '';
  /** At the wheel of the car (Earth). */
  driving: boolean;
  o2: number;
  heartRate: number;
  suitTemp: number;
  outsideC: number;
  evaSeconds: number;
  distanceM: number;
  crouched: boolean;
  stumbling: boolean;
  sliding: boolean;
  heading: number;
  prompt: InteractionPrompt;
  readout: string;
  readoutHold: number;
  /** A line across the glass — a key under the world's `banner` — and how long it stays. */
  banner: string;
  bannerHold: number;
  /** Proxima b only. */
  aliens: AlienTelemetry | null;
  /** Earth only. */
  earth: EarthState | null;
  /** Coming in hot, before the powered descent (Earth). */
  entry: boolean;
}

export interface WorldSurfaceHandle {
  input: WorldInput;
  telemetry: WorldTelemetry;
  profile: WorldProfile;
  startAudio: () => void;
  teleport: (x: number, z: number) => void;
  /** Point the camera so that "forward" is this world direction. */
  face: (dx: number, dz: number) => void;
  where: () => { x: number; z: number; y: number };
  skipDescent: () => void;
  perf: () => PerfSample;
  probe: (within?: string) => Record<string, number>;
  /** The game shell's pause: no frames, no sim, no sound until resumed. */
  setPaused: (on: boolean) => void;
  /** Earth: move the clock (any ISO date), finish an expedition act, point the camera (degrees from north, pitch rad). */
  setTime: (iso: string) => void;
  advance: () => void;
  look: (heading: number, pitch?: number) => void;
  /** Show or hide a named part of the scene (profiling). */
  layer: (name: string, on: boolean) => void;
  /** Earth: the sky's working numbers, for checking the light. */
  sky: () => Record<string, number | number[]> | null;
  dispose: () => void;
}

declare global {
  interface Window {
    __skychaserWorld?: WorldSurfaceHandle;
  }
}

const EGRESS_HOLD = 4.2;
const STEP = 1 / 120;
const MAX_STEPS = 12;
/** The first-contact record, kept on the device. */
export const CONTACT_KEY = 'stellar_proxima_contact';

export function makeWorldSurface(mount: HTMLElement, world: WorldId, opts: WorldOptions = {}): WorldSurfaceHandle {
  const profile = WORLDS[world];
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const isEarth = world === 'earth' && !!opts.earth;
  // The star; the host owns it, its shadow box and the light pool.
  const host = makeSurfaceHost(mount, {
    clearColor: profile.sky.fog, exposure: 1.05, sun: { color: profile.sun.color, intensity: profile.sun.intensity },
    near: isEarth ? 0.1 : 0.05, far: isEarth ? 30000 : 4000, onContextLost: opts.onContextLost,
  });
  const { renderer, scene, camera, sun, lightPool, post, perf, lite, quality } = host;
  const earth = isEarth && opts.earth ? makeEarthWorld(renderer, opts.earth, lite) : null;
  // Earth's air is in its own materials (world-earth-haze), out to the Caucasus.
  if (!earth) scene.fog = new THREE.Fog(profile.sky.fog, profile.sky.fogNear, profile.sky.fogFar);
  let baseFov = getSettings().fov;
  const SUN_DIR = earth ? earth.sky.state.keyDir.clone() : profile.sunDir;

  // ── The sky's fill. ──
  const hemi = new THREE.HemisphereLight(profile.sky.fillSky, profile.sky.fillGround, profile.sky.fill);
  scene.add(hemi);

  const sky = earth ? null : makeWorldSky(renderer, profile, lite);
  if (sky) {
    scene.add(sky.group);
    scene.environment = sky.environment;
  }
  scene.environmentIntensity = 0.5;

  const terrain = earth ? null : makeWorldTerrain(profile, lite, quality.propDensity);
  if (terrain) scene.add(terrain.mesh, terrain.rocks, terrain.horizon);
  // Earth's environment must be in place before the compile, or every
  // material takes a second program on the first frame.
  if (earth) { scene.add(earth.group, earth.sky.group); scene.environment = earth.sky.environment; }
  const heightAt = earth ? earth.heightAt : terrain!.heightAt;
  const floorAt = earth ? earth.floorAt : terrain!.floorAt;
  const dust = makeMoonDust(1300, Math.min(1300, quality.dustMax), profile.gravity, profile.ground.dust);
  scene.add(dust.points);
  const prints = makePrints(900, quality.printsMax);
  scene.add(prints.mesh);
  const unsubQuality = onQualityChange((q) => { dust.setCap(Math.min(1300, q.dustMax)); prints.setCap(q.printsMax); });
  const kit = makeKit(lite);

  const colliders: Collider[] = [];
  const pois: PointOfInterest[] = [];
  const interactions = makeInteractions();
  const audio = makeSuitAudio(!!profile.breathable);
  const telemetryReadout = (key: string) => { telemetry.readout = key; telemetry.readoutHold = 7; audio.bleep(); };

  const base = world === 'mars' ? makeMarsBase(kit, heightAt, lite, telemetryReadout) : null;
  if (base) {
    scene.add(base.group);
    colliders.push(...base.colliders);
    pois.push(...base.pois);
    for (const i of base.interactables) interactions.add(i);
  }
  const flora = world === 'proximaB' && terrain ? makeFlora(profile, terrain, lite) : null;
  const aliens = flora ? makeAliens({
    heightAt, colliders: flora.colliders, village: flora.village, lite,
    onEvent: (kind) => {
      if (kind === 'notice') { banner('noticed'); audio.bleep(); }
      else if (kind === 'greet') { audio.bleep(); }
      else if (kind === 'stone') {
        banner('firstContact');
        audio.thump(30);
        try { localStorage.setItem(CONTACT_KEY, new Date().toISOString()); } catch { /* private mode */ }
      }
    },
  }) : null;
  if (flora && aliens) {
    scene.add(flora.group, aliens.group);
    colliders.push(...flora.colliders);
    pois.push(...flora.pois);
    for (const i of aliens.interactables) interactions.add(i);
  }

  if (earth) {
    colliders.push(...earth.colliders);
    pois.push(...earth.pois);
    for (const i of earth.interactables) interactions.add(i);
  }

  // Earth's air: no pressure suit, so an ordinary gait, and no helmet.
  const cosmonaut = makeCosmonaut(dust, lite, profile.gravity, !profile.breathable, !!profile.breathable);
  cosmonaut.onStep = (e) => { prints.stamp(e.x, e.y, e.z, e.yaw, e.side); audio.step(e.hard); cam.footfall(e.hard, cosmonaut.state.gait === 'run' || cosmonaut.state.gait === 'sprint' ? 1 : 0.25); };
  // On Earth, a game character's run: jog on the stick, sprint on Shift.
  if (earth) cosmonaut.setProfile(earthGait());
  scene.add(cosmonaut.group);
  const padX = profile.pad.x; const padZ = profile.pad.z + 26;
  const lander = makeLander(padX, padZ, heightAt, dust, lite, lightPool, profile.gravity, earth ? EARTH_DESCENT : undefined);
  scene.add(lander.group);
  // Earth first comes in hot: the entry flies the vehicle down to where the powered descent starts.
  const entry = earth ? makeEarthEntry(lander.group, lander.position.clone(), new THREE.Vector3(-EARTH_DESCENT.offsetX, 0, -EARTH_DESCENT.offsetZ).normalize()) : null;
  if (entry) scene.add(entry.group);
  const flightAudio = entry ? makeFlightAudio() : null;
  const walkRadius = earth ? EARTH_WALK_RADIUS : profile.walkRadius;

  // The collider lists are rebuilt into the same arrays: the camera asks
  // every frame and the walk asks every sim step.
  const camList: Collider[] = [];
  const walkList: Collider[] = [];
  const gather = (out: Collider[], extra: readonly Collider[]) => {
    out.length = 0;
    for (const c of colliders) out.push(c);
    for (const c of extra) out.push(c);
    return out;
  };
  const cameraColliders = () => (aliens ? gather(camList, aliens.colliders)
    : earth ? gather(camList, earth.cameraColliders(cosmonaut.position.x, cosmonaut.position.z)) : colliders);
  const cam = makeCameraRig(camera, floorAt, cameraColliders, baseFov);
  const unsubSettings = onSettingsChange((s) => { baseFov = s.fov; cam.setBaseFov(s.fov); });
  cam.distance = earth ? EARTH_CHASE.distance : isMobile ? 5.6 : 5.2;

  const input: WorldInput = {
    moveX: 0, moveY: 0, jump: false, run: false, sprint: false, walk: false, crouch: false, shoulderSwap: false, orbitDX: 0, orbitDY: 0, zoom: 0,
    interact: false, use: false, viewToggle: false, viewCycle: false, headlamp: false, throttle: 0,
  };
  const telemetry: WorldTelemetry = {
    ready: false, phase: 'descent', ascended: false, landing: lander.telemetry, grade: '', view: 'chase', headlamp: false, poiId: '',
    altitude: 0, speed: 0, hint: 'walk', driving: false, o2: 97.4, heartRate: 64, suitTemp: 21.5, outsideC: profile.ambientC,
    evaSeconds: 0, distanceM: 0, crouched: false, stumbling: false, sliding: false, heading: 0,
    prompt: interactions.prompt, readout: '', readoutHold: 0, banner: '', bannerHold: 0,
    aliens: aliens ? aliens.telemetry : null,
    earth: earth ? earth.state : null,
    entry: !!entry,
  };
  function banner(key: string) { telemetry.banner = key; telemetry.bannerHold = 5; }

  let view: WorldView = 'chase';
  const setView = (next: WorldView, snap = true) => {
    view = next;
    telemetry.view = next;
    cosmonaut.setHelmetView(next === 'helmet');
    cosmonaut.group.visible = true;
    post.setHelmet(next === 'helmet' ? 1 : 0);
    if (next === 'helmet') { cam.yaw = cosmonaut.yaw + Math.PI; cam.lookPitch = 0; }
    if (next === 'chase' && snap) cam.pitch = 0.3;
    if (next === 'wide' && snap) cam.pitch = 0.5;
    if (snap) cam.snap();
  };
  let outside: WorldView = 'chase';

  /** The lander is down: somewhere to walk round, and the way home. */
  let landerSettled = false;
  function settleLander() {
    if (landerSettled) return;
    landerSettled = true;
    pois.push({ id: 'ourLander', x: lander.position.x, z: lander.position.z, r: 8 });
    colliders.push({ x: lander.position.x, z: lander.position.z, r: 3.4 });
    // The people in the park come over to see who has landed.
    earth?.welcome(lander.position.x, lander.position.z, lander.telemetry.egressX, lander.telemetry.egressZ);
    interactions.add({
      id: 'boardLander', priority: 4,
      where: () => (telemetry.phase === 'surface' && !earth?.driving() ? { x: lander.position.x, z: lander.position.z, r: 5.2 } : null),
      kind: () => 'tap', label: () => 'boardLander',
      use: () => {
        telemetry.phase = 'ascent';
        telemetry.banner = ''; telemetry.bannerHold = 0;
        cosmonaut.group.visible = false;
        lander.launch();
        audio.thump(12);
        cam.shake(0.5);
        ascentFrom.copy(camera.position);
      },
    });
  }
  const ascentFrom = new THREE.Vector3();

  let t = 0;
  const clock = makeFixedStep(STEP, MAX_STEPS);
  const jumpPress = makePressEdge();
  let jumped = false;
  let walked = false;
  let lastPoi = '';
  let exertion = 0;
  let egressHold = 0;
  let entryHandoff = !!entry;
  const walk: WalkInput = { moveX: 0, moveZ: 0, jump: false, run: false, crouch: false, work: false };
  const tmp = new THREE.Vector3();
  const descentFocus = new THREE.Vector3();
  const descentPos = new THREE.Vector3();
  const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const walkColliders = () => (earth ? gather(walkList, earth.walkers(cosmonaut.position.x, cosmonaut.position.z)) : cameraColliders());
  const carVel = new THREE.Vector3();
  let welcomed = false;
  if (earth) {
    earth.onEvent = (kind) => {
      if (kind === 'enterCar') {
        cosmonaut.group.visible = false;
        cosmonaut.velocity.set(0, 0, 0);
        audio.bleep();
      } else if (kind === 'exitCar') {
        earth.car.door(tmp);
        place(tmp.x, floorAt(tmp.x, tmp.z), tmp.z);
        cosmonaut.yaw = earth.car.yaw;
        cosmonaut.settle();
        cosmonaut.group.visible = true;
        audio.bleep();
      }
    };
  }
  const stepFrom = new THREE.Vector3();
  const sprintLatch = makeSprintLatch();
  const place = (x: number, y: number, z: number) => {
    cosmonaut.position.set(x, y, z);
    cosmonaut.velocity.set(0, 0, 0);
    cosmonaut.settle();
  };

  const simStep = (h: number) => {
    const jump = jumpPress.take();
    if (earth?.carried()) return;
    if (earth?.driving()) {
      earth.drive(h, { throttle: input.moveY, steer: input.moveX, handbrake: input.jump }, colliders);
      cosmonaut.position.copy(earth.car.position);
      return;
    }
    const moving = Math.hypot(input.moveX, input.moveY) > 0.2;
    const sprint = sprintFrom(sprintLatch, input.sprint, moving, h);
    walkFromStick(walk, { moveX: input.moveX, moveY: input.moveY, jump: false, run: input.run, sprint, walk: input.walk, crouch: input.crouch }, cam.yaw, jump, interactions.prompt.holding);
    stepFrom.copy(cosmonaut.position);
    cosmonaut.update(h, walk, floorAt, walkColliders(), walkRadius);
    earth?.confine(cosmonaut.position, stepFrom);
    if (cosmonaut.state.impact > 1) cam.land(cosmonaut.state.impact);
    if (cosmonaut.state.landing === 'hard' || cosmonaut.state.landing === 'fall') cam.shake(0.5);
  };

  const frame = (dt: number) => {
    t += dt;
    cam.update(dt);
    cam.orbit(input.orbitDX, input.orbitDY, view === 'helmet');
    input.orbitDX = input.orbitDY = 0;
    const zoomIn = input.zoom < 0;
    const zoomPast = cam.zoom(input.zoom);
    input.zoom = 0;
    const crew = cosmonaut.position;

    if (entry && !entry.done) {
      entry.update(dt);
      telemetry.entry = !entry.done;
      const lt = lander.telemetry;
      const ground = heightAt(lander.position.x, lander.position.z);
      lt.altitude = Math.max(0, lander.position.y - ground);
      lt.offset = Math.hypot(lander.position.x - padX, lander.position.z - padZ);
      flightAudio?.reentry(entry.done ? 0 : entry.heat);
      if (t < dt * 2) camera.position.copy(entry.cameraFrom);
      else camera.position.lerp(entry.cameraFrom, 1 - Math.exp(-dt * 6));
      camera.position.x += Math.sin(t * 43) * entry.heat * 0.6;
      camera.position.y += Math.sin(t * 37 + 1) * entry.heat * 0.4;
      camera.lookAt(entry.cameraAt);
      input.interact = false;
      cosmonaut.group.visible = false;
    } else if (telemetry.phase === 'ascent') {
      // ── Going home. The camera stays on the ground a moment, then rises
      // after the vehicle and lets it go up into the sky. ──
      lander.update(dt, { throttle: 0, moveX: 0, moveY: 0 }, heightAt);
      input.interact = false;
      const climb = lander.telemetry.climb;
      tmp.copy(lander.position).y += 2.5;
      const rise = THREE.MathUtils.smoothstep(climb, 1.5, 6);
      descentPos.copy(ascentFrom).lerp(tmp, rise * 0.55);
      descentPos.y = Math.max(ascentFrom.y, descentPos.y);
      if (camera.position.distanceTo(descentPos) > 0.01) camera.position.lerp(descentPos, 1 - Math.exp(-dt * 3));
      camera.lookAt(tmp);
      if (lander.telemetry.throttle > 0.3 && lander.telemetry.altitude < 25) camera.position.y += Math.sin(t * 41) * 0.03 * lander.telemetry.throttle;
      if (climb > 7.5) telemetry.ascended = true;
    } else if (telemetry.phase !== 'surface') {
      const lt = lander.telemetry;
      if (!lt.landed) {
        lander.update(dt, { throttle: input.throttle, moveX: input.moveX, moveY: input.moveY }, heightAt);
        if (lt.landed) {
          telemetry.phase = 'touchdown';
          telemetry.grade = lt.touchdown < 0.9 ? 'feather' : lt.touchdown < 1.9 ? 'good' : lt.touchdown < 3.2 ? 'firm' : 'hard';
          egressHold = EGRESS_HOLD;
          audio.thump(lt.touchdown < 1.5 ? 40 : 6);
          cam.shake(Math.min(1, 0.25 + lt.touchdown * 0.2));
          settleLander();
        }
      } else {
        lander.update(dt, { throttle: 0, moveX: 0, moveY: 0 }, heightAt);
      }
      input.interact = false;
      const snapCam = t < dt * 2 || entryHandoff;
      entryHandoff = false;
      const close = THREE.MathUtils.clamp(1 - lt.altitude / 80, 0, 1);
      tmp.copy(lander.position).y += 3.0;
      descentFocus.lerp(tmp, snapCam ? 1 : 1 - Math.exp(-dt * 3.5));
      const dist = 17 + close * 4;
      const pitch = cam.pitch - 0.26 + close * 0.34;
      const sway = lt.throttle * 0.18;
      descentPos.set(
        descentFocus.x + Math.sin(cam.yaw) * dist * Math.cos(pitch) + Math.sin(t * 0.9) * sway,
        descentFocus.y + Math.sin(pitch) * dist + Math.sin(t * 1.3) * sway * 0.5,
        descentFocus.z + Math.cos(cam.yaw) * dist * Math.cos(pitch),
      );
      const floor = heightAt(descentPos.x, descentPos.z) + 2.2;
      if (descentPos.y < floor) descentPos.y = floor;
      if (snapCam) camera.position.copy(descentPos);
      else camera.position.lerp(descentPos, 1 - Math.exp(-dt * 4.5));
      if (lt.throttle > 0.05 && lt.altitude < 40) camera.position.y += Math.sin(t * 37) * 0.02 * lt.throttle;
      camera.lookAt(descentFocus);
      const wantFov = baseFov + 6;
      if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 2)); camera.updateProjectionMatrix(); }
      crew.set(lt.egressX, heightAt(lt.egressX, lt.egressZ), lt.egressZ);
      cosmonaut.settle();
      cosmonaut.group.visible = false;
      if (telemetry.phase === 'touchdown') {
        egressHold -= dt;
        if (egressHold <= 0) {
          telemetry.phase = 'surface';
          cosmonaut.position.set(lt.egressX, heightAt(lt.egressX, lt.egressZ), lt.egressZ);
          cosmonaut.yaw = Math.PI;
          cosmonaut.settle();
          cam.yaw = 0;
          setView('chase');
          banner('arrived');
          audio.bleep();
        }
      }
    } else {
      const press = input.interact;
      input.interact = false;
      jumpPress.see(input.jump);
      if (input.viewToggle) {
        input.viewToggle = false;
        if (view === 'helmet') setView(outside);
        else { outside = view; setView('helmet'); }
      }
      if (input.viewCycle) {
        input.viewCycle = false;
        setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
      }
      if (zoomPast && view === 'chase' && !earth?.driving()) setView('wide', false);
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
      const alpha = clock.advance(dt, simStep);
      const atWheel = !!earth?.driving();
      if (atWheel && earth) earth.car.present(alpha);
      else cosmonaut.present(alpha);

      interactions.update(dt, { x: crew.x, z: crew.z, yaw: atWheel && earth ? earth.car.yaw : cosmonaut.yaw, driving: atWheel, press, held: input.use || press });

      if (atWheel && earth) {
        const car = earth.car;
        carVel.set(Math.sin(car.yaw) * car.speed, 0, Math.cos(car.yaw) * car.speed);
        cam.chase(dt, {
          position: car.group.position, velocity: carVel, yaw: car.speed < -0.5 ? car.yaw + Math.PI : car.yaw,
          height: 1.9, distance: Math.max(7, cam.distance * 1.7), speedFrac: Math.min(1, Math.abs(car.speed) / 30),
        }, { follow: 5, lead: 0.22, leadMax: 4, fovKick: 14, horizontal: 12, vertical: 6 });
        cam.shake(car.bump * 0.7);
      } else if (view === 'helmet') {
        const rel = wrap(cam.yaw + Math.PI - cosmonaut.yaw);
        if (cosmonaut.state.speed < 0.3 && Math.abs(rel) > 0.9) cosmonaut.yaw += rel * (1 - Math.exp(-dt * 4));
        cosmonaut.look(wrap(cam.yaw + Math.PI - cosmonaut.yaw), cam.lookPitch);
        cosmonaut.eye(tmp);
        cam.firstPerson(dt, tmp, 0);
      } else {
        const wide = view === 'wide';
        cam.chase(dt, {
          position: cosmonaut.group.position, velocity: cosmonaut.velocity, yaw: cosmonaut.yaw,
          height: wide ? 2.2 : earth ? EARTH_CHASE.height : 1.35,
          distance: wide ? cam.distance * 4.2 + 14 : cam.distance,
          speedFrac: cosmonaut.state.speedFrac,
          fovExtra: cosmonaut.state.sprinting ? 5 : 0,
        }, wide
          ? { follow: 1, lead: 0, leadMax: 0, fovKick: 0, horizontal: 4, vertical: 3 }
          : earth ? EARTH_CHASE
            : { follow: 2.6, lead: 0.16, leadMax: 0.8, fovKick: 4, horizontal: 14, vertical: 6.5, shoulder: 0.4 });
      }
      if (!walked && cosmonaut.state.speed > 0.5) walked = true;
      if (!jumped && cosmonaut.state.airborne && cosmonaut.state.altitude > 0.3) jumped = true;
      telemetry.hint = atWheel ? 'drive' : !walked ? 'walk' : !jumped ? 'jump' : '';
      if (earth && !welcomed && earth.cheering() > 0.5) { welcomed = true; banner('welcome'); }
    }

    // ── The glass. ──
    telemetry.driving = !!earth?.driving();
    telemetry.altitude = cosmonaut.state.altitude;
    telemetry.speed = telemetry.driving && earth ? Math.abs(earth.car.speed) : cosmonaut.state.speed;
    telemetry.crouched = cosmonaut.state.crouched;
    telemetry.stumbling = cosmonaut.state.stumble > 0;
    telemetry.sliding = cosmonaut.state.sliding;
    telemetry.heading = earth ? earth.heading(cam.yaw) : (THREE.MathUtils.radToDeg(Math.atan2(-Math.sin(cam.yaw), Math.cos(cam.yaw))) + 360) % 360;
    const work = Math.min(1, cosmonaut.state.effort + (interactions.prompt.holding ? 0.35 : 0));
    exertion += (work - exertion) * (1 - Math.exp(-dt * 0.35));
    if (telemetry.phase === 'surface') {
      telemetry.evaSeconds += dt;
      if (!earth?.carried()) telemetry.distanceM += telemetry.speed * dt;
      // Heavier ground costs more air.
      telemetry.o2 = Math.max(0, telemetry.o2 - dt * 0.0011 * (1 + exertion * 2.2) * (0.6 + profile.gravity / 5));
      telemetry.heartRate += ((64 + exertion * 68 + (cosmonaut.state.landed ? 6 : 0)) - telemetry.heartRate) * (1 - Math.exp(-dt * 0.6));
      telemetry.suitTemp += ((21.5 + exertion * 1.8) - telemetry.suitTemp) * (1 - Math.exp(-dt * 0.2));
    }
    audio.update(dt, exertion, view === 'helmet');

    let best = ''; let bestD = 1e9;
    for (const poi of pois) {
      const d = Math.hypot(poi.x - crew.x, poi.z - crew.z);
      if (d < poi.r && d < bestD) { bestD = d; best = poi.id; }
    }
    if (best && best !== lastPoi && telemetry.phase === 'surface') audio.bleep();
    lastPoi = best;
    telemetry.poiId = best;
    telemetry.readoutHold = Math.max(0, telemetry.readoutHold - dt);
    if (telemetry.readoutHold <= 0) telemetry.readout = '';
    telemetry.bannerHold = Math.max(0, telemetry.bannerHold - dt);
    if (telemetry.bannerHold <= 0) telemetry.banner = '';

    dust.update(dt, heightAt);
    sky?.update(dt, camera.position);
    if (earth) {
      earth.update(dt, crew, telemetry.heading, input.use && telemetry.phase === 'surface', camera.position, place);
      const st = earth.sky.state;
      SUN_DIR.copy(st.keyDir);
      if (SUN_DIR.y < 0.02) SUN_DIR.y = 0.02;
      SUN_DIR.normalize();
      sun.color.copy(st.keyColor);
      sun.intensity = st.keyIntensity;
      hemi.color.copy(st.hemiSky);
      hemi.groundColor.copy(st.hemiGround);
      hemi.intensity = st.hemiIntensity;
      if (scene.environment !== earth.sky.environment) scene.environment = earth.sky.environment;
      if (earth.state.outsideC !== null) telemetry.outsideC = earth.state.outsideC;
    }
    base?.update(dt, t, crew.x, crew.z, lightPool);
    flora?.update(dt, t);
    if (aliens && telemetry.phase === 'surface') aliens.update(dt, t, crew.x, crew.z, lightPool);
    host.followShadow(crew, SUN_DIR);
    if (telemetry.headlamp && !earth?.driving()) headlamp(lightPool, crew, view === 'helmet' ? cam.yaw + Math.PI : cosmonaut.yaw);
    lightPool.flush(crew.x, crew.y, crew.z);
    host.render(dt);
  };
  host.start(frame, () => { telemetry.ready = true; }, cosmonaut.ready);

  const release = () => {
    lander.dispose();
    entry?.dispose();
    flightAudio?.dispose();
    earth?.dispose();
    cosmonaut.dispose();
    base?.dispose();
    flora?.dispose();
    aliens?.dispose();
    kit.dispose();
    prints.dispose();
    dust.dispose();
    terrain?.dispose();
    sky?.dispose();
  };

  const handle: WorldSurfaceHandle = {
    input, telemetry, profile,
    startAudio: () => { audio.start(); earth?.startAudio(); },
    teleport(x, z) {
      cosmonaut.position.set(x, floorAt(x, z), z);
      cosmonaut.velocity.set(0, 0, 0);
      cosmonaut.settle();
      cam.snap();
    },
    face(dx, dz) { cam.yaw = Math.atan2(-dx, -dz); cam.snap(); },
    where: () => ({ x: cosmonaut.position.x, y: cosmonaut.position.y, z: cosmonaut.position.z }),
    skipDescent() {
      if (telemetry.phase === 'surface') return;
      entry?.skip();
      telemetry.entry = false;
      flightAudio?.reentry(0);
      lander.position.set(padX, heightAt(padX, padZ) + 0.35, padZ);
      lander.telemetry.landed = true;
      lander.telemetry.touchdown = 0.6;
      lander.telemetry.offset = 0;
      lander.telemetry.drift = 0;
      lander.telemetry.egressX = padX;
      lander.telemetry.egressZ = padZ + 4.2;
      settleLander();
      telemetry.phase = 'touchdown';
      telemetry.grade = 'feather';
      egressHold = 0.2;
    },
    perf: perf.sample,
    probe: host.probe,
    setPaused: host.setPaused,
    setTime: (iso) => earth?.setTime(iso),
    advance: () => earth?.advance(),
    layer(name, on) {
      const o = scene.getObjectByName(name);
      if (o) o.visible = on;
    },
    sky: () => {
      if (!earth) return null;
      const st = earth.sky.state;
      return {
        sunAlt: st.sunAlt, adapt: st.adapt, key: st.keyIntensity, hemi: st.hemiIntensity, cloud: st.cloud, visibility: st.visibility,
        night: st.night, limitMag: st.limitMag, hazeBeta: haze.uHazeBeta.value, haze: haze.uHazeColor.value.toArray(), hazeSun: haze.uHazeSunColor.value.toArray(),
        hemiSky: st.hemiSky.toArray(), keyColor: st.keyColor.toArray(), exposure: renderer.toneMappingExposure,
      };
    },
    look(heading, pitch) {
      // Heading is clockwise from north (−z); the camera looks along (−sin yaw, −cos yaw).
      cam.yaw = Math.atan2(-Math.sin((heading * Math.PI) / 180), Math.cos((heading * Math.PI) / 180));
      if (pitch !== undefined) { cam.pitch = pitch; cam.lookPitch = pitch; }
      cam.snap();
    },
    dispose() {
      if (window.__skychaserWorld === handle) delete window.__skychaserWorld;
      unsubSettings();
      unsubQuality();
      audio.dispose();
      host.dispose(release);
    },
  };
  if (opts.startOnSurface) handle.skipDescent();
  if (process.env.NODE_ENV !== 'production') window.__skychaserWorld = handle;
  return handle;
}
