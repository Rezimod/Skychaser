// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/skychaser/attach';
import { auditLog, type LogRow } from '@/lib/skychaser/audit';
import { SoldOutError, commitmentOf, purchaseHash } from '@/lib/skychaser/randomness';
import { TIERS } from '@/lib/skychaser/tiers';
import { CARDS_PER_CAPSULE } from '@/lib/skychaser/economics';

/** The block the fixtures' capsules were paid in: any 32-byte base58 value. */
const BEACON = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const payments = vi.hoisted(() => ({ findPayment: vi.fn(), markPaid: vi.fn(), paymentBeacon: vi.fn() }));
vi.mock('@/lib/skychaser/orders', async (actual) => ({
  ...(await actual<typeof import('@/lib/skychaser/orders')>()),
  findPayment: payments.findPayment,
  markPaid: payments.markPaid,
  paymentBeacon: payments.paymentBeacon,
}));
beforeEach(() => {
  payments.paymentBeacon.mockReset().mockImplementation(async (signature: string) => ({ signature, slot: 1, blockhash: BEACON }));
});
import { listCapsules, openCapsule, releaseCapsule, sealSecret, settleCapsulePayment, voidCapsule } from '@/lib/skychaser/capsule';

/**
 * An in-memory Postgres, just faithful enough to race in.
 *
 * It reads the statements capsule.ts actually builds. A batch is one
 * transaction: it takes a snapshot when it starts, yields so that other
 * batches can start and commit in between, computes every MAX()+1 from its
 * snapshot plus its own writes — exactly the window in which two openings
 * pick the same edition number — and at commit checks the unique indexes
 * against what is committed by then. A collision rolls the whole batch back
 * with 23505; a HAVING that finds the card sold out leaves a NULL in a NOT
 * NULL column, 23502. That is the behaviour the design relies on.
 */
type Capsule = {
  id: string; set_id: string; sequence: number; commitment: string; server_secret_sealed: string;
  server_secret: string | null; state: string; price_usd: number; cards_per_capsule: number;
  buyer_wallet: string | null; buyer_nonce: string | null; purchase_hash: string | null; order_id: string | null;
  demo?: boolean; tier?: string | null; odds_bps?: unknown;
};
type Order = { id: string; status: string; expiresAt: Date | null; signature: string | null; paidAt: Date | null; amountSol: number; paymentReference: string };
type Card = { id: string; set_id: string; designation: string; name: string; rarity: string; edition_size: number };
type Edition = { id: string; card_id: string; edition_number: number; capsule_id: string | null };
type Pull = { capsule_id: string; draw_index: number; edition_id: string; card_id: string; rarity: string };
type State = {
  capsules: Capsule[]; cards: Card[]; editions: Edition[]; pulls: Pull[]; log: LogRow[]; orders?: Order[];
  /** Runs inside a batch after its first statement: another transaction committing mid-batch. */
  midBatch?: (tx: State) => void;
};

const pgError = (code: string) => Object.assign(new Error(`pg ${code}`), { code });
const dialect = new PgDialect();
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 4));

