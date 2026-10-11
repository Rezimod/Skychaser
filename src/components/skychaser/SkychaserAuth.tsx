'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { usePrivy } from '@privy-io/react-auth';
import type { useWallets } from '@privy-io/react-auth/solana';

export type Privy = ReturnType<typeof usePrivy>;
export type SolanaWallets = ReturnType<typeof useWallets>['wallets'];
/** What Privy knows, read inside its provider and handed out here. */
export type PrivyState = { privy: Privy; wallets: SolanaWallets };

type Auth = {
  /** Privy is loaded and has reported in. */
  ready: boolean;
  /** Load Privy; with `login`, open its sign-in window as soon as it is up. */
  enable: (login?: boolean) => void;
  wantsLogin: boolean;
  loginOpened: () => void;
  /** Privy's session and wallets, once Privy is up. */
  state: PrivyState | null;
};

const AuthContext = createContext<Auth>({ ready: false, enable: () => {}, wantsLogin: false, loginOpened: () => {}, state: null });
export const useSkychaserSession = () => useContext(AuthContext);

/** Inside a legacy Skychaser page, Privy is already mounted by its layout: LegacyPrivy hands its state in. */
export const LegacyState = createContext<PrivyState | null>(null);

function hadSession() {
  try {
    return Boolean(localStorage.getItem('privy:refresh_token') ?? localStorage.getItem('privy:token'));
  } catch {
    return false;
  }
}

/**
 * Log-in, loaded only when it is wanted. A visitor who has never signed in
 * downloads none of Privy — no SDK, no wallet list, no auth window — until
 * they press Log in; someone with a session gets it as the page settles.
 *
 * Privy's provider is mounted beside the page, not around it, and reports its
 * state up (SkychaserPrivy). So Privy arriving never remounts the page: nothing
 * the visitor has opened or pressed in the meantime is lost.
 */
export default function SkychaserAuth({ children }: { children: ReactNode }) {
  const legacy = useContext(LegacyState);
  if (legacy) return <LegacyAuth state={legacy}>{children}</LegacyAuth>;
  return <LazyAuth>{children}</LazyAuth>;
}

function LegacyAuth({ state, children }: { state: PrivyState; children: ReactNode }) {
  const value = useMemo(() => ({ ready: true, enable: () => {}, wantsLogin: false, loginOpened: () => {}, state }), [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function LazyAuth({ children }: { children: ReactNode }) {
  const [Shell, setShell] = useState<ComponentType<{ onState: (s: PrivyState) => void }> | null>(null);
  const [state, setState] = useState<PrivyState | null>(null);
  const [wantsLogin, setWantsLogin] = useState(false);

  const enable = useCallback((login = false) => {
    if (login) setWantsLogin(true);
    import('./SkychaserPrivy').then((m) => setShell(() => m.default));
  }, []);

  useEffect(() => {
    if (hadSession()) enable();
  }, [enable]);

  const value = useMemo(
    () => ({ ready: state !== null, enable, wantsLogin, loginOpened: () => setWantsLogin(false), state }),
    [state, enable, wantsLogin],
  );
  // The same element every render, so Privy's subtree only renders when Privy itself changes.
  const privy = useMemo(() => (Shell ? <Shell onState={setState} /> : null), [Shell]);
  return (
    <AuthContext.Provider value={value}>
      {children}
      {privy}
    </AuthContext.Provider>
  );
}
