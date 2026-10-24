/**
 * Refunds owed: lists them, and records one as paid back.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-refunds.ts
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-refunds.ts --refunded <orderId> <refundSignature>
 *
 * The list shows each refund_due order with what it was for, the quote, the
 * account's wallet and the transfer on record — and, read from the chain, the
 * wallets that actually paid and everything the merchant received under the
 * order's reference, per payer. Refund to those payers, not to the account's
 * wallet: an order can be paid from Phantom or any other wallet. Extra
 * transfers on orders that stay paid are only named in Telegram alerts. --refunded moves one order refund_due → refunded
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
    SELECT id, product_name, wallet_address, amount_sol, amount_fiat, signature, payment_reference, paid_at, expires_at, created_at
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
    const owed = merchant && r.payment_reference ? await allTransfers(connection, new PublicKey(r.payment_reference), merchant).catch(() => null) : null
    if (!owed) {
      console.log('refund   could not read the transfers from the chain: check the reference on an explorer')
    } else if (!owed.length) {
      console.log('refund   no transfer to the merchant carries this order\'s reference')
    } else {
      // Everything the order's reference brought in is owed back, to whoever sent it.
      for (const t of owed) console.log(`refund   ${(t.lamports / LAMPORTS_PER_SOL).toFixed(9)} SOL to ${t.payer}  (${t.signatures.join(', ')})`)
    }
    console.log('')
  }
}

/**
 * Every successful finalized transfer that carried the reference and paid the
 * merchant, added up per payer (the fee payer, who signed it). A short payment
 * and its top-up, or a second payment, are all owed back, not only the last.
 */
async function allTransfers(connection: Connection, reference: PublicKey, merchant: PublicKey) {
  const byPayer = new Map<string, { payer: string; lamports: number; signatures: string[] }>()
  let before: string | undefined
  for (let page = 0; page < 10; page++) {
    const sigs = await connection.getSignaturesForAddress(reference, { limit: 1000, ...(before ? { before } : {}) }, 'finalized')
    for (const s of sigs) {
      if (s.err) continue
      const tx = await connection.getTransaction(s.signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 })
      if (!tx?.meta || tx.meta.err) continue
      const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses }).keySegments().flat()
      const i = keys.findIndex((k) => k.equals(merchant))
      const lamports = i < 0 ? 0 : tx.meta.postBalances[i] - tx.meta.preBalances[i]
      if (lamports <= 0) continue
      const payer = keys[0].toBase58()
      const row = byPayer.get(payer) ?? { payer, lamports: 0, signatures: [] }
      row.lamports += lamports
      row.signatures.push(s.signature)
      byPayer.set(payer, row)
    }
    if (sigs.length < 1000) break
    before = sigs[sigs.length - 1].signature
  }
  return [...byPayer.values()]
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
