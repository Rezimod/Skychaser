// Flying, as it looks and feels rather than as numbers: the chase camera
// eases back and up and follows a climb tightly, the same at any frame rate,
// and keeps out of a giant's deck from below; the crouch key puts the pack
// out in flight without crouching; the suit leans into the travel with its
// legs trailing, holds its arms out in a vertical climb, falls when the key
// is let go, and moves between walking, flying and falling without a pop.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makeCameraRig, type ChaseTarget, type ChaseTuning } from '@/lib/solar-system/moon-camera';
import { deckCameraFloor } from '@/lib/solar-system/suit-jetpack';
import { attachSurfaceControls, type FootInputs } from '@/game/surface-controls';
import { LUNAR_G, type WalkInput } from '@/lib/solar-system/suit-locomotion';
import type { DustHandle } from '@/lib/solar-system/moon-fx';

const flat = () => 0;
const none = () => [];
const TUNE: ChaseTuning = { follow: 2.4, lead: 0.3, leadMax: 0.8, fovKick: 4, horizontal: 9, vertical: 4, shoulder: 0.4 };

function chaseRig(floor: (x: number, z: number) => number = flat) {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 4000);
  const rig = makeCameraRig(camera, floor, none, 60);
  rig.yaw = Math.PI; rig.pitch = 0.3; rig.distance = 5.2;
  rig.snap();
  const target: ChaseTarget = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, height: 1.35, distance: 5.2, speedFrac: 0, flying: 0 };
  return { camera, rig, target };
}

describe('the chase camera in flight', () => {
  it('eases back and up while flying, and comes back in on landing', () => {
    const { camera, rig, target } = chaseRig();
    const run = (seconds: number, tune = TUNE) => { for (let t = 0; t < seconds; t += 1 / 60) { rig.chase(1 / 60, target, tune); rig.update(1 / 60); } };
    target.position.set(0, 20, 0);
    run(4);
    const foot = camera.position.distanceTo(target.position);
    const footUp = camera.position.y - target.position.y;
    target.flying = 1;
    let worst = 0; let last = camera.position.clone();
    for (let t = 0; t < 4; t += 1 / 60) {
      rig.chase(1 / 60, target, TUNE); rig.update(1 / 60);
      worst = Math.max(worst, camera.position.distanceTo(last)); last = camera.position.clone();
    }
    const fly = camera.position.distanceTo(target.position);
    expect(fly).toBeGreaterThan(foot * 1.3);
    expect(camera.position.y - target.position.y).toBeGreaterThan(footUp);
    // Eased, not cut: never more than a few centimetres a frame with the crew standing still.
    expect(worst).toBeLessThan(0.08);
    target.flying = 0;
    run(5);
    expect(camera.position.distanceTo(target.position)).toBeCloseTo(foot, 1);
  });

  it('keeps a steady climb in frame, more tightly than a walker\'s bound, at any frame rate', () => {
    const lagAt = (fps: number, flying: number) => {
      const { camera, rig, target } = chaseRig();
      target.flying = flying;
      target.velocity.set(0, 7, 0);
      const dt = 1 / fps;
      for (let t = 0; t < 6; t += dt) {
        target.position.y += 7 * dt;
        rig.chase(dt, target, TUNE); rig.update(dt);
      }
      // How far below the crew's look point the view is aimed, along y.
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const along = target.position.clone().sub(camera.position);
      const aimY = camera.position.y + dir.y * along.dot(dir);
      return target.position.y + target.height - aimY;
    };
    const fly30 = lagAt(30, 1); const fly144 = lagAt(144, 1);
    expect(Math.abs(lagAt(60, 1))).toBeLessThan(Math.abs(lagAt(60, 0)));
    expect(Math.abs(fly30 - fly144)).toBeLessThan(0.15);
  });

  it('does not come up through a giant\'s deck from below, nor dip into the clouds', () => {
    const deck = { radius: 42, seaDepth: 55 };
    const target: ChaseTarget = { position: new THREE.Vector3(48, -40, 0), velocity: new THREE.Vector3(), yaw: Math.PI / 2, height: 1.35, distance: 5.2, speedFrac: 0, flying: 1 };
    const floor = deckCameraFloor(deck, 72, () => target.position.y);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 4000);
    const rig = makeCameraRig(camera, flat, none, 60);
    // Looking out from the deck: the camera would sit under it.
    rig.yaw = -Math.PI / 2; rig.pitch = 0.2;
    rig.snap();
    const tune = { ...TUNE, floor };
    for (let t = 0; t < 3; t += 1 / 60) { rig.chase(1 / 60, target, tune); rig.update(1 / 60); }
    const r = Math.hypot(camera.position.x, camera.position.z);
    expect(r < deck.radius + 0.5 && camera.position.y < 0).toBe(false);
    expect(camera.position.y).toBeGreaterThan(-deck.seaDepth + 1.5);
  });

  it('stops treating what stands on the ground as in the way, high over it', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 4000);
    const pillar = [{ x: 0, z: 4, r: 1.5 }];
    const rig = makeCameraRig(camera, flat, () => pillar, 60);
    rig.yaw = 0; rig.pitch = 0.1; rig.snap();
    const target: ChaseTarget = { position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(), yaw: Math.PI, height: 1.35, distance: 6, speedFrac: 0 };
    const tune = { ...TUNE, shoulder: 0 };
    for (let t = 0; t < 2; t += 1 / 60) { rig.chase(1 / 60, target, tune); rig.update(1 / 60); }
    const low = camera.position.distanceTo(target.position);
    target.position.y = 40;
    rig.snap();
    for (let t = 0; t < 2; t += 1 / 60) { rig.chase(1 / 60, target, tune); rig.update(1 / 60); }
    const high = camera.position.distanceTo(target.position);
    expect(low).toBeLessThan(4.5);
    expect(high).toBeGreaterThan(5.5);
  });
});

