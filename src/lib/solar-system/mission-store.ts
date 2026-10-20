// Where mission progress lives. One interface, one localStorage
// implementation, and the migration off the two keys players already carry:
// nobody who has been up there loses what they did.
//
// From `stellar_moon_jobs_v1` a finished side job counts as the mission that
// replaced it — the array is the power mission, the dish the comms one, the
// rover run and the samples the expedition. From
// `stellar_moon_expedition_v2` a crew that got past the survey has plainly
// walked the surface and cycled the airlock, so First Steps is theirs, and
// whatever the old expedition awarded them stays in the log.

import { freshSave, type MissionStore, type SavedMissions } from '@/lib/solar-system/missions';

const KEY = 'stellar_moon_missions_v1';
const JOBS_KEY = 'stellar_moon_jobs_v1';
const EXPEDITION_KEY = 'stellar_moon_expedition_v2';

/** Side job → the mission that took its place. */
const FROM_JOB: Record<string, string> = { solar: 'power', comms: 'comms', rover: 'expedition', samples: 'expedition' };

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const strings = (v: unknown, cap = 16): string[] =>
  (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []).slice(0, cap);

/** What the old keys are worth, for a crew with no new save yet. */
export function migrate(known: string[]): SavedMissions {
  const s = freshSave();
  const jobs = read(JOBS_KEY) as { done?: unknown } | null;
  for (const job of strings(jobs?.done)) {
    const id = FROM_JOB[job];
    if (id && known.includes(id) && !s.done.includes(id)) s.done.push(id);
  }
  const old = read(EXPEDITION_KEY) as { stage?: unknown; rewards?: unknown } | null;
  if (old) {
    if (typeof old.stage === 'string' && old.stage !== 'survey' && known.includes('firstSteps')) {
      if (!s.done.includes('firstSteps')) s.done.unshift('firstSteps');
    }
    s.rewards = strings(old.rewards, 8);
  }
  // The expedition is the mission the side jobs replaced: without First Steps
  // behind them the later ones cannot be taken on, so grant it as well.
  if (s.done.length && !s.done.includes('firstSteps') && known.includes('firstSteps')) s.done.unshift('firstSteps');
  return s;
}

export function localMissionStore(known: string[]): MissionStore {
  return {
    load() {
      const v = read(KEY) as Partial<SavedMissions> | null;
      if (!v || v.v !== 1) return migrate(known);
      return {
        v: 1,
        active: typeof v.active === 'string' ? v.active : '',
        done: strings(v.done).filter((id) => known.includes(id)),
        rewards: strings(v.rewards, 8),
        progress: Array.isArray(v.progress) ? v.progress.filter((n): n is number => Number.isFinite(n)).slice(0, 12) : [],
      };
    },
    save(s) {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window: play it through anyway */ }
    },
  };
}

/** A store that keeps nothing, for tests and for a crew with no storage. */
export function memoryMissionStore(initial?: SavedMissions): MissionStore {
  let state = initial ?? freshSave();
  return { load: () => state, save: (s) => { state = s; } };
}
