/**
 * The buyer's check of a capsule purchase receipt, in the browser. Safe to
 * import client-side: Web Crypto only.
 */

export type Receipt = { nonce: string; purchaseHash: string; purchaseMessage: string };

/**
 * Whether the receipt the server sent is for this purchase: its message names
 * this capsule, this commitment and the nonce the buyer drew, and its hash is
 * SHA-256 of that message. Checked before anything is paid, so a nonce
 * swapped on the way is caught while it still costs nothing.
 */
export async function receiptHolds(r: Receipt, capsuleId: string, commitment: string): Promise<boolean> {
  const lines = r.purchaseMessage.split('\n');
  if (!lines.includes(`capsule: ${capsuleId}`) || !lines.includes(`commitment: ${commitment}`) || !lines.includes(`nonce: ${r.nonce}`)) {
    return false;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.purchaseMessage));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex === r.purchaseHash;
}
