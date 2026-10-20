// Phase 2 of the lunar slice, held to its exit criteria: a suit that is
// quick off the mark, bounds at a sprint, stops in a couple of metres and
// takes longer to soak up a bigger landing; a walk that comes out the same at
// 30, 60 and 144 frames a second; a camera spring that a long frame cannot
// throw past its mark; a lander whose touchdown does not care about the
// frame rate; and a gamepad that walks exactly as the keyboard does.

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyLanding, gaitProfile, landRecovery, makeLocomotion, EARTH_G, LUNAR_G, type GaitProfile, type WalkInput,
} from '@/lib/solar-system/suit-locomotion';
import { SLOPE_LIMIT } from '@/lib/solar-system/suit-collision';
import {
  makeFixedStep, makePressEdge, makeSprintLatch, sprintFrom, walkFromStick, type FootStick,
} from '@/lib/solar-system/surface-input';
import { springTo } from '@/lib/solar-system/moon-camera';
import { makeLander } from '@/lib/solar-system/moon-lander';
import { shapeMouse } from '@/lib/solar-system/flight-input';
import { attachSurfaceControls, intentFromKeys, intentFromPad, type FootInputs } from '@/game/surface-controls';
import { FOOT_BINDINGS, PAD } from '@/game/bindings';
import type { DustHandle } from '@/lib/solar-system/moon-fx';

const H = 1 / 120;
const flat = () => 0;
const moon = gaitProfile(LUNAR_G, true);
const earth = gaitProfile(EARTH_G, false);
const input = (over: Partial<WalkInput> = {}): WalkInput => ({ moveX: 0, moveZ: 0, jump: false, run: false, crouch: false, work: false, ...over });

function walker(p: GaitProfile, heightAt: (x: number, z: number) => number = flat) {
  const position = { x: 0, y: heightAt(0, 0), z: 0 };
  const velocity = { x: 0, y: 0, z: 0 };
  const loco = makeLocomotion(position, velocity, p);
  loco.settleFeet();
  const run = (seconds: number, over: Partial<WalkInput> = {}, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds / H); i++) { loco.update(H, input(over), heightAt, [], 999); each?.(); }
  };
  return { loco, position, velocity, run };
}

/** Let go of the stick and measure the slide to a stop. */
function stopFrom(p: GaitProfile, over: Partial<WalkInput>) {
  const w = walker(p);
  w.run(5, over);
  const top = w.loco.state.speed;
  const z0 = w.position.z;
  let t = 0;
  while ((w.loco.state.speed > 0.05 || w.loco.state.airborne) && t < 10) { w.run(H); t += H; }
  return { top, distance: w.position.z - z0, time: t };
}

