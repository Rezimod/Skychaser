// The Grand Tour: Story mode's campaign, as data for the mission engine.
//
// Nine chapters, one world each, flown in order: the Moon first (its own
// First Steps mission is the opening, so the controls are learnt by using
// them), then Mars, Venus, Mercury, the four giants, and home to Tbilisi.
// Every chapter is a Mission (missions.ts) that requires the one before it,
// so the engine does the ordering, the saving and the "next one unlocked".
//
// The objectives are built from what is already there on every world: the
// landing, stepping out of the ship, the outpost's own readout panels, the
// gems (world-crystals / engineer B's gems), a climb on the jetpack, a walk.
// None of those raise interaction-bus events the story can hear from
// outside the surface, so the story listens to the surfaces' telemetry
// instead (src/game/story.ts turns a sample of it into the signals named
// here: `landed:<world>`, `outside:<world>`, `read:<world>.<panel>`,
// `high:<world>`, `walk:<world>`, `mission:<moonMission>` and gem pickups
// `gem:<world>`).

import type { Mission, Objective } from '@/lib/solar-system/missions';
import type { WorldId } from '@/lib/solar-system/world-profiles';

export type StoryWorld = 'moon' | WorldId;

/** How high off the ground the jetpack has to carry the crew, metres. */
export const STORY_HIGH_M = 15;
/** How far the walk home through Tbilisi is, metres. */
export const STORY_WALK_M = 100;
/** Gems a chapter asks for (fewer where the world grew fewer). */
export const STORY_GEMS = 3;

export interface StoryChapter {
  /** The chapter's id, also the mission id in the engine and the message key. */
  id: string;
  /** Where it sends the crew: the flight's nav target and the surface it plays on. */
  world: StoryWorld;
  objectives: Objective[];
}

const land = (w: StoryWorld): Objective => ({ id: 'land', type: 'DISCOVER', target: `landed:${w}` });
const out = (w: StoryWorld): Objective => ({ id: 'out', type: 'DISCOVER', target: `outside:${w}` });
const read = (w: StoryWorld, panel: string): Objective => ({ id: 'read', type: 'DISCOVER', target: `read:${w}.${panel}` });
const gems = (w: StoryWorld): Objective => ({ id: 'gems', type: 'COLLECT', target: `gem:${w}`, required: STORY_GEMS });
const high = (w: StoryWorld): Objective => ({ id: 'high', type: 'DISCOVER', target: `high:${w}` });

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  { id: 'moon', world: 'moon', objectives: [land('moon'), { id: 'firstSteps', type: 'DISCOVER', target: 'mission:firstSteps' }] },
  { id: 'mars', world: 'mars', objectives: [land('mars'), out('mars'), read('mars', 'greenhouse'), gems('mars')] },
  { id: 'venus', world: 'venus', objectives: [land('venus'), out('venus'), read('venus', 'cooler'), high('venus')] },
  { id: 'mercury', world: 'mercury', objectives: [land('mercury'), out('mercury'), read('mercury', 'sunshade'), gems('mercury')] },
  { id: 'jupiter', world: 'jupiter', objectives: [land('jupiter'), out('jupiter'), read('jupiter', 'envelope'), high('jupiter')] },
  { id: 'saturn', world: 'saturn', objectives: [land('saturn'), out('saturn'), read('saturn', 'comms'), gems('saturn')] },
  { id: 'uranus', world: 'uranus', objectives: [land('uranus'), out('uranus'), read('uranus', 'habitat'), high('uranus')] },
  { id: 'neptune', world: 'neptune', objectives: [land('neptune'), out('neptune'), read('neptune', 'power'), gems('neptune')] },
  { id: 'earth', world: 'earth', objectives: [land('earth'), out('earth'), { id: 'walk', type: 'DISCOVER', target: 'walk:earth' }] },
];

export const STORY_IDS: readonly string[] = STORY_CHAPTERS.map((c) => c.id);

/** The chapters as the mission engine runs them: each waits for the one before. */
export const STORY_MISSIONS: Mission[] = STORY_CHAPTERS.map((c, i) => ({
  id: c.id,
  requires: i > 0 ? [STORY_CHAPTERS[i - 1].id] : undefined,
  objectives: c.objectives,
}));

export function chapterById(id: string): StoryChapter | undefined {
  return STORY_CHAPTERS.find((c) => c.id === id);
}

/** 1-based place in the tour, or 0 for an unknown id. */
export function chapterNumber(id: string): number {
  return STORY_IDS.indexOf(id) + 1;
}

/** How many lines each briefing has (`play.story.chapters.<id>.brief.l1…`). */
export const BRIEF_LINES = 3;
