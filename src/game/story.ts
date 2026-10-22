// Story mode at run time: the Grand Tour's chapters (story-chapters.ts) run
// on the one mission engine (missions.ts), fed by what the surfaces see.
//
// The surfaces and the flight do not know the story exists. Each surface
// hands `story.observe()` a small sample of its telemetry a few times a
// second (where it is, landed or out, the panel being read, the gems held,
// the height off the ground, the distance walked, the Moon missions done);
// this turns it into the engine's signals on a bus of the story's own, and
// the engine counts them against the chapter in hand. Outside Story mode
// `observe` does nothing at all.
//
// What React reads is one immutable snapshot, rebuilt only when something
// the HUD shows has changed: the chapter, its objectives and their counts,
// the chapter just finished (for the card) and the briefing being played.

import { freshSave, makeMissions, type MissionsHandle, type MissionStore, type SavedMissions } from '@/lib/solar-system/missions';
import type { InteractEvent, InteractionBus } from '@/lib/solar-system/moon-interactions';
import {
  BRIEF_LINES, STORY_CHAPTERS, STORY_GEMS, STORY_HIGH_M, STORY_IDS, STORY_MISSIONS, STORY_WALK_M, chapterById, type StoryWorld,
} from '@/lib/solar-system/story-chapters';
import { onGemsChange, worldGemProgress } from '@/lib/solar-system/gem-progress';
import { isGemWorld } from '@/lib/solar-system/gem-layout';
import { game } from './state';

export const STORY_KEY = 'stellar_explore_story_v1';

/** One look at a surface, as the story needs it. */
export interface StorySample {
  world: StoryWorld;
  /** The ship is down (touchdown or after). */
  landed: boolean;
  /** The crew have stepped out of it. */
  outside: boolean;
  /** The readout panel on the glass, if any (`habitat`, `power`, …). */
  readout?: string;
  /** Gems collected on this world so far, and how many it has; `gemsTotal`
   *  0 means the world has none (the gem objective is then waived). */
  gems?: number;
  gemsTotal?: number;
  /** The crew's height off the ground, metres. */
  altitude?: number;
  /** Metres walked on this outing. */
  distance?: number;
  /** The Moon: missions finished there. */
  missionsDone?: readonly string[];
}

export interface StoryObjectiveView {
  id: string;
  progress: number;
  required: number;
  done: boolean;
}

export interface StorySnapshot {
  /** The chapter in hand, or '' once the tour is over. */
  active: string;
  /** Its place in the tour, 1-based; 0 when the tour is over. */
  index: number;
  total: number;
  /** Where it sends the crew, or null. */
  world: StoryWorld | null;
  /** The objective in hand (an id within the chapter), or ''. */
  objective: string;
  objectives: StoryObjectiveView[];
  done: string[];
  complete: boolean;
  /** A chapter just finished: the card to show, until dismissed. */
  card: string;
  /** The briefing on the comms: which chapter's, and which line (1-based). */
  briefing: { chapter: string; line: number } | null;
}

export interface StoryHandle {
  get: () => StorySnapshot;
  subscribe: (fn: () => void) => () => void;
  observe: (s: StorySample) => void;
  dismissCard: () => void;
  /** The briefing for the chapter in hand: once per session unless asked again. */
  brief: (force?: boolean) => boolean;
  nextLine: () => void;
  endBriefing: () => void;
  /** Start the tour over from the Moon. */
  restart: () => void;
  dispose: () => void;
}

function makeBus(): InteractionBus {
  const listeners = new Set<(e: InteractEvent) => void>();
  return {
    on(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    emit(e) { for (const fn of [...listeners]) fn(e); },
  };
}

const strings = (v: unknown, cap = 16): string[] =>
  (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []).slice(0, cap);

/** The tour's progress on this device. */
export function localStoryStore(): MissionStore {
  return {
    load(): SavedMissions {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORY_KEY);
        const v = raw ? (JSON.parse(raw) as Partial<SavedMissions>) : null;
        if (!v || v.v !== 1) return freshSave();
        return {
          v: 1,
          active: typeof v.active === 'string' && STORY_IDS.includes(v.active) ? v.active : '',
          done: strings(v.done).filter((id) => STORY_IDS.includes(id)),
          rewards: [],
          progress: Array.isArray(v.progress) ? v.progress.filter((n): n is number => Number.isFinite(n)).slice(0, 12) : [],
        };
      } catch {
        return freshSave();
      }
    },
    save(s) {
      try { localStorage.setItem(STORY_KEY, JSON.stringify(s)); } catch { /* private window: the tour lasts the session */ }
    },
  };
}

