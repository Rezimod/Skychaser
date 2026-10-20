# Explore Mode — Architecture & Audit

Two layers. **§0 is the state now**, at the end of Phase 12 of `EXPLORE-UPGRADE-PLAN.md`. **§1–§6 are the Phase 0 audit** of `origin/main` at `ff33a41` (2026-09-17) — the findings list and the per-phase checklist that the work was pulled from, kept as the record of what was wrong and which phase fixed it. Where the two disagree, §0 is what the code does.

- **Size:** `src/lib/solar-system/` has 96 modules. With `src/components/solar-system/` (14 files) the total is about 35.6k lines.
- **Largest files:** `scene-extras.ts` (2679), `player-ship.ts` (2458), `SolarSystemCanvas.tsx` (1605), `galactic-scene.ts` (1548), `moon-surface.ts` (1309).
- **Verification:** every finding cites lines that were read. The top P1 claims were re-checked by hand, and the numbers come from the bench (§3).

## 0. State at Phase 12 (2026-09-21, `explore/lunar-slice`)

Phases 0–8 are on `origin/main` (`4900130` + `c74816e`); 9, 10, 11 and 12 are on `explore/lunar-slice`, pushed and awaiting review. Nothing here has been merged or deployed.

- **Size:** `src/lib/solar-system/` has 110 modules; with `src/components/solar-system/` (16), `src/game/` (12), `src/components/play/` (10) and `src/lib/multiplayer/` the total is about 42.7k lines. 74 test files, 711 tests.
- **Largest files:** `scene-extras.ts` (2753), `player-ship.ts` (2639), `SolarSystemCanvas.tsx` (1633), `galactic-scene.ts` (1548), `moon-surface.ts` (1367).
- **Models:** eight glTF files in `public/explore/models/` (cosmonaut 1.4 MB, base kit 1.4 MB, ship-stellar 0.9 MB, rover 0.5 MB, ship-fighter 0.5 MB, lander 0.4 MB, ship-cruiser 0.35 MB, crate 0.1 MB), all meshopt-compressed with WebP atlases, built by `assets-src/blender/*.py`.

### 0.1 The game, as it is now

```
/solar-system   the guide: the orrery, SEO copy, and a Launch key → /play
/play           middleware header → its own minimal document (Privy + next-intl only)
                └ PlayClient → GameShell ─ src/game/state.ts: boot → title → loading → playing ⇄ paused → exiting
                                          ├ TitleScreen · PauseMenu · SettingsPanel · ControlsPanel · MissionsPanel
                                          ├ CosmicLoader (real stage progress)
                                          └ GameWorld ─ one scene at a time, keyed by the checkpoint
                                             ├ SolarSystemCanvas (WebGL ctx #1; unmounted while a surface is up)
                                             │   orrery · galactic tiers · flight world · remote fleet
                                             ├ PlayerShip (the deck) ─ player-ship.ts · ship-mesh · flight-camera
                                             │   flight-input · flight-audio · flight-missions · flight-targeting
                                             │   star-routes · aliens · flight-approach (the arrival)
                                             ├ MoonSurface  ─ makeMoonSurface  ┐ both on surface-host.ts
                                             └ WorldSurface ─ makeWorldSurface ┘ (renderer, camera, sun + shadow
                                                 box, light pool, post, perf + governor, live quality preset,
                                                 loop, visibility, pause, context loss, compile, release)
```

