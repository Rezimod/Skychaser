// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in environment variables.
// Get free Redis at upstash.com
import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Lazy initialization — avoids running Redis.fromEnv() at build/import time
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

function makeLimit(window: Duration, requests: number, prefix: string) {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix,
  });
}

export const chatRateLimit = { limit: (id: string) => makeLimit('60 s', 10, 'rl:chat').limit(id) };
export const verifyRateLimit = { limit: (id: string) => makeLimit('60 s', 5, 'rl:verify').limit(id) };
export const mintRateLimit = { limit: (id: string) => makeLimit('3600 s', 30, 'rl:mint').limit(id) };
export const awardStarsRateLimit = { limit: (id: string) => makeLimit('3600 s', 10, 'rl:award').limit(id) };
export const redeemRateLimit = { limit: (id: string) => makeLimit('3600 s', 5, 'rl:redeem').limit(id) };
// 60 req/min/IP — generous for legit users (page reload + a few region switches),
// blocks scrapers from blowing through the Open-Meteo quota.
export const skyForecastRateLimit = { limit: (id: string) => makeLimit('60 s', 60, 'rl:sky:f').limit(id) };
// 120 events/min/IP — analytics is high-frequency but this still caps abuse.
export const trackRateLimit = { limit: (id: string) => makeLimit('60 s', 120, 'rl:track').limit(id) };
// 20 push-subscription writes/hour/IP — a device subscribes once; this blocks
// spam rows from an unauthenticated caller.
export const pushSubscribeRateLimit = { limit: (id: string) => makeLimit('3600 s', 20, 'rl:push').limit(id) };
// Registering a telescope for the network writes one row per owner. 5/hour/IP
// is plenty for a real person filling in a form once.
export const operatorInterestRateLimit = { limit: (id: string) => makeLimit('3600 s', 5, 'rl:obs:interest').limit(id) };
// A capture request is cheap to place and is worked by a scheduler, so the
// limit is on queue spam rather than on a person changing their mind.
export const observatoryRequestRateLimit = { limit: (id: string) => makeLimit('3600 s', 20, 'rl:obs:req').limit(id) };
// Booking holds a slot on a real instrument's night. 10/hour/account is far
// more than anyone needs and stops a script from papering the timetable.
export const observatoryBookRateLimit = { limit: (id: string) => makeLimit('3600 s', 10, 'rl:obs:book').limit(id) };
export const observatoryCaptureRateLimit = { limit: (id: string) => makeLimit('60 s', 20, 'rl:obs:capture').limit(id) };
export const firstLightPosterRateLimit = { limit: (id: string) => makeLimit('60 s', 30, 'rl:first-light:poster').limit(id) };
// Club activation spends the server fee-payer's SOL on a memo tx each call —
// cap per wallet so it can't be looped to drain the hot wallet.
// A mailing-list signup is one row per person. 10/hour/IP stops a script from
// filling the table with addresses that never asked.
export const subscribeRateLimit = { limit: (id: string) => makeLimit('3600 s', 10, 'rl:subscribe').limit(id) };
// Placing a base piece in Explore writes one row. 30/min/account is a fast
// builder's pace and stops a script from carpeting the colony.
export const basePlaceRateLimit = { limit: (id: string) => makeLimit('60 s', 30, 'rl:base:place').limit(id) };
// Explore gem pickups: the game batches them, so 30 reports/min/account is
// far more than play needs and stops a script from hammering the table.
export const exploreGemsRateLimit = { limit: (id: string) => makeLimit('60 s', 30, 'rl:explore:gems').limit(id) };
// The gem leaderboard is read by every open panel; 60/min/IP covers reloads.
export const exploreGemsBoardRateLimit = { limit: (id: string) => makeLimit('60 s', 60, 'rl:explore:gems:board').limit(id) };
export const clubActivateRateLimit = { limit: (id: string) => makeLimit('3600 s', 5, 'rl:club').limit(id) };

// Daily ceilings (24h sliding) — bound the worst-case AI cost / token
// issuance per user even if the per-minute / per-hour limits are saturated.
// These are the numbers we cite in the pitch math:
//   chat:    50 msg/day/user → ~$0.08/user/day worst-case OpenAI bill
//   verify:  25 attempts/day → free-tier Gemini (gemini-2.5-flash); every
//            attempt still mints as a keepsake, so this also bounds the daily
//            keepsake mints per user (mirrors UNVERIFIED_MINTS_PER_DAY)
//   award:   30 grants/day  → bounds Stars issuance through this route
export const chatDailyLimit   = { limit: (id: string) => makeLimit('86400 s', 50, 'rl:chat:d').limit(id) };
export const verifyDailyLimit = { limit: (id: string) => makeLimit('86400 s', 25, 'rl:verify:d').limit(id) };
export const awardStarsDailyLimit = { limit: (id: string) => makeLimit('86400 s', 30, 'rl:award:d').limit(id) };

export async function checkRateLimit(
  limiter: { limit: (id: string) => Promise<{ success: boolean; remaining: number; reset: number }> },
  identifier: string
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}
