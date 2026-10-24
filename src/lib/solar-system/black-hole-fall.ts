// Falling into a black hole. Inside a few horizon radii the hole's pull
// grows (inverse-square, capped) until the drive can no longer answer it;
// past the point of no return — the photon sphere, one and a half horizon
// radii — the hole has the ship: it spirals in, nose dragged onto the
// shadow, the hull drawn out along the radial and crushed across it as the
// tides climb (∝ 1/r³), until it crosses the horizon. A beat of darkness,
// then a white flash and the ship is spat back out at home, by the Earth.
//
// Headless and allocation-free per frame: the flight model (player-ship.ts)
// hands this the actor, its visual hull and its velocity, and reads back
// what to do — fly on, hold the frame for the fall, or respawn.

import * as THREE from 'three';
import type { FlightAnchor, FlightBody, FlightTelemetry, FlightWorld } from '@/lib/solar-system/player-ship';

/** Same as FLIGHT_UNIT in player-ship.ts (a value import would be circular). */
const U = 0.006;
const LIGHT_KM_S = 299_792.458;
const KM_PER_SCENE_UNIT = 6371 / 0.028;

/** The well is felt this many horizon radii out… */
export const CAPTURE_RS = 4;
/** …at full strength from here in… */
const FULL_RS = 3;
/** …and past here (the photon sphere) nothing gets out. */
export const NO_RETURN_RS = 1.5;
/** Pull at the point of no return: half again what the cruise drive makes
 *  on full boost, so cruise needs boost to climb out near it and the
 *  interplanetary drives can always hover just outside. */
const PULL_AT_NO_RETURN = 12 * U;
/** From the point of no return to the horizon, then the dark, seconds. */
export const FALL_SEC = 4.6;
export const DARK_SEC = 1.9;
/** How long the way-out message stays up after the respawn. */
export const SPAT_SEC = 4.5;
/** Tidal stretch along the radial at the horizon; the cross-section goes to 1/(1 + (S-1)/2). */
const MAX_STRETCH = 9;

export type SwallowPhase = '' | 'pull' | 'fall' | 'dark' | 'spat';
export type FallAction = 'free' | 'hold' | 'respawn';

/** Tidal strength, 0 at the edge of the well … 1 at the horizon (∝ 1/r³). */
export function tidalAt(d: number, rs: number): number {
  const edge = 1 / (CAPTURE_RS * CAPTURE_RS * CAPTURE_RS);
  const x = rs / Math.max(d, rs);
  return THREE.MathUtils.clamp((x * x * x - edge) / (1 - edge), 0, 1);
}

