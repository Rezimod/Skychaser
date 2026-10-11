# Gate 2 — capsule economics

**Question.** Does contribution margin survive contents cost, payment fees,
fulfilment, packaging, returns, support and telescope operating cost? If not,
change price and odds now, before any UI is built.

**Status: PROVISIONAL.** Every price and probability below is a placeholder in
`src/lib/skychaser/economics.ts`. Every cost is **0 because it is unknown**, not
because it is small. Gate 2 is not passed until Rezi supplies the costs.

## The constants (economics.ts)

| Constant | Provisional value |
| --- | --- |
| `CARDS_PER_CAPSULE` | 3 |
| `RARITY_ODDS` per draw | common 0.79 · rare 0.165 · epic 0.04 · legendary 0.005 (sum exactly 1) |
| `CAPSULE_PRICE_GEL` | 39 |
| `DIRECT_CARD_PRICE_GEL` | common 8 · rare 20 · epic 60 · legendary 250 |
| `EDITION_SIZE` (fixed, Phase 4) | common 300 · rare 100 · epic 30 · legendary 5 |

The odds follow Set 001's own supply (8 common × 300, 5 rare × 100, 4 epic × 30,
3 legendary × 5 = 2,400 / 500 / 120 / 15 of 3,035 editions), so no tier runs
dry long before the others. The whole set fills about 1,011 capsules.

## Formulas

Let `n = CARDS_PER_CAPSULE`, `p_r = RARITY_ODDS[r]`, `d_r = DIRECT_CARD_PRICE_GEL[r]`, `P = CAPSULE_PRICE_GEL`.

**Expected contents value** (what the cards would cost bought one at a time):

    V = n · Σ_r p_r · d_r

**Contents value ratio** (above 1: a capsule is cheaper than its cards bought singly):

    V / P

**Variable cost per capsule:**

    C = P · (f + q) + F + n · k + u + g + s + t

| Symbol | Cost input Rezi must supply | Now |
| --- | --- | --- |
| `f` | payment fee, % of price (Solana Pay network fee ≈ 0; a card processor if added) | **0 — unknown** |
| `F` | fixed fee per payment | **0 — unknown** |
| `k` | contents cost per card (printing, if physical; 0 if digital only — see open question 11) | **0 — unknown** |
| `u` | fulfilment per capsule (pick, ship) | **0 — unknown** |
| `g` | packaging per capsule | **0 — unknown** |
| `q` | returns and refunds, % of price | **0 — unknown** |
| `s` | support per capsule | **0 — unknown** |
| `t` | Node 01 operating cost for a period ÷ capsules sold in that period | **0 — unknown** |

**Contribution margin:**

    M = P − C        margin rate = M / P

`capsuleEconomics(costs, price?)` in `economics.ts` computes all of this.

## With the provisional numbers

    V = 3 · (0.79·8 + 0.165·20 + 0.04·60 + 0.005·250)
      = 3 · (6.32 + 3.30 + 2.40 + 1.25)
      = 3 · 13.27 = 39.81 GEL

    V / P = 39.81 / 39 = 1.021

    C = 0 (every cost unknown)  →  M = 39 GEL, margin rate 100%

The 100% is meaningless until the costs are in. What the numbers do say:

- A capsule is priced at about its contents' single-card value (102%). That is
  a deliberate starting point, not a margin claim: the cards cost Stellar nothing
  to issue digitally, so value to the holder and cost to Stellar are different
  things. Printed cards change that through `k`, `u` and `g`.
- `t` is fixed per period and spread over volume. At low beta volume it can be
  the largest term; enter it as a per-period cost and a realistic capsule count.

## What to decide

1. Fill the eight cost inputs.
2. Run `capsuleEconomics({...})` and read `contributionMarginRate`.
3. If it does not hold, change `CAPSULE_PRICE_GEL`, `CARDS_PER_CAPSULE`,
   `RARITY_ODDS_BPS` or `DIRECT_CARD_PRICE_GEL` in `economics.ts` — one file.
   Capsules already opened keep verifying: each logs the odds and draw count
   it was opened under.
