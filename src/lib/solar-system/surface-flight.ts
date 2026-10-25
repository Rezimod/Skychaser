// The orbital legs of a surface scene: the way down from orbit to where the
// powered descent begins, and the way back up from the top of the lander's
// climb to orbit. One of these per surface scene (the Moon's and the
// worlds'); it owns the flight profile (orbital-descent.ts), puts the ship
// on it, lights its engines and its plasma (entry-fx.ts), flies the camera
// and calls the scene's sounds, and says when the lander should take over
// or when orbit has been reached. The scene keeps its own phase machine.
//
// The camera is a chase behind and above the ship, held in the ship's own
// frame (the ship moves kilometres a frame in orbit, so it is the offset
// that is smoothed, never the position), with the planet's radial as up so
// the horizon stays level far from the site. It opens with a slow swing
// round from ahead of the ship, and the air shakes it: a random walk in its
// offset and its roll, and a kick in the field of view, scaled by the
// turbulence.

import * as THREE from 'three';
import { hasAir, type GlobeWorld } from '@/lib/solar-system/planet-frame';
import {
  makeOrbitalAscent, makeOrbitalDescent, type OrbitalDescent, type OrbitalFlight, type OrbitalInput, type OrbitalTelemetry,
} from '@/lib/solar-system/orbital-descent';
import { makeEntryFx, plasmaFor } from '@/lib/solar-system/entry-fx';
import type { LanderHandle } from '@/lib/solar-system/moon-lander';

export interface SurfaceFlightSounds {
  /** The air on the hull, 0…1, every frame. */
  reentry?: (k: number) => void;
  /** Down through the speed of sound. */
  boom?: () => void;
}

export interface SurfaceFlightOptions {
  world: GlobeWorld;
  lander: LanderHandle;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lite: boolean;
  /** The player's field of view, read each frame (it can change in Settings). */
  baseFov: () => number;
  sounds?: SurfaceFlightSounds;
}

export type SurfaceFlightStep = 'idle' | 'flying' | 'handover' | 'orbit';

export interface SurfaceFlight {
  /** Which leg is being flown. */
  leg: 'descent' | 'ascent' | null;
  /** The live numbers of that leg (the last leg's once it is over). */
  telemetry: OrbitalTelemetry;
  /** Fly one frame: the scene's stick (x right, y forward) and throttle. */
  update: (dt: number, stick: { moveX: number; moveY: number; throttle: number }) => SurfaceFlightStep;
  /** Development and the skip key: straight to the handover. */
  skip: () => void;
  /** Development: to the top of the entry (or the braking burn). */
  skipToEntry: () => void;
  /** From the top of the lander's climb, on up to orbit. */
  beginAscent: () => void;
  /** Stop flying and put everything away (the skip to the ground). */
  stop: () => void;
  /** Where the camera sits round the ship, as the descent camera's yaw. */
  cameraYaw: () => number;
  dispose: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);
/** How long the opening swing round the ship takes, s of play. */
const INTRO = 7;

