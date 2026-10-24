import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { HOLDER_CODE } from '@/lib/invite'
import type { Db } from './attach'
import { isDirectOnly, isSealed } from './almanac'
import { recordEvent } from './events'
import { allocateGrant } from './orders'
import { WELCOME_CARDS } from './welcome'

/**
 * The invitation loop. Every account has one code; the link is
 * skychaser.io/invite/<code>. When an account that arrived by it opens its
 * first paid capsule, the inviter receives one common edition, chosen at
 * random among the commons with editions left (not the welcome cards, not a
 * sealed or limited card), up to REFERRAL_REWARD_CAP. It is allocated as a
 * sale is: behind the set's lock, never from editions owed to capsules, and
 * logged publicly as 'card_granted'. PROVISIONAL: the
 * reward and the cap are the owner's call (open question, Growth 3).
 */
export const REFERRAL_REWARD_CAP = 10

type Rows<T> = { rows: T[] }

/** Eight characters, no 0/O or 1/I: the alphabet HOLDER_CODE accepts. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newInviteCode(): string {
  let code = ''
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  if (!HOLDER_CODE.test(code)) throw new Error('invite code alphabet and pattern disagree')
  return code
}

export async function inviteExists(db: Db, code: string): Promise<boolean> {
  const { rows } = (await db.execute(sql`SELECT 1 AS one FROM invite_code WHERE code = ${code}`)) as Rows<{ one: number }>
  return Boolean(rows[0])
}

/** The account's code, made on first request. A collision on the eight characters is asked again. */
export async function inviteFor(db: Db, input: { privyId: string; wallet: string }): Promise<string> {
  const { rows } = (await db.execute(sql`SELECT code FROM invite_code WHERE privy_id = ${input.privyId}`)) as Rows<{ code: string }>
  if (rows[0]) return rows[0].code
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newInviteCode()
    const { rows: made } = (await db.execute(sql`
      INSERT INTO invite_code (code, privy_id, wallet) VALUES (${code}, ${input.privyId}, ${input.wallet})
      ON CONFLICT (privy_id) DO NOTHING RETURNING code
    `).catch((err: unknown) => {
      const { code: pg, cause } = err as { code?: string; cause?: { code?: string } }
      if ((pg ?? cause?.code) === '23505') return { rows: [] }
      throw err
    })) as Rows<{ code: string }>
    if (made[0]) return made[0].code
    const { rows: again } = (await db.execute(sql`SELECT code FROM invite_code WHERE privy_id = ${input.privyId}`)) as Rows<{ code: string }>
    if (again[0]) return again[0].code
  }
  throw new Error('could not make an invite code')
}

export type InviteStats = {
  code: string
  /** Accounts that signed in carrying this code. */
  arrived: number
  /** Of those, how many have opened a first paid capsule. */
  converted: number
  /** The editions received for them, newest first. */
  cards: Array<{ designation: string; name: string; rarity: string; editionNumber: number; editionSize: number }>
  cap: number
}

export async function inviteStats(db: Db, input: { privyId: string; wallet: string }): Promise<InviteStats> {
  const code = await inviteFor(db, input)
  const { rows: a } = (await db.execute(sql`SELECT count(*)::int AS n FROM holder_contact WHERE invited_by = ${code}`)) as Rows<{ n: number }>
  const { rows: c } = (await db.execute(sql`SELECT count(*)::int AS n FROM referral_reward WHERE referrer_privy_id = ${input.privyId}`)) as Rows<{ n: number }>
  const { rows: cards } = (await db.execute(sql`
    SELECT ca.designation, ca.name, ca.rarity, e.edition_number, ca.edition_size
    FROM referral_reward r JOIN edition e ON e.id = r.edition_id JOIN card ca ON ca.id = e.card_id
    WHERE r.referrer_privy_id = ${input.privyId}
    ORDER BY r.rewarded_at DESC
  `)) as Rows<{ designation: string; name: string; rarity: string; edition_number: number | string; edition_size: number | string }>
  return {
    code,
    arrived: Number(a[0]?.n ?? 0),
    converted: Number(c[0]?.n ?? 0),
    cards: cards.map((x) => ({ designation: x.designation, name: x.name, rarity: x.rarity, editionNumber: Number(x.edition_number), editionSize: Number(x.edition_size) })),
    cap: REFERRAL_REWARD_CAP,
  }
}

