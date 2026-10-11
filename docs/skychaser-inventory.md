# Stellar inventory (Phase 1)

Computed on branch `stellar-cards` at `1b3213c` (cut from origin/main). The numbers come from an import graph over all 704 files in `src/` (`.ts .tsx .js .mjs .css .json`). The graph resolves `@/` to `src/`, and follows relative imports, `export … from`, `import()`, `require()` and CSS `@import`, plus the `i18n/request.ts` template import of `messages/*.json`. Edges were cross-checked against `ts.preProcessFile`, with 0 differences and 0 unresolved imports. API callers come from scanning `'/api/…'` string literals, template URLs included.

**Reachability roots:**
- every KEEP page and API route file (`page`, `route`, `layout`, `loading`)
- the root `layout.tsx`, `not-found.tsx`, `sitemap.ts` and `opengraph-image.tsx`
- the 5 `vercel.json` crons
- `src/i18n/request.ts` and `src/lib/empty-module.ts`, both referenced from `next.config.ts`

There is no `middleware` or `instrumentation` file. "LOC" means `wc -l`.

**Totals:**

| | files | LOC |
|---|---|---|
| Phase 2 delete | 105 | 25,336 |
| archive | 3 | 5,147 |
| move to `tools/explore` | 129 | 39,524 |
| **Phase 2 grand total** | **237** | **70,007** |
| already dead before the cut (reported separately, §5.6) | 82 | 11,814 |

---

## 1. Brand strings

Scope: `src/`, `public/`, `package.json`, `next.config.ts`, `vercel.json` and `.env.example`, searched case-insensitively for `stellar*` plus `STLR`.

- There are **800 occurrences on 722 lines in 196 files**.
- `next.config.ts` and `vercel.json` contain none.
- Occurrences by where the file ends up after Phase 2:

| Where the file ends up | Occurrences |
|---|---|
| kept code, config and public | 539 |
| deleted | 111 |
| moved to `tools/explore` | 52 |
| already dead | 51 |
| archived (`ka.json`) | 36 |
| tests | 11 |

**Stellar blockchain:** there is **no** Stellar-network reference. A search for `stellar-sdk`, `@stellar/`, `stellar-base`, `horizon.stellar`, `soroban`, `XLM`, `lumens` and `freighter` finds only prose ("freighters" in explore copy). Every `horizon` hit is astronomical.

### 1(a) Brand and UI copy to change later (Phase 9), kept files only

The counts below include the (b), (c) and (d) lines that sit in the same file.

| File | n | Examples |
|---|---|---|
| `app/faq/page.tsx` | 40 | FAQ Q&A copy, "What is Stellar?" |
| `messages/en.json` | 39 | `comparison.title1` "What sets Stellar apart", `rank.stellar`, `shareTweet` "@StellarClub26 … #Stellar" |
| `app/globals.css` | 38 | `--color-stellar-*` tokens (l.432) and `.stellar-*` classes (internal) |
| `components/shared/Footer.tsx` | 30 | `.stellar-footer*` classes, copy, X link |
| `lib/tweet-agent.ts` | 24 | system prompt and bot URLs (also in 1c) |
| `app/layout.tsx` | 15 | `title: 'Stellar — Observe the Night Sky…'` l.72, `siteName` l.91, apple title l.121 |
| `app/terms/page.tsx` | 14 | legal copy |
| `app/profile/page.tsx` | 12 | copy, `useStellarUser` |
| `app/settings/page.tsx`, `app/nfts/page.tsx`, `components/shared/JsonLd.tsx` | 10 each | JsonLd `name: 'Stellar'` l.13, l.23 |
| `app/contact/page.tsx`, `app/cookie-policy/page.tsx`, `components/shared/Nav.tsx`, `lib/observatory/darkview.ts` | 8 each | Nav `title="Stellar"` l.143 |
| `app/sky/page.tsx`, `app/marketplace/checkout/page.tsx`, `components/providers/WalletSync.tsx`, `hooks/useStellarUser.ts`, `lib/idl/stellar_observations.ts` | 6 each | |
| `app/marketplace/page.tsx`, `app/marketplace/[id]/page.tsx`, `app/star/[catalogId]/page.tsx`, `app/api/metadata/collection/route.ts`, `components/providers/ThemeProvider.tsx`, `lib/mint-nft.ts`, `lib/observation-program.ts`, `lib/observer-location.ts`, `lib/x-compose-page.ts`, `lib/observatory/types.ts`, `.env.example` | 5 each | `observatory/types.ts:2` "Stellar Observatory" |
| 88 further kept files | 1–4 each | `app/page.tsx`, legal pages, `ComparisonTable`, `BottomNav`, `AstroLogo` aria-labels l.42/62, `public/manifest.json:2-3`, `public/sw.js:1,18,23`, `opengraph-image`, observatory pages, … |

Internal identifiers that are not user-facing are optional renames, not group (d):
- `useStellarUser` (105 refs) and `useStellarAuth` (14)
- the `StellarUser` / `StellarAuthSource` types
- `src/styles/stellar-tokens.css`
- the `.stellar-*` CSS classes and `--stellar-*` custom properties
- the download filename `stellar_${stamp}_…png` at `TelescopeConsole.tsx:361`

### 1(b) The rarity tier `Stellar`

It is defined in `src/lib/nft-rarity.ts`:
- l.1: `type NftRarity = 'Celestial' | 'Astral' | 'Stellar' | 'Common'`
- l.14: the `RARITY_MAP.Stellar` entry
- l.22: inside `calculateRarity`

| Consumer | Line | What | After the cut |
|---|---|---|---|
| `app/api/mint/route.ts` | 211 | `rarityVal = … 'Stellar'`, written on-chain | KEEP |
| `lib/mint-nft.ts` | 85, 87, 112 | rarity into the art URL, the `/m/o?…r=` URI and the `Rarity` attribute | KEEP (on-chain) |
| `app/api/nft-image/route.tsx` | 33 | `case 'Stellar':` border colour | KEEP, must accept `rarity=Stellar` |
| `app/m/o/route.ts` | 12, 30 | reads `r`/`rarity` and echoes it as an attribute | KEEP |
| `app/api/metadata/observation/route.ts` | 22, 92 | same | KEEP |
| `app/api/award-stars/route.ts` | 24 (type), 30 | `rarityFromConfidence` → `'Stellar'` (cosmic-bonus branch) | goes with the trim (§4) |
| `lib/cosmic-bonus.ts` | 1 | `NftRarity` type | second-order delete |
| `app/nfts/page.tsx` | 19 | `getRarityInfo` | KEEP (legacy view) |
| `app/observe/[missionId]/verify/page.tsx` | 14 | `calculateRarity` | CUT |
| `app/observe/[missionId]/ObserveFlowContext.tsx` | 7 | `RarityInfo` type | CUT |
| `components/sky/MissionActive.tsx` | 24 | `calculateRarity` | already dead |

**Result:** after the cut `calculateRarity` has no caller, so delete only that function, as correction 11 in `EXECUTION.md` says. Keep the type, `RARITY_MAP` and `getRarityInfo`.

