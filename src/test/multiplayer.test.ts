import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  bracket, CODE_LENGTH, createRoomLink, FADE_MS, lerpAngle, makeRoomCode, normalizeRoomCode, peerAlpha, pushSample, pushShot, readPose, readShot,
  RENDER_DELAY_MS, seedFromCode, STALE_MS, type Peer, type PoseMsg,
} from '@/lib/multiplayer/room-link';
import { makeRemoteFleet, queueShot } from '@/lib/multiplayer/remote-fleet';
import type { FlightBody } from '@/lib/solar-system/player-ship';
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

describe('timing, fading and shots', () => {
  it('spaces packets as they were sent, not as they arrived', () => {
    const peer: Peer = { id: 'a', name: '', samples: [], lastSeq: -1 };
    // Sent every 200 ms; arrived 40, 190, 45 and 60 ms late.
    const late = [40, 190, 45, 60];
    late.forEach((d, i) => pushSample(peer, { ...pose(i + 1), t: 5000 + i * 200 }, 1000 + i * 200 + d));
    const gaps = peer.samples.slice(1).map((s, i) => s.at - peer.samples[i].at);
    // (The offset may creep a hair later per packet: a route that got slower.)
    for (const g of gaps) expect(Math.abs(g - 200)).toBeLessThan(5);
    // Never placed later than it arrived.
    peer.samples.forEach((s, i) => expect(s.at).toBeLessThanOrEqual(1000 + i * 200 + late[i]));
  });

  it('carries a moving ship on briefly past its last packet, but not across a keepalive gap', () => {
    const fly = (n: number, x: number): PoseMsg => ({ id: 'a', n, s: 'flight', b: 'earth', p: [x, 0, 0] });
    const moving = [{ at: 0, msg: fly(1, 0) }, { at: 200, msg: fly(2, 10) }];
    const ahead = bracket(moving, 300, 250)!;
    expect(ahead.alpha).toBeCloseTo(1.5);
    expect(bracket(moving, 5000, 250)!.alpha).toBeCloseTo(1 + 250 / 200);
    const resting = [{ at: 0, msg: fly(1, 0) }, { at: 2000, msg: fly(2, 0) }];
    expect(bracket(resting, 2100, 250)!.alpha).toBe(0);
  });

  it('fades a pilot who has gone quiet', () => {
    const peer: Peer = { id: 'a', name: '', samples: [], lastSeq: -1, heardAt: 1000 };
    expect(peerAlpha(peer, 1000 + STALE_MS)).toBe(1);
    expect(peerAlpha(peer, 1000 + STALE_MS + FADE_MS / 2)).toBeCloseTo(0.5);
    expect(peerAlpha(peer, 1000 + STALE_MS + FADE_MS * 2)).toBe(0);
  });

  it('reads shots strictly', () => {
    expect(readShot({ id: 'a', b: 'earth', p: [1, 2, 3], v: [0, 0, 1], t: 5, extra: 1 })).toEqual({ id: 'a', b: 'earth', p: [1, 2, 3], v: [0, 0, 1], t: 5 });
    expect(readShot({ id: 'a', b: 'earth', p: [1, 2], v: [0, 0, 1] })).toBeNull();
    expect(readShot({ id: 'a', b: 'earth', p: [1, 2, Infinity], v: [0, 0, 1] })).toBeNull();
    expect(readShot({ id: 'a', b: 'earth', p: [1, 2, 3], v: [0, 0, 1e9] })).toBeNull();
    expect(readShot({ id: 7, b: 'earth', p: [1, 2, 3], v: [0, 0, 1] })).toBeNull();
    expect(readShot('boom')).toBeNull();
  });

  it('keeps the cruiser and the send time on a pose', () => {
    expect(readPose({ id: 'x', n: 1, s: 'flight', k: 'cruiser', t: 123 })).toMatchObject({ k: 'cruiser', t: 123 });
  });

  it('bounds the bolts waiting to be drawn', () => {
    const link = createRoomLink('me');
    for (let i = 0; i < 200; i++) pushShot(link, undefined, { id: 'a', b: 'earth', p: [0, 0, 0], v: [0, 0, 1] }, i);
    expect(link.shotsIn.length).toBeLessThanOrEqual(48);
  });
});

