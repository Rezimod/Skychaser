// Where the gems are: one fixed layout per world, the same for every player
// and every quality preset, shared by the game (which draws them and lets
// the crew pick them up) and the server (which only accepts an id that is
// in this layout, and prices it from its kind).
//
// Pure and dependency-free on purpose — no three.js, no profiles — so the
// API routes can import it cheaply. The few numbers it shares with the
// scenes (walk radii, the landing pads, the outposts' habitats, the giants'
// envelopes, the Proxima lake) are copied here and checked against the
// scenes' own constants in gem-layout.test.
//
// Each world has three tiers:
// - `near`: on the ground round the landing site and the base;
// - `far`: on the ground further out, toward the edge of the walk;
// - `high`: up where only the jetpack reaches — on the habitat roofs, on
//   rock spires, on the giants' balloon envelopes, or floating free.
// `alt` is the height of the gem's centre over the local floor; the game
// resolves the floor (terrain, deck, bridge) when it builds the scene.

export type GemKind = 'diamond' | 'emerald' | 'ruby' | 'sapphire' | 'gold' | 'meteorite' | 'ice';
export const GEM_KINDS: readonly GemKind[] = ['diamond', 'emerald', 'ruby', 'sapphire', 'gold', 'meteorite', 'ice'];

export interface GemKindInfo {
  points: number;
  /** Relative chance of being picked where the world allows the kind. */
  rarity: 'legendary' | 'epic' | 'rare' | 'common';
  /** The glow, linear RGB (multiplied into HDR by the renderer). */
  color: [number, number, number];
  /** 0: a cut stone; 1: a rough lump (a nugget, a meteorite). */
  rough: 0 | 1;
}

export const GEM_INFO: Record<GemKind, GemKindInfo> = {
  diamond: { points: 50, rarity: 'legendary', color: [0.86, 0.95, 1.0], rough: 0 },
  meteorite: { points: 40, rarity: 'epic', color: [1.0, 0.42, 0.12], rough: 1 },
  emerald: { points: 30, rarity: 'epic', color: [0.12, 1.0, 0.42], rough: 0 },
  ruby: { points: 25, rarity: 'rare', color: [1.0, 0.08, 0.2], rough: 0 },
  sapphire: { points: 20, rarity: 'rare', color: [0.16, 0.36, 1.0], rough: 0 },
  ice: { points: 15, rarity: 'common', color: [0.55, 0.92, 1.0], rough: 0 },
  gold: { points: 10, rarity: 'common', color: [1.0, 0.72, 0.18], rough: 1 },
};

export type GemWorld = 'moon' | 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'proximaB';
/** Every world with gems, in the order the menus list them (out from the Sun, the Moon after Earth, Proxima b last). */
export const GEM_WORLDS: readonly GemWorld[] = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'proximaB'];
export const isGemWorld = (v: unknown): v is GemWorld => typeof v === 'string' && (GEM_WORLDS as readonly string[]).includes(v);

export type GemTier = 'near' | 'far' | 'high';

export interface GemSpot {
  /** Stable within the world: `g00`, `g01`… */
  id: string;
  kind: GemKind;
  tier: GemTier;
  x: number;
  z: number;
  /** Height of the gem's centre over the local floor, m. */
  alt: number;
  /** A high gem that may sit on the top of a rock formation near its spot, where the scene has one. */
  perch?: boolean;
}

/** The highest any gem floats over its floor, m: inside what the suit's free flight reaches (~120 m). */
export const GEM_MAX_ALT = 118;
/** Ground gems sit this high (their centre), m. */
export const GEM_GROUND_ALT = 0.55;
/** Below this height over the floor a crew cannot reach a gem without the jetpack (the best jump is ~3 m on the Moon). */
export const GEM_FLY_ONLY_ALT = 6;

// ── The scenes' numbers this layout leans on (checked in gem-layout.test). ──