Two other `'Stellar'` strings are not the rarity tier:
- the user rank `rank.stellar`: `en.json:935`
- the feed category label `star: 'Stellar'`: `lib/feed/types.ts:63` (CUT)

### 1(c) URLs and domains

**`stellarr.club`:**
- `layout.tsx:75,90,102,106`
- `sitemap.ts:3`
- `public/robots.txt:10`
- `public/.well-known/security.txt:4,5`
- `JsonLd.tsx:12,14,15,22,24,28`
- `api/metadata/collection/route.ts:9,10`
- `api/metadata/observation/route.ts:83,84`
- `m/o/route.ts:15`
- `api/mint/route.ts:322`
- `api/og/sky/route.tsx:80`
- `api/og/tonight/route.tsx:105`
- `api/first-light/poster/route.tsx:165`
- `api/agent/draft-tweet/route.ts:86`
- `marketplace/layout.tsx:12`
- `sky/layout.tsx:12`
- `nfts/page.tsx:141`
- `star/[catalogId]/page.tsx:113`
- `lib/tweet-agent.ts:18,36,246,295,296,297,298,303,314`
- `lib/tweet-image.ts:140`
- `lib/x-compose-page.ts:4,24`
- in files being deleted: `share.ts:9` (dead), `api/share/og:55`, `api/star/claim:189`, `api/feed/shares:47`, `feed/layout:12`, `hub/layout:12`, `learn/layout:12`, `missions/layout:12`, `games/up-now/page:243`, `observe/[missionId]/result:146`, `HomeSkyPreview:275` (dead), `MissionActive:532` (dead)

**`stellarrclub.vercel.app`:**
- `lib/mint-nft.ts:78` and `lib/telescope-passport.ts:157`. These are the `appUrl` fallbacks baked into minted URIs, so the old host must keep serving `/m/o`, `/api/nft-image` and `/api/passport`.
- `.env.example:41`

**Other:**
- `stellar.vercel.app`: `test/stage5.test.ts:44`
- `@stellarrclub`: `lib/tweet-agent.ts:28` and `.env.example:96`
- `@StellarClub26` / `x.com/StellarClub26`:
  - `layout.tsx:98`
  - `contact/page.tsx:23,24`
  - `JsonLd.tsx:16`
  - `Footer.tsx:39`
  - `en.json:3046,3047` and `ka.json:3046,3047`

### 1(d) MUST NOT CHANGE

There are **54 identifiers**, listed in the tables below. "gone" means the location disappears in Phase 2. The key itself must still never be renamed, so that explore saves and returning users keep their state.

**On-chain names and derivations**

| # | Identifier | Location | Context |
|---|---|---|---|
| 1 | collection name `Stellar Observations` | `app/api/metadata/collection/route.ts:5` (and `scripts/setup-bubblegum.ts:68`) | `name: 'Stellar Observations',` |
| 2 | symbol `STLR` | `app/api/metadata/collection/route.ts:6`, `lib/mint-nft.ts:91` (and `scripts/setup-bubblegum.ts:69`) | `symbol: 'STLR',` |
| 3 | NFT name `Stellar: <target>` | `lib/mint-nft.ts:76`, `app/m/o/route.ts:19`, `app/api/metadata/observation/route.ts:81` | ``fullName = verified ? `Stellar: ${params.target}` : …`` |
| 4 | NFT name `Stellar Keepsake: <target>` | `lib/mint-nft.ts:76` | same line |
| 5 | passport NFT name | `lib/telescope-passport.ts:41` | `const PASSPORT_NAME = 'Stellar Telescope Passport';` |
| 6 | passport key-derivation seed `stellar-passport-v1:` | `lib/telescope-passport.ts:57` | ``Buffer.from('stellar-passport-v1:' + wallet)``. Changing it changes the derived addresses. |
| 7 | Anchor program `stellar_observations` and its IDL | `lib/idl/stellar_observations.json:4`; `lib/idl/stellar_observations.ts:7,10`; `lib/observation-program.ts:10,11,62,78`; `anchor/Anchor.toml:9,12`; `anchor/programs/stellar-observations/` | `"name": "stellar_observations"`, `type StellarObservations`, `Program<StellarObservations>` |

**Runtime identifiers**

| # | Identifier | Location | Context |
|---|---|---|---|
| 8 | env `STELLAR_PAUSED` | `lib/kill-switch.ts:4,7`; `.env.example:49,72` | `if (process.env.STELLAR_PAUSED === '1')` |
| 9 | cookie `stellar_locale` | `i18n/request.ts:5`; `app/profile/page.tsx:88,133`; `app/settings/page.tsx:50,128`; `components/shared/LanguageToggle.tsx:19`; `components/shared/LocaleToggle.tsx:19`; `app/cookie-policy/page.tsx:42,43` (copy) | ``cookies()).get('stellar_locale')`` |
| 10 | package name `stellar` | `package.json:2` | `"name": "stellar",` |
| 11 | i18n value `stellar_observations` | `messages/en.json:3582`, `messages/ka.json:3582` | `"step6Where": "stellar_observations"` (how-it-works; names the program) |
| 12 | rarity value `Stellar` | see §1(b). Must still be accepted by `api/nft-image/route.tsx:33` and echoed by `m/o/route.ts:12` | ``case 'Stellar':`` |

**Storage keys used by kept flows**

| # | Key | Location | Storage |
|---|---|---|---|
| 13 | `stellar_state` | `hooks/useAppState.ts:35` | localStorage (`AppState`) |
| 14 | `stellar_anon_id` | `lib/track.ts:28` | localStorage. Analytics continuity depends on it. |
| 15 | `stellar_attribution_v1` | `lib/attribution.ts:11` | localStorage |
| 16 | `stellar_theme` | `app/layout.tsx:124`; `providers/ThemeProvider.tsx:33,45,52` | localStorage |
| 17 | `stellar_field` | `providers/ThemeProvider.tsx:38,61` | localStorage |
| 18 | `stellar_location` | `lib/observer-location.ts:3` (`STELLAR_LOCATION_KEY`), l.65; `lib/location.tsx:186`; `hooks/useObserverLocation.ts:23,41` (dead) | localStorage |
| 19 | `stellar_notifications` | `app/settings/page.tsx:54,88` | localStorage |
| 20 | `stellar_open_tracked` | `providers/AnalyticsBoot.tsx:20,21` | sessionStorage |
| 21 | `stellar_dismissed_event_${date}` | `components/sky/EventBanner.tsx:18` | localStorage |
| 22 | `stellar.sky.tour.v1` | `app/sky/page.tsx:49` | localStorage |
| 23 | `stellar.sky.locprompt.v1` | `app/sky/page.tsx:50` | localStorage |
| 24 | `stellar.sky.ar.alignment.v1` | `components/sky/finder/ARFinder.tsx:105` | localStorage |
| 25 | `stellar.sky.compass.offset` (legacy) | `lib/sky/use-device-heading.ts:365` | localStorage |
| 26 | `stellar.sky.compass.offset.${bucket}` | `lib/observer-location.ts:82` | localStorage |
| 27 | `stellar.telescope.welcomed` | `components/telescope/TelescopeConsole.tsx:44` | localStorage |
| 28 | `stellar:funded:` + wallet | `providers/WalletSync.tsx:8` | localStorage |
| 29 | `stellar:synced:` + wallet | `providers/WalletSync.tsx:9` | localStorage |
| 30 | `stellar:upserted:` + id | `hooks/useUserSync.ts:8` | localStorage |
| 31 | `stellar:cohort:` + id | `hooks/useUserSync.ts:9` | localStorage |
| 32 | `stellar:session_open_at` | `hooks/useUserSync.ts:10` | sessionStorage |
| 33 | `stellar-checkout-shipping` | `app/marketplace/checkout/page.tsx:46` | localStorage (hyphenated) |

