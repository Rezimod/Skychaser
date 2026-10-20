// Desktop controls for Explore Mode: keyboard, pointer-lock mouse and a
// standard gamepad (its buttons from the bindings table). The mouse is shaped
// here — a dead zone against sensor jitter, a soft response curve so small
// corrections are fine and big sweeps are quick, and a cap on how fast it can
// turn the nose — before the flight model ever sees it, so every ship gets
// the same feel.

import * as THREE from 'three';
import type { FlightInput, FlightSession, SpeedMode } from '@/lib/solar-system/player-ship';
import { stepDestination } from '@/lib/solar-system/star-routes';
import { setSoundOn, soundOn } from '@/lib/solar-system/sound-prefs';
import { getSettings } from '@/game/settings';
import { deadZone, flightBinding, padButtons, standardPad, type FlightAction } from '@/game/bindings';

const HANDLED_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
  'Digit1', 'Digit2', 'Digit3', 'KeyF', 'KeyH', 'KeyJ', 'KeyV', 'KeyC', 'KeyZ', 'KeyT', 'KeyG', 'KeyR', 'KeyI',
  'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'KeyK', 'KeyL', 'KeyM',
]);

/** Chase-camera distance multiplier: how close and how far the player can pull. */
const CAM_ZOOM_MIN = 0.45;
const CAM_ZOOM_MAX = 3.2;
const CAM_ZOOM_STEP = 1.16;
/** Pixels of motion that count as none — trackpads and optical sensors drift. */
const MOUSE_DEAD_PX = 0.6;
/** Radians per pixel at the linear part of the curve. */
const MOUSE_SENS = 0.0011;
/** A sixtieth of a second of pointer motion can turn the nose at most this
 *  far — a flick of the wrist should not spin the ship. */
const MOUSE_MAX_STEP = 0.045;
/** Right-drag orbit: radians of camera swing per pixel, and how far the
 *  view may climb before the up vector would flip. */
const ORBIT_SENS = 0.006;
const ORBIT_PITCH_MAX = 1.2;

/** Keep an accumulated yaw in (-π, π] so the camera unwinds the short way. */
function wrapPi(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}

/** Pull the chase camera in or push it out, within its stops. */
export function zoomFlightCamera(input: FlightInput, direction: number) {
  const next = input.camZoom * (direction > 0 ? CAM_ZOOM_STEP : 1 / CAM_ZOOM_STEP);
  input.camZoom = THREE.MathUtils.clamp(next, CAM_ZOOM_MIN, CAM_ZOOM_MAX);
}

/** Pixels of pointer travel over `dt` → radians of commanded turn, with dead
 *  zone, a gentle power curve and a cap. The curve reads the travel as a rate
 *  per sixtieth of a second, so a sweep turns the nose as far at 144 frames a
 *  second as at 30. */
export function shapeMouse(px: number, turn: number, dt: number): number {
  const frames = Math.max(dt * 60, 1e-3);
  const mag = Math.abs(px) / frames;
  if (mag < MOUSE_DEAD_PX) return 0;
  const shaped = Math.pow(mag - MOUSE_DEAD_PX, 1.12) * MOUSE_SENS * turn;
  return Math.sign(px) * Math.min(MOUSE_MAX_STEP, shaped) * frames;
}

/**
 * Keyboard + pointer-lock mouse. Must be called from a user gesture so the
 * lock request is honoured; returns the detach function. `onExit` fires on
 * ESC / X, or when a held pointer lock is released by the browser.
 */
