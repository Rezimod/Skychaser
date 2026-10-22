'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { GameAccountContext, type GameAccount } from '@/game/account';
import type { PrivySnapshot } from './StellarPrivyBridge';

type Bridge = ComponentType<{ onState: (s: PrivySnapshot) => void; wantsLogin: boolean; onLoginOpened: () => void }>;

/** Privy's own keys for a session on this device: someone who signed in
 *  before gets Privy loaded as the game settles, everyone else only when
 *  they ask to sign in. */
function hadSession(): boolean {
  try {
    return Boolean(localStorage.getItem('privy:refresh_token') ?? localStorage.getItem('privy:token'));
  } catch {
    return false;
  }
}

/** The Stellar platform's account for the game. Privy (about two
 *  megabytes of script with its wallets) is not on the way to the title or
 *  the first flight: it loads beside the game when there is a session to
 *  restore or when the player presses Sign in, and reports up through
 *  StellarPrivyBridge. Until then the player is plainly signed out. */
export function StellarAccount({ children }: { children: ReactNode }) {
  const [Bridge, setBridge] = useState<Bridge | null>(null);
  const [snap, setSnap] = useState<PrivySnapshot | null>(null);
  const [wantsLogin, setWantsLogin] = useState(false);
  /** A session is waiting to be restored: signed-out is not yet known. */
  const [restoring, setRestoring] = useState(false);

  const enable = useCallback((login: boolean) => {
    if (login) setWantsLogin(true);
    void import('./StellarPrivyBridge').then((m) => setBridge(() => m.default));
  }, []);
  useEffect(() => {
    if (!hadSession()) return;
    setRestoring(true);
    // After the first paint and the title: the restore is not what the player is waiting for.
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => enable(false), { timeout: 2500 });
    else window.setTimeout(() => enable(false), 1200);
  }, [enable]);
  const loginOpened = useCallback(() => setWantsLogin(false), []);

  const value = useMemo<GameAccount>(() => {
    const login = snap ? snap.login : () => enable(true);
    if (!snap) {
      return {
        available: true, ready: !restoring, authenticated: false, userId: null, name: null, wallet: null,
        getAccessToken: async () => null, login,
      };
    }
    return { available: true, ...snap, login };
  }, [snap, restoring, enable]);
  // The same element every render, so Privy's subtree only renders when its own state changes.
  const bridge = useMemo(() => (Bridge ? <Bridge onState={setSnap} wantsLogin={wantsLogin} onLoginOpened={loginOpened} /> : null), [Bridge, wantsLogin, loginOpened]);
  return (
    <GameAccountContext.Provider value={value}>
      {children}
      {bridge}
    </GameAccountContext.Provider>
  );
}
