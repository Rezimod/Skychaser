// Base building's rules, with no three.js in them: what can be built, where,
// how it snaps, and when two pieces are in each other's way. The scene uses
// these to colour the ghost; the API uses the same functions to refuse a
// placement, so the client and the server can never disagree about a site.
//
// Every piece stands square to the world: its yaw is a whole quarter turn, so
// a footprint is an axis-aligned rectangle once the turn is applied.

export type BuildWorld = 'moon' | 'mars';
export type BuildScope = 'private' | 'colony';
export type ModuleId = 'habitat' | 'corridor' | 'solar' | 'battery' | 'pad' | 'rocketStand';

export const BUILD_WORLDS: readonly BuildWorld[] = ['moon', 'mars'];
export const BUILD_SCOPES: readonly BuildScope[] = ['private', 'colony'];

/** A module's size on the ground: `w` along its own X, `d` along its own Z, m. */
export interface ModuleSpec {
  id: ModuleId;
  w: number;
  d: number;
  /** How tall it stands, m (the ghost's box, and later the rocket's clearance). */
  h: number;
  /** Key under solarSystem.build.modules. */
  nameKey: string;
}

/** The catalogue, in the order the panel lists it. Sizes are multiples of the grid. */
export const MODULE_SPECS: readonly ModuleSpec[] = [
  { id: 'habitat', w: 6, d: 4, h: 3.4, nameKey: 'habitat' },
  { id: 'corridor', w: 4, d: 2, h: 2.2, nameKey: 'corridor' },
  { id: 'solar', w: 6, d: 2, h: 4.2, nameKey: 'solar' },
  { id: 'battery', w: 2, d: 2, h: 1.9, nameKey: 'battery' },
  { id: 'pad', w: 8, d: 8, h: 0.3, nameKey: 'pad' },
  { id: 'rocketStand', w: 4, d: 4, h: 9, nameKey: 'rocketStand' },
];

export const moduleSpec = (id: string): ModuleSpec | null => MODULE_SPECS.find((m) => m.id === id) ?? null;

export const GRID = 2;
/** Pieces one player may keep in each scope of one world, and the colony's own ceiling. */
export const CAPS = { private: 60, colony: 40, colonyTotal: 2000 } as const;

export interface Circle { x: number; z: number; r: number }

/** Where each world lets people build. */
export interface BuildSite {
  /** The shared colony: one per world, everybody's pieces. */
  colony: Circle;
  /** Private pieces go anywhere inside this radius of the origin… */
  reach: number;
  /** …outside the colony by this margin, and outside every keep-out. */
  colonyMargin: number;
  keepOut: readonly Circle[];
}

// The Moon. Stellar Base keeps a 60 m circle round its pad (moon-terrain's
// PAD_CENTER, 0, −6); the expedition's sites, the telescope on the ridge and
// the sinkhole keep their own ground. The colony is east of the base, on the
// open mare between the pad and the anomaly crater. The walk ends at 165 m;
// building stops 10 m short of it. (Checked against the scene's own constants
// in build-rules.test.)
const MOON: BuildSite = {
  colony: { x: 90, z: 8, r: 30 },
  reach: 155,
  colonyMargin: 6,
  keepOut: [
    { x: 0, z: -6, r: 60 },    // Stellar Base: habitats, zones, pad and landing zone
    { x: -58, z: -44, r: 14 }, // the telescope station (moon-base-zones TELESCOPE_SITE)
    { x: 94, z: -72, r: 14 },  // the sinkhole (moon-sinkhole SINKHOLE)
    { x: -96, z: 62, r: 14 },  // the survey site (moon-mission SURVEY_SITE)
    { x: 108, z: 84, r: 24 },  // the anomaly crater (moon-mission ANOMALY_SITE)
    { x: -74, z: 46, r: 8 },   // the seismometer job (moon-jobs SEISMO_POINT)
    { x: -58, z: 31, r: 5 },   // sample rocks (moon-jobs SAMPLE_ROCKS)
    { x: -69, z: 12, r: 5 },
  ],
};

