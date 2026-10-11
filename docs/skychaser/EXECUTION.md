# Stellar rebrand — execution plan

## Context
`~/Desktop/Stellar/plans/stellar-rebrand-migration-plan.md` rebrands Stellar into a card universe backed by the observatory. It has 9 phases and 4 hard gates. The work happens on an isolated `stellar-cards` branch, and production (stellarr.club) keeps running from `main`.

**Repo rule:** all work, branches and pushes go to **Rezimod/Stellar** (`origin`, local `/Users/nika/Desktop/Stellar-rezimod`). The Darkview repo (github.com/Bekatsertsvadzee/Online-Observatory) is consumed over its HTTP contract only; nothing is pushed there. See "Beka's repo" below.

Three read-only audits checked the plan against the real code. It holds up overall, but the corrections below are mandatory. Without them, Phase 2 breaks minted NFTs and Phase 3 cannot capture anything.

## Corrections to the plan

**Branch base**
1. Cut `stellar` from **origin/main**, not the local `main`. Local main is 72 commits behind. origin/main already contains all of observatory/v2: `sim-stations.ts`, `telescope-targets.ts`, `first-light`, the simulator, plus 24 newer explore commits.
2. The current checkout (`observatory/v2`) has 8 uncommitted explore files. I will use a **git worktree** (`../stellar-cards-wt`) so that work-in-progress is never touched.

**Phase 2, deletion scope**
3. The cut is about **26,600 LOC, not 8,300**:
   - pages: 12.2k
   - CUT-only APIs: 3.5k
   - components: 8.9k
   - libs: 1.8k
   - tests
   On top of that, about 14k LOC is already unreachable (most of `components/home`, `landing`, `dashboard`, the old sky mission UI). The Phase 1 check "deletion is near 8,000 lines" will read as a false alarm, so the expected figure changes to about 26k.
4. **Do not delete**, even though these sit inside cut areas:
   - `src/app/m/o/route.ts`. It is the on-chain metadata URI of every minted cNFT (`mint-nft.ts:87`).
   - `api/observe/photo/[hash]` (NFT photo URL) and `api/observe/onchain/[wallet]` (used by profile).
   - `api/feed/follow` and `components/feed/FollowButton` (used by `u/[wallet]`).
   - `api/passport`, `api/nft-image`, `api/redeem-code` (called by the Astroman till).
   - `public/solar-system/*` textures (used by the kept AR finder).
   - The DB tables `observation_log` and `feed_*` (kept code still reads them).
5. Seams that must be fixed rather than deleted:
   - `darksky` redirects to `/network` (cut) and needs repointing.
   - `api/award-stars` must be trimmed to the `find:` branch only.
   - `api/mint` depends on `MISSIONS` and `observation-token`.
   - `useAppState` is built around `completedMissions`.
   - Links to cut routes in `profile`, `nfts`, `sky`, `star`, `marketplace/checkout`, `HelpBanner`, `Nav`, `BottomNav`, `Footer`, `SearchModal`, `sitemap.ts`, `robots.txt`, `tweet-agent.ts`, and `cron/push` (`url: '/missions'`).
   - `sitemap.ts` currently leaves out `/observatory`, `/first-light` and `/star`. Add them.
6. `src/lib/solar-system` becomes unreachable once `/solar-system` is cut. Move it to `tools/explore/` in **Phase 2**, not Phase 7, together with its tests (`player-ship-flight.test.ts`, `star-routes.test.ts`). Only `ephemeris.ts` and `planet-palettes.ts` stay in `src`.

**Phase 3 and 4, observatory reality**
7. Observatory corrections:
   - `dark-window.ts` is at `src/lib/dark-window.ts`, not under `observatory/`. It anchors on the runtime's local hours, which is UTC on Vercel. Wrap it with the site timezone from `site-time.ts`.
   - The schema declares no FKs. `capture_id` columns are plain `uuid`, following existing convention.
   - There are no migrations: changes go through `db:push` plus hand-written SQL comments.
