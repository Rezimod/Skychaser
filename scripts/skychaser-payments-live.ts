/**
 * Whether the database takes real payments. While it does ('1', set by the
 * go-live reset), a build that settles orders without a transfer
 * (NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT=1) refuses to sell from it or settle
 * in it. Switch it off before deploying such a build, and on again after.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-payments-live.ts off
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-payments-live.ts on
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-payments-live.ts      # says which
 *
 * A build that sells for real ignores the flag.
 */

import { neon } from '@neondatabase/serverless'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  requireSkychaserDatabase()
  const q = neon(process.env.DATABASE_URL!)
  const arg = process.argv[2]
  if (arg === 'on' || arg === 'off') {
    const value = arg === 'on' ? '1' : '0'
    await q`INSERT INTO app_flag (name, value) VALUES ('payments_live', ${value})
      ON CONFLICT (name) DO UPDATE SET value = ${value}, set_at = now()`
  } else if (arg !== undefined) {
    throw new Error('Say on or off, or nothing to read the switch.')
  }
  const [row] = await q`SELECT value, set_at FROM app_flag WHERE name = 'payments_live'`
  console.log(row?.value === '1' ? `payments LIVE since ${row.set_at}` : `payments not live${row ? ` since ${row.set_at}` : ''}: a build without transfers may settle orders`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
