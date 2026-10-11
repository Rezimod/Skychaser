/**
 * The one check every Skychaser script makes before it touches a database.
 *
 * These scripts write cards, editions and nights, and they must only ever do
 * it on the stellar-cards Neon branch. Saying so is not enough: the confirm variable
 * says the operator meant it, and the endpoint id says the URL agrees.
 */

import { config as loadEnv } from 'dotenv'

/** The committed endpoint of the stellar-cards Neon branch. Production is any other. */
const STELLAR_ENDPOINT = 'ep-soft-thunder-an8yi31a'

function refuse(why: string): never {
  console.error(`Refusing to run: ${why}`)
  process.exit(1)
}

/** Loads .env.local — never a bare .env — and exits unless it names the stellar branch. */
export function requireSkychaserDatabase(): void {
  // Read before any env file is loaded: the confirmation has to come from
  // the person at the command line, not from a file that happens to hold it.
  if (process.env.STELLAR_DATABASE_CONFIRM !== 'stellar') {
    refuse('set STELLAR_DATABASE_CONFIRM=stellar on the command line, with DATABASE_URL pointing at the stellar-cards Neon branch.')
  }
  loadEnv({ path: '.env.local', quiet: true })

  let host: string
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    refuse('DATABASE_URL is missing or is not a URL.')
  }
  // The host is not printed: it sits next to the credential in the URL.
  if (!host.startsWith(STELLAR_ENDPOINT)) {
    refuse(`DATABASE_URL is not the stellar-cards Neon branch (its host must start with ${STELLAR_ENDPOINT}).`)
  }
}
