/**
 * Paying for Skychaser: capsules and single cards, on the existing orders table
 * and the existing Solana Pay rail. A card processor is out of scope for beta.
 *
 * An order is created pending with a fresh reference key and a quote that
 * stands for ORDER_WINDOW_MINUTES; it becomes paid only once a transaction
 * carrying that key is found that validateTransfer confirms paid the merchant
 * the order's amount, and its block time is inside the window. A
 * transfer that arrives later is recorded as refund_due, never dropped. The
 * pending → paid step is one conditional UPDATE, so a confirmation retried or
 * raced is paid once.
 */

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import { sendTelegram } from '@/lib/telegram';
import BigNumber from 'bignumber.js';
import { and, eq, inArray, like, lt, sql } from 'drizzle-orm';
import { card, edition, orders } from '@/lib/schema';
import { priceToSol } from '@/lib/dealers';
import { fetchSolPriceRates } from '@/lib/sol-price';
import { isSealed } from './almanac';
import type { Db } from './attach';
import { ORDER_WINDOW_MINUTES } from './economics';
import { simulatedPayments } from './rehearsal';

export { simulatedPayments };

export type OrderRow = typeof orders.$inferSelect;

export const CAPSULE_PRODUCT_ID = 'stellar-capsule';
export const CARD_PRODUCT_PREFIX = 'stellar-card:';

const REHEARSAL_PREFIX = 'simulated-no-payment:';

/** What a rehearsal records where a transaction signature would go. */
export function simulatedSignature(reference: string): string {
  return `${REHEARSAL_PREFIX}${reference}`;
}

/**
 * An order a rehearsal marked paid, read by a deployment that sells for real:
 * nothing was paid for it, so it opens and fulfils nothing here. Guards a
 * preview, a rolled-back build or a local server that shares the database.
 */
export function unpaidRehearsal(order: { signature: string | null }): boolean {
  return !simulatedPayments() && !!order.signature?.startsWith(REHEARSAL_PREFIX);
}

// An empty variable counts as unset: Vercel keeps a cleared value as "".
const PAYMENT_RPC = () => process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const networkOf = (s: string) => (/devnet/i.test(s) ? 'devnet' : /testnet/i.test(s) ? 'testnet' : /mainnet/i.test(s) ? 'mainnet-beta' : 'unknown');

/**
 * Why payments cannot be taken on this deployment's network, or null. A
 * rehearsal moves no money and passes. Otherwise the RPC that checks payments
 * must be on the cluster the wallets pay on, and production takes mainnet only:
 * a devnet RPC there would accept free test SOL for real cards.
 */
export function paymentNetworkProblem(): string | null {
  if (simulatedPayments()) return null;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta';
  const rpc = networkOf(PAYMENT_RPC());
  if (process.env.VERCEL_ENV === 'production' && (cluster !== 'mainnet-beta' || rpc !== 'mainnet-beta')) return 'production must take payments on mainnet';
  if (rpc !== 'unknown' && rpc !== cluster) return `SOLANA_RPC_URL is ${rpc} but the wallets pay on ${cluster}`;
  return null;
}

/** Route guard for every route that quotes or checks a payment. */
export function paymentNetworkMisconfig(): NextResponse | null {
  const problem = paymentNetworkProblem();
  if (!problem) return null;
  console.error('[skychaser/payments] refusing:', problem);
  return NextResponse.json({ error: 'Payments are not available right now' }, { status: 503 });
}

export function merchantWallet(): PublicKey | null {
  try {
    return process.env.NEXT_PUBLIC_MERCHANT_WALLET ? new PublicKey(process.env.NEXT_PUBLIC_MERCHANT_WALLET) : null;
  } catch {
    return null;
  }
}

/**
 * US dollars to SOL at the live rate, to the lamport-safe six places the orders
 * table already uses. Throws SolPriceUnavailableError rather than quote on a
 * fixed fallback rate, and refuses a quote that comes to nothing. A rehearsal
 * charges nothing, so its quote may rest on the fallback rate.
 */
