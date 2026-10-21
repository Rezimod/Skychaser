// What the Backrooms remember between visits: that the crew found them,
// whether they got out, and how long it took.

export interface BackroomsSave {
  discovered: boolean;
  escaped: boolean;
  entries: number;
  lastSeconds: number;
  bestSeconds: number;
}

const STORE = 'stellar_moon_backrooms_v1';
const fresh = (): BackroomsSave => ({ discovered: false, escaped: false, entries: 0, lastSeconds: 0, bestSeconds: 0 });

export function loadBackrooms(): BackroomsSave {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return fresh();
    const v = JSON.parse(raw) as Partial<Record<keyof BackroomsSave, unknown>>;
    const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);
    if (typeof v.discovered !== 'boolean' || typeof v.escaped !== 'boolean') return fresh();
    const entries = num(v.entries); const last = num(v.lastSeconds); const best = num(v.bestSeconds);
    if (entries === null || last === null || best === null) return fresh();
    return { discovered: v.discovered, escaped: v.escaped, entries: Math.floor(entries), lastSeconds: last, bestSeconds: best };
  } catch {
    return fresh();
  }
}

function save(s: BackroomsSave) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* a private window: the level is still there */ }
}

export function recordEntry(): BackroomsSave {
  const s = loadBackrooms();
  s.discovered = true;
  s.entries += 1;
  save(s);
  return s;
}

export function recordEscape(seconds: number): BackroomsSave {
  const s = loadBackrooms();
  s.discovered = true;
  s.escaped = true;
  s.lastSeconds = Math.round(seconds);
  s.bestSeconds = s.bestSeconds > 0 ? Math.min(s.bestSeconds, s.lastSeconds) : s.lastSeconds;
  save(s);
  return s;
}
