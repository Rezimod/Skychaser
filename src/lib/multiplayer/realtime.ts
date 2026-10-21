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
  }

  const nextRef = () => String(++ref);
  const push = (f: Frame) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(f));
  };

  const join = (c: ChannelState) => {
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
    if (f.event === 'phx_reply' && f.ref === c.joinRef) {
      const ok = (f.payload as { status?: string }).status === 'ok';
      c.joined = ok;
      c.statusCbs.forEach((cb) => cb(ok ? 'joined' : 'error'));
      if (ok) sendTrack(c);
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
      c.joined = false;
      c.statusCbs.forEach((cb) => cb('error'));
      if (!closed) window.setTimeout(() => channels.has(c.topic) && join(c), 2000);
    }
  };

  const open = () => {
    if (closed) return;
    let sock: WebSocket;
    try {
      sock = new WebSocket(endpoint);
    } catch {
      reconnectTimer = window.setTimeout(open, Math.min(15_000, 500 * 2 ** retry++));
      return;
    }
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      channels.forEach(join);
      heartbeat = window.setInterval(() => push({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() }), HEARTBEAT_MS);
    };
    sock.onmessage = (e) => {
      try { onFrame(JSON.parse(String(e.data)) as Frame); } catch { /* not a frame */ }
    };
    sock.onclose = () => {
      window.clearInterval(heartbeat);
      if (ws !== sock) return;
      ws = null;
      channels.forEach((c) => {
        c.joined = false;
        c.presence = {};
        c.statusCbs.forEach((cb) => cb('joining'));
      });
      if (closed) return;
      const delay = Math.min(15_000, 500 * 2 ** retry++);
      reconnectTimer = window.setTimeout(open, delay);
    };
  };
  open();

  return {
    channel(name, presenceKey) {
      const topic = `realtime:${name}`;
      const c: ChannelState = {
        topic, presenceKey, joinRef: '', joined: false, meta: null, presence: {},
        broadcast: new Map(), presenceCbs: [], statusCbs: [],
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
          push({ topic, event: 'phx_leave', ref: nextRef(), join_ref: c.joinRef, payload: {} });
          channels.delete(topic);
        },
      };
    },
    close() {
      closed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeat);
      channels.forEach((c) => push({ topic: c.topic, event: 'phx_leave', ref: nextRef(), join_ref: c.joinRef, payload: {} }));
      channels.clear();
      ws?.close();
      ws = null;
    },
  };
}
