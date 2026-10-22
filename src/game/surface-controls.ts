// On foot, every controller at once: the keyboard, the mouse (held by
// pointer lock from the first click; Esc lets go of it and pauses), a
// standard gamepad and the touch deck. Each is its own source; held controls
// are merged into the surface's input every time one of them changes, and
// presses are handed over as one-shot flags the scene consumes. What each
// key and button does comes from the bindings table.

import { deadZone, footActionOf, footBinding, padButtons, standardPad, type FootAction } from '@/game/bindings';
import { eventElement, lockPointer } from '@/game/console';
import { setSoundOn, soundOn } from '@/lib/solar-system/sound-prefs';
import { touchLook } from '@/lib/solar-system/surface-input';

/** What the Moon and every world take from their controls. */
export interface FootInputs {
  moveX: number;
  moveY: number;
  jump: boolean;
  /** Held: the jetpack — the jump key kept down, or its own key or deck button. Optional for a caller with no pack. */
  jet?: boolean;
  /** Held, in flight: sink — the crouch key or button, or the deck's descend. */
  descend?: boolean;
  run: boolean;
  sprint: boolean;
  walk: boolean;
  crouch: boolean;
  use: boolean;
  throttle: number;
  orbitDX: number;
  orbitDY: number;
  zoom: number;
  interact: boolean;
  viewToggle: boolean;
  viewCycle: boolean;
  headlamp: boolean;
  shoulderSwap: boolean;
  gearRequest?: number | null;
}

/** One source's held controls. */
export interface FootIntent {
  x: number;
  y: number;
  jump: boolean;
  jet: boolean;
  /** The crouch key or button held: in flight, descend. */
  descend: boolean;
  sprint: boolean;
  walk: boolean;
  use: boolean;
}

const idle = (): FootIntent => ({ x: 0, y: 0, jump: false, jet: false, descend: false, sprint: false, walk: false, use: false });
const held = (a: FootAction, down: (code: string) => boolean) => footBinding(a).keys.some(down);

/** The keyboard's held controls. */
export function intentFromKeys(pressed: ReadonlySet<string>, out: FootIntent = idle()): FootIntent {
  const has = (c: string) => pressed.has(c);
  const x = (has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0);
  const y = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
  const len = Math.hypot(x, y) || 1;
  out.x = x / len; out.y = y / len;
  out.jump = held('jump', has); out.jet = held('jet', has); out.descend = held('crouch', has); out.sprint = held('sprint', has); out.walk = held('walk', has); out.use = held('interact', has);
  return out;
}

/** A gamepad's held controls: its axes, and whether button `i` is down. */
export function intentFromPad(axes: readonly number[], down: (i: number) => boolean, out: FootIntent = idle()): FootIntent {
  const any = (a: FootAction) => padButtons(footBinding(a)).some(down);
  out.x = deadZone(axes[0] ?? 0); out.y = -deadZone(axes[1] ?? 0);
  out.jump = any('jump'); out.jet = any('jet'); out.descend = any('crouch'); out.sprint = any('sprint'); out.walk = any('walk'); out.use = any('interact');
  return out;
}

/** The touch deck's held controls. */
export interface TouchDeck {
  x: number;
  y: number;
  jump: boolean;
  /** The jet key, held. */
  jet: boolean;
  /** In flight: the jump key held, or the jet key dragged down. */
  descend: boolean;
  use: boolean;
  throttle: boolean;
  /** The lope key. */
  run: boolean;
}

export interface SurfaceControlsOptions {
  /** The canvas: drags on it look around, and it takes the pointer lock. */
  mount: HTMLElement;
  input: FootInputs;
  /** A coarse pointer: no pointer lock, and the stick pushed to its rim lopes. */
  touch: boolean;
  paused: () => boolean;
  /** Any input at all: the audio context may start. */
  wake: () => void;
  onCrouch: (on: boolean) => void;
  /** The crew is flying on the pack: the crouch key descends instead of crouching. */
  flying?: () => boolean;
  onPauseRequest: () => void;
  /** The mission and map panel (the Moon's expedition log). */
  onMap?: () => void;
  /** The rover's next gear (a gamepad has no number keys). */
  onGearCycle?: () => void;
  /** Where text may still be selected (the help, the log). */
  selectable: string;
}

export interface SurfaceControls {
  touchDeck: TouchDeck;
  /** Push the touch deck's held controls into the input. */
  sync: () => void;
  toggleCrouch: () => void;
  /** Once a frame: read the gamepad. */
  poll: (dt: number) => void;
  detach: () => void;
}

