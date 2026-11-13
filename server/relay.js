'use strict';

/* ------------------------------------------------------------------ *
 * relay.js - the co-op relay and static file server, with no `listen`
 *
 * Shared by both entry points:
 *   lan.js    - plain node http server (no dependencies at all)
 *   lance.mjs - the same relay wrapped in Lance's socket.io server
 *
 * The relay is deliberately dumb: two peers share a room code, each POSTs
 * JSON and each long-polls for whatever the other one sent. The host runs
 * the real simulation; the guest only ships input and draws snapshots.
 * ------------------------------------------------------------------ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const POLL_HOLD_MS = 15000;
const ROOM_IDLE_MS = 180000;
/* A hidden tab throttles its timers, so a host can easily be a minute late with
   a heartbeat. Keeping the room listed a little longer costs nothing: a guest
   who joins a dead room sees the host-started screen and leaves. */
const HOST_FRESH_MS = 45000;
const QUEUE_MAX = 400;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

/* rooms: code -> { seq, log: [{n, from, t, d}], waiters: Set<fn>,
                   hosts: Map<peer, ts>, lastSeen, info }

   Messages live in an append-only log and every poll asks for "everything
   after N that I did not send". Delivery is therefore idempotent: a dropped
   poll response, a retry or two polls at once cannot lose a snapshot. */
const rooms = new Map();

function room(code) {
  let r = rooms.get(code);
  if (!r) {
    r = { code, seq: 0, log: [], waiters: new Set(), hosts: new Map(), lastSeen: Date.now(), info: null };
    rooms.set(code, r);
  }
  r.lastSeen = Date.now();
  return r;
}

function deliver(r, peer, msg) {
  const entry = { n: ++r.seq, from: peer, t: msg.t, d: msg.d };
  r.log.push(entry);
  if (r.log.length > QUEUE_MAX) r.log.splice(0, r.log.length - QUEUE_MAX);
  for (const wake of Array.from(r.waiters)) wake();
  return entry;
}

function messagesFor(r, peer, since) {
  const out = [];
  for (const m of r.log) {
    if (m.n > since && m.from !== peer) out.push(m);
  }
  return out;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.lastSeen > ROOM_IDLE_MS) {
      for (const wake of Array.from(r.waiters)) wake();
      rooms.delete(code);
    }
  }
}, 10000).unref();

/* The public room list points players here from another origin, so every
   relay answer has to carry CORS headers. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(s),
  }, CORS));
  res.end(s);
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > 4 * 1024 * 1024) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      data = null;
    }
    cb(data);
  });
}

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      out.push(net.address);
    }
  }
  return out;
}

/* Room codes with a host that has spoken recently. */
function openRooms() {
  const now = Date.now();
  const open = [];
  for (const r of rooms.values()) {
    let alive = false;
    for (const ts of r.hosts.values()) if (now - ts < HOST_FRESH_MS) alive = true;
    if (alive) open.push(r.code);
  }
  return open;
}

/* ------------------------------ relay ----------------------------- */

function handleRelay(req, res, url) {
  const pathname = url.pathname;
  const q = url.searchParams;
  const code = (q.get('room') || '').toUpperCase().slice(0, 12);

  if (pathname === '/lan/hello') {
    let port = PORT;
    const idx = req.headers.host ? req.headers.host.lastIndexOf(':') : -1;
    if (idx > 0) port = Number(req.headers.host.slice(idx + 1)) || port;
    json(res, 200, { ok: true, ips: lanAddresses(), port });
    return true;
  }

  // the public list is not served here; the game always asks the site for it
  if (pathname === '/lan/rooms') {
    json(res, 200, { ok: true, rooms: [] });
    return true;
  }

  // which rooms have a live host? the guest uses this to join without typing
  if (pathname === '/lan/info') {
    json(res, 200, { ok: true, open: openRooms() });
    return true;
  }

  if (pathname === '/lan/post') {
    const peer = (q.get('peer') || 'peer').slice(0, 24);
    if (!code) {
      json(res, 400, { ok: false });
      return true;
    }
    readBody(req, (data) => {
      const r = room(code);
      if (data && typeof data.t === 'string') {
        if (peer.startsWith('host')) r.hosts.set(peer, Date.now());
        deliver(r, peer, { t: data.t, d: data.d });
      }
      json(res, 200, { ok: true });
    });
    return true;
  }

  if (pathname === '/lan/poll') {
    const peer = (q.get('peer') || 'peer').slice(0, 24);
    const since = Number(q.get('since') || 0) | 0;
    if (!code) {
      json(res, 400, { ok: false });
      return true;
    }
    const r = room(code);
    let done = false;
    let timer = null;

    const flush = () => {
      if (done) return;
      const msgs = messagesFor(r, peer, since);
      let last = since;
      for (const m of msgs) last = Math.max(last, m.n);
      if (!msgs.length && Date.now() - started < POLL_HOLD_MS) return;
      done = true;
      if (timer) clearTimeout(timer);
      r.waiters.delete(flush);
      json(res, 200, { ok: true, seq: last, msgs });
    };

    const started = Date.now();
    const ready = messagesFor(r, peer, since);
    if (ready.length) {
      json(res, 200, { ok: true, seq: ready[ready.length - 1].n, msgs: ready });
      return true;
    }
    r.waiters.add(flush);
    timer = setTimeout(flush, POLL_HOLD_MS);
    timer.unref();
    res.on('close', () => {
      if (!done) {
        done = true;
        if (timer) clearTimeout(timer);
        r.waiters.delete(flush);
      }
    });
    return true;
  }

  return false;
}

/* ----------------------------- static ----------------------------- */

function serveFile(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, Object.assign({
      'content-type': type,
      'cache-control': 'no-store',
      'content-length': st.size,
    }, { 'access-control-allow-origin': '*' }));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(full).pipe(res);
  });
}

/* One http server that answers /lan/* and serves the game, without listening:
   the entry point decides whether Lance's socket.io rides on it. */
function createGameServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (url.pathname.startsWith('/lan/')) {
      if (handleRelay(req, res, url)) return;
      res.writeHead(404);
      res.end();
      return;
    }
    serveFile(req, res, url.pathname);
  });
}

module.exports = {
  PORT,
  ROOT,
  rooms,
  room,
  deliver,
  messagesFor,
  handleRelay,
  createGameServer,
  lanAddresses,
  openRooms,
};
