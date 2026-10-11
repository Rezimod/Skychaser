'use client';

import { useEffect } from 'react';
import { track } from '@/lib/track';

export type SkychaserStep = 'landing' | 'set' | 'card' | 'capsules' | 'capsule' | 'collection' | 'tonight';

/** One funnel step, counted once per page view. */
export default function SkychaserView({ step }: { step: SkychaserStep }) {
  useEffect(() => {
    track('stellar_view', { step });
  }, [step]);
  return null;
}
