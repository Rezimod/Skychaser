/**
 * First Light.
 *
 * A hundred and five cards in seven families, numbered outward from Earth: the Solar
 * System (from the observatory's own first frame and two fragments held in
 * the hand, out to a visitor from another star), the Stars, the Deep Sky, the
 * Galaxies and the Extremes are real things, every one of them well known;
 * the Rare Sights are what the sky does now and then — eclipses, aurorae,
 * great comets; the Almanac is real dated events, each sold until its event
 * ends, then sealed. The first twenty-four are written here; the rest by
 * family in ./first-light/.
 *
 * Rarity is a decision made here and stored; it has nothing to do with whether
 * Live Telescope V1 can photograph the object — that is judged from the instrument and
 * the site (see build.ts). Fixed positions are J2000, from the node's own
 * catalogue (sky-field.ts) where it has the object. Lunar positions are the
 * IAU gazetteer's. Sizes for resolution are the object's real extent at a
 * typical distance.
 */

import { arcsecFromKm, arcsecFromKmAtAu, MOON_DISTANCE_KM } from '@/lib/skychaser/observability';
import { authorAlmanac, authorCard, authorKept, type AuthoredCard } from './build';
import { DEEP_CARDS } from './first-light/deep';
import { EXTREME_CARDS } from './first-light/extremes';
import { FAMOUS_CARDS } from './first-light/famous';
import { GALAXY_CARDS } from './first-light/galaxies';
import { NEAR_CARDS } from './first-light/near';
import { NO_POSITION, OFF_MOON, body, deepSky } from './first-light/shared';
import { STAR_CARDS } from './first-light/stars';

export const SET_001 = {
  code: 'SET001',
  name: 'Genesis',
  status: 'draft',
  releasedAt: null,
} as const;

const m45 = deepSky('m45');
const m42 = deepSky('m42');
const m1 = deepSky('m1');
const m31 = deepSky('m31');

const SPECIMEN = 'A specimen. It sits in a case, not in the sky; the Live Telescope has nothing to point at.';