export async function usdToSol(usd: number): Promise<number> {
  const { solPerGEL, solPrice } = await fetchSolPriceRates({ strict: !simulatedPayments() });
  const sol = +priceToSol(usd, 'USD', solPerGEL, solPrice).toFixed(6);
  if (!(sol > 0)) throw new Error('A Skychaser quote must be a positive amount of SOL');
  return sol;
}

export function orderExpiry(from = Date.now()): Date {
  return new Date(from + ORDER_WINDOW_MINUTES * 60_000);
}

export function newPaymentReference(): string {
  return Keypair.generate().publicKey.toBase58();
}

export function paymentUrl(input: { recipient: PublicKey; amountSol: number; reference: string; label: string; orderId: string }): string {
  return encodeURL({
    recipient: input.recipient,
    amount: new BigNumber(input.amountSol),
    reference: new PublicKey(input.reference),
    label: input.label,
    memo: input.orderId,
    message: `Skychaser · ${input.label}`,
  }).toString();
}

/** A pending order for one card, bought on its own. */
export async function createCardOrder(
  db: Db,
  input: { privyId: string; wallet: string; designation: string; name: string; priceUsd: number; amountSol: number; reference: string },
): Promise<OrderRow> {
  const [row] = await db
    .insert(orders)
    .values({
      privyId: input.privyId,
      walletAddress: input.wallet,
      productId: `${CARD_PRODUCT_PREFIX}${input.designation}`,
      productName: input.name,
      dealerId: 'stellar',
      paymentMethod: 'sol',
      amountSol: input.amountSol,
      amountStars: 0,
      amountFiat: input.priceUsd,
      currency: 'USD',
      paymentReference: input.reference,
      status: 'pending',
      shippingName: '',
      shippingPhone: '',
      shippingAddress: '',
      shippingCity: '',
      shippingCountry: '',
      expiresAt: orderExpiry(),
    })
    .returning();
  return row;
}

/** A transfer that reached the merchant: its signature and when it landed. */
export type Transfer = { signature: string; paidAt: Date };

/**
 * What the chain shows for an order. `paid: true` once the transfers carrying
 * its reference add up to the amount; `late` when the one that completed it
 * landed after the window closed. `paid: false` with no error means nothing
 * has arrived; with an error, the chain could not be asked and nothing may be
 * concluded. `partial` is SOL that arrived but falls short of the amount: it
 * is owed back if the order closes unpaid. `extra` are transfers after the
 * one that completed the order, owed back too.
 */
export type PaymentCheck =
  | { paid: true; signature: string; paidAt: Date; late: boolean; extra?: string[] }
  | { paid: false; error?: string; status?: number; partial?: Transfer };

/** At most this many transactions carrying a reference are read, so dust cannot slow a confirmation down. */
const MAX_SCANNED = 25;

const lamportsOf = (sol: number) => BigInt(new BigNumber(sol).shiftedBy(9).integerValue(BigNumber.ROUND_CEIL).toFixed(0));

/**
 * Lamports the recipient gained in one finalized transaction that carries the
 * reference, or null when it failed, is not final yet or does not carry it.
 * Read from balances rather than from the instruction list, so a wallet that
 * adds its own instruction after the transfer (Phantom's guard does) still pays.
 */
async function received(connection: Connection, signature: string, recipient: PublicKey, reference: PublicKey) {
  const tx = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  if (!tx?.meta || tx.meta.err) return null;
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses }).keySegments().flat();
  if (!keys.some((k) => k.equals(reference))) return null;
  const i = keys.findIndex((k) => k.equals(recipient));
  const lamports = i < 0 ? BigInt(0) : BigInt(tx.meta.postBalances[i] - tx.meta.preBalances[i]);
  return { lamports, blockTime: tx.blockTime ?? null };
}

