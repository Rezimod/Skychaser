import { pgTable, uuid, text, integer, timestamp, doublePrecision, boolean, uniqueIndex, index, date, jsonb } from 'drizzle-orm/pg-core'

// Run in Neon SQL editor if migrating an existing DB:
//   ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar text;
//   CREATE TABLE IF NOT EXISTS feed_follows (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     follower_wallet text NOT NULL,
//     followed_wallet text NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE UNIQUE INDEX IF NOT EXISTS feed_follows_pair_unique
//     ON feed_follows (follower_wallet, followed_wallet);
//   CREATE INDEX IF NOT EXISTS feed_follows_follower_idx
//     ON feed_follows (follower_wallet);
//   CREATE INDEX IF NOT EXISTS feed_follows_followed_idx
//     ON feed_follows (followed_wallet);
//
// §4 (burn Stars for marketplace discount) — required SQL:
//   ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS burn_stars integer NOT NULL DEFAULT 0;
//   ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS burn_signature text;
//   ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gel_discount double precision NOT NULL DEFAULT 0;
//   CREATE TABLE IF NOT EXISTS stars_burns (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     order_id uuid,
//     redeem_code_id uuid,
//     wallet_address text NOT NULL,
//     amount integer NOT NULL,
//     kind text NOT NULL,
//     signature text NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   -- Idempotency: one discount-burn per order, one shop-purchase-burn per order.
//   CREATE UNIQUE INDEX IF NOT EXISTS stars_burns_order_kind_unique
//     ON stars_burns (order_id, kind) WHERE order_id IS NOT NULL;
//   CREATE INDEX IF NOT EXISTS stars_burns_wallet_idx
//     ON stars_burns (wallet_address);
//
// §5 (redeem-at-Astroman codes) — required SQL:
//   CREATE TABLE IF NOT EXISTS redeem_codes (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     code text NOT NULL UNIQUE,
//     stars_burned integer NOT NULL,
//     gel_value double precision NOT NULL,
//     wallet_address text NOT NULL,
//     burn_signature text,
//     status text NOT NULL DEFAULT 'active',
//     created_at timestamptz NOT NULL DEFAULT now(),
//     expires_at timestamptz NOT NULL,
//     spent_at timestamptz,
//     spent_by text
//   );
//   CREATE INDEX IF NOT EXISTS redeem_codes_wallet_idx
//     ON redeem_codes (wallet_address);
//   CREATE INDEX IF NOT EXISTS redeem_codes_status_idx
//     ON redeem_codes (status);
//
// "Up Now?" daily game — required SQL:
//   CREATE TABLE IF NOT EXISTS game_daily_plays (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     wallet text NOT NULL,
//     game text NOT NULL,
//     utc_date date NOT NULL,
//     score integer NOT NULL,
//     stars integer NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE UNIQUE INDEX IF NOT EXISTS game_daily_plays_wallet_game_date_unique
//     ON game_daily_plays (wallet, game, utc_date);
//   CREATE INDEX IF NOT EXISTS game_daily_plays_wallet_game_idx
//     ON game_daily_plays (wallet, game);
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id').unique().notNull(),
  email: text('email'),
  walletAddress: text('wallet_address'),
  username: text('username'),
  avatar: text('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('users_wallet_idx').on(table.walletAddress),
  index('users_email_idx').on(table.email),
])

export const telescopes = pgTable('telescopes', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id').unique().notNull(),
  walletAddress: text('wallet_address'),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  aperture: text('aperture').notNull(),
  type: text('type'),
  starsAwarded: boolean('stars_awarded').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('telescopes_wallet_idx').on(table.walletAddress),
])

