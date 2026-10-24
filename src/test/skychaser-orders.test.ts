// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pay = vi.hoisted(() => ({ signatures: vi.fn(), transaction: vi.fn(), telegram: vi.fn() }));
vi.mock('@solana/web3.js', async (actual) => {
  const real = await actual<typeof import('@solana/web3.js')>();
  class Connection {
    getSignaturesForAddress = pay.signatures;
    getTransaction = pay.transaction;
  }
  return { ...real, Connection };
});
vi.mock('@/lib/telegram', () => ({ sendTelegram: pay.telegram }));
import type { Db } from '@/lib/skychaser/attach';
import { PublicKey } from '@solana/web3.js';
import { findPayment, fulfilCardOrder, fulfilPaidCardOrders, grantPaidCredits, markPaid, paymentNetworkProblem, recheckClosedCardOrders, recheckPaidOrders, recheckWindows, reportExtraTransfers, settleCardOrders, unpaidRehearsal, usdToSol, orderHash, type OrderRow } from '@/lib/skychaser/orders';
import { SolPriceUnavailableError, SOL_PRICE_FALLBACK, fetchSolPriceRates } from '@/lib/sol-price';

const MERCHANT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const NO_SHARED = { sharedWith: async () => false };
const REFERENCE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const EXPIRES = new Date('2026-09-20T12:15:00Z');

const order = (extra: Partial<OrderRow> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000aa', amountSol: 0.1, paymentReference: REFERENCE, expiresAt: EXPIRES, ...extra,
}) as OrderRow;

const sig = (signature: string, iso: string | null, err: unknown = null) => ({ signature, blockTime: iso ? Math.floor(Date.parse(iso) / 1000) : null, err });
const MERCHANT_REF = 'GvpCiTgq9dmEeojCDBivoLoZqc4AkbUDACpqPMwYLWKh';

