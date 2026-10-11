/**
 * The Skychaser machine, end to end.
 *
 *   Set 001 filed → a TYCHO edition to a holder → one card of the set chosen
 *   as the night's target → captured by Node 01 (on the simulator) → recorded
 *   → attached to every edition of that card.
 *
 * Idempotent: the same night re-run appends nothing; a different night adds
 * one more entry to the card's history.
 *
 *   STELLAR_DATABASE_CONFIRM=stellar npm run skychaser:lifecycle -- \
 *     [--wallet <address>] [--night YYYY-MM-DD] [--adapter sim|node]
 *
 * Refuses to run unless DATABASE_URL is the stellar-cards Neon branch — see
 * skychaser-guard.ts. Only .env.local is read, never a bare .env.
 */

import { and, eq } from 'drizzle-orm'
import { getDb } from '../src/lib/db'
import { edition } from '../src/lib/schema'
import { recordCapture } from '../src/lib/observatory/captures'
import { adapterFor, getNode } from '../src/lib/observatory/nodes'
import { SIM_TARGET_BY_ID } from '../src/lib/observatory/sim-targets'
import { attachCaptureToCard } from '../src/lib/skychaser/attach'
import { allocateEdition, decideNightlyTarget, holderView } from '../src/lib/skychaser/repo'
import { pickTonightsTarget, siteNightDate } from '../src/lib/skychaser/target'
import { SET_001, SET_001_CARDS } from '../src/lib/sets/set-001'
import { seedSet } from '../src/lib/skychaser/seed'
import { requireSkychaserDatabase } from './skychaser-guard'

const TEST_WALLET = 'stellar-test-holder-0001'
/** How far ahead the default search looks for a night some card can be worked. */
const SEARCH_NIGHTS = 45

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function addDays(night: string, days: number): string {
  return new Date(Date.parse(`${night}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

async function main() {
  requireSkychaserDatabase()

  const wallet = flag('wallet') ?? TEST_WALLET
  const adapterKind = flag('adapter') ?? 'sim'
  if (adapterKind !== 'sim' && adapterKind !== 'node') throw new Error('--adapter is sim or node')

  const node = getNode('tbilisi-01')
  if (!node) throw new Error('tbilisi-01 is not in the node registry')

  let night = flag('night')
  if (night !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(night)) throw new Error('--night is YYYY-MM-DD')
  if (!night) {
    const tonight = siteNightDate(node.timezone, new Date())
    for (let i = 0; i < SEARCH_NIGHTS && !night; i++) {
      const candidate = addDays(tonight, i)
      if (pickTonightsTarget(SET_001_CARDS.map((c) => c.seed), node, candidate)) night = candidate
    }
    if (!night) throw new Error(`No card of ${SET_001.code} clears the safety envelope at ${node.site} in the next ${SEARCH_NIGHTS} nights`)
  }

  const db = getDb()
  if (!db) throw new Error('DATABASE_URL is not configured')

  // 1. The set, and the card the holder is given.
  const { cards } = await seedSet(db, SET_001, SET_001_CARDS)
  const tycho = cards.find((c) => c.designation === 'TYCHO')!
  const observable = cards.filter((c) => c.observationStatus !== 'not_available').length
  console.log(`1. Set        ${SET_001.code}: ${cards.length} cards filed, ${observable} observable by ${node.name}`)
  console.log(`   Card       ${tycho.designation} (${tycho.name}), ${tycho.rarity}, edition size ${tycho.editionSize}, target ${tycho.targetId}`)

  // 2. The holder's edition, allocated once.
  const [held] = await db
    .select({ id: edition.id, editionNumber: edition.editionNumber })
    .from(edition)
    .where(and(eq(edition.cardId, tycho.id), eq(edition.ownerWallet, wallet)))
    .limit(1)
  const owned = held ?? (await allocateEdition(db, tycho.id, wallet))
  if (!owned) throw new Error(`${tycho.designation} has no editions left`)
  console.log(
    `2. Edition    #${String(owned.editionNumber).padStart(3, '0')} of ${tycho.editionSize} held by ${wallet}${held ? ' (already held)' : ''}`,
  )

  // 3. The night's target, decided once.
  const pick = pickTonightsTarget(cards, node, night)
  if (!pick) {
    console.log(`3. Night      ${night}: no card can be observed from ${node.site}. Stopping.`)
    return
  }
  const decided = await decideNightlyTarget(db, {
    nightDate: night,
    cardId: pick.card.id,
    decisionBasis: pick.decisionBasis,
  })
  const chosen = cards.find((c) => c.id === decided.cardId)!
  console.log(`3. Night      ${night}: ${decided.decisionBasis}`)

  // 4. The observation, unless that night already has one.
  if (decided.captureId) {
    console.log(`4. Capture    already recorded for ${night} (${decided.captureId}); nothing appended`)
  } else {
    // Measured for the card that was decided, which on a re-run may not be
    // the one this run would have chosen.
    const plan = pickTonightsTarget([chosen], node, night)
    if (!plan) throw new Error(`${chosen.designation} is not observable on ${night}`)

    // The real node is commissioning, so the simulator path stands it up as
    // active for this run only — the same override the delivery tests use.
    const worker = adapterKind === 'sim' ? { ...node, status: 'active' as const } : node
    const adapter = adapterFor(worker)
    const outcome = await adapter.capture(worker, { targetId: chosen.targetId }, plan.at)
    if (!outcome.ok) {
      console.log(`4. Capture    ${node.name} did not capture (${outcome.kind}): ${outcome.reason}. Stopping.`)
      return
    }

    const recorded = await recordCapture({
      sessionId: decided.id,
      nodeId: worker.id,
      privyId: 'stellar',
      targetId: chosen.targetId,
      targetName: SIM_TARGET_BY_ID.get(chosen.targetId)?.name ?? chosen.name,
      provenance: await adapter.provenanceNow(worker, plan.at),
      exposureSec: outcome.exposureSec,
      subs: outcome.subs,
      opticalTrain: outcome.opticalTrain,
      roi: outcome.roi,
      capturedAt: plan.at,
    })
    if (!recorded.recorded) throw new Error('The capture could not be recorded')
    const { capture } = recorded
    console.log(
      `4. Capture    ${capture.id}: ${capture.targetName} at ${capture.capturedAt}, ${plan.altitudeDeg.toFixed(1)}° altitude, ` +
        `${capture.subs} x ${capture.exposureSec}s, provenance ${capture.provenance}`,
    )

    // 5. The night's history row and every edition, in one batch. The night
    // keeps its first frame, so this can lose to a capture already attached.
    const attached = await attachCaptureToCard(db, { cardId: chosen.id, nightDate: night, captureId: capture.id })
    console.log(
      attached
        ? `5. Attached   to every edition of ${chosen.designation}`
        : `5. Attached   nothing: ${night} already holds a capture of ${chosen.designation}`,
    )
  }

  const view = await holderView(db, wallet)
  console.log('\nHolder view:')
  console.log(JSON.stringify(view, null, 2))

  console.log(`\n/collection?wallet=${encodeURIComponent(wallet)}`)
}

main().catch((error) => {
  console.error('Skychaser lifecycle failed:', error)
  process.exit(1)
})
