// Two more places to set down. Everything that makes Mars Mars and Proxima b
// Proxima b — the pull, the sun, the sky, the colour of the ground, what is
// in the sky with you — is data here; the surface scene reads it and builds
// the same way for either.
//
// Mars is the real thing: 0.38 g, a small pale sun, a butterscotch sky that
// goes blue around the sun at the horizon (the dust scatters the other way
// round from air), Phobos crossing east to west in a few hours, rust plains
// with dark basalt and pale bedrock.
//
// Proxima b is the best guess for a tidally locked world round a red dwarf,
// seen from its terminator: a huge dim orange sun that never moves, sitting
// low; a sky that is salmon near it and violet overhead; Alpha Centauri A
// and B as a brilliant double star; aurorae from the star's flares; and a
// biosphere that photosynthesises under red light — so its leaves are near
// black — and talks to itself with light, so the twilight is full of colour.
//
// Earth is Tbilisi, and nothing on it is invented: the ground, the city and
// the sky come from baked open data and astronomy-engine (world-earth-*).
// The profile only holds what the shared rig reads before that loads.
//
// The rest of the Sun's planets, each with a small Stellar outpost
// (world-outpost). Mercury is seen from near its dawn line, where the Sun
// is a few degrees up and the ground is hot but not lethal; Venus from the
// floor of its 92-bar air, at 464 °C, in a dim orange murk. The four giants
// have no ground at all: the outpost there is an aerostat, a floating deck
// riding the cloud tops near the 1-bar level (`deck`), and the floor is
// that deck. Their light is dimmer than Earth's, though brightened for
// play: the Sun at Neptune is a nine-hundredth of what it is here.

import * as THREE from 'three';

export type WorldId = 'mars' | 'proximaB' | 'earth' | 'mercury' | 'venus' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

/** Every world the surface scene can be built for, in order out from the Sun (then Proxima b). */
export const WORLD_IDS: readonly WorldId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'proximaB'];

export interface SkyMoon {
  id: string;
  /** Apparent size in the sky, as a dome radius fraction, and colour. */
  size: number;
  color: number;
  /** Where it starts (unit direction) and its axis and rate of travel, rad/s. */
  dir: THREE.Vector3;
  axis: THREE.Vector3;
  rate: number;
  /** Irregular — a battered potato rather than a ball. */
  lumpy: boolean;
}

export interface SkyStar {
  dir: THREE.Vector3;
  color: THREE.Color;
  scale: number;
}

/** The air, as the sky shader and the aerial perspective read it. */
export interface WorldAtmosphere {
  /** Rayleigh-like scattering per channel (relative, linear RGB): what the sky is coloured by away from the sun. */
  rayleigh: [number, number, number];
  /** Absorption per channel: light the air takes without scattering it (Mars's dust eats blue). */
  absorb: [number, number, number];
  /** Mie (aerosol) scattering strength, its colour, and its forward lobe g (0…0.99). */
  mie: number;
  mieTint: [number, number, number];
  mieG: number;
  /** How much dust or haze there is: scales the Mie term with height. */
  turbidity: number;
  /** The star's brightness as seen through the air (the sky's overall exposure), and its colour, normalised. */
  sunIntensity: number;
  sunTint: [number, number, number];
  /** Skylight from beyond the model — multiple scattering, the day side over the horizon — added everywhere, linear RGB. */
  ambient: [number, number, number];
  /** Aerial perspective: Koschmieder β (1/m), the colour of the air at a distance and toward the sun. */
  hazeBeta: number;
  hazeColor: [number, number, number];
  hazeSun: [number, number, number];
}

/** A cloud deck drawn into the sky: a 2.5D slab of noise, raymarched. */
export interface WorldClouds {
  /** 0…1: how much of the sky is cloud. */
  coverage: number;
  /** Slab base and thickness above the ground, m; the noise's horizontal period, m. */
  altitude: number;
  thickness: number;
  scale: number;
  /** Wind, m/s. */
  wind: [number, number];
  /** The lit colour and the shadowed colour of a cloud, linear RGB. */
  lit: [number, number, number];
  shade: [number, number, number];
  /** Long streaks, or lumps. */
  kind: 'wisps' | 'cumulus';
}

/** A ringed giant in the sky (Proxima b only). */
export interface WorldGiant {
  dir: THREE.Vector3;
  /** Apparent diameter, degrees. */
  angularDeg: number;
  /** The planet's axis tilt toward the viewer, rad, and its spin about that axis. */
  tilt: number;
  roll: number;
  /** Ring radii as multiples of the planet's radius. */
  ringInner: number;
  ringOuter: number;
  /** The band palette, linear RGB, pole to pole. */
  bands: [number, number, number][];
  ringColor: [number, number, number];
  /** How much the air in front of it washes it out, 0…1. */
  air: number;
}

/** Rock formations: how many of each, and the strata. */
export interface WorldFormations {
  mesas: number;
  hoodoos: number;
  arches: number;
  spires: number;
  boulders: number;
  /** Strata bands, bottom to top, linear RGB. */
  strata: [number, number, number][];
  /** The unstratified rock: hoodoos, arches, boulders. */
  rock: [number, number, number];
}

