import type { Metadata } from 'next';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserTabBar from '@/components/skychaser/SkychaserTabBar';
import ObservatoryConsole from '@/components/skychaser/observatory/ObservatoryConsole';
import { observatoryTonight } from '@/lib/observatory/tonight-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Observatory · Skychaser',
  description: 'The observatory console: connect, calibrate, choose a target, point and capture with Live Telescope V1.',
};

/** The observatory console, shown live (owner's decision, 2026-10-10). Quick start points it at tonight's card. */
export default async function ObservatoryPage() {
  const { tonight, nodeCloud } = await observatoryTonight();
  return (
    <SkychaserShell bare>
      <ObservatoryConsole tonight={tonight} nodeCloud={nodeCloud} />
      <SkychaserTabBar />
    </SkychaserShell>
  );
}
