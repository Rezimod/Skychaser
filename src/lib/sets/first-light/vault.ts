/**
 * The Telescopes and the Treasures: the two shelves added after the Roadster
 * (Nos. 108–124), so every card before them keeps its number.
 *
 * The Telescopes are instruments from the Astroman shop, from a first
 * travel refractor to a computerised Schmidt-Cassegrain. The Treasures are
 * metals and stones, from bronze to diamond, several with a line to the sky:
 * moonstone, a glass thrown out by an asteroid strike, metals forged in dying
 * stars. Neither is a thing to point at: both are kept cards, drawn from
 * capsules like any other, each tier's perk as the perks say.
 */

import { authorKept, type AuthoredCard } from '../build';

const INSTRUMENT = 'An instrument, not a target: it points at the sky; the Live Telescope has nothing to point at.';
const TREASURE = 'A treasure, not a target: it sits in the vault, not the sky; the Live Telescope has nothing to point at.';

export const TELESCOPE_CARDS: AuthoredCard[] = [
  authorKept(
    {
      designation: 'FORESEEN-70', name: 'Foreseen 70', objectType: 'travel refractor', rarity: 'common',
      catalogRef: 'Astroman · 400/70',
      blurb: 'A first telescope, small enough for a backpack.',
    },
    INSTRUMENT,
    {
      family: 'instruments',
      stats: [['APERTURE', '70 mm'], ['FOCAL LENGTH', '400 mm'], ['TYPE', 'Refractor']],
      line: 'A first telescope, small enough for a backpack.',
      story: ['Its lens gathers a hundred times the light of your eye.', 'Enough for the Moon’s craters and Saturn’s rings.'],
      glow: '#cfe3ff',
    },
  ),
  authorKept(
    {
      designation: 'BRESSER-VENUS', name: 'Bresser Venus', objectType: 'Newtonian reflector', rarity: 'common',
      catalogRef: 'Astroman · 76/700',
      blurb: 'A mirror instead of a lens, as Newton built his.',
    },
    INSTRUMENT,
    {
      family: 'instruments',
      stats: [['APERTURE', '76 mm'], ['FOCAL LENGTH', '700 mm'], ['TYPE', 'Reflector']],
      line: 'A mirror instead of a lens, as Newton built his.',
      story: ['Newton made the first reflecting telescope in 1668.', 'A curved mirror gathers the light; a flat one turns it to your eye.'],
      glow: '#e9eef6',
    },
  ),
  authorKept(
    {
      designation: 'NATGEO-90', name: 'National Geographic 90', objectType: 'refractor on EQ3', rarity: 'rare',
      catalogRef: 'Astroman · 90/900',
      blurb: 'Nine hundred millimetres of tube, on a mount that follows the stars.',
    },
    INSTRUMENT,
    {
      family: 'instruments',
      stats: [['APERTURE', '90 mm'], ['FOCAL LENGTH', '900 mm'], ['MOUNT', 'Equatorial']],
      line: 'Nine hundred millimetres of tube, on a mount that follows the stars.',
      story: ['An equatorial mount turns on an axis set parallel to the Earth’s.', 'One slow turn of one knob keeps a planet in view.'],
      glow: '#ffd27a',
    },
  ),
  authorKept(
    {
      designation: 'ASTROMASTER-114', name: 'AstroMaster 114', objectType: 'Newtonian on EQ', rarity: 'rare',
      catalogRef: 'Astroman · 114/1000',
      blurb: 'A metre of focal length, folded into a short white tube.',
    },
    INSTRUMENT,
    {
      family: 'instruments',
      stats: [['APERTURE', '114 mm'], ['FOCAL LENGTH', '1000 mm'], ['MOUNT', 'Equatorial']],
      line: 'A metre of focal length, folded into a short white tube.',
      story: ['Its mirror gathers over 260 times the light of your eye.', 'Enough to find galaxies on a dark night.'],
      glow: '#a9c9ff',
    },
  ),
  authorKept(
    {
      designation: 'NEXSTAR-90', name: 'NexStar 90SLT', objectType: 'computerised Maksutov', rarity: 'rare',
      catalogRef: 'Astroman · Celestron',
      blurb: 'Tell it a name, and it turns to find it.',
    },
    INSTRUMENT,
    {
      family: 'instruments',
      stats: [['APERTURE', '90 mm'], ['FOCAL LENGTH', '1250 mm'], ['MOUNT', 'GoTo']],
      line: 'Tell it a name, and it turns to find it.',
      story: ['A curved lens and mirrors fold 1.25 m of light path into a short tube.', 'Its hand control holds a catalogue of four thousand objects.'],
      glow: '#ff9a5a',
    },
  ),
  authorKept(
    {
      designation: 'NEXSTAR-6', name: 'NexStar 6SLT', objectType: 'Schmidt-Cassegrain', rarity: 'epic',
      catalogRef: 'Astroman · Celestron',
      blurb: 'Six inches of aperture that find their own way across the sky.',
    },
    INSTRUMENT,
    {
      family: 'instruments',
      stats: [['APERTURE', '150 mm'], ['FOCAL LENGTH', '1500 mm'], ['MOUNT', 'GoTo']],
      line: 'Six inches of aperture that find their own way across the sky.',
      story: ['It gathers about 460 times the light of your eye.', 'Saturn’s Cassini gap and Jupiter’s cloud belts, sharp.'],
      glow: '#8fb8ff',
    },
  ),
];

