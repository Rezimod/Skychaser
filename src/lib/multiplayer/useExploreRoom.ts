'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectRealtime, realtimeConfig, type Channel, type PresenceState, type RealtimeClient } from '@/lib/multiplayer/realtime';
import { makeRoomCode, normalizeRoomCode, pushSample, pushShot, readPose, readShot, type RoomLink, type Scene } from '@/lib/multiplayer/room-link';

export const ROOM_MAX = 8;
const SEND_EVERY_MS = 200;
const KEEPALIVE_MS = 2000;
/** At most this often a bolt goes out; more than a few waiting and the oldest are dropped. */
const SHOT_GAP_MS = 100;
const SHOTS_WAITING = 3;
/** Quick play waits this long for the lobby to say which rooms are open, then opens one. */
const SEEK_WAIT_MS = 4000;
/** A join not through by now says so (it keeps trying underneath). */
const UNREACHABLE_MS = 12_000;

export interface RosterEntry {
  id: string;
  name: string;
  scene: Scene;
  world: string;
  joinedAt: number;
  self: boolean;
}

export interface OpenRoom {
  code: string;
  host: string;
  count: number;
  /** Who is in it and where, the earliest first (a few at most). */
  members: { name: string; scene: Scene; world: string }[];
}

export type RoomStatus = 'unconfigured' | 'idle' | 'seeking' | 'connecting' | 'joined' | 'reconnecting';
export type RoomError = 'full' | 'unreachable' | null;
/** How a room was come to: it decides whether the room is listed for others. */
type Intent = 'quick' | 'list' | 'private' | 'code';

interface RoomMeta {
  name: string;
  scene: Scene;
  world: string;
  joinedAt: number;
  epoch: number;
  /** Listed in the lobby and open to quick play. */
  pub: boolean;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.slice(0, 40) : fallback);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const scene = (v: unknown): Scene => (v === 'flight' || v === 'surface' ? v : 'orbit');

/** The first meta each explorer tracked — one per key, whatever tabs they have open. */
function firstMetas(state: PresenceState) {
  return Object.entries(state).flatMap(([key, metas]) => (metas[0] ? [{ key, meta: metas[0] }] : []));
}

/** The public rooms a lobby's presence advertises, busiest first. A room
 *  whose explorers all marked it private is left out. */
export function roomsFromLobby(state: PresenceState): OpenRoom[] {
  const byCode = new Map<string, { pub: boolean; list: { name: string; scene: Scene; world: string; at: number }[] }>();
  for (const { meta } of firstMetas(state)) {
    const c = normalizeRoomCode(str(meta.room));
    if (!c) continue;
    let r = byCode.get(c);
    if (!r) byCode.set(c, (r = { pub: false, list: [] }));
    // An older client says nothing: its rooms were all listed.
    if (meta.pub !== false) r.pub = true;
    r.list.push({ name: str(meta.name, '?'), scene: scene(meta.s), world: str(meta.w), at: num(meta.joinedAt) });
  }
  return [...byCode]
    .filter(([, r]) => r.pub)
    .map(([code, r]) => {
      const list = r.list.sort((a, b) => a.at - b.at);
      return { code, host: list[0].name, count: list.length, members: list.slice(0, 4).map(({ name, scene: s, world }) => ({ name, scene: s, world })) };
    })
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 20);
}

/** Where quick play goes: the busiest public room with a seat, or null to open one. */
export function pickQuickRoom(rooms: OpenRoom[], exclude: ReadonlySet<string> = new Set()): string | null {
  const open = rooms.filter((r) => r.count < ROOM_MAX && !exclude.has(r.code));
  return open.length ? open[0].code : null;
}

/** A state setter that keeps the old value (and skips the render) when the new one reads the same. */
function setIfChanged<T>(set: (fn: (prev: T) => T) => void, next: T) {
  const json = JSON.stringify(next);
  set((prev) => (JSON.stringify(prev) === json ? prev : next));
}