const FIRST_24: AuthoredCard[] = [
  // The Objects, outward from Earth.
  authorKept(
    {
      designation: 'FIRST-LIGHT', name: 'First Light', objectType: 'first frame', rarity: 'common',
      catalogRef: 'Live Telescope · 000001',
      blurb: 'The observatory’s opening picture, kept for good.',
    },
    'Whatever the Live Telescope points at first. Decided on the first clear night, not by vote.',
    { stats: [['OBSERVATION', '000001'], ['BY', 'Live Telescope'], ['DATE', 'First clear night']], line: 'The observatory’s opening picture, kept for good.' },
  ),
  authorKept(
    {
      designation: 'IMILAC', name: 'Imilac', objectType: 'pallasite meteorite', rarity: 'legendary',
      catalogRef: 'Atacama, 1822',
      blurb: 'A pallasite: metal and crystal from deep inside an asteroid.',
    },
    SPECIMEN,
    { stats: [['TYPE', 'Pallasite'], ['FOUND', '1822'], ['SPECIMEN', '4.6 g']], line: 'A pallasite: metal and crystal from deep inside an asteroid.', physical: true },
  ),
  authorKept(
    {
      designation: 'LUNAR-FRAGMENT', name: 'Moon Rock', objectType: 'lunar meteorite', rarity: 'legendary',
      catalogRef: 'Fallen to Earth',
      blurb: 'Found in a desert, matched to Apollo samples by its chemistry.',
    },
    SPECIMEN,
    { stats: [['TYPE', 'Lunar meteorite'], ['ORIGIN', 'The Moon'], ['SPECIMEN', '8.5 g']], line: 'Found in a desert, matched to Apollo samples by its chemistry.', pairsWith: 'TYCHO', physical: true },
  ),
  authorCard(
    {
      designation: 'TYCHO', name: 'Tycho', objectType: 'lunar crater', rarity: 'rare',
      targetId: 'moon', catalogRef: 'IAU gazetteer',
      raHours: null, decDeg: null, surfaceLat: -43.31, surfaceLon: -11.36,
      blurb: 'Surveyor 7 landed beside its rim in 1968.',
    },
    body(arcsecFromKm(86, MOON_DISTANCE_KM)),
    { stats: [['DIAMETER', '85 km'], ['AGE', '~108 Myr'], ['DEPTH', '4.8 km']], line: 'Surveyor 7 landed beside its rim in 1968.', pairsWith: 'LUNAR-FRAGMENT' },
  ),
  authorCard(
    {
      designation: 'OLYMPUS-MONS', name: 'Olympus Mons', objectType: 'volcano on Mars', rarity: 'common',
      targetId: 'mars', catalogRef: 'IAU gazetteer', ...NO_POSITION,
      blurb: 'Its slopes are so gentle you could walk to the top.',
    },
    body(arcsecFromKmAtAu(600, 0.6)),
    { stats: [['HEIGHT', '~22 km'], ['WIDTH', '~600 km'], ['TYPE', 'Shield volcano']], line: 'Its slopes are so gentle you could walk to the top.' },
  ),
  authorCard(
    {
      designation: 'JUPITER', name: 'Jupiter', objectType: 'planet', rarity: 'epic',
      targetId: 'jupiter', catalogRef: 'JPL Horizons 599', ...NO_POSITION,
      blurb: 'The largest planet, and the brightest of winter evenings.',
    },
    body(arcsecFromKmAtAu(142_984, 4.2)),
    { stats: [['DIAMETER', '142,984 km'], ['DAY', '9 h 56 m'], ['OPPOSITION', '11 Feb 2027']], line: 'The largest planet, and the brightest of winter evenings.', pairsWith: 'DOUBLE-OPPOSITION' },
  ),
  authorCard(
    {
      designation: 'EUROPA', name: 'Europa', objectType: 'moon of Jupiter', rarity: 'common',
      targetId: 'jupiter', catalogRef: 'JPL Horizons 502', ...NO_POSITION,
      blurb: 'A spacecraft called Clipper is on its way there.',
    },
    body(arcsecFromKmAtAu(3_122, 4.2)),
    { stats: [['DIAMETER', '3,122 km'], ['ORBIT', '3.55 days'], ['OCEAN', 'Beneath the ice']], line: 'A spacecraft called Clipper is on its way there.' },
  ),
  authorCard(
    {
      designation: 'SATURN', name: 'The Rings of Saturn', objectType: 'ring system', rarity: 'epic',
      targetId: 'saturn', catalogRef: 'JPL Horizons 699', ...NO_POSITION,
      blurb: 'Its rings are wide as worlds, thin as a building.',
    },
    body(arcsecFromKmAtAu(282_000, 8.5)),
    { stats: [['OPPOSITION', '4 Oct 2026'], ['RINGS', '~282,000 km'], ['THICKNESS', '~10 m']], line: 'Its rings are wide as worlds, thin as a building.' },
  ),
  authorCard(
    {
      designation: 'HALLEY', name: 'Halley', objectType: 'comet', rarity: 'common',
      targetId: 'halley', catalogRef: '1P/Halley', ...NO_POSITION,
      blurb: 'Its logbook stays open until it returns.',
    },
    // Near aphelion: far, dark and small.
    body(null, 25),
    { stats: [['PERIOD', '76 years'], ['NUCLEUS', '15 × 8 km'], ['RETURNS', '2061']], line: 'Its logbook stays open until it returns.', pairsWith: 'ORIONIDS' },
  ),
  authorKept(
    {
      designation: 'VOYAGER-1', name: 'Voyager 1', objectType: 'spacecraft', rarity: 'common',
      catalogRef: 'NASA 1977-084A',
      blurb: 'It carries a golden record of music and greetings.',
    },
    'Beyond any telescope: a few metres of metal, 170 AU out.',
    { stats: [['LAUNCHED', '5 Sep 1977'], ['DISTANCE', '~170 AU'], ['SPEED', '~17 km/s']], line: 'It carries a golden record of music and greetings.' },
  ),
  authorCard(
    {
      designation: 'M45', name: 'The Pleiades', objectType: 'star cluster', rarity: 'rare',
      targetId: 'm45', catalogRef: 'M45 (Seven Sisters)',
      raHours: m45.raHours, decDeg: m45.decDeg, ...OFF_MOON,
      blurb: 'They drift through a dust cloud that is not their own.',
    },
    m45.optics,
    { stats: [['DISTANCE', '444 ly'], ['AGE', '~100 Myr'], ['MAGNITUDE', '1.6']], line: 'They drift through a dust cloud that is not their own.', pairsWith: 'PLEIADES-OCCULTATION', family: 'deep' },
  ),
  authorCard(
    {
      designation: 'M42', name: 'Orion Nebula', objectType: 'nebula', rarity: 'rare',
      targetId: 'm42', catalogRef: 'M42 (NGC 1976)',
      raHours: m42.raHours, decDeg: m42.decDeg, ...OFF_MOON,
      blurb: 'Its glow covers more sky than the full Moon.',
    },
    m42.optics,
    { stats: [['DISTANCE', '1,344 ly'], ['SIZE', '24 ly'], ['MAGNITUDE', '4.0']], line: 'Its glow covers more sky than the full Moon.', family: 'deep' },
  ),
  authorCard(
    {
      designation: 'M1', name: 'The Crab', objectType: 'supernova remnant', rarity: 'common',
      targetId: 'm1', catalogRef: 'M1 (NGC 1952)',
      raHours: m1.raHours, decDeg: m1.decDeg, ...OFF_MOON,
      blurb: 'Lord Rosse named it in 1844, after his own drawing.',
    },
    m1.optics,
    { stats: [['DISTANCE', '~6,500 ly'], ['SEEN', '1054'], ['PULSAR', '30 turns/s']], line: 'Lord Rosse named it in 1844, after his own drawing.', family: 'deep' },
  ),
  authorCard(
    {
      designation: 'SGR-A', name: 'Sagittarius A*', objectType: 'black hole', rarity: 'common',
      targetId: 'sgr-a', catalogRef: 'EHT 2022',
      // 17h 45m 40s, −29° 00′ 28″.
      raHours: 17.7611, decDeg: -29.0078, ...OFF_MOON,
      blurb: '26,000 light-years away, behind thick dust.',
    },
    { resolveArcsec: null, magnitude: null, sizeArcmin: null },
    { stats: [['MASS', '4.3M M☉'], ['DISTANCE', '26,000 ly'], ['IMAGED', '2022']], line: '26,000 light-years away, behind thick dust.', family: 'extremes' },
  ),
  authorCard(
    {
      designation: 'M31', name: 'Andromeda', objectType: 'galaxy', rarity: 'common',
      targetId: 'm31', catalogRef: 'M31 (NGC 224)',
      raHours: m31.raHours, decDeg: m31.decDeg, ...OFF_MOON,
      blurb: 'Its light set out 2.5 million years ago.',
    },
    m31.optics,
    { stats: [['DISTANCE', '2.5 Mly'], ['STARS', '~1 trillion'], ['MAGNITUDE', '3.4']], line: 'Its light set out 2.5 million years ago.', family: 'galaxies' },
  ),

  // The Almanac, in the order the sky does them. Sealed at the end of each window.
  authorAlmanac(
    {
      designation: 'ORIONIDS', name: 'The Orionids', objectType: 'meteor shower', rarity: 'rare',
      catalogRef: 'IAU MDC 8 ORI',
      blurb: "They seem to fly out of Orion’s club.",
    },
    { start: '2026-10-21T00:00:00Z', end: '2026-10-23T00:00:00Z' },
    { stats: [['PEAK', '21–22 Oct 2026'], ['RATE', '~20/hr'], ['PARENT', '1P/Halley']], line: "They seem to fly out of Orion’s club.", pairsWith: 'HALLEY' },
  ),
  authorAlmanac(
    {
      designation: 'HUNTERS-MOON', name: 'Hunter’s Moon', objectType: 'full moon', rarity: 'rare',
      catalogRef: 'Full, 26 Oct 2026',
      blurb: 'It follows the Harvest Moon, a month later.',
    },
    { start: '2026-10-25T12:00:00Z', end: '2026-10-27T00:00:00Z' },
    { stats: [['DATE', '26 Oct 2026'], ['PHASE', 'Full'], ['LIGHT', '100%']], line: 'It follows the Harvest Moon, a month later.' },
  ),
  authorAlmanac(
    {
      designation: 'PLEIADES-OCCULTATION', name: 'The Moon Takes the Pleiades', objectType: 'occultation', rarity: 'rare',
      catalogRef: '24 Nov 2026',
      blurb: 'The Moon has no air, so each star goes out at once.',
    },
    { start: '2026-11-24T00:00:00Z', end: '2026-11-25T12:00:00Z' },
    { stats: [['DATE', '24 Nov 2026'], ['EVENT', 'Occultation'], ['TARGET', 'M45']], line: 'The Moon has no air, so each star goes out at once.', pairsWith: 'M45' },
  ),
  authorAlmanac(
    {
      designation: 'GEMINIDS', name: 'The Geminids', objectType: 'meteor shower', rarity: 'rare',
      catalogRef: 'IAU MDC 4 GEM',
      blurb: "Their parent is 3200 Phaethon, a rock that acts like a comet.",
    },
    { start: '2026-12-13T00:00:00Z', end: '2026-12-15T12:00:00Z' },
    { stats: [['PEAK', '13–14 Dec 2026'], ['RATE', 'up to 120/hr'], ['MOON', 'Sets early']], line: "Their parent is 3200 Phaethon, a rock that acts like a comet." },
  ),
  authorAlmanac(
    {
      designation: 'CHRISTMAS-SUPERMOON', name: 'Christmas Eve Supermoon', objectType: 'supermoon', rarity: 'rare',
      catalogRef: 'Perigee, 24 Dec 2026',
      blurb: "The tides run a little higher while it is near.",
    },
    { start: '2026-12-24T00:00:00Z', end: '2026-12-25T12:00:00Z' },
    { stats: [['DATE', '24 Dec 2026'], ['SIZE', '+14%'], ['LIGHT', '+30%']], line: "The tides run a little higher while it is near." },
  ),
  authorAlmanac(
    {
      designation: 'DOUBLE-OPPOSITION', name: 'The Double Opposition', objectType: 'opposition', rarity: 'rare',
      catalogRef: 'Feb 2027',
      blurb: 'Both rise at sunset and stay up all night.',
    },
    { start: '2027-02-11T00:00:00Z', end: '2027-02-20T12:00:00Z' },
    { stats: [['JUPITER', '11 Feb 2027'], ['MARS', '19 Feb 2027'], ['NEXT MARS', '2029']], line: 'Both rise at sunset and stay up all night.', pairsWith: 'JUPITER' },
  ),
  authorAlmanac(
    {
      designation: 'SNOW-MOON-ECLIPSE', name: 'The Snow Moon Eclipse', objectType: 'lunar eclipse', rarity: 'rare',
      catalogRef: 'Penumbral, 20 Feb 2027',
      blurb: "Named for the deepest month of winter.",
    },
    { start: '2027-02-20T00:00:00Z', end: '2027-02-21T12:00:00Z' },
    { stats: [['DATE', '20 Feb 2027'], ['ECLIPSE', 'Penumbral'], ['MOON', 'Full']], line: "Named for the deepest month of winter." },
  ),
  authorAlmanac(
    {
      designation: 'GREAT-ECLIPSE', name: 'The Great Eclipse', objectType: 'solar eclipse', rarity: 'common',
      catalogRef: 'Total, 2 Aug 2027',
      blurb: 'Luxor gets the longest totality on land until 2114.',
    },
    { start: '2027-08-02T00:00:00Z', end: '2027-08-03T00:00:00Z' },
    { stats: [['DATE', '2 Aug 2027'], ['TOTALITY', '6+ min'], ['PATH', 'Spain to Arabia']], line: 'Luxor gets the longest totality on land until 2114.' },
    'A daytime event at the Sun. The Live Telescope does not point at the Sun; this card records the day.',
  ),
];