describe('lunar locomotion: responsive, not floaty', () => {
  it('hops about three quarters of a metre and hangs about a second and a half: the Moon, felt', () => {
    const apex = (moon.hop * moon.hop) / (2 * moon.g);
    const air = (2 * moon.hop) / moon.g;
    expect(moon.worldG).toBeCloseTo(LUNAR_G);
    expect(apex).toBeGreaterThan(0.6);
    expect(apex).toBeLessThan(0.9);
    expect(air).toBeGreaterThan(1.2);
    expect(air).toBeLessThan(1.6);
  });

  it('reaches a walk in a blink, then builds to a sprint on real inertia', () => {
    const w = walker(moon);
    let toWalk = -1; let toTop = -1; let t = 0;
    while (t < 4) {
      w.run(H, { moveZ: 1, sprint: true }); t += H;
      if (toWalk < 0 && w.loco.state.speed >= moon.walk) toWalk = t;
      if (toTop < 0 && w.loco.state.speed >= moon.sprint * 0.97) toTop = t;
    }
    expect(toWalk).toBeGreaterThan(0);
    expect(toWalk).toBeLessThan(0.2);
    expect(toTop).toBeGreaterThan(0.8);
    // Flat out, and no faster.
    expect(w.loco.state.speed).toBeGreaterThan(moon.sprint * 0.97);
    expect(w.loco.state.speed).toBeLessThan(moon.sprint * 1.02);
  });

  it('stops in a few metres from a sprint (the bound already in the air carries on), under a metre from a walk', () => {
    const sprint = stopFrom(moon, { moveZ: 1, sprint: true });
    expect(sprint.top).toBeGreaterThan(moon.run);
    expect(sprint.distance).toBeLessThan(3.8);
    expect(sprint.time).toBeLessThan(1.3);
    const walk = stopFrom(moon, { moveZ: 0.25 });
    expect(walk.distance).toBeLessThan(0.3);
    // Earth's grip stops shorter still.
    expect(stopFrom(earth, { moveZ: 1 }).distance).toBeLessThan(sprint.distance);
  });

  it('bounds at a sprint on the Moon — both boots, a longer flight — and never on Earth', () => {
    expect(moon.bound).toBe(true);
    expect(earth.bound).toBe(false);
    expect(gaitProfile(3.72, true).bound).toBe(false);
    const w = walker(moon);
    let bounds = 0; let strides = 0; let was = false; let apex = 0;
    w.run(6, { moveZ: 1, sprint: true }, () => {
      const up = w.loco.state.airborne;
      if (up && !was) { if (w.loco.state.bounding) bounds += 1; else strides += 1; }
      if (w.loco.state.bounding) apex = Math.max(apex, w.loco.state.altitude);
      was = up;
    });
    expect(bounds).toBeGreaterThan(2);
    expect(bounds).toBeGreaterThan(strides);
    // A kangaroo hop, not a jump: a hand's breadth to a knee's height.
    expect(apex).toBeGreaterThan(0.12);
    expect(apex).toBeLessThan(0.5);
    // A jog is still a lope, one boot at a time.
    const j = walker(moon);
    let bounded = false;
    j.run(4, { moveZ: 0.6 }, () => { bounded ||= j.loco.state.bounding; });
    expect(bounded).toBe(false);
  });

  it('takes longer to soak up a bigger landing, and gives control back as it does', () => {
    expect(landRecovery(moon, 0.5)).toBeLessThan(landRecovery(moon, moon.softLand * 0.9));
    const drop = (h: number) => {
      const cliff = (_x: number, z: number) => (z > 0.6 ? -h : 0);
      const w = walker(moon, cliff);
      let t = 0;
      while (t < 10 && !w.loco.state.landing) { w.run(H, { moveZ: 0.15 }); t += H; }
      expect(w.loco.state.landing).toBe('soft');
      let landed = 0;
      while (w.loco.state.mode === 'land' && landed < 2) { w.run(H, { moveZ: 0.15 }); landed += H; }
      return landed;
    };
    const small = drop(0.5); const big = drop(0.8);
    expect(classifyLanding(moon, Math.sqrt(2 * moon.g * 0.8))).toBe('soft');
    expect(big).toBeGreaterThan(small + 0.05);
    expect(big).toBeLessThan(0.45);
  });

  it('slows on a climb, and past the slope limit the boots lose it', () => {
    const top = (grade: number) => {
      const w = walker(moon, (_x, z) => z * grade);
      w.run(3, { moveZ: 1 });
      return w.loco.state.speed;
    };
    expect(top(0.3)).toBeLessThan(top(0) * 0.85);
    expect(top(-0.1)).toBeGreaterThan(top(0) * 0.95);
    const limit = Math.tan(SLOPE_LIMIT);
    for (const [grade, slides] of [[limit * 0.8, false], [limit * 1.3, true]] as const) {
      const w = walker(moon, (x) => x * grade);
      w.run(2);
      expect(w.loco.state.sliding).toBe(slides);
    }
  });
});

