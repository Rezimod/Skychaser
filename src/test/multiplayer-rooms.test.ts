import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHub } from '../../scripts/fake-realtime.mjs';
import { createRoomLink, type RoomLink } from '@/lib/multiplayer/room-link';
import { pickQuickRoom, roomsFromLobby, ROOM_MAX, useExploreRoom } from '@/lib/multiplayer/useExploreRoom';
import { cleanName, guestIdentity, resetGuestForTests, setGuestName } from '@/lib/multiplayer/guest';

type Hub = ReturnType<typeof createHub>;
type Room = ReturnType<typeof useExploreRoom>;

/** A WebSocket wired straight to the in-process hub, with every frame a task
 *  later (like a network, in order). */
class HubSocket {
  static OPEN = 1;
  static hub: Hub;
  static all: HubSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  conn = { send: (text: string) => { setTimeout(() => { if (this.readyState === 1) this.onmessage?.({ data: text }); }, 0); } };
  constructor(public url: string) {
    HubSocket.all.push(this);
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send(text: string) { setTimeout(() => HubSocket.hub.receive(this.conn, text), 0); }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    HubSocket.hub.close(this.conn);
    setTimeout(() => this.onclose?.(), 0);
  }
}

interface Player { link: RoomLink; room: () => Room; setName: (n: string) => void; unmount: () => void }

const roots: Root[] = [];
function player(name: string, watchLobby = false): Player {
  const link = createRoomLink(`id-${name}-${Math.random().toString(36).slice(2, 7)}`);
  const box: { room: Room | null; name: string; rerender: () => void } = { room: null, name, rerender: () => {} };
  function Harness() {
    box.room = useExploreRoom(link, { name: box.name, epochMs: 1000, watchLobby, onEpoch: () => {} });
    return null;
  }
  const el = document.createElement('div');
  const root = createRoot(el);
  roots.push(root);
  box.rerender = () => root.render(createElement(Harness));
  act(() => box.rerender());
  return {
    link,
    room: () => box.room!,
    setName: (n) => { box.name = n; act(() => box.rerender()); },
    unmount: () => act(() => root.unmount()),
  };
}

async function until(cond: () => boolean, what: string, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
}

