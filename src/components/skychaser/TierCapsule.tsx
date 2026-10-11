import type { Tier } from '@/lib/skychaser/tiers';

/**
 * The sealed capsule: a return capsule lit from behind in the colour of the
 * class being opened. Keyed on the tier, so choosing another one brings it in again.
 */
export default function TierCapsule({ tier }: { tier: Tier }) {
  return (
    <span key={tier.key} className="sd-tier__capsule" aria-hidden="true">
      <span className="sd-tier__glow" />
      <img className="sd-tier__pod" src="/cards/capsule.webp?v=1" alt="" width={695} height={720} decoding="async" />
    </span>
  );
}
