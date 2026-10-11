'use client';

import dynamic from 'next/dynamic';
import { useSkychaserSession } from './SkychaserAuth';

const SkychaserAccount = dynamic(() => import('./SkychaserAccount'), {
  ssr: false,
  loading: () => (
    <span className="sd-chip" aria-hidden="true" style={{ visibility: 'hidden' }}>
      Log in
    </span>
  ),
});

/** The account corner: a plain Log in until Privy is wanted, then the full menu. */
export default function SkychaserAccountGate() {
  const { ready, enable } = useSkychaserSession();
  if (!ready)
    return (
      <button type="button" className="sd-chip sd-chip--cta" onClick={() => enable(true)}>
        Log in
      </button>
    );
  return <SkychaserAccount />;
}
