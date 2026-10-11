// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';
import { RARITIES, type Rarity } from '@/lib/rarity';
import {
  CAPSULE_PRICE_USD,
  CARDS_PER_CAPSULE,
  DIRECT_CARD_PRICE_USD,
  RARITY_ODDS,
  RARITY_ODDS_BPS,
  UNKNOWN_COSTS,
  capsuleEconomics,
} from '@/lib/skychaser/economics';
import {
  SoldOutError,
  commitmentOf,
  planPulls,
  purchaseHash,
  purchaseMessage,
  verifyCapsule,
  verifyPurchaseSignature,
  type SupplyEntry,
} from '@/lib/skychaser/randomness';

const hex = (label: string) => createHash('sha256').update(label).digest('hex');
/** A capsule id with the shape of a UUID, fixed by `i`. */
const capsuleIdOf = (i: number) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;

/** Two cards a tier, with more editions than any test draws. */
const PLENTY: SupplyEntry[] = RARITIES.flatMap((rarity) =>
  ['A', 'B'].map((x) => ({ designation: `${rarity.toUpperCase()}-${x}`, rarity, remaining: 1_000_000 })),
);

describe('the odds and prices', () => {
  it('sum to exactly one', () => {
    expect(RARITIES.reduce((s, r) => s + RARITY_ODDS_BPS[r], 0)).toBe(10_000);
    expect(RARITIES.reduce((s, r) => s + RARITY_ODDS[r], 0)).toBe(1);
    for (const r of RARITIES) expect(Number.isInteger(RARITY_ODDS_BPS[r]) && RARITY_ODDS_BPS[r] > 0).toBe(true);
  });

  it('prices every rarity, rarer dearer', () => {
    const prices = RARITIES.map((r) => DIRECT_CARD_PRICE_USD[r]);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(CAPSULE_PRICE_USD).toBeGreaterThan(0);
    expect(CARDS_PER_CAPSULE).toBeGreaterThan(0);
  });

  it('computes Gate 2’s contents value and margin from the constants', () => {
    const e = capsuleEconomics(UNKNOWN_COSTS);
    const perDraw = RARITIES.reduce((s, r) => s + RARITY_ODDS[r] * DIRECT_CARD_PRICE_USD[r], 0);
    expect(e.expectedContentsValueUsd).toBeCloseTo(CARDS_PER_CAPSULE * perDraw, 10);
    expect(e.contributionMarginUsd).toBe(CAPSULE_PRICE_USD);

    const costed = capsuleEconomics({ ...UNKNOWN_COSTS, paymentFeeRate: 0.03, contentsCostPerCardUsd: 1, fulfilmentUsd: 2 }, 40);
    expect(costed.variableCostUsd).toBeCloseTo(40 * 0.03 + CARDS_PER_CAPSULE * 1 + 2, 10);
    expect(costed.contributionMarginUsd).toBeCloseTo(40 - costed.variableCostUsd, 10);
  });
});

describe('the draws', () => {
  const secret = hex('secret');
  const nonce = hex('nonce');
  const capsuleId = capsuleIdOf(1);

  it('are the same for the same secret, nonce, capsule and supply', () => {
    const a = planPulls({ secret, nonce, capsuleId, supply: PLENTY });
    expect(planPulls({ secret, nonce, capsuleId, supply: PLENTY })).toEqual(a);
    expect(a).toHaveLength(CARDS_PER_CAPSULE);
    expect(a.map((p) => p.drawIndex)).toEqual(Array.from({ length: CARDS_PER_CAPSULE }, (_, i) => i));
  });

  it('depend on the nonce and on the capsule, not only the secret', () => {
    const base = planPulls({ secret, nonce, capsuleId, supply: PLENTY, draws: 12 });
    expect(planPulls({ secret, nonce: hex('other nonce'), capsuleId, supply: PLENTY, draws: 12 })).not.toEqual(base);
    expect(planPulls({ secret, nonce, capsuleId: capsuleIdOf(2), supply: PLENTY, draws: 12 })).not.toEqual(base);
  });

  it('do not depend on the order the supply is listed in', () => {
    const a = planPulls({ secret, nonce, capsuleId, supply: PLENTY, draws: 12 });
    expect(planPulls({ secret, nonce, capsuleId, supply: [...PLENTY].reverse(), draws: 12 })).toEqual(a);
  });

  it('land on the odds over 10,000 draws', () => {
    const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const perCard = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) {
      const [p] = planPulls({ secret: hex(`s${i}`), nonce: hex(`n${i}`), capsuleId: capsuleIdOf(i), supply: PLENTY, draws: 1 });
      counts[p.rarity]++;
      perCard.set(p.designation, (perCard.get(p.designation) ?? 0) + 1);
    }
    // Pearson's chi-square, 3 degrees of freedom: 16.27 is the 0.1% critical value.
    const chi = RARITIES.reduce((s, r) => {
      const expected = 10_000 * RARITY_ODDS[r];
      return s + (counts[r] - expected) ** 2 / expected;
    }, 0);
    console.info('10,000 draws by rarity', counts, 'expected', RARITIES.map((r) => 10_000 * RARITY_ODDS[r]), 'chi-square', chi.toFixed(3));
    expect(chi).toBeLessThan(16.27);
    // And each tier within four standard deviations of its expectation.
    for (const r of RARITIES) {
      const p = RARITY_ODDS[r];
      expect(Math.abs(counts[r] - 10_000 * p)).toBeLessThan(4 * Math.sqrt(10_000 * p * (1 - p)));
    }
    // Within the common tier the two cards split evenly.
    const a = perCard.get('COMMON-A') ?? 0;
    const b = perCard.get('COMMON-B') ?? 0;
    expect(Math.abs(a - b)).toBeLessThan(4 * Math.sqrt(a + b));
  });
});

