// @vitest-environment node
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getNode } from '@/lib/observatory/nodes';
import {
  book,
  bookingBoard,
  bookingReady,
  cancelBooking,
  creditBalance,
  firstBookableNight,
  grantCredits,
  holderBookings,
  moonThatNight,
  nightSlots,
  redeemableEditions,
  sessionCost,
  slotsTaken,
  targetsUp,
  type BookingDb,
} from '@/lib/skychaser/booking';

const node = getNode('tbilisi-01')!;

describe('the board', () => {
  it('cuts a November night into half-hours from eight until two, on the site clock', () => {
    const slots = nightSlots(node, '2026-11-01');
    // Tbilisi is UTC+4: 20:00 local is 16:00Z; the last half-hour starts 01:30 local.
    expect(slots[0].toISOString()).toBe('2026-11-01T16:00:00.000Z');
    expect(slots[slots.length - 1].toISOString()).toBe('2026-11-01T21:30:00.000Z');
    expect(slots).toHaveLength(12);
    for (const s of slots) expect(s.getUTCMinutes() % 30).toBe(0);
  });

  it('waits for the end of twilight in summer', () => {
    const slots = nightSlots(node, '2026-06-21');
    // Twilight at -12° ends after 21:00 local on the solstice; nothing before it.
    expect(slots[0].getTime()).toBeGreaterThan(Date.parse('2026-06-21T17:00:00Z'));
    expect(slots.length).toBeLessThan(12);
  });

  it('opens on first light, then on tonight', () => {
    expect(firstBookableNight(node, new Date('2026-10-12T12:00:00Z'))).toBe('2026-11-01');
    expect(firstBookableNight(node, new Date('2026-11-20T18:00:00Z'))).toBe('2026-11-20');
    // Before noon on the site's clock is still the night before.
    expect(firstBookableNight(node, new Date('2026-11-21T03:00:00Z'))).toBe('2026-11-20');
  });

  it('knows the Moon and what is up', () => {
    const moon = moonThatNight(node, '2026-11-01');
    expect(moon.lit).toBeGreaterThanOrEqual(0);
    expect(moon.lit).toBeLessThanOrEqual(100);
    // The Pleiades ride high over Tbilisi near midnight in November; Hercules has set.
    const up = targetsUp(node, new Date('2026-11-01T20:00:00Z'));
    expect(up).toContain('m45');
    expect(up).not.toContain('m13');
  });

  it('prices a session', () => {
    expect(sessionCost(30, false)).toBe(20);
    expect(sessionCost(60, false)).toBe(36);
    expect(sessionCost(30, true)).toBe(0);
    expect(sessionCost(60, true)).toBe(16);
  });

  it('reads as fully open without a database', async () => {
    const board = await bookingBoard(null, node, new Date('2026-10-12T12:00:00Z'));
    expect(board.firstNight).toBe('2026-11-01');
    expect(board.nights).toHaveLength(21);
    expect(board.nights[0].slots.every((s) => !s.taken)).toBe(true);
    expect(board.nights[0].slots[0].up.length).toBeGreaterThan(0);
  });
});

const URL = process.env.BOOKING_TEST_DATABASE_URL;