export type Reward = {
  code: string
  referrerPrivyId: string
  referrerWallet: string
  edition: { editionId: string; designation: string; name: string; editionNumber: number; editionSize: number } | null
}

/** Commons with editions left that a reward may take from, in no particular order. */
async function rewardCandidates(db: Db, now: Date): Promise<Array<{ id: string; set_id: string; designation: string; name: string; rarity: string; edition_size: number | string }>> {
  const { rows } = (await db.execute(sql`
    SELECT c.id, c.set_id, c.designation, c.name, c.rarity, c.edition_size
    FROM card c JOIN card_set s ON s.id = c.set_id
    WHERE c.rarity = 'common' AND s.status = 'released'
      AND COALESCE((SELECT MAX(e.edition_number) FROM edition e WHERE e.card_id = c.id), 0) < c.edition_size
  `)) as Rows<{ id: string; set_id: string; designation: string; name: string; rarity: string; edition_size: number | string }>
  return rows.filter((r) => !WELCOME_CARDS.includes(r.designation) && !isSealed(r.designation, now) && !isDirectOnly(r.designation))
}

/**
 * The inviter's card for an invited account's first opened capsule. One
 * conditional INSERT claims the reward for that account, so a capsule opened
 * twice, or two capsules opened at once, give one card. Returns null when the
 * account was not invited, invited itself, or was rewarded already; a reward
 * with `edition: null` when the cap is reached or nothing was left to give.
 */
export async function rewardReferrer(
  db: Db,
  input: { inviteePrivyId: string; inviteeWallet: string; capsuleId: string; now?: Date },
): Promise<Reward | null> {
  const { rows: invited } = (await db.execute(sql`SELECT invited_by FROM holder_contact WHERE privy_id = ${input.inviteePrivyId}`)) as Rows<{ invited_by: string | null }>
  const code = invited[0]?.invited_by
  if (!code) return null
  const { rows: inviter } = (await db.execute(sql`SELECT privy_id, wallet FROM invite_code WHERE code = ${code}`)) as Rows<{ privy_id: string; wallet: string }>
  const referrer = inviter[0]
  if (!referrer || referrer.privy_id === input.inviteePrivyId) return null

  const { rows: claimed } = (await db.execute(sql`
    INSERT INTO referral_reward (invitee_privy_id, code, referrer_privy_id, referrer_wallet, capsule_id)
    VALUES (${input.inviteePrivyId}, ${code}, ${referrer.privy_id}, ${referrer.wallet}, ${input.capsuleId}::uuid)
    ON CONFLICT (invitee_privy_id) DO NOTHING RETURNING invitee_privy_id
  `)) as Rows<{ invitee_privy_id: string }>
  if (!claimed[0]) return null

  const reward: Reward = { code, referrerPrivyId: referrer.privy_id, referrerWallet: referrer.wallet, edition: null }
  const { rows: given } = (await db.execute(sql`
    SELECT count(*)::int AS n FROM referral_reward WHERE referrer_privy_id = ${referrer.privy_id} AND edition_id IS NOT NULL
  `)) as Rows<{ n: number }>
  if (Number(given[0]?.n ?? 0) >= REFERRAL_REWARD_CAP) return reward

  const candidates = await rewardCandidates(db, input.now ?? new Date())
  for (let tries = 0; tries < 3 && candidates.length > 0; tries++) {
    const [pick] = candidates.splice(randomInt(candidates.length), 1)
    const allocated = await allocateGrant(db, { cardId: pick.id, setId: pick.set_id, wallet: referrer.wallet, kind: 'referral', key: input.inviteePrivyId })
    if (!allocated) continue
    await db.execute(sql`UPDATE referral_reward SET edition_id = ${allocated.id}::uuid WHERE invitee_privy_id = ${input.inviteePrivyId}`)
    reward.edition = { editionId: allocated.id, designation: pick.designation, name: pick.name, editionNumber: allocated.editionNumber, editionSize: Number(pick.edition_size) }
    await recordEvent(db, 'referral_rewarded', {
      wallet: referrer.wallet,
      path: '/api/skychaser/capsules/open',
      props: { invite: code, designation: pick.designation, editionNumber: allocated.editionNumber, invitee: input.inviteeWallet },
    })
    return reward
  }
  return reward
}