/** Looks for the order's payment on chain. Does not write. */
export async function findPayment(order: OrderRow): Promise<PaymentCheck> {
  if (simulatedPayments()) {
    return { paid: true, signature: simulatedSignature(order.paymentReference), paidAt: new Date(), late: false };
  }
  const recipient = merchantWallet();
  if (!recipient) return { paid: false, error: 'Merchant wallet not configured', status: 503 };
  if (!(order.amountSol > 0)) return { paid: false, error: 'The order has no amount to pay', status: 400 };
  let reference: PublicKey;
  try {
    reference = new PublicKey(order.paymentReference);
  } catch {
    return { paid: false, error: 'Invalid reference', status: 400 };
  }

  if (paymentNetworkProblem()) return { paid: false, error: 'Payments are not available right now', status: 503 };
  const connection = new Connection(PAYMENT_RPC(), 'finalized');
  const due = lamportsOf(order.amountSol);

  // Every final transaction that carried the key, oldest first. A failed one
  // pays nothing and is passed over; a short one counts towards the amount, so
  // a buyer who tops up has paid once the two add up.
  let total = BigInt(0);
  let first: Transfer | null = null;
  let done: { signature: string; blockTime: number | null } | null = null;
  const extra: string[] = [];
  try {
    const found = (await connection.getSignaturesForAddress(reference, { limit: MAX_SCANNED }, 'finalized')).reverse();
    for (const f of found) {
      if (f.err) continue;
      const r = await received(connection, f.signature, recipient, reference);
      if (!r || r.lamports <= BigInt(0)) continue;
      const blockTime = r.blockTime ?? f.blockTime ?? null;
      if (done) {
        extra.push(f.signature);
        continue;
      }
      first ??= { signature: f.signature, paidAt: blockTime ? new Date(blockTime * 1000) : new Date() };
      total += r.lamports;
      if (total >= due) done = { signature: f.signature, blockTime };
    }
  } catch {
    return { paid: false, error: 'The Solana network could not be reached', status: 503 };
  }
  if (!done) return first ? { paid: false, error: 'Payment amount does not match order', status: 400, partial: first } : { paid: false };

  // A transfer with no block time cannot be shown to be inside the window; it
  // is treated as late, which refunds it rather than keeps it.
  const paidAt = done.blockTime ? new Date(done.blockTime * 1000) : new Date();
  const late = !done.blockTime || !order.expiresAt || paidAt.getTime() > order.expiresAt.getTime();
  return { paid: true, signature: done.signature, paidAt, late, ...(extra.length ? { extra } : {}) };
}

/**
 * Transfers an order received beyond the one that paid it, owed back. Said
 * where an operator will see it, once: callers report only when the order
 * has just changed state, never on a repeated check.
 */
export async function reportExtraTransfers(orderId: string, extra: string[] | undefined): Promise<void> {
  if (!extra?.length) return;
  console.error('[skychaser/payments] REFUND DUE: extra transfers for order', orderId, extra);
  await sendTelegram(`Skychaser refund due: order ${orderId} received ${extra.length} extra transfer(s): ${extra.join(', ')}`).catch(() => {});
}

/** pending → paid, once. Returns the row either way. */
export async function markPaid(db: Db, orderId: string, signature: string, paidAt: Date = new Date()): Promise<OrderRow> {
  await db
    .update(orders)
    .set({ status: 'paid', signature, paidAt })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row;
}

/** A transfer the order cannot take — late, or for an order already closed — owed back. Returns the row. */
export async function markRefundDue(db: Db, orderId: string, signature: string, paidAt: Date): Promise<OrderRow> {
  await db
    .update(orders)
    .set({ status: 'refund_due', signature, paidAt })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ['pending', 'cancelled'])));
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row;
}

/** What `orderHash` in a 'card_sold' log entry is: the buyer holds the order id; the log shows only this. */
export function orderHash(orderId: string): string {
  return createHash('sha256').update(orderId, 'utf8').digest('hex');
}

type Rows<T> = { rows: T[] };

/**
 * A card's edition count, and whether the set can spare one for a direct
 * sale: the set's unallocated editions, less every draw owed to capsules
 * listed or bought and not yet opened, must leave at least one. A capsule's
 * draws may land on any card of the set (a card or tier that is gone passes
 * its share on), so the reservation is the set's, as when capsules are listed.
 */
