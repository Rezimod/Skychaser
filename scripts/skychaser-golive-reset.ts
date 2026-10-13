/**
 * Clears every rehearsal sale before real payments open, and lists a fresh shelf.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-golive-reset.ts          # dry run
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-golive-reset.ts --apply
 *
 * Writes a JSON backup of everything it removes to ~/Desktop/Skychaser/backups
 * first. Then, in one transaction: capsule, capsule_pull, edition and
 * capsule_log are truncated (the log's truncate guard is lifted and restored
 * inside it), Skychaser orders are deleted, and votes for tonight onward are
 * dropped. Past nights and their decisions are kept. Then SHELF is listed at
 * the tier prices and odds in tiers.ts.
 *
 * Refuses once any Skychaser order carries an on-chain signature: after a
 * stranger has paid, the log is never reset.
 *
 * Before anything, it checks that this machine's CAPSULE_SEAL_KEY opens a
 * capsule the database already holds (unseals it and recomputes its
 * commitment): the new shelf is sealed with this key, and production must be
 * able to open it.
 *
 * Order of go-live: pause (scripts/skychaser-pause.ts on), run this with
 * --apply, then unpause.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { SET_001 } from '../src/lib/sets/set-001'
import { listCapsules, unsealSecret } from '../src/lib/skychaser/capsule'
import { commitmentOf } from '../src/lib/skychaser/randomness'
import { tierByKey } from '../src/lib/skychaser/tiers'
import { requireSkychaserDatabase } from './skychaser-guard'

const SHELF = { chondrite: 40, iron: 25, pallasite: 10, lunar: 5 } as const

async function main() {
  requireSkychaserDatabase()
  if (!process.env.CAPSULE_SEAL_KEY) throw new Error('CAPSULE_SEAL_KEY is not set: a capsule listed now could never be opened')
  const apply = process.argv.includes('--apply')

  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')
  const q = neon(process.env.DATABASE_URL!)

  const { rows: sets } = (await db.execute(sql`SELECT id FROM card_set WHERE code = ${SET_001.code}`)) as { rows: Array<{ id: string }> }
  const setId = sets[0]?.id
  if (!setId) throw new Error(`${SET_001.code} is not in this database`)

  const backup = {
    capsule: await q`SELECT * FROM capsule ORDER BY sequence`,
    capsule_pull: await q`SELECT * FROM capsule_pull`,
    edition: await q`SELECT * FROM edition`,
    capsule_log: await q`SELECT * FROM capsule_log ORDER BY seq`,
    orders: await q`SELECT * FROM orders WHERE dealer_id = 'stellar'`,
    card_vote: await q`SELECT * FROM card_vote WHERE night_date >= current_date`,
  }

  // Any real signature, whatever the order's status (a refund_due is real money owed), means the shop has traded.
  const onChain = backup.orders.filter((o) => o.signature && !String(o.signature).startsWith('simulated-no-payment:'))

  // The new shelf is sealed with this machine's key; production opens it with its own. They must be the same key.
  const sample = backup.capsule.find((c) => c.server_secret_sealed)
  let sealCheck: string
  if (!sample) sealCheck = 'no capsule to check the seal key against'
  else {
    try {
      sealCheck = commitmentOf(unsealSecret(String(sample.server_secret_sealed), String(sample.id))) === sample.commitment
        ? 'ok'
        : 'the unsealed secret does not match its commitment'
    } catch {
      sealCheck = 'this CAPSULE_SEAL_KEY cannot open the capsules already in the database'
    }
  }
  const states = backup.capsule.reduce<Record<string, number>>((m, c) => ({ ...m, [c.state]: (m[c.state] ?? 0) + 1 }), {})

  console.log(`capsules: ${Object.entries(states).map(([s, n]) => `${n} ${s}`).join(', ') || 'none'}`)
  console.log(`editions: ${backup.edition.length}, pulls: ${backup.capsule_pull.length}, log entries: ${backup.capsule_log.length}`)
  console.log(`Skychaser orders: ${backup.orders.length} (${onChain.length} with an on-chain signature)`)
  for (const o of onChain) console.log(`  on-chain: order ${o.id} ${o.amount_sol} SOL ${o.signature}`)
  console.log(`votes for tonight onward: ${backup.card_vote.length}`)
  console.log(`then list: ${Object.entries(SHELF).map(([t, n]) => `${n} ${t}`).join(', ')}`)
  console.log(`seal key: ${sealCheck}${sample ? ` (capsule ${sample.sequence})` : ''}`)
  if (!apply) {
    console.log('Dry run. Pass --apply to do it.')
    return
  }
  // Once anything was paid for real, this reset would erase what holders bought and what is owed back. No flag overrides it.
  if (onChain.length) {
    throw new Error('Orders with on-chain signatures exist. This reset is for rehearsal data only and refuses to erase real sales.')
  }
  if (sealCheck !== 'ok') throw new Error(`Seal key check failed: ${sealCheck}. Copy production's CAPSULE_SEAL_KEY into .env.local first.`)

  const dir = join(homedir(), 'Desktop', 'Stellar', 'backups')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `skychaser-before-golive-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(backup, null, 2))
  console.log(`backup: ${file}`)

  await q.transaction([
    q`ALTER TABLE capsule_log DISABLE TRIGGER capsule_log_no_truncate`,
    q`TRUNCATE capsule_pull, edition, capsule, capsule_log RESTART IDENTITY`,
    q`ALTER TABLE capsule_log ENABLE TRIGGER capsule_log_no_truncate`,
    q`DELETE FROM orders WHERE dealer_id = 'stellar'`,
    q`DELETE FROM card_vote WHERE night_date >= current_date`,
  ])
  console.log('rehearsal sales cleared')

  for (const [key, count] of Object.entries(SHELF)) {
    const done = await listCapsules(db, { setId, count, tier: tierByKey(key) })
    console.log(`${done.length} ${key} listed: ${done[0]?.sequence}–${done.at(-1)?.sequence}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
