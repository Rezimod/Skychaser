/**
 * Booking the Live Telescope, paid in credits.
 *
 * A night is cut into half-hours between the operator's hours and the dark
 * window; a session is one or two of them. Credits are bought in packs on the
 * same Solana Pay rail as capsules (one credit stands for one US dollar) and
 * spent here; an Epic card's session pays for a half-hour of its own.
 *
 * Every write is one SQL statement, so a booking either takes its half-hours,
 * debits the account and records the ledger line, or does none of it. The
 * tables are in scripts/skychaser-bookings.sql; a database without them reads
 * as fully open and refuses to book.
 */

import { Body, Illumination, MoonPhase } from 'astronomy-engine';
import { sql, type SQL } from 'drizzle-orm';
import { getTonightDarkWindow } from '@/lib/dark-window';
import { evaluateSafety } from '@/lib/observatory/safety';
import { TELESCOPE_TARGET_BY_ID, targetPosition } from '@/lib/observatory/telescope-targets';
import type { ObservatoryNode } from '@/lib/observatory/types';
import type { Db } from './attach';
import { addDays } from './night';
import { siteNightDate, siteNoon } from './target';

/** First light is in November: no night before it can be booked. */
export const FIRST_NIGHT = '2026-11-01';
/** How many nights ahead the board shows. */
export const NIGHTS_AHEAD = 21;
export const SLOT_MINUTES = 30;
/** A session must be booked this long before it starts. */
export const LEAD_HOURS = 2;
/** A booking cancelled this long before it starts gives its credits back. */
export const CANCEL_HOURS = 24;

export type SessionMinutes = 30 | 60;
export const SESSION_MINUTES_CHOICES: readonly SessionMinutes[] = [30, 60];
/** PROVISIONAL. What a session costs in credits; one credit stands for one US dollar. */
export const SESSION_CREDITS: Record<SessionMinutes, number> = { 30: 20, 60: 36 };

export type CreditPack = { key: string; credits: number; usd: number };
/** PROVISIONAL. The packs on sale: bigger packs cost less a credit. */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { key: 'glimpse', credits: 20, usd: 20 },
  { key: 'night', credits: 60, usd: 54 },
  { key: 'season', credits: 150, usd: 120 },
];

export const packByKey = (key: unknown): CreditPack | undefined => CREDIT_PACKS.find((p) => p.key === key);

export type BookingTarget = { id: string; name: string; designation: string };
/** What a session may be pointed at: the bright, easy objects, each with its card's art. */
export const BOOKING_TARGETS: readonly BookingTarget[] = [
  { id: 'moon', name: 'The Moon', designation: 'MOON' },
  { id: 'jupiter', name: 'Jupiter', designation: 'JUPITER' },
  { id: 'saturn', name: 'Saturn', designation: 'SATURN' },
  { id: 'mars', name: 'Mars', designation: 'MARS' },
  { id: 'm42', name: 'Orion Nebula', designation: 'M42' },
  { id: 'm31', name: 'Andromeda', designation: 'M31' },
  { id: 'm45', name: 'Pleiades', designation: 'M45' },
  { id: 'm13', name: 'Hercules Cluster', designation: 'M13' },
];
export const isBookingTarget = (id: unknown): id is string => BOOKING_TARGETS.some((t) => t.id === id);

const STEP_MS = SLOT_MINUTES * 60_000;
/** An instant as the board and the database both write it: ISO 8601 in UTC, to the second. */
export const stamp = (d: Date) => d.toISOString().replace('.000Z', 'Z');

/** `hour` o'clock on the night of `night` at the site: 26 is two in the morning after it. */
export function siteHour(timezone: string, night: string, hour: number): Date {
  return new Date(siteNoon(timezone, night).getTime() + (hour - 12) * 3_600_000);
}

/**
 * The half-hours the telescope can be booked on one night: from the later of
 * the operator's opening hour and the end of twilight, on the half-hour of the
 * site's clock, until the earlier of closing time and dawn.
 */
