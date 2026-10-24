// A stand-in for Supabase Realtime, for trying multiplayer on one machine:
// the Phoenix v1 JSON frames the game's client speaks (phx_join, phx_leave,
// heartbeat, presence track with presence_state / presence_diff, and
// broadcast fan-out), and nothing else. No auth: every key is accepted.
//
//   node scripts/fake-realtime.mjs [port]        (default 54321)
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dev npx next build
//
// The hub is exported on its own so the unit tests can run the real hook
// against it without a socket.

/**
 * @typedef {{ send: (text: string) => void }} Conn
 * @typedef {{ joinRef: string, key: string, meta: Record<string, unknown> | null, ref: string | null }} Member
 */

export function createHub() {
  /** @type {Map<string, Map<Conn, Member>>} */
  const topics = new Map();
  let refs = 0;

  /** @param {Conn} conn @param {string} topic @param {string} event @param {unknown} payload @param {string | null} ref @param {string | null} joinRef */
  const out = (conn, topic, event, payload, ref = null, joinRef = null) => {
    try { conn.send(JSON.stringify({ topic, event, payload, ref, join_ref: joinRef })); } catch { /* gone */ }
  };
  /** @param {Member} m */
  const entry = (m) => ({ [m.key]: { metas: [{ ...m.meta, phx_ref: m.ref }] } });

  /** Tell everyone on a topic what joined and left. */
  const diff = (topic, joins, leaves) => {
    const members = topics.get(topic);
    if (!members) return;
    for (const [c, m] of members) out(c, topic, 'presence_diff', { joins, leaves }, null, m.joinRef);
  };

  /** @param {Conn} conn @param {string} topic */
  const leave = (conn, topic) => {
    const members = topics.get(topic);
    const m = members?.get(conn);
    if (!members || !m) return;
    members.delete(conn);
    if (!members.size) topics.delete(topic);
    if (m.meta) diff(topic, {}, entry(m));
  };

  return {
    /** @param {Conn} conn @param {string} text */
    receive(conn, text) {
      let f;
      try { f = JSON.parse(text); } catch { return; }
      if (!f || typeof f.topic !== 'string' || typeof f.event !== 'string') return;
      const { topic, event, payload, ref } = f;
      const joinRef = f.join_ref ?? null;
      if (topic === 'phoenix' && event === 'heartbeat') { out(conn, 'phoenix', 'phx_reply', { status: 'ok', response: {} }, ref); return; }
      if (event === 'phx_join') {
        leave(conn, topic);
        const key = String(payload?.config?.presence?.key ?? `anon-${++refs}`);
        let members = topics.get(topic);
        if (!members) topics.set(topic, (members = new Map()));
        members.set(conn, { joinRef: joinRef ?? ref, key, meta: null, ref: null });
        out(conn, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }, ref, joinRef);
        const state = {};
        for (const m of members.values()) {
          if (!m.meta) continue;
          (state[m.key] ??= { metas: [] }).metas.push({ ...m.meta, phx_ref: m.ref });
        }
        out(conn, topic, 'presence_state', state, null, joinRef);
        return;
      }
      const members = topics.get(topic);
      const me = members?.get(conn);
      if (event === 'phx_leave') {
        leave(conn, topic);
        out(conn, topic, 'phx_reply', { status: 'ok', response: {} }, ref, joinRef);
        return;
      }
      if (!members || !me) return;
      if (event === 'presence' && payload?.event === 'track') {
        const leaves = me.meta ? entry(me) : {};
        me.meta = payload.payload && typeof payload.payload === 'object' ? payload.payload : {};
        me.ref = `p${++refs}`;
        diff(topic, entry(me), leaves);
      } else if (event === 'broadcast') {
        for (const [c, m] of members) if (c !== conn) out(c, topic, 'broadcast', payload, null, m.joinRef);
      }
    },
    /** @param {Conn} conn */
    close(conn) {
      for (const topic of [...topics.keys()]) leave(conn, topic);
    },
    /** Who is on a topic, for tests. @param {string} topic */
    members(topic) {
      return [...(topics.get(topic)?.values() ?? [])].map((m) => ({ key: m.key, meta: m.meta }));
    },
  };
}

// Run as a script: a websocket server on the port Realtime's URL points at.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { WebSocketServer } = await import('ws');
  const port = Number(process.argv[2] ?? 54321);
  const hub = createHub();
  const wss = new WebSocketServer({ port, path: '/realtime/v1/websocket' });
  let n = 0;
  wss.on('connection', (ws) => {
    const id = ++n;
    console.log(`[fake-realtime] socket ${id} open`);
    ws.on('message', (data) => hub.receive(ws, String(data)));
    ws.on('close', () => { hub.close(ws); console.log(`[fake-realtime] socket ${id} closed`); });
  });
  console.log(`[fake-realtime] ws://localhost:${port}/realtime/v1/websocket`);
}
