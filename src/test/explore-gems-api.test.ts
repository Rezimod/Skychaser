// @vitest-environment node
// The gem routes and their store. POST takes only ids from the world's own
// layout, from a signed-in account, prices them itself and keeps each once;
// GET hands an account's gems back. The leaderboard ranks by score, names
// nobody by account id, and reads as empty when the store is down. The
// store makes its own table, once, against a database mocked in memory.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GEM_INFO, gemLayout } from '@/lib/solar-system/gem-layout';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), limit: vi.fn(), db: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ verifyPrivy: mocks.verify }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.limit, exploreGemsRateLimit: {}, exploreGemsBoardRateLimit: {} }));
vi.mock('@/lib/db', () => ({ getDb: mocks.db }));
import { GET as mineGET, POST } from '@/app/api/games/explore/gems/route';
import { GET as boardGET } from '@/app/api/games/explore/gems/leaderboard/route';
import { anonTag, resetGemsTableForTests } from '@/lib/games/explore-gems-store';

// ── An explore_gems table in memory, behind the slice of drizzle the store uses. ──

interface Row { privyId: string; world: string; gemId: string; points: number; createdAt: Date }

/** The bound values in a drizzle condition (eq → Param, a raw number in sql``). */
function values(cond: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (c: unknown) => {
    if (c === null || c === undefined) return;
    if (typeof c === 'number' || typeof c === 'string') { out.push(c); return; }
    // inArray: a list of Params.
    if (Array.isArray(c)) { out.push(c.map((x) => (x as { value?: unknown }).value ?? x)); return; }
    const o = c as { queryChunks?: unknown[]; constructor?: { name?: string }; value?: unknown };
    if (o.queryChunks) { o.queryChunks.forEach(walk); return; }
    if (o.constructor?.name === 'Param') out.push(o.value);
  };
  walk(cond);
  return out;
}

function memoryDb(opts: { ddlFails?: boolean; names?: Record<string, string> } = {}) {
  const rows: Row[] = [];
  const ddl: string[] = [];
  let clock = 0;
  const totals = () => {
    const by = new Map<string, { points: number; gems: number; last: number }>();
    for (const r of rows) {
      const t = by.get(r.privyId) ?? { points: 0, gems: 0, last: 0 };
      t.points += r.points; t.gems += 1; t.last = Math.max(t.last, r.createdAt.getTime());
      by.set(r.privyId, t);
    }
    return by;
  };
  const select = (fields: Record<string, unknown>) => {
    const q: { from?: unknown; where?: unknown; having?: unknown; limit?: number } = {};
    const keys = Object.keys(fields ?? {});
    const run = (): unknown => {
      const from = q.from as { better?: number } | undefined;
      if (from && typeof from === 'object' && 'better' in from) {
        return [{ n: [...totals().values()].filter((t) => t.points > from.better!).length }];
      }
      if (keys.includes('username')) {
        const ids = (values(q.where)[0] as string[]) ?? [];
        return ids.filter((id) => opts.names?.[id]).map((id) => ({ privyId: id, username: opts.names![id] }));
      }
      if (keys.includes('last')) {
        return [...totals().entries()]
          .sort((a, b) => b[1].points - a[1].points || a[1].last - b[1].last)
          .slice(0, q.limit ?? 50)
          .map(([who, t]) => ({ who, points: t.points, gems: t.gems, last: new Date(t.last) }));
      }
      if (keys.includes('gemId')) {
        const [who] = values(q.where);
        return rows.filter((r) => r.privyId === who).map((r) => ({ world: r.world, gemId: r.gemId }));
      }
      if (keys.includes('points') && keys.includes('gems')) {
        const [who] = values(q.where);
        const t = totals().get(who as string);
        return [{ points: t?.points ?? 0, gems: t?.gems ?? 0 }];
      }
      if (keys.length === 1 && keys[0] === 'n') return [{ n: totals().size }];
      throw new Error(`unexpected select ${keys.join(',')}`);
    };
    const chain = {
      from(t: unknown) { q.from = t; return chain; },
      where(c: unknown) { q.where = c; return chain; },
      groupBy() { return chain; },
      having(c: unknown) { q.having = c; return chain; },
      orderBy() { return chain; },
      limit(n: number) { q.limit = n; return chain; },
      as() { return { better: values(q.having)[0] as number }; },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try { resolve(run()); } catch (e) { reject(e); }
      },
    };
    return chain;
  };
  const db = {
    execute: vi.fn(async (q: unknown) => {
      if (opts.ddlFails) throw new Error('permission denied');
      ddl.push(JSON.stringify(values(q)));
      return { rows: [] };
    }),
    insert: () => ({
      values: (vals: Omit<Row, 'createdAt'>[]) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const added: { gemId: string }[] = [];
            for (const v of vals) {
              if (rows.some((r) => r.privyId === v.privyId && r.world === v.world && r.gemId === v.gemId)) continue;
              rows.push({ ...v, createdAt: new Date(++clock * 1000) });
              added.push({ gemId: v.gemId });
            }
            return added;
          },
        }),
      }),
    }),
    select,
  };
  return { db, rows, ddl };
}

