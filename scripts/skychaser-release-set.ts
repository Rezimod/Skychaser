/**
 * Puts a set on sale, and optionally lists the first capsules of it.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-release-set.ts [capsules] [tier]
 *
 * With a tier (chondrite, iron, pallasite, lunar) the capsules are listed as
 * that tier, at its price and odds; without one, at the set's old single price.
 *
 * Releasing is the one switch: until a set's status is 'released', neither a
 * capsule nor a single card can be bought. Idempotent — a set already released
 * is left alone, and no capsule is listed unless a count is given. Refuses to
 * run unless DATABASE_URL is the skychaser Neon branch (skychaser-guard.ts), and
 * listing needs CAPSULE_SEAL_KEY: without it a capsule can never be opened.
 */

import { sql } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { SET_001 } from '../src/lib/sets/set-001'
import { listCapsules } from '../src/lib/skychaser/capsule'
import { TIERS, tierByKey } from '../src/lib/skychaser/tiers'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  requireSkychaserDatabase()
  if (!process.env.CAPSULE_SEAL_KEY) throw new Error('CAPSULE_SEAL_KEY is not set: a capsule listed now could never be opened')

  const count = Number(process.argv[2] ?? 0)
  if (!Number.isInteger(count) || count < 0) throw new Error('the capsule count must be a whole number')
  const tier = process.argv[3] === undefined ? undefined : tierByKey(process.argv[3])
  if (process.argv[3] !== undefined && !tier) throw new Error(`the tier must be one of: ${TIERS.map((t) => t.key).join(', ')}`)

  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  const { rows } = (await db.execute(sql`
    UPDATE card_set SET status = 'released', released_at = COALESCE(released_at, now())
    WHERE code = ${SET_001.code}
    RETURNING id, status, released_at
  `)) as { rows: Array<{ id: string; status: string; released_at: string }> }
  const set = rows[0]
  if (!set) throw new Error(`${SET_001.code} is not in this database — seed it first`)
  console.log(`${SET_001.code} is ${set.status}, released ${new Date(set.released_at).toISOString()}`)

  if (count === 0) {
    console.log('No capsules listed. Pass a count to list some.')
    return
  }
  const listed = await listCapsules(db, { setId: set.id, count, tier })
  console.log(`${listed.length} capsules listed${tier ? ` as ${tier.name}, $${tier.priceUsd}` : ''}:`)
  for (const c of listed) console.log(`  ${String(c.sequence).padStart(3, '0')}  ${c.id}  ${c.commitment}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
