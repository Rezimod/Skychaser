// Gems to the platform: the pickups kept on the device (gem-progress) that
// the signed-in account has not had stored yet go to
// POST /api/games/explore/gems, a batch per world; what the account already
// holds on the platform (from another device) comes back into the save the
// first time a session syncs. Signing in later sends everything picked up
// while signed out. The store being down, or the network, just leaves them
// for the next try: the server keeps each gem once, so a resend is harmless.

import { GEM_WORLDS, type GemWorld } from '@/lib/solar-system/gem-layout';
import { markGemsSent, mergeGems, unsentGems, type GemStore } from '@/lib/solar-system/gem-progress';

export interface GemStandingView {
  points: number;
  gems: number;
  rank: number | null;
  players: number;
}

export interface GemSyncDeps {
  /** A stable id for the account (the game's `userId`): what has been sent is kept per account. */
  account: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  store?: GemStore | null;
}

const pulled = new Set<string>();

/** For tests: forget which accounts this session has read back. */
export function resetGemSyncForTests() { pulled.clear(); }

/** One pass: read back once per session, then report what is new. The standing from the last answer, or null. */
export async function syncGems(deps: GemSyncDeps): Promise<GemStandingView | null> {
  const f = deps.fetch ?? fetch;
  const store = deps.store;
  let token: string | null = null;
  try { token = await deps.getToken(); } catch { token = null; }
  if (!token) return null;
  const auth = { Authorization: `Bearer ${token}` };
  let standing: GemStandingView | null = null;
  if (!pulled.has(deps.account)) {
    try {
      const res = await f('/api/games/explore/gems', { headers: auth });
      if (res.ok) {
        const body = await res.json() as { worlds?: Record<string, string[]> } & GemStandingView;
        const worlds = body.worlds ?? {};
        if (store === undefined) mergeGems(worlds); else mergeGems(worlds, store);
        for (const w of GEM_WORLDS) {
          const ids = worlds[w];
          if (Array.isArray(ids) && ids.length) {
            if (store === undefined) markGemsSent(deps.account, w, ids); else markGemsSent(deps.account, w, ids, store);
          }
        }
        standing = { points: body.points, gems: body.gems, rank: body.rank, players: body.players };
        pulled.add(deps.account);
      }
    } catch { /* offline: report anyway, read back next time */ }
  }
  const batches = store === undefined ? unsentGems(deps.account) : unsentGems(deps.account, store);
  for (const b of batches) {
    try {
      const res = await f('/api/games/explore/gems', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: b.world, gemIds: b.gemIds }),
      });
      if (res.status === 400) {
        // Ids the server does not know (a layout that has moved on): stop sending those, keep the rest.
        const body = await res.json().catch(() => ({})) as { unknown?: string[] };
        const bad = Array.isArray(body.unknown) ? body.unknown : b.gemIds;
        mark(deps, b.world, bad);
        continue;
      }
      if (!res.ok) break;
      const body = await res.json() as { accepted?: string[] } & GemStandingView;
      mark(deps, b.world, Array.isArray(body.accepted) ? body.accepted : b.gemIds);
      standing = { points: body.points, gems: body.gems, rank: body.rank, players: body.players };
    } catch {
      break;
    }
  }
  return standing;
}

function mark(deps: GemSyncDeps, world: GemWorld, ids: string[]) {
  if (deps.store === undefined) markGemsSent(deps.account, world, ids); else markGemsSent(deps.account, world, ids, deps.store);
}