describe('rooms against a Realtime stand-in', () => {
  let hub: Hub;
  beforeAll(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
  beforeEach(() => {
    hub = createHub();
    HubSocket.hub = hub;
    HubSocket.all = [];
    vi.stubGlobal('WebSocket', HubSocket);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'dev');
  });
  afterEach(() => {
    for (const r of roots.splice(0)) { try { act(() => r.unmount()); } catch { /* already */ } }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  it('quick play opens a public room, the next quick play joins it, and poses and shots cross', async () => {
    const a = player('Nino');
    const b = player('Gio');
    expect(a.room().status).toBe('idle');
    act(() => a.room().quickPlay());
    expect(a.room().status).toBe('seeking');
    await until(() => a.room().status === 'joined', 'A in a room');
    const code = a.room().code!;
    act(() => b.room().quickPlay());
    await until(() => b.room().status === 'joined', 'B in a room');
    expect(b.room().code).toBe(code);
    await until(() => a.room().roster.length === 2 && b.room().roster.length === 2, 'both rosters');
    expect(a.room().roster.map((m) => m.name)).toEqual(['Nino', 'Gio']);

    // A flies: B hears the pose, with A's name on it.
    a.link.self.s = 'flight';
    a.link.self.b = 'earth';
    a.link.self.p = [1, 2, 3];
    a.link.self.q = [0, 0, 0, 1];
    await until(() => b.link.peers.get(a.link.self.id)?.samples.some((s) => s.msg.s === 'flight') ?? false, 'A\'s pose at B');
    expect(b.link.peers.get(a.link.self.id)!.name).toBe('Nino');
    // A fires: B gets the bolt.
    a.link.shotsOut.push({ id: a.link.self.id, b: 'earth', p: [1, 2, 3], v: [0, 0, 9] });
    await until(() => b.link.shotsIn.length === 1, 'A\'s shot at B');
    expect(b.link.shotsIn[0].msg).toMatchObject({ id: a.link.self.id, b: 'earth', p: [1, 2, 3], v: [0, 0, 9] });

    // A renames: B's roster follows.
    a.setName('Nino K');
    await until(() => b.room().roster.some((m) => m.name === 'Nino K'), 'the new name at B');
  });

  it('a private room is not listed and quick play does not land in it; its code still works', async () => {
    const a = player('Nino');
    act(() => a.room().create());
    await until(() => a.room().status === 'joined', 'A in a private room');
    const lobby = player('Watcher', true);
    await until(() => hub.members('realtime:explore-lobby').some((m) => m.meta?.room === a.room().code), 'the advert');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(lobby.room().rooms).toEqual([]);
    const b = player('Gio');
    act(() => b.room().quickPlay());
    await until(() => b.room().status === 'joined', 'B in a room');
    expect(b.room().code).not.toBe(a.room().code);
    const c = player('Ana');
    act(() => { c.room().join(a.room().code!); });
    await until(() => c.room().status === 'joined' && c.room().roster.length === 2, 'C in A\'s room by code');
    // Come in by code, C keeps the room private.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(hub.members('realtime:explore-lobby').filter((m) => m.meta?.room === a.room().code).every((m) => m.meta?.pub === false)).toBe(true);
  });

  it('a full room by code says so; quick play goes past a full room', async () => {
    // Eight already in room FAQ22.
    const code = 'FAQ22';
    const fakes = Array.from({ length: ROOM_MAX }, (_, i) => ({ send: () => {} , i }));
    for (const f of fakes) {
      hub.receive(f, JSON.stringify({ topic: `realtime:explore-room-${code}`, event: 'phx_join', ref: '1', join_ref: '1', payload: { config: { presence: { key: `fake${f.i}` } } } }));
      hub.receive(f, JSON.stringify({ topic: `realtime:explore-room-${code}`, event: 'presence', ref: '2', join_ref: '1', payload: { type: 'presence', event: 'track', payload: { name: `F${f.i}`, joinedAt: f.i + 1 } } }));
      hub.receive(f, JSON.stringify({ topic: 'realtime:explore-lobby', event: 'phx_join', ref: '3', join_ref: '3', payload: { config: { presence: { key: `fake${f.i}` } } } }));
      hub.receive(f, JSON.stringify({ topic: 'realtime:explore-lobby', event: 'presence', ref: '4', join_ref: '3', payload: { type: 'presence', event: 'track', payload: { room: code, name: `F${f.i}`, joinedAt: f.i + 1, pub: true } } }));
    }
    const a = player('Nino');
    act(() => { a.room().join(code); });
    await until(() => a.room().error === 'full', 'the full error');
    expect(a.room().status).toBe('idle');
    act(() => a.room().quickPlay());
    await until(() => a.room().status === 'joined', 'A somewhere');
    expect(a.room().code).not.toBe(code);
  });

  it('joining and leaving over and over leaves nothing behind', async () => {
    const a = player('Nino');
    for (let i = 0; i < 6; i++) {
      act(() => a.room().quickPlay());
      await until(() => a.room().status === 'joined', `join ${i}`);
      act(() => a.room().leave());
      await until(() => a.room().status === 'idle', `leave ${i}`);
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    // Every socket was closed, and the hub holds no one.
    expect(HubSocket.all.every((s) => s.readyState === 3)).toBe(true);
    expect(hub.members('realtime:explore-lobby')).toEqual([]);
    expect(a.link.peers.size).toBe(0);
    expect(a.link.code).toBeNull();
  });

  it('a dropped socket reads as reconnecting, and comes back into the same room', async () => {
    const a = player('Nino');
    act(() => a.room().quickPlay());
    await until(() => a.room().status === 'joined', 'joined');
    const code = a.room().code;
    act(() => HubSocket.all.at(-1)!.close());
    await until(() => a.room().status === 'reconnecting', 'reconnecting');
    await until(() => a.room().status === 'joined', 'back in', 4000);
    expect(a.room().code).toBe(code);
  });
});

describe('quick play choice and the lobby list', () => {
  const room = (code: string, count: number) => ({ code, host: 'x', count, members: [] });
  it('takes the busiest room with a seat', () => {
    expect(pickQuickRoom([room('AAAAA', ROOM_MAX), room('BBBBB', 3), room('CCCCC', 1)])).toBe('BBBBB');
    expect(pickQuickRoom([room('BBBBB', 3)], new Set(['BBBBB']))).toBeNull();
    expect(pickQuickRoom([])).toBeNull();
  });
  it('lists who is where, and leaves private rooms out', () => {
    const rooms = roomsFromLobby({
      a: [{ room: 'K7M2Q', name: 'A', joinedAt: 2, pub: true, s: 'flight' }],
      b: [{ room: 'K7M2Q', name: 'B', joinedAt: 1, pub: true, s: 'surface', w: 'mars' }],
      c: [{ room: 'PRV22', name: 'C', joinedAt: 0, pub: false }],
    });
    expect(rooms).toEqual([{ code: 'K7M2Q', host: 'B', count: 2, members: [{ name: 'B', scene: 'surface', world: 'mars' }, { name: 'A', scene: 'flight', world: '' }] }]);
  });
});

describe('guest identity', () => {
  beforeEach(() => { localStorage.clear(); resetGuestForTests(); });
  it('keeps the same tag across visits and takes a tidy name', () => {
    const first = guestIdentity();
    expect(first.tag).toMatch(/^[A-Z0-9]{4}$/);
    resetGuestForTests();
    expect(guestIdentity().tag).toBe(first.tag);
    expect(setGuestName('  Nino\n<b>  K ').name).toBe('Ninob K');
    resetGuestForTests();
    expect(guestIdentity().name).toBe('Ninob K');
    expect(cleanName('x'.repeat(80))).toHaveLength(24);
  });
  it('survives junk in storage', () => {
    localStorage.setItem('stellar_guest', '{not json');
    expect(guestIdentity().tag).toMatch(/^[A-Z0-9]{4}$/);
  });
});
