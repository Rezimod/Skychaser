import { sql } from 'drizzle-orm'
import { inviteCodes } from '@/lib/invite'
import type { Db } from './attach'

type Rows<T> = { rows: T[] }

/** The invite_code table is not there yet (scripts/skychaser-growth.sql not applied). */
export const growthTablesMissing = (err: unknown) => {
  const { code, cause } = err as { code?: string; cause?: { code?: string } }
  return (code ?? cause?.code) === '42P01'
}

export type Contact = { notify: boolean; invitedBy: string | null; invitedNow: boolean; welcomeEditionId: string | null }

/**
 * The invitation a code names, if it is one: an owner's code from the
 * environment, or a holder's. An account cannot have invited itself.
 */
export async function resolveInvite(db: Db, code: string | undefined, privyId: string): Promise<string | null> {
  if (!code || code.length > 64) return null
  if (inviteCodes().includes(code)) return code
  const { rows } = (await db.execute(sql`SELECT privy_id FROM invite_code WHERE code = ${code}`)) as Rows<{ privy_id: string }>
  if (!rows[0] || rows[0].privy_id === privyId) return null
  return code
}

/**
 * The account as of this sign-in: its row made or brought up to date. The
 * email is kept when Privy did not give one this time; the invitation that
 * brought the account is the first one recorded and never replaced.
 * `invitedNow` is true on the one call that recorded it: now() is the same
 * instant throughout a statement, so only an invited_at written here equals it.
 */
export async function touchContact(
  db: Db,
  input: { privyId: string; wallet: string; email: string | null; invitedBy: string | null },
): Promise<Contact> {
  const { rows } = (await db.execute(sql`
    INSERT INTO holder_contact (privy_id, wallet, email, invited_by, invited_at)
    VALUES (${input.privyId}, ${input.wallet}, ${input.email}, ${input.invitedBy}, CASE WHEN ${input.invitedBy}::text IS NULL THEN NULL ELSE now() END)
    ON CONFLICT (privy_id) DO UPDATE SET
      wallet = EXCLUDED.wallet,
      email = COALESCE(EXCLUDED.email, holder_contact.email),
      invited_by = COALESCE(holder_contact.invited_by, EXCLUDED.invited_by),
      invited_at = CASE WHEN holder_contact.invited_by IS NULL AND EXCLUDED.invited_by IS NOT NULL THEN now() ELSE holder_contact.invited_at END,
      last_seen_at = now()
    RETURNING notify, invited_by, welcome_edition_id,
      (invited_at IS NOT NULL AND invited_at >= now()) AS invited_now
  `)) as Rows<{ notify: boolean; invited_by: string | null; welcome_edition_id: string | null; invited_now: boolean }>
  const r = rows[0]
  return { notify: Boolean(r.notify), invitedBy: r.invited_by ?? null, invitedNow: Boolean(r.invited_now), welcomeEditionId: r.welcome_edition_id ?? null }
}
