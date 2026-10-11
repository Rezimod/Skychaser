// The landing. Not a camera move — a vehicle.
//
// The crew arrives a hundred and forty metres over the mare with the pad
// off the nose and the descent engine already lit. The right hand holds
// the throttle, the left translates. One sixth g is patient: the engine
// only has to take the edge off, and a metre a second of drift at fifty
// metres is a hundred metres downrange if you leave it. Below thirty the
// exhaust starts to move regolith and the pad disappears into the sheet of
// it, which is exactly what the Apollo crews found.
//
// Nobody is allowed to crash. The guidance computer watches the numbers,
// and the moment the engine could no longer stop the fall in the height
// that is left, it takes the stick and flies it down itself. What the
// pilot is playing for is the touchdown speed on the plaque afterwards.

import * as THREE from 'three';
import { MOON_G, type DustBurst, type DustHandle } from '@/lib/solar-system/moon-fx';
import { keep } from '@/lib/solar-system/moon-batch';
import { acquireModel } from '@/game/models';
import type { LightPool } from '@/lib/solar-system/moon-lights';

export interface LanderInput {
  /** The descent engine, 0…1. */
  throttle: number;
  /** Translation on the pad's own axes, each -1…1. */
  moveX: number;
  moveY: number;
}

export interface LanderTelemetry {
  altitude: number;
  /** Down is positive: the number a pilot reads. */
  descent: number;
  ground: number;
  fuel: number;
  throttle: number;
  /** Metres from the middle of the pad, and how fast it is going sideways. */
  offset: number;
  drift: number;
  driftX: number;
  driftZ: number;
  /** The computer has the stick. */
  assist: boolean;
  /** Set once, at the moment the pads touch. */
  landed: boolean;
  touchdown: number;
  /** Where the crew steps off. */
  egressX: number;
  egressZ: number;
  /** Seconds since the engine was lit to leave, or −1 on the ground. */
  climb: number;
}

export interface LanderHandle {
  group: THREE.Group;
  telemetry: LanderTelemetry;
  /** The point the chase camera should hold. */
  position: THREE.Vector3;
  yaw: number;
  update: (dt: number, input: LanderInput, heightAt: (x: number, z: number) => number) => void;
  /** The crew is aboard: light the engine and go back up. */
  launch: () => void;
  dispose: () => void;
}

/** The vehicle, built in Blender (assets-src/blender/lander.py). */
const LANDER_MODEL = '/explore/models/lander.glb';

const START_ALT = 138;
const START_DESCENT = 13.5;
/** Full throttle, in gravities — a shade over twice the surface pull, as the LM had. */
const THRUST_G = 2.4;
const RCS_G = 1.48;
const FUEL_BURN = 0.035;
/** How much of the engine's braking the profile asks for: the rest is the
 *  margin that makes the profile flyable at all. */
const PROFILE = 0.8;
const TOUCH = 0.35;
/** Radius of the laid pad the crew aims at, as moon-base-zones draws it. The
 *  other worlds have no paint, so this simply makes their guidance precise. */
const PAD_R = 11.5;

/** Where the powered descent begins: height over the pad, sink rate, and how far off it the vehicle is. */
export interface DescentStart { alt: number; descent: number; offsetX: number; offsetZ: number; driftX: number; driftZ: number }
const MOON_START: DescentStart = { alt: START_ALT, descent: START_DESCENT, offsetX: -34, offsetZ: 52, driftX: 1.6, driftZ: -2.4 };