function fakePostgres(state: State) {
  let logSeq = 0;
  const stats = { batches: 0, rolledBack: 0 };
  const clone = (s: State): State => structuredClone({ ...s, midBatch: undefined });
  const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
  const maxNumber = (s: State, cardId: string) => Math.max(0, ...s.editions.filter((e) => e.card_id === cardId).map((e) => e.edition_number));

  function read(sql: string, params: unknown[], s: State): { rows: unknown[] } {
    if (sql.includes('FROM capsule WHERE id =') && sql.includes('server_secret_sealed')) {
      return { rows: s.capsules.filter((c) => same(c.id, params[0])) };
    }
    if (sql.includes('FROM capsule WHERE order_id =')) {
      return { rows: s.capsules.filter((c) => c.order_id === params[0]) };
    }
    if (sql.includes('SELECT c.id, c.designation')) {
      return {
        rows: s.cards.filter((c) => c.set_id === params[0]).map((c) => ({ ...c, allocated: maxNumber(s, c.id) })),
      };
    }
    if (sql.includes('SELECT p.draw_index')) {
      const rows = s.pulls
        .filter((p) => p.capsule_id === params[0])
        .sort((a, b) => a.draw_index - b.draw_index)
        .map((p) => {
          const card = s.cards.find((c) => c.id === p.card_id)!;
          const e = s.editions.find((x) => x.id === p.edition_id)!;
          return { draw_index: p.draw_index, designation: card.designation, name: card.name, rarity: p.rarity, edition_number: e.edition_number, edition_size: card.edition_size };
        });
      return { rows };
    }
    if (sql.includes('SUM(cards_per_capsule)')) {
      const owed = s.capsules.filter((c) => c.set_id === params[0] && (c.state === 'listed' || c.state === 'purchased'));
      return { rows: [{ draws: owed.reduce((n, c) => n + c.cards_per_capsule, 0) }] };
    }
    throw new Error(`unexpected read: ${sql}`);
  }

  /** Applies one write to the transaction's working copy; returns its rows. */
  function write(sql: string, p: unknown[], tx: State): { rows: unknown[] } {
    if (/INSERT INTO capsule \(id, set_id, sequence/.test(sql)) {
      const [id, setId, commitment, sealed, price, perCapsule, , tier, odds, outcome] = p as [string, string, string, string, number, number, boolean, string | null, string | null, string | null];
      const sequence = Math.max(0, ...tx.capsules.map((c) => c.sequence)) + 1;
      tx.capsules.push({ id, set_id: setId, sequence, commitment, server_secret_sealed: sealed, server_secret: null, state: 'listed', price_usd: price, cards_per_capsule: perCapsule, buyer_wallet: null, buyer_nonce: null, purchase_hash: null, order_id: null, tier, odds_bps: odds ? JSON.parse(odds) : null });
      tx.log.push({ seq: 0, capsuleId: id, capsuleSequence: sequence, event: 'listed', commitment, buyerWallet: null, buyerNonce: null, purchaseHash: null, outcome: outcome ? JSON.parse(outcome) : null, at: '' });
      return { rows: [{ capsule_id: id, capsule_sequence: sequence }] };
    }
    if (/^\s*UPDATE capsule SET state = 'opened'/.test(sql)) {
      const [secret, id] = p as [string, string];
      const c = tx.capsules.find((x) => x.id === id && x.state === 'purchased');
      if (!c) return { rows: [] };
      c.state = 'opened';
      c.server_secret = secret;
      return { rows: [{ id }] };
    }
    if (/INSERT INTO edition \(card_id, edition_number, owner_wallet, capsule_id/.test(sql)) {
      const [cardId, number, , capsuleId] = p as [string, number, string, string];
      const expectedMax = p[6] as number;
      const drawIndex = p[10] as number;
      const rarity = p[12] as string;
      const card = tx.cards.find((c) => c.id === cardId)!;
      const fits = maxNumber(tx, cardId) === expectedMax && number <= card.edition_size;
      const edition = fits ? { id: randomUUID(), card_id: cardId, edition_number: number, capsule_id: capsuleId } : null;
      if (edition) tx.editions.push(edition);
      const opened = tx.capsules.find((c) => c.id === capsuleId && c.state === 'opened');
      if (!edition || !opened) throw pgError('23502');
      if (tx.pulls.some((x) => x.capsule_id === capsuleId && x.draw_index === drawIndex)) throw pgError('23505');
      tx.pulls.push({ capsule_id: capsuleId, draw_index: drawIndex, edition_id: edition.id, card_id: cardId, rarity });
      return { rows: [{ id: randomUUID() }] };
    }
    if (/INSERT INTO capsule_log[\s\S]*'opened'/.test(sql)) {
      const [draws, odds, supply, extra, id] = p as [number, string, string, string, string];
      const c = tx.capsules.find((x) => x.id === id && x.state === 'opened');
      if (!c) return { rows: [] };
      const pulls = tx.pulls
        .filter((x) => x.capsule_id === id)
        .sort((a, b) => a.draw_index - b.draw_index)
        .map((x) => ({
          drawIndex: x.draw_index,
          designation: tx.cards.find((k) => k.id === x.card_id)!.designation,
          rarity: x.rarity,
          editionNumber: tx.editions.find((e) => e.id === x.edition_id)!.edition_number,
        }));
      tx.log.push({
        seq: 0, capsuleId: id, capsuleSequence: c.sequence, event: 'opened', commitment: c.commitment,
        buyerWallet: c.buyer_wallet, buyerNonce: c.buyer_nonce, purchaseHash: c.purchase_hash,
        outcome: { secret: c.server_secret, draws, oddsBps: JSON.parse(odds), supply: JSON.parse(supply), pulls, ...JSON.parse(extra) }, at: '',
      });
      return { rows: [{ seq: 0 }] };
    }
    if (/^\s*WITH c AS \(\s*UPDATE capsule SET state = /.test(sql)) {
      const [next, secret, id, prior, event, outcome] = p as [string, string | null, string, string, LogRow['event'], string];
      const c = tx.capsules.find((x) => x.id === id && x.state === prior);
      const order = tx.orders?.find((o) => o.id === c?.order_id);
      const guard = /o\.expires_at < now\(\)/.test(sql)
        ? order?.status === 'pending' && order.expiresAt!.getTime() < Date.now()
        : /NOT EXISTS \(SELECT 1 FROM orders o WHERE o\.id = capsule\.order_id AND o\.status = 'paid'\)/.test(sql)
          ? order?.status !== 'paid'
          : order?.status === 'paid';
      if (!c || !guard) return { rows: [] };
      c.state = next;
      c.server_secret = secret;
      tx.log.push({ seq: 0, capsuleId: id, capsuleSequence: c.sequence, event, commitment: c.commitment, buyerWallet: c.buyer_wallet, buyerNonce: c.buyer_nonce, purchaseHash: c.purchase_hash, outcome: JSON.parse(outcome), at: '' });
      return { rows: [{ seq: 0 }] };
    }
    if (/^\s*UPDATE orders SET\s+status = CASE/.test(sql)) {
      const [late, sig, paidAt, orderId, capsuleId, closed] = p as [boolean, string | null, string | null, string, string, string];
      const o = tx.orders?.find((x) => x.id === orderId && (x.status === 'pending' || x.status === 'paid'));
      if (!o || !tx.capsules.some((c) => c.id === capsuleId && c.state === closed)) return { rows: [] };
      o.status = o.status === 'paid' || late ? 'refund_due' : 'cancelled';
      o.signature ??= sig;
      o.paidAt ??= paidAt ? new Date(paidAt) : null;
      return { rows: [{ status: o.status }] };
    }
    if (/^\s*UPDATE orders SET status = 'refund_due'/.test(sql)) {
      const [sig, paidAt, orderId] = p as [string, string, string];
      const o = tx.orders?.find((x) => x.id === orderId && (x.status === 'pending' || x.status === 'cancelled'));
      if (!o) return { rows: [] };
      Object.assign(o, { status: 'refund_due', signature: o.signature ?? sig, paidAt: o.paidAt ?? new Date(paidAt) });
      return { rows: [{ status: o.status }] };
    }
    if (/INSERT INTO capsule_log[\s\S]*'refund_due'/.test(sql)) {
      const [reason, capsuleId, ...states] = p as string[];
      const c = tx.capsules.find((x) => x.id === capsuleId && states.includes(x.state));
      const o = tx.orders?.find((x) => x.id === c?.order_id && x.status === 'refund_due');
      if (!c || !o || tx.log.some((r) => r.capsuleId === c.id && r.event === 'refund_due')) return { rows: [] };
      tx.log.push({
        seq: 0, capsuleId: c.id, capsuleSequence: c.sequence, event: 'refund_due', commitment: c.commitment, buyerWallet: c.buyer_wallet,
        buyerNonce: c.buyer_nonce, purchaseHash: c.purchase_hash,
        outcome: { reason, paidAt: o.paidAt?.toISOString() ?? null, expiresAt: o.expiresAt?.toISOString() ?? null }, at: '',
      });
      return { rows: [{ seq: 0 }] };
    }
    throw new Error(`unexpected write: ${sql}`);
  }

  /** Commits the transaction's changes onto what is committed now, or refuses as Postgres would. */
  function commit(start: State, tx: State) {
    const fresh = <T,>(after: T[], before: T[]) => after.slice(before.length);
    const editions = fresh(tx.editions, start.editions);
    const pulls = fresh(tx.pulls, start.pulls);
    const capsules = fresh(tx.capsules, start.capsules);
    for (const e of editions) {
      if (state.editions.some((x) => x.card_id === e.card_id && x.edition_number === e.edition_number)) throw pgError('23505');
    }
    for (const x of pulls) {
      if (state.pulls.some((y) => y.capsule_id === x.capsule_id && y.draw_index === x.draw_index)) throw pgError('23505');
    }
    for (const c of capsules) if (state.capsules.some((y) => y.sequence === c.sequence)) throw pgError('23505');
    // A row this transaction updated that someone else changed since its snapshot.
    for (const c of tx.capsules.slice(0, start.capsules.length)) {
      const before = start.capsules.find((x) => x.id === c.id)!;
      const now = state.capsules.find((x) => x.id === c.id)!;
      if (c.state !== before.state && now.state !== before.state) throw pgError('23505');
    }

    state.editions.push(...editions);
    state.pulls.push(...pulls);
    state.capsules.push(...capsules);
    for (const c of tx.capsules.slice(0, start.capsules.length)) {
      if (c.state !== start.capsules.find((x) => x.id === c.id)!.state) Object.assign(state.capsules.find((x) => x.id === c.id)!, c);
    }
    for (const o of tx.orders ?? []) Object.assign(state.orders!.find((x) => x.id === o.id)!, o);
    for (const row of fresh(tx.log, start.log)) state.log.push({ ...row, seq: ++logSeq, at: new Date().toISOString() });
  }

  const statement = (query: SQL) => {
    const { sql, params } = dialect.sqlToQuery(query);
    return { sql, params, then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve().then(() => read(sql, params, state)).then(ok, fail) };
  };

  // Orders are read with drizzle's builder; each scenario here has one order.
  // Scenarios without one read a paid order whose transfer is 'paid-sig'.
  const select = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where']) chain[m] = () => chain;
    chain.limit = async () => structuredClone(state.orders ?? [{ status: 'paid', signature: 'paid-sig' }]);
    return chain;
  };

  const db = {
    execute: statement,
    select,
    batch: async (items: Array<{ sql: string; params: unknown[] }>) => {
      stats.batches++;
      const start = clone(state);
      const tx = clone(state);
      await tick();
      try {
        const results = items.map((q, i) => {
          if (i === 1 && state.midBatch) state.midBatch(tx);
          return write(q.sql, q.params, tx);
        });
        await tick();
        commit(start, tx);
        return results;
      } catch (err) {
        stats.rolledBack++;
        throw err;
      }
    },
  } as unknown as Db;
  return { db, stats };
}

const SET = '00000000-0000-4000-8000-000000000501';

function card(designation: string, rarity: string, size: number): Card {
  return { id: randomUUID(), set_id: SET, designation, name: designation, rarity, edition_size: size };
}

/** Capsules already bought: listed and purchased are other tests' business here. */
function purchased(n: number, from = 1): Capsule[] {
  return Array.from({ length: n }, (_, i) => {
    const id = randomUUID();
    const secret = createHash('sha256').update(`secret-${from + i}`).digest('hex');
    const commitment = commitmentOf(secret);
    const wallet = `holder-${from + i}`;
    const nonce = createHash('sha256').update(`nonce-${from + i}`).digest('hex');
    return {
      id, set_id: SET, sequence: from + i, commitment, server_secret_sealed: sealSecret(secret, id),
      server_secret: null, state: 'purchased', price_usd: 39, cards_per_capsule: 3, buyer_wallet: wallet,
      buyer_nonce: nonce, purchase_hash: purchaseHash({ capsuleId: id, sequence: from + i, commitment, wallet, nonce }), order_id: randomUUID(),
    };
  });
}

/** The 'listed' and 'purchased' entries the fixtures' capsules would already have. */
function earlierEntries(capsules: Capsule[]): LogRow[] {
  return capsules.flatMap((c) => [
    { seq: -c.sequence * 2 - 1, capsuleId: c.id, capsuleSequence: c.sequence, event: 'listed' as const, commitment: c.commitment, buyerWallet: null, buyerNonce: null, purchaseHash: null, outcome: null, at: '' },
    { seq: -c.sequence * 2, capsuleId: c.id, capsuleSequence: c.sequence, event: 'purchased' as const, commitment: c.commitment, buyerWallet: c.buyer_wallet, buyerNonce: c.buyer_nonce, purchaseHash: c.purchase_hash, outcome: null, at: '' },
  ]).sort((a, b) => a.seq - b.seq);
}

function numbersByCard(state: State) {
  const by = new Map<string, number[]>();
  for (const e of state.editions) by.set(e.card_id, [...(by.get(e.card_id) ?? []), e.edition_number]);
  return [...by.values()].map((n) => n.sort((a, b) => a - b));
}

beforeAll(() => {
  process.env.CAPSULE_SEAL_KEY = 'ab'.repeat(32);
});

describe('opening capsules at the same moment', () => {
  it('hands out unique, gapless edition numbers, and every opening verifies', async () => {
    // Few cards and many openings, so nearly every opening collides with another.
    const cards = [card('C1', 'common', 60), card('C2', 'common', 60), card('R1', 'rare', 20), card('E1', 'epic', 6), card('L1', 'legendary', 2)];
    const state: State = { capsules: purchased(24), cards, editions: [], pulls: [], log: [] };
    const { db, stats } = fakePostgres(state);

    const first = await Promise.allSettled(state.capsules.map((c) => openCapsule(db, c.id)));
    expect(stats.rolledBack).toBeGreaterThan(0);

    // Under this much contention an opening may run out of retries. It must
    // then have written nothing: its capsule is still purchased, with no pulls
    // and no editions, and the numbers the others took are still gapless.
    const gaveUp = state.capsules.filter((_, i) => first[i].status === 'rejected');
    for (const c of gaveUp) {
      expect(c.state).toBe('purchased');
      expect(state.pulls.some((p) => p.capsule_id === c.id)).toBe(false);
      expect(state.editions.some((e) => e.capsule_id === c.id)).toBe(false);
    }
    for (const numbers of numbersByCard(state)) {
      expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
    }
    // And the holder simply opens it again.
    for (const c of gaveUp) expect(await openCapsule(db, c.id)).toMatchObject({ ok: true, alreadyOpened: false });

    expect(state.editions).toHaveLength(24 * 3);
    expect(state.pulls).toHaveLength(24 * 3);
    for (const numbers of numbersByCard(state)) {
      expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
    }
    for (const c of cards) expect(state.editions.filter((e) => e.card_id === c.id).length).toBeLessThanOrEqual(c.edition_size);
    expect(state.capsules.every((c) => c.state === 'opened')).toBe(true);

    // Every opened capsule's log entry re-derives to exactly what was allocated.
    const opened = state.log.filter((r) => r.event === 'opened');
    expect(opened).toHaveLength(24);
    const audit = auditLog([...earlierEntries(state.capsules), ...state.log]);
    expect(audit.flags).toEqual([]);
    expect(audit.notes).toEqual([]);
    expect(audit.verified).toBe(24);
  });

  it('draws against the supply left, down to the last edition', async () => {
    // Exactly as many editions as draws: the last openings must take what the first left.
    const cards = [card('C1', 'common', 9), card('R1', 'rare', 3), card('E1', 'epic', 2), card('L1', 'legendary', 1)];
    const state: State = { capsules: purchased(5), cards, editions: [], pulls: [], log: [] };
    const { db } = fakePostgres(state);

    const first = await Promise.allSettled(state.capsules.map((c) => openCapsule(db, c.id)));
    for (const [i, c] of state.capsules.entries()) if (first[i].status === 'rejected') await openCapsule(db, c.id);

    expect(state.editions).toHaveLength(15);
    for (const c of cards) expect(state.editions.filter((e) => e.card_id === c.id)).toHaveLength(c.edition_size);
    for (const numbers of numbersByCard(state)) expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
  });

  it('opens a capsule once when it is opened twice at once', async () => {
    const cards = [card('C1', 'common', 50), card('R1', 'rare', 50), card('E1', 'epic', 50), card('L1', 'legendary', 50)];
    const state: State = { capsules: purchased(1), cards, editions: [], pulls: [], log: [] };
    const { db } = fakePostgres(state);

    const [a, b] = await Promise.all([openCapsule(db, state.capsules[0].id), openCapsule(db, state.capsules[0].id)]);

    expect(state.pulls).toHaveLength(3);
    expect(state.editions).toHaveLength(3);
    expect(state.log.filter((r) => r.event === 'opened')).toHaveLength(1);
    expect(a.ok && b.ok && a.pulls).toEqual(b.ok && b.pulls);
    expect([a, b].filter((r) => r.ok && r.alreadyOpened)).toHaveLength(1);
  });

  it('draws and logs under the capsule row’s own id, whatever case the caller used', async () => {
    const cards = [card('C1', 'common', 50), card('R1', 'rare', 50), card('E1', 'epic', 50), card('L1', 'legendary', 50)];
    const state: State = { capsules: purchased(1), cards, editions: [], pulls: [], log: [] };
    const { db } = fakePostgres(state);
    const id = state.capsules[0].id;

    expect(await openCapsule(db, id.toUpperCase())).toMatchObject({ ok: true, alreadyOpened: false });
    expect(state.log.map((r) => r.capsuleId)).toEqual([id]);
    expect(state.pulls.every((p) => p.capsule_id === id)).toBe(true);
    expect(auditLog([...earlierEntries(state.capsules), ...state.log]).verified).toBe(1);
  });

  it('refuses a capsule that was never bought', async () => {
    const cards = [card('C1', 'common', 5)];
    const [c] = purchased(1);
    const state: State = { capsules: [{ ...c, state: 'listed', buyer_wallet: null, buyer_nonce: null }], cards, editions: [], pulls: [], log: [] };
    const { db } = fakePostgres(state);
    expect(await openCapsule(db, c.id)).toEqual({ ok: false, reason: 'not_purchased' });
    expect(state.editions).toHaveLength(0);
  });
});

describe('listing capsules at the same moment', () => {
  it('numbers them 1, 2, 3 … with no gap and no repeat, each logged as listed', async () => {
    const cards = [card('C1', 'common', 1000)];
    const state: State = { capsules: [], cards, editions: [], pulls: [], log: [] };
    const { db, stats } = fakePostgres(state);

    await Promise.all(Array.from({ length: 6 }, () => listCapsules(db, { setId: SET, count: 3 })));

    const sequences = state.capsules.map((c) => c.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(stats.rolledBack).toBeGreaterThan(0);
    expect(state.log.filter((r) => r.event === 'listed').map((r) => Number(r.capsuleSequence)).sort((a, b) => a - b)).toEqual(sequences);
    expect(auditLog(state.log).flags).toEqual([]);
  });

  it('refuses to list more capsules than the set has editions for', async () => {
    // Seven editions: three are owed to the bought capsule, so four are free; one capsule more than four fit.
    const state: State = { capsules: purchased(1), cards: [card('C1', 'common', 7)], editions: [], pulls: [], log: [] };
    const { db } = fakePostgres(state);
    await expect(listCapsules(db, { setId: SET, count: Math.floor(4 / CARDS_PER_CAPSULE) + 1 })).rejects.toThrow(/Not enough editions/);
    await expect(listCapsules(db, { setId: SET, count: 1 })).resolves.toHaveLength(1);
  });
});

describe('capsules listed as a tier', () => {
  it('open under the odds logged at listing, and the log verifies', async () => {
    const lunar = TIERS.find((t) => t.key === 'lunar')!;
    const cards = [card('C1', 'common', 500), card('R1', 'rare', 500), card('E1', 'epic', 500), card('L1', 'legendary', 500)];
    const state: State = { capsules: [], cards, editions: [], pulls: [], log: [] };
    const { db } = fakePostgres(state);

    const listed = await listCapsules(db, { setId: SET, count: 12, tier: lunar });
    expect(state.capsules.every((c) => c.price_usd === lunar.priceUsd && c.tier === 'lunar')).toBe(true);
    expect(state.log[0].outcome).toEqual({ tier: 'lunar', oddsBps: lunar.oddsBps });

    for (const [i, c] of state.capsules.entries()) {
      const nonce = createHash('sha256').update(`tier-nonce-${i}`).digest('hex');
      const wallet = `holder-${i}`;
      Object.assign(c, { state: 'purchased', buyer_wallet: wallet, buyer_nonce: nonce, order_id: randomUUID(), purchase_hash: purchaseHash({ capsuleId: c.id, sequence: c.sequence, commitment: c.commitment, wallet, nonce }) });
      state.log.push({ seq: 0, capsuleId: c.id, capsuleSequence: c.sequence, event: 'purchased', commitment: c.commitment, buyerWallet: wallet, buyerNonce: nonce, purchaseHash: c.purchase_hash, outcome: null, at: '' });
    }
    for (const c of listed) await openCapsule(db, c.id);

    // Lunar gives no common: every draw of the twelve capsules, and not one.
    expect(state.pulls).toHaveLength(12 * CARDS_PER_CAPSULE);
    expect(state.pulls.some((p) => p.rarity === 'common')).toBe(false);
    const opened = state.log.filter((r) => r.event === 'opened');
    expect(opened.every((r) => JSON.stringify((r.outcome as { oddsBps: unknown }).oddsBps) === JSON.stringify(lunar.oddsBps))).toBe(true);
    const ordered = () => state.log.map((r, i) => ({ ...r, seq: i + 1 }));
    const clean = auditLog(ordered());
    expect(clean.flags).toEqual([]);
    expect(clean.verified).toBe(12);

    // An opening logged under other odds than were listed is flagged.
    const swapped = ordered().map((r) => r.event === 'opened' && r.capsuleId === listed[0].id
      ? { ...r, outcome: { ...(r.outcome as object), oddsBps: { common: 7570, rare: 1960, epic: 420, legendary: 50 } } }
      : r);
    expect(auditLog(swapped).flags.map((f) => f.kind)).toContain('odds_changed');
  });
});

describe('the paying block', () => {
  it('is mixed into the draws: another block, other cards, and the log says which block', async () => {
    const run = async (blockhash: string) => {
      const cards = [card('C1', 'common', 500), card('R1', 'rare', 500), card('E1', 'epic', 500), card('L1', 'legendary', 500)];
      const capsules = purchased(8);
      const state: State = { capsules, cards, editions: [], pulls: [], log: [] };
      const { db } = fakePostgres(state);
      payments.paymentBeacon.mockImplementation(async (signature: string) => ({ signature, slot: 7, blockhash }));
      for (const c of capsules) await openCapsule(db, c.id);
      return { state, pulls: state.pulls.map((p) => p.card_id).join() };
    };
    const a = await run(BEACON);
    const b = await run('11111111111111111111111111111111');
    expect(a.pulls).not.toEqual(b.pulls);
    const opened = a.state.log.filter((r) => r.event === 'opened');
    expect(opened.every((r) => (r.outcome as { beacon?: unknown }).beacon !== undefined)).toBe(true);
    expect((opened[0].outcome as { beacon: unknown }).beacon).toEqual({ signature: 'paid-sig', slot: 7, blockhash: BEACON });
    // Each opening still verifies from the log alone, beacon included.
    const report = auditLog([...earlierEntries(a.state.capsules), ...a.state.log]);
    expect(report.flags).toEqual([]);
    expect(report.verified).toBe(8);
  });

  it('is not asked for a capsule paid in a rehearsal, which moved no money', async () => {
    const [c] = purchased(1);
    const state: State = {
      capsules: [c], cards: [card('C1', 'common', 50)], editions: [], pulls: [], log: [],
      orders: [{ id: c.order_id!, status: 'paid', expiresAt: new Date(), signature: 'simulated-no-payment:ref', paidAt: null, amountSol: 0.1, paymentReference: 'ref' }],
    };
    const { db } = fakePostgres(state);
    await openCapsule(db, c.id);
    expect(payments.paymentBeacon).not.toHaveBeenCalled();
    expect((state.log.find((r) => r.event === 'opened')!.outcome as { beacon?: unknown }).beacon).toBeUndefined();
  });

  it('is never skipped for a capsule paid on chain: no block, no opening', async () => {
    const [c] = purchased(1);
    const state: State = { capsules: [c], cards: [card('C1', 'common', 50)], editions: [], pulls: [], log: [] };
    const { db } = fakePostgres(state);
    payments.paymentBeacon.mockRejectedValue(new Error('fetch failed'));
    await expect(openCapsule(db, c.id)).rejects.toThrow('fetch failed');
    expect(state.capsules[0].state).toBe('purchased');
    expect(state.log).toEqual([]);
  });
});

describe('closing a capsule without taking a payment silently', () => {
  const cards = () => [card('C1', 'common', 50), card('R1', 'rare', 50), card('E1', 'epic', 50), card('L1', 'legendary', 50)];
  function bought(status: string, expiresInMs: number) {
    const [c] = purchased(1);
    const order: Order = {
      id: c.order_id!, status, expiresAt: new Date(Date.now() + expiresInMs), signature: status === 'paid' ? 'paid-sig' : null, paidAt: null, amountSol: 0.1, paymentReference: 'ref',
    };
    const state: State = { capsules: [c], cards: cards(), editions: [], pulls: [], log: [], orders: [order] };
    return { state, c, order: state.orders![0], ...fakePostgres(state) };
  }
  const events = (state: State) => state.log.map((r) => r.event);
  const audit = (state: State) => auditLog([...earlierEntries(state.capsules), ...state.log]);

  beforeEach(() => {
    payments.findPayment.mockReset().mockResolvedValue({ paid: false });
    payments.markPaid.mockReset().mockImplementation(async (_db, id: string, signature: string) => ({ id, status: 'paid', signature }));
  });

  it('refuses to void a bought capsule whose transfer has arrived, and marks it paid instead', async () => {
    const { db, state, c } = bought('pending', 60_000);
    payments.findPayment.mockResolvedValue({ paid: true, signature: 'sig', paidAt: new Date(), late: false });
    expect(await voidCapsule(db, { capsuleId: c.id, reason: 'admin' })).toEqual({ ok: false, reason: 'paid' });
    expect(payments.markPaid).toHaveBeenCalledWith(db, c.order_id, 'sig', expect.any(Date));
    expect(state.capsules[0].state).toBe('purchased');
    expect(state.log).toEqual([]);
  });

  it('refuses to void when the chain cannot be asked', async () => {
    const { db, state, c } = bought('pending', 60_000);
    payments.findPayment.mockResolvedValue({ paid: false, error: 'The Solana network could not be reached', status: 503 });
    expect(await voidCapsule(db, { capsuleId: c.id, reason: 'admin' })).toEqual({ ok: false, reason: 'payment_unknown' });
    expect(state.capsules[0].state).toBe('purchased');
  });

  it('turns a payment that commits in the middle of a void into a refund due, logged', async () => {
    const { db, state, c } = bought('pending', 60_000);
    state.midBatch = (tx) => {
      // The confirmation's pending → paid lands between the capsule's update and the order's.
      tx.orders![0].status = 'paid';
      state.orders![0].status = 'paid';
    };
    expect(await voidCapsule(db, { capsuleId: c.id, reason: 'admin' })).toEqual({ ok: true });
    expect(state.capsules[0].state).toBe('void');
    expect(state.orders![0].status).toBe('refund_due');
    expect(events(state)).toEqual(['voided', 'refund_due']);
    expect(audit(state).flags.map((f) => f.kind)).toEqual(['voided_after_purchase']);
  });

  it('records a payment that arrives for a capsule already voided as a refund due, logged', async () => {
    const { db, state, c, order } = bought('pending', 60_000);
    expect(await voidCapsule(db, { capsuleId: c.id, reason: 'admin' })).toEqual({ ok: true });
    expect(state.orders![0].status).toBe('cancelled');

    payments.markPaid.mockImplementation(async () => ({ ...state.orders![0] }));
    const after = await settleCapsulePayment(db, { ...order, status: 'cancelled' } as never, { paid: true, signature: 'sig', paidAt: new Date(), late: false });
    expect(after.status).toBe('refund_due');
    expect(events(state)).toEqual(['voided', 'refund_due']);
    expect(state.log[1].outcome).toMatchObject({ reason: 'paid after the capsule was closed' });
  });

  it('voids a capsule its set cannot fill, marks the payment refund_due and logs both', async () => {
    const { db, state, c } = bought('paid', 60_000);
    state.cards = [card('C1', 'common', 1), card('R1', 'rare', 1)];
    await expect(openCapsule(db, c.id)).rejects.toBeInstanceOf(SoldOutError);
    expect(state.capsules[0].state).toBe('void');
    expect(state.orders![0].status).toBe('refund_due');
    expect(events(state)).toEqual(['voided', 'refund_due']);
    const a = audit(state);
    expect(a.flags).toEqual([]);
    expect(a.notes.map((n) => n.kind).sort()).toEqual(['refund_due', 'voided_sold_out']);
  });

  it('releases a capsule left unpaid past its window, as released and not voided', async () => {
    const { db, state, c } = bought('pending', -180_000);
    expect(await releaseCapsule(db, c.id)).toEqual({ ok: true });
    expect(state.capsules[0].state).toBe('released');
    expect(state.orders![0].status).toBe('cancelled');
    // Its place on the shelf is taken by a new capsule, under a new commitment.
    expect(events(state)).toEqual(['released', 'listed']);
    const relisted = state.capsules[1];
    expect(relisted).toMatchObject({ state: 'listed', set_id: c.set_id, price_usd: c.price_usd });
    expect(relisted.commitment).not.toBe(c.commitment);
    expect(state.log[0].buyerNonce).toBe(c.buyer_nonce);
    // The released capsule's own history; the new one has only its listing so far.
    const purchasedEntry = earlierEntries([state.capsules[0]]).map((r) => (r.event === 'purchased'
      ? { ...r, outcome: { expiresAt: state.orders![0].expiresAt!.toISOString() } } : r));
    const a = auditLog([...purchasedEntry, ...state.log.map((r) => ({ ...r, at: new Date().toISOString() }))]);
    expect(a.flags).toEqual([]);
    expect(a.notes.map((n) => n.kind)).toEqual(['released_unpaid']);
  });

  it('does not release inside the window, nor a capsule paid in time', async () => {
    const early = bought('pending', 60_000);
    expect(await releaseCapsule(early.db, early.c.id)).toEqual({ ok: false, reason: 'not_expired' });

    // Past the window but inside the finality grace: a transfer sent at the
    // last moment may not be final yet, so the capsule is not released.
    const grace = bought('pending', -60_000);
    expect(await releaseCapsule(grace.db, grace.c.id)).toEqual({ ok: false, reason: 'not_expired' });

    const paid = bought('pending', -180_000);
    payments.findPayment.mockResolvedValue({ paid: true, signature: 'sig', paidAt: new Date(Date.now() - 120_000), late: false });
    expect(await releaseCapsule(paid.db, paid.c.id)).toEqual({ ok: false, reason: 'paid' });
    expect(payments.markPaid).toHaveBeenCalled();
    expect(paid.state.log).toEqual([]);
  });

  it('releases with a refund due when the payment landed after the window', async () => {
    const { db, state, c } = bought('pending', -180_000);
    const paidAt = new Date(Date.now() - 1_000);
    payments.findPayment.mockResolvedValue({ paid: true, signature: 'late-sig', paidAt, late: true });
    expect(await releaseCapsule(db, c.id)).toEqual({ ok: true });
    expect(state.orders![0]).toMatchObject({ status: 'refund_due', signature: 'late-sig' });
    expect(events(state)).toEqual(['released', 'refund_due', 'listed']);
    expect(state.log[1].outcome).toMatchObject({ reason: 'paid after its payment window closed', paidAt: paidAt.toISOString() });
  });
});
