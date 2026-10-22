'use client';

import { useEffect, useState } from 'react';
import { useGameAccount } from '@/game/account';
import { onGemsChange } from '@/lib/solar-system/gem-progress';
import { syncGems, type GemStandingView } from '@/lib/solar-system/gem-sync';

/** Wait this long after a pickup before reporting, so a run of them goes as one request, ms. */
const DEBOUNCE_MS = 1500;

// One sync at a time for the whole page, however many components ask.
let running: Promise<GemStandingView | null> | null = null;
let again = false;
let lastStanding: GemStandingView | null = null;
const standingListeners = new Set<(s: GemStandingView | null) => void>();

function run(account: string, getToken: () => Promise<string | null>): Promise<GemStandingView | null> {
  if (running) { again = true; return running; }
  running = (async () => {
    let result: GemStandingView | null = null;
    do {
      again = false;
      const s = await syncGems({ account, getToken });
      if (s) result = s;
    } while (again);
    running = null;
    if (result) {
      lastStanding = result;
      for (const fn of standingListeners) fn(result);
    }
    return result;
  })();
  return running;
}

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
