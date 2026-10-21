'use client';

import dynamic from 'next/dynamic';
import { useSkychaserSession, warmPrivy } from './SkychaserAuth';

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
  const { ready, enable, wantsLogin } = useSkychaserSession();
  if (!ready)
    return (
      <button
        type="button"
        className={`sd-chip sd-chip--cta${wantsLogin ? ' is-loading' : ''}`}
        aria-busy={wantsLogin || undefined}
        onPointerEnter={warmPrivy}
        onTouchStart={warmPrivy}
        onFocus={warmPrivy}
        onClick={() => enable(true)}
      >
        {wantsLogin ? 'Opening' : 'Log in'}
      </button>
    );
  return <SkychaserAccount />;
}
