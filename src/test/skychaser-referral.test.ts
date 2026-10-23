// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Db } from '@/lib/skychaser/attach';

const dialect = new PgDialect();

type Card = { id: string; designation: string; name: string; rarity: string; edition_size: number; status: string };
type Edition = { id: string; card_id: string; edition_number: number; owner_wallet: string };
type Reward = { invitee: string; code: string; referrer: string; referrer_wallet: string; capsule_id: string; edition_id: string | null };
const state = {
  cards: [] as Card[],
  editions: [] as Edition[],
  contacts: [] as Array<{ privy_id: string; invited_by: string | null }>,
  codes: [] as Array<{ code: string; privy_id: string; wallet: string }>,
  rewards: [] as Reward[],
  events: [] as string[],
};

vi.mock('@/lib/skychaser/repo', () => ({
  allocateEdition: async (_db: unknown, cardId: string, wallet: string) => {
    const card = state.cards.find((c) => c.id === cardId)!;
    const taken = state.editions.filter((e) => e.card_id === cardId).length;
    if (taken >= card.edition_size) return null;
    const row = { id: `e-${cardId}-${taken + 1}`, card_id: cardId, edition_number: taken + 1, owner_wallet: wallet };
    state.editions.push(row);
    return { id: row.id, editionNumber: row.edition_number };
  },
}));
vi.mock('@/lib/skychaser/events', () => ({ recordEvent: async (_db: unknown, event: string) => void state.events.push(event) }));

import { inviteFor, inviteStats, newInviteCode, REFERRAL_REWARD_CAP, rewardReferrer } from '@/lib/skychaser/referral';
import { HOLDER_CODE } from '@/lib/invite';

function run(sql: string, params: unknown[]): { rows: unknown[] } {
  if (/SELECT invited_by FROM holder_contact/.test(sql)) return { rows: state.contacts.filter((c) => c.privy_id === params[0]) };
  if (/SELECT privy_id, wallet FROM invite_code WHERE code/.test(sql)) return { rows: state.codes.filter((c) => c.code === params[0]) };
  if (/SELECT code FROM invite_code WHERE privy_id/.test(sql)) return { rows: state.codes.filter((c) => c.privy_id === params[0]) };
  if (/SELECT 1 AS one FROM invite_code/.test(sql)) return { rows: state.codes.filter((c) => c.code === params[0]).map(() => ({ one: 1 })) };
  if (/INSERT INTO invite_code/.test(sql)) {
    if (state.codes.some((c) => c.privy_id === params[1])) return { rows: [] };
    if (state.codes.some((c) => c.code === params[0])) throw Object.assign(new Error('dup'), { code: '23505' });
    state.codes.push({ code: params[0] as string, privy_id: params[1] as string, wallet: params[2] as string });
    return { rows: [{ code: params[0] }] };
  }
  if (/INSERT INTO referral_reward/.test(sql)) {
    if (state.rewards.some((r) => r.invitee === params[0])) return { rows: [] };
    state.rewards.push({ invitee: params[0] as string, code: params[1] as string, referrer: params[2] as string, referrer_wallet: params[3] as string, capsule_id: params[4] as string, edition_id: null });
    return { rows: [{ invitee_privy_id: params[0] }] };
  }
  if (/SELECT count\(\*\)::int AS n FROM referral_reward WHERE referrer_privy_id = \$1 AND edition_id IS NOT NULL/.test(sql)) {
    return { rows: [{ n: state.rewards.filter((r) => r.referrer === params[0] && r.edition_id).length }] };
  }
  if (/SELECT count\(\*\)::int AS n FROM referral_reward WHERE referrer_privy_id/.test(sql)) return { rows: [{ n: state.rewards.filter((r) => r.referrer === params[0]).length }] };
  if (/SELECT count\(\*\)::int AS n FROM holder_contact WHERE invited_by/.test(sql)) return { rows: [{ n: state.contacts.filter((c) => c.invited_by === params[0]).length }] };
  if (/FROM card c JOIN card_set s/.test(sql)) {
    return {
      rows: state.cards.filter((c) => c.rarity === 'common' && c.status === 'released' && state.editions.filter((e) => e.card_id === c.id).length < c.edition_size),
    };
  }
  if (/UPDATE referral_reward SET edition_id/.test(sql)) {
    state.rewards.find((r) => r.invitee === params[1])!.edition_id = params[0] as string;
    return { rows: [] };
  }
  if (/FROM referral_reward r JOIN edition e/.test(sql)) {
    return {
      rows: state.rewards
        .filter((r) => r.referrer === params[0] && r.edition_id)
        .map((r) => {
          const e = state.editions.find((x) => x.id === r.edition_id)!;
          const c = state.cards.find((x) => x.id === e.card_id)!;
          return { designation: c.designation, name: c.name, rarity: c.rarity, edition_number: e.edition_number, edition_size: c.edition_size };
        }),
    };
  }
  throw new Error(`unexpected statement: ${sql}`);
}

