'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets } from '@privy-io/react-auth/solana';
import { SolanaWalletProvider } from '@/components/providers/PrivyProvider';
import { useProfile } from '@/hooks/useProfile';

/** What Privy knows, handed up to StellarAccount. */
export interface PrivySnapshot {
  ready: boolean;
  authenticated: boolean;
  userId: string | null;
  name: string | null;
  wallet: string | null;
  getAccessToken: () => Promise<string | null>;
  login: () => void;
}

interface BridgeProps {
  onState: (s: PrivySnapshot) => void;
  /** Open the sign-in window as soon as Privy is up. */
  wantsLogin: boolean;
  onLoginOpened: () => void;
}

/** Privy, loaded only when it is wanted, mounted beside the game rather
 *  than around it: Privy arriving never remounts the game. It reports its
 *  state up and renders nothing of its own but Privy's sign-in window. */
export default function StellarPrivyBridge(props: BridgeProps) {
  return (
    <SolanaWalletProvider>
      <Reporter {...props} />
    </SolanaWalletProvider>
  );
}

function Reporter({ onState, wantsLogin, onLoginOpened }: BridgeProps) {
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
  const tokenRef = useRef(getAccessToken);
  tokenRef.current = getAccessToken;
  const loginRef = useRef(login);
  loginRef.current = login;
  const open = useMemo(() => () => loginRef.current({ loginMethods: ['email', 'google', 'wallet'], walletChainType: 'solana-only' }), []);
  const token = useMemo(() => async () => {
    try { return await tokenRef.current(); } catch { return null; }
  }, []);
  useEffect(() => {
    onState({ ready, authenticated, userId: user?.id ?? null, name: profile?.username || null, wallet: authenticated ? wallet : null, getAccessToken: token, login: open });
  }, [onState, ready, authenticated, user?.id, profile?.username, wallet, token, open]);
  useEffect(() => {
    if (!wantsLogin || !ready) return;
    onLoginOpened();
    if (!authenticated) open();
  }, [wantsLogin, ready, authenticated, open, onLoginOpened]);
  return null;
}
