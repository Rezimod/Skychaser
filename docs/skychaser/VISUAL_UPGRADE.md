# Stellar — visual upgrade, hybrid series

Supersedes `~/Desktop/STELLAR_VISUAL_UPGRADE_PROMPTS.md`, which was written against the
serif-and-brass system retired on 2026-09-21. The Stellar design language stays. What is
kept from that document is its *structure*: card geometry, a three-beat reveal, the card
page as a logbook entry, a motion layer, a QA pass — all restated in `--sd-*`.

Dropped from the original: its Prompt 1 (tokens already exist in
`src/styles/skychaser-theme.css`), Prompt 2 (`CardPlate` + `CardArt` already are the single
card component), Prompt 5 (the home hero already ships in the Stellar language — only its
stat count-up survives, folded into P4).

Run order: P1 → P2 and P3 in parallel → P4 → P5. One session each, `/clear` between.
Opus for P1–P3, Sonnet for P4–P5.

---

## CONTEXT — paste at the top of every prompt

```
CONTEXT — STELLAR (do not deviate)

Read first: docs/skychaser/RULES.md (tone, vocabulary, the Never list) and
docs/skychaser/design-system.md (note its 2026-09-21 supersession header).

DESIGN LANGUAGE — the Stellar one. Do NOT reintroduce the serif-and-brass system:
no Cormorant Garamond, no Manrope, no IBM Plex Mono, no #C9A84C brass, no #070A12 ink.
The owner retired it on 2026-09-21 and design-system.md says not to restore it.

TOKENS — src/styles/skychaser-theme.css, scoped to `.stellar` (the class StellarShell puts on
its root). Never add Stellar tokens to the global @theme in globals.css: that leaks into the
legacy Stellar routes (/sky, /moon, /observatory), which must not change.
  Ground   --sd-canvas #0a1735 · --sd-deep #070f24 · --sd-plate / --sd-plate-hover
  Ink      --sd-ink / --sd-ink-2 / --sd-ink-3 / --sd-ink-4   (ink-3 is the text floor)
  Rules    --sd-rule · --sd-rule-strong · --sd-hairline
  Accent   --sd-accent #ffb347 terracotta, ONE hot thing per screen · --sd-accent-hi
           · --sd-accent-dim · --sd-teal
  Rarity   --sd-rarity-common/-rare/-epic/-legendary
  Status   --sd-status-dedicated/-eligible/-not-available
  Shape    --sd-radius 14 · --sd-radius-sm 10 · --sd-gutter 16 · --sd-max 1200 · --sd-bar-h 64
  Type     --sd-sans Geist · --sd-mono JetBrains · --sd-display Orbitron (the mark; KEPT)

COMPONENTS THAT ALREADY EXIST — extend, do not rebuild:
  src/components/skychaser/CardPlate.tsx   the one card surface, used everywhere
  src/components/skychaser/CardArt.tsx     CSS/SVG object art + cardArtPalette.ts
  src/components/skychaser/SkychaserShell.tsx nav + footer; already hides the legacy chrome
                                        via html:has(.stellar). There is NO second nav.
  src/components/skychaser/SkychaserReveal.tsx / StellarOpen.tsx / CardScene.tsx
  src/lib/rarity.ts                     rarityInfo(rarity) — do not add rarityClass()
  src/lib/sets/set-001.ts               SET_001_CARD_BY_DESIGNATION

ROUTES: /, /set/001, /card/[designation], /capsules, /capsule/[id], /capsules/log, /collection.
The card route segment is [designation] (e.g. /card/SATURN), not [id].

HARD RULES
  No emoji — inline SVG, 1.2px stroke, currentColor.
  No new npm packages. CSS keyframes + IntersectionObserver only. No Framer Motion, no GSAP.
  Depth = hairline + one deep shadow on the focused element only. No gradient washes.
  prefers-reduced-motion: every animation collapses to a 200ms opacity fade or nothing.
  Mobile-first. Banned words: NFT, mint, drop, payload, manifest, registry, airdrop.
  Node 01 is "commissioning". Never say it is operational.

BRANCH AND GATE — you are on `stellar-cards`. Confirm with `git branch --show-current` before any
commit; if it is not stellar or stellar/*, STOP. Gate before every commit:
  npx tsc --noEmit && npm test && npm run build
Commit each prompt as its own commit: `feat(stellar): <summary>`. Deletions in their own
commit, separate from additions. This is RULES.md, and it is deliberate — do not batch
five prompts of work into one uncommitted pile.
```

