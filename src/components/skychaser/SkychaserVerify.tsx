'use client';

import { useState } from 'react';

type Verification = { ok: boolean; problems: string[] } | null;

/**
 * Runs the check again, in front of whoever is reading. The page already
 * shows a verdict computed on the server; this asks for it a second time from
 * the public endpoint, so the answer is not something the page simply claims.
 */
export default function SkychaserVerify({ capsuleId }: { capsuleId: string }) {
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'failed'>('idle');
  const [verification, setVerification] = useState<Verification>(null);

  const run = async () => {
    setState('checking');
    try {
      const res = await fetch(`/api/skychaser/capsules/verify?capsuleId=${capsuleId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('failed');
        return;
      }
      setVerification(data.verification ?? null);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="sd-section">
      <div className="sd-pay__actions">
        <button type="button" className="sd-btn" onClick={run} disabled={state === 'checking'}>
          {state === 'checking' ? 'Checking' : 'Verify again'}
        </button>
      </div>
      {state === 'failed' && <p className="sd-data">The check could not be run just now.</p>}
      {state === 'done' && (
        <p className="sd-data">
          {verification === null
            ? 'This capsule has not been opened, so there is nothing to check yet.'
            : verification.ok
              ? 'Checked: the draws follow from the secret, the nonce and the paying block, and every edition number matches the supply logged with them.'
              : `Checked: ${verification.problems.join('; ')}`}
        </p>
      )}
    </div>
  );
}