describe('edition exhaustion', () => {
  const draw = (supply: SupplyEntry[], n: number, draws = 1) =>
    Array.from({ length: n }, (_, i) =>
      planPulls({ secret: hex(`x${i}`), nonce: hex(`y${i}`), capsuleId: capsuleIdOf(i), supply, draws }),
    ).flat();

  it('never draws a card with no editions left, and its tier-mate takes its share', () => {
    const supply = PLENTY.map((s) => (s.designation === 'COMMON-A' ? { ...s, remaining: 0 } : s));
    const pulls = draw(supply, 3000);
    expect(pulls.some((p) => p.designation === 'COMMON-A')).toBe(false);
    const common = pulls.filter((p) => p.rarity === 'common').length;
    // The tier keeps its whole share: COMMON-B now carries all of it.
    expect(Math.abs(common - 3000 * RARITY_ODDS.common)).toBeLessThan(4 * Math.sqrt(3000 * 0.79 * 0.21));
    expect(pulls.filter((p) => p.designation === 'COMMON-B')).toHaveLength(common);
  });

  it('hands a sold-out tier’s share to the other tiers in proportion', () => {
    const supply = PLENTY.map((s) => (s.rarity === 'epic' || s.rarity === 'legendary' ? { ...s, remaining: 0 } : s));
    const pulls = draw(supply, 4000);
    expect(pulls.every((p) => p.rarity === 'common' || p.rarity === 'rare')).toBe(true);
    const common = pulls.filter((p) => p.rarity === 'common').length;
    const share = RARITY_ODDS_BPS.common / (RARITY_ODDS_BPS.common + RARITY_ODDS_BPS.rare);
    expect(Math.abs(common - 4000 * share)).toBeLessThan(4 * Math.sqrt(4000 * share * (1 - share)));
  });

  it('counts an edition drawn earlier in the same capsule as gone', () => {
    const supply: SupplyEntry[] = [
      { designation: 'ONLY', rarity: 'legendary', remaining: 1 },
      { designation: 'OTHER', rarity: 'common', remaining: 1 },
    ];
    const pulls = planPulls({ secret: hex('a'), nonce: hex('b'), capsuleId: capsuleIdOf(9), supply, draws: 2 });
    expect(pulls.map((p) => p.designation).sort()).toEqual(['ONLY', 'OTHER']);
    expect(() => planPulls({ secret: hex('a'), nonce: hex('b'), capsuleId: capsuleIdOf(9), supply, draws: 3 })).toThrow(SoldOutError);
  });
});

describe('commit and reveal', () => {
  const secret = hex('the secret');
  const commitment = commitmentOf(secret);
  const nonce = hex('the nonce');
  const capsuleId = capsuleIdOf(42);
  // Two draws, as capsules listed before 2026-10-01 still hold, so a pull can be swapped or dropped.
  const pulls = planPulls({ secret, nonce, capsuleId, supply: PLENTY, draws: 2 });
  const honest = { commitment, secret, nonce, capsuleId, pulls, supply: PLENTY, draws: 2 };

  it('commits to SHA-256 of the secret’s bytes', () => {
    expect(commitment).toBe(createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex'));
  });

  it('verifies an honest capsule', () => {
    expect(verifyCapsule(honest)).toEqual({ ok: true, problems: [] });
  });

  it('fails a secret that is not the one committed to', () => {
    const r = verifyCapsule({ ...honest, secret: hex('another secret') });
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/does not match the commitment/);
  });

  it('fails a substituted nonce', () => {
    expect(verifyCapsule({ ...honest, nonce: hex('a nonce the server preferred') }).ok).toBe(false);
  });

  it('fails a changed, dropped or added pull', () => {
    const other = PLENTY.find((s) => s.designation !== pulls[1].designation)!;
    const swapped = pulls.map((p, i) => (i === 1 ? { ...p, designation: other.designation, rarity: other.rarity } : p));
    expect(verifyCapsule({ ...honest, pulls: swapped }).ok).toBe(false);
    expect(verifyCapsule({ ...honest, pulls: pulls.slice(0, -1) }).ok).toBe(false);
    expect(verifyCapsule({ ...honest, pulls: [...pulls, { ...pulls[0], drawIndex: pulls.length }] }).ok).toBe(false);
  });

  it('fails when the supply claimed is not the supply the draws came from', () => {
    const drawn = pulls[0].designation;
    const claimed = PLENTY.map((s) => (s.designation === drawn ? { ...s, remaining: 0 } : s));
    expect(verifyCapsule({ ...honest, supply: claimed }).ok).toBe(false);
  });
});

