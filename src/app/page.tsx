import type { Metadata } from 'next';
import localFont from 'next/font/local';
import EditorialHome, { type FeatureCard, type GridCard, type NightStep, type TierRow } from '@/components/skychaser/home/EditorialHome';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import { getNode } from '@/lib/observatory/nodes';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { SET_001_CARDS } from '@/lib/sets/set-001';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { nightSky } from '@/lib/skychaser/night-sky';
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
  { d: 'SATURN', word: 'Saturn', note: 'Ice as small as sand, as big as houses.', rgb: [150, 108, 52] },
  { d: 'ORION', word: 'Orion', note: 'Seven bright stars, one hunter, seen from everywhere on Earth.', rgb: [40, 56, 150] },
  { d: 'M31', word: 'Andromeda', note: 'Its light set out 2.5 million years ago.', rgb: [78, 52, 140] },
  { d: 'BETELGEUSE', word: 'Betelgeuse', note: 'Large enough to reach past the orbit of Mars.', rgb: [150, 40, 28] },
  { d: 'JUPITER', word: 'Jupiter', note: 'A storm wider than Earth, turning for centuries.', rgb: [156, 96, 50] },
  { d: 'CANYON-DIABLO', word: 'Diablo', note: 'Comes with a real piece of the meteorite.', rgb: [88, 84, 80] },
];

/** The nine cards in the open case. */
const GRID = ['ORION', 'SATURN', 'M31', 'BETELGEUSE', 'CANYON-DIABLO', 'M42', 'HORSEHEAD', 'JUPITER', 'M51'];

/**
 * One night on the roof, in minutes after 20:00 Tbilisi time (the telescope works until 02:00),
 * on 14 November 2026. Every position and time below is that night's real sky, computed with
 * astronomy-engine: the crescent Moon sets at 21:27, Saturn crosses the meridian at 22:00,
 * Andromeda passes nearly overhead, the Orion Nebula rises after 21:00, Jupiter and Mars rise together at 00:25.
 */
const NIGHT_START = new Date(Date.UTC(2026, 10, 14, 16));
const NIGHT: { at: number; title: string; text: string; d: string; aim: string }[] = [
  { at: 0, title: 'Set up on the roof.', text: 'A thin crescent Moon, low in the south-west. It sets at 21:27.', d: 'MOON', aim: 'Moon' },
  { at: 30, title: 'Saturn, climbing south.', text: `It is highest at 22:00. Epic holders take the first ${SESSION_MINUTES}-minute sessions.`, d: 'SATURN', aim: 'Saturn' },
  { at: 100, title: 'Andromeda, nearly overhead.', text: 'A galaxy 2.5 million light years away, almost straight up.', d: 'M31', aim: 'M31' },
  { at: 180, title: 'Orion clears the rooftops.', text: 'Holders voted for its nebula. Clear of the roofs, it is high enough to start.', d: 'M42', aim: 'M42' },
  { at: 240, title: '120-second exposures.', text: 'The camera stacks the nebula frame by frame. Rare holders drawn for a seat watch live.', d: 'M42', aim: 'M42' },
  { at: 300, title: 'Jupiter and Mars rise together.', text: 'Just over a degree apart, low in the east.', d: 'JUPITER', aim: 'Jupiter' },
  { at: 330, title: 'The night’s picture.', text: 'Every holder of the Orion Nebula card gets the stacked image.', d: 'M42', aim: 'M42' },
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
    return { at: n.at, aim: n.aim, title: n.title, text: n.text, designation: n.d, card: `${c.name} · No. ${c.no}`, perk: `${RARITY_NAME[c.rarity]} · ${c.perk.short}` };
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
        sky={nightSky(NIGHT_START, node.lat, node.lon)}
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
