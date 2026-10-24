/**
 * Capsules: listing, purchase, opening, voiding, and the public log.
 *
 * Every state change and its log entry are written by one neon-http batch,
 * which runs as a single transaction: there is no moment at which a capsule
 * has changed state and the log does not yet say so. neon-http has no
 * interactive transactions, so each batch is built to fail as a whole when
 * the world moved under it — a NOT NULL or unique violation rolls back every
 * statement — and the caller reads again and retries a bounded number of times.
 *
 * capsule_log is only ever INSERTed into. Nothing in this file, or anywhere in
 * src, updates or deletes it (a test holds that), and the database refuses to.
 */

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, lt, or, sql, type SQL } from 'drizzle-orm';
import { sendTelegram } from '@/lib/telegram';
import type { BatchItem } from 'drizzle-orm/batch';
import { orders } from '@/lib/schema';
import { RARITIES, isRarity, type Rarity } from '@/lib/rarity';
import { isDirectOnly, isSealed } from './almanac';
import type { Db } from './attach';
import type { LogRow } from './audit';
import { CAPSULE_PRICE_USD, CARDS_PER_CAPSULE, RARITY_ODDS_BPS } from './economics';
import { tierByKey, type Tier } from './tiers';
import {
  CAPSULE_PRODUCT_ID,
  FINALITY_GRACE_MS,
  RECHECK_LIMIT,
  alertRefundDue,
  findPayment,
  isRehearsalSignature,
  markPaid,
  paymentBeacon,
  orderExpiry,
  reportExtraTransfers,
  reportSharedTransfers,
  paymentLedger,
  recheckWindows,
  retiredEditions,
  type Beacon,
  type OrderRow,
  type PaymentCheck,
} from './orders';
import {
  SoldOutError,
  commitmentOf,
  newServerSecret,
  planPulls,
  purchaseHash,
  purchaseMessage,
  type PlannedPull,
  type SupplyEntry,
} from './randomness';

const MAX_ATTEMPTS = 8;

// ─── Sealing ────────────────────────────────────────────────────────────────

function sealKey(): Buffer {
  const hex = process.env.CAPSULE_SEAL_KEY ?? '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('CAPSULE_SEAL_KEY must be 32 bytes of hex');
  return Buffer.from(hex, 'hex');
}

