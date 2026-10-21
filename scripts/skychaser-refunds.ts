/**
 * Refunds owed: lists them, and records one as paid back.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-refunds.ts
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-refunds.ts --refunded <orderId> <refundSignature>
 *
 * The list shows each refund_due order with what it was for, the quote, the
 * account's wallet and the transfer on record — and, read from the chain, the
 * wallet that actually paid and what the merchant received. Refund to that
 * payer, not to the account's wallet: an order can be paid from Phantom or
 * any other wallet. Transfers only named in a Telegram alert are not here. --refunded moves one order refund_due → refunded
 * and keeps the refund's own signature (needs the refund_signature column
 * from scripts/skychaser-constraints.sql).
 */

import { neon } from '@neondatabase/serverless'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
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
    WHERE status = 'refund_due'
      AND (product_id = 'stellar-capsule' OR product_id LIKE 'stellar-card:%' OR product_id LIKE 'skychaser-credits:%')
    ORDER BY created_at`
  if (!rows.length) {
    console.log('No refunds owed.')
    return
  }
  console.log(`${rows.length} refund(s) owed:\n`)
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  const connection = new Connection(rpc, 'finalized')
  const merchant = process.env.NEXT_PUBLIC_MERCHANT_WALLET ? new PublicKey(process.env.NEXT_PUBLIC_MERCHANT_WALLET) : null
  for (const r of rows) {
    console.log(`order    ${r.id}  (${r.product_name})`)
    console.log(`quote    ${r.amount_sol} SOL  ($${r.amount_fiat})`)
    console.log(`buyer    ${r.wallet_address}`)
    console.log(`transfer ${r.signature ?? 'none on record — see the Telegram alert for the signatures'}`)
    console.log(`paid     ${r.paid_at ?? '?'}  window closed ${r.expires_at ?? '?'}`)
    if (r.signature && BASE58_SIG.test(r.signature)) {
      const onChain = await paidBy(connection, r.signature, merchant).catch(() => null)
      console.log(onChain ? `refund   ${onChain.sol} SOL to ${onChain.payer}` : 'refund   could not read the transfer from the chain: check it on an explorer')
    }
    console.log('')
  }
}

/** Who signed and paid the fee for the transfer, and what the merchant received in it. */
async function paidBy(connection: Connection, signature: string, merchant: PublicKey | null) {
  const tx = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 })
  if (!tx?.meta) return null
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses }).keySegments().flat()
  const i = merchant ? keys.findIndex((k) => k.equals(merchant)) : -1
  const lamports = i < 0 ? null : tx.meta.postBalances[i] - tx.meta.preBalances[i]
  return { payer: keys[0].toBase58(), sol: lamports === null ? '? (merchant not in transfer)' : (lamports / LAMPORTS_PER_SOL).toFixed(9) }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
