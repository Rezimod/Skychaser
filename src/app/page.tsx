import type { Metadata } from 'next';
import localFont from 'next/font/local';
import EditorialHome, { type FeatureCard, type GridCard, type NightStep, type TierRow } from '@/components/skychaser/home/EditorialHome';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import { getNode } from '@/lib/observatory/nodes';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { SET_001_CARDS } from '@/lib/sets/set-001';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { perkFor, SESSION_MINUTES } from '@/lib/skychaser/perks';
import { formatOdds, TIERS } from '@/lib/skychaser/tiers';
import '@/styles/skychaser-editorial.css';

// Archivo, the family the Skychaser wordmark is drawn in, over its width axis:
// the headlines are set expanded and light. Latin subset from Google Fonts (OFL).
const archivo = localFont({
  src: './fonts/archivo-latin.woff2',
  weight: '100 900',
  variable: '--font-archivo',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

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
    line: c.record.line,
    type: cap(c.seed.objectType),
    editions: c.seed.editionSize,
    perk: perkFor(designation, rarity),
    price: `$${cardPriceUsd(designation, rarity)}`,
  };
}

/** The shelf: six cards across the set, each lit in the colour its art is printed in, with one field note. */
const FEATURE: { d: string; word: string; note: string; rgb: [number, number, number] }[] = [
  { d: 'SATURN', word: 'Saturn', note: 'Ice as small as sand, as big as houses.', rgb: [134, 104, 68] },
  { d: 'ORION', word: 'Orion', note: 'Seven bright stars, one hunter, seen from everywhere on Earth.', rgb: [44, 52, 120] },
  { d: 'M31', word: 'Andromeda', note: 'Its light set out 2.5 million years ago.', rgb: [70, 52, 116] },
  { d: 'BETELGEUSE', word: 'Betelgeuse', note: 'Large enough to reach past the orbit of Mars.', rgb: [130, 36, 30] },
  { d: 'JUPITER', word: 'Jupiter', note: 'A storm wider than Earth, turning for centuries.', rgb: [142, 94, 56] },
  { d: 'CANYON-DIABLO', word: 'Diablo', note: 'Comes with a real piece of the meteorite.', rgb: [70, 74, 82] },
];

/** The nine cards in the open case. */
const GRID = ['ORION', 'SATURN', 'M31', 'BETELGEUSE', 'CANYON-DIABLO', 'M42', 'HORSEHEAD', 'JUPITER', 'M51'];

/** One night at the telescope, in minutes after it opens (20:00 Tbilisi; it works until 02:00). */
const NIGHT: { at: number; title: string; text: string; d: string }[] = [
  { at: 0, title: 'The dome opens.', text: 'Holders have voted. Tonight’s target: Orion.', d: 'ORION' },
  { at: 30, title: 'Saturn, high in the south.', text: 'Epic holders take the first 30-minute sessions.', d: 'SATURN' },
  { at: 120, title: 'Orion clears the ridge.', text: 'Rare holders join as visitors and watch the frames land.', d: 'M42' },
  { at: 210, title: '120-second exposures.', text: 'The camera stacks the nebula, frame by frame.', d: 'M42' },
  { at: 290, title: 'Jupiter, up in the east.', text: 'The last sessions of the night, at the sharpest seeing.', d: 'JUPITER' },
  { at: 345, title: 'The dome closes.', text: 'Every holder of tonight’s card gets the image.', d: 'ORION' },
];

export default function HomePage() {
  const node = getNode('tbilisi-01')!;
  const hours = node.availability!;

  const feature: FeatureCard[] = FEATURE.map((f) => {
    const c = facts(f.d);
    return {
      designation: f.d,
      name: c.name,
      word: f.word,
      no: c.no,
      rarity: c.rarity,
      type: c.type,
      perk: c.perk.short,
      editions: c.editions,
      price: c.price,
      note: f.note,
      rgb: f.rgb,
    };
  });
  const grid: GridCard[] = GRID.map((d) => {
    const c = facts(d);
    return { designation: d, name: c.name, rarity: c.rarity, no: c.no, line: c.line, perk: `${c.perk.line}${c.perk.soon ? ' From first light.' : ''}` };
  });
  const night: NightStep[] = NIGHT.map((n) => {
    const c = facts(n.d);
    return { at: n.at, title: n.title, text: n.text, designation: n.d, card: `${c.name} · No. ${c.no}`, perk: `${RARITY_NAME[c.rarity]} · ${c.perk.short}` };
  });
  const tiers: TierRow[] = TIERS.map((t) => ({
    name: t.name,
    price: `$${t.priceUsd}`,
    odds: RARITIES.map((r) => ({ rarity: r, label: RARITY_NAME[r], pct: formatOdds(t.oddsBps[r]), bps: t.oddsBps[r] })),
  }));

  return (
    <SkychaserShell bare>
      <SkychaserView step="landing" />
      <EditorialHome
        fontClass={archivo.variable}
        setSize={SET_001_CARDS.length}
        fromPrice={`$${FROM_USD}`}
        feature={feature}
        grid={grid}
        night={night}
        nightFrom={hours.fromHourLocal}
        nightTo={hours.toHourLocal}
        tiers={tiers}
        scope={{
          site: node.site,
          optics: node.instrument.optics.replace(/^Celestron /, ''),
          aperture: node.instrument.apertureMm,
          minutes: SESSION_MINUTES,
        }}
      />
    </SkychaserShell>
  );
}