export const TREASURE_CARDS: AuthoredCard[] = [
  authorKept(
    {
      designation: 'BRONZE-MIRROR', name: 'Bronze Mirror', objectType: 'Han dynasty bronze', rarity: 'common',
      catalogRef: 'China, 206 BC–AD 220',
      blurb: 'Polished bronze, cast with a star on the back.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['METAL', 'Bronze'], ['MADE OF', 'Copper + tin'], ['AGE', '~2,000 yr']],
      line: 'Polished bronze, cast with a star on the back.',
      story: ['Its face was polished bright enough to see yourself in.', 'The Han cast stars and the four directions on their backs.'],
      glow: '#e0a060',
    },
  ),
  authorKept(
    {
      designation: 'MOUNTAIN-CRYSTAL', name: 'Mountain Crystal', objectType: 'rock crystal', rarity: 'common',
      catalogRef: 'Quartz, SiO₂',
      blurb: 'Clear quartz, once thought to be ice that never melts.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['MINERAL', 'Quartz'], ['HARDNESS', '7 Mohs'], ['CRYSTAL', 'Six-sided']],
      line: 'Clear quartz, once thought to be ice that never melts.',
      story: ['The Greek krystallos meant ice.', 'Its quartz keeps the time in almost every watch.'],
      glow: '#dff2ff',
    },
  ),
  authorKept(
    {
      designation: 'MOONSTONE', name: 'Moonstone', objectType: 'feldspar gem', rarity: 'rare',
      catalogRef: 'Orthoclase and albite',
      blurb: 'Light scatters between thin layers inside it, like moonlight on water.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['MINERAL', 'Feldspar'], ['HARDNESS', '6–6.5 Mohs'], ['GLOW', 'Adularescence']],
      line: 'Light scatters between thin layers inside it, like moonlight on water.',
      story: ['Its blue sheen moves as you turn it.', 'The Romans thought it was moonlight, turned to stone.'],
      glow: '#9fc4ff',
    },
  ),
  authorKept(
    {
      designation: 'SILVER-BAR', name: 'Silver Bar', objectType: 'fine silver', rarity: 'rare',
      catalogRef: '999 fine',
      blurb: 'Every atom of it was forged inside a star.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['METAL', 'Silver'], ['DENSITY', '10.5 g/cm³'], ['MELTS', '962 °C']],
      line: 'Every atom of it was forged inside a star.',
      story: ['Of all metals, it carries electricity and heat best.', 'Before aluminium, every good mirror was backed with it.'],
      glow: '#e6ecf4',
    },
  ),
  authorKept(
    {
      designation: 'AMETHYST', name: 'Amethyst', objectType: 'violet quartz', rarity: 'rare',
      catalogRef: 'Anahí Mine, Bolivia',
      blurb: 'Quartz turned violet by iron and a little natural radiation.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['MINERAL', 'Quartz'], ['HARDNESS', '7 Mohs'], ['COLOUR', 'Iron + radiation']],
      line: 'Quartz turned violet by iron and a little natural radiation.',
      story: ['Its Greek name means not drunk.', 'Heated, it turns yellow, and is sold as citrine.'],
      glow: '#b98cff',
    },
  ),
  authorKept(
    {
      designation: 'RUBY', name: 'Ruby', objectType: 'red corundum', rarity: 'rare',
      catalogRef: 'Al₂O₃ + chromium',
      blurb: 'A trace of chromium turns colourless corundum red.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['MINERAL', 'Corundum'], ['HARDNESS', '9 Mohs'], ['COLOUR', 'Chromium']],
      line: 'A trace of chromium turns colourless corundum red.',
      story: ['The first laser, in 1960, was a rod of ruby.', 'Under ultraviolet light it glows red of its own.'],
      glow: '#ff4d6d',
    },
  ),
  authorKept(
    {
      designation: 'SAPPHIRE', name: 'Sapphire', objectType: 'blue corundum', rarity: 'rare',
      catalogRef: 'Al₂O₃ + iron, titanium',
      blurb: 'The same mineral as ruby, turned blue by iron and titanium.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['MINERAL', 'Corundum'], ['HARDNESS', '9 Mohs'], ['COLOUR', 'Iron + titanium']],
      line: 'The same mineral as ruby, turned blue by iron and titanium.',
      story: ['Only diamond is harder.', 'Watch glass and phone camera covers are made of it.'],
      glow: '#4f7dff',
    },
  ),
  authorKept(
    {
      designation: 'MOLDAVITE', name: 'Moldavite', objectType: 'impact glass', rarity: 'rare',
      catalogRef: 'Ries impact, ~14.8 Myr',
      blurb: 'Green glass thrown across Europe when an asteroid struck Bavaria.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['TYPE', 'Tektite'], ['AGE', '~14.8 Myr'], ['SOURCE', 'Ries crater']],
      line: 'Green glass thrown across Europe when an asteroid struck Bavaria.',
      story: ['Melted rock flew up to 450 km and cooled in flight.', 'It is found mostly in the Czech Republic.'],
      glow: '#8fe36b',
    },
  ),
  authorKept(
    {
      designation: 'EMERALD', name: 'Emerald', objectType: 'green beryl', rarity: 'epic',
      catalogRef: 'Zambia',
      blurb: 'Beryl turned green by chromium and vanadium.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['MINERAL', 'Beryl'], ['HARDNESS', '7.5–8 Mohs'], ['COLOUR', 'Chromium']],
      line: 'Beryl turned green by chromium and vanadium.',
      story: ['Almost every emerald carries tiny flaws, called its garden.', 'Cleopatra kept mines of them in Egypt.'],
      glow: '#2fe39a',
    },
  ),
  authorKept(
    {
      designation: 'GOLD-NUGGET', name: 'Gold Nugget', objectType: 'native gold', rarity: 'epic',
      catalogRef: 'Placer gold',
      blurb: 'Much of the universe’s gold was made when neutron stars collided.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['METAL', 'Gold'], ['DENSITY', '19.3 g/cm³'], ['MELTS', '1,064 °C']],
      line: 'Much of the universe’s gold was made when neutron stars collided.',
      story: ['In 2017 telescopes watched one such collision make gold.', 'All the gold ever mined would fit in a cube 22 m wide.'],
      glow: '#ffc94a',
    },
  ),
  authorKept(
    {
      designation: 'DIAMOND', name: 'Diamond', objectType: 'crystal carbon', rarity: 'epic',
      catalogRef: 'Round brilliant',
      blurb: 'Carbon, pressed into crystal far below the ground.',
    },
    TREASURE,
    {
      family: 'treasures',
      stats: [['ELEMENT', 'Carbon'], ['HARDNESS', '10 Mohs'], ['FORMED', '150+ km deep']],
      line: 'Carbon, pressed into crystal far below the ground.',
      story: ['The hardest natural material known.', 'A dead star 50 light-years away has a core of crystal carbon.'],
      glow: '#e8f6ff',
    },
  ),
];
