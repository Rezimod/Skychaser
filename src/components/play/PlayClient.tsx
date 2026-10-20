'use client';

import dynamic from 'next/dynamic';
import { CosmicLoader } from '@/components/solar-system/CosmicLoader';

/** The whole game is one chunk that only this route asks for. */
const GameShell = dynamic(() => import('./GameShell'), {
  ssr: false,
  loading: () => <div className="game-shell"><CosmicLoader label="Stellar Explore" progress={0.02} /></div>,
});

export default function PlayClient() {
  return <GameShell />;
}
