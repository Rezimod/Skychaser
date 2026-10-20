// One key does the job in front of you. Anything the crew can use — an
// airlock panel, the rover, a charger, the drill, a patch of regolith —
// registers here with where it is, how far it reaches, and whether it is
// tapped or held. Each step the resolver picks the best one in reach
// (priority first, then what the crew is facing, then distance), keeps it
// while it stays valid so the prompt does not flicker between neighbours,
// and routes the key to it: a press fires a tap, holding runs a hold.
//
// The same system serves the Moon, Mars and Earth. On top of the resolver
// it keeps two things a job needs: the one thing the crew is carrying (a
// tool, a part, a sample — hands are full or they are not), and a small
// bus that says what just happened, so missions, audio and the HUD can
// listen instead of being called by name. An interactable whose `requires`
// is not met still shows its prompt, marked blocked, rather than vanishing:
// the crew should be able to see that the coupling belongs here.

export type InteractKind = 'tap' | 'hold';

/** What just happened. Events are rare — no allocation per frame. */
export type InteractEvent =
  | { type: 'interaction:completed'; id: string }
  | { type: 'item:picked'; item: string }
  | { type: 'item:dropped'; item: string }
  | { type: 'zone:state'; zone: string; state: string };

export interface InteractionBus {
  /** Listen; the returned function stops listening. */
  on: (fn: (e: InteractEvent) => void) => () => void;
  emit: (e: InteractEvent) => void;
}

/** The crew's hands: one thing at a time. */
export interface Carry {
  item: string | null;
  /** Take it, unless the hands are full. */
  take: (item: string) => boolean;
  /** Put down whatever is held, and say what it was. */
  drop: () => string | null;
  has: (item: string) => boolean;
}

export interface Interactable {
  id: string;
  /** Where it is and how far it reaches right now, or null when unavailable. */
  where: () => { x: number; z: number; r: number } | null;
  kind: () => InteractKind;
  /** Key under solarSystem.moon.act for the prompt. */
  label: () => string;
  /** Tap: fired once per press. Hold: every step while held. */
  use: (dt: number) => void;
  /** 0…1 for a hold's ring; −1 for none. */
  progress?: () => number;
  /** Higher wins over nearer. */
  priority?: number;
  /** On foot, from the rover, or either. */
  mode?: 'foot' | 'rover' | 'any';
  /** What must be true to use it — a part in hand, a mission flag. Unmet, it
   *  still shows, marked blocked, and the key does nothing. */
  requires?: () => boolean;
}

export interface InteractionPrompt {
  active: boolean;
  id: string;
  label: string;
  kind: InteractKind;
  progress: number;
  /** A hold is running this step. */
  holding: boolean;
  /** In reach, but `requires` is not met. */
  blocked: boolean;
}

export interface InteractionContext {
  x: number;
  z: number;
  yaw: number;
  driving: boolean;
  /** Edge: the key went down this step. */
  press: boolean;
  /** The key is down. */
  held: boolean;
}

export interface Interactions {
  add: (i: Interactable) => void;
  remove: (id: string) => void;
  /** The thing registered under this id, whatever registered it. */
  find: (id: string) => Interactable | null;
  prompt: InteractionPrompt;
  carry: Carry;
  bus: InteractionBus;
  update: (dt: number, ctx: InteractionContext) => void;
}

function makeBus(): InteractionBus {
  const listeners: ((e: InteractEvent) => void)[] = [];
  return {
    on(fn) {
      listeners.push(fn);
      return () => { const k = listeners.indexOf(fn); if (k >= 0) listeners.splice(k, 1); };
    },
    emit(e) { for (const fn of [...listeners]) fn(e); },
  };
}

export function makeInteractions(): Interactions {
  const list: Interactable[] = [];
  const prompt: InteractionPrompt = { active: false, id: '', label: '', kind: 'tap', progress: -1, holding: false, blocked: false };
  const bus = makeBus();
  const carry: Carry = {
    item: null,
    take(item) {
      if (carry.item) return false;
      carry.item = item;
      bus.emit({ type: 'item:picked', item });
      return true;
    },
    drop() {
      const item = carry.item;
      carry.item = null;
      if (item) bus.emit({ type: 'item:dropped', item });
      return item;
    },
    has: (item) => carry.item === item,
  };
  let current: Interactable | null = null;
  // A press that lands on a hold item still counts as holding until released.
  let pressedOn = '';

  const score = (i: Interactable, ctx: InteractionContext): number => {
    const mode = i.mode ?? 'foot';
    if (mode === 'foot' && ctx.driving) return -Infinity;
    if (mode === 'rover' && !ctx.driving) return -Infinity;
    const w = i.where();
    if (!w) return -Infinity;
    const dx = w.x - ctx.x; const dz = w.z - ctx.z;
    const d = Math.hypot(dx, dz);
    if (d > w.r) return -Infinity;
    const facing = d > 0.3 ? (dx * Math.sin(ctx.yaw) + dz * Math.cos(ctx.yaw)) / d : 1;
    return (i.priority ?? 0) * 10 + facing * 1.5 - d * 0.6;
  };

  return {
    prompt,
    carry,
    bus,
    add(i) { list.push(i); },
    find: (id) => list.find((i) => i.id === id) ?? null,
    remove(id) {
      const k = list.findIndex((i) => i.id === id);
      if (k >= 0) list.splice(k, 1);
      if (current?.id === id) current = null;
    },
    update(dt, ctx) {
      let best: Interactable | null = null;
      let bestScore = -Infinity;
      for (const i of list) {
        const s = score(i, ctx);
        if (s > bestScore) { bestScore = s; best = i; }
      }
      // Stick with the one already shown unless another is clearly better.
      if (current && best !== current) {
        const keepScore = score(current, ctx);
        if (keepScore > -Infinity && keepScore + 1 >= bestScore) best = current;
      }
      current = best;
      prompt.holding = false;
      if (!best) {
        prompt.active = false;
        prompt.id = '';
        prompt.blocked = false;
        pressedOn = '';
        return;
      }
      const kind = best.kind();
      const blocked = best.requires ? !best.requires() : false;
      if (!ctx.held) pressedOn = '';
      if (ctx.press && !blocked) {
        pressedOn = best.id;
        if (kind === 'tap') {
          best.use(0);
          bus.emit({ type: 'interaction:completed', id: best.id });
        }
      }
      if (kind === 'hold' && !blocked && ctx.held && pressedOn === best.id) {
        const before = best.progress ? best.progress() : -1;
        best.use(dt);
        prompt.holding = true;
        // A hold reports itself done when its own progress reaches the end.
        const after = best.progress ? best.progress() : -1;
        if (after >= 1 && before < 1) bus.emit({ type: 'interaction:completed', id: best.id });
      }
      prompt.blocked = blocked;
      // A tap may have removed or changed what is here; read it afresh.
      prompt.active = true;
      prompt.id = best.id;
      prompt.kind = best.kind();
      prompt.label = best.label();
      prompt.progress = best.progress ? best.progress() : -1;
    },
  };
}
