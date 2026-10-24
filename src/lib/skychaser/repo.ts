/**
 * The small set of reads and writes the Skychaser slice needs.
 *
 * Each takes the database as an argument rather than reaching for it, so the
 * lifecycle script, the cron hook and the Collection page all share one path
 * and a test can hand in a fake.
 */

import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { card, edition, nightlyTarget, observatoryCapture } from '@/lib/schema'
import type { Db } from './attach'

export type CardRow = typeof card.$inferSelect

/** Insert the card, or bring an existing one with the same designation up to date. */
export async function upsertCard(db: Db, seed: typeof card.$inferInsert): Promise<CardRow> {
  const [row] = await db
    .insert(card)
    .values(seed)
    .onConflictDoUpdate({ target: card.designation, set: seed })
    .returning()
  return row
}

/**
 * The next edition number of a card, to this holder.
 *
 * One statement: the number is computed and written together, and the unique
 * (card_id, edition_number) index is what settles two holders arriving at once
 * — the loser collides and asks again. A card photographed before this edition
 * existed hands it that photograph at once. Returns null when the card is sold
 * out; a card that does not exist is an error, not a sold-out card. Not for
 * sales or grants: those allocate through orders.ts, behind the set's lock,
 * leaving what capsules are owed, and log each one publicly. This one does
 * none of that, so only the lifecycle script uses it.
 */
export async function allocateEdition(
  db: Db,
  cardId: string,
  ownerWallet: string,
): Promise<{ id: string; editionNumber: number } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { rows } = await db.execute(sql`
        INSERT INTO edition (card_id, edition_number, owner_wallet, observation_capture_id)
        SELECT ${cardId}::uuid, COALESCE(MAX(e.edition_number), 0) + 1, ${ownerWallet},
          (SELECT nt.capture_id FROM nightly_target nt
           WHERE nt.card_id = ${cardId}::uuid AND nt.capture_id IS NOT NULL
           ORDER BY nt.night_date DESC LIMIT 1)
        FROM edition e
        WHERE e.card_id = ${cardId}::uuid
        HAVING COALESCE(MAX(e.edition_number), 0) < (SELECT edition_size FROM card WHERE id = ${cardId}::uuid)
        RETURNING id, edition_number
      `)
      const row = rows[0] as { id: string; edition_number: number } | undefined
      if (row) return { id: row.id, editionNumber: Number(row.edition_number) }

      const [known] = await db.select({ id: card.id }).from(card).where(eq(card.id, cardId)).limit(1)
      if (!known) throw new Error(`Cannot allocate an edition: no card has id ${cardId}`)
      return null
    } catch (err) {
      // Drizzle wraps the driver's error; the Postgres code is on its cause.
      const { code, cause } = err as { code?: string; cause?: { code?: string } }
      if ((code ?? cause?.code) !== '23505') throw err
    }
  }
  throw new Error('edition allocation kept colliding')
}

/**
 * The night's card, decided once.
 *
 * The first decision for a date stands: asking again returns what was already
 * chosen rather than choosing again, so a re-run cannot change a night that
 * holders may already have been told about.
 */
export async function decideNightlyTarget(
  db: Db,
  input: Pick<typeof nightlyTarget.$inferInsert, 'nightDate' | 'cardId' | 'decisionBasis' | 'plannedAt' | 'cloudForecast'>,
): Promise<typeof nightlyTarget.$inferSelect> {
  await db.insert(nightlyTarget).values(input).onConflictDoNothing({ target: nightlyTarget.nightDate })
  const [row] = await db.select().from(nightlyTarget).where(eq(nightlyTarget.nightDate, input.nightDate))
  return row
}

export type CaptureSummary = {
  id: string
  targetName: string
  capturedAt: string
  provenance: string
  nodeId: string
}

export type HolderEdition = {
  editionId: string
  designation: string
  name: string
  editionNumber: number
  editionSize: number
  rarity: string
  observationStatus: string
  latest: CaptureSummary | null
  /** Every night this card was photographed, most recent first. */
  history: Array<CaptureSummary & { nightDate: string }>
}

const captureColumns = {
  id: observatoryCapture.id,
  targetName: observatoryCapture.targetName,
  capturedAt: observatoryCapture.capturedAt,
  provenance: observatoryCapture.provenance,
  nodeId: observatoryCapture.nodeId,
}

function summary(row: { id: string; targetName: string; capturedAt: Date; provenance: string; nodeId: string }): CaptureSummary {
  return {
    id: row.id,
    targetName: row.targetName,
    capturedAt: row.capturedAt.toISOString(),
    provenance: row.provenance,
    nodeId: row.nodeId,
  }
}

