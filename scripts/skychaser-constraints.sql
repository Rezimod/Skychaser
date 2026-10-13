-- Payment audits 2026-10-06 and 2026-10-11: what the order and capsule logic assumes, enforced.
-- Additive only. Apply to the card database (Neon endpoint ep-soft-thunder) with the owner's approval,
-- before the go-live reset.
-- Checked 2026-10-11: existing rows satisfy every constraint (statuses pending/paid, states listed/opened,
-- no duplicate signatures).
CREATE UNIQUE INDEX IF NOT EXISTS orders_signature_unique ON orders (signature) WHERE signature IS NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'cancelled', 'refund_due', 'refunded'));
ALTER TABLE capsule ADD CONSTRAINT capsule_state_check CHECK (state IN ('listed', 'purchased', 'opened', 'void', 'released'));

-- The transaction that paid a refund back (scripts/skychaser-refunds.ts --refunded).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_signature text;

-- Database-wide switches ('paused', scripts/skychaser-pause.ts).
CREATE TABLE IF NOT EXISTS app_flag (
  name text PRIMARY KEY,
  value text NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);
