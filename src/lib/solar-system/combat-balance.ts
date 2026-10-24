// Combat numbers for Explore Mode, in one place: the player's shields and
// hull, every alien craft's weapons and toughness, which encounters each
// region of the system brings, and a small numeric battle model the tests
// use to prove an early fight is survivable with room to spare.
//
// Pure data and arithmetic — no three.js — so player-ship.ts, aliens.ts and
// the tests all read the same table.

/** ── The player ── */
export const MAX_SHIELD = 150;
export const MAX_HULL = 100;
/** Shields come back a few seconds after the last hit; the hull knits slowly. */
export const SHIELD_REGEN_PER_SEC = 12;
export const SHIELD_REGEN_DELAY = 3.5;
export const HULL_REGEN_PER_SEC = 2;
export const HULL_REGEN_DELAY = 8;
/** Damage one cannon bolt does to an alien craft. */
export const PLAYER_BOLT_DAMAGE = 15;

/** ── Pacing and mercy ── */
/** At most this many craft may be lining up or firing a burst at once. */
export const MAX_SHOOTERS = 2;
/** The first fight of a flight allows only one. */
export const FIRST_FIGHT_SHOOTERS = 1;
/** Hostiles hold fire and pull back once the shields are gone and the hull
 *  is under this fraction, until the shields are back over the second. */
export const MERCY_HULL = 0.35;
export const MERCY_RESUME_SHIELD = 0.4;
/** Live craft at once, whatever the encounter. */
export const MAX_ACTIVE = 8;

/** Enemy damage multiplier by how many fights this flight has seen (1-based). */
export function damageScale(fight: number): number {
  if (fight <= 1) return 0.5;
  if (fight <= 3) return 0.7;
  return 0.85;
}

export type AlienKind =
  | 'probe' | 'saucer' | 'dart' | 'mothership'
  | 'lantern' | 'hauler' | 'raider' | 'drone' | 'gunship' | 'mine' | 'wreck' | 'beacon';

export type Stance = 'friendly' | 'neutral' | 'hostile';

export interface AlienSpec {
  hp: number;
  /** Hit radius in saucer units (S). */
  radius: number;
  /** Top speed, scene units per second, and steering response. */
  speed: number;
  accel: number;
  stance: Stance;
  /** Weapons — zero damage means unarmed. */
  damage: number;
  /** Shots in a burst, and the gap between them. */
  burst: number;
  burstGap: number;
  /** Seconds between bursts, min and max. */
  cooldown: readonly [number, number];
  /** How long the muzzle glows before the first shot. */
  telegraph: number;
  boltSpeed: number;
  /** Aim scatter, in S. */
  spread: number;
}

const unarmed = { damage: 0, burst: 0, burstGap: 0, cooldown: [9, 9] as const, telegraph: 0, boltSpeed: 0, spread: 0 };

export const ALIEN_SPECS: Record<AlienKind, AlienSpec> = {
  // The originals.
  probe: { hp: 30, radius: 0.42, speed: 0.012, accel: 1.6, stance: 'neutral', ...unarmed },
  saucer: { hp: 60, radius: 0.62, speed: 0.012, accel: 1.6, stance: 'hostile', damage: 7, burst: 2, burstGap: 0.22, cooldown: [3.6, 5], telegraph: 0.6, boltSpeed: 0.06, spread: 1.4 },
  dart: { hp: 30, radius: 0.5, speed: 0.024, accel: 3.2, stance: 'hostile', damage: 6, burst: 3, burstGap: 0.16, cooldown: [2.6, 3.8], telegraph: 0.45, boltSpeed: 0.07, spread: 1.4 },
  mothership: { hp: 240, radius: 1.5, speed: 0.006, accel: 0.6, stance: 'hostile', damage: 14, burst: 1, burstGap: 0, cooldown: [5, 6.5], telegraph: 0.9, boltSpeed: 0.045, spread: 1.0 },
  // Friendly: flies alongside, flashes its lights, leaves a gift.
  lantern: { hp: 45, radius: 0.55, speed: 0.016, accel: 2, stance: 'friendly', ...unarmed },
  // Neutral: circles and scans; shot at, it runs.
  hauler: { hp: 90, radius: 0.9, speed: 0.009, accel: 1, stance: 'neutral', ...unarmed },
  // Hostile packs.
  raider: { hp: 45, radius: 0.5, speed: 0.022, accel: 3, stance: 'hostile', damage: 5, burst: 3, burstGap: 0.17, cooldown: [2.8, 4], telegraph: 0.5, boltSpeed: 0.066, spread: 1.5 },
  drone: { hp: 15, radius: 0.32, speed: 0.026, accel: 3.6, stance: 'hostile', damage: 3, burst: 1, burstGap: 0, cooldown: [3, 4.5], telegraph: 0.4, boltSpeed: 0.06, spread: 1.8 },
  gunship: { hp: 300, radius: 1.6, speed: 0.007, accel: 0.7, stance: 'hostile', damage: 10, burst: 3, burstGap: 0.28, cooldown: [5.5, 7], telegraph: 1.0, boltSpeed: 0.05, spread: 1.2 },
  // Hazards and finds.
  mine: { hp: 15, radius: 0.4, speed: 0, accel: 0, stance: 'hostile', ...unarmed, damage: 22 },
  wreck: { hp: 60, radius: 1.1, speed: 0, accel: 0, stance: 'neutral', ...unarmed },
  beacon: { hp: 45, radius: 0.7, speed: 0, accel: 0, stance: 'friendly', ...unarmed },
};

