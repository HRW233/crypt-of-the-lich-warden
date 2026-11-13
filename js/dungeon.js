'use strict';

/* ------------------------------------------------------------------ *
 * dungeon.js - rooms, procedural layout and baked room backgrounds   *
 * ------------------------------------------------------------------ */

const DOOR_TILES = {
  n: [[15, 0], [16, 0]],
  s: [[15, ROWS - 1], [16, ROWS - 1]],
  w: [[0, 8], [0, 9]],
  e: [[COLS - 1, 8], [COLS - 1, 9]],
};

function doorTiles(side) {
  return DOOR_TILES[side];
}

/* Treasure rooms come in four flavours, so a floor can hold two that feel
   nothing alike. Each has its own palette, decor and reward. */
const TREASURE_KINDS = {
  reliquary: { name: 'RELIQUARY', rune: C.purpleDim, body: '#4a3320', trim: C.gold, glow: C.gold },
  vault: { name: 'GOLD VAULT', rune: C.goldDim, body: '#4d3a17', trim: '#ffd166', glow: '#ffcf3d' },
  armory: { name: 'ARMORY', rune: C.cyanDim, body: '#2f3a45', trim: '#9aa7b8', glow: '#9aa7b8' },
  shrine: { name: 'SHRINE', rune: C.magentaDim, body: '#3a2440', trim: '#ff7ac6', glow: '#ff7ac6' },
  // not part of the normal treasure roll: only reachable as a sanctum room
  sanctum: { name: 'SUNKEN SANCTUM', rune: '#ffcf4a', body: '#5a4210', trim: '#ffe9a8', glow: '#ffcf4a' },
};

const TREASURE_WEIGHTS = { reliquary: 3, vault: 1, armory: 1, shrine: 1 };

function rollTreasureKind(exclude) {
  const pool = [];
  for (const id of Object.keys(TREASURE_KINDS)) {
    if (id === 'sanctum' || id === exclude) continue;
    const w = TREASURE_WEIGHTS[id] || 1;
    for (let i = 0; i < w; i++) pool.push(id);
  }
  return pool.length ? pick(pool) : 'reliquary';
}

function treasureKindOf(room) {
  return TREASURE_KINDS[room && room.treasureKind] || TREASURE_KINDS.reliquary;
}

const ROOM_NAMES = {
  start: 'ANTECHAMBER',
  combat: [
    'HALL OF BONES', 'SILENT CLOISTER', 'GRAVE GALLERY', 'ASHEN NAVE', 'CRYPT WALK',
    'DROWNED VAULT', 'HOLLOW CHANCEL', 'CINDER CROSSING', 'WHISPERING STEPS',
    'BONE ORCHARD', 'SALTEN ARMORY', 'RUINED REFECTORY', 'MOURNING WELL',
  ],
  boss: 'THRONE OF THE WARDEN',
  sanctum: 'SUNKEN SANCTUM',
};

class Room {
  constructor(gx, gy, type, depth, floor) {
    this.gx = gx;
    this.gy = gy;
    this.type = type;
    this.depth = depth;
    this.floor = floor || 1;
    this.doors = { n: false, s: false, e: false, w: false };
    this.neighbors = { n: null, s: null, e: null, w: null };
    this.visited = false;
    this.cleared = false;
    this.locked = false;
    this.seed = (((gx + 64) * 73856093) ^ ((gy + 64) * 19349663) ^ ((floor || 1) * 2654435761)) >>> 0;
    this.bg = null;
    this.enemies = [];
    this.spawned = false;
    this.chest = null;
    this.pickups = [];
    this.portal = null;
    this.solidMap = new Uint8Array(COLS * ROWS);
    this.refreshSolid();
    this.name = type === 'combat'
      ? pick(ROOM_NAMES.combat)
      : type === 'treasure'
        ? 'RELIQUARY'
        : type === 'sanctum'
          ? ROOM_NAMES.sanctum
          : type === 'boss'
            ? ROOM_NAMES.boss
            : ROOM_NAMES.start;
    this.introT = 0;
  }

  isSolidTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return this.solidMap[ty * COLS + tx] === 1;
  }

  solidAt(px, py) {
    const tx = (px / TILE) | 0;
    const ty = (py / TILE) | 0;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return this.solidMap[ty * COLS + tx] === 1;
  }

  /* Wall/door solidity is baked into a byte grid whenever doors or the
     locked state change, so each bullet hit-test is one array lookup. */
  refreshSolid() {
    if (!this.solidMap) this.solidMap = new Uint8Array(COLS * ROWS);
    const m = this.solidMap;
    m.fill(0);
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const border = tx === 0 || ty === 0 || tx === COLS - 1 || ty === ROWS - 1;
        if (!border) continue;
        let solid = 1;
        if (!this.locked) {
          if (this.doors.n && ty === 0 && (tx === 15 || tx === 16)) solid = 0;
          else if (this.doors.s && ty === ROWS - 1 && (tx === 15 || tx === 16)) solid = 0;
          else if (this.doors.w && tx === 0 && (ty === 8 || ty === 9)) solid = 0;
          else if (this.doors.e && tx === COLS - 1 && (ty === 8 || ty === 9)) solid = 0;
        }
        m[ty * COLS + tx] = solid;
      }
    }
  }

  circleBlocked(x, y, r) {
    const minX = Math.floor((x - r) / TILE);
    const maxX = Math.floor((x + r) / TILE);
    const minY = Math.floor((y - r) / TILE);
    const maxY = Math.floor((y + r) / TILE);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (this.isSolidTile(tx, ty)) return true;
      }
    }
    return false;
  }
}

/* Axis-separated slide movement, cheap and stable for small circles. */
function moveCircle(ent, dx, dy, room) {
  if (dx) {
    ent.x += dx;
    if (room.circleBlocked(ent.x, ent.y, ent.r)) ent.x -= dx;
  }
  if (dy) {
    ent.y += dy;
    if (room.circleBlocked(ent.x, ent.y, ent.r)) ent.y -= dy;
  }
}

/* ------------------------- background bake ------------------------ */

