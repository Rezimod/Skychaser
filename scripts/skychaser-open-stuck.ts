/**
 * Opens capsules left in 'purchased' whose order is paid: the buy went through
 * but the automatic opening never ran. The cards go to the buyer's wallet, as
 * the opening would have given them.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-open-stuck.ts          # dry run
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-open-stuck.ts --apply
 */

import { sql } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { openCapsule } from '../src/lib/skychaser/capsule'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  requireSkychaserDatabase()
  if (!process.env.CAPSULE_SEAL_KEY) throw new Error('CAPSULE_SEAL_KEY is not set: a sealed capsule cannot be opened')
  const apply = process.argv.includes('--apply')

  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  const { rows } = (await db.execute(sql`
    SELECT c.id, c.sequence, c.cards_per_capsule, c.buyer_wallet, o.status AS order_status
    FROM capsule c LEFT JOIN orders o ON o.id = c.order_id
    WHERE c.state = 'purchased' ORDER BY c.sequence
  `)) as { rows: Array<{ id: string; sequence: number; cards_per_capsule: number; buyer_wallet: string | null; order_status: string | null }> }

  for (const c of rows) {
    console.log(`${String(c.sequence).padStart(3, '0')}: ${c.cards_per_capsule} cards, order ${c.order_status ?? 'none'}, buyer ${c.buyer_wallet ?? 'none'}`)
  }
  const stuck = rows.filter((c) => c.order_status === 'paid')
  if (!apply) {
    console.log(`${stuck.length} paid and unopened. Dry run. Pass --apply to open them.`)
    return
  }

  for (const c of stuck) {
    const r = await openCapsule(db, c.id)
    console.log(`${String(c.sequence).padStart(3, '0')}: ${r.ok ? r.pulls.map((p) => `${p.designation} #${p.editionNumber}`).join(', ') : `not opened (${r.reason})`}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
