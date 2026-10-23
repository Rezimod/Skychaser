import type { Metadata } from 'next';
import InviteClient from '@/components/skychaser/InviteClient';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import { inviteCodes } from '@/lib/invite';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invitations — Skychaser',
  description: 'Every holder has an invitation link. Skychaser is in a closed beta; entry is by invitation.',
  robots: { index: false },
};

/** The door, and for a holder, their invitations. */
export default function InvitePage() {
  return (
    <SkychaserShell title="Invitations">
      <SkychaserView step="invite" />
      <section className="sd-container sd-top">
        <InviteClient gated={inviteCodes().length > 0} />
      </section>
    </SkychaserShell>
  );
}