/** The extra pull of the well at distance d (scene units / s²). */
export function wellPull(d: number, rs: number): number {
  const k = THREE.MathUtils.clamp((CAPTURE_RS * rs - d) / ((CAPTURE_RS - FULL_RS) * rs), 0, 1);
  const fade = k * k * (3 - 2 * k);
  const ratio = (NO_RETURN_RS * rs) / Math.max(d, rs);
  return PULL_AT_NO_RETURN * Math.min(ratio * ratio, 4) * fade;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface BlackHoleFall {
  readonly phase: SwallowPhase;
  /** 0..1 tidal strength felt right now. */
  readonly tidal: number;
  /** 0..1 through the current phase (fall, dark, spat). */
  readonly progress: number;
  /** Camera shake to kick this frame, and the drone's pitch rise (0..1). */
  readonly shake: number;
  readonly rise: number;
  /** How hard the way-out flash goes off (softer under reduced motion). */
  readonly flash: number;
  /** Advance one frame. `eligible`: the pilot is flying (no jump, arrival or berth). */
  step(
    dt: number,
    bodies: readonly FlightBody[],
    actor: THREE.Object3D,
    hull: THREE.Object3D,
    hullLength: number,
    vel: THREE.Vector3,
    thrust: number,
    thrustAccel: number,
    eligible: boolean,
  ): FallAction;
  /** Field of view for the camera while the hole has the frame. */
  fov(base: number): number;
  /** Chase distance while the hole has the frame: the camera is drawn in. */
  camBack(base: number): number;
  /** Where the ship comes out: by the Earth, in the Sol system. */
  homeAnchor(world: FlightWorld): FlightAnchor;
  /** The HUD's view of it; while holding, the readouts too. */
  fillTelemetry(tel: FlightTelemetry, holding: boolean): void;
  /** A spawn: drop any capture and give the hull back its shape. */
  reset(): void;
}

export function createBlackHoleFall(): BlackHoleFall {
  const reduced = prefersReducedMotion();
  let phase: SwallowPhase = '';
  let tidal = 0;
  let progress = 0;
  let shake = 0;
  let rise = 0;
  let hole: FlightBody | null = null;
  /** Infall speed the well has built up outside the point of no return. */
  let fallSpeed = 0;
  let t = 0;
  let d0 = 0;
  let k0 = 0.3;
  let omega0 = 0;
  let stretched: THREE.Object3D | null = null;
  const dir = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const qA = new THREE.Quaternion();
  const qB = new THREE.Quaternion();
  const qSpin = new THREE.Quaternion();
  const anchor: FlightAnchor = { position: new THREE.Vector3(), lookAt: new THREE.Vector3(), yaw: 0 };

  const unstretch = () => {
    if (!stretched) return;
    stretched.scale.set(1, 1, 1);
    stretched.position.z = 0;
    stretched = null;
  };

  /** Draw the hull out along its own +Z (the nose, on the hole) and crush it
   *  across; the tail stays put, so the stretch runs away from the camera. */
  const stretch = (hull: THREE.Object3D, length: number, k: number) => {
    const sz = 1 + (MAX_STRETCH - 1) * k * k;
    if (sz < 1.001) { if (stretched === hull) unstretch(); return; }
    const sxy = 1 / (1 + 0.5 * (sz - 1));
    hull.scale.set(sxy, sxy, sz);
    hull.position.z = (sz - 1) * length * 0.5;
    stretched = hull;
  };

  /** Swing the nose onto the hole at `rate` per second. */
  const faceHole = (actor: THREE.Object3D, at: THREE.Vector3, rate: number, dt: number) => {
    qA.copy(actor.quaternion);
    actor.lookAt(at);
    qB.copy(actor.quaternion);
    actor.quaternion.copy(qA).slerp(qB, 1 - Math.exp(-dt * rate));
  };

  const nearestHole = (bodies: readonly FlightBody[], p: THREE.Vector3): FlightBody | null => {
    let best: FlightBody | null = null;
    let bestD = Infinity;
    for (const b of bodies) {
      if (b.kind !== 'blackhole' || b.destroyed) continue;
      const d = p.distanceTo(b.position);
      if (d < b.radius * CAPTURE_RS && d < bestD) { best = b; bestD = d; }
    }
    return best;
  };

  const api: BlackHoleFall = {
    get phase() { return phase; },
    get tidal() { return tidal; },
    get progress() { return progress; },
    get shake() { return shake; },
    get rise() { return rise; },
    get flash() { return reduced ? 0.45 : 1; },

    step(dt, bodies, actor, hull, hullLength, vel, thrust, thrustAccel, eligible) {
      shake = 0;
      // ── The fall: the hole flies the ship now. ──
      if (phase === 'fall' && hole) {
        t += dt;
        const s = Math.min(1, t / FALL_SEC);
        // Linear at the speed it came in with, cubic on top: it only quickens.
        const e = k0 * s + (1 - k0) * s * s * s;
        const rs = hole.radius;
        const d = rs + (d0 - rs) * (1 - e);
        // The orbit it had winds up as it closes (angular momentum: ω ∝ 1/r²).
        const omega = Math.min(omega0 * (d0 / d) * (d0 / d), reduced ? 0.8 : 2.4);
        qSpin.setFromAxisAngle(axis, omega * dt);
        dir.applyQuaternion(qSpin).normalize();
        prev.copy(actor.position);
        actor.position.copy(hole.position).addScaledVector(dir, d);
        if (dt > 0) vel.copy(actor.position).sub(prev).divideScalar(dt);
        // The hole drags the nose round onto itself.
        tmp.copy(hole.position);
        faceHole(actor, tmp, 2 + 4 * s, dt);
        tidal = tidalAt(d, rs);
        stretch(hull, hullLength, tidal);
        progress = s;
        shake = 0.08 + 0.55 * tidal;
        rise = s;
        if (s >= 1) {
          phase = 'dark';
          t = 0;
          progress = 0;
          vel.set(0, 0, 0);
          actor.visible = false;
        }
        return 'hold';
      }
      // ── Past the horizon: nothing to see, then out. ──
      if (phase === 'dark') {
        t += dt;
        progress = Math.min(1, t / DARK_SEC);
        tidal = 1;
        rise = 0;
        vel.set(0, 0, 0);
        if (t < DARK_SEC) return 'hold';
        unstretch();
        actor.visible = true;
        phase = 'spat';
        t = 0;
        progress = 0;
        tidal = 0;
        fallSpeed = 0;
        hole = null;
        return 'respawn';
      }

      // ── Free flight, inside the well or out of it. ──
      if (phase === 'spat') {
        t += dt;
        progress = Math.min(1, t / SPAT_SEC);
        if (t >= SPAT_SEC) phase = '';
      }
      rise = 0;
      hole = eligible ? nearestHole(bodies, actor.position) : null;
      if (!hole) {
        fallSpeed = 0;
        tidal = 0;
        if (phase === 'pull') phase = '';
        if (stretched) unstretch();
        return 'free';
      }
      const rs = hole.radius;
      dir.copy(actor.position).sub(hole.position);
      const d = Math.max(dir.length(), 1e-9);
      dir.divideScalar(d);
      tidal = tidalAt(d, rs);
      if (d <= rs * NO_RETURN_RS) {
        // The point of no return. What the ship brings in sets the pace
        // and the spin of the spiral; from here it is the hole's.
        phase = 'fall';
        t = 0;
        progress = 0;
        d0 = d;
        const vr = Math.max(0, fallSpeed - vel.dot(dir));
        k0 = THREE.MathUtils.clamp((vr * FALL_SEC) / Math.max(d0 - rs, 1e-6), 0.15, 0.6);
        tmp.copy(vel).addScaledVector(dir, -vel.dot(dir));
        const vt = tmp.length();
        if (vt > 1e-6) axis.crossVectors(dir, tmp).normalize();
        else {
          axis.set(0, 1, 0).cross(dir);
          if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0).cross(dir);
          axis.normalize();
        }
        omega0 = THREE.MathUtils.clamp(vt / d0, reduced ? 0.03 : 0.12, 0.6);
        fallSpeed = 0;
        return api.step(0, bodies, actor, hull, hullLength, vel, thrust, thrustAccel, eligible);
      }
      if (phase === '') phase = 'pull';
      // The well: it builds an infall the drive has to work against. Only
      // the part of the thrust pointing out of the well counts.
      fwd.set(0, 0, 1).applyQuaternion(actor.quaternion);
      const out = Math.max(0, fwd.dot(dir)) * Math.max(0, thrust) * thrustAccel;
      fallSpeed = Math.max(0, fallSpeed + (wellPull(d, rs) - out) * dt);
      // Never across the point of no return in one step: the fall takes it from there.
      const room = d - rs * NO_RETURN_RS * 0.999;
      actor.position.addScaledVector(dir, -Math.min(fallSpeed * dt, room));
      // The tides start to turn the nose in, gently enough to fight.
      if (tidal > 0.02) faceHole(actor, hole.position, 1.2 * tidal * tidal, dt);
      stretch(hull, hullLength, tidal);
      shake = tidal * 0.25;
      return 'free';
    },

    fov(base) {
      const k = phase === 'fall' ? tidal : phase === 'dark' ? 1 : 0;
      return base + (reduced ? 10 : 46) * Math.pow(k, 1.3);
    },

    camBack(base) {
      const k = phase === 'fall' ? tidal : phase === 'dark' ? 1 : 0;
      return base * (1 - 0.4 * k);
    },

    homeAnchor(world) {
      // Sol's own respawn point is the one by the Earth.
      if (world.systemName === 'sol') return world.home;
      const earth = world.bodies.find((b) => b.id === 'earth');
      if (!earth) return world.home;
      // As the canvas frames Sol: a few Earth radii out on a tangent, a
      // little above the ecliptic, the planet ahead and off to one side.
      tmp.copy(earth.position);
      if (tmp.lengthSq() < 1e-12) tmp.set(1, 0, 0);
      tmp.normalize();
      fwd.set(0, 1, 0).cross(tmp).normalize();
      anchor.position.copy(earth.position).addScaledVector(fwd, 0.14).add(prev.set(0, 0.03, 0));
      anchor.lookAt.copy(earth.position);
      anchor.yaw = 0.45;
      return anchor;
    },

    fillTelemetry(tel, holding) {
      tel.swallow = phase;
      tel.tidal = tidal;
      tel.swallowT = progress;
      if (!holding) return;
      // Seen from outside the ship never quite gets there; on the console
      // it is a fraction of c that climbs and climbs.
      const c = phase === 'dark' ? 0.999 : Math.min(0.999, 0.25 + 0.75 * tidal);
      tel.speedC = c;
      tel.speedKmS = c * LIGHT_KM_S;
      tel.speed = tel.speedKmS / KM_PER_SCENE_UNIT / U;
      tel.speedFrac = 1.2;
      tel.throttle = 0;
      tel.boost = false;
      tel.alert = 'horizon';
      tel.heat = 0;
      tel.atmo = 0;
      tel.radarCount = 0;
      tel.canBoard = false;
      tel.nav.on = 0;
      tel.docked = false;
      tel.docking = false;
      tel.canDock = false;
      tel.supply = false;
      tel.commsLine = 0;
      tel.respawnIn = 0;
    },

    reset() {
      unstretch();
      // The way-out message outlives the spawn that ends the fall.
      if (phase !== 'spat') {
        phase = '';
        progress = 0;
      }
      tidal = 0;
      fallSpeed = 0;
      hole = null;
      t = 0;
    },
  };
  return api;
}
