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
import { and, eq, gt, inArray, like, lt, sql } from 'drizzle-orm';
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

/** Whether a recorded signature is a rehearsal's stand-in rather than a transaction. */
export function isRehearsalSignature(signature: string | null | undefined): boolean {
  return Boolean(signature?.startsWith(REHEARSAL_PREFIX));
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
const CONFIGURED_RPC = () => process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '';
const PAYMENT_RPC = () => CONFIGURED_RPC() || 'https://api.mainnet-beta.solana.com';
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
  // The public RPC is rate-limited too hard to confirm payments on; production names its own.
  if (process.env.VERCEL_ENV === 'production' && !CONFIGURED_RPC()) return 'production needs SOLANA_RPC_URL';
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
  | { paid: true; signature: string; paidAt: Date; late: boolean; extra?: string[]; shared?: string[] }
  | { paid: false; error?: string; status?: number; partial?: Transfer; shared?: string[] };

/**
 * At most this many transactions carrying a reference are read, oldest first,
 * so dust cannot slow a confirmation down. Dust can only be sent once the
 * reference is public — after the buyer's own transfer — so oldest first
 * reaches the payment before any of it.
 */
const MAX_SCANNED = 25;
/** Signatures are listed a page of 1000 at a time, newest first; this many pages at most. */
const MAX_SIGNATURE_PAGES = 10;

/**
 * What findPayment asks the database. `sharedWith`: whether any of these
 * account keys is another order's payment reference — a transaction that
 * names two orders could otherwise pay both with one amount, so it pays
 * neither and is owed back. `live`: whether this database takes real
 * payments, in which case a rehearsal may mark nothing paid in it.
 */
export type PaymentLedger = {
  sharedWith: (orderId: string, keys: string[]) => Promise<boolean>;
  live: () => Promise<boolean>;
};

export function paymentLedger(db: Db): PaymentLedger {
  return {
    sharedWith: async (orderId, keys) => {
      if (!keys.length) return false;
      const [hit] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(inArray(orders.paymentReference, keys), sql`${orders.id} <> ${orderId}::uuid`))
        .limit(1);
      return Boolean(hit);
    },
    live: () => paymentsLive(db),
  };
}

/**
 * Whether the go-live reset has run on this database: from then on it holds
 * real sales, and no deployment or local server that rehearses — whatever its
 * build says — may mark anything in it paid, or sell from it. A database
 * without the app_flag table has not gone live.
 */
export async function paymentsLive(db: Db): Promise<boolean> {
  try {
    const { rows } = (await db.execute(sql`SELECT value FROM app_flag WHERE name = 'payments_live'`)) as Rows<{ value: string }>;
    return rows[0]?.value === '1';
  } catch (err) {
    if (pgCode(err) === '42P01') return false;
    throw err;
  }
}

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
  return { lamports, blockTime: tx.blockTime ?? null, keys: keys.map((k) => k.toBase58()) };
}

/** Every finalized signature that carried the reference, oldest first, up to MAX_SIGNATURE_PAGES pages. */
async function signaturesFor(connection: Connection, reference: PublicKey) {
  const all: Awaited<ReturnType<Connection['getSignaturesForAddress']>> = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_SIGNATURE_PAGES; page++) {
    const found = await connection.getSignaturesForAddress(reference, { limit: 1000, ...(before ? { before } : {}) }, 'finalized');
    all.push(...found);
    if (found.length < 1000) break;
    before = found[found.length - 1].signature;
  }
  return all.reverse();
}

/** The paying transfer's block: what a capsule's draws are mixed with. */
export type Beacon = { signature: string; slot: number; blockhash: string };

/**
 * The hash of the block a finalized transaction landed in. Nobody knows it
 * before the block is produced, so mixed into a capsule's draws it takes the
 * outcome out of the hands of anyone who could otherwise compute it in
 * advance — the buyer, the operator, or whoever holds the seal key. Throws
 * when the chain cannot say; the caller tries again later rather than open
 * without it.
 */
export async function paymentBeacon(signature: string): Promise<Beacon> {
  const connection = new Connection(PAYMENT_RPC(), 'finalized');
  const tx = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) throw new Error(`no finalized transaction ${signature}`);
  const block = await connection.getBlock(tx.slot, {
    commitment: 'finalized',
    maxSupportedTransactionVersion: 0,
    transactionDetails: 'none',
    rewards: false,
  });
  if (!block?.blockhash) throw new Error(`no finalized block at slot ${tx.slot}`);
  return { signature, slot: tx.slot, blockhash: block.blockhash };
}

/**
 * Looks for the order's payment on chain. Does not write. A transaction that
 * also names another order's reference counts for neither: it comes back in
 * `shared`, owed back.
 */
