'use strict';

/* ------------------------------------------------------------------ *
 * net.js - LAN co-op
 *
 * Authoritative host: the host machine runs the whole run and posts a
 * snapshot 20 times a second. The guest only sends its controls, then
 * draws the snapshots it receives. server/lan.js is the relay, and it
 * also serves this game, so both players open the same URL.
 * ------------------------------------------------------------------ */

const NET_SNAP_HZ = 20;
const NET_INPUT_HZ = 30;
/* how often a hosted run re-announces itself to the public list, and how often
   it heartbeats the relay even with nobody watching. Timers, not the game
   loop: see beginHost. */
const NET_ANNOUNCE_MS = 4000;
const NET_HB_MS = 1500;

/* The public site keeps the list of open runs; the relay itself still runs on
   whoever is hosting. Everything in the list is joined through that address. */
const NET_REGISTRY = 'https://site-497624e43cfb49f8a58564653cb22aff.freebuff.page';

/* The public list is a convenience, not the only door. A partner on the same
   wi-fi is one typed address away, and the last one is remembered. */
const NET_ADDR_KEY = 'lichwarden.netaddr.v1';

function loadNetAddr() {
  try { return localStorage.getItem(NET_ADDR_KEY) || ''; } catch (err) { return ''; }
}

function saveNetAddr(addr) {
  try { localStorage.setItem(NET_ADDR_KEY, addr); } catch (err) { /* ignore */ }
}

const PALETTE = ['#ffd166', '#ff9b3d', '#c8d4e8'];

function netSleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function netCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/* Input stub driven by the guest's packets instead of the keyboard. */
class RemoteInput {
  constructor() {
    this.keys = new Set();
    this.just = new Set();
    this.mouse = { down: false, rightPressed: false };
    this.point = { x: VIEW_W / 2, y: VIEW_H / 2 };
    this.blurred = false;
  }

  down(k) {
    return this.keys.has(k);
  }

  pressed(k) {
    if (this.just.has(k)) {
      this.just.delete(k);
      return true;
    }
    return false;
  }

  mouseWorld() {
    return this.point;
  }

  consumeClicks() {
    return [];
  }

  endFrame() {
    this.just.clear();
    this.mouse.rightPressed = false;
  }

  apply(d) {
    this.keys.clear();
    if (d.x < 0) this.keys.add('left');
    if (d.x > 0) this.keys.add('right');
    if (d.y < 0) this.keys.add('up');
    if (d.y > 0) this.keys.add('down');
    if (typeof d.ax === 'number') {
      this.point.x = d.ax;
      this.point.y = d.ay;
    }
    this.mouse.down = !!d.f;
    if (d.d) {
      this.just.add('space');
      this.mouse.rightPressed = true;
    }
    if (d.q) this.just.add('q');
    if (d.e) this.just.add('e');
  }
}

