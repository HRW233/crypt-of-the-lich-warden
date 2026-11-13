/* Static host for the game, the public run registry, and a hosted co-op relay.

   Two ways to carry co-op traffic:

     - server/lan.js or server/lance.mjs on one player's machine (fast, local)
     - this Worker (nothing to install, works from the published site)

   The Worker relay is a short-poll store in D1: a peer POSTs a message, the
   other peer polls for everything after the sequence number it has seen. It is
   slower than the local socket and it is billed per write, so the client drops
   its snapshot and input rates by half when it is talking to this instead of a
   relay on the LAN.
*/

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

// a run that stops announcing drops off the list after this long
const TTL_MS = 50000;
const MAX_ROOMS = 40;
// a host is "here" for this long after its last message
const HOST_FRESH_MS = 45000;
const MSG_KEEP_MS = 120000;
const MSG_LIMIT = 200;

let schemaReady = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS),
  });
}

function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/[^\x20-\x7e]/g, '')
    .slice(0, max)
    .trim();
}

function roomCode(v) {
  return clean(v, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function address(v) {
  const s = clean(v, 160).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return '';
  return s;
}

function peerName(v) {
  return clean(v, 24) || 'peer';
}

function parse(v) {
  try {
    return JSON.parse(v);
  } catch (err) {
    return null;
  }
}

async function ready(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS rooms (' +
        'code TEXT PRIMARY KEY, addr TEXT NOT NULL, name TEXT, host TEXT, ' +
        'floor INTEGER DEFAULT 1, room TEXT, players INTEGER DEFAULT 1, ' +
        'seen INTEGER NOT NULL, created INTEGER NOT NULL)'
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS peers (' +
        'code TEXT NOT NULL, peer TEXT NOT NULL, host INTEGER NOT NULL DEFAULT 0, ' +
        'seen INTEGER NOT NULL, PRIMARY KEY (code, peer))'
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS msgs (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, peer TEXT NOT NULL, ' +
        't TEXT NOT NULL, d TEXT, at INTEGER NOT NULL)'
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS msgs_code_id ON msgs (code, id)'),
  ]);
  schemaReady = true;
}

/* ---------------------------- the registry ---------------------------- */

async function announce(env, body) {
  const code = roomCode(body.code);
  const addr = address(body.addr);
  if (!code || code.length < 2 || !addr) return json({ ok: false, error: 'bad room' }, 400);
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO rooms (code, addr, name, host, floor, room, players, seen, created) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) ' +
      'ON CONFLICT(code) DO UPDATE SET addr = ?2, name = ?3, host = ?4, floor = ?5, ' +
      'room = ?6, players = ?7, seen = ?8'
  )
    .bind(
      code,
      addr,
      clean(body.name, 16),
      clean(body.host, 16),
      Math.max(1, Math.min(99, Number(body.floor) | 0 || 1)),
      clean(body.room, 28),
      Math.max(1, Math.min(2, Number(body.players) | 0 || 1)),
      now
    )
    .run();
  // opportunistically drop runs nobody is announcing any more
  await env.DB.prepare('DELETE FROM rooms WHERE seen < ?1').bind(now - TTL_MS * 6).run();
  return json({ ok: true, code });
}

async function list(env) {
  const cutoff = Date.now() - TTL_MS;
  const res = await env.DB.prepare(
    'SELECT code, addr, name, host, floor, room, players, seen FROM rooms ' +
      'WHERE seen > ?1 ORDER BY created DESC LIMIT ?2'
  )
    .bind(cutoff, MAX_ROOMS)
    .all();
  const rooms = (res.results || []).map((r) => ({
    code: r.code,
    addr: r.addr,
    name: r.name || '',
    host: r.host || '',
    floor: r.floor || 1,
    room: r.room || '',
    players: r.players || 1,
    age: Math.max(0, Math.round((Date.now() - r.seen) / 1000)),
  }));
  return json({ ok: true, rooms });
}

async function leave(env, url) {
  const code = roomCode(url.searchParams.get('code'));
  if (!code) return json({ ok: false }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rooms WHERE code = ?1').bind(code),
    env.DB.prepare('DELETE FROM peers WHERE code = ?1').bind(code),
    env.DB.prepare('DELETE FROM msgs WHERE code = ?1').bind(code),
  ]);
  return json({ ok: true });
}

/* ----------------------------- the relay ------------------------------ */

/* One POST per message: the sender's presence is refreshed in the same batch,
   which is what makes the room show up in everyone's join list. */
async function post(request, env, url) {
  const code = roomCode(url.searchParams.get('room'));
  if (!code) return json({ ok: false }, 400);
  const peer = peerName(url.searchParams.get('peer'));
  const body = await request.json().catch(() => null);
  if (!body || typeof body.t !== 'string') return json({ ok: false }, 400);
  const now = Date.now();
  const host = peer.indexOf('host') === 0 ? 1 : 0;
  const payload = body.d === undefined ? null : JSON.stringify(body.d);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO peers (code, peer, host, seen) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(code, peer) DO UPDATE SET host = ?3, seen = ?4'
    ).bind(code, peer, host, now),
    env.DB.prepare('INSERT INTO msgs (code, peer, t, d, at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(code, peer, clean(body.t, 8), payload, now),
  ]);
  // old traffic is worthless to a poller that is this far behind
  if (Math.random() < 0.05) {
    await env.DB.prepare('DELETE FROM msgs WHERE at < ?1').bind(now - MSG_KEEP_MS).run();
  }
  return json({ ok: true });
}

async function poll(env, url) {
  const code = roomCode(url.searchParams.get('room'));
  if (!code) return json({ ok: false }, 400);
  const peer = peerName(url.searchParams.get('peer'));
  const since = Math.max(0, Number(url.searchParams.get('since')) | 0);
  const res = await env.DB.prepare(
    'SELECT id, peer, t, d FROM msgs WHERE code = ?1 AND id > ?2 AND peer <> ?3 ' +
      'ORDER BY id LIMIT ?4'
  )
    .bind(code, since, peer, MSG_LIMIT)
    .all();
  const rows = res.results || [];
  const msgs = rows.map((r) => ({ n: r.id, from: r.peer, t: r.t, d: parse(r.d) }));
  return json({
    ok: true,
    seq: msgs.length ? msgs[msgs.length - 1].n : since,
    msgs,
  });
}

async function info(env) {
  const cutoff = Date.now() - HOST_FRESH_MS;
  const res = await env.DB.prepare(
    'SELECT DISTINCT code FROM peers WHERE host = 1 AND seen > ?1'
  )
    .bind(cutoff)
    .all();
  return json({ ok: true, open: (res.results || []).map((r) => r.code) });
}

async function lan(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    await ready(env);
    // this origin is itself a relay, and it has no LAN address to hand out
    if (url.pathname === '/lan/hello') {
      return json({ ok: true, hosted: true, ips: [], port: null });
    }
    if (url.pathname === '/lan/rooms' && request.method === 'GET') return list(env);
    if (url.pathname === '/lan/info' && request.method === 'GET') return info(env);
    if (url.pathname === '/lan/leave') return leave(env, url);
    if (url.pathname === '/lan/post' && request.method === 'POST') return post(request, env, url);
    if (url.pathname === '/lan/poll' && request.method === 'GET') return poll(env, url);
    if (url.pathname === '/lan/announce' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body) return json({ ok: false, error: 'bad body' }, 400);
      return announce(env, body);
    }
    return json({ ok: false, error: 'no relay' }, 404);
  } catch (err) {
    return json({ ok: false, error: 'registry unavailable' }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/lan/')) return lan(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