/** Five more stones that fell from the sky, each card carrying a real piece of it. */
const SPECIMENS: AuthoredCard[] = [
  authorKept(
    {
      designation: 'CANYON-DIABLO', name: 'Canyon Diablo', objectType: 'iron meteorite', rarity: 'legendary',
      catalogRef: 'Meteor Crater, Arizona',
      blurb: 'The iron that dug Meteor Crater, 1.2 km across.',
    },
    SPECIMEN,
    { stats: [['TYPE', 'Iron, IAB'], ['FELL', '~50,000 yr ago'], ['SPECIMEN', '81 g']], line: 'The iron that dug Meteor Crater, 1.2 km across.', physical: true },
  ),
  authorKept(
    {
      designation: 'GIBEON', name: 'Gibeon', objectType: 'iron meteorite', rarity: 'legendary',
      catalogRef: 'Namibia',
      blurb: 'Etched with acid, its metal shows crystals grown over millions of years.',
    },
    SPECIMEN,
    { stats: [['TYPE', 'Iron, IVA'], ['FOUND', 'Namibia'], ['SPECIMEN', '7.7 g']], line: 'Etched with acid, its metal shows crystals grown over millions of years.', physical: true },
  ),
  authorKept(
    {
      designation: 'CAMPO-DEL-CIELO', name: 'Campo del Cielo', objectType: 'iron meteorite', rarity: 'legendary',
      catalogRef: 'Chaco, Argentina',
      blurb: 'A shower of iron that left a field of craters in Argentina.',
    },
    SPECIMEN,
    { stats: [['TYPE', 'Iron, IAB'], ['FELL', '4,000+ yr ago'], ['SPECIMEN', '15 g']], line: 'A shower of iron that left a field of craters in Argentina.', physical: true },
  ),
  authorKept(
    {
      designation: 'MUONIONALUSTA', name: 'Muonionalusta', objectType: 'iron meteorite', rarity: 'legendary',
      catalogRef: 'Norrbotten, Sweden, 1906',
      blurb: 'Among the oldest iron ever found, 4.565 billion years old.',
    },
    SPECIMEN,
    { stats: [['TYPE', 'Iron, IVA'], ['FOUND', '1906'], ['SPECIMEN', '46 g']], line: 'Among the oldest iron ever found, 4.565 billion years old.', physical: true },
  ),
  authorKept(
    {
      designation: 'ALLENDE', name: 'Allende', objectType: 'carbonaceous chondrite', rarity: 'legendary',
      catalogRef: 'Chihuahua, Mexico, 1969',
      blurb: 'Its white flecks are the oldest solids in the Solar System.',
    },
    SPECIMEN,
    { stats: [['TYPE', 'CV3 chondrite'], ['FELL', '8 Feb 1969'], ['SPECIMEN', '1.5 g']], line: 'Its white flecks are the oldest solids in the Solar System.', physical: true },
  ),
];