/** AES-256-GCM, with the capsule id as associated data so a sealed secret cannot be moved to another row. */
export function sealSecret(secret: string, capsuleId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
  cipher.setAAD(Buffer.from(capsuleId, 'utf8'));
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

export function unsealSecret(sealed: string, capsuleId: string): string {
  const [version, iv, tag, body] = sealed.split(':');
  if (version !== 'v1') throw new Error('unknown seal version');
  const decipher = createDecipheriv('aes-256-gcm', sealKey(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(capsuleId, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pgCode(err: unknown): string | undefined {
  const { code, cause } = err as { code?: string; cause?: { code?: string } };
  return code ?? cause?.code;
}

/** A write that lost a race: someone else took the number, the edition, or the capsule. */
function lostRace(err: unknown): boolean {
  const code = pgCode(err);
  return code === '23505' || code === '23502';
}

/** Exponential, with full jitter, so openings that collided do not wake together and collide again. */
function backoff(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * 10 * 2 ** attempt));
}

type Rows<T> = { rows: T[] };

/** db.batch over raw statements, each of which answers with its rows. */
function runBatch(db: Db, items: ReadonlyArray<BatchItem<'pg'>>): Promise<Array<Rows<Record<string, unknown>>>> {
  return db.batch(items as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]) as Promise<Array<Rows<Record<string, unknown>>>>;
}

// ─── Supply ─────────────────────────────────────────────────────────────────

export type SupplyRow = SupplyEntry & { cardId: string; editionSize: number };

/**
 * Every card of the set, with how many editions are left to capsules. Edition
 * numbers are gapless from 1, so the highest number allocated is the number
 * allocated. A limited (direct-only) card shows none left here, so no draw,
 * sold-out tier or listing ever counts on it; `counts: true` gives its real
 * remainder instead, for the public edition counts.
 */
export async function readSupply(db: Db, setId: string, now: Date = new Date(), opts: { counts?: boolean } = {}): Promise<SupplyRow[]> {
  const { rows } = (await db.execute(sql`
    SELECT c.id, c.designation, c.rarity, c.edition_size,
      COALESCE((SELECT MAX(e.edition_number) FROM edition e WHERE e.card_id = c.id), 0) AS allocated
    FROM card c
    WHERE c.set_id = ${setId}::uuid
    ORDER BY c.designation
  `)) as Rows<{ id: string; designation: string; rarity: string; edition_size: number; allocated: number | string }>;
  return rows
    .filter((r) => isRarity(r.rarity))
    .map((r) => ({
      cardId: r.id,
      designation: r.designation,
      rarity: r.rarity as Rarity,
      editionSize: Number(r.edition_size),
      // A sealed card's unsold editions are retired: nothing left to draw. A limited
      // card is never drawn, so capsules see none of it.
      remaining:
        isSealed(r.designation, now) || (isDirectOnly(r.designation) && !opts.counts)
          ? 0
          : Number(r.edition_size) - Number(r.allocated),
    }));
}

/** The public edition counts of a set, by code, and the draws owed to unopened capsules. */
export async function readSetSupply(db: Db, code: string) {
  const { rows } = (await db.execute(sql`SELECT id, status FROM card_set WHERE code = ${code}`)) as Rows<{ id: string; status: string }>;
  if (!rows[0]) return null;
  const supply = await readSupply(db, rows[0].id, new Date(), { counts: true });
  const { rows: owed } = (await db.execute(sql`
    SELECT COALESCE(SUM(cards_per_capsule), 0) AS draws FROM capsule
    WHERE set_id = ${rows[0].id}::uuid AND state IN ('listed', 'purchased')
  `)) as Rows<{ draws: number | string }>;
  return {
    set: code,
    status: rows[0].status,
    owedDraws: Number(owed[0]?.draws ?? 0),
    cards: supply.map((s) => ({
      designation: s.designation,
      rarity: s.rarity,
      editionSize: s.editionSize,
      allocated: s.editionSize - s.remaining,
      remaining: s.remaining,
    })),
  };
}

// ─── Listing ────────────────────────────────────────────────────────────────

export type ListedCapsule = { id: string; sequence: number; commitment: string };

/** A capsule's own odds, as listed; a capsule listed before tiers opens under the published default. */
function oddsOf(c: { odds_bps: unknown }): Record<Rarity, number> {
  const o = c.odds_bps as Record<string, unknown> | null;
  if (!o || !RARITIES.every((r) => Number.isInteger(o[r]))) return RARITY_ODDS_BPS;
  return Object.fromEntries(RARITIES.map((r) => [r, o[r] as number])) as Record<Rarity, number>;
}

/**
 * Lists `count` capsules of a set, each committed before it exists for sale.
 *
 * Numbers are MAX(sequence)+1 inside one transaction, so a batch of five takes
 * five consecutive numbers; a second lister at the same moment collides on the
 * unique index and the whole batch is retried, never half-written. Refuses to
 * list more capsules than the set's remaining editions can fill.
 *
 * Listed as a tier, a capsule takes the tier's price and odds, and both the
 * row and its 'listed' entry carry the odds: what it opens under is fixed and
 * public before anyone can buy it.
 */
export async function listCapsules(
  db: Db,
  input: { setId: string; count: number; tier?: Tier; priceUsd?: number; demo?: boolean },
): Promise<ListedCapsule[]> {
  const demo = input.demo === true;
  const tier = input.tier ?? null;
  const price = input.priceUsd ?? tier?.priceUsd ?? CAPSULE_PRICE_USD;
  const odds = tier ? JSON.stringify(tier.oddsBps) : null;
  const listedOutcome = demo || tier
    ? JSON.stringify({ ...(demo ? { demo: true } : {}), ...(tier ? { tier: tier.key, oddsBps: tier.oddsBps } : {}) })
    : null;
  const supply = await readSupply(db, input.setId);
  const remaining = supply.reduce((sum, s) => sum + Math.max(0, s.remaining), 0);
  const { rows: open } = (await db.execute(sql`
    SELECT COALESCE(SUM(cards_per_capsule), 0) AS draws FROM capsule
    WHERE set_id = ${input.setId}::uuid AND state IN ('listed', 'purchased')
  `)) as Rows<{ draws: number | string }>;
  const owed = Number(open[0]?.draws ?? 0);
  if (owed + input.count * CARDS_PER_CAPSULE > remaining) {
    throw new Error(`Not enough editions left: ${remaining} remain, ${owed} are owed to capsules already listed.`);
  }

  // The check above, again inside the batch and behind the lock direct card
  // sales take, so a sale committing meanwhile cannot leave the shelf holding
  // a capsule the set can no longer fill. Short, it divides by zero: the batch
  // rolls back whole.
  const retired = await retiredEditions(db, input.setId);
  const need = input.count * CARDS_PER_CAPSULE;
  const guard = [
    db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('card-set:' || ${input.setId}::text))`),
    db.execute(sql`
      SELECT 1 / (CASE WHEN
        (SELECT COALESCE(SUM(k.edition_size), 0) FROM card k WHERE k.set_id = ${input.setId}::uuid)
        - (SELECT COUNT(*) FROM edition e JOIN card k ON k.id = e.card_id WHERE k.set_id = ${input.setId}::uuid)
        - (SELECT COALESCE(SUM(cards_per_capsule), 0) FROM capsule WHERE set_id = ${input.setId}::uuid AND state IN ('listed', 'purchased'))
        - ${retired}::int
        >= ${need}::int THEN 1 ELSE 0 END) AS ok
    `),
  ];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const capsules = Array.from({ length: input.count }, () => {
      const id = randomUUID();
      const secret = newServerSecret();
      return { id, commitment: commitmentOf(secret), sealed: sealSecret(secret, id) };
    });
    const statements = capsules.map((c) =>
      db.execute(sql`
        WITH c AS (
          INSERT INTO capsule (id, set_id, sequence, commitment, server_secret_sealed, price_usd, cards_per_capsule, demo, tier, odds_bps)
          SELECT ${c.id}::uuid, ${input.setId}::uuid, COALESCE(MAX(sequence), 0) + 1, ${c.commitment}, ${c.sealed},
            ${price}, ${CARDS_PER_CAPSULE}, ${demo}, ${tier?.key ?? null}, ${odds}::jsonb
          FROM capsule
          RETURNING id, sequence, commitment
        )
        INSERT INTO capsule_log (capsule_id, capsule_sequence, event, commitment, outcome)
        SELECT id, sequence, 'listed', commitment, ${listedOutcome}::jsonb FROM c
        RETURNING capsule_id, capsule_sequence
      `),
    );
    try {
      const results = (await runBatch(db, [...guard, ...statements])).slice(guard.length);
      return results.map((r, i) => ({
        id: capsules[i].id,
        sequence: Number(r.rows[0].capsule_sequence),
        commitment: capsules[i].commitment,
      }));
    } catch (err) {
      if (pgCode(err) === '22012') throw new Error('Not enough editions left: a sale took the last spare editions while listing.');
      if (!lostRace(err)) throw err;
      await backoff(attempt);
    }
  }
  throw new Error('capsule listing kept colliding');
}

/**
 * Capsules on sale, lowest number first; with a tier key, that tier's only.
 * Never selects the sealed secret; never offers a demo capsule.
 */
export async function capsulesOnSale(db: Db, opts: { limit?: number; tier?: string } = {}) {
  const only = opts.tier ? sql`AND tier = ${opts.tier}` : sql``;
  const { rows } = (await db.execute(sql`
    SELECT id, set_id, sequence, commitment, price_usd, cards_per_capsule, listed_at, tier, odds_bps
    FROM capsule WHERE state = 'listed' AND NOT demo ${only} ORDER BY sequence LIMIT ${opts.limit ?? 50}
  `)) as Rows<{ id: string; set_id: string; sequence: number | string; commitment: string; price_usd: number; cards_per_capsule: number; listed_at: string; tier: string | null; odds_bps: unknown }>;
  return rows.map((r) => ({
    id: r.id,
    setId: r.set_id,
    sequence: Number(r.sequence),
    tier: r.tier,
    commitment: r.commitment,
    priceUsd: Number(r.price_usd),
    cardsPerCapsule: Number(r.cards_per_capsule),
    listedAt: r.listed_at,
    /** The odds logged when this capsule was listed: what it opens under. */
    oddsBps: oddsOf(r),
  }));
}

/**
 * The rarities a capsule's odds promise that have no edition left to draw:
 * none remain beyond the draws that capsules already bought, and not yet
 * opened, could take from them (`held`, per rarity). A capsule is not sold
 * while any is gone: its listed odds could no longer be honoured, and its
 * share would pass to the other rarities instead.
 */
export function goneRarities(
  oddsBps: Record<Rarity, number>,
  supply: SupplyEntry[],
  held: Partial<Record<Rarity, number>> = {},
): Rarity[] {
  return RARITIES.filter((r) => {
    if (!(oddsBps[r] > 0)) return false;
    const left = supply.filter((s) => s.rarity === r).reduce((n, s) => n + Math.max(0, s.remaining), 0);
    return left <= (held[r] ?? 0);
  });
}

/** Draws owed to a set's capsules bought and not yet opened, per rarity their odds can land on. */
export async function heldDraws(db: Db, setId: string): Promise<Partial<Record<Rarity, number>>> {
  const { rows } = (await db.execute(sql`
    SELECT cards_per_capsule, odds_bps FROM capsule WHERE set_id = ${setId}::uuid AND state = 'purchased'
  `)) as Rows<{ cards_per_capsule: number; odds_bps: unknown }>;
  const held: Partial<Record<Rarity, number>> = {};
  for (const c of rows) {
    const odds = oddsOf(c);
    for (const r of RARITIES) if (odds[r] > 0) held[r] = (held[r] ?? 0) + Number(c.cards_per_capsule);
  }
  return held;
}

// ─── Purchase ───────────────────────────────────────────────────────────────

type CapsuleRow = {
  id: string;
  set_id: string;
  sequence: number | string;
  commitment: string;
  server_secret_sealed: string;
  server_secret: string | null;
  state: 'listed' | 'purchased' | 'opened' | 'void' | 'released';
  price_usd: number;
  cards_per_capsule: number;
  buyer_wallet: string | null;
  buyer_nonce: string | null;
  order_id: string | null;
  demo: boolean;
  tier: string | null;
  odds_bps: unknown;
  /** The set's status, read with the capsule by readCapsule. */
  set_status?: string;
};

const CAPSULE_COLUMNS = sql.raw(`id, set_id, sequence, commitment, server_secret_sealed, server_secret, state, price_usd,
      cards_per_capsule, buyer_wallet, buyer_nonce, order_id, demo, tier, odds_bps`);

export async function readCapsule(db: Db, capsuleId: string): Promise<CapsuleRow | null> {
  const { rows } = (await db.execute(sql`
    SELECT ${CAPSULE_COLUMNS}, (SELECT s.status FROM card_set s WHERE s.id = capsule.set_id) AS set_status
    FROM capsule WHERE id = ${capsuleId}::uuid
  `)) as Rows<CapsuleRow>;
  return rows[0] ?? null;
}

/** Capsules this account holds bought and unpaid, with their quote still standing. */
export async function unpaidCapsules(db: Db, privyId: string): Promise<number> {
  const { rows } = (await db.execute(sql`
    SELECT count(*)::int AS n FROM orders
    WHERE privy_id = ${privyId} AND product_id = ${CAPSULE_PRODUCT_ID} AND status = 'pending' AND expires_at > now()
  `)) as Rows<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

async function readOrder(db: Db, orderId: string): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return row ?? null;
}

export type PurchaseResult =
  | { ok: true; orderId: string; sequence: number; message: string; purchaseHash: string; priceUsd: number; expiresAt: string }
  | { ok: false; reason: 'not_found' | 'not_listed' | 'commitment_mismatch' | 'too_many_unpaid' }
  | { ok: false; reason: 'rarity_gone'; gone: Rarity[] };

/**
 * Takes a listed capsule for a buyer, with their nonce, and opens its order.
 *
 * One batch: the capsule changes hands, the 'purchased' entry is logged, and
 * the order row is written — or none of it happens. From this moment the
 * nonce is public and fixed; the capsule can only end opened, voided or — if
 * its payment window closes unpaid — released, and each is in the log. The
 * window's close is logged with the purchase, so a release can be checked
 * against it.
 *
 * The account may hold at most `maxUnpaid` capsules unpaid at once. The count
 * is taken inside the batch, behind a lock on the account, so requests sent at
 * the same moment cannot each see room for one more.
 */
export async function purchaseCapsule(
  db: Db,
  input: {
    capsuleId: string;
    commitment: string;
    wallet: string;
    nonce: string;
    signature: string | null;
    privyId: string;
    amountSol: number;
    paymentReference: string;
    maxUnpaid: number;
  },
): Promise<PurchaseResult> {
  const capsuleRow = await readCapsule(db, input.capsuleId);
  if (!capsuleRow) return { ok: false, reason: 'not_found' };
  if (capsuleRow.commitment !== input.commitment) return { ok: false, reason: 'commitment_mismatch' };
  if (capsuleRow.state !== 'listed') return { ok: false, reason: 'not_listed' };
  const gone = goneRarities(oddsOf(capsuleRow), await readSupply(db, capsuleRow.set_id), await heldDraws(db, capsuleRow.set_id));
  if (gone.length) return { ok: false, reason: 'rarity_gone', gone };

  const capsuleId = capsuleRow.id;
  const sequence = Number(capsuleRow.sequence);
  const terms = { capsuleId, sequence, commitment: input.commitment, wallet: input.wallet, nonce: input.nonce };
  const hash = purchaseHash(terms);
  const orderId = randomUUID();
  const priceUsd = Number(capsuleRow.price_usd);
  const expiresAt = orderExpiry().toISOString();

  const [, claimed, order] = await runBatch(db, [
    db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'capsule-buyer:' + input.privyId}))`),
    db.execute(sql`
      WITH c AS (
        UPDATE capsule SET state = 'purchased', buyer_wallet = ${input.wallet}, buyer_nonce = ${input.nonce},
          buyer_signature = ${input.signature}, purchase_hash = ${hash}, order_id = ${orderId}::uuid, purchased_at = now()
        WHERE id = ${capsuleId}::uuid AND state = 'listed' AND commitment = ${input.commitment}
          AND (SELECT count(*) FROM orders WHERE privy_id = ${input.privyId} AND product_id = ${CAPSULE_PRODUCT_ID}
               AND status = 'pending' AND expires_at > now()) < ${input.maxUnpaid}
        RETURNING id, sequence, commitment, buyer_wallet, buyer_nonce, purchase_hash
      )
      INSERT INTO capsule_log (capsule_id, capsule_sequence, event, commitment, buyer_wallet, buyer_nonce, purchase_hash, outcome)
      SELECT id, sequence, 'purchased', commitment, buyer_wallet, buyer_nonce, purchase_hash,
        ${JSON.stringify({ expiresAt, onChain: true })}::jsonb FROM c
      RETURNING seq
    `),
    db.execute(sql`
      INSERT INTO orders (id, privy_id, wallet_address, product_id, product_name, dealer_id, payment_method,
        amount_sol, amount_stars, amount_fiat, currency, payment_reference, status,
        shipping_name, shipping_phone, shipping_address, shipping_city, shipping_country, expires_at)
      SELECT ${orderId}::uuid, ${input.privyId}, ${input.wallet}, 'stellar-capsule', ${`Capsule ${sequence}`}, 'stellar', 'sol',
        ${input.amountSol}, 0, ${priceUsd}, 'USD', ${input.paymentReference}, 'pending', '', '', '', '', '', ${expiresAt}::timestamptz
      WHERE EXISTS (SELECT 1 FROM capsule WHERE id = ${capsuleId}::uuid AND order_id = ${orderId}::uuid)
      RETURNING id
    `),
  ]);

  if (claimed.rows.length === 0 || order.rows.length === 0) {
    return { ok: false, reason: (await unpaidCapsules(db, input.privyId)) >= input.maxUnpaid ? 'too_many_unpaid' : 'not_listed' };
  }
  return { ok: true, orderId, sequence, message: purchaseMessage(terms), purchaseHash: hash, priceUsd, expiresAt };
}