export function makeSurfaceFlight(opts: SurfaceFlightOptions): SurfaceFlight {
  const { world, lander, scene, camera, lite } = opts;
  const fx = makeEntryFx(lander.hull, lite, plasmaFor(world));
  scene.add(fx.group);
  const air = hasAir(world);
  const handoverAt = {
    position: lander.start.position.clone(),
    velocity: lander.start.velocity.clone(),
    padX: lander.pad.x,
    padZ: lander.pad.z,
  };
  let descent: OrbitalDescent | null = makeOrbitalDescent(world, handoverAt, { thrustTilt: lander.thrustTilt });
  let ascent: OrbitalFlight | null = null;
  let flight: OrbitalFlight | null = descent;
  const self: SurfaceFlight = {
    leg: 'descent',
    telemetry: descent.telemetry,
    update: () => 'idle',
    skip: () => undefined,
    skipToEntry: () => undefined,
    beginAscent: () => undefined,
    stop: () => undefined,
    cameraYaw: () => 0,
    dispose: () => undefined,
  };

  const input: OrbitalInput = { pitch: 0, cross: 0, throttle: 0 };
  const attitude = new THREE.Quaternion();
  const jolt = new THREE.Quaternion();
  const joltE = new THREE.Euler();
  const focus = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const want = new THREE.Vector3();
  const back = new THREE.Vector3();
  const look = new THREE.Vector3();
  const flowUp = new THREE.Vector3();
  const flowDir = new THREE.Vector3();
  let camInit = false;
  let legT = 0;
  let booms = 0;
  let shakeX = 0; let shakeY = 0; let shakeR = 0;
  let buffetA = 0; let buffetB = 0;
  let distK = 1.6;
  let pitchK = 0.3;
  let fovKick = 0;
  /** An ascent eases the camera in from wherever the climb left it. */
  let ease = 1;

  const flyCamera = (dt: number, f: OrbitalFlight) => {
    const T = f.telemetry;
    const up = f.up;
    focus.copy(lander.position).addScaledVector(up, lander.hull * 0.25);
    // Further back and higher in orbit, where the planet is the picture;
    // in close once the air is thick and the ground is coming.
    const low = THREE.MathUtils.smoothstep(T.altitude, 3000, 60_000);
    const wantDist = 1 + 0.55 * low;
    const wantPitch = 0.2 + 0.14 * low;
    distK += (wantDist - distK) * (1 - Math.exp(-dt * 1.2));
    pitchK += (wantPitch - pitchK) * (1 - Math.exp(-dt * 1.2));
    // The opening: from ahead and to the side of the ship, round to behind it.
    const intro = self.leg === 'descent' ? 1 - THREE.MathUtils.smootherstep(legT, 0, INTRO) : 0;
    const swing = intro * 2.5;
    const dist = lander.chase * distK * (1 + intro * 1.4);
    back.copy(f.track).negate().applyAxisAngle(up, swing);
    const pitch = pitchK + intro * 0.25;
    want.copy(back).multiplyScalar(Math.cos(pitch) * dist).addScaledVector(up, Math.sin(pitch) * dist);
    if (!camInit) { offset.copy(want); camInit = true; }
    else if (ease < 1) {
      ease = Math.min(1, ease + dt / 2.5);
      offset.lerp(want, THREE.MathUtils.smoothstep(ease, 0, 1) * (1 - Math.exp(-dt * 3)) + 0.02);
    } else offset.lerp(want, 1 - Math.exp(-dt * 4));
    camera.position.copy(focus).add(offset);
    camera.up.copy(up);
    look.copy(focus).addScaledVector(f.track, dist * 0.18);
    camera.lookAt(look);
    // The air through the frame: a random walk in the offset and the roll,
    // stiff enough to read as buffeting rather than drift. A burn hums in it too.
    const shake = T.turbulence + T.burn * 0.08;
    const k = 1 - Math.exp(-dt * 16);
    const amp = (dist / 25) * shake;
    shakeX += ((Math.random() * 2 - 1) * 0.45 * amp - shakeX) * k;
    shakeY += ((Math.random() * 2 - 1) * 0.35 * amp - shakeY) * k;
    shakeR += ((Math.random() * 2 - 1) * 0.035 * T.turbulence - shakeR) * k;
    camera.translateX(shakeX);
    camera.translateY(shakeY);
    camera.rotateZ(shakeR);
    fovKick += ((T.turbulence * 7 + T.heat * 4) - fovKick) * (1 - Math.exp(-dt * 3));
    const fov = opts.baseFov() + 8 + fovKick;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
  };

  /** The hull as the air meets it: the widest reach of its box off the
   *  flow's axis, and how far its front stands ahead of its origin. The
   *  box's corners overreach a rounded hull, so a little comes off. */
  const corner = new THREE.Vector3();
  const fit = { radius: 0, front: 0, side: 0, up: 0 };
  const fitSide = new THREE.Vector3();
  const fitUp = new THREE.Vector3();
  const fitHull = () => {
    const box = lander.extent();
    if (!box) return null;
    // The flow's frame as entry-fx builds it: +Z the flow, +Y the planet's up square to it.
    fitUp.copy(flowUp).addScaledVector(flowDir, -flowUp.dot(flowDir));
    if (fitUp.lengthSq() < 1e-6) fitUp.set(0, 1, 0).addScaledVector(flowDir, -flowDir.y);
    fitUp.normalize();
    fitSide.crossVectors(fitUp, flowDir).normalize();
    let radius = 0; let front = -Infinity; let side = 0; let up = 0;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .applyQuaternion(lander.group.quaternion);
      const z = corner.dot(flowDir);
      front = Math.max(front, z);
      radius = Math.max(radius, Math.sqrt(Math.max(0, corner.lengthSq() - z * z)));
      side = Math.max(side, Math.abs(corner.dot(fitSide)));
      up = Math.max(up, Math.abs(corner.dot(fitUp)));
    }
    fit.radius = radius * 0.72;
    fit.side = side * 0.78;
    fit.up = up * 0.78;
    fit.front = front * 0.85;
    return fit;
  };

  const flyShip = (dt: number, f: OrbitalFlight) => {
    const T = f.telemetry;
    // The hull takes the buffet too: a degree or two of shudder.
    buffetA += ((Math.random() * 2 - 1) * 0.03 * T.turbulence - buffetA) * (1 - Math.exp(-dt * 14));
    buffetB += ((Math.random() * 2 - 1) * 0.02 * T.turbulence - buffetB) * (1 - Math.exp(-dt * 14));
    attitude.copy(f.attitude).multiply(jolt.setFromEuler(joltE.set(buffetA, 0, buffetB)));
    lander.fly(dt, f.position, attitude, T.burn);
    lander.setHeat(T.heat, flowDir.copy(f.velocity).normalize());
    // Vapour: contrails in the cold of the upper air on Earth, a cone round
    // the hull as it comes down through the speed of sound on either air world.
    const vapour = world === 'earth'
      ? THREE.MathUtils.smoothstep(T.altitude, 2500, 6000) * (1 - THREE.MathUtils.smoothstep(T.altitude, 13_000, 17_000)) * THREE.MathUtils.smoothstep(T.speed, 110, 240)
      : 0;
    const transonic = air ? Math.exp(-(((T.mach - 1) / 0.07) ** 2)) : 0;
    flowUp.copy(f.up);
    fx.update(dt, { position: lander.position, velocity: f.velocity, up: flowUp, heat: T.heat, vapour, transonic, fit: T.heat > 0.01 ? fitHull() : null });
    opts.sounds?.reentry?.(air ? Math.max(T.heat, T.turbulence * 0.7) : 0);
    if (T.booms > booms) { booms = T.booms; opts.sounds?.boom?.(); shakeX += 0.6; shakeR += 0.03; }
  };

  const quiet = () => {
    fx.update(0, { position: lander.position, velocity: UP, up: UP, heat: 0, vapour: 0, transonic: 0 });
    fx.group.visible = false;
    lander.setHeat(0);
    opts.sounds?.reentry?.(0);
    camera.up.copy(UP);
  };

  self.update = (dt, stick) => {
    const f = flight;
    if (!f) return 'idle';
    legT += dt;
    input.pitch = -stick.moveY;
    input.cross = stick.moveX;
    input.throttle = stick.throttle;
    f.update(dt, input);
    self.telemetry = f.telemetry;
    flyShip(dt, f);
    flyCamera(dt, f);
    if (!f.telemetry.done) return 'flying';
    const leg = self.leg;
    flight = null;
    quiet();
    if (leg === 'descent') {
      lander.handover(f.position, f.velocity, f.finalYaw);
      return 'handover';
    }
    return 'orbit';
  };
  self.skip = () => {
    if (!flight || self.leg !== 'descent' || !descent) return;
    descent.skip();
  };
  self.skipToEntry = () => {
    if (!descent || self.leg !== 'descent' || !flight) return;
    descent.skipToEntry();
    legT = Math.max(legT, INTRO);
  };
  self.beginAscent = () => {
    const heading = new THREE.Vector3(Math.sin(lander.yaw), 0, Math.cos(lander.yaw));
    ascent = makeOrbitalAscent(world, { position: lander.position.clone(), velocity: lander.velocity.clone() }, heading, { thrustTilt: lander.thrustTilt });
    flight = ascent;
    self.leg = 'ascent';
    self.telemetry = ascent.telemetry;
    legT = 0;
    booms = 0;
    // Pick up the camera where the climb left it and ease it onto the chase.
    offset.copy(camera.position).sub(lander.position);
    camInit = true;
    ease = 0;
    distK = 1; pitchK = 0.2;
  };
  self.stop = () => {
    if (!flight) return;
    flight = null;
    descent = null;
    quiet();
  };
  self.cameraYaw = () => Math.atan2(offset.x, offset.z);
  self.dispose = () => {
    fx.group.removeFromParent();
    fx.dispose();
  };
  return self;
}