**Storage keys whose code is cut or dead** (the code goes, the key is still never reused)

| # | Key | Location |
|---|---|---|
| 34 | `stellar_onboarded` | `components/shared/OnboardingOverlay.tsx:9,24` (dead) |
| 35 | `stellar_kids_mode` | `app/learn/page.tsx:1218` (CUT) |
| 36 | `stellar_quiz_mute` | `components/sky/QuizActive.tsx:32` (CUT) |
| 37 | `stellar-quiz-plays` | `components/sky/QuizActive.tsx:37` (CUT) |
| 38 | `stellar-daily-checkins` | `lib/daily-checkin.ts:1` (second-order) |
| 39 | `stellar-challenge-progress-v1` | `lib/celestial-challenges.ts:1` (second-order) |
| 40 | `stellar-starlight-v1` | `lib/starlight.ts:3` (CUT) |
| 41 | `stellar-astronomer-profile` | `hooks/useAstronomerProfile.ts:6` (dead) |

**Storage keys in explore code** (moving to `tools/explore`)

| # | Key | Location |
|---|---|---|
| 42 | `stellar_expedition_log` | `lib/solar-system/flight-missions.ts:63`; `test/flight-missions.test.ts:41,43,47` |
| 43 | `stellar_explore_help` | `components/solar-system/PlayerShip.tsx:40` |
| 44 | `stellar_hud_layout_v2` | `components/solar-system/PlayerShip.tsx:73` |
| 45 | `stellar_moon_backrooms_v1` | `lib/solar-system/backrooms-save.ts:12`; `test/backrooms.test.ts:183` |
| 46 | `stellar_moon_expedition_v1` | `lib/solar-system/moon-mission.ts:114`; `test/moon-expedition.test.ts:195,198,207` |
| 47 | `stellar_moon_expedition_v2` | `lib/solar-system/moon-mission.ts:113` |
| 48 | `stellar_moon_jobs_v1` | `lib/solar-system/moon-jobs.ts:78` |
| 49 | `stellar_proxima_contact` | `lib/solar-system/world-surface.ts:143` |
| 50 | `stellar_sound` | `lib/solar-system/sound-prefs.ts:5`; `test/flight-audio.test.ts:74,76` |
| 51 | `stellar_tbilisi_expedition_v1` | `lib/solar-system/world-earth-expedition.ts:24` |

**Custom DOM events**

| # | Event | Location |
|---|---|---|
| 52 | `stellar:stars-synced` | kept: `app/sky/page.tsx:340`; `app/profile/page.tsx:105,121`; `providers/WalletSync.tsx:109`; `hooks/useStarsBalance.ts:56,90,96`. Cut: `observe/[missionId]/verify/page.tsx:398`, `QuizActive.tsx:210`, `DailyCheckInCard.tsx:132` |
| 53 | `stellar:location-updated` | `lib/observer-location.ts:4` (`LOCATION_UPDATED_EVENT`) |
| 54 | `stellar:astra-open` | `components/shared/AstraPopup.tsx:46,48,142` (dead) |

---

## 2. Routes

**Columns:**
- **obs / sky / econ** show whether the route imports from `src/lib/observatory`, `src/lib/sky` or `src/lib/stars-economy.ts`. "direct" means one of the route's own files imports it; "trans." means the import is transitive through the full graph.
- **LOC** counts the route directory's own `.ts`, `.tsx` and `.css` files, excluding nested route directories.

**Classes:**
- **CUT**: in the `EXECUTION.md` cut list.
- **KEEP-DESPITE-CUT-AREA**: the exceptions to the cut list.
- **KEEP**: live, meaning it has a caller in kept UI, a cron, or a known external contract.
- **UNLISTED (orphaned by cut)**: outside the cut list, but every in-repo caller is cut or already dead.
- **UNLISTED (no in-repo caller)**: nothing in the repo calls it (possibly external).

### 2.1 Pages

| Route | LOC | Class | obs | sky | econ |
|---|---|---|---|---|---|
| `/` (layout 160, page 1422, not-found, sitemap, opengraph-image, globals.css 1691) | 3415 | KEEP | — | — | — |
| `accessibility` | 76 | KEEP | — | — | — |
| `admin/retention` | 160 | CUT | — | — | — |
| `chat` | 500 | CUT | — | — | — |
| `club` | 314 | CUT | — | — | — |
| `contact` | 117 | KEEP | — | — | — |
| `cookie-policy` | 76 | KEEP | — | — | — |
| `darksky` | 5 | KEEP (seam: redirects to cut `/network`) | — | — | — |
| `earn` | 324 | CUT | — | — | — |
| `faq` | 187 | KEEP | — | — | — |
| `feed` | 2223 | CUT (includes `feed.css` 1646) | — | — | — |
| `field` | 276 | CUT | — | — | — |
| `first-light` | 400 | KEEP | direct | trans. | — |
| `games/shooting-stars` | 519 | CUT | — | — | — |
| `games/up-now` | 594 | CUT | — | trans. | — |
| `hub` | 171 | CUT | — | — | — |
| `leaderboard` | 488 | CUT | — | — | — |
| `learn` | 1338 | CUT | — | — | — |
| `m/o` | 39 | KEEP-DESPITE-CUT-AREA | — | — | — |
| `marketplace` | 418 | KEEP | — | — | trans. |
| `marketplace/[id]` | 194 | KEEP | — | — | trans. |
| `marketplace/checkout` | 823 | KEEP | — | — | direct |
| `missions` | 1602 | CUT | — | trans. | — |
| `moon` | 324 | KEEP | — | — | — |
| `network` | 366 | CUT | — | — | — |
| `nfts` | 944 | KEEP | — | — | — |
| `observations` | 5 | CUT | — | — | — |
| `observatory` | 2188 | KEEP | direct | trans. | — |
| `observatory/[nodeId]` | 170 | KEEP | direct | trans. | — |
| `observatory/captures` | 82 | KEEP | direct | trans. | — |
| `observatory/how-it-works` | 123 | KEEP | direct | trans. | — |
| `observatory/operator` | 211 | KEEP | direct | — | — |
| `observatory/requests` | 282 | KEEP | direct | trans. | — |
| `observatory/session/[id]` | 287 | KEEP | direct | trans. | — |
| `observatory/simulator` | 43 | KEEP | direct | trans. | — |
| `observatory/telescope` | 496 | KEEP | trans. | trans. | — |
| `observe` | 5 | CUT | — | — | — |
| `observe/[missionId]` | 311 | CUT | — | — | — |
| `observe/[missionId]/capture` | 89 | CUT | — | — | — |
| `observe/[missionId]/result` | 400 | CUT | — | — | — |
| `observe/[missionId]/verify` | 577 | CUT | — | — | — |
| `privacy` | 98 | KEEP | — | — | — |
| `profile` | 706 | KEEP | — | — | direct |
| `proof` | 208 | CUT | — | — | — |
| `returns` | 69 | KEEP | — | — | — |
| `security-policy` | 88 | KEEP | — | — | — |
| `settings` | 410 | KEEP | — | — | — |
| `shop` | 10 | KEEP | — | — | — |
| `sky` | 6185 | KEEP | trans. | direct | — |
| `solar-system` | 3063 | CUT (`solar-system.css` 3035, see §5.4) | — | trans. | — |
| `star` | 188 | KEEP | — | — | — |
| `star/[catalogId]` | 328 | KEEP | — | — | — |
| `terms` | 103 | KEEP | — | — | — |
| `u/[wallet]` | 310 | KEEP | — | — | — |