/** The tour on a store, with its own bus. Pure enough to test: no React, no DOM. */
export function makeStory(store: MissionStore): StoryHandle {
  const listeners = new Set<() => void>();
  let bus = makeBus();
  let engine: MissionsHandle = makeMissions({ missions: STORY_MISSIONS, bus, store });
  let card = '';
  let briefing: StorySnapshot['briefing'] = null;
  const heard = new Set<string>();
  let key = '';
  let snap: StorySnapshot = build();

  function hook(e: MissionsHandle) {
    e.onEvent = (kind, id) => { if (kind === 'mission') card = id; };
  }
  hook(engine);

  function build(): StorySnapshot {
    const t = engine.telemetry;
    const ch = chapterById(t.active);
    return {
      active: t.active,
      index: ch ? STORY_IDS.indexOf(ch.id) + 1 : 0,
      total: STORY_IDS.length,
      world: ch?.world ?? null,
      objective: t.objective,
      objectives: t.objectives.map((o) => ({ id: o.id, progress: o.progress, required: o.required, done: o.done })),
      done: [...t.done],
      complete: t.complete,
      card,
      briefing: briefing ? { ...briefing } : null,
    };
  }
  function changed() {
    const t = engine.telemetry;
    const next = `${t.active}|${t.objective}|${t.objectives.map((o) => o.progress).join(',')}|${t.done.length}|${card}|${briefing ? `${briefing.chapter}.${briefing.line}` : ''}`;
    if (next === key) return;
    key = next;
    snap = build();
    for (const fn of [...listeners]) fn();
  }
  changed();

  const signal = (zone: string, state: string) => bus.emit({ type: 'zone:state', zone, state });

  return {
    get: () => snap,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    observe(s) {
      const w = s.world;
      if (s.landed) signal('landed', w);
      if (s.outside) signal('outside', w);
      if (s.readout) signal('read', `${w}.${s.readout}`);
      if (s.outside && (s.altitude ?? 0) >= STORY_HIGH_M) signal('high', w);
      if (s.outside && (s.distance ?? 0) >= STORY_WALK_M) signal('walk', w);
      for (const id of s.missionsDone ?? []) signal('mission', id);
      // Gems count as the world has them, wherever and whenever they were
      // picked up: a crew that collected some in Free Fly is not sent to find
      // more. A world that grew fewer asks for all it has; one with none, none.
      const t = engine.telemetry;
      const cur = t.objectives.find((o) => o.id === t.objective);
      if (cur && cur.id === 'gems' && chapterById(t.active)?.world === w && s.gems !== undefined) {
        const total = s.gemsTotal;
        const need = cur.required;
        const have = total === 0 ? need
          : total !== undefined && total < need ? (s.gems >= total ? need : s.gems)
          : Math.min(need, s.gems);
        for (let i = cur.progress; i < have; i++) bus.emit({ type: 'item:picked', item: `gem:${w}` });
      }
      changed();
    },
    dismissCard() { card = ''; changed(); },
    brief(force = false) {
      const id = engine.telemetry.active;
      if (!id || (!force && heard.has(id))) return false;
      heard.add(id);
      briefing = { chapter: id, line: 1 };
      changed();
      return true;
    },
    nextLine() {
      if (!briefing) return;
      briefing = briefing.line >= BRIEF_LINES ? null : { chapter: briefing.chapter, line: briefing.line + 1 };
      changed();
    },
    endBriefing() { briefing = null; changed(); },
    restart() {
      engine.dispose();
      store.save(freshSave());
      bus = makeBus();
      engine = makeMissions({ missions: STORY_MISSIONS, bus, store });
      hook(engine);
      card = '';
      briefing = null;
      heard.clear();
      changed();
    },
    dispose() { engine.dispose(); listeners.clear(); },
  };
}

// ── The gems each world has given up, from the gem save (gem-progress),
// read again only when a pickup changes it rather than on every sample. ──
const gemCache = new Map<string, { collected: number; total: number }>();
let gemWatch: (() => void) | null = null;
function gemsOn(world: StoryWorld): { collected: number; total: number } | undefined {
  if (!isGemWorld(world)) return undefined;
  if (!gemWatch) gemWatch = onGemsChange(() => gemCache.clear());
  let g = gemCache.get(world);
  if (!g) {
    const p = worldGemProgress(world);
    g = { collected: p.collected, total: p.total };
    gemCache.set(world, g);
  }
  return g;
}

// ── The one tour the game plays, made the first time it is asked for. ──
let runtime: StoryHandle | null = null;
function tour(): StoryHandle {
  if (!runtime) runtime = makeStory(localStoryStore());
  return runtime;
}

/** The game's story. Everything but `observe` works in any mode (the title
 *  and the Missions panel read it); `observe` only listens in Story mode. */
export const story = {
  get: (): StorySnapshot => tour().get(),
  subscribe: (fn: () => void): (() => void) => tour().subscribe(fn),
  observe(s: StorySample) {
    if (game.get().mode !== 'story') return;
    // The gems come from the gem save unless the sample brought its own count.
    const g = s.gems === undefined ? gemsOn(s.world) : undefined;
    tour().observe(g ? { ...s, gems: g.collected, gemsTotal: g.total } : s);
  },
  dismissCard: () => tour().dismissCard(),
  brief: (force?: boolean) => tour().brief(force),
  nextLine: () => tour().nextLine(),
  endBriefing: () => tour().endBriefing(),
  restart: () => tour().restart(),
  /** Tests only: forget the tour (the next call reads the store afresh). */
  reset() { runtime?.dispose(); runtime = null; },
};

/** The progress line under an objective, or '' when it is a single step. */
export function objectiveProgress(o: StoryObjectiveView | undefined): string {
  return o && o.required > 1 ? `${Math.min(o.progress, o.required)} / ${o.required}` : '';
}

export { STORY_CHAPTERS, STORY_GEMS };

/** What a surface's objective card says for the story, when the chapter in
 *  hand is on this world: the chapter, the objective's message key under
 *  `play.story`, and its count. Null anywhere else. */
export function storyLine(s: StorySnapshot, world: StoryWorld): { chapter: string; index: number; key: string; progress: string } | null {
  if (!s.active || s.world !== world || !s.objective) return null;
  return {
    chapter: s.active,
    index: s.index,
    key: `chapters.${s.active}.obj.${s.objective}`,
    progress: objectiveProgress(s.objectives.find((o) => o.id === s.objective)),
  };
}
