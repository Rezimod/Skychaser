// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  privy: vi.fn(),
  linked: vi.fn(),
  db: vi.fn(),
  rate: vi.fn(),
  book: vi.fn(),
  cancel: vi.fn(),
  board: vi.fn(),
  balance: vi.fn(),
  mine: vi.fn(),
  editions: vi.fn(),
  grant: vi.fn(),
  ready: vi.fn(),
  createCreditsOrder: vi.fn(),
  usdToSol: vi.fn(),
  telegram: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ verifyPrivy: mocks.privy, getSessionWalletAddresses: mocks.linked }));
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
vi.mock('@/lib/db', () => ({ getDb: mocks.db }));
vi.mock('@/lib/telegram', () => ({ sendTelegram: mocks.telegram }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate, skychaserBookRateLimit: {}, skychaserBuyRateLimit: {}, skychaserBuyIpRateLimit: {} }));
vi.mock('@/lib/skychaser/booking', async (actual) => ({
  ...(await actual<typeof import('@/lib/skychaser/booking')>()),
  book: mocks.book,
  cancelBooking: mocks.cancel,
  bookingBoard: mocks.board,
  creditBalance: mocks.balance,
  holderBookings: mocks.mine,
  redeemableEditions: mocks.editions,
  grantCredits: mocks.grant,
  bookingReady: mocks.ready,
}));
vi.mock('@/lib/skychaser/orders', async (actual) => ({
  ...(await actual<typeof import('@/lib/skychaser/orders')>()),
  createCreditsOrder: mocks.createCreditsOrder,
  usdToSol: mocks.usdToSol,
  merchantWallet: () => ({ toBase58: () => 'merchant' }),
  newPaymentReference: () => 'reference',
  paymentUrl: () => 'solana:merchant',
  paymentNetworkMisconfig: () => null,
  paymentsLive: async () => false,
}));
import { GET as board, POST as bookRoute } from '@/app/api/skychaser/booking/route';
import { GET as mine } from '@/app/api/skychaser/booking/mine/route';
import { POST as cancel } from '@/app/api/skychaser/booking/cancel/route';
import { POST as buyCredits } from '@/app/api/skychaser/credits/buy/route';

