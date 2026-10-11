# Capsules: verifiable randomness with a public audit log

What a capsule contains is decided by randomness that anyone can check after
the capsule is opened, and every capsule's life is written to a public log.
The log is append-only in the database — a trigger refuses every UPDATE,
DELETE and TRUNCATE — but the operator controls that database and could drop
the trigger, so the log is tamper-evident only to someone who kept an earlier
copy of it. This is **not** trustless and it does **not** make manipulation
impossible. What it does is make the forms of manipulation listed below either
impossible or visible.

Code: `src/lib/skychaser/randomness.ts` (pure), `src/lib/skychaser/capsule.ts`
(database), `src/lib/skychaser/audit.ts` (pure log audit). Public endpoints:
`GET /api/skychaser/capsules/log` (entries a page at a time; `?after=<seq>` is the
cursor, `next` the following one; `?audit=1` adds the audit of the whole log),
`GET /api/skychaser/capsules/verify?capsuleId=…` (one capsule, with every input)
and `GET /api/skychaser/cards/supply?set=SET001` (every card's edition size and
how many editions exist, and the draws owed to unopened capsules).

## The construction, in order

1. **Listing.** The server draws a 32-byte `secret` (`crypto.randomBytes`) and
   publishes `commitment = SHA-256(secret)` in the log (`event = 'listed'`),
   with the capsule's listing number. The capsule does not exist for sale
   before this row exists. The secret is stored sealed (AES-256-GCM under
   `CAPSULE_SEAL_KEY`, capsule id as associated data). The buy and open routes
   read the sealed secret on the server; no route returns it, and nothing logs
   it, until the capsule is opened, voided or released. A listing number is
   unique in the log as well as in the capsule table (a partial unique index
   on `'listed'` rows).
2. **Purchase.** The buyer picks a listed capsule and supplies a 32-byte
   `nonce` (64 lowercase hex characters, from their own random source). The
   server builds the purchase message

   ```
   Stellar capsule purchase
   capsule: <capsule id>
   sequence: <listing number>
   commitment: <commitment>
   holder: <wallet>
   nonce: <nonce>
   ```

   and logs `purchase_hash = SHA-256(message)` with the nonce, the wallet,
   the moment the payment window closes (`event = 'purchased'`,
   `outcome.expiresAt`, `ORDER_WINDOW_MINUTES` after purchase) and the
   order's Solana Pay reference (`outcome.reference`), in the same
   transaction as the capsule changing hands and the order being created. The
   buyer's response carries the message and hash. If the buyer sends a base58
   ed25519 signature of the message by the wallet, it is verified and stored;
   a bad one is refused. No quote is given without a live SOL price.
3. **Payment, and the beacon.** The order is paid by a Solana transfer that
   names the logged reference. Its signature is the earliest finalized
   transfer naming the reference that brings what it paid up to the quote.
   That transfer lands in a block whose hash nobody — buyer, operator, or
   anyone holding `CAPSULE_SEAL_KEY` — can know before the block exists: the
   **beacon**.
4. **Outcome.**
   `seed = HMAC-SHA256(key = secret, message = nonce_bytes(32) ‖ ascii(capsule_id)(36) ‖ beacon_bytes(32))`,
   the beacon being the paying block's hash (base58-decoded). A capsule that
   moved no money — a rehearsal or a demo — has no beacon, and its seed is
   the same without the last 32 bytes.
   Draw `i` (0-based) reads `block_i = HMAC-SHA256(key = seed, message = uint32_be(i))`;
   bytes 0–5 are a big-endian 48-bit integer `r_tier`, bytes 6–11 `r_card`.
   `pick(r, n) = floor(r · n / 2^48)` in exact integer arithmetic.
   - Tier: the tiers that still have an edition, in the order common, rare,
     epic, legendary, weighted by `RARITY_ODDS_BPS` (integers summing to
     10,000). `x = pick(r_tier, W)` with `W` the sum of those weights; the tier
     is the first whose cumulative weight exceeds `x`.
   - Card: the tier's cards with an edition left, sorted by designation
     (byte order); card `pick(r_card, m)`.
   - An edition drawn earlier in the same capsule counts as gone for later draws.

   The capsule id is always the capsule row's own (lowercase) id, never the
   string a caller sent.
