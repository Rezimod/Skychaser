// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: () => ({ execute: mocks.execute }) }));
import { GET as unsubscribe } from '@/app/api/skychaser/notify/unsubscribe/route';
import { unsubscribeToken } from '@/lib/skychaser/notify';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INVITE_SIGNING_KEY = 'k'.repeat(32);
  mocks.execute.mockResolvedValue({ rows: [] });
});

it('turns email off for the account the link was sent to, and no other', async () => {
  const t = unsubscribeToken('did:privy:a')!;
  const ok = await unsubscribe(new NextRequest(`https://skychaser.io/api/skychaser/notify/unsubscribe?id=${encodeURIComponent('did:privy:a')}&t=${t}`));
  expect(ok.status).toBe(200);
  expect(await ok.text()).toContain('No more email about your cards');
  expect(mocks.execute).toHaveBeenCalledTimes(1);

  const wrong = await unsubscribe(new NextRequest(`https://skychaser.io/api/skychaser/notify/unsubscribe?id=${encodeURIComponent('did:privy:b')}&t=${t}`));
  expect(wrong.status).toBe(400);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect((await unsubscribe(new NextRequest('https://skychaser.io/api/skychaser/notify/unsubscribe'))).status).toBe(400);
});
