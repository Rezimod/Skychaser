/**
 * The Solar System, beyond the cards in set-001.ts: the Sun, every
 * planet, the moons that matter most, Pluto, and the first visitor from
 * another star. Planet sizes for resolution are the disc at a typical
 * distance from Earth.
 */

import { arcsecFromKmAtAu } from '@/lib/skychaser/observability';
import { authorCard, authorKept, type AuthoredCard } from '../build';
import { NO_POSITION, body } from './shared';

const near = { family: 'near' } as const;

export const NEAR_CARDS: AuthoredCard[] = [
  authorKept(
    {
      designation: 'SUN', name: 'The Sun', objectType: 'star', rarity: 'common',
      catalogRef: 'G2V',
      blurb: 'Its light took tens of thousands of years to climb out of the core.',
    },
    'The Live Telescope never points at the Sun: without a solar filter it would burn the camera.',
    {
      ...near,
      stats: [['DIAMETER', '1.39M km'], ['SURFACE', '5,500 °C'], ['LIGHT', '8 min 20 s']],
      line: 'Its light took tens of thousands of years to climb out of the core.',
      story: ['It holds more than 99 percent of the Solar System’s mass.', 'Everything that lives is running on it.'],
      glow: '#ffb45a',
    },
  ),
  authorCard(
    {
      designation: 'MERCURY', name: 'Mercury', objectType: 'planet', rarity: 'epic',
      targetId: 'mercury', catalogRef: 'JPL Horizons 199', ...NO_POSITION,
      blurb: 'Ice hides in polar craters that sunlight never reaches.',
    },
    body(arcsecFromKmAtAu(4_879, 0.9)),
    {
      ...near,
      stats: [['DIAMETER', '4,879 km'], ['YEAR', '88 days'], ['SOLAR DAY', '176 days']],
      line: 'Ice hides in polar craters that sunlight never reaches.',
      story: ['It has almost no air to hold the heat.', 'It never strays far from dusk or dawn.'],
      glow: '#c9c2b8',
      noun: 'Mercury',
    },
  ),
  authorCard(
    {
      designation: 'VENUS', name: 'Venus', objectType: 'planet', rarity: 'epic',
      targetId: 'venus', catalogRef: 'JPL Horizons 299', ...NO_POSITION,
      blurb: 'It spins backwards: there the Sun rises in the west.',
    },
    body(arcsecFromKmAtAu(12_104, 0.7)),
    {
      ...near,
      stats: [['DIAMETER', '12,104 km'], ['SURFACE', '465 °C'], ['DAY', '243 days']],
      line: 'It spins backwards: there the Sun rises in the west.',
      story: ['Its air presses down ninety times harder than ours.', 'After the Moon, the brightest thing in the night.'],
      glow: '#ffe7b0',
      noun: 'Venus',
    },
  ),
  authorCard(
    {
      designation: 'MARS', name: 'Mars', objectType: 'planet', rarity: 'epic',
      targetId: 'mars', catalogRef: 'JPL Horizons 499', ...NO_POSITION,
      blurb: 'Two small moons, Phobos and Deimos, circle it.',
    },
    body(arcsecFromKmAtAu(6_779, 0.6)),
    {
      ...near,
      stats: [['DIAMETER', '6,779 km'], ['DAY', '24 h 37 m'], ['MOONS', '2']],
      line: 'Two small moons, Phobos and Deimos, circle it.',
      story: ['Its red is rust in the dust.', 'A year there lasts 687 days.'],
      glow: '#ff8a5c',
      noun: 'Mars',
      pairsWith: 'PHOBOS',
    },
  ),
  authorCard(
    {
      designation: 'VALLES-MARINERIS', name: 'Valles Marineris', objectType: 'canyon on Mars', rarity: 'rare',
      targetId: 'mars', catalogRef: 'IAU gazetteer', ...NO_POSITION,
      blurb: 'Named for Mariner 9, the probe that found it in 1972.',
    },
    body(arcsecFromKmAtAu(4_000, 0.6)),
    {
      ...near,
      stats: [['LENGTH', '~4,000 km'], ['DEPTH', 'up to 7 km'], ['WIDTH', 'up to 200 km']],
      line: 'Named for Mariner 9, the probe that found it in 1972.',
      story: ['Nearly ten times the length of the Grand Canyon.', 'Its walls show layers laid down over billions of years.'],
      glow: '#e8946a',
      noun: 'Valles Marineris',
    },
  ),
  // The special card: the one moon promoted above its kind, added after the
  // set was numbered, so it prints as No. 106 and no other card moves.
  authorCard(
    {
      designation: 'PHOBOS', name: 'Phobos', objectType: 'moon of Mars', rarity: 'epic',
      targetId: 'mars', catalogRef: 'JPL Horizons 401', ...NO_POSITION,
      blurb: 'It circles Mars three times in a single Martian day.',
    },
    body(arcsecFromKmAtAu(22, 0.6)),
    {
      ...near,
      stats: [['DIAMETER', '~22 km'], ['ORBIT', '7 h 39 m'], ['FOUND', '1877']],
      line: 'It circles Mars three times in a single Martian day.',
      story: ['Its name is Greek for fear; its sister Deimos is dread.', 'It falls a little closer every century, and one day it will break apart.'],
      glow: '#c99a78',
      pairsWith: 'MARS',
    },
  ),
  authorCard(
    {
      designation: 'IO', name: 'Io', objectType: 'moon of Jupiter', rarity: 'common',
      targetId: 'jupiter', catalogRef: 'JPL Horizons 501', ...NO_POSITION,
      blurb: 'It circles its planet in less than two days.',
    },
    body(arcsecFromKmAtAu(3_643, 4.2)),
    {
      ...near,
      stats: [['DIAMETER', '3,643 km'], ['VOLCANOES', '~400 active'], ['ORBIT', '1.77 days']],
      line: 'It circles its planet in less than two days.',
      story: ['Its lava runs hotter than any on Earth today.', 'Sulfur paints it yellow, orange and red.'],
      glow: '#ffd35a',
    },
  ),
  authorCard(
    {
      designation: 'GANYMEDE', name: 'Ganymede', objectType: 'moon of Jupiter', rarity: 'common',
      targetId: 'jupiter', catalogRef: 'JPL Horizons 503', ...NO_POSITION,
      blurb: 'Galileo spotted it in January 1610.',
    },
    body(arcsecFromKmAtAu(5_268, 4.2)),
    {
      ...near,
      stats: [['DIAMETER', '5,268 km'], ['ORBIT', '7.15 days'], ['MAGNETIC FIELD', 'Its own']],
      line: 'Galileo spotted it in January 1610.',
      story: ['Its grooves are faults in old, cracked ice.', 'The probe JUICE is on its way to orbit it.'],
      glow: '#cbbca6',
    },
  ),
  authorCard(
    {
      designation: 'ENCELADUS', name: 'Enceladus', objectType: 'moon of Saturn', rarity: 'common',
      targetId: 'saturn', catalogRef: 'JPL Horizons 602', ...NO_POSITION,
      blurb: 'Its spray feeds one of Saturn’s rings.',
    },
    body(arcsecFromKmAtAu(504, 8.5)),
    {
      ...near,
      stats: [['DIAMETER', '504 km'], ['REFLECTS', '~99% of light'], ['JETS', '~100 geysers']],
      line: 'Its spray feeds one of Saturn’s rings.',
      story: ['Cassini flew through its plumes and tasted salt.', 'Its south pole is warm, striped with long cracks.'],
      glow: '#dff4ff',
    },
  ),
  authorCard(
    {
      designation: 'URANUS', name: 'Uranus', objectType: 'planet', rarity: 'epic',
      targetId: 'uranus', catalogRef: 'JPL Horizons 799', ...NO_POSITION,
      blurb: 'Herschel found it in 1781, the first planet found by telescope.',
    },
    body(arcsecFromKmAtAu(51_118, 19), 5.7),
    {
      ...near,
      stats: [['DIAMETER', '51,118 km'], ['TILT', '98°'], ['YEAR', '84 years']],
      line: 'Herschel found it in 1781, the first planet found by telescope.',
      story: ['Its blue-green comes from methane in the air.', 'Thirteen faint rings circle it.'],
      glow: '#a8f0f0',
      noun: 'Uranus',
    },
  ),
  authorCard(
    {
      designation: 'NEPTUNE', name: 'Neptune', objectType: 'planet', rarity: 'epic',
      targetId: 'neptune', catalogRef: 'JPL Horizons 899', ...NO_POSITION,
      blurb: 'Voyager 2 is the only craft to visit, in 1989.',
    },
    body(arcsecFromKmAtAu(49_528, 29), 7.8),
    {
      ...near,
      stats: [['DIAMETER', '49,528 km'], ['WINDS', '~2,000 km/h'], ['YEAR', '165 years']],
      line: 'Voyager 2 is the only craft to visit, in 1989.',
      story: ['Galle found it in 1846, within a degree of the prediction.', 'It has gone round the Sun once since it was found.'],
      glow: '#5a8cff',
      noun: 'Neptune',
    },
  ),
  authorCard(
    {
      designation: 'PLUTO', name: 'Pluto', objectType: 'dwarf planet', rarity: 'common',
      targetId: 'pluto', catalogRef: '134340 Pluto', ...NO_POSITION,
      blurb: 'Its discoverer’s ashes flew past it on New Horizons.',
    },
    body(arcsecFromKmAtAu(2_377, 34), 14.4),
    {
      ...near,
      stats: [['DIAMETER', '2,377 km'], ['YEAR', '248 years'], ['VISITED', '14 Jul 2015']],
      line: 'Its discoverer’s ashes flew past it on New Horizons.',
      story: ['Its biggest moon, Charon, is half its width.', 'It takes 248 of our years to go round the Sun.'],
      glow: '#f2c9a8',
    },
  ),
  authorKept(
    {
      designation: 'OUMUAMUA', name: 'ʻOumuamua', objectType: 'interstellar object', rarity: 'common',
      catalogRef: '1I/2017 U1',
      blurb: 'Its name is Hawaiian for a scout from far away.',
    },
    'Gone: it left the inner Solar System in 2018 and is far too faint for any telescope now.',
    {
      ...near,
      stats: [['FOUND', '19 Oct 2017'], ['SPEED', '26 km/s'], ['ORIGIN', 'Another star']],
      line: 'Its name is Hawaiian for a scout from far away.',
      story: ['It sped up slightly as it left, and no one is sure why.', 'It is already beyond the orbit of Neptune.'],
      glow: '#d69a78',
    },
  ),
];
