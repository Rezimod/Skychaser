import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/skychaser/attach';

const WALLET = 'So1anaWa11etAddre55xxxxxxxxxxxxxxxxxxxxxxx';
const holder = vi.hoisted(() => ({ address: '' as string | null, authenticated: true }));
vi.mock('@/components/skychaser/usePrivySafe', () => ({ usePrivySafe: () => ({ login: () => {}, logout: async () => {}, getAccessToken: async () => 'token' }) }));
vi.mock('@/components/skychaser/useSkychaserHolder', () => ({
  useSkychaserHolder: () => ({ ready: true, authenticated: holder.authenticated, address: holder.address }),
}));
import CollectionCapsules from '@/components/skychaser/CollectionCapsules';
import { heldCapsules, type HeldCapsule } from '@/lib/skychaser/capsule';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

const held: HeldCapsule[] = [
  { capsuleId: '00000000-0000-4000-8000-000000000007', sequence: 7, tier: 'iron', purchasedAt: '2026-10-24T10:00:00.000Z', payment: 'paid', expiresAt: '2026-10-24T10:15:00.000Z' },
  { capsuleId: '00000000-0000-4000-8000-000000000009', sequence: 9, tier: null, purchasedAt: '2026-10-24T11:00:00.000Z', payment: 'pending', expiresAt: '2099-01-01T00:00:00.000Z' },
];

async function render(wallet: string) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ capsules: held }) }));
  vi.stubGlobal('fetch', fetch);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(CollectionCapsules, { wallet })));
  await act(async () => {});
  return { host, fetch, done: async () => { await act(async () => root.unmount()); host.remove(); } };
}

describe('sealed capsules on the Collection', () => {
  it('lists the holder’s bought, unopened capsules, each with a link to open it', async () => {
    holder.address = WALLET;
    const { host, fetch, done } = await render(WALLET);
    expect(fetch).toHaveBeenCalledWith('/api/skychaser/capsules/mine', { headers: { Authorization: 'Bearer token' } });
    const links = [...host.querySelectorAll('.sd-coll__sealed-list a')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([`/capsule/${held[0].capsuleId}`, `/capsule/${held[1].capsuleId}`]);
    const rows = [...host.querySelectorAll('.sd-coll__sealed-list li')].map((li) => li.textContent);
    expect(rows[0]).toMatch(/Capsule 007.*Explorer.*Paid.*Open/);
    expect(rows[1]).toMatch(/Capsule 009.*Awaiting payment.*Open/);
    expect(host.querySelector('#coll-sealed')?.textContent).toContain('2');
    await done();
  });

  it('shows nothing on someone else’s Collection, and does not ask', async () => {
    holder.address = 'AnotherWa11etxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const { host, fetch, done } = await render(WALLET);
    expect(fetch).not.toHaveBeenCalled();
    expect(host.innerHTML).toBe('');
    await done();
  });
});

describe('heldCapsules', () => {
  it('reads the account’s purchased capsules that are paid (not a rehearsal) or still in their window', async () => {
    const execute = vi.fn(async (_q: SQL) => ({
      rows: [{ id: 'c1', sequence: '12', tier: 'lunar', purchased_at: new Date('2026-10-24T09:00:00Z'), status: 'paid', expires_at: null }],
    }));
    const out = await heldCapsules({ execute } as unknown as Db, 'did:privy:holder');
    expect(out).toEqual([{ capsuleId: 'c1', sequence: 12, tier: 'lunar', purchasedAt: '2026-10-24T09:00:00.000Z', payment: 'paid', expiresAt: null }]);
    const { sql, params } = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(sql).toMatch(/o\.privy_id = \$1/);
    expect(sql).toMatch(/c\.state = 'purchased'/);
    expect(sql).toMatch(/o\.status = 'paid'/);
    expect(sql).toMatch(/o\.status = 'pending' AND o\.expires_at > now\(\)/);
    expect(params).toContain('did:privy:holder');
    expect(params).toContain('simulated-no-payment:%');
  });
});
