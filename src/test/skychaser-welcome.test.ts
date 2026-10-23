// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Db } from '@/lib/skychaser/attach';

const dialect = new PgDialect();

type Card = { id: string; designation: string; name: string; rarity: string; edition_size: number; status: string };
type Contact = { privy_id: string; wallet: string; welcome_edition_id: string | null; welcome_claimed_at: string | null };
type Edition = { id: string; card_id: string; edition_number: number; owner_wallet: string };

const state: { cards: Card[]; contacts: Contact[]; editions: Edition[]; allocations: number } = { cards: [], contacts: [], editions: [], allocations: 0 };

vi.mock('@/lib/skychaser/repo', () => ({
  allocateEdition: async (_db: unknown, cardId: string, wallet: string) => {
    state.allocations++;
    const card = state.cards.find((c) => c.id === cardId)!;
    const taken = state.editions.filter((e) => e.card_id === cardId).length;
    if (taken >= card.edition_size) return null;
    const row = { id: `e-${cardId}-${taken + 1}`, card_id: cardId, edition_number: taken + 1, owner_wallet: wallet };
    state.editions.push(row);
    return { id: row.id, editionNumber: row.edition_number };
  },
}));

import { grantWelcome, readWelcome, WELCOME_CARDS } from '@/lib/skychaser/welcome';

function run(sql: string, params: unknown[]): { rows: unknown[] } {
  if (/FROM holder_contact h/.test(sql)) {
    const h = state.contacts.find((c) => c.privy_id === params[0]);
    const e = h?.welcome_edition_id ? state.editions.find((x) => x.id === h.welcome_edition_id) : null;
    const c = e ? state.cards.find((x) => x.id === e.card_id)! : null;
    return { rows: e && c ? [{ id: e.id, designation: c.designation, name: c.name, rarity: c.rarity, edition_number: e.edition_number, edition_size: c.edition_size }] : [] };
  }
  if (/SELECT 1 AS one FROM holder_contact/.test(sql)) {
    return { rows: state.contacts.some((c) => c.wallet === params[0] && c.welcome_edition_id && c.privy_id !== params[1]) ? [{ one: 1 }] : [] };
  }
  if (/UPDATE holder_contact SET welcome_claimed_at = now\(\)/.test(sql)) {
    const h = state.contacts.find((c) => c.privy_id === params[0] && !c.welcome_claimed_at && !c.welcome_edition_id);
    if (!h) return { rows: [] };
    h.welcome_claimed_at = 'now';
    return { rows: [{ privy_id: h.privy_id }] };
  }
  if (/FROM card c JOIN card_set s/.test(sql)) {
    const c = state.cards.find((x) => x.designation === params[0] && x.status === 'released');
    return { rows: c ? [{ id: c.id, name: c.name, rarity: c.rarity, edition_size: c.edition_size }] : [] };
  }
  if (/UPDATE holder_contact SET welcome_edition_id/.test(sql)) {
    const h = state.contacts.find((c) => c.privy_id === params[1])!;
    h.welcome_edition_id = params[0] as string;
    return { rows: [] };
  }
  if (/UPDATE holder_contact SET welcome_claimed_at = NULL/.test(sql)) {
    const h = state.contacts.find((c) => c.privy_id === params[0] && !c.welcome_edition_id);
    if (h) h.welcome_claimed_at = null;
    return { rows: [] };
  }
  throw new Error(`unexpected statement: ${sql}`);
}

const db = {
  execute: (query: SQL) => {
    const { sql, params } = dialect.sqlToQuery(query);
    return Promise.resolve().then(() => run(sql, params));
  },
} as unknown as Db;

const card = (designation: string, size = 300, status = 'released'): Card => ({ id: `c-${designation}`, designation, name: designation, rarity: 'common', edition_size: size, status });

beforeEach(() => {
  state.cards = WELCOME_CARDS.map((d) => card(d));
  state.contacts = [{ privy_id: 'p1', wallet: 'w1', welcome_edition_id: null, welcome_claimed_at: null }];
  state.editions = [];
  state.allocations = 0;
});

describe('the first card', () => {
  it('is First Light, No. 001, given once', async () => {
    const first = await grantWelcome(db, { privyId: 'p1', wallet: 'w1' });
    expect(first).toMatchObject({ fresh: true, edition: { designation: 'FIRST-LIGHT', editionNumber: 1, editionSize: 300 } });
    expect(state.contacts[0].welcome_edition_id).toBe(first.edition!.editionId);

    const again = await grantWelcome(db, { privyId: 'p1', wallet: 'w1' });
    expect(again).toMatchObject({ fresh: false, edition: { editionId: first.edition!.editionId } });
    expect(state.allocations).toBe(1);
    expect(await readWelcome(db, 'p1')).toMatchObject({ designation: 'FIRST-LIGHT', editionNumber: 1 });
  });

  it('moves down the list once First Light is gone', async () => {
    state.cards[0].edition_size = 1;
    state.editions.push({ id: 'taken', card_id: 'c-FIRST-LIGHT', edition_number: 1, owner_wallet: 'someone' });
    const r = await grantWelcome(db, { privyId: 'p1', wallet: 'w1' });
    expect(r.edition?.designation).toBe(WELCOME_CARDS[1]);
  });

  it('waits for the set to be released, and lets the next sign-in try again', async () => {
    for (const c of state.cards) c.status = 'draft';
    expect(await grantWelcome(db, { privyId: 'p1', wallet: 'w1' })).toEqual({ edition: null, fresh: false });
    expect(state.contacts[0].welcome_claimed_at).toBeNull();
    expect(state.allocations).toBe(0);
    state.cards[0].status = 'released';
    expect((await grantWelcome(db, { privyId: 'p1', wallet: 'w1' })).fresh).toBe(true);
  });

  it('is not given twice to one wallet under two accounts', async () => {
    state.contacts.push({ privy_id: 'p2', wallet: 'w1', welcome_edition_id: null, welcome_claimed_at: null });
    expect((await grantWelcome(db, { privyId: 'p1', wallet: 'w1' })).fresh).toBe(true);
    expect(await grantWelcome(db, { privyId: 'p2', wallet: 'w1' })).toEqual({ edition: null, fresh: false });
    expect(state.allocations).toBe(1);
  });

  it('is one card between two sign-ins arriving together', async () => {
    const [a, b] = await Promise.all([grantWelcome(db, { privyId: 'p1', wallet: 'w1' }), grantWelcome(db, { privyId: 'p1', wallet: 'w1' })]);
    expect([a.fresh, b.fresh].filter(Boolean)).toHaveLength(1);
    expect(state.allocations).toBe(1);
    const winner = a.fresh ? a : b;
    const loser = a.fresh ? b : a;
    // The loser reads what the winner gave, or nothing yet if it looked before the pointer was written.
    if (loser.edition) expect(loser.edition.editionId).toBe(winner.edition!.editionId);
  });

  it('is nobody when the account has no row yet', async () => {
    expect(await grantWelcome(db, { privyId: 'nobody', wallet: 'w9' })).toEqual({ edition: null, fresh: false });
    expect(state.allocations).toBe(0);
  });
});