/** A planet's rings seen from inside it: an arc across the sky in its equatorial plane. */
export interface SkyRings {
  /** The site's latitude, degrees: it sets how the ring plane lies across the sky. */
  latDeg: number;
  /** Ring radii as multiples of the planet's radius. */
  inner: number;
  outer: number;
  /** The lit colour, linear RGB, and how opaque the densest part is, 0…1. */
  color: [number, number, number];
  opacity: number;
  /** Saturn's broad sheets and gaps, or Uranus's handful of narrow dark ringlets. */
  kind: 'saturn' | 'uranus';
}

/** A floating outpost over a cloud deck (the giants): there is no ground, so the deck is the floor. */
export interface WorldDeck {
  /** The deck's radius round the site, m. Its top is the site datum, y = 0. */
  radius: number;
  /** How far below the deck the tops of the cloud sea lie, m. */
  seaDepth: number;
  /** The cloud sea's palette, linear RGB: the shadowed gaps, two body tones, the brightest tops. */
  sea: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
  /** How many cloud towers stand out of the sea round the outpost (scaled by the preset). */
  towers: number;
  /** How the sea moves under the deck, m/s: the platform rides the wind, so this is the shear. */
  wind: [number, number];
}

export interface WorldCrystals {
  count: number;
  /** The glow, linear RGB; it is multiplied up into HDR for the bloom. */
  color: [number, number, number];
  glow: number;
}