export const observationLog = pgTable('observation_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  wallet: text('wallet').notNull(),
  target: text('target').notNull(),
  stars: integer('stars').notNull().default(0),
  confidence: text('confidence').notNull(),
  mintTx: text('mint_tx'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  identifiedObject: text('identified_object'),
  starsAwarded: integer('stars_awarded'),
  oracleHash: text('oracle_hash'),
  observedDate: date('observed_date'),
  fileHash: text('file_hash'),
  uploadSource: text('upload_source'),
  deviceTier: text('device_tier'),
  deviceMake: text('device_make'),
  deviceModel: text('device_model'),
  exifLat: doublePrecision('exif_lat'),
  exifLon: doublePrecision('exif_lon'),
  exifTakenAt: timestamp('exif_taken_at', { withTimezone: true }),
  isInternetSourced: boolean('is_internet_sourced').default(false),
  verificationNotes: jsonb('verification_notes'),
  // Proof-of-Observation registry: on-chain attestation tx + Observation PDA.
  chainTx: text('chain_tx'),
  chainPda: text('chain_pda'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('observation_log_wallet_mint_tx_unique').on(table.wallet, table.mintTx),
  uniqueIndex('obs_daily_unique').on(table.wallet, table.target, table.observedDate),
  index('obs_log_created_at_idx').on(table.createdAt),
  index('obs_log_target_idx').on(table.target),
  index('obs_log_file_hash_idx').on(table.fileHash),
])

// The observer's own photo, downscaled at capture time and keyed by the same
// sha256 the verification token signs. Serving it from /api/observe/photo lets
// every mint — verified or keepsake — carry the real image instead of generated
// art, and keeps the picture when the device's localStorage is cleared.
export const observationPhoto = pgTable('observation_photo', {
  fileHash: text('file_hash').primaryKey(),
  wallet: text('wallet'),
  mimeType: text('mime_type').notNull(),
  imageBase64: text('image_base64').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const emailSubscribers = pgTable('email_subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id').notNull(),
  walletAddress: text('wallet_address').notNull(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  productImage: text('product_image'),
  dealerId: text('dealer_id').notNull(),
  paymentMethod: text('payment_method').notNull().default('sol'),
  amountSol: doublePrecision('amount_sol').notNull().default(0),
  amountStars: integer('amount_stars').notNull().default(0),
  amountFiat: doublePrecision('amount_fiat').notNull(),
  currency: text('currency').notNull(),
  // §4: optional Stars-for-discount burn applied at order creation; the
  // actual SPL burn is signed at /api/orders/confirm and recorded in
  // stars_burns. burn_stars and gel_discount are 0 for orders without burn.
  burnStars: integer('burn_stars').notNull().default(0),
  burnSignature: text('burn_signature'),
  gelDiscount: doublePrecision('gel_discount').notNull().default(0),
  paymentReference: text('payment_reference').notNull(),
  signature: text('signature'),
  status: text('status').notNull().default('pending'),
  shippingName: text('shipping_name').notNull(),
  shippingPhone: text('shipping_phone').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  shippingCity: text('shipping_city').notNull(),
  shippingCountry: text('shipping_country').notNull(),
  shippingNotes: text('shipping_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('orders_payment_reference_unique').on(table.paymentReference),
  index('orders_wallet_idx').on(table.walletAddress),
  index('orders_privy_idx').on(table.privyId),
  index('orders_created_at_idx').on(table.createdAt),
])

// §4: server-side log of every SPL Stars burn — discount on a marketplace
// order (kind='discount-burn'), in-app Star Shop purchase
// (kind='shop-purchase'), or one-time Astroman till redemption
// (kind='redeem-code'). The unique (order_id, kind) index prevents
// double-burning when /api/orders/confirm is retried.
export const starsBurns = pgTable('stars_burns', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id'),
  redeemCodeId: uuid('redeem_code_id'),
  walletAddress: text('wallet_address').notNull(),
  amount: integer('amount').notNull(),
  kind: text('kind').notNull(),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('stars_burns_order_kind_unique').on(t.orderId, t.kind),
  index('stars_burns_wallet_idx').on(t.walletAddress),
])

// §5: one-time codes the user generates by burning Stars; redeemed by the
// Astroman cashier via /api/redeem-code/validate. 7-day expiry; status
// transitions are 'active' → 'spent' (validate) or 'active' → 'expired'
// (computed lazily on read).
export const redeemCodes = pgTable('redeem_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  starsBurned: integer('stars_burned').notNull(),
  gelValue: doublePrecision('gel_value').notNull(),
  walletAddress: text('wallet_address').notNull(),
  burnSignature: text('burn_signature'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  spentAt: timestamp('spent_at', { withTimezone: true }),
  spentBy: text('spent_by'),
}, (t) => [
  index('redeem_codes_wallet_idx').on(t.walletAddress),
  index('redeem_codes_status_idx').on(t.status),
])

export const feedPosts = pgTable('feed_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  authorWallet: text('author_wallet').notNull(),
  authorName: text('author_name'),
  authorRank: text('author_rank'),
  type: text('type').notNull(),
  body: text('body'),
  imageUrl: text('image_url'),
  achievementTarget: text('achievement_target'),
  achievementDifficulty: text('achievement_difficulty'),
  achievementStars: integer('achievement_stars'),
  achievementMintTx: text('achievement_mint_tx'),
  observationTarget: text('observation_target'),
  observationLat: text('observation_lat'),
  observationLon: text('observation_lon'),
  observationBortle: integer('observation_bortle'),
  observationNftAddress: text('observation_nft_address'),
  reactionCount: integer('reaction_count').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),
  shareCount: integer('share_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('feed_posts_created_at_idx').on(t.createdAt),
  index('feed_posts_author_idx').on(t.authorWallet),
])

export const feedReactions = pgTable('feed_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull(),
  wallet: text('wallet').notNull(),
  reaction: text('reaction').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('feed_reactions_post_idx').on(t.postId),
  uniqueIndex('feed_reactions_unique_user_post').on(t.postId, t.wallet),
])

