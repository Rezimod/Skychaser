// Every control in Explore, in one table: which keys, which gamepad input,
// and whether the touch deck has it. The on-foot controls, the flight
// controls, the help panels and the prompts all read from here, so a key is
// changed in one place and the help can never disagree with the game.
//
// Gamepads are read in the browser's standard mapping: buttons 0 A, 1 B,
// 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu, 10 L3, 11 R3, 12–15
// the d-pad up, down, left, right; axes 0/1 the left stick, 2/3 the right.

export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const;

export type PadInput = number | 'leftStick' | 'rightStick';

export interface Binding<A extends string> {
  action: A;
  /** `KeyboardEvent.code`s. Empty for the pointer's own controls. */
  keys: readonly string[];
  /** What the help prints for them: key caps, or `mouse` / `wheel` (translated). */
  keyLabel: string;
  pad: readonly PadInput[];
  padLabel: string;
  /** The touch deck has a control for it. */
  touch?: boolean;
  /** Only the Moon has it (the rover, the expedition log). */
  moonOnly?: boolean;
}

export type FootAction =
  | 'move' | 'look' | 'zoom' | 'jump' | 'jet' | 'sprint' | 'walk' | 'crouch' | 'interact'
  | 'headlamp' | 'view' | 'shoulder' | 'map' | 'gears' | 'sound';

export const FOOT_BINDINGS: readonly Binding<FootAction>[] = [
  { action: 'move', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'], keyLabel: 'W A S D', pad: ['leftStick'], padLabel: 'LS', touch: true },
  { action: 'look', keys: [], keyLabel: 'mouse', pad: ['rightStick'], padLabel: 'RS', touch: true },
  { action: 'zoom', keys: [], keyLabel: 'wheel', pad: [PAD.UP, PAD.DOWN], padLabel: '↑ ↓' },
  { action: 'jump', keys: ['Space'], keyLabel: 'Space', pad: [PAD.A], padLabel: 'A', touch: true },
  // The jump key held in the air is the jet on every controller (surface-controls); J is its own key.
  { action: 'jet', keys: ['KeyJ'], keyLabel: 'J', pad: [], padLabel: 'A', touch: true },
  { action: 'sprint', keys: ['ShiftLeft', 'ShiftRight'], keyLabel: 'Shift', pad: [PAD.RT, PAD.L3], padLabel: 'RT', touch: true },
  { action: 'walk', keys: ['AltLeft', 'AltRight'], keyLabel: 'Alt', pad: [PAD.LT], padLabel: 'LT' },
  { action: 'crouch', keys: ['KeyC'], keyLabel: 'C', pad: [PAD.B], padLabel: 'B', touch: true },
  { action: 'interact', keys: ['KeyE'], keyLabel: 'E', pad: [PAD.X], padLabel: 'X', touch: true },
  { action: 'headlamp', keys: ['KeyF'], keyLabel: 'F', pad: [PAD.LB], padLabel: 'LB' },
  { action: 'view', keys: ['KeyV'], keyLabel: 'V', pad: [PAD.Y], padLabel: 'Y', touch: true },
  { action: 'shoulder', keys: ['KeyQ'], keyLabel: 'Q', pad: [PAD.RB], padLabel: 'RB' },
  { action: 'map', keys: ['Tab'], keyLabel: 'Tab', pad: [PAD.VIEW], padLabel: 'View', touch: true, moonOnly: true },
  { action: 'gears', keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], keyLabel: '1 2 3 4', pad: [PAD.RIGHT], padLabel: '→', touch: true, moonOnly: true },
  { action: 'sound', keys: ['KeyM'], keyLabel: 'M', pad: [], padLabel: '' },
];

export type FlightAction =
  | 'thrust' | 'turn' | 'look' | 'roll' | 'boost' | 'fire' | 'align' | 'view' | 'zoom';

/** The ship's keys are its own (flight-input handles the rest of the deck); these are the ones a gamepad also flies. */
export const FLIGHT_BINDINGS: readonly Binding<FlightAction>[] = [
  { action: 'thrust', keys: ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'], keyLabel: 'W S', pad: ['leftStick'], padLabel: 'LS' },
  { action: 'turn', keys: ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'], keyLabel: 'A D', pad: ['leftStick'], padLabel: 'LS' },
  { action: 'look', keys: [], keyLabel: 'mouse', pad: ['rightStick'], padLabel: 'RS' },
  { action: 'roll', keys: ['KeyQ', 'KeyE'], keyLabel: 'Q E', pad: [PAD.LB, PAD.RB], padLabel: 'LB RB' },
  { action: 'boost', keys: ['ShiftLeft', 'ShiftRight'], keyLabel: 'Shift', pad: [PAD.RT], padLabel: 'RT' },
  { action: 'fire', keys: ['Space'], keyLabel: 'Space', pad: [PAD.A], padLabel: 'A' },
  { action: 'align', keys: ['KeyG'], keyLabel: 'G', pad: [PAD.X], padLabel: 'X' },
  { action: 'view', keys: ['KeyC'], keyLabel: 'C', pad: [PAD.Y], padLabel: 'Y' },
  { action: 'zoom', keys: ['Minus', 'Equal', 'BracketLeft', 'BracketRight'], keyLabel: '- =', pad: [PAD.UP, PAD.DOWN], padLabel: '↑ ↓' },
];

function lookup<A extends string>(table: readonly Binding<A>[]) {
  const byKey = new Map<string, A>();
  const byAction = new Map<A, Binding<A>>();
  for (const b of table) {
    byAction.set(b.action, b);
    for (const k of b.keys) byKey.set(k, b.action);
  }
  return { byKey, byAction };
}

const foot = lookup(FOOT_BINDINGS);
const flight = lookup(FLIGHT_BINDINGS);

/** The on-foot action a key does, or null. */
export const footActionOf = (code: string): FootAction | null => foot.byKey.get(code) ?? null;
export const footBinding = (action: FootAction): Binding<FootAction> => foot.byAction.get(action)!;
export const flightBinding = (action: FlightAction): Binding<FlightAction> => flight.byAction.get(action)!;

const buttonCache = new WeakMap<Binding<string>, readonly number[]>();

/** The buttons of an action (sticks left out). Read every frame, so worked out once. */
export function padButtons<A extends string>(b: Binding<A>): readonly number[] {
  let out = buttonCache.get(b);
  if (!out) { out = b.pad.filter((p): p is number => typeof p === 'number'); buttonCache.set(b, out); }
  return out;
}

/** A standard gamepad's stick dead zone, with the rest of the travel spread back over 0…1. */
export function deadZone(v: number, dz = 0.15): number {
  return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz);
}

/** The first connected standard-mapping gamepad, if any. */
export function standardPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  for (const p of navigator.getGamepads()) if (p && p.connected && p.mapping === 'standard') return p;
  return null;
}
