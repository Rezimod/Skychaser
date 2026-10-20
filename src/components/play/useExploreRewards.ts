'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as usePrivySolanaWallets } from '@privy-io/react-auth/solana';
import {
  localRewardSink, syncedRewardSink, type Achievement, type SyncedRewardSink,
} from '@/lib/solar-system/achievements';
import { isExploreAchievement, type ExploreProgress } from '@/lib/games/explore';

/** One award the platform just made, for the glass to show for a moment. */
export interface ExploreAward {
  id: string;
  stars: number;
}

const AWARD_SHOWN_MS = 6000;

/** The signed-in explorer's Solana address, from Privy alone: the game's
 *  document carries no wallet-adapter context. */
function usePrivySolanaAddress(): string | null {
  const { user } = usePrivy();
  const solana = usePrivySolanaWallets();
  const linked = useMemo(() => {
    const match = user?.linkedAccounts.find((a) =>
      a.type === 'wallet'
      && (a as { chainType?: string }).chainType === 'solana'
      && (a as { walletClientType?: string }).walletClientType === 'privy');
    return (match as { address?: string } | undefined)?.address ?? null;
  }, [user]);
  const live = solana.ready ? (solana.wallets[0]?.address ?? null) : null;
  return live ?? linked;
}

/** The game's connection to the platform. One sink for the surfaces to write
 *  records into; each new one goes to `/api/games/explore/complete`, which
 *  credits Stars to the signed-in wallet. Signing in later flushes whatever
 *  the crew earned before. */
export function useExploreRewards() {
  const { authenticated, ready, getAccessToken } = usePrivy();
  const address = usePrivySolanaAddress();
  const wallet = authenticated && address ? address : null;
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const tokenRef = useRef(getAccessToken);
  tokenRef.current = getAccessToken;
  const [award, setAward] = useState<ExploreAward | null>(null);
  const [progress, setProgress] = useState<ExploreProgress | null>(null);
  const [progressTick, setProgressTick] = useState(0);

  const submit = useCallback(async (a: Achievement): Promise<boolean> => {
    // Not worth anything: the platform has nothing to credit, so it counts
    // as done rather than being reported on every flush.
    if (!isExploreAchievement(a.id)) return true;
    const w = walletRef.current;
    if (!w) return false;
    let token: string | null = null;
    try { token = await tokenRef.current(); } catch { token = null; }
    if (!token) return false;
    const res = await fetch('/api/games/explore/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wallet: w, achievement: a.id }),
    });
    if (res.status === 400) return true;
    if (!res.ok) return false;
    const body = await res.json() as { starsAwarded?: number; alreadyAwarded?: boolean };
    if (!body.alreadyAwarded && (body.starsAwarded ?? 0) > 0) {
      setAward({ id: a.id, stars: body.starsAwarded! });
      setProgressTick((n) => n + 1);
    }
    return true;
  }, []);

  // One sink for the life of the game: the surfaces hold it across scenes.
  const sinkRef = useRef<SyncedRewardSink | null>(null);
  if (!sinkRef.current) sinkRef.current = syncedRewardSink(localRewardSink(), submit);
  const sink = sinkRef.current;

  // Signed in: read what is credited, then report what is not.
  useEffect(() => {
    if (!ready) return;
    if (!wallet) { setProgress(null); return; }
    let cancelled = false;
    (async () => {
      let token: string | null = null;
      try { token = await tokenRef.current(); } catch { token = null; }
      if (!token || cancelled) return;
      try {
        const res = await fetch('/api/games/explore', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        const p = await res.json() as ExploreProgress;
        if (cancelled) return;
        sink.markCredited(p.credited.map((c) => c.id));
        setProgress(p);
      } catch { /* offline: the flush below still tries */ }
      if (!cancelled) void sink.flush();
    })();
    return () => { cancelled = true; };
  }, [ready, wallet, sink, progressTick]);

  useEffect(() => {
    if (!award) return;
    const t = window.setTimeout(() => setAward(null), AWARD_SHOWN_MS);
    return () => window.clearTimeout(t);
  }, [award]);

  return { sink, award, progress, signedIn: !!wallet };
}