export function makeLander(
  padX: number,
  padZ: number,
  heightAt: (x: number, z: number) => number,
  dust: DustHandle,
  lite: boolean,
  lights?: LightPool,
  g = MOON_G,
  start: DescentStart = MOON_START,
): LanderHandle {
  const MAX_THRUST = THRUST_G * g;
  const RCS = RCS_G * g;
  const group = new THREE.Group();
  group.name = 'lander';
  const geoms: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const seg = lite ? 10 : 16;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xfff2d0), emissiveIntensity: 1.8 });
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  owned.push(lampMat, plumeMat);
  const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geoms.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // ── The vehicle: lander.glb, built in Blender to Skychaser's own concept
  // sheet (assets-src/blender/lander.py) — a tapered octagonal crew module
  // over a dark equipment deck, gold tanks at its corners, four legs on
  // dished pads, the hatch and its ladder, four bells under the deck. The
  // plume, its light and the pad lamp stay here, because they animate. ──
  let releaseModel: (() => void) | null = null;
  let disposed = false;
  acquireModel(LANDER_MODEL, true).then((handle) => {
    if (disposed) { handle.release(); return; }
    releaseModel = handle.release;
    const shell = handle.scene.clone(true);
    shell.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh) return;
      mm.castShadow = true;
      mm.receiveShadow = !lite;
    });
    group.add(shell);
  }, () => undefined);
  mesh(group, new THREE.SphereGeometry(0.1, 8, 6), lampMat, 0, 2.95, 2.6);

  // The plumes: a cone of light under each of the four bells, and the light
  // they throw together. The model's engines stand at 0.88 m, on the
  // diagonals (assets-src/blender/lander.py).
  const plumes: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const p = keep(mesh(group, new THREE.ConeGeometry(0.34, 4.2, seg, 1, true), plumeMat, Math.sin(a) * 0.62, -1.9, Math.cos(a) * 0.62));
    p.rotation.x = Math.PI;
    p.castShadow = false;
    plumes.push(p);
  }
  const plumeScale = (x: number, y: number, z: number) => { for (const p of plumes) p.scale.set(x, y, z); };

  const position = group.position;
  const vel = new THREE.Vector3(start.driftX, -start.descent, start.driftZ);
  const padY = heightAt(padX, padZ);
  position.set(padX + start.offsetX, padY + start.alt, padZ + start.offsetZ);
  const telemetry: LanderTelemetry = {
    altitude: start.alt, descent: start.descent, ground: padY, fuel: 1, throttle: 0,
    offset: 0, drift: 0, driftX: vel.x, driftZ: vel.z,
    assist: false, landed: false, touchdown: 0, egressX: padX, egressZ: padZ, climb: -1,
  };
  let flicker = 0;
  let dustAcc = 0;
  const grain: DustBurst = { x: 0, y: 0, z: 0, count: 1, speedMin: 2, speedMax: 4, cone: 1.5, size: 0.15, dirX: 0, dirZ: 0, bias: 2.4 };

  /** The translation the last step of powered descent asked for. */
  let tx = 0; let tz = 0;
  /** One step of powered descent. */
  const fly = (dt: number, input: LanderInput, height: (x: number, z: number) => number) => {
    const ground = height(position.x, position.z);
    const alt = position.y - ground;
    const fall = Math.max(0, -vel.y);
    // ── Guidance: could the engine still stop this fall in the height
    // that is left? Leave a second of margin and a metre of pad. ──
    const net = MAX_THRUST - g;
    const offset = Math.hypot(position.x - padX, position.z - padZ);
    // `safe` is the fastest the vehicle could be falling at this height and
    // still be stopped by the engine, less the margin that makes a profile
    // flyable rather than theoretical. Cross it by a clear margin and the
    // computer takes the stick, because from there on nothing the pilot
    // does gets it down gently.
    const safe = Math.sqrt(2 * net * Math.max(0, alt - 1.2)) * PROFILE;
    const want = Math.max(0.6, Math.min(Math.max(START_DESCENT, start.descent * (1 - 1 / (1 + alt / 60))), safe));
    // Landing thirty metres off the middle of a pad that is forty-six
    // across is a landing; landing in the rocks beyond it is not, so the
    // computer also steps in for a pilot who has not killed the drift.
    // The threshold stays wide on purpose: a pilot who is still working the
    // drift keeps the stick, and it is the computer's own approach below
    // that has to put the vehicle on the paint.
    if (fall > safe * 1.06 + 0.9 || (alt < 25 && offset > 32)) telemetry.assist = true;

    let throttle = THREE.MathUtils.clamp(input.throttle, 0, 1);
    tx = input.moveX; tz = -input.moveY;
    if (telemetry.assist) {
      // Fly back over the middle, then set down on it. The old gain pulled
      // the offset in on a 9-second time constant while the whole descent
      // lasted 16, so the computer ran out of height with the pad still
      // twenty metres away and put the vehicle down in the regolith beside
      // it. Close the offset faster, and while it is still wide, ease the
      // sink rate so there is height left to close it in — which is what a
      // pilot does, and what the fuel is for (a full tank is over a minute
      // of hover and the descent takes a quarter of that).
      const wide = offset > PAD_R * 0.25 && alt > 12;
      const target = wide ? Math.min(want, 2.4) : want;
      throttle = THREE.MathUtils.clamp((fall - target) * 1.4 + (g / MAX_THRUST), 0, 1);
      const backX = (padX - position.x) * 0.13 - vel.x * 0.62;
      const backZ = (padZ - position.z) * 0.13 - vel.z * 0.62;
      tx = THREE.MathUtils.clamp(backX, -1, 1);
      tz = THREE.MathUtils.clamp(backZ, -1, 1);
    }
    // Dry, the engine derates rather than quits: the last of the pressure
    // will still set it down, just not gently.
    if (telemetry.fuel <= 0) throttle = Math.min(throttle, 0.55);
    telemetry.fuel = Math.max(0, telemetry.fuel - throttle * FUEL_BURN * dt);
    telemetry.throttle += (throttle - telemetry.throttle) * (1 - Math.exp(-dt * 7));

    vel.y += (telemetry.throttle * MAX_THRUST - g) * dt;
    vel.x += tx * RCS * dt;
    vel.z += tz * RCS * dt;
    // A little damping so the RCS is flyable rather than a skid.
    vel.x *= Math.exp(-dt * 0.35);
    vel.z *= Math.exp(-dt * 0.35);
    position.addScaledVector(vel, dt);

    const g2 = height(position.x, position.z);
    if (position.y - g2 <= TOUCH) {
      position.y = g2 + TOUCH;
      telemetry.landed = true;
      telemetry.touchdown = Math.max(0, -vel.y);
      vel.set(0, 0, 0);
      // The pads throw a ring of dust out from under the vehicle.
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        grain.x = position.x + Math.cos(a) * 2.6; grain.y = g2; grain.z = position.z + Math.sin(a) * 2.6;
        grain.count = 3; grain.speedMin = 1.4; grain.speedMax = 5.5; grain.cone = 1.45; grain.size = 0.17;
        grain.dirX = Math.cos(a); grain.dirZ = Math.sin(a); grain.bias = 2.6;
        dust.burst(grain);
      }
      telemetry.egressX = position.x;
      telemetry.egressZ = position.z + 6.5;
    }
  };

  const handle: LanderHandle = {
    group, telemetry, position, yaw: 0,
    update(dt, input, height) {
      if (telemetry.climb >= 0) {
        // Going home: the engine comes up to full over a second, the vehicle
        // hangs a moment while it overcomes its own weight, then climbs.
        telemetry.climb += dt;
        telemetry.throttle += (1 - telemetry.throttle) * (1 - Math.exp(-dt * 2.5));
        vel.y += (telemetry.throttle * MAX_THRUST - g) * dt;
        if (vel.y < 0 && position.y - height(position.x, position.z) <= TOUCH + 1e-3) vel.y = 0;
        position.y += vel.y * dt;
        flicker += dt * 30;
        const t = telemetry.throttle;
        plumeMat.opacity = t * (0.5 + 0.1 * Math.sin(flicker));
        plumeScale(0.85 + t * 0.35, 0.6 + t * 0.9 + 0.08 * Math.sin(flicker * 1.7), 0.85 + t * 0.35);
        const g2 = height(position.x, position.z);
        const alt = position.y - g2;
        lights?.request(position.x, position.y - 1.2, position.z, 0xaad6ff, t * 30, 24 + alt * 0.6, 2);
        const blast = t * Math.max(0, 1 - alt / 35);
        dustAcc += blast * dt * 90;
        while (dustAcc >= 1) {
          dustAcc -= 1;
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * (3 + blast * 10);
          grain.x = position.x + Math.cos(a) * r; grain.y = g2; grain.z = position.z + Math.sin(a) * r;
          grain.count = 1; grain.speedMin = 2; grain.speedMax = 4 + blast * 9; grain.cone = 1.5; grain.size = 0.15;
          grain.dirX = Math.cos(a); grain.dirZ = Math.sin(a); grain.bias = 2.4 + blast * 2;
          dust.burst(grain);
        }
        telemetry.altitude = Math.max(0, alt - TOUCH);
        telemetry.descent = -vel.y;
        return;
      }
      if (telemetry.landed) {
        // Down and quiet: the plume dies, the dust settles.
        telemetry.throttle += (0 - telemetry.throttle) * (1 - Math.exp(-dt * 6));
        plumeMat.opacity = telemetry.throttle * 0.5;
        lights?.request(position.x, position.y - 1.2, position.z, 0xaad6ff, telemetry.throttle * 20, 20, 2);
        return;
      }
      // The flight itself in steps no longer than a 120th of a second, so the
      // touchdown — and its grade — does not depend on the frame rate.
      const n = Math.max(1, Math.ceil(dt * 120 - 1e-6));
      for (let i = 0; i < n && !telemetry.landed; i++) fly(dt / n, input, height);
      const g2 = height(position.x, position.z);
      const alt = position.y - g2;

      // ── The exhaust, and what it does to the ground. ──
      flicker += dt * 30;
      const t = telemetry.throttle;
      plumeMat.opacity = t * (0.45 + 0.1 * Math.sin(flicker));
      plumeScale(0.85 + t * 0.3, 0.5 + t * 0.7 + 0.06 * Math.sin(flicker * 1.7), 0.85 + t * 0.3);
      lights?.request(position.x, position.y - 1.2, position.z, 0xaad6ff, t * 26, 20 + alt * 0.6, 2);
      // Below thirty metres the blast starts to move regolith; by ten it is
      // a sheet of it going sideways faster than the vehicle is coming down.
      const blast = t * Math.max(0, 1 - alt / 30);
      dustAcc += blast * dt * 60;
      while (dustAcc >= 1) {
        dustAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = 1.5 + Math.random() * (3 + blast * 9);
        grain.x = position.x + Math.cos(a) * r; grain.y = g2; grain.z = position.z + Math.sin(a) * r;
        grain.count = 1; grain.speedMin = 1.5; grain.speedMax = 3 + blast * 9; grain.cone = 1.5; grain.size = 0.14;
        grain.dirX = Math.cos(a); grain.dirZ = Math.sin(a); grain.bias = 2.2 + blast * 2;
        dust.burst(grain);
      }
      // The vehicle leans a touch into the translation it is asking for.
      group.rotation.z += (-tx * 0.06 - group.rotation.z) * (1 - Math.exp(-dt * 3));
      group.rotation.x += (tz * 0.06 - group.rotation.x) * (1 - Math.exp(-dt * 3));

      telemetry.altitude = Math.max(0, position.y - g2 - TOUCH);
      telemetry.descent = Math.max(0, -vel.y);
      telemetry.ground = g2;
      telemetry.offset = Math.hypot(position.x - padX, position.z - padZ);
      telemetry.driftX = vel.x;
      telemetry.driftZ = vel.z;
      telemetry.drift = Math.hypot(vel.x, vel.z);
    },
    launch() {
      if (!telemetry.landed || telemetry.climb >= 0) return;
      telemetry.climb = 0;
      vel.set(0, 0, 0);
    },
    dispose() {
      disposed = true;
      releaseModel?.();
      for (const g of geoms) g.dispose();
      for (const m of owned) m.dispose();
    },
  };
  return handle;
}
