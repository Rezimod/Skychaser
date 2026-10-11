/**
 * Files First Light and its cards in the card database.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npm run skychaser:seed
 *
 * Idempotent. Refuses to run unless DATABASE_URL is the stellar-cards Neon branch —
 * see skychaser-guard.ts.
 */

import { getDb } from '../src/lib/db'
import { SET_001, SET_001_CARDS } from '../src/lib/sets/set-001'
import { seedSet } from '../src/lib/skychaser/seed'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  requireSkychaserDatabase()
  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  const { cards, removed, kept } = await seedSet(db, SET_001, SET_001_CARDS)
  console.log(`${SET_001.code}: ${cards.length} cards filed`)
  for (const c of cards) {
    console.log(`  ${c.designation.padEnd(20)} ${c.rarity.padEnd(10)} ${c.observationStatus.padEnd(14)} ${c.editionSize}`)
  }
  if (removed.length) console.log(`Removed, no editions existed: ${removed.join(', ')}`)
  if (kept.length) console.log(`Retired, kept for their holders and closed at the editions they have: ${kept.join(', ')}`)
}

main().catch((error) => {
  console.error('Seeding First Light failed:', error)
  process.exit(1)
})