describe('the purchase message', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url');
  const terms = {
    capsuleId: capsuleIdOf(7),
    sequence: 7,
    commitment: commitmentOf(hex('s')),
    wallet: bs58.encode(raw),
    nonce: hex('n'),
  };
  const signature = bs58.encode(sign(null, Buffer.from(purchaseMessage(terms), 'utf8'), privateKey));

  it('binds capsule, sequence, commitment, holder and nonce into one hash', () => {
    const h = purchaseHash(terms);
    for (const change of [{ nonce: hex('m') }, { sequence: 8 }, { capsuleId: capsuleIdOf(8) }, { commitment: commitmentOf(hex('t')) }]) {
      expect(purchaseHash({ ...terms, ...change })).not.toBe(h);
    }
  });

  it('accepts the holder’s signature and refuses it over any other nonce', () => {
    expect(verifyPurchaseSignature(terms, signature)).toBe(true);
    expect(verifyPurchaseSignature({ ...terms, nonce: hex('substituted') }, signature)).toBe(false);
    expect(verifyPurchaseSignature(terms, 'not-base58-0OIl')).toBe(false);
  });
});

describe('the paying block', () => {
  const secret = hex('beacon-secret');
  const nonce = hex('beacon-nonce');
  const capsuleId = capsuleIdOf(77);
  const blockA = bs58.encode(createHash('sha256').update('block-a').digest());
  const blockB = bs58.encode(createHash('sha256').update('block-b').digest());
  const draw = (beacon?: string) => planPulls({ secret, nonce, capsuleId, supply: PLENTY, draws: 32, beacon });

  it('changes the draws: the secret and the nonce alone no longer decide them', () => {
    expect(draw(blockA)).not.toEqual(draw(blockB));
    expect(draw(blockA)).not.toEqual(draw());
    expect(draw(blockA)).toEqual(draw(blockA));
  });

  it('is part of the check: the right block verifies, any other does not', () => {
    const pulls = draw(blockA);
    const base = { commitment: commitmentOf(secret), secret, nonce, capsuleId, pulls, supply: PLENTY, draws: 32 };
    expect(verifyCapsule({ ...base, beacon: blockA }).ok).toBe(true);
    expect(verifyCapsule({ ...base, beacon: blockB }).ok).toBe(false);
    expect(verifyCapsule(base).ok).toBe(false);
  });

  it('must be a 32-byte block hash', () => {
    expect(() => draw('abc')).toThrow(/32-byte/);
    const check = verifyCapsule({ commitment: commitmentOf(secret), secret, nonce, capsuleId, pulls: [], supply: PLENTY, beacon: 'abc' });
    expect(check.problems).toContain('the beacon is not a 32-byte block hash');
  });
});

describe("the buyer's receipt check", () => {
  it('accepts the receipt the server builds, and nothing with another nonce or hash', async () => {
    const { receiptHolds } = await import('@/lib/skychaser/receipt');
    const terms = { capsuleId: capsuleIdOf(9), sequence: 9, commitment: hex('c'), wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', nonce: hex('n') };
    const receipt = { nonce: terms.nonce, purchaseMessage: purchaseMessage(terms), purchaseHash: purchaseHash(terms) };
    expect(await receiptHolds(receipt, terms.capsuleId, terms.commitment)).toBe(true);
    expect(await receiptHolds({ ...receipt, nonce: hex('other') }, terms.capsuleId, terms.commitment)).toBe(false);
    expect(await receiptHolds({ ...receipt, purchaseHash: hex('x') }, terms.capsuleId, terms.commitment)).toBe(false);
    const swapped = purchaseMessage({ ...terms, nonce: hex('swapped') });
    expect(await receiptHolds({ ...receipt, purchaseMessage: swapped, purchaseHash: purchaseHash({ ...terms, nonce: hex('swapped') }) }, terms.capsuleId, terms.commitment)).toBe(false);
    expect(await receiptHolds(receipt, capsuleIdOf(10), terms.commitment)).toBe(false);
  });
});
