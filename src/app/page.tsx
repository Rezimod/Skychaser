import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import EditorialHome, { type FeatureCard, type GridCard, type TierRow } from '@/components/skychaser/home/EditorialHome';
import CardFront from '@/components/skychaser/card/CardFront';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import { getNode } from '@/lib/observatory/nodes';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { SET_001_CARDS } from '@/lib/sets/set-001';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { perkFor, SESSION_MINUTES } from '@/lib/skychaser/perks';
import { plateFor } from '@/lib/skychaser/plate';
import { formatOdds, TIERS } from '@/lib/skychaser/tiers';
import '@/components/skychaser/card/skychaser-card.css';
import '@/styles/skychaser-editorial.css';

const FROM_USD = Math.min(...TIERS.map((t) => t.priceUsd));

export const metadata: Metadata = {
  title: 'Skychaser — Collect the cosmos',
  description: `${SET_001_CARDS.length} numbered cards of real objects in the night sky, sealed in capsules from $${FROM_USD}.`,
};

const NUMBER = new Map(SET_001_CARDS.map((c, i) => [c.seed.designation, i + 1]));
const CARD = new Map(SET_001_CARDS.map((c) => [c.seed.designation, c]));
const RARITY_NAME: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function facts(designation: string) {
  const c = CARD.get(designation);
  const no = NUMBER.get(designation);
  if (!c || !no) throw new Error(`Home: ${designation} is not in Genesis`);
  const rarity = c.seed.rarity as Rarity;
  return {
    no,
    name: c.seed.name,
    rarity,
    type: cap(c.seed.objectType),
    editions: c.seed.editionSize,
    perk: perkFor(designation, rarity),
    price: `$${cardPriceUsd(designation, rarity)}`,
  };
}

/**
 * The card face the shop draws, rendered here on the server so the set's data
 * never ships to the browser: the home shows the same card as every other page.
 */
function face(designation: string, opts: { small?: boolean; priority?: boolean } = {}): ReactNode {
  const plate = plateFor(designation);
  if (!plate) throw new Error(`Home: ${designation} has no card face`);
  return <CardFront plate={plate} small={opts.small} priority={opts.priority} u="" />;
}

/** The shelf: six cards across the set, each lit in the colour its art is printed in, with one field note. */
const FEATURE: { d: string; note: string; rgb: [number, number, number] }[] = [
  { d: 'SATURN', note: 'Ice as small as sand, as big as houses.', rgb: [134, 104, 68] },
  { d: 'M42', note: 'A star nursery 1,344 light-years away.', rgb: [120, 40, 70] },
  { d: 'M31', note: 'Its light set out 2.5 million years ago.', rgb: [58, 44, 96] },
  { d: 'BETELGEUSE', note: 'Large enough to reach past the orbit of Mars.', rgb: [120, 32, 28] },
  { d: 'JUPITER', note: 'A storm wider than Earth, turning for centuries.', rgb: [142, 94, 56] },
  { d: 'CANYON-DIABLO', note: 'Comes with a real piece of the meteorite.', rgb: [62, 66, 72] },
];

/** The nine cards in the open case. */
const GRID = ['ORION', 'SATURN', 'M31', 'BETELGEUSE', 'CANYON-DIABLO', 'M42', 'HORSEHEAD', 'JUPITER', 'M51'];

/** The fan in the hero: the spotlight card in front, one either side. */
const FAN = { left: 'SATURN', front: 'M42', right: 'CANYON-DIABLO' };

export default function HomePage() {
  const node = getNode('tbilisi-01')!;
  const hours = node.availability!;
  const clock = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

  const feature: FeatureCard[] = FEATURE.map((f) => {
    const c = facts(f.d);
    return {
      designation: f.d,
      name: c.name,
      no: c.no,
      rarity: c.rarity,
      type: c.type,
      perk: c.perk.short,
      editions: c.editions,
      price: c.price,
      note: f.note,
      rgb: f.rgb,
      face: face(f.d),
    };
  });
  const grid: GridCard[] = GRID.map((d) => {
    const c = facts(d);
    return { designation: d, name: c.name, rarity: c.rarity, face: face(d, { small: true }) };
  });
  const tiers: TierRow[] = TIERS.map((t) => ({
    name: t.name,
    price: `$${t.priceUsd}`,
    odds: RARITIES.map((r) => ({ rarity: r, label: RARITY_NAME[r], pct: formatOdds(t.oddsBps[r]), bps: t.oddsBps[r] })),
  }));
  const editions = SET_001_CARDS.reduce((n, c) => n + c.seed.editionSize, 0);
  const legendary = SET_001_CARDS.filter((c) => c.seed.rarity === 'legendary').reduce((n, c) => n + c.seed.editionSize, 0);
  const spot = facts(FAN.front);

  return (
    <SkychaserShell>
      <SkychaserView step="landing" />
      <EditorialHome
        setSize={SET_001_CARDS.length}
        editions={editions}
        legendary={legendary}
        fromPrice={`$${FROM_USD}`}
        fan={{
          left: face(FAN.left, { small: true, priority: true }),
          front: face(FAN.front, { priority: true }),
          right: face(FAN.right, { small: true, priority: true }),
        }}
        spotlight={{ designation: FAN.front, name: spot.name, no: spot.no, rarity: RARITY_NAME[spot.rarity], perk: spot.perk.short, photo: '/home/m42-photo-640.webp' }}
        feature={feature}
        grid={grid}
        tiers={tiers}
        scope={{
          site: node.site,
          optics: node.instrument.optics.replace(/^Celestron /, ''),
          aperture: node.instrument.apertureMm,
          minutes: SESSION_MINUTES,
          from: clock(hours.fromHourLocal),
          to: clock(hours.toHourLocal),
        }}
      />
    </SkychaserShell>
  );
}