const mars = gemLayout('mars');
const post = (body: unknown, token: string | null = 'tok') => POST(new NextRequest('http://localhost/api/games/explore/gems', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: token ? { Authorization: `Bearer ${token}` } : {},
}));
const board = (q = '', token: string | null = null) => boardGET(new NextRequest(`http://localhost/api/games/explore/gems/leaderboard${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));

let mem: ReturnType<typeof memoryDb>;
beforeEach(() => {
  vi.clearAllMocks();
  resetGemsTableForTests();
  mem = memoryDb({ names: { 'did:privy:ana': 'Ana' } });
  mocks.db.mockReturnValue(mem.db);
  mocks.verify.mockResolvedValue('did:privy:me');
  mocks.limit.mockResolvedValue({ success: true, remaining: 10, reset: 0 });
});

describe('POST /api/games/explore/gems', () => {
  it('needs a signed-in session', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await post({ world: 'mars', gemIds: [mars[0].id] }, null);
    expect(res.status).toBe(401);
    expect(mem.rows).toHaveLength(0);
  });

  it('stores the gems, priced by the server, and returns the total and rank', async () => {
    const ids = [mars[0].id, mars[1].id];
    const res = await post({ world: 'mars', gemIds: ids, points: 99999 });
    expect(res.status).toBe(200);
    const body = await res.json();
    const want = GEM_INFO[mars[0].kind].points + GEM_INFO[mars[1].kind].points;
    expect(body).toMatchObject({ world: 'mars', accepted: ids, stored: 2, points: want, gems: 2, rank: 1, players: 1 });
    expect(mem.rows.map((r) => r.points)).toEqual([GEM_INFO[mars[0].kind].points, GEM_INFO[mars[1].kind].points]);
    expect(mem.rows.every((r) => r.privyId === 'did:privy:me')).toBe(true);
  });

  it('counts a gem once, however often or however many times in one report it is sent', async () => {
    await post({ world: 'mars', gemIds: [mars[0].id, mars[0].id, mars[0].id] });
    const again = await (await post({ world: 'mars', gemIds: [mars[0].id] })).json();
    expect(again.stored).toBe(0);
    expect(again.gems).toBe(1);
    expect(again.points).toBe(GEM_INFO[mars[0].kind].points);
    expect(mem.rows).toHaveLength(1);
    // The same id on another world is another gem.
    const moon = await (await post({ world: 'moon', gemIds: [mars[0].id] })).json();
    expect(moon.stored).toBe(1);
  });

  it('rejects ids that are not in the world’s layout, and keeps none of the batch', async () => {
    const res = await post({ world: 'mars', gemIds: [mars[0].id, 'g99', 'crystal-1'] });
    expect(res.status).toBe(400);
    expect((await res.json()).unknown).toEqual(['g99', 'crystal-1']);
    expect(mem.rows).toHaveLength(0);
  });

  it('rejects malformed reports and unknown worlds', async () => {
    for (const bad of ['nope', null, [], { world: 'pluto', gemIds: ['g00'] }, { world: 'mars' }, { world: 'mars', gemIds: [] },
      { world: 'mars', gemIds: 'g00' }, { world: 'mars', gemIds: [1, 2] }, { world: 'mars', gemIds: Array(200).fill('g00') }]) {
      expect((await post(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(mem.rows).toHaveLength(0);
  });

  it('rate limits by account, and carries on when no limiter is configured', async () => {
    mocks.limit.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    expect((await post({ world: 'mars', gemIds: [mars[0].id] })).status).toBe(429);
    expect(mocks.limit).toHaveBeenCalledWith({}, 'gems:did:privy:me');
    mocks.limit.mockRejectedValue(new Error('no redis'));
    expect((await post({ world: 'mars', gemIds: [mars[0].id] })).status).toBe(200);
  });

  it('says the store is unavailable (and the game keeps the gems) when there is no database', async () => {
    mocks.db.mockReturnValue(null);
    expect((await post({ world: 'mars', gemIds: [mars[0].id] })).status).toBe(503);
  });

  it('creates its table once, idempotently, and backs off when it cannot', async () => {
    await post({ world: 'mars', gemIds: [mars[0].id] });
    await post({ world: 'mars', gemIds: [mars[1].id] });
    expect(mem.db.execute).toHaveBeenCalledTimes(3);
    resetGemsTableForTests();
    const broken = memoryDb({ ddlFails: true });
    mocks.db.mockReturnValue(broken.db);
    expect((await post({ world: 'mars', gemIds: [mars[0].id] })).status).toBe(503);
    expect((await post({ world: 'mars', gemIds: [mars[0].id] })).status).toBe(503);
    expect(broken.db.execute).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/games/explore/gems', () => {
  it('hands an account its own gems back, and nobody else’s', async () => {
    await post({ world: 'mars', gemIds: [mars[2].id] });
    mocks.verify.mockResolvedValue('did:privy:other');
    await post({ world: 'moon', gemIds: ['g01'] });
    mocks.verify.mockResolvedValue('did:privy:me');
    const body = await (await mineGET(new NextRequest('http://localhost/api/games/explore/gems', { headers: { Authorization: 'Bearer t' } }))).json();
    expect(body.worlds).toEqual({ mars: [mars[2].id] });
    expect(body.rank).toBe(body.points >= GEM_INFO[gemLayout('moon')[1].kind].points ? 1 : 2);
    mocks.verify.mockResolvedValue(null);
    expect((await mineGET(new NextRequest('http://localhost/api/games/explore/gems'))).status).toBe(401);
  });
});

describe('GET /api/games/explore/gems/leaderboard', () => {
  const fill = async () => {
    for (const [who, n] of [['did:privy:ana', 6], ['did:privy:me', 3], ['did:privy:bo', 1]] as const) {
      mocks.verify.mockResolvedValue(who);
      await post({ world: 'mars', gemIds: mars.slice(0, n).map((g) => g.id) });
    }
  };

  it('ranks by score, names from the profile or an anonymous tag, never the account id', async () => {
    await fill();
    const res = await board('?limit=50');
    expect(res.headers.get('cache-control')).toContain('public');
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.players).toBe(3);
    expect(body.entries.map((e: { rank: number }) => e.rank)).toEqual([1, 2, 3]);
    expect(body.entries[0]).toMatchObject({ name: 'Ana', gems: 6, me: false });
    expect(body.entries[1]).toMatchObject({ name: null, tag: anonTag('did:privy:me') });
    expect(body.entries[0].points).toBeGreaterThan(body.entries[1].points);
    expect(JSON.stringify(body)).not.toContain('did:privy');
    expect(body.me).toBeNull();
  });

  it('marks the caller and says where they stand', async () => {
    await fill();
    mocks.verify.mockResolvedValue('did:privy:bo');
    const res = await board('?limit=2', 'tok');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries.some((e: { me: boolean }) => e.me)).toBe(false);
    expect(body.me).toMatchObject({ rank: 3, gems: 1, players: 3 });
    mocks.verify.mockResolvedValue('did:privy:ana');
    const top = await (await board('', 'tok')).json();
    expect(top.entries[0].me).toBe(true);
  });

  it('is an empty board, not an error, when the store is down', async () => {
    mocks.db.mockReturnValue(null);
    const res = await board();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, players: 0, entries: [], me: null });
  });
});