/** A finalized transaction carrying the reference, in which the merchant gained `lamports`. */
const tx = (lamports: number, opts: { err?: unknown; reference?: boolean; also?: string; blockTime?: number | null } = {}) => {
  const keys = [new PublicKey('11111111111111111111111111111111'), new PublicKey(MERCHANT), ...(opts.reference === false ? [] : [new PublicKey(REFERENCE)]), ...(opts.also ? [new PublicKey(opts.also)] : [])];
  return {
    blockTime: opts.blockTime ?? null,
    meta: { err: opts.err ?? null, preBalances: [5_000_000_000, 1_000, 0], postBalances: [5_000_000_000 - lamports, 1_000 + lamports, 0], loadedAddresses: { writable: [], readonly: [] } },
    transaction: { message: { getAccountKeys: () => ({ keySegments: () => [keys] }) } },
  };
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_MERCHANT_WALLET = MERCHANT;
  pay.signatures.mockReset().mockResolvedValue([]);
  // By default every transaction pays the merchant the order's 0.1 SOL.
  pay.transaction.mockReset().mockImplementation(async () => tx(100_000_000));
  pay.telegram.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('finding a payment', () => {
  // getSignaturesForAddress answers newest first.

  it('is paid, inside the window, when the transfer landed before the quote lapsed', async () => {
    pay.signatures.mockResolvedValue([sig('sig', '2026-09-20T12:10:00Z')]);
    expect(await findPayment(order(), NO_SHARED)).toEqual({ paid: true, signature: 'sig', paidAt: new Date('2026-09-20T12:10:00Z'), late: false });
  });

  it('still pays when the wallet signed in the minute after the quote lapsed', async () => {
    pay.signatures.mockResolvedValue([sig('sig', '2026-09-20T12:15:50Z')]);
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, late: false });
  });

  it('is late when the block time is after the window and its signing grace, or unknown', async () => {
    pay.signatures.mockResolvedValue([sig('sig', '2026-09-20T12:16:01Z')]);
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, late: true });
    pay.signatures.mockResolvedValue([sig('sig', null)]);
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, late: true });
  });

  it('never accepts a transfer for an order of nothing', async () => {
    expect(await findPayment(order({ amountSol: 0 }), NO_SHARED)).toMatchObject({ paid: false, status: 400 });
    expect(pay.signatures).not.toHaveBeenCalled();
  });

  it('tells no transfer yet apart from a chain it could not ask', async () => {
    expect(await findPayment(order(), NO_SHARED)).toEqual({ paid: false });
    pay.signatures.mockRejectedValue(new Error('fetch failed'));
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: false, status: 503 });
  });

  it('looks past a failed transfer, and one that did not carry the reference, to a valid one after it', async () => {
    pay.signatures.mockResolvedValue([sig('good', '2026-09-20T12:12:00Z'), sig('stray', '2026-09-20T12:11:00Z'), sig('failed', '2026-09-20T12:10:00Z', { InstructionError: [0, 'x'] })]);
    pay.transaction.mockImplementation(async (s: string) => (s === 'stray' ? tx(100_000_000, { reference: false }) : tx(100_000_000)));
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, signature: 'good', late: false });
    expect(pay.transaction).not.toHaveBeenCalledWith('failed', expect.anything());
  });

  it('reads only finalized transactions', async () => {
    pay.signatures.mockResolvedValue([sig('sig', '2026-09-20T12:10:00Z')]);
    await findPayment(order(), NO_SHARED);
    expect(pay.signatures).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 1000 }), 'finalized');
    expect(pay.transaction).toHaveBeenCalledWith('sig', expect.objectContaining({ commitment: 'finalized' }));
  });

  it('keeps a short transfer on record as owed back, rather than only refusing it', async () => {
    pay.signatures.mockResolvedValue([sig('short', '2026-09-20T12:11:00Z')]);
    pay.transaction.mockResolvedValue(tx(50_000_000));
    expect(await findPayment(order(), NO_SHARED)).toEqual({
      paid: false, error: 'Payment amount does not match order', status: 400,
      partial: { signature: 'short', paidAt: new Date('2026-09-20T12:11:00Z') },
    });
  });

  it('is paid when a top-up brings two short transfers to the amount', async () => {
    pay.signatures.mockResolvedValue([sig('topup', '2026-09-20T12:12:00Z'), sig('short', '2026-09-20T12:11:00Z')]);
    pay.transaction.mockImplementation(async (s: string) => tx(s === 'short' ? 60_000_000 : 40_000_000));
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, signature: 'topup', late: false });
  });

  it('pays when the wallet added an instruction of its own after the transfer', async () => {
    // Read from the merchant's balance, not from which instruction came last.
    pay.signatures.mockResolvedValue([sig('guarded', '2026-09-20T12:10:00Z')]);
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, signature: 'guarded' });
  });

  it('takes the first transfer that pays and returns the later ones as owed back, without sending anything itself', async () => {
    pay.signatures.mockResolvedValue([sig('second', '2026-09-20T12:12:00Z'), sig('first', '2026-09-20T12:10:00Z')]);
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, signature: 'first', extra: ['second'] });
    expect(pay.telegram).not.toHaveBeenCalled();
    await reportExtraTransfers('order-1', ['second']);
    expect(pay.telegram).toHaveBeenCalledWith(expect.stringContaining('second'));
  });

  it('treats a chain that cannot return a transaction as unreachable', async () => {
    pay.signatures.mockResolvedValue([sig('sig', '2026-09-20T12:10:00Z')]);
    pay.transaction.mockRejectedValue(new Error('fetch failed'));
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: false, status: 503 });
  });
});

describe('the payment network', () => {
  afterEach(() => {
    delete process.env.SOLANA_RPC_URL;
    delete process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    delete process.env.VERCEL_ENV;
  });

  it('refuses a devnet RPC under mainnet wallets, and anything but mainnet in production', async () => {
    process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    expect(paymentNetworkProblem()).toMatch(/devnet/);
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = 'devnet';
    expect(paymentNetworkProblem()).toBeNull();
    process.env.VERCEL_ENV = 'production';
    expect(paymentNetworkProblem()).toMatch(/mainnet/);
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: false, status: 503 });
    expect(pay.signatures).not.toHaveBeenCalled();
  });

  it('checks payments on the live database only from the production deployment', () => {
    const before = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://u:p@ep-soft-thunder-an8yi31a-pooler.example.tech/db';
    expect(paymentNetworkProblem()).toMatch(/live database/);
    process.env.VERCEL_ENV = 'preview';
    expect(paymentNetworkProblem()).toMatch(/live database/);
    process.env.VERCEL_ENV = 'production';
    process.env.SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=x';
    expect(paymentNetworkProblem()).toBeNull();
    process.env.DATABASE_URL = before;
    if (before === undefined) delete process.env.DATABASE_URL;
  });

  it('reads an empty RPC variable as unset, and production must name an RPC of its own', () => {
    process.env.SOLANA_RPC_URL = '';
    process.env.VERCEL_ENV = 'production';
    expect(paymentNetworkProblem()).toMatch(/SOLANA_RPC_URL/);
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=x';
    expect(paymentNetworkProblem()).toBeNull();
    delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  });
});

