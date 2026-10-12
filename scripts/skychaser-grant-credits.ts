/**
 * Adds telescope credits to one account, outside any purchase.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar PRIVY_APP_SECRET=… npx tsx scripts/skychaser-grant-credits.ts <email or did:privy:…> <credits>
 *
 * The account is found by the email it signed in with (Privy), or named by
 * its id. The ledger line is kind 'grant', with no order behind it. Needs the
 * credit tables (scripts/skychaser-bookings.sql).
 */

import { neon } from '@neondatabase/serverless'
import { PrivyClient } from '@privy-io/server-auth'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  requireSkychaserDatabase()
  const [who, n] = process.argv.slice(2)
  const credits = Number(n)
  if (!who || !Number.isInteger(credits) || credits <= 0) throw new Error('Say who (email or did:privy:…) and how many credits.')

  let privyId = who
  if (!who.startsWith('did:privy:')) {
    const appId = (process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '').trim()
    const secret = (process.env.PRIVY_APP_SECRET ?? '').trim()
    if (!appId || !secret) throw new Error('Looking an account up by email needs NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.')
    const user = await new PrivyClient(appId, secret).getUserByEmail(who)
    if (!user) throw new Error(`No account has signed in with ${who}.`)
    privyId = user.id
  }

  const q = neon(process.env.DATABASE_URL!)
  const [row] = await q`
    WITH l AS (
      INSERT INTO credit_ledger (privy_id, delta, kind) VALUES (${privyId}, ${credits}, 'grant') RETURNING delta
    ), a AS (
      INSERT INTO credit_account (privy_id, balance) SELECT ${privyId}, delta FROM l
      ON CONFLICT (privy_id) DO UPDATE SET balance = credit_account.balance + EXCLUDED.balance, updated_at = now() RETURNING balance
    )
    SELECT balance FROM a`
  console.log(`${privyId}: +${credits} credits, balance ${row.balance}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