describe('remote fleet in flight', () => {
  const earth = { id: 'earth', position: new THREE.Vector3(10, 0, 0), radius: 1 } as unknown as FlightBody;
  const camera = () => {
    const c = new THREE.PerspectiveCamera(60, 1.5, 0.0001, 1000);
    c.position.set(10, 0, 5);
    c.lookAt(10, 0, 0);
    return c;
  };

  it('draws another ship\'s bolt at its body when its delay is up, then retires it', () => {
    const fleet = makeRemoteFleet();
    const link = createRoomLink('me');
    link.code = 'K7M2Q';
    pushShot(link, undefined, { id: 'a', b: 'earth', p: [1, 2, 3], v: [0, 0, 10] }, 1000);
    const lit = () => fleet.group.children.filter((o) => o instanceof THREE.Mesh && o.visible);
    fleet.update(link, [earth], camera(), 1100);
    expect(lit()).toHaveLength(0); // not yet: drawn with the ship's delay
    fleet.update(link, [earth], camera(), 1000 + RENDER_DELAY_MS + 1);
    expect(lit()).toHaveLength(1);
    expect(lit()[0].position.x).toBeCloseTo(11);
    expect(lit()[0].position.z).toBeCloseTo(3.01);
    fleet.update(link, [earth], camera(), 1000 + RENDER_DELAY_MS + 51);
    expect(lit()[0].position.z).toBeCloseTo(3.51);
    for (let t = 1400; t < 2400; t += 90) fleet.update(link, [earth], camera(), t);
    expect(lit()).toHaveLength(0);
    expect(link.shotsIn).toHaveLength(0);
    fleet.dispose();
  });

  it('queues this ship\'s bolts body-relative, only while in a room', () => {
    const link = createRoomLink('me');
    queueShot(link, new THREE.Vector3(12, 0, 0), new THREE.Vector3(0, 1, 0), [earth]);
    expect(link.shotsOut).toHaveLength(0);
    link.code = 'K7M2Q';
    for (let i = 0; i < 9; i++) queueShot(link, new THREE.Vector3(12, 0, 0), new THREE.Vector3(0, 1, 0), [earth]);
    expect(link.shotsOut.length).toBeLessThanOrEqual(4);
    expect(link.shotsOut[0]).toMatchObject({ b: 'earth', p: [2, 0, 0], v: [0, 1, 0] });
  });

  it('puts a pilot behind the camera at the screen\'s edge, and fades one gone quiet', () => {
    const fleet = makeRemoteFleet();
    const link = createRoomLink('me');
    link.code = 'K7M2Q';
    const peer: Peer = { id: 'p', name: 'Nino', samples: [], lastSeq: -1 };
    link.peers.set('p', peer);
    // Behind the camera (it looks down -z from z=5; the ship is at z=8).
    pushSample(peer, { id: 'p', n: 1, s: 'flight', b: 'earth', p: [0.5, 0, 8], q: [0, 0, 0, 1], t: 0 }, 0);
    fleet.update(link, [earth], camera(), 1000);
    const blip = link.view.pilots[0];
    expect(blip).toMatchObject({ id: 'p', name: 'Nino', onScreen: false, alpha: 1 });
    expect(Math.max(Math.abs(blip.x), Math.abs(blip.y))).toBeCloseTo(1);
    expect(blip.x).toBeGreaterThan(0); // behind and to the right: the arrow is on the right
    fleet.update(link, [earth], camera(), STALE_MS + FADE_MS + 10);
    expect(link.view.pilots).toHaveLength(0);
    fleet.dispose();
  });
});