function paintRoomBackground(room) {
  const cv = document.createElement('canvas');
  cv.width = VIEW_W;
  cv.height = VIEW_H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const rng = mulberry32(room.seed >>> 0);

  g.fillStyle = C.floorDark;
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  // ---- floor tiles ----
  for (let ty = 1; ty < ROWS - 1; ty++) {
    for (let tx = 1; tx < COLS - 1; tx++) {
      const x = tx * TILE;
      const y = ty * TILE;
      const v = rng();
      g.fillStyle = v < 0.14 ? C.floorLit : v < 0.52 ? C.floor : C.floorDark;
      g.fillRect(x, y, TILE, TILE);

      g.fillStyle = C.floorLine;
      g.fillRect(x, y, TILE, 1);
      g.fillRect(x, y, 1, TILE);

      if (v > 0.88) {
        g.fillStyle = '#0d0d13';
        const cx = x + 3 + Math.floor(rng() * 9);
        const cy = y + 3 + Math.floor(rng() * 9);
        g.fillRect(cx, cy, 1, 3 + Math.floor(rng() * 3));
        g.fillRect(cx + 1, cy + 2, 2, 1);
        g.fillRect(cx + 2, cy, 1, 3);
      }
      if (v < 0.09) {
        g.fillStyle = '#2a2a38';
        g.fillRect(x + 4 + Math.floor(rng() * 8), y + 4 + Math.floor(rng() * 8), 1, 1);
        g.fillRect(x + 2 + Math.floor(rng() * 10), y + 2 + Math.floor(rng() * 10), 1, 1);
      }
      if (v > 0.55 && v < 0.63) {
        g.fillStyle = '#191922';
        g.fillRect(x + 2, y + TILE - 4, TILE - 4, 1);
      }
    }
  }

  // ---- wall border ----
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (tx !== 0 && ty !== 0 && tx !== COLS - 1 && ty !== ROWS - 1) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      g.fillStyle = C.wallEdge;
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle = C.wall;
      g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

      // brick pattern
      for (let row = 0; row < 4; row++) {
        const by = y + 2 + row * 3.5;
        const offset = row % 2 === 0 ? 0 : 4;
        for (let bx = 0; bx < 2; bx++) {
          const px = x + 2 + offset + bx * 7;
          if (px + 5 > x + TILE - 1) continue;
          const shade = rng();
          g.fillStyle = shade < 0.28 ? C.wallLight : shade < 0.7 ? C.wall : C.wallDark;
          g.fillRect(px, Math.round(by), 5, 3);
        }
      }
      // moss
      if (rng() < 0.42) {
        g.fillStyle = rng() < 0.5 ? C.moss : C.mossLight;
        const mx = x + 2 + Math.floor(rng() * 10);
        const my = y + 8 + Math.floor(rng() * 6);
        g.fillRect(mx, my, 2 + Math.floor(rng() * 2), 1);
        g.fillRect(mx + 1, my + 1, 1, 1);
      }
      // inner shadow on the room-facing edge
      g.fillStyle = 'rgba(0,0,0,0.45)';
      if (ty === 0) g.fillRect(x, y + TILE - 3, TILE, 3);
      if (ty === ROWS - 1) g.fillRect(x, y, TILE, 3);
      if (tx === 0) g.fillRect(x + TILE - 3, y, 3, TILE);
      if (tx === COLS - 1) g.fillRect(x, y, 3, TILE);
    }
  }

  // ---- doors ----
  for (const side of ['n', 's', 'w', 'e']) {
    if (!room.doors[side]) continue;
    paintDoor(g, side);
  }

  // ---- wall torches ----
  const torchSpots = [
    [TILE * 4 + 8, TILE + 6],
    [VIEW_W - TILE * 4 - 8, TILE + 6],
    [TILE + 6, VIEW_H * 0.5 + 40],
    [VIEW_W - TILE - 6, VIEW_H * 0.5 + 40],
  ];
  for (const spot of torchSpots) paintTorch(g, spot[0], spot[1]);

  // ---- type accents ----
  if (room.type === 'boss') {
    g.globalAlpha = 0.5;
    paintRuneCircle(g, VIEW_W / 2, VIEW_H / 2 + 6, 92, C.magentaDim);
    g.globalAlpha = 0.28;
    paintRuneCircle(g, VIEW_W / 2, VIEW_H / 2 + 6, 66, C.cyanDim);
    g.globalAlpha = 1;
  } else if (room.type === 'treasure') {
    const kind = treasureKindOf(room);
    g.globalAlpha = 0.35;
    paintRuneCircle(g, VIEW_W / 2, VIEW_H / 2, 52, kind.rune);
    g.globalAlpha = 1;
    paintTreasureDecor(g, room.treasureKind || 'reliquary', rng);
  } else if (room.type === 'sanctum') {
    g.globalAlpha = 0.5;
    paintRuneCircle(g, VIEW_W / 2, VIEW_H / 2, 68, '#ffcf4a');
    g.globalAlpha = 0.3;
    paintRuneCircle(g, VIEW_W / 2, VIEW_H / 2, 48, '#fff1c4');
    g.globalAlpha = 1;
    paintTreasureDecor(g, 'sanctum', rng);
  } else if (room.type === 'start') {
    g.globalAlpha = 0.3;
    paintRuneCircle(g, VIEW_W / 2, VIEW_H / 2, 44, C.cyanDim);
    g.globalAlpha = 1;
  }

  // ---- vignette ----
  const grad = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 70, VIEW_W / 2, VIEW_H / 2, 300);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  room.bg = cv;
}

