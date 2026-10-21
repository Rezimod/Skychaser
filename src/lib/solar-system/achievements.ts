// What the crew actually did up there, kept as records first.
//
// A finished mission writes one achievement — an id, the moment, and what it
// was about. The Moon itself awards nothing: the sink is an interface, the
// local one keeps the records on the device, and the synced one (below)
// reports each new record to the platform, which decides what it is worth
// (lib/games/explore.ts) and credits Stars to the signed-in wallet. A record
// made while signed out or offline is not lost: it is reported on the next
// flush, once there is a wallet to credit.

export interface Achievement {
  /** `explore.telescope_calibrated` and the like: stable, and namespaced. */
  id: string;
  /** Unix milliseconds. */
  at: number;
  /** What it was about — the object observed, the crater sampled. */
  detail?: string;
}

export interface RewardSink {
  /** Write one, unless it is already held. True when it was new. */
  record: (id: string, detail?: string) => boolean;
  list: () => Achievement[];
}

/** A finished mission's record. */
export const MISSION_ACHIEVEMENTS: Record<string, string> = {
  firstSteps: 'explore.first_steps',
  power: 'explore.power_restored',
  telescope: 'explore.telescope_calibrated',
  comms: 'explore.comms_restored',
  expedition: 'explore.lunar_geology',
};

/** Objectives worth a record of their own, by objective id. */
export const OBJECTIVE_ACHIEVEMENTS: Record<string, string> = {
  earthrise: 'explore.earthrise_photo',
};

const KEY = 'stellar_explore_achievements_v1';
const CAP = 32;

function parse(raw: string | null): Achievement[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((a): a is Achievement =>
        !!a && typeof a === 'object'
        && typeof (a as Achievement).id === 'string'
        && Number.isFinite((a as Achievement).at))
      .map((a) => (typeof a.detail === 'string' ? { id: a.id, at: a.at, detail: a.detail } : { id: a.id, at: a.at }))
      .slice(0, CAP);
  } catch {
    return [];
  }
}

/** The device's own log. A window that refuses storage still plays: the
 *  records live for the session and are simply not there next time. */
export function localRewardSink(now: () => number = Date.now): RewardSink {
  let cache: Achievement[] | null = null;
  const all = () => {
    if (!cache) {
      try { cache = parse(localStorage.getItem(KEY)); } catch { cache = []; }
    }
    return cache;
  };
  return {
    record(id, detail) {
      const list = all();
      if (list.some((a) => a.id === id)) return false;
      list.push(detail ? { id, at: now(), detail } : { id, at: now() });
      if (list.length > CAP) list.splice(0, list.length - CAP);
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private window */ }
      return true;
    },
    list: () => all(),
  };
}

/** A sink that keeps nothing, for tests and for scenes without storage. */
export function memoryRewardSink(now: () => number = Date.now): RewardSink {
  const list: Achievement[] = [];
  return {
    record(id, detail) {
      if (list.some((a) => a.id === id)) return false;
      list.push(detail ? { id, at: now(), detail } : { id, at: now() });
      return true;
    },
    list: () => list,
  };
}

// ── The connection to the platform ──

/** Report one record. True when the platform has it (credited now, credited
 *  before, or not worth anything); false when it should be tried again later
 *  — signed out, offline, or the server is down. */
export type AchievementSubmit = (achievement: Achievement) => Promise<boolean>;

export interface SyncedRewardSink extends RewardSink {
  /** Report every record the platform has not credited yet, one by one. */
  flush: () => Promise<void>;
  /** The ids the platform has credited, as far as this device knows. */
  credited: () => string[];
  /** The platform said these are credited (a progress read): stop reporting them. */
  markCredited: (ids: readonly string[]) => void;
}

const CREDITED_KEY = 'stellar_explore_credited_v1';

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** A sink that keeps records locally and reports each new one to the
 *  platform. What has been credited is remembered on the device so a record
 *  is reported once, not on every visit; a report that fails is simply made
 *  again on the next flush. */
export function syncedRewardSink(local: RewardSink, submit: AchievementSubmit): SyncedRewardSink {
  let credited: Set<string> | null = null;
  const known = () => {
    if (!credited) {
      try { credited = new Set(parseIds(localStorage.getItem(CREDITED_KEY))); } catch { credited = new Set(); }
    }
    return credited;
  };
  const remember = (ids: readonly string[]) => {
    const set = known();
    let changed = false;
    for (const id of ids) if (!set.has(id)) { set.add(id); changed = true; }
    if (changed) {
      try { localStorage.setItem(CREDITED_KEY, JSON.stringify([...set])); } catch { /* private window */ }
    }
  };
  let inFlight: Promise<void> | null = null;
  const flush = () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const set = known();
      for (const a of local.list()) {
        if (set.has(a.id)) continue;
        let ok = false;
        try { ok = await submit(a); } catch { ok = false; }
        if (ok) remember([a.id]);
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
  return {
    record(id, detail) {
      const fresh = local.record(id, detail);
      if (fresh) void flush();
      return fresh;
    },
    list: () => local.list(),
    flush,
    credited: () => [...known()],
    markCredited: remember,
  };
}