// ─── Opening ────────────────────────────────────────────────────────────────

export type OpenedPull = {
  drawIndex: number;
  designation: string;
  name: string;
  rarity: string;
  editionNumber: number;
  editionSize: number;
};

export async function readPulls(db: Db, capsuleId: string): Promise<OpenedPull[]> {
  const { rows } = (await db.execute(sql`
    SELECT p.draw_index, k.designation, k.name, p.rarity, e.edition_number, k.edition_size
    FROM capsule_pull p
    JOIN edition e ON e.id = p.edition_id
    JOIN card k ON k.id = p.card_id
    WHERE p.capsule_id = ${capsuleId}::uuid
    ORDER BY p.draw_index
  `)) as Rows<{ draw_index: number; designation: string; name: string; rarity: string; edition_number: number; edition_size: number }>;
  return rows.map((r) => ({
    drawIndex: Number(r.draw_index),
    designation: r.designation,
    name: r.name,
    rarity: r.rarity,
    editionNumber: Number(r.edition_number),
    editionSize: Number(r.edition_size),
  }));
}

/** The supply as the log carries it: every card, its edition size, and how many are left. */
function publishedSupply(supply: SupplyRow[]): SupplyEntry[] {
  return supply.map(({ designation, rarity, remaining, editionSize }) => ({ designation, rarity, remaining, editionSize }));
}