- **One state machine** (`src/game/state.ts`), not booleans: `game.travel()`, `game.pause()`, `game.restart()`, `game.exit()`. The checkpoint (`src/game/save.ts`) records the scene; `progress('ready')` writes it.
- **One quality authority** (`src/game/quality.ts`): four presets (`performance`, `balanced`, `high`, `ultra` — the last only ever chosen by hand in Settings), `auto` picked from device signals, a governed floor the runtime governor can lower (never raise), and a preset the player names in Settings that overrides both. `surface-host` applies a change live for everything the renderer owns; build-time detail (props, stars, LOD distances) follows on the next scene.
- **One post chain shape, twice** (`moon-post.ts` for the surfaces, `post-processing.ts` for flight, passes in `post-flare.ts`): Render → god rays (HDR, radial blur toward the sun) → bloom → lens flare (ghosts, halo, anamorphic streak, occluded by the HDR buffer at the sun's pixel) → Output → colour grade (LDR: lift/gamma/gain, split tone) → film (surface only). Each pass follows the profile's `bloom`, `flare`, `godRays`, `grade` flags live; the hosts feed the sun's screen position every frame.
- **The look of the worlds** (`world-sky.ts`, `world-clouds.ts`, `world-giant.ts`, `world-formations.ts`, `world-crystals.ts`, `world-terrain.ts`): an analytic single-scattering sky per profile (`atmosphere`), a raymarched 2.5D cloud deck (`clouds`, steps from the profile's `clouds` level), sun-tinted aerial perspective through the `world-earth-haze` hook, domain-warped relief with terraced mesas and slope-blended rock and sand, instanced mesas, hoodoos, arches, spires and boulders (`formations`), a dramatised ringed giant over Proxima b (`giant`), and collectible emissive crystal clusters (`crystals`, `telemetry.crystals/crystalsTotal`). The Moon keeps to realism: sharper crater crests, stronger ejecta, grazing-angle regolith detail.
- **The suit** (`suit-gear.ts`, `suit-jetpack.ts`): procedural hardware on the rig joints — jet module with tanks and nozzles, chest console, shoulder lamps, helmet ring — and a jetpack (hold jump in the air or J; fuel `telemetry.jetFuel`, regen on the ground, HDR flame cones and a spark stream). Remote crews carry the flame through the sign of `PoseMsg.v` until `room-link.ts` gains a field.
- **The whole planet, from orbit to the ground** (Moon, Mars, Earth; `planet-frame.ts`, `planet-globe*.ts`, `surface-orbit.ts`, `orbital-descent.ts`, `surface-flight.ts`, `entry-fx.ts`): `planet-frame.ts` is the one conversion between a surface scene's local metres (east +X, up +Y, north −Z round the landing site) and planet-centred body-fixed kilometres. The globe is a cube-sphere quadtree with chunked level of detail (33×33 chunks with skirts, built inside a per-frame budget, 40–90 chunks by preset, level 14 at most): procedural craters and maria on the Moon, Tharsis, the basins and canyons on Mars, and real elevation on Earth streamed from the open Terrarium tiles (Web Mercator, through `<img crossOrigin>` so `img-src https:` covers it), over the 4K maps with close-in procedural detail, Earth's night lights, clouds and water, and a Rayleigh/Mie limb and ground haze. The surface post chain draws three layers into one target — the sky (SKY_LAYER), the globe in its own scene and depth range, then the surface scene — and `surface-orbit` keeps them in step each frame: the globe camera, near and far planes, the local ground hidden by altitude (8 km on the Moon and Mars; 12 km and 60 km for Earth's inner and outer grids, which curve to the sphere through `withCurvature`), skies fading to black space above the air. The descent starts in orbit inside the surface scene: orbit, deorbit burn, entry (plasma, bow shock, sparks, turbulence, a sonic boom; the Moon flies a braking burn instead), glide, then the existing powered landing from its start altitude with no jump; the ship rides a precomputed corridor with its own clock rate (up to ×30 in orbit, ×1 for the last kilometre or so) and the pilot can shape it within limits or skip to the handover. Take-off climbs back to orbit before the flight scene resumes. The orrery approach now ends at orbit insertion for these three worlds, behind a calm `insertion` loader. Dev hooks: `skipToEntry()`, `skipOrbit()`, `window.__stellarGlobe` (`lift(altM)`, `stats()`).
- **The landing is flown** (`flight-approach.ts`, `moon-lander.ts`): transit → approach → entry (plasma, buffet, planet title card) → glide, or a retro burn over airless bodies; the shell's loader shows an `entry` variant on the way down and `ascent` on the way up; the surface opens on the player's own ship (`shipKind` threaded from the session; `lander.glb` stays the fallback) coming down on its plumes, and the crew steps out on "Exit ship".
- **One frame accountant** (`moon-perf.ts`): stats every frame, a pixel-ratio governor in quarter steps, and `onOverBudget` for the preset step. `?fixedpx` pins it for benches.
- **One interaction resolver** (`moon-interactions.ts`) shared by the Moon and the worlds: priority, facing, distance; `tap` / `hold` with progress; `requires` blocks rather than hides.
- **One mission engine** (`missions.ts` + `mission-store.ts`), five Moon missions in `moon-missions.ts`, their props in `moon-mission-props.ts`.
- **One model cache** (`src/game/models.ts`): ref-counted glTF, meshopt, `keepNodes` for skinned meshes and named empties, and a prefetch that rides the arrival.
- **Records first, then rewards** (`achievements.ts`): a `RewardSink` interface. `localRewardSink` keeps the records on the device; `syncedRewardSink` wraps it and reports each new one to `POST /api/games/explore/complete`, which prices it from `src/lib/games/explore.ts`, claims a row in the shared Stars ledger (same daily and monthly caps as every other game) and mints to the signed-in Privy wallet, once per achievement per wallet. `useExploreRewards` (in `components/play/`) owns the sink, flushes records made while signed out once a wallet appears, and shows the award on the glass. `GET /api/games/explore` reports what is credited to the mission panel and the `/missions` card.
- **Multiplayer** rides in `GameWorld`: one `RoomLink`, Supabase Realtime, remote crews on the surfaces and a remote fleet in flight.

### 0.2 Persistence (all of Explore)

| Key | Owner | Shape |
|---|---|---|
| `stellar_explore_settings` | `game/settings.ts` | `{v, quality, sensitivity, invertY, fov}` |
| `stellar_explore_save` | `game/save.ts` | `{v, scene, savedAt}` — the checkpoint |
| `stellar_explore_achievements_v1` | `achievements.ts` | one record per finished mission |
| `stellar_explore_credited_v1` | `achievements.ts` | the record ids the platform has credited as Stars |
| `stellar_explore_crystals_v1` | `world-crystals.ts` | `{v, worlds: {[worldId]: collectedIds[]}}` — crystal clusters collected per world |
| `stellar_explore_arrival` | `PlayerShip.tsx` | the arrival has been watched once |
| `stellar_explore_help` / `stellar_hud_layout_v2` | `PlayerShip.tsx` | help seen; touch deck layout |
| `stellar_sound` / `stellar_sound_level` | `sound-prefs.ts` | the switch and the master level |
| `stellar_moon_missions_v1` | `mission-store.ts` | `{done[], rewards[], active}` |
| `stellar_moon_expedition_v2` (migrates `_v1`) | `moon-mission.ts` | the older five-act expedition |
| `stellar_moon_jobs_v1` | `moon-jobs.ts` | `{done[]}` |
| `stellar_moon_backrooms_v1` | `backrooms-save.ts` | `{discovered, escaped, entries, lastSeconds, bestSeconds}` |
| `stellar_tbilisi_expedition_v1` | `world-earth-expedition.ts` | `{stage, found[], parts, aligned}` |
| `stellar_proxima_contact` | `world-surface.ts` | ISO date; written, never read |
| `stellar_expedition_log` | `flight-missions.ts` | discovery ids |

### 0.3 Dev hooks (development builds only)

- Query: `/play?orbit`, `?moon`, `?land=mars|proximaB|earth`, `?fixedpx`, `?backrooms=fall`.
- Window: `__stellarGame` (the state machine), `__stellarQuality` (`level`, `governed`, `step`, `pretend`), `__stellarMoon`, `__stellarWorld`, `__stellarFlight`, `__stellarOrrery`, `__stellarRoom`.
- Harnesses in `scripts/`: `explore-bench.mjs` (6 scenarios), `explore-smoke.mjs` (the shell), `explore-camera.mjs`, `explore-memtest.mjs`, `explore-arrival.mjs` (phase 9), `explore-hud.mjs` (phase 10), `explore-mobile.mjs` (phase 11), `explore-e2e.mjs` (phase 12: the slice, then the explicit checks).

### 0.4 Performance, Phase 0 → Phase 12

Draw calls and triangles repeat run to run (±3) and are the durable comparison. Frame time depends on what else the machine is doing, so both columns carry their load average. The final run (`phase12-final`) was taken on a quiet machine; two earlier Phase 12 runs under load 20–55 reproduced every count exactly and read 33–117 ms.

| Scenario | Draw calls 0 → 12 | Triangles 0 → 12 | Median ms 0 → 12 | p95 ms |
|---|---|---|---|---|
| a orrery | 207 → **153** | 279,810 → **272,410** | 33.4 → **16.7** | 100.0 → 16.8 |
| b flight near Earth | 189 → **88** | 86,064 → **79,254** | 50.0 → **16.7** | 83.4 → 33.3 |
| c Moon at lander | 568 → **311** | 511,391 → **207,316** | 66.7 → **16.7** | 83.3 → 33.4 |
| d Moon facing base | 534 → **286** | 498,991 → **202,775** | 66.6 → **16.7** | 66.7 → 33.4 |
| e Moon driving rover | 481 → **179** | 457,935 → **160,463** | 83.3 → **16.7** | 100.1 → 16.8 |
| f Mars base | 305 → **95** | 379,203 → **123,890** | 50.0 → **16.7** | 66.7 → 16.7 |

Phase 0 ran at load 16–33, Phase 12 at 5.8–9.1: the frame times are not measured under the same weather, and the counts are. Draw calls are down 46–71 %, triangles up to 68 %, and every scenario now holds 60 fps on the Iris Plus 640 when the machine is otherwise idle. One outlier stands in the record: Mars's worst frame in that run was 4.2 s, a single upload stall as the scene opened.

### 0.5 Known limitations at Phase 12

- **The arrival's longest frame is over the 100 ms the plan asked for**: 1067–1183 ms at load 8–17, 2.9 s at load 25. The planet maps decode off the main thread now (`texture-load.ts`); what is left is the GPU upload, which cannot leave it, and the glTF parse behind the prefetch.
- **Records are self-reported.** The platform now credits them as Stars (`/api/games/explore/complete`), bounded by the shared caps and paid once per achievement, but nothing verifies that the mission was played. A verified record needs the server in the loop (see `docs/reputation-economy.md`).
- **Selecting a planet in the orrery shows no facts** and no "observe tonight" link (A20). `PlanetDetailPanel`, `planet-data.ts` and `planet-visibility.ts` were built for it, were never rendered, and were deleted in Phase 12 — they are in git history if that screen is built.
- **The other worlds have no missions.** Mars, Proxima b and Tbilisi have places, people and things to use; the mission engine supports them, and the content is out of this plan's scope.
- **Mid-act progress is not saved**: drill depth, the active job step, rover battery and position, the ship kind and camera zoom all reset. Missions, jobs, records and the checkpoint survive.
- **`stellar_proxima_contact` is written and never read** (E18).
- **Haze reaches what the worlds own.** The base kit, lander, suit, flora and aliens still take the linear fog fallback rather than the sun-tinted haze hook; the two agree to about 300 m.
- **Clouds cast no shadows** on Mars and Proxima b, and at 4 steps the deck shows mild grain.
- **Earth from 20–60 km** shows a colour seam at the edge of the 240 km local terrain, where the globe's own haze begins. The NASA GIBS imagery layer on Earth is behind `GIBS_IMAGERY` in `planet-globe-imagery.ts`; it probes one tile and switches itself off for the session if the host does not answer — it could not be checked from the build machine.
- **Proxima b** still opens its descent at a few hundred metres; the flight from orbit covers the Moon, Mars and Earth.
- **Lint is not configured** — the repo has no ESLint config, so no run has ever claimed lint passed.
- **`world-earth-life.test.ts` "a car stops for someone standing in the road" is flaky**: one failure in a full suite run on 2026-09-21, passing on three runs of its own and every run since.


## 1. System map

*(Phase 0, 2026-09-17. The shape now is §0.1.)*

```
/solar-system  page.tsx → SolarSystemPageClient (dynamic, ssr:false) → SolarSystemExplorer
                                                                       │  10 useStates + one mutable FlightSession (ref)
        ┌──────────────────────────────────────────────────────────────┼───────────────────────────────┐
  SolarSystemCanvas (WebGL ctx #1)                             PlayerShip (flight HUD, 852 lines)       CosmicLoader ×2
  orrery · galactic tiers · flight world                       FlightDrive ×2 · GameStick              (scene, ascent)
  └─ createPlayerShip(session) when session.active             └─ onLand(site) ──┐
     ship-mesh · flight-camera · flight-input · flight-audio                     │ setLanded(site): canvas "suspended"
     flight-missions · flight-targeting · star-routes · aliens                   │ (scene + GPU memory kept, 2×2 buffer)
                                                                                 ▼
                                   MoonSurface.tsx (WebGL ctx #2)             WorldSurface.tsx (WebGL ctx #2)
                                   makeMoonSurface ─ moon-*, suit-*,           makeWorldSurface ─ world-*, world-earth-*
                                   backrooms-* (own scene, same ctx)           reuses moon-cosmonaut/kit/post/perf/lights/camera
                                   onReturn → ascent loader → relaunch flight
```

- **Mode state:** `SolarSystemExplorer` owns `landed`, `flightActive` and `ascent`. There is no state machine (A16).
- **Sim ↔ React:** mutable `input` and `telemetry` objects. Each HUD runs its own rAF that polls telemetry and writes the DOM directly at 30 Hz, with no setState per frame. The exception is the orrery epoch clock (A01).
- **Fixed step:** the Moon and World surfaces step the cosmonaut and rover at 120 Hz with interpolation. Everything else runs on frame dt (C07, D06).
- **Contexts:** a landed session holds two live WebGL contexts, the suspended orrery and the surface (A04). Neither surface calls `forceContextLoss()` on exit (C01, E12).
- **Dev hooks** (non-production only):
  - Query params: `?moon`, `?land=mars|proximaB|earth`, `?fixedpx`, `?backrooms=fall`.
  - Window handles: `window.__stellarMoon`, `__stellarWorld`, `__stellarFlight`.
- **Tests:**
  - Explore-related suites: `suit-locomotion`, `moon-expedition`, `moon-airlock`, `moon-camera-walls`, `world-surface`, `world-earth(-life)`, `player-ship-flight`, `star-routes`, `flight-audio`, `flight-missions`, `game-stick`, `backrooms`.
  - Missing for the plan: frame-rate determinism at 30/60/144 fps, keyboard/gamepad parity, rover suspension at rest.
- **Lint:** no ESLint config exists, so lint is **not configured**.

### Persistence keys (all of Explore)
| Key | Owner | Shape |
|---|---|---|
| `stellar_sound` | `sound-prefs.ts:5` | `'off'` or absent; shared by every mode |
| `stellar_explore_help` | `PlayerShip.tsx:40` | `'1'` |
| `stellar_hud_layout_v2` | `PlayerShip.tsx:73` | touch layout `{[id]: {x,y,s}}` |
| `stellar_expedition_log` | `flight-missions.ts:63` | discovery ids |
| `stellar_moon_expedition_v2` (migrates `_v1`) | `moon-mission.ts:113` | `{stage, rewards[], briefed, cleared[]}` |
| `stellar_moon_jobs_v1` | `moon-jobs.ts:78` | `{done[]}` |
| `stellar_moon_backrooms_v1` | `backrooms-save.ts:12` | `{discovered, escaped, entries, lastSeconds, bestSeconds}` |
| `stellar_proxima_contact` | `world-surface.ts:139` | ISO date. Written but **never read** (E18) |
| `stellar_tbilisi_expedition_v1` | `world-earth-expedition.ts:24` | `{stage, found[], parts, aligned}` |

Not saved: rover battery or position, mid-act progress (drill depth, active job step), ship kind, camera zoom. Phase 7 needs the Moon keys migrated, not wiped.


## 2. Bench harness

`scripts/explore-bench.mjs` runs headless Chromium on the real GPU (`--use-angle=metal`) at 1280×800 with deviceScaleFactor 1. Needs a dev server, because the hooks and `?fixedpx` are dev-only.

```
npx next dev -p 3000                      # port 3000: Privy's CSP only allows localhost:3000
node scripts/explore-bench.mjs --url http://localhost:3000 [--only a,c] [--label name] [--sample 6000] [--out dir]
```

- **What it counts:** draw calls and triangles per frame, counted by wrapping `drawArrays` / `drawElements` (and the instanced variants) on every WebGL context.
  - Every scenario is measured the same way. That includes the orrery and flight, which have no `perf()`, and any canvas that keeps drawing under another mode.
  - The counts match `__stellarMoon.perf().calls/.triangles` exactly (633/526,491 in the smoke run), so they include the shadow and post passes.
- **Live counts:** buffers, textures and programs are create minus delete counts. Heap is `performance.memory`. Each row also records the GPU the page actually got (`WEBGL_debug_renderer_info`), so a SwiftShader fallback can't pass as a real number. Verified: `ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics 640`.
- **Output:** each scenario gets a fresh browser context, a screenshot, `bench.json`, and a markdown table. Output goes to `$TMPDIR/explore-bench/<label>/`, never the repo.
- **Scenarios:**
  - (a) `/solar-system` after the loader clears.
  - (b) Click Explore, 5 s in flight. The ship spawns at `world.home`, about 5.1 Earth radii from Earth.
  - (c) `?moon=1&fixedpx=1`, then `skipDescent()`, the crew standing at the lander.
  - (d) Teleport to (0, 12) facing north across the pad at the habitats.
  - (e) Board the rover and drive at full throttle (8 m/s at sample time).
  - (f) `?land=mars`, then `skipDescent()`, teleport (0, -30) facing the habitats.
- **Reading the numbers:**
  - **Draw calls and triangles are the stable gate:** identical across runs to within ±3.
  - **Frame time is noisy:** it is a median of rAF intervals, which snap to multiples of 16.7 ms under headless vsync, and it swings with machine load. Other agents share this Mac.
  - **Compare frame ms only within one run** of before and after, with load average recorded, as the plan says.
  - The hook's own mean `frameMs` is in `bench.json` as `hookFrameMs`.
  - Buffer and texture counts include resources from React StrictMode's first mount that haven't been freed yet, so they vary between runs. Use `renderer.info.memory` via `perf()` for the Phase 1 memory test.

## 3. Phase 0 baseline

*(The final numbers are in §0.4.)*

Machine: Intel Iris Plus 640 (i7-7660U), ANGLE Metal, headless, 1280×800 @ DPR 1, dev build. 2026-09-17, worktree `ff33a41`.

**Run 1 (`baseline-1`, 12:14–12:18, load 16–33): this is the reference.**

| Scenario | Draw calls | Triangles | Median ms | p95 ms | Max ms | Buffers | Textures | Programs | Heap MB | Load (1m) | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| a orrery | 207 | 279,810 | 33.4 | 100.0 | 150.0 | 512 | 67 | 36 | 241 | 32.9 | 0 |
| b flight near Earth | 189 | 86,064 | 50.0 | 83.4 | 100.0 | 683 | 69 | 50 | 277 | 22.5 | 0 |
| c Moon at lander | 568 | 511,391 | 66.7 | 83.3 | 83.4 | 1879 | 77 | 54 | 279 | 25.6 | 0 |
| d Moon facing base | 534 | 498,991 | 66.6 | 66.7 | 83.3 | 2349 | 109 | 84 | 271 | 22.0 | 0 |
| e Moon driving rover | 481 | 457,935 | 83.3 | 100.1 | 116.7 | 2399 | 113 | 84 | 278 | 18.8 | 0 |
| f Mars base | 305 | 379,203 | 50.0 | 66.7 | 66.8 | 1183 | 88 | 77 | 288 | 16.0 | 0 |

**Run 2 (`baseline-2`, 12:18–12:22, load 19–138: a desktop Chrome at 100% CPU started mid-run).** This run is kept only to show the spread.

| Scenario | Draw calls | Triangles | Median ms | p95 ms | Max ms | Heap MB | Load (1m) |
|---|---|---|---|---|---|---|---|
| a | 207 | 279,810 | 33.3 | 83.3 | 183.3 | 267 | 18.6 |
| b | 190 | 86,064 | 16.7 | 33.3 | 183.3 | 268 | 31.1 |
| c | 568 | 511,391 | 33.3 | 100.0 | 216.7 | 268 | 29.4 |
| d | 534 | 498,991 | 33.4 | 166.6 | 200.0 | 298 | 58.4 |
| e | 478 | 456,879 | 33.3 | 100.0 | 183.3 | 242 | 137.9 |
| f | 305 | 379,203 | 16.7 | 50.0 | 100.0 | 267 | 121.1 |

Moon hook `perf()` in run 1:

| Scenario | `hookFrameMs` (mean) | Pixel ratio | `buildMs` (excl. shader compile, C11) |
|---|---|---|---|
| c | 90.0 | 1 | 1574 |
| d | 78.7 | 1 | 1572 |
| e | 67.0 | 1 | 2049 |
| f | 60.8 | 1 | 1612 |

**What the baseline says:**
- **The Moon is the costliest scene:** 480–570 draw calls and about 0.5 M triangles. That is 2.7× the orrery's calls and 1.9× Mars'. The plan's "~60–330 draw calls" (§0.4) understates it, because these counts include the shadow and bloom passes.
- **The orrery draws 207 calls with nothing but a small system on screen.** That fits the invisible pick spheres, zero-opacity sprites and bloom (A08, B11).
- **Flight near Earth is the cheapest scene in draw calls** (86k triangles). Its frame time still varies the most, which fits the CPU-side belt, allocation and HUD loops (A02, A13, B06).


## 4. Systems

*(Phase 0. Every block below describes `ff33a41`; what each phase changed is in `EXPLORE-UPGRADE-PROGRESS.md`, and the state now is §0.)*

One block per system: entry point, owning modules, data flow, per-frame cost, known problems. Finding IDs in brackets refer to §5.

### 4.1 Orrery, explorer handoff, loaders

_Paths relative to repo root._

#### Explorer/Canvas handoff & mode entry/exit
- **Entry point:** `src/app/solar-system/page.tsx:15` → `SolarSystemPageClient.tsx:6` (`next/dynamic`, `ssr:false`, loading = `SolarLoadingScreen`) → `SolarSystemExplorer.tsx:28`.
- **Owning modules:** `SolarSystemExplorer.tsx` (all mode state: `sceneReady`, `ascent`, `epochMs`, `selectedId`, `playing`, `speedIdx`, `flightActive`, `landed`, `landscape`, `zoomTo`), `SolarSystemCanvas.tsx` (orrery renderer and flight world), `PlayerShip.tsx` (flight HUD, calls `onLand`), `MoonSurface.tsx` / `WorldSurface.tsx` (surface renderers).
- **Data flow:**
  - The Explorer creates one `FlightSession` in a ref (`SolarSystemExplorer.tsx:52-53`) and gives it to both the canvas (`:121`) and `PlayerShip` (`:123`). The session object is the only channel between the flight sim and React. The canvas sees `flight.active` and lazily builds or tears down the ship inside its rAF loop (`SolarSystemCanvas.tsx:1309-1333`).
  - Mode entry into Moon or World: `PlayerShip` shows a land key when `LANDING_SITES[tel.nearId]` exists and `nearAltKm < ceiling` (`PlayerShip.tsx:390-398`). `land()` pauses and calls `onLand(site)` (`PlayerShip.tsx:259-262`). The Explorer then runs `setLanded(site)` (`SolarSystemExplorer.tsx:123`), which mounts `<MoonSurface>` or `<WorldSurface>` (`:125-126`) and sets `suspended` on the canvas (`:121`).
  - While suspended, the canvas keeps its whole scene and GPU resources. Its rAF keeps running but only shrinks the buffers to 2×2 (`SolarSystemCanvas.tsx:1277-1287`, `1054-1057`). The surface builds its own second `WebGLRenderer` (`moon-surface.ts:290`, `world-surface.ts:146`).
  - Exit from a surface: `onReturn` → `returnToOrbit` (`SolarSystemExplorer.tsx:87`) runs `setAscent('on')` + `setLanded(null)`. An rAF poll waits for `ASCENT_FRAMES` session frames and `ASCENT_MIN_MS` (`:69-86`). `PlayerShip` sees `landed` go false, then resumes and sets `session.input.relaunch` (`PlayerShip.tsx:304-312`). The canvas refits its buffers on the first unsuspended frame (`SolarSystemCanvas.tsx:1288-1291`).
  - Exit from flight: `PlayerShip.exit()` sets `session.active=false` (`PlayerShip.tsx:263-277`). On its next frame the canvas calls `teardownShip()`, which restores the orbit camera fov, near/far and exposure (`SolarSystemCanvas.tsx:1073-1092`). Exit from Explore entirely: the ✕ button runs `router.push('/sky')` (`SolarSystemExplorer.tsx:112`).
  - Query params: `?moon` and `?land=mars|proximaB` only work when `NODE_ENV !== 'production'` (`SolarSystemExplorer.tsx:62-68`). `?fixedpx` is also dev-only and exists only in `moon-surface.ts:477` and `world-surface.ts:260`. The orrery canvas has no fixed-pixel-ratio switch.
  - Dynamic imports: `SolarSystemExplorer` is the only dynamic import. `PlayerShip`, `MoonSurface` and `WorldSurface` are static imports (`SolarSystemExplorer.tsx:8-10`), so the whole surface stack (about 17k lines in `moon-*`, `world-*` and `backrooms*` libs) ships in the explorer chunk.
- **Per-frame cost:** Three to four rAF loops run at once: the canvas loop, the Explorer epoch tick (`:95-107`), the PlayerShip HUD paint (30 Hz throttled, `PlayerShip.tsx:347-352`) and, when landed, the surface loop. While the orrery clock plays, the epoch tick calls `setEpochMs` on every frame. That re-renders the Explorer, `SolarSystemCanvas` and `PlayerShip` (not memoised, gets an inline `onLand` arrow at `:123`) at display rate.
- **Known problems:**
  - Mode state is spread across 10 `useState`s and flags on the session object. There is no explicit state machine.
  - With `?moon`, the orrery scene is still built in full (all galaxies, textures) and never draws.
  - The orrery GPU memory, including any 4K maps it loaded, stays allocated in a second context the whole time a surface is open.
  - The Moon cannot be selected from the orrery. It is not a `SolarBodyId` (`ephemeris.ts:13-23`) and has no pick sphere (`SolarSystemCanvas.tsx:758-768`). The only way to reach it is to fly there.

#### Planet & orrery rendering
- **Entry point:** the mount effect at `SolarSystemCanvas.tsx:260` (deps `[scaleMode, includePluto, glGeneration]`, `:1594`). The loop is at `:1265`.
- **Owning modules:** `SolarSystemCanvas.tsx`; `ephemeris.ts` (positions, radii); `planet-spin.ts` (tilt, sidereal spin); `planet-texture-urls.ts` (2K + 4K URLs); `planet-textures.ts` (MeshStandardMaterial with `onBeforeCompile` hooks: Earth night, gas-giant weather fBm, Saturn ring shadow, limb darkening); `scene-extras.ts` (orbit rings, belts, Earth clouds/Moon/storms, Sun corona, Milky Way band/glow, nebulae, Saturn/Uranus rings, auroras, rocket, satellites, meteors, planet moons, comet); `galactic-scene.ts` (nearby stars, MW disk, Andromeda, other galaxies, cosmic web, `tierBlendFromRadius`); `small-bodies.ts`; `probes.ts`; `star-systems.ts` and `black-hole.ts` (flight-only, hidden in orbit); `saturn-ring-strip.ts`; `soft-sprite.ts`.
- **Data flow:**
  - Each frame `syncMeshes()` runs `sampleSolarSystem(new Date(epoch))` if the epoch changed (`:695-703`), creates meshes and hit spheres lazily on first sight (`:750-835`) and copies positions.
  - Spin comes from the epoch (`siderealSpinY`, `:1298-1302`). Shader time is wall clock (`:1293`).
  - Textures: 10 × 2K JPGs load at mount (`:602-623`). A 4K map is fetched once a body's apparent radius is ≥ 0.06 (`:628-648`), which swaps the material (`applyLoadedTexture`, `:575-600`). The Earth night map is applied as an emissiveMap (`:556-572`).
  - Epoch-driven extras: belts (CPU), Earth Moon (`GeoMoon`), satellites, planet moons, comet, Saturn ring particles (GPU uniform) (`:1369-1399`).
  - The galactic tiers fade by `sysRadius` (`:1417-1440`). The Milky Way and Andromeda disk textures are painted lazily on the first frame their fade is above 0.005 (`galactic-scene.ts:759-761`, `912-914`).
  - Flight: `syncWorld` rebuilds `world.bodies` from meshes, moons, small bodies, the ISS, Alpha Cen and Gargantua (`:1136-1197`). `markTargets` projects labels (`:1202-1239`).
- **Per-frame cost (orbit view, estimated from object inventory):**
  - About 120–180 scene draw calls: 10 planets + 10 invisible-but-drawn hit spheres, 9 orbit lines, 15 probe objects, 12 planet moons, 10 belt boulders, 10 aurora curtains, 5 atmosphere shells, about 10 Sun sprites/planes, 6 storm sprites, 4 comet objects, the rocket/satellite/meteor groups, plus star/belt/Kuiper points.
  - About 13 full-screen bloom passes on top of that.
  - CPU: 5,200 + 1,400 belt particles recomputed and re-uploaded every frame. 9 `HelioVector` + `GeoMoon` calls per frame while time plays. Rocket-trail and meteor-trail colour buffers are re-uploaded every frame, even when idle.
  - Small per-frame allocations: `Set` (`:704`), sample objects/Vector3s (`ephemeris.ts:134-151`), `Date` + Vector3 (`scene-extras.ts:661`), tier object (`galactic-scene.ts:1542`), `.clone()` in `projectToScreen` (`:147`).
- **Known problems:** see Findings. The main ones: React re-renders at display rate, 4K texture memory is never released, galaxy disk painting stalls the main thread mid-zoom, and invisible hit spheres still cost draw calls.

#### Lighting/post (orrery)
- **Entry point:** `SolarSystemCanvas.tsx:286-291` (renderer: DPR cap 1.5 lite / 1.75, ACES, exposure 1.18); `:367` `makePostFx`; lights at `:373-382`.
- **Owning modules:** `post-processing.ts` (EffectComposer → RenderPass → UnrealBloomPass(0.4, 0.7, threshold 0.85) → OutputPass; bloom at half resolution on lite); `SolarSystemCanvas.tsx` lights; `planet-textures.ts` shader hooks that assume the Sun is at the origin (`planet-textures.ts:57-58`); `scene-extras.ts` `makeSunExtras` (corona/flare sprites).
- **Data flow:**
  - Lights: AmbientLight `0x33405e` at 0.8, two DirectionalLights at 0.06 and 0.04, PointLight 5.4 (range 380, decay 1.1) that follows the Sun mesh (`:1305-1306`).
  - Flight changes exposure from sun glare (`:1345`) and restores it on teardown (`:1091`).
  - Entering flight makes `alphaCen` and `gargantua` visible (`:1317-1318`). That adds 4 more PointLights (`star-systems.ts:89,101,219`; `black-hole.ts:224`) to the lit set.
  - Resize and suspend go through `postFx.setSize` (`:1054-1060`).
- **Per-frame cost:** full-resolution HalfFloat scene RT + 5-mip bloom chain + output pass. Every MeshStandardMaterial fragment evaluates 1 ambient + 2 directional + 1 point light in orbit, and 5 point lights in flight.
- **Known problems:**
  - `antialias: !lite` (`:274`) only affects the default framebuffer. The composer renders the scene into its own non-MSAA target (`post-processing.ts:24`), so desktop pays for an MSAA backbuffer and still gets aliased orbit lines.
  - The two near-zero directional lights (`:374-379`) add per-fragment cost for no visible effect.
  - Flight lights force every planet material to recompile (acknowledged in `PlayerShip.tsx:279-281`) and add cost even light-years away.

#### Loaders
- **Entry point:** `src/app/solar-system/loading.tsx:5` (route Suspense) → `SolarSystemPageClient.tsx:8` (dynamic chunk) → `SolarSystemExplorer.tsx:129-134` (scene and ascent). Also `PlayerShip.tsx:657` (`hyperspace`), `MoonSurface.tsx:577` and `WorldSurface.tsx:470` (`descent`).
- **Owning modules:** `CosmicLoader.tsx` (variants orrery/descent/ascent/hyperspace, CSS box-shadow starfield, tip rotation), `SolarLoadingScreen.tsx`, `useLoadingTips.ts`, `solar-system.css:2562-2761`.
- **Data flow:**
  - The route loader and the dynamic-import loader both render `SolarLoadingScreen`. Then the Explorer's own `CosmicLoader` stays up until the canvas's first `postFx.render` calls `onReady` (`SolarSystemCanvas.tsx:1481-1484`), with a 30 s fallback (`SolarSystemExplorer.tsx:39-42`).
  - The ascent loader is gated on flight frames plus 1.6 s (`:69-86`). PlayerShip's launch loader repeats the same pattern (`PlayerShip.tsx:282-297`).
  - Loaders are hidden with CSS `.is-done` (opacity/visibility, `solar-system.css:2757-2763`) and are never unmounted.
- **Per-frame cost:** none from React. The hidden loader's 3.8 s `setInterval` keeps re-rendering it (`CosmicLoader.tsx:45-49`), and its 11 infinite keyframe animations stay attached under `visibility:hidden`.
- **Known problems:**
  - ~~The loader shows no real progress: `cosmic-loader__bar` is decorative.~~ Phase 0.5: `CosmicLoader` takes `progress`, and the game shell's loading screen follows the surface's `module → build → compile → ready` stages (`src/game/state.ts`).
  - ~~`useLoadingTips` shuffles with `Math.random()` inside `useMemo`~~ Phase 0.5: the shuffle happens in an effect after mount, so the server and the first paint agree.
  - Each of the three sequential loaders restarts the tip order, so the visible tip jumps at every handoff.
  - `data-solar-immersive` is set in two places (`SolarLoadingScreen.tsx:14`, `SolarSystemExplorer.tsx:58`).

#### Persistence keys (this area)
| Key | Where | Notes |
|---|---|---|
| `stellar_sound` | `src/lib/solar-system/sound-prefs.ts:5` (read `:12`, write `:22-23`) | `'off'` or absent. Shared by flight, moon, world, backrooms and Tbilisi audio. Read through `useSoundPref.ts:11` |
| `stellar_explore_help` | `src/components/solar-system/PlayerShip.tsx:40` (`:241-243`) | first-run help seen |
| `stellar_hud_layout_v2` | `PlayerShip.tsx:73` (`:80`, `:95-96`) | touch HUD layout |
| `stellar_expedition_log` | `src/lib/solar-system/flight-missions.ts:63` (`:75`, `:86`) | flight missions done |
| `stellar_moon_expedition_v2` (+ migrates `_v1`) | `moon-mission.ts:113-114` (`:122`, `:142-143`) | outside this area; listed for the Phase 0.5 single versioned settings/save key |
| `stellar_moon_jobs_v1` | `moon-jobs.ts:78` (`:87`, `:94`) | outside this area |
| `stellar_moon_backrooms_v1` | `backrooms-save.ts:12` (`:17`, `:31`) | outside this area |
| `stellar_proxima_contact` | `world-surface.ts:139` (`:227`) | outside this area |
| `stellar_tbilisi_expedition_v1` | `world-earth-expedition.ts:24` (`:101`, `:126`) | outside this area |
| `stellar_explore_settings` (Phase 0.5) | `src/game/settings.ts` | `{v:1, quality, sensitivity, invertY, fov}`; the volume lives in `stellar_sound_level` beside the switch |
| `stellar_explore_save` (Phase 0.5) | `src/game/save.ts` | `{v:1, scene, savedAt}`: the checkpoint the title's Continue resumes |

The orrery itself (`SolarSystemCanvas`/`SolarSystemExplorer`) persists nothing: speed, selection and camera all reset on every mount. Phase 0.5 added the settings and checkpoint keys above; folding the mission keys into one store is Phase 7's migration.

### 4.2 Flight, ship, aliens, flight controls

_Paths relative to `src/`._

#### Flight model & ship
- **Entry point:** `lib/solar-system/player-ship.ts:830` `createPlayerShip(session)`. The canvas creates it inside its rAF loop the first frame `session.active` is true (`components/solar-system/SolarSystemCanvas.tsx:1311-1330`) and steps it at `:1338`.
- **Owning modules:** `player-ship.ts` (flight model, jump, docking, crash FX, bolts, dust/tunnel/warp FX, radar/nav telemetry, standing order, comms timing), `ship-mesh.ts` (Kestrel/Xfoil/Endurance hulls plus the EVA cosmonaut, `bakeStatic` merge), `soft-sprite.ts` (cached glow texture).
- **Data flow:**
  - `FlightSession` (`player-ship.ts:399`) is one mutable object that `SolarSystemExplorer.tsx:52-53` creates. React writes `session.input`, the ship writes `session.telemetry`, and nobody goes through React state.
  - Each frame the canvas rebuilds `FlightWorld.bodies` in `syncWorld` (`SolarSystemCanvas.tsx:1136-1196`) from the orrery meshes, moons, small bodies, the ISS, Alpha Centauri and Gargantua, then calls `ship.update(dt, t, camera, aliens, world)`.
  - `update` (`player-ship.ts:1511-2429`) runs in this order: clamp dt to 0.1 → relaunch → crash/respawn → regen → eject/view/assist → regime blend → mass lock → jump state machine → attitude/dock/thrust/drag/gravity/speed cap → berth → swept-sphere collision → cannon → nearest body/heat/alerts → wings/engine visuals → hail/supply/comms → bolts → contact → nav target → camera (`flight-camera.ts`) → glare → FX → standing order → missions → HUD telemetry and radar.
  - The drag and ease terms are written as exponential decay in dt (`:1618`, `:1736`, `:1742`, `:1834-1837`), so the flight model itself is frame-rate independent. The exception is the mouse and look-pad path (B04).
- **Per-frame cost:**
  - CPU: 8 linear passes over `world.bodies` (mass lock `:1627`, gravity `:1839`, collision `:1907`, nearest `:1975`, hail `:2107`, candidates `:2224`, station reach `:2400`, plus one per live bolt `:2183`).
  - Dust: 260 segments rewritten and uploaded every frame (`:1374-1388`).
  - Crash FX: 160 sparks, only while live.
  - GPU:
    - Hull draw calls are merged by material (`ship-mesh.ts:236-263`).
    - Sprites are not merged. 10 RCS sprites are drawn even at opacity 0 (`player-ship.ts:2082-2086`). Engine glows and plasma are drawn every frame.
    - Dust is always 1 draw call.
    - One extra `PointLight` rides on the ship (`ship-mesh.ts:223`). That adds a per-fragment light to every lit material in the scene and forces a shader recompile on spawn and teardown.
- **Known problems:**
  - Combat and arcade scope: cannons, alien waves, and a "standing order" to shoot planets apart (`ORDER_HITS`, `destroyWorld` at `:126-129`, `:1237-1248`, `:2335-2344`). Both conflict with the plan's "not an arcade shooter" goal.
  - The EVA suit is a third cosmonaut model (`ship-mesh.ts:598`), separate from `moon-cosmonaut.ts`, and it is not baked.
  - Wings-level uses `fwd` from the previous frame (`:1779`; `fwd` is only refreshed at `:1832`/`:2275`). This is minor.

#### Flight camera
- **Entry point:** `lib/solar-system/flight-camera.ts:61` `makeCameraRig()`, driven from `player-ship.ts:1335-1352` (`updateCamera`).
- **Owning modules:** `flight-camera.ts`. The frame inputs (camBack, fov, zoom, jump overrides) are computed in `player-ship.ts:2274-2293`.
- **Data flow:**
  - `CameraFrame` (`flight-camera.ts:13`) is a reused object. `position` and `quaternion` alias the actor's own vectors (`player-ship.ts:1338-1339`).
  - There are three views: `crash` (fixed position looking at the impact), `cockpit` (eye plus head lag), and `chase` (spring arm with acceleration pullback, turn swing, orbit free-look, and bank share).
  - Shake is a deterministic sum-of-sines (`:57`), scaled by impulse, boost, heat and speed.
  - FOV eases toward the target, and `updateProjectionMatrix` runs only when FOV changes by more than 0.01 (`:197-200`).
  - The canvas sets near/far to `FLIGHT_NEAR`/`FLIGHT_FAR` on spawn (`SolarSystemCanvas.tsx:1322-1324`) and restores them in `teardownShip` (`:1087-1090`).
- **Per-frame cost:** Trivial. There are no allocations; all scratch vectors are preallocated (`:62-76`). One `camera.updateMatrixWorld(true)` per frame.
- **Known problems:**
  - The camera has no collision against bodies: the chase arm can clip inside a planet or the Moon on a scrape.
  - The shake offset is applied after `lookAt` (`:186-192`), so the view translates without re-aiming. That is fine at this amplitude.
  - This rig is not shared with the Moon/World camera rigs, so a Phase 2 unification is needed.

#### Flight input & mobile controls (GameStick)
- **Entry point:**
  - Desktop: `lib/solar-system/flight-input.ts:61` `attachDesktopControls`, attached from `PlayerShip.tsx:226-228`.
  - Touch: `components/solar-system/GameStick.tsx:17`, the look pad in `PlayerShip.tsx:536-556`, and hold keys in `PlayerShip.tsx:511-533`.
- **Owning modules:** `flight-input.ts`, `GameStick.tsx` (`GameStick`, `tapKey`), `PlayerShip.tsx` (the deck: 852 lines covering HUD, menu, layout editor and touch wiring), `FlightDrive.tsx` (gear key and jump card), and `surface-input.ts` (on-foot only; flight does not use it).
- **Data flow:**
  - Keys update a `pressed` Set, and `sync()` rewrites thrust/yaw/roll/boost/fire/align (`flight-input.ts:68-76`). One-shot flags (modeRequest, eject, viewToggle…) are consumed and cleared by the ship.
  - Mouse and look-pad deltas accumulate in `input.mouseDX/DY` and are shaped once per sim frame by `shapeMouse` (`flight-input.ts:49-54`, `player-ship.ts:1749-1750`).
  - GameStick: dead zone 0.12 and power 1.4 (`GameStick.tsx:57`); x becomes `input.yaw`, y becomes `input.thrust` (`PlayerShip.tsx:779-784`). Pitch on touch comes only from the look pad (`LOOK_GAIN` 3.2, `:66`). Landscape rotates the axes (`GameStick.tsx:51`, `PlayerShip.tsx:550`).
  - Layout editor offsets are persisted (`PlayerShip.tsx:73-100`) and applied as CSS variables (`:201-210`).
  - Pause, blur and visibility clear input and detach listeners (`PlayerShip.tsx:212-224`, `:313-324`). The document-level `touchstart`/`touchmove` preventDefault guard applies while active (`:180-198`).
- **Per-frame cost:** The flight UI runs 3 independent rAF loops: the HUD paint at 30 Hz (`PlayerShip.tsx:349-507`) and two `useDrivePaint` loops at 10 Hz (`FlightDrive.tsx:24-39`), plus the canvas loop. Painting is direct DOM, with no setState per frame. The only setState is the one-shot `setImmersive` at `:356`. The HUD paint allocates a little per tick: `levels` array `:466`, `r.kinds.split` plus `.some` closures for 5 rail keys `:431-441`, template strings, and ~10 next-intl `t()` calls. The radar canvas is fully redrawn at 30 Hz (`:484-505`).
- **Known problems:**
  - Flight has no gamepad support: `getGamepads` appears only in `MoonSurface.tsx:287` and `WorldSurface.tsx:252`.
  - There are no settings for sensitivity or invert: `MOUSE_SENS`, `LOOK_GAIN` and `ORBIT_SENS` are constants.
  - Mouse and look-pad shaping is frame-rate dependent (B04).
  - `PlayerShip.tsx` is a 852-line monolith.

#### Flight missions / targeting / star routes
- **Entry point:** `lib/solar-system/flight-missions.ts:92` `makeMissionTracker()`, ticked at `player-ship.ts:2362-2370`. `flight-targeting.ts:32/45` are called at `player-ship.ts:2254-2257`/`:2294-2299`. `star-routes.ts` is used by `SolarSystemCanvas.tsx:1191-1195`, `flight-input.ts:90` and `FlightDrive.tsx:116-119`.
- **Owning modules:** `flight-missions.ts` (26 `DISCOVERIES` predicates), `flight-targeting.ts` (range stepping, NDC projection with edge arrow), `star-routes.ts` (sol / alphaCentauri / gargantua, light-year table).
- **Data flow:**
  - `missionCtx` is refilled every frame (`player-ship.ts:2347-2361`). `tick` walks the not-yet-done predicates, unlocks at most one, then applies a 6 s cooldown and saves to localStorage synchronously (`flight-missions.ts:99-113`).
  - The nav candidate list is rebuilt in place from bodies, POIs, contact and jump. `bodyCandidates` Map caching avoids allocations (`player-ship.ts:2223-2241`).
  - `stepTarget` maps and sorts, allocating only on a key press. `projectTarget` uses module-level scratch vectors.
  - The destination is `session.destination`; the canvas resolves it every frame in `syncWorld` into `world.jump`.
- **Per-frame cost:** At most 26 closure predicate calls per frame, and 0 after the cooldown kicks in. Targeting is negligible.
- **Known problems:**
  - "Discoveries" are proximity checks only. There is no objective chain, and nothing ties them to the slice's mission loop (terminal → rover → telescope).
  - The `firstBlood` and `lightSpeed` entries reward combat and the jump.
  - `stellar_expedition_log` is a separate save from the Moon mission state, so Phase 7 must unify the save format.

#### Aliens
- **Entry point:** `lib/solar-system/aliens.ts:229` `makeAlienEncounters()`. The canvas creates it once (`SolarSystemCanvas.tsx:501`), `aliens.setHostile(...)` runs on ship spawn (`:1328`), and it updates at `:1365`.
- **Owning modules:** `aliens.ts` (saucer, 2 darts, mothership and probe built from primitives; guide-mode flyby/dogfight/battle; explore-mode scan/hostile waves; 14 pooled bolts; 4 spark pools).
- **Data flow:**
  - Idle: `clock` counts down. With a hostile target it runs `beginScan`, or `beginHostile` once provoked (`:774-789`).
  - Scan: the probe or saucer approaches, holds, and beams for 5 s, which sets `handle.scanned` and feeds a mission (`:795-838`).
  - Hostile: `flyFighter` runs the approach/strafe/break/reposition/evade state machine, fires lead projectiles after a telegraph, and calls `hostile.onHit` into `ship.takeDamage` (`:608-701`, `:901-919`).
  - The ship reads `aliens.enemies`, `contactPos` and `contactState` for radar, aim assist, bolt hits and alerts (`player-ship.ts:1130`, `:2167-2179`, `:2210-2220`).
- **Per-frame cost:** The group is invisible when idle (`:547`, `:777`). During an encounter: ~5 ships of unmerged meshes (saucer 8 light meshes; mothership 18 window meshes, `:96-100`, `:154-160`), plus sprites, bolts and spark Points.
- **Known problems:**
  - Tone clash with the NASA-realism slice.
  - Encounters are `Math.random` driven, first contact after 45-85 s (`:722`), so benches are non-deterministic past ~45 s.
  - Linear (non-exponential) steering blend (B12).
  - Partial dispose (B13).

#### Flight audio & radio
- **Entry point:** `lib/solar-system/flight-audio.ts:48` `makeFlightAudio()`, constructed per ship (`player-ship.ts:839`), with `launch()` played at `:845`. `radio.ts:16` `makeRadio()` is never imported (grep finds only its definition).
- **Owning modules:** `flight-audio.ts` (synth one-shots, drone, reentry roar), `sound-prefs.ts` (`stellar_sound`), `radio.ts` (dead).
- **Data flow:**
  - The ship calls event methods (laser, boom, whoosh, charge, hit, warn, confirm, discovery).
  - `setPaused` and `drone` are called every frame but return early when nothing changes (`:285-289`, `:361-363`).
  - `reentry(k)` is never called from the flight model. Only `world-surface.ts:424/680` uses it, through its own separate `makeFlightAudio()` (`world-surface.ts:256`).
  - Each ship creates its own `AudioContext` and closes it on dispose. Moon, Backrooms and Earth each create their own contexts too (`moon-audio.ts:45`, `backrooms-audio.ts:42`, `world-earth-audio.ts:54`).
- **Per-frame cost:** ~0. Nodes are created per event and disconnected in `onended`.
- **Known problems:**
  - No shared audio bus or mixer (a Phase 10 need).
  - Re-entry heat in flight (`tel.heat`) is silent.
  - `radio.ts` duplicates `burst`/noise code and is unused.

#### Flight→surface handoff (lander/ship transition)
- **Entry point:**
  - Landing: `PlayerShip.tsx:259-262` `land()` → `pause()` → `onLand(site)`.
  - `SolarSystemExplorer.tsx:123` sets `landed`, which mounts `<MoonSurface>`/`<WorldSurface>` (`:125-126`) and suspends the canvas (`suspended={landed !== null}` at `:121`; `SolarSystemCanvas.tsx:1280-1289` shrinks the renderer to 2×2).
- **Owning modules:** `PlayerShip.tsx` (land key gating via `LANDING_SITES`, `world-profiles.ts:210`: moon 2500 km, mars/proximaB 4200, earth 6000), `SolarSystemExplorer.tsx` (the `landed` / `ascent` state), `moon-surface.ts:450` / `world-surface.ts:251` (each starts its own `makeLander` descent), and `player-ship.ts:1518-1535` (relaunch).
- **Data flow:**
  1. The HUD paint loop shows the land key when `tel.nearId` has a ceiling. It becomes ready when `nearAltKm < ceiling` (`PlayerShip.tsx:388-419`).
  2. `land()` pauses the session (`ship.update` early-returns at `player-ship.ts:1513`), and `setLanded(site)` hard-cuts to a separate renderer and scene where the lander starts its descent.
  3. On return, `returnToOrbit` sets `ascent='on'` and `landed=null` (`SolarSystemExplorer.tsx:87`). The PlayerShip effect then runs `resume()` and sets `input.relaunch=true` (`PlayerShip.tsx:305-312`).
  4. The next `update` respawns the ship at 2.4 radii above `tel.nearId` (or the Moon), with the nose outward and a little way on (`player-ship.ts:1518-1535`). The ascent loader waits 2 frames and 1.6 s (`SolarSystemExplorer.tsx:69-86`).
  5. Nothing about the flight state reaches the surface: `onLand` passes only a site id. The ship kind, approach vector and landing site do not carry over.
- **Per-frame cost:** While landed, the canvas loop still ticks at rAF rate, doing only the suspended early return (`SolarSystemCanvas.tsx:1280-1289`). The HUD paint loop early-returns (`PlayerShip.tsx:352`). But both `useDrivePaint` loops keep running at 10 Hz, doing DOM work and next-intl `t()` calls under the Moon screen (B06).
- **Known problems:**
  - No approach cinematic, and no continuity from ship to lander: the surface lander is a different vehicle.
  - Landing is only reachable by flying Explore Mode to under 2500 km over the Moon, or through the dev-only `?moon` flag (`SolarSystemExplorer.tsx:62-68`). "Select Moon → approach" from the orrery does not exist.
  - The Phase 9 handoff is entirely unbuilt.

#### Persistence keys (this area)
| Key | File:line | Content |
|---|---|---|
| `stellar_expedition_log` | `lib/solar-system/flight-missions.ts:63` | JSON array of discovery ids |
| `stellar_explore_help` | `components/solar-system/PlayerShip.tsx:40` | `'1'` once the first-flight help card has shown |
| `stellar_hud_layout_v2` | `components/solar-system/PlayerShip.tsx:73` | `{[placeable]: {x,y,s}}` touch layout |
| `stellar_sound` | `lib/solar-system/sound-prefs.ts:5` | `'off'` or absent |

Not persisted: ship kind (`PlayerShip.tsx:114`), camera zoom, flight assist, and view mode.

#### `window.__stellarFlight` hook (dev only)
- **Where it is set:** `SolarSystemCanvas.tsx:1329`, only when `NODE_ENV !== 'production'` and only once the ship exists. It is deleted in `teardownShip` (`:1081`). Type at `:87`: `{ session: FlightSession; ship: PlayerShipHandle; world: FlightWorld; aliens: AlienHandle }`.
- **What a bench can call:**
  - `session.input.*`: thrust/yaw/pitch/roll in -1..1, boost/fire/align, one-shots `modeRequest: 'cruise'|'fast'|'ultra'|'jump'`, `targetRequest: id`, `dockRequest`, `landRequest` (consumed by the HUD paint loop, not the ship), `relaunch`, `viewToggle`, `camZoom`.
  - `session.paused` and `session.telemetry` (frame, speed, nearId, nearAltKm, alert, jumpPhase, …).
  - `ship.spawn({position, lookAt, yaw})`, `ship.takeDamage(n)`, `ship.group.position`.
  - `world.bodies[]` (id, kind, position, radius, radiusKm), `world.home` (the sol anchor, re-synced every frame), `world.jump`.
  - `aliens.nudge()` (encounter now), `aliens.setHostile(null)` (disables encounters for the rest of the session, because the canvas only calls `setHostile` on spawn), `aliens.enemies`.
- **To get "in flight near Earth":**
  1. Load `/solar-system`.
  2. Click `.flight-hud__explore`. The hook does not exist before `session.active` is true.
  3. `waitFor(() => window.__stellarFlight)`.
  4. Wait for `session.telemetry.frame > 3`.
  5. The ship is already at `world.home`: 0.14 scene units tangent from Earth, ~5 Earth radii, nose on Earth with yaw 0.45 (`SolarSystemCanvas.tsx:1122-1130`).
  6. For determinism, call `aliens.setHostile(null)`.
  - `scripts/explore-bench.mjs:113-129` (scenario b) does steps 1-4.
  - Near the Moon: `const m = f.world.bodies.find(b => b.id === 'moon'); f.ship.spawn({ position: m.position.clone().addScaledVector(dir, m.radius * 1.2), lookAt: m.position, yaw: 0 })`. After that, `session.input.landRequest = true` lands once `telemetry.nearAltKm < 2500`.
- **Gap:** unlike `__stellarMoon.perf()` (`explore-bench.mjs:101-104`), the flight hook exposes no `perf()` (calls, triangles, frameMs), so bench scenario b cannot report draw calls for flight.

### 4.3 Moon scene core

_Paths relative to repo root (bare names are `src/lib/solar-system/`)._

#### Moon scene lifecycle (build, loop, fixed-step sim, dispose)
- **Entry point:** `src/lib/solar-system/moon-surface.ts:286` `makeMoonSurface(mount, opts)`; the React caller is `src/components/solar-system/MoonSurface.tsx:148`.
- **Owning modules:** moon-surface.ts builds everything: renderer, scene, sun and lights, stars, Earth, terrain, sinkhole, dust, prints, kit, base, cosmonaut, rover, lander, mission, meteors, jobs, post, perf, camera rig, interactions, fall and Backrooms.
- **Data flow:**
  - Build (290-482): WebGLRenderer → PMREM env (258-276) → lights → content. Then `perf.setBuildMs` (1193), `renderer.compileAsync(scene, camera)` (1207). Hidden objects are made visible for the compile and hidden again after (1198-1201). `begin()` starts the rAF (1200-1206).
  - Loop (875-1181): dt = min(0.1, wall delta) (880). `cam.update`/`orbit`/`zoom` run every frame. After that the loop takes one of three branches: ascent (895-907), descent/touchdown (908-964) or surface (965-1090). A fourth path, `underground()` (740-817), returns early.
  - Fixed-step sim: `STEP = 1/120`, `MAX_STEPS = 12` (219-220). The accumulator loop is at 989-996 and the leftover time is dropped when the step cap is hit. `simStep` (837-856) runs rover + cosmonaut, and `present(alpha)` interpolates (997-999). Only the cosmonaut and rover are fixed-step. Lander, camera, dust, meteors, mission, jobs, base and audio all run on frame dt.
  - Shared tail (1091-1180): telemetry writes (~50 fields), vitals, audio, POI scan, meteors, dust, base/sinkhole update, Earth spin, shadow-camera texel snap (1171-1174), `lightPool.flush`, `post.render`.
  - Dispose (1288-1304): cancel the rAF, remove listeners, close audio, `releaseBackrooms`, remove the canvas. GPU `release()` (1210-1234) runs after `compiling` settles (1303) so StrictMode double-mounts are safe.
- **Per-frame cost:** camera + 1–12 sim steps (cosmonaut + rover each step) + interactions/mission/jobs/meteors/dust/base + shadow pass (all casters in a 120 m box, 2048²) + main pass + UnrealBloom (half res, 5 mips) + OutputPass + Film pass.
- **Known problems:** per-frame object literals in the loop (C04, C05). Mixed fixed and variable integration (C07). There is no real quality tier, only an `isMobile` media query (C08). Dispose never forces context loss or disposes the shadow map (C01). The fixed-step loop is duplicated for the underground path (C16).

**MoonSurfaceHandle** (`moon-surface.ts:179-205`, implementation at 1236-1305; set on `window.__stellarMoon` **only when NODE_ENV !== 'production'**, 1307):
| member | signature | notes |
|---|---|---|
| `input` | `SurfaceInput` (53-80) | moveX/moveY, jump, run, sprint, walk, crouch, shoulderSwap*, orbitDX/DY*, zoom*, interact*, use, viewToggle*, throttle, gearRequest* (* = consumed by the loop) |
| `telemetry` | `SurfaceTelemetry` (95-153) | mutated in place every frame |
| `startAudio` | `() => void` | starts suit + Backrooms AudioContexts |
| `nudgeMeteor` | `() => void` | `meteors.nudge` (timer = 0) |
| `teleport` | `(x: number, z: number) => void` | clears queue/airlock, exits rover, y = floorHeight, `cam.snap()` |
| `face` | `(dx: number, dz: number) => void` | `cam.yaw = atan2(-dx,-dz)`, snap |
| `where` | `() => { x; z; y }` | cosmonaut position |
| `cameraAt` | `() => { x; y; z; blocked: boolean; view: SurfaceView }` | `base.blocked` at the camera position |
| `advanceMission` | `() => void` | `mission.advance` |
| `startJob` | `(id?: JobId) => void` | |
| `skipDescent` | `() => void` | no-op on 'surface'; sets lander at pad, phase 'touchdown', egressHold 0.2 |
| `perf` | `() => PerfSample` | see Perf governor |
| `roverAt` | `() => { x; z }` | `base.roverCollider` x/z |
| `fallIntoBackrooms` | `() => void` | surface only |
| `backroomsSeed` | `(seed: number) => void` | re-enters if already down |
| `teleportToExit` | `() => void` | `br?.teleportToExit()` |
| `escapeBackrooms` | `() => void` | `br?.finish()` |
| `backrooms` | `() => BackroomsHandle \| null` | |
| `dispose` | `() => void` | |

#### Terrain & collision/height queries
- **Entry point:** `src/lib/solar-system/moon-terrain.ts:244` `makeMoonTerrain(lite)`; `makeMoonHorizon` at 212.
- **Owning modules:** moon-terrain.ts. `floorHeight` in moon-surface.ts:485-489 combines `terrain.heightAt` with `base.floorAt`.
- **Data flow:**
  - A 360 m square heightfield, N = 320 (lite 160) (245). Heights are baked into a Float32Array (305-309) from fbm + ridge + 46 large and 420 small craters, binned in 16 m cells (272-281).
  - `heightAt` is a bilinear lookup (311-319). `normalAt` uses finite differences (320-325).
  - `stampCrater` (464-489) and `punch` (491-511) edit heights, positions, colours and normals for the touched rows and upload them with `addUpdateRange`.
  - `tint`/`tintPath` are build-time vertex-colour shading (513-546).
  - Rocks: 3 geometries × up to 180 placements, bucketed into 4×4 chunk InstancedMeshes with tight bounding spheres (413-462).
  - Horizon ring from 172 to 1500 m, 160×18 segments. It shares the terrain material, with world-space UVs (212-242).
- **Per-frame cost:** `heightAt` is O(1) and called many times per frame (dust per live grain, camera clearance probes, meteors, lander). `setSunView` updates one uniform (550).
- **Known problems:** regolith maps are 1024² ×3 with anisotropy 8 (375, 182). The canvases are cached for the life of the module (98, 173). A meteor crater does not re-seat rocks or print decals (C17). The terrain `onBeforeCompile` (391) has no `customProgramCacheKey`. This is currently harmless because only terrain and horizon share that material object.

#### Moon camera
- **Entry point:** `src/lib/solar-system/moon-camera.ts:88` `makeCameraRig(camera, floorAt, colliders, baseFov)`; created in moon-surface.ts:490.
- **Owning modules:** moon-camera.ts. View selection (`setView`, 518-531) and the per-view calls (1053-1086) are in moon-surface.ts. Descent and ascent camera work is inline in moon-surface.ts (899-904, 927-945). Tested by src/test/moon-camera-walls.test.ts, which runs a corridor `blocked` predicate at 60 Hz.
- **Data flow:**
  - `orbit` (144-150) takes pointer, pad or touch deltas. `update(dt)` (159-166) decays shake, runs the footfall bob spring and eases the shoulder.
  - `chase` (167-236):
    - recentres yaw behind travel 1.5 s after the last drag;
    - moves the focus with a per-axis damped spring, with velocity lead and a shoulder offset;
    - eases the desired distance;
    - checks `clearance` with 10 probes against the `blocked` predicate, or against the floor plus all colliders (113-139);
    - comes in instantly and goes out gently;
    - then applies floor clamp, shake, bob, lookAt and FOV kick.
  - `firstPerson` (237-248) is used by the helmet, cockpit and mast views.
- **Per-frame cost:** 10 probes × `colliders().length` circle tests. Near a habitat it instead makes 10 `base.blocked` calls (1076, 1085).
- **Known problems:** the springs use explicit integration on frame dt (C06). Two object literals are allocated per frame for target and tuning (C04).

#### Lighting, light pool, post, sky/Earth/stars
- **Entry point:** moon-surface.ts:309-375 (lights, sky, Earth); `src/lib/solar-system/moon-lights.ts:20` `makeLightPool`; `src/lib/solar-system/moon-post.ts:79` `makeMoonPost`.
- **Owning modules:** moon-surface.ts, moon-lights.ts, moon-post.ts, soft-sprite.ts.
- **Data flow:**
  - Sun: a DirectionalLight with 3.6 intensity and PCF shadow. The map is 2048² (lite 1024²) over a ±60 m box (lite ±42) (310-318). The shadow camera is texel-snapped around the crew each frame (1171-1174).
  - Hemisphere light 0.55, earth fill 0.16, and a 2-light PointLight pool (327). Requests go into a fixed buffer of 12 and `flush` hands out the best 2 by score (moon-lights 36-56). The pool never resizes, so no recompiles.
  - Stars: 4200 + 9000 Points (lite 2200 + 4000), `frustumCulled=false`, moved to the camera each frame (224-255, 1176). There are sun and halo sprites.
  - Earth: 3 spheres at 64×40 segments (earth, clouds, atmosphere shader) at 1250 m. It uses the 2048×1024 `earth.jpg` and 2048×1024 `earth-clouds.jpg` (verified with sips).
  - Env: PMREM of a tiny 3-mesh scene at environmentIntensity 0.45 (258-276, 304-305).
  - Post: RenderPass → UnrealBloom (half res, strength 0.35, threshold 0.9) → OutputPass → Film ShaderPass with grain, vignette, helmet barrel/fringe, Backrooms VHS and fade to black (moon-post 80-91). `setScene` swaps in the Backrooms scene.
- **Per-frame cost:** shadow pass + main pass + bloom mip chain + 2 fullscreen quads. The Film shader does 3 texture taps plus a hash.
- **Known problems:** the composer RT has no MSAA, so `antialias:true` is wasted (C02). Bloom is always on, even in lite (C08). The shadow map re-renders every frame (C10). Earth textures are oversized (C09). The sun shadow map is not disposed (C01).

#### Particles, prints, meteors
- **Entry point:** `src/lib/solar-system/moon-fx.ts:30` `makeMoonDust`; `src/lib/solar-system/moon-prints.ts:43` `makePrints`; `src/lib/solar-system/moon-meteors.ts:46` `makeMeteors`.
- **Owning modules:** moon-fx.ts (pooled Points, 1600 / lite 900), moon-prints.ts (ring-buffer InstancedMesh; `prints` 900 / lite 400 and `history` 1200 / lite 500), moon-meteors.ts (head sprite, trail, flash, rock, 64-slot ejecta InstancedMesh).
- **Data flow:**
  - `dust.burst` writes into a ring buffer (72-94). `update` runs ballistic Euler per grain; a grain dies when it reaches `heightAt` and is parked 1 m underground (99-120).
  - Prints: `cosmonaut.onStep` → `prints.stamp` (moon-surface 442-447). History tracks are baked at build (397-427).
  - Meteors:
    - a timer picks a target clear of the crew and colliders (137-161);
    - it flies at 160 m/s and requests a pool light (210);
    - on impact: `stampCrater`, ejecta, 360 dust grains, shake, returns `MeteorEvent` (211-226);
    - the flash requests a 900-intensity light (177).
- **Per-frame cost:** once anything has burst, dust scans all `max` slots every frame (92, 102) with a `heightAt` per live grain and uploads the full position and shade buffers (118-119). Ejecta: `compose` + `setMatrixAt` per live slot. Prints: a full `instanceMatrix` upload on every footstep (67).
- **Known problems:** `frustumCulled=false` on dust (fx 67), ejecta (meteors 72), and prints + history (prints 53). The boot texture is duplicated per prints instance (C16). Craters leave rocks and prints misplaced (C17).

#### Static batching (moon-batch/kit)
- **Entry point:** `src/lib/solar-system/moon-batch.ts:87` `mergeStatic(root, opts)`; `src/lib/solar-system/moon-kit.ts:99` `makeKit(lite)`.
- **Owning modules:** moon-batch.ts (`keep` 34, `pivot` 39). It is called by moon-base.ts:453 (cell 24), moon-lander.ts:159, moon-mission.ts:321 (cell 24), moon-cosmonaut.ts:99 (isPivot = every Group) and moon-sinkhole.ts:119.
- **Data flow:**
  - Collect pivots (root, `pivot()`-flagged or `isPivot`), then gather mergeable descendants that are not keep/pivot, InstancedMesh, SkinnedMesh or multi-material (44-57, 99-113).
  - `prepare` clones position, normal and uv, forces an index and applies the relative matrix, fixing winding when it mirrors (59-85).
  - Buckets are keyed by `material.uuid|cast|receive|renderOrder|cell` (129). Merged pieces smaller than `minCaster` lose their shadow (122).
  - Merged meshes go onto the pivot. Source meshes are removed and their geometry disposed (147-150). The merged geometries are returned for the owner to dispose.
  - Kit: 24 shared materials (152-177). Canvas textures are 128² normal maps (quilt, panels), a 64² fins map, 128² cells, 64² stripes and 128² grime. Labels are 256×128 by default and cached by content (180-196). The logo is 512×128 (198). Geometry helpers track every geometry (217-248).
- **Per-frame cost:** none; this is build-time only.
- **Known problems:** `prepare` keeps only position, normal and uv, so vertex colours, uv1 and tangents are silently dropped (59-73). This is latent, because no kit material uses `vertexColors` (grep). Cells are split only on the root pivot (124), so large pivots are not culled per cell. Kit dispose double-disposes geometries that mergeStatic already disposed (harmless).

#### Lander (Moon)
- **Entry point:** `src/lib/solar-system/moon-lander.ts:80` `makeLander(padX, padZ, heightAt, dust, lite, lights?, g, start)`; created at moon-surface.ts:450.
- **Owning modules:** moon-lander.ts. The phase machine (descent → touchdown → surface → ascent), `settleLander` (642-661), the camera and the grade (916) are in moon-surface.ts.
- **Data flow:**
  - Start at 138 m with 13.5 m/s sink and an offset (65-78).
  - Guidance takes the stick if the fall exceeds `safe·1.06+0.9` or the lander drifts more than 32 m below 25 m (226-231).
  - Throttle and RCS are integrated on frame dt (233-255). Touchdown clamps and records the speed (258-274).
  - The plume uses opacity/scale flicker and a pool light (277-281). The dust sheet is driven by an accumulator (284-295).
  - `launch()` → climb branch (176-205). moon-surface sets `ascended` at climb > 7.5 (907). MoonSurface.tsx calls `onReturn` (338).
- **Per-frame cost:** trivial CPU, plus up to 60–90 single-grain `dust.burst` calls/s, each with an object literal.
- **Known problems:** dt-dependent touchdown grade (C07). `skipDescent` during 'touchdown' duplicates `settleLander` (C12). The lander is only updated in the descent/touchdown/ascent branches, so on 'surface' the plume does not update. The bench "c-moon-lander" scenario waits for phase 'surface', so descent is never measured (scripts/explore-bench.mjs:101,133).

#### Moon audio
- **Entry point:** `src/lib/solar-system/moon-audio.ts:27` `makeSuitAudio(open)`; created at moon-surface.ts:440 (alongside `makeBackroomsAudio`, 441).
- **Owning modules:** moon-audio.ts and sound-prefs.ts (`onSoundChange`, `soundOn`).
- **Data flow:**
  - `start()` creates the AudioContext lazily on a gesture. Fan oscillator, air noise and breath noise loops run forever (42-85).
  - `update(dt, exertion, helmet)` sets the breath envelope and fan gain (116-127).
  - One-shot `step`, `bleep`, `thump` and `milestone` build short node graphs (92-182).
  - `drill(load, running)` creates the drill oscillator once and leaves it running (183-200).
  - `dispose` unsubscribes and closes the context (201-205).
- **Per-frame cost:** 2 `setTargetAtTime` calls in `update`, plus 2 more in `drill` every frame after the first drill use (moon-surface 1132-1134), plus `brAudio.hum` every surface frame (1037).
- **Known problems:** see C22. Two AudioContexts are live at once (moon-audio 45, backrooms-audio 42). A footstep builds 6 nodes. The drill oscillator is never stopped.

#### Perf governor (moon-perf)
- **Entry point:** `src/lib/solar-system/moon-perf.ts:49` `makeMoonPerf(renderer, mount, {minRatio, maxRatio, onPixelRatio})`; created at moon-surface.ts:478. `?fixedpx` pins the DPR only in non-production (477).
- **Owning modules:** moon-perf.ts.
- **Data flow:**
  - `renderer.info.autoReset = false` (50), reset in `begin`. `calls` and `triangles` therefore include the shadow pass and every post pass.
  - Frame intervals, sim time (`begin`→`mark`) and render time (`mark`→`end`) go into 120-slot ring buffers (51-54, 118-145).
  - Governor (74-103): 90-frame mean. It drops DPR by 0.25 when the mean is over 21 ms (3 s cooldown). It raises DPR by 0.25 after 10 calm windows under 14.5 ms (6 s cooldown), and never raises again after 2 drops. It ignores intervals over 250 ms.
  - A dev overlay on Backquote (105-115, 137-144).
- **`perf()` → `PerfSample` fields (9-28, returned 157-173):** `fps`, `frameMs` (mean interval), `p95Ms`, `maxMs`, `simMs`, `renderMs`, `calls`, `triangles`, `geometries` (info.memory), `textures` (info.memory), `programs` (info.programs.length), `pixelRatio`, `buildMs`, `long30`, `long50`. scripts/explore-bench.mjs:102-105 reads `calls`, `triangles`, `frameMs`, `pixelRatio` and `buildMs`.
- **Per-frame cost:** a few `performance.now()` calls. `sample()` sorts 120 floats.
- **Known problems:** the governor only moves DPR (C08). `lastNow` is not reset on tab return (C11). `buildMs` excludes `compileAsync` time (1193 runs before 1207). In the underground path, `begin` runs without `end` while the Backrooms compile (813), so slots are overwritten.

#### MoonSurface.tsx HUD/React bridge
- **Entry point:** `src/components/solar-system/MoonSurface.tsx:36`; scene effect at 143-519.
- **Owning modules:** MoonSurface.tsx, GameStick, CosmicLoader, useSoundPref, useLoadingTips.
- **Data flow:**
  - Keyboard: a `pressed` Set → `sync()` writes `handle.input` (161-201). Space is both throttle and jump (180-181).
  - Pointer drag → `input.orbitDX/DY`; wheel → `zoom` (227-253).
  - A second rAF loop, `paint` (310-499), polls the gamepad at display rate (312). It paints the DOM at 30 Hz (313: `now - lastPaint < 33`) with direct DOM writes guarded by `text`/`show`/`setVar` diff helpers (257-259). There is **no React setState in the frame path**, except `setCrouch` on a gamepad B edge (302).
  - Context loss → `setGpuLost` → after 1.2 s `resumeRef = true` and `glGeneration++` rebuilds with `startOnSurface` (150-157).
  - React state is only for the help, menu, log, immersive, run and crouch UI toggles (41-51).
- **Per-frame cost:** `pollPad` every rAF: `navigator.getGamepads()`, `Array.from().find()` and 3 closures (286-293). At 30 Hz: about 20 `t()` ICU formats, one `clientWidth` read (358) after dataset writes (315-324), and transform string builds.
- **Known problems:** C03 (effect deps include `t`), C13, C14.

#### Persistence keys (this area)
- `stellar_moon_expedition_v2` (moon-mission.ts:113). v1 `stellar_moon_expedition_v1` is read as a fallback and removed on save (114, 122, 143). `missionComplete()` (148) gates the rover's 'ion' gear at build (moon-surface 448).
- `stellar_moon_jobs_v1` (moon-jobs.ts:78).
- `stellar_moon_backrooms_v1` (backrooms-save.ts:12). `loadBackrooms`/`recordEntry`/`recordEscape` are used at moon-surface 468, 472, 682, 714.
- `stellar_sound` (sound-prefs.ts:5; value 'off' or absent).
- Non-persistent dev switches (non-production only): `?fixedpx` (moon-surface 477), `?backrooms=fall|<any>` (667, 961-962), `window.__stellarMoon` (1307). The resume-on-surface flag after GPU loss is a React ref only (MoonSurface.tsx:45, 153).

### 4.4 Moon gameplay

_Paths relative to `src/lib/solar-system/` unless noted._

#### Cosmonaut (mesh, pose, animation states)
- **Entry point:** `moon-cosmonaut.ts:95` `makeCosmonaut(dust, lite, g, suited, bareHead)`; built in `moon-surface.ts:430`.
- **Owning modules:** `moon-cosmonaut.ts` (state selection + blend easing + dust), `moon-suit-mesh.ts` (procedural rig, 24 materials, 6 canvas textures), `moon-suit-pose.ts` (2-bone leg IK, torso/arm springs, pack lag, head/visor).
- **Data flow:**
  - `simStep` (120 Hz, `moon-surface.ts:833-850`) → `cosmonaut.update(h, walk, floorHeight, walkColliders, 165)` → `loco.update` (`moon-cosmonaut.ts:172`).
  - Loco state is copied into `CosmonautState` field by field (`moon-cosmonaut.ts:176-183`), then one `if/else` chain picks `SuitAnim` (`:197-213`).
  - 13 blend weights are eased toward the anim (`:218-236`) → `poser.body(dt, b)` (`:237`) sets torso/arms/pack/neck rotations.
  - Render frame: `cosmonaut.present(alpha)` (`moon-surface.ts:998`) interpolates group pos/yaw → `poser.legs(b)` solves IK onto the planted feet (`moon-suit-pose.ts:83-121`).
  - Dust: `loco.onStep` → `dust.burst` (`moon-cosmonaut.ts:125-134`); prints/audio/camera footfall in `moon-surface.ts:437-442`.
- **Per-frame cost:** 1 loco step per sim step (≈2/frame at 60 fps), IK per render frame (2 legs × Euler/quat ops), `eye()` does a full `group.updateMatrixWorld(true)` per call (`moon-cosmonaut.ts:147`). Draw calls: the rig is merged per joint group (`:99`, `isPivot` = every Group); about 19 joint groups × the materials each one uses, all `castShadow` (`moon-suit-mesh.ts:183`). That is an estimate: it was not measured at runtime.
- **Known problems:**
  - Code-built suit: 2 clearcoat `MeshPhysicalMaterial`s + 1 transparent bubble (`moon-suit-mesh.ts:121-123`), 24 materials total (`:175`). No LOD, and no hidden body in first person: only `helmet.visible = !on` (`moon-cosmonaut.ts:148`).
  - No real interact animations. Reach, kneel, tool use and sample pickup all collapse into one `work` blend (`moon-cosmonaut.ts:194,206`; `moon-suit-pose.ts:148,157-158`). There is no headlamp or flashlight state.
  - `fabricNormal()` uses `Math.random` (`moon-suit-mesh.ts:64-65`), so the suit texture differs from build to build and captures can't be compared.
  - Pack spring seeds `lastBodyY = 0` (`moon-suit-pose.ts:79`) and is never reset on `settle()`, so the first step after a spawn or teleport slams the pack at the ±40 acceleration clamp (`:161-165`).

**Current animation states (`SuitAnim`, `moon-cosmonaut.ts:21-24`):** idle, idleLook, start, walk, jog, run, sprint, stop, pivot, turn, crouch, crouchMove, jump, air, fall, landSoft, roll, landHard, stumble, fallen, getUp, work, climb, vault, enterDoor, exitDoor, enterVehicle, seated, exitVehicle, bail (30). Loco `Mode`s: idle/start/move/stop/pivot/jump/fall/land/vault/enterDoor/exitDoor/enterVehicle/seated/exitVehicle/bail (`suit-locomotion.ts:42-44`).

#### Suit locomotion & collision
- **Entry point:** `suit-locomotion.ts:119` `makeLocomotion(position, velocity, profile)`.
- **Owning modules:** `suit-locomotion.ts` (state machine + integration), `gait-profile.ts` (all tuning derived from g: `gaitProfile` `:90`, `classifyLanding` `:144`), `suit-feet.ts` (foot planting/stride), `suit-collision.ts` (circle colliders, step up/down, slope, vault probe), `suit-scripted.ts` (waypoint tracks for vault/door/seat).
- **Data flow:**
  - Input: `walkFromStick` builds camera-relative `WalkInput` (`surface-input.ts:41-53`); jump is edge-triggered on the first sim step only (`moon-surface.ts:844`).
  - If a script track is active, the body is carried by `poseAt` and physics is skipped (`suit-locomotion.ts:184-201`). If seated, the body is frozen (`:202-207`).
  - Grounded traction: accel/brake/lateral grip caps, pivot on >135° reversal, stride flight launches (`:254-309`); air control (`:310-318`).
  - Integrate → radial clamp to walkRadius → `slideColliders` → ceiling → `stepGround` / touchdown classification soft/roll/hard/fall (`:347-396`).
  - Facing/turn-in-place → `feet.update` (`:401-426`). The owner then runs `base.confine` (`moon-surface.ts:847`).
- **Per-frame cost:** per sim step about 9 `heightAt` calls (slope 5, grade 1, ground 2, finish 1, plus the feet), a linear scan of all `walkColliders` (`suit-collision.ts:29`), and one object allocation from `slopeAt` (`suit-collision.ts:79`). Deterministic at a fixed 1/120 s step (`moon-surface.ts:219,989-996`; MAX_STEPS 12, then the accumulator is dropped).
- **Known problems:**
  - Colliders are circles only, searched linearly with no spatial hash. Every collider on the base and mission is tested each step.
  - `walkRadius` is a hard circle around the origin (`suit-locomotion.ts:350-351`), not terrain-aware.
  - Tests cover jump apex/airtime, stride, pivot, grip, slope, coyote/buffer, landings, collision and vault (`src/test/suit-locomotion.test.ts:53-424`). They do **not** cover 30/60/144 fps determinism or gamepad/keyboard parity, which the Phase 2 exit criteria require.

#### Rover
- **Entry point:** `moon-rover.ts:99` `makeRover(group, collider, parts, terrain, dust, prints, gears, g)`; mesh from `moon-rover-mesh.ts:17` `buildRover(kit, lite)` via `moon-base.ts:21`.
- **Owning modules:** `moon-rover.ts` (drive + heave/pitch/roll), `moon-rover-dress.ts` (rocker/bogie/steer/spin/mast/arm/lights/dust/tracks), `moon-rover-seat.ts` (door side, seat, bail velocity), `moon-rover-mesh.ts` (kit-built LTV).
- **Data flow:**
  - Driving: `simStep` → `rover.update(h, moveY, moveX, base.colliders, 165, input.jump /*handbrake*/)` (`moon-surface.ts:835`); the crew is pinned to `seatSpot` (`:837-840`).
  - Gear spec (creep/cruise/sprint/ion, `moon-rover.ts:62-67`) → yaw rate → fwd/lat velocity with grip bleed (`:150-182`) → circular edge + collider push-out with bump (`:184-209`).
  - 6 wheel heights → one spring on their mean for heave, airborne above AIR_GAP 0.32 (`:218-243`) → pitch/roll from front/rear/left/right means + load transfer (`:244-257`) → `dress()` (`:264`).
  - Enter/exit: `roverEnter` tap chains `walkTrack` + `boardTrack` → seated → `rover.driving = true` (`moon-surface.ts:573-585, 1004-1008`). Exit taps below 1.2 m/s; a hold at speed bails (`:587-620`).
  - Battery: drains `|speed| × 0.00011`/s (`moon-rover.ts:214`) and caps top speed at 3 m/s below 4% (`:140`). It charges within 4 m of the charger anchor (`moon-surface.ts:1105-1106`).
- **Per-frame cost:** runs **every sim step even when parked** (`moon-surface.ts:840`). Each step does 6 `heightAt` calls, scans every base collider (`moon-rover.ts:194`) and runs the dress (bogie trig, `Math.random` dust rolls). The headlight is a dedicated `SpotLight` (`moon-rover-mesh.ts:27,57`).
- **Known problems:**
  - No per-wheel suspension. Wheels never compress: rocker and bogie tilt are cosmetic (`moon-rover-dress.ts:47-56`), and the body is one spring (`moon-rover.ts:233`).
  - The headlight lives outside `moon-lights` (the pool is 12 requests, `moon-lights.ts:18`), so every lit shader pays for an extra spot light at all times.
  - During descent and ascent the rover updates at render dt, not STEP (`moon-surface.ts:905, 949`).
  - Battery isn't persisted and isn't shown on a dash. The ion gear unlock is derived from the expedition save (`moon-surface.ts:448, 637`).
  - Tests: `src/test/moon-expedition.test.ts:354-467` (gears, grip, handbrake, airtime, coasting) and `src/test/moon-airlock.test.ts:71-111` (seat/bail). Nothing tests at-rest jitter across frame rates.

#### Interactions & airlock
- **Entry point:** `moon-interactions.ts:56` `makeInteractions()`; registrations in `moon-surface.ts:551-663`; airlock sequence `moon-airlock.ts:43` `makeAirlockRun(door, dir)`.
- **Owning modules:** `moon-interactions.ts` (resolver + prompt), `moon-airlock.ts` (pure step machine), `moon-base.ts` (`cycleAirlock` `:570`, door animation `:587-598`, `doorway` `:523`, `confine` `:531`).
- **Data flow:**
  - Each render frame, `interactions.update(dt, {x, z, yaw, driving, press, held})` (`moon-surface.ts:1019`) scores every item: priority×10 + facing×1.5 − distance×0.6 (`moon-interactions.ts:63-74`), with a +1 hysteresis for the current item (`:92-95`).
  - Tap items get `use(0)` on press. Hold items get `use(dt)` while held, if the press started on them (`:104-113`). The prompt fields are copied for the HUD (`:115-119`).
  - An airlock tap creates an `AirlockRun` and calls `cosmonaut.hold(true)` (`moon-surface.ts:565-570`). Each frame, `airlockRun.update` emits track/open/close/pressurised/depressurised/done (`:1009-1017`). Pressurised calls `setGravity(MOON_G, false)` plus visor up.
  - The door opens after a 1.4 s cycle and auto-closes once the crew is more than 8.5 m away (`moon-base.ts:588-595`). `confine` blocks the door plane while `open < 0.85` (`:545-548`).
- **Per-frame cost:** about 19 interactables, each with `where()` returning a fresh object. Each of the 3 airlock `where()`s calls `base.doorway()` (a `habs.find` closure plus 4 object literals, `moon-base.ts:523-525`). `score()` runs twice for the current item.
- **Known problems:**
  - Items call mission/job code directly. There is no event bus, no `requires`, and no carry slot. `kind`, `label` and `where` are closures re-evaluated per frame.
  - The resolver, the airlock run, missions and jobs all tick at render dt outside the fixed step (`moon-surface.ts:1009-1049`).
  - **Airlock bypass:** the exit run ends with the door open (`moon-airlock.ts:73-80`), and the door stays open while the crew is within 8.5 m, which covers the whole ramp. The crew can walk straight back in with no `pressurised` event, so the suited gait and closed visor stay on indoors.
  - The airlock models only the outer door. The chamber has no inner door.

**Current interactions (id → kind, label):** `terminal` tap/terminal, `drill` tap|hold/drillStart|drillFeed|collectCore, `patch0..3` hold/clear, `hatch` tap/openHatch (`moon-mission.ts:366-418`); `job` tap|hold (step label), `jobBoard` tap (`moon-jobs.ts:267-304`); `airlock0..2` tap/enterAirlock|exitAirlock; `roverEnter` tap/getIn; `roverExit` tap|hold/getOut|bailOut; `readout-isru|power|comms|charger` tap/read.*; `boardLander` tap (`moon-surface.ts:553-660`). The following are **not** interactables: the sinkhole edge (auto-triggers, `moon-surface.ts:1047`), the maintenance hatch, meteors and the gear shift.

#### Missions & jobs
- **Entry point:** `moon-mission.ts:154` `makeMission(...)`; `moon-jobs.ts:97` `makeJobs(world)`. Both are updated per render frame in `moon-surface.ts:1021, 1048`.
- **Owning modules:** `moon-mission.ts` (props for marker/drill rig/buried craft + the 5-act state machine), `moon-jobs.ts` (side-job step lists: go/tap/hold/align/roverTo).
- **Data flow:**
  - The expedition is one long `if/else` over `telemetry.stage` (`moon-mission.ts:449-574`), writing objective/distance/bearing/signal/task into `MissionTelemetry`. The HUD reads it directly.
  - `enter(stage, reward)` → banner + `persist()` + `onEvent` (`:353-363`). `onEvent` maps to audio, camera shake, meteors and the ion unlock (`moon-surface.ts:631-638`).
  - Jobs: the `jobBoard` tap → `start()` picks the next job in JOB_ORDER (`moon-jobs.ts:308-322`). Steps advance on distance, hold time, or releasing the key on the alignment peak (`:323-346`). Steps drive zone state through `world.setStatus`, `arrayFault` and `dishFault`.
  - Dev hooks: `advanceMission`, `startJob` (`moon-surface.ts:1255-1256`).
- **Per-frame cost:** small (a few `hypot` calls, `forEach` closures in excavate `:550`), plus `lights.request` for the craft and marker animation. The drill rig shivers by writing `rig.position` every frame (`:522-523`).
- **Known problems:**
  - Two competing systems with separate telemetry, banners, events and saves. The expedition is hard-coded with no data model, which is exactly what Phase 7 replaces.
  - The storyline is an alien craft (survey → drill → trace → excavate → contact). None of it is the Telescope/Power/Comms/First Steps set the plan calls for.
  - Mid-act progress isn't saved: drill depth, partial patch work and the active job step (`moon-mission.ts:350`; `moon-jobs.ts:9-10`).
  - Jobs `align` completes on any key release while the offset is inside tolerance, even if the resolver has moved to another item (`moon-jobs.ts:327-332`).
  - `seismo` reuses its status material and never resets it to red (`moon-jobs.ts:209,222`).
  - "Carrying" is a boolean that hides the package (`:135,211,352`).

**Mission acts (`MissionStage`, `moon-mission.ts:25`):** survey (sub-steps obj.brief → obj.survey → obj.scan lock), drill (feed-in-band minigame, heat stall), trace (long-range ping, radio lines, a meteor strike), excavate (4 hold patches), contact (6 s awakening → open hatch → walk in), done (unlocks the rover `ion` gear).
**Side jobs (`JOB_ORDER`, `moon-jobs.ts:19`):** solar (go cabinet → reset breaker → hold reset 2 s → align array), samples (collect 2 rocks → deposit at sample store), comms (go → open panel → align dish), rover (bring rover to service bay → hold wheel service 3 s), seismo (take package → go → hold place → align level → activate), sinkhole (only after a Backrooms escape: go → hold place beacon → log at terminal).

#### Base & zones
- **Entry point:** `moon-base.ts:121` `makeMoonBase(heightAt, lite, kit, sunDir, lights)`, which calls `buildZones` (`moon-base-zones.ts:49`).
- **Owning modules:** `moon-base.ts` (3 habitats with airlocks/ramps/interiors, flag, sign, rover placement, floor/ceiling/blocked/confine queries), `moon-base-zones.ts` (power, ISRU, comms dish, geology lab + mission computer, seismometer, rover bay + charger, landing zone, cables, paths, tracks, ground marks), `moon-kit.ts` (shared materials, label cache), `moon-batch.ts` (`mergeStatic`).
- **Data flow:**
  - Built once. Static meshes merge per 24 m cell (`moon-base.ts:453`); rover groups, array heads, dish and doors are pivots.
  - `base.update` (`:575-602`) runs each frame: it works out which habitat the crew is inside, eases the interior glow into `lights.request`, runs the airlock cycles and door slides, then `zones.update`.
  - `zones.update` (`moon-base-zones.ts:473-483`) turns the arrays to `sunYaw + fault`, aims the dish at `earthDir` minus the fault (`getWorldPosition` + `lookAt`), blinks the beacon and pulses the reflectors.
  - State hooks that exist today: `setStatus(power|comms|isru|charger, ok|warn|fault)` (`:466`), `arrayFault.yaw`, `dishFault.yaw/pitch` (`:470-471`). There is no power on/off lighting, telescope dome or antenna "link" state.
- **Per-frame cost:** 3 habitat local transforms plus `hypot` for floor, ceiling, blocked and confine (several calls per step). `inside` allocates a new object every frame while indoors (`moon-base.ts:581`). `arrays.forEach` closure; the dish's `getWorldPosition` walks the parent matrices (`moon-base-zones.ts:474-479`).
- **Known problems:**
  - No telescope platform, garage building or antenna mast as the plan's layout describes. Comms is a single dish at (22, -36).
  - The mission computer stands outdoors under the lab canopy (`moon-base-zones.ts:281-291`), not behind the airlock.
  - Status lamps are the only state hooks. The base can't go dim, because nothing models power on/off.

**Zone anchors (`AnchorId`, `moon-base-zones.ts:20-24`, set at `:155-156, 203, 242, 279, 291-292, 354-355`):** `powerCabinet`, `faultyArray` (power, placed at 37,-12), `isruPanel` (ISRU at -40,-14), `commsControl` (comms at 22,-36), `sampleStore`, `scienceTerminal`, `workbench` (lab at -31,6), `charger`, `serviceBay` (rover bay at 22,10). POIs in the zones: solar, tanks, dish, science, seismometer (-48,24), logistics, landingZone (0,20). POIs in the base: greenhouse ×2, rover, sign, plus ourLander, sinkhole and hatch added at runtime.

#### Sinkhole / Backrooms lifecycle
- **Entry point:** `moon-sinkhole.ts:42` `makeSinkhole`, `:167` `makeFall`; `moon-surface.ts:665-730` (`startFall` → `enterBackrooms` → `releaseBackrooms` / `leaveBackrooms`); `backrooms-scene.ts:117` `makeBackrooms`.
- **Owning modules:** `moon-sinkhole.ts` (terrain punch, slabs, maintenance hatch, beacon, scripted fall camera), `backrooms-scene.ts` (own `THREE.Scene`, chunk window, entity, crew lamp), `backrooms-chunks.ts`/`backrooms-window.ts` (build/free chunks by distance), `backrooms-save.ts`, `backrooms-audio.ts`.
- **Data flow:**
  - Standing on the edge (`sinkhole.onEdge`, `moon-surface.ts:1047`) → `fall.start()` holds the suit. `fall.update` scripts position, rotation and camera for 3.1 s (`moon-sinkhole.ts:192-228`).
  - When the fall is done, `enterBackrooms()` calls `recordEntry()`, builds the backrooms, moves the cosmonaut group into their scene and points `post.setScene` there (`moon-surface.ts:680-697`). The Moon scene stays fully allocated.
  - On escape, `recordEscape` → `releaseBackrooms` hands the group back and calls `old.ready.then(dispose)` (`:698-711`). The crew respawns at the HATCH and the hatch lid opens (`:712-730`).
  - `backrooms.dispose` clears the chunk window (which frees every chunk) and disposes the kit, watcher, concrete, cage and stair geometries (`backrooms-scene.ts:562-570`). The chunk kit disposes its materials, shared geometries and 6 textures (`backrooms-chunks.ts:329-332`).
- **Per-frame cost:** while in the Backrooms, only `underground(dt)` runs; surface simulation and rendering stop (`moon-surface.ts:891-894`). Chunk build/free happens only when crossing a chunk boundary (`backrooms-window.ts:21-23`).
- **Known problems:**
  - The surface's GPU resources stay alive the whole time underground: no unload.
  - Dispose is ordered correctly after compile (`moon-surface.ts:710, 1297`).
  - `loadBackrooms()` re-parses localStorage every time it's called (`moon-surface.ts:468`, which runs when a job becomes available).
  - The fall's roll and pitch on `group.rotation` are reset only in `enterBackrooms` (`:683`). Leaving the fall any other way (the `teleport` dev hook while falling) would keep them.

#### Persistence keys (this area)
| Key | Owner | Shape | Notes |
|---|---|---|---|
| `stellar_moon_expedition_v2` | `moon-mission.ts:113,140-145` | `{stage, rewards[], briefed, cleared[]}` | Validated on load (`:119-139`). Falls back to `_v1` (`:114,122`) and deletes it on save (`:143`). No drill depth or partial patch work. |
| `stellar_moon_expedition_v1` | `moon-mission.ts:114` | legacy | read-once migration |
| `stellar_moon_jobs_v1` | `moon-jobs.ts:78,85-95` | `{done: JobId[]}` | The active job, its step and fault offsets aren't saved. |
| `stellar_moon_backrooms_v1` | `backrooms-save.ts:12` | `{discovered, escaped, entries, lastSeconds, bestSeconds}` | Validated; gates the `sinkhole` job and the hatch-open state. |
| (derived) ion gear | `moon-surface.ts:448` via `missionComplete()` (`moon-mission.ts:148`) | — | Not a separate key. |
| Not saved | rover battery, rover position, O₂/EVA stats, landing grade | — | — |

---

### 4.5 World surfaces (Mars, Proxima b, Earth)

_Paths relative to `src/`._

#### World surface lifecycle (Mars/Proxima/Earth)
- **Entry point:** `lib/solar-system/world-surface.ts:141` `makeWorldSurface(mount, world, opts)`. It is mounted by `components/solar-system/WorldSurface.tsx:141` from `SolarSystemExplorer.tsx:126`. The dev entry is `?land=mars|proximaB|earth` (`SolarSystemExplorer.tsx:61-67`).
- **Owning modules:** world-surface.ts. It reuses the Moon rig as-is: moon-post, moon-fx (dust), moon-cosmonaut, moon-prints, moon-audio, moon-lander, moon-perf, moon-lights, moon-kit, moon-camera, moon-interactions and surface-input.
- **Data flow:**
  - `WORLDS[world]` (world-profiles) supplies gravity, sun, sky, ground, pad and walkRadius. Earth swaps the generic terrain and sky for `makeEarthWorld` (`:156`, `:187`, `:194-198`).
  - Content adds its `colliders`, `pois` and `interactables` into shared arrays and a single `makeInteractions()` (`:205-242`).
  - The rAF loop (`:401-621`) has four branches: Earth entry (`:417`), then ascent (`:432`), then descent/touchdown (`:446`), then surface with a fixed 120 Hz step (`:512-519`, `STEP`/`MAX_STEPS` at `:136-137`).
  - Per-frame hooks: `dust`, `sky`, `earth.update`, `base.update`, `flora.update`, `aliens.update`, sun/shadow snapping, `lightPool.flush` and `post.render` (`:592-620`).
  - The telemetry object is mutated in place (`:275-283`). React reads it with its own throttled rAF, and nothing is pushed.
  - `dispose()` (`:715-726`) removes listeners and defers GPU `release()` (`:647-663`) until `compileAsync` settles.
- **Per-frame cost:** The camera and effects run once per drawn frame. `simStep` runs 1-12 times, and each run calls `walkColliders()`, which allocates on Proxima and Earth (see E04). The POI scan is O(pois). Shadow targeting snaps to shadow-map texels. Post is bloom, film and output (moon-post). There is one 2048² (lite 1024²) PCF sun shadow map.
- **Known problems:**
  - About 80% of the renderer, loop, resize, visibility, context-loss, compile and release code is copied from moon-surface.ts. Compare `world-surface.ts:144-158` with `moon-surface.ts:288-300`, `:384-400` with the moon equivalent near `:874`, `:623-645` with `moon-surface.ts:1183-1208`, and `:715-726` with `moon-surface.ts:1288-1302`.
  - `lite` is `matchMedia('(max-width: 768px)')` (`:144-145`) and there is no GPU or preset signal. Shadow-map size, DPR cap, dust, prints and terrain N all branch on this one boolean.
  - Neither surface calls `renderer.forceContextLoss()` (grep finds nothing in either file), so each enter/exit leaves a WebGL context for GC.
  - On context loss the React side rebuilds with `startOnSurface` → `skipDescent()` (`:728`). The player lands back at the pad. Position, car and cable-car ride are lost.

#### WorldSurfaceHandle / `window.__stellarWorld` (dev only, `world-surface.ts:107-127`, assigned `:729`)
| Member | Signature | Notes |
|---|---|---|
| `input` | `WorldInput` (`:44-60`) | Mutable: `moveX, moveY, jump, run, sprint, walk, crouch, shoulderSwap, orbitDX, orbitDY, zoom, interact, use, viewToggle, throttle` |
| `telemetry` | `WorldTelemetry` (`:69-105`) | `ready`, `phase: 'descent'\|'touchdown'\|'surface'\|'ascent'`, `ascended`, `landing`, `grade`, `view`, `poiId`, `altitude`, `speed`, `hint`, `driving`, `o2`, `heartRate`, `suitTemp`, `outsideC`, `evaSeconds`, `distanceM`, `crouched`, `stumbling`, `sliding`, `heading`, `prompt`, `readout`, `readoutHold`, `banner`, `bannerHold`, `aliens: AlienTelemetry\|null`, `earth: EarthState\|null`, `entry` |
| `profile` | `WorldProfile` | |
| `startAudio` | `() => void` | |
| `teleport` | `(x: number, z: number) => void` | Sets y from `floorAt`, zeroes velocity, `cam.snap()`. Before `phase === 'surface'` the descent branch overwrites the crew position every frame (`:483`), so teleport only works on the surface. |
| `face` | `(dx: number, dz: number) => void` | `cam.yaw = atan2(-dx,-dz)`. Forward becomes (dx, dz). |
| `where` | `() => { x, y, z }` | Cosmonaut position |
| `skipDescent` | `() => void` | No-op on the surface. Otherwise puts the lander at the pad `(pad.x, pad.z+26)`, sets `phase='touchdown'` and `egressHold=0.2`, so the surface begins about 0.2 s of frames later. The egress point is `(padX, padZ+4.2)`. |
| `perf` | `() => PerfSample` | See below |
| `setTime` | `(iso: string) => void` | Earth only (`earth.sky.setDate`) |
| `advance` | `() => void` | Earth only: finishes the current expedition act |
| `look` | `(heading: number, pitch?: number) => void` | Heading is in degrees clockwise from north (−z) |
| `layer` | `(name: string, on: boolean) => void` | `scene.getObjectByName` returns the **first match only**. Useful names: `mars-base`, `mars-terrain`, `proximaB-terrain`, `flora`, `villagers`, `earth`, `earth-terrain`, `terrain-city`, `terrain-valley`, `terrain-caucasus`, `earth-city`, `earth-streets`, `lamps`, `earth-traffic`, `earth-people`, `player-car`, `cable-car`, `earth-sky`, `earth-entry`. `terrain-walk` and `city-cell` are repeated names, so only the first chunk or cell toggles. |
| `sky` | `() => Record<string, number\|number[]> \| null` | Earth only: `sunAlt, adapt, key, hemi, cloud, visibility, night, limitMag, hazeBeta, haze[], hazeSun[], hemiSky[], keyColor[], exposure` |
| `dispose` | `() => void` | |

**`perf()` returns `PerfSample`** (`moon-perf.ts:9-28`), computed over a 120-frame ring (`WINDOW=120`):
- `fps`, `frameMs` (mean rAF interval), `p95Ms`, `maxMs`
- `simMs`: everything between `perf.begin` and `perf.mark`, i.e. sim plus all world/earth updates
- `renderMs`: the `post.render` call
- `calls` and `triangles`: `renderer.info.render` since the last `begin`. `autoReset=false`, so this includes the shadow and composer passes of the last frame.
- `geometries`, `textures` (`info.memory`), `programs`
- `pixelRatio` (governor), `buildMs`
- `long30` and `long50`: counts since open
- The HUD's own rAF (pad polling and DOM writes in WorldSurface.tsx) is **not** included.

**Bench recipe, "at the Mars base":**
1. Open `/…?land=mars` in dev and wait for `__stellarWorld.telemetry.ready`.
2. Call `__stellarWorld.skipDescent()` and poll until `telemetry.phase === 'surface'`.
3. Call `__stellarWorld.teleport(0, -40)` then `__stellarWorld.face(0, -1)`. This looks from 12-18 m in front of the three habitats at (-16,-52), (0,-58), (16,-52), with the greenhouse (-30,-36) and ISRU (34,-34) in frame.
4. For an interaction test, stand at the habitat panel with `teleport(8.4, -52)` (radius 2.6).
5. For a wide shot use `teleport(0, 0)` and `face(0, -1)`.
6. Discard the first sample window (compile and settle), then read `perf()` after at least 120 frames.

#### World terrain & sky
- **Entry point:** `lib/solar-system/world-terrain.ts:137` `makeWorldTerrain(profile, lite)` and `lib/solar-system/world-sky.ts:80` `makeWorldSky(renderer, profile, lite)`. Mars and Proxima only.
- **Owning modules:** world-terrain.ts, world-sky.ts, world-profiles.ts. They share `fbm` from moon-terrain, `starfield` from moon-surface and `softSpriteTexture`.
- **Data flow:**
  - The CPU heightfield is 360 m and N=320 (lite 160) (`:138`): fbm, dunes, craters, a water basin and a flattened pad radius of 40 m. Bilinear `heightAt` and `floorAt` read it (`:192-208`).
  - Ground textures are three canvases of 1024² (lite 512²), cached **at module scope** per world id (`:48`, `:252`). They are wrapped as CanvasTextures with anisotropy 8.
  - The horizon ring runs from 172 to 1500 m (`:278`) and shares the terrain material.
  - Rocks are 3 cuts × 2 materials, bucketed into 4×4 chunk InstancedMeshes with computed bounding spheres (`:313-349`).
  - The sky is a 1800 m back-face dome ShaderMaterial, a starfield (Proxima), sun and halo sprites, moons (Phobos and Deimos, Proxima d) and aurora curtains (Proxima). A PMREM env is baked once from a mini scene (`:153-167`).
- **Per-frame cost:** The sky follows the camera. The moons rotate with dt (`:177-183`) and aurora `uTime` advances. The terrain does no per-frame work. Draw calls: terrain 1, horizon 1, up to 96 rock InstancedMeshes (3 cuts × 2 stones × 16 chunks, empty buckets skipped), dome 1, stars 1, 2-4 sprites, moons and curtains.
- **Known problems:**
  - `canvasCache` is never cleared. Up to 3 × 1024² canvases (about 12 MB RAM) stay per world after exit (`world-terrain.ts:48`).
  - `world-sky.ts:165` keeps only `pmrem.fromScene(...).texture`. The returned `WebGLRenderTarget` is never disposed, only its texture (`:190`).
  - `world-sky.ts:10` imports `starfield` from `moon-surface.ts`, which couples the Mars/Proxima bundle to the whole Moon module graph.
  - Rocks use 96 potential InstancedMeshes where 6 with per-chunk culling or LOD would do. `castShadow` is on for every one (`:340`).

#### Mars base & flora
- **Entry point:** `lib/solar-system/world-mars-base.ts:42` `makeMarsBase(kit, heightAt, lite, readout)` and `lib/solar-system/world-flora.ts:64` `makeFlora(profile, terrain, lite)` (Proxima).
- **Owning modules:** world-mars-base.ts, which uses moon-kit and moon-batch `mergeStatic`/`keep`, and world-flora.ts.
- **Data flow:**
  - Mars: habitats, greenhouse, ISRU, Kilopower, a solar field (one InstancedMesh), dish, weather mast, flag, sign, cargo ship, rover, 12 pad lamps and 1-2 dust devils. These are built through the kit and then `mergeStatic(group, { cell: 70 })` (`:305`).
  - Mars adds 4 tap interactables (`habPanel`, `greenhouse`, `isru`, `power`) that call `readout(key)`, which sets `telemetry.readout` and `readoutHold=7` (`world-surface.ts:209`).
  - Flora: lantern trees, reeds, fungi and pods/doors are InstancedMeshes, with a per-instance glow colour driven by an `onBeforeCompile` pulse shader (`:86-112`). The lake is a `MeshPhysicalMaterial`. There are 350/800 spores as Points and a council stone with a canvas glyph texture.
  - Flora colliders (one per tree, pod and stone) are pushed into the scene collider list (`world-surface.ts:233`). The `village` feeds world-aliens.
- **Per-frame cost:**
  - Mars `update` (`:312-340`) blinks the red lamps, requests one pool light, moves the devils (`Math.random` respawn) and waves the flag (18 verts plus `computeVertexNormals` every frame, at any distance).
  - Flora `update` (`:323-332`) CPU-integrates every spore and re-uploads the full position buffer every frame. The Points are `frustumCulled=false` (`:260`).
- **Known problems:** see E07 (glow program cache collision), E14 (spore upload) and E15 (flag). There is no LOD or distance culling on the Mars base cells beyond frustum. Mars readouts are the only Mars interactions, and none of them has state.

#### World aliens (Proxima)
- **Entry point:** `lib/solar-system/world-aliens.ts:179` `makeAliens(opts)`
- **Owning modules:** world-aliens.ts, which uses moon-batch `mergeStatic`/`pivot`.
- **Data flow:**
  - Six villagers. Each is about 10 pivot groups (body, head, 2 shoulders, 2 elbows, 2 hips, 2 knees), merged per pivot (`:171`). Each has its **own** `MeshPhysicalMaterial` skin (clearcoat and sheen) and its own eye material (`:91-117`).
  - An FSM runs `wander → wait → notice → approach → greet → follow → lead → home` (`:284-343`). The lead state walks to the stone and fires `onEvent('stone')`. world-surface then shows a banner and writes `CONTACT_KEY` (`world-surface.ts:224-227`).
  - Interactables `villager0..5` are available once `met` (`:217-228`). Greetings are counted in telemetry, and after `GREETINGS_TO_LEAD` (3) one villager leads.
  - The colliders array is updated in place for the camera (`:351-352`).
- **Per-frame cost:** Only in the `surface` phase (`world-surface.ts:612`). There are 6 FSM steps. `walkTo` calls `blocked()`, which does `opts.colliders.some(closure)` over all flora colliders (`:215`). `pose` is about 12 transforms. `villagers.indexOf(v)` runs twice per villager (`:351-352`). Each villager costs about 10 pivots × 2 materials in draw calls, roughly 60+ calls plus the shadow pass for 6 bodies.
- **Known problems:**
  - Before first contact, `onEvent('notice')` fires once for every villager that comes in range (`:345-348`). Each call restarts the `noticed` banner and bleeps (`world-surface.ts:222`).
  - First contact is written to `CONTACT_KEY` but never read, so greetings and `atStone` reset on every visit.
  - `mergeStatic` already disposes the part geometries, and `geoms` holds them again (`:120` + `:171`), so they are disposed twice. This is harmless.

#### Earth/Tbilisi (city, streets, traffic, people, car, cablecar, eyepiece)
- **Entry point:** `lib/solar-system/world-earth.ts:87` `makeEarthWorld(renderer, data, lite)`. The data comes from `loadTbilisi()` (`world-earth-data.ts`), which fetches `/explore/tbilisi/terrain.bin` (3.6 MB), `city.bin` (2.1 MB) and `manifest.json`, started in `WorldSurface.tsx:125-134`.
- **Owning modules:** world-earth, -data, -terrain, -sky, -atmosphere, -haze, -city, -streets, -landmarks, -cablecar, -car, -people, -traffic, -expedition, -tonight, -eyepiece, -audio, -entry and -gait. The `TelescopeEyepiece.tsx` component belongs here too.
- **Data flow:**
  - **Terrain** (`world-earth-terrain.ts:69`): 4 nested grids (walk/city/valley/caucasus). The walk area is 160-cell chunks with 3 LODs, and LOD 0 is built on demand (`:196`). The valley and Caucasus rings are folded inside the 30 km far plane by the haze vertex hook (`world-earth-haze.ts:36-54`).
  - **Sky** (`world-earth-sky.ts:143`): astronomy-engine Sun and Moon, CPU single-scatter LUTs (32×32 half-float, re-baked 3 rows per frame when a light moves, `:423-438`), stars and planets from BRIGHT_STARS, a moon.jpg disc (2048×1024), and a PMREM env re-rendered on clock or adaptation change (`:441`).
  - It drives the sun and hemi light colours in world-surface (`:596-607`) and the global `haze` uniforms (`world-earth-haze.ts:23-31`).
  - **City** (`world-earth-city.ts:180`): OSM footprints are batched into 800 m cells with coarse, far and full (lazy, `:486`) geometries. One facade `onBeforeCompile` shader handles windows, night lights and styles. Walking uses a 24 m segment hash for `pushOut` (`:423`) and a 60 m footprint hash for `roofAt`.
  - **Streets** (`world-earth-streets.ts`): road ribbons per 1 km cell, bridge decks (`deckAt`, `:72`), water, instanced trees per 700 m cell, and a lamp Points cloud.
  - **Traffic** (`world-earth-traffic.ts:90`): an OSM road graph and 30 pooled cars over 3 bodies, InstancedMesh with lamps (6 calls). Cars spawn 120-520 m out and despawn past 650 m.
  - **People** (`world-earth-people.ts:58`): 60 pedestrians and an 18-person welcome crowd, drawn as 8 InstancedMesh body parts. They path along footways and dodge the `movers` list.
  - **Car** (`world-earth-car.ts:58`): the player hatchback with a game-style model. It runs at 120 Hz via `earth.drive` from `world-surface.ts:370`.
  - **Cable car** (`world-earth-cablecar.ts:32`): the OSM line with pylons and cabins on pivots. `placeRide(s)` carries the crew (`world-earth.ts:273-289`).
  - **Expedition** (`world-earth-expedition.ts`): stages bridge → … → rooftop → firstLight → done. It persists to localStorage and emits `board`, `roofUp`, `roofDown` and `dusk` events, which world-earth turns into place and ride changes (`world-earth.ts:267-271`, `:331-340`).
  - **Eyepiece:** `ex.eyepiece` → React `setEyepiece({ target, date })` (`WorldSurface.tsx:387-390`) → `eyepieceView()` from astronomy-engine (Jupiter moons, Saturn tilt) → canvas redraw about every 90 ms (`TelescopeEyepiece.tsx:145-150`).
- **Per-frame cost** (`world-earth.ts:254-308`):
  - `sky.update` does 2 astronomy-engine `bodyAzAlt` calls per frame, a `new Date` and LUT row bakes.
  - Throttled LOD checks: terrain every 8 frames, city every 16, streets every 16.
  - `landmarks.update`, `cable.update` (every cabin placed with 2 `pointAt` calls each).
  - `expedition.update`.
  - `traffic.movers` / `people.update` / `people.colliders` / `traffic.update`. Traffic is O(30²) gap checks with a closure per car. People are up to 78, each with 8 `setMatrixAt` and 8 `setColorAt` calls and a `floorAt` that goes through `deckAt`.
  - A river distance loop over every manifest river vertex (`:306`) plus `riverLevel` (the same loop again).
  - Audio `setTargetAtTime` on 4 params every frame.
  - Every InstancedMesh in traffic and people is `frustumCulled=false`.
- **Known problems:** E01-E03, E05, E06, E08-E13 and E16-E19 below.

#### WorldSurface.tsx HUD/React bridge
- **Entry point:** `components/solar-system/WorldSurface.tsx:34` `WorldSurface({ world, onReturn })`
- **Owning modules:** WorldSurface.tsx, TelescopeEyepiece.tsx, GameStick (`GameStick`, `tapKey`), CosmicLoader, useLoadingTips, useSoundPref and sound-prefs.
- **Data flow:**
  - On Earth, `loadTbilisi` runs first (`:125-134`). The effect (`:135-434`) then builds the handle and wires keyboard, pointer-orbit, wheel and gamepad into `handle.input`.
  - The HUD `paint` rAF (`:272-414`) polls the gamepad every frame, but DOM writes are throttled to 33 ms. It uses `text()` and `show()` diffing helpers (`:240-241`) and writes to refs only.
  - React state is used only for discrete UI: menu, help, immersive, run, crouch, eyepiece, GPU-lost, earthData.
  - Context loss triggers `setGlGeneration` 1.2 s later, which rebuilds the whole scene (`:144-151`).
  - `tel.ascended` → `onReturn()` (`:281`).
- **Per-frame cost:** A second rAF loop runs next to the engine loop. `navigator.getGamepads()` + `Array.from(...).find(...)` allocates every frame (`:252-253`). At 30 Hz there are about 25 formatted strings and several next-intl `tw()` calls, all diffed before any DOM write, so React never re-renders per frame. The compass strip renders 72 absolutely positioned tick spans (`:114-122`, `:502-507`).
- **Known problems:**
  - The effect deps `[t, tw, world, glGeneration, isEarth, earthData]` (`:434`) rebuild the whole WebGL scene if a translator identity changes, for example on a locale switch.
  - While the eyepiece is open, the 3D scene, the HUD rAF and the eyepiece rAF all keep running (`TelescopeEyepiece.tsx:145-156`). Nothing pauses the world.
  - Touch and keyboard wiring is copied from the Moon HUD. This is out of scope here but relevant to Phase 11.

#### Persistence keys (this area)
| Key | Written | Read | Notes |
|---|---|---|---|
| `stellar_tbilisi_expedition_v1` (`EXPEDITION_KEY`, `world-earth-expedition.ts:24`) | `persist()` `:124-128` on stage, part and align changes | `loadExpedition()` `:98-114` (validated, tested in `test/world-earth.test.ts`) | `{stage, found[], parts, aligned}` |
| `stellar_proxima_contact` (`CONTACT_KEY`, `world-surface.ts:139`) | `:227` ISO date on the stone event | **never read** | Unfinished: villager state resets every visit |
| `stellar_sound` (`sound-prefs.ts:5`) | M key or menu toggle (`WorldSurface.tsx:181`, `useSoundPref`) | sound-prefs | Shared with the Moon |
| (none) | Mars base: nothing persisted | | Readouts are stateless |

### 4.6 Vertical slice gap analysis (plan §1.1)

| # | Step | Status | Evidence | What's missing or weak |
|---|---|---|---|---|
| 1 | Solar System → select Moon | **missing** | Moon is not a `SolarBodyId` (`ephemeris.ts:13-23`) and has no pick sphere (`SolarSystemCanvas.tsx:758-768`). It is reachable only by flying under 2500 km and pressing L (`PlayerShip.tsx:388-419`, `world-profiles.ts:210`), or through dev-only `?moon`. | No way to pick the Moon in the orrery. A05, B02 |
| 2 | Cinematic lunar approach (skippable) | **missing** | `onLand(site)` hard-cuts to `MoonSurface` behind a CSS `descent` loader (`SolarSystemExplorer.tsx:123-126`). The surface has its own player-flown lander (`moon-surface.ts:908-946`). | No shot of transit, approach or Earth behind the Moon. No skip beyond the dev `skipDescent`. A06, B01 |
| 3 | Landing | exists | `lander.update` with a feather/good/firm/hard grade, then `settleLander` (`moon-surface.ts:913-921, 642-661`). Tests in `moon-expedition.test.ts:469-520`. | Grade depends on frame rate (C07). The pad at `PAD_CENTER.y+26` is separate from the base's landing-zone ring at (0, 20). |
| 4 | Georgian cosmonaut exits the lander | partial | The suit is hidden for 4.2 s, then teleported (`moon-surface.ts:947-958`). It has a Georgian flag and a "GEORGIA" chest plate (bench capture c). | No ladder or egress animation. D13 |
| 5 | Earth above the lunar horizon | partial | Fixed `EARTH_DIR` (`moon-surface.ts:222`). Earth is a 52 m sphere at 1250 m, about 4.8° across. | Not from the ephemeris, and at 2.4× the real ~2°. Not framed as an Earthrise from the lander. D14, C09 |
| 6 | Walk to the base, learning movement | partial | `walk` / `jump` hints (`moon-surface.ts:1087-1089`), worn paths (`moon-base-zones.ts:450-458`). | The first objective points at the outdoor lab terminal, not the base or airlock. D27 |
| 7 | Cycle the airlock | exists | `moon-airlock.ts:43-87`, wiring at `moon-surface.ts:553-571, 1009-1017`, tests in `moon-airlock.test.ts`. | No objective requires it. It can be bypassed (D01). Only the outer door is modelled. |
| 8 | Mission terminal | partial | Outdoor `MISSION COMPUTER` pedestal (`moon-base-zones.ts:281-291`). Tapping it sets `briefed` (`moon-mission.ts:366-377`). There is also a `jobBoard`. | Not indoors. No mission list or choice. D04 |
| 9 | Drive the rover to the telescope station | partial | Driving, entering and bailing work (`moon-rover.ts`, `moon-surface.ts:573-620`). Bench capture e drove at 8 m/s. | There is no telescope station to drive to. D02, D10 |
| 10 | Repair + calibrate the telescope | **missing** | No telescope code in any `moon-*` file (grep). | Mechanics that can be reused: hold-repair and hold-rotate/release-on-peak alignment (`moon-jobs.ts:149, 282-289, 327-330`). |
| 11 | Observe a real astronomical object | **missing** | No `astronomy-engine` or ephemeris in Moon gameplay. | Reusable pieces: `TelescopeEyepiece.tsx` + `eyepieceView()` (Earth/Tbilisi, astronomy-engine Jupiter moons and Saturn tilt), `world-earth-tonight.ts`. |
| 12 | Mission complete | partial | Expedition `done` stage: banner, reward, ion gear unlock (`moon-mission.ts:570, 353-363`). | Completes a different storyline (a buried alien craft). D03 |
| 13 | Next objective unlocks | partial | Next job in `JOB_ORDER` (`moon-jobs.ts:311`). The sinkhole job is gated on a Backrooms escape. | No prerequisite chain or unlock model. D03, D16 |

**Summary:**
- **Missing:** 4 of 13 steps (select Moon, approach, telescope repair, observation).
- **Solid:** 2 (landing, airlock).
- **Partial:** the rest.
- **Biggest gaps:** the telescope beat (Phases 5, 7) and the orrery → Moon approach (Phase 9). Everything between them exists in some form and needs to be re-aimed, not built from scratch.
- **Richest reuse source:** the Earth/Tbilisi build already has an observation flow (`world-earth-tonight.ts`, `TelescopeEyepiece.tsx`) that Phase 7's telescope mission can reuse.


## 5. Findings

121 findings: 18 P1, 52 P2, 51 P3. **P1** = blocks the slice or will corrupt a later phase's measurement. **P2** = real cost or bug worth scheduling. **P3** = cleanup. The phase column is where each gets fixed. §6 is the same list as a checklist.

| ID | Sev | Category | Location | Finding | Phase |
|---|---|---|---|---|---|
| A01 | P1 | react-per-frame | `src/components/solar-system/SolarSystemExplorer.tsx:95-107`, `:123` | While the orrery clock plays, `setEpochMs` runs on every rAF. That re-renders the Explorer, `SolarSystemCanvas` (which only copies props into refs, `SolarSystemCanvas.tsx:242-256`) and the ~700-line `PlayerShip` (not memoised; inline `onLand` arrow) at display rate. The epoch should live in a ref or store that the canvas reads, with the UI clock updated at about 1 Hz. | 1 |
| A02 | P1 | per-frame-alloc | `src/lib/solar-system/scene-extras.ts:287-296`, `:376-385` | Asteroid (5,200) and Kuiper (1,400) belts recompute every particle on the CPU and set `needsUpdate` (full buffer upload) every frame, even when the epoch hasn't changed (paused, flying, galactic tier). This belongs in the vertex shader like the Saturn ring particles (`scene-extras.ts:1392`), or should at least be skipped when the epoch is unchanged. | 1 |
| A03 | P1 | oversized-texture | `src/components/solar-system/SolarSystemCanvas.tsx:628-648`, `src/lib/solar-system/planet-texture-urls.ts:33-41` | 4K maps (4096×2048, ~45 MB GPU each with mips) are fetched once apparent radius ≥ 0.06 and never released. Flying past 7 bodies can pin ~300 MB. That memory stays allocated while landed, because the canvas is only suspended (`:1277-1287`) and the Moon runs a second WebGL context (`moon-surface.ts:290`). | 1 / 11 |
| A04 | P1 | missing-dispose | `src/components/solar-system/SolarSystemExplorer.tsx:120-126` | The surface handoff keeps the entire orrery scene (all galactic layers, 10+ textures, belts, composer RTs) alive in its own context under the Moon's renderer. Only the drawing buffer shrinks to 2×2. Two live contexts is the pressure case the context-loss handler (`SolarSystemCanvas.tsx:293-302`) was written for. The powerPreference also differs ('default' `:278` vs 'high-performance' `moon-surface.ts:290`). | 1 / 9 |
| A05 | P1 | slice-gap | `src/lib/solar-system/ephemeris.ts:13-23`, `src/components/solar-system/SolarSystemCanvas.tsx:750-768`, `:886-889` | Slice step "select Moon" is missing. The Moon is not a `SolarBodyId`, gets no pick sphere and can't be focused. The only way to reach the Moon is to start flight, fly to it and drop under the altitude ceiling (`PlayerShip.tsx:390-398`). | 9 |
| A06 | P1 | slice-gap | `src/components/solar-system/SolarSystemExplorer.tsx:123-126`, `src/components/solar-system/MoonSurface.tsx:577` | There is no cinematic approach or landing. `onLand` swaps directly to `<MoonSurface>` behind a CSS `descent` loader, and the way back is also a loader (`:131-134`). No camera continuity between the orrery Moon (`scene-extras.ts:627-645`, 4.2 Earth radii out) and the surface. | 9 |
| A07 | P1 | slice-gap | `src/components/solar-system/SolarSystemCanvas.tsx:84-89`, `:1329`, `:286` | The orrery has no bench hooks. There's no `perf()` / `renderer.info` exposure (`__stellarFlight` carries no renderer), no `?fixedpx` switch (`fixedpx` exists only in `moon-surface.ts:477` and `world-surface.ts:260`), and the pixel ratio is fixed at `min(DPR, 1.75)`. Bench scenarios (a) orbit and (b) flight near Earth can't be recorded as Phase 0 specifies. | 0 / 1 |
| B01 | P1 | slice-gap | components/solar-system/SolarSystemExplorer.tsx:123-126; PlayerShip.tsx:259-262 | Flight→Moon is a hard cut. `onLand(site)` passes only an id; the canvas is suspended and a separate `MoonSurface` mounts with its own `makeLander` (`moon-surface.ts:450`). There is no approach cinematic, and ship kind, approach direction and position are not handed over. | 9 |
| B02 | P1 | slice-gap | lib/solar-system/world-profiles.ts:210; PlayerShip.tsx:388-419; SolarSystemExplorer.tsx:62-68 | The Moon can only be reached by flying Explore Mode to under 2500 km altitude and pressing L, or through the dev-only `?moon`. Selecting the Moon in the orrery (`onSelect`) has no landing path, so the slice's first step ("select Moon → approach") is missing. | 9 / 0.5 |
| C01 | P1 | missing-dispose | moon-surface.ts:1210-1234 | `release()` never calls `sun.dispose()`/`sun.shadow.dispose()`, so the 2048² shadow RT stays allocated. It also never calls `renderer.forceContextLoss()`. `WebGLRenderer.dispose()` in r184 (node_modules/three/src/renderers/WebGLRenderer.js:1066-1089) only resets internal caches, so GPU memory and the WebGL context wait for GC. This will skew the enter/exit ×3 memory test. | 1 |
| C02 | P1 | bug | moon-surface.ts:290; moon-post.ts:80 | The renderer is created with `antialias: !lite`, but the EffectComposer is built without a render target, so it creates a HalfFloat RT with samples 0 (EffectComposer.js:69). The scene is drawn with no AA, and desktop pays for MSAA on the default framebuffer, which only receives the final film quad. | 1 |
| D01 | P1 | bug | moon-airlock.ts:73-80; moon-base.ts:545,592; moon-surface.ts:1011-1012 | Exit run finishes with the outer door open, and it only auto-closes beyond 8.5 m (which covers the ramp). `confine` lets the crew through when `open ≥ 0.85`, so walking back in skips the airlock and no `pressurised` event fires. Suited gait and closed visor stay on indoors. | 5/6 |
| D02 | P1 | slice-gap | moon-base-zones.ts:20-24 | No telescope station exists: no anchor, mesh, interactable or state. A grep for telescope/observe in `moon-*.ts` finds nothing. The slice's core beat has zero code. | 5/7 |
| D03 | P1 | duplication | moon-mission.ts:449-574; moon-jobs.ts:142-346 | Two parallel quest systems (hard-coded 5-act if/else plus a job step list), each with its own telemetry, banners, `onEvent` and save key. There is no shared objective model or registry. | 7 |
| D04 | P1 | slice-gap | moon-base-zones.ts:281-291; moon-mission.ts:366-377 | The "mission terminal" is an outdoor pedestal in the geology lab. Tapping it only sets `briefed = true`, and it vanishes afterwards. There is no terminal behind the airlock, no mission list and no choice. | 5/7 |
| E01 | P1 | per-frame-alloc | lib/solar-system/world-earth-city.ts:459-471 (called via world-surface.ts:266-268 → moon-camera.ts:122) | On Earth, the camera's `colliders()` calls `city.cameraColliders()` every frame. That allocates a new array, a new `Set`, and one `{x,z,r}` object per 1.4 m of every wall segment in the 9 neighbouring 24 m cells (hundreds per frame in the old town). `world-surface.ts:267` then `concat`s it onto the landmark colliders, and the camera iterates the result for 10 probes. This is the largest steady GC source on Earth. | 1 |
| E02 | P1 | per-frame-alloc | lib/solar-system/world-earth-streets.ts:72-91; world-earth-city.ts:390, 427, 464 | `deckAt`, `pushOut`, `nearFootprints` and `cameraColliders` build template-string map keys (`` `${i},${j}` ``) on every lookup, 25 per `deckAt`. `deckAt` also allocates `?? []`. `deckAt` runs for every person (`world-earth.ts:113`), every sim step (`:179`), every car corner (6 per step, `world-earth-car.ts:176-224`) and every camera floor probe. That is thousands of short strings per frame. Use numeric keys, as `blockedMemo` already does at `world-earth.ts:116`. | 1 |
| E03 | P1 | bug | lib/solar-system/world-surface.ts:187-192, 607, 644 | On Earth `scene.environment` is `null` when `renderer.compileAsync(scene, camera)` runs (`:644`), because only the non-Earth `sky` assigns it at `:190`. It is first set inside the loop at `:607`. Every `MeshStandardMaterial`/`MeshPhysicalMaterial` program then changes its env-map defines on frame 1, so the pre-compile is wasted and the first surface frame stalls on a full recompile. Assign `earth.sky.environment` before `compileAsync`. | 1 |
| A08 | P2 | drawcall-hotspot | `src/components/solar-system/SolarSystemCanvas.tsx:758-768` | Pick spheres are `MeshBasicMaterial({transparent, opacity:0})` and stay `visible`, so each of the 10 still costs a transparent draw call (20×20 sphere, blended) every frame. Raycasting doesn't need `visible`; `material.visible=false` or a layer would remove them. The same applies to the probe labels and trails drawn at opacity 0 when faded (`probes.ts:190-192`). | 1 |
| A09 | P2 | drawcall-hotspot | `src/lib/solar-system/galactic-scene.ts:759-761`, `:912-914`, `:511`, `:562` | The first frame the galactic tier crosses 0.005 synchronously paints a 2048² canvas with 62k arm + 34k dust splats (desktop), and Andromeda does the same later. That's a multi-hundred-ms main-thread hitch mid-zoom, plus a 2048² texture upload. | 1 |
| A10 | P2 | slice-gap | `src/components/solar-system/SolarSystemCanvas.tsx:463-529` | Everything is built synchronously before first paint: 10k sky stars, 52k MW volume stars, 26k Andromeda, ~23k cosmic web, 12k nearby field plus canvas labels, per-pixel canvas textures (corona 512², `scene-extras.ts:741-764`; MW glow `:1066-1090`), Alpha Centauri and Gargantua (flight-only, hidden). None of this serves the Moon slice, and all of it lengthens the loader. Galactic and interstellar layers should build lazily. | 1 / 0.5 |
| A11 | P2 | bug | `src/lib/solar-system/post-processing.ts:24`, `src/components/solar-system/SolarSystemCanvas.tsx:274` | `EffectComposer(renderer)` renders the scene into a non-multisampled target, so `antialias: true` on desktop buys an MSAA default framebuffer that only receives the OutputPass blit. Orbit lines and limbs stay aliased and memory is wasted. The fix is to pass a `samples` render target or drop `antialias`. | 1 / 4 |
| A12 | P2 | drawcall-hotspot | `src/components/solar-system/SolarSystemCanvas.tsx:1317-1318`; `src/lib/solar-system/star-systems.ts:89,101,219`; `src/lib/solar-system/black-hole.ts:224` | Launching flight turns on Alpha Cen and Gargantua, which adds 4 PointLights to the scene. Every MeshStandardMaterial recompiles (the launch loader exists partly to hide this, `PlayerShip.tsx:279-281`), and every lit fragment near Earth evaluates lights that are light-years away. Their visibility should follow the current system. | 1 / 9 |
| A13 | P2 | per-frame-alloc | `src/lib/solar-system/ephemeris.ts:134-151`; `src/components/solar-system/SolarSystemCanvas.tsx:698-704`; `src/lib/solar-system/scene-extras.ts:661`; `src/lib/solar-system/galactic-scene.ts:1542` | Every frame while the clock plays: a new `majors` array, 9 sample objects and about 20 `Vector3`s (`helioEqjToThree` twice per body), a `Date`, a `new Set` of ids (`:704`, every frame regardless of epoch), `GeoMoon` → new Vector3, and a new tier object. Steady GC churn. | 1 |
| A14 | P2 | bug | `src/components/solar-system/useLoadingTips.ts:14`, `src/app/solar-system/loading.tsx:5` | `Math.random()` tip rotation inside a component that is server-rendered from the route `loading.tsx`. The server and client render different `cosmic-loader__tip` text, which is a hydration mismatch. The shuffle also restarts at each of the three sequential loaders. | 0.5 |
| A15 | P2 | slice-gap | `src/components/solar-system/SolarSystemExplorer.tsx:8-10` | `PlayerShip`, `MoonSurface` and `WorldSurface` are static imports, so the ~17k-line surface stack is in the one explorer chunk that the `/solar-system` page loads. Phase 0.5's `/play` split and "page JS did not grow" gate need these behind dynamic imports. | 0.5 |
| A16 | P2 | slice-gap | `src/components/solar-system/SolarSystemExplorer.tsx:33-53`, `:62-68`, `:112` | No game state machine (boot/title/loading/playing/paused/exiting). Mode is 10 `useState`s plus `session.active/paused`. Deep links `?moon` and `?land=` are dev-only (`NODE_ENV` gate), so production has nothing to redirect to `/play`. Exit goes to `/sky`, not back to `/solar-system`. | 0.5 |
| A17 | P2 | per-frame-alloc | `src/lib/solar-system/scene-extras.ts:1764-1772`, `:2306-2312` | Rocket trail (all `TRAIL_N` colours) and every meteor's trail colour attribute are rewritten and re-uploaded every frame, including the idle seconds between launches and burns. Only live points need updating. | 1 |
| B03 | P2 | drawcall-hotspot | lib/solar-system/ship-mesh.ts:223 | Every hull carries a `PointLight` (intensity 0.05). Adding it to the scene on spawn and removing it on teardown changes the light count, which recompiles every lit material. `PlayerShip.tsx:279-280` acknowledges this ("every planet material recompiles for the flight lights"). It also adds a per-fragment light to all standard materials in flight for a near-invisible fill. | 1 |
| B04 | P2 | dt-dependent | lib/solar-system/flight-input.ts:49-54; player-ship.ts:1749-1750 | `shapeMouse` is applied to the delta accumulated over one sim frame. The 0.6 px dead zone is subtracted per frame, the 1.12 power curve acts on per-frame deltas, and `MOUSE_MAX_STEP` (0.045 rad) caps each frame. As a result, turn sensitivity and maximum turn rate change with frame rate, on both the mouse and the touch look pad (`PlayerShip.tsx:551-552`, gain 3.2). | 2 |
| B05 | P2 | slice-gap | lib/solar-system/flight-input.ts:61-186; PlayerShip.tsx:779-793 | Flight has no gamepad input (`getGamepads` exists only in `MoonSurface.tsx:287` and `WorldSurface.tsx:252`) and no sensitivity or invert settings (constants at `flight-input.ts:24-33`, `PlayerShip.tsx:66`). | 2 / 0.5 |
| B06 | P2 | react-per-frame | components/solar-system/FlightDrive.tsx:24-39 | `useDrivePaint` starts one rAF loop per component (FlightGear and FlightJumpCard) at 10 Hz, with no landed, paused or hidden guard. Both keep calling next-intl `t()` and touching the DOM while the Moon surface has the screen. The main HUD loop has the guard (`PlayerShip.tsx:352`). With the canvas loop, the flight UI runs 4 rAF loops. | 10 / 11 |
| B07 | P2 | per-frame-alloc | components/solar-system/SolarSystemCanvas.tsx:147-152, 1222 | `markTargets` calls `projectToScreen` for every nearby body every flight frame. That allocates a `Vector3` (`worldPos.clone()`) plus a result object per call, which is GC churn proportional to body count. | 1 |
| B09 | P2 | slice-gap | lib/solar-system/player-ship.ts:126-129, 1237-1248, 2335-2344; aliens.ts:502-527 | Cannons, alien hostile waves, and a standing order to shoot planets apart (the HUD shows it at `PlayerShip.tsx:456-465`) contradict the NASA-realism / "not an arcade shooter" goal. They need gating off in the /play slice. | 12 / 0.5 |
| B10 | P2 | duplication | lib/solar-system/ship-mesh.ts:598-693 | The EVA cosmonaut is a third suit model, separate from `moon-cosmonaut.ts` (`CosmonautHandle`, used by `backrooms-scene.ts:23`). Unlike the hulls it is not run through `bakeStatic`, so it costs about 25 draw calls when visible. | 3 |
| B18 | P2 | unfinished | components/solar-system/PlayerShip.tsx:1-852 | The deck is an 852-line single component: HUD paint, menu, layout editor, touch hold keys, look pad, land/dock prompts, launch loader. This breaks the repo's ~150-line component rule and blocks a clean Phase 10 HUD / Phase 11 mobile split. | 10 / 11 |
| C03 | P2 | bug | MoonSurface.tsx:519 | The scene effect depends on `[t, glGeneration]`. Any new `t` identity (e.g. a locale switch) disposes and rebuilds the whole 3D scene. `resumeRef` is not set, so the player is thrown back to the descent. | 0.5/10 |
| C04 | P2 | per-frame-alloc | moon-surface.ts:897,913,923,1014-1017,1028,1030,1050,1056-1059,1076,1077-1085 | Fresh object literals every frame: lander input, airlock state, interactions/mission/jobs update args, `cam.chase` target + tuning (2 objects per frame), plus a `.some()` closure for `nearHab`. | 1 |
| C05 | P2 | per-frame-alloc | moon-surface.ts:541,841,850 | Inside `simStep` (up to 12×/frame at 120 Hz): `seatSpot(roverFrame())` allocates 2 objects per step while driving, and `walkFromStick(...)` gets a new input literal per step on foot. | 1 |
| C06 | P2 | dt-dependent | moon-camera.ts:163-164,189-192; moon-surface.ts:1059 | Camera springs use explicit Euler on frame dt (clamped to 0.1, surface 880). Rover chase uses `horizontal: 11`, so `2·wh·dt` reaches 2.2 on a 100 ms hitch and the focus overshoots or oscillates. The bob spring's damping term `13·dt` exceeds 1 at the same dt. Camera feel therefore changes with frame rate. Substep or use an analytic critically-damped spring. | 2 |
| C07 | P2 | dt-dependent | moon-surface.ts:913,923,905,949; moon-lander.ts:249-261 | The lander integrates on variable frame dt, so the touchdown speed that sets the grade (surface 916) depends on frame rate. The rover runs at frame dt during descent/ascent (905, 949) but at fixed `STEP` on the surface (847). Dust and ejecta also integrate on frame dt (fx 105-108, meteors 99-100). | 2/9 |
| C08 | P2 | slice-gap | moon-surface.ts:288-289,312,315,333,382-384; moon-post.ts:85-91,109; moon-perf.ts:86-99 | Quality is a single `lite = matchMedia('(max-width: 768px)')` flag, so a narrow desktop window gets lite and a 1024 px tablet gets full. The runtime governor only moves DPR in 0.25 steps. Shadow size, bloom (always on), particle caps, star counts and prop density cannot be changed live. No preset module exists. | 1/11 |
| C09 | P2 | oversized-texture | moon-surface.ts:345-375 | Earth uses `earth.jpg` 2048×1024 plus `earth-clouds.jpg` 2048×1024 (the clouds texture is also the alphaMap) on 3 spheres at 64×40 segments. The planet is a 52 m sphere at 1250 m, about 4.8° across (~100 px at 1080p/52° FOV). 1K maps and ~32×20 segments would be enough. | 1 |
| C10 | P2 | drawcall-hotspot | moon-surface.ts:297-318,1171-1174 | The shadow map re-renders every frame (no `shadowMap.autoUpdate`/`needsUpdate` throttling). It is 2048² over a 120 m box, and lite is still 1024². Every static caster in range (the merged base, rocks, ejecta) is drawn again each frame, although the sun is fixed and the snap target only moves one texel at a time. | 1 |
| C11 | P2 | bug | moon-surface.ts:862-866,1193,1207; moon-perf.ts:119-126 | `onVis` resets the scene's `last` but not perf's `lastNow`. The first frame after a hidden tab records a huge interval into `intervals`, `maxMs` and `long30`/`long50` until 120 frames roll it out. Separately, `setBuildMs` runs before `compileAsync`, so `buildMs` (read by explore-bench) excludes shader compile. | 0/1 |
| D05 | P2 | per-frame-alloc | moon-interactions.ts:67,87-94; moon-surface.ts:555-561; moon-base.ts:523-525 | The resolver calls `where()` on about 19 items every render frame, and each returns a new object. The 3 airlock `where`s call `doorway()` (a `habs.find` closure plus 4 literals). The current item is scored twice. | 6 |
| D06 | P2 | dt-dependent | moon-surface.ts:1009-1049 vs 988-996 | Interactions, the airlock run, `mission.update` (the drill load/heat easing and integration at moon-mission.ts:484-494) and `jobs.update` run at render dt (clamped to 0.1), outside the fixed 120 Hz sim. Hold and drill outcomes vary with frame rate. | 6/7 |
| D07 | P2 | dt-dependent | moon-surface.ts:905,949; moon-rover.ts:233 | During descent and ascent, `rover.update` gets render dt. Its explicit-Euler heave spring takes a step of up to 0.1 s instead of STEP. | 8 |
| D08 | P2 | per-frame-alloc | moon-surface.ts:840; moon-rover.ts:194-221,264 | A parked, undriven rover still runs its full update and dress every sim step: 6 `heightAt`, a scan of every base collider, dust RNG. It should sleep when at rest and not driven. | 1/8 |
| D09 | P2 | drawcall-hotspot | moon-rover-mesh.ts:27,57; moon-rover-dress.ts:64 | The rover headlight is a standalone `SpotLight` that is always in the scene, not a pool request. It adds a light term to every lit shader permanently. | 8/1 |
| D10 | P2 | slice-gap | moon-rover.ts:222-243; moon-rover-dress.ts:47-56 | No per-wheel suspension. The body is one spring on the mean of 6 heights, and rocker/bogie tilt is only visual, so wheels never compress. The Phase 8 raycast suspension is a rewrite of this block. | 8 |
| D11 | P2 | drawcall-hotspot | moon-suit-mesh.ts:102-123,175,183; moon-cosmonaut.ts:99 | The suit uses 24 materials, including 2 clearcoat physical materials and a transparent bubble. It is merged per joint group (about 19), so draws scale as groups × materials, doubled by the shadow pass. No LOD. | 3 |
| D12 | P2 | unfinished | moon-cosmonaut.ts:148,194,206; moon-suit-pose.ts:148,157-158 | No interact, kneel, tool-use, sample-pickup or headlamp states; all work is a single `work` blend. First person hides only the helmet, with no visor-frame body. | 3 |
| D13 | P2 | slice-gap | moon-surface.ts:214,944-958 | Lander egress hides the suit for `EGRESS_HOLD` 4.2 s, then teleports it to `egressX/Z`. No exit track or ladder, although `suit-scripted` supports `exitDoor` tracks. | 3/9 |
| D14 | P2 | slice-gap | moon-surface.ts:222; moon-base-zones.ts:477 | `EARTH_DIR` is a hard-coded vector. The dish "tracks Earth" against a constant, so no real Earth or sky direction exists for the Comms or Telescope missions. | 4/7 |
| D15 | P2 | unfinished | moon-jobs.ts:135,172,211,352 | No carry slot. Seismo "carrying" is a boolean that just hides the package; collected samples just disappear. | 6 |
| D16 | P2 | unfinished | moon-mission.ts:116,350; moon-jobs.ts:9-10,93-95 | Saves hold only the stage, cleared patches and done jobs. Drill depth, partial patch work, the active job/step and zone fault offsets are lost on reload. There is no versioned store interface to migrate. | 7 |
| D27 | P2 | slice-gap | moon-surface.ts:1087-1089; moon-mission.ts:450-452 | Movement teaching is two HUD hints ('walk', 'jump'). The first objective sends the crew to the lab terminal at (-33, 7), not to "walk to the base → airlock", and nothing requires the airlock. | 7 |
| E04 | P2 | per-frame-alloc | lib/solar-system/world-surface.ts:266-267, 340, 378 | `walkColliders()` is called once per fixed step (up to 12 per frame, `:378`). It returns `colliders.concat(earth.walkers(...))` on Earth or, through `cameraColliders()`, `colliders.concat(aliens.colliders)` on Proxima, where `colliders` holds about 110-230 flora entries. That is a fresh array per step. Keep a reused scratch array. | 1 |
| E05 | P2 | per-frame-alloc | lib/solar-system/world-earth.ts:229-236 | `drive()` runs per fixed step. It allocates `colliders.concat(carMovers)`, a new `CarWorld` object with 3 new closures, and `traffic.movers()` pushes a new `{x,z,vx,vz,r}` literal per nearby car (`world-earth-traffic.ts:194`). `people.colliders` does the same (`world-earth-people.ts:189`), and so do `movers.push({...})` and `nearPeople.push({...})` in `world-earth.ts:294-301`. `Object.values(mesh)` is also allocated per frame (`world-earth-people.ts:311`). | 1 |
| E06 | P2 | per-frame-alloc | lib/solar-system/world-earth-sky.ts:420, 424-425; world-earth.ts:256 | Every frame, `sky.update` does `state.date = new Date(...)`, runs two astronomy-engine `bodyAzAlt` calls (Sun and Moon: Equator + Horizon, object-allocating) just to test whether a re-bake is due, and `tbilisiClock()` builds a new string for a clock the HUD reads at 30 Hz. Gate the alt checks to about 1 Hz of scene time. | 1 |
| E07 | P2 | bug | lib/solar-system/world-flora.ts:86-112 | `glowing()` bakes `sway` and `emissiveIntensity` into the shader text via template literals. The material defines no `customProgramCacheKey`, and three 0.184 defaults it to `onBeforeCompile.toString()` (`node_modules/three/src/materials/Material.js:542-546`), which is the same source for every call. Pods (0.004/2.2), reeds (0.02/0.9), fungi (0/1.8) and doors (0/2.6) are all instanced with instanceColor, so they hash to one program. Whichever compiles first sets the sway and glow strength for all of them. This is the same gotcha as `withHaze`, which does set a key (`world-earth-haze.ts:82`). | 4 |
| E08 | P2 | drawcall-hotspot | lib/solar-system/world-earth-sky.ts:286-297, 441 | `refreshEnv()` re-renders a PMREM (`pmrem.fromScene`) synchronously inside the frame whenever eye adaptation drifts by e^0.4 or every 120 s of scene time. Through dusk (`setDate` to `duskFor`) and the live clock this repeats. Each call is a multi-pass cube render plus blur, a visible hitch, and it swaps `scene.environment`. | 1 |
| E09 | P2 | unfinished | lib/solar-system/world-earth-terrain.ts:196; world-earth-city.ts:486 | The finest terrain LOD (step 1, about 161² verts with a JS `number[]` index) and the full-detail city cell (`Batch` pushes plus `ShapeUtils.triangulateShape` per footprint) are both built lazily on the main thread when the camera crosses the LOD distance. Walking or driving into a new 800 m cell stalls, and the built geometries are kept until dispose, so memory only grows. | 1 |
| E10 | P2 | drawcall-hotspot | lib/solar-system/world-earth-traffic.ts:125-133; world-earth-people.ts:100-103; world-earth-streets.ts:391 | All 6 traffic and 8 people InstancedMeshes are `frustumCulled=false`, and people and cars cast shadows on desktop (`castShadow = !lite`). That is 14 always-on colour draws plus up to 14 shadow draws, even when nobody is in view or within 280 m. Instance counts are packed per frame, so these meshes could compute bounds instead. | 1 |
| E11 | P2 | drawcall-hotspot | lib/solar-system/world-aliens.ts:91-117, 171 | Each of the 6 villagers has its own `MeshPhysicalMaterial` (clearcoat and sheen) and eye material, and is merged per pivot (about 10 pivots). The result is roughly 60+ colour draws plus shadow draws for six characters, with the most expensive standard shader. The glow and ripple values could be instance attributes on one shared material. | 1 |
| E12 | P2 | missing-dispose | lib/solar-system/world-surface.ts:662; moon-surface.ts (same pattern) | `release()` calls `renderer.dispose()` but never `renderer.forceContextLoss()` (grep finds nothing in either surface). Every Moon/Mars/Earth enter creates a new `WebGLRenderer`, and old contexts linger until GC. After several enter/exit cycles browsers start dropping the oldest context, which fails the Phase 1 enter/exit ×3 memory test. | 1 |
| E13 | P2 | missing-dispose | lib/solar-system/world-terrain.ts:48, 117; world-sky.ts:165, 190 | The module-level `canvasCache` keeps 3 ground canvases per world (1024², about 4 MB each) forever after exit. `world-sky` disposes only the PMREM `.texture`, never the `WebGLRenderTarget` it came from. The Earth sky disposes the target properly (`world-earth-sky.ts:293`). | 1 |
| E19 | P2 | slice-gap | lib/solar-system/world-surface.ts:144-176, 199-203; WorldSurface.tsx:141-151 | Quality is one `lite = max-width 768px` boolean that sets shadow map size, DPR cap, antialias, dust, prints and terrain N, with no GPU or touch signal and no live switch. On context loss the rebuild passes `startOnSurface` → `skipDescent()`, which puts the player back at the pad and drops car, ride and rooftop state. Phase 1 presets and the Phase 11 checkpoint restore have to cover World as well as the Moon. | 1, 11 |
| E20 | P2 | duplication | lib/solar-system/world-surface.ts:144-158, 384-400, 401-416, 623-645, 715-726 vs moon-surface.ts:288-300, ~874, 1183-1208, 1288-1302 | Renderer setup, the visibility and context-loss handlers, the rAF/perf bracket, resize, the compile-hidden-objects trick and deferred release are copied line for line. Any Phase 1 change to the governor, presets, dispose or context loss would have to land twice. Extract a `makeSurfaceHost(mount, opts)`. | 1 |
| A18 | P3 | dt-dependent | `src/components/solar-system/SolarSystemCanvas.tsx:1356-1358` | Star shell, Milky Way band and glow rotate by a fixed amount per frame (`+= 0.000055`), so drift speed doubles on 120 Hz displays. `dtSec` is available at `:1271`. | 1 |
| A19 | P3 | bug | `src/components/solar-system/SolarSystemCanvas.tsx:613-621`, `src/lib/solar-system/planet-textures.ts:569-570` | If Earth's 2K map fails after the night map has been applied, the error path disposes the material through `disposePlanetMaterial`, which also disposes `emissiveMap` (the shared `earthNightTex`). It then installs a procedural material without re-applying night lights. `applyLoadedTexture` guards against this (`:593`); the error path doesn't. | 12 |
| A20 | P3 | unfinished | `src/components/solar-system/PlanetDetailPanel.tsx:19`, `src/lib/solar-system/saturn-rings.ts:1-88`, `src/components/solar-system/SolarSystemCanvas.tsx:121-122`, `:1442-1478` | Dead code. `PlanetDetailPanel` is imported nowhere, so `planet-data.ts` and `planet-visibility.ts` are only reachable through it. `saturn-rings.ts` has no importers. The `onCosmicView` per-frame projection path isn't passed by the Explorer. Selecting a planet only changes the mini-clock label (`SolarSystemExplorer.tsx:116`); no facts or "observe tonight" link (Stellar link, Phase 10). | 10 / 12 |
| A21 | P3 | duplication | `src/components/solar-system/SolarSystemExplorer.tsx:69-86`, `src/components/solar-system/PlayerShip.tsx:282-302` | The "wait N session frames and M ms, then fade for 700 ms" rAF poll is implemented twice (ascent and launch loaders). A third copy of the immersive body attribute lives in `SolarLoadingScreen.tsx:13-16`. One loader controller in the game shell should own it. | 0.5 |
| A22 | P3 | duplication | `src/components/solar-system/SolarSystemCanvas.tsx:174-183`, `:1148`; `src/lib/solar-system/scene-extras.ts:627`, `:643`; `src/lib/solar-system/planet-data.ts` | Surface gravity is tabled in both `SURFACE_G` (canvas) and `PLANET_DATA.surfaceGravityMs2`. The Moon's scale `earthRadius * 0.273` is hard-coded in both the canvas flight body and `makeEarthExtras`. Radial-gradient sprite generators are duplicated (`soft-sprite.ts`, `diskSprite` `scene-extras.ts:93`, `cometGlowSprite` `:2501` created 3× uncached, `lensFlareSprite` `:710`). | 12 |
| A23 | P3 | drawcall-hotspot | `src/components/solar-system/SolarSystemCanvas.tsx:373-379` | Key and fill DirectionalLights at 0.06 and 0.04 intensity are visually negligible next to ambient 0.8 and the Sun PointLight. Each adds a per-fragment light loop for every lit material in the orrery. | 1 / 4 |
| A24 | P3 | missing-dispose | `src/components/solar-system/CosmicLoader.tsx:45-49`, `src/components/solar-system/SolarSystemExplorer.tsx:129-130` | The scene loader is never unmounted, only hidden with `.is-done`. Its 3.8 s tip interval keeps re-rendering for the whole session, and its infinite CSS animations stay attached. | 1 |
| A25 | P3 | duplication | `src/components/solar-system/SolarSystemCanvas.tsx:242-252`, `:1596-1602` | `selectedRef` and `focusRef` are assigned during render and again in two redundant `useEffect`s. | 12 |
| B08 | P3 | per-frame-alloc | components/solar-system/SolarSystemCanvas.tsx:1138, 1187 | `syncWorld` runs every flight frame and allocates two closures (the `meshById.forEach` callback and `arrivalOf`). It also re-pushes the whole `world.bodies` list. `player-ship.ts:2338` allocates a `find` closure every frame while an order is active. | 1 |
| B11 | P3 | drawcall-hotspot | lib/solar-system/ship-mesh.ts:189-203; player-ship.ts:2082-2086 | 10 RCS sprites (`standardRcs`) stay `visible` at opacity 0 almost all the time, and three.js still draws them: 10 transparent draw calls every frame. Setting `sprite.visible = mat.opacity > 0.01` would avoid it. | 1 |
| B12 | P3 | dt-dependent | lib/solar-system/aliens.ts:597; SolarSystemCanvas.tsx:1356-1358 | Alien `steer` blends velocity with a linear `Math.min(1, accel*dt)` instead of an exponential. The starfield and Milky Way rotate by a fixed amount per frame (`stars.rotation.y += 0.000055`), so drift speed scales with refresh rate (2.4× faster at 144 Hz). | 2 |
| B13 | P3 | missing-dispose | lib/solar-system/aliens.ts:957-971 | `dispose` traverses the live meshes and explicitly frees `boltMatRed` and `boltGeomLong`. But pooled bolts swap geometry and material (`:553-554`, `:574-575`), so once all 14 bolts hold the long/red set, `boltGeom` and `boltMat` are never disposed. | 12 |
| B14 | P3 | unfinished | lib/solar-system/radio.ts:16-150 | `makeRadio` is never imported (dead code) and duplicates the noise buffer and `burst` from `flight-audio.ts:73-127`. The comms HUD (`player-ship.ts:2125-2151`) is silent text only. | 10 / 12 |
| B15 | P3 | unfinished | lib/solar-system/flight-audio.ts:324-360; player-ship.ts:2027-2035 | The flight model computes re-entry `heat` and shakes the camera with it, but never calls `audio.reentry(heat)`. Only `world-surface.ts:424` uses it, through a second `makeFlightAudio()` (`world-surface.ts:256`). Every mode creates its own `AudioContext` (flight, moon, backrooms, earth) with no shared bus. | 10 |
| B16 | P3 | duplication | lib/solar-system/player-ship.ts:161-162; flight-input.ts:20-21 | `CAM_ZOOM_MIN/MAX` are defined in both files and clamped twice (`player-ship.ts:2276`, `flight-input.ts:44`). | 12 |
| B17 | P3 | per-frame-alloc | components/solar-system/PlayerShip.tsx:431-441, 466-469 | The 30 Hz HUD paint allocates on every tick: a `levels` array, `r.kinds.split(',')` for 5 rail keys, `.some` closures over `navList`, template-string translation keys, and ~10 `t()` lookups. The radar canvas is fully redrawn every tick (`:484-505`). | 10 |
| B19 | P3 | bug | lib/solar-system/player-ship.ts:1776-1781 | Wings-level auto-roll reads `fwd.y`, but `fwd` is only refreshed later in the frame (`:1832`) or at the end of the previous frame (`:2275`). The upright factor is one frame stale, and in the frame after a jump arrival it comes from `:1718`. The effect is small. | 2 |
| B20 | P3 | slice-gap | components/solar-system/SolarSystemCanvas.tsx:1329; scripts/explore-bench.mjs:101-104, 113-129 | `__stellarFlight` has no `perf()` (unlike `__stellarMoon.perf()`), so the flight bench cannot report draw calls or triangles. The hook only exists after a UI click on `.flight-hud__explore`. Alien encounters are random (`aliens.ts:722`, first at 45-85 s), which makes long flight benches noisy unless `aliens.setHostile(null)` is called. | 1 |
| B21 | P3 | drawcall-hotspot | lib/solar-system/aliens.ts:94-101, 152-160 | Alien ships are unmerged primitives: the saucer has 8 running-light meshes and the mothership 18 window meshes, each its own draw call. A hostile wave with the mothership costs 40+ draw calls. | 1 |
| B22 | P3 | slice-gap | lib/solar-system/flight-missions.ts:34-61, 63 | The expedition log is proximity-only discoveries, including combat (`firstBlood`), saved under its own key. Nothing connects it to the slice's Moon mission chain; the save format needs unifying in Phase 7. | 7 |
| C12 | P3 | bug | moon-surface.ts:1257-1264,642-661 | `skipDescent()` only returns early when the phase is 'surface'. Called during the 4.2 s 'touchdown' hold after a real landing, it runs `settleLander()` again: a duplicate `boardLander` interaction, a duplicate `ourLander` POI and a second hull collider pushed into both collider lists. | 9 |
| C13 | P3 | react-per-frame | MoonSurface.tsx:286-293,312-313,264-266,315-324,358 | The HUD runs its own rAF. `pollPad` runs every display frame and allocates (`Array.from(pads).find`, `dz`/`down`/`edge` closures). At 30 Hz, `measureCompass()` reads `clientWidth` right after unconditional `root.dataset.*` writes, forcing style/layout each paint. ~20 next-intl `t()` formats run per paint even when values are unchanged. | 10 |
| C14 | P3 | bug | MoonSurface.tsx:570-572,717-736 | Mission-log contents (`rewards`, `jobsDone`, `underground`) are read from `handleRef.current` during render. Nothing re-renders when telemetry changes, so an open log goes stale, and the first render sees `null`. | 10 |
| C15 | P3 | missing-dispose | moon-terrain.ts:98,172-173; soft-sprite.ts:3,21 | Module-level caches keep 3 canvases of 1024² (lite 512²) RGBA (~12 MB) plus the soft-sprite texture for the lifetime of the tab. Heap will not return to the pre-first-entry baseline, so the Phase 1 memory test must baseline after the first enter. | 1 |
| C16 | P3 | duplication | moon-prints.ts:16-41,46; moon-surface.ts:384,395,761-777,989-998 | Each `makePrints` draws its own identical boot canvas texture and material, so `prints` and `history` hold two copies. The fixed-step accumulator loop is copy-pasted between `underground()` and the surface branch. | 1 |
| C17 | P3 | bug | moon-terrain.ts:5-6,464-489; moon-meteors.ts:219 | `stampCrater` edits only heights and the terrain attributes. The rock InstancedMesh matrices (413-462) and the print/history decals are never re-seated, so a crater under them leaves rocks floating or buried and prints hanging in the air. This contradicts the header's "the boots and the rocks all agree". | 4 |
| C18 | P3 | per-frame-alloc | moon-lander.ts:197-201,264-270,290-294; moon-meteors.ts:109,197 | `dust.burst({...})` gets a new literal per grain: up to 60–90/s during descent and ascent, plus 26 at touchdown and one per ejecta bounce. There is also `dir.clone()` per meteor. | 1 |
| C19 | P3 | drawcall-hotspot | moon-fx.ts:67,92,102-119; moon-prints.ts:53,67; moon-meteors.ts:72 | `frustumCulled=false` on dust, ejecta, and prints + history. The 1200 history decals across the base are drawn every frame from any view angle. Dust sets `alive = max` on any burst, then scans every slot and uploads full attribute buffers each frame until all grains settle. Every footstep re-uploads the whole prints instanceMatrix. | 1 |
| C20 | P3 | per-frame-alloc | moon-surface.ts:847; moon-camera.ts:122-136 | The parked rover's full `rover.update` still runs at 120 Hz in every sim step. Camera clearance does 10 probes × all `base.colliders` per frame, and that list grows as `settleLander`/mission push entries (454, 645). | 1 |
| C21 | P3 | dt-dependent | moon-audio.ts:116-127,183-200; moon-surface.ts:1132-1134,1037,1239 | Audio params are rescheduled every frame: 2× `setTargetAtTime` in `update`, 2 more in `drill` forever once the drill osc exists (it is never stopped), plus `brAudio.hum`. The suit and Backrooms each open their own AudioContext on the same gesture (moon-audio 45, backrooms-audio 42). | 10 |
| C22 | P3 | unfinished | moon-batch.ts:59-73 | `prepare()` rebuilds geometry with only position, normal and uv. Any vertex colour, uv1 or tangent on a merged mesh is dropped silently. Latent today (no kit material uses vertexColors), but it will bite Phase 0.5 GLB assets passed through `mergeStatic`. | 0.5/5 |
| C23 | P3 | slice-gap | moon-surface.ts:477,1307; scripts/explore-bench.mjs:101,131-135 | `window.__stellarMoon` and `?fixedpx` exist only when NODE_ENV is not 'production', so bench numbers come from dev builds only. Bench scenario "c-moon-lander" waits for `phase === 'surface'`, so the powered descent it is named after is never measured. `perf().calls`/`triangles` include shadow and post passes (moon-perf 50, 128). | 0/1 |
| D17 | P3 | bug | moon-jobs.ts:327-332 | An alignment step completes on *any* key release while in tolerance: `heldLast`/`heldThisStep` isn't tied to the prompt id, so releasing on another item also completes it. | 6 |
| D18 | P3 | bug | moon-jobs.ts:209,222 | The seismo status lamp material is set green on activate and never reset in `setup()`, so replaying via `startJob('seismo')` starts green. | 7 |
| D19 | P3 | bug | moon-lights.ts:18,32 | The pool accepts the first 12 requests, not the strongest. Later calls are dropped before scoring, contradicting the header (`:5`), so call order decides which lights win. | 1/5 |
| D20 | P3 | bug | moon-suit-pose.ts:79,161-165 | Pack-lag state (`lastBodyY = 0`) isn't reset on settle or teleport. The first step after spawn or teleport kicks the pack at the ±40 clamp. | 3 |
| D21 | P3 | bug | moon-suit-mesh.ts:64-65 | `fabricNormal` uses `Math.random`, so suit normals differ per build. That breaks visual-diff captures. | 3 |
| D22 | P3 | per-frame-alloc | suit-collision.ts:73-79; suit-locomotion.ts:230 | `slopeAt` returns a new `{sx, sz, steep}` every sim step (120 Hz). | 1/2 |
| D23 | P3 | per-frame-alloc | moon-base.ts:581; moon-base-zones.ts:474; moon-mission.ts:550; moon-jobs.ts:140,162 | More per-frame allocations: `inside` object literal each frame indoors, `arrays.forEach` closure, excavate `forEach`, jobs `at()` / samples target literals. | 1 |
| D24 | P3 | per-frame-alloc | moon-cosmonaut.ts:147; moon-surface.ts:1066; moon-sinkhole.ts:220 | `eye()` forces `updateMatrixWorld(true)` over the whole rig on every call, every frame in helmet view and during the fall. | 2/3 |
| D25 | P3 | duplication | moon-mission.ts:169-178; moon-jobs.ts:105-113; moon-sinkhole.ts:63-71; moon-suit-mesh.ts:179-187 | Four private copies of the mesh/own-material helper plus ad-hoc materials outside `moon-kit` (the kit only covers base/zones/rover). | 5 |
| D26 | P3 | missing-dispose | moon-surface.ts:689-690,698-711 | The Backrooms swap only changes the post scene. All Moon-surface GPU resources stay allocated underground; no unload or reload path exists. Acceptable, but it matters on mobile. | 9/11 |
| E14 | P3 | per-frame-alloc | lib/solar-system/world-flora.ts:323-332, 260 | Spores: the CPU integrates 800 (lite 350) points and re-uploads the whole position buffer every frame, with `frustumCulled=false`, wherever the player is. The drift is a pure function of `t` and a seed, so it belongs in the vertex shader. | 1 |
| E15 | P3 | per-frame-alloc | lib/solar-system/world-mars-base.ts:330-339 | The flag rewrites its vertices, runs `computeVertexNormals()` and re-uploads every frame at any distance (the whole map is 360 m), and `update` requests the greenhouse pool light every frame regardless of range (`:316`). Distance-gate both. | 1 |
| E16 | P3 | dt-dependent | lib/solar-system/world-earth-traffic.ts:152 | `pose()` turns car yaw with a fixed `c.yaw += d * 0.25` per frame. Turning speed therefore depends on frame rate: 60 Hz and 144 Hz differ, and a mobile preset at 30 fps looks sluggish. It should be `1 - exp(-dt*k)` like the rest of the code. | 2 |
| E17 | P3 | bug | lib/solar-system/world-aliens.ts:345-348; world-surface.ts:222 | Before first contact, each villager that enters `NOTICE_RANGE` calls `onEvent('notice')`, which restarts the `noticed` banner and bleeps. With 6 villagers arriving on different frames, the banner can bleep up to 6 times. Fire it once per visit. | 10 |
| E18 | P3 | unfinished | lib/solar-system/world-surface.ts:139, 227 | `CONTACT_KEY` is written on the stone event but read nowhere in `src/`, so first contact, greetings and `atStone` all reset on every Proxima visit. | 7 |
| E21 | P3 | slice-gap | lib/solar-system/world-surface.ts:245, 248; moon-cosmonaut.ts:95 | World calls `makeCosmonaut(dust, lite, gravity, !breathable, !!breathable)` with positional booleans, then `setProfile(earthGait())` on Earth. The Phase 3 cosmonaut rebuild must keep this signature (`dust, lite, g, suited, bareHead`) or migrate this call site as well. `bareHead` is how Earth avoids the helmet. | 3 |
| E22 | P3 | per-frame-alloc | lib/solar-system/world-mars-base.ts:90, 117, 146, 164; world-earth.ts:207, 213 | Every interactable's `where()` returns a new object literal, and moon-interactions scores all of them every frame (`moon-interactions.ts:67`). Earth `enterCar` also calls `car.door()` each time. Phase 6's resolver should take static position and radius data or a reusable out-param. | 6 |
| E23 | P3 | react-per-frame | components/solar-system/WorldSurface.tsx:252-253, 434 | The HUD rAF allocates `Array.from(navigator.getGamepads()).find(...)` every frame, even with no pad. The effect depends on `t`/`tw`, so a translator identity change tears down and rebuilds the whole WebGL world, including the Earth scene build. | 10, 11 |
| E24 | P3 | oversized-texture | lib/solar-system/world-earth-sky.ts:199; TelescopeEyepiece.tsx:152-154 | The Earth sky loads the full 2048×1024 `moon.jpg` to shade a disc about 0.5° across (a few dozen pixels on screen), and the eyepiece decodes it again as an `Image`. A 512 px variant is enough for the sky. Terrain ground maps are 1024² × 3 with anisotropy 8 (`world-terrain.ts:252-256`). | 1 |

## 6. Checklist by phase

Later phases pull their work from here. A finding that spans phases appears under each, with its main phase listed first. Tick an item in the commit that fixes it.

### Phase 0 — setup, audit, baseline
- [x] A07 / B20 / C23: the orrery and flight have no `perf()` hook, and the descent isn't benched. **Resolved without a source change:** `scripts/explore-bench.mjs` counts draw calls and triangles at the WebGL layer. The counts match `__stellarMoon.perf()` exactly, and the surfaces are benched after `skipDescent()`. Benching the descent itself is deferred to Phase 9.

### Phase 0.5 — game shell + asset pipeline
- [x] A15 (P2): `/solar-system` is the orrery guide only; flight and the surfaces load in the `/play` chunk (`src/components/play/PlayClient.tsx`). `/solar-system` First Load JS stayed at 120 kB.
- [x] A16 (P2): `src/game/state.ts` (`boot → title → loading → playing ⇄ paused → exiting`). `/play?moon`, `?land=`, `?orbit` work in production; `/solar-system?moon|land` redirect there (`src/middleware.ts`). Exit returns to `/solar-system`.
- [x] B02 (P1): a production path exists: title → Enter → the solar system → Explore → flight near Earth → land on the Moon (`GameShell` → `GameWorld`). Rezi's decision (2026-09-17): the game always opens on the 3D solar system and flight comes first; the Moon is never reached straight from the title. The approach cinematic is Phase 9.
- [ ] A10 (P2): the orbit canvas is not built at all until the player first goes to orbit (`GameWorld.orbitVisited`), so the Moon slice never pays for it. The galactic layers themselves still build eagerly when it is → Phase 1.
- [x] A14 (P2): the tip shuffle runs after mount.
- [x] A21 (P3): `src/game/settle.ts` owns the frame-wait; the launch loader and the orbit return both use it.
- [x] B05 (P2): sensitivity, invert and FOV in `src/game/settings.ts`, read by `moon-camera.orbit`, `flight-input` and both surfaces' lenses. Gamepad in Phase 2.
- [x] B09 (P2): `FlightSession.combat` (default on, off in the game): no cannon fire, no standing order, no provocation so no hostile waves; the order card and fire key hide.
- [x] C03 (P2): both surface effects read `t` through a ref; deps are `[glGeneration]` / `[world, glGeneration, isEarth, earthData]`.
- [x] C22 (P3): `prepare()` keeps `color`, `uv1`, `tangent`; a bucket drops any channel its parts do not all share.

### Phase 1 — performance foundation
Measurement and lifecycle first, because later numbers depend on them:
- [x] C01 / E12 (P1): `surface-host.ts` owns `release()`: the sun's shadow map, the pool lights, the post chain, the environment and the renderer go, then `forceContextLoss()`. The Moon's and the worlds' PMREM render targets are kept and disposed (E13).
- [x] A04 (P1): `GameWorld` unmounts the orbit canvas while a surface is open (its cleanup disposes every map, 4K included, and drops the context); it is rebuilt on the way back and the loader waits for its first frame.
- [x] C11 (P2): `perf.resume()` clears `lastNow` on tab return and unpause; `buildMs` is set after `compileAsync` settles.
- [x] E20 (P2): `src/lib/solar-system/surface-host.ts` — renderer, camera, sun + shadow box, light pool, post, perf + governor, live preset, loop, visibility, pause, context loss, compile, release. Both surfaces run on it.
- [x] C15 (P3): `scripts/explore-memtest.mjs` judges the trend from the second exit on.

React and allocations:
- [x] A01 (P1): the epoch is a mutable `EpochRef` the canvas reads; the mini-clock re-renders at 1 Hz.
- [x] B06 (P2): `useDrivePaint` skips while the session is inactive, paused or the tab hidden.
- [x] Per-frame allocations removed:
  - Moon: C04 (hoisted lander input, interaction / mission / airlock contexts, chase target + tunings), C05 (`seatSpotInto`, one `FootStick`), C18 (one `grain` per lander), D22 (`slopeAt` scratch), D23 (`nearHab` loop).
  - Orrery and flight: A13, A17, B07, B08.
  - World: E04 (scratch collider arrays), E05, E06.
  - Earth city and street hashes: E01, E02 (numeric `cellKey`, pooled camera colliders).
- [x] A02 (P1): belts, small bodies, moons, comet, rings and probes update only when the epoch moved.
- [x] E14 / E15: spores drift in the vertex shader; the Mars flag and greenhouse light work within 60 m.

Draw calls, lights, textures:
- [ ] C10 (P2): shadow map size and box follow the preset; the map still redraws every frame. `TODO(explore-slice)`: a static/dynamic split arrives with the Phase 4 cascades.
- [x] Shared lights: B03 (one `shipFill` light in the canvas, reparented while flying), A12 (Alpha Cen / Gargantua only in their system or during the jump), D09 (the rover's headlight is a pool request), D19 (the pool keeps the strongest twelve).
- [x] Draws that cost for nothing: A08 (hit spheres on layer 1), B11, A23, B21, C19 (dust and prints carry bounding spheres and cull; prints upload one decal at a time), E10, E11 (one skin material; the pivot count stays — a Phase 5/8 item).
- [x] C02 / A11: both composers draw into a HalfFloat target with MSAA samples from the preset (`high` = 4); `antialias` is off on the renderers.
- [x] Oversized textures: C09 (`earth-1k.jpg`, `earth-clouds-1k.jpg`, 32×20 spheres), E24 (`moon-512.jpg`), A03 (the maps go with the canvas while landed).
- [ ] Main-thread hitches: E03 fixed (Earth's environment is set before the compile). A09, E08, E09 remain → Phase 4 (A09 with the sky pass) and Phase 11 (E08/E09 with the mobile budget).
- [x] D08 / C20: a parked rover skips its ground samples, collider scan and spring; the camera's collider list is unchanged.
- [ ] C16: prints share one boot texture (ref-counted). The fixed-step loop is still written twice (surface and underground) → Phase 9 when the underground path is revisited.
- [x] A18: star drift scales with `dt`.
- [x] A24: the guide unmounts its loader once the scene is up.
- [x] C08 / E19 (P2): `src/game/quality.ts` — `performance | balanced | high`, auto-detected from GPU string, cores, touch, width and memory; drives pixel ratio, shadow map + box, bloom, MSAA, dust / print caps (live), star counts, rock density (next build). Both surfaces read it through the host; `lite` = `performance`. The governor stays underneath.

Draw calls after this phase (probe, DPR 1, 1280×800): orrery 195 → 153, flight 189 → 90, Moon lander 569 → 387, Moon base 535 → 368, Mars 305 → 207. The cosmonaut is still ~114 of every surface frame (D11 → Phase 3); the base ~200 (rover 59 → Phase 8; kit pieces → Phase 5).

### Phase 2 — movement feel + camera
- [ ] C06 (P2): the camera springs (explicit Euler on frame dt) overshoot on a hitch. Use sub-steps or an analytic spring.
- [ ] C07 (P2): the lander, dust and ejecta run on frame dt. The touchdown grade depends on frame rate.
- [ ] B04 (P2): flight mouse and look-pad shaping is applied per frame. Rescale it by dt.
- [ ] B05 (P2): gamepad input for flight. Moon and World already poll it, so unify into one input table.
- [ ] B12 / E16 (P3): alien steering and traffic yaw are frame-rate dependent.
- [ ] B19 (P3): wings-level reads a stale `fwd`.
- [ ] D24 (P3): `eye()` forces `updateMatrixWorld(true)` on the whole rig every call.
- [ ] Tests for determinism at 30/60/144 fps and keyboard/gamepad parity. These don't exist yet (§4.4).

### Phase 3 — cosmonaut
- [x] D11 (P2): the suit is `public/explore/models/cosmonaut.glb` (`assets-src/blender/cosmonaut.py`): 23.9k triangles, one 2K atlas (colour, normal, AO/roughness/metalness, emissive) plus the gold visor, 1.46 MB. One skinned body and a 6k-triangle LOD1 beyond 25 m (12 m on lite). The body is bound to the rig's own joints (now `THREE.Bone`s), so moon-suit-pose drives it unchanged. The helmet and visor ride the neck and the visor hinge. Moon probe: the cosmonaut draws in **6 calls** including shadows (was ~114).
- [x] E21 (P3): `makeCosmonaut(dust, lite, g, suited, bareHead)` unchanged; Earth hangs the pilot's head from the model and folds the pack into its pivot. Mars and Earth captured without errors.
- [x] D21 (P3): no `Math.random` texture left; the code-built suit and its canvas textures are gone.
- [x] The surfaces compile after the model is on the rig (`SurfaceHost.start(frame, onReady, cosmonaut.ready)`), so the skinned programs are never a first-sight stall. The headlamp (F) also brightens the helmet lamps and displays (`cosmonaut.lamps`).
- [ ] D12 (P2): no reach, kneel, tool, pickup or headlamp-toggle poses yet; the plan's full animation list (baked clips for idle breathing, kneel-and-collect, ladder, tool use) is still open.
- [ ] D13 (P2): lander egress hides and teleports the suit. Use a ladder or exit track (with Phase 9).
- [ ] B10 (P2): the flight EVA suit in `ship-mesh.ts` is still code-built; fold it onto the model once the ships work (branch `explore/ships`) lands in that file.
- [ ] D20 (P3): reset the pack spring on settle/teleport.
- Known: at close range from below, slivers of the gold visor show inside the chin ring. The upper-arm flags, chest roundel, pack flag and wordmark read in the turntable (`assets-src/renders/cosmonaut/sheet.png`, reference on top).

### Phase 4 — terrain, lighting, sky
- [x] D14 (P2): the sky is real (`moon-sky.ts`). Stellar Base stands in the south polar region (76°S, 0°E), so Earth hangs low in the north over the base as seen from the pad. Its direction and size (1.8–2.0°, was 4.8°) come from the libration for the day, and it drifts 5–20° up through the month. The dish and the missions read `sky.earthDir`. Earth is turned so the side in daylight right now faces the scene sun, its pole on its real axis. The ~70 catalogue bright stars and the Milky Way sit at their true places, a seeded faint field between them, sized by magnitude; they dim when the Sun or Earth is in frame. The sky rides with the camera (no parallax), with Earth at 3 km so the horizon hills can hide it.
- [x] Sun: lower (17°, from the south-west), a darker bounce (hemisphere 0.55 → 0.4) and a weaker earthshine fill. A polar site keeps the sun low for real; its hour is still chosen for play.
- [x] Compass: the Moon's and the worlds' HUD compass was mirrored (north +Z, east +X: things on your right showed left on the ribbon). Now north −Z, east +X, the base layout's own frame; mission, job and sinkhole bearings use the same `atan2(dx, −dz)`. Tbilisi already did.
- [x] C17 (P3): a new crater blows the small rocks out of its bowl, re-seats the rest on the new ground and takes the prints in it (`terrain.stampCrater` + `prints.clear`, through `dig` in moon-surface). Rocks are cleared off the walked paths and rover tracks.
- [x] E07 (P2): flora glow materials carry a `customProgramCacheKey` of their sway and glow.
- [x] Captures (headless, real GPU): Earthrise over the habitats from beside the lander, the base in raking light, the far horizon, the ridge. No bloom washout; 0 console errors. Moon probe 95 draws total in the base view.
- [ ] C10: the shadow map still redraws every frame (dynamic casters move every frame anyway); a static/dynamic split is open.
- [ ] A09 (orrery galactic tier hitch) is not in the lunar slice; it stays open for the orrery pass.

### Phase 5 — base as a place
- [ ] D02 (P1): no telescope platform, dome or mount exists. Build the zone and its state hooks.
- [ ] D04 (P1): the mission terminal is an outdoor pedestal. Move it behind the airlock.
- [ ] D01 (P1): the airlock can be bypassed because the door stays open inside 8.5 m. Close it behind the crew or add an inner door (fix with Phase 6).
- [ ] Base state hooks to add: power on/off lighting, antenna link, dome open, garage charging. Only status lamps and the array/dish fault offsets exist today.
- [ ] D25 (P3): four private mesh/material helpers sit outside `moon-kit`.
- [ ] D19 / C22: the light pool and `mergeStatic` attributes, if not already closed.

### Phase 6 — interaction architecture
- [ ] D05 (P2): `where()` allocates for about 19 items every frame. Use static position data.
- [ ] D06 (P2): the resolver, airlock, mission and jobs run on render dt. Move them onto the fixed step or make them dt-safe.
- [ ] D15 (P2): no carry slot (seismo is a boolean, samples vanish).
- [ ] D17 (P3): alignment completes on any key release.
- [ ] E22 (P3): World interactables allocate too. Migrate Mars, Proxima and Earth onto the same resolver.
- [ ] D01: the airlock as a proper `enter` interactable.

### Phase 7 — mission engine + five missions
- [ ] D03 (P1): two quest systems (the 5-act if/else plus job steps). Fold them into one data-driven engine.
- [ ] D02 / D04: telescope calibration and the terminal mission.
- [ ] D16 (P2): mid-act progress is lost on reload. Build a versioned `MissionStore` and migrate the `_v2` and jobs keys.
- [ ] D27 (P2): the first objective skips "walk to base → airlock", and movement is taught by two hints.
- [ ] D14: real Earth and sky directions for the Comms and Telescope missions.
- [ ] D06: hold and drill outcomes vary with frame rate.
- [ ] B22 (P3): the flight expedition log has its own save and combat entries.
- [ ] D18 (P3): the seismo lamp is never reset.
- [ ] E18 (P3): the Proxima contact key is never read.

### Phase 8 — rover
- [ ] D10 (P2): no per-wheel suspension (one spring on the mean height).
- [ ] D07 (P2): the rover updates on render dt during descent and ascent.
- [ ] D08 (P2): the rover updates every step while parked.
- [ ] D09 (P2): the headlight is outside the light pool.
- [ ] Battery isn't saved and has no dash display.

### Phase 9 — travel, approach, landing
- [ ] A05 / B02 (P1): the Moon can't be selected in the orrery (not a `SolarBodyId`, no pick sphere).
- [ ] A06 / B01 (P1): flight to Moon is a hard cut (`onLand(site)` passes only an id, and the surface lander is a different vehicle).
- [ ] A04 (P1): two live contexts during the handoff.
- [ ] A12 (P2): flight lights recompile every planet material on launch.
- [ ] C12 (P3): `skipDescent()` during touchdown double-registers the lander interaction and collider.
- [ ] C07 / D13: landing grade, and egress.
- [ ] D26 (P3): Moon GPU resources stay allocated in the Backrooms.
- [ ] Bench the powered descent (not covered by §3 scenarios).

### Phase 10 — HUD, audio, Stellar link
- [ ] B18 (P2): `PlayerShip.tsx` is 852 lines. Split it for the HUD redesign.
- [ ] B06 (P2): the drive HUD loops run under the Moon.
- [ ] C13 / E23 (P3): gamepad polling allocates every frame, and a forced layout read runs per paint.
- [ ] C14 (P3): the mission log goes stale while open.
- [ ] B17 (P3): the HUD paint allocates.
- [ ] B15 / C21 (P3): one `AudioContext` per mode with no shared bus. Re-entry audio is silent in flight, and the drill oscillator is never stopped.
- [ ] B14 (P3): `radio.ts` is unused. Reuse it for radio chatter or delete it.
- [ ] E17 (P3): the Proxima notice banner fires up to 6 times.
- [ ] A20 (P3): selecting a planet shows no facts and no "observe tonight" link.
- [ ] C03: the scene rebuilds on a locale change, if not closed in 0.5.

### Phase 11 — mobile + adaptive quality
- [x] C08 / E19 (P2): `detectQuality(deviceSignals())` picks the preset; `moon-perf.onOverBudget` → `stepQualityDown()` takes a whole level once the pixel ratio is at its floor, under `auto` only and never upwards.
- [x] E19: a lost context rebuilds the scene in place and comes back on the surface with the mission progress intact (checked in `explore-mobile.mjs` and again in `explore-e2e.mjs`).
- [x] A03 (P1): the detail (4K) maps are never fetched on a low-data connection or during an arrival, and mobile starts on `performance`; the decode is off the main thread (`texture-load.ts`).
- [ ] B18 / B06: the touch layout still lives in `PlayerShip` for flight; the surfaces' deck is in `MoonSurface`/`WorldSurface` and shares `GameStick` + `surface-controls`.
- [ ] D26: memory while in the Backrooms — not measured; the three-visit heap check covers the surface only.

### Phase 12 — QA + cleanup
- [x] Dead code:
  - A20: `PlanetDetailPanel.tsx`, `planet-data.ts`, `planet-visibility.ts`, `saturn-rings.ts` and the whole `onCosmicView` projection path (with `projectToScreen` / `localToScreen`) deleted.
  - B14: `radio.ts` deleted — nothing imported it.
  - Also: `loadedModelCount`, `ROVER_GEARS`, `mixRgb`, `rgbStr`; 23 dead i18n keys in both locales; 96 CSS rules (15.5 kB) for markup that no longer exists.
- [ ] Duplication: A22 (gravity tables and sprite generators), B16 (camera zoom constants) and A25 (redundant ref effects) are left as they are — each is a refactor across live systems, which is not what a QA phase is for.
- [x] A19 (P3): the failed-texture path hands the shared night map back before disposing the material, and re-applies it.
- [x] B13 (P3): all four bolt geometries and materials are freed by name, whichever set the pool is holding.
- [x] B09: checked end to end in `explore-e2e.mjs` — `session.combat` is false at `/play` and the fire key is not in the DOM.