const HOLDER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const ID = '00000000-0000-4000-8000-000000000001';
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) });
const get = (url: string) => new NextRequest(`http://localhost${url}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.privy.mockResolvedValue('did:privy:1');
  mocks.linked.mockResolvedValue([HOLDER]);
  mocks.db.mockReturnValue({});
  mocks.rate.mockResolvedValue({ success: true, remaining: 1, reset: 0 });
  mocks.telegram.mockResolvedValue(undefined);
  mocks.ready.mockResolvedValue(true);
});

describe('GET /api/skychaser/booking', () => {
  it('serves the board to anyone', async () => {
    mocks.privy.mockResolvedValue(null);
    mocks.board.mockResolvedValue({ firstNight: '2026-11-01', nights: [] });
    const res = await board();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ firstNight: '2026-11-01' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/skychaser/booking', () => {
  it('needs a session', async () => {
    mocks.privy.mockResolvedValue(null);
    expect((await bookRoute(post('/api/skychaser/booking', { startsAt: '2026-11-05T17:00:00Z', minutes: 30 }))).status).toBe(401);
  });

  it('checks its input before touching anything', async () => {
    expect((await bookRoute(post('/api/skychaser/booking', { minutes: 30 }))).status).toBe(400);
    expect((await bookRoute(post('/api/skychaser/booking', { startsAt: 'yesterday', minutes: 30 }))).status).toBe(400);
    expect((await bookRoute(post('/api/skychaser/booking', { startsAt: '2026-11-05T17:00:00Z', minutes: 45 }))).status).toBe(400);
    expect((await bookRoute(post('/api/skychaser/booking', { startsAt: '2026-11-05T17:00:00Z', minutes: 30, targetId: 'sun' }))).status).toBe(400);
    expect((await bookRoute(post('/api/skychaser/booking', { startsAt: '2026-11-05T17:00:00Z', minutes: 30, editionId: 'nope' }))).status).toBe(400);
    expect(mocks.book).not.toHaveBeenCalled();
  });

  it('books with the session wallets, and tells the owner', async () => {
    mocks.book.mockResolvedValue({ ok: true, id: ID, credits: 20, balance: 5 });
    const res = await bookRoute(post('/api/skychaser/booking', { startsAt: '2026-11-05T17:00:00Z', minutes: 30, targetId: 'saturn' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, credits: 20, balance: 5 });
    expect(mocks.book.mock.calls[0][1]).toMatchObject({ privyId: 'did:privy:1', wallet: HOLDER, wallets: [HOLDER], minutes: 30, targetId: 'saturn', editionId: null });
    expect(mocks.telegram).toHaveBeenCalledTimes(1);
  });

  it('answers each refusal with its own status', async () => {
    for (const [reason, status] of [['taken', 409], ['short', 402], ['off_grid', 400], ['too_soon', 400], ['edition', 400]] as const) {
      mocks.book.mockResolvedValueOnce({ ok: false, reason });
      const res = await bookRoute(post('/api/skychaser/booking', { startsAt: '2026-11-05T17:00:00Z', minutes: 30 }));
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ reason });
    }
  });

  it('says booking opens soon while the tables are missing', async () => {
    mocks.book.mockRejectedValue(Object.assign(new Error('relation "telescope_booking" does not exist'), { code: '42P01' }));
    const res = await bookRoute(post('/api/skychaser/booking', { startsAt: '2026-11-05T17:00:00Z', minutes: 30 }));
    expect(res.status).toBe(503);
  });
});

describe('GET /api/skychaser/booking/mine', () => {
  it('returns the balance, the sessions and the Epic cards', async () => {
    mocks.balance.mockResolvedValue(36);
    mocks.mine.mockResolvedValue([{ id: ID }]);
    mocks.editions.mockResolvedValue([]);
    const res = await mine(get('/api/skychaser/booking/mine'));
    expect(await res.json()).toEqual({ balance: 36, bookings: [{ id: ID }], editions: [] });
    expect(mocks.editions).toHaveBeenCalledWith({}, [HOLDER]);
  });
});

describe('POST /api/skychaser/booking/cancel', () => {
  it('cancels, and refuses a late one', async () => {
    mocks.cancel.mockResolvedValueOnce({ ok: true, balance: 20 });
    expect(await (await cancel(post('/api/skychaser/booking/cancel', { id: ID }))).json()).toEqual({ cancelled: true, balance: 20 });
    mocks.cancel.mockResolvedValueOnce({ ok: false, reason: 'late' });
    expect((await cancel(post('/api/skychaser/booking/cancel', { id: ID }))).status).toBe(409);
    mocks.cancel.mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    expect((await cancel(post('/api/skychaser/booking/cancel', { id: ID }))).status).toBe(404);
    expect((await cancel(post('/api/skychaser/booking/cancel', { id: 'x' }))).status).toBe(400);
  });
});

describe('POST /api/skychaser/credits/buy', () => {
  it('opens an order for a known pack at the live rate', async () => {
    mocks.usdToSol.mockResolvedValue(0.25);
    mocks.createCreditsOrder.mockResolvedValue({ id: ID, expiresAt: new Date('2026-11-01T00:15:00Z') });
    expect((await buyCredits(post('/api/skychaser/credits/buy', { pack: 'free-money' }))).status).toBe(400);
    const res = await buyCredits(post('/api/skychaser/credits/buy', { pack: 'night' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ orderId: ID, amountSol: 0.25, amountFiat: 54, currency: 'USD', expiresAt: '2026-11-01T00:15:00.000Z' });
    expect(mocks.createCreditsOrder.mock.calls[0][1]).toMatchObject({ pack: 'night', credits: 60, priceUsd: 54, wallet: HOLDER });
  });

  it('sells nothing into a database without the credit tables', async () => {
    mocks.ready.mockResolvedValue(false);
    const res = await buyCredits(post('/api/skychaser/credits/buy', { pack: 'night' }));
    expect(res.status).toBe(503);
    expect(mocks.createCreditsOrder).not.toHaveBeenCalled();
  });
});