**Page totals:**

| Class | Directories | LOC |
|---|---|---|
| KEEP | 32 | 19,356 |
| CUT | 21 | 13,533 |
| KEEP-DESPITE-CUT-AREA | 1 | 39 |

### 2.2 API routes

| Route | LOC | Class | obs | sky | econ | In-repo callers (tests excluded) |
|---|---|---|---|---|---|---|
| `api/admin/retention` | 120 | CUT | — | — | — | app/admin/retention |
| `api/agent/approve-tweet` | 112 | KEEP | — | — | — | api/agent/draft-tweet, lib/x-compose-page |
| `api/agent/draft-image` | 31 | KEEP | — | — | — | lib/x-compose-page |
| `api/agent/draft-tweet` | 122 | KEEP (cron) | — | — | — | vercel.json |
| `api/agent/preview/[id]` | 31 | KEEP | — | — | — | lib/x-compose-page |
| `api/agent/reject-tweet` | 35 | KEEP | — | — | — | api/agent/draft-tweet |
| `api/award-stars` | 373 | KEEP (seam: trim to `find:`) | — | direct | — | **app/sky** (kept, `find:`); api/telescopes, observe/verify, DailyCheckInCard, QuizActive (cut); MissionActive (dead) |
| `api/chat` | 313 | CUT | — | — | — | app/chat, AstraPopup (dead) |
| `api/club/activate` | 93 | CUT | — | — | — | club/MembershipStep (dead) |
| `api/cohort/upsert` | 89 | KEEP | — | — | — | hooks/useUserSync |
| `api/cron/capture-requests` | 106 | KEEP (cron) | direct | trans. | — | vercel.json |
| `api/cron/push` | 104 | KEEP (cron) | — | — | — | vercel.json |
| `api/cron/settle` | 35 | KEEP (cron) | direct | trans. | — | vercel.json |
| `api/darksky` | 9 | UNLISTED (no caller) | — | — | — | none |
| `api/darksky/data` | 25 | UNLISTED (no caller) | — | — | — | none (only `stellar-toolkit/` Python tests) |
| `api/darksky/geojson` | 9 | UNLISTED (no caller) | — | — | — | none |
| `api/feed` | 9 | CUT | — | — | — | none (404 stub) |
| `api/feed/comments` | 82 | CUT | — | — | — | FeedPostCard |
| `api/feed/follow` | 137 | KEEP-DESPITE-CUT-AREA | — | — | — | hooks/useFollow (via FollowButton on u/[wallet]) |
| `api/feed/posts` | 243 | CUT | — | — | — | app/feed, observe/result, SidebarWidgets |
| `api/feed/posts/[id]` | 109 | CUT | — | — | — | FeedPostCard |
| `api/feed/reactions` | 89 | CUT | — | — | — | FeedPostCard |
| `api/feed/shares` | 52 | CUT | — | — | — | FeedPostCard |
| `api/feed/shop-preview` | 48 | CUT | — | — | trans. | SidebarWidgets |
| `api/first-light` | 150 | KEEP | direct | trans. | — | app/first-light |
| `api/first-light/poster` | 198 | KEEP | direct | trans. | — | app/first-light |
| `api/games/shooting-stars/complete` | 110 | CUT | — | — | — | games/shooting-stars |
| `api/games/up-now` | 81 | CUT | — | trans. | — | games/up-now, missions |
| `api/games/up-now/complete` | 132 | CUT | — | trans. | — | games/up-now |
| `api/health` | 10 | KEEP (external) | — | — | — | none (uptime probe) |
| `api/leaderboard` | 50 | CUT | — | — | — | app/leaderboard, LiveStatsBar (dead) |
| `api/metadata/collection` | 17 | KEEP (external, on-chain URI) | — | — | — | `scripts/setup-bubblegum.ts:70` |
| `api/metadata/observation` | 96 | KEEP (external, legacy on-chain URI) | — | — | — | none |
| `api/mint` | 412 | KEEP (seam) | — | — | — | **app/nfts** (kept); observe/verify (cut); MissionActive (dead) |
| `api/missions/global` | 37 | CUT | — | — | — | app/missions |
| `api/network` | 9 | CUT | — | — | — | none (404 stub) |
| `api/network/observations` | 95 | CUT | — | — | — | app/network |
| `api/network/stats` | 69 | CUT | — | — | — | app/network |
| `api/nft-image` | 249 | KEEP (external, on-chain image) | — | — | — | m/o, metadata/observation, lib/mint-nft, nfts, profile; observe/verify (cut) |
| `api/nfts` | 45 | KEEP | — | — | — | app/nfts |
| `api/observatory/book` | 94 | KEEP | direct | trans. | — | SlotPicker |
| `api/observatory/capture` | 133 | KEEP | direct | trans. | — | observatory/session/[id], SessionConsole |
| `api/observatory/nodes` | 16 | UNLISTED (no caller) | direct | trans. | — | none (pages import `lib/observatory/nodes` directly) |
| `api/observatory/operator` | 32 | KEEP | direct | trans. | — | observatory/operator |
| `api/observatory/operator/interest` | 84 | KEEP | — | — | — | OperatorInterestForm |
| `api/observatory/requests` | 93 | KEEP | direct | trans. | — | observatory/requests |
| `api/observatory/requests/[id]` | 31 | KEEP | direct | trans. | — | observatory/requests |
| `api/observatory/routing` | 19 | KEEP | direct | trans. | — | SkyRoutingBand |
| `api/observatory/session/[id]` | 42 | KEEP | direct | trans. | — | observatory/session/[id] |
| `api/observatory/slots` | 66 | KEEP | direct | trans. | — | SlotPicker |
| `api/observe/history` | 60 | CUT | — | — | — | app/feed |
| `api/observe/log` | 407 | CUT | — | — | — | observe/verify, MissionActive (dead) |
| `api/observe/onchain/[wallet]` | 56 | KEEP-DESPITE-CUT-AREA | — | — | — | profile/OnChainRecord |
| `api/observe/photo/[hash]` | 46 | KEEP-DESPITE-CUT-AREA | — | — | — | `api/mint/route.ts:323` (NFT photo URL) |
| `api/observe/verify` | 782 | CUT | — | — | — | observe/verify, MissionActive (dead) |
| `api/og/observation` | 162 | UNLISTED (no caller) | — | — | — | none |
| `api/og/sky` | 87 | UNLISTED (no caller) | — | — | — | none |
| `api/og/tonight` | 112 | UNLISTED (no caller) | — | — | — | none |
| `api/orders` | 274 | KEEP | — | — | trans. | marketplace/checkout, profile |
| `api/orders/confirm` | 124 | KEEP | — | — | — | marketplace/checkout |
| `api/passport/[wallet]` | 43 | KEEP (external, passport URI) | — | — | — | lib/telescope-passport |
| `api/price/sol` | 9 | KEEP | — | — | — | marketplace, marketplace/[id], checkout |
| `api/products` | 7 | UNLISTED (no caller) | — | — | trans. | none |
| `api/push/subscribe` | 119 | KEEP | — | — | — | lib/push/client |
| `api/redeem-code` | 187 | KEEP (external, Astroman till) | — | — | direct | none |
| `api/redeem-code/validate` | 90 | KEEP (external, Astroman till) | — | — | — | none |
| `api/share/og` | 126 | UNLISTED (orphaned) | — | — | — | lib/share.ts (dead) |
| `api/sky/finder` | 275 | KEEP | — | direct | — | app/sky |
| `api/sky/forecast` | 39 | KEEP | — | — | — | lib/sky/use-forecast, lib/use-sky-data (+ cut/dead) |
| `api/sky/iss` | 115 | KEEP | — | — | — | observatory/EventsPanel; missions (cut) |
| `api/sky/overview` | 33 | UNLISTED (orphaned) | — | — | — | hub/HubTonightBand (cut) |
| `api/sky/planets` | 36 | KEEP | — | — | — | lib/use-sky-data (+ cut/dead) |
| `api/sky/score` | 59 | UNLISTED (orphaned) | — | — | — | DailyCheckInCard (cut); Dashboard, DailyCheckIn, HomeSkyPreview (dead) |
| `api/sky/sun-moon` | 78 | KEEP | — | — | — | lib/use-sky-data |
| `api/sky/targets` | 201 | UNLISTED (no caller) | — | — | — | none |
| `api/sky/timeline` | 161 | KEEP | — | — | — | lib/use-sky-data |
| `api/sky/tonight` | 170 | UNLISTED (no caller) | — | — | — | none |
| `api/sky/verify` | 84 | KEEP | — | — | — | lib/use-sky-data; observe/verify (cut) |
| `api/space-images` | 139 | KEEP | — | — | — | sky/SpaceGallery |
| `api/star/claim` | 205 | UNLISTED (orphaned) | — | — | — | observe/result (cut), MissionActive (dead) |
| `api/star/nearest-unclaimed` | 87 | UNLISTED (orphaned) | — | — | — | observe/result (cut), MissionActive (dead) |
| `api/stars-balance` | 37 | KEEP | — | — | — | checkout, nfts, profile, useStarsBalance |
| `api/stars/burn` | 436 | KEEP | — | — | direct | lib/stars-burn-client |
| `api/stars/sync` | 194 | KEEP | — | — | — | providers/WalletSync |
| `api/streak` | 69 | UNLISTED (orphaned) | — | — | — | observe/verify (cut); TonightTargets, MissionActive (dead) |
| `api/subscribe` | 43 | UNLISTED (no caller) | — | — | — | none |
| `api/telescopes` | 123 | UNLISTED (orphaned) | — | — | — | app/club (cut) |
| `api/track` | 78 | KEEP | — | — | — | lib/track |
| `api/users` | 9 | UNLISTED (no caller) | — | — | — | none (404 stub) |
| `api/users/[wallet]` | 76 | KEEP | — | — | — | u/[wallet] |
| `api/users/profile` | 127 | KEEP | — | — | — | hooks/useProfile |
| `api/users/upsert` | 117 | KEEP | — | — | — | hooks/useUserSync |
| `api/wallet` | 9 | UNLISTED (no caller) | — | — | — | none (404 stub) |
| `api/wallet/fund` | 125 | KEEP | — | — | — | providers/WalletSync |

