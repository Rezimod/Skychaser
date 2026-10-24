// Flying inside a world: the ship in the pilot's hands, after the dive's
// plasma, for as long as they like — over the ground, round the base, down
// onto it, or back up into space.
//
// It is an arcade flight model on purpose, a ship that can hover rather
// than an aeroplane: the engine key (or W, or Space) carries it forward,
// faster the higher it is; let go and it slows to a hover where it is. The
// stick turns it (and banks the hull into the turn) and points the nose up
// or down: pushed forward it dives, pulled back it climbs, let go it levels
// out. Slow, the stick moves it straight up and down instead, so a hover
// can be set down anywhere the crew may step out.
//
// Where the ship may go: the air above the site out to `flyRadius`, where a
// gentle turn brings it back; never lower than `floor` metres over the
// ground away from where it may land; and up through the top of the air,
// which takes it back to space. Low and slow over ground it may land on, it
// settles down onto it by itself. "Land at base" hands it to the computer,
// which flies it to the pad and gives it to the lander's guidance.
//
// It speaks the orbital legs' language (OrbitalFlight), so the surface
// flight's camera, plasma and hull code fly it unchanged. No allocation per
// frame.

import * as THREE from 'three';
import { airDensity, hasAir, PLANET_BODIES, siteBasis, globeToLocal, type GlobeWorld } from '@/lib/solar-system/planet-frame';
import type { OrbitalFlight, OrbitalTelemetry } from '@/lib/solar-system/orbital-descent';

export interface FreeFlightOptions {
  /** Ground under a point, local metres (the scene's heightAt). */
  ground: (x: number, z: number) => number;
  /** Where the crew may set down: within this of the site, m. */
  landRadius: number;
  /** The base's pad, local metres. */
  pad: { x: number; z: number };
  /** Away from where it may land, the ship keeps this high over the ground, m. */
  floor?: number;
  /** Past this horizontal distance from the site the ship is turned back, m. */
  flyRadius?: number;
  /** Above this height over the datum, climbing, the ship leaves for space, m. */
  exitAltitude?: number;
}

export interface FreeInput {
  /** Stick: right + turns right; forward + speeds up, back + slows to a hover. */
  moveX: number;
  moveY: number;
  /** Climb (the engine key, or Space), 0…1. */
  throttle: number;
  /** Down (the descend key, or C). */
  descend?: boolean;
}

/** What a frame of flight came to. */
export type FreeStep = 'flying' | 'landed' | 'handover' | 'orbit';

export interface FreeFlight extends OrbitalFlight {
  /** The computer is flying the ship to the base's pad. */
  readonly autopilot: boolean;
  /** Hand the ship to the computer to land at the base (again to take it back). */
  landAtBase: (on?: boolean) => void;
  /** One frame; what it came to. */
  step: (dt: number, input: FreeInput) => FreeStep;
  /** The ship is settling onto the ground under it by itself. */
  readonly settling: boolean;
  /** Turned back at the edge of the flying area this frame. */
  readonly atEdge: boolean;
  /** Metres over the ground. */
  readonly agl: number;
}

/** Speeds, m/s, by height over the ground: what the engine can reach. */
export function topSpeed(agl: number): number {
  return 220 + 0.065 * Math.max(0, agl);
}

const TURN = 0.9; // rad/s at full stick, slow
const PITCH_MAX = 0.75; // rad the stick can hold the nose at
const HOVER_RATE = 14; // m/s up/down on the stick at a hover
const SETTLE_RATE = 2.2; // m/s down while settling
const SETTLE_AGL = 7;
const SETTLE_SPEED = 14;