5. **Open.** Only the buyer, only once the order is paid. The beacon is read
   from chain (the transaction's slot, then that slot's finalized block hash);
   if the chain cannot say, the capsule is not opened until it can. The secret
   is revealed; the log gets `event = 'opened'` with
   `outcome = {secret, draws, oddsBps, supply, pulls, beacon}`, where
   `beacon = {signature, slot, blockhash}`. `supply` is every card
   of the set with its edition size and remaining editions at the moment the
   draws were made. Each draw takes exactly edition number
   `editionSize − remaining + 1`, plus one for every earlier draw of the same
   card in this capsule.
6. **Verify.** `verifyCapsule({commitment, secret, nonce, capsuleId, pulls, supply, draws, oddsBps, beacon})`
   checks `SHA-256(secret) = commitment`, that the draws above reproduce
   exactly the logged pulls, in order, and no others, and that each pull's
   edition number is the one the logged supply implies. The verify endpoint
   takes the commitment from the `'listed'` entry and the nonce from the
   `'purchased'` entry, not from the `'opened'` entry that repeats them.
   Entries logged before supply carried edition sizes are verified without
   the edition check, and the audit notes them. The beacon can be checked
   against the chain by anyone: the logged signature must be a finalized
   transaction in the logged slot that names the purchase's logged reference
   and pays the merchant, and the slot's block hash must be the logged one.
   The audit flags a capsule whose purchase logged a reference (paid on chain)
   but whose opening has no beacon (`beacon_missing`).

## Closing a capsule without opening it

Every close reveals the secret (so the outcome it would have had can be
computed), keeps the buyer's nonce, and settles the order in the same
transaction. A payment is never silently kept:

- **Voided** (admin/cron). For a bought capsule the chain is asked first: if
  the transfer has arrived, the order is marked paid and the void refused; if
  the chain cannot be asked, the void is refused. Inside the void, an order
  that turns paid at that very moment becomes `refund_due`, logged as
  `'refund_due'`. The audit flags every void after purchase.
- **Voided, sold out.** A paid capsule whose draws cannot be made because the
  set has too few editions left is voided with the supply and draws that
  could not be filled, and its order becomes `refund_due`, logged. The audit
  re-runs the draws against that supply and accepts the void only if they
  really cannot be made.
- **Released.** A capsule bought and left unpaid past its window is released
  by `GET /api/skychaser/capsules/release` (cron, `CRON_SECRET`; daily in
  `vercel.json`) or `POST` with a `capsuleId` (admin). The chain is asked
  first; a payment inside the window marks the order paid instead. The log
  gets `'released'`, not `'voided'`. The audit treats a release after the
  logged window with no on-time payment as expected (a note), and flags a
  release before the window closed or one where a `'refund_due'` entry shows
  the payment landed inside it.
- **Withdrawn unsold.** A capsule nobody bought whose sealed secret cannot be
  read (its seal key is gone) is voided with `secret: null`. No nonce ever
  existed, so no outcome was ever fixed; the audit notes it. Without a
  purchase, a void without its secret is a flag.

A payment found after its order's window (by the transaction's block time),
or for an order already cancelled, is recorded as `refund_due`; for a capsule
it is logged as `'refund_due'` with when it was paid.

## Supply is part of the outcome

The draws depend on which cards still have editions: a card with none left is
skipped and its share goes to the rest of its tier; a tier with none left
passes its share to the other tiers in proportion to their odds. So the same
secret and nonce give the same pulls **only against the same supply**. Until
any card sells out, supply changes nothing.

What makes the logged supply checkable:

- **Direct card sales are logged.** Each is a `'card_sold'` entry with the
  card, the edition number, the edition size and SHA-256 of the order id (the
  buyer holds the id; the wallet is not logged). The entry is written by the
  same statement that allocates the edition, so neither exists without the
  other.
- **The audit keeps an edition ledger.** Every edition the log hands out, by
  capsule pull or by sale, is collected per card. The same edition twice is
  flagged (`edition_duplicate`). A number below a card's highest logged one
  that no entry took is noted as `editions_outside_log` — an edition allocated
  by some other path, which in production should not exist.
- **Edition counts are public.** `/api/skychaser/cards/supply` gives each card's
  current edition count; any `remaining` a capsule logged must be at least the
  number still unallocated now.
- **Direct sales cannot take editions owed to capsules.** A card is sold on
  its own only if the set's unallocated editions, less every draw owed to
  capsules listed or bought and not yet opened, leave at least one — the same
  reservation listing uses. A capsule's draws can land on any card of the set,
  so the reservation is the set's, not a card's.

What is still not checkable is the order in which concurrent openings and
sales commit: the server decides which opening sees a card as sold out.

## Edition numbers under concurrency