/**
 * A holder's editions, each with its card's latest capture and full history.
 *
 * The latest is read off the card's history rather than the edition's own
 * pointer, so an edition is never behind the card it is a copy of — however
 * late it was allocated, or however a write raced it.
 */
export async function holderView(db: Db, wallet: string): Promise<HolderEdition[]> {
  const rows = await db
    .select({
      editionId: edition.id,
      cardId: card.id,
      designation: card.designation,
      name: card.name,
      editionNumber: edition.editionNumber,
      editionSize: card.editionSize,
      rarity: card.rarity,
      observationStatus: card.observationStatus,
    })
    .from(edition)
    .innerJoin(card, eq(card.id, edition.cardId))
    .where(eq(edition.ownerWallet, wallet))
    .orderBy(asc(card.designation), asc(edition.editionNumber))
  if (rows.length === 0) return []

  const nights = await db
    .select({ cardId: nightlyTarget.cardId, nightDate: nightlyTarget.nightDate, ...captureColumns })
    .from(nightlyTarget)
    .innerJoin(observatoryCapture, eq(observatoryCapture.id, nightlyTarget.captureId))
    .where(inArray(nightlyTarget.cardId, [...new Set(rows.map((r) => r.cardId))]))
    .orderBy(desc(nightlyTarget.nightDate))

  return rows.map((r) => {
    const own = nights.filter((n) => n.cardId === r.cardId)
    return {
      editionId: r.editionId,
      designation: r.designation,
      name: r.name,
      editionNumber: r.editionNumber,
      editionSize: r.editionSize,
      rarity: r.rarity,
      observationStatus: r.observationStatus,
      latest: own[0] ? summary(own[0]) : null,
      history: own.map((n) => ({ ...summary(n), nightDate: n.nightDate })),
    }
  })
}

export type EditionView = {
  editionId: string
  designation: string
  name: string
  rarity: string
  observationStatus: string
  editionNumber: number
  editionSize: number
  ownerWallet: string
  acquiredAt: string
  /** How it came to its holder: a capsule (with its public sequence), bought outright, or the first card given on sign-in. */
  provenance: { kind: 'capsule'; capsuleId: string; sequence: number | null } | { kind: 'outright' } | { kind: 'welcome' } | { kind: 'given' }
  latest: CaptureSummary | null
}

/**
 * One edition, by its card and number, as its own page shows it. Null when
 * the card has no such edition yet. A card that does not exist reads the same
 * way: the page decides what to say.
 */
export async function readEdition(db: Db, designation: string, editionNumber: number): Promise<EditionView | null> {
  const { rows } = (await db.execute(sql`
    SELECT e.id, e.edition_number, e.owner_wallet, e.acquired_at, e.capsule_id, e.order_id,
      c.id AS card_id, c.designation, c.name, c.rarity, c.edition_size, c.observation_status,
      (SELECT cp.sequence FROM capsule cp WHERE cp.id = e.capsule_id) AS sequence,
      EXISTS (SELECT 1 FROM holder_contact h WHERE h.welcome_edition_id = e.id) AS welcome
    FROM edition e JOIN card c ON c.id = e.card_id
    WHERE c.designation = ${designation} AND e.edition_number = ${editionNumber}
  `)) as {
    rows: Array<{
      id: string; edition_number: number | string; owner_wallet: string; acquired_at: string | Date; capsule_id: string | null; order_id: string | null
      card_id: string; designation: string; name: string; rarity: string; edition_size: number | string; observation_status: string
      sequence: number | string | null; welcome: boolean
    }>
  }
  const r = rows[0]
  if (!r) return null

  const [night] = await db
    .select({ cardId: nightlyTarget.cardId, ...captureColumns })
    .from(nightlyTarget)
    .innerJoin(observatoryCapture, eq(observatoryCapture.id, nightlyTarget.captureId))
    .where(eq(nightlyTarget.cardId, r.card_id))
    .orderBy(desc(nightlyTarget.nightDate))
    .limit(1)

  const provenance: EditionView['provenance'] = r.capsule_id
    ? { kind: 'capsule', capsuleId: r.capsule_id, sequence: r.sequence === null ? null : Number(r.sequence) }
    : r.order_id
      ? { kind: 'outright' }
      : r.welcome
        ? { kind: 'welcome' }
        : { kind: 'given' }

  return {
    editionId: r.id,
    designation: r.designation,
    name: r.name,
    rarity: r.rarity,
    observationStatus: r.observation_status,
    editionNumber: Number(r.edition_number),
    editionSize: Number(r.edition_size),
    ownerWallet: r.owner_wallet,
    acquiredAt: new Date(r.acquired_at).toISOString(),
    provenance,
    latest: night ? summary(night) : null,
  }
}
