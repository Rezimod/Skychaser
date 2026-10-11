/**
 * The beta funnel, read off analytics_event.
 *
 *   landing → set → capsules → capsule → collection, then return visits.
 *
 * A visitor counts at a step only if they also reached every step before it,
 * so each line is a true conversion from the one above. A return visitor is
 * one seen on two or more UTC days. Card and night pages are counted but sit
 * outside the chain.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npm run skychaser:funnel -- [--days 30]
 */

import { sql } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { requireSkychaserDatabase } from './skychaser-guard'

const CHAIN = ['landing', 'set', 'capsules', 'capsule', 'collection'] as const
const ASIDE = ['card', 'tonight'] as const

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

type Row = { anon_id: string; step: string; invite: string | null; day: string }

async function main() {
  requireSkychaserDatabase()
  const days = Number(flag('days') ?? 30)
  if (!Number.isInteger(days) || days < 1) throw new Error('--days is a positive whole number')

  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  const { rows } = await db.execute(sql`
    SELECT DISTINCT anon_id, props->>'step' AS step, props->>'invite' AS invite,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
    FROM analytics_event
    WHERE event = 'stellar_view' AND anon_id IS NOT NULL
      AND created_at > now() - make_interval(days => ${days})
  `)
  const views = rows as Row[]

  const reached = new Map<string, Set<string>>()
  const daysSeen = new Map<string, Set<string>>()
  const inviteOf = new Map<string, string>()
  for (const v of views) {
    if (!reached.has(v.step)) reached.set(v.step, new Set())
    reached.get(v.step)!.add(v.anon_id)
    if (!daysSeen.has(v.anon_id)) daysSeen.set(v.anon_id, new Set())
    daysSeen.get(v.anon_id)!.add(v.day)
    if (v.invite && !inviteOf.has(v.anon_id)) inviteOf.set(v.anon_id, v.invite)
  }
  const returning = new Set([...daysSeen].filter(([, d]) => d.size > 1).map(([id]) => id))

  console.log(`Skychaser funnel, last ${days} days — ${daysSeen.size} visitors\n`)
  console.log('Reached, any order:')
  for (const step of [...CHAIN, ...ASIDE]) console.log(`  ${step.padEnd(11)} ${reached.get(step)?.size ?? 0}`)

  console.log('\nIn order:')
  let through = new Set(reached.get(CHAIN[0]) ?? [])
  console.log(`  ${CHAIN[0].padEnd(11)} ${through.size}`)
  for (const step of CHAIN.slice(1)) {
    const prev = through.size
    through = new Set([...through].filter((id) => reached.get(step)?.has(id)))
    const rate = prev ? `${((through.size / prev) * 100).toFixed(1)}%` : '—'
    console.log(`  ${step.padEnd(11)} ${String(through.size).padEnd(6)} ${rate} of the step above`)
  }
  console.log(`\nReturn visitors: ${returning.size} of ${daysSeen.size}`)

  const byInvite = new Map<string, { landing: number; returned: number }>()
  const landed = reached.get('landing') ?? new Set<string>()
  for (const id of daysSeen.keys()) {
    const code = inviteOf.get(id) ?? '(none)'
    const entry = byInvite.get(code) ?? { landing: 0, returned: 0 }
    if (landed.has(id)) entry.landing++
    if (returning.has(id)) entry.returned++
    byInvite.set(code, entry)
  }
  console.log('\nBy invitation:')
  for (const [code, e] of [...byInvite].sort((a, b) => b[1].landing - a[1].landing)) {
    console.log(`  ${code.padEnd(20)} landing ${String(e.landing).padEnd(5)} returned ${e.returned}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
