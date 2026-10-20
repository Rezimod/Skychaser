// The cosmonaut on the surface: the EVA suit from moon-suit-mesh, moved by
// suit-locomotion and posed by moon-suit-pose from what that motion did.
//
// Nothing here decides where the crew goes — gravity, grip and the suit do
// that in suit-locomotion. This file names the state the suit is in, eases
// the blend weights the poser mixes by, puts dust under the boots and a
// jolt into the camera on a hard landing, and draws the suit between the
// last two simulation steps.

import * as THREE from 'three';
import { makeSparkStream, MOON_G, type DustBurst, type DustHandle } from '@/lib/solar-system/moon-fx';
import { buildSuit } from '@/lib/solar-system/moon-suit-mesh';
import { makeSuitPoser, type PoseBlend } from '@/lib/solar-system/moon-suit-pose';
import {
  gaitProfile, makeLocomotion, type Collider, type Foot, type Gait, type GaitProfile, type Landing, type Mode, type StepEvent, type Track, type WalkInput,
} from '@/lib/solar-system/suit-locomotion';

export type { Collider, StepEvent, WalkInput };

export type SuitAnim =
  | 'idle' | 'idleLook' | 'start' | 'walk' | 'jog' | 'run' | 'sprint' | 'stop' | 'pivot' | 'turn' | 'crouch' | 'crouchMove'
  | 'jump' | 'air' | 'jet' | 'fall' | 'landSoft' | 'roll' | 'landHard' | 'stumble' | 'fallen' | 'getUp' | 'work' | 'climb'
  | 'vault' | 'enterDoor' | 'exitDoor' | 'enterVehicle' | 'seated' | 'exitVehicle' | 'bail';

export interface CosmonautState {
  mode: Mode;
  airborne: boolean;
  grounded: boolean;
  speed: number;
  speedFrac: number;
  altitude: number;
  /** Set for one step on a landing that compresses the legs hard. */
  landed: boolean;
  /** The touchdown speed this step, m/s, and what it was (one step). */
  impact: number;
  landing: Landing | '';
  crouched: boolean;
  sprinting: boolean;
  stamina: number;
  stumble: number;
  fallen: boolean;
  grade: number;
  sliding: boolean;
  gait: Gait;
  gravity: number;
  stride: number;
  cadence: number;
  /** Effort, 0…1, eased the way breathing follows it. */
  effort: number;
  anim: SuitAnim;
  /** The jetpack: 0…1 in the tank, lit this step, and the eased throttle the flame and the roar follow. */
  jetFuel: number;
  jetting: boolean;
  jetK: number;
}

export interface CosmonautHandle {
  group: THREE.Group;
  /** The simulated position; the drawn one is interpolated from it. */
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Facing yaw, rad, +Z forward at 0. */
  yaw: number;
  state: CosmonautState;
  profile: GaitProfile;
  feet: readonly Foot[];
  ankles: readonly THREE.Object3D[];
  /** Change the world under the boots: gravity, and whether the suit is pressurised. */
  setGravity: (g: number, suited: boolean) => void;
  setProfile: (p: GaitProfile) => void;
  /** A roof over the crew (a habitat), or null in the open. */
  setCeiling: (ceilingAt: ((x: number, z: number) => number | null) | null) => void;
  eye: (out: THREE.Vector3) => THREE.Vector3;
  setHelmetView: (on: boolean) => void;
  look: (yaw: number, pitch: number) => void;
  /** Visor up (pressurised habitat) or down. */
  visor: (open: boolean) => void;
  /** The helmet lamps, lit with the headlamp. */
  lamps: (on: boolean) => void;
  /** Settles once the suit model is on the rig (or could not load): compile after it. */
  ready: Promise<void>;
  onStep: ((e: StepEvent) => void) | null;
  update: (dt: number, input: WalkInput, heightAt: (x: number, z: number) => number, colliders: Collider[], walkRadius: number) => void;
  present: (alpha: number) => void;
  /** Put the drawn suit where the simulated one is (after a teleport). */
  settle: () => void;
  /** Carry the crew along a track — over a crate, through a door, onto a seat — then be in `then`. */
  script: (track: Track, then: Mode) => void;
  /** Out of a script or a seat and into the air with this velocity. */
  release: (vx: number, vy: number, vz: number, mode?: Mode) => void;
  /** Take control away for a scripted sequence the owner runs (a fall). */
  hold: (on: boolean) => void;
  /** Standing on a floor rather than regolith: no dust off the boots. */
  indoors: boolean;
  dispose: () => void;
}

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const ease = (rate: number, dt: number) => 1 - Math.exp(-dt * rate);