**API totals:**

| Class | Routes | LOC |
|---|---|---|
| KEEP (live) | 39 | 4,713 |
| KEEP (cron) | 4 | 367 |
| KEEP (external) | 7 | 692 |
| KEEP-DESPITE-CUT-AREA | 3 | 239 |
| CUT | 21 | 2,990 |
| UNLISTED (orphaned) | 7 | 702 |
| UNLISTED (no caller) | 13 | 859 |

UNLISTED-no-caller routes are **not** in the Phase 2 manifest. They stay until someone decides, and the question belongs in `docs/stellar-open-questions.md`.

---

## 3. Tables

Tables come from `src/lib/schema.ts` (24 `pgTable`s) plus raw SQL. `users` is created by hand-written SQL (comment at `api/users/upsert/route.ts:2`) and is also a `pgTable`. `star_catalog` is raw only (`scripts/import-star-catalog.ts:52`).

| Table | Kept readers/writers | Cut-only readers/writers | Cut-only? |
|---|---|---|---|
| `users` | users/[wallet] r, users/profile w, users/upsert w, feed/follow r | admin/retention r, feed/posts r, feed/posts/[id] r; scripts seed-feed-demo w, mint-report r | no |
| `telescopes` | award-stars w (`telescope:first-registration` branch only) | api/telescopes w | **yes, after the award-stars trim** |
| `observation_log` | award-stars w, mint w, metadata/observation r, observe/photo r, stars/sync r, stars-balance r, lib/stars-cap r | observe/log w, observe/verify w, games/* w, leaderboard r, missions/global r, network/* r, observe/history r, streak r, lib/observations-dedup r | no (keep, correction 4) |
| `observation_photo` | mint r, observe/photo r | observe/verify w (only writer) | no, but becomes read-only |
| `email_subscribers` | api/subscribe w (UNLISTED, no caller) | — | orphaned route |
| `orders` | orders w, orders/confirm w, stars/burn w, lib/db r | — | no |
| `stars_burns` | stars/burn w, stars/sync r, redeem-code r | — | no |
| `redeem_codes` | redeem-code w, redeem-code/validate w | — | no |
| `feed_posts` | users/[wallet] r (post count) | feed/comments, posts, posts/[id], reactions, shares w; seed-feed-demo w | no (read by kept code) |
| `feed_reactions` | — | feed/posts r, posts/[id] w, reactions w | **yes** |
| `feed_comments` | — | feed/comments w, posts r, posts/[id] w | **yes** |
| `feed_shares` | — | feed/posts/[id] w, shares w | **yes** |
| `feed_follows` | feed/follow w, users/[wallet] r | feed/posts r | no |
| `tweet_drafts` | agent/* (cron) | — | no |
| `analytics_event` | api/track w, lib/track-server w | admin/retention r | no |
| `user_cohorts` | cohort/upsert w | admin/retention r | no (write-only once retention is cut) |
| `game_daily_plays` | — | games/* | **yes** |
| `push_subscription` | cron/push, push/subscribe | — | no |
| `observatory_reservation` | lib/observatory/reservations w, settlements r | — | no |
| `observatory_capture` | lib/observatory/captures w, gallery r | — | no |
| `observatory_settlement` | lib/observatory/settlements w, earnings r | — | no |
| `observatory_operator_interest` | observatory/operator/interest w, lib/observatory/routing r | — | no |
| `observatory_capture_request` | lib/observatory/requests w | — | no |
| `first_light_order` | api/first-light w, lib/observatory/deliver w | — | no |
| `star_catalog` (raw) | star r, star/[catalogId] r | star/claim w, star/nearest-unclaimed r (both orphaned); import script w | no, but becomes read-only |

Drop no tables in Phase 2. Only the code goes.

---

## 4. Seams

A seam is a kept file that imports from, or links into, the observe/mission/quiz/learn/feed/games flow.

| File | From the kept side | From the cut side | Phase 2 fix |
|---|---|---|---|
| `app/api/award-stars/route.ts` | `sky/target-visibility`, `stars`, `stars-cap`, `award-stars-policy`, rate-limit, kill-switch; caller `app/sky/page.tsx:321-331` (`find:`) | l.17 `quizzes`, l.18 `daily-checkin`, l.19 `constellation-streak`, l.20 `observation-token`, l.21 `cosmic-bonus`, l.22 `celestial-challenges`, l.24/30 `nft-rarity`; branches `quiz:` l.117, `daily_checkin` l.148, `cosmic_bonus:`/`weekly_challenge` l.160, `telescope:first-registration` l.189/357; weekly quiz cap l.222-237; idempotency l.275-276 | **Trim branch**: keep only `find:` and drop those 7 imports. Consequence: `celestial-challenges`, `constellation-streak`, `cosmic-bonus` and `daily-checkin` become unreachable (§5.2), and `quizzes` can be archived. Also shrink `award-stars-policy` to `find:`, and rewrite `test/award-stars-policy.test.ts`, `award-stars-security.test.ts` and `award-stars-telescope.test.ts` (the last two exercise `telescope:first-registration`). |
| `app/api/mint/route.ts` | mint-nft, stars, stars-cap, oracle-hash; caller `app/nfts/page.tsx` (pending-mint retry) | l.13 `verifyObservationToken` (l.118), l.18 `constants.CLOUD_COVER_CERTIFY_MAX` (l.160), l.19 `observation-kind` | **Keep file.** It does not import `MISSIONS`. Keep `observation-token.ts` (verify side) and `constants.ts`. Without `/api/observe/verify` no new tokens get issued, so the route only serves retries. Decide in Phase 3/5 whether card editions replace it. |
| `hooks/useAppState.ts` | provider in `app/layout.tsx:51`; `walletAddress`, `favorites`, `hiddenObservationIds`, `completedMissions` read by nfts, profile, WalletSync, marketplace/*, settings | `addQuizResult`, `setMembership`, `setTelescope` and `addMission` have only cut or dead callers (QuizActive, club/*, observe/verify, MissionActive); `AppState.completedQuizzes`, `membership*` and `telescope*` in `lib/types.ts:76-87` | **Trim**: drop those 4 setters and their state fields. Keep `completedMissions`, because `/nfts` and `/profile` render legacy mints from it. Keep the `stellar_state` key. |
| `app/nfts/page.tsx` | `getRarityInfo`, api/nfts, api/mint, api/nft-image, stars-balance | l.15 `MISSIONS` (l.661, 663, 707 map legacy mission ids to names); link `/missions` l.764 | **Repoint link** l.764 to `/sky` (later `/collection`). Keep the `MISSIONS` import for the legacy display. |
| `app/profile/page.tsx` | stars-economy, orders, OnChainRecord → `api/observe/onchain` | l.17 `rewards.getRank/RANK_THRESHOLDS` over `completedMissions` (l.202-245); links `/missions` l.255, `/observations` l.258, `/observe` l.410 | **Repoint links** l.255, 258 and 410. Keep `rewards.ts`, which after the cut is imported only here. |
| `app/u/[wallet]/page.tsx` | api/users/[wallet] | `components/feed/FollowButton` l.10 → `hooks/useFollow` → `api/feed/follow`; link `/feed` l.79 | **Keep** FollowButton, useFollow and feed/follow. **Repoint** l.79 (back link) to `/`. |
| `app/star/page.tsx` | `star_catalog` via neon | link `/missions` l.107 | **Repoint link** to `/sky`. |
| `app/star/[catalogId]/page.tsx` | `star_catalog` | none (no cut link; claims now come from the orphaned `star/claim`) | Keep. Claim UI becomes read-only. |
| `app/sky/page.tsx` | observatory (SkyRoutingBand), `lib/sky/*`, award-stars `find:` | links `/solar-system` l.626, `/missions` l.674, l.711 (quiz CTAs) | **Repoint or remove** the 3 links. The `find:` award stays (see award-stars). |
| `app/marketplace/checkout/page.tsx` | stars-economy, stars-burn-client, orders | link `/earn` l.393 | **Repoint** to `/profile`, or drop it. |
| `components/marketplace/HelpBanner.tsx` | marketplace pages | link `/chat?q=` l.33 (ASTRA) | **Remove the CTA** or the component. The chat route is cut. |
| `app/page.tsx` (home) | HomeHeroSaturn, HomeExplore, ComparisonTable | `SectionLink` `/missions` l.1177, l.1215; `/learn` l.1248; `/feed` l.1397 | **Repoint links** (Phase 6 replaces the landing page anyway). |
| `components/home/HeroSaturn.tsx` / `HomeExplore.tsx` | home | `/missions` l.166, l.319; `/solar-system` l.183; `HomeExplore.tsx:127` `/solar-system` | Repoint links. |
| `components/shared/Nav.tsx` | layout | nav items `/missions` l.21, `/feed` l.22, `/learn` l.23; `/hub` l.196, l.198; imports SearchModal | **Repoint** to `/sky`, `/observatory`, `/marketplace` and `/nfts`. |
| `components/shared/BottomNav.tsx` | layout | `/missions` l.15, `/hub` l.18 | Repoint. |
| `components/shared/Footer.tsx` | layout | `/missions` l.29, `/learn` l.30 | Repoint. |
| `components/shared/SearchModal.tsx` | Nav | l.7 `MISSIONS` → `MISSION_ITEMS` l.52-56 (`/observe/${id}`); pages `/solar-system` l.28, `/chat` l.29, `/learn` l.30; objects `/observe/orion` etc. l.36-38; quick `/missions` l.43, `/chat` l.44 | **Trim**: drop the `MISSIONS` import and those entries. Also delete the e2e "search modal … deep-link to observe flow" (`e2e/routes.spec.ts:55`). |
| `app/sitemap.ts` | — | `/missions` l.14, `/learn` l.15, `/feed` l.16, `/hub` l.17, `/solar-system` l.20, `/network` l.21, `/leaderboard` l.22 | **Remove those 7. Add** `/observatory`, `/first-light` and `/star` (confirmed missing). |
| `public/robots.txt` | — | `Disallow: /observe` l.7, `/proof` l.8 | Drop both lines once the routes 404. The file is static and there is no `app/robots.ts`. |
| `app/darksky/page.tsx` | — | `redirect('/network')` l.4 | **Repoint** to `/sky` (or `/observatory`). `components/darksky/DarkSkyMap` and `api/darksky/*` are already uncalled. |
| `lib/tweet-agent.ts` (cron `agent/draft-tweet`) | sky-data, sky-score, planets | URLs `${SITE}/chat` l.128, l.185; `/observe` l.138, l.190; `/field` l.148, l.195; `/missions` l.153; `/learn` l.158, l.285; prompts l.296 (`/field`), l.297 (`/observe`) | **Rewrite** these link targets and angles (to `/sky`, `/observatory` and `/marketplace`). |
| `app/api/cron/push/route.ts` | tonight-sky, astro-events, push | `url: '/missions'` l.69 | **Repoint** to `/sky`. |
| `components/shared/PullToRefresh.tsx:16`, `providers/SwipeBack.tsx:23` | layout | `pathname.startsWith('/solar-system')` | Harmless dead branch. Delete it in the same commit. |
| `components/sky/finder/ARPlanet3DLayer.tsx:30-42` | AR finder | `/solar-system/planets/*.jpg` textures | **Keep** `public/solar-system/*` (correction 4). Not a route link. |
| `components/sky/finder/PlanetIcon.tsx` | sky page | `@/lib/solar-system/planet-palettes` → `ephemeris` | **Keep** these 2 files in `src` (verified: they are the only solar-system files kept code reaches). |
| `components/sky/finder/ARFinder.tsx` | sky | `hooks/useCamera` (shared with the cut `CameraCapture`) | Keep the file. |
| `app/api/sky/verify/route.ts`, `app/api/sky/targets/route.ts` | `lib/use-sky-data` | `constants` (MISSIONS-era targets), `observation-kind` | Keep for now. `sky/targets` has no caller (UNLISTED). |
| `app/layout.tsx` | everything | `AppStateProvider` l.51 | Nothing beyond the useAppState trim. |
| `e2e/routes.spec.ts`, `e2e/smoke.spec.ts` | — | routes.spec l.12-14, 16, 19-22, 24, 29-30 (`/missions`, `/feed`, `/learn`, `/hub`, `/chat`, `/field`, `/solar-system`, `/network`, `/leaderboard`, `/observe/demo`, `/observe/not-a-mission`) and the test at l.55; smoke.spec l.42-51 (`missions page mounts`) | Remove those entries and add `/observatory`, `/first-light`, `/star` and `/nfts`. Keep `/darksky`, which should now be a redirect to a kept page. |

---

## 5. Phase 2 manifest

### 5.1 Delete: CUT routes

**Pages** (30 files, **13,533 LOC**): delete these whole directories under `src/app/`:

| Directory | LOC |
|---|---|
| `admin/` (only `retention`) | 160 |
| `chat/` | 500 |
| `club/` | 314 |
| `earn/` | 324 |
| `feed/` | 2,223 |
| `field/` | 276 |
| `games/` | 1,113 |
| `hub/` | 171 |
| `leaderboard/` | 488 |
| `learn/` | 1,338 |
| `missions/` | 1,602 |
| `network/` | 366 |
| `observations/` | 5 |
| `observe/` | 1,382 |
| `proof/` | 208 |
| `solar-system/` | 3,063 |

Do **not** touch `src/app/m/`: its only content is `m/o`, which is kept.

**APIs** (21 files, **2,990 LOC**), under `src/app/api/`:

| Path | LOC |
|---|---|
| `admin/` | 120 |
| `chat/` | 313 |
| `club/` | 93 |
| `feed/route.ts` | 9 |
| `feed/comments/` | 82 |
| `feed/posts/` (with `[id]`) | 352 |
| `feed/reactions/` | 89 |
| `feed/shares/` | 52 |
| `feed/shop-preview/` | 48 |
| `games/` | 323 |
| `leaderboard/` | 50 |
| `missions/` | 37 |
| `network/` | 173 |
| `observe/history/` | 60 |
| `observe/log/` | 407 |
| `observe/verify/` | 782 |

Keep `feed/follow/`, `observe/onchain/` and `observe/photo/`.

**UNLISTED APIs orphaned by the cut** (7 files, **702 LOC**). Every remaining caller is cut or already dead, so these go in the same commit:

| Path | LOC |
|---|---|
| `api/share/og/` | 126 |
| `api/sky/overview/` | 33 |
| `api/sky/score/` | 59 |
| `api/star/claim/` | 205 |
| `api/star/nearest-unclaimed/` | 87 |
| `api/streak/` | 69 |
| `api/telescopes/` | 123 |

### 5.2 Delete: components, libs and hooks reachable only from cut code

**Components** (23 files, **6,393 LOC**):

| Folder | Files |
|---|---|
| `components/feed/` | `FeedPostCard` 655, `SidebarWidgets` 123, `SkyWidget` 224. Keep `FollowButton`. |
| `components/hub/` | `HubTonightBand` 300 |
| `components/icons/` | `CelestialIcons` 474 |
| `components/learn/` | `TonightsBanner` 208 |
| `components/missions/` | `DailyCheckInCard` 195 |
| `components/network/` | `NetworkMap` 139 |
| `components/shared/` | `Card` 26, `MintAnimation` 166, `MoonPhase` 53 |
| `components/sky/` | `AnchoredPanel` 214, `CameraCapture` 377, `DifficultyExplainer` 333, `DiscoverySealed` 537, `MissionRotateArt` 232, `QuizActive` 676, `SkyOrb` 37, `TelescopesTab` 745, `Verification` 156 |
| `components/ui/` | `Badge` 108, `Card` 247, `ScoreRing` 168 |

**Libs and hooks** (18 files, **1,351 LOC**):

| Folder | Files |
|---|---|
| `hooks/` | `useVisibleInterval` 44 |
| `lib/` | `astronomy-check` 124, `capture-time` 32, `data-url` 74, `device-tier` 29, `exif` 39, `gemini-vision` 70, `mission-icons` 93, `missions-tonight` 41, `observations-dedup` 38, `rejection-reason` 18, `reverse-image` 103, `sky-chart` 169, `star-catalog` 116, `starlight` 45 |
| `lib/feed/` | `types` 88 |
| `lib/games/` | `shooting-stars` 12, `up-now` 216 |

**Second-order**, orphaned only by the award-stars trim (4 files, **223 LOC**):

| File | LOC |
|---|---|
| `lib/celestial-challenges.ts` | 90 |
| `lib/constellation-streak.ts` | 35 |
| `lib/cosmic-bonus.ts` | 38 |
| `lib/daily-checkin.ts` | 60 |

**Tests** (2 files, **144 LOC**):

| File | LOC |
|---|---|
| `test/capture-time.test.ts` | 52 |
| `test/observe-verify-security.test.ts` | 92 |

**Tests to edit rather than delete:**
- `award-stars-policy.test.ts` (69): cut the quiz, checkin, challenge and cosmic cases.
- `award-stars-security.test.ts` and `award-stars-telescope.test.ts`: both exercise `telescope:first-registration`.
- `flight-missions.test.ts`: it moves, and it imports `en.json` and `ka.json`.

**e2e:** the entries listed in §4.

**Delete total: 105 files, 25,336 LOC.**

### 5.3 Archive to `docs/archive/` (3 files, 5,147 LOC)

| File | LOC | Note |
|---|---|---|
| `src/lib/learn-data.ts` | 476 | cut-only |
| `src/lib/quizzes.ts` | 665 | unreachable after the award-stars trim; rewrite the test that imports it |
| `src/messages/ka.json` | 4,006 | `i18n/request.ts:10` imports `../messages/${locale}.json`, so set locales to `['en']` in the same commit |

### 5.4 Move to `tools/explore/` (129 files, 39,524 LOC)

| Source | Files | LOC |
|---|---|---|
| `src/lib/solar-system/**`, except `ephemeris.ts` (175) and `planet-palettes.ts` (45) | 94 | 30,671 |
| `src/components/solar-system/**` | 16 | 5,055 |
| `src/lib/multiplayer/**` (explore rooms; imported only by solar-system) | 6 | 893 |
| **source subtotal** | **116** | **36,619** |
| Tests (listed below) | 13 | 2,905 |

The 13 tests: `backrooms`, `flight-audio`, `game-stick`, `moon-airlock`, `moon-camera-walls`, `moon-expedition`, `multiplayer`, `player-ship-flight`, `star-routes`, `suit-locomotion`, `world-earth-life`, `world-earth`, `world-surface`. `flight-missions` needs the edit noted in §5.2.

**Verified:** kept code reaches only 2 files in `lib/solar-system`. `components/sky/finder/PlanetIcon.tsx` imports `planet-palettes.ts`, and `planet-palettes.ts` imports `ephemeris.ts`.

**What the moved code still imports from `src`:**
- `lib/solar-system/ephemeris` (12 imports)
- `lib/sky/stars` (3) and `lib/sky/catalog` (2)
- `lib/observer-location` (3)
- `hooks/useProfile` (1)
- `hooks/useObserverLocation` (1, from the dead `PlanetDetailPanel`)

So `tools/explore` needs an `@/` alias into `src`, or copies of those files. Vitest's `include: ['src/**/*.test.ts']` will stop running the moved tests.

