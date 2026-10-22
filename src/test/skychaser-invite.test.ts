// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { INVITED_COOKIE, INVITE_COOKIE, inviteSignatureValid, isHolderCode, signInvite } from '@/lib/invite';
vi.mock('@/lib/skychaser/app-origin', () => ({ APP_HOST: 'app.skychaser.io' }));
vi.mock('@/lib/skychaser/legacy', () => ({ LEGACY_HOST: 'https://app.stellarr.club' }));
import { middleware } from '@/middleware';

const env = { ...process.env };
beforeEach(() => {
  process.env.INVITE_SIGNING_KEY = 'k'.repeat(32);
  delete process.env.STELLAR_INVITE_CODES;
});
afterEach(() => {
  process.env = { ...env };
});

const get = (path: string, cookies: Record<string, string> = {}) =>
  new NextRequest(`https://skychaser.io${path}`, { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } });

describe("a holder's code", () => {
  it('is eight characters without 0, O, 1 or I', () => {
    expect(isHolderCode('ABCDEFGH')).toBe(true);
    expect(isHolderCode('ABCDEFG0')).toBe(false);
    expect(isHolderCode('abcdefgh')).toBe(false);
    expect(isHolderCode('ABCDEFGHJ')).toBe(false);
  });

  it('is signed with the key, and only with the key', async () => {
    const sig = (await signInvite('ABCDEFGH'))!;
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
    expect(await inviteSignatureValid('ABCDEFGH', sig)).toBe(true);
    expect(await inviteSignatureValid('ABCDEFGJ', sig)).toBe(false);
    expect(await inviteSignatureValid('ABCDEFGH', sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')))).toBe(false);
    expect(await inviteSignatureValid('ABCDEFGH', undefined)).toBe(false);
    process.env.INVITE_SIGNING_KEY = 'other';
    expect(await inviteSignatureValid('ABCDEFGH', sig)).toBe(false);
  });

  it('carries no signature without a key', async () => {
    delete process.env.INVITE_SIGNING_KEY;
    delete process.env.CAPSULE_SEAL_KEY;
    expect(await signInvite('ABCDEFGH')).toBeNull();
    expect(await inviteSignatureValid('ABCDEFGH', '0'.repeat(40))).toBe(false);
  });
});

describe('the closed door', () => {
  it('is not there without codes', async () => {
    const res = await middleware(get('/genesis'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it("opens to the owner's code, a signed holder's code, and no other", async () => {
    process.env.STELLAR_INVITE_CODES = 'owner-1';
    const closed = await middleware(get('/genesis'));
    expect(closed.headers.get('x-middleware-rewrite')).toContain('/invite');
    expect((await middleware(get('/genesis', { [INVITE_COOKIE]: 'owner-1' }))).headers.get('x-middleware-rewrite')).toBeNull();

    const sig = (await signInvite('ABCDEFGH'))!;
    expect((await middleware(get('/genesis', { [INVITE_COOKIE]: 'ABCDEFGH', [INVITED_COOKIE]: sig }))).headers.get('x-middleware-rewrite')).toBeNull();
    expect((await middleware(get('/genesis', { [INVITE_COOKIE]: 'ABCDEFGH' }))).headers.get('x-middleware-rewrite')).toContain('/invite');
    expect((await middleware(get('/genesis', { [INVITE_COOKIE]: 'ABCDEFGJ', [INVITED_COOKIE]: sig }))).headers.get('x-middleware-rewrite')).toContain('/invite');
  });

  it('lets a link preview through for a crawler with no invitation', async () => {
    process.env.STELLAR_INVITE_CODES = 'owner-1';
    expect((await middleware(get('/card/TYCHO/opengraph-image'))).headers.get('x-middleware-rewrite')).toBeNull();
    expect((await middleware(get('/edition/TYCHO/1/opengraph-image'))).headers.get('x-middleware-rewrite')).toBeNull();
    expect((await middleware(get('/edition/TYCHO/1'))).headers.get('x-middleware-rewrite')).toContain('/invite');
  });
});
