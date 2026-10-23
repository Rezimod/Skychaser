'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useMemo, type ReactNode } from 'react';
import { LegacyState } from './SkychaserAuth';

/** Inside a legacy Skychaser page, Privy is already mounted by its layout: Skychaser components read that one. */
export default function LegacyPrivy({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { wallets } = useWallets();
  // A legacy page mounts no funding plugin: the pay panel offers the address alone there.
  const state = useMemo(() => ({ privy, wallets, fundWallet: null }), [privy, wallets]);
  return <LegacyState.Provider value={state}>{children}</LegacyState.Provider>;
}