/** The fence round each scene, m from the origin. */
export const GEM_WALK_RADIUS: Record<GemWorld, number> = {
  moon: 165, mercury: 165, venus: 150, earth: 1950, mars: 165, proximaB: 165,
  jupiter: 42 - 2.6, saturn: 42 - 2.6, uranus: 42 - 2.6, neptune: 42 - 2.6,
};
const DECK_WORLDS: readonly GemWorld[] = ['jupiter', 'saturn', 'uranus', 'neptune'];
export const isDeckGemWorld = (w: GemWorld) => DECK_WORLDS.includes(w);
/** Where the ship sets down. */
export const GEM_LANDING: Record<GemWorld, { x: number; z: number }> = {
  moon: { x: 0, z: 20 }, mercury: { x: 0, z: 20 }, venus: { x: 0, z: 20 }, earth: { x: 0, z: 0 }, mars: { x: 0, z: 20 }, proximaB: { x: 0, z: 20 },
  jupiter: { x: 0, z: 0 }, saturn: { x: 0, z: 0 }, uranus: { x: 0, z: 0 }, neptune: { x: 0, z: 0 },
};
/** The roofs: where a gem sits on top of a building, and how high its centre is over the floor. */
const ROOFS: Partial<Record<GemWorld, { x: number; z: number; alt: number }[]>> = {
  // Stellar Base's three domes (moon-base: DOME_TOP 9 m, a beacon on top).
  moon: [{ x: -21, z: -18, alt: 10.4 }, { x: 0, z: -26, alt: 10.4 }, { x: 21, z: -18, alt: 10.4 }],
  // Mars Base's bermed habitats (world-mars-base: the heap tops out near 6.6 m).
  mars: [{ x: -16, z: -52, alt: 7.8 }, { x: 0, z: -58, alt: 7.8 }, { x: 16, z: -52, alt: 7.8 }],
  // The outposts' two modules (world-outpost: 2.9 m axis, 2.4–2.6 m hull).
  mercury: [{ x: -10, z: -8, alt: 6.7 }, { x: 10, z: -8, alt: 6.7 }],
  venus: [{ x: -10, z: -8, alt: 6.9 }, { x: 10, z: -8, alt: 6.9 }],
};
/** The giants: two modules on the deck, three envelopes overhead (world-outpost ENVELOPES, ENVELOPE_AT). */
const DECK_ROOFS = [{ x: -10, z: -28, alt: 6.7 }, { x: 10, z: -28, alt: 6.7 }];
/** The giants' three balloon envelopes: their bearings round the deck, degrees, and where and how big they are. */
export const ENVELOPE_BEARINGS = [30, 210, 270];
export const ENVELOPE_AT = { r: 30, y: 62, rx: 15, ry: 10.5 };
/** Proxima b's lake and the village beside it (world-profiles PROXIMA_B.ground.water, world-flora). */
export const PROXIMA_WATER = { x: 62, z: 48, r: 44 };
export const PROXIMA_VILLAGE = { x: 0, z: 52, r: 22 };

interface KeepOut { x: number; z: number; r: number }
/** Ground that a gem must not be placed on, beyond the landing pad: the bases' buildings, holes and the like. */
const KEEP_OUT: Partial<Record<GemWorld, KeepOut[]>> = {
  moon: [
    { x: -21, z: -18, r: 9 }, { x: 0, z: -26, r: 9 }, { x: 21, z: -18, r: 9 }, { x: -10.5, z: -21.5, r: 6 }, { x: 10.5, z: -21.5, r: 6 },
    { x: -22, z: 30, r: 6 }, { x: 3, z: 12, r: 3 }, { x: 0, z: 6, r: 3 },
    { x: -58, z: -44, r: 8 }, { x: 94, z: -72, r: 10 }, { x: 26, z: 39, r: 4 },
  ],
  mars: [
    { x: -16, z: -52, r: 10 }, { x: 0, z: -58, r: 10 }, { x: 16, z: -52, r: 10 },
    { x: 66, z: -64, r: 13 }, { x: -49, z: -65, r: 13 },
  ],
  mercury: [{ x: 0, z: -8, r: 17 }],
  venus: [{ x: 0, z: -8, r: 17 }],
  proximaB: [{ ...PROXIMA_WATER, r: PROXIMA_WATER.r * 1.08 }, { ...PROXIMA_VILLAGE, r: PROXIMA_VILLAGE.r + 6 }],
};

