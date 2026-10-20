import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBuildSync, type SyncState } from '@/lib/solar-system/build-sync';
import type { BuildHandle, BuildPiece } from '@/lib/solar-system/build-mode';

/** Just enough of the scene's build handle to watch what the sync does to it. */
function fakeBuild() {
  const calls: string[] = [];
  const b = {
    onPlace: null, onRemove: null,
    syncServer: vi.fn((list: BuildPiece[]) => calls.push(`sync:${list.length}`)),
    resolve: vi.fn((id: string, p: BuildPiece) => calls.push(`resolve:${id}->${p.id}`)),
    drop: vi.fn((id: string) => calls.push(`drop:${id}`)),
    restore: vi.fn((p: BuildPiece) => calls.push(`restore:${p.id}`)),
  } as unknown as BuildHandle;
  return { b, calls };
}
const piece = (over: Partial<BuildPiece> = {}): BuildPiece => ({ id: 'local-1', scope: 'colony', module: 'battery', x: 97, z: 9, yaw: 0, mine: true, ...over });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = () => new Promise((r) => setTimeout(r, 0));

let states: SyncState[] = [];
beforeEach(() => { states = []; });
afterEach(() => { vi.restoreAllMocks(); });

describe('build sync', () => {
  it('falls back to session-only building when the store is not there', async () => {
    const { b } = fakeBuild();
    const fetcher = vi.fn(async () => json(503, { error: 'Base storage is unavailable' }));
    const sync = makeBuildSync({ world: 'moon', build: b, token: async () => null, onState: (s) => states.push(s), fetcher: fetcher as unknown as typeof fetch });
    await flush(); await flush();
    expect(states.at(-1)?.status).toBe('offline');
    // Signed out, but nothing is being saved anyway: building goes on for the session.
    expect(sync.canBuild()).toBe(true);
    b.onPlace?.(piece());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(b.drop).not.toHaveBeenCalled();
    sync.dispose();
  });

  it('keeps a signed-out player from building while the store answers', async () => {
    const { b } = fakeBuild();
    const fetcher = vi.fn(async () => json(200, { signedIn: false, pieces: [{ id: 'a', scope: 'colony', module: 'pad', x: 91, z: 9, yaw: 0, mine: false }] }));
    const sync = makeBuildSync({ world: 'moon', build: b, token: async () => null, onState: (s) => states.push(s), fetcher: fetcher as unknown as typeof fetch });
    await flush(); await flush();
    expect(states.at(-1)?.status).toBe('online');
    expect(sync.canBuild()).toBe(false);
    expect(b.syncServer).toHaveBeenCalledWith([{ id: 'a', scope: 'colony', module: 'pad', x: 91, z: 9, yaw: 0, mine: false }]);
    sync.dispose();
  });

  it('saves a placement with the token, and takes a refused one back out', async () => {
    const { b, calls } = fakeBuild();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { x: number };
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
        return body.x === 97 ? json(201, { piece: { ...piece(), id: 'srv-1' } }) : json(409, { problem: 'overlap' });
      }
      return json(200, { signedIn: true, pieces: [] });
    });
    const sync = makeBuildSync({ world: 'moon', build: b, token: async () => 'tok', onState: (s) => states.push(s), fetcher: fetcher as unknown as typeof fetch });
    await flush(); await flush();
    expect(sync.canBuild()).toBe(true);
    b.onPlace?.(piece());
    await flush(); await flush(); await flush();
    b.onPlace?.(piece({ id: 'local-2', x: 93 }));
    await flush(); await flush(); await flush();
    expect(calls).toContain('resolve:local-1->srv-1');
    expect(calls).toContain('drop:local-2');
    expect(states.at(-1)?.refused).toBe('overlap');
    sync.dispose();
  });

  it('puts a piece back when its removal is refused', async () => {
    const { b } = fakeBuild();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      (init?.method === 'DELETE' ? json(403, { error: 'no' }) : json(200, { signedIn: true, pieces: [] })));
    const sync = makeBuildSync({ world: 'mars', build: b, token: async () => 'tok', onState: (s) => states.push(s), fetcher: fetcher as unknown as typeof fetch });
    await flush(); await flush();
    const p = piece({ id: 'srv-9' });
    b.onRemove?.(p);
    await flush(); await flush(); await flush();
    expect(b.restore).toHaveBeenCalledWith(p);
    expect(states.at(-1)?.refused).toBe('notYours');
    sync.dispose();
  });
});
