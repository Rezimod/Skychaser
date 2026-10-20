// Acquisition attribution capture. The problem this solves: a user clicks an
// Astroman email → lands on /?utm_source=astroman → browses for an hour → signs
// up on /missions. By signup time the URL params are long gone. So we snapshot
// the UTMs on the very first page load and persist them, then read them back at
// signup time to write the user_cohorts row.
//
// localStorage with a 30-day TTL is deliberate: if a user clears storage before
// signing up we lose attribution, which is an acceptable loss at beta-cohort
// sizes (the signed-cookie alternative is over-engineered here).

const ATTRIBUTION_KEY = 'stellar_attribution_v1';
const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 86400_000;

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_path: string | null;
  captured_at: number;
}

// Snapshot UTMs on first load. No-op if a non-expired snapshot already exists —
// first touch wins, matching the write-once semantics of user_cohorts.
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = localStorage.getItem(ATTRIBUTION_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as Attribution;
      if (Date.now() - parsed.captured_at < TTL_MS) return;
    }

    const params = new URLSearchParams(window.location.search);
    const utm: Attribution = {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      referrer: document.referrer || null,
      landing_path: window.location.pathname,
      captured_at: Date.now(),
    };

    // Only persist if there's at least one signal worth attributing.
    if (utm.utm_source || utm.referrer) {
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(utm));
    }
  } catch {
    // private mode / disabled storage — attribution is best-effort
  }
}

export function readAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}