const NET = {
  role: 'off', // 'off' | 'host' | 'guest' | 'wait'
  code: '',
  base: '',
  peer: '',
  since: 0,
  lost: false,
  guestHere: false,
  lastSeenFromGuest: 0,
  remote: null,
  input: { x: 0, y: 0, ax: 0, ay: 0, f: 0, d: 0, q: 0, e: 0 },
  lastInputAt: 0,

  // host throttles
  snapT: 0,
  hbT: 0,
  roomKey: '',
  chestOpen: -1,
  lastSnapPost: 0,

  // guest state
  view: null,
  p1: null,
  p2: null,
  enemyList: [],
  enemyById: new Map(),
  bulletList: [],
  roomObj: null,
  bgImg: null,
  fakeRoom: { depth: 1, floor: 1 },
  snapAge: 99,
  inputT: 0,
  hbTimer: null,
  lastOut: null,
  address: '',
  rooms: [],
  sel: 0,
  regLost: false,
  manual: loadNetAddr(),
  joining: false,
  useList: true,
  // hosting is on screen from the click, not from whenever the relay answers
  hostWait: false,
  hostError: '',
  gameRef: null,
  lastAnnounce: 0,
  // Lance's socket.io server, when the page was loaded with its client
  sock: null,
  sockLive: false,
  sockJoined: '',
  // talking to the site's own relay instead of one on the LAN: slower, and
  // every message is a request, so the rates come down
  hosted: false,
  hostedChecked: false,

  /* ------------------------------ host ----------------------------- */

  /* The relay has to exist before a session makes sense: the hosted build is
     static, so H there explains how to run the server instead of hanging. */
  hostStart(game) {
    // H has to do something the player can see. The relay lookup is a round
    // trip, and on a build with no relay it fails outright, so the title
    // screen holds a panel with the address from the moment HOST is clicked.
    this.hostWait = true;
    this.hostError = '';
    fetch('/lan/hello', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('no relay');
        return r.json();
      })
      .then((d) => {
        if (d && d.hosted) {
          // the published site is the relay: nothing to install, and the
          // address P2 needs is the one they are already on
          this.hosted = true;
          this.base = '';
          this.address = window.location.host;
        } else {
          const ip = (d.ips && d.ips[0]) || window.location.hostname;
          this.address = 'http://' + ip + ':' + (d.port || window.location.port) + '/';
        }
        this.hostWait = false;
        this.beginHost(game);
      })
      .catch(() => {
        this.role = 'off';
        game.netRole = 'off';
        game.state = 'title';
        // the panel stays up, now spelling out what is missing: the address
        // it already shows becomes right the moment the relay is started
        this.hostError = 'NO CO-OP SERVER - npm run lance OR node server/lan.js';
      });
  },

  beginHost(game) {
    this.hostWait = false;
    this.hostError = '';
    this.role = 'host';
    this.peer = 'host-' + Math.floor(Math.random() * 1000);
    this.code = netCode();
    this.since = 0;
    this.guestHere = false;
    this.snapT = 0;
    this.hbT = 0;
    this.roomKey = '';
    this.chestOpen = -1;
    this.remote = new RemoteInput();
    this.loop(game);
    this.post({ t: 'hb' });
    this.announce(game);
    /* The room has to stay on the join list while it is open, including while
       P1 alt-tabs away to send P2 the address. rAF stops in a background tab,
       so the keep-alive cannot live in the game loop the way snapshots do:
       a timer heartbeats the relay (which is what lists the room for other
       players on this machine) and re-announces it to the public list. */
    this.gameRef = game;
    this.lastAnnounce = performance.now();
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = setInterval(() => {
      if (this.role !== 'host' || !this.code) return;
      this.post({ t: 'hb' });
      if (performance.now() - this.lastAnnounce >= NET_ANNOUNCE_MS && this.gameRef) {
        this.lastAnnounce = performance.now();
        this.announce(this.gameRef);
      }
    }, this.hosted ? NET_HB_MS * 3 : NET_HB_MS);
    game.beginLanHost();
    this.sockConnect(game, this.base);
  },

  hostUpdate(game, dt) {
    // a guest that stops talking (tab closed, wifi died) is dropped after 3 s
    if (this.guestHere && performance.now() - this.lastSeenFromGuest > 6000) {
      this.guestHere = false;
      game.onGuestLeave();
    }
    // keep this run on the public list while it is open
    this.snapT += dt;
    const step = 1 / NET_SNAP_HZ;
    if (this.snapT >= step) {
      this.snapT = 0;
      if (this.guestHere) this.sendSnapshot(game);
    }
  },

  sendSnapshot(game) {
    const room = game.currentRoom;
    if (!room) return;
    const key = game.floor + ':' + room.gx + ',' + room.gy + ':' + room.type;
    const chestOpen = room.chest ? (room.chest.opened ? 1 : 0) : -1;
    if (key !== this.roomKey || chestOpen !== this.chestOpen) {
      this.roomKey = key;
      this.chestOpen = chestOpen;
      this.post({ t: 'room', d: encodeRoom(game, room) });
    }
    const bullets = game.bullets.active;
    const enemyRecs = [];
    for (const e of game.enemies) {
      if (e.dead) continue;
      enemyRecs.push([
        e.type,
        Math.round(e.x),
        Math.round(e.y),
        Math.round(e.hp * 10) / 10,
        e.maxHp,
        e.state || '',
        e.slowT > 0 ? 1 : 0,
        Math.min(99, e.burnStacks || 0),
        e.id | 0,
      ]);
    }
    const bulletRecs = [];
    for (let i = 0; i < bullets.length && i < 420; i++) {
      const b = bullets[i];
      // velocity lets the guest run bullets forward between snapshots
      bulletRecs.push([
        Math.round(b.x),
        Math.round(b.y),
        b.r,
        b.color,
        b.friendly ? 1 : 0,
        Math.round(b.vx),
        Math.round(b.vy),
      ]);
    }
    this.post({
      t: 'snap',
      d: {
        s: game.state,
        f: game.floor,
        sc: game.score,
        p1: encodePlayer(game.player),
        p2: encodePlayer(game.player2),
        e: enemyRecs,
        b: bulletRecs,
        bn: game.roomBanner ? game.roomBanner.text : '',
        to: game.toast ? game.toast.text : '',
        locked: room.locked ? 1 : 0,
        // pause is a vote, so both screens have to show who is still holding
        pv: [(game.pauseVotes && game.pauseVotes[0]) ? 1 : 0, (game.pauseVotes && game.pauseVotes[1]) ? 1 : 0],
        // the boss bar has to read the same on both screens
        bs: bossRec(room),
      },
    });
  },

  /* ------------------------------ guest ---------------------------- */

  guestStart(game) {
    this.role = 'wait';
    this.since = 0;
    this.base = '';
    this.view = null;
    this.enemyById.clear();
    this.enemyList.length = 0;
    this.rooms = [];
    this.sel = 0;
    game.state = 'lanwait';
    this.lobbyLoop(game);
  },

  /* ------------------------------ lobby ---------------------------- */

  async lobbyLoop(game) {
    while (this.role === 'wait' && game.state === 'lanwait') {
      await this.refreshLobby();
      await netSleep(2500);
    }
  },

  /* The public list plus anything hosted on this machine, so a LAN room shows
     up next to the internet ones instead of hiding behind a separate path. */
  async refreshLobby() {
    let rooms = [];
    try {
      const r = await fetch(NET_REGISTRY + '/lan/rooms', { cache: 'no-store' });
      if (!r.ok) throw new Error('list');
      const d = await r.json();
      rooms = ((d && d.rooms) || []).slice();
      this.regLost = false;
    } catch (err) {
      this.regLost = true;
    }
    // the guest has to know it is on the site's relay before it joins, or it
    // would keep the LAN snapshot and input rates up
    if (!this.hostedChecked) {
      try {
        const h = await fetch('/lan/hello', { cache: 'no-store' });
        if (h.ok) {
          const hello = await h.json();
          this.hosted = !!hello.hosted;
          this.hostedChecked = true;
        }
      } catch (err) { /* no relay on this origin at all */ }
    }
    try {
      const r = await fetch('/lan/info', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        for (const code of (d && d.open) || []) {
          const listed = rooms.filter((x) => x.code === code)[0];
          // a run this very server is hosting is joined on this origin, not
          // through whatever address it announced to the public list
          if (listed) {
            listed.local = 1;
            listed.addr = '';
          } else {
            rooms.unshift({ code, addr: '', name: '', host: '', floor: 1, room: '', players: 1, age: 0, local: 1 });
          }
        }
      }
    } catch (err) {
      /* no relay on this origin: the public list is all there is */
    }
    this.rooms = rooms;
    if (this.sel >= rooms.length) this.sel = Math.max(0, rooms.length - 1);
  },

  pickRoom(game) {
    const r = this.rooms && this.rooms[this.sel];
    if (!r) return false;
    const addr = r.local ? '' : (r.addr || '');
    // an https page cannot talk to a plain-http relay on someone's LAN
    if (addr && location.protocol === 'https:' && /^http:/i.test(addr)) {
      game.toast = { text: 'THAT RUN IS ON A LOCAL NETWORK - USE ITS OWN ADDRESS', t: 3.6 };
      return false;
    }
    this.joinOpen(game, r.code, addr);
    return true;
  },

  /* Typing into the address field. Digits and dots only, because this is
     meant for the P1 address on the box across the room. */
  typeAddress(ch) {
    if (ch === 'backspace') {
      this.manual = String(this.manual || '').slice(0, -1);
      return;
    }
    if (!/^[0-9.:]$/.test(ch)) return;
    if ((this.manual || '').length >= 30) return;
    this.manual = (this.manual || '') + ch;
    this.useList = false;
  },

  /* The door that needs no registry and no TLS: type where P1 is listening
     and the relay on their machine answers with the open run. */
  joinManual(game) {
    let raw = String(this.manual || '').trim();
    if (!raw || this.joining) return false;
    if (!/^https?:\/\//i.test(raw)) raw = 'http://' + raw;
    let url = null;
    try { url = new URL(raw); } catch (err) { url = null; }
    if (!url) {
      game.toast = { text: 'THAT IS NOT AN ADDRESS - TRY 192.168.1.20:8080', t: 3.6 };
      return false;
    }
    if (!url.port) url.port = '8080';
    // no trailing slash: url() appends the /lan/ path to this directly
    const base = url.origin;
    const host = url.host;
    this.joining = true;
    fetch(base + '/lan/info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no relay'))))
      .then((d) => {
        this.joining = false;
        const codes = (d && d.open) || [];
        if (!codes.length) {
          game.toast = { text: 'NOTHING OPEN AT ' + host + ' - P1 PRESSES H', t: 4.2 };
          return;
        }
        saveNetAddr(host);
        this.manual = host;
        this.joinOpen(game, codes[0], base);
        game.toast = { text: 'JOINING ' + codes[0] + ' AT ' + host, t: 3 };
      })
      .catch(() => {
        this.joining = false;
        game.toast = { text: 'NO ANSWER FROM ' + host + ' - SAME WIFI?', t: 4.2 };
      });
    return true;
  },

  joinOpen(game, code, base) {
    this.role = 'guest';
    this.base = base || '';
    // an https page can only ever be talking to the hosted relay
    if (location.protocol === 'https:' && (!base || base.indexOf(location.origin) === 0)) {
      this.hosted = true;
    }
    this.code = code;
    this.peer = 'guest-' + Math.floor(Math.random() * 1000);
    this.since = 0;
    game.toast = null;
    this.post({
      t: 'hello',
      d: { char: CHAR_LIST[game.charIndex].id, charIndex: game.charIndex },
    });
    // keeps the host from dropping a partner whose tab is in the background
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = setInterval(() => {
      if (this.role !== 'guest') return;
      this.post({ t: 'in', d: this.lastOut || this.input });
    }, this.hosted ? 2500 : 800);
    this.loop(game);
    this.sockConnect(game, base);
  },

  /* --------------------------- lance socket ------------------------ */

  /* The co-op traffic rides Lance's socket.io server when this page was
     loaded with its client. Nothing depends on it: if the socket never
     connects, post() and loop() keep using the HTTP relay underneath. */
  sockConnect(game, base) {
    if (typeof window === 'undefined' || !window.io) return;
    if (this.sock) {
      this.sockJoin();
      return;
    }
    let sock;
    try {
      sock = window.io(base || undefined, { reconnection: true, timeout: 5000 });
    } catch (err) {
      return;
    }
    this.sock = sock;
    sock.on('connect', () => {
      this.sockLive = true;
      this.sockJoin();
      // the handshake message went out over HTTP before this socket existed,
      // and the host now listens on the socket, so say hello again
      if (this.role === 'guest' && this.code) {
        this.post({ t: 'hello', d: { char: CHAR_LIST[game.charIndex].id, charIndex: game.charIndex } });
      }
    });
    sock.on('disconnect', () => { this.sockLive = false; });
    sock.on('connect_error', () => { this.sockLive = false; });
    sock.on('crypt:msg', (p) => {
      if (!p || !p.msg) return;
      // the relay sequence number rides along, so a later fall back to
      // long-polling never replays messages this client already applied
      if (typeof p.n === 'number' && p.n > this.since) this.since = p.n;
      this.lost = false;
      this.snapAge = Math.min(this.snapAge, 1);
      this.handle(game, p.msg);
    });
  },

  sockJoin() {
    if (!this.sock || !this.sock.connected || !this.code) return;
    const tag = this.code + ':' + this.peer;
    if (this.sockJoined === tag) return;
    this.sockJoined = tag;
    this.sock.emit('crypt:join', { room: this.code, peer: this.peer, host: this.role === 'host' });
  },

  /* Give up the socket: used when a session ends, so a stale connection to
     one relay never follows the player to the next run. */
  sockClose() {
    this.sockJoined = '';
    if (!this.sock) return;
    try { this.sock.disconnect(); } catch (err) { /* already gone */ }
    this.sock = null;
    this.sockLive = false;
  },

  guestUpdate(game, dt) {
    // P asks the host to pause; the pause only lands when P1 asks too
    if (game.input.pressed('p')) this.post({ t: 'pz' });
    // a dash press must not be lost to the 30 Hz input timer, and the hero
    // should lurch on the frame the key goes down, not on the one that ships
    if (game.input.pressed('space') || game.input.mouse.rightPressed) {
      this.dashQueued = true;
      // the keys held right now, not the ones in the last packet: a dash
      // pressed in the same frame as a direction must follow that direction
      const i = game.input;
      let dx = 0;
      let dy = 0;
      if (i.down('left') || i.down('a')) dx -= 1;
      if (i.down('right') || i.down('d')) dx += 1;
      if (i.down('up') || i.down('w')) dy -= 1;
      if (i.down('down') || i.down('s')) dy += 1;
      this.localDash({ x: dx, y: dy });
    }
    this.snapAge += dt;
    this.inputT += dt;
    this.follow(game, dt);
    if (this.inputT >= (this.hosted ? 0.1 : 1 / NET_INPUT_HZ)) {
      this.inputT = 0;
      this.sendInput(game);
    }
    if (this.view && this.view.room) {
      const room = this.view.room;
      if (room.chest) room.chest.anim = (room.chest.anim || 0) + dt;
      if (room.portal) room.portal.t += dt;
      for (const k of room.pickups) k.t += dt;
    }
    if (this.snapAge > 4 && this.role === 'guest' && !this.lost) {
      this.lost = true;
      game.toast = { text: 'LAN HOST SILENT - WAITING', t: 4 };
    }
  },

  sendInput(game) {
    const i = game.input;
    let x = 0;
    let y = 0;
    if (i.down('left') || i.down('a')) x -= 1;
    if (i.down('right') || i.down('d')) x += 1;
    if (i.down('up') || i.down('w')) y -= 1;
    if (i.down('down') || i.down('s')) y += 1;
    const w = i.mouseWorld();
    const d = {
      x,
      y,
      ax: Math.round(w.x),
      ay: Math.round(w.y),
      f: i.mouse.down ? 1 : 0,
      d: this.dashQueued ? 1 : 0,
      q: i.pressed('q') ? 1 : 0,
      e: i.pressed('e') ? 1 : 0,
    };
    this.dashQueued = false;
    this.lastOut = d;
    this.post({ t: 'in', d });
  },

  /* ---------------------------- transport -------------------------- */

  url(route) {
    return (this.base || '') + '/lan/' + route + '?room=' + encodeURIComponent(this.code) +
      '&peer=' + encodeURIComponent(this.peer);
  },

  /* Put this run on the public list, and take it down again when it closes. */
  announce(game) {
    if (!this.code || this.role !== 'host') return;
    const p = game.player;
    const room = game.currentRoom;
    const hero = ((CHAR_LIST.filter((c) => c.id === (p && p.char))[0] || {}).name) || 'P1';
    const origin = window.location.origin;
    const addr = /^https:/i.test(origin) ? origin : (this.address || origin);
    fetch(NET_REGISTRY + '/lan/announce', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      cache: 'no-store',
      body: JSON.stringify({
        code: this.code,
        addr,
        name: hero,
        host: hero,
        floor: game.floor || 1,
        room: room ? room.name : '',
        players: this.guestHere ? 2 : 1,
      }),
    }).catch(() => {});
  },

  post(msg) {
    if (this.role === 'off' || !this.code) return;
    // snapshots are disposable: rate-limit them by timestamp so a stalled
    // connection can never wedge the session the way a boolean lock would
    if (msg.t === 'snap') {
      const now = performance.now();
      if (now - (this.lastSnapPost || 0) < (this.hosted ? 120 : 45)) return;
      this.lastSnapPost = now;
    }
    if (this.sock && this.sock.connected) {
      if (this.sockJoined !== this.code + ':' + this.peer) this.sockJoin();
      this.sock.emit('crypt:msg', { room: this.code, peer: this.peer, msg });
      return;
    }
    fetch(this.url('post'), { method: 'POST', body: JSON.stringify(msg), cache: 'no-store' }).catch(() => {});
  },

  async loop(game) {
    while (this.role !== 'off') {
      // with the socket live the messages are pushed, so polling would only
      // deliver them a second time
      if (this.sock && this.sock.connected) {
        await netSleep(1000);
        continue;
      }
      try {
        const res = await fetch(this.url('poll') + '&since=' + this.since, { cache: 'no-store' });
        if (!res.ok) throw new Error('poll');
        const data = await res.json();
        if (typeof data.seq === 'number' && data.seq > this.since) this.since = data.seq;
        this.lost = false;
        const msgs = data.msgs || [];
        for (let i = 0; i < msgs.length; i++) this.handle(game, msgs[i]);
        // the hosted relay answers at once instead of holding the request
        // open, so the client paces its own polling
        if (this.hosted && !msgs.length) await netSleep(90);
      } catch (err) {
        this.lost = true;
        /* A listed room advertises the LAN address the host announced, and
           that address is not always reachable from this browser even when
           the page itself is being served by that same relay. Fall back to
           the origin the page was opened on, and say hello again: the first
           one went to the address that did not answer. */
        if (this.base && this.role === 'guest') {
          try {
            const own = await fetch('/lan/poll?room=' + encodeURIComponent(this.code) +
              '&peer=' + encodeURIComponent(this.peer) + '&since=' + this.since, { cache: 'no-store' });
            if (own.ok) {
              this.base = '';
              this.lost = false;
              this.post({ t: 'hello', d: { char: CHAR_LIST[game.charIndex].id, charIndex: game.charIndex } });
              continue;
            }
          } catch (ownErr) { /* not this origin either: keep trying the address */ }
        }
        await netSleep(500);
      }
    }
  },

  stop() {
    if (this.role === 'host' && this.code) {
      fetch(NET_REGISTRY + '/lan/leave?code=' + encodeURIComponent(this.code), { cache: 'no-store' }).catch(() => {});
    }
    this.role = 'off';
    this.code = '';
    this.base = '';
    this.view = null;
    this.guestHere = false;
    this.rooms = [];
    this.gameRef = null;
    this.lastAnnounce = 0;
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
    this.sockClose();
  },

  handle(game, m) {
    if (!m || !m.t) return;
    const d = m.d;
    if (this.role === 'host') {
      if (m.t === 'pz') {
        this.lastSeenFromGuest = performance.now();
        game.requestPause(1);
        return;
      }
      if (m.t === 'hello') {
        this.lastSeenFromGuest = performance.now();
        if (!this.guestHere) {
          this.guestHere = true;
          game.onGuestHello(d || {});
          this.roomKey = '';
        }
      } else if (m.t === 'in') {
        this.lastSeenFromGuest = performance.now();
        // a guest that comes back after a dropout rejoins automatically
        if (!this.guestHere) {
          this.guestHere = true;
          this.roomKey = '';
          game.onGuestHello({ char: this.partnerChar });
        }
        this.input = d;
        if (this.remote) this.remote.apply(d);
      } else if (m.t === 'bye') {
        this.guestHere = false;
        game.onGuestLeave();
      }
      return;
    }

    // guest
    if (m.t === 'room') {
      this.applyRoom(d || {});
    } else if (m.t === 'snap') {
      this.applySnapshot(game, d || {});
    } else if (m.t === 'bye') {
      game.toast = { text: 'HOST LEFT', t: 4 };
      this.stop();
      game.state = 'title';
    }
  },

  /* ------------------------- guest reconstruct --------------------- */

  applyRoom(d) {
    const v = this.view || (this.view = {});
    // rebuild the room's collision grid from the same door/lock flags the
    // host has, so predicted movement slides along the real walls
    const solid = new Room(0, 0, d.type || 'combat', 0, d.f || 1);
    solid.doors = { n: !!(d.doors && d.doors.n), s: !!(d.doors && d.doors.s), e: !!(d.doors && d.doors.e), w: !!(d.doors && d.doors.w) };
    solid.locked = !!d.locked;
    solid.refreshSolid();
    this.roomObj = solid;
    v.room = {
      name: d.name || 'ROOM',
      type: d.type || 'combat',
      doors: d.doors || {},
      locked: !!d.locked,
      chest: d.chest ? { x: d.chest.x, y: d.chest.y, opened: !!d.chest.opened, anim: 0 } : null,
      portal: d.portal ? { x: d.portal.x, y: d.portal.y, t: 0 } : null,
      pickups: (d.pickups || []).map((k) => ({ x: k[0], y: k[1], type: k[2], t: Math.random() * 3 })),
    };
    v.floor = d.f || 1;
    if (d.bg) {
      const img = new Image();
      img.src = d.bg;
      this.bgImg = img;
    } else {
      this.bgImg = null;
    }
  },

  applySnapshot(game, d) {
    const v = this.view || (this.view = {});
    v.state = d.s;
    v.pv = d.pv || [0, 0];
    v.boss = d.bs
      ? { name: d.bs[0], hp: d.bs[1], maxHp: d.bs[2], phase: d.bs[3], phaseCount: d.bs[4], color: d.bs[5] }
      : null;
    v.floor = d.f || v.floor || 1;
    v.score = d.sc || 0;
    v.banner = d.bn || '';
    v.toast = d.to || '';
    v.locked = !!d.locked;
    if (v.room) v.room.locked = v.locked;
    if (v.room && v.room.chest) {
      // the host is the only one who can open it
      if (d.ch === 1) v.room.chest.opened = true;
    }
    this.p1 = mirrorPlayer(this.p1, d.p1, false);
    this.p2 = mirrorPlayer(this.p2, d.p2, true);

    this.fakeRoom.depth = v.floor;
    this.fakeRoom.floor = v.floor;
    const alive = new Set();
    for (const rec of d.e || []) {
      const [type, x, y, hp, mhp, st, slow, burn, id] = rec;
      alive.add(id);
      let e = this.enemyById.get(id);
      if (!e || e.type !== type) {
        e = makeEnemy(type, x, y, id, this.fakeRoom);
        e.x = x;
        e.y = y;
        this.enemyById.set(id, e);
      }
      // the snapshot is the target; the drawn position eases toward it
      e.tx = x;
      e.ty = y;
      e.hp = hp;
      e.maxHp = mhp;
      e.state = st || 'idle';
      e.hpShown = hp;
      e.slowT = slow ? 0.6 : 0;
      e.slowMul = slow ? 0.3 : 1;
      e.burnStacks = burn;
      e.burnT = burn > 0 ? 0.6 : 0;
      e.spawnT = 0;
      e.dead = false;
    }
    for (const [id, e] of this.enemyById) {
      if (!alive.has(id)) this.enemyById.delete(id);
    }
    this.enemyList = Array.from(this.enemyById.values());
    v.enemies = this.enemyList;
    v.bullets = d.b || [];
    this.syncBullets(d.b || []);
    this.snapAge = 0;
  },

  /* Bullets move in straight lines most of the time, so the guest runs each
     one forward from the snapshot it arrived in instead of stepping at 20 Hz. */
  syncBullets(list) {
    const now = performance.now();
    const out = this.bulletList;
    out.length = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      out.push({
        x: b[0],
        y: b[1],
        r: b[2] || 3,
        color: b[3],
        friendly: b[4] ? 1 : 0,
        vx: b[5] || 0,
        vy: b[6] || 0,
        rx: b[0],
        ry: b[1],
        at: now,
      });
    }
  },

  /* Per-frame view work on the guest: predict its own hero, ease everyone
     else toward the last snapshot, run bullets forward. */
  follow(game, dt) {
    const k = 1 - Math.exp(-dt * 20);

    const p1 = this.p1;
    if (p1 && typeof p1.tx === 'number') {
      p1.x += (p1.tx - p1.x) * k;
      p1.y += (p1.ty - p1.y) * k;
    }
    for (const e of this.enemyList) {
      if (typeof e.tx !== 'number') continue;
      e.x += (e.tx - e.x) * k;
      e.y += (e.ty - e.y) * k;
    }

    const p2 = this.p2;
    if (p2) {
      // a paused crypt does not move, so neither does the predicted hero
      if (p2.alive && !(this.view && this.view.state === 'paused')) {
        this.predict(game, p2, dt);
      } else if (typeof p2.tx === 'number') {
        p2.x += (p2.tx - p2.x) * k;
        p2.y += (p2.ty - p2.y) * k;
      }
    }

    const now = performance.now();
    for (const b of this.bulletList) {
      const age = Math.min(0.12, (now - b.at) / 1000);
      b.rx = b.x + b.vx * age;
      b.ry = b.y + b.vy * age;
    }
  },

  /* Local prediction for the partner's own hero: it answers the keyboard now
     and is pulled back onto the host's truth on every snapshot. */
  predict(game, p, dt) {
    const room = this.roomObj;
    if (!room) return;
    const inp = this.lastOut;
    p.trail = p.trail || [];
    const fade = () => {
      for (let i = p.trail.length - 1; i >= 0; i--) {
        p.trail[i].life -= dt;
        if (p.trail[i].life <= 0) p.trail.splice(i, 1);
      }
    };

    if (p.dashTime > 0) {
      // the same numbers the host is about to apply, used a packet early
      if (!p.dashDirX && !p.dashDirY) this.dashDir(p, inp);
      p.dashTime = Math.max(0, p.dashTime - dt);
      p.dashLocalT = Math.max(0, (p.dashLocalT || 0) - dt);
      const step = (p.dashSpeed || 330) * dt;
      moveCircle(p, (p.dashDirX || 0) * step, (p.dashDirY || 0) * step, room);
      p.moving = true;
      p.animT += dt;
      p.ghostT = (p.ghostT || 0) + dt;
      if (p.ghostT >= 0.018) {
        p.ghostT = 0;
        p.trail.push({ x: p.x, y: p.y, facing: p.facing, life: 0.26, maxLife: 0.26 });
        if (p.trail.length > 14) p.trail.shift();
      }
      fade();
    } else {
      let ix = inp ? inp.x | 0 : 0;
      let iy = inp ? inp.y | 0 : 0;
      if (ix || iy) {
        const len = Math.hypot(ix, iy) || 1;
        const sp = p.speed || 104;
        moveCircle(p, (ix / len) * sp * dt, (iy / len) * sp * dt, room);
        p.moving = true;
        p.animT += dt;
      } else {
        p.moving = false;
      }
      fade();
    }
    // aim follows the local cursor with no network delay at all
    const w = game.input.mouseWorld();
    p.aim = Math.atan2(w.y - (p.y - 2), w.x - p.x);
    if (Math.abs(Math.cos(p.aim)) > 0.12) p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;
  },

  /* Held direction if there is one, otherwise where the cursor points. */
  dashDir(p, inp) {
    const ix = inp ? inp.x | 0 : 0;
    const iy = inp ? inp.y | 0 : 0;
    const len = Math.hypot(ix, iy);
    if (len > 0) {
      p.dashDirX = ix / len;
      p.dashDirY = iy / len;
    } else {
      p.dashDirX = Math.cos(p.aim || 0);
      p.dashDirY = Math.sin(p.aim || 0);
    }
  },

  /* Start the partner's dash the moment the key goes down, using the host's
     own dash numbers, then let the snapshots correct any drift. */
  localDash(d) {
    const p = this.p2;
    if (!p || !p.alive || !this.roomObj) return;
    if (this.view && this.view.state === 'paused') return;
    if (p.dashTime > 0) return;
    const left = p.dashChargesLeft === undefined ? 1 : p.dashChargesLeft;
    if (left <= 0) return;
    this.dashDir(p, d);
    p.dashTime = p.dashDuration || 0.17;
    p.dashLocalT = p.dashTime;
    p.dashChargesLeft = Math.max(0, left - 1);
    p.trail = p.trail || [];
    p.trail.length = 0;
    p.ghostT = 0;
  },

  /* ---------------------------- guest draw ------------------------- */

  drawGuest(game, ctx) {
    ctx.fillStyle = C.obsidian;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const v = this.view;

    if (this.role === 'wait') {
      this.drawLobby(game, ctx);
      return;
    }

    if (!v || !v.room) {
      Text.glow(ctx, 'LAN CO-OP', VIEW_W / 2, 100, C.white, C.cyan, 3, 'center', 1);
      Text.draw(ctx, 'WAITING FOR THE HOST TO START', VIEW_W / 2, 132, '#6a7482', 1, 'center');
      Text.draw(ctx, this.lost ? 'CONNECTION LOST - STILL TRYING' : 'CONNECTED TO ROOM ' + this.code, VIEW_W / 2, 150, this.lost ? C.heart : '#4d5666', 1, 'center');
      Text.draw(ctx, 'ESC TO LEAVE', VIEW_W / 2, 172, '#3d4350', 1, 'center');
      return;
    }

    if (this.bgImg && this.bgImg.complete) ctx.drawImage(this.bgImg, 0, 0);

    const room = v.room;
    // pickups
    for (const k of room.pickups) {
      const bob = Math.round(Math.sin(k.t * 4) * 1.5);
      if (k.type === 'heart') {
        drawHeart(ctx, Math.round(k.x) - 4, Math.round(k.y) - 3 + bob, true, 1);
      } else {
        ctx.fillStyle = C.cyan;
        ctx.fillRect(Math.round(k.x) - 2, Math.round(k.y) - 2 + bob, 4, 4);
        ctx.fillStyle = C.white;
        ctx.fillRect(Math.round(k.x) - 1, Math.round(k.y) - 1 + bob, 2, 2);
      }
    }

    if (room.chest) {
      const c = room.chest;
      const x = Math.round(c.x);
      const y = Math.round(c.y);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x - 9, y + 8, 18, 3);
      ctx.fillStyle = c.opened ? '#5a4020' : '#8a5a22';
      ctx.fillRect(x - 8, y - 4, 16, 12);
      ctx.fillStyle = c.opened ? '#3d2b16' : '#c08a3e';
      ctx.fillRect(x - 8, y - 8, 16, 5);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x - 1, y - 2, 2, 4);
    }

    if (room.portal) {
      const p = room.portal;
      const pulse = 0.5 + Math.sin(p.t * 3) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = C.magenta;
      ctx.fillRect(Math.round(p.x) - 12, Math.round(p.y) - 12, 24, 24);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.cyan;
      ctx.fillRect(Math.round(p.x) - 7, Math.round(p.y) - 7, 14, 14);
      ctx.fillStyle = C.white;
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6);
    }

    // enemies, back to front
    const list = v.enemies || [];
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      e.draw(ctx);
      if (e.slowT > 0) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#5fc9ec';
        ctx.fillRect(Math.round(e.x - e.r), Math.round(e.y - e.r), e.r * 2, e.r * 2);
        ctx.globalAlpha = 1;
      }
      if (e.burnStacks > 0) {
        ctx.fillStyle = '#ff9b3d';
        const n = Math.min(5, 1 + Math.round(Math.sqrt(e.burnStacks)));
        for (let k = 0; k < n; k++) {
          ctx.fillRect(Math.round(e.x - 1 + (k % 2)), Math.round(e.y - e.r - 3 - k * 2), 2, 2);
        }
      }
    }

    if (this.p2) this.p2.draw(ctx, game);
    if (this.p1) this.p1.draw(ctx, game);

    // bullets, drawn where the dead-reckoning puts them this frame
    const bs = this.bulletList || [];
    for (const b of bs) {
      const x = Math.round(b.rx);
      const y = Math.round(b.ry);
      const r = b.r;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
      ctx.globalAlpha = 1;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      if (r >= 3) {
        ctx.fillStyle = b.friendly ? '#fff6d6' : '#ffd9ec';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    this.drawGuestHUD(game, ctx, v);
  },

  /* Every run that is open right now: the public list, plus whatever this
     machine is hosting. Pick one with the arrows and press enter. */
  drawLobby(game, ctx) {
    Text.glow(ctx, 'OPEN RUNS', VIEW_W / 2, 14, C.white, C.cyan, 3, 'center', 1);
    Text.draw(ctx, 'CO-OP ROOMS   OR   THE P1 ADDRESS', VIEW_W / 2, 54, '#59636f', 1, 'center');
    const list = this.rooms || [];
    const rowsMax = 6;
    if (!list.length) {
      Text.draw(
        ctx,
        this.regLost ? 'NO PUBLIC LIST HERE - JOIN BY ADDRESS BELOW' : 'NO RUNS OPEN RIGHT NOW',
        VIEW_W / 2, 100, this.regLost ? '#8a94a4' : '#6a7482', 1, 'center'
      );
      Text.draw(ctx, 'P1 PRESSES H TO OPEN ONE, THEN TELLS YOU THEIR ADDRESS', VIEW_W / 2, 114, '#4d5666', 1, 'center');
      this.drawAddressBox(ctx, game);
      return;
    }
    const rows = Math.min(list.length, rowsMax);
    const top = 68;
    const h = 19;
    for (let i = 0; i < rows; i++) {
      const r = list[i];
      const y = top + i * h;
      const on = i === this.sel;
      ctx.fillStyle = on ? 'rgba(46,196,182,0.16)' : 'rgba(7,7,11,0.72)';
      ctx.fillRect(40, y, VIEW_W - 80, h - 3);
      ctx.fillStyle = on ? C.cyan : '#262d3a';
      ctx.fillRect(40, y, 2, h - 3);
      Text.draw(ctx, r.code || '????', 50, y + 5, on ? C.white : C.gold, 1, 'left');
      Text.draw(ctx, (r.host || 'P1').toUpperCase(), 96, y + 5, '#8a94a4', 1, 'left');
      Text.draw(ctx, 'F' + (r.floor || 1), 176, y + 5, '#8a94a4', 1, 'left');
      Text.draw(ctx, r.room || (r.local ? 'THIS NETWORK' : ''), 204, y + 5, on ? '#c8d4e8' : '#5f6b7d', 1, 'left');
      const lanOnly = r.local || (!r.local && r.addr && location.protocol === 'https:' && /^http:/i.test(r.addr));
      const slots = lanOnly ? 'LAN' : (r.players > 1 ? '2/2' : '1/2');
      Text.draw(ctx, slots, 392, y + 5, lanOnly ? '#7fe3ff' : (r.players > 1 ? C.magenta : C.cyanDim), 1, 'left');
      Text.draw(ctx, (r.local ? 0 : r.age || 0) + 'S', VIEW_W - 50, y + 5, '#4d5666', 1, 'right');
    }
    if (list.length > rows) {
      Text.draw(ctx, '+' + (list.length - rows) + ' MORE  (R REFRESH)', VIEW_W / 2, top + rows * h + 2, '#4d5666', 1, 'center');
    }
    this.drawAddressBox(ctx, game);
  },

  /* The direct door: type the address, press enter. The last one used is
     already filled in, so a second session is a single key press. */
  drawAddressBox(ctx, game) {
    const box = { x: 76, y: 204, w: 360, h: 18 };
    const on = !this.useList;
    Text.draw(ctx, 'P1 ADDRESS', box.x, box.y - 11, on ? C.cyan : '#59636f', 1, 'left');
    ctx.fillStyle = 'rgba(7,7,11,0.82)';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const edge = on ? C.cyan : '#2c3340';
    ctx.fillStyle = edge;
    ctx.fillRect(box.x, box.y, box.w, 1);
    ctx.fillRect(box.x, box.y + box.h - 1, box.w, 1);
    ctx.fillRect(box.x, box.y, 1, box.h);
    ctx.fillRect(box.x + box.w - 1, box.y, 1, box.h);
    const typed = this.manual || '';
    const caret = Math.floor(game.time * 2.5) % 2 === 0;
    if (typed) {
      Text.draw(ctx, typed, box.x + 6, box.y + 6, on ? C.white : '#8e9aab', 1, 'left');
      if (caret && on) {
        ctx.fillStyle = C.cyan;
        ctx.fillRect(box.x + 6 + typed.length * 6, box.y + 5, 1, 8);
      }
    } else {
      Text.draw(ctx, '192.168.1.20:8080', box.x + 6, box.y + 6, '#39424f', 1, 'left');
      if (caret) {
        ctx.fillStyle = C.cyan;
        ctx.fillRect(box.x + 6, box.y + 5, 1, 8);
      }
    }
    Text.draw(ctx, 'COPY IT FROM THE P1 SCREEN, TYPE IT, PRESS ENTER', VIEW_W / 2, box.y + 28, '#59636f', 1, 'center');
    Text.draw(
      ctx,
      this.joining ? 'CONNECTING...' : 'UP/DOWN  ENTER  R REFRESH  ESC BACK',
      VIEW_W / 2, VIEW_H - 16, this.joining ? C.gold : '#4d5666', 1, 'center'
    );
  },

  drawGuestHUD(game, ctx, v) {
    const rows = [this.p1, this.p2];
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i];
      if (!p) continue;
      const y = 6 + i * 16;
      Text.draw(ctx, i === 0 ? 'P1' : 'P2', 6, y + 1, i === 0 ? C.cyan : C.gold, 1, 'left');
      const hearts = Math.min(12, p.maxHp);
      for (let h = 0; h < hearts; h++) {
        drawHeart(ctx, 24 + h * 8, y, h < p.hp, 1);
      }
      const armorMax = Math.min(6, p.armorMax || 0);
      let cx = 24 + hearts * 8 + 4;
      for (let a = 0; a < armorMax; a++) {
        ctx.fillStyle = a < p.armor ? '#9aa7b8' : '#232a34';
        ctx.fillRect(cx + a * 5, y, 4, 6);
      }
      cx += armorMax * 5 + 3;
      // dash charges, the same meter the host draws for itself
      drawDashMeter(ctx, p, cx, y + 1, 44, game.time);
      if (!p.alive) Text.draw(ctx, 'DOWN', cx + 48, y, C.heart, 1, 'left');
      Text.draw(ctx, CHAR_LIST.filter((c) => c.id === p.char).map((c) => c.name)[0] || p.char.toUpperCase(), 6, y + 9, '#4d5666', 1, 'left');
    }

    // both relic rows, in the same corners the host uses
    if (this.p1) {
      Text.draw(ctx, 'P1', 8, VIEW_H - 52 - HUD_LIFT, '#4d5666', 1, 'left');
      drawRelicSlots(ctx, this.p1.relics, 8, VIEW_H - 42 - HUD_LIFT, MAX_RELICS, -1, game.time);
    }
    if (this.p2) {
      Text.draw(ctx, 'P2', VIEW_W - 8, VIEW_H - 52 - HUD_LIFT, '#4d5666', 1, 'right');
      drawRelicSlots(ctx, this.p2.relics, VIEW_W - 8 - MAX_RELICS * 18, VIEW_H - 42 - HUD_LIFT, MAX_RELICS, -1, game.time);
    }
    drawBossBar(ctx, v.boss);

    const room = v.room;
    if (!game.input.touchMode) Text.draw(ctx, 'P PAUSE - NEEDS BOTH', VIEW_W - 6, VIEW_H - 15, '#3d4350', 1, 'right');
    Text.draw(ctx, 'F' + v.floor + '  ' + (room.name || ''), VIEW_W - 6, 6, C.white, 1, 'right');
    Text.draw(ctx, 'GUEST  ' + this.code + (this.lost ? '  LOST' : ''), VIEW_W - 6, 16, this.lost ? C.heart : '#4d5666', 1, 'right');
    if (room.locked) Text.draw(ctx, 'DOORS SEALED', VIEW_W / 2, 20, C.magenta, 1, 'center');

    if (v.banner) {
      Text.draw(ctx, v.banner, VIEW_W / 2, 44, C.white, 1, 'center');
    }
    if (v.toast) {
      Text.draw(ctx, v.toast, 84, VIEW_H - 15, C.gray, 1, 'left');
    }
    if (v.state && v.state !== 'playing') {
      const pv = v.pv || [0, 0];
      const holding = (pv[0] ? 'P1' : '') + (pv[0] && pv[1] ? ' + ' : '') + (pv[1] ? 'P2' : '');
      const msg = v.state === 'upgrade' ? 'P1 IS CHOOSING A RELIC'
        : v.state === 'paused' ? (pv[0] && pv[1] ? 'PAUSED - BOTH AGREE (P TO RESUME)' : 'PAUSE ASKED BY ' + holding + ' - WAITING FOR THE OTHER')
          : v.state === 'dying' ? 'THE CRYPT CLAIMS YOU BOTH'
            : v.state === 'gameover' ? 'RUN OVER - PRESS ENTER TO RETURN'
              : v.state === 'victory' ? 'THE WARDEN FALLS' : '';
      if (msg) {
        ctx.fillStyle = 'rgba(7,7,11,0.6)';
        ctx.fillRect(0, VIEW_H / 2 - 16, VIEW_W, 32);
        Text.draw(ctx, msg, VIEW_W / 2, VIEW_H / 2 - 9, C.white, 2, 'center');
      }
    }
  },
};