const SEED: Record<GemWorld, number> = {
  moon: 9011, mercury: 1601, venus: 2251, earth: 4144, mars: 4311, proximaB: 7727,
  jupiter: 5201, saturn: 5691, uranus: 1921, neptune: 3071,
};

/** Which kinds each world grows, and how likely each is (higher is commoner). */
const POOLS: Record<GemWorld, Partial<Record<GemKind, number>>> = {
  moon: { diamond: 0.6, meteorite: 2.5, sapphire: 3, gold: 4 },
  mercury: { diamond: 1, meteorite: 2, ruby: 3, gold: 5 },
  venus: { diamond: 1, emerald: 2, ruby: 3, sapphire: 2, gold: 4 },
  earth: { diamond: 1, emerald: 3, ruby: 3, sapphire: 3, gold: 4 },
  mars: { diamond: 0.7, meteorite: 2, emerald: 2, ruby: 3, gold: 4 },
  proximaB: { diamond: 1, emerald: 4, sapphire: 3, ruby: 2 },
  // Diamond rain: the giants' deep air is thought to make them.
  jupiter: { diamond: 0.5, sapphire: 2, ice: 6 },
  saturn: { diamond: 0.5, sapphire: 2, ice: 6 },
  uranus: { diamond: 0.7, sapphire: 2, ice: 6 },
  neptune: { diamond: 0.7, sapphire: 2, ice: 6 },
};

