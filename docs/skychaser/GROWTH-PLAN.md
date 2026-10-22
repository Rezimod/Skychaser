# Skychaser — the growth loop

Written 2026-10-22, after a read of the `skychaser` branch. Branch: `skychaser/growth`.
Read `RULES.md` first; nothing here changes the tone, the vocabulary or the fairness of a capsule.

## Where the product stands

The object is good: a numbered edition of a real thing, a provably fair capsule, a
reveal that is a supernova. What is missing is everything around it that makes one
holder bring the next.

| Finding | Where it shows |
| --- | --- |
| Nothing is free. The first action costs $5 and needs SOL. | `/genesis`, `tiers.ts` |
| The invitation is a gate, not a loop: codes live in an environment variable, nobody earns one, nobody is rewarded for one. | `src/lib/invite.ts`, `middleware.ts` |
| Payment is SOL only, into an embedded wallet, with no way to fund it from a card. | `SkychaserPay.tsx` |
| A share points at the catalogue, not at the holder's edition. The pull is the moment, and it has no page. | `SkychaserReveal.tsx`, `ShareCard.tsx` |
| Nothing reaches a holder. The vote opens, the week's card is chosen, the photograph lands: no email, no notice. | `night.ts`, `telegram.ts` (alerts go to the owner only) |
| The observatory promise is not running yet; the perks above common are marked soon. | `perks.ts`, `docs/skychaser-open-questions.md` 10 |
| Genesis reads as abundant: 21,600 commons at 91% odds. | `economics.ts` |

The funnel script (`npm run skychaser:funnel`) exists and must be run on the card
database before and after this work; this container cannot reach Neon.

## The loop

    arrive by a holder's link → sign in → the first card is already there
      → open a capsule → share the edition → the link brings the next holder
      → the week's photograph brings them back

Every phase below is one piece of that chain. Each ships as one commit on
`skychaser/growth`, with `npx tsc --noEmit`, `npm test` and `npm run build` green,
and adds its questions to `docs/skychaser-open-questions.md`.

## Phases

### 1. The first card — done in code
A signed-in account whose wallet holds nothing receives one edition of the welcome
card, numbered like any other, the moment it first signs in. One per account and
one per wallet; the set must be released; `SKYCHASER_WELCOME=off` stops it.
The welcome card is `FIRST-LIGHT`, then the next card on `WELCOME_CARDS` once it is
gone (`src/lib/skychaser/welcome.ts`).

Added: `holder_contact` (who each account is: wallet, email, the invitation that
brought them, their welcome edition, whether they take email), `POST
/api/skychaser/hello` (called once per sign-in by `SkychaserHello`), the welcome
panel, server-side funnel events.

### 2. The edition page — done in code
`/edition/<DESIGNATION>/<n>`: one holder's one card, with its number, holder,
date, capsule and photograph, and a link preview drawn for it. The reveal, the
Collection and the welcome panel share this page, not the catalogue.

### 3. The invitation loop — done in code
Every holder has an invitation link, `/invite/<code>`, made on first request
(`GET /api/skychaser/invite`). It opens the closed beta like an owner's code
(the cookie carries a signature the middleware checks without the database),
and it records who brought whom. When the invited account opens its first paid
capsule, the inviter receives one common edition, up to `REFERRAL_REWARD_CAP`.
The `/invite` page shows a holder their link, who came and what it brought.

### 4. Word to holders — done in code
Email, through Resend's HTTP API (no package), sent by the nightly cron: when a
holder's card is chosen as the week's target, and when it is photographed. Each
message carries an unsubscribe link signed for that account. Needs
`RESEND_API_KEY` and `NOTIFY_FROM`; without them nothing is sent and nothing fails.

### 5. Funding without SOL — done in code
When the wallet is short, the pay panel offers Privy's funding flow (card and
exchange) beside the existing address. Needs funding enabled in the Privy
dashboard; without it the button opens nothing and the address stays.

### 6. Measurement and the small things — done in code
Funnel steps for the edition and invite pages; `invite` and `edition` in the route
smoke test; the env example; the README's route table; this document's status.

### The door, kept shut to the free things — done in code
With the beta closed, an account that only signed in at `/invite` is given no
first card and no link of its own until an invitation has let it in
(`admitted` in `src/lib/invite.ts`). Otherwise a stranger could sign in at the
door, take a link and open it on themselves.

## Status, 2026-10-22

Every phase is in code on `skychaser/growth`, each as one commit, with
`npx tsc --noEmit`, `npm test` (the one pre-existing supernova timing failure
aside) and `npm run build` green at every commit. Nothing has run against a
database: the container cannot reach Neon. The owner's list follows.

## What only the owner can do

1. Apply `scripts/skychaser-growth.sql` to the skychaser Neon branch (additive: four tables, nothing existing touched).
2. Set `INVITE_SIGNING_KEY` (or leave it: `CAPSULE_SEAL_KEY` is used), `RESEND_API_KEY`, `NOTIFY_FROM`.
3. Enable wallet funding (MoonPay or Coinbase) in the Privy dashboard for Solana.
4. Run the funnel before launch and a week after.
5. Decide the questions in `docs/skychaser-open-questions.md` under "Growth".

## Not in this plan, on purpose

- The observatory's first real capture: Darkview's contract (open question 10).
- Georgian: `RULES.md` says English only for v1. The distribution asset is Georgian; that is a decision, not a ticket.
- A smaller Genesis: edition sizes are fixed (Phase 4 of the rebrand). Scarcity comes from limited cards, which already exist.