8. Target and capture limits:
   - The simulator captures only 8 targets: moon, jupiter, saturn, mars, venus, m42, m31, m57.
   - The only node (`tbilisi-01`) is `commissioning`, so every sim capture returns `retry`.
   - TYCHO (the lunar crater) is not in the codebase. It becomes a card with `target_id='moon'` plus selenographic coordinates (43.3°S, 11.4°W).
   - The lifecycle runner uses a sim node override `{...node, status:'active'}` and a fixed night timestamp. This is the same pattern as `observatory-deliver.test.ts`.
9. Where attachment happens:
   - Hook it next to `attachToPoster` (`src/lib/observatory/deliver.ts:773`), which is already a single conditional `UPDATE`.
   - Add `attachToEditions(captureId, targetId)`: one `UPDATE edition … WHERE card_id IN (cards on target)`. It will not be a loop.
   - Captures carry `provenance='simulated'`, which `admitToCollection` refuses. That is fine, because editions are not cNFT mints.
10. `optics.ts` has no function that decides whether an object is resolvable. For Phase 4, `observation_status` needs a small helper: Dawes limit (`resolvingPowerArcsec`), plus `node.bortle` with `limitingMagnitude` (`sky-field.ts:367`), plus membership in the sim/telescope targets.

**Rarity, brand, infrastructure**
11. The rarity tier `Stellar` is **already written on-chain** in minted cNFT metadata (`mint-nft.ts:85,87,112`).
    - Create a new `src/lib/rarity.ts` for cards.
    - Keep `getRarityInfo` (legacy tiers) for the old `/nfts` and `/api/nft-image`, which must still accept `rarity=Stellar`.
    - Delete only `calculateRarity`.
12. Group (d), never rename:
    - The collection name `Stellar Observations` and symbol `STLR`.
    - The Anchor program `stellar_observations` and its IDL.
    - The `STELLAR_PAUSED` env var.
    - The `stellar_locale` cookie.
    - About 22 `stellar_*` / `stellar.*` localStorage keys, including `stellar_anon_id`, which analytics continuity depends on.
    - The package name.
    - There is no Stellar-blockchain SDK anywhere.
13. `#c9a84c` does **not** exist in the repo. It becomes a new token, and the Stellar design system is built fresh rather than "carried over".
14. English-only means more than archiving `ka.json`:
    - Set `request.ts` locales to `['en']`.
    - Remove 195 `=== 'ka'` branches across 37 files, `LanguageToggle` and `LocaleToggle`, and the Georgian font.
    - Doing this in Phase 6 is safest. In Phase 2, only change `request.ts` and archive the file.
15. Payments: the only rail is Solana Pay (`api/orders` + `orders/confirm`), and there is no card processor. For beta, capsules reuse the `orders` + Solana Pay pattern. A card processor is out of scope.
16. Preview environment:
    - Use a **Neon branch** with a Preview-scoped `DATABASE_URL` on the existing Vercel project. A new Vercel project is optional.
    - Previews share mainnet secrets (fee payer, Stars mint authority, Upstash). Set `STELLAR_PAUSED=1`, or remove the mint/fee-payer keys in the Preview env, before the first preview deploy.
17. There is no `typecheck` script. Use `npx tsc --noEmit` (the same as CI) plus `npm run build`.

## Execution model (agents)
I act as the **orchestrator** in the main session. I own the branch guard, merges into `stellar`, commits and gate reports. The work runs in `git worktree` checkouts under `/Users/nika/Desktop/`, and each sub-agent gets a non-overlapping file set.

Every phase ends with a **reviewer agent** that reads the diff adversarially against the plan and this corrections list, and a **QA agent** that runs tsc, vitest, build and Playwright. Nothing merges on an agent's own summary.