/* Small baked props that make each treasure room readable at a glance. */
function paintTreasureDecor(g, kind, rng) {
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  if (kind === 'sanctum') {
    // gilded colonnade and a halo of light around the reliquary
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const x = Math.round(cx + Math.cos(a) * 88);
      const y = Math.round(cy + Math.sin(a) * 54);
      g.fillStyle = '#7a5c18';
      g.fillRect(x - 2, y - 14, 5, 20);
      g.fillStyle = '#ffe9a8';
      g.fillRect(x - 2, y - 15, 5, 2);
      g.fillStyle = '#ffcf4a';
      g.fillRect(x, y - 12, 1, 12);
    }
    for (let i = 0; i < 18; i++) {
      const a = rng() * TAU;
      const d = 20 + rng() * 70;
      const x = Math.round(cx + Math.cos(a) * d);
      const y = Math.round(cy + Math.sin(a) * d * 0.6);
      g.fillStyle = rng() < 0.5 ? '#ffcf4a' : '#fff6d6';
      g.fillRect(x, y, 1, 1);
    }
  } else if (kind === 'vault') {
    for (let i = 0; i < 12; i++) {
      const x = cx + (i % 4 - 1.5) * 52 + (rng() - 0.5) * 10;
      const y = cy + 26 + Math.floor(i / 4) * 9 + (rng() - 0.5) * 4;
      g.fillStyle = i % 3 === 0 ? '#ffd166' : C.goldDim;
      g.fillRect(Math.round(x), Math.round(y), 4, 3);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(Math.round(x), Math.round(y) + 2, 4, 1);
    }
  } else if (kind === 'armory') {
    for (let s = 0; s < 2; s++) {
      const bx = s === 0 ? 92 : VIEW_W - 116;
      for (let i = 0; i < 3; i++) {
        const x = bx + i * 8;
        g.fillStyle = '#4b5563';
        g.fillRect(x, 96, 2, 34);
        g.fillStyle = '#9aa7b8';
        g.fillRect(x - 1, 92, 4, 4);
        g.fillStyle = '#6b7280';
        g.fillRect(x - 3, 126, 8, 2);
      }
    }
  } else if (kind === 'shrine') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      const x = Math.round(cx + Math.cos(a) * 66);
      const y = Math.round(cy + Math.sin(a) * 40);
      g.fillStyle = '#4a3320';
      g.fillRect(x - 1, y, 3, 6);
      g.fillStyle = '#ff7ac6';
      g.fillRect(x, y - 3, 1, 3);
      g.fillStyle = '#ffe3f3';
      g.fillRect(x, y - 4, 1, 1);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.7;
      const x = Math.round(cx + Math.cos(a) * 74);
      const y = Math.round(cy + Math.sin(a) * 46);
      g.fillStyle = C.purpleDim;
      g.fillRect(x - 2, y, 5, 2);
      g.fillStyle = C.goldDim;
      g.fillRect(x, y - 2, 1, 2);
    }
  }
}

function paintDoor(g, side) {
  if (side === 'n' || side === 's') {
    const y = side === 'n' ? 0 : (ROWS - 1) * TILE;
    const x = 15 * TILE;
    g.fillStyle = '#07070b';
    g.fillRect(x + 2, y + 2, TILE * 2 - 4, TILE - 4);
    g.fillStyle = C.wallLight;
    g.fillRect(x, y, 2, TILE);
    g.fillRect(x + TILE * 2 - 2, y, 2, TILE);
    g.fillStyle = C.goldDim;
    g.fillRect(x + 4, y + (side === 'n' ? TILE - 3 : 1), TILE * 2 - 8, 2);
    g.fillStyle = C.cyanDim;
    g.fillRect(x + 6, y + (side === 'n' ? TILE - 2 : 2), TILE * 2 - 12, 1);
  } else {
    const x = side === 'w' ? 0 : (COLS - 1) * TILE;
    const y = 8 * TILE;
    g.fillStyle = '#07070b';
    g.fillRect(x + 2, y + 2, TILE - 4, TILE * 2 - 4);
    g.fillStyle = C.wallLight;
    g.fillRect(x, y, TILE, 2);
    g.fillRect(x, y + TILE * 2 - 2, TILE, 2);
    g.fillStyle = C.goldDim;
    g.fillRect(x + (side === 'w' ? TILE - 3 : 1), y + 4, 2, TILE * 2 - 8);
    g.fillStyle = C.cyanDim;
    g.fillRect(x + (side === 'w' ? TILE - 2 : 2), y + 6, 1, TILE * 2 - 12);
  }
}

function paintTorch(g, x, y) {
  g.fillStyle = '#3b3140';
  g.fillRect(x - 1, y, 3, 5);
  g.fillStyle = C.goldDim;
  g.fillRect(x - 1, y - 1, 3, 2);
  const grad = g.createRadialGradient(x, y - 2, 1, x, y - 2, 26);
  grad.addColorStop(0, 'rgba(255,183,3,0.35)');
  grad.addColorStop(1, 'rgba(255,183,3,0)');
  g.fillStyle = grad;
  g.fillRect(x - 26, y - 28, 52, 52);
  g.fillStyle = '#ffd27a';
  g.fillRect(x, y - 4, 1, 3);
  g.fillStyle = C.gold;
  g.fillRect(x - 1, y - 3, 3, 2);
}