neon-http has no interactive transactions; each opening is one `db.batch`
(one transaction). Every draw is
`INSERT INTO edition … SELECT <the number the logged supply implies> … HAVING MAX(edition_number) = that number − 1`
feeding a `capsule_pull` row whose `edition_id` and `capsule_id` are
sub-selects into NOT NULL columns. Two openings that pick the same number
collide on `edition_card_number_unique`; a card whose editions moved since the
supply was read makes the edition sub-select NULL. Either way the whole batch
rolls back, and the opening re-reads the supply and retries (bounded, with
jitter). No number is ever taken by a rolled-back batch, and editions are
never deleted, so numbers stay unique and gapless — and every logged pull's
number matches its logged supply. Listing numbers are allocated the same way.
The log's own `seq` is a `bigserial` and can skip after a rollback; the audit
relies on the listing sequence, never on `seq`.

## Demo capsules

`npm run skychaser:capsules` lists capsules with `demo = true` on the capsule row
(never offered for sale, refused by the buy route) and `outcome = {demo: true}`
on their `'listed'` entry, so the mark travels with any copy of the log. The
audit lists demo capsules in `demoCapsules` and labels their flags and notes.
Capsules from runs before the mark existed are labelled from the log alone:
their holders are not Solana addresses, which every real purchase requires.

## What is and is not guaranteed

| Threat | Status |
| --- | --- |
| Server grinds the secret after seeing the nonce | **Prevented.** The secret is fixed by a commitment logged before any purchase. A different secret fails `SHA-256(secret) = commitment`. |
| Someone holding `CAPSULE_SEAL_KEY` and the database (the operator, anyone with the deployment's environment, a stolen laptop) unseals a listed capsule's secret and buys it with a nonce ground offline for a good outcome | **Prevented.** The draws also depend on the paying block's hash, which does not exist until after the payment is sent, so no nonce chosen at purchase can fix the outcome. What remains is the withholding threat below: a paid capsule that is never opened stays visible. |
| Server grinds the secret at listing, against a predictable nonce | **Buyer's responsibility.** The secret is chosen before the nonce exists, so grinding only helps if the nonce is guessable. The client must draw the nonce from `crypto.getRandomValues`. |
| Buyer predicts the outcome | **Prevented.** The secret is unknown until the capsule is opened, after the nonce is fixed, and the beacon until the payment lands. |
| Block producer biases the beacon | **Out of scope.** The leader that produces the paying block could in principle choose among block contents; doing so for one capsule means withholding or reordering a block on a public chain, against an outcome it cannot compute without the secret. |
| Server substitutes the nonce after purchase | **Detectable.** The nonce is logged at purchase and bound into `purchase_hash`; the buyer holds the message and hash as a receipt. With a wallet signature, anyone can check it. Without one (the beta default, since the purchase is authenticated by the Privy session and `assertOwnsWallet`), only the buyer's receipt contradicts a substitution — a third party cannot tell who is lying. |
| Server erases an unwanted outcome | **Detectable.** Listing numbers are gapless; a capsule removed from the log leaves a gap (`sequence_gap`), and its editions show as `editions_outside_log`. |
| Server withholds an unwanted outcome after purchase | **Detectable.** A purchased capsule never opened after its window (`purchased_not_opened`), voided (`voided_after_purchase`), or released while paid or early (`released_while_paid`, `released_early`) stays visible, with the secret revealed where it was closed. These are evidence to examine, not proof. |
| Server keeps a payment for a capsule it closed | **Recorded.** Voids and releases ask the chain first; a payment racing the close, or arriving after it or after the window, becomes `refund_due` in the same transaction and is logged. |
| Server refuses a purchase request after seeing its nonce | **Not detectable from the log.** Nothing is logged for a refused request. A refusal is only legitimate if the capsule was already taken, which the log shows; a buyer refused on a capsule the log still shows as listed holds evidence (their request) of a selective refusal. |
| Server influences which cards are sold out when an opening draws | **Partly.** Supply matters only once cards sell out. Every allocation the server makes through a sale or an opening is logged and matched against the logged supply; direct sales cannot take editions owed to capsules. The order in which concurrent openings and sales commit is still the server's. |
| Log rewritten in place | **Refused by the database** (trigger on UPDATE, DELETE, TRUNCATE; unique `(capsule_id, event)` and listing number), and no code path issues such a statement (test). The operator could drop the trigger: the log is tamper-evident only to someone who kept an earlier copy. Anchoring log hashes somewhere public is not built. |
| Sealed secrets read from a database dump | **Prevented without the key.** Losing `CAPSULE_SEAL_KEY` strands every unopened capsule: a bought one can then be neither opened nor released. |