/** The right stick at full tilt turns the view as fast as this many pixels of mouse a second. */
const PAD_LOOK_X = 840;
const PAD_LOOK_Y = 600;
/** The touch stick this far out lopes. */
const TOUCH_RIM = 0.93;
/** Left of this fraction of the glass, a touch drag is the stick's, not the view's. */
const LOOK_SIDE = 0.45;
/** Actions a gamepad button presses (rather than holds). */
const PAD_PRESSES = ['interact', 'view', 'shoulder', 'headlamp', 'crouch', 'map', 'gears', 'zoom'] as const;

export function attachSurfaceControls(o: SurfaceControlsOptions): SurfaceControls {
  const { input, mount } = o;
  const pressed = new Set<string>();
  const keys = idle();
  const pad = idle();
  const padWas: boolean[] = [];
  const deck: TouchDeck = { x: 0, y: 0, jump: false, jet: false, descend: false, use: false, throttle: false, run: false };
  let crouch = false;

  const sync = () => {
    intentFromKeys(pressed, keys);
    // The stick in use wins: a gamepad's, then the touch deck's, then the keys.
    const src = pad.x !== 0 || pad.y !== 0 ? pad : deck.x !== 0 || deck.y !== 0 ? deck : keys;
    input.moveX = src.x; input.moveY = src.y;
    input.jump = keys.jump || pad.jump || deck.jump;
    // The jump key kept down in the air is the jet; so is its own key.
    input.jet = input.jump || keys.jet || pad.jet || deck.jet;
    // In flight the crouch key held is the way down.
    input.descend = keys.descend || pad.descend || deck.descend;
    // On the way down the jump is the descent engine.
    input.throttle = input.jump || deck.throttle ? 1 : 0;
    input.sprint = keys.sprint || pad.sprint;
    input.walk = keys.walk || pad.walk;
    input.run = deck.run || (o.touch && Math.hypot(deck.x, deck.y) > TOUCH_RIM);
    input.use = keys.use || pad.use || deck.use;
    input.crouch = crouch;
  };
  const toggleCrouch = () => { crouch = !crouch; o.onCrouch(crouch); sync(); };

  /** A press of an action, from any controller. */
  const act = (a: FootAction, code = '') => {
    if (a === 'interact') input.interact = true;
    else if (a === 'view') input.viewToggle = true;
    else if (a === 'shoulder') input.shoulderSwap = true;
    else if (a === 'headlamp') input.headlamp = true;
    else if (a === 'crouch') { if (!o.flying?.()) toggleCrouch(); }
    else if (a === 'sound') setSoundOn(!soundOn());
    else if (a === 'map') o.onMap?.();
    else if (a === 'gears') {
      if (code.startsWith('Digit')) { if (input.gearRequest !== undefined) input.gearRequest = Number(code.slice(5)) - 1; }
      else o.onGearCycle?.();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const a = footActionOf(e.code);
    if (!a || o.paused()) return;
    if ((a === 'map' && !o.onMap) || (a === 'gears' && input.gearRequest === undefined)) return;
    e.preventDefault();
    o.wake();
    if (e.repeat) return;
    pressed.add(e.code);
    act(a, e.code);
    sync();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!pressed.delete(e.code)) return;
    sync();
  };
  const onBlur = () => {
    pressed.clear();
    Object.assign(pad, idle());
    // The lope key is a toggle on the deck, not a held key: it stays as it is.
    deck.x = deck.y = 0; deck.jump = deck.jet = deck.descend = deck.use = deck.throttle = false;
    input.orbitDX = input.orbitDY = 0;
    orbitId = -1;
    sync();
  };
  const onHidden = () => { if (document.hidden) onBlur(); };
  // Press and hold selects nothing and calls up no menu: this is a game.
  const noSelect = (e: Event) => {
    const el = eventElement(e);
    if (el && el.closest(o.selectable)) return;
    e.preventDefault();
  };

  // Drags on the scene look around, separately from the movement stick.
  let orbitId = -1;
  let lastX = 0; let lastY = 0;
  const onDown = (e: PointerEvent) => {
    o.wake();
    if (e.button !== 0 || orbitId >= 0 || o.paused()) return;
    // Touch: the left of the glass belongs to the movement thumb, and a
    // finger that slides off the stick must not also swing the view. Only a
    // drag that starts on the right of the canvas looks around. A mouse owns
    // the whole thing, because it has the pointer lock.
    if (o.touch && e.offsetX < mount.clientWidth * LOOK_SIDE) return;
    // A mouse on the desk owns the view outright while play lasts; Esc gives it back.
    if (!o.touch) lockPointer(mount);
    orbitId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY;
    // A pointer that is already gone (a synthetic click, a lock taken in the
    // same tick) cannot be captured; the drag still works without it.
    try { mount.setPointerCapture(e.pointerId); } catch { /* no live pointer */ }
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (document.pointerLockElement === mount) {
      if (!o.paused()) { input.orbitDX += e.movementX; input.orbitDY += e.movementY; }
      return;
    }
    if (e.pointerId === orbitId) {
      // A finger gets a gentle acceleration: exact when slow, quick on a flick.
      const dx = e.clientX - lastX; const dy = e.clientY - lastY;
      input.orbitDX += o.touch ? touchLook(dx) : dx;
      input.orbitDY += o.touch ? touchLook(dy) : dy;
      lastX = e.clientX; lastY = e.clientY;
    }
  };
  const onUp = (e: PointerEvent) => { if (e.pointerId === orbitId) orbitId = -1; };
  const onWheel = (e: WheelEvent) => { input.zoom += Math.sign(e.deltaY); e.preventDefault(); };
  // The lock is held from the first click; losing it (Esc) is a pause.
  let lockHeld = false;
  const onLockChange = () => {
    if (document.pointerLockElement === mount) { lockHeld = true; return; }
    if (!lockHeld) return;
    lockHeld = false;
    input.orbitDX = input.orbitDY = 0;
    if (!o.paused()) o.onPauseRequest();
  };

  const poll = (dt: number) => {
    const p = standardPad();
    if (!p || o.paused()) {
      // Unplugged mid-stride: whatever it was holding is let go.
      if (!p && (pad.x !== 0 || pad.y !== 0 || pad.jump || pad.jet || pad.descend || pad.sprint || pad.walk || pad.use)) { Object.assign(pad, idle()); sync(); }
      return;
    }
    const down = (i: number) => !!p.buttons[i]?.pressed;
    const wasMoving = pad.x !== 0 || pad.y !== 0;
    const j = pad.jump; const jt = pad.jet; const dn = pad.descend; const s = pad.sprint; const w = pad.walk; const u = pad.use;
    intentFromPad(p.axes, down, pad);
    const moving = pad.x !== 0 || pad.y !== 0;
    if (moving) o.wake();
    input.orbitDX += deadZone(p.axes[2] ?? 0) * PAD_LOOK_X * dt;
    input.orbitDY += deadZone(p.axes[3] ?? 0) * PAD_LOOK_Y * dt;
    for (const a of PAD_PRESSES) {
      for (const i of padButtons(footBinding(a))) {
        const on = down(i);
        if (on && !padWas[i]) {
          if (a === 'zoom') input.zoom += i === footBinding('zoom').pad[0] ? -1 : 1;
          else act(a);
        }
        padWas[i] = on;
      }
    }
    if (moving || wasMoving || pad.jump !== j || pad.jet !== jt || pad.descend !== dn || pad.sprint !== s || pad.walk !== w || pad.use !== u) sync();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onHidden);
  document.addEventListener('selectstart', noSelect);
  document.addEventListener('contextmenu', noSelect);
  document.addEventListener('pointerlockchange', onLockChange);
  mount.addEventListener('pointerdown', onDown);
  mount.addEventListener('pointermove', onMove);
  mount.addEventListener('pointerup', onUp);
  mount.addEventListener('pointercancel', onUp);
  mount.addEventListener('lostpointercapture', onUp);
  mount.addEventListener('wheel', onWheel, { passive: false });

  return {
    touchDeck: deck,
    sync,
    toggleCrouch,
    poll,
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('selectstart', noSelect);
      document.removeEventListener('contextmenu', noSelect);
      document.removeEventListener('pointerlockchange', onLockChange);
      mount.removeEventListener('pointerdown', onDown);
      mount.removeEventListener('pointermove', onMove);
      mount.removeEventListener('pointerup', onUp);
      mount.removeEventListener('pointercancel', onUp);
      mount.removeEventListener('lostpointercapture', onUp);
      mount.removeEventListener('wheel', onWheel);
      if (document.pointerLockElement === mount) document.exitPointerLock();
    },
  };
}
