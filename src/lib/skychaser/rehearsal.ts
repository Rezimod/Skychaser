/**
 * Whether this deployment settles orders without a transfer.
 *
 * With it on, no Solana transfer is looked for and no money moves: an order is
 * treated as paid when its buyer presses Pay, and the signature recorded says
 * so. It is a deployment setting, never a request parameter. The pages that
 * sell look exactly as they do when selling for real (the owner's decision of
 * 2026-10-12, for filming): only the signature in the database tells. The
 * database refuses such a build while app_flag payments_live is '1'
 * (scripts/skychaser-payments-live.ts switches it); removing
 * NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT from the build is the switch back to
 * real payments.
 *
 * Safe to import from the browser: it reads only a build-time public variable.
 */
export function simulatedPayments(): boolean {
  return process.env.NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT === '1';
}