export function attachDesktopControls(
  session: FlightSession,
  lockTarget: HTMLElement,
  onExit: () => void,
): () => void {
  const input = session.input;
  const pressed = new Set<string>();
  // The gamepad's share, added to the keys'.
  const pad = { thrust: 0, yaw: 0, lookYaw: 0, pitch: 0, roll: 0, boost: false, fire: false, align: false };
  const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
  const sync = () => {
    const has = (c: string) => pressed.has(c);
    input.thrust = clamp1((has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0) + pad.thrust);
    input.yaw = clamp1((has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0) + pad.yaw);
    input.roll = clamp1((has('KeyE') ? 1 : 0) - (has('KeyQ') ? 1 : 0) + pad.roll);
    input.lookYaw = pad.lookYaw;
    input.pitch = pad.pitch;
    input.boost = has('ShiftLeft') || has('ShiftRight') || pad.boost;
    input.fire = has('Space') || pad.fire;
    input.align = has('KeyG') || pad.align;
  };
  // A standard gamepad: the left stick is thrust and turn (as the touch
  // stick is), the right stick points the nose, the shoulders roll.
  const padWas: boolean[] = [];
  const buttons = (a: FlightAction) => padButtons(flightBinding(a));
  const [rollLeft, rollRight] = buttons('roll');
  const [zoomIn, zoomOut] = buttons('zoom');
  let padLive = false;
  let raf = 0;
  const pollPad = () => {
    raf = requestAnimationFrame(pollPad);
    const p = standardPad();
    if (!p || session.paused) {
      if (padLive) { padLive = false; Object.assign(pad, { thrust: 0, yaw: 0, lookYaw: 0, pitch: 0, roll: 0, boost: false, fire: false, align: false }); sync(); }
      return;
    }
    padLive = true;
    const down = (i: number) => !!p.buttons[i]?.pressed;
    const any = (a: FlightAction) => buttons(a).some(down);
    const s = getSettings();
    pad.thrust = -deadZone(p.axes[1] ?? 0);
    pad.yaw = deadZone(p.axes[0] ?? 0);
    pad.lookYaw = deadZone(p.axes[2] ?? 0) * s.sensitivity;
    // Stick up is nose up, as the mouse is; the setting turns it over.
    pad.pitch = clamp1(-deadZone(p.axes[3] ?? 0) * s.sensitivity * (s.invertY ? -1 : 1));
    pad.roll = (down(rollRight) ? 1 : 0) - (down(rollLeft) ? 1 : 0);
    pad.boost = any('boost'); pad.fire = any('fire'); pad.align = any('align');
    const edge = (i: number) => { const on = down(i); const was = padWas[i]; padWas[i] = on; return on && !was; };
    if (buttons('view').some(edge)) input.viewToggle = true;
    if (edge(zoomIn)) zoomFlightCamera(input, -1);
    if (edge(zoomOut)) zoomFlightCamera(input, 1);
    sync();
  };
  // 1 / 2 / 3 pick the regime outright; H is the jump, on its own key.
  const modeFor: Record<string, SpeedMode> = { Digit1: 'cruise', Digit2: 'fast', Digit3: 'ultra', KeyH: 'jump' };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyX') {
      onExit();
      return;
    }
    if (session.paused || !HANDLED_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    const mode = modeFor[e.code];
    if (mode) input.modeRequest = mode;
    else if (e.code === 'KeyF') input.foilsToggle = true;
    else if (e.code === 'KeyJ') session.destination = stepDestination(session.telemetry.systemName, session.destination, e.shiftKey ? -1 : 1);
    else if (e.code === 'KeyV') input.eject = true;
    else if (e.code === 'KeyC') input.viewToggle = true;
    else if (e.code === 'KeyZ') input.assistToggle = true;
    else if (e.code === 'KeyI') input.hudToggle = true;
    else if (e.code === 'KeyK') input.dockRequest = true;
    else if (e.code === 'KeyL') input.landRequest = true;
    else if (e.code === 'KeyT') input.targetStep = e.shiftKey ? -1 : 1;
    else if (e.code === 'KeyR') input.targetClear = true;
    else if (e.code === 'KeyM') setSoundOn(!soundOn());
    else if (e.code === 'Minus' || e.code === 'BracketLeft') zoomFlightCamera(input, 1);
    else if (e.code === 'Equal' || e.code === 'BracketRight') zoomFlightCamera(input, -1);
    pressed.add(e.code);
    sync();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!pressed.delete(e.code)) return;
    sync();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!session.active || session.paused) return;
    if (!document.pointerLockElement && e.target instanceof Element && e.target.closest('button')) return;
    // Right button held: the pointer walks the camera around the hull
    // instead of steering, so the ship can be looked at from any angle.
    if (input.orbiting) {
      input.orbitYaw = wrapPi(input.orbitYaw + e.movementX * ORBIT_SENS);
      input.orbitPitch = THREE.MathUtils.clamp(input.orbitPitch + e.movementY * ORBIT_SENS, -ORBIT_PITCH_MAX, ORBIT_PITCH_MAX);
      return;
    }
    if (!document.pointerLockElement && !(e.buttons & 1)) return;
    const s = getSettings();
    input.mouseDX += e.movementX * s.sensitivity;
    input.mouseDY += e.movementY * (s.invertY ? -s.sensitivity : s.sensitivity);
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 2 || session.paused) return;
    input.orbiting = true;
    input.orbitYaw = 0;
    input.orbitPitch = 0;
  };
  const endOrbit = (e?: MouseEvent) => {
    if (e && e.button !== 2) return;
    input.orbiting = false;
    input.orbitYaw = 0;
    input.orbitPitch = 0;
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const onWheel = (e: WheelEvent) => {
    if (session.paused) return;
    e.preventDefault();
    zoomFlightCamera(input, e.deltaY > 0 ? 1 : -1);
  };
  const onBlur = () => {
    pressed.clear();
    sync();
    input.mouseDX = input.mouseDY = 0;
    endOrbit();
  };
  let lockHeld = false;
  const onLockChange = () => {
    if (document.pointerLockElement === lockTarget) {
      lockHeld = true;
    } else if (lockHeld) {
      lockHeld = false;
      onBlur();
      if (!session.paused) onExit();
    }
  };
  raf = requestAnimationFrame(pollPad);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', endOrbit);
  window.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);
  try {
    const req = lockTarget.requestPointerLock() as unknown;
    if (req instanceof Promise) req.catch(() => undefined);
  } catch {
    // Pointer lock is optional — movementX/Y still steer without it.
  }
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', endOrbit);
    window.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('pointerlockchange', onLockChange);
    lockHeld = false;
    if (document.pointerLockElement === lockTarget) document.exitPointerLock();
    clearFlightInput(input);
  };
}

export function clearFlightInput(input: FlightInput) {
  input.thrust = 0;
  input.yaw = 0;
  input.lookYaw = 0;
  input.pitch = 0;
  input.roll = 0;
  input.boost = false;
  input.fire = false;
  input.align = false;
  input.mouseDX = 0;
  input.mouseDY = 0;
  input.modeRequest = null;
  input.foilsToggle = false;
  input.eject = false;
  input.viewToggle = false;
  input.assistToggle = false;
  input.hudToggle = false;
  input.dockRequest = false;
  input.landRequest = false;
  input.approachRequest = null;
  input.approachSkip = false;
  input.fromHome = false;
  input.relaunch = false;
  input.relaunchAt = '';
  input.targetStep = 0;
  input.targetClear = false;
  input.targetRequest = null;
  input.targetKind = null;
  input.camZoom = 1;
  input.orbiting = false;
  input.orbitYaw = 0;
  input.orbitPitch = 0;
}
