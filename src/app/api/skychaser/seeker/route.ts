import { NextRequest, NextResponse } from 'next/server';
import { address, createSolanaRpc } from '@solana/kit';
import { getSeekerGenesisTokens } from '@solana-mobile/skr-genesis-token';
import { getSessionWalletAddresses, verifyPrivy } from '@/lib/api-auth';

export const runtime = 'nodejs';

/** Whether the signed-in user's wallets hold a Seeker Genesis Token (one per Seeker phone). */
export async function GET(req: NextRequest) {
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const rpc = createSolanaRpc(
    process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  );
  for (const wallet of await getSessionWalletAddresses(privyId)) {
    const [token] = await getSeekerGenesisTokens(rpc, address(wallet), { commitment: 'finalized' });
    if (token) return NextResponse.json({ seeker: true, wallet, memberNumber: Number(token.memberNumber), mint: token.mint });
  }
  return NextResponse.json({ seeker: false });
}
