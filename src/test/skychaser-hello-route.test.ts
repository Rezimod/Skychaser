// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  privy: vi.fn(),
  linked: vi.fn(),
  email: vi.fn(),
  rate: vi.fn(),
  touch: vi.fn(),
  resolve: vi.fn(),
  grant: vi.fn(),
  record: vi.fn(),
}));
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
vi.mock('@/lib/api-auth', () => ({ verifyPrivy: mocks.privy, getSessionWalletAddresses: mocks.linked, getSessionEmail: mocks.email }));
vi.mock('@/lib/db', () => ({ getDb: () => ({ execute: async () => ({ rows: [] }) }) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate, skychaserHelloRateLimit: {}, skychaserHelloIpRateLimit: {} }));
vi.mock('@/lib/skychaser/contact', async (actual) => ({
  ...(await actual<typeof import('@/lib/skychaser/contact')>()),
  touchContact: mocks.touch,
  resolveInvite: mocks.resolve,
}));
vi.mock('@/lib/skychaser/welcome', async (actual) => ({ ...(await actual<typeof import('@/lib/skychaser/welcome')>()), grantWelcome: mocks.grant }));
vi.mock('@/lib/skychaser/events', () => ({ recordEvent: mocks.record }));
import { POST as hello } from '@/app/api/skychaser/hello/route';

const HOLDER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const post = (body: unknown, cookie?: string) =>
  new NextRequest('http://localhost/api/skychaser/hello', { method: 'POST', body: JSON.stringify(body), headers: cookie ? { cookie } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.STELLAR_PAUSED;
  delete process.env.SKYCHASER_WELCOME;
  delete process.env.STELLAR_INVITE_CODES;
  mocks.privy.mockResolvedValue('did:privy:1');
  mocks.linked.mockResolvedValue([HOLDER]);
  mocks.email.mockResolvedValue('holder@example.org');
  mocks.rate.mockResolvedValue({ success: true, remaining: 1, reset: 0 });
  mocks.resolve.mockResolvedValue(null);
  mocks.touch.mockResolvedValue({ notify: true, invitedBy: null, invitedNow: false, welcomeEditionId: null });
  mocks.grant.mockResolvedValue({ edition: null, fresh: false });
});

describe('saying hello', () => {
  it('needs a session with a wallet', async () => {
    mocks.privy.mockResolvedValueOnce(null);
    expect((await hello(post({}))).status).toBe(401);
    mocks.linked.mockResolvedValueOnce([]);
    expect((await hello(post({}))).status).toBe(403);
    expect(mocks.touch).not.toHaveBeenCalled();
  });

  it('records the account, gives the first card and says so once', async () => {
    const edition = { editionId: 'e1', designation: 'FIRST-LIGHT', name: 'First Light', rarity: 'common', editionNumber: 7, editionSize: 300 };
    mocks.grant.mockResolvedValueOnce({ edition, fresh: true });
    const res = await hello(post({ walletAddress: HOLDER }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ wallet: HOLDER, welcome: { fresh: true, edition: { editionNumber: 7 } } });
    expect(mocks.touch).toHaveBeenCalledWith(expect.anything(), { privyId: 'did:privy:1', wallet: HOLDER, email: 'holder@example.org', invitedBy: null });
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), 'welcome_granted', expect.objectContaining({ wallet: HOLDER }));
  });

  it('attributes the invitation on the cookie, once', async () => {
    mocks.resolve.mockResolvedValueOnce('ABCD1234');
    mocks.touch.mockResolvedValueOnce({ notify: true, invitedBy: 'ABCD1234', invitedNow: true, welcomeEditionId: null });
    const res = await hello(post({}, 'stellar_invite=ABCD1234'));
    expect(res.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), 'ABCD1234', 'did:privy:1');
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), 'invite_landed', expect.objectContaining({ props: { invite: 'ABCD1234' } }));
  });

  it('gives nothing while the welcome is off, and nothing while paused', async () => {
    process.env.SKYCHASER_WELCOME = 'off';
    const res = await hello(post({}));
    expect((await res.json()).welcome).toEqual({ edition: null, fresh: false });
    expect(mocks.grant).not.toHaveBeenCalled();
    process.env.STELLAR_PAUSED = '1';
    expect((await hello(post({}))).status).toBe(503);
  });

  it('keeps the first card behind the closed door', async () => {
    process.env.STELLAR_INVITE_CODES = 'owner-1';
    const edition = { editionId: 'e1', designation: 'FIRST-LIGHT', name: 'First Light', rarity: 'common', editionNumber: 1, editionSize: 300 };
    mocks.grant.mockResolvedValue({ edition, fresh: true });
    const shut = await hello(post({}));
    expect((await shut.json()).welcome).toEqual({ edition: null, fresh: false });
    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.touch).toHaveBeenCalledTimes(1);
    const open = await hello(post({}, 'stellar_invite=owner-1'));
    expect((await open.json()).welcome.fresh).toBe(true);
  });

  it('answers 503, not 500, until the growth tables exist', async () => {
    mocks.touch.mockRejectedValueOnce(Object.assign(new Error('relation "holder_contact" does not exist'), { code: '42P01' }));
    const res = await hello(post({}));
    expect(res.status).toBe(503);
  });
});
