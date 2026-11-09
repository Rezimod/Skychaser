import type { Metadata } from 'next';
import localFont from 'next/font/local';
import EditorialHome, { type FeatureCard, type GridCard, type NightStep, type TierRow } from '@/components/skychaser/home/EditorialHome';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import { getNode } from '@/lib/observatory/nodes';
import type { Rarity } from '@/lib/rarity';
import { SET_001_CARDS } from '@/lib/sets/set-001';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { perkFor, SESSION_MINUTES } from '@/lib/skychaser/perks';
import { formatOdds, TIERS } from '@/lib/skychaser/tiers';
import '@/styles/skychaser-editorial.css';

// The same Geist file the layout loads, declared over its full weight axis:
// the editorial headlines are set at 800 and 900, and the layout stops at 700.
const geistDisplay = localFont({
  src: './fonts/geist-latin.woff2',
  weight: '100 900',
  variable: '--font-geist-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Skychaser — The universe, collected.',
  description: `Stellar by Skychaser: ${SET_001_CARDS.length} collectible cards of real objects in the night sky. Sealed capsules from $${Math.min(...TIERS.map((t) => t.priceUsd))}.`,
};

const NUMBER = new Map(SET_001_CARDS.map((c, i) => [c.seed.designation, i + 1]));
const CARD = new Map(SET_001_CARDS.map((c) => [c.seed.designation, c]));

const RARITY_NAME: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function facts(designation: string) {
  const c = CARD.get(designation);
  const no = NUMBER.get(designation);
  if (!c || !no) throw new Error(`Home: ${designation} is not in Genesis`);
  const rarity = c.seed.rarity as Rarity;
  return {
    designation,
    no,
    name: c.seed.name,
    rarity: RARITY_NAME[rarity],
    rarityKey: rarity,
    type: c.seed.objectType,
    line: c.record.line,
    perk: perkFor(designation, rarity),
    priceUsd: cardPriceUsd(designation, rarity),
  };
}

/** S2: six cards across the set, each with the colour its art is printed in and one field note. */
const FEATURE: {
  d: string;
  word: string;
  note: string;
  rgb: [number, number, number];
}[] = [
  {
    d: 'SATURN',
    word: 'Saturn',
    note: 'Ice as small as sand, as big as houses.',
    rgb: [134, 104, 68],
  },
  {
    d: 'ORION',
    word: 'Orion',
    note: 'Seven bright stars, one hunter — seen from everywhere on Earth.',
    rgb: [30, 35, 84],
  },
  {
    d: 'M31',
    word: 'Andromeda',
    note: '2.5 million light-years away, and still visible to the naked eye.',
    rgb: [58, 44, 96],
  },
  {
    d: 'BETELGEUSE',
    word: 'Betelgeuse',
    note: 'A star so large it would reach past the orbit of Mars.',
    rgb: [120, 32, 28],
  },
  {
    d: 'JUPITER',
    word: 'Jupiter',
    note: 'A storm wider than Earth, still turning after centuries.',
    rgb: [142, 94, 56],
  },
  {
    d: 'CANYON-DIABLO',
    word: 'Diablo',
    note: 'Iron from the asteroid that dug Meteor Crater, 50,000 years ago.',
    rgb: [62, 66, 72],
  },
];

/** S4: the nine cards in the open case, read left to right, top to bottom. */
const GRID = ['ORION', 'SATURN', 'M31', 'BETELGEUSE', 'CANYON-DIABLO', 'M42', 'HORSEHEAD', 'JUPITER', 'M51'];

/**
 * S3: one night at Live Telescope V1, in minutes after 20:00 Tbilisi time. The
 * telescope works from dusk until two (getNode availability), so the clock does too.
 */
const NIGHT: { at: number; title: string; text: string; d: string }[] = [
  {
    at: 0,
    title: 'The night begins.',
    text: 'Holders have voted. Tonight’s target: Orion.',
    d: 'ORION',
  },
  {
    at: 30,
    title: 'Saturn, high in the south.',
    text: 'Epic holders take the first 30-minute sessions.',
    d: 'SATURN',
  },
  {
    at: 120,
    title: 'Orion clears the rooftops.',
    text: 'Rare holders join as visitors and watch the frames land.',
    d: 'M42',
  },
  {
    at: 210,
    title: '120-second exposures.',
    text: 'The camera stacks the nebula, frame by frame.',
    d: 'M42',
  },
  {
    at: 290,
    title: 'Jupiter, up in the east.',
    text: 'The last sessions of the night, at the sharpest seeing.',
    d: 'JUPITER',
  },
  {
    at: 345,
    title: 'The telescope comes in.',
    text: 'Every holder of tonight’s card gets the image.',
    d: 'ORION',
  },
];

export default function HomePage() {
  const node = getNode('tbilisi-01')!;
  const { fromHourLocal, toHourLocal } = node.availability!;

  const feature: FeatureCard[] = FEATURE.map((f) => {
    const c = facts(f.d);
    return {
      designation: c.designation,
      word: f.word,
      no: c.no,
      rarity: c.rarity,
      type: cap(c.type),
      perk: c.perk.short,
      price: `$${c.priceUsd}`,
      note: f.note,
      rgb: f.rgb,
    };
  });

  const grid: GridCard[] = GRID.map((d) => {
    const c = facts(d);
    return {
      designation: d,
      name: c.name,
      rarity: c.rarity,
      rarityKey: c.rarityKey,
      no: c.no,
      line: c.line,
      perk: `${c.perk.line}${c.perk.soon ? ' From first light.' : ''}`,
    };
  });

  const night: NightStep[] = NIGHT.map((n) => {
    const c = facts(n.d);
    return {
      at: n.at,
      title: n.title,
      text: n.text,
      designation: n.d,
      card: `${c.name} · No. ${c.no}`,
      perk: `${c.rarity} · ${c.perk.short}`,
    };
  });

  const tiers: TierRow[] = TIERS.map((t) => ({
    name: t.name,
    price: `$${t.priceUsd}`,
    odds: {
      common: formatOdds(t.oddsBps.common),
      rare: formatOdds(t.oddsBps.rare),
      epic: formatOdds(t.oddsBps.epic),
      legendary: formatOdds(t.oddsBps.legendary),
    },
  }));

  return (
    <SkychaserShell bare>
      <SkychaserView step="landing" />
      <EditorialHome
        fontClass={geistDisplay.variable}
        setSize={SET_001_CARDS.length}
        fromPrice={`$${Math.min(...TIERS.map((t) => t.priceUsd))}`}
        feature={feature}
        grid={grid}
        night={night}
        nightFrom={fromHourLocal}
        nightTo={toHourLocal}
        tiers={tiers}
        scope={{
          site: node.site,
          optics: node.instrument.optics.replace(/^Celestron /, ''),
          minutes: SESSION_MINUTES,
        }}
      />
    </SkychaserShell>
  );
}
