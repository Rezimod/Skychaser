-- Booking the Live Telescope with credits (2026-10-12). Additive only: four new tables, nothing
-- existing touched. Apply to the card database (Neon endpoint ep-soft-thunder) with the owner's
-- approval. Until it is applied the /book page renders with every slot open and no account can
-- book or buy credits (the routes answer 503).

-- One balance per account, never negative: a booking is one conditional UPDATE against it.
CREATE TABLE IF NOT EXISTS credit_account (
  privy_id text PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every movement of credits: a pack bought (once per order, the unique index refuses a second
-- grant for the same payment), a session booked, a cancellation refunded, a grant by hand.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id text NOT NULL,
  delta integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('purchase', 'booking', 'refund', 'grant')),
  order_id uuid,
  booking_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_order_unique ON credit_ledger (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_ledger_privy_idx ON credit_ledger (privy_id, created_at);

-- A session on the telescope. `edition_id` when an Epic card's session paid for it: each edition
-- redeems once while its booking stands.
CREATE TABLE IF NOT EXISTS telescope_booking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id text NOT NULL,
  wallet_address text NOT NULL,
  node_id text NOT NULL,
  night_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  minutes integer NOT NULL CHECK (minutes IN (30, 60)),
  target_id text,
  credits integer NOT NULL CHECK (credits >= 0),
  edition_id uuid,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS telescope_booking_privy_idx ON telescope_booking (privy_id, starts_at);
CREATE INDEX IF NOT EXISTS telescope_booking_night_idx ON telescope_booking (node_id, night_date);
CREATE UNIQUE INDEX IF NOT EXISTS telescope_booking_edition_unique ON telescope_booking (edition_id) WHERE edition_id IS NOT NULL AND status = 'booked';

-- The half-hours a booking occupies. The primary key is what makes two holders unable to take
-- the same half-hour: the second insert fails and its whole booking statement with it.
CREATE TABLE IF NOT EXISTS telescope_slot (
  node_id text NOT NULL,
  slot_at timestamptz NOT NULL,
  booking_id uuid NOT NULL REFERENCES telescope_booking (id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, slot_at)
);
