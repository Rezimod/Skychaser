// The mission engine: what the crew is being asked to do, in data.
//
// A mission is a title, a brief and a list of objectives; an objective is a
// type, a target and how much of it is needed. Nothing here knows about
// three.js, the Moon, or the HUD. Each objective type has one small handler
// in a registry: most of them listen to the Phase-6 interaction bus and count
// events, two of them (TRAVEL and DRIVE) watch the crew each step instead.
// That is the whole engine — missions are added by writing data, not code.
//
// Progress goes through a MissionStore, so the localStorage one here can be
// swapped for an account-synced one later without touching the engine.

import type { InteractEvent, InteractionBus } from '@/lib/solar-system/moon-interactions';

export type ObjectiveType =
  | 'TRAVEL' | 'INTERACT' | 'COLLECT' | 'INSTALL' | 'REPAIR'
  | 'PHOTOGRAPH' | 'DRIVE' | 'OBSERVE' | 'ACTIVATE' | 'DISCOVER';

export interface Objective {
  id: string;
  type: ObjectiveType;
  /** What it counts: an interactable id, an item, or a world signal. */
  target: string;
  /** How many of them; one unless it says otherwise. For DRIVE, metres. */
  required?: number;
  /** Where the crew is being sent: the marker, the range and the arrival test. */
  at?: { x: number; z: number; r?: number };
  /** Shown instead of `solarSystem.moon.missions.<mission>.<objective>`. */
  labelKey?: string;
}

export interface Mission {
  id: string;
  /** Mission ids that must be finished first. */
  requires?: string[];
  objectives: Objective[];
  /** A key under `solarSystem.moon.mission.rewards`. */
  reward?: string;
}

export interface MissionContext {
  x: number;
  z: number;
  driving: boolean;
}

/** One objective's live state. */
export interface ObjectiveState {
  id: string;
  type: ObjectiveType;
  progress: number;
  required: number;
  done: boolean;
  /** Metres to `at`, or −1 when it sends the crew nowhere. */
  distance: number;
  /** World bearing to `at`, radians. */
  bearing: number;
}

export interface MissionsTelemetry {
  /** The mission being worked, or ''. */
  active: string;
  /** The objective in hand, or ''. */
  objective: string;
  objectives: ObjectiveState[];
  distance: number;
  bearing: number;
  done: string[];
  rewards: string[];
  /** Thrown up big for a few seconds: a key under `…moon.missions`. */
  banner: string;
  bannerHold: number;
  /** Every mission finished. */
  complete: boolean;
}

export interface MissionsHandle {
  telemetry: MissionsTelemetry;
  /** Take on a mission by id, or the first one whose prerequisites are met. */
  start: (id?: string) => string | null;
  update: (dt: number, ctx: MissionContext) => void;
  /** Which missions can be taken on right now. */
  available: () => string[];
  /** A mission's state for the log: 'done' | 'active' | 'open' | 'locked'. */
  statusOf: (id: string) => 'done' | 'active' | 'open' | 'locked';
  /** Fired when an objective finishes and when a mission does. */
  onEvent: ((kind: 'objective' | 'mission', id: string) => void) | null;
  dispose: () => void;
}

export interface SavedMissions {
  v: 1;
  active: string;
  done: string[];
  rewards: string[];
  /** Counts for the active mission's objectives, in order. */
  progress: number[];
}

export interface MissionStore {
  load: () => SavedMissions;
  save: (s: SavedMissions) => void;
}

export const freshSave = (): SavedMissions => ({ v: 1, active: '', done: [], rewards: [], progress: [] });

/** An objective type either counts bus events or watches the crew each step. */
interface Handler {
  /** How much this event is worth to this objective. */
  count?: (e: InteractEvent, o: Objective) => number;
  /** How much this step is worth; `moved` is the metres walked or driven. */
  tick?: (dt: number, o: Objective, ctx: MissionContext, moved: number) => number;
}