/** Mines: arm when the ship comes this close (S), blow after the fuse, and
 *  hurt anything inside the blast. */
export const MINE_ARM = 7;
export const MINE_FUSE = 1.2;
export const MINE_BLAST = 5;

/** Repair gifts: what each kind of drop restores (hull, shield). */
export const GIFTS = {
  greeting: { hull: 25, shield: 70 },
  beacon: { hull: 10, shield: 90 },
  salvage: { hull: 40, shield: 60 },
  cargo: { hull: 30, shield: 30 },
  wreck: { hull: 35, shield: 30 },
} as const;
export type GiftKind = keyof typeof GIFTS;

/** ── Where things happen ── */
export type AlienZone = 'home' | 'inner' | 'belt' | 'giants' | 'deep';

export type EncounterKind =
  | 'scout' | 'greeter' | 'trader' | 'beacon' | 'wreck'
  | 'raiders' | 'swarm' | 'mines' | 'patrol' | 'carrier' | 'gunship' | 'wave';

/** Weighted encounter tables. Home is peaceful; the belt is raider country;
 *  the giants have patrols and swarms; past Neptune and around other stars
 *  the big ships live. */
export const ZONE_TABLE: Record<AlienZone, Partial<Record<EncounterKind, number>>> = {
  home: { greeter: 4, scout: 3, beacon: 2, trader: 1.5, wreck: 1 },
  inner: { scout: 2, trader: 2, wreck: 2, beacon: 1.5, greeter: 1, raiders: 2 },
  belt: { raiders: 4, mines: 3, wreck: 2, trader: 1, swarm: 1, scout: 1 },
  giants: { patrol: 3, swarm: 3, trader: 2, raiders: 2, greeter: 1, carrier: 1, beacon: 1 },
  deep: { gunship: 2, carrier: 2, swarm: 2, wreck: 2, beacon: 1, greeter: 1, mines: 1 },
};

export const HOSTILE_ENCOUNTERS: ReadonlySet<EncounterKind> = new Set(['raiders', 'swarm', 'mines', 'patrol', 'carrier', 'gunship', 'wave']);

/** Pick an encounter from a zone's table; `r` in [0, 1). */
export function pickEncounter(zone: AlienZone, r: number): EncounterKind {
  const table = ZONE_TABLE[zone];
  let total = 0;
  for (const k in table) total += table[k as EncounterKind] ?? 0;
  let x = r * total;
  for (const k in table) {
    x -= table[k as EncounterKind] ?? 0;
    if (x < 0) return k as EncounterKind;
  }
  return 'scout';
}

/** Orbit radii (distance from the Sun) the zones are cut from; NaN when the
 *  world does not have that planet. */
export interface ZoneOrbits { mars: number; jupiter: number; neptune: number }

const HOME_IDS = new Set(['earth', 'moon', 'iss']);

/** Which region the ship is in, from the system, the world it is nearest
 *  and how far it is from the Sun against the planets' own orbits. */
export function alienZone(systemName: string, nearId: string, sunDist: number, orbits: ZoneOrbits): AlienZone {
  if (systemName && systemName !== 'sol') return 'deep';
  if (orbits.neptune > 0 && sunDist > orbits.neptune * 1.08) return 'deep';
  if (orbits.jupiter > 0 && sunDist > orbits.jupiter * 0.8) return 'giants';
  if (HOME_IDS.has(nearId)) return 'home';
  if (orbits.mars > 0 && sunDist > orbits.mars * 1.15) return 'belt';
  if (nearId === 'ceres' || nearId === 'vesta') return 'belt';
  return 'inner';
}

/** Who turns up for each encounter. */
export function rosterFor(kind: EncounterKind, wave: number, firstFight: boolean): AlienKind[] {
  switch (kind) {
    case 'scout': return ['probe'];
    case 'greeter': return ['lantern'];
    case 'trader': return ['hauler'];
    case 'beacon': return ['beacon'];
    case 'wreck': return ['wreck'];
    case 'raiders': return firstFight ? ['raider', 'raider'] : ['raider', 'raider', 'raider'];
    case 'swarm': return firstFight ? ['drone', 'drone', 'drone', 'drone'] : ['drone', 'drone', 'drone', 'drone', 'drone'];
    case 'mines': return ['mine', 'mine', 'mine', 'mine', 'mine'];
    case 'patrol': return ['saucer', 'dart', 'dart'];
    case 'carrier': return ['mothership', 'dart', 'dart'];
    case 'gunship': return ['gunship', 'drone', 'drone'];
    case 'wave':
      return wave % 4 === 0 ? ['mothership', 'dart', 'dart']
        : wave === 1 ? ['dart'] : wave === 2 ? ['dart', 'dart'] : ['saucer', 'dart', 'dart'];
  }
}

