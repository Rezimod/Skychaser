'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile';
import type { ReactNode } from 'react';
import { useUserSync } from '@/hooks/useUserSync';

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
  throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set');
}

function toWsUrl(url: string): string {
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`;
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`;
  return url;
}

// Embedded-wallet chain must match the deployed network. Driven by env so the
// devnet→mainnet cutover is a config flip, not a code change.
// || not ??: a cleared variable on Vercel is "", which must read as mainnet, as the server does.
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta';
const IS_MAINNET = CLUSTER.startsWith('mainnet');
const PRIVY_CHAIN: `solana:${string}` = IS_MAINNET ? 'solana:mainnet' : 'solana:devnet';

// The fallback follows the cluster, so a mainnet build never talks to devnet.
const RPC_HTTP_URL =
  // || not ??: Vercel keeps a cleared variable as "", which must count as unset.
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  (IS_MAINNET ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
const RPC_WS_URL = toWsUrl(RPC_HTTP_URL);
const BLOCK_EXPLORER_URL = IS_MAINNET
  ? 'https://explorer.solana.com'
  : 'https://explorer.solana.com?cluster=devnet';

// Seeker (and any Android phone with a Mobile Wallet Adapter wallet) shows up in Privy's
// detected wallets. registerMwa is a no-op on desktop browsers.
if (typeof window !== 'undefined') {
  registerMwa({
    appIdentity: { name: 'Skychaser', uri: window.location.origin, icon: '/icon-192.png' },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [PRIVY_CHAIN],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
}

function UserSyncWrapper({ children }: { children: ReactNode }) {
  useUserSync();
  return <>{children}</>;
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!.trim();

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'twitter', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#EE8C3A',
          logo: '/brand/logo-mark.svg',
          loginMessage: 'Log in to Skychaser',
          showWalletLoginFirst: false,
          walletChainType: 'solana-only',
          walletList: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack'],
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        solana: {
          rpcs: {
            [PRIVY_CHAIN]: {
              rpc: createSolanaRpc(RPC_HTTP_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(RPC_WS_URL),
              blockExplorerUrl: BLOCK_EXPLORER_URL,
            },
          },
        },
      }}
    >
      <UserSyncWrapper>{children}</UserSyncWrapper>
    </PrivyProvider>
  );
}
