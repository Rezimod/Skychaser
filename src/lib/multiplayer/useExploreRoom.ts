'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { connectRealtime, realtimeConfig, type Channel, type PresenceState, type RealtimeClient } from '@/lib/multiplayer/realtime';
import { makeRoomCode, normalizeRoomCode, pushSample, readPose, type RoomLink, type Scene } from '@/lib/multiplayer/room-link';

export const ROOM_MAX = 8;
const SEND_EVERY_MS = 200;
const KEEPALIVE_MS = 2000;

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
}

export type RoomStatus = 'unconfigured' | 'signedOut' | 'idle' | 'connecting' | 'joined';
export type RoomError = 'full' | null;

interface RoomMeta {
  name: string;
  scene: Scene;
  world: string;
  joinedAt: number;
  epoch: number;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.slice(0, 40) : fallback);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const scene = (v: unknown): Scene => (v === 'flight' || v === 'surface' ? v : 'orbit');

/** The first meta each explorer tracked — one per key, whatever tabs they have open. */
function firstMetas(state: PresenceState) {
  return Object.entries(state).flatMap(([key, metas]) => (metas[0] ? [{ key, meta: metas[0] }] : []));
}

export function useExploreRoom(link: RoomLink, opts: { name: string; epochMs: number; watchLobby: boolean; onEpoch: (ms: number) => void }) {
  const { authenticated, ready } = usePrivy();
  const config = realtimeConfig();
  const [code, setCode] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [error, setError] = useState<RoomError>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const roomRef = useRef<Channel | null>(null);
  const lobbyRef = useRef<Channel | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const metaRef = useRef<RoomMeta | null>(null);

  const wantSocket = !!config && authenticated && (code !== null || opts.watchLobby);
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
  }, [wantSocket, config?.url, config?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The lobby lists the rooms that are open: every member advertises its
  // room code there, and the list is those codes counted.
  const inLobby = wantSocket;
  useEffect(() => {
    const client = clientRef.current;
    if (!inLobby || !client) return;
    const lobby = client.channel('explore-lobby', link.self.id);
    lobbyRef.current = lobby;
    lobby.onPresence((state) => {
      const byCode = new Map<string, { host: string; at: number; count: number }>();
      for (const { meta } of firstMetas(state)) {
        const c = normalizeRoomCode(str(meta.room));
        if (!c) continue;
        const at = num(meta.joinedAt);
        const r = byCode.get(c);
        if (!r) byCode.set(c, { host: str(meta.name), at, count: 1 });
        else {
          r.count += 1;
          if (at < r.at) { r.at = at; r.host = str(meta.name); }
        }
      }
      setRooms([...byCode].map(([c, r]) => ({ code: c, host: r.host, count: r.count })).sort((a, b) => b.count - a.count).slice(0, 20));
    });
    return () => {
      lobby.leave();
      lobbyRef.current = null;
    };
  }, [inLobby, link]);

  useEffect(() => {
    const client = clientRef.current;
    if (!code || !client) return;
    setJoined(false);
    setError(null);
    link.peers.clear();
    link.code = code;
    const joinedAt = Date.now();
    const meta: RoomMeta = { name: optsRef.current.name, scene: link.self.s, world: link.self.w ?? '', joinedAt, epoch: optsRef.current.epochMs };
    metaRef.current = meta;
    const room = client.channel(`explore-room-${code}`, link.self.id);
    roomRef.current = room;
    let firstSync = true;
    room.onStatus((s) => {
      setJoined(s === 'joined');
      if (s === 'joined') room.track({ ...meta });
    });
    room.onPresence((state) => {
      const members = firstMetas(state).map(({ key, meta: m }) => ({
        id: key, name: str(m.name, '?'), scene: scene(m.scene), world: str(m.world), joinedAt: num(m.joinedAt), epoch: num(m.epoch), self: key === link.self.id,
      })).sort((a, b) => a.joinedAt - b.joinedAt);
      const mine = members.findIndex((m) => m.self);
      if (mine >= ROOM_MAX) {
        setError('full');
        setCode(null);
        return;
      }
      if (firstSync && mine >= 0) {
        firstSync = false;
        // Everyone in a room sees the planets where the room's first explorer had them.
        const first = members[0];
        if (!first.self && first.epoch) optsRef.current.onEpoch(first.epoch);
      }
      for (const id of [...link.peers.keys()]) if (!members.some((m) => m.id === id)) link.peers.delete(id);
      for (const m of members) {
        const p = link.peers.get(m.id);
        if (p) p.name = m.name;
      }
      setRoster(members.map(({ epoch: _epoch, ...m }) => m));
    });
    room.onBroadcast('pose', (payload) => {
      const msg = readPose(payload);
      if (!msg || msg.id === link.self.id) return;
      let peer = link.peers.get(msg.id);
      if (!peer) {
        peer = { id: msg.id, name: '', samples: [], lastSeq: -1 };
        link.peers.set(msg.id, peer);
      }
      pushSample(peer, msg, performance.now());
    });
    lobbyRef.current?.track({ room: code, name: meta.name, joinedAt });

    let lastSent = 0;
    let lastJson = '';
    const timer = window.setInterval(() => {
      const now = performance.now();
      const self = link.self;
      // Where this explorer is goes into presence too, for the room list.
      if (self.s !== meta.scene || (self.w ?? '') !== meta.world) {
        meta.scene = self.s;
        meta.world = self.w ?? '';
        room.track({ ...meta });
      }
      const { n: _n, ...pose } = self;
      const json = JSON.stringify(pose);
      if ((json !== lastJson && now - lastSent >= SEND_EVERY_MS) || now - lastSent >= KEEPALIVE_MS) {
        self.n += 1;
        room.send('pose', { ...self });
        lastSent = now;
        lastJson = json;
      }
    }, 50);

    return () => {
      window.clearInterval(timer);
      room.leave();
      roomRef.current = null;
      lobbyRef.current?.track({ room: '', name: meta.name, joinedAt: 0 });
      link.peers.clear();
      link.code = null;
      setRoster([]);
      setJoined(false);
    };
  }, [code, link, wantSocket]);

  // The name can arrive after the room was joined (the profile loads late).
  useEffect(() => {
    const meta = metaRef.current;
    if (!meta || !code || meta.name === opts.name) return;
    meta.name = opts.name;
    roomRef.current?.track({ ...meta });
    lobbyRef.current?.track({ room: code, name: meta.name, joinedAt: meta.joinedAt });
  }, [opts.name, code]);

  // The room goes in the address bar, so the page can be shared as the invite.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    window.history.replaceState(window.history.state, '', url);
  }, [code]);

  const create = useCallback(() => setCode(makeRoomCode()), []);
  const join = useCallback((raw: string) => {
    const c = normalizeRoomCode(raw);
    if (c) setCode(c);
    return !!c;
  }, []);
  const leave = useCallback(() => setCode(null), []);

  let status: RoomStatus;
  if (!config) status = 'unconfigured';
  else if (!ready || !authenticated) status = 'signedOut';
  else if (!code) status = 'idle';
  else status = joined ? 'joined' : 'connecting';

  return { status, code, roster, rooms, error, create, join, leave, clearError: () => setError(null) };
}