describe('orders the rehearsal builds marked paid', () => {
  it('stay unpaid: nothing was paid for them', () => {
    expect(unpaidRehearsal({ signature: `simulated-no-payment:${REFERENCE}` })).toBe(true);
    expect(unpaidRehearsal({ signature: 'real' })).toBe(false);
    expect(unpaidRehearsal({ signature: null })).toBe(false);
  });

  it('never mark an order paid without a transfer, whatever the environment says', async () => {
    process.env.NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT = '1';
    try {
      expect(await findPayment(order(), NO_SHARED)).toEqual({ paid: false });
      expect(pay.signatures).toHaveBeenCalled();
    } finally {
      delete process.env.NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT;
    }
  });
});

describe('quoting in SOL', () => {
  it('refuses to quote on the fallback rate, where the marketplace still falls back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    await expect(usdToSol(39)).rejects.toBeInstanceOf(SolPriceUnavailableError);
    expect(await fetchSolPriceRates()).toEqual(SOL_PRICE_FALLBACK);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(usdToSol(39)).rejects.toBeInstanceOf(SolPriceUnavailableError);
  });

  /** Each feed answering in its own shape, at its own price; null refuses. */
  const feeds = (p: { coinbase?: number | null; kraken?: number | null; jup?: number | null; gecko?: number | null }) =>
    vi.fn(async (url: string) => {
      const [price, body] = url.includes('coinbase') ? [p.coinbase, { data: { amount: String(p.coinbase) } }]
        : url.includes('kraken') ? [p.kraken, { result: { SOLUSD: { c: [String(p.kraken)] } } }]
        : url.includes('jup.ag') ? [p.jup, { So11111111111111111111111111111111111111112: { usdPrice: p.jup } }]
        : [p.gecko, { solana: { usd: p.gecko } }];
      return price == null ? { ok: false } : { ok: true, json: async () => body };
    });

  it('quotes at the median of the live feeds, never from a cache', async () => {
    const fetch = feeds({ coinbase: 150, kraken: 151, jup: 149 });
    vi.stubGlobal('fetch', fetch);
    expect((await fetchSolPriceRates({ strict: true })).solPrice).toBe(150);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }));
    expect(await usdToSol(39)).toBeGreaterThan(0);
  });

  it('quotes when one feed refuses and two still agree', async () => {
    vi.stubGlobal('fetch', feeds({ kraken: 120.5, gecko: 121.5 }));
    expect((await fetchSolPriceRates({ strict: true })).solPrice).toBe(121);
  });

  it('refuses a quote from one feed alone, or from feeds that disagree', async () => {
    vi.stubGlobal('fetch', feeds({ kraken: 120.5 }));
    await expect(fetchSolPriceRates({ strict: true })).rejects.toBeInstanceOf(SolPriceUnavailableError);
    vi.stubGlobal('fetch', feeds({ coinbase: 150, kraken: 160 }));
    await expect(fetchSolPriceRates({ strict: true })).rejects.toBeInstanceOf(SolPriceUnavailableError);
    expect((await fetchSolPriceRates()).solPrice).toBe(150);
  });

  it('gives no quote without a live feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    await expect(usdToSol(39)).rejects.toBeInstanceOf(SolPriceUnavailableError);
  });
});