/** The set's order: each family outward from Earth, then the Rare Sights, then the Specimens, then the Almanac by date. */
const ORDER = [
  // The Solar System
  'FIRST-LIGHT', 'IMILAC', 'LUNAR-FRAGMENT', 'EARTH', 'EARTHRISE', 'CHICXULUB', 'TUNGUSKA', 'SPUTNIK-1', 'ISS', 'HUBBLE', 'JWST',
  'MOON', 'APOLLO-11', 'TYCHO', 'SUN', 'MERCURY', 'VENUS', 'MARS', 'OLYMPUS-MONS', 'VALLES-MARINERIS',
  'JUPITER', 'IO', 'EUROPA', 'GANYMEDE', 'SL9', 'SATURN', 'TITAN', 'ENCELADUS', 'URANUS', 'NEPTUNE', 'PLUTO', 'HALLEY',
  'OUMUAMUA', 'VOYAGER-1',
  // The Stars
  'BIG-DIPPER', 'ORION', 'SOUTHERN-CROSS', 'SUMMER-TRIANGLE',
  'ALPHA-CEN', 'SIRIUS', 'VEGA', 'ARCTURUS', 'ALDEBARAN', 'POLARIS', 'MIRA', 'BETELGEUSE', 'ANTARES', 'RIGEL',
  'ETA-CARINAE', 'TRAPPIST-1',
  // The Deep Sky
  'M45', 'M44', 'HELIX', 'M57', 'CATS-EYE', 'M42', 'HORSEHEAD', 'ROSETTE', 'VEIL', 'M8', 'M20', 'M16', 'M1',
  'CARINA', 'OMEGA-CEN', 'M13', 'TARANTULA',
  // The Galaxies
  'MILKY-WAY', 'LMC', 'SMC', 'M31', 'M33', 'M82', 'CEN-A', 'M101', 'M51', 'M104', 'M87', 'CARTWHEEL',
  // The Extremes
  'SGR-A', 'SN-1987A', 'TON-618', 'HUBBLE-DEEP-FIELD', 'CMB',
  // The Rare Sights
  'TOTAL-ECLIPSE', 'RING-OF-FIRE', 'BLOOD-MOON', 'AURORA', 'VENUS-TRANSIT', 'HALE-BOPP', 'LEONIDS', 'PERSEIDS',
  // The Specimens, after the first ninety-two so every object card keeps its number
  'CANYON-DIABLO', 'GIBEON', 'CAMPO-DEL-CIELO', 'MUONIONALUSTA', 'ALLENDE',
  // The Almanac
  'ORIONIDS', 'HUNTERS-MOON', 'PLEIADES-OCCULTATION', 'GEMINIDS', 'CHRISTMAS-SUPERMOON', 'DOUBLE-OPPOSITION',
  'SNOW-MOON-ECLIPSE', 'GREAT-ECLIPSE',
];

const AUTHORED = new Map(
  [...FIRST_24, ...NEAR_CARDS, ...STAR_CARDS, ...DEEP_CARDS, ...GALAXY_CARDS, ...EXTREME_CARDS, ...FAMOUS_CARDS, ...SPECIMENS].map((c) => [c.seed.designation, c]),
);
if (AUTHORED.size !== ORDER.length || ORDER.some((d) => !AUTHORED.has(d))) {
  throw new Error('First Light: ORDER and the authored cards disagree');
}

export const SET_001_CARDS: AuthoredCard[] = ORDER.map((d) => AUTHORED.get(d)!);

export const SET_001_CARD_BY_DESIGNATION = new Map(SET_001_CARDS.map((c) => [c.seed.designation, c]));