/* Host side: the two players as the wire format expects them. */
function encodePlayer(p) {
  if (!p) return null;
  return {
    c: p.char,
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    f: p.facing || 1,
    a: Math.round((p.aim || 0) * 100) / 100,
    al: p.alive ? 1 : 0,
    hp: Math.round(p.hp * 10) / 10,
    mh: p.maxHp,
    ar: p.armor | 0,
    am: p.armorMax | 0,
    an: Math.round((p.animT || 0) * 100) / 100,
    sp: Math.round(p.speed || 104),
    mv: p.moving ? 1 : 0,
    iv: p.invuln > 0 ? 1 : 0,
    dt: p.dashTime > 0 ? 1 : 0,
    st: p.stormT > 0 ? 1 : 0,
    // dash charges and the carried relics, so the other screen can show them
    dl: (p.dashChargesLeft | 0),
    dm: Math.max(1, p.dashCharges | 0),
    dq: p.dashChargesLeft >= p.dashCharges
      ? 1
      : clamp(1 - p.dashCd / Math.max(0.001, p.dashCdMax || 0.001), 0, 1),
    rl: (p.relics || []).join(','),
  };
}

/* Host side: the live boss as a flat record for the snapshot. */
function bossRec(room) {
  const boss = room && room.type === 'boss'
    ? (room.enemies || []).find((e) => e.isBoss && !e.dead)
    : null;
  if (!boss) return null;
  return [
    boss.name || '',
    Math.round(boss.hp),
    boss.phaseMaxHp || boss.maxHp,
    boss.phase || 1,
    boss.phaseCount || 1,
    boss.barColor || '',
  ];
}