const db = {
  execute: (query: SQL) => {
    const { sql, params } = dialect.sqlToQuery(query);
    return Promise.resolve().then(() => run(sql, params));
  },
} as unknown as Db;

const CAPSULE = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  state.cards = [
    { id: 'c-SUN', designation: 'SUN', name: 'The Sun', rarity: 'common', edition_size: 300, status: 'released' },
    { id: 'c-FIRST-LIGHT', designation: 'FIRST-LIGHT', name: 'First Light', rarity: 'common', edition_size: 300, status: 'released' },
    { id: 'c-SATURN', designation: 'SATURN', name: 'Saturn', rarity: 'epic', edition_size: 30, status: 'released' },
  ];
  state.editions = [];
  state.contacts = [{ privy_id: 'guest', invited_by: 'ABCDEFGH' }, { privy_id: 'stranger', invited_by: null }];
  state.codes = [{ code: 'ABCDEFGH', privy_id: 'host', wallet: 'host-wallet' }];
  state.rewards = [];
  state.events = [];
});

describe('an invitation code', () => {
  it('is eight characters the middleware accepts, made once per account', async () => {
    expect(newInviteCode()).toMatch(HOLDER_CODE);
    const code = await inviteFor(db, { privyId: 'p1', wallet: 'w1' });
    expect(code).toMatch(HOLDER_CODE);
    expect(await inviteFor(db, { privyId: 'p1', wallet: 'w1' })).toBe(code);
    expect(state.codes).toHaveLength(2);
  });
});

describe("the inviter's card", () => {
  it('is one common, not a welcome card, when the guest opens a first capsule', async () => {
    const reward = await rewardReferrer(db, { inviteePrivyId: 'guest', inviteeWallet: 'guest-wallet', capsuleId: CAPSULE });
    expect(reward).toMatchObject({ code: 'ABCDEFGH', referrerWallet: 'host-wallet', edition: { designation: 'SUN', editionNumber: 1 } });
    expect(state.editions[0].owner_wallet).toBe('host-wallet');
    expect(state.rewards[0].edition_id).toBe('e-c-SUN-1');
    expect(state.events).toEqual(['referral_rewarded']);

    const stats = await inviteStats(db, { privyId: 'host', wallet: 'host-wallet' });
    expect(stats).toMatchObject({ code: 'ABCDEFGH', arrived: 1, converted: 1, cap: REFERRAL_REWARD_CAP });
    expect(stats.cards).toEqual([{ designation: 'SUN', name: 'The Sun', rarity: 'common', editionNumber: 1, editionSize: 300 }]);
  });

  it('is given once per guest, however many capsules they open', async () => {
    expect((await rewardReferrer(db, { inviteePrivyId: 'guest', inviteeWallet: 'g', capsuleId: CAPSULE }))?.edition).not.toBeNull();
    expect(await rewardReferrer(db, { inviteePrivyId: 'guest', inviteeWallet: 'g', capsuleId: CAPSULE })).toBeNull();
    expect(state.editions).toHaveLength(1);
  });

  it('is nothing for a stranger, or for an account that invited itself', async () => {
    expect(await rewardReferrer(db, { inviteePrivyId: 'stranger', inviteeWallet: 's', capsuleId: CAPSULE })).toBeNull();
    state.contacts.push({ privy_id: 'host', invited_by: 'ABCDEFGH' });
    expect(await rewardReferrer(db, { inviteePrivyId: 'host', inviteeWallet: 'host-wallet', capsuleId: CAPSULE })).toBeNull();
    expect(state.editions).toHaveLength(0);
  });

  it('stops at the cap, and still records the guest', async () => {
    for (let i = 0; i < REFERRAL_REWARD_CAP; i++) {
      state.contacts.push({ privy_id: `g${i}`, invited_by: 'ABCDEFGH' });
      expect((await rewardReferrer(db, { inviteePrivyId: `g${i}`, inviteeWallet: 'g', capsuleId: CAPSULE }))?.edition).not.toBeNull();
    }
    const over = await rewardReferrer(db, { inviteePrivyId: 'guest', inviteeWallet: 'g', capsuleId: CAPSULE });
    expect(over).toMatchObject({ code: 'ABCDEFGH', edition: null });
    expect(state.editions).toHaveLength(REFERRAL_REWARD_CAP);
    expect((await inviteStats(db, { privyId: 'host', wallet: 'host-wallet' })).converted).toBe(REFERRAL_REWARD_CAP + 1);
  });

  it('is nothing when no common is left, and the guest is still recorded', async () => {
    state.cards[0].edition_size = 0;
    const reward = await rewardReferrer(db, { inviteePrivyId: 'guest', inviteeWallet: 'g', capsuleId: CAPSULE });
    expect(reward).toMatchObject({ edition: null });
    expect(state.rewards).toHaveLength(1);
  });
});
