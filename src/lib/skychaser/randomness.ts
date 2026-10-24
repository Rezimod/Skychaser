/**
 * Verifiable randomness for capsules.
 *
 * Pure functions only: everything here runs the same on the server, in a
 * browser, or in a third party's script, and nothing here touches a database.
 *
 * The construction, in the order it happens:
 *
 *   1. LISTING. The server draws a 32-byte secret and publishes
 *      commitment = SHA-256(secret) in the public log, before any purchase of
 *      that capsule exists.
 *   2. PURCHASE. The buyer supplies a 32-byte nonce. It is bound into the
 *      purchase message (capsule id, listing sequence, commitment, holder
 *      wallet, nonce), whose SHA-256 is logged with the nonce. A wallet
 *      signature over the message is recorded when the buyer gives one.
 *   3. PAYMENT. The order is paid by a transfer naming its payment
 *      reference. The reference is not published while the order is unpaid
 *      (anyone holding it could bury the payment under dust); it is logged
 *      at opening, with the beacon. The transfer that completes the payment
 *      lands in a Solana block whose hash nobody — buyer, operator, or anyone
 *      holding the seal key — can know before it is produced: the beacon.
 *   4. OUTCOME. seed = HMAC-SHA256(key = secret, nonce ‖ capsule_id ‖ beacon),
 *      the beacon as its 32 bytes, and draw i reads
 *      block_i = HMAC-SHA256(key = seed, uint32be(i)). A capsule with no
 *      beacon (a rehearsal or demo, which moved no money, or one opened before
 *      beacons) uses nonce ‖ capsule_id alone.
 *   5. OPEN. The secret is revealed and logged with the pulls, the supply the
 *      draws were made against and the beacon (signature, slot, block hash,
 *      payment reference). Anyone can re-run `verifyCapsule`, and check on
 *      chain that the signature names that reference and lands in that block.
 *
 * This is verifiable randomness with a public audit log. It is not trustless:
 * see docs/skychaser/capsule-randomness.md for what it does and does not rule out.
 */

import { createHash, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import bs58 from 'bs58';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { CARDS_PER_CAPSULE, RARITY_ODDS_BPS } from './economics';

const HEX32 = /^[0-9a-f]{64}$/;
const TWO_48 = BigInt(2) ** BigInt(48);

export function isHex32(value: unknown): value is string {
  return typeof value === 'string' && HEX32.test(value);
}

/** A fresh server secret, as 64 lowercase hex characters. */
export function newServerSecret(): string {
  return randomBytes(32).toString('hex');
}

/** What is published at listing: SHA-256 of the secret's 32 bytes, in hex. */
export function commitmentOf(secretHex: string): string {
  return createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest('hex');
}

export type PurchaseTerms = {
  capsuleId: string;
  sequence: number;
  commitment: string;
  wallet: string;
  nonce: string;
};

/** The exact text a buyer signs. Every field is fixed-format, so the text has one reading. */
export function purchaseMessage(t: PurchaseTerms): string {
  return [
    'Stellar capsule purchase',
    `capsule: ${t.capsuleId}`,
    `sequence: ${t.sequence}`,
    `commitment: ${t.commitment}`,
    `holder: ${t.wallet}`,
    `nonce: ${t.nonce}`,
  ].join('\n');
}

export function purchaseHash(t: PurchaseTerms): string {
  return createHash('sha256').update(purchaseMessage(t), 'utf8').digest('hex');
}

/** True when `signature` (base58) is the wallet's ed25519 signature over the purchase message. */
export function verifyPurchaseSignature(t: PurchaseTerms, signature: string): boolean {
  try {
    const pub = bs58.decode(t.wallet);
    const sig = bs58.decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(pub).toString('base64url') },
      format: 'jwk',
    });
    return verify(null, Buffer.from(purchaseMessage(t), 'utf8'), key, Buffer.from(sig));
  } catch {
    return false;
  }
}

/** A Solana block hash, base58, as its 32 bytes; throws on anything else. */
export function beaconBytes(blockhash: string): Buffer {
  const bytes = bs58.decode(blockhash);
  if (bytes.length !== 32) throw new Error('the beacon is not a 32-byte block hash');
  return Buffer.from(bytes);
}

/**
 * seed = HMAC-SHA256(secret, nonce ‖ capsule_id ‖ beacon): the nonce as its 32
 * bytes, the id as its 36 ASCII characters, the beacon block hash as its 32
 * bytes. Without a beacon, nonce ‖ capsule_id.
 */
export function outcomeSeed(secretHex: string, nonceHex: string, capsuleId: string, beacon?: string): Buffer {
  return createHmac('sha256', Buffer.from(secretHex, 'hex'))
    .update(Buffer.concat([
      Buffer.from(nonceHex, 'hex'),
      Buffer.from(capsuleId, 'utf8'),
      ...(beacon ? [beaconBytes(beacon)] : []),
    ]))
    .digest();
}

/** Two independent 48-bit integers for draw `i`: one picks the tier, one the card. */
export function drawIntegers(seed: Buffer, i: number): { tier: bigint; card: bigint } {
  const index = Buffer.alloc(4);
  index.writeUInt32BE(i);
  const block = createHmac('sha256', seed).update(index).digest();
  return { tier: BigInt(block.readUIntBE(0, 6)), card: BigInt(block.readUIntBE(6, 6)) };
}

/** floor(r · n / 2^48), in exact integer arithmetic. The bias for n ≤ 10,000 is below 2^-34. */
function pick(r: bigint, n: number): number {
  return Number((r * BigInt(n)) / TWO_48);
}

