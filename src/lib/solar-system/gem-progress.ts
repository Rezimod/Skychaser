// The gems a player has picked up, kept on the device: per world, the ids
// from the shared layout (gem-layout), and from those a score. This is the
// one place the surfaces write a pickup, the menus read a summary, and the
// platform sync (useGemSync) reads what it has not reported yet.
//
// The save replaces the older crystal save (CRYSTALS_KEY, Mars and Proxima b
// only): the first time it is read, every crystal cluster the player held is
// turned into one gem on the same world, the commonest first, so nobody's
// count goes down. The old key is left where it is.

import { GEM_INFO, GEM_WORLDS, gemLayout, isGemWorld, worldGemTotals, type GemKind, type GemWorld } from '@/lib/solar-system/gem-layout';

export const GEMS_KEY = 'stellar_explore_gems_v1';
/** The ids each signed-in account has had stored by the platform, so a sync only sends what is new. */
export const GEMS_SENT_KEY = 'stellar_explore_gems_sent_v1';
/** The crystal save this one replaces (world-crystals, until 2026-10). */
export const CRYSTALS_KEY = 'stellar_explore_crystals_v1';

export interface GemSave {
  v: 1;
  worlds: Partial<Record<GemWorld, string[]>>;
  /** The crystal save has been folded in (or there was none). */
  migrated: boolean;
}

export type GemStore = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): GemStore | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const valid = (world: GemWorld, ids: unknown): string[] => {
  if (!Array.isArray(ids)) return [];
  const known = new Set(gemLayout(world).map((g) => g.id));
  return [...new Set(ids.filter((s): s is string => typeof s === 'string' && known.has(s)))];
};

/** The crystals someone held before the gems: how many per world. */
export function readLegacyCrystals(store: GemStore | null = storage()): Partial<Record<GemWorld, number>> {
  const out: Partial<Record<GemWorld, number>> = {};
  try {
    const raw = store?.getItem(CRYSTALS_KEY);
    if (!raw) return out;
    const v = JSON.parse(raw) as { v?: unknown; worlds?: Record<string, unknown> };
    if (!v || v.v !== 1 || !v.worlds || typeof v.worlds !== 'object') return out;
    for (const [w, ids] of Object.entries(v.worlds)) {
      if (!isGemWorld(w) || !Array.isArray(ids)) continue;
      const n = new Set(ids.filter((s) => typeof s === 'string')).size;
      if (n > 0) out[w] = n;
    }
  } catch { /* unreadable: nothing to carry over */ }
  return out;
}

/** The gems a world's old crystals become: its commonest, cheapest gems on the ground first, so nothing is gained. */
export function legacyGemIds(world: GemWorld, count: number): string[] {
  const order = { near: 0, far: 1, high: 2 } as const;
  return [...gemLayout(world)]
    .sort((a, b) => GEM_INFO[a.kind].points - GEM_INFO[b.kind].points || order[a.tier] - order[b.tier] || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.min(count, gemLayout(world).length)))
    .map((g) => g.id);
}

export function loadGemSave(store: GemStore | null = storage()): GemSave {
  let save: GemSave | null = null;
  try {
    const raw = store?.getItem(GEMS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<GemSave>;
      if (v && v.v === 1 && v.worlds && typeof v.worlds === 'object') {
        const worlds: GemSave['worlds'] = {};
        for (const [w, ids] of Object.entries(v.worlds)) {
          if (!isGemWorld(w)) continue;
          const list = valid(w, ids);
          if (list.length) worlds[w] = list;
        }
        save = { v: 1, worlds, migrated: v.migrated === true };
      }
    }
  } catch { /* unreadable: start clean, but still carry the crystals over */ }
  if (!save) save = { v: 1, worlds: {}, migrated: false };
  if (!save.migrated) {
    for (const [w, n] of Object.entries(readLegacyCrystals(store)) as [GemWorld, number][]) {
      const have = new Set(save.worlds[w] ?? []);
      for (const id of legacyGemIds(w, n)) have.add(id);
      save.worlds[w] = [...have];
    }
    save.migrated = true;
    writeGemSave(save, store);
  }
  return save;
}

