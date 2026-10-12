/**
 * Capsules, end to end, on the card database.
 *
 *   Three demo capsules listed (each committed before sale) → two bought with
 *   test nonces → both opened → both verified from the public log → the third
 *   voided unsold, its secret revealed → any demo capsule an earlier run left
 *   on the list withdrawn → the log and the audit of all of it printed.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npm run skychaser:capsules
 *
 * DEMO ONLY: payment is skipped. The two orders are marked paid directly,
 * with the signature 'demo-no-payment', instead of going through Solana Pay.
 * Nothing in src does this; only this script. Every capsule it lists is marked
 * demo — in the capsule row, so it is never offered for sale, and in its
 * 'listed' log entry, so the audit labels it wherever the log is copied.
 * Refuses to run unless DATABASE_URL is the skychaser Neon branch — see
 * skychaser-guard.ts.
 */

import { randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { cardSet } from '../src/lib/schema'
import { SET_001 } from '../src/lib/sets/set-001'
import { auditLog, type OpenedOutcome } from '../src/lib/skychaser/audit'
import { listCapsules, openCapsule, purchaseCapsule, readFullLog, voidCapsule } from '../src/lib/skychaser/capsule'
import { markPaid } from '../src/lib/skychaser/orders'
import { verifyCapsule } from '../src/lib/skychaser/randomness'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  requireSkychaserDatabase()
  const temporaryKey = !process.env.CAPSULE_SEAL_KEY
  if (temporaryKey) {
    process.env.CAPSULE_SEAL_KEY = randomBytes(32).toString('hex')
    console.log('CAPSULE_SEAL_KEY is not set: using a key for this run only.\n')
  }
  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  const [set] = await db.select({ id: cardSet.id }).from(cardSet).where(eq(cardSet.code, SET_001.code))
  if (!set) throw new Error(`${SET_001.code} is not filed — run npm run skychaser:seed first`)

  console.log('1. Listing three demo capsules. Each commitment is logged before any purchase exists.')
  const listed = await listCapsules(db, { setId: set.id, count: 3, demo: true })
  for (const c of listed) console.log(`   capsule ${c.sequence}  ${c.id}  commitment ${c.commitment}`)

  console.log('\n2. Buying two, with test nonces. [DEMO ONLY: Solana Pay skipped, orders marked paid directly]')
  for (const [i, c] of listed.slice(0, 2).entries()) {
    const nonce = randomBytes(32).toString('hex')
    const bought = await purchaseCapsule(db, {
      capsuleId: c.id,
      commitment: c.commitment,
      wallet: `stellar-test-holder-000${i + 1}`,
      nonce,
      signature: null,
      privyId: 'stellar-demo',
      amountSol: 0,
      paymentReference: `demo-${c.id}`,
    })
    if (!bought.ok) throw new Error(`purchase of capsule ${c.sequence} refused: ${bought.reason}`)
    await markPaid(db, bought.orderId, 'demo-no-payment')
    console.log(`   capsule ${c.sequence}  nonce ${nonce}  purchase hash ${bought.purchaseHash}`)
  }

  console.log('\n3. Opening them.')
  for (const c of listed.slice(0, 2)) {
    const opened = await openCapsule(db, c.id)
    if (!opened.ok) throw new Error(`capsule ${c.sequence} did not open: ${opened.reason}`)
    console.log(`   capsule ${c.sequence}  secret ${opened.secret}`)
    for (const p of opened.pulls) {
      console.log(`     draw ${p.drawIndex}  ${p.designation.padEnd(18)} ${p.rarity.padEnd(10)} edition ${p.editionNumber} of ${p.editionSize}`)
    }
  }

  const unsold = listed[2]
  const voided = await voidCapsule(db, { capsuleId: unsold.id, reason: 'demo run ended unsold' })
  console.log(`\n   capsule ${unsold.sequence} ${voided.ok ? 'voided unsold, its secret revealed' : `not voided: ${voided.reason}`}`)

  // A demo capsule an earlier run left listed holds editions back from sale.
  // One whose seal key is gone is withdrawn without its secret: nobody bought
  // it, so no nonce and no outcome ever existed.
  const { rows: stale } = (await db.execute(sql`
    SELECT id, sequence FROM capsule WHERE demo AND state = 'listed' ORDER BY sequence
  `)) as unknown as { rows: Array<{ id: string; sequence: number | string }> }
  for (const c of stale) {
    const r = await voidCapsule(db, { capsuleId: c.id, reason: 'demo capsule left listed by an earlier run; its seal key was temporary and is gone' })
    console.log(`   capsule ${c.sequence} (earlier run) ${r.ok ? 'withdrawn unsold' : `not withdrawn: ${r.reason}`}`)
  }

  const log = await readFullLog(db)
  console.log('\n4. Verifying each from the public log alone.')
  for (const c of listed.slice(0, 2)) {
    const entry = (event: string) => log.find((r) => r.capsuleId === c.id && r.event === event)
    const opened = entry('opened')
    if (!opened) throw new Error(`no 'opened' entry for capsule ${c.sequence}`)
    const o = opened.outcome as OpenedOutcome
    const result = verifyCapsule({
      commitment: entry('listed')?.commitment ?? '',
      secret: o.secret,
      nonce: entry('purchased')?.buyerNonce ?? '',
      capsuleId: c.id,
      pulls: o.pulls,
      supply: o.supply,
      draws: o.draws,
      oddsBps: o.oddsBps,
    })
    console.log(`   capsule ${c.sequence}: ${result.ok ? 'verified' : `FAILED — ${result.problems.join('; ')}`}`)
  }

  console.log('\n5. The log for these three capsules.')
  const ours = new Set(listed.map((c) => c.id))
  for (const r of log.filter((x) => x.capsuleId && ours.has(x.capsuleId))) {
    const detail = r.event === 'opened'
      ? (r.outcome as OpenedOutcome).pulls.map((p) => `${p.designation}#${p.editionNumber}`).join(', ')
      : r.buyerNonce ? `nonce ${r.buyerNonce.slice(0, 16)}…` : ''
    console.log(`   #${String(r.seq).padEnd(4)} capsule ${String(r.capsuleSequence).padEnd(4)} ${r.event.padEnd(10)} ${(r.commitment ?? '').slice(0, 16)}…  ${detail}`)
  }

  const audit = auditLog(log)
  const label = (f: { capsuleSequence?: number; demo?: boolean }) => `capsule ${f.capsuleSequence ?? '-'}${f.demo ? ' [demo]' : ''}`
  console.log('\n6. Audit of the whole log.')
  console.log(`   listed ${audit.listed}, purchased ${audit.purchased}, opened ${audit.opened}, voided ${audit.voided}, released ${audit.released}, refunds due ${audit.refundsDue}, cards sold ${audit.cardsSold}, verified ${audit.verified}`)
  console.log(`   demo capsules: ${audit.demoCapsules.join(', ') || 'none'}`)
  console.log(audit.flags.length === 0 ? '   flags: none' : '   flags:')
  for (const f of audit.flags) console.log(`     ${f.kind}  ${label(f)}  ${f.detail}`)
  console.log(audit.notes.length === 0 ? '   notes: none' : '   notes (in the log, and explained by it):')
  for (const n of audit.notes) console.log(`     ${n.kind}  ${label(n)}  ${n.detail}`)
}

main().catch((error) => {
  console.error('The capsule demo failed:', error)
  process.exit(1)
})