---

## P1 — Card plate geometry (Opus, plan mode)

```
[paste CONTEXT]

TASK: Give CardPlate real card geometry and a size scale. Extend the existing component
and the .sd-plate rules in skychaser-theme.css. Do not create a new component.

PHASE 0 — READ AND REPORT (≤12 lines, then wait)
Report CardPlate's current props and every render site (home page.tsx, set/001, StellarReveal,
collection, card page). State which sites would need a `size` and what each passes today.

PHASE 1 — IMPLEMENT
1. `size` prop: 'sm' | 'md' | 'lg', default 'md'. Widths 180 / 300 / 400. Fixed px per size,
   no fluid text. Drive it with a data-size attribute + CSS, not inline styles.
2. Frame ratio: the art frame is aspect-ratio 5/7 today; move the whole <article> to 63/88
   (the trading-card ratio) and let the frame take the remaining height above the body.
   Verify the name never wraps to 3 lines at sm.
3. Legendary gets an inner double rule:
   box-shadow: inset 0 0 0 3px var(--sd-canvas), inset 0 0 0 4px color-mix(in srgb,
   var(--sd-rarity-legendary) 55%, transparent). Epic keeps the coloured edge it has.
4. Add motion tokens to .stellar, since durations are hardcoded across the file today:
   --sd-dur-fast 320ms, --sd-dur-base 480ms, --sd-dur-slow 720ms,
   --sd-ease cubic-bezier(.2,.7,.2,1). Repoint the existing .sd-plate / .sd-btn /
   .sd-navlink transitions at them. Do not change their visual behaviour.
5. Hover stays translateY(-3px) on pointer devices only (@media (hover: hover)). No scale.
6. Keep the artUrl branch exactly as it is — the real Node 01 frame path already works.

PHASE 2 — VERIFY
Gate. Confirm no hex outside skychaser-theme.css was added. Commit.
```

---

## P2 — Capsule reveal, three beats (Opus, plan mode, extended thinking)

```
[paste CONTEXT]

TASK: Turn the capsule opening into a three-beat reveal with real accessibility.
The metaphor is the repo's, not the original document's: a meteorite enters atmosphere
(StellarReveal's sd-fall stone). Keep the stone. Do NOT build a splitting metal capsule.

PHASE 0 — READ AND REPORT
StellarOpen.tsx holds the paid → opened transition and POSTs /api/skychaser/capsules/open.
StellarReveal.tsx renders the stone + a CardPlate grid with sd-fall / sd-draw keyframes.
Report the exact shape returned by the open endpoint, and whether the commit/reveal hashes
(seed, client nonce) are available to the client — /capsules/log shows them somewhere.
Wait for OK.

PHASE 1 — BEHAVIOUR
State machine in StellarOpen: sealed → entry → open → done.
  sealed   what is there now: the button and the note. Add a slow idle to the capsule
           record card, translateY 0→-6px over 3.2s ease-in-out infinite.
  entry    800ms, once, on a successful open response. The stone descends as it does now
           (sd-fall, rarity-scaled duration — keep that, it is good), plus a single
           300×2px streak, linear-gradient(90deg, transparent, var(--sd-accent)),
           transform-origin right, scaleX 0→1 while fading out. No particles, no blur.
           Caption fades in: "Something came back."
  open     cards rise from y+60 scale .8, 150ms stagger (sd-draw already does this —
           extend it). Order lowest rarity first; the scarcest card last, centred, 20px
           higher. animation-fill-mode: both.
  done     one mono line under the cards: the draw number, the first 8 of the server seed,
           the first 8 of the client nonce, and a "verify" link to /capsules/log.
           Then: "Add to Collection" (sd-btn--primary) and "Open another" (sd-btn).
Click/tap anywhere during entry or open skips to done. Escape does the same and must be
keyboard-reachable. prefers-reduced-motion goes straight to done with a 200ms fade.
All timings through the --sd-dur-* / --sd-ease tokens P1 added.

PHASE 2 — ACCESSIBILITY (the current reveal has none of this)
aria-live="polite" region announcing on done: "Three cards drawn: {names}".
Move focus to the first card. The skip control has a visible focus ring.

PHASE 3 — VERIFY
Gate. Commit.
```

---

## P3 — /card/[designation] as a logbook entry (Opus)