/**
 * The statements that open a capsule, in order: the capsule flips to opened
 * and reveals its secret; each draw allocates the card's next edition number
 * and records the pull; the 'opened' entry is logged with the secret, the
 * odds, the supply the draws were made against and the pulls.
 *
 * Each pull takes exactly the number the logged supply implies —
 * editionSize − remaining + 1, plus one per earlier pull of the card in this
 * capsule — so the log can be checked number by number. It fails loudly
 * instead of quietly writing nothing: its edition id and capsule id come from
 * sub-selects into NOT NULL columns, so a card whose editions moved since the
 * supply was read (HAVING finds another highest number), or a capsule that is
 * not this batch's to open, gives NULL; a number taken at the same moment
 * collides on the unique index. Either way the batch rolls back whole.
 */
export function openStatements(
  db: Db,
  input: {
    capsuleId: string;
    secret: string;
    owner: string;
    plan: PlannedPull[];
    supply: SupplyRow[];
    draws: number;
    oddsBps: Record<Rarity, number>;
    beacon?: Beacon | null;
  },
) {
  const bySupply = new Map(input.supply.map((s) => [s.designation, s]));
  const earlier = new Map<string, number>();
  const numbered = input.plan.map((p) => {
    const s = bySupply.get(p.designation);
    if (!s) throw new Error(`draw ${p.drawIndex} names ${p.designation}, which is not in the supply`);
    const before = earlier.get(p.designation) ?? 0;
    earlier.set(p.designation, before + 1);
    return { ...p, card: s.cardId, number: s.editionSize - s.remaining + 1 + before };
  });
  const published = publishedSupply(input.supply);
  return [
    db.execute(sql`
      UPDATE capsule SET state = 'opened', opened_at = now(), server_secret = ${input.secret}
      WHERE id = ${input.capsuleId}::uuid AND state = 'purchased'
      RETURNING id
    `),
    ...numbered.map((p) => {
      const card = p.card;
      return db.execute(sql`
        WITH e AS (
          INSERT INTO edition (card_id, edition_number, owner_wallet, capsule_id, observation_capture_id)
          SELECT ${card}::uuid, ${p.number}::int, ${input.owner}, ${input.capsuleId}::uuid,
            (SELECT nt.capture_id FROM nightly_target nt
             WHERE nt.card_id = ${card}::uuid AND nt.capture_id IS NOT NULL
             ORDER BY nt.night_date DESC LIMIT 1)
          FROM edition x
          WHERE x.card_id = ${card}::uuid
          HAVING COALESCE(MAX(x.edition_number), 0) = ${p.number - 1}::int
            AND ${p.number}::int <= (SELECT edition_size FROM card WHERE id = ${card}::uuid)
          RETURNING id
        )
        INSERT INTO capsule_pull (capsule_id, draw_index, edition_id, card_id, rarity)
        VALUES (
          (SELECT id FROM capsule WHERE id = ${input.capsuleId}::uuid AND state = 'opened'),
          ${p.drawIndex}, (SELECT id FROM e), ${card}::uuid, ${p.rarity}
        )
        RETURNING id
      `);
    }),
    db.execute(sql`
      INSERT INTO capsule_log (capsule_id, capsule_sequence, event, commitment, buyer_wallet, buyer_nonce, purchase_hash, outcome)
      SELECT c.id, c.sequence, 'opened', c.commitment, c.buyer_wallet, c.buyer_nonce, c.purchase_hash,
        jsonb_build_object(
          'secret', c.server_secret,
          'draws', ${input.draws}::int,
          'oddsBps', ${JSON.stringify(input.oddsBps)}::jsonb,
          'supply', ${JSON.stringify(published)}::jsonb,
          'pulls', (
            SELECT jsonb_agg(jsonb_build_object(
              'drawIndex', p.draw_index, 'designation', k.designation, 'rarity', p.rarity, 'editionNumber', e.edition_number
            ) ORDER BY p.draw_index)
            FROM capsule_pull p JOIN edition e ON e.id = p.edition_id JOIN card k ON k.id = p.card_id
            WHERE p.capsule_id = c.id
          )
        ) || ${JSON.stringify(input.beacon ? { beacon: input.beacon } : {})}::jsonb
      FROM capsule c WHERE c.id = ${input.capsuleId}::uuid AND c.state = 'opened'
      RETURNING seq
    `),
  ] as const;
}