// Mars. The whole of Mars Base — habitats, greenhouse, ISRU plant, the
// reactors out at (62…70, −58…−70), the solar field, the cargo ship and the
// 30 m landing zone round (0, 20) — lies inside 86 m of (0, −20). The colony
// is east of the pad, past the base's edge.
const MARS: BuildSite = {
  colony: { x: 105, z: 45, r: 30 },
  reach: 155,
  colonyMargin: 6,
  keepOut: [{ x: 0, z: -20, r: 86 }],
};

export const BUILD_SITES: Record<BuildWorld, BuildSite> = { moon: MOON, mars: MARS };

/** A quarter-turn count, 0…3, from any yaw. */
export const quarterOf = (yaw: number): number => (((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4);
export const yawOfQuarter = (q: number): number => (((q % 4) + 4) % 4) * (Math.PI / 2);
/** The yaw is a whole quarter turn (within float noise). */
export const isQuarterYaw = (yaw: number): boolean =>
  Number.isFinite(yaw) && Math.abs(yaw - Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2)) < 1e-3;

/** The footprint's extent along world X and Z once turned. */
export function extent(spec: ModuleSpec, yaw: number): { w: number; d: number } {
  return quarterOf(yaw) % 2 === 0 ? { w: spec.w, d: spec.d } : { w: spec.d, d: spec.w };
}

/** Snap one axis so the footprint's edges land on grid lines: pieces then tile flush. */
function snapAxis(v: number, size: number): number {
  const off = (size / 2) % GRID;
  return Math.round((v - off) / GRID) * GRID + off;
}

/** Where a piece centred near (x, z) actually goes. */
export function snap(spec: ModuleSpec, x: number, z: number, yaw: number): { x: number; z: number } {
  const e = extent(spec, yaw);
  return { x: snapAxis(x, e.w), z: snapAxis(z, e.d) };
}

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export function rectOf(spec: ModuleSpec, x: number, z: number, yaw: number): Rect {
  const e = extent(spec, yaw);
  return { minX: x - e.w / 2, maxX: x + e.w / 2, minZ: z - e.d / 2, maxZ: z + e.d / 2 };
}

/** Touching edges are fine — that is how corridors meet habitats. */
const EPS = 1e-3;
export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;

/** How far a circle's centre is from a rectangle (0 inside it). */
export function rectDistance(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}
export const rectHitsCircle = (r: Rect, c: Circle): boolean => rectDistance(r, c.x, c.z) < c.r;

/** The rectangle's farthest corner from a point. */
function farCorner(r: Rect, x: number, z: number): number {
  return Math.hypot(Math.max(Math.abs(r.minX - x), Math.abs(r.maxX - x)), Math.max(Math.abs(r.minZ - z), Math.abs(r.maxZ - z)));
}

/** The whole footprint is on ground this scope may use. */
export function inSite(world: BuildWorld, scope: BuildScope, r: Rect): boolean {
  const site = BUILD_SITES[world];
  if (scope === 'colony') return farCorner(r, site.colony.x, site.colony.z) <= site.colony.r;
  if (farCorner(r, 0, 0) > site.reach) return false;
  if (rectDistance(r, site.colony.x, site.colony.z) < site.colony.r + site.colonyMargin) return false;
  return !site.keepOut.some((c) => rectHitsCircle(r, c));
}

/** A piece as the rules see it: where it stands and how big it is. */
export interface PlacedLike { module: string; x: number; z: number; yaw: number }

export type PlaceProblem = 'module' | 'coords' | 'site' | 'overlap';

/**
 * Whether a piece may stand here, among `others` (the pieces that share its
 * ground: the colony's, or the owner's own). The position must already be on
 * the grid — a client that sends anything else is not our client.
 */
export function checkPlacement(world: BuildWorld, scope: BuildScope, p: PlacedLike, others: readonly PlacedLike[]): PlaceProblem | null {
  const spec = moduleSpec(p.module);
  if (!spec) return 'module';
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !isQuarterYaw(p.yaw)) return 'coords';
  const s = snap(spec, p.x, p.z, p.yaw);
  if (Math.abs(s.x - p.x) > 1e-3 || Math.abs(s.z - p.z) > 1e-3) return 'coords';
  const r = rectOf(spec, p.x, p.z, p.yaw);
  if (!inSite(world, scope, r)) return 'site';
  for (const o of others) {
    const os = moduleSpec(o.module);
    if (os && rectsOverlap(r, rectOf(os, o.x, o.z, o.yaw))) return 'overlap';
  }
  return null;
}