export function makeFreeFlight(
  world: GlobeWorld,
  from: { position: THREE.Vector3; velocity: THREE.Vector3 },
  opts: FreeFlightOptions,
): FreeFlight {
  const body = PLANET_BODIES[world];
  const basis = siteBasis(body);
  const centre = globeToLocal(basis, new THREE.Vector3(0, 0, 0));
  const R = body.radiusKm * 1000;
  const air = hasAir(world);
  const floor = opts.floor ?? 40;
  const flyRadius = opts.flyRadius ?? 14_000;
  const exitAltitude = opts.exitAltitude ?? Math.max(30_000, body.atmosphereKm * 1000 * 0.9);

  const position = from.position.clone();
  const velocity = from.velocity.clone();
  const up = new THREE.Vector3();
  const track = new THREE.Vector3();
  const nose = new THREE.Vector3();
  const side = new THREE.Vector3();
  const roof = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const basisM = new THREE.Matrix4();
  const roll = new THREE.Quaternion();
  const attitude = new THREE.Quaternion();

  const upAt = (p: THREE.Vector3, out: THREE.Vector3) => out.copy(p).sub(centre).normalize();
  upAt(position, up);
  // The heading the ship came in on, laid flat, and its speed and slope.
  track.copy(velocity).addScaledVector(up, -velocity.dot(up));
  if (track.lengthSq() < 1e-6) track.set(0, 0, -1).addScaledVector(up, up.z);
  track.normalize();
  let speed = velocity.length();
  let pitch = Math.atan2(velocity.dot(up), Math.max(1e-3, Math.sqrt(Math.max(0, speed * speed - velocity.dot(up) ** 2))));
  pitch = THREE.MathUtils.clamp(pitch, -PITCH_MAX, PITCH_MAX);
  let bank = 0;
  let burn = 0;
  let auto = false;
  let settling = false;
  let atEdge = false;
  let agl = position.y - opts.ground(position.x, position.z);
  let lastMach = 0;

  const telemetry: OrbitalTelemetry = {
    phase: 'flight', phaseT: 0, progress: 0, wallSeconds: 0, simSeconds: 0,
    altitude: position.distanceTo(centre) - R, speed, vertical: velocity.dot(up), downrangeKm: 0,
    heat: 0, turbulence: 0, mach: 0, timeWarp: 1, burn: 0, booms: 0, authority: 1, offPath: 0, crossRange: 0, done: false,
  };

  const steerToward = (wantX: number, wantZ: number, dt: number) => {
    // Turn the flat heading toward a flat direction, at most TURN rad/s.
    tmp.set(wantX, 0, wantZ).addScaledVector(up, -(wantX * up.x + wantZ * up.z));
    if (tmp.lengthSq() < 1e-8) return 0;
    tmp.normalize();
    side.crossVectors(up, track);
    const across = tmp.dot(side);
    const along = tmp.dot(track);
    const want = Math.atan2(across, along);
    const turn = THREE.MathUtils.clamp(want, -TURN * dt, TURN * dt);
    track.applyAxisAngle(up, turn).normalize();
    // As the stick would say it: right positive.
    return -THREE.MathUtils.clamp(want, -1, 1);
  };

  const self: FreeFlight = {
    world,
    telemetry,
    position,
    velocity,
    up,
    track,
    attitude,
    finalYaw: 0,
    nominalSeconds: 0,
    get autopilot() { return auto; },
    get settling() { return settling; },
    get atEdge() { return atEdge; },
    get agl() { return agl; },
    landAtBase(on) { auto = on ?? !auto; },
    update(dt) { self.step(dt, { moveX: 0, moveY: 0, throttle: 0 }); },
    skip() { auto = true; },
    step(dt, input) {
      dt = Math.max(0, Math.min(dt, 0.1));
      telemetry.wallSeconds += dt;
      telemetry.simSeconds += dt;
      upAt(position, up);
      track.addScaledVector(up, -track.dot(up)).normalize();
      agl = position.y - opts.ground(position.x, position.z);
      const r = Math.hypot(position.x, position.z);
      const landable = Math.hypot(position.x - opts.pad.x, position.z - opts.pad.z) < opts.landRadius || r < opts.landRadius;

      // A firm push on the stick takes the ship back from the computer.
      const stickHard = Math.abs(input.moveX) > 0.35 || Math.abs(input.moveY) > 0.35;
      if (auto && stickHard) auto = false;

      // The controls: the stick turns and sets the pace (forward faster, back
      // slower, let go and it holds its speed); the engine key climbs and the
      // descend key goes down — by the nose at speed, straight at a hover.
      let turnIn = input.moveX;
      const climb = THREE.MathUtils.clamp(input.throttle, 0, 1);
      const sink = input.descend ? 1 : 0;
      let pitchWant = (climb - sink) * PITCH_MAX;
      let push = Math.max(0, input.moveY);
      let brake = Math.max(0, -input.moveY);
      let hoverIn = climb - sink;
      const padDx = opts.pad.x - position.x;
      const padDz = opts.pad.z - position.z;
      const padDist = Math.hypot(padDx, padDz);

      if (auto) {
        // ── The computer: over to the pad at a height that falls with the
        // range, slowing as it closes; the lander's guidance takes it down. ──
        turnIn = steerToward(padDx, padDz, dt);
        const wantAgl = THREE.MathUtils.clamp(padDist * 0.12, 120, 1500);
        pitchWant = THREE.MathUtils.clamp((wantAgl - agl) / 400, -0.5, 0.5);
        const wantSpeed = THREE.MathUtils.clamp(padDist * 0.22, 25, topSpeed(agl));
        push = speed < wantSpeed ? 1 : 0;
        brake = speed > wantSpeed * 1.15 ? 1 : 0;
        hoverIn = 0;
        if (padDist < 260 && speed < 45) {
          telemetry.done = true;
          return 'handover';
        }
      } else {
        // ── The edge of the flying area turns the ship back toward the site. ──
        atEdge = r > flyRadius;
        if (atEdge) {
          const k = THREE.MathUtils.clamp((r - flyRadius) / 1500, 0.3, 1);
          turnIn = steerToward(-position.x, -position.z, dt * k) + input.moveX * (1 - k);
        }
      }

      // ── Heading and nose. ──
      if (!auto && !atEdge) {
        const turnRate = TURN * (0.55 + 0.45 * (1 - THREE.MathUtils.smoothstep(speed, 60, 900)));
        track.applyAxisAngle(up, -turnIn * turnRate * dt).normalize();
      }
      pitch += (pitchWant - pitch) * (1 - Math.exp(-dt * 2.6));
      bank += (-turnIn * 0.55 - bank) * (1 - Math.exp(-dt * 3));

      // ── Speed: forward on the stick pushes, back brakes, and it holds its pace between. ──
      const top = topSpeed(agl);
      const work = Math.max(push, climb, sink * 0.5);
      burn += (work - burn) * (1 - Math.exp(-dt * 6));
      if (push > 0.05) speed += Math.max(28, speed * 0.55) * push * dt;
      else if (brake > 0.05) speed -= Math.max(30, speed * 0.9) * brake * dt;
      else speed -= speed * 0.02 * dt;
      if (speed > top) speed -= (speed - top) * Math.min(1, dt * 0.9);
      speed = Math.max(0, speed);

      // ── Velocity: along the nose, plus the hover's own up and down when slow. ──
      const slow = 1 - THREE.MathUtils.smoothstep(speed, 18, 70);
      nose.copy(track).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));
      velocity.copy(nose).multiplyScalar(speed * (1 - 0.85 * slow));
      let vy = hoverIn * HOVER_RATE * slow;

      // ── Low over ground it may land on, slow: down onto it by itself. ──
      settling = landable && agl < SETTLE_AGL && speed < SETTLE_SPEED && climb < 0.3;
      if (settling) {
        vy = Math.min(vy, -SETTLE_RATE);
        velocity.multiplyScalar(0.9);
        if (agl <= 0.35) {
          telemetry.done = true;
          return 'landed';
        }
      }
      velocity.addScaledVector(up, vy);

      // ── Never into the ground, and away from where it may land, never low. ──
      const minAgl = landable ? 0.2 : floor;
      const over = agl - minAgl;
      const vUp = velocity.dot(up);
      if (over < 30 && vUp < 0) velocity.addScaledVector(up, -vUp * THREE.MathUtils.clamp(1 - over / 30, 0, 1));
      if (over < 0) velocity.addScaledVector(up, Math.min(12, -over * 2));

      position.addScaledVector(velocity, dt);
      // Nothing under the ground, whatever the frame did.
      const g = opts.ground(position.x, position.z);
      if (position.y < g + 0.2) position.y = g + 0.2;

      // ── The hull: nose along the flight, roof up, banked into the turn. ──
      side.crossVectors(up, nose).normalize();
      roof.crossVectors(nose, side).normalize();
      basisM.makeBasis(side, roof, nose);
      attitude.setFromRotationMatrix(basisM);
      attitude.multiply(roll.setFromAxisAngle(tmp.set(0, 0, 1), bank));
      self.finalYaw = Math.atan2(track.x, track.z);

      // ── What the glass, the plasma and the camera read. ──
      telemetry.altitude = position.distanceTo(centre) - R;
      telemetry.speed = velocity.length();
      telemetry.vertical = velocity.dot(up);
      telemetry.downrangeKm = padDist / 1000;
      telemetry.burn = Math.max(burn, settling ? 0.35 : 0);
      const rho = air ? airDensity(body, Math.max(0, telemetry.altitude)) : 0;
      const v = telemetry.speed;
      telemetry.heat = air ? THREE.MathUtils.clamp(Math.pow(rho * v * v * v / 2.5e9, 0.7), 0, 1) : 0;
      const sound = air ? 300 : 0;
      telemetry.mach = sound > 0 && rho > 1e-4 ? v / sound : 0;
      const transonic = air ? Math.exp(-(((telemetry.mach - 1) / 0.2) ** 2)) * Math.min(1, rho / 0.05) : 0;
      telemetry.turbulence = air ? THREE.MathUtils.clamp(0.5 * telemetry.heat + 0.6 * transonic + 0.15 * Math.min(1, rho) * (v / 300), 0, 1) : 0;
      if (lastMach >= 1 && telemetry.mach < 1 && telemetry.mach > 0) telemetry.booms += 1;
      lastMach = telemetry.mach;

      // ── Up and out: through the top of the air, climbing, back to space. ──
      if (telemetry.altitude > exitAltitude && telemetry.vertical > 0) {
        telemetry.done = true;
        return 'orbit';
      }
      return 'flying';
    },
  };
  return self;
}
