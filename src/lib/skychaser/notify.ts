import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { inviteSigningKey } from '@/lib/invite'
import type { Db } from './attach'
import { recordEvent } from './events'

/**
 * Word to holders, by email, through Resend's HTTP API. Three occasions: a
 * holder's card is chosen as the week's target; it is photographed; a card
 * arrives for an invitation. Each notice is recorded before it is sent
 * (holder_notice), so a cron run twice sends once. Without RESEND_API_KEY and
 * NOTIFY_FROM nothing is sent and nothing fails. The tone is the logbook's.
 */
export const SITE = 'https://skychaser.io'
const RESEND = 'https://api.resend.com/emails/batch'
/** Resend takes 100 messages a call. */
const BATCH = 100
/** No single notice reaches more than this many holders a run. */
const MAX_RECIPIENTS = 2000

type Rows<T> = { rows: T[] }

export type NoticeKind = 'week_chosen' | 'photographed' | 'referral_card'
export type Recipient = { privyId: string; email: string }
export type Message = { subject: string; text: string; html: string }

export function notifyConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** The signature on an unsubscribe link: the account's id under the invite signing key. */
export function unsubscribeToken(privyId: string): string | null {
  const key = inviteSigningKey()
  if (!key) return null
  return createHmac('sha256', key).update(`unsubscribe:${privyId}`).digest('hex').slice(0, 40)
}

export function unsubscribeTokenValid(privyId: string, token: string | null | undefined): boolean {
  const expected = unsubscribeToken(privyId)
  if (!expected || !token || token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token))
}

export function unsubscribeUrl(privyId: string): string | null {
  const token = unsubscribeToken(privyId)
  return token ? `${SITE}/api/skychaser/notify/unsubscribe?id=${encodeURIComponent(privyId)}&t=${token}` : null
}

/** A notice as one message: short paragraphs, one link, the way out at the foot. */
export function compose(input: { subject: string; lines: string[]; link: { href: string; label: string }; unsubscribe: string | null }): Message {
  const text = [...input.lines, '', `${input.link.label}: ${input.link.href}`, '', 'Skychaser — the cosmos, issued in editions.', ...(input.unsubscribe ? [`No more email about your cards: ${input.unsubscribe}`] : [])].join('\n')
  const html = [
    '<div style="font-family:Geist,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#ece7da;background:#0b0c0e;padding:32px 24px;max-width:560px">',
    ...input.lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`),
    `<p style="margin:22px 0"><a href="${esc(input.link.href)}" style="color:#0b0c0e;background:#ece7da;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(input.link.label)}</a></p>`,
    '<p style="margin:28px 0 0;font-size:13px;color:#8a867c">Skychaser — the cosmos, issued in editions.',
    ...(input.unsubscribe ? [`<br><a href="${esc(input.unsubscribe)}" style="color:#8a867c">No more email about your cards</a>`] : []),
    '</p></div>',
  ].join('')
  return { subject: input.subject, text, html }
}

/** Every account that takes email and holds an edition of the card. */
export async function holdersOfCard(db: Db, cardId: string): Promise<Recipient[]> {
  const { rows } = (await db.execute(sql`
    SELECT DISTINCT h.privy_id, h.email FROM holder_contact h
    JOIN edition e ON e.owner_wallet = h.wallet
    WHERE e.card_id = ${cardId}::uuid AND h.notify AND h.email IS NOT NULL
    LIMIT ${MAX_RECIPIENTS}
  `)) as Rows<{ privy_id: string; email: string }>
  return rows.map((r) => ({ privyId: r.privy_id, email: r.email }))
}

export async function contactOf(db: Db, privyId: string): Promise<Recipient | null> {
  const { rows } = (await db.execute(sql`SELECT privy_id, email FROM holder_contact WHERE privy_id = ${privyId} AND notify AND email IS NOT NULL`)) as Rows<{ privy_id: string; email: string }>
  return rows[0] ? { privyId: rows[0].privy_id, email: rows[0].email } : null
}

/** Records the notice for each recipient; returns only those not recorded before. */
async function claim(db: Db, kind: NoticeKind, key: string, recipients: Recipient[]): Promise<Recipient[]> {
  const fresh: Recipient[] = []
  for (const r of recipients) {
    const { rows } = (await db.execute(sql`
      INSERT INTO holder_notice (privy_id, kind, key) VALUES (${r.privyId}, ${kind}, ${key})
      ON CONFLICT (privy_id, kind, key) DO NOTHING RETURNING privy_id
    `)) as Rows<{ privy_id: string }>
    if (rows[0]) fresh.push(r)
  }
  return fresh
}