export async function findPayment(order: OrderRow, ledger: PaymentLedger): Promise<PaymentCheck> {
  if (simulatedPayments()) {
    if (await ledger.live()) {
      console.error('[skychaser/payments] refusing: a rehearsal build is pointed at a database that takes real payments');
      return { paid: false, error: 'Payments are not available right now', status: 503 };
    }
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
  const shared: string[] = [];
  try {
    let scanned = 0;
    for (const f of await signaturesFor(connection, reference)) {
      if (f.err) continue;
      if (++scanned > MAX_SCANNED) break;
      const r = await received(connection, f.signature, recipient, reference);
      if (!r || r.lamports <= BigInt(0)) continue;
      if (await ledger.sharedWith(order.id, r.keys.filter((k) => k !== reference.toBase58()))) {
        shared.push(f.signature);
        continue;
      }
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
  const also = shared.length ? { shared } : {};
  if (!done) return first ? { paid: false, error: 'Payment amount does not match order', status: 400, partial: first, ...also } : { paid: false, ...also };

  // A transfer with no block time cannot be shown to be inside the window; it
  // is treated as late, which refunds it rather than keeps it.
  const paidAt = done.blockTime ? new Date(done.blockTime * 1000) : new Date();
  const late = !done.blockTime || !order.expiresAt || paidAt.getTime() > order.expiresAt.getTime();
  return { paid: true, signature: done.signature, paidAt, late, ...(extra.length ? { extra } : {}), ...also };
}

/**
 * Transfers an order received beyond the one that paid it, owed back. Said
 * where an operator will see it, once: callers report only when the order
 * has just changed state, never on a repeated check.
 */
export async function reportExtraTransfers(orderId: string, extra: string[] | undefined): Promise<void> {
  if (!extra?.length) return;
  await alertRefundDue(orderId, `received ${extra.length} extra transfer(s) after the one that paid it`, extra);
}

/**
 * Transfers that named this order and another together: counted for neither,
 * owed back. Said once, when the order closes without them.
 */
export async function reportSharedTransfers(orderId: string, shared: string[] | undefined): Promise<void> {
  if (!shared?.length) return;
  await alertRefundDue(orderId, `received ${shared.length} transfer(s) that also named another order, counted for neither`, shared);
}

/**
 * Money owed back, said where an operator will see it: the server log and,
 * when configured, Telegram. Plain text, so a signature or reason can never
 * break the message. Never throws: an alert that fails must not undo the
 * state change it reports.
 */
export async function alertRefundDue(orderId: string, reason: string, signatures: Array<string | null | undefined> = []): Promise<void> {
  const sigs = signatures.filter((s): s is string => Boolean(s));
  console.error('[skychaser/payments] REFUND DUE:', orderId, reason, sigs);
  await sendTelegram(`Skychaser refund due\norder ${orderId}\n${reason}${sigs.length ? `\nsignatures: ${sigs.join(', ')}` : ''}`).catch((err) =>
    console.error('[skychaser/payments] refund alert not sent', orderId, err instanceof Error ? err.message : err),
  );
}

function pgCode(err: unknown): string | undefined {
  const { code, cause } = err as { code?: string; cause?: { code?: string } };
  return code ?? cause?.code;
}

/**
 * pending → paid, once. Returns the row either way. A signature that already
 * paid another order (the unique index refuses it) pays nothing here: the
 * order is marked refund_due without it, and said.
 */
export async function markPaid(db: Db, orderId: string, signature: string, paidAt: Date = new Date()): Promise<OrderRow> {
  try {
    await db
      .update(orders)
      .set({ status: 'paid', signature, paidAt })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));
  } catch (err) {
    if (pgCode(err) !== '23505') throw err;
    const changed = await db
      .update(orders)
      .set({ status: 'refund_due', paidAt })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
      .returning({ id: orders.id });
    if (changed.length) await alertRefundDue(orderId, 'its paying transfer had already paid another order', [signature]);
  }
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row;
}

/** A transfer the order cannot take — late, or for an order already closed — owed back. Returns the row. */
export async function markRefundDue(db: Db, orderId: string, signature: string, paidAt: Date, reason = 'paid late, short, or after the order closed'): Promise<OrderRow> {
  let changed: Array<{ id: string }> = [];
  try {
    changed = await db
      .update(orders)
      .set({ status: 'refund_due', signature, paidAt })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ['pending', 'cancelled'])))
      .returning({ id: orders.id });
  } catch (err) {
    // The transfer is already on another order's record; this one is still owed back.
    if (pgCode(err) !== '23505') throw err;
    changed = await db
      .update(orders)
      .set({ status: 'refund_due', paidAt })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ['pending', 'cancelled'])))
      .returning({ id: orders.id });
  }
  if (changed.length) await alertRefundDue(orderId, reason, [signature]);
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
      const changed = await db
        .update(orders)
        .set({ status: 'refund_due' })
        .where(and(eq(orders.id, order.id), eq(orders.status, 'paid')))
        .returning({ id: orders.id });
      if (changed.length) await alertRefundDue(order.id, `paid, but no edition of ${designation} could be spared`, [order.signature]);
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
 * How long past its window an order is left before a sweep closes it. A
 * transfer sent in the window's last seconds is final about 13 s later; until
 * then the chain shows nothing, and closing the order would turn a payment
 * made in time into a refund.
 */
