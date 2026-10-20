// How a person moves over ground, from the physics up — no meshes here.
//
// One state machine for the whole of being on foot: standing, starting,
// moving, stopping, planting a turn, jumping, falling, landing, vaulting,
// and the short scripted moves through a door or onto a seat. Every number
// it works from comes out of gait-profile, and so out of gravity: how fast
// the legs can carry the body before it must fly, how hard the boots can
// push and brake, how high a jump goes and how long it hangs, how hard a
// landing has to be before it is a roll, a stumble or a fall. On the Moon
// the default jog is already faster than a walk can be, so it lopes; on a
// heavy world the same jog is a fast walk and a jump is a hop.
//
// The feet are placed, not animated (suit-feet); the body slides along
// walls, steps over small rises and falls off big drops (suit-collision);
// root motion is a track it is carried along (suit-scripted).

import { classifyLanding, gaitProfile, landRecovery, PIVOT_ANGLE, turnRate, type GaitProfile, type Landing } from '@/lib/solar-system/gait-profile';
import { makeFeet, type Foot, type FootMode, type StepEvent } from '@/lib/solar-system/suit-feet';
import { slideColliders, slopeAt, stepGround, vaultProbe, SLOPE_LIMIT, VAULT_MAX, type Collider, type Vec3 } from '@/lib/solar-system/suit-collision';
import { poseAt, vaultTrack, type Track, type TrackPose } from '@/lib/solar-system/suit-scripted';
import { makeJetpack, type Jetpack } from '@/lib/solar-system/suit-jetpack';

export { JET, jetThrust, makeJetpack, type Jetpack, type JetState } from '@/lib/solar-system/suit-jetpack';
export { gaitProfile, EARTH_G, LUNAR_G, MARS_G, JUMP_MIN_APEX, classifyLanding, landRecovery, turnRate, type GaitProfile, type Landing } from '@/lib/solar-system/gait-profile';
export type { Collider, Vec3 } from '@/lib/solar-system/suit-collision';
export type { Foot, StepEvent } from '@/lib/solar-system/suit-feet';
export type { Track } from '@/lib/solar-system/suit-scripted';

export interface WalkInput {
  /** World-space move intent, already camera-relative, |v| ≤ 1; its magnitude picks the gait. */
  moveX: number;
  moveZ: number;
  /** Edge-triggered: a jump was asked for this step. */
  jump: boolean;
  /** Held: run rather than jog; sprint (drains stamina); walk (a slow gait on purpose). */
  run: boolean;
  sprint?: boolean;
  walk?: boolean;
  crouch: boolean;
  /** Using a tool at a work site. */
  work: boolean;
  /** Held: the jetpack — the jump key kept down in the air, or its own key. */
  jet?: boolean;
}

export type Mode =
  | 'idle' | 'start' | 'move' | 'stop' | 'pivot' | 'jump' | 'fall' | 'land' | 'vault'
  | 'enterDoor' | 'exitDoor' | 'enterVehicle' | 'seated' | 'exitVehicle' | 'bail';
export type Gait = 'stand' | 'walk' | 'jog' | 'run' | 'sprint' | 'air' | 'fallen';

export interface LocoState {
  mode: Mode;
  gait: Gait;
  grounded: boolean;
  airborne: boolean;
  speed: number;
  /** 0 standing … 1 flat-out sprint. */
  speedFrac: number;
  altitude: number;
  /** Set for one step on a landing that compresses the legs hard. */
  landed: boolean;
  /** The last touchdown's vertical speed, m/s, and what it did (for one step). */
  impact: number;
  landing: Landing | '';
  /** Seconds since the last landing. */
  landT: number;
  crouched: boolean;
  sprinting: boolean;
  /** 0…1 left in the legs for a sprint. */
  stamina: number;
  stumble: number;
  fallen: boolean;
  getUp: number;
  grade: number;
  sliding: boolean;
  lean: number;
  leanSide: number;
  stride: number;
  cadence: number;
  stepPhase: number;
  stepSide: number;
  effort: number;
  turning: boolean;
  jumping: boolean;
  /** A running stride's flight is under way (not a jump). */
  striding: boolean;
  /** The stride is a two-footed bound (a low-gravity sprint). */
  bounding: boolean;
  /** The body has just stepped up (+) or down (−) this much and the hips are catching up, m. */
  stepUp: number;
  /** 0…1 through a scripted track. */
  scriptK: number;
  /** The jetpack: 0…1 in the tank, lit this step, and its eased throttle for the flame and the roar. */
  jetFuel: number;
  jetting: boolean;
  jetK: number;
  /** Lit this step and not the last. */
  jetIgnited: boolean;
}