export type OpenResult =
  | { ok: true; alreadyOpened: boolean; secret: string; pulls: OpenedPull[] }
  | { ok: false; reason: 'not_found' | 'not_purchased' };

/**
 * Opens a purchased capsule. Whether the caller may is the route's business;
 * this is the draw and the allocation.
 *
 * The supply is read, the draws are planned from secret + nonce + supply, and
 * the batch is sent. If it loses a race — another opening took an edition
 * number first, or sold a card out — nothing was written, and the next attempt
 * reads the supply again. The draws only change if the supply they depend on
 * did; whichever supply the successful attempt used is the one logged.
 *
 * Every id that reaches the draws and the statements is the capsule row's own
 * id, never the caller's string. If the set cannot fill the capsule, it is
 * voided with the supply that could not, its order is marked refund_due, both
 * are logged, and SoldOutError is thrown.
 *
 * A capsule paid on chain draws with the beacon — the hash of the block its
 * paying transfer landed in — read once, before the first attempt. One a
 * rehearsal build marked paid, or a demo capsule, moved no money and has none.
 */
export async function openCapsule(db: Db, capsuleId: string): Promise<OpenResult> {
  let beacon: Beacon | null | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const c = await readCapsule(db, capsuleId);
    if (!c) return { ok: false, reason: 'not_found' };
    if (c.state === 'opened') {
      return { ok: true, alreadyOpened: true, secret: c.server_secret ?? '', pulls: await readPulls(db, c.id) };
    }
    if (c.state !== 'purchased' || !c.buyer_wallet || !c.buyer_nonce) return { ok: false, reason: 'not_purchased' };

    if (beacon === undefined) {
      const order = c.order_id ? await readOrder(db, c.order_id) : null;
      if (c.demo || isRehearsalSignature(order?.signature)) beacon = null;
      else if (order?.signature) beacon = await paymentBeacon(order.signature);
      else throw new Error(`capsule ${c.id} has no paying transfer on record to draw with`);
    }
    const secret = unsealSecret(c.server_secret_sealed, c.id);
    const supply = await readSupply(db, c.set_id);
    const draws = Number(c.cards_per_capsule);
    const oddsBps = oddsOf(c);
    let plan: PlannedPull[];
    try {
      plan = planPulls({ secret, nonce: c.buyer_nonce, capsuleId: c.id, supply, draws, oddsBps, beacon: beacon?.blockhash });
    } catch (err) {
      if (!(err instanceof SoldOutError)) throw err;
      await closeCapsule(db, c, {
        event: 'voided',
        secret,
        when: 'paid',
        outcome: {
          secret,
          reason: 'sold_out',
          priorState: 'purchased',
          ...(c.demo ? { demo: true } : {}),
          soldOut: { draws, oddsBps, supply: publishedSupply(supply), ...(beacon ? { beacon } : {}) },
        },
        refundReason: 'every edition of the set was allocated before the capsule could be opened',
      });
      throw err;
    }

    const statements = openStatements(db, { capsuleId: c.id, secret, owner: c.buyer_wallet, plan, supply, draws, oddsBps, beacon });
    try {
      await runBatch(db, statements);
      return { ok: true, alreadyOpened: false, secret, pulls: await readPulls(db, c.id) };
    } catch (err) {
      if (!lostRace(err)) throw err;
      await backoff(attempt);
    }
  }
  throw new Error('capsule opening kept colliding');
}