/** ── A numeric battle, for the balance tests ──
 *  Expected-value model: every armed craft cycles cooldown → telegraph →
 *  burst, only `duty` of its cycle is spent pointed at the player (fighters
 *  strafe, break and reposition), only `hitChance` of its shots land, and
 *  no more than the shooter cap fire at once. The player kills the weakest
 *  craft first at `playerDps`, and regenerates under the same rules as the
 *  real ship (no regen while still being hit). */
export interface BattleOptions {
  /** 1-based fight number this flight. */
  fight: number;
  playerDps: number;
  hitChance: number;
  duty: number;
  seconds: number;
  dt?: number;
  /** Apply the mercy break-off rule (the real game does). */
  mercy?: boolean;
}

export interface BattleResult {
  survived: boolean;
  killedAll: boolean;
  /** Seconds until the last craft fell (Infinity if they never did). */
  clearedAt: number;
  minHull: number;
  minShield: number;
  endHull: number;
  endShield: number;
  /** Whether the mercy rule ever had to step in. */
  mercyUsed: boolean;
  damageTaken: number;
}

export function expectedDps(kind: AlienKind, scale: number, hitChance: number, duty: number): number {
  const s = ALIEN_SPECS[kind];
  if (s.damage <= 0 || s.burst <= 0) return 0;
  const cycle = (s.cooldown[0] + s.cooldown[1]) / 2 + s.telegraph + s.burstGap * (s.burst - 1);
  return (s.damage * s.burst * scale * hitChance * duty) / cycle;
}

export function simulateBattle(roster: AlienKind[], o: BattleOptions): BattleResult {
  const dt = o.dt ?? 0.05;
  const scale = damageScale(o.fight);
  const cap = o.fight <= 1 ? FIRST_FIGHT_SHOOTERS : MAX_SHOOTERS;
  // Mines are hazards you fly around, not shooters: leave them out.
  const foes = roster
    .filter((k) => ALIEN_SPECS[k].stance === 'hostile' && k !== 'mine')
    .map((k) => ({ hp: ALIEN_SPECS[k].hp, dps: expectedDps(k, scale, o.hitChance, o.duty) }))
    .sort((a, b) => a.hp - b.hp);
  let shield = MAX_SHIELD;
  let hull = MAX_HULL;
  let sinceHit = 99;
  let minHull = hull;
  let minShield = shield;
  let clearedAt = Infinity;
  let mercy = false;
  let mercyUsed = false;
  let damageTaken = 0;
  for (let t = 0; t < o.seconds; t += dt) {
    // The player works through the pack, weakest first.
    let shot = o.playerDps * dt;
    for (const f of foes) {
      if (f.hp <= 0 || shot <= 0) continue;
      const take = Math.min(f.hp, shot);
      f.hp -= take;
      shot -= take;
    }
    const alive = foes.filter((f) => f.hp > 0);
    if (alive.length === 0 && clearedAt === Infinity) clearedAt = t;
    if (o.mercy !== false) {
      if (!mercy && shield <= 0 && hull < MAX_HULL * MERCY_HULL) {
        mercy = true;
        mercyUsed = true;
      } else if (mercy && shield > MAX_SHIELD * MERCY_RESUME_SHIELD) mercy = false;
    }
    let incoming = 0;
    if (!mercy) {
      const dps = alive.map((f) => f.dps).sort((a, b) => b - a);
      for (let i = 0; i < Math.min(cap, dps.length); i++) incoming += dps[i];
    }
    const dmg = incoming * dt;
    if (dmg > 0) {
      damageTaken += dmg;
      sinceHit = 0;
      const toShield = Math.min(shield, dmg);
      shield -= toShield;
      hull -= dmg - toShield;
    } else {
      sinceHit += dt;
      if (sinceHit > SHIELD_REGEN_DELAY) shield = Math.min(MAX_SHIELD, shield + SHIELD_REGEN_PER_SEC * dt);
      if (sinceHit > HULL_REGEN_DELAY) hull = Math.min(MAX_HULL, hull + HULL_REGEN_PER_SEC * dt);
    }
    minHull = Math.min(minHull, hull);
    minShield = Math.min(minShield, shield);
    if (hull <= 0) break;
  }
  return {
    survived: hull > 0,
    killedAll: clearedAt < Infinity,
    clearedAt,
    minHull,
    minShield,
    endHull: hull,
    endShield: shield,
    mercyUsed,
    damageTaken,
  };
}