export function nightSlots(node: ObservatoryNode, night: string): Date[] {
  const { fromHourLocal, toHourLocal } = node.availability ?? { fromHourLocal: 20, toHourLocal: 2 };
  const open = siteHour(node.timezone, night, fromHourLocal);
  const close = siteHour(node.timezone, night, toHourLocal <= fromHourLocal ? toHourLocal + 24 : toHourLocal);
  const dark = getTonightDarkWindow(node.lat, node.lon, siteNoon(node.timezone, night), node.timezone);
  const from = dark.duskStart && dark.duskStart > open ? dark.duskStart : open;
  const to = dark.dawnEnd && dark.dawnEnd < close ? dark.dawnEnd : close;
  const first = open.getTime() + Math.ceil((from.getTime() - open.getTime()) / STEP_MS) * STEP_MS;
  const out: Date[] = [];
  for (let t = first; t + STEP_MS <= to.getTime(); t += STEP_MS) out.push(new Date(t));
  return out;
}

/** The Moon that night: how much of it is lit, and whether it is growing. */
export function moonThatNight(node: ObservatoryNode, night: string): { lit: number; waxing: boolean } {
  const at = siteHour(node.timezone, night, 24);
  return { lit: Math.round(Illumination(Body.Moon, at).phase_fraction * 100), waxing: MoonPhase(at) < 180 };
}

/** Which of the bookable targets the telescope could work at that instant. */
export function targetsUp(node: ObservatoryNode, at: Date): string[] {
  return BOOKING_TARGETS.filter((t) => {
    const target = TELESCOPE_TARGET_BY_ID.get(t.id);
    return target && evaluateSafety(node, targetPosition(target, node, at), at).ok;
  }).map((t) => t.id);
}

export type BoardSlot = { at: string; up: string[]; taken: boolean };
export type BoardNight = { night: string; moon: { lit: number; waxing: boolean }; slots: BoardSlot[] };
export type Board = {
  node: { id: string; name: string; site: string; timezone: string };
  firstNight: string;
  nights: BoardNight[];
  credits: Record<SessionMinutes, number>;
  packs: readonly CreditPack[];
  targets: readonly BookingTarget[];
};

/** The first night that can still be booked: tonight, or first light if that is later. */
export function firstBookableNight(node: ObservatoryNode, now: Date): string {
  const tonight = siteNightDate(node.timezone, now);
  return tonight > FIRST_NIGHT ? tonight : FIRST_NIGHT;
}

const skyCache = new Map<string, Omit<BoardNight, 'slots'> & { slots: Omit<BoardSlot, 'taken'>[] }>();

/** One night's half-hours with what is up in each; the sky does not change, so it is computed once. */
function nightSky(node: ObservatoryNode, night: string) {
  const key = `${node.id}:${night}`;
  let sky = skyCache.get(key);
  if (!sky) {
    sky = {
      night,
      moon: moonThatNight(node, night),
      slots: nightSlots(node, night).map((at) => ({ at: stamp(at), up: targetsUp(node, new Date(at.getTime() + STEP_MS / 2)) })),
    };
    skyCache.set(key, sky);
    if (skyCache.size > 120) skyCache.delete(skyCache.keys().next().value!);
  }
  return sky;
}

/** The booking board: every night ahead, its half-hours, and which are taken. Public. */
export async function bookingBoard(db: BookingDb | null, node: ObservatoryNode, now: Date = new Date()): Promise<Board> {
  const first = firstBookableNight(node, now);
  const nights = Array.from({ length: NIGHTS_AHEAD }, (_, i) => nightSky(node, addDays(first, i)));
  const from = siteHour(node.timezone, first, 0);
  const to = siteHour(node.timezone, addDays(first, NIGHTS_AHEAD), 12);
  const taken = new Set(db ? await slotsTaken(db, node.id, from, to) : []);
  return {
    node: { id: node.id, name: node.name, site: node.site, timezone: node.timezone },
    firstNight: first,
    nights: nights.map((n) => ({ ...n, slots: n.slots.map((s) => ({ ...s, taken: taken.has(s.at) })) })),
    credits: SESSION_CREDITS,
    packs: CREDIT_PACKS,
    targets: BOOKING_TARGETS,
  };
}

