'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets } from '@privy-io/react-auth/solana';
import { useProfile } from '@/hooks/useProfile';
import { GameAccountContext, type GameAccount } from '@/game/account';

/** The Stellar platform's account for the game: Privy sign-in, the
 *  embedded Solana wallet Stars are credited to, and the profile's name. */
export function StellarAccount({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const { profile } = useProfile();
  const solana = usePrivySolanaWallets();
  // The game's document carries no wallet-adapter context: the address comes from Privy alone.
  const linked = useMemo(() => {
    const match = user?.linkedAccounts.find((a) =>
      a.type === 'wallet'
      && (a as { chainType?: string }).chainType === 'solana'
      && (a as { walletClientType?: string }).walletClientType === 'privy');
    return (match as { address?: string } | undefined)?.address ?? null;
  }, [user]);
  const wallet = (solana.ready ? (solana.wallets[0]?.address ?? null) : null) ?? linked;
  const open = useCallback(() => login({ loginMethods: ['email', 'google', 'wallet'], walletChainType: 'solana-only' }), [login]);
  const token = useCallback(async () => {
    try { return await getAccessToken(); } catch { return null; }
  }, [getAccessToken]);
  const value = useMemo<GameAccount>(() => ({
    available: true,
    ready,
    authenticated,
    userId: user?.id ?? null,
    name: profile?.username || null,
    wallet: authenticated ? wallet : null,
    getAccessToken: token,
    login: open,
  }), [ready, authenticated, user?.id, profile?.username, wallet, token, open]);
  return <GameAccountContext.Provider value={value}>{children}</GameAccountContext.Provider>;
}
