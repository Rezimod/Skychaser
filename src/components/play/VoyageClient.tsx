'use client';

import dynamic from 'next/dynamic';
import { CosmicLoader } from '@/components/solar-system/CosmicLoader';
import { useSkychaserSession } from '@/components/skychaser/SkychaserAuth';

const load = () => import('./GameShell');
const loader = () => <div className="game-shell"><CosmicLoader label="Voyage" progress={0.02} /></div>;

/** The whole game is one chunk that only this route asks for. */
const GameShell = dynamic(load, { ssr: false, loading: loader });

/** Privy's hooks only once Privy is up; before that nobody is signed in and nothing is held. */
const VoyageHoldings = dynamic(() => import('./VoyageHoldings'), { ssr: false });

/** The game, and what the visitor holds once Privy is up. */
export default function VoyageClient() {
  const { ready } = useSkychaserSession();
  return (
    <>
      {ready && <VoyageHoldings />}
      <GameShell />
    </>
  );
}