export function writeGemSave(save: GemSave, store: GemStore | null = storage()) {
  try { store?.setItem(GEMS_KEY, JSON.stringify(save)); } catch { /* private mode: the count still shows this visit */ }
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** Something was picked up (or a save was replaced): the menus and the sync read again. */
export function onGemsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function emit() { for (const fn of [...listeners]) { try { fn(); } catch { /* a listener's own trouble */ } } }

/** The ids taken on one world. */
export function collectedOn(world: GemWorld, store: GemStore | null = storage()): Set<string> {
  return new Set(loadGemSave(store).worlds[world] ?? []);
}

/** Keep a pickup. False when the id is unknown or already held. */
export function recordGem(world: GemWorld, id: string, store: GemStore | null = storage()): boolean {
  if (!gemLayout(world).some((g) => g.id === id)) return false;
  const save = loadGemSave(store);
  const have = new Set(save.worlds[world] ?? []);
  if (have.has(id)) return false;
  have.add(id);
  save.worlds[world] = [...have];
  writeGemSave(save, store);
  emit();
  return true;
}

export interface WorldGemProgress {
  world: GemWorld;
  collected: number;
  total: number;
  points: number;
  maxPoints: number;
  /** How many of each kind are held here. */
  kinds: Partial<Record<GemKind, number>>;
}

export interface GemSummary {
  collected: number;
  total: number;
  points: number;
  maxPoints: number;
  worlds: WorldGemProgress[];
}

/** One world's progress, for a menu or the story. */
export function worldGemProgress(world: GemWorld, save: GemSave = loadGemSave()): WorldGemProgress {
  const held = new Set(save.worlds[world] ?? []);
  const kinds: Partial<Record<GemKind, number>> = {};
  let points = 0;
  for (const g of gemLayout(world)) {
    if (!held.has(g.id)) continue;
    points += GEM_INFO[g.kind].points;
    kinds[g.kind] = (kinds[g.kind] ?? 0) + 1;
  }
  const t = worldGemTotals(world);
  return { world, collected: held.size, total: t.count, points, maxPoints: t.points, kinds };
}

/** Every world, and the sum: what the leaderboard panel shows when there is no platform. */
export function gemSummary(store: GemStore | null = storage()): GemSummary {
  const save = loadGemSave(store);
  const worlds = GEM_WORLDS.map((w) => worldGemProgress(w, save));
  return {
    collected: worlds.reduce((s, w) => s + w.collected, 0),
    total: worlds.reduce((s, w) => s + w.total, 0),
    points: worlds.reduce((s, w) => s + w.points, 0),
    maxPoints: worlds.reduce((s, w) => s + w.maxPoints, 0),
    worlds,
  };
}

/** Take in what the platform holds for the signed-in account (gems picked up on another device). */
export function mergeGems(worlds: Partial<Record<string, string[]>>, store: GemStore | null = storage()): number {
  const save = loadGemSave(store);
  let added = 0;
  for (const [w, ids] of Object.entries(worlds)) {
    if (!isGemWorld(w)) continue;
    const have = new Set(save.worlds[w] ?? []);
    for (const id of valid(w, ids)) if (!have.has(id)) { have.add(id); added += 1; }
    save.worlds[w] = [...have];
  }
  if (added > 0) { writeGemSave(save, store); emit(); }
  return added;
}

// ── What the platform has been told, per account. ──

type Sent = Record<string, Partial<Record<GemWorld, string[]>>>;

function readSent(store: GemStore | null): Sent {
  try {
    const raw = store?.getItem(GEMS_SENT_KEY);
    const v = raw ? JSON.parse(raw) as unknown : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Sent : {};
  } catch { return {}; }
}

/** The pickups this account has not had stored yet, a batch per world. */
export function unsentGems(account: string, store: GemStore | null = storage()): { world: GemWorld; gemIds: string[] }[] {
  const save = loadGemSave(store);
  const sent = readSent(store)[account] ?? {};
  const out: { world: GemWorld; gemIds: string[] }[] = [];
  for (const w of GEM_WORLDS) {
    const done = new Set(Array.isArray(sent[w]) ? sent[w] : []);
    const ids = (save.worlds[w] ?? []).filter((id) => !done.has(id));
    if (ids.length) out.push({ world: w, gemIds: ids });
  }
  return out;
}

/** The platform has these ids for this account now. */
export function markGemsSent(account: string, world: GemWorld, ids: readonly string[], store: GemStore | null = storage()) {
  const all = readSent(store);
  const mine = all[account] ?? {};
  mine[world] = [...new Set([...(Array.isArray(mine[world]) ? mine[world]! : []), ...ids])];
  all[account] = mine;
  try { store?.setItem(GEMS_SENT_KEY, JSON.stringify(all)); } catch { /* the next sync sends them again; the server keeps each once */ }
}
