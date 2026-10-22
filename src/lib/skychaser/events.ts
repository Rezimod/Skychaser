import { analyticsEvent } from '@/lib/schema'
import type { Db } from './attach'

/**
 * Funnel events only the server can vouch for. The client's own events go
 * through /api/track, which refuses these names, so a browser cannot forge a
 * welcome or a reward. Writing one never fails the request it belongs to.
 */
export type ServerEvent = 'welcome_granted' | 'invite_opened' | 'invite_landed' | 'referral_rewarded' | 'notice_sent'

export async function recordEvent(
  db: Db,
  event: ServerEvent,
  input: { wallet?: string | null; path?: string; props?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db.insert(analyticsEvent).values({ event, wallet: input.wallet ?? null, path: input.path ?? null, props: input.props ?? null })
  } catch (err) {
    console.error(`[skychaser] cannot record ${event}`, err instanceof Error ? err.message : err)
  }
}
