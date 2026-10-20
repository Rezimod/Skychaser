/**
 * Client-side analytics. Fire-and-forget — never blocks the UI, never throws.
 * Writes to /api/track, which validates the event and persists it to Neon.
 *
 *   track('find_aimed', { target: 'jupiter', heldMs: 1200 }, wallet)
 *
 * The core-loop events are: open, location_set, find_aimed, stars_earned,
 * stars_spent, mission_complete. The cohort/retention events (session_open,
 * observation_started, quiz_completed, marketplace_view) are wallet-attributed
 * behavior tracked for the Astroman beta. See src/app/api/track/route.ts.
 * Server-only events (signup, observation_minted, reward_redeemed) are written
 * directly via src/lib/track-server.ts, not through this client helper.
 */

export type TrackEvent =
  | 'open'
  | 'location_set'
  | 'find_aimed'
  | 'stars_earned'
  | 'stars_spent'
  | 'mission_complete'
  | 'session_open'
  | 'observation_started'
  | 'quiz_completed'
  | 'marketplace_view'
  | 'product_view';

const ANON_KEY = 'stellar_anon_id';

function anonId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `a_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      window.localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function track(
  event: TrackEvent,
  props?: Record<string, unknown>,
  wallet?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({
      event,
      props,
      wallet: wallet ?? undefined,
      anonId: anonId(),
      path: window.location.pathname,
    });
    // sendBeacon survives navigation/unload — ideal for fire-and-forget events.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // analytics must never break the app
  }
}
