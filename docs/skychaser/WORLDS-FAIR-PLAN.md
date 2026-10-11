# Crypto World's Fair plan — 2026-10-06

Deadline: 2026-10-13 06:59 UTC (Tbilisi: Oct 13, 10:59). Split: Rezi = design, Claude = tech.

## Where things stand (audited 2026-10-06)
- stellarr.club runs `e8881576` (HEAD). `NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT=1` in Production: every capsule/card "sale" is a rehearsal, no SOL moves.
- Merchant wallet `AgZdk4K5…8xy` has 0.002 SOL, zero customer payments, and is shared with personal trading.
- Fee payer `9jAYpQYZ…TDz` 0.055 SOL (~25 new users' Stars accounts). Tree `3R9uV6aL…` mainnet, ~57 ops of 8,192. Stars mint + collection on mainnet.
- Anchor `stellar_observations` is devnet only. Not needed by the card product; do not claim it is live.
- `stellar-cards` env: `SOLANA_RPC_URL=""` (breaks payment checks once simulation is off), no Upstash, stale `NEXT_PUBLIC_SIDERA_SIMULATED_PAYMENT`.
- tsc clean, 938/938 tests pass.

## Phase A — payment hardening (Claude, Oct 6–8)
Code on `stellar-cards`, migrations on the stellar-cards Neon branch only.
1. Simulation fails closed when `VERCEL_ENV=production` (orders.ts:42,72,170).
2. Read RPC with `||` not `??`; refuse empty RPC in production.
3. Transfers that carry the reference but fail validation → `refund_due` + one Telegram alert (orders.ts:202). Covers top-ups and wallets that append instructions.
4. Cron sweep for pending `stellar-card:*` orders: findPayment → fulfil or refund_due.
5. Released unpaid capsules are relisted under a fresh secret/commitment; reservation check made atomic.
6. SOL price: `no-store`, two feeds, reject if they differ >3%, quote carries its timestamp.
7. Per-set advisory lock on direct card sales (edition reserve for capsules).
8. Paid transition at `finalized`.
9. DB: partial unique index on `orders.signature`, CHECKs on `orders.status`, `capsule.state`.
10. Rate limits fail closed in production without Upstash; dedupe refund alerts; cap signatures scanned per confirm.

## Phase B — go live (Oct 8–9, needs Rezi for keys and money)
1. Rezi creates a dedicated merchant wallet (never used for trading); Claude swaps `NEXT_PUBLIC_MERCHANT_WALLET`.
2. Rezi tops up the fee payer (~0.5 SOL) if Stars/cNFT rewards stay in the flow.
3. Add Upstash env to `stellar-cards`; set `SOLANA_RPC_URL`; delete both SIMULATED vars.
4. Production migration (Phase A.9) — Rezi approves first.
5. Golive reset, deploy, then one real $5 capsule bought end to end; verify the transfer on-chain, the order row, the reveal.
6. Remove "rehearsal" copy and "Provisional" odds label once odds are final.

## Phase C — traction (Oct 9–12)
1. Admin stats route: paid orders, unique buyers, revenue (SOL/USD), repeat buyers, by day.
2. Launch to the Astroman customer list and socials; card/fiat onramp check for buyers with no SOL (Privy funding options).
3. Daily numbers into the submission notes.

## Phase D — submission (Oct 12–13)
1. Confirm which Colosseum account submits (Frontier entry is under Rezimod; rezimodd is registered for CWF).
2. Disclose Frontier and Tether QVAC history; judged work = Sep 14–Oct 13 card product.
3. Demo video: real mainnet capsule purchase → reveal → holder vote.
4. Rezi writes the submission text; Claude reviews against the judging criteria.

## Design (Rezi)
- Homepage recognition line: "Tether Frontier Hackathon · QVAC track, 1st place", not "Frontier 1st place".
- One story for the entry: the card product; legacy sky app as supporting proof only.
- Post-launch states: real price/checkout copy, receipt, refund notice, sold-out capsule.
- Demo video and pitch deck.

## Deferred
- Anchor program to mainnet (~1.8 SOL) — after the hackathon.
- Legacy `stellar` project exposes `NEXT_PUBLIC_INTERNAL_API_SECRET` to the browser — check use, rotate, make server-only.
- Loot-box / app-store rules for paid random capsules in target markets.
