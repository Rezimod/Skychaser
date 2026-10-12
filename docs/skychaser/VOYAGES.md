# Voyages — a holder flies to the object on their card

Status: V0 done 2026-09-27 (4c3b69f): Explore flies at `/voyage`. V1 done
2026-09-27 (aee4733): 35 cards have a destination (`src/lib/skychaser/voyage.ts`),
`GET /api/skychaser/voyage?wallet=` returns a holder's, and `/voyage` loads them
into `src/game/destinations.ts` for the game to read. V2 next.
V1 notes: no surface has named spots yet, so the four surface cards land on
the Moon or Mars with no `spot`; KRAKEN-MARE flies to Titan (no Titan surface);
CEN-A was added (it is placed); M31 and MILKY-WAY have no game id yet.

A holder opens Explore, finds every card they hold marked as a destination,
flies there, and looks at the object. The visit is recorded against their
edition. Objects they do not hold stay visible but locked, with a way to the set.

## What already lines up

- **Ownership is one query.** `edition.owner_wallet` is the holder's Privy
  Solana wallet; `holderView(db, wallet)` in `src/lib/skychaser/repo.ts` already
  returns designation, name, edition number, edition size and rarity.
- **Every card has a place.** Card facts carry `targetId`, `raHours`, `decDeg`
  and `record.family` (`near | stars | deep | galaxies | extremes | frontier | almanac`).
  Cards have no distance; the game needs one, so the destination table below supplies it.
- **The game already places the sky in 3D.** `galactic-scene.ts` holds 38
  objects with RA, Dec and parsecs: 20 bright stars, 12 nearby systems
  (TRAPPIST-1 among them), and LMC, SMC, M33, M51, M104, M87. Solar-system
  bodies, moons (Io, Europa, Ganymede, Callisto, Titan, Phobos, Deimos),
  Pluto, the five probes and the black hole are flyable. The Moon and Mars have surfaces.
- **There is an observing view.** `TelescopeEyepiece.tsx`, and every card has
  plate art (`public/cards/plate/<DES>/{sky,object}.webp`).

## What is in the way

1. **Explore is not in the Stellar app.** Phase 2 moved it to `tools/explore/`,
   outside the build (`tsconfig` excludes `tools/**`). That copy dates from
   2026-09-19; the game has had about 40 commits since, on
   `audit/stellar-explore-20260924` (5c7eac6, one ahead of `origin/main`).
2. **Two sites.** Stellar is its own Vercel project (app.stellarr.club);
   Explore's last live home is stellarr.club/play. Voyages belongs on Stellar,
   because the holder's session and wallet live there.
3. **Weight.** Explore is heavy on phones, and Stellar's home is now fast (LCP
   1.8 s throttled). Explore must load only on its own route, never in the root layout.
4. **Vocabulary.** "Observation" means a Node 01 capture of the real sky
   (RULES.md). A visit in the game must not be presented as one. The game
   record is called a **voyage**, and it never touches
   `edition.observation_capture_id`.

## Phases

One phase per commit, `feat(stellar): voyages N — <summary>`, on `skychaser`.
tsc, test and build pass before each.

### V0 — Bring Explore back into the app
- Replace `tools/explore/` with the current game from
  `audit/stellar-explore-20260924`: `src/lib/solar-system/*`,
  `src/components/solar-system/*`, `src/lib/multiplayer/*`, `public/explore/`,
  the tests. Deletion of `tools/explore/` in its own commit. Keep
  `render-card.ts` if the card renderer is still wanted (open question V-1).
- Route `/voyage` with its own layout: dynamic import, `ssr: false`, and
  Explore's CSS and next-intl messages scoped to that layout. Nothing added to the root layout.
- Leave out what Stellar does not need: backrooms, build mode, and multiplayer
  rooms (open question V-2).
- Gate: `/voyage` flies at 390 px and 1440 px; the home page's First Load JS does not grow.

