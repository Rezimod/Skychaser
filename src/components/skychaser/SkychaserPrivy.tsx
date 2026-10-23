'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useFundWallet, useSolanaFundingPlugin, useWallets } from '@privy-io/react-auth/solana';
import { useEffect, useMemo } from 'react';
import { SolanaWalletProvider } from '@/components/providers/PrivyProvider';
import { useSkychaserSession, type FundWallet, type PrivyState } from './SkychaserAuth';

const DEVNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';

/** Opens Privy's sign-in window if Log in is what loaded it. */
function LoginOnArrival() {
  const { ready, authenticated, login } = usePrivy();
  const { wantsLogin, loginOpened } = useSkychaserSession();
  useEffect(() => {
    if (!ready || !wantsLogin) return;
    loginOpened();
    if (!authenticated) login();
  }, [ready, wantsLogin, authenticated, login, loginOpened]);
  return null;
}

/** Reads Privy inside its provider and reports every change up to SkychaserAuth. */
function Report({ onState }: { onState: (s: PrivyState) => void }) {
  const privy = usePrivy();
  const { wallets } = useWallets();
  // Privy's funding flow for Solana: a card or an exchange, into the holder's own wallet, when the dashboard allows it.
  useSolanaFundingPlugin();
  const { fundWallet } = useFundWallet();
  const fund = useMemo<FundWallet>(
    () =>
      ({ address, amountSol }) =>
        fundWallet({
          address,
          options: {
            chain: DEVNET ? 'solana:devnet' : 'solana:mainnet',
            asset: 'native-currency',
            ...(amountSol ? { amount: amountSol.toFixed(4) } : {}),
          },
        }),
    [fundWallet],
  );
  useEffect(() => onState({ privy, wallets, fundWallet: fund }), [privy, wallets, fund, onState]);
  return null;
}

/** Privy's provider, mounted beside the page: it renders nothing of its own but its sign-in window. */
export default function SkychaserPrivy({ onState }: { onState: (s: PrivyState) => void }) {
  return (
    <SolanaWalletProvider>
      <LoginOnArrival />
      <Report onState={onState} />
    </SolanaWalletProvider>
  );
}
