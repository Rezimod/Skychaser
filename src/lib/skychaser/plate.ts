/**
 * What a First Light card prints: its line of record, three figures, and the
 * line on its back — read off the card's own record. The drawing itself is in
 * public/cards/plate/<DESIGNATION>/, written by scripts/skychaser-plates/build.py.
 */
import { rarityInfo, type Rarity } from '@/lib/rarity';
import type { Family, Section } from '@/lib/sets/build';
import { SET_001_CARDS, SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { posterFor, type Poster } from './poster';

const MOVES = 'RA/DEC · MOVES — COMPUTED FOR THE NIGHT';

/** The name as it runs on the back: "When Live Telescope V1 photographs the Moon". Absent for what the node cannot point at. The later cards carry theirs in their record. */
const NOUN: Record<string, string> = {
  TYCHO: 'Tycho',
  'OLYMPUS-MONS': 'Olympus Mons',
  JUPITER: 'Jupiter',
  EUROPA: 'Europa',
  SATURN: 'Saturn',
  HALLEY: 'Halley',
  M45: 'the Pleiades',
  M42: 'the Orion Nebula',
  M1: 'the Crab',
  'SGR-A': 'Sagittarius A*',
  M31: 'Andromeda',
};

/** Name size where the face sets it by hand. */
const NAME_SIZE: Record<string, number> = { SATURN: 44, 'PLEIADES-OCCULTATION': 30 };

/** Two lines on the back: what this is, said simply, and why it matters. */
const STORY: Record<string, [string, string]> = {
  'FIRST-LIGHT': ['The first frame the Live Telescope will keep.', 'No one knows yet what it will show.'],
  IMILAC: ['A world broke apart before Earth had oceans.', 'Its metal cooled slowly, over millions of years.'],
  'LUNAR-FRAGMENT': ['Only a few hundred stones like it are known.', 'It drifted through space for ages before it fell.'],
  TYCHO: ['Its central peak rises nearly 2 km from the floor.', 'At full Moon you can see it with your own eyes.'],
  'OLYMPUS-MONS': ['Built by lava, layer on layer, over ages.', 'The crater at its top is up to 80 km across.'],
  JUPITER: ['Four of its moons were the first found beyond our own.', 'It gives off more heat than it gets from the Sun.'],
  EUROPA: ['Its ice shell may be tens of kilometres thick.', 'It is a little smaller than our Moon.'],
  SATURN: ['Ice as small as sand, as big as houses.', 'Seen edge on, the rings all but vanish.'],
  HALLEY: ['Recorded at every return since 240 BC.', 'Its dust falls as the Orionids each October.'],
  'VOYAGER-1': ['It passed Jupiter in 1979 and Saturn in 1980.', 'Its radio signal takes nearly a day to reach us.'],
  M45: ['Most eyes count six, not seven.', 'Over a thousand stars belong to it.'],
  M42: ['It is about 1,300 light-years away.', 'Its newborn stars light up the gas around them.'],
  M1: ['The first object in Messier’s catalogue.', 'It glows in every kind of light, from radio to gamma rays.'],
  'SGR-A': ['Stars race around it at thousands of km a second.', 'Its discovery earned the 2020 Nobel Prize.'],
  M31: ['The largest galaxy in our Local Group.', 'It moves toward us at about 110 km a second.'],
  ORIONIDS: ['They peak around 21 October.', 'Some leave glowing trails that linger for seconds.'],
  'HUNTERS-MOON': ['Near the horizon it looks larger, though it is not.', 'Moonlight is sunlight, reflected off grey rock.'],
  'PLEIADES-OCCULTATION': ['The cluster lies 444 light-years behind the Moon.', 'Watch how quickly the Moon moves against the stars.'],
  GEMINIDS: ['They seem to fly out of Gemini.', 'They peak around 14 December.'],
  'CHRISTMAS-SUPERMOON': ['The Moon swings nearest us once a month.', 'It rises at sunset and sets at sunrise.'],
  'DOUBLE-OPPOSITION': ['Opposition puts the Earth between a planet and the Sun.', 'Mars looks red, Jupiter cream-white.'],
  'SNOW-MOON-ECLIPSE': ['A penumbral eclipse: the Moon misses the dark core.', 'It needs no filter and no telescope.'],
  'GREAT-ECLIPSE': ['Along the path, birds roost and the air turns cold.', 'Its shadow races over the ground faster than sound.'],
  'CANYON-DIABLO': ['It struck about fifty thousand years ago.', 'Its lead was used to measure the age of the Earth.'],
  GIBEON: ['The Nama people made tools from its iron.', 'Etched with acid, it shows the Widmanstätten pattern.'],
  'CAMPO-DEL-CIELO': ['It fell four to five thousand years ago.', 'It left a field of small craters in Argentina.'],
  MUONIONALUSTA: ['It fell in northern Sweden about a million years ago.', 'Its crystals show it cooled inside a small world.'],
  ALLENDE: ['More than two tonnes of stones fell over Chihuahua.', 'Its white inclusions are the oldest solids known.'],
};

export type Plate = {
  designation: string;
  name: string;
  rarity: Rarity;
  rname: string;
  glyph: string;
  /** Place in the set, two digits (three past ninety-nine). */
  num: string;
  /** Cards in the set. */
  total: number;
  des: string;
  /** Under the name on the face: what it is and where. */
  kicker: string;
  data: [string, string][];
  story: [string, string];
  /** Edition count, padded to three digits. */
  of: string;
  nameSize: number;
  back: string;
  noun: string | null;
  /** Whether Live Telescope V1 can point at it at all. */
  observable: boolean;
  /** A daytime event at the Sun, which the telescope never points at. */
  solar: boolean;
  section: Section;
  family: Family;
  /** The directory holding sky.svg, object.svg and survey.svg. */
  art: string;
  /** What the poster face says: title, the line under it, quote, headline. */
  poster: Poster;
  /** The panel's three figures, value first. */
  figures: [string, string][];
};

const pad3 = (n: number) => String(n).padStart(3, '0');

/** Events at the Sun: a filterless telescope never points at it. */
const SOLAR = new Set(['TOTAL-ECLIPSE', 'RING-OF-FIRE', 'VENUS-TRANSIT', 'GREAT-ECLIPSE']);

/** "RA 00H 42M 44S · DEC +41° 16′ 09″" */
function position(ra: number, dec: number) {
  const s = Math.round(ra * 3600);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const a = Math.round(Math.abs(dec) * 3600);
  const d = Math.floor(a / 3600), dm = Math.floor((a % 3600) / 60), ds = a % 60;
  const two = (v: number) => String(v).padStart(2, '0');
  return `RA ${two(h)}H ${two(m)}M ${two(sec)}S · DEC ${dec < 0 ? '−' : '+'}${two(d)}° ${two(dm)}′ ${two(ds)}″`;
}

/** "LAT 43.31° S · LON 11.36° W" */
function lunar(lat: number, lon: number) {
  return `LAT ${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'} · LON ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;
}

export function plateFor(designation: string): Plate | null {
  const card = SET_001_CARD_BY_DESIGNATION.get(designation);
  if (!card) return null;
  const { seed, record } = card;
  const rarity = seed.rarity as Rarity;
  const info = rarityInfo(rarity);
  const poster = posterFor(designation, seed.name, record.line);
  const back =
    record.section === 'almanac'
      ? `${record.eventStartUtc!.slice(0, 10)} · ${record.eventEndUtc!.slice(0, 10)} UTC`
      : seed.raHours != null && seed.decDeg != null
        ? position(seed.raHours, seed.decDeg)
        : seed.surfaceLat != null && seed.surfaceLon != null
          ? lunar(seed.surfaceLat, seed.surfaceLon)
          : NOUN[designation] ?? record.noun
            ? MOVES
            : seed.catalogRef.toUpperCase();
  return {
    designation,
    name: seed.name,
    rarity,
    rname: info.label,
    glyph: info.glyph,
    num: String(SET_001_CARDS.indexOf(card) + 1).padStart(2, '0'),
    total: SET_001_CARDS.length,
    des: `${designation} · ${seed.objectType} · ${seed.catalogRef}`.toUpperCase(),
    kicker: `${seed.objectType} · ${seed.catalogRef}`.toUpperCase(),
    data: record.stats.map(([label, value]) => [label, value.toUpperCase()]),
    story: STORY[designation] ?? record.story ?? [seed.blurb, ''],
    of: pad3(seed.editionSize),
    nameSize: NAME_SIZE[designation] ?? Math.min(60, Math.floor(400 / (seed.name.length * 0.56))),
    back,
    noun: NOUN[designation] ?? record.noun,
    observable: seed.observationStatus !== 'not_available',
    solar: SOLAR.has(designation),
    section: record.section,
    family: record.family,
    art: `/cards/plate/${designation}`,
    poster,
    figures: poster.figures ?? record.stats.map(([label, value]) => [value.toUpperCase(), label]),
  };
}

/** Each object's own light, for the glow a tile sits on. Where an object has none — a crater, a stone — the family's stands in. */
const GLOW: Record<string, string> = {
  'FIRST-LIGHT': '#e8e2d4', IMILAC: '#d9b26f', 'LUNAR-FRAGMENT': '#c9d6ff',
  'CANYON-DIABLO': '#c98a6a', GIBEON: '#dfe6f0', 'CAMPO-DEL-CIELO': '#c8ccd4', MUONIONALUSTA: '#e8d6d0', ALLENDE: '#b9b2a6', TYCHO: '#bacbff', 'OLYMPUS-MONS': '#ff9a63',
  JUPITER: '#ffbd8a', EUROPA: '#d8ecff', SATURN: '#ffe3a3', HALLEY: '#7fc8ff', 'VOYAGER-1': '#bfc8d8',
  M45: '#6fb6ff', M42: '#ff9ec7', M1: '#9fd0ff', 'SGR-A': '#ff8a2a', M31: '#b8c6ff',
  ORIONIDS: '#9fcaff', 'HUNTERS-MOON': '#ffd79a', 'PLEIADES-OCCULTATION': '#c9d6ff', GEMINIDS: '#a9c4ff',
  'CHRISTMAS-SUPERMOON': '#fff1cf', 'DOUBLE-OPPOSITION': '#ffb070', 'SNOW-MOON-ECLIPSE': '#d6c2ff', 'GREAT-ECLIPSE': '#ffe9b8',
};
/** The glow, turned toward the poster's sunset: a blue light has its red and blue swapped, so it burns orange instead. */
function warm(hex: string) {
  const r = hex.slice(1, 3), g = hex.slice(3, 5), b = hex.slice(5, 7);
  return parseInt(b, 16) > parseInt(r, 16) ? `#${b}${g}${r}` : hex;
}
export const glowFor = (designation: string) =>
  warm(GLOW[designation] ?? SET_001_CARD_BY_DESIGNATION.get(designation)?.record.glow ?? '#ffd8bc');

export const editionLabel = (n: number | null | undefined) => (n == null ? '—' : pad3(n));
