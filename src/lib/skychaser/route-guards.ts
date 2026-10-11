/**
 * The checks every Skychaser route makes before it does anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSessionWalletAddresses, verifyPrivy } from '@/lib/api-auth';
import { isValidPublicKey } from '@/lib/validate';
import { checkRateLimit } from '@/lib/rate-limit';
import type { Db } from './attach';
import { paymentsLive } from './orders';
import { simulatedPayments } from './rehearsal';

/** A lowercase RFC 4122 UUID, exactly: what every capsule and order id is. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

type Limiter = { limit: (id: string) => Promise<{ success: boolean; remaining: number; reset: number }> };

/**
 * A 429 when the caller is over the limit, a 503 when the limiter cannot be
 * reached; null to proceed. A deployment with no Redis configured has no
 * limiter: outside production, or while production rehearses, it proceeds;
 * production taking real payments refuses rather than run unlimited.
 */
export async function limited(limiter: Limiter, id: string): Promise<NextResponse | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (process.env.VERCEL_ENV !== 'production' || simulatedPayments()) return null;
    console.error('[skychaser] refusing: no rate limiter configured in production');
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }
  try {
    const { success, reset } = await checkRateLimit(limiter, id);
    if (success) return null;
    const retry = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(retry) } });
  } catch {
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }
}

/**
 * A 503 when this deployment rehearses but its database takes real payments
 * (the go-live reset has run): a rehearsal build, a rolled-back one or a local
 * server must never sell from, or settle orders in, a live database.
 */
export async function rehearsalOnLiveDatabase(db: Db): Promise<NextResponse | null> {
  if (!simulatedPayments() || !(await paymentsLive(db))) return null;
  console.error('[skychaser] refusing: a rehearsal build is pointed at a database that takes real payments');
  return NextResponse.json({ error: 'Payments are not available right now' }, { status: 503 });
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/** The cron secret, or a Privy session holding one of ADMIN_WALLETS. */
export async function isSkychaserAdmin(req: NextRequest): Promise<boolean> {
  if (verifyCronSecret(req)) return true;
  const admins = new Set((process.env.ADMIN_WALLETS ?? '').split(',').map((w) => w.trim()).filter(Boolean));
  if (admins.size === 0) return false;
  const privyId = await verifyPrivy(req);
  if (!privyId) return false;
  return (await getSessionWalletAddresses(privyId)).some((w) => admins.has(w));
}

/**
 * The holder's Solana wallet, as Privy lists it for this session — never one
 * the page merely names. The page's choice is used when it is linked; any
 * other linked Solana wallet otherwise. Null when the session has none.
 */
export async function holderWallet(privyId: string, named?: unknown): Promise<string | null> {
  const linked = (await getSessionWalletAddresses(privyId)).filter((a) => isValidPublicKey(a));
  if (typeof named === 'string' && linked.includes(named)) return named;
  return linked[0] ?? null;
}

export const NO_LINKED_WALLET = 'This account has no Solana wallet linked to it yet. Sign out, then sign in again to create one.';
