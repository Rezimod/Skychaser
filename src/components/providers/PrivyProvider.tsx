'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import type { ReactNode } from 'react';
import { useUserSync } from '@/hooks/useUserSync';

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
  throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set');
}

const RPC_HTTP_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ??
  'https://api.devnet.solana.com';

function toWsUrl(url: string): string {
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`;
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`;
  return url;
}

const RPC_WS_URL = toWsUrl(RPC_HTTP_URL);

// Embedded-wallet chain must match the deployed network. Driven by env so the
// devnet→mainnet cutover is a config flip, not a code change.
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'mainnet-beta';
const IS_MAINNET = CLUSTER.startsWith('mainnet');
const PRIVY_CHAIN: `solana:${string}` = IS_MAINNET ? 'solana:mainnet' : 'solana:devnet';
const BLOCK_EXPLORER_URL = IS_MAINNET
  ? 'https://explorer.solana.com'
  : 'https://explorer.solana.com?cluster=devnet';

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
          accentColor: '#FFB347',
          logo: '/brand/logo-mark.svg',
          loginMessage: 'Sign in to Stellar',
          showWalletLoginFirst: false,
          walletChainType: 'solana-only',
          walletList: ['phantom', 'solflare', 'backpack', 'detected_solana_wallets'],
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
