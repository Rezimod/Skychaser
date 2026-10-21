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

import * as THREE from 'three';

export type WorldId = 'mars' | 'proximaB' | 'earth';

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
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();
const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

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

export const WORLDS: Record<WorldId, WorldProfile> = { mars: MARS, proximaB: PROXIMA_B, earth: EARTH };

/** The bodies a ship can go down to, and how low it must be, km. Anywhere over Earth comes down in Tbilisi. */
export const LANDING_SITES: Record<string, number> = { moon: 2500, mars: 4200, proximaB: 4200, earth: 6000 };

export function isWorldId(id: string): id is WorldId {
  return id === 'mars' || id === 'proximaB' || id === 'earth';
}
