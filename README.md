# Skychaser — the cosmos, issued in editions

Skychaser is a collectible card universe built on real astronomy. Every card is a
real object — Jupiter, Betelgeuse, M42, Voyager 1 — held as a numbered edition.
Cards arrive sealed in capsules; the reveal is a supernova. Every clear night
the observatory photographs one object, the collection decides which, and every
holder of that card receives the image.

Live: [skychaser.io](https://skychaser.io) · Solana devnet · built by [Astroman](https://astroman.ge), Tbilisi.

## The site

| Route | What it is |
|---|---|
| `/` | home: the founding set, odds, the flight plan |
| `/genesis` | the founding set, card by card (`/set/001` redirects here) |
| `/card/[designation]` | one card: object, rarity, edition sizes, what it unlocks |
| `/capsules`, `/capsule/[id]`, `/capsules/log` | buy, open, and audit capsules (provable fairness) |
| `/collection` | a holder's cards and the account |
| `/tonight` | tonight's target and the holders' vote |
| `/node` | Live Telescope V1 — commissioning |
| `/voyage` | fly the solar system and land on its worlds |
| `/invite` | the closed beta's gate |

APIs live under `/api/skychaser/*`; the nightly loop is `/api/cron/skychaser-night`
and `/api/skychaser/capsules/release` (see `vercel.json`). Every other `/api/*`
and `/m/*` path is proxied to the legacy app, because minted metadata and old
links point at this domain.

## Stack

Next.js 15, React 19, TypeScript, Tailwind 4 · Privy (email sign-in, embedded
Solana wallets) · Drizzle + Neon Postgres · Upstash rate limiting · Three.js
for the voyage · Vitest, Playwright · Vercel (`stellar-cards` project).

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in Privy, DATABASE_URL, CAPSULE_SEAL_KEY
npm run dev                  # http://localhost:3000 — Privy only allows port 3000
npm test                     # unit
npm run build && npm run test:smoke   # browser tests against a production build
```

Card data scripts are `npm run skychaser:*`; every one refuses to touch a
database that is not the `stellar-cards` Neon branch (`scripts/skychaser-guard.ts`).

## Rules

Read `docs/skychaser/RULES.md` before changing anything. Tone, vocabulary and the
things that must never change (on-chain names, storage keys) are there.

## The legacy app

The astronomy companion this grew out of — sky forecast, photo-verified
observations, ASTRA, marketplace, Skychaser Field (Tether Frontier Hackathon
winner, May 2026), explore mode, observatory network — lives on branch `legacy`
and runs at [app.stellarr.club](https://app.stellarr.club).
