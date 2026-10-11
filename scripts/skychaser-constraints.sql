-- Payment audit 2026-10-06, finding 9: what the order and capsule logic assumes, enforced.
-- Additive only. Apply to the card database (Neon endpoint ep-soft-thunder) with the owner's approval.
CREATE UNIQUE INDEX IF NOT EXISTS orders_signature_unique ON orders (signature) WHERE signature IS NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'cancelled', 'refund_due', 'refunded'));
ALTER TABLE capsule ADD CONSTRAINT capsule_state_check CHECK (state IN ('listed', 'purchased', 'opened', 'void', 'released'));