/* ── The database ───────────────────────────────────────────────── */

export type BookingDb = Pick<Db, 'execute'>;
type Rows<T> = { rows: T[] };

function pgCode(err: unknown): string | undefined {
  const { code, cause } = err as { code?: string; cause?: { code?: string } };
  return code ?? cause?.code;
}
function pgConstraint(err: unknown): string | undefined {
  const { constraint, cause } = err as { constraint?: string; cause?: { constraint?: string } };
  return constraint ?? cause?.constraint;
}
/** The tables have not been created yet (scripts/skychaser-bookings.sql). */
export const bookingTablesMissing = (err: unknown) => pgCode(err) === '42P01';

/** Whether the credit tables exist: no pack may be sold into a database that cannot hold the credits. */
export async function bookingReady(db: BookingDb): Promise<boolean> {
  const { rows } = (await db.execute(sql`SELECT to_regclass('public.credit_account') AS t`)) as Rows<{ t: string | null }>;
  return rows[0]?.t !== null;
}

/** A timestamptz column as an ISO 8601 string in UTC, the same on every driver. */
const iso = (column: SQL) => sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

/** The half-hours already booked between two instants. */
export async function slotsTaken(db: BookingDb, nodeId: string, from: Date, to: Date): Promise<string[]> {
  try {
    const { rows } = (await db.execute(
      sql`SELECT ${iso(sql`slot_at`)} AS at FROM telescope_slot WHERE node_id = ${nodeId} AND slot_at >= ${from.toISOString()}::timestamptz AND slot_at < ${to.toISOString()}::timestamptz`,
    )) as Rows<{ at: string }>;
    return rows.map((r) => r.at);
  } catch (err) {
    if (bookingTablesMissing(err)) return [];
    throw err;
  }
}

export async function creditBalance(db: BookingDb, privyId: string): Promise<number> {
  try {
    const { rows } = (await db.execute(sql`SELECT balance FROM credit_account WHERE privy_id = ${privyId}`)) as Rows<{ balance: number }>;
    return Number(rows[0]?.balance ?? 0);
  } catch (err) {
    if (bookingTablesMissing(err)) return 0;
    throw err;
  }
}

/**
 * Credits bought with one order, added once: a confirmation retried or raced
 * finds the ledger line already written and adds nothing again.
 */
export async function grantCredits(db: BookingDb, input: { privyId: string; credits: number; orderId: string }): Promise<{ added: boolean; balance: number }> {
  const { rows } = (await db.execute(sql`
    WITH l AS (
      INSERT INTO credit_ledger (privy_id, delta, kind, order_id) VALUES (${input.privyId}, ${input.credits}, 'purchase', ${input.orderId}::uuid)
      ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING RETURNING delta
    ), a AS (
      INSERT INTO credit_account (privy_id, balance) SELECT ${input.privyId}, delta FROM l
      ON CONFLICT (privy_id) DO UPDATE SET balance = credit_account.balance + EXCLUDED.balance, updated_at = now() RETURNING balance
    )
    SELECT (SELECT count(*)::int FROM l) AS added,
           coalesce((SELECT balance FROM a), (SELECT balance FROM credit_account WHERE privy_id = ${input.privyId}), 0)::int AS balance
  `)) as Rows<{ added: number; balance: number }>;
  return { added: Number(rows[0].added) > 0, balance: Number(rows[0].balance) };
}

export type BookInput = {
  privyId: string;
  wallet: string;
  /** Every Solana wallet linked to the session: an Epic edition in any of them may pay. */
  wallets: string[];
  node: ObservatoryNode;
  startsAt: Date;
  minutes: SessionMinutes;
  targetId: string | null;
  editionId: string | null;
  now?: Date;
};
export type BookResult =
  | { ok: true; id: string; credits: number; balance: number }
  | { ok: false; reason: 'off_grid' | 'too_soon' | 'taken' | 'short' | 'edition' };

