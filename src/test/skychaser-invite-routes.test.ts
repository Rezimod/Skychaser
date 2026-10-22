// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ privy: vi.fn(), linked: vi.fn(), rate: vi.fn(), stats: vi.fn(), exists: vi.fn(), record: vi.fn() }));
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
vi.mock('@/lib/api-auth', () => ({ verifyPrivy: mocks.privy, getSessionWalletAddresses: mocks.linked }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate, skychaserInviteRateLimit: {} }));
vi.mock('@/lib/skychaser/referral', () => ({ inviteStats: mocks.stats, inviteExists: mocks.exists }));
vi.mock('@/lib/skychaser/events', () => ({ recordEvent: mocks.record }));
import { GET as invite } from '@/app/api/skychaser/invite/route';
import { GET as open } from '@/app/invite/[code]/route';

const HOLDER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INVITE_SIGNING_KEY = 'k'.repeat(32);
  process.env.STELLAR_INVITE_CODES = 'owner-1';
  mocks.privy.mockResolvedValue('did:privy:host');
  mocks.linked.mockResolvedValue([HOLDER]);
  mocks.rate.mockResolvedValue({ success: true, remaining: 1, reset: 0 });
  mocks.stats.mockResolvedValue({ code: 'ABCDEFGH', arrived: 2, converted: 1, cards: [], cap: 10 });
  mocks.exists.mockResolvedValue(true);
});

describe("a holder's invitation", () => {
  it('is read for the signed-in account, with its link', async () => {
    const res = await invite(new NextRequest(`http://localhost/api/skychaser/invite?wallet=${HOLDER}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: 'ABCDEFGH', url: 'https://skychaser.io/invite/ABCDEFGH', arrived: 2 });
    expect(mocks.stats).toHaveBeenCalledWith({}, { privyId: 'did:privy:host', wallet: HOLDER });
  });

  it('needs a session with a wallet', async () => {
    mocks.privy.mockResolvedValueOnce(null);
    expect((await invite(new NextRequest('http://localhost/api/skychaser/invite'))).status).toBe(401);
    mocks.linked.mockResolvedValueOnce([]);
    expect((await invite(new NextRequest('http://localhost/api/skychaser/invite'))).status).toBe(403);
  });

  it('answers 503 until the growth tables exist', async () => {
    mocks.stats.mockRejectedValueOnce(Object.assign(new Error('no table'), { code: '42P01' }));
    expect((await invite(new NextRequest('http://localhost/api/skychaser/invite'))).status).toBe(503);
  });
});

describe('opening an invitation link', () => {
  const at = (code: string) => open(new NextRequest(`https://skychaser.io/invite/${code}`), { params: Promise.resolve({ code }) });

  it("keeps the owner's code, unsigned", async () => {
    const res = await at('owner-1');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://skychaser.io/');
    const cookies = res.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('stellar_invite=owner-1');
    expect(cookies).not.toContain('stellar_invited');
  });

  it("keeps a holder's code with its signature, and counts the opening", async () => {
    const res = await at('ABCDEFGH');
    expect(res.headers.get('location')).toBe('https://skychaser.io/');
    const cookies = res.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('stellar_invite=ABCDEFGH');
    expect(cookies).toMatch(/stellar_invited=[0-9a-f]{40}/);
    expect(mocks.record).toHaveBeenCalledWith({}, 'invite_opened', expect.objectContaining({ props: { invite: 'ABCDEFGH' } }));
  });

  it('sends anything else to the door', async () => {
    mocks.exists.mockResolvedValueOnce(false);
    expect((await at('ABCDEFGJ')).headers.get('location')).toBe('https://skychaser.io/invite');
    expect((await at('not-a-code')).headers.get('location')).toBe('https://skychaser.io/invite');
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
