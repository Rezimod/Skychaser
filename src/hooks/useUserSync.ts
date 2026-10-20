'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { track } from '@/lib/track';
import { readAttribution } from '@/lib/attribution';

const UPSERT_KEY_PREFIX = 'stellar:upserted:';
const COHORT_KEY_PREFIX = 'stellar:cohort:';
const SESSION_OPEN_KEY = 'stellar:session_open_at';
const SESSION_OPEN_THROTTLE_MS = 30 * 60 * 1000; // 30 min

type SignupMethod = 'email' | 'google' | 'twitter' | 'wallet';

// Acquisition channel, derived from the Privy account list. The
// walletClientType !== 'privy' filter is critical: every user has a Privy
// embedded wallet, so without it everyone looks like a 'wallet' signup. We only
// count an *external* wallet connect (Phantom/Solflare/Backpack) as 'wallet'.
function detectSignupMethod(
  linkedAccounts: ReadonlyArray<{ type: string }> | undefined,
): SignupMethod {
  const accounts = linkedAccounts ?? [];
  const externalWallet = accounts.find(
    (a) => a.type === 'wallet' && (a as { walletClientType?: string }).walletClientType !== 'privy',
  );
  if (externalWallet) return 'wallet';
  if (accounts.find((a) => a.type === 'google_oauth')) return 'google';
  if (accounts.find((a) => a.type === 'twitter_oauth')) return 'twitter';
  if (accounts.find((a) => a.type === 'email')) return 'email';
  return 'email';
}

// Wallet-attributed authenticated-session ping, throttled to once per 30 min.
// This is the retention signal the M2 cohort query counts — distinct from the
// anonymous, fire-on-mount `open` event, which can land pre-auth with no wallet.
function fireSessionOpen(wallet: string): void {
  try {
    const last = Number(localStorage.getItem(SESSION_OPEN_KEY) ?? 0);
    if (Date.now() - last < SESSION_OPEN_THROTTLE_MS) return;
    localStorage.setItem(SESSION_OPEN_KEY, String(Date.now()));
  } catch {
    // private mode — fall through and still fire once per mount
  }
  track('session_open', {}, wallet);
}

// Defer to the next idle frame so we never compete with first paint.
function runWhenIdle(cb: () => void) {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(cb, { timeout: 2000 });
  } else {
    window.setTimeout(cb, 600);
  }
}

// Embedded Solana wallets surface in `user.linkedAccounts` as soon as Privy
// finishes login — earlier and more reliably than the
// @privy-io/react-auth/solana `useWallets` hook, which is gated on the
// Standard-Wallet adapter being ready. Reading from linkedAccounts also
// avoids the wrong-import bug where `useWallets` from the root entry
// returns Ethereum wallets only.
type EmbeddedSolanaLinkedAccount = {
  type: 'wallet';
  chainType: 'solana';
  walletClientType: string;
  address: string;
};

function findEmbeddedSolanaAddress(
  linkedAccounts: ReadonlyArray<{ type: string }> | undefined,
): string | null {
  if (!linkedAccounts) return null;
  const match = linkedAccounts.find(
    (a): a is EmbeddedSolanaLinkedAccount =>
      a.type === 'wallet' &&
      (a as { chainType?: string }).chainType === 'solana' &&
      (a as { walletClientType?: string }).walletClientType === 'privy',
  );
  return match?.address ?? null;
}

export function useUserSync() {
  const { authenticated, user, getAccessToken } = usePrivy();

  useEffect(() => {
    if (!authenticated || !user) return;

    const email = user.email?.address ?? null;
    const walletAddress = findEmbeddedSolanaAddress(user.linkedAccounts);

    // Wait until the embedded Solana wallet exists before upserting. Privy
    // creates it asynchronously after first login; firing now would persist
    // walletAddress=null and (worse) overwrite a previously-saved address.
    if (!walletAddress) return;

    // Retention signal — throttled independently of the upsert dedupe below so
    // it still fires on a returning visit within the same session.
    fireSessionOpen(walletAddress);

    // Dedupe: only upsert once per session per (privyId + walletAddress) combo.
    const dedupeKey = UPSERT_KEY_PREFIX + user.id + ':' + walletAddress;
    const cohortKey = COHORT_KEY_PREFIX + user.id + ':' + walletAddress;
    let alreadyUpserted = false;
    try {
      alreadyUpserted = sessionStorage.getItem(dedupeKey) === '1';
    } catch {}
    if (alreadyUpserted) return;

    const method = detectSignupMethod(user.linkedAccounts);
    const attribution = readAttribution();

    let cancelled = false;
    runWhenIdle(() => {
      if (cancelled) return;
      getAccessToken()
        .then((token) => {
          if (!token || cancelled) return;
          const auth = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          };
          const upsert = fetch('/api/users/upsert', {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ privyId: user.id, email, walletAddress }),
          }).then(() => {
            try { sessionStorage.setItem(dedupeKey, '1'); } catch {}
          });

          // Write-once acquisition row + server-side signup event. Deduped per
          // session so we don't re-POST on every mount; the server's
          // on-conflict-do-nothing is the real first-write guard.
          let cohortDone = false;
          try { cohortDone = sessionStorage.getItem(cohortKey) === '1'; } catch {}
          const cohort = cohortDone
            ? Promise.resolve()
            : fetch('/api/cohort/upsert', {
                method: 'POST',
                headers: auth,
                body: JSON.stringify({
                  wallet: walletAddress,
                  method,
                  utm_source: attribution?.utm_source ?? null,
                  utm_medium: attribution?.utm_medium ?? null,
                  utm_campaign: attribution?.utm_campaign ?? null,
                  utm_content: attribution?.utm_content ?? null,
                  referrer: attribution?.referrer ?? null,
                  landing_path: attribution?.landing_path ?? null,
                }),
              }).then(() => {
                try { sessionStorage.setItem(cohortKey, '1'); } catch {}
              });

          return Promise.all([upsert, cohort]);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [authenticated, user, getAccessToken]);
}