export interface Locomotion {
  profile: GaitProfile;
  /** The pack on the back: its tank and thrust (suit-jetpack). */
  jet: Jetpack;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  feet: [Foot, Foot];
  state: LocoState;
  onStep: ((e: StepEvent) => void) | null;
  /** A roof over the body, or null in the open. */
  ceilingAt: ((x: number, z: number) => number | null) | null;
  setProfile: (p: GaitProfile) => void;
  settleFeet: () => void;
  /** Carry the body along a track, then be in `then`. */
  script: (track: Track, then: Mode) => void;
  /** Drop out of a script or the seat into physics with this velocity. */
  release: (vx: number, vy: number, vz: number, mode?: Mode) => void;
  /** authority: 0 scripted (no control) … 1 full. */
  update: (dt: number, input: WalkInput, heightAt: (x: number, z: number) => number, colliders: Collider[], walkRadius: number, authority?: number) => void;
}

const COYOTE = 0.12;
const JUMP_BUFFER = 0.2;
/** How quickly the body tries to close the gap to the wanted velocity, s. */
const TAU = 0.09;
const HEAD = 1.9;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const smooth = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

export function makeLocomotion(position: Vec3, velocity: Vec3, initial: GaitProfile): Locomotion {
  let P = initial;
  const feet = makeFeet(position, velocity);
  const state: LocoState = {
    mode: 'idle', gait: 'stand', grounded: true, airborne: false, speed: 0, speedFrac: 0, altitude: 0, landed: false, impact: 0, landing: '', landT: 9,
    crouched: false, sprinting: false, stamina: 1, stumble: 0, fallen: false, getUp: 0, grade: 0, sliding: false, lean: 0, leanSide: 0,
    stride: 0, cadence: 0, stepPhase: 0, stepSide: 1, effort: 0, turning: false, jumping: false, striding: false, bounding: false, stepUp: 0, scriptK: 0,
    jetFuel: 1, jetting: false, jetK: 0, jetIgnited: false,
  };
  const jet = makeJetpack();
  /** The pack's readouts onto the state, after each step of it. */
  const syncJet = () => {
    state.jetFuel = jet.state.fuel; state.jetting = jet.state.jetting; state.jetK = jet.state.throttle; state.jetIgnited = jet.state.ignited;
  };
  let coyote = 0;
  let jumpBuffer = 0;
  let stanceT = 0;
  let fallenT = 0;
  let turnT = 0; let turnFrom = 0; let turnTo = 0;
  let pivotT = 0; let pivotYaw = 0;
  let stepClock = 0;
  let track: Track | null = null; let trackT = 0; let then: Mode = 'idle';
  const pose: TrackPose = { x: 0, y: 0, z: 0, yaw: 0, k: 0, leg: 0, legK: 0 };
  let lastSpeed = 0;
  let winded = false;
  let lastLanding: Landing = 'soft';
  /** How long this landing takes to soak up, s. */
  let recoverFor = 0.25;

  feet.onStep = (e) => {
    if (stepClock > 0.05 && stepClock < 3) state.cadence = 1 / stepClock;
    stepClock = 0;
    state.stride = feet.stride;
    loco.onStep?.(e);
  };

  const fall = () => {
    state.fallen = true; state.gait = 'fallen'; state.getUp = 0; fallenT = 0;
    velocity.x *= 0.5; velocity.z *= 0.5;
    feet.liftAll();
  };

  const loco: Locomotion = {
    profile: P, jet, position, velocity, yaw: 0, feet: feet.feet, state, onStep: null, ceilingAt: null,
    setProfile(p) { P = p; loco.profile = p; },
    settleFeet() {
      feet.settle(loco.yaw);
      stanceT = 0; turnT = 0;
      state.striding = false;
      if (state.mode !== 'seated' && !track) state.mode = 'idle';
    },
    script(t, next) { track = t; trackT = 0; then = next; state.mode = t.kind; state.jumping = false; state.striding = false; feet.liftAll(); },
    release(vx, vy, vz, mode = 'fall') {
      track = null;
      velocity.x = vx; velocity.y = vy; velocity.z = vz;
      state.mode = mode;
      feet.liftAll();
    },
    update(dt, input, heightAt, colliders, walkRadius, authority = 1) {
      const g = P.g;
      state.landed = false;
      state.impact = 0;
      state.landing = '';
      state.landT += dt;
      state.stumble = Math.max(0, state.stumble - dt);
      state.stepUp *= Math.exp(-dt * 12);
      stepClock += dt;
      if (state.getUp > 0) {
        state.getUp = Math.max(0, state.getUp - dt);
        if (state.getUp === 0) { state.fallen = false; state.mode = 'idle'; loco.settleFeet(); }
      }

      // ── Carried along a track, or sitting: no physics. The pack refills meanwhile. ──
      if (track || state.mode === 'seated') { jet.update(dt, false, true, g, 0); syncJet(); }
      if (track) {
        trackT += dt;
        poseAt(track, trackT, pose);
        velocity.x = (pose.x - position.x) / dt; velocity.y = (pose.y - position.y) / dt; velocity.z = (pose.z - position.z) / dt;
        position.x = pose.x; position.y = pose.y; position.z = pose.z;
        loco.yaw = pose.yaw;
        state.scriptK = pose.k;
        state.speed = Math.hypot(velocity.x, velocity.z);
        state.airborne = false; state.grounded = true; state.altitude = 0;
        feet.update(dt, { mode: 'carried', P, yaw: loco.yaw, speed: 0, airborne: false, altitude: 0, turnTo: null, turnK: 0, heightAt });
        if (trackT >= track.duration) {
          track = null;
          state.mode = then;
          if (then === 'seated') velocity.x = velocity.y = velocity.z = 0;
          else { velocity.y = 0; feet.settle(loco.yaw); }
        }
        return;
      }
      if (state.mode === 'seated') {
        velocity.x = velocity.y = velocity.z = 0;
        state.speed = 0; state.speedFrac = 0; state.grounded = true; state.airborne = false;
        feet.update(dt, { mode: 'carried', P, yaw: loco.yaw, speed: 0, airborne: false, altitude: 0, turnTo: null, turnK: 0, heightAt });
        return;
      }

      // Still coming out of a landing: a roll, or legs soaking up a soft one
      // and giving control back as they straighten.
      const landing = state.mode === 'land' && state.landT < landFor();
      const rolling = landing && lastLanding === 'roll';
      const soaking = landing && lastLanding === 'soft';
      const auth = authority * (state.fallen ? 0 : state.stumble > 0 ? 0.25 : rolling ? 0.4 : soaking ? 0.35 + 0.65 * state.landT / recoverFor : 1);
      const wantX = input.moveX * auth; const wantZ = input.moveZ * auth;
      const want = Math.min(1, Math.hypot(wantX, wantZ));
      const dirX = want > 1e-6 ? wantX / want : 0; const dirZ = want > 1e-6 ? wantZ / want : 0;
      const ground = heightAt(position.x, position.z);
      const wasGrounded = position.y <= ground + 1e-3 && velocity.y <= 0;
      coyote = wasGrounded ? COYOTE : Math.max(0, coyote - dt);
      if (input.jump && authority > 0) {
        // Asked mid-stride, the jump waits for the boots to come down.
        const remain = !wasGrounded && state.striding ? (velocity.y + Math.sqrt(velocity.y * velocity.y + 2 * g * Math.max(0, state.altitude))) / g + 0.05 : 0;
        jumpBuffer = Math.max(JUMP_BUFFER, remain);
      } else {
        jumpBuffer = Math.max(0, jumpBuffer - dt);
      }
      if (state.fallen) {
        fallenT += dt;
        if (state.getUp === 0 && fallenT > 0.8 && authority > 0 && (Math.hypot(input.moveX, input.moveZ) > 0.3 || input.jump)) state.getUp = P.getUp;
      }

      // ── The ground: its slope, and the grade a stride ahead. ──
      const { sx, sz, steep } = slopeAt(heightAt, position.x, position.z);
      if (want > 0.05 && wasGrounded) state.grade += ((heightAt(position.x + dirX * 0.9, position.z + dirZ * 0.9) - ground) / 0.9 - state.grade) * (1 - Math.exp(-dt * 6));
      else state.grade += (0 - state.grade) * (1 - Math.exp(-dt * 4));
      const crouched = input.crouch && wasGrounded && state.stumble <= 0 && !state.fallen;
      state.crouched = crouched;

      // ── The gait the stick asks for. ──
      // Winded legs want a third of their wind back before they will sprint again.
      if (state.stamina <= 0.02) winded = true; else if (state.stamina >= 0.35) winded = false;
      const sprinting = !!input.sprint && want > 0.3 && !winded && !crouched;
      state.stamina = clamp(state.stamina + (sprinting ? -dt / P.stamina : dt / P.recover), 0, 1);
      state.sprinting = sprinting;
      const hill = clamp(1 - state.grade * 0.9, 0.35, 1.15);
      const gaitTop = crouched ? P.crouch : sprinting ? P.sprint : input.run || want > 0.8 ? P.run : input.walk || want < 0.35 ? P.walk : P.jog;
      const top = gaitTop * hill;
      const mag = want < 0.35 ? want / 0.35 : 1;
      const tx = dirX * top * mag; const tz = dirZ * top * mag;
      const speed0 = Math.hypot(velocity.x, velocity.z);

      // ── Traction. ──
      let effort = 0;
      let leanWant = 0; let leanSide = 0;
      let launched = false;
      const striding = !crouched && !state.fallen && gaitTop > P.walkLimit && speed0 > P.walkLimit * 0.9;
      if (wasGrounded && !state.fallen) {
        state.sliding = steep > SLOPE_LIMIT;
        const control = state.sliding ? 0.3 : 1;
        // Slow enough to walk, a foot goes down where it is needed: quick off
        // the mark. Letting go of the stick is a stop, planted step by step at
        // any speed; only a change of direction at speed is left to the grip.
        const slow = speed0 < P.walkLimit;
        const accel = slow ? Math.max(P.accel, P.catchStep) : P.accel;
        const brake = slow || want < 0.05 ? Math.max(P.brake, P.catchStep) : P.brake;
        let cx = 0; let cz = 0;
        if (state.mode === 'pivot') {
          // A plant: the body stops hard and comes round to face the new way.
          pivotT += dt;
          const dur = P.turnStep * 1.3;
          if (speed0 > 1e-3) { const b = Math.min(speed0 / dt, P.brake * 2); cx = -velocity.x / speed0 * b; cz = -velocity.z / speed0 * b; }
          loco.yaw = wrap(pivotYaw - wrap(pivotYaw - loco.yaw) * (1 - smooth(pivotT / dur)));
          if (pivotT >= dur) state.mode = 'start';
        } else {
          if (speed0 > 0.5 * P.jog && want > 0.3 && dirX * velocity.x + dirZ * velocity.z < speed0 * Math.cos(PIVOT_ANGLE)) {
            state.mode = 'pivot'; pivotT = 0; pivotYaw = Math.atan2(dirX, dirZ);
          }
          const dvx = tx - velocity.x; const dvz = tz - velocity.z;
          if (speed0 > 0.3) {
            const ux = velocity.x / speed0; const uz = velocity.z / speed0;
            const along = dvx * ux + dvz * uz;
            const a = clamp(along / TAU, -brake, want < 0.05 ? 0 : accel) * control;
            let px = dvx - ux * along; let pz = dvz - uz * along;
            const pl = Math.hypot(px, pz) / TAU;
            const latCap = (P.grip * g + P.lateral) * control;
            if (pl > latCap) { px *= latCap / pl / TAU; pz *= latCap / pl / TAU; } else { px /= TAU; pz /= TAU; }
            cx = ux * a + px; cz = uz * a + pz;
          } else {
            const dv = Math.hypot(dvx, dvz);
            const a = dv > 1e-6 ? Math.min(dv / TAU, (want < 0.05 ? brake : accel) * control) : 0;
            if (dv > 1e-6) { cx = dvx / dv * a; cz = dvz / dv * a; }
          }
          if (state.mode !== 'pivot' && !landing) {
            const rising = speed0 > lastSpeed;
            state.mode = want < 0.05 ? (speed0 > 0.15 ? 'stop' : 'idle') : speed0 < 0.4 * top && rising ? 'start' : 'move';
          }
        }
        // Gravity along a slope the boots cannot hold.
        if (state.sliding) { cx -= g * sx; cz -= g * sz; }
        velocity.x += cx * dt; velocity.z += cz * dt;
        const fx = Math.sin(loco.yaw); const fz = Math.cos(loco.yaw);
        leanWant = Math.atan2(cx * fx + cz * fz, g);
        leanSide = Math.atan2(cx * fz - cz * fx, g) * 0.5;
        effort = Math.min(1, Math.hypot(cx, cz) / accel * 0.4 + speed0 / P.sprint * 0.6);
        // ── A running stride: the boots leave the ground between steps. ──
        if (striding) {
          stanceT += dt;
          if (stanceT >= P.stance) {
            const align = want > 0.1 ? Math.max(0, (dirX * velocity.x + dirZ * velocity.z) / Math.max(0.01, speed0)) : 1;
            // Sprinting in low gravity, both boots push together: the kangaroo hop.
            const bound = P.bound && sprinting && speed0 > P.run * 0.95;
            const flight = Math.max(0.04, (bound ? P.boundFlight : P.flight) * (0.45 + 0.55 * align));
            velocity.y = g * flight / 2;
            stanceT = 0;
            launched = true;
            state.striding = true;
            state.bounding = bound;
            feet.launchStride();
            effort = Math.max(effort, 0.5);
          }
        } else stanceT = 0;
      } else if (!state.fallen) {
        if (want > 0.05) {
          const dvx = tx - velocity.x; const dvz = tz - velocity.z;
          const dv = Math.hypot(dvx, dvz);
          if (dv > 1e-6) { const step = Math.min(dv, P.air * dt); velocity.x += dvx / dv * step; velocity.z += dvz / dv * step; }
        }
        state.sliding = false;
        // Higher than any stride's flight: this is a fall, whatever it started as.
        if (!state.jumping && state.mode !== 'fall' && position.y - ground > 0.35) { state.mode = 'fall'; state.striding = false; feet.liftAll(); }
      } else {
        const sp = Math.hypot(velocity.x, velocity.z);
        const k = sp > 1e-6 ? Math.max(0, sp - P.grip * g * dt * 2) / sp : 0;
        velocity.x *= k; velocity.z *= k;
      }
      state.lean += (leanWant - state.lean) * (1 - Math.exp(-dt * 7));
      state.leanSide += (leanSide - state.leanSide) * (1 - Math.exp(-dt * 7));
      lastSpeed = speed0;

      // ── Take-off: a vault over what is in the way, or a jump. ──
      if ((wasGrounded || coyote > 0) && jumpBuffer > 0 && !crouched && state.stumble <= 0 && !state.fallen && authority > 0.5 && !state.jumping && state.mode !== 'pivot') {
        const over = want > 0.2 ? vaultProbe(position, dirX, dirZ, colliders, heightAt, P.suited ? VAULT_MAX.suited : VAULT_MAX.soft) : null;
        jumpBuffer = 0; coyote = 0;
        if (over) {
          loco.script(vaultTrack({ x: position.x, y: position.y, z: position.z, yaw: loco.yaw }, over.top, over.toX, over.toY, over.toZ, speed0, g < 5), 'move');
          effort = 1;
          finish(effort, ground, heightAt);
          return;
        }
        velocity.y = P.hop + Math.min(P.runHopMax, P.runHop * speed0);
        state.jumping = true; state.striding = false;
        state.mode = 'jump';
        launched = true;
        effort = 1;
        feet.liftAll();
      }

      // ── The jetpack: held in the air it lifts; on the ground it refills.
      // Only a real flight lights it — a jump, a fall, a bail — never the
      // short hop between two running strides, which the held key would
      // otherwise turn into a stutter of puffs. ──
      const jetWant = !!input.jet && !wasGrounded && !state.fallen && authority > 0.5 && !crouched
        && (state.jumping || state.mode === 'fall' || state.mode === 'bail');
      const jetAccel = jet.update(dt, jetWant, wasGrounded, g, velocity.y);
      if (jetAccel > 0) {
        velocity.y += jetAccel * dt;
        effort = Math.max(effort, 0.6);
      }
      syncJet();

      // ── Integrate, and meet the world. ──
      const prevX = position.x; const prevZ = position.z;
      velocity.y -= g * dt;
      position.x += velocity.x * dt; position.z += velocity.z * dt; position.y += velocity.y * dt;
      const rr = Math.hypot(position.x, position.z);
      if (rr > walkRadius) { position.x *= walkRadius / rr; position.z *= walkRadius / rr; velocity.x *= 0.2; velocity.z *= 0.2; }
      const touched = slideColliders(position, velocity, colliders);
      const roof = loco.ceilingAt?.(position.x, position.z) ?? null;
      if (roof !== null && position.y + HEAD > roof) { position.y = roof - HEAD; if (velocity.y > 0) velocity.y = 0; }
      const g2 = heightAt(position.x, position.z);
      // Into a crate mid-stride, low over the ground: a runner vaults it off the stride too.
      if (touched && !wasGrounded && state.striding && !state.jumping && position.y - g2 < 0.35 && want > 0.5 && !crouched && state.stumble <= 0) {
        const over = vaultProbe(position, dirX, dirZ, colliders, heightAt, P.suited ? VAULT_MAX.suited : VAULT_MAX.soft);
        if (over) { loco.script(vaultTrack({ x: position.x, y: position.y, z: position.z, yaw: loco.yaw }, over.top, over.toX, over.toY, over.toZ, speed0, g < 5), 'move'); finish(1, g2, heightAt); return; }
      }
      if (wasGrounded && !launched && !state.jumping) {
        const before = position.y;
        const contact = stepGround(position, velocity, prevX, prevZ, g2);
        if (contact === 'stepUp' || contact === 'stepDown') state.stepUp += position.y - before;
        else if (contact === 'ledge') { state.mode = 'fall'; feet.liftAll(); }
        if ((contact === 'blocked' || touched) && want > 0.5 && gaitTop > P.walk && !crouched && state.stumble <= 0) {
          // Sprinting into a crate is a vault, not a wall.
          const over = vaultProbe(position, dirX, dirZ, colliders, heightAt, P.suited ? VAULT_MAX.suited : VAULT_MAX.soft);
          if (over) { loco.script(vaultTrack({ x: position.x, y: position.y, z: position.z, yaw: loco.yaw }, over.top, over.toX, over.toY, over.toZ, speed0, g < 5), 'move'); finish(1, g2, heightAt); return; }
        }
        if (contact !== 'ledge') velocity.y = 0;
      } else if (position.y <= g2 + 1e-3) {
        // ── Touching down. ──
        const impact = -velocity.y;
        if (!wasGrounded) {
          state.impact = impact;
          // Bailing out of a moving vehicle is never a soft landing.
          const bailed = state.mode === 'bail';
          const k0 = classifyLanding(P, impact);
          const kind: Landing = bailed && speed0 > P.run ? (k0 === 'fall' ? 'fall' : 'hard') : bailed && k0 === 'soft' ? 'roll' : k0;
          const fromStride = state.striding && !state.jumping && state.mode !== 'fall';
          if (!fromStride || kind !== 'soft') {
            state.landing = kind; lastLanding = kind; state.landT = 0;
            if (kind === 'soft') state.mode = state.jumping || state.mode === 'fall' ? 'land' : speed0 > 0.15 ? 'move' : 'idle';
            else if (kind === 'roll') {
              state.landed = true; state.mode = 'land';
              const fx = Math.sin(loco.yaw); const fz = Math.cos(loco.yaw);
              const keep = Math.min(speed0, P.jog) * 0.9;
              velocity.x = fx * keep; velocity.z = fz * keep;
            } else if (kind === 'hard') { state.landed = true; state.mode = 'land'; state.stumble = P.stumble; velocity.x *= 0.4; velocity.z *= 0.4; }
            else { state.landed = true; fall(); }
          }
          const hard = fromStride ? Math.min(1, 0.2 + speed0 / P.run * 0.5) : Math.min(1, 0.5 + impact / (P.hardLand * 1.5));
          feet.land(hard, fromStride && !state.bounding);
          if (kind === 'soft') recoverFor = landRecovery(P, impact);
          if (fromStride) { state.mode = want < 0.05 ? 'stop' : 'move'; }
        }
        position.y = g2; velocity.y = 0;
        state.jumping = false;
        state.striding = striding && state.mode !== 'land';
        stanceT = 0;
      }

      finish(effort, g2, heightAt);
      if (wasGrounded) state.striding = striding && state.mode !== 'pivot' && state.mode !== 'land';
      if (!state.striding) state.bounding = false;

      // ── Facing. ──
      state.turning = false;
      const speed = state.speed; const airborne = state.airborne;
      if (authority > 0 && !state.fallen && state.mode !== 'pivot') {
        if (speed > 0.5) {
          turnT = 0;
          const d = wrap(Math.atan2(velocity.x, velocity.z) - loco.yaw);
          const cap = turnRate(P, speed) * (airborne ? 0.3 : 1) * dt;
          loco.yaw = wrap(loco.yaw + clamp(d * (1 - Math.exp(-dt * 14)), -cap, cap));
        } else if (turnT > 0) {
          turnT = Math.max(0, turnT - dt);
          loco.yaw = wrap(turnFrom + wrap(turnTo - turnFrom) * smooth(1 - turnT / P.turnStep));
          state.turning = true;
        } else if (want > 0.05 && !airborne) {
          const d = wrap(Math.atan2(wantX, wantZ) - loco.yaw);
          if (Math.abs(d) > 0.12) {
            turnFrom = loco.yaw; turnTo = wrap(loco.yaw + d); turnT = P.turnStep;
            state.turning = true;
            feet.beginTurn(d);
          }
        }
      }
      const footMode: FootMode = state.fallen ? 'down' : state.striding ? 'stride' : airborne ? 'air' : speed > 0.08 ? 'walk' : 'stand';
      feet.update(dt, { mode: footMode, P, yaw: loco.yaw, speed, airborne, altitude: state.altitude, turnTo: turnT > 0 ? turnTo : null, turnK: 1 - turnT / P.turnStep, heightAt });
      state.stepPhase = feet.stepPhase; state.stepSide = feet.stepSide;
      state.cadence += (0 - state.cadence) * (1 - Math.exp(-dt * 0.4));
    },
  };
  /** How long the last landing keeps the body in it, s. */
  function landFor() { return lastLanding === 'roll' ? 0.7 : lastLanding === 'soft' ? recoverFor : 0.25; }
  /** The readouts every path ends on. */
  function finish(effort: number, groundY: number, heightAt: (x: number, z: number) => number) {
    const speed = Math.hypot(velocity.x, velocity.z);
    const airborne = position.y > groundY + 0.02;
    state.airborne = airborne; state.grounded = !airborne;
    state.speed = speed;
    state.speedFrac = clamp(speed / P.sprint, 0, 1);
    state.altitude = position.y - heightAt(position.x, position.z);
    state.effort = effort;
    if (state.mode === 'land' && state.landT > landFor()) state.mode = speed > 0.15 ? 'move' : 'idle';
    state.gait = state.fallen ? 'fallen' : airborne && !state.striding ? 'air'
      : speed < 0.1 ? 'stand' : state.sprinting && speed > P.run ? 'sprint' : speed > (P.jog + P.run) / 2 ? 'run' : speed > (P.walk + P.jog) / 2 ? 'jog' : 'walk';
  }

  return loco;
}