### V1 — Destinations and holdings
- `src/lib/skychaser/voyage.ts`: designation → `{ kind: 'body' | 'surface' | 'star' | 'system' | 'galaxy' | 'blackhole', gameId, spot? }`.
  One table, checked by a test so that every entry resolves to an id the game knows.
- `GET /api/skychaser/voyage?wallet=` returns the holder's destinations: designation,
  edition number, edition size, rarity, `gameId`. Public, like the Collection
  page; rate-limited like `/api/skychaser/holder`.
- Explore reads it on load through `useStellarHolder`. Signed out means
  everything is visible and locked.
- Gate: a wallet holding MARS and SIRIUS sees exactly those two unlocked.

### V2 — Marked, locked, reached
- `flight-targeting` gains a held flag: held destinations get a beacon with
  the card name and edition number ("Sirius · edition 7 of 30"), plus a
  "Your cards" list in the deck. Pick one and the autopilot or hyperdrive sets course.
- Locked destinations: dimmed marker, the card's silhouette, and a link to its card page.
- Hyperdrive routes widen from `sol | alphaCentauri | gargantua` to every
  star in the table; bright stars reuse the Alpha Centauri arrival,
  coloured by spectral class.

### V3 — Arrival and the look
- On arrival: hold position, the object fills the view, and the card plate
  fades in as the eyepiece frame. Figures and the card's two-line story come
  from `plate.ts` and `record`.
- `voyage_log (id, edition_id, wallet, designation, visited_at)`, written by
  `POST /api/skychaser/voyage` with the Privy token, and only when the wallet matches the
  session and holds that edition. One row per edition per day.
- The card page and the Collection show "Visited 3 times, first on 27 September".
- Schema change on the skychaser Neon branch only; the owner runs it.

### V4 — Deep sky, extremes, fiction (later, one scene type per commit)
- Nebula scene (M42, M16, M1, Horsehead, Carina…), cluster scene (M45, M13,
  Omega Cen, M44…), galaxy approach (M31, M81, Cartwheel…), all driven by the card's colours (`glow`) and plate.
- The black-hole scene restyled per card: SGR-A, CYGNUS-X1, TON-618.
- Frontier fiction cards as authored places (Dyson swarm, derelict, orbital ring).
- Almanac cards as timed events, open only inside their UTC window.

## First version: the cards covered (V0–V3)

**Solar system, flyable today:** SUN, MERCURY, VENUS, MARS, JUPITER, SATURN,
URANUS, NEPTUNE, PLUTO, IO, EUROPA, GANYMEDE, VOYAGER-1.
**Surface spots:** LUNAR-FRAGMENT and TYCHO (Moon), OLYMPUS-MONS and
VALLES-MARINERIS (Mars), KRAKEN-MARE (Titan).
**Stars in the catalog:** SIRIUS, VEGA, ARCTURUS, ALDEBARAN, POLARIS,
BETELGEUSE, ANTARES, RIGEL, ALPHA-CEN, TRAPPIST-1.
**Galaxies already placed (marker plus plate on arrival, full scene in V4):**
LMC, SMC, M33, M51, M104, M87.

That is 34 of 100. Cheap additions, because the star mesh is generic: MIRA,
ALBIREO, ETA-CARINAE, and the exoplanet hosts. Need a new body: ENCELADUS,
HALLEY, OUMUAMUA.

## Open questions (for the owner)

- **V-1** Keep the phase-7 card renderer (`render-card.ts`) or drop it with `tools/explore/`?
- **V-2** Multiplayer rooms in Voyages: out for the first version (the recommendation), or kept?
- **V-3** Should a voyage count for anything (the vote weight, a mark on the
  card), or be a record only? The recommendation is record only, matching
  "records, not rewards" from the Explore upgrade.
- **V-4** Retire stellarr.club/play once `/voyage` is live, or keep both?

Answered 2026-09-27: V-1 drop it, V-2 no rooms at first, V-3 record only,
V-4 redirect /play to /voyage a week after launch.