describe('the fixed step: the same walk at 30, 60 and 144 frames a second', () => {
  /** A scripted five seconds: jog, sprint, a turn, a jump, let go, a second jump. */
  const script = (t: number) => ({
    moveX: t >= 1.5 && t < 2.5 ? 0.7 : 0,
    moveY: t < 3.5 ? 1 : 0,
    sprint: t >= 0.5 && t < 2.5,
    jump: (t >= 1.0 && t < 1.1) || (t >= 4.0 && t < 4.1),
  });

  /** The surfaces' own composition: clock, press edge, sprint latch, stick → walk. `perStep`
   *  samples the script at every step, `false` once a frame as the browser does. */
  function play(fps: number, perStep: boolean) {
    const position = { x: 0, y: 0, z: 0 };
    const velocity = { x: 0, y: 0, z: 0 };
    const loco = makeLocomotion(position, velocity, moon);
    loco.settleFeet();
    const clock = makeFixedStep(H, 12);
    const jumpPress = makePressEdge();
    const latch = makeSprintLatch();
    const stick: FootStick = { moveX: 0, moveY: 0, jump: false, run: false, sprint: false, walk: false, crouch: false };
    const walk = input();
    let steps = 0; let jumps = 0; let apex = 0;
    const dt = 1 / fps;
    for (let n = 0; n < Math.round(5 * fps); n++) {
      let s = script(n * dt + 1e-9);
      if (!perStep) jumpPress.see(s.jump);
      clock.advance(dt, (h) => {
        if (perStep) { s = script(steps * h + 1e-9); jumpPress.see(s.jump); }
        stick.moveX = s.moveX; stick.moveY = s.moveY;
        stick.sprint = sprintFrom(latch, s.sprint, Math.hypot(s.moveX, s.moveY) > 0.2, h);
        const wasJumping = loco.state.jumping;
        walkFromStick(walk, stick, Math.PI, jumpPress.take(), false);
        loco.update(h, walk, flat, [], 999);
        if (loco.state.jumping && !wasJumping) jumps += 1;
        apex = Math.max(apex, loco.state.altitude);
        steps += 1;
      });
    }
    return { steps, jumps, apex, x: position.x, y: position.y, z: position.z, yaw: loco.yaw };
  }

  it('runs the same steps and ends in the same place when the input is the same step by step', () => {
    const a = play(30, true); const b = play(60, true); const c = play(144, true);
    expect(a.steps).toBe(600);
    for (const r of [b, c]) {
      expect(r.steps).toBe(a.steps);
      expect(r.x).toBeCloseTo(a.x, 9);
      expect(r.z).toBeCloseTo(a.z, 9);
      expect(r.yaw).toBeCloseTo(a.yaw, 9);
    }
    expect(a.jumps).toBe(2);
  });

  it('keeps both jumps and lands within a frame of the same place when the keys are read once a frame', () => {
    const runs = [play(30, false), play(60, false), play(144, false)];
    for (const r of runs) {
      expect(r.steps).toBe(600);
      expect(r.jumps).toBe(2);
    }
    for (const r of runs.slice(1)) {
      expect(Math.hypot(r.x - runs[0].x, r.z - runs[0].z)).toBeLessThan(0.25);
      expect(r.apex).toBeCloseTo(runs[0].apex, 1);
    }
  });

  it('keeps a press that lands on a frame with no step in it', () => {
    // At 144 fps one frame in six runs no step at all; find one.
    const probe = makeFixedStep(H, 12);
    const empty: number[] = [];
    for (let n = 0; n < 144; n++) { let ran = 0; probe.advance(1 / 144, () => { ran += 1; }); if (ran === 0) empty.push(n); }
    expect(empty.length).toBe(24);
    // A one-frame tap on that frame still reaches the next step.
    const frame = empty[3];
    const clock = makeFixedStep(H, 12);
    const jumpPress = makePressEdge();
    let taken = -1;
    for (let n = 0; n < 144; n++) {
      jumpPress.see(n === frame);
      clock.advance(1 / 144, () => { if (jumpPress.take()) taken = n; });
    }
    expect(taken).toBe(frame + 1);
  });
});

describe('the camera spring', () => {
  const settle = (frames: number, dt: number) => {
    const pos = new THREE.Vector3(); const vel = new THREE.Vector3(); const goal = new THREE.Vector3(1, 1, 1);
    let worst = 0;
    for (let i = 0; i < frames; i++) { springTo(pos, vel, goal, 9, 4, dt); worst = Math.max(worst, pos.x, pos.y); }
    return { pos, worst };
  };

  it('is solved exactly, so the frame rate does not move it', () => {
    const a = settle(15, 1 / 30); const b = settle(72, 1 / 144);
    expect(b.pos.x).toBeCloseTo(a.pos.x, 9);
    expect(b.pos.y).toBeCloseTo(a.pos.y, 9);
  });

  it('never overshoots, even on a quarter-second hitch', () => {
    expect(settle(1, 0.25).worst).toBeLessThanOrEqual(1);
    expect(settle(40, 0.25).worst).toBeLessThanOrEqual(1 + 1e-12);
  });
});

