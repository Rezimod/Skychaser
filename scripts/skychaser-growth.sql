-- The growth loop (2026-10-22): who each account is, invitations and what they brought.
-- Four new tables, and the capsule log taught one new entry ('card_granted', at the end);
-- no existing row changes. Apply to the card database (Neon endpoint ep-soft-thunder) with
-- the owner's approval. Until it is applied, /api/skychaser/hello and /api/skychaser/invite
-- answer 503 and no welcome card is given.

-- One row per signed-in account: the wallet Privy lists for it, its email, the invitation
-- that brought it and the welcome edition it received. `welcome_claimed_at` is set while
-- the welcome edition is being allocated, so two sign-ins at once get one card.
CREATE TABLE IF NOT EXISTS holder_contact (
  privy_id text PRIMARY KEY,
  wallet text,
  email text,
  notify boolean NOT NULL DEFAULT true,
  invited_by text,
  invited_at timestamptz,
  welcome_claimed_at timestamptz,
  welcome_edition_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS holder_contact_wallet_idx ON holder_contact (wallet);
CREATE INDEX IF NOT EXISTS holder_contact_invited_idx ON holder_contact (invited_by);
CREATE UNIQUE INDEX IF NOT EXISTS holder_contact_welcome_unique ON holder_contact (welcome_edition_id) WHERE welcome_edition_id IS NOT NULL;

-- A holder's invitation link: one code per account, made on first request.
CREATE TABLE IF NOT EXISTS invite_code (
  code text PRIMARY KEY,
  privy_id text NOT NULL UNIQUE,
  wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- What an invitation brought: the invited account's first opened capsule, and the edition
-- its inviter received for it. One per invited account; `edition_id` is null when no card
-- was left to give or the inviter had reached the cap.
CREATE TABLE IF NOT EXISTS referral_reward (
  invitee_privy_id text PRIMARY KEY,
  code text NOT NULL,
  referrer_privy_id text NOT NULL,
  referrer_wallet text NOT NULL,
  capsule_id uuid,
  edition_id uuid,
  rewarded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_reward_referrer_idx ON referral_reward (referrer_privy_id);

-- Word to holders: each notice (the week's card chosen, a card photographed, a card for an
-- invitation) is recorded here per account before it is sent, so a cron run twice sends once.
CREATE TABLE IF NOT EXISTS holder_notice (
  privy_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('week_chosen', 'photographed', 'referral_card')),
  key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (privy_id, kind, key)
);

-- Welcome and invitation cards are allocated as sales are (behind the set's lock, never from
-- editions owed to capsules) and logged publicly as 'card_granted' entries, which, like
-- 'card_sold', belong to no capsule. The grant hash names the account it was for, hashed;
-- one grant of a kind per account. Existing rows all satisfy the widened check.
ALTER TABLE capsule_log DROP CONSTRAINT IF EXISTS capsule_log_capsule_fields;
ALTER TABLE capsule_log ADD CONSTRAINT capsule_log_capsule_fields CHECK (
  event IN ('card_sold', 'card_granted') OR (capsule_id IS NOT NULL AND capsule_sequence IS NOT NULL AND commitment IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS capsule_log_card_granted_unique
  ON capsule_log ((outcome->>'grantHash')) WHERE event = 'card_granted';
