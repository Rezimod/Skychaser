// The leaderboard's shapes, for the game's panel. Skychaser keeps no gem
// store of its own (it has no game accounts, so the panel shows only the
// device's gems); the Stellar platform's store answers these shapes.

export interface GemStanding {
  points: number
  gems: number
  /** 1 is the leader; players with the same score share a rank. Null with no gems. */
  rank: number | null
  /** How many players have any gems. */
  players: number
}

export interface BoardEntry {
  rank: number
  name: string | null
  tag: string
  points: number
  gems: number
  me: boolean
}

/** What GET /api/games/explore/gems/leaderboard answers. */
export interface GemLeaderboard {
  /** False when the store could not answer: the board is empty, not lost. */
  available: boolean
  players: number
  entries: BoardEntry[]
  /** The caller, when a valid token came with the request. */
  me: GemStanding | null
}
