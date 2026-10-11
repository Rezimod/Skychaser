/**
 * Refunds owed: lists them, and records one as paid back.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-refunds.ts
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-refunds.ts --refunded <orderId> <refundSignature>
 *
 * The list shows each refund_due order with what it was for, the quote, the
 * wallet that bought it and the transfer on record. The amount to send back
 * is what the chain shows that wallet paid; check the signature on an
 * explorer before sending. --refunded moves one order refund_due → refunded
 * and keeps the refund's own signature (needs the refund_signature column
 * from scripts/skychaser-constraints.sql).
 */

import { neon } from '@neondatabase/serverless'
import { requireSkychaserDatabase } from './skychaser-guard'

const BASE58_SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function main() {
  requireSkychaserDatabase()
  const q = neon(process.env.DATABASE_URL!)
  const i = process.argv.indexOf('--refunded')

  if (i >= 0) {
    const [orderId, refundSignature] = process.argv.slice(i + 1, i + 3)
    if (!UUID.test(orderId ?? '')) throw new Error('--refunded needs the order id')
    if (!BASE58_SIG.test(refundSignature ?? '')) throw new Error('--refunded needs the refund transaction signature')
    const rows = await q`
      UPDATE orders SET status = 'refunded', refund_signature = ${refundSignature}
      WHERE id = ${orderId}::uuid AND status = 'refund_due'
      RETURNING id`
    console.log(rows.length ? `order ${orderId} marked refunded (${refundSignature})` : `order ${orderId} is not refund_due; nothing changed`)
    return
  }

  const rows = await q`
    SELECT id, product_name, wallet_address, amount_sol, amount_fiat, signature, paid_at, expires_at, created_at
    FROM orders
    WHERE status = 'refund_due' AND (product_id = 'stellar-capsule' OR product_id LIKE 'stellar-card:%')
    ORDER BY created_at`
  if (!rows.length) {
    console.log('No refunds owed.')
    return
  }
  console.log(`${rows.length} refund(s) owed:\n`)
  for (const r of rows) {
    console.log(`order    ${r.id}  (${r.product_name})`)
    console.log(`quote    ${r.amount_sol} SOL  ($${r.amount_fiat})`)
    console.log(`buyer    ${r.wallet_address}`)
    console.log(`transfer ${r.signature ?? 'none on record — see the Telegram alert for the signatures'}`)
    console.log(`paid     ${r.paid_at ?? '?'}  window closed ${r.expires_at ?? '?'}\n`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