describe('a direct card sale', () => {
  it('allocates only what capsules are not owed, and logs the sale with the order’s hash, not the wallet', async () => {
    const execute = vi.fn(async (_q: SQL) => ({ rows: [{ edition_number: 6 }] }));
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where']) chain[m] = () => chain;
    let reads = 0;
    chain.limit = async () => (reads++ === 0 ? [{ id: 'card-1', editionSize: 300 }] : []);
    const db = { execute, batch: async (items: unknown[]) => Promise.all(items), select: () => chain, update: vi.fn() } as unknown as Db;
    const o = order({ productId: 'stellar-card:TYCHO', walletAddress: 'holder-wallet', status: 'paid' });

    expect(await fulfilCardOrder(db, o)).toEqual({ ok: true, editionNumber: 6, editionSize: 300, designation: 'TYCHO' });
    // Retired (sealed Almanac) editions are read first; they can never stand in for an edition owed to a capsule.
    expect(new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql).toMatch(/SELECT k\.designation, k\.edition_size/);
    // The set is locked first, in the same transaction as the sale.
    expect(new PgDialect().sqlToQuery(execute.mock.calls[1][0]).sql).toMatch(/pg_advisory_xact_lock/);
    const { sql, params } = new PgDialect().sqlToQuery(execute.mock.calls[2][0]);
    expect(sql).toMatch(/state IN \('listed', 'purchased'\)\)\s*- \$\d+::int\s*>= 1/);
    expect(sql).toMatch(/INSERT INTO capsule_log \(event, outcome\)\s*SELECT 'card_sold'/);
    expect(params).toContain(orderHash(o.id));
    const logged = sql.slice(sql.indexOf('INSERT INTO capsule_log'));
    expect(logged).not.toMatch(/owner_wallet|wallet/);
  });

  it('marks the order refund_due when no edition can be spared', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where']) chain[m] = () => chain;
    let reads = 0;
    chain.limit = async () => (reads++ === 0 ? [{ id: 'card-1', editionSize: 300 }] : []);
    const set = vi.fn(() => ({ where: () => ({ returning: async () => [{ id: 'o' }] }) }));
    const db = { execute, batch: async (items: unknown[]) => Promise.all(items), select: () => chain, update: () => ({ set }) } as unknown as Db;

    expect(await fulfilCardOrder(db, order({ productId: 'stellar-card:TYCHO', walletAddress: 'w', status: 'paid' }))).toEqual({ ok: false, reason: 'sold_out' });
    expect(set).toHaveBeenCalledWith({ status: 'refund_due' });
    expect(pay.telegram).toHaveBeenCalledWith(expect.stringContaining('refund due'));
  });
});

describe('card orders left pending past their window', () => {
  it('cancels one never paid, and keeps one paid short on record as owed back', async () => {
    const unpaid = order({ id: 'unpaid', productId: 'stellar-card:TYCHO', status: 'pending', paymentReference: REFERENCE });
    const short = order({ id: 'short', productId: 'stellar-card:TYCHO', status: 'pending', paymentReference: MERCHANT_REF });
    const written: Array<{ status: string; signature?: string }> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
    // The sweep reads its orders; the shared-reference check (limit 1) finds no other order.
    chain.limit = async (n: number) => (n === 1 ? [] : [unpaid, short]);
    // markRefundDue reads the row back after its update.
    chain.then = (resolve: (rows: OrderRow[]) => void) => resolve([{ ...short, status: 'refund_due' }]);
    const db = {
      select: () => chain,
      update: () => ({ set: (v: { status: string; signature?: string }) => ({ where: () => { written.push(v); return { returning: async () => [{ id: 'x' }] }; } }) }),
    } as unknown as Db;
    pay.signatures.mockImplementation(async (ref: PublicKey) => (ref.toBase58() === REFERENCE ? [] : [sig('part', '2026-09-20T12:11:00Z')]));
    pay.transaction.mockResolvedValue(tx(50_000_000, { reference: false, also: MERCHANT_REF }));

    expect(await settleCardOrders(db)).toEqual([{ orderId: 'unpaid', status: 'cancelled' }, { orderId: 'short', status: 'refund_due' }]);
    expect(written).toEqual([{ status: 'cancelled' }, expect.objectContaining({ status: 'refund_due', signature: 'part' })]);
  });
});

describe('rate limits in production', () => {
  afterEach(() => { delete process.env.VERCEL_ENV; });

  it('refuses rather than run unlimited when no limiter is configured', async () => {
    const { limited } = await import('@/lib/skychaser/route-guards');
    const limiter = { limit: vi.fn() };
    expect(await limited(limiter, 'id')).toBeNull();
    process.env.VERCEL_ENV = 'production';
    expect((await limited(limiter, 'id'))?.status).toBe(503);
  });
});

