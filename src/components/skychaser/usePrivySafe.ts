'use client';

import { useSkychaserSession, type Privy } from './SkychaserAuth';

/**
 * Privy's session wherever a Skychaser component is, loaded or not. Before Privy
 * has loaded nobody is signed in, and signing in loads it.
 */
export function usePrivySafe(): Privy {
  const auth = useSkychaserSession();
  if (auth.state) return auth.state.privy;
  return {
    ready: true,
    authenticated: false,
    user: null,
    login: () => auth.enable(true),
    logout: async () => {},
    getAccessToken: async () => null,
  } as unknown as Privy;
}