function hash(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const round = (v: number, step = 0.5) => Math.round(v / step) * step;

/** A kind from the world's pool; up high, the rare ones are likelier. */
function pickKind(world: GemWorld, tier: GemTier, u: number): GemKind {
  const pool = POOLS[world];
  const entries = (Object.entries(pool) as [GemKind, number][]).map(([k, w]) => {
    const rare = GEM_INFO[k].points >= 30;
    return [k, tier === 'high' && rare ? w * 3 : tier === 'far' && rare ? w * 1.6 : w] as [GemKind, number];
  });
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  let t = u * sum;
  for (const [k, w] of entries) { t -= w; if (t <= 0) return k; }
  return entries[entries.length - 1][0];
}

// ── Tbilisi, by hand, on the baked map: Rike Park round the landing site,
// then the Bridge of Peace, Narikala, Kartlis Deda, the old baths, Sameba
// and the rooftop with the telescope. Checked against the city's buildings
// and the river in gem-layout.test. ──
const EARTH: Omit<GemSpot, 'id' | 'kind'>[] = [
  // Rike Park, on the grass and the paths.
  ...([[-30.5, -38.5], [-78.5, -64], [-54.5, 93.5], [-91, 89.5], [-103.5, -32], [-66, -83.5], [-42, 142], [40.5, 163],
    [-34, 68], [-19, 44.5], [-73.5, 186], [36, -21], [66.5, 44], [-92, 41.5]] as const)
    .map(([x, z]) => ({ tier: 'near' as const, x, z, alt: GEM_GROUND_ALT })),
  // Further out, on foot (the rooftop by its stairwell).
  { tier: 'far', x: -185, z: 60, alt: GEM_GROUND_ALT }, // the Bridge of Peace, on the deck
  { tier: 'far', x: -480, z: 612, alt: GEM_GROUND_ALT }, // Kartlis Deda's terrace
  { tier: 'far', x: -271, z: 620, alt: GEM_GROUND_ALT }, // the cable car's top station
  { tier: 'far', x: -227, z: 611, alt: GEM_GROUND_ALT }, // under Narikala's west tower
  { tier: 'far', x: -120, z: 700, alt: GEM_GROUND_ALT }, // Narikala's slope
  { tier: 'far', x: 80, z: 700, alt: GEM_GROUND_ALT }, // Abanotubani, by the baths
  { tier: 'far', x: 420, z: -380, alt: GEM_GROUND_ALT }, // Sameba's garden
  { tier: 'far', x: -330, z: 610, alt: GEM_GROUND_ALT }, // the path along the ridge
  { tier: 'far', x: 675.5, z: -1034, alt: 24 }, // the rooftop, by the telescope
  // Up high.
  { tier: 'high', x: -200, z: 61, alt: 27 }, // over the Bridge of Peace's canopy
  { tier: 'high', x: -487.5, z: 600, alt: 22.5 }, // Kartlis Deda's crown
  { tier: 'high', x: 504, z: -447, alt: 91 }, // Sameba's cross
  { tier: 'high', x: -145.5, z: 672, alt: 17.5 }, // Narikala's towers
  { tier: 'high', x: -188.5, z: 674.5, alt: 17.5 },
  { tier: 'high', x: -89.5, z: 341.5, alt: 28 }, // along the cable car
  { tier: 'high', x: -162, z: 448, alt: 34 },
  { tier: 'high', x: -25, z: -100, alt: 30 }, // over the concert hall's tubes
  { tier: 'high', x: 0, z: 60, alt: 45 }, // over the park
];

function rockyWorld(world: GemWorld): Omit<GemSpot, 'id' | 'kind'>[] {
  const seed = SEED[world];
  const R = GEM_WALK_RADIUS[world];
  const pad = GEM_LANDING[world];
  const keep: KeepOut[] = [{ ...pad, r: 14 }, ...(KEEP_OUT[world] ?? [])];
  const out: Omit<GemSpot, 'id' | 'kind'>[] = [];
  const clear = (x: number, z: number, gap: number) =>
    !keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 1.5) && !out.some((o) => Math.hypot(o.x - x, o.z - z) < gap);
  const scatter = (tier: GemTier, want: number, rMin: number, rMax: number, gap: number, alt: (i: number) => number, salt: number) => {
    let got = 0;
    for (let i = 0; i < want * 60 && got < want; i++) {
      const a = hash(i, 1, seed + salt) * Math.PI * 2;
      const d = rMin + Math.sqrt(hash(i, 2, seed + salt)) * (rMax - rMin);
      // Round the base (the origin), not the pad: that is where the walk is.
      const x = round(Math.cos(a) * d); const z = round(Math.sin(a) * d);
      if (Math.hypot(x, z) > R - 10) continue;
      if (tier !== 'high' && !clear(x, z, gap)) continue;
      if (tier === 'high' && out.some((o) => o.tier === 'high' && Math.hypot(o.x - x, o.z - z) < gap)) continue;
      out.push({ tier, x, z, alt: alt(i), ...(tier === 'high' ? { perch: true } : {}) });
      got += 1;
    }
  };
  scatter('near', 10, 20, 62, 11, () => GEM_GROUND_ALT, 11);
  scatter('far', 10, 70, R - 12, 22, () => GEM_GROUND_ALT, 23);
  for (const r of ROOFS[world] ?? []) out.push({ tier: 'high', x: r.x, z: r.z, alt: r.alt });
  const roofs = (ROOFS[world] ?? []).length;
  scatter('high', 8 - Math.min(roofs, 3), 18, R - 20, 30, (i) => round(14 + hash(i, 7, seed + 31) * 92), 31);
  return out;
}