// ─── Closing: void, release, refund ─────────────────────────────────────────

/** A transfer the order cannot keep: late, or short of the amount. */
type LatePayment = { signature: string; paidAt: Date; short?: boolean };

/**
 * The refund entry for a closed capsule whose order ended refund_due. Written
 * only if the order really is refund_due, once (the unique (capsule_id, event)
 * index), in the same batch as whatever made it so.
 */
function refundLogStatement(db: Db, capsuleId: string, states: string[], reason: string) {
  return db.execute(sql`
    INSERT INTO capsule_log (capsule_id, capsule_sequence, event, commitment, buyer_wallet, buyer_nonce, purchase_hash, outcome)
    SELECT c.id, c.sequence, 'refund_due', c.commitment, c.buyer_wallet, c.buyer_nonce, c.purchase_hash,
      jsonb_build_object('reason', ${reason}::text, 'paidAt', o.paid_at, 'expiresAt', o.expires_at)
    FROM capsule c JOIN orders o ON o.id = c.order_id
    WHERE c.id = ${capsuleId}::uuid AND c.state IN (${sql.join(states.map((x) => sql`${x}`), sql`, `)}) AND o.status = 'refund_due'
    ON CONFLICT DO NOTHING
    RETURNING seq
  `);
}

/**
 * Closes an unopened capsule — voided, or released — revealing its secret, in
 * one batch with its order and, when money is owed back, the refund entry.
 *
 * `when` is what the order must be for the close to go ahead: not paid (an
 * admin void), paid (a capsule the set could not fill), or pending past its
 * window (a release). The order is then settled in the same transaction: a
 * pending order is cancelled, but a paid one — including one whose payment
 * committed a moment ago, between the capsule's update and this one — becomes
 * refund_due, as does a late payment. A payment is never left silently taken.
 */
async function closeCapsule(
  db: Db,
  c: CapsuleRow,
  input: {
    event: 'voided' | 'released';
    secret: string | null;
    when: 'unpaid' | 'paid' | 'lapsed';
    outcome: Record<string, unknown>;
    refundReason: string;
    late?: LatePayment | null;
  },
): Promise<boolean> {
  const state = input.event === 'voided' ? 'void' : 'released';
  const stamp = sql.raw(input.event === 'voided' ? 'voided_at' : 'released_at');
  const guard: SQL = {
    unpaid: sql`NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = capsule.order_id AND o.status = 'paid')`,
    paid: sql`EXISTS (SELECT 1 FROM orders o WHERE o.id = capsule.order_id AND o.status = 'paid')`,
    lapsed: sql`EXISTS (SELECT 1 FROM orders o WHERE o.id = capsule.order_id AND o.status = 'pending' AND o.expires_at < now())`,
  }[input.when];
  const late = input.late ?? null;
  const reason = late?.short ? 'paid less than the quote' : late ? 'paid after its payment window closed' : input.refundReason;

  const statements = [
    db.execute(sql`
      WITH c AS (
        UPDATE capsule SET state = ${state}, ${stamp} = now(), server_secret = ${input.secret}
        WHERE id = ${c.id}::uuid AND state = ${c.state} AND ${guard}
        RETURNING id, sequence, commitment, buyer_wallet, buyer_nonce, purchase_hash
      )
      INSERT INTO capsule_log (capsule_id, capsule_sequence, event, commitment, buyer_wallet, buyer_nonce, purchase_hash, outcome)
      SELECT id, sequence, ${input.event}, commitment, buyer_wallet, buyer_nonce, purchase_hash, ${JSON.stringify(input.outcome)}::jsonb FROM c
      RETURNING seq
    `),
    ...(c.order_id
      ? [
          db.execute(sql`
            UPDATE orders SET
              status = CASE WHEN status = 'paid' OR ${late !== null}::boolean THEN 'refund_due' ELSE 'cancelled' END,
              signature = COALESCE(signature, ${late?.signature ?? null}),
              paid_at = COALESCE(paid_at, ${late?.paidAt.toISOString() ?? null}::timestamptz)
            WHERE id = ${c.order_id}::uuid AND status IN ('pending', 'paid')
              AND EXISTS (SELECT 1 FROM capsule WHERE id = ${c.id}::uuid AND state = ${state})
            RETURNING status
          `),
          refundLogStatement(db, c.id, [state], reason),
        ]
      : []),
  ];
  const [changed, settled] = await runBatch(db, statements);
  if (c.order_id && settled?.rows[0]?.status === 'refund_due') {
    await alertRefundDue(c.order_id, `capsule ${Number(c.sequence)} ${input.event}: ${reason}`, [late?.signature]);
  }
  return changed.rows.length > 0;
}

/** A payment found on chain for the order, or why the order must not be closed yet. */
async function paymentBeforeClosing(
  db: Db,
  order: OrderRow,
  known?: PaymentCheck,
): Promise<{ late: LatePayment | null; shared?: string[] } | { refuse: 'paid' | 'payment_unknown' }> {
  const payment = known ?? (await findPayment(order, paymentLedger(db)));
  if (payment.paid && !payment.late) {
    const row = await markPaid(db, order.id, payment.signature, payment.paidAt);
    if (order.status === 'pending' && row.status === 'paid') {
      await reportExtraTransfers(order.id, payment.extra);
      await reportSharedTransfers(order.id, payment.shared);
    }
    return { refuse: 'paid' };
  }
  const shared = payment.shared;
  if (payment.paid) return { late: { signature: payment.signature, paidAt: payment.paidAt }, shared };
  // SOL that arrived short of the quote is owed back when the order closes.
  if (payment.partial) return { late: { ...payment.partial, short: true }, shared };
  if (payment.error) return { refuse: 'payment_unknown' };
  return { late: null, shared };
}