```
[paste CONTEXT]

TASK: Rebuild src/app/card/[designation]/page.tsx (142 lines today) as a two-column
logbook entry. It currently renders CardArt directly — switch it to <CardPlate size="lg">
so the card page shows the same object the rest of the site shows.

PHASE 0 — READ AND REPORT
List the page's current sections and its full field list (object, catalogue, position via
formatRa/formatDec, editions, price from DIRECT_CARD_PRICE_GEL, observation eligibility,
availability from cardAvailability). Report, wait for OK.

PHASE 1 — LAYOUT
Breadcrumb in .sd-data: "Set 001 / {name} / No. {issued} of {total}".
≥1024px: 2-col grid, gap 64, align centre, max-width var(--sd-max), centred.
  Left: <CardPlate size="lg"> with a 9s ease-in-out infinite tilt (perspective 1200px,
  rotateY ±6deg, rotateX ∓2deg), paused on hover so it can be read, disabled under
  reduced-motion and on (hover: none). One deep shadow, 0 40px 80px rgba(0,0,0,.55),
  on this card only.
  Right (max-width 520): h1 .sd-display · blurb in --sd-ink-2 ·
  "Record" — eyebrow + Rule, then a definition grid, label 13px --sd-ink-3, value mono
  --sd-ink, rarity value in its rarity colour · "Observation" — status dot + mono
  "Node 01 · Tbilisi One · commissioning", then the existing observation copy ·
  CTAs: StellarBuyCard primary, "Read the log" secondary.
<1024px: one column. Plate 250w centred, h1, a 3-row Record (Catalogue / Editions /
Node 01), then a sticky bottom CTA bar with the price in mono on the right.
Keep every existing sentence. Keep the existing DataRow / Caption / Rule / RarityMark /
ObservationStatusMark primitives — do not inline their markup.

PHASE 2 — VERIFY
Gate. One h1 only. Every text colour at or above --sd-ink-3 on its background. Commit.
```

---

## P4 — Motion polish (Sonnet)

```
[paste CONTEXT]

TASK: Final motion layer. No layout changes.

1. Buttons: .sd-btn and .sd-btn--primary transition background/border-color/transform over
   var(--sd-dur-fast) var(--sd-ease). Primary hover --sd-accent-hi. Focus-visible already
   works (.stellar :focus-visible) — leave it.
2. Nav links: underline via ::after, 1px, scaleX 0→1 from the left, --sd-dur-fast.
3. Set grid: on hover only that plate lifts, siblings stay. :focus-within matches :hover.
4. Home stats: count up from 0 over 900ms on first view with requestAnimationFrame and an
   IntersectionObserver. Render the final value in SSR so there is no layout shift and no
   flash of 0 when JS is late.
5. Section entrance: IntersectionObserver adds .in, children rise 480ms, 80ms stagger,
   threshold .2, once.
6. Audit: grep for `transition: all` and replace with explicit properties. Then find every
   `filter: drop-shadow` and `box-shadow` carrying --sd-accent or a rarity colour. Report
   them to me before removing any — sd-reveal__stone's drop-shadow is deliberate and may
   stay; decide the rest case by case, do not blanket-delete.
7. Confirm every new animation is covered by the existing prefers-reduced-motion block,
   and extend that block if it is not.

Gate. Commit.
```

---

## P5 — Visual QA (Sonnet)

```
[paste CONTEXT]

TASK: QA only. Do not redesign.

1. @playwright/test is installed and e2e/ exists — do not install anything. Run the dev
   server and screenshot /, /set/001, /card/SATURN, /card/EUROPA, /capsules at 390×844 and
   1440×900. Save to qa/ and add qa/ to .gitignore.
2. List violations: any font-family outside --sd-sans / --sd-mono / --sd-display; any hex
   literal in a Stellar component or in skychaser-theme.css outside the token block at the top;
   any emoji; any banned word (NFT, mint, drop, payload, manifest, registry, airdrop) in
   user-facing copy; any text below --sd-ink-3's contrast on its background; any element
   wider than the viewport at 390px; any animation still running with prefers-reduced-motion
   emulated.
3. CardPlate at each size: the name never wraps to 3 lines, the data rows never overlap the
   frame, the legendary double rule renders at sm, md and lg.
4. Check no legacy Stellar route regressed: /sky, /moon and /observatory still render their
   own chrome and are untouched by the .stellar tokens.
5. Fix only what is on the list. Report before/after per item. Gate. Commit.
```