/** What a session costs after an Epic edition has paid for its half-hour. */
export function sessionCost(minutes: SessionMinutes, withEdition: boolean): number {
  return SESSION_CREDITS[minutes] - (withEdition ? SESSION_CREDITS[30] : 0);
}

/** Books a session: its half-hours, the debit and the ledger line in one statement, or nothing. */
export async function book(db: BookingDb, input: BookInput): Promise<BookResult> {
  const now = input.now ?? new Date();
  const night = siteNightDate(input.node.timezone, input.startsAt);
  const grid = new Set(nightSlots(input.node, night).map((d) => d.getTime()));
  const start = input.startsAt.getTime();
  const halves = Array.from({ length: input.minutes / SLOT_MINUTES }, (_, i) => new Date(start + i * STEP_MS));
  if (night < FIRST_NIGHT || halves.some((h) => !grid.has(h.getTime()))) return { ok: false, reason: 'off_grid' };
  if (start < now.getTime() + LEAD_HOURS * 3_600_000) return { ok: false, reason: 'too_soon' };

  const cost = sessionCost(input.minutes, !!input.editionId);
  const owned = input.editionId
    ? sql`EXISTS (SELECT 1 FROM edition e JOIN card c ON c.id = e.card_id WHERE e.id = ${input.editionId}::uuid AND c.rarity = 'epic' AND e.owner_wallet IN (${sql.join(input.wallets.map((w) => sql`${w}`), sql`, `)}))`
    : sql`true`;
  const pay =
    cost > 0
      ? sql`UPDATE credit_account SET balance = balance - ${cost}, updated_at = now() WHERE privy_id = ${input.privyId} AND balance >= ${cost} AND ${owned} RETURNING balance`
      : sql`SELECT coalesce((SELECT balance FROM credit_account WHERE privy_id = ${input.privyId}), 0)::int AS balance WHERE ${owned}`;
  const values = sql.join(halves.map((h) => sql`(${h.toISOString()}::timestamptz)`), sql`, `);
  try {
    const { rows } = (await db.execute(sql`
      WITH pay AS (${pay}), b AS (
        INSERT INTO telescope_booking (privy_id, wallet_address, node_id, night_date, starts_at, minutes, target_id, credits, edition_id)
        SELECT ${input.privyId}, ${input.wallet}, ${input.node.id}, ${night}::date, ${input.startsAt.toISOString()}::timestamptz, ${input.minutes}, ${input.targetId}, ${cost}, ${input.editionId}::uuid
        FROM pay RETURNING id
      ), s AS (
        INSERT INTO telescope_slot (node_id, slot_at, booking_id) SELECT ${input.node.id}, v.t, b.id FROM b, (VALUES ${values}) AS v(t)
      ), l AS (
        INSERT INTO credit_ledger (privy_id, delta, kind, booking_id) SELECT ${input.privyId}, ${-cost}, 'booking', b.id FROM b WHERE ${cost} > 0
      )
      SELECT b.id, pay.balance FROM b, pay
    `)) as Rows<{ id: string; balance: number }>;
    if (rows.length) return { ok: true, id: rows[0].id, credits: cost, balance: Number(rows[0].balance) };
    if (input.editionId && !(await editionRedeemable(db, input.editionId, input.wallets))) return { ok: false, reason: 'edition' };
    return { ok: false, reason: 'short' };
  } catch (err) {
    if (pgCode(err) !== '23505') throw err;
    return { ok: false, reason: pgConstraint(err) === 'telescope_booking_edition_unique' ? 'edition' : 'taken' };
  }
}

async function editionRedeemable(db: BookingDb, editionId: string, wallets: string[]): Promise<boolean> {
  return (await redeemableEditions(db, wallets)).some((e) => e.id === editionId);
}

