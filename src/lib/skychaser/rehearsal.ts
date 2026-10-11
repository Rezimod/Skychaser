/**
 * Whether this deployment is rehearsing rather than selling.
 *
 * With it on, no Solana transfer is looked for and no money moves: an order is
 * treated as paid the moment its buyer asks, and the signature recorded says
 * so. It is a deployment setting, never a request parameter, and every page
 * that sells says "rehearsal" while it is on. Production rehearses only until
 * launch: removing NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT there is the switch
 * to real payments, and the go-live reset clears what the rehearsal sold.
 *
 * Safe to import from the browser: it reads only a build-time public variable.
 */
export function simulatedPayments(): boolean {
  return process.env.NEXT_PUBLIC_STELLAR_SIMULATED_PAYMENT === '1';
}