function paintRuneCircle(g, cx, cy, r, color) {
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, r * 0.72, 0, TAU);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const x1 = cx + Math.cos(a) * r * 0.72;
    const y1 = cy + Math.sin(a) * r * 0.72;
    const x2 = cx + Math.cos(a) * r;
    const y2 = cy + Math.sin(a) * r;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
}

/* ------------------------- generator ------------------------------ */

class DungeonGenerator {
  static generate(floor = 1) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const d = DungeonGenerator._attempt(false, floor);
      if (d) return d;
    }
    return DungeonGenerator._attempt(true, floor);
  }

  static _attempt(force = false, floor = 1) {
    const target = Math.min(14, 7 + floor);
    const key = (x, y) => x + ',' + y;
    const grid = new Map();
    const rooms = [];

    const add = (gx, gy) => {
      const depth = rooms.length;
      const room = new Room(gx, gy, 'combat', depth, floor);
      grid.set(key(gx, gy), room);
      rooms.push(room);
      return room;
    };

    const startRoom = add(0, 0);
    startRoom.type = 'start';
    startRoom.name = ROOM_NAMES.start;

    const dirs = [
      { dx: 0, dy: -1, side: 'n', opp: 's' },
      { dx: 0, dy: 1, side: 's', opp: 'n' },
      { dx: -1, dy: 0, side: 'w', opp: 'e' },
      { dx: 1, dy: 0, side: 'e', opp: 'w' },
    ];

    let guard = 0;
    while (rooms.length < target && guard++ < 500) {
      const base = pick(rooms);
      const dir = pick(dirs);
      const gx = base.gx + dir.dx;
      const gy = base.gy + dir.dy;
      if (Math.abs(gx) > 4 || Math.abs(gy) > 3) continue;
      if (grid.has(key(gx, gy))) continue;
      add(gx, gy);
    }
    if (rooms.length < 8 && !force) return null;

    // link neighbours / doors
    for (const room of rooms) {
      for (const dir of dirs) {
        const other = grid.get(key(room.gx + dir.dx, room.gy + dir.dy));
        if (other) {
          room.doors[dir.side] = true;
          room.neighbors[dir.side] = other;
        }
      }
      room.refreshSolid();
    }

    // BFS depth from the start for enemy scaling + boss placement
    const seen = new Set([startRoom]);
    const queue = [{ room: startRoom, d: 0 }];
    const depthOf = new Map([[startRoom, 0]]);
    while (queue.length) {
      const { room, d } = queue.shift();
      for (const side of ['n', 's', 'e', 'w']) {
        const nb = room.neighbors[side];
        if (nb && !seen.has(nb)) {
          seen.add(nb);
          depthOf.set(nb, d + 1);
          queue.push({ room: nb, d: d + 1 });
        }
      }
    }
    if (seen.size !== rooms.length && !force) return null;

    let boss = null;
    let bestD = -1;
    for (const room of rooms) {
      if (room === startRoom) continue;
      const d = depthOf.get(room) || 0;
      if (d > bestD) { bestD = d; boss = room; }
    }
    if (!boss || bestD < 2) return null;
    boss.type = 'boss';
    boss.name = ROOM_NAMES.boss;

    // treasure room: prefer a dead end that is not the boss room
    const candidates = rooms.filter((r) => r !== startRoom && r !== boss);
    let deadEnds = candidates.filter((r) => {
      let n = 0;
      for (const s of ['n', 's', 'e', 'w']) if (r.neighbors[s]) n++;
      return n === 1;
    });
    const treasure = (deadEnds.length ? pick(deadEnds) : pick(candidates));
    const firstKind = rollTreasureKind(null);
    treasure.type = 'treasure';
    treasure.treasureKind = firstKind;
    treasure.name = TREASURE_KINDS[firstKind].name;

    // deeper floors hide a second treasure room of a different kind
    if (floor >= 3) {
      const spare = candidates.filter((r) => r !== treasure);
      if (spare.length > 2) {
        const second = pick(spare);
        const secondKind = rollTreasureKind(firstKind);
        second.type = 'treasure';
        second.treasureKind = secondKind;
        second.name = TREASURE_KINDS[secondKind].name;
      }
    }

    // a legendary sanctum hides on roughly one floor in two hundred
    if (Math.random() < 0.005) {
      const spare = rooms.filter((r) => r.type === 'combat' && r !== boss);
      const ends = spare.filter((r) => {
        let n = 0;
        for (const s of ['n', 's', 'e', 'w']) if (r.neighbors[s]) n++;
        return n === 1;
      });
      const holy = ends.length ? pick(ends) : spare.length ? pick(spare) : null;
      if (holy) {
        holy.type = 'sanctum';
        holy.treasureKind = 'sanctum';
        holy.name = ROOM_NAMES.sanctum;
      }
    }

    for (const room of rooms) {
      room.depth = depthOf.get(room) || 0;
      paintRoomBackground(room);
      if (room.type === 'treasure' || room.type === 'sanctum') {
        room.chest = {
          x: VIEW_W / 2, y: VIEW_H / 2, opened: false, anim: 0,
          kind: room.type === 'sanctum' ? 'sanctum' : (room.treasureKind || 'reliquary'),
        };
      }
    }

    return { rooms, startRoom, bossRoom: boss, treasureRoom: treasure, grid };
  }
}