/** Sends one message to each recipient, in Resend batches. Throws on a refused batch. */
export async function deliver(recipients: Recipient[], message: (r: Recipient) => Message): Promise<number> {
  if (!notifyConfigured() || recipients.length === 0) return 0
  const from = process.env.NOTIFY_FROM!
  let sent = 0
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH)
    const res = await fetch(RESEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify(slice.map((r) => ({ from, to: [r.email], ...message(r) }))),
    })
    if (!res.ok) throw new Error(`Resend refused a batch: ${res.status} ${await res.text().catch(() => '')}`)
    sent += slice.length
  }
  return sent
}

/**
 * One notice, to everyone it concerns, once. The recipients are claimed
 * before sending; a batch that Resend refuses is logged, and those holders
 * are not written to again for this key.
 */
export async function notice(db: Db, input: { kind: NoticeKind; key: string; recipients: Recipient[]; message: (r: Recipient) => Message }): Promise<number> {
  if (!notifyConfigured()) return 0
  const fresh = await claim(db, input.kind, input.key, input.recipients)
  if (fresh.length === 0) return 0
  let sent = 0
  try {
    sent = await deliver(fresh, input.message)
  } catch (err) {
    console.error(`[skychaser/notify] ${input.kind} ${input.key}`, err instanceof Error ? err.message : err)
  }
  await recordEvent(db, 'notice_sent', { path: '/api/cron/skychaser-night', props: { kind: input.kind, key: input.key, claimed: fresh.length, sent } })
  return sent
}

type CardRef = { id: string; designation: string; name: string }

/** The week's card has been chosen: every holder of it hears, once a week. */
export async function notifyWeekChosen(db: Db, input: { card: CardRef; week: string; night: string }): Promise<number> {
  const recipients = await holdersOfCard(db, input.card.id)
  return notice(db, {
    kind: 'week_chosen',
    key: input.week,
    recipients,
    message: (r) =>
      compose({
        subject: `${input.card.name} is this week’s target`,
        lines: [
          `Your card ${input.card.name} was chosen for the week of ${input.week}. Live Telescope V1 points at it on the first clear night, from ${input.night}.`,
          'When it is photographed, every edition of the card receives the picture. Yours among them.',
        ],
        link: { href: `${SITE}/card/${input.card.designation}`, label: 'The card' },
        unsubscribe: unsubscribeUrl(r.privyId),
      }),
  })
}

/** The card was photographed: every holder of it hears, once a night. */
export async function notifyPhotographed(db: Db, input: { card: CardRef; night: string }): Promise<number> {
  const recipients = await holdersOfCard(db, input.card.id)
  return notice(db, {
    kind: 'photographed',
    key: input.night,
    recipients,
    message: (r) =>
      compose({
        subject: `${input.card.name} was photographed`,
        lines: [`On the night of ${input.night} Live Telescope V1 photographed ${input.card.name}. The picture is on every edition of the card now, yours among them.`],
        link: { href: `${SITE}/collection`, label: 'Your Collection' },
        unsubscribe: unsubscribeUrl(r.privyId),
      }),
  })
}

/** A card arrived for an invitation: the inviter hears, once per card. */
export async function notifyReferralCard(
  db: Db,
  input: { referrerPrivyId: string; edition: { designation: string; name: string; editionNumber: number; editionSize: number } },
): Promise<number> {
  const r = await contactOf(db, input.referrerPrivyId)
  if (!r) return 0
  const number = `No. ${String(input.edition.editionNumber).padStart(3, '0')} of ${input.edition.editionSize}`
  return notice(db, {
    kind: 'referral_card',
    key: `${input.edition.designation}/${input.edition.editionNumber}`,
    recipients: [r],
    message: () =>
      compose({
        subject: `A card for an invitation: ${input.edition.name}`,
        lines: [`Someone you invited opened their first capsule. ${input.edition.name}, ${number}, is in your Collection.`],
        link: { href: `${SITE}/edition/${input.edition.designation}/${input.edition.editionNumber}`, label: 'The edition' },
        unsubscribe: unsubscribeUrl(r.privyId),
      }),
  })
}