/** A completed interaction on the named thing. */
const onInteract = (e: InteractEvent, o: Objective) =>
  (e.type === 'interaction:completed' && e.id === o.target ? 1 : 0);
/** A signal the world raised: `zone` names it, and `state` is its value. */
const onSignal = (e: InteractEvent, o: Objective) =>
  (e.type === 'zone:state' && `${e.zone}:${e.state}` === o.target ? 1 : 0);

const HANDLERS: Record<ObjectiveType, Handler> = {
  // The plain ones are all "that thing, used": what differs is what the HUD
  // calls them and what the world does about it.
  INTERACT: { count: onInteract },
  INSTALL: { count: onInteract },
  REPAIR: { count: onInteract },
  ACTIVATE: { count: onInteract },
  COLLECT: { count: (e, o) => (e.type === 'item:picked' && e.item === o.target ? 1 : onInteract(e, o)) },
  PHOTOGRAPH: { count: onSignal },
  OBSERVE: { count: onSignal },
  DISCOVER: { count: onSignal },
  TRAVEL: {
    tick: (_dt, o, ctx) => {
      if (!o.at) return 0;
      const d = Math.hypot(o.at.x - ctx.x, o.at.z - ctx.z);
      return d <= (o.at.r ?? 6) ? 1 : 0;
    },
  },
  DRIVE: {
    // Either a distance driven, or somewhere reached at the wheel.
    tick: (_dt, o, ctx, moved) => {
      if (!ctx.driving) return 0;
      if (o.at) {
        const d = Math.hypot(o.at.x - ctx.x, o.at.z - ctx.z);
        return d <= (o.at.r ?? 8) ? (o.required ?? 1) : 0;
      }
      return moved;
    },
  },
};

export interface MissionsSetup {
  missions: Mission[];
  bus: InteractionBus;
  store: MissionStore;
  /** Run when a mission completes: the world changes here. */
  onComplete?: (id: string) => void;
  /** Run when a mission is taken on. */
  onStart?: (id: string) => void;
  /** Anything outside the game a mission also waits on: in Stellar
   *  Academy's children's mode, the lesson that teaches it. Asked fresh each
   *  time, so a lesson finished in another tab opens the mission. Left out,
   *  nothing outside the game holds a mission back. */
  gate?: (id: string) => boolean;
}