describe('the crouch key in flight', () => {
  it('drops (puts the pack out) while held in the air, and crouches only on the ground', () => {
    const inputs: FootInputs = {
      moveX: 0, moveY: 0, jump: false, run: false, sprint: false, walk: false, crouch: false, use: false, throttle: 0,
      orbitDX: 0, orbitDY: 0, zoom: 0, interact: false, viewToggle: false, viewCycle: false, headlamp: false, shoulderSwap: false,
    };
    let flying = true;
    const onCrouch = vi.fn();
    const c = attachSurfaceControls({
      mount: document.createElement('div'), input: inputs, touch: false, paused: () => false, wake: () => undefined,
      onCrouch, onPauseRequest: () => undefined, selectable: '.help', flying: () => flying,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    expect(inputs.descend).toBe(true);
    expect(inputs.crouch).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    expect(inputs.descend).toBe(false);
    flying = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    expect(inputs.crouch).toBe(true);
    expect(onCrouch).toHaveBeenCalledWith(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    // The deck's own way down.
    c.touchDeck.descend = true; c.sync();
    expect(inputs.descend).toBe(true);
    c.detach();
  });
});

describe('the suit in flight', () => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}) });
  const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };
  const DT = 1 / 120;
  const input = (over: Partial<WalkInput> = {}): WalkInput => ({ moveX: 0, moveZ: 0, jump: false, run: false, crouch: false, work: false, ...over });

  it('leans into the travel with the legs trailing, holds the arms out going straight up, falls when let go, and never pops', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    const { makeCosmonaut } = await import('@/lib/solar-system/moon-cosmonaut');
    const c = makeCosmonaut(dust, true, LUNAR_G);
    c.settle();
    const pelvis = c.group.getObjectByName('pelvis')!;
    const shoulder = c.group.getObjectByName('shoulder1')!;
    let worst = 0;
    let last = pelvis.rotation.x;
    const run = (seconds: number, over: Partial<WalkInput>) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        c.update(DT, input(over), () => 0, [], 999);
        c.present(1);
        worst = Math.max(worst, Math.abs(pelvis.rotation.x - last));
        last = pelvis.rotation.x;
      }
    };
    run(1, {});
    run(3.5, { jet: true });
    expect(c.state.anim).toBe('hover');
    const hoverArm = Math.abs(shoulder.rotation.z);
    expect(hoverArm).toBeGreaterThan(0.5);
    run(3, { moveZ: 1, sprint: true, jet: true });
    expect(c.state.anim).toBe('fly');
    expect(pelvis.rotation.x).toBeGreaterThan(0.7);
    // Swept back at speed, closer in than in the hover.
    expect(shoulder.rotation.x).toBeGreaterThan(0.2);
    expect(Math.abs(shoulder.rotation.z)).toBeLessThan(hoverArm);
    // Let go: the flame dies and down they come.
    let fell = false;
    let t = 0;
    while (c.state.flying && t < 30) { run(DT, {}); t += DT; fell ||= c.state.anim === 'fall' && !c.state.jetting; }
    expect(fell).toBe(true);
    expect(c.state.flying).toBe(false);
    run(1.5, {});
    // Through take-off, climb, cruise, the fall and touchdown the body never jumps a pose in a step.
    expect(worst).toBeLessThan(0.05);
    expect(Math.abs(pelvis.rotation.x)).toBeLessThan(0.15);
    c.dispose();
    HTMLCanvasElement.prototype.getContext = getContext;
  });

  it('turns the head a little after the camera\'s look, and not when the camera is in front', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    const { makeCosmonaut } = await import('@/lib/solar-system/moon-cosmonaut');
    const c = makeCosmonaut(dust, true, LUNAR_G);
    c.settle();
    const neck = c.group.getObjectByName('neck')!;
    const run = (seconds: number, yaw: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) { c.gaze(yaw, 0); c.update(DT, input(), () => 0, [], 999); } };
    run(2, 0);
    const ahead = neck.rotation.y;
    run(2, 0.9);
    expect(neck.rotation.y - ahead).toBeGreaterThan(0.2);
    expect(neck.rotation.y - ahead).toBeLessThan(0.65);
    run(2, 2.8);
    expect(Math.abs(neck.rotation.y - ahead)).toBeLessThan(0.12);
    c.dispose();
    HTMLCanvasElement.prototype.getContext = getContext;
  });
});