**Recommended addition:** `src/app/solar-system/solar-system.css` (3,035 LOC) is the explorer's stylesheet. It is counted under the deletes in §5.1, but it should move with the explorer. If it moves, the delete total becomes 22,301 and the move total becomes 42,559. `public/explore/tbilisi/*` is used only by the moved `world-earth-data.ts`.

5 of the moved files are already dead: `PlanetDetailPanel` 201, `planet-data` 179, `planet-visibility` 157, `radio` 150 and `saturn-rings` 88, for 775 LOC. They are counted here, not in §5.6.

### 5.5 Totals

| Bucket | Files | LOC |
|---|---|---|
| Delete: pages | 30 | 13,533 |
| Delete: CUT APIs | 21 | 2,990 |
| Delete: orphaned UNLISTED APIs | 7 | 702 |
| Delete: components | 23 | 6,393 |
| Delete: libs and hooks | 18 | 1,351 |
| Delete: second-order (after trim) | 4 | 223 |
| Delete: tests | 2 | 144 |
| **Delete subtotal** | **105** | **25,336** |
| Archive | 3 | 5,147 |
| Move (source and tests) | 129 | 39,524 |
| **Grand total, Phase 2** | **237** | **70,007** |

### 5.6 Already unreachable before the cut (82 files, 11,814 LOC)