export interface WorldProfile {
  id: WorldId;
  gravity: number;
  sunDir: THREE.Vector3;
  atmosphere: WorldAtmosphere;
  clouds: WorldClouds | null;
  giant: WorldGiant | null;
  formations: WorldFormations | null;
  crystals: WorldCrystals | null;
  sun: {
    /** The directional light. */
    color: number;
    intensity: number;
    /** The disc and its halo, as drawn. */
    disc: THREE.Color;
    discScale: number;
    halo: number;
    haloOpacity: number;
    haloScale: number;
  };
  sky: {
    zenith: THREE.Color;
    horizon: THREE.Color;
    /** The colour the sky takes near the sun, and how tight that is. */
    glow: THREE.Color;
    glowPower: number;
    /** Hemisphere fill: sky and ground, and how strong. */
    fillSky: number;
    fillGround: number;
    fill: number;
    fog: number;
    fogNear: number;
    fogFar: number;
    /** How much of the starfield shows through, 0…1. */
    stars: number;
    aurora: boolean;
    moons: SkyMoon[];
    stars2: SkyStar[];
    /** Rings across the sky, seen from inside the planet (Saturn, Uranus). */
    rings?: SkyRings;
  };
  ground: {
    /** Vertex colour bands: the plain, the dark patches, the pale streaks, in linear RGB. */
    plain: [number, number, number];
    dark: [number, number, number];
    pale: [number, number, number];
    /** The two rock cuts. */
    rockA: number;
    rockB: number;
    /** What blows up off the ground, and its dunes. */
    dust: [number, number, number];
    dunes: number;
    craters: number;
    relief: number;
    /** How far the relief noise is bent by its own second noise, m: 0 is plain fbm. */
    warp: number;
    /** Terraced plateaus: their height, m (0 for none) and how many steps. */
    mesas: number;
    terraces: number;
    /** The colour of bare rock on a slope and of the sand that pools on the flat, linear RGB. */
    slopeRock: [number, number, number];
    sand: [number, number, number];
    /** A basin that holds water: its centre, radius and surface height (Proxima only). */
    water: { x: number; z: number; r: number; level: number } | null;
    seed: number;
  };
  /** The suit's outside reading, °C, and how far the crew may walk, m. */
  ambientC: number;
  walkRadius: number;
  /** Where the descent aims. */
  pad: { x: number; z: number };
  /** Air to breathe: no helmet, no oxygen reading. */
  breathable?: boolean;
  /** The giants: a floating deck over a sea of cloud instead of ground. */
  deck?: WorldDeck;
  /** The heading the crew face when they step out, degrees clockwise from north (default 0: the outpost). */
  view?: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();
const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

/**
 * Where a body in a planet's equatorial plane appears in the sky of a site
 * on that planet: `distR` planet radii from the centre, `deg` round the
 * plane from the site's east (−90 is the plane's highest point in the
 * sky), seen from latitude `latDeg`. Local frame: east +X, up +Y, north −Z.
 */
export function equatorialDir(latDeg: number, distR: number, deg: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180; const a = (deg * Math.PI) / 180;
  // The plane is spanned by east and by the planet's axis crossed with east.
  return new THREE.Vector3(distR * Math.cos(a), -1 - distR * Math.sin(a) * Math.cos(lat), -distR * Math.sin(a) * Math.sin(lat)).normalize();
}
/** The planet's spin axis at a site of this latitude, local frame: the sky turns about it. */
export function poleAxis(latDeg: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  return new THREE.Vector3(0, Math.sin(lat), -Math.cos(lat));
}

export const MARS: WorldProfile = {
  id: 'mars',
  gravity: 3.71,
  sunDir: v(-0.58, 0.52, 0.63),
  sun: {
    color: 0xfff1dc, intensity: 2.9,
    disc: c(5.2, 4.9, 4.4), discScale: 58,
    halo: 0x9fc4ff, haloOpacity: 0.18, haloScale: 300,
  },
  sky: {
    zenith: c(0.40, 0.27, 0.17), horizon: c(0.80, 0.57, 0.37),
    glow: c(0.55, 0.68, 0.95), glowPower: 14,
    fillSky: 0xc9987a, fillGround: 0x6e3f2a, fill: 0.62,
    fog: 0xc8936a, fogNear: 120, fogFar: 1350,
    stars: 0,
    aurora: false,
    moons: [
      { id: 'phobos', size: 5.2, color: 0x6b625c, dir: v(0.62, 0.36, -0.4), axis: v(0.1, 1, 0.05), rate: 0.012, lumpy: true },
      { id: 'deimos', size: 1.8, color: 0x8a817a, dir: v(-0.3, 0.55, -0.7), axis: v(0, 1, 0), rate: -0.003, lumpy: true },
    ],
    stars2: [],
  },
  ground: {
    plain: [0.72, 0.42, 0.24], dark: [0.30, 0.20, 0.15], pale: [0.90, 0.72, 0.52],
    rockA: 0x5a4238, rockB: 0xb8865e,
    dust: [0.78, 0.50, 0.32], dunes: 1.0, craters: 22, relief: 9,
    warp: 28, mesas: 6.5, terraces: 3,
    slopeRock: [0.46, 0.26, 0.17], sand: [0.86, 0.62, 0.40],
    water: null, seed: 4311,
  },
  // Dust, not air: the sky is butterscotch away from the sun because the
  // dust absorbs blue and scatters red, and blue right round the sun because
  // micron dust throws blue forward. Thin, so the stars would show at night.
  atmosphere: {
    rayleigh: [0.30, 0.20, 0.13], absorb: [0.03, 0.14, 0.34], mie: 0.026, mieTint: [0.30, 0.55, 1.0], mieG: 0.86, turbidity: 3.2,
    sunIntensity: 22, sunTint: [1, 0.96, 0.9], ambient: [0.04, 0.026, 0.014],
    hazeBeta: 1.3e-3, hazeColor: [0.60, 0.40, 0.25], hazeSun: [0.80, 0.62, 0.48],
  },
  // High, thin water-ice wisps, as the rovers photograph them before dawn.
  clouds: { coverage: 0.30, altitude: 900, thickness: 260, scale: 1500, wind: [9, 3], lit: [1.0, 0.94, 0.86], shade: [0.72, 0.56, 0.46], kind: 'wisps' },
  giant: null,
  formations: {
    mesas: 9, hoodoos: 26, arches: 2, spires: 6, boulders: 14,
    strata: [[0.46, 0.25, 0.16], [0.70, 0.42, 0.26], [0.55, 0.30, 0.18], [0.80, 0.54, 0.34], [0.62, 0.36, 0.22], [0.86, 0.62, 0.40]],
    rock: [0.64, 0.36, 0.22],
  },
  crystals: { count: 22, color: [0.25, 1.0, 0.85], glow: 3.2 },
  ambientC: -61,
  walkRadius: 165,
  pad: { x: 0, z: -6 },
};

export const PROXIMA_B: WorldProfile = {
  id: 'proximaB',
  gravity: 11.2,
  // Tidally locked: the star sits eleven degrees up and never moves.
  sunDir: v(0.74, 0.2, 0.64),
  sun: {
    color: 0xffb083, intensity: 2.1,
    disc: c(4.6, 1.9, 0.9), discScale: 190,
    halo: 0xff8a58, haloOpacity: 0.32, haloScale: 640,
  },
  sky: {
    zenith: c(0.07, 0.04, 0.18), horizon: c(0.58, 0.27, 0.25),
    glow: c(1.0, 0.55, 0.30), glowPower: 4.5,
    fillSky: 0x6b4a8c, fillGround: 0x2a1c2c, fill: 0.55,
    fog: 0x4a2a3e, fogNear: 160, fogFar: 1500,
    stars: 0.95,
    aurora: true,
    moons: [
      { id: 'proximaD', size: 3.4, color: 0x9c8f8a, dir: v(-0.55, 0.42, 0.5), axis: v(0.2, 1, 0), rate: 0.0016, lumpy: false },
    ],
    stars2: [
      { dir: v(-0.35, 0.62, -0.7), color: c(1.0, 0.96, 0.88), scale: 34 },
      { dir: v(-0.33, 0.6, -0.72), color: c(1.0, 0.78, 0.5), scale: 26 },
    ],
  },
  ground: {
    plain: [0.34, 0.22, 0.30], dark: [0.10, 0.08, 0.14], pale: [0.52, 0.42, 0.44],
    rockA: 0x3a2a44, rockB: 0x6a5468,
    dust: [0.42, 0.30, 0.38], dunes: 0.3, craters: 6, relief: 14,
    warp: 40, mesas: 0, terraces: 0,
    slopeRock: [0.26, 0.18, 0.28], sand: [0.48, 0.36, 0.42],
    water: { x: 62, z: 48, r: 44, level: -2.6 }, seed: 7727,
  },
  // A thick air under a red star: violet overhead where what little blue
  // there is scatters, salmon along the horizon and a wide orange wash
  // round the sun that never sets.
  atmosphere: {
    rayleigh: [0.05, 0.06, 0.20], absorb: [0.0, 0.05, 0.02], mie: 0.010, mieTint: [1.0, 0.55, 0.30], mieG: 0.72, turbidity: 4,
    sunIntensity: 30, sunTint: [1, 0.55, 0.42], ambient: [0.12, 0.06, 0.30],
    hazeBeta: 1.5e-3, hazeColor: [0.40, 0.24, 0.36], hazeSun: [0.82, 0.46, 0.30],
  },
  // Broken cumulus, lit from the side by a star that never climbs.
  clouds: { coverage: 0.52, altitude: 520, thickness: 420, scale: 900, wind: [4, -6], lit: [1.0, 0.80, 0.70], shade: [0.30, 0.18, 0.34], kind: 'cumulus' },
  // "Proxima c": the real one is a Neptune-mass planet 1.5 au out, which
  // from here would be a point of light. It is drawn as a ringed giant low
  // in the north-west, opposite the star so it shows its lit face (a giant
  // beside the star would be a crescent), dramatised for the view.
  giant: {
    dir: v(-0.58, 0.30, -0.66), angularDeg: 24, tilt: 0.42, roll: -0.35, ringInner: 1.35, ringOuter: 2.25,
    bands: [[0.40, 0.26, 0.36], [0.90, 0.70, 0.60], [0.52, 0.32, 0.40], [0.96, 0.82, 0.70], [0.44, 0.26, 0.34], [0.92, 0.74, 0.64], [0.36, 0.22, 0.34]],
    ringColor: [0.86, 0.72, 0.66], air: 0.2,
  },
  formations: {
    mesas: 0, hoodoos: 0, arches: 3, spires: 12, boulders: 10,
    strata: [[0.22, 0.14, 0.26], [0.36, 0.24, 0.36], [0.28, 0.18, 0.30]],
    rock: [0.34, 0.22, 0.36],
  },
  crystals: { count: 26, color: [0.30, 0.95, 1.0], glow: 3.6 },
  ambientC: 12,
  walkRadius: 165,
  pad: { x: 0, z: -6 },
};

export const EARTH: WorldProfile = {
  id: 'earth',
  gravity: 9.81,
  // Replaced every frame by the real Sun over Tbilisi.
  sunDir: v(0.3, 0.6, 0.5),
  sun: {
    color: 0xfff4e6, intensity: 3,
    disc: c(5, 4.8, 4.5), discScale: 40,
    halo: 0xfff1d6, haloOpacity: 0.2, haloScale: 300,
  },
  sky: {
    zenith: c(0.18, 0.32, 0.62), horizon: c(0.62, 0.7, 0.8),
    glow: c(1, 0.95, 0.85), glowPower: 10,
    fillSky: 0xa9c4e8, fillGround: 0x6a5a48, fill: 0.6,
    fog: 0x9fb2c8, fogNear: 400, fogFar: 20000,
    stars: 0, aurora: false, moons: [], stars2: [],
  },
  ground: {
    plain: [0.3, 0.28, 0.24], dark: [0.2, 0.19, 0.17], pale: [0.4, 0.38, 0.34],
    rockA: 0x6a6258, rockB: 0x8a8074,
    dust: [0.42, 0.38, 0.32], dunes: 0, craters: 0, relief: 0,
    warp: 0, mesas: 0, terraces: 0,
    slopeRock: [0.3, 0.28, 0.24], sand: [0.4, 0.38, 0.34],
    water: null, seed: 4144,
  },
  // Unused: Earth's sky and air are the real ones (world-earth-sky, world-earth-haze).
  atmosphere: {
    rayleigh: [0.18, 0.32, 0.62], absorb: [0, 0, 0], mie: 0.01, mieTint: [1, 1, 1], mieG: 0.76, turbidity: 2, sunIntensity: 30, sunTint: [1, 1, 1], ambient: [0, 0, 0],
    hazeBeta: 1.3e-4, hazeColor: [0.6, 0.7, 0.85], hazeSun: [1, 0.9, 0.75],
  },
  clouds: null, giant: null, formations: null, crystals: null,
  ambientC: 0,
  walkRadius: 1950,
  // The bake puts the pad at the origin; the descent aims 26 m on from here.
  pad: { x: 0, z: -26 },
  breathable: true,
};

// ── Mercury: airless, a black sky, a Sun two and a half times the size it
// is from Earth (0.39 au) and nearly seven times as bright. The site is
// near the dawn line, the Sun about six degrees up: in its light the
// ground is near 80 °C, inside the suit's rating (about 120 °C), while
// the noon side passes 400 °C and the shadows are colder than −150 °C.
// Moon-like regolith, warmer and browner, old craters, long hard shadows. ──
export const MERCURY: WorldProfile = {
  id: 'mercury',
  gravity: 3.7,
  sunDir: v(0.84, 0.11, 0.52),
  sun: {
    color: 0xfff6ea, intensity: 6.2,
    disc: c(9.0, 8.7, 8.2), discScale: 100,
    halo: 0xfff4e0, haloOpacity: 0.16, haloScale: 520,
  },
  sky: {
    zenith: c(0, 0, 0), horizon: c(0.01, 0.01, 0.01),
    glow: c(1, 0.96, 0.9), glowPower: 40,
    fillSky: 0x1c1c22, fillGround: 0x6e6052, fill: 0.34,
    fog: 0x000000, fogNear: 2000, fogFar: 20000,
    stars: 1,
    aurora: false,
    moons: [],
    stars2: [],
  },
  ground: {
    plain: [0.30, 0.27, 0.24], dark: [0.17, 0.155, 0.14], pale: [0.46, 0.42, 0.37],
    rockA: 0x4c453e, rockB: 0x8a7e70,
    dust: [0.42, 0.38, 0.33], dunes: 0, craters: 46, relief: 6,
    warp: 14, mesas: 0, terraces: 0,
    slopeRock: [0.24, 0.22, 0.20], sand: [0.36, 0.33, 0.29],
    water: null, seed: 1601,
  },
  // No air: a trace of scattering so the shader has numbers to divide by, a black sky.
  atmosphere: {
    rayleigh: [1e-5, 1e-5, 1e-5], absorb: [0, 0, 0], mie: 1e-5, mieTint: [1, 1, 1], mieG: 0.8, turbidity: 1,
    sunIntensity: 30, sunTint: [1, 0.98, 0.95], ambient: [0, 0, 0],
    hazeBeta: 2e-5, hazeColor: [0.01, 0.01, 0.01], hazeSun: [0.62, 0.58, 0.52],
  },
  clouds: null,
  giant: null,
  formations: {
    mesas: 0, hoodoos: 0, arches: 0, spires: 0, boulders: 22,
    strata: [[0.26, 0.23, 0.20], [0.34, 0.30, 0.26]],
    rock: [0.32, 0.29, 0.25],
  },
  crystals: null,
  ambientC: 80,
  walkRadius: 165,
  pad: { x: 0, z: -6 },
};

// ── Venus: the floor of a 92-bar carbon-dioxide sea, 464 °C day and night.
// The Sun is never seen: its light comes down through 50 km of sulphuric
// acid cloud as a dim, even orange glow from the whole sky, and the air
// itself is so dense that a few kilometres off everything is lost in it.
// Dark basalt plains broken into flat slabs, as the Venera landers saw. ──
export const VENUS: WorldProfile = {
  id: 'venus',
  gravity: 8.87,
  // Where the light comes from most: high, and spread over the whole sky.
  sunDir: v(0.3, 0.86, 0.4),
  sun: {
    color: 0xffb56a, intensity: 0.85,
    disc: c(0.5, 0.3, 0.12), discScale: 260,
    halo: 0xffa050, haloOpacity: 0.22, haloScale: 1400,
  },
  sky: {
    zenith: c(0.62, 0.40, 0.16), horizon: c(0.70, 0.42, 0.16),
    glow: c(1.0, 0.70, 0.36), glowPower: 2,
    fillSky: 0xd88a3c, fillGround: 0x4a2a14, fill: 1.25,
    fog: 0x8a5422, fogNear: 60, fogFar: 1600,
    stars: 0,
    aurora: false,
    moons: [],
    stars2: [],
  },
  ground: {
    plain: [0.24, 0.20, 0.17], dark: [0.12, 0.10, 0.09], pale: [0.36, 0.30, 0.25],
    rockA: 0x2c2622, rockB: 0x5a4c40,
    dust: [0.38, 0.28, 0.18], dunes: 0.15, craters: 0, relief: 3.5,
    warp: 24, mesas: 1.6, terraces: 5,
    slopeRock: [0.16, 0.14, 0.12], sand: [0.30, 0.24, 0.19],
    water: null, seed: 2251,
  },
  // A thick, even overcast: strong scattering with a weak forward lobe, so
  // the sky is one colour, and absorption in the blue, so it is orange.
  atmosphere: {
    rayleigh: [0.55, 0.42, 0.24], absorb: [0.06, 0.30, 1.1], mie: 0.12, mieTint: [1, 0.78, 0.46], mieG: 0.35, turbidity: 3,
    sunIntensity: 14, sunTint: [1, 0.66, 0.32], ambient: [0.10, 0.05, 0.016],
    hazeBeta: 2.4e-3, hazeColor: [0.30, 0.15, 0.04], hazeSun: [0.42, 0.22, 0.06],
  },
  clouds: null,
  giant: null,
  formations: {
    mesas: 0, hoodoos: 0, arches: 0, spires: 0, boulders: 34,
    strata: [[0.16, 0.13, 0.11], [0.24, 0.20, 0.16]],
    rock: [0.20, 0.17, 0.14],
  },
  crystals: null,
  ambientC: 464,
  walkRadius: 150,
  pad: { x: 0, z: -6 },
};

// ── The giants. The site is the outpost's deck, the site datum; the cloud
// tops are a sea some tens of metres below it, moving with the wind; cloud
// towers stand out of it, and an upper deck of thin haze hangs above. In
// their sky: their moons along the plane of the equator, and on Saturn
// the rings, a bright arch from horizon to horizon. ──
const DECK_R = 42;

/** Jupiter: 14° S, in the South Equatorial Belt just north of the Great Red
 *  Spot (planet-frame's site). The cloud tops are ammonia ice, cream and
 *  tan, with rust and brown where the belt's deeper colours show; Io,
 *  Europa, Ganymede and Callisto stand along the arc of the equator's
 *  plane, which from south of the equator crosses the northern sky. */
const JUPITER_LAT = -14;
export const JUPITER: WorldProfile = {
  id: 'jupiter',
  gravity: 24.79,
  sunDir: v(0.62, 0.5, -0.3),
  sun: {
    color: 0xfff2dc, intensity: 1.9,
    disc: c(7.0, 6.8, 6.4), discScale: 13,
    halo: 0xfff0d8, haloOpacity: 0.14, haloScale: 240,
  },
  sky: {
    zenith: c(0.20, 0.27, 0.40), horizon: c(0.70, 0.62, 0.50),
    glow: c(1.0, 0.93, 0.80), glowPower: 8,
    fillSky: 0xb7b0a2, fillGround: 0x8a6a4a, fill: 0.95,
    fog: 0xa89478, fogNear: 200, fogFar: 2600,
    stars: 0,
    aurora: false,
    moons: [
      { id: 'io', size: 10, color: 0xd8c25a, dir: equatorialDir(JUPITER_LAT, 5.9, -62), axis: poleAxis(JUPITER_LAT), rate: -0.0016, lumpy: false },
      { id: 'europa', size: 5, color: 0xdcd2c2, dir: equatorialDir(JUPITER_LAT, 9.4, -112), axis: poleAxis(JUPITER_LAT), rate: -0.0014, lumpy: false },
      { id: 'ganymede', size: 5, color: 0xa0927e, dir: equatorialDir(JUPITER_LAT, 15, -138), axis: poleAxis(JUPITER_LAT), rate: -0.0012, lumpy: false },
      { id: 'callisto', size: 2.6, color: 0x6e6456, dir: equatorialDir(JUPITER_LAT, 26.3, -40), axis: poleAxis(JUPITER_LAT), rate: -0.0011, lumpy: false },
    ],
    stars2: [],
  },
  ground: {
    plain: [0.66, 0.56, 0.42], dark: [0.42, 0.28, 0.18], pale: [0.86, 0.80, 0.68],
    rockA: 0x6a5a4a, rockB: 0xa08a70,
    dust: [0.7, 0.6, 0.5], dunes: 0, craters: 0, relief: 0,
    warp: 0, mesas: 0, terraces: 0,
    slopeRock: [0.5, 0.4, 0.3], sand: [0.7, 0.6, 0.5],
    water: null, seed: 5201,
  },
  // Hydrogen scatters blue overhead; the ammonia haze and the chromophores
  // that colour the bands take the blue out lower down, so the horizon is tan.
  atmosphere: {
    rayleigh: [0.06, 0.12, 0.36], absorb: [0.0, 0.08, 0.26], mie: 0.03, mieTint: [1, 0.76, 0.46], mieG: 0.75, turbidity: 4,
    sunIntensity: 22, sunTint: [1, 0.95, 0.86], ambient: [0.05, 0.045, 0.04],
    hazeBeta: 1.4e-3, hazeColor: [0.62, 0.54, 0.36], hazeSun: [0.86, 0.74, 0.54],
  },
  // An upper haze of ammonia ice, high and thin.
  clouds: { coverage: 0.42, altitude: 1500, thickness: 320, scale: 1700, wind: [22, 2], lit: [1.0, 0.96, 0.88], shade: [0.62, 0.54, 0.44], kind: 'wisps' },
  giant: null, formations: null, crystals: null,
  ambientC: -108,
  walkRadius: DECK_R - 2.6,
  pad: { x: 0, z: -26 },
  deck: {
    radius: DECK_R, seaDepth: 55,
    sea: [[0.30, 0.18, 0.10], [0.62, 0.44, 0.28], [0.84, 0.74, 0.58], [1.0, 0.96, 0.88]],
    towers: 34, wind: [3.2, 0.4],
  },
};

/** Saturn: 24° N. Paler, more golden and more evenly hazed than Jupiter;
 *  the rings stand across the southern sky as a broad arch, with Saturn's
 *  own shadow cut out of them; Titan, Rhea and Enceladus along the plane. */
const SATURN_LAT = 24;
export const SATURN: WorldProfile = {
  id: 'saturn',
  gravity: 10.44,
  sunDir: v(0.62, 0.48, -0.36),
  sun: {
    color: 0xfff2dc, intensity: 1.7,
    disc: c(6.5, 6.3, 6.0), discScale: 10,
    halo: 0xfff0d8, haloOpacity: 0.12, haloScale: 200,
  },
  sky: {
    zenith: c(0.22, 0.27, 0.36), horizon: c(0.74, 0.66, 0.50),
    glow: c(1.0, 0.94, 0.80), glowPower: 8,
    fillSky: 0xbdb39a, fillGround: 0x8e7a52, fill: 0.95,
    fog: 0xb0a07a, fogNear: 200, fogFar: 2600,
    stars: 0,
    aurora: false,
    moons: [
      { id: 'titan', size: 4.4, color: 0xc89a4a, dir: equatorialDir(SATURN_LAT, 20.3, -150), axis: poleAxis(SATURN_LAT), rate: -0.0012, lumpy: false },
      { id: 'rhea', size: 2.4, color: 0xd8d4cc, dir: equatorialDir(SATURN_LAT, 8.7, -32), axis: poleAxis(SATURN_LAT), rate: -0.0015, lumpy: false },
      { id: 'enceladus', size: 2.1, color: 0xf2f4f6, dir: equatorialDir(SATURN_LAT, 3.95, -126), axis: poleAxis(SATURN_LAT), rate: -0.0018, lumpy: false },
    ],
    stars2: [],
    // C ring to the outer edge of the A ring.
    rings: { latDeg: SATURN_LAT, inner: 1.24, outer: 2.27, color: [0.95, 0.88, 0.74], opacity: 0.9, kind: 'saturn' },
  },
  ground: {
    plain: [0.74, 0.66, 0.48], dark: [0.52, 0.42, 0.28], pale: [0.90, 0.85, 0.70],
    rockA: 0x7a6a50, rockB: 0xb0a080,
    dust: [0.7, 0.64, 0.5], dunes: 0, craters: 0, relief: 0,
    warp: 0, mesas: 0, terraces: 0,
    slopeRock: [0.55, 0.48, 0.34], sand: [0.74, 0.66, 0.48],
    water: null, seed: 5691,
  },
  atmosphere: {
    rayleigh: [0.06, 0.11, 0.32], absorb: [0.0, 0.07, 0.24], mie: 0.035, mieTint: [1, 0.82, 0.50], mieG: 0.75, turbidity: 4,
    sunIntensity: 20, sunTint: [1, 0.96, 0.88], ambient: [0.045, 0.042, 0.035],
    hazeBeta: 1.3e-3, hazeColor: [0.66, 0.60, 0.42], hazeSun: [0.88, 0.80, 0.58],
  },
  clouds: { coverage: 0.36, altitude: 1700, thickness: 300, scale: 2000, wind: [30, 3], lit: [1.0, 0.97, 0.88], shade: [0.66, 0.60, 0.48], kind: 'wisps' },
  giant: null, formations: null, crystals: null,
  ambientC: -139,
  walkRadius: DECK_R - 2.6,
  // Out of the ship facing the rings, which stand in the south.
  view: 165,
  pad: { x: 0, z: -26 },
  deck: {
    radius: DECK_R, seaDepth: 60,
    sea: [[0.42, 0.33, 0.20], [0.70, 0.60, 0.42], [0.86, 0.79, 0.62], [1.0, 0.97, 0.88]],
    towers: 26, wind: [4.0, 0.3],
  },
};

/** Uranus: 30° S. Methane takes the red out of the light, so the air and
 *  the cloud are pale cyan; the rings are narrow and nearly black, a few
 *  faint threads across the northern sky; Ariel, Titania and Miranda along
 *  the plane. Uranus spins backwards, so its sky turns the other way. */
const URANUS_LAT = -30;
export const URANUS: WorldProfile = {
  id: 'uranus',
  gravity: 8.69,
  sunDir: v(-0.5, 0.52, -0.5),
  sun: {
    color: 0xeef8ff, intensity: 1.4,
    disc: c(6.0, 6.2, 6.3), discScale: 7,
    halo: 0xe6f8ff, haloOpacity: 0.12, haloScale: 170,
  },
  sky: {
    zenith: c(0.14, 0.30, 0.38), horizon: c(0.50, 0.70, 0.72),
    glow: c(0.86, 1.0, 1.0), glowPower: 8,
    fillSky: 0x9ccad0, fillGround: 0x4e7a80, fill: 1.0,
    fog: 0x7aa6aa, fogNear: 200, fogFar: 2400,
    stars: 0,
    aurora: false,
    moons: [
      { id: 'ariel', size: 5.2, color: 0xc2c0bc, dir: equatorialDir(URANUS_LAT, 7.5, -70), axis: poleAxis(URANUS_LAT), rate: 0.0016, lumpy: false },
      { id: 'titania', size: 3.6, color: 0xb2aaa2, dir: equatorialDir(URANUS_LAT, 17.1, -128), axis: poleAxis(URANUS_LAT), rate: 0.0013, lumpy: false },
      { id: 'miranda', size: 3.0, color: 0xaaa8a4, dir: equatorialDir(URANUS_LAT, 5.1, -104), axis: poleAxis(URANUS_LAT), rate: 0.0018, lumpy: true },
    ],
    stars2: [],
    // The ringlets from ring 6 out to the ε ring.
    rings: { latDeg: URANUS_LAT, inner: 1.62, outer: 2.02, color: [0.30, 0.31, 0.32], opacity: 0.55, kind: 'uranus' },
  },
  ground: {
    plain: [0.55, 0.76, 0.78], dark: [0.30, 0.50, 0.54], pale: [0.80, 0.92, 0.92],
    rockA: 0x5a7a80, rockB: 0x9abcc0,
    dust: [0.6, 0.75, 0.78], dunes: 0, craters: 0, relief: 0,
    warp: 0, mesas: 0, terraces: 0,
    slopeRock: [0.4, 0.56, 0.6], sand: [0.55, 0.76, 0.78],
    water: null, seed: 1921,
  },
  atmosphere: {
    rayleigh: [0.07, 0.14, 0.20], absorb: [0.16, 0.03, 0.02], mie: 0.025, mieTint: [0.8, 1, 1], mieG: 0.7, turbidity: 3,
    sunIntensity: 13, sunTint: [0.9, 1, 1], ambient: [0.02, 0.045, 0.05],
    hazeBeta: 1.2e-3, hazeColor: [0.26, 0.52, 0.56], hazeSun: [0.44, 0.68, 0.70],
  },
  clouds: { coverage: 0.3, altitude: 1600, thickness: 260, scale: 2200, wind: [14, -2], lit: [0.92, 1.0, 1.0], shade: [0.46, 0.62, 0.66], kind: 'wisps' },
  giant: null, formations: null, crystals: null,
  ambientC: -197,
  walkRadius: DECK_R - 2.6,
  pad: { x: 0, z: -26 },
  deck: {
    radius: DECK_R, seaDepth: 50,
    sea: [[0.24, 0.42, 0.46], [0.48, 0.70, 0.73], [0.70, 0.88, 0.89], [0.92, 1.0, 1.0]],
    towers: 18, wind: [2.6, -0.3],
  },
};

/** Neptune: 12° S, by the bright companion clouds of a dark spot. Deeper
 *  blue than Uranus, with white methane-ice clouds standing out of it; the
 *  fastest winds in the Solar System; Triton, big and pale, going round
 *  backwards. */
const NEPTUNE_LAT = -12;
export const NEPTUNE: WorldProfile = {
  id: 'neptune',
  gravity: 11.15,
  sunDir: v(0.45, 0.55, -0.5),
  sun: {
    color: 0xe8f2ff, intensity: 1.3,
    disc: c(5.8, 6.0, 6.4), discScale: 6,
    halo: 0xdcecff, haloOpacity: 0.12, haloScale: 160,
  },
  sky: {
    zenith: c(0.04, 0.10, 0.30), horizon: c(0.24, 0.40, 0.70),
    glow: c(0.8, 0.9, 1.0), glowPower: 8,
    fillSky: 0x5a7ec8, fillGround: 0x1e3466, fill: 1.05,
    fog: 0x2e4a86, fogNear: 200, fogFar: 2400,
    stars: 0,
    aurora: false,
    moons: [
      // Triton orbits backwards, but Neptune's 16-hour turn still carries
      // it east to west, a little faster than the rest of the sky.
      { id: 'triton', size: 8, color: 0xd6cfc8, dir: equatorialDir(NEPTUNE_LAT, 14.3, -118), axis: poleAxis(NEPTUNE_LAT), rate: -0.0022, lumpy: false },
    ],
    stars2: [],
  },
  ground: {
    plain: [0.20, 0.34, 0.66], dark: [0.08, 0.16, 0.40], pale: [0.60, 0.72, 0.92],
    rockA: 0x2a3e70, rockB: 0x6a84c0,
    dust: [0.3, 0.4, 0.7], dunes: 0, craters: 0, relief: 0,
    warp: 0, mesas: 0, terraces: 0,
    slopeRock: [0.16, 0.26, 0.5], sand: [0.2, 0.34, 0.66],
    water: null, seed: 3071,
  },
  atmosphere: {
    rayleigh: [0.035, 0.08, 0.32], absorb: [0.40, 0.16, 0.0], mie: 0.015, mieTint: [0.6, 0.75, 1], mieG: 0.7, turbidity: 3,
    sunIntensity: 12, sunTint: [0.85, 0.95, 1], ambient: [0.01, 0.02, 0.05],
    hazeBeta: 1.1e-3, hazeColor: [0.16, 0.28, 0.56], hazeSun: [0.38, 0.52, 0.82],
  },
  clouds: { coverage: 0.34, altitude: 1400, thickness: 340, scale: 1500, wind: [40, 4], lit: [0.96, 0.98, 1.0], shade: [0.40, 0.50, 0.70], kind: 'wisps' },
  giant: null, formations: null, crystals: null,
  ambientC: -201,
  walkRadius: DECK_R - 2.6,
  pad: { x: 0, z: -26 },
  deck: {
    radius: DECK_R, seaDepth: 50,
    sea: [[0.05, 0.10, 0.28], [0.14, 0.26, 0.58], [0.40, 0.56, 0.86], [0.96, 0.98, 1.0]],
    towers: 22, wind: [5.0, 0.6],
  },
};

export const WORLDS: Record<WorldId, WorldProfile> = {
  mars: MARS, proximaB: PROXIMA_B, earth: EARTH,
  mercury: MERCURY, venus: VENUS, jupiter: JUPITER, saturn: SATURN, uranus: URANUS, neptune: NEPTUNE,
};

/** The bodies a ship can go down to, and how low it must be, km: about one
 *  radius of the real body. Anywhere over Earth comes down in Tbilisi; over
 *  a giant, at its outpost. */
export const LANDING_SITES: Record<string, number> = {
  moon: 2500, mars: 4200, proximaB: 4200, earth: 6000,
  mercury: 3000, venus: 6000, jupiter: 70000, saturn: 58000, uranus: 25000, neptune: 25000,
};

/** The giants, whose floor is an outpost's deck over the clouds. */
export function isDeckWorld(id: string): boolean {
  return id in WORLDS && !!WORLDS[id as WorldId].deck;
}

export function isWorldId(id: string): id is WorldId {
  return (WORLD_IDS as readonly string[]).includes(id);
}
