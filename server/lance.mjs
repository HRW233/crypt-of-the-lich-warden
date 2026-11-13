#!/usr/bin/env node

/* ------------------------------------------------------------------ *
 * lance.mjs - host co-op sessions with Lance (lance-gg)
 *
 *   npm install
 *   node server/lance.mjs     (or: npm run lance)
 *
 * Lance owns the socket.io server, the connection lifecycle, the room
 * bookkeeping and the client ping/latency monitor. The game itself stays
 * host-authoritative - P1's browser simulates, P2 draws snapshots - so the
 * Lance GameEngine is deliberately empty: no world objects, no physics, no
 * server-side rules. The snapshots and inputs ride Lance's sockets, and the
 * plain HTTP relay in relay.js stays mounted underneath as the fallback for
 * any client that never gets a socket.
 * ------------------------------------------------------------------ */

import { Server as SocketServer } from 'socket.io';
import { GameEngine, ServerEngine } from 'lance-gg';
import relay from './relay.js';

const {
  createGameServer,
  lanAddresses,
  room,
  deliver,
  openRooms,
  PORT,
  ROOT,
} = relay;

/* The server-side half Lance insists on. Everything the game needs is already
   decided in P1's browser, so every hook here is intentionally empty. */
class RelayEngine extends GameEngine {
  init() {}
  step() {}
  registerClasses() {}
  processInput() {}
}

const httpServer = createGameServer();
const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // the relay is a LAN hop: keep frames small and never buffer stale ones
  maxHttpBufferSize: 1e6,
});

const engine = new RelayEngine({ traceLevel: 0 });
const serverEngine = new ServerEngine(io, engine, {
  updateRate: 6,
  stepRate: 60,
  // nothing sends Lance's own `move` input, so its idle timeout would drop a
  // player who is simply watching. Sessions outlive that; disconnects still
  // arrive the moment a socket closes.
  timeoutInterval: 86400,
});
serverEngine.start();

/* Every player who joins a co-op room also joins the matching socket.io room,
   so a message only ever goes to that run. */
io.on('connection', (socket) => {
  socket.on('crypt:join', (payload) => {
    const code = String((payload && payload.room) || '').toUpperCase().slice(0, 12);
    const peer = String((payload && payload.peer) || socket.id).slice(0, 24);
    if (!code) return;
    socket.data.room = code;
    socket.data.peer = peer;
    socket.data.host = !!(payload && payload.host);
    socket.join(code);
    const r = room(code);
    if (socket.data.host) r.hosts.set(peer, Date.now());
    if (serverEngine.resetIdleTimeout) serverEngine.resetIdleTimeout(socket);
    socket.emit('crypt:joined', { room: code, peer, host: socket.data.host });
    console.log(`  ${socket.data.host ? 'host ' : 'guest'} ${peer} joined ${code}`);
  });

  socket.on('crypt:msg', (payload) => {
    const code = String((payload && payload.room) || socket.data.room || '').toUpperCase().slice(0, 12);
    const peer = String((payload && payload.peer) || socket.data.peer || socket.id).slice(0, 24);
    const msg = payload && payload.msg;
    if (!code || !msg || typeof msg.t !== 'string') return;
    const r = room(code);
    // a host proves it is alive by talking, which is what lists the room
    if (peer.startsWith('host')) r.hosts.set(peer, Date.now());
    const entry = deliver(r, peer, { t: msg.t, d: msg.d });
    socket.to(code).emit('crypt:msg', { peer, msg, n: entry.n });
    if (serverEngine.resetIdleTimeout) serverEngine.resetIdleTimeout(socket);
  });

  socket.on('crypt:leave', () => {
    if (socket.data.room) socket.leave(socket.data.room);
    socket.data.room = null;
  });

  socket.emit('crypt:rooms', { rooms: openRooms() });
});

/* The join list: which rooms have a host that is still talking. */
setInterval(() => {
  io.emit('crypt:rooms', { rooms: openRooms() });
}, 2000).unref();

httpServer.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('');
  console.log('  CRYPT OF THE LICH WARDEN - co-op server (Lance)');
  console.log('  serving ' + ROOT);
  console.log('  lance-gg + socket.io');
  console.log('');
  console.log('  this machine : http://localhost:' + PORT + '/');
  for (const ip of ips.length ? ips : ['127.0.0.1']) {
    console.log('  on the LAN   : http://' + ip + ':' + PORT + '/');
  }
  console.log('');
  console.log('  P1: open the game, press H to host.  P2: open the same URL, press J.');
  console.log('');
});
