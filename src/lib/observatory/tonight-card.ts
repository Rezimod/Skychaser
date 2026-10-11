import type { TonightCard } from '@/components/skychaser/observatory/ObservatoryConsole';
import { getDb } from '@/lib/db';
import { getNode } from '@/lib/observatory/nodes';
import { isRarity } from '@/lib/rarity';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { tonightView } from '@/lib/skychaser/night';

/** What the observatory points at first: the decided card, else the one leading the vote, else the highest; and the node's cloud. */
export async function observatoryTonight(): Promise<{ tonight: TonightCard; nodeCloud: number | null }> {
  const node = getNode('tbilisi-01')!;
  let tonight: TonightCard = null;
  let nodeCloud: number | null = null;
  const db = getDb();
  if (!db) return { tonight, nodeCloud };
  try {
    const view = await tonightView(db, node, new Date());
    nodeCloud = view.decided?.cloudForecast ?? null;
    const lead =
      view.decided?.designation ??
      view.voting.candidates.reduce<(typeof view.voting.candidates)[number] | null>((best, c) => (!best || c.votes > best.votes ? c : best), null)?.designation;
    const card = lead ? SET_001_CARD_BY_DESIGNATION.get(lead) : undefined;
    if (card?.seed.targetId && isRarity(card.seed.rarity))
      tonight = { designation: card.seed.designation, name: card.seed.name, targetId: card.seed.targetId, rarity: card.seed.rarity };
  } catch (err) {
    console.error('[skychaser] cannot read tonight for the observatory', err);
  }
  return { tonight, nodeCloud };
}
