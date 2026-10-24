// A player who has not signed in still flies with the others: a guest, with
// a short tag ("Pilot 7KQ2") that stays the same on this device, and a name
// they can pick. Kept in localStorage; a browser that refuses storage gets a
// fresh tag each visit and nothing breaks.

const KEY = 'stellar_guest';
const TAG_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const NAME_MAX = 24;

export interface GuestIdentity {
  /** Stable on this device. */
  id: string;
  /** Four letters and digits, for the default callsign. */
  tag: string;
  /** What they chose to be called, or '' for the callsign. */
  name: string;
}

let memo: GuestIdentity | null = null;

const makeTag = (rand: () => number) => Array.from({ length: 4 }, () => TAG_ALPHABET[Math.floor(rand() * TAG_ALPHABET.length)]).join('');

/** A typed name, tidied: no control characters, single spaces, at most NAME_MAX. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function guestIdentity(rand: () => number = Math.random): GuestIdentity {
  if (memo) return memo;
  let stored: Partial<GuestIdentity> | null = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GuestIdentity> | null;
  } catch { /* no storage, or junk in it */ }
  const tag = typeof stored?.tag === 'string' && /^[A-Z0-9]{4}$/.test(stored.tag) ? stored.tag : makeTag(rand);
  const id = typeof stored?.id === 'string' && stored.id.length >= 8 && stored.id.length <= 64 ? stored.id : `g-${tag}-${Math.floor(rand() * 1e9).toString(36)}`;
  memo = { id, tag, name: typeof stored?.name === 'string' ? cleanName(stored.name) : '' };
  save(memo);
  return memo;
}

export function setGuestName(raw: string): GuestIdentity {
  const g = guestIdentity();
  memo = { ...g, name: cleanName(raw) };
  save(memo);
  return memo;
}

function save(g: GuestIdentity) {
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* private mode: this visit only */ }
}

/** Tests only. */
export function resetGuestForTests() {
  memo = null;
}
