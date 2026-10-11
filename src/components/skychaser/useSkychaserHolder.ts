'use client';

import { usePrivySafe as usePrivy } from './usePrivySafe';
import { useMemo } from 'react';

type LinkedSolana = { type: 'wallet'; chainType?: string; walletClientType?: string; address: string };

/**
 * The holder as Skychaser's routes know them: the Privy session, and a Solana
 * wallet linked to it — the Privy wallet first. Every Skychaser route checks the
 * address against the wallets linked to the session, so a browser wallet that
 * happens to be connected but was never linked must not be the one sent.
 */
export function useSkychaserHolder() {
  const { ready, authenticated, user } = usePrivy();
  const address = useMemo(() => {
    const solana = ((user?.linkedAccounts ?? []) as ReadonlyArray<{ type: string }>).filter(
      (a): a is LinkedSolana => a.type === 'wallet' && (a as LinkedSolana).chainType === 'solana',
    );
    return (solana.find((a) => a.walletClientType === 'privy') ?? solana[0])?.address ?? null;
  }, [user]);
  return { ready, authenticated: authenticated && Boolean(user), address };
}
