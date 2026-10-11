/**
 * Clears the shelf and lists it again at the current tier odds.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-reshelve.ts          # dry run
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-reshelve.ts --apply
 *
 * Every capsule still 'listed' (never bought) is voided with its reason in the
 * public log, its secret revealed; bought or opened capsules are left alone.
 * Then SHELF is listed, each tier at its price and odds from tiers.ts.
 */

import { sql } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { SET_001 } from '../src/lib/sets/set-001'
import { listCapsules, voidCapsule } from '../src/lib/skychaser/capsule'
import { tierByKey } from '../src/lib/skychaser/tiers'
import { requireSkychaserDatabase } from './skychaser-guard'

const SHELF = { chondrite: 40, iron: 25, pallasite: 10, lunar: 5 } as const
const REASON = 'Withdrawn unsold: the shelf was relisted at rebalanced tier odds before any stranger bought.'

async function main() {
  requireSkychaserDatabase()
  if (!process.env.CAPSULE_SEAL_KEY) throw new Error('CAPSULE_SEAL_KEY is not set: a capsule listed now could never be opened')
  const apply = process.argv.includes('--apply')

  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  const { rows: sets } = (await db.execute(sql`SELECT id FROM card_set WHERE code = ${SET_001.code}`)) as { rows: Array<{ id: string }> }
  const setId = sets[0]?.id
  if (!setId) throw new Error(`${SET_001.code} is not in this database`)

  const { rows: listed } = (await db.execute(sql`
    SELECT id, sequence, tier FROM capsule WHERE set_id = ${setId}::uuid AND state = 'listed' ORDER BY sequence
  `)) as { rows: Array<{ id: string; sequence: number; tier: string | null }> }
  const { rows: other } = (await db.execute(sql`
    SELECT state, count(*)::int AS n FROM capsule WHERE set_id = ${setId}::uuid AND state <> 'listed' GROUP BY state
  `)) as { rows: Array<{ state: string; n: number }> }

  console.log(`${listed.length} unsold capsules to withdraw: ${listed.map((c) => `${String(c.sequence).padStart(3, '0')}(${c.tier ?? 'old'})`).join(' ')}`)
  console.log(`left alone: ${other.map((o) => `${o.n} ${o.state}`).join(', ') || 'none'}`)
  console.log(`then list: ${Object.entries(SHELF).map(([t, n]) => `${n} ${t}`).join(', ')}`)
  if (!apply) {
    console.log('Dry run. Pass --apply to do it.')
    return
  }

  for (const c of listed) {
    const r = await voidCapsule(db, { capsuleId: c.id, reason: REASON })
    if (!r.ok) console.log(`  ${c.sequence}: not voided (${r.reason})`)
  }
  for (const [key, count] of Object.entries(SHELF)) {
    const done = await listCapsules(db, { setId, count, tier: tierByKey(key) })
    console.log(`${done.length} ${key} listed: ${done[0]?.sequence}–${done.at(-1)?.sequence}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
