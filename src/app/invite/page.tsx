import type { Metadata } from 'next';
import SkychaserShell from '@/components/skychaser/SkychaserShell';

export const metadata: Metadata = {
  title: 'Skychaser — closed beta',
  description: 'Skychaser is in a closed beta. Entry is by invitation.',
  robots: { index: false },
};

export default function InvitePage() {
  return (
    <SkychaserShell title="Closed beta">
      <section className="sd-container sd-top">
        <div className="sd-gate">
          <p className="sd-eyebrow">Closed beta</p>
          <p className="sd-lede">Skychaser opens through an invitation link. If you hold one, open it on this device.</p>
        </div>
      </section>
    </SkychaserShell>
  );
}