function deckWorld(world: GemWorld): Omit<GemSpot, 'id' | 'kind'>[] {
  const seed = SEED[world];
  const out: Omit<GemSpot, 'id' | 'kind'>[] = [];
  // Six on the deck, round the pad and clear of the modules.
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * Math.PI * 2 + hash(k, 1, seed) * 0.4;
    const d = 18 + hash(k, 2, seed) * 14;
    let x = round(Math.cos(a) * d); let z = round(Math.sin(a) * d);
    // The modules stand at (±10, −28): step a gem that lands on one out onto open deck.
    if (Math.abs(z + 28) < 6 && Math.abs(x) < 17) { z = -16; x = x < 0 ? -22 : 22; }
    out.push({ tier: 'near', x, z, alt: GEM_GROUND_ALT });
  }
  // On the two roofs and the three envelopes' crowns.
  for (const r of DECK_ROOFS) out.push({ tier: 'high', x: r.x, z: r.z, alt: r.alt });
  for (const deg of ENVELOPE_BEARINGS) {
    const a = (deg * Math.PI) / 180;
    out.push({ tier: 'high', x: round(Math.cos(a) * ENVELOPE_AT.r), z: round(Math.sin(a) * ENVELOPE_AT.r), alt: ENVELOPE_AT.y + ENVELOPE_AT.ry + 1.4 });
  }
  // Seventeen floating over the deck, from just above the rail to near the top of the flight, clear of the envelopes.
  let got = 0;
  for (let i = 0; i < 400 && got < 17; i++) {
    const a = hash(i, 3, seed) * Math.PI * 2;
    const d = 6 + Math.sqrt(hash(i, 4, seed)) * 28;
    const x = round(Math.cos(a) * d); const z = round(Math.sin(a) * d);
    const alt = round(8 + hash(i, 5, seed) * 108);
    if (insideEnvelope(x, alt, z, 4)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z, (o.alt - alt) * 0.6) < 14)) continue;
    out.push({ tier: 'high', x, z, alt });
    got += 1;
  }
  return out;
}

/** Inside (or within `margin` of) one of the giants' balloon envelopes; y is over the deck. */
export function insideEnvelope(x: number, y: number, z: number, margin = 0): boolean {
  for (const deg of ENVELOPE_BEARINGS) {
    const a = (deg * Math.PI) / 180;
    const ex = Math.cos(a) * ENVELOPE_AT.r; const ez = Math.sin(a) * ENVELOPE_AT.r;
    const rx = ENVELOPE_AT.rx + margin; const ry = ENVELOPE_AT.ry + margin;
    const k = ((x - ex) / rx) ** 2 + ((y - ENVELOPE_AT.y) / ry) ** 2 + ((z - ez) / rx) ** 2;
    if (k < 1) return true;
  }
  return false;
}

const cache = new Map<GemWorld, readonly GemSpot[]>();

/** The world's gems. Pure and cached: the same list on every device and on the server. */
export function gemLayout(world: GemWorld): readonly GemSpot[] {
  const hit = cache.get(world);
  if (hit) return hit;
  const seed = SEED[world];
  const raw = world === 'earth' ? EARTH : isDeckGemWorld(world) ? deckWorld(world) : rockyWorld(world);
  const spots: GemSpot[] = raw.map((s, i) => ({ ...s, id: `g${String(i).padStart(2, '0')}`, kind: pickKind(world, s.tier, hash(i, 9, seed)) }));
  // Every world has at least one diamond, and it is the highest gem there.
  if (!spots.some((s) => s.kind === 'diamond')) {
    const top = spots.reduce((a, b) => (b.alt > a.alt ? b : a));
    top.kind = 'diamond';
  }
  const frozen = Object.freeze(spots.map((s) => Object.freeze(s)));
  cache.set(world, frozen);
  return frozen;
}

/** The gem with this id on this world, or null. */
export function findGem(world: GemWorld, id: string): GemSpot | null {
  return gemLayout(world).find((g) => g.id === id) ?? null;
}

export function gemPoints(kind: GemKind): number {
  return GEM_INFO[kind].points;
}

/** What a world holds: how many gems, and how many points they are worth together. */
export function worldGemTotals(world: GemWorld): { count: number; points: number } {
  const list = gemLayout(world);
  return { count: list.length, points: list.reduce((s, g) => s + GEM_INFO[g.kind].points, 0) };
}

/** The points for a set of ids on a world; unknown ids count nothing. */
export function scoreOf(world: GemWorld, ids: Iterable<string>): number {
  const byId = new Map(gemLayout(world).map((g) => [g.id, g]));
  let s = 0;
  for (const id of new Set(ids)) { const g = byId.get(id); if (g) s += GEM_INFO[g.kind].points; }
  return s;
}