export type CloseResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_voidable' | 'not_expired' | 'paid' | 'payment_unknown' };

/**
 * Withdraws a capsule that was never opened, and reveals its secret with the
 * reason. A capsule voided after purchase stays in the log as exactly that.
 *
 * Refused once the capsule is paid — a paid capsule is opened, not voided —
 * and the chain is asked first: an order whose transfer has arrived but was
 * not yet confirmed is marked paid instead, and one that cannot be checked is
 * not voided at all. A transfer that arrived after the window is refunded.
 *
 * A capsule nobody bought whose sealed secret can no longer be read (its seal
 * key is gone) is withdrawn without revealing it: no nonce exists, so no
 * outcome was ever fixed, and the log says the secret was not revealed.
 */
export async function voidCapsule(db: Db, input: { capsuleId: string; reason: string }): Promise<CloseResult> {
  const c = await readCapsule(db, input.capsuleId);
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.state !== 'listed' && c.state !== 'purchased') return { ok: false, reason: 'not_voidable' };

  let late: LatePayment | null = null;
  let shared: string[] | undefined;
  if (c.state === 'purchased' && c.order_id) {
    const order = await readOrder(db, c.order_id);
    if (order?.status === 'paid') return { ok: false, reason: 'paid' };
    if (order) {
      const checked = await paymentBeforeClosing(db, order);
      if ('refuse' in checked) return { ok: false, reason: checked.refuse };
      late = checked.late;
      shared = checked.shared;
    }
  }

  let secret: string | null;
  try {
    secret = unsealSecret(c.server_secret_sealed, c.id);
  } catch (err) {
    if (c.state !== 'listed') throw err;
    secret = null;
  }
  const outcome = { secret, reason: input.reason, priorState: c.state, ...(c.demo ? { demo: true } : {}) };
  const closed = await closeCapsule(db, c, {
    event: 'voided',
    secret,
    when: 'unpaid',
    outcome,
    refundReason: 'paid while the capsule was being voided',
    late,
  });
  if (!closed) return { ok: false, reason: c.order_id ? 'paid' : 'not_voidable' };
  if (c.order_id) await reportSharedTransfers(c.order_id, shared);
  return { ok: true };
}

/**
 * Releases a capsule bought and left unpaid past its payment window. The
 * log gets 'released', keeping the buyer's nonce and revealing the secret, so
 * anyone can compute what it would have held; the order is cancelled.
 *
 * The chain is asked first, as for a void: a payment made inside the window
 * marks the order paid and the capsule stays the buyer's; one made after it
 * is recorded as refund_due in the same batch as the release.
 */
export async function releaseCapsule(
  db: Db,
  capsuleId: string,
  opts: { now?: Date; payment?: PaymentCheck } = {},
): Promise<CloseResult> {
  const now = opts.now ?? new Date();
  const c = await readCapsule(db, capsuleId);
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.state !== 'purchased' || !c.order_id) return { ok: false, reason: 'not_voidable' };
  const order = await readOrder(db, c.order_id);
  if (!order || order.status !== 'pending') return { ok: false, reason: order?.status === 'paid' ? 'paid' : 'not_voidable' };
  // A payment already in hand settles it at once; otherwise the window's close
  // waits out the finality grace, so a transfer sent at the last moment is seen.
  const cutoff = opts.payment ? now.getTime() : now.getTime() - FINALITY_GRACE_MS;
  if (!order.expiresAt || order.expiresAt.getTime() >= cutoff) return { ok: false, reason: 'not_expired' };

  const checked = await paymentBeforeClosing(db, order, opts.payment);
  if ('refuse' in checked) return { ok: false, reason: checked.refuse };

  const secret = unsealSecret(c.server_secret_sealed, c.id);
  const closed = await closeCapsule(db, c, {
    event: 'released',
    secret,
    when: 'lapsed',
    outcome: { secret, reason: 'payment window closed unpaid', expiresAt: order.expiresAt.toISOString() },
    refundReason: 'paid while the capsule was being released',
    late: checked.late,
  });
  if (!closed) return { ok: false, reason: 'not_voidable' };
  await reportSharedTransfers(order.id, checked.shared);
  await relist(db, c);
  return { ok: true };
}

/**
 * A released capsule's place on the shelf, taken again by a new capsule of
 * the same tier and price under a fresh secret and commitment — the released
 * one's secret is public now, so it can never be sold again itself. Taking a
 * capsule and leaving it unpaid then costs the shelf nothing for long. A set
 * with no editions to spare lists nothing.
 */
async function relist(db: Db, c: CapsuleRow): Promise<void> {
  if (c.demo) return;
  const tier = tierByKey(c.tier);
  try {
    await listCapsules(db, { setId: c.set_id, count: 1, ...(tier ? { tier } : { priceUsd: Number(c.price_usd) }) });
  } catch (err) {
    console.error('[skychaser/capsules] relist after release', c.id, err instanceof Error ? err.message : err);
  }
}

/**
 * Releases every capsule whose payment window (and the finality grace after
 * it) has closed unpaid, a bounded number at a time. One capsule that fails is
 * logged and passed over; it never stops the sweep from reaching the rest.
 */
export async function releaseLapsed(db: Db, limit = 25): Promise<Array<{ capsuleId: string; result: CloseResult | { ok: false; reason: 'error' } }>> {
  const { rows } = (await db.execute(sql`
    SELECT c.id FROM capsule c JOIN orders o ON o.id = c.order_id
    WHERE c.state = 'purchased' AND o.status = 'pending'
      AND o.expires_at < now() - make_interval(secs => ${FINALITY_GRACE_MS / 1000})
    ORDER BY c.sequence LIMIT ${limit}
  `)) as Rows<{ id: string }>;
  const out: Array<{ capsuleId: string; result: CloseResult | { ok: false; reason: 'error' } }> = [];
  for (const r of rows) {
    try {
      out.push({ capsuleId: r.id, result: await releaseCapsule(db, r.id) });
    } catch (err) {
      console.error('[skychaser/capsules] release sweep', r.id, err instanceof Error ? err.message : err);
      out.push({ capsuleId: r.id, result: { ok: false, reason: 'error' } });
    }
  }
  return out;
}