export async function cardAvailability(db: Db, designation: string) {
  const { rows } = (await db.execute(sql`
    SELECT k.id, k.name, k.rarity, k.edition_size, cs.status AS set_status,
      (SELECT COUNT(*) FROM edition e WHERE e.card_id = k.id) AS allocated,
      (SELECT SUM(s.edition_size) FROM card s WHERE s.set_id = k.set_id)
        - (SELECT COUNT(*) FROM edition e JOIN card s ON s.id = e.card_id WHERE s.set_id = k.set_id)
        - (SELECT COALESCE(SUM(cards_per_capsule), 0) FROM capsule WHERE set_id = k.set_id AND state IN ('listed', 'purchased'))
        AS spare
    FROM card k JOIN card_set cs ON cs.id = k.set_id WHERE k.designation = ${designation}
  `)) as Rows<{ id: string; name: string; rarity: string; edition_size: number; set_status: string; allocated: number | string; spare: number | string }>;
  const r = rows[0];
  if (!r) return null;
  const released = r.set_status === 'released';
  const sealed = isSealed(designation);
  return {
    cardId: r.id,
    name: r.name,
    rarity: r.rarity,
    editionSize: Number(r.edition_size),
    allocated: Number(r.allocated),
    /** A draft set is not on sale. Nothing in it can be bought, by capsule or on its own. */
    released,
    /** An Almanac card whose event has ended. Its unsold editions are retired. */
    sealed,
    available: released && !sealed && Number(r.allocated) < Number(r.edition_size) && Number(r.spare) >= 1,
  };
}

/**
 * The next edition of a card, for a paid direct sale, and its public log
 * entry — one statement, so neither exists without the other. Refused (null)
 * when the card is sold out or the set's remaining editions are owed to
 * capsules. The entry names the card, the edition and SHA-256 of the order id;
 * not the wallet. Runs as one neon-http batch, a single transaction, behind a
 * lock on the set.
 */
