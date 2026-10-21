import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bracket, CODE_LENGTH, lerpAngle, makeRoomCode, normalizeRoomCode, pushSample, readPose, seedFromCode, type Peer, type PoseMsg,
} from '@/lib/multiplayer/room-link';
import { connectRealtime, type PresenceState } from '@/lib/multiplayer/realtime';

const pose = (n: number, x = n): PoseMsg => ({ id: 'a', n, s: 'surface', w: 'moon', p: [x, 0, 0], y: 0, v: 1 });

describe('room codes', () => {
  it('makes codes that read back as themselves', () => {
    for (let i = 0; i < 50; i++) {
      const c = makeRoomCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(normalizeRoomCode(c)).toBe(c);
    }
  });

  it('cleans up typed codes and refuses what cannot be one', () => {
    expect(normalizeRoomCode(' k7m-2q ')).toBe('K7M2Q');
    expect(normalizeRoomCode('K7M2')).toBeNull();
    expect(normalizeRoomCode('K7M2O')).toBeNull(); // O is left out of the alphabet: it reads as 0
  });

  it('gives everyone in a room the same Backrooms, and other rooms other ones', () => {
    expect(seedFromCode('K7M2Q')).toBe(seedFromCode('K7M2Q'));
    const seeds = new Set(Array.from({ length: 200 }, () => seedFromCode(makeRoomCode())));
    expect(seeds.size).toBeGreaterThan(195);
    for (const s of seeds) expect(Number.isInteger(s) && s >= 100000 && s < 1000000).toBe(true);
    // A room's world tag must survive the wire.
    expect(readPose({ ...pose(1), w: `backrooms-${seedFromCode('K7M2Q')}` })?.w).toBe(`backrooms-${seedFromCode('K7M2Q')}`);
  });
});

describe('pose buffer', () => {
  it('keeps packets in order and drops stale ones', () => {
    const peer: Peer = { id: 'a', name: '', samples: [], lastSeq: -1 };
    pushSample(peer, pose(1), 0);
    pushSample(peer, pose(3), 100);
    pushSample(peer, pose(2), 150);
    expect(peer.samples.map((s) => s.msg.n)).toEqual([1, 3]);
    for (let i = 4; i < 40; i++) pushSample(peer, pose(i), i * 100);
    expect(peer.samples.length).toBeLessThanOrEqual(12);
  });

  it('finds the two packets around a moment', () => {
    const samples = [{ at: 0, msg: pose(1, 0) }, { at: 200, msg: pose(2, 10) }, { at: 400, msg: pose(3, 20) }];
    const mid = bracket(samples, 300)!;
    expect(mid.a.n).toBe(2);
    expect(mid.b.n).toBe(3);
    expect(mid.alpha).toBeCloseTo(0.5);
    expect(bracket(samples, 900)!.b.n).toBe(3);
    expect(bracket(samples, -50)!.a.n).toBe(1);
    expect(bracket([], 0)).toBeNull();
  });

  it('turns the short way round', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
    expect(lerpAngle(0.2, 0.4, 0.5)).toBeCloseTo(0.3);
  });
});

describe('reading poses off the wire', () => {
  it('keeps only the fields a pose may carry', () => {
    const got = readPose({ id: 'x', n: 2, s: 'flight', b: 'earth', p: [1, 2, 3], q: [0, 0, 0, 1], k: 'xfoil', evil: '<script>' });
    expect(got).toEqual({ id: 'x', n: 2, s: 'flight', w: undefined, b: 'earth', p: [1, 2, 3], q: [0, 0, 0, 1], k: 'xfoil', e: undefined, y: undefined, v: undefined });
  });

  it('refuses malformed poses', () => {
    expect(readPose(null)).toBeNull();
    expect(readPose({ id: 'x', n: 1, s: 'warp' })).toBeNull();
    expect(readPose({ id: 'x', n: 1, s: 'flight', p: [1, 2] })!.p).toBeUndefined();
    expect(readPose({ id: 'x', n: 1, s: 'flight', p: [1, NaN, 2] })!.p).toBeUndefined();
    expect(readPose({ id: 'x', n: 1, s: 'flight', k: 'deathstar' })!.k).toBeUndefined();
  });
});

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(frame: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}

describe('realtime client', () => {
  beforeEach(() => { vi.stubGlobal('WebSocket', FakeSocket); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('joins, tracks presence, broadcasts and follows presence diffs', () => {
    const client = connectRealtime('https://abc.supabase.co', 'anon');
    const sock = FakeSocket.last!;
    expect(sock.url).toBe('wss://abc.supabase.co/realtime/v1/websocket?apikey=anon&vsn=1.0.0');
    const ch = client.channel('explore-room-K7M2Q', 'me');
    const seen: PresenceState[] = [];
    const poses: unknown[] = [];
    ch.onPresence((s) => seen.push(s));
    ch.onBroadcast('pose', (p) => poses.push(p));
    ch.track({ name: 'Rezi' });
    sock.open();

    const join = sock.sent.find((f) => f.event === 'phx_join')!;
    expect(join.topic).toBe('realtime:explore-room-K7M2Q');
    // Presence goes out only once the join is acknowledged.
    expect(sock.sent.some((f) => f.event === 'presence')).toBe(false);
    sock.receive({ topic: join.topic, event: 'phx_reply', ref: join.ref, payload: { status: 'ok', response: {} } });
    const track = sock.sent.find((f) => f.event === 'presence')!;
    expect(track.payload).toEqual({ type: 'presence', event: 'track', payload: { name: 'Rezi' } });

    ch.send('pose', { n: 1 });
    expect(sock.sent.at(-1)).toMatchObject({ event: 'broadcast', payload: { type: 'broadcast', event: 'pose', payload: { n: 1 } } });
    sock.receive({ topic: join.topic, event: 'broadcast', ref: null, payload: { type: 'broadcast', event: 'pose', payload: { n: 7 } } });
    expect(poses).toEqual([{ n: 7 }]);

    sock.receive({ topic: join.topic, event: 'presence_state', ref: null, payload: { me: { metas: [{ phx_ref: 'r1', name: 'Rezi' }] } } });
    sock.receive({ topic: join.topic, event: 'presence_diff', ref: null, payload: { joins: { you: { metas: [{ phx_ref: 'r2', name: 'Nika' }] } }, leaves: {} } });
    expect(Object.keys(seen.at(-1)!)).toEqual(['me', 'you']);
    sock.receive({ topic: join.topic, event: 'presence_diff', ref: null, payload: { joins: {}, leaves: { you: { metas: [{ phx_ref: 'r2' }] } } } });
    expect(Object.keys(seen.at(-1)!)).toEqual(['me']);
    client.close();
  });
});