| Phase | Agents (parallel within the phase) | Output |
|---|---|---|
| 0–1 | Orchestrator: worktree, `CLAUDE.md` standing rules (merged with the existing CLAUDE.md), Neon branch, Preview env. **Inventory agent**: `docs/stellar-inventory.md` (the 4 sections the plan asks for, pre-filled from these audits) | 1 commit |
| 2 | **Cutter** (commit 1: routes and components; commit 2: APIs and orphan libs, archiving learn-data/quizzes, moving solar-system to `tools/explore`). Then in parallel: **Seam fixer A** (nav, sitemap, pages, links, tweet/push copy) and **Seam fixer B** (award-stars trim, mint, useAppState, tests, e2e). Then **Verifier** (build, reachability re-scan) | 3 commits |
| 3 | **Backend agent**: schema (`card`, `edition`, `nightly_target`), `src/lib/stellar/*`, `attachToEditions`, target picker (`gradeTargets` + `sortGraded('zenith')` over the dark window), and `scripts/stellar-lifecycle.ts` (`npx tsx`, the same `.env.local` pattern as `seed-feed-demo.ts`), plus a plain `/collection` list. In parallel, a **Darkview adapter agent**: vendor the pinned `openapi.yaml`, implement `DarkviewAdapter`, run the local Darkview sim stack for proof (b). **Reviewer**: checks one UPDATE statement, history append, and a null-capture render | Gate 1 |
| 4 | **Data agent**: `src/lib/sets/set-001.ts`, 16–20 real objects with sourced RA/Dec and at least one epic + not_available (Europa). **Rarity agent**: `rarity.ts`, legacy split, observability helper | 1 commit |
| 5 | **Engine agent**: `capsule`/`capsule_pull`, commit-at-listing, HMAC outcome, sequenced append-only log, atomic edition allocation, exhaustion redistribution, `src/lib/stellar/economics.ts` constants. **Payment agent**: capsule and direct-card orders via the existing Solana Pay flow. **Security agent** (smart-contract-security / cso lens): grinding, selective abort, concurrency | Gate 2 (your numbers) |
| 6 | **Design-system agent**: tokens, serif + mono, brass, English-only strip. Then in parallel: **CardPlate + /set/001 + /card/[designation]**, **/collection** (replacing /nfts, keeping the legacy view reachable), **Reveal agent** (canvas meteorite, by rarity), **Landing agent**. Then **Critique agent** and **Playwright mobile QA** | Gate 3 (a stranger) |
| 7 | **Render agent**: `tools/explore/render-card.ts`, headless, 3 stills only (Saturn, Mars, Europa), then STOP | Your judgement |
| 8 | **Beta agent**: invite gate, funnel events via the existing `track.ts`. **Voting/tonight agent**: `card_vote`, `/tonight`, a forced cloudy-night path | Gate 4 (weeks of real use) |
| 9 | **Brand-pass agent** (driven by the group (d) list), domain and redirects, SEO. **Verifier**: grep of group (d) must be unchanged | Only after Gate 4 |

Deletions always get their own commits. The orchestrator checks `git branch --show-current` before every commit and only pushes to `origin stellar`. `anchor/`, `docs/grant-evidence/` and the production DB are never touched.

## Time estimate (my execution; your gate reviews not included)
| Phase | Agent wall-clock |
|---|---|
| 0–1 setup + inventory | 1–2 h |
| 2 cut (26k LOC + seams) | 5–8 h |
| 3 TYCHO slice (+ Darkview adapter and integration proof) | 9–14 h |
| 4 Set 001 | 3–5 h |
| 5 capsules + randomness + payment | 6–10 h |
| 6 visible product | 10–16 h |
| 7 art experiment | 3–5 h |
| 8 beta + voting + /tonight | 6–8 h |
| 9 production rebrand | 3–5 h |
| **Total** | **~46–73 h**, about **7–10 working days** of build |

- **To Gate 1** (Phases 0–3) is about **2–3 days**. That is the point where the idea is proven or killed.
- **To Gate 3** (Phases 0–6) is about **5–6 days**, plus your stranger test.
- The calendar is set by the gates, not by the code: Gate 2 needs your cost numbers, Gate 3 needs strangers, and Gate 4 needs weeks of beta. Card art (illustrator) is the long pole and should start in parallel now.

