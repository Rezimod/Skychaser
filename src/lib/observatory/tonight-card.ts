import type { TonightCard } from '@/components/skychaser/observatory/ObservatoryConsole';
import { getDb } from '@/lib/db';
import { getNode } from '@/lib/observatory/nodes';
import { isRarity } from '@/lib/rarity';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { tonightView } from '@/lib/skychaser/night';

/** What the demo observes: Saturn, the one object the demo draws as a backyard telescope sees it (owner, 2026-10-12). */
export const DEMO_DESIGNATION = 'SATURN';

/** What the observatory points at first — the demo's object — and the node's cloud forecast when the night has one. */
export async function observatoryTonight(): Promise<{ tonight: TonightCard; nodeCloud: number | null }> {
  const node = getNode('tbilisi-01')!;
  const card = SET_001_CARD_BY_DESIGNATION.get(DEMO_DESIGNATION);
  const tonight: TonightCard =
    card?.seed.targetId && isRarity(card.seed.rarity) ? { designation: card.seed.designation, name: card.seed.name, targetId: card.seed.targetId, rarity: card.seed.rarity } : null;
  let nodeCloud: number | null = null;
  const db = getDb();
  if (!db) return { tonight, nodeCloud };
  try {
    const view = await tonightView(db, node, new Date());
    nodeCloud = view.decided?.cloudForecast ?? null;
  } catch (err) {
    console.error('[skychaser] cannot read tonight for the observatory', err);
  }
  return { tonight, nodeCloud };
}
