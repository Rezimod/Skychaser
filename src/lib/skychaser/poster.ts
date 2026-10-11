/**
 * What the poster face of a First Light card says, beyond its record: the title
 * as it runs in the striped letters (a line break where it splits), the line
 * spaced out beneath it, the quote across the top of the sky, and the headline
 * and the line under it in the panel below.
 */

export type Poster = {
  title: string;
  epithet: string;
  quote: string | null;
  headline: string;
  sub: string;
  /** Three figures for the panel, where the poster prints its own instead of the record's: value, then label. */
  figures?: [[string, string], [string, string], [string, string]];
};

type Row = [title: string, epithet: string, quote: string | null, headline: string, sub: string];

const ROWS: Record<string, Row> = {
  EARTH: ['EARTH', 'The pale blue dot', 'Everyone you know lives on that point.', 'Less than a pixel', 'Seen by Voyager 1 from six billion kilometres away'],
  EARTHRISE: ['EARTHRISE', 'Christmas Eve, 1968', 'We came to explore the Moon, and found the Earth.', 'Taken in a hurry', 'Anders grabbed colour film as it came over the horizon'],
  CHICXULUB: ['DINOSAUR\nASTEROID', 'The end of an age', 'Sixty-six million years ago, the sky fell.', 'A city-sized rock', 'Mammals inherited the world it emptied'],
  TUNGUSKA: ['TUNGUSKA', 'The Siberian blast', 'Eighty million trees fell, and no one knew why.', 'An explosion in the air', 'No crater was ever found'],
  'SPUTNIK-1': ['SPUTNIK 1', 'The first beep', 'A small metal ball began the Space Age.', 'One orbit every 96 minutes', 'Its radio signal was picked up everywhere in 1957'],
  ISS: ['SPACE\nSTATION', 'A home in orbit', 'Look up at dusk: people are passing over you.', 'Crewed every day since 2000', 'Its crew sees sixteen sunrises in twenty-four hours'],
  HUBBLE: ['HUBBLE', 'The eye above the air', 'It showed us what the universe really looks like.', 'Thirty-six years in orbit', 'Its blurred mirror was fixed by astronauts in 1993'],
  JWST: ['JAMES WEBB', 'The golden eye', 'It looks back to the first galaxies ever made.', 'Eighteen mirrors, one view', 'It sees heat, through the dust that hides newborn stars'],
  MOON: ['THE MOON', 'Our companion', 'The same face, turned toward us for four billion years.', 'Born from a collision', 'It moves 3.8 centimetres farther from us every year'],
  'APOLLO-11': ['APOLLO 11', 'One small step', 'Their footprints are still there.', 'Two men, one flag', 'Twenty-one hours on another world, July 1969'],
  SL9: ['SHOEMAKER\nLEVY 9', 'The comet that hit Jupiter', 'For a week in 1994, we watched worlds collide.', 'Twenty-one impacts', 'Its largest scar was wider than the Earth'],
  TITAN: ['TITAN', 'The moon with weather', 'Here it rains, and the rivers run with methane.', 'Air thicker than ours', 'The only place besides Earth with lakes on its surface'],
  'BIG-DIPPER': ['BIG DIPPER', 'The great bear’s tail', 'Follow the pointers to the North Star.', 'Seven stars, one shape', 'The first pattern most people ever learn'],
  ORION: ['ORION', 'The hunter', 'Every culture saw someone in these stars.', 'Red shoulder, blue foot', 'His belt points down to Sirius'],
  'SOUTHERN-CROSS': ['SOUTHERN\nCROSS', 'Crux', 'Sailors steered home by these four stars.', 'The smallest constellation', 'It flies on the flags of five nations'],
  'SUMMER-TRIANGLE': ['SUMMER\nTRIANGLE', 'Lyre, swan and eagle', 'Vega, Deneb and Altair, high after dark.', 'Not a constellation at all', 'The Milky Way runs straight through its middle'],
  'TOTAL-ECLIPSE': ['TOTAL\nECLIPSE', 'Night at noon', 'For a few minutes, the Sun goes out.', 'A perfect fit in the sky', 'Only then can you see the corona with your own eyes'],
  'RING-OF-FIRE': ['RING OF FIRE', 'The annular eclipse', 'The Sun becomes a bright gold halo.', 'The Moon too far away', 'Never look without a proper solar filter'],
  'BLOOD-MOON': ['BLOOD MOON', 'Total lunar eclipse', 'It turns the colour of rust.', 'Safe to watch by eye', 'Lit by every sunset on Earth at the same moment'],
  AURORA: ['AURORA', 'The northern lights', 'The Sun’s wind, glowing in our sky.', 'Curtains a hundred km up', 'Green from oxygen, red higher up, violet from nitrogen'],
  'VENUS-TRANSIT': ['TRANSIT OF\nVENUS', 'Rarer than any comet', 'The next one comes in December 2117.', 'A black dot on the Sun', 'Captain Cook sailed to Tahiti in 1769 to time one'],
  'HALE-BOPP': ['HALE-BOPP', 'The great comet', 'In 1997, the whole world looked up.', 'Bright for eighteen months', 'It will not return for about two and a half thousand years'],
  LEONIDS: ['LEONID STORM', 'The lion’s shower', 'In 1833, the sky fell like snow.', 'Thousands a minute', 'Every thirty-three years, they can storm again'],
  PERSEIDS: ['PERSEIDS', 'Tears of St Lawrence', 'Lie back on a warm night and count them.', 'A hundred an hour', 'Dust from Comet Swift–Tuttle, burning at 59 km a second'],
  'FIRST-LIGHT': ['FIRST\nLIGHT', 'The shutter opens', 'Whatever the sky gives, you hold.', 'Frame number one', 'One night, one exposure, one image for every holder'],
  IMILAC: ['IMILAC', 'Heart of a broken world', 'Found in the driest desert on Earth, 1822.', 'Green crystal set in iron', 'As old as the Solar System'],
  'LUNAR-FRAGMENT': ['MOON ROCK', 'Thrown across the dark', 'An impact up there. A landing down here.', 'It crossed 384,400 km', 'It left the Moon faster than 2.4 km a second'],
  TYCHO: ['TYCHO', 'The bright scar', 'One strike, and the Moon wore rays forever.', 'Eighty-five kilometres wide', 'Struck 108 million years ago, still the brightest mark'],
  SUN: ['THE SUN', 'The star we live beside', 'Its light takes eight minutes to reach you.', 'Halfway through its life', 'Four million tonnes of itself burned every second'],
  MERCURY: ['MERCURY', 'The scorched messenger', 'A year shorter than its own day.', 'The smallest planet', 'From 430 °C at noon to −180 °C by night'],
  VENUS: ['VENUS', 'Under a lid of cloud', 'The evening star is hot enough to melt lead.', 'A day longer than its year', 'Its sky rains acid that never reaches the ground'],
  MARS: ['MARS', 'The red frontier', 'Once it had rivers and a sky that held rain.', 'A day nearly ours', 'The next world people will stand on'],
  'OLYMPUS-MONS': ['OLYMPUS\nMONS', 'The tallest mountain known', 'Two and a half Everests high, as wide as Arizona.', 'A volcano gone quiet', 'Its summit rises above most of the Martian air'],
  'VALLES-MARINERIS': ['VALLES\nMARINERIS', 'The great rift of Mars', 'Laid across America, it would reach coast to coast.', 'Seven kilometres deep', 'Morning fog still pools along its floor'],
  JUPITER: ['JUPITER', 'King of the planets', 'A thousand Earths would fit inside.', 'A day of ten hours', 'Its great red spot, watched since 1831'],
  IO: ['IO', 'The burning moon', 'Squeezed by Jupiter, it never cools.', 'Four hundred volcanoes', 'Fountains of sulfur rise hundreds of kilometres'],
  EUROPA: ['EUROPA', 'The cracked moon', 'Under the ice, twice the water of Earth.', 'Smooth as a cue ball', 'The best place to look for life we have not met'],
  GANYMEDE: ['GANYMEDE', 'The giant moon', 'Larger than Mercury, and it circles a planet.', 'Its own magnetic field', 'Beneath its grooves, a buried salt ocean'],
  SATURN: ['SATURN', 'The ringed sentinel', 'Its rings would reach most of the way to the Moon.', 'Lighter than water', 'Over 270 moons, and no ground to stand on'],
  ENCELADUS: ['ENCELADUS', 'The fountain moon', 'The whitest thing in the Solar System.', 'A hidden salt ocean', 'Only 500 kilometres across'],
  URANUS: ['URANUS', 'The sideways giant', 'Something vast once knocked it over.', 'The coldest air of any planet', 'Each pole gets forty-two years of sun'],
  NEPTUNE: ['NEPTUNE', 'Found by arithmetic', 'One year there lasts 165 of ours.', 'The windiest world', 'Its moon Triton orbits backwards'],
  PLUTO: ['PLUTO', 'Beyond the planets', 'Seen close once, for a single afternoon.', 'A heart of frozen nitrogen', 'Smaller than our Moon'],
  HALLEY: ['HALLEY', 'The returning comet', 'It came in 1986. It comes again in 2061.', 'Seen at Hastings, 1066', 'Hold the card, and wait with it'],
  OUMUAMUA: ['ʻOUMUAMUA', 'The first visitor', 'It came from between the stars, and did not stay.', 'A cigar, or a pancake', 'We saw it for eleven weeks, then it was gone'],
  'VOYAGER-1': ['VOYAGER 1', 'The long goodbye', 'Launched in 1977, still calling home.', 'Beyond the Sun’s wind', 'Every year, farther from everyone who ever lived'],
  'ALPHA-CEN': ['ALPHA\nCENTAURI', 'The house next door', 'Their light left home four years ago.', 'Three suns, one neighbour', 'Proxima, the smallest, has a planet'],
  SIRIUS: ['SIRIUS', 'The dog star', 'Its rising once told Egypt the Nile would flood.', 'Brightest in the night', 'Beside it circles the ember of a dead star'],
  VEGA: ['VEGA', 'The harp star', 'In twelve thousand years, the sky will turn around it.', 'The measure of brightness', 'The first star ever photographed, in 1850'],
  ARCTURUS: ['ARCTURUS', 'The bear watcher', 'Follow the Dipper’s handle and arc to it.', 'An old star passing through', 'Twenty-five Suns wide, and moving fast'],
  ALDEBARAN: ['ALDEBARAN', 'Eye of the bull', 'Pioneer 10 is on its way, two million years out.', 'An orange giant, 65 ly away', 'It sits in front of the Hyades, not among them'],
  POLARIS: ['POLARIS', 'The North Star', 'Every other star wheels; this one waits.', 'Not as bright as you think', 'Sailors crossed oceans by its height'],
  MIRA: ['MIRA', 'The wonderful star', 'Bright one season, gone from the eye the next.', 'A dying red giant', 'Behind it trails a tail thirteen light-years long'],
  BETELGEUSE: ['BETELGEUSE', 'Orion’s red shoulder', 'One day it explodes, bright enough to cast shadows.', 'It would swallow Mars', 'In 2019 it dimmed, and the world watched'],
  ANTARES: ['ANTARES', 'The scorpion’s heart', 'It glows as red as the planet it was named against.', 'A star 680 Suns wide', 'A small blue companion hides in its glare'],
  RIGEL: ['RIGEL', 'Orion’s foot', 'Most nights, the brightest star in Orion.', '120,000 Suns of light', 'It lights a faint blue cloud called the Witch Head'],
  'ETA-CARINAE': ['ETA\nCARINAE', 'The star that would not die', 'In 1843 it became the second-brightest star.', 'A hundred Suns of mass', 'Wrapped in the cloud it threw off'],
  'TRAPPIST-1': ['TRAPPIST-1', 'A crowded system', 'From any one of them, the others hang like moons.', 'Seven Earths, one small sun', 'Three sit where water could stay liquid'],
  M45: ['PLEIADES', 'The seven sisters', 'Named by every people who ever looked up.', 'A hundred million years young', 'A cluster of hot blue stars, 444 light-years out'],
  M44: ['BEEHIVE', 'The swarm in Cancer', 'To the eye, a small cloud. To Galileo, stars.', 'A thousand stars together', 'About 600 light-years away'],
  HELIX: ['HELIX', 'The eye in the sky', 'One of the nearest dying stars to us.', 'A star shedding its skin', 'Its rim is combed with thousands of comet-like knots'],
  M57: ['RING\nNEBULA', 'The smoke ring', 'The Sun will make one of these, in five billion years.', 'A dying star’s last breath', 'At its centre, the small hot core that is left'],
  'CATS-EYE': ['CAT’S EYE', 'Deep in the Dragon', 'Its star shed a shell every fifteen hundred years.', 'Eleven rings of light', 'The first nebula shown to be glowing gas'],
  M42: ['ORION\nNEBULA', 'The sword’s glow', 'A cloud where stars are being made tonight.', 'Four stars at its heart', 'Look below the belt with your own eyes'],
  HORSEHEAD: ['HORSEHEAD', 'The dark rider', 'Dust so thick it blots out the glow behind it.', 'A shadow 3.5 ly tall', 'First noticed on a photographic plate, not by eye'],
  ROSETTE: ['ROSETTE', 'The cosmic rose', 'Young stars at its centre blew the hollow.', '130 light-years across', 'Dark knots in its petals are stars still forming'],
  VEIL: ['THE VEIL', 'Lace in the Swan', 'Six full Moons wide, and still expanding.', 'Threads of a shock wave', 'A star exploded here fifteen thousand years ago'],
  M8: ['LAGOON', 'The pink harbour', 'Visible to the eye from a dark summer field.', '110 light-years wide', 'At its heart, a bright knot called the Hourglass'],
  M20: ['TRIFID', 'Split three ways', 'Red gas, blue light and black dust in one field.', 'Lit from within', 'Its young cluster is only 300,000 years old'],
  M16: ['PILLARS OF\nCREATION', 'Towers of the Eagle', 'Each pillar is taller than the gap to the next star.', 'Stars hatching inside', 'Light from young stars is slowly eating them away'],
  M1: ['CRAB\nNEBULA', 'The guest star', 'In 1054, a star died so bright it shone in daylight.', 'Eleven light-years wide', 'Its dead core still spins 30 times a second'],
  CARINA: ['CARINA', 'Cliffs of creation', 'The brightest nebula in the whole sky.', 'Four times Orion’s size', 'Home to some of the most massive stars known'],
  'OMEGA-CEN': ['OMEGA\nCENTAURI', 'Ten million suns', 'It may be the heart of a galaxy we swallowed.', 'The greatest cluster in our sky', 'Ptolemy listed it as a single star'],
  M13: ['HERCULES', 'The great cluster', 'In 1974 a radio message was aimed at it.', 'Reply due in 50,000 years', 'Three hundred thousand stars in one ball'],
  TARANTULA: ['TARANTULA', 'The spider’s web', 'It lies in another galaxy, and still we see it.', 'The busiest nursery near us', 'Its core holds the most massive star known'],
  'MILKY-WAY': ['MILKY WAY', 'Home, seen from inside', 'The river of light is our galaxy, edge on.', '200 billion suns', 'The Sun has gone round it about twenty times'],
  LMC: ['LARGE\nMAGELLANIC', 'The great cloud', 'Like a torn-off piece of the Milky Way.', '160,000 light-years away', 'Supernova 1987A exploded here'],
  SMC: ['SMALL\nMAGELLANIC', 'The smaller cloud', 'Named for Magellan’s crew, known long before.', 'Seen only from the south', 'The Large Cloud is pulling it apart'],
  M31: ['ANDROMEDA', 'Our nearest big spiral', 'In some five billion years, we may meet.', 'A trillion stars inbound', 'The farthest thing most eyes can see'],
  M33: ['TRIANGULUM', 'The faint neighbour', 'On the darkest nights, the farthest the eye can see.', 'Forty billion stars', 'A loose, young spiral, full of pink nurseries'],
  M82: ['THE CIGAR', 'The galaxy on fire', 'A close pass by M81 set it ablaze with new stars.', 'Stars born ten times faster', 'Winds of red gas pour out above and below'],
  'CEN-A': ['CENTAURUS A', 'The radio giant', 'Its dark band is a spiral it swallowed.', 'Jets a million ly long', 'Powered by a black hole at its core'],
  M101: ['PINWHEEL', 'The wide spiral', 'Almost twice the width of the Milky Way.', 'A galaxy seen face on', 'Stars exploded in it in 2011 and again in 2023'],
  M51: ['WHIRLPOOL', 'The perfect spiral', 'The first galaxy anyone saw as a spiral.', 'Two galaxies, one dance', 'Its arms are lined with pink nurseries'],
  M104: ['SOMBRERO', 'The dark brim', 'We see it almost exactly edge on.', 'Eight hundred billion suns', 'Two thousand clusters orbit its glowing bulge'],
  M87: ['M87', 'The giant of Virgo', 'In 2019 we saw the shadow of its black hole.', 'A jet 5,000 ly long', 'Six and a half billion Suns, hidden in the light'],
  CARTWHEEL: ['CARTWHEEL', 'The ripple', 'A smaller galaxy fell straight through its middle.', 'A ring 150,000 ly wide', 'Its rim is crowded with newborn stars'],
  'SGR-A': ['SAGITTARIUS\nA*', 'The quiet giant', 'Everything in our galaxy turns around it.', 'Four million suns, unseen', 'Its shadow was first imaged in 2022'],
  'SN-1987A': ['SUPERNOVA\n1987A', 'The nearest in 400 years', 'Its ghost particles arrived hours before its light.', 'Seen with the naked eye', 'Its glow now lights a ring of pearls'],
  'TON-618': ['TON 618', 'The colossus', 'Its light set out before the Earth existed.', '40 billion Suns of dark', 'The gas falling in outshines a hundred galaxies'],
  'HUBBLE-DEEP-FIELD': ['DEEP\nFIELD', 'A window to the dawn', 'A speck of sky where nothing seemed to be.', 'Three thousand galaxies', 'Ten days of looking, 342 exposures'],
  CMB: ['OLDEST\nLIGHT', 'The afterglow', 'From when the universe first turned clear.', 'Cooled to 2.7 kelvin', 'Some of the static on an old television was this'],
  ORIONIDS: ['ORIONIDS', 'The October shower', 'It burns above you at 66 kilometres a second.', 'A comet, falling as light', 'Dust shed by Halley, centuries ago'],
  'HUNTERS-MOON': ['HUNTER’S\nMOON', 'The October light', 'It rises with the dusk, night after night.', 'Named for autumn hunters', 'For a few nights, it lights the whole field'],
  'PLEIADES-OCCULTATION': ['MOON TAKES\nTHE SISTERS', 'An occultation', 'One by one, they vanish and return.', 'Watch with binoculars', 'It happens in runs that last for years'],
  GEMINIDS: ['GEMINIDS', 'Crumbs of an asteroid', 'The richest shower of the year, under a dark sky.', 'Up to 120 an hour', 'Slow, bright and often coloured'],
  'CHRISTMAS-SUPERMOON': ['SUPERMOON', 'Christmas Eve', 'The closest full Moon of the year.', 'Fourteen percent wider', 'Thirty percent brighter, on the longest nights'],
  'DOUBLE-OPPOSITION': ['DOUBLE\nOPPOSITION', 'Two worlds, one week', 'Jupiter, then Mars, at their closest to Earth.', 'Eight days apart', 'The next pair is years away'],
  'SNOW-MOON-ECLIPSE': ['SNOW MOON\nECLIPSE', 'February’s full Moon', 'It slips into the faint edge of Earth’s shadow.', 'One limb goes dusky', 'Subtle: you have to look for it'],
  'GREAT-ECLIPSE': ['GREAT\nECLIPSE', 'The long shadow', 'Stars will come out at noon.', 'Over six minutes of dark', 'Its path runs from Spain to Arabia'],
  'CANYON-DIABLO': ['CANYON DIABLO', 'The crater maker', 'It hit Arizona and left a hole over a kilometre wide.', 'It dated the Earth', 'Its lead gave the age of the Earth: 4.55 billion years'],
  GIBEON: ['GIBEON', 'Crystal in the iron', 'No forge can make this pattern; only slow cooling can.', 'Crystals grown in space', 'Its pieces lie across a strewn field in Namibia'],
  'CAMPO-DEL-CIELO': ['CAMPO DEL CIELO', 'Field of the sky', 'Thousands of years ago, iron rained on the Chaco.', 'A shower of iron', 'Its largest pieces weigh around thirty tonnes'],
  MUONIONALUSTA: ['MUONIONALUSTA', 'The ancient iron', 'It lay under the ice through several ice ages.', 'Older than the Earth', 'Found in Swedish Lapland in 1906'],
  ALLENDE: ['ALLENDE', 'The oldest grains', 'Its white flecks formed before any planet did.', 'The most studied stone', 'It fell over Mexico in 1969, as labs prepared for Apollo'],
};

const FIGURES: Record<string, Poster['figures']> = {
  SATURN: [['282,000 KM', 'Ring span'], ['OVER 1.2 BN KM', 'From Earth'], ['OVER 70 MIN', 'Light delay to Earth']],
  M1: [['6,500 LY', 'Away'], ['TAURUS', 'Constellation'], ['1,500 KM/S', 'Still expanding']],
};

export function posterFor(designation: string, fallbackName: string, fallbackLine: string): Poster {
  const row = ROWS[designation];
  if (!row) return { title: fallbackName.toUpperCase(), epithet: '', quote: null, headline: fallbackLine, sub: '' };
  const [title, epithet, quote, headline, sub] = row;
  return { title, epithet, quote, headline, sub, figures: FIGURES[designation] };
}