/** `bareHead`: on a world with air the pilot comes out without the helmet and pack. */
export function makeCosmonaut(dust: DustHandle, lite = false, g = MOON_G, suited = true, bareHead = false): CosmonautHandle {
  const rig = buildSuit(lite, bareHead);
  const { group, helmet } = rig;
  // The exhaust's sparks fly free of the body: their points ride under the
  // suit's group so they are in the scene with it, but stay in world space.
  const sparks = makeSparkStream(lite ? 160 : 320, g);
  group.add(sparks.points);

  const position = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const prev = new THREE.Vector3();
  let prevYaw = 0;
  const loco = makeLocomotion(position, vel, gaitProfile(g, suited));
  // No pack where there is air to breathe: the pilot came out without it.
  loco.jet.enabled = !bareHead;
  const ls = loco.state;
  const poser = makeSuitPoser(rig, loco, bareHead);
  const state: CosmonautState = {
    mode: 'idle', airborne: false, grounded: true, speed: 0, speedFrac: 0, altitude: 0, landed: false, impact: 0, landing: '', crouched: false,
    sprinting: false, stamina: 1, stumble: 0, fallen: false, grade: 0, sliding: false, gait: 'stand', gravity: g, stride: 0, cadence: 0, effort: 0, anim: 'idle',
    jetFuel: 1, jetting: false, jetK: 0,
  };
  const b: PoseBlend = {
    crouch: 0, work: 0, climb: 0, brake: 0, look: 0, fall: 0, run: 0, sprint: 0, vault: 0, seat: 0, roll: 0, tuck: 0, squat: 0, jet: 0,
    airT: 0, clock: 0, lookYaw: null, lookPitch: 0, breath: 0, visor: 0,
  };
  const puff: DustBurst = { x: 0, y: 0, z: 0, count: 1, speedMin: 0.4, speedMax: 1, cone: 0.7, size: 0.09 };
  let idleT = 0;
  let squatVel = 0;
  let wasJumping = false;
  let held = false;
  let helmetView = false;
  let lookYaw = 0; let lookPitch = 0;
  let visorOpen = false;
  /** The pack has been lit this flight: the landing kicks up more. */
  let flown = false;
  let sparkDebt = 0;
  let nearDetail = true;
  const nozzleAt = new THREE.Vector3();

  loco.onStep = (s) => {
    if (!handle.indoors) {
      const k = s.hard;
      puff.x = s.x; puff.y = s.y; puff.z = s.z; puff.count = Math.round(3 + k * 14); puff.speedMin = 0.4; puff.speedMax = 1 + k * 2;
      puff.cone = 0.8 + k * 0.4; puff.size = 0.09 + k * 0.04;
      puff.dirX = -Math.sin(loco.yaw); puff.dirZ = -Math.cos(loco.yaw); puff.bias = 0.5;
      dust.burst(puff);
    }
    handle.onStep?.(s);
  };
  const burst = (heightAt: (x: number, z: number) => number, count: number, speed: number) => {
    if (handle.indoors) return;
    puff.x = position.x; puff.y = heightAt(position.x, position.z); puff.z = position.z;
    puff.count = count; puff.speedMin = 0.6; puff.speedMax = speed; puff.cone = 0.9; puff.size = 0.12; puff.bias = 0;
    dust.burst(puff);
  };

  const handle: CosmonautHandle = {
    group, position, velocity: vel, yaw: 0, state, profile: loco.profile, feet: loco.feet, ankles: rig.ankles, onStep: null, indoors: false, ready: rig.ready,
    setGravity(gravity, pressurised) { loco.setProfile(gaitProfile(gravity, pressurised)); handle.profile = loco.profile; state.gravity = gravity; },
    setProfile(p) { loco.setProfile(p); handle.profile = loco.profile; state.gravity = p.worldG; },
    setCeiling(c) { loco.ceilingAt = c; },
    // Only the chain from the root to the neck: the rest of the rig is not needed for one point.
    eye(out) { rig.neck.updateWorldMatrix(true, false); return rig.neck.localToWorld(out.copy(poser.eyeLocal)); },
    setHelmetView(on) { helmetView = on; helmet.visible = !on; },
    look(y, p) { lookYaw = y; lookPitch = p; },
    visor(open) { visorOpen = open; },
    lamps(on) { rig.setLamps(on); },
    script(track, then) { loco.yaw = handle.yaw; loco.script(track, then); },
    release(vx, vy, vz, mode) { loco.release(vx, vy, vz, mode); },
    hold(on) { held = on; },
    settle() {
      loco.yaw = handle.yaw;
      loco.settleFeet();
      prev.copy(position); prevYaw = handle.yaw;
      group.position.copy(position); group.rotation.y = handle.yaw;
      poser.legs(b);
    },
    present(alpha) {
      group.position.lerpVectors(prev, position, alpha);
      group.rotation.y = prevYaw + wrap(handle.yaw - prevYaw) * alpha;
      poser.legs(b);
      // The fittings go with the body's far LOD: at that range they are a pixel and a draw call each.
      const near = !rig.lod || rig.lod.getCurrentLevel() === 0;
      if (near !== nearDetail) { nearDetail = near; rig.gear.setDetail(near); }
    },
    update(dt, input, heightAt, colliders, walkRadius) {
      prev.copy(position);
      prevYaw = handle.yaw;
      loco.yaw = handle.yaw;
      b.clock += dt;
      const authority = held ? 0 : 1;
      loco.update(dt, input, heightAt, colliders, walkRadius, authority);
      handle.yaw = loco.yaw;
      const want = Math.hypot(input.moveX, input.moveZ) * authority;

      state.mode = ls.mode;
      state.airborne = ls.airborne; state.grounded = ls.grounded;
      state.speed = ls.speed; state.speedFrac = ls.speedFrac; state.altitude = ls.altitude;
      state.landed = ls.landed; state.impact = ls.impact; state.landing = ls.landing;
      state.crouched = ls.crouched; state.sprinting = ls.sprinting; state.stamina = ls.stamina;
      state.stumble = ls.stumble; state.fallen = ls.fallen; state.grade = ls.grade; state.sliding = ls.sliding;
      state.gait = ls.gait; state.stride = ls.stride; state.cadence = ls.cadence;
      state.effort += (ls.effort - state.effort) * ease(ls.effort > state.effort ? 1.2 : 0.25, dt);
      const airborne = ls.airborne && !ls.striding;
      b.airT = airborne ? b.airT + dt : 0;
      if (ls.impact > 0.6) {
        // The hips drop with the landing; a hard one kicks dust up round the boots.
        squatVel += Math.min(3.4, ls.impact * (ls.striding ? 0.35 : 0.75));
        if (ls.landing === 'hard' || ls.landing === 'fall') burst(heightAt, 26, 2.6);
        else if (ls.landing === 'roll') burst(heightAt, 16, 1.8);
      }
      if (ls.jumping && !wasJumping) { burst(heightAt, 14, 1.8); squatVel -= 2.2; }
      wasJumping = ls.jumping;
      // ── The jet: its flame, its sparks, and the regolith it blows about on touching down. ──
      state.jetFuel = ls.jetFuel; state.jetting = ls.jetting; state.jetK = ls.jetK;
      rig.gear.setThrottle(ls.jetK, b.clock);
      if (ls.jetting) flown = true;
      else if (flown && ls.grounded) { flown = false; burst(heightAt, 34, 3.2); }
      if (ls.jetK > 0.05 && rig.gear.nozzles.length) {
        sparkDebt += dt * 70 * ls.jetK;
        const n = Math.floor(sparkDebt);
        if (n > 0) {
          sparkDebt -= n;
          for (const mouth of rig.gear.nozzles) {
            mouth.getWorldPosition(nozzleAt);
            sparks.emit(nozzleAt.x, nozzleAt.y, nozzleAt.z, 0, -1, 0, vel.x, vel.y, vel.z, n, 4.5);
          }
        }
      }
      sparks.update(dt, heightAt);
      const working = input.work && ls.grounded && want < 0.05 && ls.stumble <= 0 && authority > 0 && !ls.fallen;

      // ── Which state the suit is in. ──
      const m = ls.mode;
      let anim: SuitAnim;
      if (m === 'vault' || m === 'enterDoor' || m === 'exitDoor' || m === 'enterVehicle' || m === 'seated' || m === 'exitVehicle' || m === 'bail') anim = m;
      else if (ls.fallen) anim = ls.getUp > 0 ? 'getUp' : 'fallen';
      else if (ls.stumble > 0) anim = 'stumble';
      else if (m === 'land') anim = ls.landing === 'roll' || (state.anim === 'roll' && ls.landT < 0.7) ? 'roll' : state.anim === 'landHard' || ls.landing === 'hard' ? 'landHard' : 'landSoft';
      else if (ls.jetting) anim = 'jet';
      else if (m === 'jump') anim = b.airT < 0.25 && vel.y > 0 ? 'jump' : 'air';
      else if (m === 'fall') anim = 'fall';
      else if (m === 'pivot') anim = 'pivot';
      else if (working) anim = 'work';
      else if (ls.crouched) anim = ls.speed > 0.3 ? 'crouchMove' : 'crouch';
      else if (m === 'stop') anim = 'stop';
      else if (m === 'start') anim = 'start';
      else if (ls.turning) anim = 'turn';
      else if (ls.speed < 0.2) anim = idleT > 6 ? 'idleLook' : 'idle';
      else if (ls.grade > 0.22 && ls.gait === 'walk') anim = 'climb';
      else anim = ls.gait === 'sprint' ? 'sprint' : ls.gait === 'run' ? 'run' : ls.gait === 'jog' ? 'jog' : 'walk';
      state.anim = anim;
      idleT = anim === 'idle' || anim === 'idleLook' ? idleT + dt : 0;

      // ── Blend weights, eased so nothing snaps. ──
      b.crouch += ((ls.crouched ? 1 : 0) - b.crouch) * ease(7, dt);
      b.work += ((anim === 'work' ? 1 : 0) - b.work) * ease(5, dt);
      b.climb += ((anim === 'climb' ? 1 : 0) - b.climb) * ease(4, dt);
      b.brake += ((anim === 'stop' || anim === 'pivot' ? 1 : 0) - b.brake) * ease(6, dt);
      b.look += ((anim === 'idleLook' ? 1 : 0) - b.look) * ease(1.5, dt);
      const down = anim === 'fallen' ? 1 : anim === 'getUp' ? ls.getUp / loco.profile.getUp : 0;
      b.fall += (down - b.fall) * ease(anim === 'fallen' ? 6 : 3, dt);
      b.run += ((ls.striding ? 1 : 0) - b.run) * ease(4, dt);
      b.sprint += ((ls.sprinting ? 1 : 0) - b.sprint) * ease(3, dt);
      b.vault += ((m === 'vault' ? 1 : 0) - b.vault) * ease(12, dt);
      b.seat += ((m === 'seated' || (m === 'enterVehicle' && ls.scriptK > 0.6) || (m === 'exitVehicle' && ls.scriptK < 0.3) ? 1 : 0) - b.seat) * ease(6, dt);
      b.roll += ((anim === 'roll' ? 1 : 0) - b.roll) * ease(anim === 'roll' ? 14 : 5, dt);
      b.tuck += ((airborne && m !== 'vault' && !ls.jetting ? Math.min(1, b.airT / 0.35) : 0) - b.tuck) * ease(10, dt);
      b.jet += ((ls.jetting ? 1 : 0) - b.jet) * ease(ls.jetting ? 6 : 4, dt);
      b.visor += ((visorOpen ? 1 : 0) - b.visor) * ease(3, dt);
      squatVel += (-b.squat * 48 - squatVel * 9.5) * dt;
      b.squat += squatVel * dt;
      b.breath += dt * Math.PI * 2 * (0.24 + state.effort * 0.55);
      b.lookYaw = helmetView ? lookYaw : null;
      b.lookPitch = lookPitch;
      poser.body(dt, b);
    },
    dispose() { sparks.points.removeFromParent(); sparks.dispose(); rig.dispose(); },
  };
  return handle;
}