/**
 * One card of a set and how many of its editions are still unallocated. The
 * edition size is logged with it (entries logged before it was are without),
 * so the edition number each draw takes can be checked too.
 */
export type SupplyEntry = { designation: string; rarity: Rarity; remaining: number; editionSize?: number };

export type PlannedPull = { drawIndex: number; designation: string; rarity: Rarity };

export class SoldOutError extends Error {
  constructor() {
    super('Every edition in this set is allocated.');
  }
}

/**
 * The draws, from the seed and the supply at the moment of opening.
 *
 * Tier: weights are the odds of the tiers that still have an edition, so a
 * tier that is gone passes its share to the rest in proportion. Card: uniform
 * among that tier's cards with an edition left, in designation order, so a
 * card that is gone passes its share to the rest of its tier. An edition drawn
 * earlier in the same capsule counts as gone for the draws after it.
 */
export function planPulls(input: {
  secret: string;
  nonce: string;
  capsuleId: string;
  supply: SupplyEntry[];
  draws?: number;
  oddsBps?: Record<Rarity, number>;
  /** The block hash of the paying transfer's block, base58; absent for a capsule opened without one. */
  beacon?: string;
}): PlannedPull[] {
  const odds = input.oddsBps ?? RARITY_ODDS_BPS;
  const draws = input.draws ?? CARDS_PER_CAPSULE;
  const seed = outcomeSeed(input.secret, input.nonce, input.capsuleId, input.beacon);
  const remaining = new Map(input.supply.map((s) => [s.designation, s.remaining]));
  const byTier = new Map<Rarity, string[]>(
    RARITIES.map((r) => [
      r,
      input.supply
        .filter((s) => s.rarity === r)
        .map((s) => s.designation)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ]),
  );

  const pulls: PlannedPull[] = [];
  for (let i = 0; i < draws; i++) {
    const r = drawIntegers(seed, i);
    const open = (tier: Rarity) => (byTier.get(tier) ?? []).filter((d) => (remaining.get(d) ?? 0) > 0);

    const tiers = RARITIES.filter((t) => odds[t] > 0 && open(t).length > 0);
    const total = tiers.reduce((sum, t) => sum + odds[t], 0);
    if (total === 0) throw new SoldOutError();

    let x = pick(r.tier, total);
    let tier = tiers[tiers.length - 1];
    for (const t of tiers) {
      if (x < odds[t]) { tier = t; break; }
      x -= odds[t];
    }

    const cards = open(tier);
    const designation = cards[pick(r.card, cards.length)];
    remaining.set(designation, (remaining.get(designation) ?? 0) - 1);
    pulls.push({ drawIndex: i, designation, rarity: tier });
  }
  return pulls;
}

export type Verification = { ok: boolean; problems: string[] };

/**
 * Anyone's check of an opened capsule, from what the log publishes.
 *
 * Confirms the revealed secret is the one committed to at listing, that the
 * secret, the buyer's nonce, the beacon and the logged supply produce exactly these pulls,
 * in this order, and no others — and, where the supply carries edition sizes,
 * that each pull took the card's next edition number: editionSize − remaining
 * + 1, plus one for every earlier pull of the same card in this capsule.
 */
export function verifyCapsule(input: {
  commitment: string;
  secret: string;
  nonce: string;
  capsuleId: string;
  pulls: Array<{ drawIndex: number; designation: string; rarity: string; editionNumber?: number }>;
  supply: SupplyEntry[];
  draws?: number;
  oddsBps?: Record<Rarity, number>;
  beacon?: string;
}): Verification {
  const problems: string[] = [];
  if (!isHex32(input.secret)) problems.push('secret is not 32 bytes of hex');
  if (!isHex32(input.nonce)) problems.push('nonce is not 32 bytes of hex');
  if (input.beacon !== undefined) {
    try {
      beaconBytes(input.beacon);
    } catch {
      problems.push('the beacon is not a 32-byte block hash');
    }
  }
  if (problems.length) return { ok: false, problems };

  if (commitmentOf(input.secret) !== input.commitment) {
    problems.push('the revealed secret does not match the commitment published at listing');
  }

  let expected: PlannedPull[];
  try {
    expected = planPulls(input);
  } catch (err) {
    return { ok: false, problems: [...problems, (err as Error).message] };
  }
  const got = [...input.pulls].sort((a, b) => a.drawIndex - b.drawIndex);
  if (got.length !== expected.length) {
    problems.push(`expected ${expected.length} pulls, the log shows ${got.length}`);
  }
  expected.forEach((e, i) => {
    const g = got[i];
    if (!g || g.drawIndex !== e.drawIndex || g.designation !== e.designation || g.rarity !== e.rarity) {
      problems.push(`draw ${e.drawIndex}: expected ${e.designation} (${e.rarity}), the log shows ${g ? `${g.designation} (${g.rarity})` : 'nothing'}`);
    }
  });

  const entry = new Map(input.supply.map((s) => [s.designation, s]));
  const taken = new Map<string, number>();
  for (const g of got) {
    const s = entry.get(g.designation);
    if (!s || s.editionSize === undefined) continue;
    const earlier = taken.get(g.designation) ?? 0;
    taken.set(g.designation, earlier + 1);
    const next = s.editionSize - s.remaining + 1 + earlier;
    if (g.editionNumber !== next) {
      problems.push(`draw ${g.drawIndex}: ${g.designation} should be edition ${next} of ${s.editionSize}, the log shows ${g.editionNumber ?? 'none'}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