export const FINALITY_GRACE_MS = 2 * 60_000;

/** How far back the daily re-check looks for a payment that reached an order after it closed. */
export const RECHECK_CLOSED_DAYS = 3;

/**
 * Single-card orders whose window (and the finality grace after it) has
 * closed while still pending — the buyer paid and left, or never paid. Each is
 * settled from the chain as the confirm route would: paid inside the window,
 * its edition is allocated; paid late or short, it is owed back; nothing paid,
 * it is cancelled (a payment that lands after that is found by
 * recheckClosedCardOrders and owed back). A chain that cannot be asked leaves
 * the order for the next sweep. One order that fails is logged and passed
 * over; it never stops the sweep from reaching the rest.
 */
export async function settleCardOrders(db: Db, limit = 25): Promise<Array<{ orderId: string; status: string }>> {
  const lapsed = await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.status, 'pending'),
      like(orders.productId, `${CARD_PRODUCT_PREFIX}%`),
      lt(orders.expiresAt, new Date(Date.now() - FINALITY_GRACE_MS)),
    ))
    .orderBy(orders.createdAt)
    .limit(limit);
  const out: Array<{ orderId: string; status: string }> = [];
  for (const order of lapsed) {
    try {
      out.push({ orderId: order.id, status: await settleCardOrder(db, order) });
    } catch (err) {
      console.error('[skychaser/payments] card order sweep', order.id, err instanceof Error ? err.message : err);
      out.push({ orderId: order.id, status: 'error' });
    }
  }
  return out;
}

async function settleCardOrder(db: Db, order: OrderRow): Promise<string> {
  const payment = await findPayment(order, paymentLedger(db));
  let row: OrderRow = order;
  if (payment.paid && !payment.late) {
    row = await markPaid(db, order.id, payment.signature, payment.paidAt);
    if (row.status === 'paid') {
      await reportExtraTransfers(order.id, payment.extra);
      await reportSharedTransfers(order.id, payment.shared);
      await fulfilCardOrder(db, row);
    }
  } else if (payment.paid) {
    row = await markRefundDue(db, order.id, payment.signature, payment.paidAt, 'paid after its payment window closed');
  } else if (payment.partial) {
    row = await markRefundDue(db, order.id, payment.partial.signature, payment.partial.paidAt, 'paid less than the quote');
  } else if (!payment.error) {
    const changed = await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'pending')))
      .returning({ id: orders.id });
    if (changed.length) await reportSharedTransfers(order.id, payment.shared);
    row = { ...order, status: 'cancelled' };
  }
  return row.status;
}

/**
 * Single-card orders cancelled in the last RECHECK_CLOSED_DAYS, asked again:
 * a buyer who paid by QR and closed the tab, or whose transfer was final only
 * after the sweep, would otherwise have paid with nothing on record. Anything
 * found now is owed back. Run by the daily cron.
 */
export async function recheckClosedCardOrders(db: Db, limit = 50): Promise<Array<{ orderId: string; status: string }>> {
  const closed = await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.status, 'cancelled'),
      like(orders.productId, `${CARD_PRODUCT_PREFIX}%`),
      gt(orders.expiresAt, new Date(Date.now() - RECHECK_CLOSED_DAYS * 86_400_000)),
    ))
    .orderBy(orders.createdAt)
    .limit(limit);
  const out: Array<{ orderId: string; status: string }> = [];
  for (const order of closed) {
    try {
      const payment = await findPayment(order, paymentLedger(db));
      const owed = payment.paid ? payment : payment.partial;
      if (!owed) continue;
      const row = await markRefundDue(db, order.id, owed.signature, owed.paidAt, 'paid after the order was closed');
      out.push({ orderId: order.id, status: row.status });
    } catch (err) {
      console.error('[skychaser/payments] closed order re-check', order.id, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** Orders owed back and not yet marked refunded: the daily cron says how many. */
export async function refundsOwed(db: Db): Promise<number> {
  const { rows } = (await db.execute(sql`
    SELECT count(*)::int AS n FROM orders
    WHERE status = 'refund_due' AND (product_id = ${CAPSULE_PRODUCT_ID} OR product_id LIKE ${CARD_PRODUCT_PREFIX + '%'})
  `)) as Rows<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}
