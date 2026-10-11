/**
 * The emergency pause, at runtime: every value-moving Skychaser route answers
 * 503 from the next request on, with no redeploy.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-pause.ts on
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-pause.ts off
 *   STELLAR_DATABASE_CONFIRM=stellar npx tsx scripts/skychaser-pause.ts        # says which
 *
 * Needs the app_flag table (scripts/skychaser-constraints.sql).
 */

import { neon } from '@neondatabase/serverless'
import { requireSkychaserDatabase } from './skychaser-guard'

async function main() {
  requireSkychaserDatabase()
  const q = neon(process.env.DATABASE_URL!)
  const arg = process.argv[2]
  if (arg === 'on' || arg === 'off') {
    const value = arg === 'on' ? '1' : '0'
    await q`INSERT INTO app_flag (name, value) VALUES ('paused', ${value})
      ON CONFLICT (name) DO UPDATE SET value = ${value}, set_at = now()`
  } else if (arg !== undefined) {
    throw new Error('Say on or off, or nothing to read the switch.')
  }
  const [row] = await q`SELECT value, set_at FROM app_flag WHERE name = 'paused'`
  console.log(row?.value === '1' ? `PAUSED since ${row.set_at}` : 'not paused')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
