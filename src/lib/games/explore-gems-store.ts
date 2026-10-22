/**
 * Explore gems on the platform: the store behind /api/games/explore/gems.
 *
 * The table creates itself (CREATE TABLE / INDEX IF NOT EXISTS, once per
 * server instance, the way ensureOrdersBurnColumns heals `orders`), so a
 * deploy needs no manual migration. Every call reports a store that cannot
 * answer (no DATABASE_URL, Neon down, the DDL refused) as null rather than
 * throwing: the game keeps the pickups on the device and reports them later,
 * and the leaderboard reads as empty.
 *
 * Players are never identified to other players by their account id: a row
 * on the board carries the name from `users` when there is one, and
 * otherwise a short tag hashed from the id.
 */

import { createHash } from 'node:crypto'
import { desc, asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { exploreGems, users } from '@/lib/schema'

let ensured = false
let ensuring: Promise<boolean> | null = null
/** After a failed attempt, wait this long before trying the DDL again, ms. */
const RETRY_MS = 60_000
let failedAt = 0

/** For tests: forget that the table was made. */
export function resetGemsTableForTests() {
  ensured = false
  ensuring = null
  failedAt = 0
}

export async function ensureExploreGemsTable(): Promise<boolean> {
  if (ensured) return true
  const db = getDb()
  if (!db) return false
  if (failedAt && Date.now() - failedAt < RETRY_MS) return false
  if (ensuring) return ensuring
  ensuring = (async () => {
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS explore_gems (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        privy_id text NOT NULL,
        world text NOT NULL,
        gem_id text NOT NULL,
        points integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS explore_gems_owner_gem_unique ON explore_gems (privy_id, world, gem_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS explore_gems_owner_idx ON explore_gems (privy_id)`)
      ensured = true
      failedAt = 0
      return true
    } catch (err) {
      console.error('[explore/gems] could not ensure the table', err)
      failedAt = Date.now()
      return false
    } finally {
      ensuring = null
    }
  })()
  return ensuring
}

/** A short, stable, non-reversible tag for a player with no name. */
export function anonTag(privyId: string): string {
  return createHash('sha256').update(`explore-gems:${privyId}`).digest('hex').slice(0, 6)
}

export interface GemStanding {
  points: number
  gems: number
  /** 1 is the leader; players with the same score share a rank. Null with no gems. */
  rank: number | null
  /** How many players have any gems. */
  players: number
}

export interface BoardEntry {
  rank: number
  name: string | null
  tag: string
  points: number
  gems: number
  me: boolean
}

/** What GET /api/games/explore/gems/leaderboard answers. */
export interface GemLeaderboard {
  /** False when the store could not answer: the board is empty, not lost. */
  available: boolean
  players: number
  entries: BoardEntry[]
  /** The caller, when a valid token came with the request. */
  me: GemStanding | null
}

/** Keep these pickups for the account, each once. Returns how many were new, or null when the store is down. */
export async function storeGems(privyId: string, world: string, gems: { id: string; points: number }[]): Promise<number | null> {
  if (!gems.length) return 0
  if (!(await ensureExploreGemsTable())) return null
  const db = getDb()
  if (!db) return null
  try {
    const rows = await db.insert(exploreGems)
      .values(gems.map((g) => ({ privyId, world, gemId: g.id, points: g.points })))
      .onConflictDoNothing()
      .returning({ gemId: exploreGems.gemId })
    return rows.length
  } catch (err) {
    console.error('[explore/gems] store failed', err)
    return null
  }
}

/** Where an account stands: its score, its gem count, its rank among everyone. */
export async function gemStanding(privyId: string): Promise<GemStanding | null> {
  if (!(await ensureExploreGemsTable())) return null
  const db = getDb()
  if (!db) return null
  try {
    const [mine] = await db
      .select({ points: sql<number>`coalesce(sum(${exploreGems.points}), 0)::int`, gems: sql<number>`count(*)::int` })
      .from(exploreGems)
      .where(eq(exploreGems.privyId, privyId))
    const points = Number(mine?.points ?? 0)
    const gems = Number(mine?.gems ?? 0)
    const better = db
      .select({ who: exploreGems.privyId })
      .from(exploreGems)
      .groupBy(exploreGems.privyId)
      .having(sql`sum(${exploreGems.points}) > ${points}`)
      .as('better')
    const [ahead] = await db.select({ n: sql<number>`count(*)::int` }).from(better)
    const [all] = await db.select({ n: sql<number>`count(distinct ${exploreGems.privyId})::int` }).from(exploreGems)
    return { points, gems, rank: gems > 0 ? Number(ahead?.n ?? 0) + 1 : null, players: Number(all?.n ?? 0) }
  } catch (err) {
    console.error('[explore/gems] standing failed', err)
    return null
  }
}

/** The ids this account has stored, per world: a new device takes them back. */
export async function gemsOf(privyId: string): Promise<Record<string, string[]> | null> {
  if (!(await ensureExploreGemsTable())) return null
  const db = getDb()
  if (!db) return null
  try {
    const rows = await db.select({ world: exploreGems.world, gemId: exploreGems.gemId }).from(exploreGems).where(eq(exploreGems.privyId, privyId))
    const out: Record<string, string[]> = {}
    for (const r of rows) (out[r.world] ??= []).push(r.gemId)
    return out
  } catch (err) {
    console.error('[explore/gems] list failed', err)
    return null
  }
}

/** The top of the board: best score first, and on a tie whoever got there first. */
export async function gemLeaderboard(limit: number, me: string | null): Promise<{ entries: BoardEntry[]; players: number } | null> {
  if (!(await ensureExploreGemsTable())) return null
  const db = getDb()
  if (!db) return null
  try {
    const total = sql<number>`sum(${exploreGems.points})::int`
    const rows = await db
      .select({ who: exploreGems.privyId, points: total, gems: sql<number>`count(*)::int`, last: sql<Date>`max(${exploreGems.createdAt})` })
      .from(exploreGems)
      .groupBy(exploreGems.privyId)
      .orderBy(desc(total), asc(sql`max(${exploreGems.createdAt})`))
      .limit(limit)
    const ids = rows.map((r) => r.who)
    const names = new Map<string, string>()
    if (ids.length) {
      try {
        const found = await db.select({ privyId: users.privyId, username: users.username }).from(users)
          .where(inArray(users.privyId, ids))
        for (const u of found) {
          const name = typeof u.username === 'string' ? u.username.trim().slice(0, 24) : ''
          if (name) names.set(u.privyId, name)
        }
      } catch (err) {
        // No names is still a board.
        console.error('[explore/gems] names failed', err)
      }
    }
    const [all] = await db.select({ n: sql<number>`count(distinct ${exploreGems.privyId})::int` }).from(exploreGems)
    let rank = 0
    let prev: number | null = null
    const entries = rows.map((r, i) => {
      const points = Number(r.points)
      if (prev === null || points < prev) rank = i + 1
      prev = points
      return { rank, name: names.get(r.who) ?? null, tag: anonTag(r.who), points, gems: Number(r.gems), me: me !== null && r.who === me }
    })
    return { entries, players: Number(all?.n ?? 0) }
  } catch (err) {
    console.error('[explore/gems] board failed', err)
    return null
  }
}
