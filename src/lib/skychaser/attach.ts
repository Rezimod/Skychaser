/**
 * One photograph, every holder.
 *
 * A night's capture is attached to a card, not to people: the night's row
 * records the capture as history, and one UPDATE moves the pointer on every
 * edition of the card at once, however many there are. Both go in one
 * neon-http batch, which runs as a single transaction — there are no
 * interactive transactions over HTTP, and a pointer without its history row
 * (or the other way round) is the one state this must never leave behind.
 */

import { and, eq, exists, gt, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { card, edition, nightlyTarget } from '@/lib/schema'
import type { ObservatoryNode } from '@/lib/observatory/types'
import { siteNightDate } from './target'

export type Db = NonNullable<ReturnType<typeof getDb>>

function attachStatements(
  db: Db,
  input: { cardId: string; nightDate: string; captureId: string },
) {
  const taken = db
    .select({ one: sql`1` })
    .from(nightlyTarget)
    .where(
      and(
        eq(nightlyTarget.nightDate, input.nightDate),
        eq(nightlyTarget.cardId, input.cardId),
        eq(nightlyTarget.captureId, input.captureId),
      ),
    )
  const later = db
    .select({ id: nightlyTarget.id })
    .from(nightlyTarget)
    .where(
      and(
        eq(nightlyTarget.cardId, input.cardId),
        isNotNull(nightlyTarget.captureId),
        gt(nightlyTarget.nightDate, input.nightDate),
      ),
    )

  return [
    // The first frame of the night wins, decided by the row itself: a second
    // capture finds capture_id already set and changes nothing. A night that
    // was never decided for this card has no row to take it.
    db
      .update(nightlyTarget)
      .set({ captureId: input.captureId })
      .where(
        and(
          eq(nightlyTarget.nightDate, input.nightDate),
          eq(nightlyTarget.cardId, input.cardId),
          isNull(nightlyTarget.captureId),
        ),
      )
      .returning({ id: nightlyTarget.id }),
    // Every edition of the card, in one statement, and only if the night above
    // now holds this capture. The second guard keeps the pointer on the latest
    // night: a late capture for an older night joins the history without
    // winding every holder's card back.
    db
      .update(edition)
      .set({ observationCaptureId: input.captureId })
      .where(and(eq(edition.cardId, input.cardId), exists(taken), notExists(later))),
  ] as const
}

/** True when the night took this capture; false when it already had one, or was never this card's. */
export async function attachCaptureToCard(
  db: Db,
  input: { cardId: string; nightDate: string; captureId: string },
): Promise<boolean> {
  const [night] = await db.batch(attachStatements(db, input))
  return night.length > 0
}

/**
 * A capture the cron recorded for some other reason — a queued request — that
 * happens to be of tonight's chosen object.
 *
 * Only the first frame of the night is taken: once the night has a capture,
 * later ones on the same target leave it alone. Returns the card id attached
 * to, or null when tonight's card is something else or already observed.
 */
export async function attachToTonightsCard(
  db: Db,
  node: ObservatoryNode,
  input: { targetId: string; captureId: string; now: Date },
): Promise<string | null> {
  const nightDate = siteNightDate(node.timezone, input.now)

  const [tonight] = await db
    .select({ cardId: nightlyTarget.cardId })
    .from(nightlyTarget)
    .innerJoin(card, eq(card.id, nightlyTarget.cardId))
    .where(
      and(
        eq(nightlyTarget.nightDate, nightDate),
        eq(card.targetId, input.targetId),
        isNull(nightlyTarget.captureId),
      ),
    )
    .limit(1)
  if (!tonight) return null

  const attached = await attachCaptureToCard(db, { cardId: tonight.cardId, nightDate, captureId: input.captureId })
  return attached ? tonight.cardId : null
}
