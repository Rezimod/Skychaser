/**
 * The week's observation, run once a day before dusk.
 *
 * Holders vote for a week, Monday to Sunday. First last night is closed: if it
 * ended without a photograph and the sky over the site was above the cloud
 * limit at the hour the card was planned, the night is recorded as lost, with
 * the figure. Then tonight is planned, once. The first night of a week decides
 * the week's card: the holders' weighted votes among the cards Live Telescope V1
 * can photograph that night; with no votes, the object standing highest. Every
 * later night of the week goes to the same card until it is photographed, then
 * the week is done.
 */

import { and, asc, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm'
import { card, cardVote, edition, nightlyTarget, observatoryCapture } from '@/lib/schema'
import { fetchOpenMeteo } from '@/lib/open-meteo'
import { CLOUD_LIMIT } from '@/lib/observatory/adapter'
import { utcHourStamp } from '@/lib/observatory/site-time'
import type { ObservatoryNode } from '@/lib/observatory/types'
import { isRarity } from '@/lib/rarity'
import { votePower } from './perks'
import type { Db } from './attach'
import { decideNightlyTarget } from './repo'
import { SIM_TARGET_BY_ID, targetAltAz } from '@/lib/observatory/sim-targets'
import { observableTonight, siteDarkWindow, siteNightDate, standing, type Observable } from './target'

type CardRow = typeof card.$inferSelect
type NightRow = typeof nightlyTarget.$inferSelect

/** Cloud cover at the site for the hour containing `at`, percent, or null when not known. */
export type CloudAt = (node: ObservatoryNode, at: Date) => Promise<number | null>

/** Open-Meteo, one day back and two ahead: the same call serves last night's record and tonight's forecast. */
export const openMeteoCloudAt: CloudAt = async (node, at) => {
  const params = new URLSearchParams({
    latitude: String(node.lat),
    longitude: String(node.lon),
    hourly: 'cloud_cover',
    past_days: '1',
    forecast_days: '3',
  })
  try {
    const { data } = await fetchOpenMeteo<{ hourly: { time: string[]; cloud_cover: number[] } }>(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { revalidate: 1800 },
    )
    const i = data.hourly.time.findIndex((t) => t.slice(0, 13) === utcHourStamp(at))
    return i >= 0 ? data.hourly.cloud_cover[i] ?? null : null
  } catch {
    return null
  }
}

export function addDays(night: string, days: number): string {
  return new Date(Date.parse(`${night}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** The Monday that starts the week `night` falls in. */
export function weekOf(night: string): string {
  return addDays(night, -((new Date(`${night}T00:00:00Z`).getUTCDay() + 6) % 7))
}

export async function allCards(db: Db): Promise<CardRow[]> {
  return db.select().from(card)
}

export async function nightRow(db: Db, night: string): Promise<NightRow | null> {
  const [row] = await db.select().from(nightlyTarget).where(eq(nightlyTarget.nightDate, night))
  return row ?? null
}

/** The planned nights of the week starting `week`, up to and including `last`, earliest first. */
async function weekNights(db: Db, week: string, last: string): Promise<NightRow[]> {
  return db
    .select()
    .from(nightlyTarget)
    .where(and(gte(nightlyTarget.nightDate, week), lte(nightlyTarget.nightDate, last)))
    .orderBy(asc(nightlyTarget.nightDate))
}

/**
 * The week a vote cast now counts for — this week until its card is decided,
 * then next week — and the first night that vote can still decide, which is
 * the night candidates are judged on.
 */
export async function votingWeek(db: Db, node: ObservatoryNode, now: Date): Promise<{ week: string; night: string }> {
  const tonight = siteNightDate(node.timezone, now)
  const week = weekOf(tonight)
  const decided = (await weekNights(db, week, addDays(week, 6))).length > 0
  return decided ? { week: addDays(week, 7), night: addDays(week, 7) } : { week, night: tonight }
}

/** A holder's vote weight: the vote power of every edition they hold, summed (perks.ts). */
export async function voteWeight(db: Db, wallet: string): Promise<number> {
  const rows = await db
    .select({ designation: card.designation, rarity: card.rarity, n: sql<number>`count(*)::int` })
    .from(edition)
    .innerJoin(card, eq(card.id, edition.cardId))
    .where(eq(edition.ownerWallet, wallet))
    .groupBy(card.designation, card.rarity)
  return rows.reduce((sum, r) => sum + (isRarity(r.rarity) ? votePower(r.designation, r.rarity) * Number(r.n) : 0), 0)
}

/** Weighted votes per card id for a week. Votes are kept under the week's Monday. */
export async function tallies(db: Db, week: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ cardId: cardVote.cardId, total: sql<number>`sum(${cardVote.weight})::int` })
    .from(cardVote)
    .where(eq(cardVote.nightDate, week))
    .groupBy(cardVote.cardId)
  return new Map(rows.map((r) => [r.cardId, Number(r.total)]))
}

/** Cast, or change, a holder's vote for a week. */
export async function castVote(db: Db, input: { wallet: string; cardId: string; week: string; weight: number }) {
  const values = { wallet: input.wallet, cardId: input.cardId, nightDate: input.week, weight: input.weight }
  await db
    .insert(cardVote)
    .values(values)
    .onConflictDoUpdate({
      target: [cardVote.wallet, cardVote.nightDate],
      set: { cardId: input.cardId, weight: input.weight, createdAt: new Date() },
    })
}

/**
 * The card a week goes to, and why, in words: the most weighted votes; a tie,
 * or no votes at all, goes to the object standing highest.
 */
export function chooseWeek<C extends CardRow>(
  observable: Observable<C>[],
  votes: Map<string, number>,
  node: ObservatoryNode,
  week: string,
): { chosen: Observable<C>; basis: string } | null {
  if (observable.length === 0) return null

  const cast = observable.reduce((sum, o) => sum + (votes.get(o.card.id) ?? 0), 0)
  // `observable` is highest first, so the first of the most-voted is also the highest of them.
  const chosen = observable.reduce((best, o) => ((votes.get(o.card.id) ?? 0) > (votes.get(best.card.id) ?? 0) ? o : best))
  const own = votes.get(chosen.card.id) ?? 0
  const basis =
    cast === 0
      ? `${chosen.card.designation}: no holder voted for the week of ${week}. ${standing(chosen, node)}, the highest of ${observable.length} observable ${observable.length === 1 ? 'card' : 'cards'}.`
      : `${chosen.card.designation}: ${own} of ${cast} weighted votes cast by holders for the week of ${week}. ${standing(chosen, node)}.`
  return { chosen, basis }
}

/**
 * Close a night that ended without a photograph. Lost when the recorded cloud
 * at the planned hour is over the limit; left open otherwise — a clear night
 * without a photograph is Live Telescope V1 not working yet, not weather.
 */
export async function closeNight(db: Db, node: ObservatoryNode, night: string, now: Date, cloudAt: CloudAt): Promise<NightRow | null> {
  const row = await nightRow(db, night)
  if (!row || row.captureId || row.lostAt || !row.plannedAt) return row
  const cloud = await cloudAt(node, row.plannedAt)
  if (cloud === null || cloud <= CLOUD_LIMIT) return row

  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: node.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(row.plannedAt)
  const lostReason = `Cloud cover was ${Math.round(cloud)}% at ${hour} local time, over the ${CLOUD_LIMIT}% limit.`
  const [lost] = await db
    .update(nightlyTarget)
    .set({ lostAt: now, lostReason })
    .where(and(eq(nightlyTarget.id, row.id), isNull(nightlyTarget.captureId), isNull(nightlyTarget.lostAt)))
    .returning()
  return lost ?? (await nightRow(db, night))
}

/**
 * Close last night, then plan tonight. Safe to run twice. Tonight goes to the
 * week's card while the week has no photograph and its object is up; the first
 * night of a week decides that card from the votes.
 */
export async function runNight(db: Db, node: ObservatoryNode, now: Date, cloudAt: CloudAt = openMeteoCloudAt) {
  const tonight = siteNightDate(node.timezone, now)
  const last = await closeNight(db, node, addDays(tonight, -1), now, cloudAt)

  const existing = await nightRow(db, tonight)
  if (existing) return { night: tonight, last, decided: existing, fresh: false }

  const week = weekOf(tonight)
  const earlier = await weekNights(db, week, addDays(tonight, -1))
  if (earlier.some((n) => n.captureId)) return { night: tonight, last, decided: null, fresh: false }

  const observable = observableTonight(await allCards(db), node, tonight)
  let choice: { chosen: (typeof observable)[number]; basis: string } | null
  if (earlier.length) {
    const kept = observable.find((o) => o.card.id === earlier[0].cardId)
    choice = kept
      ? {
          chosen: kept,
          basis: `${kept.card.designation}: the week's card, chosen on the night of ${earlier[0].nightDate} and not photographed yet. ${standing(kept, node)}.`,
        }
      : null
  } else {
    choice = chooseWeek(observable, await tallies(db, week), node, week)
  }
  if (!choice) return { night: tonight, last, decided: null, fresh: false }

  const cloudForecast = await cloudAt(node, choice.chosen.at)
  const decided = await decideNightlyTarget(db, {
    nightDate: tonight,
    cardId: choice.chosen.card.id,
    decisionBasis: choice.basis,
    plannedAt: choice.chosen.at,
    cloudForecast: cloudForecast === null ? null : Math.round(cloudForecast),
  })
  return { night: tonight, last, decided, fresh: true }
}

export type TonightView = {
  night: string
  /** This week's card: the night it is planned or was photographed on. */
  decided: {
    night: string
    designation: string
    name: string
    rarity: string
    artUrl: string | null
    basis: string
    plannedAt: string | null
    cloudForecast: number | null
    capture: { capturedAt: string; nodeId: string; provenance: string; exposureSec: number; subs: number; opticalTrain: string } | null
  } | null
  voting: {
    /** The Monday of the week the vote is for. */
    week: string
    /** The first night that vote can still decide: candidates are the objects up that night. */
    night: string
    /** The dark window of that night — the span the sky chart draws. */
    window: { dusk: string; dawn: string } | null
    candidates: Array<{
      designation: string
      name: string
      rarity: string
      altitudeDeg: number
      at: string
      votes: number
      /** Altitude through the dark window, every half hour: the object's path across the night. */
      track: Array<{ at: string; alt: number }>
    }>
  }
  recent: Array<{ night: string; designation: string; name: string; result: 'photographed' | 'lost' | 'none'; lostReason: string | null }>
}

const TRACK_STEP_MS = 30 * 60_000

function trackOf(targetId: string, node: ObservatoryNode, dusk: Date | null, dawn: Date | null) {
  const target = SIM_TARGET_BY_ID.get(targetId)
  if (!target || !dusk || !dawn) return []
  const out: Array<{ at: string; alt: number }> = []
  for (let t = dusk.getTime(); t <= dawn.getTime(); t += TRACK_STEP_MS) {
    const at = new Date(t)
    out.push({ at: at.toISOString(), alt: Math.round(targetAltAz(target, node, at).altitude * 10) / 10 })
  }
  return out
}

/** Everything /vote prints, in one read. */
export async function tonightView(db: Db, node: ObservatoryNode, now: Date): Promise<TonightView> {
  const night = siteNightDate(node.timezone, now)
  const cards = await allCards(db)
  const byId = new Map(cards.map((c) => [c.id, c]))

  // The week's card: the night it was photographed, else its latest planned night.
  const planned = await weekNights(db, weekOf(night), night)
  const row = planned.find((n) => n.captureId) ?? planned.at(-1) ?? null
  let decided: TonightView['decided'] = null
  if (row) {
    const c = byId.get(row.cardId)
    const [capture] = row.captureId
      ? await db.select().from(observatoryCapture).where(eq(observatoryCapture.id, row.captureId))
      : []
    decided = {
      night: row.nightDate,
      designation: c?.designation ?? '—',
      name: c?.name ?? '—',
      rarity: c?.rarity ?? 'common',
      artUrl: c?.artUrl ?? null,
      basis: row.decisionBasis,
      plannedAt: row.plannedAt?.toISOString() ?? null,
      cloudForecast: row.cloudForecast,
      capture: capture
        ? {
            capturedAt: capture.capturedAt.toISOString(),
            nodeId: capture.nodeId,
            provenance: capture.provenance,
            exposureSec: capture.exposureSec,
            subs: capture.subs,
            opticalTrain: capture.opticalTrain,
          }
        : null,
    }
  }

  const vote = await votingWeek(db, node, now)
  const votes = await tallies(db, vote.week)
  const vNight = vote.night
  const observable = observableTonight(cards, node, vNight)

  const recent = await recentNights(db, night)
  const dark = siteDarkWindow(node, vNight)
  return {
    night,
    decided,
    voting: {
      week: vote.week,
      night: vNight,
      window: dark.duskStart && dark.dawnEnd ? { dusk: dark.duskStart.toISOString(), dawn: dark.dawnEnd.toISOString() } : null,
      candidates: observable.map((o) => ({
        designation: o.card.designation,
        name: o.card.name,
        rarity: o.card.rarity,
        altitudeDeg: o.altitudeDeg,
        at: o.at.toISOString(),
        votes: votes.get(o.card.id) ?? 0,
        track: trackOf(o.card.targetId, node, dark.duskStart, dark.dawnEnd),
      })),
    },
    recent: recent.map((r) => ({
      night: r.night.nightDate,
      designation: r.designation,
      name: r.name,
      result: r.night.captureId ? 'photographed' : r.night.lostAt ? 'lost' : 'none',
      lostReason: r.night.lostAt ? r.night.lostReason : null,
    })),
  }
}

/** The nights before `night`, most recent first — the record /vote prints beneath the vote. */
export async function recentNights(db: Db, night: string, limit = 7) {
  const rows = await db
    .select({ night: nightlyTarget, designation: card.designation, name: card.name })
    .from(nightlyTarget)
    .innerJoin(card, eq(card.id, nightlyTarget.cardId))
    .where(lt(nightlyTarget.nightDate, night))
    .orderBy(desc(nightlyTarget.nightDate))
    .limit(limit)
  return rows
}