/* Places enemies for a room, keeping them off the doors and entry point. */
function populateRoom(room, entry) {
  if (room.spawned) return;
  room.spawned = true;
  if (room.type !== 'combat') return;

  const bonus = Math.min(2, (room.floor || 1) - 1);
  const diff = diffNow();
  // co-op rooms spawn twice the defenders (see Game.onGuestHello)
  const coop = window.COOP_ACTIVE ? 2 : 1;
  const count = clamp(
    (2 + Math.floor(room.depth / 2) + bonus + (Math.random() < 0.45 ? 1 : 0) + diff.extra) * coop,
    2, 16
  );
  const entries = {
    n: { x: VIEW_W / 2, y: 46 },
    s: { x: VIEW_W / 2, y: VIEW_H - 46 },
    w: { x: 46, y: VIEW_H / 2 },
    e: { x: VIEW_W - 46, y: VIEW_H / 2 },
  };
  const safe = entries[entry] || entries.s;
  let id = 0;
  for (let i = 0; i < count; i++) {
    let x = VIEW_W / 2;
    let y = VIEW_H / 2;
    for (let tries = 0; tries < 40; tries++) {
      x = rand(64, VIEW_W - 64);
      y = rand(64, VIEW_H - 80);
      if (dist(x, y, safe.x, safe.y) < 92) continue;
      let ok = true;
      for (const e of room.enemies) {
        if (dist(x, y, e.x, e.y) < 54) { ok = false; break; }
      }
      if (ok) break;
    }
    // deeper floors unlock new enemy kinds instead of just tougher repeats
    const floor = room.floor || 1;
    const pool = [];
    const add = (t, w) => { for (let k = 0; k < w; k++) pool.push(t); };
    add('acolyte', 4);
    add('turret', 3);
    add('charger', floor >= 2 ? 4 : 2);
    if (floor >= 2) add('archer', 3);
    if (floor >= 3) add('wraith', 3);
    if (floor >= 4) add('brute', 2);
    let type = pick(pool);
    if (i === 0 && room.depth >= 3) {
      type = floor >= 4 ? pick(['brute', 'wraith', 'charger']) : floor >= 3 ? pick(['wraith', 'charger']) : 'charger';
    }
    room.enemies.push(makeEnemy(type, x, y, id++, room));
  }
}

function makeEnemy(type, x, y, id, room) {
  let e;
  if (type === 'acolyte') e = new CultistAcolyte(x, y, id, room);
  else if (type === 'turret') e = new ArcaneTurret(x, y, id, room);
  else if (type === 'charger') e = new ChargerSkull(x, y, id, room);
  else if (type === 'archer') e = new BoneArcher(x, y, id, room);
  else if (type === 'wraith') e = new HexWraith(x, y, id, room);
  else if (type === 'brute') e = new GraveBrute(x, y, id, room);
  else e = new CultistAcolyte(x, y, id, room);
  const floor = room && room.floor ? room.floor : 1;
  const diffHp = diffNow().hp;
  if (floor > 1 || diffHp !== 1) {
    e.maxHp = Math.max(1, Math.round(e.maxHp * (1 + (floor - 1) * 0.4) * diffHp));
    e.hp = e.maxHp;
  }
  return e;
}
