// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ db: vi.fn(), holderView: vi.fn(), rate: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: mocks.db }));
vi.mock('@/lib/skychaser/repo', () => ({ holderView: mocks.holderView }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate, skychaserLogRateLimit: {} }));
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
import { GET } from '@/app/api/skychaser/voyage/route';

const WALLET = '11111111111111111111111111111111';

const ask = (wallet: string) => GET(new NextRequest(`http://localhost/api/skychaser/voyage?wallet=${wallet}`));

const held = (designation: string, name: string, editionNumber: number, editionSize: number, rarity: string) => ({
  editionId: `e-${designation}`, designation, name, editionNumber, editionSize, rarity,
  observationStatus: 'observable', latest: null, history: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.mockReturnValue({});
  mocks.rate.mockResolvedValue({ success: true, remaining: 59, reset: 0 });
});

it('gives a holder of MARS and SIRIUS exactly those two destinations', async () => {
  mocks.holderView.mockResolvedValue([
    held('M42', 'Orion Nebula', 4, 30, 'rare'),
    held('MARS', 'Mars', 7, 300, 'common'),
    held('SIRIUS', 'Sirius', 2, 30, 'rare'),
  ]);
  const res = await ask(WALLET);
  expect(res.status).toBe(200);
  expect(mocks.holderView).toHaveBeenCalledWith({}, WALLET);
  expect(await res.json()).toEqual({
    destinations: [
      { designation: 'MARS', name: 'Mars', editionNumber: 7, editionSize: 300, rarity: 'common', kind: 'body', gameId: 'mars' },
      { designation: 'SIRIUS', name: 'Sirius', editionNumber: 2, editionSize: 30, rarity: 'rare', kind: 'star', gameId: 'sirius' },
    ],
  });
});

it('gives a wallet holding nothing no destinations', async () => {
  mocks.holderView.mockResolvedValue([]);
  expect(await (await ask(WALLET)).json()).toEqual({ destinations: [] });
});

it('refuses a wallet that is not a Solana address', async () => {
  const res = await ask('not-a-wallet');
  expect(res.status).toBe(400);
  expect(mocks.holderView).not.toHaveBeenCalled();
});

it('answers 503 when there is no database', async () => {
  mocks.db.mockReturnValue(null);
  const res = await ask(WALLET);
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'Database not configured' });
});

it('answers 429 over the limit', async () => {
  mocks.rate.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 5000 });
  expect((await ask(WALLET)).status).toBe(429);
  expect(mocks.holderView).not.toHaveBeenCalled();
});
