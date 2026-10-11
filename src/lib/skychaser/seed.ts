/**
 * Files a set and its cards in the database.
 *
 * Idempotent: the set is matched on its code and each card on its designation,
 * so a re-run brings rows up to date and adds nothing. A set already released
 * stays released. Editions and nights are never touched. A card the set no
 * longer lists is removed only while no edition of it exists; otherwise it is
 * kept for its holders but closed at the editions it has, so no capsule draws
 * it again, and named.
 */

import { sql } from 'drizzle-orm';
import { cardSet } from '@/lib/schema';
import type { AuthoredCard } from '@/lib/sets/build';
import type { Db } from './attach';
import { upsertCard, type CardRow } from './repo';

export type SetSpec = {
  code: string;
  name: string;
  status: string;
  releasedAt: Date | null;
};

export async function seedSet(
  db: Db,
  spec: SetSpec,
  cards: AuthoredCard[],
): Promise<{ setId: string; cards: CardRow[]; removed: string[]; kept: string[] }> {
  const values = { ...spec, cardCount: cards.length };
  const [set] = await db
    .insert(cardSet)
    .values(values)
    .onConflictDoUpdate({ target: cardSet.code, set: { name: spec.name, cardCount: cards.length } })
    .returning({ id: cardSet.id });

  const rows: CardRow[] = [];
  for (const c of cards) rows.push(await upsertCard(db, { ...c.seed, setId: set.id }));

  const listed = sql`ARRAY[${sql.join(cards.map((c) => sql`${c.seed.designation}`), sql`, `)}]::text[]`;
  const { rows: gone } = (await db.execute(sql`
    DELETE FROM card c
    WHERE c.set_id = ${set.id}::uuid
      AND c.designation <> ALL(${listed})
      AND NOT EXISTS (SELECT 1 FROM edition e WHERE e.card_id = c.id)
    RETURNING c.designation
  `)) as { rows: Array<{ designation: string }> };
  const { rows: stuck } = (await db.execute(sql`
    UPDATE card c
    SET edition_size = (SELECT MAX(e.edition_number) FROM edition e WHERE e.card_id = c.id)
    WHERE c.set_id = ${set.id}::uuid AND c.designation <> ALL(${listed})
    RETURNING c.designation
  `)) as { rows: Array<{ designation: string }> };

  return { setId: set.id, cards: rows, removed: gone.map((r) => r.designation), kept: stuck.map((r) => r.designation) };
}