describe('frame-rate independence elsewhere', () => {
  const dust = { burst: vi.fn(), update: vi.fn(), dispose: vi.fn() } as unknown as DustHandle;

  it('grades the landing the same at 30, 60 and 144 frames a second', () => {
    const touchdown = (fps: number) => {
      const l = makeLander(0, 0, flat, dust, true);
      const dt = 1 / fps;
      for (let i = 0; i < fps * 90 && !l.telemetry.landed; i++) {
        const tel = l.telemetry;
        const want = Math.max(0.45, Math.sqrt(2 * (3.9 - 1.62) * Math.max(0, tel.altitude - 1.2)) * 0.68);
        l.update(dt, { throttle: tel.descent > want ? 1 : 0.2, moveX: 0, moveY: 0 }, flat);
      }
      l.dispose();
      return l.telemetry.touchdown;
    };
    const a = touchdown(30);
    expect(touchdown(60)).toBeCloseTo(a, 1);
    expect(touchdown(144)).toBeCloseTo(a, 1);
  });

  it('turns the ship as far for the same sweep of the mouse at any frame rate', () => {
    // 600 px a second for half a second, delivered in frames.
    const sweep = (fps: number) => {
      let turned = 0;
      for (let i = 0; i < fps / 2; i++) turned += shapeMouse(600 / fps, 1, 1 / fps);
      return turned;
    };
    expect(sweep(144)).toBeCloseTo(sweep(60), 6);
    expect(sweep(30)).toBeCloseTo(sweep(60), 6);
  });
});

