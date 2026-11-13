#!/usr/bin/env node
'use strict';

/* ------------------------------------------------------------------ *
 * lan.js - serve the game on the local network, no dependencies
 *
 *   node server/lan.js
 *   then open http://<your-lan-ip>:8080 on both machines
 *
 * The relay itself lives in relay.js, shared with the Lance entry point
 * (lance.mjs). This one needs nothing installed.
 * ------------------------------------------------------------------ */

const { createGameServer, lanAddresses, PORT, ROOT } = require('./relay');

const server = createGameServer();

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('');
  console.log('  CRYPT OF THE LICH WARDEN - LAN co-op');
  console.log('  serving ' + ROOT);
  console.log('');
  console.log('  this machine : http://localhost:' + PORT + '/');
  for (const ip of ips.length ? ips : ['127.0.0.1']) {
    console.log('  on the LAN   : http://' + ip + ':' + PORT + '/');
  }
  console.log('');
  console.log('  P1: open the game, press H to host.  P2: open the same URL, press J.');
  console.log('');
});