export type RedeemableEdition = { id: string; designation: string; name: string; editionNumber: number; editionSize: number };

/** The Epic editions in these wallets whose session has not been booked. */
export async function redeemableEditions(db: BookingDb, wallets: string[]): Promise<RedeemableEdition[]> {
  if (!wallets.length) return [];
  try {
    const { rows } = (await db.execute(sql`
      SELECT e.id, c.designation, c.name, e.edition_number AS "editionNumber", c.edition_size AS "editionSize"
      FROM edition e JOIN card c ON c.id = e.card_id
      WHERE c.rarity = 'epic' AND e.owner_wallet IN (${sql.join(wallets.map((w) => sql`${w}`), sql`, `)})
        AND NOT EXISTS (SELECT 1 FROM telescope_booking b WHERE b.edition_id = e.id AND b.status = 'booked')
      ORDER BY c.name, e.edition_number
    `)) as Rows<RedeemableEdition>;
    return rows.map((r) => ({ ...r, editionNumber: Number(r.editionNumber), editionSize: Number(r.editionSize) }));
  } catch (err) {
    if (bookingTablesMissing(err)) return [];
    throw err;
  }
}

export type HolderBooking = { id: string; startsAt: string; minutes: SessionMinutes; targetId: string | null; credits: number; editionId: string | null };

/** The holder's sessions still to come. */
export async function holderBookings(db: BookingDb, privyId: string): Promise<HolderBooking[]> {
  try {
    const { rows } = (await db.execute(sql`
      SELECT id, ${iso(sql`starts_at`)} AS "startsAt", minutes, target_id AS "targetId", credits, edition_id AS "editionId"
      FROM telescope_booking WHERE privy_id = ${privyId} AND status = 'booked' AND starts_at > now() - interval '1 hour' ORDER BY starts_at
    `)) as Rows<HolderBooking>;
    return rows.map((r) => ({ ...r, minutes: Number(r.minutes) as SessionMinutes, credits: Number(r.credits) }));
  } catch (err) {
    if (bookingTablesMissing(err)) return [];
    throw err;
  }
}

export type CancelResult = { ok: true; balance: number } | { ok: false; reason: 'not_found' | 'late' };

/** Cancels a session, frees its half-hours and returns its credits, if it is still a day away. */
export async function cancelBooking(db: BookingDb, input: { privyId: string; id: string }): Promise<CancelResult> {
  const { rows } = (await db.execute(sql`
    WITH c AS (
      UPDATE telescope_booking SET status = 'cancelled', cancelled_at = now()
      WHERE id = ${input.id}::uuid AND privy_id = ${input.privyId} AND status = 'booked' AND starts_at > now() + ${sql.raw(`interval '${CANCEL_HOURS} hours'`)}
      RETURNING id, credits
    ), d AS (
      DELETE FROM telescope_slot WHERE booking_id IN (SELECT id FROM c)
    ), r AS (
      INSERT INTO credit_ledger (privy_id, delta, kind, booking_id) SELECT ${input.privyId}, credits, 'refund', id FROM c WHERE credits > 0
    ), a AS (
      UPDATE credit_account SET balance = credit_account.balance + c.credits, updated_at = now() FROM c
      WHERE credit_account.privy_id = ${input.privyId} AND c.credits > 0 RETURNING credit_account.balance
    )
    SELECT c.id, coalesce((SELECT balance FROM a), (SELECT balance FROM credit_account WHERE privy_id = ${input.privyId}), 0)::int AS balance FROM c
  `)) as Rows<{ id: string; balance: number }>;
  if (rows.length) return { ok: true, balance: Number(rows[0].balance) };
  const { rows: found } = (await db.execute(
    sql`SELECT 1 FROM telescope_booking WHERE id = ${input.id}::uuid AND privy_id = ${input.privyId} AND status = 'booked'`,
  )) as Rows<unknown>;
  return { ok: false, reason: found.length ? 'late' : 'not_found' };
}