export function makeMissions({ missions, bus, store, onComplete, onStart, gate = () => true }: MissionsSetup): MissionsHandle {
  const byId = new Map(missions.map((m) => [m.id, m]));
  const saved = store.load();
  const done = new Set(saved.done.filter((id) => byId.has(id)));
  const rewards = [...saved.rewards];
  let active = byId.has(saved.active) && !done.has(saved.active) ? saved.active : '';
  let counts = active ? normalise(saved.progress, byId.get(active)!) : [];
  let lastX = 0;
  let lastZ = 0;
  let lastCtx: MissionContext | undefined;
  let moved = 0;
  let first = true;

  function normalise(progress: number[], m: Mission): number[] {
    return m.objectives.map((o, i) => Math.max(0, Math.min(required(o), progress[i] ?? 0)));
  }
  function required(o: Objective): number {
    return Math.max(1, o.required ?? 1);
  }
  function persist() {
    store.save({ v: 1, active, done: [...done], rewards, progress: counts });
  }

  const telemetry: MissionsTelemetry = {
    active: '', objective: '', objectives: [], distance: -1, bearing: 0,
    done: [...done], rewards, banner: '', bannerHold: 0, complete: false,
  };

  const handle: MissionsHandle = {
    telemetry,
    onEvent: null,
    available() {
      return missions
        .filter((m) => !done.has(m.id) && m.id !== active && (m.requires ?? []).every((r) => done.has(r)) && gate(m.id))
        .map((m) => m.id);
    },
    statusOf(id) {
      if (done.has(id)) return 'done';
      if (id === active) return 'active';
      const m = byId.get(id);
      if (!m) return 'locked';
      return (m.requires ?? []).every((r) => done.has(r)) && gate(id) ? 'open' : 'locked';
    },
    start(id) {
      const next = id ?? handle.available()[0];
      if (!next || !byId.has(next) || done.has(next) || !gate(next)) return null;
      active = next;
      counts = byId.get(next)!.objectives.map(() => 0);
      persist();
      sync(lastCtx);
      onStart?.(next);
      return next;
    },
    update(dt, ctx) {
      lastCtx = ctx;
      if (first) { lastX = ctx.x; lastZ = ctx.z; first = false; }
      moved = Math.hypot(ctx.x - lastX, ctx.z - lastZ);
      lastX = ctx.x;
      lastZ = ctx.z;
      if (telemetry.bannerHold > 0) {
        telemetry.bannerHold = Math.max(0, telemetry.bannerHold - dt);
        if (telemetry.bannerHold === 0) telemetry.banner = '';
      }
      const m = active ? byId.get(active) : undefined;
      if (m) {
        const k = firstOpen(m);
        if (k >= 0) {
          const o = m.objectives[k];
          const gain = HANDLERS[o.type].tick?.(dt, o, ctx, moved) ?? 0;
          if (gain > 0) award(m, k, gain);
        }
      }
      sync(ctx);
    },
    dispose() { unsub(); },
  };

  function firstOpen(m: Mission): number {
    for (let i = 0; i < m.objectives.length; i++) if (counts[i] < required(m.objectives[i])) return i;
    return -1;
  }

  /** Credit an objective, and carry the mission on if that finished it. */
  function award(m: Mission, k: number, gain: number) {
    const o = m.objectives[k];
    const before = counts[k];
    counts[k] = Math.min(required(o), before + gain);
    if (counts[k] <= before) return;
    persist();
    if (counts[k] < required(o)) { sync(lastCtx); return; }
    handle.onEvent?.('objective', o.id);
    if (firstOpen(m) >= 0) { sync(lastCtx); return; }
    done.add(m.id);
    if (m.reward && !rewards.includes(m.reward)) rewards.push(m.reward);
    active = '';
    counts = [];
    telemetry.banner = `${m.id}.done`;
    telemetry.bannerHold = 5;
    persist();
    handle.onEvent?.('mission', m.id);
    onComplete?.(m.id);
    // Straight on to whatever is next, so the crew is never left idle.
    if (!handle.start()) sync(lastCtx);
  }

  const unsub = bus.on((e) => {
    const m = active ? byId.get(active) : undefined;
    if (!m) return;
    const k = firstOpen(m);
    if (k < 0) return;
    const o = m.objectives[k];
    const gain = HANDLERS[o.type].count?.(e, o) ?? 0;
    if (gain > 0) award(m, k, gain);
  });

  function sync(ctx?: MissionContext) {
    const m = active ? byId.get(active) : undefined;
    telemetry.active = m?.id ?? '';
    telemetry.done = [...done];
    telemetry.complete = done.size >= missions.length;
    if (!m) {
      telemetry.objective = '';
      telemetry.objectives = [];
      telemetry.distance = -1;
      return;
    }
    const open = firstOpen(m);
    telemetry.objectives = m.objectives.map((o, i) => {
      const at = o.at;
      const d = at && ctx ? Math.hypot(at.x - ctx.x, at.z - ctx.z) : -1;
      return {
        id: o.id, type: o.type, progress: counts[i], required: required(o),
        done: counts[i] >= required(o), distance: at ? d : -1,
        bearing: at && ctx ? Math.atan2(at.x - ctx.x, at.z - ctx.z) : 0,
      };
    });
    const cur = open >= 0 ? telemetry.objectives[open] : undefined;
    telemetry.objective = open >= 0 ? m.objectives[open].id : '';
    telemetry.distance = cur?.distance ?? -1;
    telemetry.bearing = cur?.bearing ?? 0;
  }

  if (!active) handle.start();
  else sync();
  return handle;
}