export const feedComments = pgTable('feed_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull(),
  authorWallet: text('author_wallet').notNull(),
  authorName: text('author_name'),
  body: text('body').notNull(),
  reactionCount: integer('reaction_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('feed_comments_post_idx').on(t.postId),
])

export const feedShares = pgTable('feed_shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull(),
  wallet: text('wallet').notNull(),
  destination: text('destination').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const feedFollows = pgTable('feed_follows', {
  id: uuid('id').defaultRandom().primaryKey(),
  followerWallet: text('follower_wallet').notNull(),
  followedWallet: text('followed_wallet').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('feed_follows_pair_unique').on(t.followerWallet, t.followedWallet),
  index('feed_follows_follower_idx').on(t.followerWallet),
  index('feed_follows_followed_idx').on(t.followedWallet),
])

export const tweetDrafts = pgTable('tweet_drafts', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: text('kind').notNull(),
  body: text('body').notNull(),
  context: jsonb('context'),
  imageBase64: text('image_base64'),
  status: text('status').notNull().default('pending'),
  postedTweetId: text('posted_tweet_id'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('tweet_drafts_status_idx').on(t.status),
  index('tweet_drafts_created_idx').on(t.createdAt),
])

// Product analytics — the core loop is unmeasurable without it. One row per
// tracked event; `props` holds event-specific detail. `wallet` is set when the
// user is authenticated, `anonId` is a stable client id for pre-auth sessions.
export const analyticsEvent = pgTable('analytics_event', {
  id: uuid('id').defaultRandom().primaryKey(),
  event: text('event').notNull(),
  wallet: text('wallet'),
  anonId: text('anon_id'),
  path: text('path'),
  props: jsonb('props'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('analytics_event_event_idx').on(t.event),
  index('analytics_event_created_idx').on(t.createdAt),
  index('analytics_event_wallet_idx').on(t.wallet),
])

// Acquisition attribution — one write-once row per wallet, set on the first
// authenticated session. Keyed on `wallet` (the stable identity: Privy embedded
// wallets persist, external connect yields the same column). UTM + referrer +
// landing path answer "which campaign brought this user", which is the anchor
// for cohort retention. First write wins (on conflict do nothing); a returning
// user's acquisition channel is never overwritten by a later visit.
export const userCohorts = pgTable('user_cohorts', {
  wallet: text('wallet').primaryKey(),
  privyUserId: text('privy_user_id').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  referrer: text('referrer'),
  landingPath: text('landing_path'),
  country: text('country'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('user_cohorts_campaign_idx').on(t.utmSource, t.utmCampaign),
])

// "Up Now?" daily game (§ up-now.ts). One row per wallet+game+day; the unique
// index is what enforces once-per-UTC-day — the route relies on it rather
// than a racy SELECT-then-INSERT.
export const gameDailyPlays = pgTable('game_daily_plays', {
  id: uuid('id').defaultRandom().primaryKey(),
  wallet: text('wallet').notNull(),
  game: text('game').notNull(),
  utcDate: date('utc_date').notNull(),
  score: integer('score').notNull(),
  stars: integer('stars').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('game_daily_plays_wallet_game_date_unique').on(t.wallet, t.game, t.utcDate),
  index('game_daily_plays_wallet_game_idx').on(t.wallet, t.game),
])

// Web Push subscriptions. One row per browser/device endpoint. `lat`/`lon`
// drive the clear-sky trigger; `lastNotifiedDate` (YYYY-MM-DD) dedupes so a
// device gets at most one push per day.
export const pushSubscription = pgTable('push_subscription', {
  id: uuid('id').defaultRandom().primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  wallet: text('wallet'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  city: text('city'),
  prefs: jsonb('prefs'),
  lastNotifiedDate: text('last_notified_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('push_sub_wallet_idx').on(t.wallet),
])

// Observatory bookings. One row per reserved slot; the slot id is derived from
// the node and the start time (`nodeId:2026-09-04T18:30Z`), so the unique index
// on it is what stops two people holding the same twenty minutes. No money
// moves yet — a row here is a dry-run reservation, and cancelling deletes it.
//
//   CREATE TABLE IF NOT EXISTS observatory_reservation (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     slot_id text NOT NULL UNIQUE,
//     node_id text NOT NULL,
//     privy_id text NOT NULL,
//     starts_at timestamptz NOT NULL,
//     ends_at timestamptz NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE INDEX IF NOT EXISTS observatory_reservation_node_idx
//     ON observatory_reservation (node_id, starts_at);
//   CREATE INDEX IF NOT EXISTS observatory_reservation_privy_idx
//     ON observatory_reservation (privy_id, starts_at);
export const observatoryReservation = pgTable('observatory_reservation', {
  id: uuid('id').defaultRandom().primaryKey(),
  slotId: text('slot_id').notNull().unique(),
  nodeId: text('node_id').notNull(),
  privyId: text('privy_id').notNull(),
  /**
   * Why this slot is held. A live booking is driven by the customer; a request
   * is worked by the instrument while they sleep, and must not appear as a
   * session anyone can steer.
   *
   *   ALTER TABLE observatory_reservation
   *     ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'live',
   *     ADD COLUMN IF NOT EXISTS fee_tetri integer NOT NULL DEFAULT 0;
   */
  source: text('source').notNull().default('live'),
  /**
   * What was agreed when the slot was taken. Settlement reads this rather than
   * the node's current price: re-deriving it would pay an old session at a new
   * rate, which is the same mistake as asking a node for provenance after the
   * fact.
   */
  feeTetri: integer('fee_tetri').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('observatory_reservation_node_idx').on(t.nodeId, t.startsAt),
  index('observatory_reservation_privy_idx').on(t.privyId, t.startsAt),
])

// What a session actually produced. `provenance` rides from the adapter to
// this row and decides everything downstream: a 'simulated' capture stays in
// the session log, and only an 'instrument' one may become an observation —
// `observation_log_id` is where that link lands. See lib/observatory/provenance.
//
//   CREATE TABLE IF NOT EXISTS observatory_capture (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     session_id uuid NOT NULL,
//     node_id text NOT NULL,
//     privy_id text NOT NULL,
//     target_id text NOT NULL,
//     target_name text NOT NULL,
//     provenance text NOT NULL,
//     exposure_sec double precision NOT NULL,
//     subs integer NOT NULL,
//     captured_at timestamptz NOT NULL,
//     observation_log_id uuid,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE INDEX IF NOT EXISTS observatory_capture_session_idx
//     ON observatory_capture (session_id, captured_at);
//   CREATE INDEX IF NOT EXISTS observatory_capture_privy_idx
//     ON observatory_capture (privy_id, captured_at);
export const observatoryCapture = pgTable('observatory_capture', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull(),
  nodeId: text('node_id').notNull(),
  privyId: text('privy_id').notNull(),
  targetId: text('target_id').notNull(),
  targetName: text('target_name').notNull(),
  provenance: text('provenance').notNull(),
  exposureSec: doublePrecision('exposure_sec').notNull(),
  subs: integer('subs').notNull(),
  /**
   * How the light path was configured. Without these the gallery redraws a
   * planetary capture at native focal length across the whole sensor, and
   * Saturn — which the imager saw through a Barlow on a 400 px crop — comes
   * back as a dot. A record of a capture has to include what it was taken
   * through.
   *
   *   ALTER TABLE observatory_capture
   *     ADD COLUMN IF NOT EXISTS optical_train text NOT NULL DEFAULT 'native',
   *     ADD COLUMN IF NOT EXISTS roi text NOT NULL DEFAULT 'full';
   */
  opticalTrain: text('optical_train').notNull().default('native'),
  roi: text('roi').notNull().default('full'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  /** Set only when the capture was admitted to the Collection. */
  observationLogId: uuid('observation_log_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('observatory_capture_session_idx').on(t.sessionId, t.capturedAt),
  index('observatory_capture_privy_idx').on(t.privyId, t.capturedAt),
])

// The payout ledger. One row per session, append-only and idempotent by
// session_id — a settlement sweep that runs twice must not pay twice, and the
// unique index is what guarantees that rather than a careful caller.
// `payable` is false for a session the simulator ran: the arithmetic is real,
// the obligation is not. See lib/observatory/settlement.
//
//   CREATE TABLE IF NOT EXISTS observatory_settlement (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     session_id uuid NOT NULL UNIQUE,
//     node_id text NOT NULL,
//     privy_id text NOT NULL,
//     state text NOT NULL,
//     fee_tetri integer NOT NULL,
//     operator_tetri integer NOT NULL,
//     platform_tetri integer NOT NULL,
//     refund_tetri integer NOT NULL,
//     payable boolean NOT NULL DEFAULT false,
//     tier_id text,
//     hours_delivered double precision NOT NULL DEFAULT 0,
//     reason text,
//     settled_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE INDEX IF NOT EXISTS observatory_settlement_node_idx
//     ON observatory_settlement (node_id, settled_at);
export const observatorySettlement = pgTable('observatory_settlement', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().unique(),
  nodeId: text('node_id').notNull(),
  privyId: text('privy_id').notNull(),
  state: text('state').notNull(),
  feeTetri: integer('fee_tetri').notNull(),
  operatorTetri: integer('operator_tetri').notNull(),
  platformTetri: integer('platform_tetri').notNull(),
  refundTetri: integer('refund_tetri').notNull(),
  payable: boolean('payable').notNull().default(false),
  tierId: text('tier_id'),
  /** The operator's delivered hours when this session settled — why they got this share. */
  hoursDelivered: doublePrecision('hours_delivered').notNull().default(0),
  reason: text('reason'),
  settledAt: timestamp('settled_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('observatory_settlement_node_idx').on(t.nodeId, t.settledAt),
])

// Telescope owners who want to put their instrument on the network. The gear
// details are the point: §3 of the network design says the supply side is
// addressable by name because Astroman has 45,000 buyers with brand and model
// on file, and this is where that record starts for everyone else.
//
//   CREATE TABLE IF NOT EXISTS observatory_operator_interest (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     privy_id text,
//     email text NOT NULL UNIQUE,
//     city text NOT NULL,
//     telescope text NOT NULL,
//     mount text,
//     camera text,
//     note text,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
export const observatoryOperatorInterest = pgTable('observatory_operator_interest', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id'),
  /** Lower-cased before it is written, so the unique index means one owner. */
  email: text('email').notNull().unique(),
  city: text('city').notNull(),
  telescope: text('telescope').notNull(),
  mount: text('mount'),
  camera: text('camera'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// A photograph asked for rather than driven. The window is the whole point: a
// customer who does not need to be awake can be served on whichever night the
// sky opens, which is what lets a node work at three in the morning.
// docs/stellar-v2-plan.md §5.2.
//
//   CREATE TABLE IF NOT EXISTS observatory_capture_request (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     privy_id text NOT NULL,
//     node_id text NOT NULL,
//     target_id text NOT NULL,
//     target_name text NOT NULL,
//     window_start timestamptz NOT NULL,
//     window_end timestamptz NOT NULL,
//     price_tetri integer NOT NULL,
//     state text NOT NULL DEFAULT 'queued',
//     slot_id text,
//     reservation_id uuid,
//     capture_id uuid,
//     created_at timestamptz NOT NULL DEFAULT now(),
//     scheduled_at timestamptz,
//     closed_at timestamptz
//   );
//   CREATE INDEX IF NOT EXISTS observatory_capture_request_privy_idx
//     ON observatory_capture_request (privy_id, created_at DESC);
//   CREATE INDEX IF NOT EXISTS observatory_capture_request_queue_idx
//     ON observatory_capture_request (state, window_end);
export const observatoryCaptureRequest = pgTable('observatory_capture_request', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id').notNull(),
  nodeId: text('node_id').notNull(),
  targetId: text('target_id').notNull(),
  targetName: text('target_name').notNull(),
  /** The span the customer agreed to wait. Nothing is promised inside one night. */
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  /** Priced by target class when the request was placed, and never re-derived. */
  priceTetri: integer('price_tetri').notNull(),
  state: text('state').notNull().default('queued'),
  slotId: text('slot_id'),
  reservationId: uuid('reservation_id'),
  captureId: uuid('capture_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [
  index('observatory_capture_request_privy_idx').on(t.privyId, t.createdAt),
  index('observatory_capture_request_queue_idx').on(t.state, t.windowEnd),
])

// A First Light order: the sky on somebody's night, and a photograph of one
// object in it. Two dates, both true — see docs/stellar-v2-plan.md §5.3.
// Fulfilment (print, frame, post) is handled outside this table; what is
// recorded here is what was ordered and what it is waiting on.
//
//   CREATE TABLE IF NOT EXISTS first_light_order (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     privy_id text NOT NULL,
//     recipient text NOT NULL,
//     occasion text,
//     place_id text NOT NULL,
//     moment timestamptz NOT NULL,
//     target_id text NOT NULL,
//     target_name text NOT NULL,
//     tier text NOT NULL,
//     commissioned boolean NOT NULL DEFAULT false,
//     price_tetri integer NOT NULL,
//     state text NOT NULL DEFAULT 'placed',
//     capture_request_id uuid,
//     capture_id uuid,
//     created_at timestamptz NOT NULL DEFAULT now(),
//     fulfilled_at timestamptz
//   );
//   CREATE INDEX IF NOT EXISTS first_light_order_privy_idx
//     ON first_light_order (privy_id, created_at DESC);
export const firstLightOrder = pgTable('first_light_order', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id').notNull(),
  /** Whose night it was. Printed on the poster. */
  recipient: text('recipient').notNull(),
  /** "seven years old", "your first night" — free text, printed as given. */
  occasion: text('occasion'),
  placeId: text('place_id').notNull(),
  /** The exact instant the sky is computed for. This half is never wrong. */
  moment: timestamp('moment', { withTimezone: true }).notNull(),
  targetId: text('target_id').notNull(),
  targetName: text('target_name').notNull(),
  tier: text('tier').notNull(),
  /** True when the photograph is being taken for this order rather than reused. */
  commissioned: boolean('commissioned').notNull().default(false),
  priceTetri: integer('price_tetri').notNull(),
  state: text('state').notNull().default('placed'),
  /** The queue entry a commissioned order created, if any. */
  captureRequestId: uuid('capture_request_id'),
  /** The frame that ended up on the poster. */
  captureId: uuid('capture_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
}, (t) => [
  index('first_light_order_privy_idx').on(t.privyId, t.createdAt),
])

// Player base building on the Moon and Mars (Explore). A piece is private
// (only its owner sees it) or part of the one shared colony per world. The
// table is created by scripts/sql/base-pieces.sql (applied by hand, never by
// drizzle-kit push). `yaw` is always a whole quarter turn, in radians.
export const basePieces = pgTable('base_pieces', {
  id: uuid('id').defaultRandom().primaryKey(),
  world: text('world').notNull(),
  scope: text('scope').notNull(),
  ownerPrivyId: text('owner_privy_id').notNull(),
  module: text('module').notNull(),
  x: doublePrecision('x').notNull(),
  z: doublePrecision('z').notNull(),
  yaw: doublePrecision('yaw').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('base_pieces_world_scope_idx').on(t.world, t.scope),
  index('base_pieces_owner_idx').on(t.ownerPrivyId),
])

// Explore gems: each gem a signed-in player has picked up, once per account
// (gem ids come from src/lib/solar-system/gem-layout.ts; `points` is the
// gem's value when it was stored). The leaderboard is the sum per account.
// Created on first use by ensureExploreGemsTable() in
// src/lib/games/explore-gems-store.ts, so no manual step is needed; the SQL,
// for reference:
//   CREATE TABLE IF NOT EXISTS explore_gems (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     privy_id text NOT NULL,
//     world text NOT NULL,
//     gem_id text NOT NULL,
//     points integer NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE UNIQUE INDEX IF NOT EXISTS explore_gems_owner_gem_unique
//     ON explore_gems (privy_id, world, gem_id);
//   CREATE INDEX IF NOT EXISTS explore_gems_owner_idx ON explore_gems (privy_id);
export const exploreGems = pgTable('explore_gems', {
  id: uuid('id').defaultRandom().primaryKey(),
  privyId: text('privy_id').notNull(),
  world: text('world').notNull(),
  gemId: text('gem_id').notNull(),
  points: integer('points').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('explore_gems_owner_gem_unique').on(t.privyId, t.world, t.gemId),
  index('explore_gems_owner_idx').on(t.privyId),
])
