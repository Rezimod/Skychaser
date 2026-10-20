// Keeps a surface's pieces in step with /api/bases: loads them on arrival,
// saves a placement or a removal as it happens (the scene has already shown
// it; a refusal takes it back), and asks again every POLL_MS so pieces other
// players add to the colony turn up. When the store cannot answer — offline,
// or the table not created yet — building carries on for the session and the
// status says saving is unavailable.

import type { BuildHandle, BuildPiece } from '@/lib/solar-system/build-mode';
import { moduleSpec, type BuildScope, type BuildWorld, type ModuleId } from '@/lib/solar-system/build-rules';

export type SyncStatus = 'loading' | 'online' | 'offline';

export interface SyncState {
  status: SyncStatus;
  signedIn: boolean;
  /** The last refusal, as a key under solarSystem.build.refused, until the next action. */
  refused: string;
}

export interface BuildSyncOptions {
  world: BuildWorld;
  build: BuildHandle;
  /** The Privy access token, or null when signed out. */
  token: () => Promise<string | null>;
  onState: (s: SyncState) => void;
  fetcher?: typeof fetch;
}

export interface BuildSync {
  /** Load again now (after signing in, say). */
  refresh: () => void;
  /** May this player build at all right now? Signed in, or the store is not answering anyway. */
  canBuild: () => boolean;
  dispose: () => void;
}

export const POLL_MS = 20_000;
/** A load that has not answered by now counts as no answer: build for the session, ask again next poll. */
const LOAD_TIMEOUT_MS = 15_000;

interface ApiPiece { id: string; scope: string; module: string; x: number; z: number; yaw: number; mine: boolean }

const toPiece = (p: ApiPiece): BuildPiece | null =>
  moduleSpec(p.module) && (p.scope === 'private' || p.scope === 'colony')
    ? { id: p.id, scope: p.scope as BuildScope, module: p.module as ModuleId, x: p.x, z: p.z, yaw: p.yaw, mine: p.mine }
    : null;

export function makeBuildSync(o: BuildSyncOptions): BuildSync {
  const f = o.fetcher ?? fetch;
  const state: SyncState = { status: 'loading', signedIn: false, refused: '' };
  let alive = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  const emit = () => { if (alive) o.onState({ ...state }); };

  const headers = async (json: boolean): Promise<Record<string, string>> => {
    const h: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
    const t = await o.token().catch(() => null);
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  };

  const load = async () => {
    try {
      const res = await f(`/api/bases?world=${o.world}`, { headers: await headers(false), cache: 'no-store', signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
      if (!alive) return;
      if (!res.ok) { state.status = 'offline'; emit(); return; }
      const body = await res.json() as { signedIn: boolean; pieces: ApiPiece[] };
      if (!alive) return;
      state.status = 'online';
      state.signedIn = body.signedIn;
      o.build.syncServer(body.pieces.map(toPiece).filter((p): p is BuildPiece => p !== null));
    } catch {
      if (alive) state.status = 'offline';
    }
    emit();
  };

  o.build.onPlace = (p) => {
    state.refused = '';
    if (state.status !== 'online') { emit(); return; }
    void (async () => {
      try {
        const res = await f('/api/bases', {
          method: 'POST', headers: await headers(true),
          body: JSON.stringify({ world: o.world, scope: p.scope, module: p.module, x: p.x, z: p.z, yaw: p.yaw }),
        });
        if (!alive) return;
        if (res.status === 201) {
          const body = await res.json() as { piece: ApiPiece };
          const saved = toPiece(body.piece);
          if (saved) o.build.resolve(p.id, saved);
          return;
        }
        if (res.status === 503) { state.status = 'offline'; emit(); return; }
        // A refusal: it never stood. Say why.
        const body = await res.json().catch(() => ({})) as { problem?: string };
        o.build.drop(p.id);
        state.refused = res.status === 401 ? 'signIn' : res.status === 429 ? 'tooFast' : body.problem ?? 'error';
        emit();
      } catch {
        // No answer at all: keep it for the session.
        if (!alive) return;
        state.status = 'offline';
        emit();
      }
    })();
  };

  o.build.onRemove = (p) => {
    state.refused = '';
    if (state.status !== 'online' || p.id.startsWith('local-')) { emit(); return; }
    void (async () => {
      try {
        const res = await f(`/api/bases/${encodeURIComponent(p.id)}`, { method: 'DELETE', headers: await headers(false) });
        if (!alive) return;
        if (res.ok || res.status === 404) { o.build.drop(p.id); return; }
        o.build.restore(p);
        state.refused = res.status === 403 ? 'notYours' : res.status === 401 ? 'signIn' : 'error';
        if (res.status === 503) state.status = 'offline';
        emit();
      } catch {
        if (!alive) return;
        o.build.restore(p);
        state.refused = 'error';
        emit();
      }
    })();
  };

  void load();
  timer = setInterval(() => { void load(); }, POLL_MS);

  return {
    refresh: () => { void load(); },
    canBuild: () => state.signedIn || state.status === 'offline',
    dispose() {
      alive = false;
      if (timer) clearInterval(timer);
      o.build.onPlace = null;
      o.build.onRemove = null;
    },
  };
}