function encodeRoom(game, room) {
  let bg = '';
  if (room.bg && room.bg.toDataURL) {
    try {
      bg = room.bg.toDataURL('image/png');
    } catch (err) {
      bg = '';
    }
  }
  return {
    name: room.name,
    type: room.type,
    f: game.floor,
    bg,
    doors: { n: !!room.doors.n, s: !!room.doors.s, e: !!room.doors.e, w: !!room.doors.w },
    locked: !!room.locked,
    chest: room.chest ? { x: room.chest.x, y: room.chest.y, opened: !!room.chest.opened } : null,
    portal: room.portal ? { x: room.portal.x, y: room.portal.y } : null,
    pickups: (room.pickups || []).map((k) => [Math.round(k.x), Math.round(k.y), k.type]),
  };
}

/* Guest side: rebuild a real Player so the normal sprite does the drawing. */
function mirrorPlayer(state, rec, own) {
  if (!rec) return null;
  if (!state || state.char !== rec.c) {
    state = new Player(rec.x, rec.y, rec.c);
    state.x = rec.x;
    state.y = rec.y;
  }
  state.tx = rec.x;
  state.ty = rec.y;
  state.speed = rec.sp || state.speed;
  // the guest's own hero is predicted locally; everyone else eases over
  if (own) {
    const err = Math.hypot(state.x - rec.x, state.y - rec.y);
    if (!rec.al || err > 60) {
      state.x = rec.x;
      state.y = rec.y;
    } else if (err > 1) {
      state.x += (rec.x - state.x) * 0.45;
      state.y += (rec.y - state.y) * 0.45;
    }
  }
  state.facing = rec.f;
  state.aim = rec.a;
  state.alive = !!rec.al;
  state.hp = rec.hp;
  state.maxHp = rec.mh;
  state.armor = rec.ar;
  state.armorMax = rec.am;
  state.animT = rec.an;
  state.moving = !!rec.mv;
  state.invuln = rec.iv ? 0.2 : 0;
  // a dash this client is already predicting is not cancelled by a snapshot
  // that left the host before the dash input reached it
  if (rec.dt) state.dashTime = Math.max(state.dashTime || 0, 0.08);
  else if (!(state.dashLocalT > 0)) state.dashTime = 0;
  state.dashCharges = rec.dm || 1;
  state.dashChargesLeft = rec.dl === undefined ? state.dashCharges : rec.dl;
  state.dashFrac = rec.dq === undefined ? 1 : rec.dq;
  state.relics = rec.rl ? rec.rl.split(',') : [];
  state.stormT = rec.st ? 0.5 : 0;
  state.trail = state.trail || [];
  if (!rec.al) state.trail.length = 0;
  return state;
}
