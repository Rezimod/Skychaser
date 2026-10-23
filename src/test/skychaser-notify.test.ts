// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Db } from '@/lib/skychaser/attach';

const dialect = new PgDialect();
const state = { notices: [] as string[], holders: [] as Array<{ privy_id: string; email: string; wallet: string; notify: boolean }>, editions: [] as Array<{ card_id: string; owner_wallet: string }>, events: [] as unknown[] };
vi.mock('@/lib/skychaser/events', () => ({ recordEvent: async (_db: unknown, event: string, input: unknown) => void state.events.push([event, input]) }));

import { compose, notice, notifyConfigured, notifyPhotographed, notifyWeekChosen, unsubscribeToken, unsubscribeTokenValid, unsubscribeUrl } from '@/lib/skychaser/notify';

function run(sql: string, params: unknown[]): { rows: unknown[] } {
  if (/INSERT INTO holder_notice/.test(sql)) {
    const key = params.join('|');
    if (state.notices.includes(key)) return { rows: [] };
    state.notices.push(key);
    return { rows: [{ privy_id: params[0] }] };
  }
  if (/JOIN edition e ON e.owner_wallet = h.wallet/.test(sql)) {
    const wallets = new Set(state.editions.filter((e) => e.card_id === params[0]).map((e) => e.owner_wallet));
    return { rows: state.holders.filter((h) => h.notify && wallets.has(h.wallet)).map((h) => ({ privy_id: h.privy_id, email: h.email })) };
  }
  throw new Error(`unexpected statement: ${sql}`);
}
const db = { execute: (q: SQL) => { const { sql, params } = dialect.sqlToQuery(q); return Promise.resolve().then(() => run(sql, params)); } } as unknown as Db;

const env = { ...process.env };
const fetchMock = vi.fn();
beforeEach(() => {
  process.env.INVITE_SIGNING_KEY = 'k'.repeat(32);
  process.env.RESEND_API_KEY = 're_test';
  process.env.NOTIFY_FROM = 'Skychaser <notices@skychaser.io>';
  state.notices = [];
  state.events = [];
  state.holders = [
    { privy_id: 'a', email: 'a@example.org', wallet: 'wa', notify: true },
    { privy_id: 'b', email: 'b@example.org', wallet: 'wb', notify: true },
    { privy_id: 'c', email: 'c@example.org', wallet: 'wc', notify: false },
  ];
  state.editions = [{ card_id: 'card-1', owner_wallet: 'wa' }, { card_id: 'card-1', owner_wallet: 'wb' }, { card_id: 'card-1', owner_wallet: 'wc' }, { card_id: 'card-2', owner_wallet: 'wa' }];
  fetchMock.mockReset().mockResolvedValue({ ok: true, text: async () => '' });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...env };
});

describe('a notice', () => {
  it('is written in the logbook’s voice, with one link and the way out', () => {
    const m = compose({ subject: 'Saturn is this week’s target', lines: ['Your card Saturn was chosen.'], link: { href: 'https://skychaser.io/card/SATURN', label: 'The card' }, unsubscribe: 'https://skychaser.io/u' });
    expect(m.text).toContain('The card: https://skychaser.io/card/SATURN');
    expect(m.text).toContain('No more email about your cards: https://skychaser.io/u');
    expect(m.html).toContain('href="https://skychaser.io/card/SATURN"');
    expect(m.html).toContain('href="https://skychaser.io/u"');
    expect(m.text).not.toMatch(/!/);
    expect(compose({ subject: 's', lines: ['<b>'], link: { href: 'h', label: 'l' }, unsubscribe: null }).html).toContain('&lt;b&gt;');
  });

  it('reaches every holder of the card who takes email, once per key', async () => {
    const card = { id: 'card-1', designation: 'SATURN', name: 'Saturn' };
    expect(await notifyWeekChosen(db, { card, week: '2026-10-19', night: '2026-10-22' })).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Array<{ to: string[]; subject: string; text: string }>;
    expect(body.map((m) => m.to[0]).sort()).toEqual(['a@example.org', 'b@example.org']);
    expect(body[0].subject).toBe('Saturn is this week’s target');
    expect(body[0].text).toContain('unsubscribe?id=');
    expect(state.events).toEqual([['notice_sent', expect.objectContaining({ props: { kind: 'week_chosen', key: '2026-10-19', claimed: 2, sent: 2 } })]]);

    expect(await notifyWeekChosen(db, { card, week: '2026-10-19', night: '2026-10-23' })).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await notifyPhotographed(db, { card, night: '2026-10-22' })).toBe(2);
  });

  it('sends nothing, and records nothing, without Resend', async () => {
    delete process.env.RESEND_API_KEY;
    expect(notifyConfigured()).toBe(false);
    expect(await notifyWeekChosen(db, { card: { id: 'card-1', designation: 'SATURN', name: 'Saturn' }, week: '2026-10-19', night: '2026-10-22' })).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.notices).toEqual([]);
  });

  it('logs a refused batch and does not write to those holders again', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'bad' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await notice(db, { kind: 'photographed', key: 'n', recipients: [{ privyId: 'a', email: 'a@example.org' }], message: () => ({ subject: 's', text: 't', html: 'h' }) })).toBe(0);
    expect(spy).toHaveBeenCalled();
    expect(await notice(db, { kind: 'photographed', key: 'n', recipients: [{ privyId: 'a', email: 'a@example.org' }], message: () => ({ subject: 's', text: 't', html: 'h' }) })).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('the way out', () => {
  it('is signed for one account', () => {
    const t = unsubscribeToken('did:privy:a')!;
    expect(t).toMatch(/^[0-9a-f]{40}$/);
    expect(unsubscribeTokenValid('did:privy:a', t)).toBe(true);
    expect(unsubscribeTokenValid('did:privy:b', t)).toBe(false);
    expect(unsubscribeTokenValid('did:privy:a', t.slice(0, 39) + 'x')).toBe(false);
    expect(unsubscribeUrl('did:privy:a')).toBe(`https://skychaser.io/api/skychaser/notify/unsubscribe?id=did%3Aprivy%3Aa&t=${t}`);
    delete process.env.INVITE_SIGNING_KEY;
    delete process.env.CAPSULE_SEAL_KEY;
    expect(unsubscribeUrl('did:privy:a')).toBeNull();
    expect(unsubscribeTokenValid('did:privy:a', t)).toBe(false);
  });
});
