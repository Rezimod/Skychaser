/**
 * Files the named cards of First Light in the card database, and only those,
 * and brings the set's card count up to date. For cards added after the set
 * was seeded: unlike skychaser:seed it removes and closes nothing, so a card
 * the code no longer lists (DOUBLE-CLUSTER) is left exactly as it is.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-file-cards.ts FORESEEN-70 BRESSER-VENUS ...
 *
 * Idempotent. Refuses to run unless DATABASE_URL is the skychaser Neon branch.
 */

import { eq } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { card, cardSet } from '../src/lib/schema'
import { SET_001, SET_001_CARD_BY_DESIGNATION, SET_001_CARDS } from '../src/lib/sets/set-001'
import { upsertCard } from '../src/lib/skychaser/repo'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  const names = process.argv.slice(2)
  if (!names.length) throw new Error('name the cards to file')
  const unknown = names.filter((d) => !SET_001_CARD_BY_DESIGNATION.has(d))
  if (unknown.length) throw new Error(`not in First Light: ${unknown.join(', ')}`)

  requireSkychaserDatabase()
  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  const [set] = await db.select({ id: cardSet.id }).from(cardSet).where(eq(cardSet.code, SET_001.code))
  if (!set) throw new Error(`${SET_001.code} is not filed yet: run skychaser:seed first`)

  for (const d of names) {
    const row = await upsertCard(db, { ...SET_001_CARD_BY_DESIGNATION.get(d)!.seed, setId: set.id })
    console.log(`  ${row.designation.padEnd(20)} ${row.rarity.padEnd(10)} ${row.editionSize}`)
  }
  await db.update(cardSet).set({ cardCount: SET_001_CARDS.length }).where(eq(cardSet.id, set.id))
  const rows = await db.select({ id: card.id }).from(card).where(eq(card.setId, set.id))
  console.log(`${SET_001.code}: ${names.length} filed; ${rows.length} card rows; card_count ${SET_001_CARDS.length}`)
}

main().catch((error) => {
  console.error('Filing cards failed:', error)
  process.exit(1)
})
