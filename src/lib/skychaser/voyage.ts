/**
 * Where each card takes its holder in Voyage.
 *
 * Only cards the game can reach today are listed; a card missing here has no
 * destination yet. Every id is one the game already uses — a solar-system
 * body, moon or probe; a landing scene; a star or system in the galactic
 * catalogue; a placed galaxy — and src/test/skychaser-voyage.test.ts holds the
 * table to that. A voyage is a record of a visit, never an observation.
 */

export type DestinationKind = 'body' | 'surface' | 'star' | 'system' | 'galaxy' | 'blackhole'

export type Destination = { kind: DestinationKind; gameId: string; spot?: string }

export const VOYAGE_DESTINATIONS: Readonly<Record<string, Destination>> = {
  SUN: { kind: 'body', gameId: 'sun' },
  MERCURY: { kind: 'body', gameId: 'mercury' },
  VENUS: { kind: 'body', gameId: 'venus' },
  MARS: { kind: 'body', gameId: 'mars' },
  JUPITER: { kind: 'body', gameId: 'jupiter' },
  SATURN: { kind: 'body', gameId: 'saturn' },
  URANUS: { kind: 'body', gameId: 'uranus' },
  NEPTUNE: { kind: 'body', gameId: 'neptune' },
  PLUTO: { kind: 'body', gameId: 'pluto' },
  IO: { kind: 'body', gameId: 'io' },
  EUROPA: { kind: 'body', gameId: 'europa' },
  GANYMEDE: { kind: 'body', gameId: 'ganymede' },
  // Titan has no surface in the game yet: its holder flies to the moon.
  TITAN: { kind: 'body', gameId: 'titan' },
  'VOYAGER-1': { kind: 'body', gameId: 'voyager1' },

  // The Moon and Mars can be landed on; neither has named spots yet.
  MOON: { kind: 'surface', gameId: 'moon' },
  'APOLLO-11': { kind: 'surface', gameId: 'moon' },
  'LUNAR-FRAGMENT': { kind: 'surface', gameId: 'moon' },
  TYCHO: { kind: 'surface', gameId: 'moon' },
  'OLYMPUS-MONS': { kind: 'surface', gameId: 'mars' },
  'VALLES-MARINERIS': { kind: 'surface', gameId: 'mars' },

  SIRIUS: { kind: 'star', gameId: 'sirius' },
  VEGA: { kind: 'star', gameId: 'vega' },
  ARCTURUS: { kind: 'star', gameId: 'arcturus' },
  ALDEBARAN: { kind: 'star', gameId: 'aldebaran' },
  POLARIS: { kind: 'star', gameId: 'polaris' },
  BETELGEUSE: { kind: 'star', gameId: 'betelgeuse' },
  ANTARES: { kind: 'star', gameId: 'antares' },
  RIGEL: { kind: 'star', gameId: 'rigel' },
  'ALPHA-CEN': { kind: 'system', gameId: 'alphaCentauri' },
  'TRAPPIST-1': { kind: 'system', gameId: 'trappist1' },

  LMC: { kind: 'galaxy', gameId: 'lmc' },
  SMC: { kind: 'galaxy', gameId: 'smc' },
  M33: { kind: 'galaxy', gameId: 'm33' },
  M51: { kind: 'galaxy', gameId: 'm51' },
  M104: { kind: 'galaxy', gameId: 'm104' },
  M87: { kind: 'galaxy', gameId: 'm87' },
  'CEN-A': { kind: 'galaxy', gameId: 'cen-a' },
}

export type VoyageDestination = Destination & {
  designation: string
  name: string
  editionNumber: number
  editionSize: number
  rarity: string
}

type Held = { designation: string; name: string; editionNumber: number; editionSize: number; rarity: string }

/** One destination per edition held, for the cards that have one. */
export function destinationsFor(editions: Held[]): VoyageDestination[] {
  return editions.flatMap((e) => {
    const d = VOYAGE_DESTINATIONS[e.designation]
    if (!d) return []
    return [{
      designation: e.designation,
      name: e.name,
      editionNumber: e.editionNumber,
      editionSize: e.editionSize,
      rarity: e.rarity,
      ...d,
    }]
  })
}