Nothing reaches these from any route, cron, `layout` or `next.config` root, in either KEEP or CUT. Phase 2 may delete them, but in a separate commit.

**Components** (73 files, 11,352 LOC):

| Folder | Files | LOC |
|---|---|---|
| `components/club/` | `MembershipStep`, `TelescopeStep`, `WalletStep` | 239 |
| `components/darksky/` | `DarkSkyMap` | 80 |
| `components/dashboard/` | `DailyCheckIn`, `Dashboard` | 644 |
| `components/home/` | `AstraSection`, `HeroSection`, `HeroSkyPanel`, `HeroSkyPanelLazy`, `HomeMissions`, `HomeShop`, `HomeSkyPreview`, `LiveStatsBar`, `SkyOutlook`, `TonightAtAGlance`, `TonightAtAGlanceLazy` | 2,358 |
| `components/landing/` | all 7 files | 573 |
| `components/missions/` | `EarningLadder` | 55 |
| `components/observatory/` | `SessionClock`, `TargetStrip` | 123 |
| `components/observe/` | `TonightTargets` | 111 |
| `components/shared/` | `AstraPopup`, `Badge`, `LocaleToggle`, `OnboardingOverlay`, `RewardIcon` | 645 |
| `components/sky/` | 34 files: `MissionActive` 1,207, `MissionsWebDesktop` 1,376, `MissionListRow`, `MissionsHero`, `ObservationLog`, `ObservationTimeline`, `PrimeHeroCard`, `QuizCard`, `SecondaryMissionsRail`, `SkyAstraCta`, `SkyChart`, `SkyCompass`, `SkyHero`, `art/*` (6), `chart-nodes/*` (10), `finder/DirectionHero`, `HorizonStrip`, `ObjectTabs`, `SkyHeaderStrip`, `TargetPicker` | 5,831 |
| `components/ui/` | `ForecastStrip`, `LoadingRing`, `PageHeader`, `PageLoader`, `StatCard`, `StreakBadge` | 693 |

**Hooks** (4 files, 154 LOC): `useAstronomerProfile`, `useHaptic`, `useInView`, `useObserverLocation`. `useObserverLocation` is imported only by the dead `PlanetDetailPanel`.

**Libs** (5 files, 308 LOC): `api-error`, `daily-targets`, `planet-styles`, `share`, `sky-utils`.

`LocaleToggle` is also scheduled for Phase 6. `share.ts` is the only caller of `api/share/og`.