describe('one transfer, one order', () => {
  const OTHER_REF = 'GvpCiTgq9dmEeojCDBivoLoZqc4AkbUDACpqPMwYLWKh';

  it('counts a transaction that also names another order for neither, and returns it as owed back', async () => {
    pay.signatures.mockResolvedValue([sig('both', '2026-09-20T12:10:00Z')]);
    pay.transaction.mockResolvedValue(tx(100_000_000, { also: OTHER_REF }));
    const sharedWith = vi.fn(async (_id: string, keys: string[]) => keys.includes(OTHER_REF));
    expect(await findPayment(order(), { ...NO_SHARED, sharedWith })).toEqual({ paid: false, shared: ['both'] });
    // The order's own reference is never what makes a transaction shared.
    expect(sharedWith.mock.calls[0][1]).not.toContain(REFERENCE);
  });

  it('still pays with a later transfer of its own after a shared one', async () => {
    pay.signatures.mockResolvedValue([sig('own', '2026-09-20T12:11:00Z'), sig('both', '2026-09-20T12:10:00Z')]);
    pay.transaction.mockImplementation(async (s: string) => tx(100_000_000, s === 'both' ? { also: OTHER_REF } : {}));
    const sharedWith = async (_id: string, keys: string[]) => keys.includes(OTHER_REF);
    expect(await findPayment(order(), { ...NO_SHARED, sharedWith })).toMatchObject({ paid: true, signature: 'own', shared: ['both'] });
  });

  it('a signature that already paid another order pays nothing here: refund_due, and said', async () => {
    const written: unknown[] = [];
    let first = true;
    const update = () => ({
      set: (v: unknown) => ({
        where: () => {
          written.push(v);
          if (first) {
            first = false;
            // A real promise that rejects, as the unique index refuses the signature.
            return Promise.reject(Object.assign(new Error('duplicate key'), { code: '23505' }));
          }
          return { returning: async () => [{ id: 'o' }] };
        },
      }),
    });
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where']) chain[m] = () => chain;
    chain.then = (resolve: (rows: OrderRow[]) => void) => resolve([order({ status: 'refund_due' })]);
    const db = { update, select: () => chain } as unknown as Db;
    const row = await markPaid(db, 'o', 'reused', new Date());
    expect(row.status).toBe('refund_due');
    expect(written[1]).toEqual({ status: 'refund_due', paidAt: expect.any(Date) });
    expect(pay.telegram).toHaveBeenCalledWith(expect.stringContaining('already paid another order'));
  });
});

describe('dust cannot hide a payment', () => {
  it('reads oldest first, so newer dust never pushes the payment out of reach', async () => {
    const dust = Array.from({ length: 40 }, (_, i) => sig(`dust${i}`, '2026-09-20T12:14:00Z'));
    pay.signatures.mockResolvedValue([...dust, sig('payment', '2026-09-20T12:10:00Z')]);
    pay.transaction.mockImplementation(async (s: string) => (s === 'payment' ? tx(100_000_000) : tx(0)));
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, signature: 'payment' });
  });

  it('dust sent before the payment does not count towards the cap, so it cannot bury it', async () => {
    const dust = Array.from({ length: 60 }, (_, i) => sig(`dust${i}`, '2026-09-20T12:05:00Z'));
    // Newest first, as the chain lists them: the payment is newer than all the dust.
    pay.signatures.mockResolvedValue([sig('payment', '2026-09-20T12:10:00Z'), ...dust]);
    pay.transaction.mockImplementation(async (s: string) => (s === 'payment' ? tx(100_000_000) : tx(0)));
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, signature: 'payment' });
  });

  it('pages past a full page of signatures to the payment beneath it', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => sig(`dust${i}`, '2026-09-20T12:14:00Z'));
    pay.signatures
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([sig('payment', '2026-09-20T12:10:00Z')]);
    pay.transaction.mockImplementation(async (s: string) => (s === 'payment' ? tx(100_000_000) : tx(0)));
    expect(await findPayment(order(), NO_SHARED)).toMatchObject({ paid: true, signature: 'payment' });
    expect(pay.signatures).toHaveBeenLastCalledWith(expect.anything(), { limit: 1000, before: 'dust999' }, 'finalized');
  });
});