/**
 * The room this explorer flies in. Nobody has to sign in: `name` is the
 * account's name or the guest's callsign. `create` opens a private room
 * (shared by code or link), `quickPlay` joins the busiest public one with a
 * seat or opens a public one, `join` takes a code or a listed room.
 */
export function useExploreRoom(link: RoomLink, opts: { name: string; epochMs: number; watchLobby: boolean; onEpoch: (ms: number) => void }) {
  const config = realtimeConfig();
  const [code, setCode] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  /** This room was joined once: a drop now reads as reconnecting, not joining. */
  const [wasJoined, setWasJoined] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [lobbyReady, setLobbyReady] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [error, setError] = useState<RoomError>(null);
  /** Bumped by Retry: a fresh socket. */
  const [attempt, setAttempt] = useState(0);
  const clientRef = useRef<RealtimeClient | null>(null);
  const roomRef = useRef<Channel | null>(null);
  const lobbyRef = useRef<Channel | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const metaRef = useRef<RoomMeta | null>(null);
  const intentRef = useRef<Intent>('code');
  /** Rooms quick play found full this time round. */
  const excludeRef = useRef(new Set<string>());
  /** What this explorer advertises in the lobby while in a room (re-sent if the lobby channel is made again). */
  const advertRef = useRef<Record<string, unknown> | null>(null);
  /** The lobby's last presence, kept while nobody is looking at the list. */
  const lobbyStateRef = useRef<PresenceState | null>(null);

  const wantSocket = !!config && (code !== null || opts.watchLobby || seeking);
  useEffect(() => {
    if (!wantSocket || !config) return;
    const client = connectRealtime(config.url, config.key);
    clientRef.current = client;
    return () => {
      client.close();
      clientRef.current = null;
      roomRef.current = null;
      lobbyRef.current = null;
    };
  }, [wantSocket, config?.url, config?.key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const advertise = useCallback((meta: RoomMeta, room: string) => {
    advertRef.current = { room, name: meta.name, joinedAt: meta.joinedAt, pub: meta.pub, s: meta.scene, w: meta.world };
    lobbyRef.current?.track({ ...advertRef.current });
  }, []);

  // The lobby lists the rooms that are open: every member advertises its
  // room code there, and the list is those codes counted. The channel is
  // joined while in a room too (that is how the room is advertised, and
  // presence cannot be tracked without joining), but the list only turns
  // into state while the lobby is on screen: a change in some other room
  // must not re-render a game in progress.
  useEffect(() => {
    const client = clientRef.current;
    if (!wantSocket || !client) return;
    const lobby = client.channel('explore-lobby', link.self.id);
    lobbyRef.current = lobby;
    let grace = 0;
    lobby.onPresence((state) => {
      lobbyStateRef.current = state;
      setLobbyReady(true);
      if (optsRef.current.watchLobby) setIfChanged(setRooms, roomsFromLobby(state));
    });
    // A server that sends no presence for an empty lobby: joined is enough to go on.
    lobby.onStatus((s) => {
      window.clearTimeout(grace);
      if (s === 'joined') grace = window.setTimeout(() => setLobbyReady(true), 700);
    });
    if (advertRef.current) lobby.track({ ...advertRef.current });
    return () => {
      window.clearTimeout(grace);
      lobby.leave();
      lobbyRef.current = null;
      lobbyStateRef.current = null;
      setLobbyReady(false);
    };
  }, [wantSocket, link, attempt]);
  // The list opened again: from what the lobby last said, not from a fresh diff.
  useEffect(() => {
    const state = lobbyStateRef.current;
    if (opts.watchLobby && state) setIfChanged(setRooms, roomsFromLobby(state));
  }, [opts.watchLobby]);

  // Quick play: once the lobby has spoken (or has not, in time), the busiest
  // public room with a seat, or a new public one.
  useEffect(() => {
    if (!seeking) return;
    const decide = () => {
      const state = lobbyStateRef.current;
      const pick = state ? pickQuickRoom(roomsFromLobby(state), excludeRef.current) : null;
      intentRef.current = 'quick';
      setSeeking(false);
      setCode(pick ?? makeRoomCode());
    };
    if (lobbyReady) { decide(); return; }
    const id = window.setTimeout(decide, SEEK_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [seeking, lobbyReady]);

  useEffect(() => {
    const client = clientRef.current;
    if (!code || !client) return;
    setJoined(false);
    setWasJoined(false);
    link.peers.clear();
    link.shotsIn.length = 0;
    link.shotsOut.length = 0;
    link.code = code;
    const intent = intentRef.current;
    const joinedAt = Date.now();
    const meta: RoomMeta = {
      name: optsRef.current.name, scene: link.self.s, world: link.self.w ?? '', joinedAt, epoch: optsRef.current.epochMs,
      pub: intent === 'quick' || intent === 'list',
    };
    metaRef.current = meta;
    const room = client.channel(`explore-room-${code}`, link.self.id);
    roomRef.current = room;
    let firstSync = true;
    let alive = true;
    /** Names by presence key, for a pose that arrives before its sender's presence is applied. */
    const names = new Map<string, string>();
    const slow = window.setTimeout(() => { if (alive) setError((e) => e ?? 'unreachable'); }, UNREACHABLE_MS);
    room.onStatus((s) => {
      if (!alive) return;
      setJoined(s === 'joined');
      if (s === 'joined') {
        setWasJoined(true);
        setError((e) => (e === 'unreachable' ? null : e));
        window.clearTimeout(slow);
        room.track({ ...meta });
      }
    });
    room.onPresence((state) => {
      if (!alive) return;
      const members = firstMetas(state).map(({ key, meta: m }) => ({
        id: key, name: str(m.name, '?'), scene: scene(m.scene), world: str(m.world), joinedAt: num(m.joinedAt), epoch: num(m.epoch), pub: m.pub === true, self: key === link.self.id,
      })).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
      const mine = members.findIndex((m) => m.self);
      if (mine >= ROOM_MAX) {
        alive = false;
        if (intent === 'quick') {
          // Someone took the last seat first: on to the next room.
          excludeRef.current.add(code);
          setCode(null);
          setSeeking(true);
        } else {
          setError('full');
          setCode(null);
        }
        return;
      }
      if (firstSync && mine >= 0) {
        firstSync = false;
        const first = members[0];
        // Everyone in a room sees the planets where the room's first explorer had them.
        if (!first.self && first.epoch) optsRef.current.onEpoch(first.epoch);
        // Come in by code: the room is listed if the one who opened it listed it.
        if (intent === 'code' && !first.self && first.pub !== meta.pub) {
          meta.pub = first.pub;
          room.track({ ...meta });
          advertise(meta, code);
        }
      }
      names.clear();
      for (const m of members) names.set(m.id, m.name);
      for (const id of [...link.peers.keys()]) if (!names.has(id)) link.peers.delete(id);
      for (const m of members) {
        const p = link.peers.get(m.id);
        if (p) p.name = m.name;
      }
      setIfChanged(setRoster, members.map(({ epoch: _epoch, pub: _pub, ...m }) => m));
    });
    room.onBroadcast('pose', (payload) => {
      const msg = readPose(payload);
      if (!alive || !msg || msg.id === link.self.id) return;
      let peer = link.peers.get(msg.id);
      if (!peer) {
        peer = { id: msg.id, name: names.get(msg.id) ?? '', samples: [], lastSeq: -1 };
        link.peers.set(msg.id, peer);
      }
      pushSample(peer, msg, performance.now());
    });
    room.onBroadcast('shot', (payload) => {
      const msg = readShot(payload);
      if (!alive || !msg || msg.id === link.self.id) return;
      pushShot(link, link.peers.get(msg.id), msg, performance.now());
    });
    advertise(meta, code);

    let lastSent = 0;
    let lastShot = 0;
    let lastJson = '';
    const timer = window.setInterval(() => {
      const now = performance.now();
      const self = link.self;
      // Where this explorer is goes into presence too, for the room list.
      if (self.s !== meta.scene || (self.w ?? '') !== meta.world) {
        meta.scene = self.s;
        meta.world = self.w ?? '';
        room.track({ ...meta });
        advertise(meta, code);
      }
      const { n: _n, t: _t, ...pose } = self;
      const json = JSON.stringify(pose);
      if ((json !== lastJson && now - lastSent >= SEND_EVERY_MS) || now - lastSent >= KEEPALIVE_MS) {
        self.n += 1;
        self.t = Math.round(now);
        room.send('pose', { ...self });
        lastSent = now;
        lastJson = json;
      }
      const out = link.shotsOut;
      if (out.length > SHOTS_WAITING) out.splice(0, out.length - SHOTS_WAITING);
      if (out.length && now - lastShot >= SHOT_GAP_MS) {
        const shot = out.shift()!;
        room.send('shot', { ...shot, id: self.id, t: Math.round(now) });
        lastShot = now;
      }
    }, 50);

    return () => {
      alive = false;
      window.clearTimeout(slow);
      window.clearInterval(timer);
      room.leave();
      roomRef.current = null;
      advertRef.current = null;
      lobbyRef.current?.track({ room: '', name: meta.name, joinedAt: 0 });
      link.peers.clear();
      link.shotsIn.length = 0;
      link.shotsOut.length = 0;
      link.view.pilots = [];
      link.code = null;
      setRoster([]);
      setJoined(false);
    };
  }, [code, link, wantSocket, attempt, advertise]);

  // The name can arrive after the room was joined (the profile loads late), or be changed.
  useEffect(() => {
    const meta = metaRef.current;
    if (!meta || !code || meta.name === opts.name) return;
    meta.name = opts.name;
    roomRef.current?.track({ ...meta });
    advertise(meta, code);
  }, [opts.name, code, advertise]);

  // The room goes in the address bar, so the page can be shared as the invite.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    window.history.replaceState(window.history.state, '', url);
  }, [code]);

  const enter = useCallback((c: string, intent: Intent) => {
    intentRef.current = intent;
    excludeRef.current.clear();
    setError(null);
    setSeeking(false);
    setCode(c);
  }, []);
  const create = useCallback(() => enter(makeRoomCode(), 'private'), [enter]);
  const quickPlay = useCallback(() => {
    excludeRef.current.clear();
    setError(null);
    setCode(null);
    setSeeking(true);
  }, []);
  /** `listed`: picked from the open rooms (it stays listed), rather than typed or linked. */
  const join = useCallback((raw: string, listed = false) => {
    const c = normalizeRoomCode(raw);
    if (c) enter(c, listed ? 'list' : 'code');
    return !!c;
  }, [enter]);
  const leave = useCallback(() => { setSeeking(false); setCode(null); }, []);
  const clearError = useCallback(() => setError(null), []);
  /** A fresh socket, now, rather than waiting out the backoff. */
  const retry = useCallback(() => { setError(null); setAttempt((n) => n + 1); }, []);

  let status: RoomStatus;
  if (!config) status = 'unconfigured';
  else if (seeking) status = 'seeking';
  else if (!code) status = 'idle';
  else if (joined) status = 'joined';
  else status = wasJoined ? 'reconnecting' : 'connecting';

  // One object while nothing in it changed: it is handed down to the game's panels.
  return useMemo(
    () => ({ status, code, roster, rooms, error, create, quickPlay, join, leave, clearError, retry }),
    [status, code, roster, rooms, error, create, quickPlay, join, leave, clearError, retry],
  );
}