async function allocateCardSale(
  db: Db,
  input: { cardId: string; wallet: string; orderId: string },
): Promise<{ editionNumber: number } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // One sale per set at a time: two sales of different cards would each see
      // the same spare edition, and between them dig into what capsules are owed.
      const [, { rows }] = (await db.batch([
        db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('card-set:' || (SELECT set_id::text FROM card WHERE id = ${input.cardId}::uuid)))`),
        db.execute(sql`
        WITH e AS (
          INSERT INTO edition (card_id, edition_number, owner_wallet, order_id, observation_capture_id)
          SELECT ${input.cardId}::uuid, COALESCE(MAX(x.edition_number), 0) + 1, ${input.wallet}, ${input.orderId}::uuid,
            (SELECT nt.capture_id FROM nightly_target nt
             WHERE nt.card_id = ${input.cardId}::uuid AND nt.capture_id IS NOT NULL
             ORDER BY nt.night_date DESC LIMIT 1)
          FROM edition x
          WHERE x.card_id = ${input.cardId}::uuid
          HAVING COALESCE(MAX(x.edition_number), 0) < (SELECT edition_size FROM card WHERE id = ${input.cardId}::uuid)
            AND (SELECT SUM(s.edition_size) FROM card s WHERE s.set_id = (SELECT set_id FROM card WHERE id = ${input.cardId}::uuid))
              - (SELECT COUNT(*) FROM edition y JOIN card s ON s.id = y.card_id
                 WHERE s.set_id = (SELECT set_id FROM card WHERE id = ${input.cardId}::uuid))
              - (SELECT COALESCE(SUM(cards_per_capsule), 0) FROM capsule
                 WHERE set_id = (SELECT set_id FROM card WHERE id = ${input.cardId}::uuid) AND state IN ('listed', 'purchased'))
              >= 1
          RETURNING id, card_id, edition_number
        ),
        logged AS (
          INSERT INTO capsule_log (event, outcome)
          SELECT 'card_sold', jsonb_build_object(
            'designation', k.designation, 'editionNumber', e.edition_number, 'editionSize', k.edition_size,
            'orderHash', ${orderHash(input.orderId)}::text)
          FROM e JOIN card k ON k.id = e.card_id
          RETURNING seq
        )
        SELECT e.edition_number FROM e
      `),
      ])) as unknown as [unknown, Rows<{ edition_number: number }>];
      return rows[0] ? { editionNumber: Number(rows[0].edition_number) } : null;
    } catch (err) {
      const { code, cause } = err as { code?: string; cause?: { code?: string } };
      if ((code ?? cause?.code) !== '23505') throw err;
    }
  }
  throw new Error('edition allocation kept colliding');
}

export type CardFulfilment =
  | { ok: true; editionNumber: number; editionSize: number; designation: string }
  | { ok: false; reason: 'sold_out' | 'unknown_card' };

/**
 * The edition a paid single-card order bought. Idempotent: the order's own
 * edition is returned if it already has one, and the unique index on
 * edition.order_id means a raced second confirmation cannot allocate twice.
 * A card sold out, or whose set's last editions are owed to capsules, marks
 * the order refund_due.
 */
export async function fulfilCardOrder(db: Db, order: OrderRow): Promise<CardFulfilment> {
  const designation = order.productId.slice(CARD_PRODUCT_PREFIX.length);
  const [c] = await db
    .select({ id: card.id, editionSize: card.editionSize })
    .from(card)
    .where(eq(card.designation, designation))
    .limit(1);
  if (!c) return { ok: false, reason: 'unknown_card' };

  const held = async () => {
    const [e] = await db.select({ editionNumber: edition.editionNumber }).from(edition).where(eq(edition.orderId, order.id)).limit(1);
    return e;
  };
  const existing = await held();
  if (existing) return { ok: true, editionNumber: existing.editionNumber, editionSize: c.editionSize, designation };

  try {
    const allocated = await allocateCardSale(db, { cardId: c.id, wallet: order.walletAddress, orderId: order.id });
    if (!allocated) {
      await db.update(orders).set({ status: 'refund_due' }).where(and(eq(orders.id, order.id), eq(orders.status, 'paid')));
      return { ok: false, reason: 'sold_out' };
    }
    return { ok: true, editionNumber: allocated.editionNumber, editionSize: c.editionSize, designation };
  } catch (err) {
    const again = await held();
    if (again) return { ok: true, editionNumber: again.editionNumber, editionSize: c.editionSize, designation };
    throw err;
  }
}

/**
 * Single-card orders whose window has closed while still pending — the buyer
 * paid and left, or never paid. Each is settled from the chain as the confirm
 * route would: paid inside the window, its edition is allocated; paid late or
 * short, it is owed back; nothing paid, it is cancelled (a payment that lands
 * after that is still found and owed back). A chain that cannot be asked
 * leaves the order for the next sweep.
 */
export async function settleCardOrders(db: Db, limit = 25): Promise<Array<{ orderId: string; status: string }>> {
  const lapsed = await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, 'pending'), like(orders.productId, `${CARD_PRODUCT_PREFIX}%`), lt(orders.expiresAt, new Date())))
    .orderBy(orders.createdAt)
    .limit(limit);
  const out: Array<{ orderId: string; status: string }> = [];
  for (const order of lapsed) {
    const payment = await findPayment(order);
    let row: OrderRow = order;
    if (payment.paid && !payment.late) {
      row = await markPaid(db, order.id, payment.signature, payment.paidAt);
      if (row.status === 'paid') {
        await reportExtraTransfers(order.id, payment.extra);
        await fulfilCardOrder(db, row);
      }
    } else if (payment.paid) {
      row = await markRefundDue(db, order.id, payment.signature, payment.paidAt);
    } else if (payment.partial) {
      row = await markRefundDue(db, order.id, payment.partial.signature, payment.partial.paidAt);
    } else if (!payment.error) {
      await db.update(orders).set({ status: 'cancelled' }).where(and(eq(orders.id, order.id), eq(orders.status, 'pending')));
      row = { ...order, status: 'cancelled' };
    }
    out.push({ orderId: order.id, status: row.status });
  }
  return out;
}
