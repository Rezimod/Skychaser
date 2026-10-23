// A small Supabase Realtime client: one socket, any number of channels, each
// with broadcast and presence. It speaks the Phoenix v1 JSON protocol the
// Realtime server uses, so the app carries no SDK for it.

type Json = Record<string, unknown>;

interface Frame {
  topic: string;
  event: string;
  payload: Json;
  ref: string | null;
  join_ref?: string | null;
}

export interface PresenceMeta extends Json {
  phx_ref?: string;
}
/** Presence key → the metas tracked under it (one per open tab). */
export type PresenceState = Record<string, PresenceMeta[]>;

export interface Channel {
  /** Publish this client's presence; re-sent after every reconnect. */
  track: (meta: Json) => void;
  send: (event: string, payload: Json) => void;
  onBroadcast: (event: string, cb: (payload: Json) => void) => void;
  onPresence: (cb: (state: PresenceState) => void) => void;
  onStatus: (cb: (status: 'joining' | 'joined' | 'error') => void) => void;
  leave: () => void;
}

export interface RealtimeClient {
  channel: (name: string, presenceKey: string) => Channel;
  close: () => void;
}

const HEARTBEAT_MS = 25_000;
/** No frame at all (not even a heartbeat reply) for this long: the socket is dead. */
const STALE_MS = HEARTBEAT_MS * 2;
/** A join the server never answers counts as failed after this long. */
const JOIN_TIMEOUT_MS = 10_000;
const REJOIN_BASE_MS = 1000;
const REJOIN_MAX_MS = 30_000;
const RECONNECT_MAX_MS = 15_000;