describe('the sweeps', () => {
  it('pass over an order that fails and settle the rest', async () => {
    const broken = order({ id: 'broken', productId: 'stellar-card:TYCHO', status: 'pending' });
    const unpaid = order({ id: 'unpaid', productId: 'stellar-card:TYCHO', status: 'pending' });
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
    chain.limit = async (n: number) => (n === 1 ? [] : [broken, unpaid]);
    let updates = 0;
    const db = {
      select: () => chain,
      update: () => ({
        set: () => ({
          where: () => {
            if (updates++ === 0) throw new Error('connection reset');
            return { returning: async () => [{ id: 'x' }] };
          },
        }),
      }),
    } as unknown as Db;
    // The first order's update throws; the second is still cancelled.
    expect(await settleCardOrders(db)).toEqual([{ orderId: 'broken', status: 'error' }, { orderId: 'unpaid', status: 'cancelled' }]);
  });

  it('give a paid card order that holds no edition another try, and pass over one that fails', async () => {
    const stuck = order({ id: 'stuck', productId: 'stellar-card:TYCHO', status: 'paid', signature: 'paid-sig' });
    const broken = order({ id: 'broken', productId: 'stellar-card:TYCHO', status: 'paid', signature: 'paid-sig-2' });
    let cardLookups = 0;
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
    chain.limit = async (n: number) => {
      if (n !== 1) return [broken, stuck];
      if (cardLookups++ === 0) throw new Error('connection reset');
      return [];
    };
    const db = { select: () => chain } as unknown as Db;
    expect(await fulfilPaidCardOrders(db)).toEqual([
      { orderId: 'broken', status: 'error' },
      { orderId: 'stuck', status: 'unknown_card' },
    ]);
  });

  it('grant paid credits that were never added, and pass over one that fails', async () => {
    const left = order({ id: 'left', productId: 'skychaser-credits:starter:20', status: 'paid', signature: 'paid-sig' });
    const broken = order({ id: 'broken', productId: 'skychaser-credits:starter:20', status: 'paid', signature: 'paid-sig-2' });
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
    chain.limit = async () => [broken, left];
    let calls = 0;
    const execute = vi.fn(async () => {
      if (calls++ === 0) throw new Error('connection reset');
      return { rows: [{ added: 1, balance: 20 }] };
    });
    const db = { select: () => chain, execute } as unknown as Db;
    expect(await grantPaidCredits(db)).toEqual([
      { orderId: 'broken', status: 'error' },
      { orderId: 'left', status: 'granted' },
    ]);
  });

  it('owe back a payment found on an order already closed', async () => {
    const closed = order({ id: 'closed', productId: 'stellar-card:TYCHO', status: 'cancelled' });
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
    chain.limit = async (n: number) => (n === 1 ? [] : [closed]);
    chain.then = (resolve: (rows: OrderRow[]) => void) => resolve([{ ...closed, status: 'refund_due' }]);
    const written: unknown[] = [];
    const db = {
      select: () => chain,
      update: () => ({ set: (v: unknown) => ({ where: () => { written.push(v); return { returning: async () => [{ id: 'closed' }] }; } }) }),
    } as unknown as Db;
    pay.signatures.mockResolvedValue([sig('after', '2026-09-20T12:30:00Z')]);
    expect(await recheckClosedCardOrders(db)).toEqual([{ orderId: 'closed', status: 'refund_due' }]);
    expect(written[0]).toMatchObject({ status: 'refund_due', signature: 'after' });
    expect(pay.telegram).toHaveBeenCalledWith(expect.stringContaining('paid after the order was closed'));
  });
  it('tell of a second transfer, or a payment above the quote, on an order already paid', async () => {
    const paidOrder = order({ id: 'paid', productId: 'stellar-card:TYCHO', status: 'paid', signature: 'first' });
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
    chain.limit = async (n: number) => (n === 1 ? [] : [paidOrder]);
    const db = { select: () => chain } as unknown as Db;
    pay.signatures.mockResolvedValue([sig('second', '2026-09-20T12:30:00Z'), sig('first', '2026-09-20T12:10:00Z')]);
    pay.transaction.mockImplementation(async (s: string) => tx(s === 'first' ? 120_000_000 : 100_000_000));
    expect(await recheckPaidOrders(db)).toEqual([{ orderId: 'paid', extra: 1, surplusLamports: '20000000' }]);
    expect(pay.telegram).toHaveBeenCalledWith(expect.stringContaining('1 extra transfer(s) and 0.02 SOL above the quote'));
  });

  it('say nothing about a paid order that received exactly its quote', async () => {
    const paidOrder = order({ id: 'paid', productId: 'stellar-card:TYCHO', status: 'paid', signature: 'first' });
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
    chain.limit = async (n: number) => (n === 1 ? [] : [paidOrder]);
    const db = { select: () => chain } as unknown as Db;
    pay.signatures.mockResolvedValue([sig('first', '2026-09-20T12:10:00Z')]);
    expect(await recheckPaidOrders(db)).toEqual([]);
    expect(pay.telegram).not.toHaveBeenCalled();
  });

  it('ask about each closed order twice: closed since the last run, and two to three days ago', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    const [recent, older] = recheckWindows(now);
    expect(recent.to.getTime()).toBe(now - 2 * 60_000);
    expect(now - recent.from.getTime()).toBeGreaterThan(86_400_000);
    expect(older).toEqual({ from: new Date(now - 3 * 86_400_000), to: new Date(now - 2 * 86_400_000) });
  });
});
