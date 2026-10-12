# Stellar — standing rules

This repository is the card product, and nothing else. The astronomy app it
grew out of (sky forecast, observations, ASTRA, marketplace, Stellar Field,
explore mode, observatory network) lives on branch `legacy` and deploys to
app.stellarr.club from the Vercel project `stellar`. skychaser.io is the
card product, deployed from the Vercel project `skychaser`; stellarr.club
forwards its pages there and still answers `/api/*` and `/m/*`.
Repository: Rezimod/Stellar only. The Darkview platform
(Bekatsertsvadzee/Online-Observatory) is consumed over its HTTP contract;
nothing is pushed there and no Darkview source is copied here.

Transition (October 2026): until `skychaser` has been pushed to `main`
(see `~/Desktop/Skychaser/docs/plans/legacy-cut/HANDOVER.md`), work on
`skychaser`. After that, `main` is the only working branch.

Source plan: `~/Desktop/Skychaser/docs/plans/stellar-rebrand-migration-plan.md`.
Execution plan with corrections: `docs/skychaser/EXECUTION.md`.

## Never
- Commit to `legacy`, merge from it, or rebase/force-push anything. Check
  `git branch --show-current` before any commit; if it is not `skychaser`,
  `skychaser/*` or `main`, STOP and report.
- Delete `docs/grant-evidence/` — grant evidence, not code.
- Translate into `src/messages/ka.json` — v1 is English-only; archive it instead.
- Run migrations or `db:push` against the production database. Only the
  `skychaser` Neon branch.
- Remove the rewrites in `next.config.ts` that proxy `/api/*` and `/m/*` to
  the legacy origin. Minted cNFTs and old links point at stellarr.club, and
  the legacy app answers them.
- Rename group (d) identifiers (see `docs/skychaser-inventory.md`): collection
  name `Stellar Observations`, symbol `STLR`, Anchor `stellar_observations`,
  env `STELLAR_PAUSED`, cookie `stellar_locale`, every `stellar_*` /
  `stellar.*` / `stellar:` storage key, the rarity value `Stellar` accepted by
  `/api/nft-image`, package name.

## Always
- One phase per commit: `feat(stellar): phase N — <summary>`.
- Deletions in commits of their own, separate from additions.
- `npx tsc --noEmit`, `npm test` and `npm run build` pass before every commit.
- When a decision is ambiguous, write the question into
  `docs/skychaser-open-questions.md` and take the most reversible option.

## Product, in one paragraph
Stellar is a collectible card universe built on real astronomy. Cards represent
real objects. One card arrives in each capsule; the reveal is a supernova
("Ignite": a star struggles, collapses and goes; the card comes out of the nebula it leaves, face down, and turns). Every clear night the observatory photographs ONE object, the
collection decides which, and every holder of that card receives the image.
One capture serves all editions of a card — there is no per-customer queue.

## Tone, applied to every string you write
Quiet, institutional, an observatory logbook. Never exclamation marks, never
rocket emoji, never "wen"/"LFG"/"GM"/"floor". Never claim the observatory is
operational — Live Telescope V1 is `commissioning`. Exception, by the owner's decision on 2026-10-10: the /node observatory console is presented as live (no Demo labels).
Vocabulary: capsule (not pack/box), card (not NFT/token), set (not drop),
observation (not shoot/session), Live Telescope V1 — the telescope in Tbilisi (not "Node 01", not "Live Telescope V1", not "our telescope"), Founding set for First Light’s set label (not "Set 001"; the code SET001 stays; the page lives at /genesis, and /set/001 redirects there), Collection
(not portfolio/bag), holder (not user/degen), edition number (not mint number).
Banned outright in new user-facing copy: NFT, mint, drop, payload, manifest,
registry, airdrop.
