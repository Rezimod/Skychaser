/**
 * When an Almanac card is open and when it is sealed.
 *
 * Nothing is stored: a card is open before its event ends and sealed after,
 * read off the clock. Sealed, it is not sold, not drawn from a capsule, and
 * its unsold editions are retired. Dates are UTC in the data; the viewer's
 * own time is only ever used to print them.
 */

import type { ShelfCard } from '@/lib/sets/shelf';
import { SHELF_BY_DESIGNATION } from '@/lib/sets/shelf';

export type CardStatus = 'open' | 'sealed';

export function cardStatus(card: ShelfCard, now: Date = new Date()): CardStatus {
  const end = card.record.eventEndUtc;
  return end !== null && now.getTime() >= Date.parse(end) ? 'sealed' : 'open';
}

export function isSealed(designation: string, now: Date = new Date()): boolean {
  const card = SHELF_BY_DESIGNATION.get(designation);
  return card ? cardStatus(card, now) === 'sealed' : false;
}

/** A limited card, sold on its own only and never drawn from a capsule. */
export function isDirectOnly(designation: string): boolean {
  return SHELF_BY_DESIGNATION.get(designation)?.record.directOnly ?? false;
}

const DAY = 86_400_000;

/** "In 26 days", "Tonight", "Under way" or "Sealed". */
export function eventLabel(startUtc: string, endUtc: string, now: Date = new Date()): string {
  const t = now.getTime();
  if (t >= Date.parse(endUtc)) return 'Sealed';
  const start = Date.parse(startUtc);
  if (t >= start) return 'Under way';
  const days = Math.ceil((start - t) / DAY);
  return days <= 1 ? 'Tonight' : `In ${days} days`;
}
