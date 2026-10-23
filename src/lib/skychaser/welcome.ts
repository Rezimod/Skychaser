import { sql } from 'drizzle-orm'
import type { Db } from './attach'
import { allocateEdition } from './repo'

/**
 * The first card. An account that signs in receives one edition of the first
 * card below that still has editions, numbered like any other and counted
 * against the card's supply. First Light is the set's own name; when its 300
 * are gone the welcome moves down the list. One per account and one per
 * wallet. PROVISIONAL: the owner may prefer a card with a plain vote
 * (open question, Growth 1).
 */
export const WELCOME_CARDS: readonly string[] = ['FIRST-LIGHT', 'BIG-DIPPER', 'ORION', 'SUMMER-TRIANGLE']

/** SKYCHASER_WELCOME=off stops the welcome without a deploy of code. */
export const welcomeOn = () => process.env.SKYCHASER_WELCOME !== 'off'

export type WelcomeEdition = {
  editionId: string
  designation: string
  name: string
  rarity: string
  editionNumber: number
  editionSize: number
}

type Rows<T> = { rows: T[] }
type EditionRow = { id: string; designation: string; name: string; rarity: string; edition_number: number | string; edition_size: number | string }

const asEdition = (r: EditionRow): WelcomeEdition => ({
  editionId: r.id,
  designation: r.designation,
  name: r.name,
  rarity: r.rarity,
  editionNumber: Number(r.edition_number),
  editionSize: Number(r.edition_size),
})

/** The welcome edition an account already holds, or null. */
export async function readWelcome(db: Db, privyId: string): Promise<WelcomeEdition | null> {
  const { rows } = (await db.execute(sql`
    SELECT e.id, c.designation, c.name, c.rarity, e.edition_number, c.edition_size
    FROM holder_contact h
    JOIN edition e ON e.id = h.welcome_edition_id
    JOIN card c ON c.id = e.card_id
    WHERE h.privy_id = ${privyId}
  `)) as Rows<EditionRow>
  return rows[0] ? asEdition(rows[0]) : null
}

export type WelcomeResult = { edition: WelcomeEdition | null; fresh: boolean }

/**
 * Give the account its first card, once. The claim is one conditional UPDATE
 * on the account's row, so two sign-ins arriving together allocate one
 * edition between them; the loser reads what the winner gave. A wallet that
 * already received a welcome under another account gets none. If nothing is
 * left to give the claim is released, so a later sign-in tries again once a
 * card on the list has editions.
 */
export async function grantWelcome(db: Db, input: { privyId: string; wallet: string }): Promise<WelcomeResult> {
  const had = await readWelcome(db, input.privyId)
  if (had) return { edition: had, fresh: false }

  const { rows: elsewhere } = (await db.execute(sql`
    SELECT 1 AS one FROM holder_contact
    WHERE wallet = ${input.wallet} AND welcome_edition_id IS NOT NULL AND privy_id <> ${input.privyId}
    LIMIT 1
  `)) as Rows<{ one: number }>
  if (elsewhere[0]) return { edition: null, fresh: false }

  const { rows: claimed } = (await db.execute(sql`
    UPDATE holder_contact SET welcome_claimed_at = now()
    WHERE privy_id = ${input.privyId} AND welcome_claimed_at IS NULL AND welcome_edition_id IS NULL
    RETURNING privy_id
  `)) as Rows<{ privy_id: string }>
  if (!claimed[0]) return { edition: await readWelcome(db, input.privyId), fresh: false }

  let given = false
  try {
    for (const designation of WELCOME_CARDS) {
      const { rows } = (await db.execute(sql`
        SELECT c.id, c.name, c.rarity, c.edition_size
        FROM card c JOIN card_set s ON s.id = c.set_id
        WHERE c.designation = ${designation} AND s.status = 'released'
      `)) as Rows<{ id: string; name: string; rarity: string; edition_size: number | string }>
      const card = rows[0]
      if (!card) continue
      const allocated = await allocateEdition(db, card.id, input.wallet)
      if (!allocated) continue
      given = true
      await db.execute(sql`UPDATE holder_contact SET welcome_edition_id = ${allocated.id}::uuid WHERE privy_id = ${input.privyId}`)
      return {
        edition: { editionId: allocated.id, designation, name: card.name, rarity: card.rarity, editionNumber: allocated.editionNumber, editionSize: Number(card.edition_size) },
        fresh: true,
      }
    }
  } finally {
    // Nothing given: let a later sign-in try again. Given: the claim stands even if the pointer write failed, so the card is not given twice.
    if (!given) {
      await db.execute(sql`UPDATE holder_contact SET welcome_claimed_at = NULL WHERE privy_id = ${input.privyId} AND welcome_edition_id IS NULL`).catch(() => {})
    }
  }
  return { edition: null, fresh: false }
}