export function realtimeConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export function connectRealtime(url: string, key: string): RealtimeClient {
  const endpoint = `${url.replace(/^http/, 'ws').replace(/\/$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
  let ws: WebSocket | null = null;
  let ref = 0;
  let closed = false;
  let retry = 0;
  let heartbeat = 0;
  let reconnectTimer = 0;
  /** When the current socket last heard anything from the server (Date.now: it keeps counting while a phone sleeps). */
  let lastFrameAt = 0;
  const channels = new Map<string, ChannelState>();

  interface ChannelState {
    topic: string;
    presenceKey: string;
    joinRef: string;
    joined: boolean;
    meta: Json | null;
    presence: PresenceState;
    broadcast: Map<string, ((p: Json) => void)[]>;
    presenceCbs: ((s: PresenceState) => void)[];
    statusCbs: ((s: 'joining' | 'joined' | 'error') => void)[];
    /** The one pending rejoin, if any; failed joins in a row, for the backoff. */
    rejoinTimer: number;
    rejoinAttempts: number;
    joinTimer: number;
  }

  const nextRef = () => String(++ref);
  const push = (f: Frame) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(f));
  };
  const clearTimers = (c: ChannelState) => {
    window.clearTimeout(c.rejoinTimer);
    window.clearTimeout(c.joinTimer);
    c.rejoinTimer = 0;
    c.joinTimer = 0;
  };
  const live = (c: ChannelState) => !closed && channels.get(c.topic) === c;

  const join = (c: ChannelState) => {
    clearTimers(c);
    c.joinRef = nextRef();
    c.joined = false;
    c.statusCbs.forEach((cb) => cb('joining'));
    push({
      topic: c.topic, event: 'phx_join', ref: c.joinRef, join_ref: c.joinRef,
      payload: {
        config: { broadcast: { ack: false, self: false }, presence: { key: c.presenceKey, enabled: true }, postgres_changes: [], private: false },
        access_token: key,
      },
    });
    const joinRef = c.joinRef;
    c.joinTimer = window.setTimeout(() => {
      c.joinTimer = 0;
      if (live(c) && !c.joined && c.joinRef === joinRef) failJoin(c);
    }, JOIN_TIMEOUT_MS);
  };
  /** One rejoin per channel at a time, backing off while the server keeps refusing it. */
  const scheduleRejoin = (c: ChannelState) => {
    if (!live(c) || c.rejoinTimer) return;
    const base = Math.min(REJOIN_MAX_MS, REJOIN_BASE_MS * 2 ** c.rejoinAttempts);
    c.rejoinAttempts += 1;
    c.rejoinTimer = window.setTimeout(() => {
      c.rejoinTimer = 0;
      // A socket that is down rejoins every channel when it opens again.
      if (live(c) && ws?.readyState === WebSocket.OPEN) join(c);
    }, base * (0.75 + Math.random() * 0.5));
  };
  const failJoin = (c: ChannelState) => {
    window.clearTimeout(c.joinTimer);
    c.joinTimer = 0;
    c.joined = false;
    c.statusCbs.forEach((cb) => cb('error'));
    scheduleRejoin(c);
  };
  const sendTrack = (c: ChannelState) => {
    if (!c.joined || !c.meta) return;
    push({ topic: c.topic, event: 'presence', ref: nextRef(), join_ref: c.joinRef, payload: { type: 'presence', event: 'track', payload: c.meta } });
  };

  const applyPresence = (c: ChannelState, joins: Json, leaves: Json) => {
    for (const [k, v] of Object.entries(leaves)) {
      const gone = new Set(((v as { metas: PresenceMeta[] }).metas ?? []).map((m) => m.phx_ref));
      const left = (c.presence[k] ?? []).filter((m) => !gone.has(m.phx_ref));
      if (left.length) c.presence[k] = left;
      else delete c.presence[k];
    }
    for (const [k, v] of Object.entries(joins)) {
      const metas = (v as { metas: PresenceMeta[] }).metas ?? [];
      const known = new Set((c.presence[k] ?? []).map((m) => m.phx_ref));
      c.presence[k] = [...(c.presence[k] ?? []), ...metas.filter((m) => !known.has(m.phx_ref))];
    }
    const snapshot = { ...c.presence };
    c.presenceCbs.forEach((cb) => cb(snapshot));
  };

  const onFrame = (f: Frame) => {
    const c = channels.get(f.topic);
    if (!c) return;
    // A frame from an earlier join of this topic (a leave's close, an old error) is not about this one.
    const current = !f.join_ref || f.join_ref === c.joinRef;
    if (f.event === 'phx_reply' && f.ref === c.joinRef) {
      if (c.joined) return;
      const ok = (f.payload as { status?: string }).status === 'ok';
      if (!ok) {
        failJoin(c);
        return;
      }
      clearTimers(c);
      c.rejoinAttempts = 0;
      c.joined = true;
      c.statusCbs.forEach((cb) => cb('joined'));
      sendTrack(c);
    } else if (!current) {
      return;
    } else if (f.event === 'broadcast') {
      const p = f.payload as { event?: string; payload?: Json };
      if (p.event && p.payload) c.broadcast.get(p.event)?.forEach((cb) => cb(p.payload!));
    } else if (f.event === 'presence_state') {
      c.presence = {};
      applyPresence(c, f.payload, {});
    } else if (f.event === 'presence_diff') {
      const d = f.payload as { joins?: Json; leaves?: Json };
      applyPresence(c, d.joins ?? {}, d.leaves ?? {});
    } else if (f.event === 'phx_error' || f.event === 'phx_close') {
      if (!c.joinRef) return;
      failJoin(c);
    }
  };

  /** This socket is done (closed, or found dead): forget it and dial again. */
  const lost = (sock: WebSocket, now = false) => {
    if (ws !== sock) return;
    window.clearInterval(heartbeat);
    heartbeat = 0;
    ws = null;
    sock.onopen = null;
    sock.onmessage = null;
    sock.onclose = null;
    sock.onerror = null;
    try { sock.close(); } catch { /* already closing */ }
    channels.forEach((c) => {
      clearTimers(c);
      c.joined = false;
      c.presence = {};
      c.statusCbs.forEach((cb) => cb('joining'));
    });
    if (closed) return;
    window.clearTimeout(reconnectTimer);
    const delay = now ? 0 : Math.min(RECONNECT_MAX_MS, 500 * 2 ** retry++);
    reconnectTimer = window.setTimeout(open, delay);
  };
  const isStale = () => !!ws && ws.readyState === WebSocket.OPEN && Date.now() - lastFrameAt > STALE_MS;

  const open = () => {
    reconnectTimer = 0;
    if (closed || ws) return;
    let sock: WebSocket;
    try {
      sock = new WebSocket(endpoint);
    } catch {
      reconnectTimer = window.setTimeout(open, Math.min(RECONNECT_MAX_MS, 500 * 2 ** retry++));
      return;
    }
    ws = sock;
    lastFrameAt = Date.now();
    sock.onopen = () => {
      if (ws !== sock) return;
      retry = 0;
      lastFrameAt = Date.now();
      channels.forEach(join);
      window.clearInterval(heartbeat);
      heartbeat = window.setInterval(() => {
        if (ws !== sock) return;
        // Half-open sockets (a phone that slept, a network that changed) never close by themselves.
        if (isStale()) { lost(sock, true); return; }
        push({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
      }, HEARTBEAT_MS);
    };
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      lastFrameAt = Date.now();
      try { onFrame(JSON.parse(String(e.data)) as Frame); } catch { /* not a frame */ }
    };
    sock.onclose = () => lost(sock);
  };

  // Back on screen: a socket that went quiet while the page was hidden is
  // replaced now, and a reconnect that was backing off goes at once.
  const onVisible = () => {
    if (closed || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (ws && isStale()) lost(ws, true);
    else if (!ws && reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      retry = 0;
      open();
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  open();

  return {
    channel(name, presenceKey) {
      const topic = `realtime:${name}`;
      const prev = channels.get(topic);
      if (prev) clearTimers(prev);
      const c: ChannelState = {
        topic, presenceKey, joinRef: '', joined: false, meta: null, presence: {},
        broadcast: new Map(), presenceCbs: [], statusCbs: [], rejoinTimer: 0, rejoinAttempts: 0, joinTimer: 0,
      };
      channels.set(topic, c);
      if (ws?.readyState === WebSocket.OPEN) join(c);
      return {
        track(meta) { c.meta = meta; sendTrack(c); },
        send(event, payload) {
          if (c.joined) push({ topic, event: 'broadcast', ref: null, join_ref: c.joinRef, payload: { type: 'broadcast', event, payload } });
        },
        onBroadcast(event, cb) { c.broadcast.set(event, [...(c.broadcast.get(event) ?? []), cb]); },
        onPresence(cb) { c.presenceCbs.push(cb); },
        onStatus(cb) { c.statusCbs.push(cb); },
        leave() {
          clearTimers(c);
          if (channels.get(topic) !== c) return;
          if (c.joinRef) push({ topic, event: 'phx_leave', ref: nextRef(), join_ref: c.joinRef, payload: {} });
          channels.delete(topic);
          c.joined = false;
        },
      };
    },
    close() {
      if (closed) return;
      closed = true;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeat);
      channels.forEach((c) => {
        clearTimers(c);
        push({ topic: c.topic, event: 'phx_leave', ref: nextRef(), join_ref: c.joinRef, payload: {} });
      });
      channels.clear();
      const sock = ws;
      ws = null;
      if (sock) {
        sock.onopen = null;
        sock.onmessage = null;
        sock.onclose = null;
        try { sock.close(); } catch { /* already closing */ }
      }
    },
  };
}
