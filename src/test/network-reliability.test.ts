import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectRealtime } from '@/lib/multiplayer/realtime';
import { roomsFromLobby } from '@/lib/multiplayer/useExploreRoom';
import { disposeParts } from '@/lib/multiplayer/remote-fleet';
import { resetGemSyncRunForTests, runGemSync } from '@/components/play/useGemSync';
import type { ShipParts } from '@/lib/solar-system/ship-mesh';

class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(frame: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  joins() { return this.sent.filter((f) => f.event === 'phx_join'); }
}

describe('realtime client reliability', () => {
  const clients: { close: () => void }[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // no jitter
    FakeSocket.all = [];
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    for (const c of clients.splice(0)) c.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const setup = () => {
    const client = connectRealtime('https://abc.supabase.co', 'anon');
    clients.push(client);
    const ch = client.channel('explore-room-K7M2Q', 'me');
    const statuses: string[] = [];
    ch.onStatus((s) => statuses.push(s));
    const sock = FakeSocket.all[0];
    sock.open();
    return { client, ch, sock, statuses };
  };

  it('ignores a close from an earlier join and dedupes rejoins with backoff', () => {
    const { client, sock } = setup();
    const join = sock.joins()[0];
    sock.receive({ topic: join.topic, event: 'phx_reply', ref: join.ref, join_ref: join.ref, payload: { status: 'ok' } });
    // A frame for an older join of this topic changes nothing.
    sock.receive({ topic: join.topic, event: 'phx_close', ref: null, join_ref: 'stale', payload: {} });
    vi.advanceTimersByTime(60_000);
    expect(sock.joins()).toHaveLength(1);

    // Two errors in a row: still only one rejoin.
    sock.receive({ topic: join.topic, event: 'phx_error', ref: null, join_ref: join.ref, payload: {} });
    sock.receive({ topic: join.topic, event: 'phx_error', ref: null, join_ref: join.ref, payload: {} });
    vi.advanceTimersByTime(1300);
    expect(sock.joins()).toHaveLength(2);
    // That join is never answered: it times out, and the next try backs off further (~2 s, not 1 s).
    vi.advanceTimersByTime(10_000 + 1400);
    expect(sock.joins()).toHaveLength(2);
    vi.advanceTimersByTime(1200);
    expect(sock.joins()).toHaveLength(3);
    client.close();
  });

  it('retries a refused join instead of waiting forever', () => {
    const { client, sock, statuses } = setup();
    const join = sock.joins()[0];
    sock.receive({ topic: join.topic, event: 'phx_reply', ref: join.ref, join_ref: join.ref, payload: { status: 'error', response: { reason: 'nope' } } });
    expect(statuses.at(-1)).toBe('error');
    vi.advanceTimersByTime(1300);
    const again = sock.joins()[1];
    expect(again).toBeTruthy();
    sock.receive({ topic: again.topic, event: 'phx_reply', ref: again.ref, join_ref: again.ref, payload: { status: 'ok' } });
    expect(statuses.at(-1)).toBe('joined');
    client.close();
  });

  it('drops a socket that has gone silent and dials again', () => {
    const { client, sock } = setup();
    vi.advanceTimersByTime(80_000);
    expect(sock.closed).toBe(true);
    vi.advanceTimersByTime(10);
    expect(FakeSocket.all.length).toBe(2);
    client.close();
  });

  it('reconnects a stale socket when the page comes back on screen, and stops listening on close', () => {
    const { client, sock } = setup();
    vi.setSystemTime(Date.now() + 120_000); // the phone slept: no timers ran
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sock.closed).toBe(true);
    vi.advanceTimersByTime(10);
    expect(FakeSocket.all.length).toBe(2);
    client.close();
    const count = FakeSocket.all.length;
    vi.setSystemTime(Date.now() + 120_000);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all.length).toBe(count);
  });
});

describe('lobby list', () => {
  it('counts rooms from presence', () => {
    const rooms = roomsFromLobby({
      a: [{ room: 'K7M2Q', name: 'A', joinedAt: 2 }],
      b: [{ room: 'K7M2Q', name: 'B', joinedAt: 1 }],
      c: [{ room: '', name: 'C', joinedAt: 0 }],
    });
    expect(rooms).toMatchObject([{ code: 'K7M2Q', host: 'B', count: 2 }]);
  });
});

describe('remote fleet disposal', () => {
  it('hands the model back before disposing, and leaves the model geometry alone', () => {
    const shared = new THREE.BoxGeometry();
    const own = new THREE.BoxGeometry();
    const sharedDispose = vi.spyOn(shared, 'dispose');
    const ownDispose = vi.spyOn(own, 'dispose');
    const group = new THREE.Group();
    const modelMesh = new THREE.Mesh(shared);
    group.add(modelMesh, new THREE.Mesh(own));
    const release = vi.fn(() => modelMesh.removeFromParent());
    disposeParts({ group, owned: [], release } as unknown as ShipParts);
    expect(release).toHaveBeenCalledTimes(1);
    expect(sharedDispose).not.toHaveBeenCalled();
    expect(ownDispose).toHaveBeenCalled();
  });
});

describe('gem sync', () => {
  beforeEach(() => resetGemSyncRunForTests());

  it('keeps syncing after a pass throws', async () => {
    const boom = vi.fn(async () => { throw new Error('boom'); });
    await expect(runGemSync('acct', async () => 't', boom)).resolves.toBeNull();
    const ok = vi.fn(async () => ({ points: 1, gems: 1, rank: 1, players: 1 }));
    await expect(runGemSync('acct', async () => 't', ok)).resolves.toEqual({ points: 1, gems: 1, rank: 1, players: 1 });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

