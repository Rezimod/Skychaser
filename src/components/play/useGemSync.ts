'use client';

import { useEffect, useState } from 'react';
import { useGameAccount } from '@/game/account';
import { onGemsChange } from '@/lib/solar-system/gem-progress';
import { syncGems, type GemStandingView } from '@/lib/solar-system/gem-sync';

/** Wait this long after a pickup before reporting, so a run of them goes as one request, ms. */
const DEBOUNCE_MS = 1500;

/** A request to the gems API that has not answered in this long is given up on, ms. */
const FETCH_TIMEOUT_MS = 15_000;
/** Getting the token from the account provider, likewise, ms. */
const TOKEN_TIMEOUT_MS = 15_000;

/** An abort signal that fires after `ms`: AbortSignal.timeout where there is one, a timer where not. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  if (typeof AbortController === 'undefined') return undefined;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/** fetch, but a request that hangs (a weak network, a sleeping phone) fails instead of holding the sync forever. */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const signal = init?.signal ?? timeoutSignal(FETCH_TIMEOUT_MS);
  return fetch(input, signal ? { ...init, signal } : init);
};

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });
}

// One sync at a time for the whole page, however many components ask.
let running: Promise<GemStandingView | null> | null = null;
let again = false;
let lastStanding: GemStandingView | null = null;
const standingListeners = new Set<(s: GemStandingView | null) => void>();

/** For tests: forget the sync in flight and the last standing. */
export function resetGemSyncRunForTests() {
  running = null;
  again = false;
  lastStanding = null;
}

export function runGemSync(
  account: string,
  getToken: () => Promise<string | null>,
  sync: typeof syncGems = syncGems,
): Promise<GemStandingView | null> {
  if (running) { again = true; return running; }
  running = (async () => {
    let result: GemStandingView | null = null;
    try {
      do {
        again = false;
        const s = await sync({ account, getToken: () => withTimeout(getToken(), TOKEN_TIMEOUT_MS, null), fetch: fetchWithTimeout });
        if (s) result = s;
      } while (again);
    } catch (err) {
      // A failed pass is retried on the next pickup or sign-in; it must not stop syncing for the session.
      if (process.env.NODE_ENV !== 'test') console.warn('gem sync', err);
    } finally {
      running = null;
    }
    if (result) {
      lastStanding = result;
      for (const fn of standingListeners) fn(result);
    }
    return result;
  })();
  return running;
}
const run = (account: string, getToken: () => Promise<string | null>) => runGemSync(account, getToken);

/**
 * Report the gems picked up on this device to the platform while a player is
 * signed in — on sign-in (which sends what was picked up while signed out),
 * and shortly after each pickup. Without accounts (`available` false) or
 * signed out it does nothing and the gems stay on the device. Returns the
 * player's standing from the last answer, for the glass or a menu.
 */
export function useGemSync(): GemStandingView | null {
  const { available, ready, authenticated, userId, getAccessToken } = useGameAccount();
  const [standing, setStanding] = useState<GemStandingView | null>(lastStanding);
  const on = available && ready && authenticated && !!userId;

  useEffect(() => {
    standingListeners.add(setStanding);
    return () => { standingListeners.delete(setStanding); };
  }, []);

  useEffect(() => {
    if (!on || !userId) return;
    let timer: number | null = null;
    void run(userId, getAccessToken);
    const off = onGemsChange(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; void run(userId, getAccessToken); }, DEBOUNCE_MS);
    });
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [on, userId, getAccessToken]);

  return on ? standing : null;
}