## Verification per phase
- **Every commit:** `npx tsc --noEmit && npm test && npm run build` in the worktree.
- **Phase 2:** re-run the reachability scan. The e2e route list is updated, `/m/o`, `/api/observe/photo` and `/darksky` respond, and stellarr.club (main) is unaffected.
- **Phase 3:** `npx tsx scripts/stellar-lifecycle.ts` runs end to end on the Neon branch with no manual SQL. A vitest spy asserts a single UPDATE call.
- **Phase 5:** a 10,000-pull distribution test, concurrent allocation producing gapless edition numbers, commit-reveal verification, and a gap detected in the log.
- **Phase 6:** Playwright at 390px on `/set/001`, `/collection` and the reveal, with screenshots for you.
- **Phase 9:** the group (d) grep diff is empty, and redirects are verified in production.

## Beka's repo: what we take, and how
`github.com/Bekatsertsvadzee/Online-Observatory` is the **Darkview platform**, the real observatory back end:
- `agent/`: a Python agent that drives a NexStar 6SE through Alpaca, a ZWO ASI585MC, ASTAP plate solving and autofocus, with `SimMount`/`SimCamera`/`SimFocuser` as the default devices.
- `apps/api`: REST for bookings, missions and captures, with its own `SimulatorObservatoryAdapter`.
- `apps/realtime`: an always-on WebSocket service.
- `packages/db`: Prisma.
- `contracts/openapi.yaml`: 5.8k lines, the single source of truth.

Its stack does not match Stellar: Next 16, TS 6, Prisma, Node 24, against Next 15, Drizzle and Node <23. Its README forbids source paths that also exist in its client repo.

So **no Darkview source is copied into Rezimod/Stellar.** Stellar is a client of Darkview, and we take exactly this:
1. **A vendored, pinned `openapi.yaml`** at `src/lib/observatory/darkview-contract/` with generated types. This is the client pattern the README itself prescribes. Nothing is edited upstream, and nothing is pushed to Beka's repo.
2. **Implement the stub `DarkviewAdapter`** (`src/lib/observatory/darkview.ts:78`) against the contract. The chain is: `/observatories/{id}/state`, then `/targets/tonight`, then `/bookings` (service account), then `/missions/{id}/start`, then poll `/missions/{id}/events`, then `/captures/{id}` and `/captures/{id}/download`. The result maps onto Stellar's `CaptureOutcome` and `recordCapture` (provenance `instrument`, or `simulated` when the Darkview state reports `simulated: true`).
3. **Three proofs instead of two** in Phase 3, all on the same Stellar code path:
   - (a) Stellar `SimNodeAdapter`: the engineering proof, this week.
   - (b) **Darkview running locally in simulator mode** (`apps/api` :4000, `apps/realtime` :4001, `python -m darkview_agent` with sim devices), with `tbilisi-01` given a `link.baseUrlEnv` pointing at it: the integration proof, with no hardware.
   - (c) The real Node 01: the reality proof.

Things to watch:
- Darkview refuses every slew while `maxAltitudeDegrees` is `null` (`SAFETY_ENVELOPE_UNMEASURED`, DV-034). Proof (b) needs the dev seed or an admin `safety-envelope` value on the local sim DB.
- Darkview is booking/slot-based. Stellar's nightly target becomes one booking per night under a Stellar service account, which is how "one capture serves every edition" maps onto it.
- The Darkview repo is under active development (commits today, ADR-022 subscriptions). Pin the contract to a commit SHA and re-sync deliberately.

Added effort: +5–8 h in Phase 3, covering the contract vendoring, the `DarkviewAdapter`, a local Darkview sim stack and the integration run.

## Open item
None blocking. Gate numbers (Phase 5) and card art are yours, per the plan.