/** The booking tables on a throwaway Postgres: BOOKING_TEST_DATABASE_URL=postgres://… npx vitest run skychaser-booking */
describe.skipIf(!URL)('the database', () => {
  let db: BookingDb;
  let pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; end: () => Promise<void> };
  const HOLDER = 'did:privy:holder';
  const OTHER = 'did:privy:other';
  const WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const ORDER = '00000000-0000-4000-8000-00000000aa01';
  const EDITION = '00000000-0000-4000-8000-00000000ee01';
  const at = (iso: string) => new Date(iso);
  const far = new Date('2026-10-01T00:00:00Z');

  beforeAll(async () => {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    pool = new Pool({ connectionString: URL });
    db = drizzle(pool as never) as unknown as BookingDb;
    await pool.query('DROP TABLE IF EXISTS telescope_slot, telescope_booking, credit_ledger, credit_account, edition, card');
    await pool.query(fs.readFileSync('scripts/skychaser-bookings.sql', 'utf8'));
    await pool.query(`CREATE TABLE card (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), designation text, name text, rarity text, edition_size integer);
      CREATE TABLE edition (id uuid PRIMARY KEY, card_id uuid, edition_number integer, owner_wallet text)`);
    const { rows } = await pool.query(`INSERT INTO card (designation, name, rarity, edition_size) VALUES ('JUPITER', 'Jupiter', 'epic', 30) RETURNING id`);
    await pool.query(`INSERT INTO edition (id, card_id, edition_number, owner_wallet) VALUES ($1, $2, 7, $3)`, [EDITION, rows[0].id, WALLET]);
  });
  afterAll(async () => {
    await pool?.end();
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE telescope_slot, telescope_booking, credit_ledger, credit_account');
  });

  const input = (over: Partial<Parameters<typeof book>[1]> = {}) => ({
    privyId: HOLDER, wallet: WALLET, wallets: [WALLET], node, startsAt: at('2026-11-05T17:00:00Z'), minutes: 30 as const, targetId: 'jupiter', editionId: null, now: far, ...over,
  });

  it('knows its tables are there', async () => {
    expect(await bookingReady(db)).toBe(true);
  });

  it('adds a pack once per order', async () => {
    expect(await grantCredits(db, { privyId: HOLDER, credits: 20, orderId: ORDER })).toEqual({ added: true, balance: 20 });
    expect(await grantCredits(db, { privyId: HOLDER, credits: 20, orderId: ORDER })).toEqual({ added: false, balance: 20 });
    expect(await creditBalance(db, HOLDER)).toBe(20);
  });

  it('books a half-hour, debits the account, and refuses the same half-hour to anyone else', async () => {
    await grantCredits(db, { privyId: HOLDER, credits: 40, orderId: ORDER });
    await grantCredits(db, { privyId: OTHER, credits: 40, orderId: '00000000-0000-4000-8000-00000000aa02' });
    const r = await book(db, input());
    expect(r).toMatchObject({ ok: true, credits: 20, balance: 20 });
    expect(await book(db, input({ privyId: OTHER }))).toEqual({ ok: false, reason: 'taken' });
    expect(await creditBalance(db, OTHER)).toBe(40);
    expect(await slotsTaken(db, node.id, at('2026-11-05T00:00:00Z'), at('2026-11-06T00:00:00Z'))).toEqual(['2026-11-05T17:00:00Z']);
    const board = await bookingBoard(db, node, far);
    expect(board.nights.find((n) => n.night === '2026-11-05')!.slots.find((s) => s.at === '2026-11-05T17:00:00Z')!.taken).toBe(true);
  });

  it('refuses without enough credits, off the grid, or too soon', async () => {
    await grantCredits(db, { privyId: HOLDER, credits: 10, orderId: ORDER });
    expect(await book(db, input())).toEqual({ ok: false, reason: 'short' });
    expect(await book(db, input({ startsAt: at('2026-11-05T17:10:00Z') }))).toEqual({ ok: false, reason: 'off_grid' });
    expect(await book(db, input({ startsAt: at('2026-11-05T12:00:00Z') }))).toEqual({ ok: false, reason: 'off_grid' });
    expect(await book(db, input({ startsAt: at('2026-10-20T17:00:00Z') }))).toEqual({ ok: false, reason: 'off_grid' });
    expect(await book(db, input({ now: at('2026-11-05T16:00:00Z') }))).toEqual({ ok: false, reason: 'too_soon' });
    expect(await creditBalance(db, HOLDER)).toBe(10);
  });

  it('takes two half-hours for an hour, and neither when the second is taken', async () => {
    await grantCredits(db, { privyId: HOLDER, credits: 100, orderId: ORDER });
    await grantCredits(db, { privyId: OTHER, credits: 100, orderId: '00000000-0000-4000-8000-00000000aa02' });
    expect(await book(db, input({ privyId: OTHER, startsAt: at('2026-11-05T17:30:00Z') }))).toMatchObject({ ok: true });
    expect(await book(db, input({ minutes: 60 }))).toEqual({ ok: false, reason: 'taken' });
    expect(await creditBalance(db, HOLDER)).toBe(100);
    expect(await book(db, input({ minutes: 60, startsAt: at('2026-11-05T18:00:00Z') }))).toMatchObject({ ok: true, credits: 36, balance: 64 });
    expect(await slotsTaken(db, node.id, at('2026-11-05T00:00:00Z'), at('2026-11-06T00:00:00Z'))).toEqual(['2026-11-05T17:30:00Z', '2026-11-05T18:00:00Z', '2026-11-05T18:30:00Z']);
    // The last half-hour of the night cannot start an hour.
    expect(await book(db, input({ minutes: 60, startsAt: at('2026-11-05T21:30:00Z') }))).toEqual({ ok: false, reason: 'off_grid' });
  });

  it('gives the credits back on a cancellation made in time, and frees the half-hour', async () => {
    await grantCredits(db, { privyId: HOLDER, credits: 20, orderId: ORDER });
    const r = await book(db, input());
    if (!r.ok) throw new Error(r.reason);
    expect(await holderBookings(db, HOLDER)).toMatchObject([{ id: r.id, startsAt: '2026-11-05T17:00:00Z', minutes: 30, targetId: 'jupiter', credits: 20 }]);
    expect(await cancelBooking(db, { privyId: OTHER, id: r.id })).toEqual({ ok: false, reason: 'not_found' });
    expect(await cancelBooking(db, { privyId: HOLDER, id: r.id })).toEqual({ ok: true, balance: 20 });
    expect(await cancelBooking(db, { privyId: HOLDER, id: r.id })).toEqual({ ok: false, reason: 'not_found' });
    expect(await slotsTaken(db, node.id, at('2026-11-05T00:00:00Z'), at('2026-11-06T00:00:00Z'))).toEqual([]);
    expect(await holderBookings(db, HOLDER)).toEqual([]);
  });

  it('keeps the credits of a session cancelled within a day', async () => {
    // A session 36 hours from now, cancelled after the window: the row stays, the half-hour stays, nothing comes back.
    await grantCredits(db, { privyId: HOLDER, credits: 20, orderId: ORDER });
    const soon = new Date(Date.now() + 10 * 3_600_000);
    await pool.query(
      `INSERT INTO telescope_booking (id, privy_id, wallet_address, node_id, night_date, starts_at, minutes, credits) VALUES ($1, $2, $3, $4, '2099-01-01', $5, 30, 20)`,
      ['00000000-0000-4000-8000-00000000bb01', HOLDER, WALLET, node.id, soon.toISOString()],
    );
    expect(await cancelBooking(db, { privyId: HOLDER, id: '00000000-0000-4000-8000-00000000bb01' })).toEqual({ ok: false, reason: 'late' });
    expect(await creditBalance(db, HOLDER)).toBe(20);
  });

  it('lets an Epic edition pay for its half-hour, once, from a wallet of the session', async () => {
    expect(await redeemableEditions(db, [WALLET])).toMatchObject([{ id: EDITION, designation: 'JUPITER', editionNumber: 7, editionSize: 30 }]);
    expect(await redeemableEditions(db, ['11111111111111111111111111111111'])).toEqual([]);
    expect(await book(db, input({ editionId: EDITION, wallets: ['11111111111111111111111111111111'] }))).toEqual({ ok: false, reason: 'edition' });
    const r = await book(db, input({ editionId: EDITION }));
    expect(r).toMatchObject({ ok: true, credits: 0, balance: 0 });
    expect(await redeemableEditions(db, [WALLET])).toEqual([]);
    expect(await book(db, input({ editionId: EDITION, startsAt: at('2026-11-05T18:00:00Z') }))).toEqual({ ok: false, reason: 'edition' });
    // Cancelled, the edition's session is free to use again; an hour with it costs the other half.
    if (!r.ok) throw new Error(r.reason);
    expect(await cancelBooking(db, { privyId: HOLDER, id: r.id })).toEqual({ ok: true, balance: 0 });
    expect(await book(db, input({ editionId: EDITION, minutes: 60 }))).toEqual({ ok: false, reason: 'short' });
    await grantCredits(db, { privyId: HOLDER, credits: 16, orderId: ORDER });
    expect(await book(db, input({ editionId: EDITION, minutes: 60 }))).toMatchObject({ ok: true, credits: 16, balance: 0 });
  });
});