/**
 * Capsule orders closed unpaid in the last RECHECK_CLOSED_DAYS, asked again: a
 * transfer final only after the release, or sent after it, is owed back and
 * logged against its capsule. Run by the daily cron.
 */
export async function recheckClosedCapsuleOrders(db: Db, limit = RECHECK_LIMIT): Promise<Array<{ orderId: string; status: string }>> {
  const closed = await db
    .select()
    .from(orders)
    .where(and(
      eq(orders.status, 'cancelled'),
      eq(orders.productId, CAPSULE_PRODUCT_ID),
      or(...recheckWindows().map((w) => and(gt(orders.expiresAt, w.from), lt(orders.expiresAt, w.to)))),
    ))
    .orderBy(asc(orders.expiresAt))
    .limit(limit);
  if (closed.length >= limit) await sendTelegram(`Skychaser: ${limit}+ closed capsule orders to re-check today; the rest were not asked about.`).catch(() => undefined);
  const out: Array<{ orderId: string; status: string }> = [];
  for (const order of closed) {
    try {
      const payment = await findPayment(order, paymentLedger(db));
      const owed = payment.paid ? payment : payment.partial;
      if (!owed) continue;
      const row = await settleCapsulePayment(db, order, { paid: true, signature: owed.signature, paidAt: owed.paidAt, late: true });
      out.push({ orderId: order.id, status: row.status });
    } catch (err) {
      console.error('[skychaser/capsules] closed order re-check', order.id, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/**
 * A capsule order's payment, found on chain, applied: paid when it arrived
 * inside the window and the capsule is still the buyer's; otherwise
 * refund_due, logged against the capsule. A capsule still waiting when a late
 * payment is found is released in the same step. Returns the order after.
 */
export async function settleCapsulePayment(
  db: Db,
  order: OrderRow,
  payment: Extract<PaymentCheck, { paid: true }>,
): Promise<OrderRow> {
  if (!payment.late && order.status === 'pending') {
    const row = await markPaid(db, order.id, payment.signature, payment.paidAt);
    if (row.status !== 'cancelled') return row;
  }
  const { rows } = (await db.execute(sql`
    SELECT ${CAPSULE_COLUMNS} FROM capsule WHERE order_id = ${order.id}::uuid
  `)) as Rows<CapsuleRow>;
  const c = rows[0];
  if (c?.state === 'purchased') {
    await releaseCapsule(db, c.id, { payment: { ...payment, late: true } });
  } else if (c) {
    const reason = payment.late ? 'paid after its payment window closed' : 'paid after the capsule was closed';
    const [settled] = await runBatch(db, [
      db.execute(sql`
        UPDATE orders SET status = 'refund_due', signature = COALESCE(signature, ${payment.signature}),
          paid_at = COALESCE(paid_at, ${payment.paidAt.toISOString()}::timestamptz)
        WHERE id = ${order.id}::uuid AND status IN ('pending', 'cancelled')
        RETURNING status
      `),
      refundLogStatement(db, c.id, ['void', 'released'], reason),
    ]);
    if (settled.rows[0]?.status === 'refund_due') await alertRefundDue(order.id, `capsule ${Number(c.sequence)}: ${reason}`, [payment.signature]);
  }
  return (await readOrder(db, order.id)) ?? order;
}

// ─── The public log ─────────────────────────────────────────────────────────

export const LOG_PAGE_MAX = 1000;

/** One page of the log, oldest first, after `afterSeq`; optionally one capsule's entries only. */
export async function readLog(
  db: Db,
  opts: { afterSeq?: number; limit?: number; capsuleId?: string } = {},
): Promise<LogRow[]> {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? LOG_PAGE_MAX)), LOG_PAGE_MAX);
  const only = opts.capsuleId ? sql`AND capsule_id = ${opts.capsuleId}::uuid` : sql``;
  const { rows } = (await db.execute(sql`
    SELECT seq, capsule_id, capsule_sequence, event, commitment, buyer_wallet, buyer_nonce, purchase_hash, outcome, at
    FROM capsule_log
    WHERE seq > ${Math.max(0, Math.floor(opts.afterSeq ?? 0))} ${only}
    ORDER BY seq
    LIMIT ${limit}
  `)) as Rows<{
    seq: number | string;
    capsule_id: string | null;
    capsule_sequence: number | string | null;
    event: LogRow['event'];
    commitment: string | null;
    buyer_wallet: string | null;
    buyer_nonce: string | null;
    purchase_hash: string | null;
    outcome: unknown;
    at: string | Date;
  }>;
  return rows.map((r) => ({
    seq: Number(r.seq),
    capsuleId: r.capsule_id,
    capsuleSequence: r.capsule_sequence === null ? null : Number(r.capsule_sequence),
    event: r.event,
    commitment: r.commitment,
    buyerWallet: r.buyer_wallet,
    buyerNonce: r.buyer_nonce,
    purchaseHash: r.purchase_hash,
    outcome: r.outcome,
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
  }));
}

/** The whole log, read a page at a time. */
export async function readFullLog(db: Db, opts: { capsuleId?: string } = {}): Promise<LogRow[]> {
  const all: LogRow[] = [];
  for (;;) {
    const page = await readLog(db, { afterSeq: all.at(-1)?.seq ?? 0, limit: LOG_PAGE_MAX, capsuleId: opts.capsuleId });
    all.push(...page);
    if (page.length < LOG_PAGE_MAX) return all;
  }
}
