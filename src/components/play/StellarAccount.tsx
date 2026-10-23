'use client';

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { GameAccountContext, type GameAccount } from '@/game/account';
import type { PrivySnapshot } from './StellarPrivyBridge';

type Bridge = ComponentType<{ onState: (s: PrivySnapshot) => void; wantsLogin: boolean; onLoginOpened: () => void }>;

/** The bridge, if it throws, takes only itself down: the game goes on, signed out. */
class BridgeBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== 'test') console.warn('account bridge', error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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

  const loading = useRef(false);
  const enable = useCallback((login: boolean) => {
    if (login) setWantsLogin(true);
    if (loading.current) return;
    loading.current = true;
    // One retry for a chunk that did not come down; after that the player is
    // a guest (signed out, the game playable), and Sign in tries again.
    const load = () => import('./StellarPrivyBridge');
    load().catch(() => new Promise<Awaited<ReturnType<typeof load>>>((resolve, reject) => {
      window.setTimeout(() => { load().then(resolve, reject); }, 1500);
    })).then((m) => {
      setBridge(() => m.default);
    }, (err: unknown) => {
      if (process.env.NODE_ENV !== 'test') console.warn('account bridge did not load', err);
      setRestoring(false);
      setWantsLogin(false);
    }).finally(() => {
      loading.current = false;
    });
  }, []);
  /** The bridge crashed: drop it and whatever it last said, and carry on signed out. */
  const bridgeFailed = useCallback(() => {
    setBridge(null);
    setSnap(null);
    setRestoring(false);
    setWantsLogin(false);
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
  const bridge = useMemo(() => (Bridge ? (
    <BridgeBoundary onError={bridgeFailed}>
      <Bridge onState={setSnap} wantsLogin={wantsLogin} onLoginOpened={loginOpened} />
    </BridgeBoundary>
  ) : null), [Bridge, wantsLogin, loginOpened, bridgeFailed]);
  return (
    <GameAccountContext.Provider value={value}>
      {children}
      {bridge}
    </GameAccountContext.Provider>
  );
}
