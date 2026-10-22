/**
 * Invitations. Two kinds of code open the closed beta: the owner's, from
 * STELLAR_INVITE_CODES, and a holder's, one per account (invite_code). The
 * middleware cannot read the database, so a holder's code travels with a
 * signature in a second cookie, made here with Web Crypto so the same code
 * runs on the edge and in Node. No codes in the environment means no gate;
 * holders' links still record who brought whom.
 */
export const INVITE_COOKIE = 'stellar_invite';
/** The signature over a holder's code, set beside it. */
export const INVITED_COOKIE = 'stellar_invited';
/** How long an invitation is kept on the device. */
export const INVITE_MAX_AGE = 60 * 60 * 24 * 365;

/** The owner's codes, if any. */
export function inviteCodes(): string[] {
  return (process.env.STELLAR_INVITE_CODES ?? '').split(',').map((c) => c.trim()).filter(Boolean);
}

/** A holder's code: eight characters from an alphabet without 0/O, 1/I. */
export const HOLDER_CODE = /^[A-HJ-NP-Z2-9]{8}$/;
export const isHolderCode = (code: unknown): code is string => typeof code === 'string' && HOLDER_CODE.test(code);

/** INVITE_SIGNING_KEY, or the capsule seal key; empty when neither is set, and then holder codes carry no signature. */
export function inviteSigningKey(): string {
  return (process.env.INVITE_SIGNING_KEY || process.env.CAPSULE_SEAL_KEY || '').trim();
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(key: string, text: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(`invite:${text}`))).slice(0, 40);
}

/** The signature a holder's code carries, or null when there is no key to sign with. */
export async function signInvite(code: string): Promise<string | null> {
  const key = inviteSigningKey();
  return key ? hmac(key, code) : null;
}

/** True when `signature` is what this deployment signs `code` with. */
export async function inviteSignatureValid(code: string, signature: string | undefined): Promise<boolean> {
  if (!signature || !isHolderCode(code) || !/^[0-9a-f]{40}$/.test(signature)) return false;
  const expected = await signInvite(code);
  if (!expected) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