describe('one table, every controller', () => {
  const blank = (): FootInputs => ({
    moveX: 0, moveY: 0, jump: false, run: false, sprint: false, walk: false, crouch: false, use: false, throttle: 0,
    orbitDX: 0, orbitDY: 0, zoom: 0, interact: false, viewToggle: false, viewCycle: false, headlamp: false, shoulderSwap: false,
  });
  const attach = (inputs: FootInputs) => attachSurfaceControls({
    mount: document.createElement('div'), input: inputs, touch: false, paused: () => false, wake: () => undefined,
    onCrouch: () => undefined, onPauseRequest: () => undefined, selectable: '.help',
  });
  const padWith = (axes: number[], held: number[]) => ({
    connected: true, mapping: 'standard', axes,
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
  });
  const stubPads = (pads: unknown[]) => Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
  afterEach(() => stubPads([]));

  it('binds every key once, and the pad per the plan: A jump, X interact, RT sprint, sticks move and look', () => {
    const keys = FOOT_BINDINGS.flatMap((b) => b.keys);
    expect(new Set(keys).size).toBe(keys.length);
    const by = (a: string) => FOOT_BINDINGS.find((b) => b.action === a)!;
    expect(by('jump').pad).toContain(PAD.A);
    expect(by('interact').pad).toContain(PAD.X);
    expect(by('sprint').pad).toContain(PAD.RT);
    expect(by('move').pad).toContain('leftStick');
    expect(by('look').pad).toContain('rightStick');
    // M stays the sound; Tab is the map; F the headlamp; V the view.
    expect(by('sound').keys).toEqual(['KeyM']);
    expect(by('map').keys).toEqual(['Tab']);
    expect(by('headlamp').keys).toEqual(['KeyF']);
    expect(by('view').keys).toEqual(['KeyV']);
  });

  it('reads the same intent from the keys and the pad', () => {
    expect(intentFromPad([0, -1, 0, 0], (i) => i === PAD.RT || i === PAD.A)).toEqual(intentFromKeys(new Set(['KeyW', 'ShiftLeft', 'Space'])));
    const diag = intentFromKeys(new Set(['KeyW', 'KeyD']));
    const padDiag = intentFromPad([Math.SQRT1_2 * 0.85 + 0.15, -(Math.SQRT1_2 * 0.85 + 0.15), 0, 0], () => false);
    expect(padDiag.x).toBeCloseTo(diag.x, 9);
    expect(padDiag.y).toBeCloseTo(diag.y, 9);
  });

  it('walks, sprints and jumps exactly the same off the keyboard as off a gamepad', () => {
    const fromKeys = blank();
    const k = attach(fromKeys);
    for (const code of ['KeyW', 'ShiftLeft']) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const fromPad = blank();
    stubPads([padWith([0, -1, 0, 0], [PAD.RT])]);
    const p = attach(fromPad);
    p.poll(1 / 60);
    for (const f of ['moveX', 'moveY', 'sprint', 'walk', 'jump', 'use', 'run', 'crouch'] as const) expect(fromPad[f]).toBe(fromKeys[f]);

    // The same three seconds of walking from each, jump included, through the surfaces' own step.
    const trail = (inputs: FootInputs, press: (on: boolean) => void) => {
      const position = { x: 0, y: 0, z: 0 };
      const velocity = { x: 0, y: 0, z: 0 };
      const loco = makeLocomotion(position, velocity, moon);
      loco.settleFeet();
      const clock = makeFixedStep(H, 12); const jumpPress = makePressEdge(); const latch = makeSprintLatch();
      const walk = input();
      for (let n = 0; n < 180; n++) {
        if (n === 90) press(true);
        if (n === 96) press(false);
        jumpPress.see(inputs.jump);
        clock.advance(1 / 60, (h) => {
          const stick: FootStick = { moveX: inputs.moveX, moveY: inputs.moveY, jump: false, run: inputs.run, sprint: sprintFrom(latch, inputs.sprint, true, h), walk: inputs.walk, crouch: inputs.crouch };
          walkFromStick(walk, stick, Math.PI, jumpPress.take(), false);
          loco.update(h, walk, flat, [], 999);
        });
      }
      return { ...position, yaw: loco.yaw };
    };
    const a = trail(fromKeys, (on) => window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: 'Space' })));
    const b = trail(fromPad, (on) => { stubPads([padWith([0, -1, 0, 0], on ? [PAD.RT, PAD.A] : [PAD.RT])]); p.poll(1 / 60); });
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
    expect(b.z).toBeCloseTo(a.z, 9);
    expect(a.z).toBeGreaterThan(5);
    k.detach(); p.detach();
  });

  it('turns the view at the same rate from the right stick whatever the frame rate', () => {
    const look = (fps: number) => {
      const inputs = blank();
      stubPads([padWith([0, 0, 1, 0], [])]);
      const c = attach(inputs);
      for (let i = 0; i < fps; i++) c.poll(1 / fps);
      c.detach();
      return inputs.orbitDX;
    };
    expect(look(144)).toBeCloseTo(look(60), 6);
  });

  it('on a touch screen, only the right of the glass turns the view', () => {
    const inputs = blank();
    const mount = document.createElement('div');
    Object.defineProperty(mount, 'clientWidth', { value: 400, configurable: true });
    const c = attachSurfaceControls({
      mount, input: inputs, touch: true, paused: () => false, wake: () => undefined,
      onCrouch: () => undefined, onPauseRequest: () => undefined, selectable: '.help',
    });
    const drag = (fromX: number, toX: number) => {
      const down = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: fromX });
      Object.defineProperty(down, 'offsetX', { value: fromX });
      Object.defineProperty(down, 'pointerId', { value: 7 });
      mount.dispatchEvent(down);
      const move = new MouseEvent('pointermove', { bubbles: true, clientX: toX });
      Object.defineProperty(move, 'pointerId', { value: 7 });
      mount.dispatchEvent(move);
      const up = new MouseEvent('pointerup', { bubbles: true, clientX: toX });
      Object.defineProperty(up, 'pointerId', { value: 7 });
      mount.dispatchEvent(up);
    };
    // The thumb's side of the glass: the stick's, not the camera's.
    drag(40, 140);
    expect(inputs.orbitDX).toBe(0);
    // The other side turns it.
    drag(300, 340);
    expect(inputs.orbitDX).toBe(40);
    c.detach();
  });

  it('presses the headlamp, the view and the map from their keys and buttons', () => {
    const inputs = blank();
    const onMap = vi.fn();
    const c = attachSurfaceControls({
      mount: document.createElement('div'), input: inputs, touch: false, paused: () => false, wake: () => undefined,
      onCrouch: () => undefined, onPauseRequest: () => undefined, onMap, selectable: '.help',
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }));
    expect(inputs.headlamp).toBe(true);
    expect(inputs.viewToggle).toBe(true);
    expect(inputs.interact).toBe(false);
    expect(onMap).toHaveBeenCalledTimes(1);
    inputs.headlamp = inputs.viewToggle = false;
    stubPads([padWith([0, 0, 0, 0], [PAD.LB, PAD.Y, PAD.VIEW])]);
    c.poll(1 / 60);
    expect(inputs.headlamp).toBe(true);
    expect(inputs.viewToggle).toBe(true);
    expect(onMap).toHaveBeenCalledTimes(2);
    c.detach();
  });
});
