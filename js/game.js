'use strict';

/* ------------------------------------------------------------------ *
 * game.js - input, state machine, dungeon flow, HUD and every screen  *
 * ------------------------------------------------------------------ */

/* Touch layout: the buttons themselves, in canvas pixels. The HUD lifts by
   HUD_LIFT while these are on screen so nothing is hidden behind a thumb. */
const TOUCH_BUTTONS = [
  { id: 'up', x: 34, y: 236, w: 26, h: 24, label: '^' },
  { id: 'down', x: 34, y: 262, w: 26, h: 24, label: 'v' },
  { id: 'left', x: 6, y: 249, w: 26, h: 24, label: '<' },
  { id: 'right', x: 62, y: 249, w: 26, h: 24, label: '>' },
  { id: 'fire', x: 372, y: 240, w: 56, h: 44, label: 'FIRE' },
  { id: 'dash', x: 434, y: 240, w: 56, h: 44, label: 'DASH' },
  { id: 'pause', x: 232, y: 258, w: 48, h: 22, label: 'II' },
];

let HUD_LIFT = 0;

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.just = new Set();
    this.blurred = false;
    this.mouse = { clientX: 0, clientY: 0, down: false, rightPressed: false };
    this.mouseHeld = false;
    this.clickQueue = [];
    this.onGesture = null;
    this.onTap = null;
    this.aimPoint = null;

    // phones and tablets get the on-screen pad instead of a keyboard
    this.touchMode = (navigator.maxTouchPoints || 0) > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      /[?&]touch=/.test(window.location.search);
    this.touch = new Set();
    this.touchIds = new Map();

    // Aim from the middle of the frame until the mouse moves.
    const r0 = canvas.getBoundingClientRect();
    this.mouse.clientX = r0.left + r0.width / 2;
    this.mouse.clientY = r0.top + r0.height / 2;

    window.addEventListener('keydown', (e) => {
      this.blurred = false;
      if (this.onGesture) this.onGesture();
      const k = Input.normalize(e.key);
      if (!k) return;
      if (!e.repeat) this.just.add(k);
      this.keys.add(k);
      if (k === 'space' || k === 'up' || k === 'down' || k === 'left' || k === 'right' || k === 'tab') {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = Input.normalize(e.key);
      if (k) this.keys.delete(k);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.clear();
      this.touchIds.clear();
      this.mouseHeld = false;
      this.mouse.down = false;
      this.blurred = true;
    });

    canvas.addEventListener('mousemove', (e) => {
      this.mouse.clientX = e.clientX;
      this.mouse.clientY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      // a tap synthesises a mousedown after the pointer event already ran
      if (this.lastTouch && performance.now() - this.lastTouch < 700) return;
      this.blurred = false;
      if (this.onGesture) this.onGesture();
      this.mouse.clientX = e.clientX;
      this.mouse.clientY = e.clientY;
      if (e.button === 0) {
        this.mouseHeld = true;
        this.mouse.down = true;
        this.clickQueue.push(this.mouseWorld());
      } else if (e.button === 2) {
        this.mouse.rightPressed = true;
      }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseHeld = false;
        this.mouse.down = this.touch.has('fire');
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mouseleave', () => {
      this.mouseHeld = false;
      this.mouse.down = this.touch.has('fire');
    });

    // ---- touch ----
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (VIEW_W / (r.width || VIEW_W)),
        y: (e.clientY - r.top) * (VIEW_H / (r.height || VIEW_H)),
      };
    };
    const buttonAt = (p) => TOUCH_BUTTONS.filter((b) => inRect(p.x, p.y, b))[0] || null;
    const hold = (id) => {
      this.touch.add(id);
      if (id === 'dash') this.just.add('space');
      if (id === 'pause') this.just.add('p');
      if (id === 'fire') this.mouse.down = true;
    };
    const syncFire = () => {
      this.mouse.down = this.mouseHeld || this.touch.has('fire');
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && !this.touchMode) return;
      this.lastTouch = performance.now();
      this.blurred = false;
      if (this.onGesture) this.onGesture();
      const p = at(e);
      const b = this.touchMode ? buttonAt(p) : null;
      if (!b) {
        if (this.onTap) this.onTap(p);
        return;
      }
      e.preventDefault();
      this.touchIds.set(e.pointerId, b.id);
      hold(b.id);
    });
    canvas.addEventListener('pointermove', (e) => {
      const held = this.touchIds.get(e.pointerId);
      if (!held) return;
      e.preventDefault();
      const b = buttonAt(at(e));
      const next = b ? b.id : null;
      if (next === held) return;
      this.touch.delete(held);
      this.touchIds.delete(e.pointerId);
      syncFire();
      if (next) {
        this.touchIds.set(e.pointerId, next);
        hold(next);
      }
    });
    const release = (e) => {
      const held = this.touchIds.get(e.pointerId);
      if (!held) return;
      this.touchIds.delete(e.pointerId);
      // the same button may still be held by another finger
      let still = false;
      for (const id of this.touchIds.values()) if (id === held) still = true;
      if (!still) this.touch.delete(held);
      syncFire();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', release);
  }

  static normalize(key) {
    const k = String(key).toLowerCase();
    const map = {
      arrowleft: 'left',
      arrowright: 'right',
      arrowup: 'up',
      arrowdown: 'down',
      ' ': 'space',
      escape: 'escape',
      enter: 'enter',
    };
    return map[k] || k;
  }

  down(k) {
    return this.keys.has(k) || this.touch.has(k);
  }

  pressed(k) {
    if (this.just.has(k)) {
      this.just.delete(k);
      return true;
    }
    return false;
  }

  consumeClicks() {
    const out = this.clickQueue;
    this.clickQueue = [];
    return out;
  }

  mouseWorld() {
    // on a touch screen the aim follows the nearest foe, not a cursor
    if (this.aimPoint) return this.aimPoint;
    const r = this.canvas.getBoundingClientRect();
    const w = r.width || VIEW_W;
    const h = r.height || VIEW_H;
    return {
      x: (this.mouse.clientX - r.left) * (VIEW_W / w),
      y: (this.mouse.clientY - r.top) * (VIEW_H / h),
    };
  }

  endFrame() {
    this.just.clear();
    this.mouse.rightPressed = false;
  }
}

/* ---------------------------- relics ------------------------------ */

/* The 100+ relic pool, tier chains and unlock gates live in upgrades.js. */

const CARD_GAP = 10;
const CARD_Y = 86;

/* ------------------------------ shared HUD ----------------------------- */
/* These three draw the pieces both players have to be able to read: the
   charges a hero has left, the relics they carry and the boss bar. The host
   feeds them live objects, the guest feeds them the mirrored snapshot. */

function drawDashMeter(ctx, p, x, y, w, time) {
  if (!p) return;
  const max = Math.max(1, p.dashCharges || 1);
  const left = p.dashChargesLeft === undefined ? max : p.dashChargesLeft;
  const frac = left >= max
    ? 1
    : (p.dashFrac !== undefined ? p.dashFrac : clamp(1 - (p.dashCd || 0) / Math.max(0.001, p.dashCdMax || 0.001), 0, 1));
  const ready = left > 0;
  const inner = w - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w, 6);
  ctx.fillStyle = '#2a3140';
  ctx.fillRect(x, y, inner, 4);
  ctx.fillStyle = ready ? C.cyan : C.cyanDim;
  ctx.fillRect(x, y, Math.round(inner * frac), 4);
  ctx.fillStyle = '#121218';
  for (let i = 1; i < 8; i++) ctx.fillRect(x + Math.round((inner * i) / 8), y, 1, 4);
  if (ready && time) {
    ctx.globalAlpha = 0.18 + Math.sin(time * 6) * 0.1;
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x - 2, y - 2, w + 4, 8);
    ctx.globalAlpha = 1;
  }
  // one pip per charge, so a second dash is visible as a second pip
  if (max > 1) {
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < left ? C.cyan : '#2a3140';
      ctx.fillRect(x + w + 2 + i * 4, y + 1, 3, 3);
    }
  }
}

function drawRelicSlots(ctx, relics, x, y, max, hover, time) {
  for (let i = 0; i < max; i++) {
    const sx = x + i * 18;
    const id = relics && relics[i];
    ctx.fillStyle = 'rgba(7,7,11,0.62)';
    ctx.fillRect(sx, y, 16, 16);
    ctx.fillStyle = id ? (hover === i ? C.white : C.cyanDim) : '#23242c';
    ctx.fillRect(sx, y, 16, 1);
    ctx.fillRect(sx, y + 15, 16, 1);
    ctx.fillRect(sx, y, 1, 16);
    ctx.fillRect(sx + 15, y, 1, 16);
    if (!id) continue;
    ctx.save();
    ctx.translate(sx + 8, y + 8);
    ctx.scale(0.62, 0.62);
    drawUpgradeIcon(ctx, id, 0, 0);
    ctx.restore();
    if (hover === i) {
      ctx.globalAlpha = 0.14 + Math.sin((time || 0) * 6) * 0.06;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, y, 16, 16);
      ctx.globalAlpha = 1;
    }
  }
}

function drawBossBar(ctx, boss) {
  if (!boss) return;
  const w = 300;
  const x = (VIEW_W - w) / 2;
  const lift = typeof HUD_LIFT === 'number' ? HUD_LIFT : 0;
  const y = VIEW_H - 13 - lift - (lift ? 6 : 0);
  const bc = boss.color || boss.barColor || C.magenta;
  const maxHp = boss.phaseMaxHp || boss.maxHp || 1;
  ctx.fillStyle = 'rgba(7,7,11,0.78)';
  ctx.fillRect(x - 5, y - 16, w + 10, 24);
  Text.draw(
    ctx,
    (boss.name || 'THE LICH WARDEN') + '   ' + (boss.phase || 1) + '/' + (boss.phaseCount || 1),
    VIEW_W / 2, y - 14, bc, 1, 'center'
  );
  ctx.fillStyle = '#241826';
  ctx.fillRect(x, y, w, 6);
  const f = clamp(boss.hp / maxHp, 0, 1);
  ctx.fillStyle = bc;
  ctx.fillRect(x, y, Math.round(w * f), 6);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, Math.round(w * f), 1);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1a1220';
  for (let i = 1; i < 10; i++) ctx.fillRect(x + Math.round((w * i) / 10), y, 1, 6);
  const total = boss.phaseCount || 1;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < (boss.phase || 1) ? bc : '#3a3444';
    ctx.fillRect(x + 2 + i * 5, y + 8, 3, 2);
  }
}

function buildCardRects(n) {
  const w = n >= 4 ? 110 : 136;
  const gap = n >= 4 ? 6 : CARD_GAP;
  const h = 104;
  const x0 = Math.round((VIEW_W - (w * n + gap * (n - 1))) / 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * (w + gap), y: CARD_Y, w, h });
  return out;
}

const RELIC_REROLLS = 3;

const REROLL_RECT = { x: VIEW_W / 2 - 150, y: 198, w: 142, h: 20 };
const SKIP_RECT = { x: VIEW_W / 2 + 8, y: 198, w: 142, h: 20 };

/* relic swap / upgrade picker rows */
function replaceRect(i) {
  return { x: VIEW_W / 2 - 122, y: 68 + i * 28, w: 244, h: 26 };
}
const REPLACE_SWAP_RECT = { x: VIEW_W / 2 - 130, y: 186, w: 122, h: 18 };
const REPLACE_UP_RECT = { x: VIEW_W / 2 + 8, y: 186, w: 122, h: 18 };
const REPLACE_BACK = { x: VIEW_W / 2 - 60, y: 210, w: 120, h: 18 };

/* Relic ids carry their tier (MIGHT I = might1), so the next tier is a lookup. */
function nextRelicTier(id) {
  const m = /^(.*?)(\d+)$/.exec(id || '');
  if (!m) return null;
  return RELIC_BY_ID.get(m[1] + (parseInt(m[2], 10) + 1)) || null;
}

const VAULT_PER = 12;
const VAULT_RECTS = (() => {
  const w = 140;
  const h = 44;
  const gx = 8;
  const gy = 5;
  const x0 = Math.round((VIEW_W - (w * 3 + gx * 2)) / 2);
  const y0 = 48;
  const out = [];
  for (let i = 0; i < VAULT_PER; i++) {
    out.push({ x: x0 + (i % 3) * (w + gx), y: y0 + Math.floor(i / 3) * (h + gy), w, h });
  }
  return out;
})();
const VAULT_PREV = { x: 150, y: 246, w: 34, h: 16 };
const VAULT_NEXT = { x: 328, y: 246, w: 34, h: 16 };
const VAULT_BACK = { x: 232, y: 246, w: 48, h: 16 };

const PLAY_RECT = { x: 176, y: 198, w: 160, h: 26 };
/* the title screen has its own button so the game-over screen keeps its layout */
const TITLE_PLAY = { x: VIEW_W / 2 - 104, y: 210, w: 208, h: 28 };

/* Everything that is not "start a run": the vault, profiles and the two
   LAN doors. They used to be keyboard secrets, now they are buttons. */
const TITLE_ACTIONS = [
  { id: 'vault', label: 'RELICS', key: 'L' },
  { id: 'accounts', label: 'PROFILE', key: 'O' },
  { id: 'host', label: 'HOST', key: 'H' },
  { id: 'join', label: 'ROOMS', key: 'J' },
];

function titleActionRect(i) {
  const w = 86;
  const gap = 8;
  const total = w * TITLE_ACTIONS.length + gap * (TITLE_ACTIONS.length - 1);
  const x0 = Math.round((VIEW_W - total) / 2);
  return { x: x0 + i * (w + gap), y: 246, w, h: 18 };
}
const MUTE_RECT = { x: 6, y: VIEW_H - 20, w: 16, h: 16 };

/* The host's join address, parked under the score for the whole session so it
   can be read out again when a partner drops and comes back. Click to copy. */
const HOST_ADDR_RECT = { x: 6, y: 52, w: 182, h: 17 };

/* Clipboard on an insecure LAN origin has no navigator.clipboard, so the
   textarea trick is the path that actually works on 192.168.x.x over http. */
function copyText(text) {
  const legacy = () => new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    if (ok) resolve();
    else reject(new Error('copy blocked'));
  });
  // the async API refuses while the window is unfocused; the old way does not
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(legacy);
  }
  return legacy();
}

/* account picker: local profiles, each with its own saved progress */
const ACCOUNT_BTN = { x: VIEW_W - 150, y: 6, w: 142, h: 13 };
const ACCOUNT_ROWS = 5;
const ACCOUNT_NEW = { x: 132, y: 222, w: 118, h: 20 };
const ACCOUNT_DEL = { x: 262, y: 222, w: 118, h: 20 };
const ACCOUNT_BACK = { x: 200, y: 248, w: 112, h: 20 };
const MUTE_KEY = 'lichwarden.mute.v1';

function accountRowRect(i) {
  return { x: 136, y: 64 + i * 30, w: 240, h: 26 };
}

function loadMute() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (err) { return false; }
}

function saveMute(m) {
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (err) { /* ignore */ }
}

/* character select on the title screen */
const CHAR_KEY = 'lichwarden.char.v1';
const CHAR_W = 78;
const CHAR_H = 60;
const CHAR_GAP = 4;
const CHAR_Y = 96;

function charRect(i) {
  const total = CHAR_W * CHAR_LIST.length + CHAR_GAP * (CHAR_LIST.length - 1);
  const x0 = Math.round((VIEW_W - total) / 2);
  return { x: x0 + i * (CHAR_W + CHAR_GAP), y: CHAR_Y, w: CHAR_W, h: CHAR_H };
}

/* The cryomancer is the last hero: it only opens once the Warden is dead. */
function charUnlocked(id, records) {
  if (id !== 'cryomancer') return true;
  if (window.UNLOCK_ALL_CHARS) return true; // the balance bot needs every hero
  return ((records && records.wins) || 0) > 0;
}

function loadCharIndex() {
  try {
    const v = parseInt(localStorage.getItem(CHAR_KEY), 10);
    if (v >= 0 && v < CHAR_LIST.length) return v;
  } catch (err) { /* storage unavailable */ }
  return 0;
}

function saveCharIndex(i) {
  try {
    localStorage.setItem(CHAR_KEY, String(i));
  } catch (err) { /* ignore private mode */ }
}

/* pause menu */
const PAUSE_BUTTONS = [
  { label: 'RESUME', y: 132 },
  { label: 'RESTART RUN', y: 158 },
  { label: 'MAIN MENU', y: 184 },
];

function pauseRect(i) {
  return { x: VIEW_W / 2 - 72, y: PAUSE_BUTTONS[i].y, w: 144, h: 20 };
}

/* difficulty picker on the title screen */
const DIFF_W = 104;
const DIFF_GAP = 8;
const DIFF_Y = 186;
const DIFF_KEY = 'lichwarden.diff.v1';

function diffRect(i) {
  const total = DIFF_W * DIFFICULTIES.length + DIFF_GAP * (DIFFICULTIES.length - 1);
  const x0 = Math.round((VIEW_W - total) / 2);
  return { x: x0 + i * (DIFF_W + DIFF_GAP), y: DIFF_Y, w: DIFF_W, h: 18 };
}

function loadDiffIndex() {
  try {
    const v = parseInt(localStorage.getItem(DIFF_KEY), 10);
    if (v >= 0 && v < DIFFICULTIES.length) return v;
  } catch (err) { /* storage unavailable */ }
  return 1;
}

function saveDiffIndex(i) {
  try {
    localStorage.setItem(DIFF_KEY, String(i));
  } catch (err) { /* ignore private mode */ }
}

/* wizard spell book rows */
const SPELLBOOK_ROWS = SPELLS.map((s, i) => ({ x: 66, y: 80 + i * 34, w: 380, h: 30 }));

/* which list a hero's spell book shows */
function spellListFor(char) {
  return char === 'cryomancer' ? CRYO_SPELLS : SPELLS;
}

function inRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

const FINAL_FLOOR = 5;
const BUILD_TAG = 'v4.39';
const RECORD_KEY = 'lichwarden.records.v1';

const RECORD_DEFAULTS = {
  bestScore: 0, bestFloor: 0, runs: 0, wins: 0,
  kills: 0, grazes: 0, rooms: 0, bosses: 0,
  dashes: 0, score: 0, deaths: 0, relics: 0, floors: 0,
  legendaries: 0, legendaryMask: 0,
};

function loadRecordsFor(id) {
  const out = Object.assign({}, RECORD_DEFAULTS);
  try {
    const raw = localStorage.getItem(recordsKeyFor(id));
    if (raw) {
      const r = JSON.parse(raw);
      for (const k in out) if (typeof r[k] === 'number') out[k] = r[k];
      out.score = Math.max(out.score, out.bestScore);
      out.floors = Math.max(out.floors, out.bestFloor);
    }
  } catch (err) { /* storage unavailable */ }
  return out;
}

function loadRecords() {
  return loadRecordsFor(ACTIVE_ACCOUNT);
}

/* Easy runs set this so nothing they earn is written to disk. */
let RECORDS_LOCKED = false;

function saveRecords(records) {
  if (RECORDS_LOCKED) return;
  try {
    localStorage.setItem(recordsKey(), JSON.stringify(records));
  } catch (err) { /* ignore private mode */ }
}

/* ---------------------------- accounts ---------------------------- *
 * Local profiles: each has its own records, unlocks and legendary
 * discoveries. Nothing leaves the browser - there is no server.
 * ------------------------------------------------------------------ */
const ACCOUNTS_KEY = 'lichwarden.accounts.v1';
const ACTIVE_KEY = 'lichwarden.activeAccount.v1';

function recordsKeyFor(id) {
  return RECORD_KEY + '.' + id;
}

function recordsKey() {
  return recordsKeyFor(ACTIVE_ACCOUNT);
}

function saveAccountList(list) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch (err) { /* ignore */ }
}

function loadAccountList() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      const list = Array.isArray(arr)
        ? arr.filter((a) => a && a.id && a.name).map((a) => ({ id: String(a.id), name: String(a.name).slice(0, 14), created: a.created || 0 }))
        : [];
      if (list.length) return list;
    }
  } catch (err) { /* storage unavailable */ }
  // first run: adopt any progress saved before accounts existed
  const first = { id: 'a' + Date.now().toString(36), name: 'PLAYER', created: Date.now() };
  try {
    const legacy = localStorage.getItem(RECORD_KEY);
    if (legacy) {
      localStorage.setItem(recordsKeyFor(first.id), legacy);
      localStorage.removeItem(RECORD_KEY);
    }
  } catch (err) { /* ignore */ }
  saveAccountList([first]);
  return [first];
}

let ACCOUNTS = loadAccountList();
let ACTIVE_ACCOUNT = (() => {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && ACCOUNTS.some((a) => a.id === id)) return id;
  } catch (err) { /* ignore */ }
  return ACCOUNTS[0].id;
})();

function activeAccount() {
  return ACCOUNTS.find((a) => a.id === ACTIVE_ACCOUNT) || ACCOUNTS[0];
}

function switchAccount(id) {
  if (!ACCOUNTS.some((a) => a.id === id)) return false;
  ACTIVE_ACCOUNT = id;
  try { localStorage.setItem(ACTIVE_KEY, id); } catch (err) { /* ignore */ }
  return true;
}

function createAccount(rawName) {
  if (ACCOUNTS.length >= ACCOUNT_ROWS) return null;
  const name = String(rawName || '').trim().replace(/\s+/g, ' ').slice(0, 14).toUpperCase();
  if (!name) return null;
  if (ACCOUNTS.some((a) => a.name === name)) return null;
  const acc = { id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 999), name, created: Date.now() };
  ACCOUNTS.push(acc);
  saveAccountList(ACCOUNTS);
  return acc;
}

function deleteAccount(id) {
  if (ACCOUNTS.length <= 1) return false;
  ACCOUNTS = ACCOUNTS.filter((a) => a.id !== id);
  saveAccountList(ACCOUNTS);
  try { localStorage.removeItem(recordsKeyFor(id)); } catch (err) { /* ignore */ }
  if (ACTIVE_ACCOUNT === id) switchAccount(ACCOUNTS[0].id);
  return true;
}

function difficultyFor(floor, modeIndex) {
  const mode = DIFFICULTIES[clamp(
    modeIndex === undefined ? DIFF_IDX : modeIndex, 0, DIFFICULTIES.length - 1
  )];
  return {
    floor,
    mode,
    hp: (1 + (floor - 1) * 0.4) * mode.hp,
    bulletSpeed: (1 + (floor - 1) * 0.09) * mode.bulletSpeed,
    enemies: Math.min(2, floor - 1) + mode.extra,
  };
}

/* ------------------------------ game ------------------------------ */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    // opaque + desynchronised: no per-frame alpha compositing of the canvas
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;

    this.input = new Input(canvas);
    this.sound = new SoundEngine();
    this.sound.muted = loadMute();
    this.particles = new ParticleSystem(700);
    this.bullets = new BulletPool(1000);

    this.state = 'title';
    this.time = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.flashAlpha = 0;
    this.toast = null;
    this.roomBanner = null;
    this.bossIntro = null;

    this.rooms = [];
    this.currentRoom = null;
    this.enemies = [];
    this.player = null;
    this.floor = 1;
    this.score = 0;
    this.records = loadRecords();
    this.accountCache = {};
    this.difficulty = difficultyFor(1);
    this.runRecorded = false;
    this.drawList = [];

    // LAN co-op: the host owns the run, the guest mirrors it (see net.js)
    this.player2 = null;
    this.coop = false;
    this.netRole = 'off';
    this.enemyUid = 0;

    this.fps = 60;
    this.showFps = true;
    this.lowFx = false;
    this.autoFx = true;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._slowWindows = 0;
    this._fastWindows = 0;
    this.upgradeChoices = [];
    this.upgradeHover = -1;
    this.relicRerolls = RELIC_REROLLS;
    this.replacingIndex = -1;
    this.replaceHover = -1;
    this.replaceMode = 'swap';
    this.upgradeDelay = 0;
    this.victoryDelay = 0;
    this.deathTimer = 0;
    this.transitionCd = 0;
    this.nuke = null;
    this.beams = [];
    this.cards = [];
    this.vaultPage = 0;
    this.runRelics = 0;
    this.diffIndex = loadDiffIndex();
    this.noProgress = false;
    this.recordsBackup = null;
    this.charIndex = loadCharIndex();
    if (!charUnlocked(CHAR_LIST[this.charIndex].id, this.records)) this.charIndex = 0;
    this.pauseHover = 0;
    this.pauseVotes = [false, false];
    this.spellHover = 0;

    this.titleBg = this.buildTitleBg();
    // a tap that misses the pad is a normal click, so every menu still works
    this.input.onTap = (p) => this.handleClick(p.x, p.y);
    this.input.onGesture = () => {
      this.sound.init();
      this.sound.resume();
    };

    this._acc = 0;
    this._last = undefined;
    this._tick = this._loop.bind(this);
    requestAnimationFrame(this._tick);
  }

  buildTitleBg() {
    const r = new Room(0, 0, 'start', 0);
    r.doors = { n: false, s: false, e: false, w: false };
    r.seed = 0x1f2e3d;
    paintRoomBackground(r);
    return r.bg;
  }

  /* --------------------------- loop ------------------------------ */

  _loop(ts) {
    if (this._last === undefined) this._last = ts;
    const rawDt = (ts - this._last) / 1000;
    this._last = ts;

    // real display rate, sampled in half-second windows
    this._fpsAcc += clamp(isFinite(rawDt) ? rawDt : 0, 0, 0.5);
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
      this.updateQuality();
    }

    let dt = rawDt;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;
    this._acc += dt;
    let steps = 0;
    while (this._acc >= STEP && steps < 5) {
      this.update(STEP);
      this._acc -= STEP;
      steps++;
    }
    if (steps === 5) this._acc = 0;
    this.render();
    requestAnimationFrame(this._tick);
  }

  /* Drops effect density automatically on slow machines, and restores it
     once the frame rate has been healthy for a few seconds. */
  updateQuality() {
    if (!this.autoFx || document.visibilityState !== 'visible') {
      this.particles.density = this.lowFx ? 0.4 : 1;
      return;
    }
    if (this.fps < 46) {
      this._slowWindows++;
      this._fastWindows = 0;
    } else if (this.fps > 56) {
      this._fastWindows++;
      this._slowWindows = 0;
    } else {
      this._slowWindows = 0;
    }
    if (!this.lowFx && this._slowWindows >= 2) {
      this.lowFx = true;
      this.toast = { text: 'LOW FX AUTO ON', t: 1.8 };
    } else if (this.lowFx && this._fastWindows >= 6) {
      this.lowFx = false;
      this._fastWindows = 0;
    }
    this.particles.density = this.lowFx ? 0.4 : 1;
  }

  /* -------------------------- update ----------------------------- */

  update(dt) {
    this.time += dt;
    const input = this.input;
    this.updateTouchAim();

    // the guest never simulates: it ships controls and draws the host's view
    if (this.netRole === 'guest') {
      NET.guestUpdate(this, dt);
      if (NET.role === 'wait') {
        const n = NET.rooms.length;
        // typing an address takes priority: digits are never lobby hotkeys
        const typeKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ':'];
        let typed = false;
        for (let i = 0; i < typeKeys.length; i++) {
          if (input.pressed(typeKeys[i])) {
            NET.typeAddress(typeKeys[i]);
            typed = true;
            break;
          }
        }
        if (input.pressed('backspace')) {
          NET.typeAddress('backspace');
          typed = true;
        }
        if (!typed && n && (input.pressed('up') || input.pressed('w'))) {
          NET.useList = true;
          NET.sel = (NET.sel + n - 1) % n;
        } else if (!typed && n && (input.pressed('down') || input.pressed('s'))) {
          NET.useList = true;
          NET.sel = (NET.sel + 1) % n;
        } else if (input.pressed('enter')) {
          if (NET.useList && NET.pickRoom(this)) {
            this.sound.select();
            this.toast = { text: 'JOINING ROOM ' + NET.code, t: 2 };
          } else if (NET.manual && NET.joinManual(this)) {
            this.sound.select();
          } else if (NET.pickRoom(this)) {
            this.sound.select();
            this.toast = { text: 'JOINING ROOM ' + NET.code, t: 2 };
          }
        } else if (input.pressed('r')) {
          NET.refreshLobby();
        }
      }
      if (input.pressed('escape')) {
        NET.stop();
        this.netRole = 'off';
        this.state = 'title';
        this.toast = { text: 'LEFT CO-OP', t: 2 };
      }
      input.endFrame();
      return;
    }

    // losing focus mid-run pauses instead of letting the crypt keep hitting you
    if (input.blurred) {
      input.blurred = false;
      if (this.state === 'playing') {
        this.state = 'paused';
        this.pauseHover = 0;
        this.toast = { text: 'PAUSED - WINDOW LOST FOCUS', t: 2 };
      }
    }

    if (input.pressed('m')) this.toggleMute();
    if (input.pressed('f')) this.showFps = !this.showFps;
    if (input.pressed('g')) {
      this.autoFx = false;
      this.lowFx = !this.lowFx;
      this._slowWindows = 0;
      this._fastWindows = 0;
      this.particles.density = this.lowFx ? 0.4 : 1;
      this.toast = { text: this.lowFx ? 'LOW FX ON' : 'FULL FX ON', t: 1.2 };
    }
    const clicks = input.consumeClicks();
    for (const c of clicks) this.handleClick(c.x, c.y);

    if (this.state === 'title') {
      if (input.pressed('escape') && NET && NET.hostWait) NET.hostWait = false;
      else if (input.pressed('enter') || input.pressed('space')) this.startRun();
      else if (input.pressed('h')) this.titleAction('host');
      else if (input.pressed('j')) this.titleAction('join');
      else if (input.pressed('l')) this.titleAction('vault');
      else if (input.pressed('o')) this.titleAction('accounts');
      else if (input.pressed('f1')) this.setDifficulty(0);
      else if (input.pressed('f2')) this.setDifficulty(1);
      else if (input.pressed('f3')) this.setDifficulty(2);
      else if (input.pressed('right') || input.pressed('d')) this.setChar((this.charIndex + 1) % CHAR_LIST.length);
      else if (input.pressed('left') || input.pressed('a')) this.setChar((this.charIndex + CHAR_LIST.length - 1) % CHAR_LIST.length);
      else {
        for (let i = 0; i < CHAR_LIST.length; i++) {
          if (input.pressed(String(i + 1))) {
            this.setChar(i);
            break;
          }
        }
      }
      this.updateTitleScene(dt);
    } else if (this.state === 'accounts') {
      if (input.pressed('escape') || input.pressed('o') || input.pressed('enter')) {
        this.state = 'title';
        this.sound.select();
      }
      this.updateTitleScene(dt);
    } else if (this.state === 'vault') {
      const pages = this.vaultPages();
      if (input.pressed('escape') || input.pressed('l') || input.pressed('enter')) {
        this.state = 'title';
      } else if (input.pressed('right') || input.pressed('d')) {
        this.vaultPage = Math.min(pages - 1, this.vaultPage + 1);
        this.sound.select();
      } else if (input.pressed('left') || input.pressed('a')) {
        this.vaultPage = Math.max(0, this.vaultPage - 1);
        this.sound.select();
      }
      this.updateTitleScene(dt);
    } else if (this.state === 'playing') {
      if (input.pressed('escape') || input.pressed('p')) {
        this.requestPause(0);
      } else if (this.player && (this.player.char === 'wizard' || this.player.char === 'cryomancer') && input.pressed('e')) {
        this.openSpellbook();
      } else if (this.player && this.player.char === 'cryomancer' && input.pressed('q')) {
        this.player.castCryoSpell(this);
      } else if (this.player && this.player.char === 'sniper' && input.pressed('q')) {
        const ammo = this.player.cycleAmmo();
        if (ammo) {
          this.sound.select();
          this.toast = { text: 'AMMO: ' + ammo.name, t: 1.4 };
          this.particles.ring(this.player.x, this.player.y, 8, 5, { color: ammo.color, speed: 70, life: 0.3 });
        }
      } else if (this.hitstop > 0) {
        this.hitstop -= dt;
      } else {
        this.updatePlaying(dt);
      }
    } else if (this.state === 'paused') {
      const n = PAUSE_BUTTONS.length;
      if (input.pressed('escape') || input.pressed('p')) {
        this.requestPause(0);
      } else if (input.pressed('up') || input.pressed('w')) {
        this.pauseHover = (this.pauseHover + n - 1) % n;
        this.sound.select();
      } else if (input.pressed('down') || input.pressed('s')) {
        this.pauseHover = (this.pauseHover + 1) % n;
        this.sound.select();
      } else if (input.pressed('enter') || input.pressed('space')) {
        this.pauseAction(this.pauseHover);
      }
    } else if (this.state === 'spellbook') {
      const n = this.player ? spellListFor(this.player.char).length : SPELLS.length;
      if (input.pressed('escape') || input.pressed('e')) {
        this.state = 'playing';
        this.sound.select();
      } else if (input.pressed('up') || input.pressed('left') || input.pressed('a') || input.pressed('w')) {
        this.spellHover = (this.spellHover + n - 1) % n;
        this.sound.select();
      } else if (input.pressed('down') || input.pressed('right') || input.pressed('d') || input.pressed('s')) {
        this.spellHover = (this.spellHover + 1) % n;
        this.sound.select();
      } else if (input.pressed('enter') || input.pressed('space')) {
        this.pickSpell(this.spellHover);
      } else {
        for (let i = 0; i < n; i++) {
          if (input.pressed(String(i + 1))) {
            this.pickSpell(i);
            break;
          }
        }
      }
    } else if (this.state === 'upgrade') {
      this.updateUpgradeHover();
      if (this.replacingIndex >= 0) {
        if (input.pressed('escape')) {
          this.replacingIndex = -1;
          this.sound.select();
        } else if (input.pressed('u') || input.pressed('tab')) {
          this.replaceMode = this.replaceMode === 'upgrade' ? 'swap' : 'upgrade';
          this.sound.select();
        } else {
          for (let i = 0; i < this.player.relics.length; i++) {
            if (input.pressed(String(i + 1))) {
              this.pickReplacement(i);
              break;
            }
          }
        }
      } else if (input.pressed('escape')) {
        this.skipUpgrade();
      } else if (input.pressed('r')) {
        this.rerollUpgrade();
      } else {
        for (let i = 0; i < this.upgradeChoices.length; i++) {
          if (input.pressed(String(i + 1))) this.chooseUpgrade(i);
        }
      }
    } else if (this.state === 'dying') {
      this.deathTimer -= dt;
      this.particles.update(dt);
      if (this.deathTimer <= 0) {
        this.state = 'gameover';
        this.recordRun(false);
        this.sound.gameOver();
      }
    } else if (this.state === 'gameover' || this.state === 'victory') {
      if (input.pressed('enter') || input.pressed('space')) this.startRun();
      this.particles.update(dt);
    }

    this.shake *= Math.pow(0.85, dt * 60);
    if (this.shake < 0.06) this.shake = 0;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.6);
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
    if (this.roomBanner) {
      this.roomBanner.t -= dt;
      if (this.roomBanner.t <= 0) this.roomBanner = null;
    }
    if (this.bossIntro) {
      this.bossIntro.t -= dt;
      if (this.bossIntro.t <= 0) this.bossIntro = null;
    }

    if (this.netRole === 'host') NET.hostUpdate(this, dt);
    input.endFrame();
  }

  setChar(i) {
    if (i < 0 || i >= CHAR_LIST.length || i === this.charIndex) return;
    if (!charUnlocked(CHAR_LIST[i].id, this.records)) {
      this.toast = { text: 'LOCKED - BEAT THE WARDEN TO UNLOCK', t: 2.0 };
      this.sound.tone(180, 110, 0.12, 'square', 0.04);
      return;
    }
    this.charIndex = i;
    saveCharIndex(i);
    this.sound.select();
  }

  setDifficulty(i) {
    const idx = clamp(i | 0, 0, DIFFICULTIES.length - 1);
    if (idx === this.diffIndex) return;
    this.diffIndex = idx;
    saveDiffIndex(idx);
    this.sound.select();
  }

  updateTitleScene(dt) {
    this.particles.update(dt);
    if (Math.random() < dt * 26) {
      this.particles.spawn(rand(20, VIEW_W - 20), VIEW_H - 12, {
        vx: rand(-6, 6),
        vy: rand(-26, -8),
        life: rand(1.4, 3.2),
        color: Math.random() < 0.5 ? C.cyan : C.magenta,
        size: 1,
        additive: true,
      });
    }
  }

  updatePlaying(dt) {
    const room = this.currentRoom;
    const p = this.player;
    if (!room || !p) return;

    p.update(dt, this);
    if (this.coop) this.updatePartner(dt);
    this.bullets.update(dt, this);
    this.tickRevive(p, dt);
    if (this.coop) this.tickRevive(this.player2, dt);

    // every enemy looks at whoever is closest to it, so the partner draws
    // fire too instead of the whole room chasing the host
    const aiFocus = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (this.coop) this.player = this.nearestPlayer(e.x, e.y);
      // frost slows everything the enemy does, not just its walk
      e.update(dt * (e.slowMul || 1), this);
      if (e.burnT > 0 && !e.dead) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          const rate = e.burnRate || 3;
          e.burnTick = 1 / rate;
          // stacks do not make the tick hit harder: they make it tick faster,
          // so every tick of fire is worth exactly one
          e.hit(e.burnOne ? 1 : Math.max(1, Math.round(e.burnDmg)), this);
          this.particles.burst(e.x, e.y - e.r * 0.5, 3, {
            color: '#ff7a3d', speed: 60, life: 0.3, size: 1, grav: -40,
          });
          const spread = this.player ? this.player.burnSpread : 0;
          if (spread > 0 && !e.dead) this.spreadBurn(e, spread);
        }
      }
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slowMul = 1;
      }
    }
    this.player = aiFocus;

    this.updateBeams(dt);

    // contact damage
    const bodies = this.coop ? [this.player, this.player2] : [this.player];
    for (const body of bodies) {
      if (!body || !body.alive) continue;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead || e.spawnT > 0) continue;
        if (dist(body.x, body.y, e.x, e.y) < e.r + body.r + 1) {
          const wasHit = body.canBeHit();
          body.hurt(e.contactDamage || (e.isBoss ? 2 : 1), this);
          if (wasHit && body.thorns > 0) e.hit(body.thorns, this);
          if (!body.alive) break;
        }
      }
    }

    this.updatePickups(dt);

    if (room.chest && !room.chest.opened) {
      room.chest.anim += dt;
      if (this.playerNear(room.chest.x, room.chest.y, 18)) this.openChest();
    }

    const portal = room.portal;
    if (portal) {
      portal.t += dt;
      if (Math.random() < dt * 18) {
        const a = rand(0, TAU);
        this.particles.spawn(portal.x + Math.cos(a) * 14, portal.y + Math.sin(a) * 14, {
          vx: -Math.cos(a) * 26, vy: -Math.sin(a) * 26, life: 0.5,
          color: Math.random() < 0.5 ? C.cyan : C.magenta, size: 1, additive: true,
        });
      }
      if (this.playerNear(portal.x, portal.y, 20)) {
        this.nextFloor();
        return;
      }
    }

    this.updateDoors(dt);
    this.particles.update(dt);

    if (this.upgradeDelay > 0) {
      this.upgradeDelay -= dt;
      if (this.upgradeDelay <= 0) this.openUpgrade();
    }
    if (this.victoryDelay > 0) {
      this.victoryDelay -= dt;
      if (this.victoryDelay <= 0) {
        this.score += 5000;
        this.state = 'victory';
        this.bullets.clear();
        this.recordRun(true);
        this.sound.victory();
      }
    }

    if (room.locked && this.enemies.length === 0 && room.type !== 'boss') {
      this.clearRoom(room);
    }
  }

  updateDoors(dt) {
    this.transitionCd = Math.max(0, this.transitionCd - dt);
    const room = this.currentRoom;
    if (!room || !this.player || this.transitionCd > 0 || room.locked) return;
    const movers = this.coop ? [this.player, this.player2] : [this.player];
    for (const p of movers) {
      if (!p || !p.alive) continue;
      if (p.y < 7 && room.doors.n && room.neighbors.n) {
        this.goThrough('n');
        return;
      }
      if (p.y > VIEW_H - 7 && room.doors.s && room.neighbors.s) {
        this.goThrough('s');
        return;
      }
      if (p.x < 7 && room.doors.w && room.neighbors.w) {
        this.goThrough('w');
        return;
      }
      if (p.x > VIEW_W - 7 && room.doors.e && room.neighbors.e) {
        this.goThrough('e');
        return;
      }
    }
  }

  goThrough(side) {
    const nb = this.currentRoom.neighbors[side];
    if (!nb) return;
    const entry = { n: 's', s: 'n', w: 'e', e: 'w' }[side];
    this.enterRoom(nb, entry);
  }

  enterRoom(room, fromSide) {
    this.currentRoom = room;
    room.visited = true;
    this.enemies = room.enemies;
    populateRoom(room, fromSide);
    this.bullets.clear();
    this.beams.length = 0;
    this.nuke = null;
    this.transitionCd = 0.3;
    this.roomBanner = { text: room.name, t: 2.2 };

    const p = this.player;
    if (fromSide && p) {
      if (fromSide === 'n') { p.x = VIEW_W / 2; p.y = 26; }
      else if (fromSide === 's') { p.x = VIEW_W / 2; p.y = VIEW_H - 26; }
      else if (fromSide === 'w') { p.x = 26; p.y = VIEW_H / 2; }
      else { p.x = VIEW_W - 26; p.y = VIEW_H / 2; }
      p.invuln = Math.max(p.invuln, 0.5);
      p.dashTime = 0;
      p.trail.length = 0;
      p.aegisReady = p.aegis > 0;
      p.dashChargesLeft = p.dashCharges;
      p.armor = Math.min(p.armorMax, p.armor + 1);
      p.armorTimer = 0;
      this.particles.ring(p.x, p.y, 10, 6, { color: C.cyan, speed: 40, life: 0.3 });
    }

    // the partner always follows the host through the same door
    const p2 = this.player2;
    if (this.coop && p2) {
      p2.x = clamp(p.x + 16, 20, VIEW_W - 20);
      p2.y = clamp(p.y + 8, 20, VIEW_H - 20);
      p2.dashTime = 0;
      if (p2.trail) p2.trail.length = 0;
      p2.invuln = Math.max(p2.invuln, 0.5);
      p2.dashChargesLeft = p2.dashCharges;
    }

    if (room.type === 'combat' && !room.cleared) {
      room.locked = true;
      this.sound.lock();
      this.particles.float(VIEW_W / 2, 46, 'DOORS SEALED', C.magenta, 1);
    }

    if (room.type === 'boss' && !room.cleared) {
      room.locked = true;
      if (!room.enemies.length && !room.bossSpawned) {
        room.bossSpawned = true;
        const boss = makeBoss(room);
        const bossHp = diffNow().hp;
        if (bossHp !== 1) {
          boss.maxHp = Math.max(1, Math.round(boss.maxHp * bossHp));
          boss.hp = boss.maxHp;
        }
        if (window.COOP_ACTIVE) {
          // the bar reads the phase pool, so that is what gets doubled too:
          // doubling only maxHp left every phase holding several bars of hp
          boss.maxHp *= 2;
          boss.phaseMaxHp = Math.round((boss.phaseMaxHp || boss.maxHp) * 2);
          boss.hp = boss.phaseMaxHp;
        }
        room.enemies.push(boss);
        this.bossIntro = {
          name: boss.name || 'BOSS',
          color: boss.isFinal ? C.red : boss.barColor || C.magenta,
          sub: boss.isFinal ? 'FINAL BOSS' : 'BOSS',
          t: boss.isFinal ? 3.6 : 2.8,
          max: boss.isFinal ? 3.6 : 2.8,
          final: !!boss.isFinal,
        };
        if (boss.isFinal) this.flashAlpha = 0.5;
        this.sound.bossRoar();
        this.shake = Math.max(this.shake, 9);
      }
    }

    if (room.type === 'treasure' && !room.cleared) {
      this.sound.tone(330, 440, 0.3, 'triangle', 0.05);
    }
    if (room.type === 'sanctum' && !room.cleared) {
      this.sound.tone(392, 587, 0.6, 'triangle', 0.05);
    }

    room.refreshSolid();
  }

  /* ------------------------ room / combat ------------------------ */

  onGraze(b) {
    this.score += 2;
    this.records.grazes++;
    const p = this.coop ? this.nearestPlayer(b.x, b.y) : this.player;
    if (!p) return;
    p.grazes++;
    p.grazeCount++;
    if (p.dashChargesLeft < p.dashCharges) p.dashCd = Math.max(0, p.dashCd - 0.05);
    if (p.grazeHeal > 0 && p.grazeCount % 30 === 0 && p.hp < p.maxHp) {
      p.heal(1);
      this.particles.float(p.x, p.y - 18, '+1 HP', C.heart, 1);
    }
    this.sound.graze();
    this.particles.spawn(b.x + rand(-2, 2), b.y + rand(-2, 2), {
      vx: rand(-26, 26), vy: rand(-26, 26), life: 0.24, color: C.white, size: 1, additive: true,
    });
    if (Math.random() < 0.25) {
      this.particles.float(p.x + rand(-5, 5), p.y - 14, 'GRAZE', C.cyan, 1);
    }
  }

  onEnemyDeath(e) {
    const mult = this.player ? this.player.greed : 1;
    this.score += Math.round(e.score * mult);
    this.records.kills++;
    if (this.player) {
      this.player.kills++;
      if (this.player.lifesteal > 0 && Math.random() < this.player.lifesteal && this.player.hp < this.player.maxHp) {
        this.player.heal(1);
        this.particles.float(this.player.x, this.player.y - 18, '+1', C.heart, 1);
      }
    }
    if (!e.isBoss && e.x !== undefined) {
      const roll = Math.random();
      const bonus = this.player ? this.player.dropBonus : 0;
      if (roll < 0.1 + bonus * 0.5) this.addPickup(e.x, e.y, 'heart');
      else if (roll < 0.36 + bonus) this.addPickup(e.x, e.y, 'soul');
    }
  }

  onBossDeath(e) {
    const room = this.currentRoom;
    room.cleared = true;
    room.locked = false;
    room.refreshSolid();
    this.bullets.clearEnemyBullets();
    this.beams.length = 0;
    this.nuke = null;
    this.records.bosses++;
    this.score += 2500 * this.floor + (this.player ? this.player.bounty : 0);
    saveRecords(this.records);
    this.flashAlpha = 0.9;
    if (this.floor >= FINAL_FLOOR) {
      this.victoryDelay = 2.6;
    } else {
      const px = e && e.x !== undefined ? e.x : VIEW_W / 2;
      const py = e && e.y !== undefined ? e.y : VIEW_H / 2;
      room.portal = {
        x: clamp(px, TILE * 3, VIEW_W - TILE * 3),
        y: clamp(py, TILE * 3, VIEW_H - TILE * 3),
        t: 0,
      };
      this.particles.ring(room.portal.x, room.portal.y, 18, 8, { color: C.magenta, speed: 70, life: 0.7 });
      this.particles.float(room.portal.x, room.portal.y - 26, 'STAIRS OPEN', C.magenta, 1);
    }
  }

  onPlayerDeath(p) {
    // with a partner still standing, a death is a knock-down, not the end
    if (this.coop && p) {
      const mate = p === this.player ? this.player2 : this.player;
      if (mate && mate.alive && mate !== p) {
        p.reviveT = 2.2;
        this.particles.float(p.x, p.y - 20, 'DOWNED', C.heart, 2);
        this.shake = Math.min(8, this.shake + 4);
        return;
      }
    }
    this.nuke = null;
    this.beams.length = 0;
    this.state = 'dying';
    this.deathTimer = 1.15;
    this.flashAlpha = 1;
    this.bullets.clear();
    this.sound.explode();
  }

  clearRoom(room) {
    room.locked = false;
    room.refreshSolid();
    room.cleared = true;
    this.score += 200;
    this.records.rooms++;
    saveRecords(this.records);
    const p = this.player;
    if (p && p.regen > 0 && p.hp < p.maxHp) {
      p.heal(p.regen);
      this.particles.float(p.x, p.y - 20, '+1 HP', C.heart, 1);
    }
    this.sound.clear();
    this.sound.unlock();
    this.particles.float(VIEW_W / 2, VIEW_H / 2 - 20, 'ROOM CLEAR', C.cyan, 2);
    this.particles.ring(VIEW_W / 2, VIEW_H / 2, 16, 10, { color: C.cyan, speed: 60, life: 0.5 });
    this.shake = Math.min(6, this.shake + 2);
    this.upgradeDelay = 0.75;
  }

  /* Is any hero (host or partner) this close to a point? */
  playerNear(x, y, r) {
    const p = this.player;
    if (p && p.alive && dist2(p.x, p.y, x, y) < r * r) return true;
    const q = this.player2;
    if (this.coop && q && q.alive && dist2(q.x, q.y, x, y) < r * r) return true;
    return false;
  }

  nearestPlayer(x, y) {
    const a = this.player;
    const b = this.player2;
    if (!this.coop || !b) return a;
    if (!b.alive) return a;
    if (!a || !a.alive) return b;
    return dist2(x, y, b.x, b.y) < dist2(x, y, a.x, a.y) ? b : a;
  }

  addPickup(x, y, type) {
    this.currentRoom.pickups.push({ x, y, type, t: rand(0, 3) });
  }

  updatePickups(dt) {
    const room = this.currentRoom;
    const p = this.player;
    if (!room || !p) return;
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const k = room.pickups[i];
      k.t += dt;
      // whoever is closer gets the pull, and the pickup
      const taker = this.nearestPlayer(k.x, k.y);
      if (!taker || !taker.alive) continue;
      const d = dist(k.x, k.y, taker.x, taker.y);
      if (d < taker.magnet) {
        const a = angleTo(k.x, k.y, taker.x, taker.y);
        k.x += Math.cos(a) * 90 * dt;
        k.y += Math.sin(a) * 90 * dt;
      }
      if (d < 9) {
        if (k.type === 'heart') {
          if (taker.hp < taker.maxHp) {
            taker.heal(1);
            this.particles.float(taker.x, taker.y - 18, '+1 HP', C.heart, 1);
          } else {
            this.score += 40;
            this.particles.float(taker.x, taker.y - 18, '+40', C.gold, 1);
          }
        } else {
          this.score += 20;
          this.particles.float(taker.x, taker.y - 14, '+20', C.cyan, 1);
        }
        this.sound.select();
        this.particles.burst(k.x, k.y, 6, {
          color: k.type === 'heart' ? C.heart : C.cyan, speed: 70, life: 0.3,
        });
        room.pickups.splice(i, 1);
      }
    }
  }

  openChest() {
    const chest = this.currentRoom.chest;
    const p = this.player;
    const kind = treasureKindOf(this.currentRoom);
    if (!chest || chest.opened) return;
    chest.opened = true;
    this.currentRoom.cleared = true;
    this.score += 100;
    this.sound.chest();
    this.shake = Math.min(5, this.shake + 1.5);
    this.particles.burst(chest.x, chest.y - 4, 26, {
      color: kind.glow, speed: 130, life: 0.9, size: 2, grav: 90, drag: 0.92,
    });
    this.particles.ring(chest.x, chest.y, 14, 8, { color: C.white, speed: 80, life: 0.4 });

    if (chest.kind === 'vault') {
      const gain = 1200 * Math.max(1, this.floor);
      this.score += gain;
      if (p) this.particles.float(p.x, p.y - 22, '+' + gain + ' SCORE', C.gold, 2);
    } else if (chest.kind === 'armory') {
      if (p) {
        p.bonusArmor = (p.bonusArmor || 0) + 1;
        p.recompute();
        p.armor = p.armorMax;
        this.particles.float(p.x, p.y - 22, 'ARMOR +1', '#9aa7b8', 2);
      }
    } else if (chest.kind === 'shrine') {
      if (p) {
        p.heal(3);
        p.armor = p.armorMax;
        this.particles.float(p.x, p.y - 22, '+3 HP', C.heart, 2);
      }
    } else if (chest.kind === 'sanctum') {
      this.openSanctum();
    } else {
      // reliquary: the usual relic draft
      this.upgradeDelay = 0.55;
    }
  }

  /* --------------------------- upgrades -------------------------- */

  /* A sanctum holds a single relic, rolled at random: one of the five
     legendaries the player does not already own, granted on the spot. */
  openSanctum() {
    const p = this.player;
    if (!p) return;
    // a shared legendary also has to be usable by the partner, but never at
    // the cost of denying the host one he could have had
    const relic = rollLegendaryRelic(p, this.partyChars()) || rollLegendaryRelic(p);
    if (!relic) {
      p.heal(5);
      p.armor = p.armorMax;
      this.particles.float(p.x, p.y - 22, 'NO LEGENDARY LEFT', C.gold, 2);
      return;
    }
    this.flashAlpha = Math.max(this.flashAlpha || 0, 0.35);
    this.shake = Math.max(this.shake, 3);
    this.particles.burst(p.x, p.y, 30, { color: '#ffcf4a', speed: 170, life: 0.8, size: 2, drag: 0.9 });
    this.particles.ring(p.x, p.y, 22, 10, { color: '#fff1c4', speed: 130, life: 0.7 });

    // A full relic set means the player picks which slot the legendary
    // replaces (or ranks up) instead of silently losing the oldest relic.
    this.upgradeChoices = [relic];
    this.cards = buildCardRects(1);
    this.state = 'upgrade';
    this.upgradeHover = -1;
    this.replacingIndex = -1;
    this.replaceMode = 'swap';
    this.toast = { text: p.relics.length >= MAX_RELICS ? 'SLOTS FULL - REPLACE ONE' : 'LEGENDARY: ' + relic.name, t: 2.6 };
    this.sound.upgrade();
    this.chooseUpgrade(0);
  }

  openUpgrade() {
    const p = this.player;
    this.upgradeChoices = rollRelicChoices(p, this.records, MAX_RELICS, this.partyChars());
    if (!this.upgradeChoices.length) {
      if (p && p.hp < p.maxHp) {
        p.heal(2);
        this.particles.float(p.x, p.y - 20, '+2 HP', C.heart, 1);
      }
      return;
    }
    this.cards = buildCardRects(this.upgradeChoices.length);
    this.state = 'upgrade';
    this.upgradeHover = -1;
    this.sound.upgrade();
  }

  updateUpgradeHover() {
    const m = this.input.mouseWorld();
    this.upgradeHover = -1;
    this.replaceHover = -1;
    if (this.replacingIndex >= 0) {
      const p = this.player;
      if (!p) return;
      for (let i = 0; i < p.relics.length; i++) {
        if (inRect(m.x, m.y, replaceRect(i))) this.replaceHover = i;
      }
      return;
    }
    for (let i = 0; i < this.cards.length; i++) {
      if (inRect(m.x, m.y, this.cards[i])) this.upgradeHover = i;
    }
  }

  /* A full relic set sends the pick to the swap picker instead of dropping
     the oldest card automatically. */
  chooseUpgrade(i) {
    const u = this.upgradeChoices[i];
    if (!u || !this.player) return;
    if (this.player.relics.length >= MAX_RELICS) {
      this.replacingIndex = i;
      this.replaceHover = -1;
      this.replaceMode = 'swap';
      this.sound.select();
      return;
    }
    this.applyRelic(u, -1);
  }

  applyRelic(u, index, upgraded) {
    const p = this.player;
    if (!u || !p) return;
    let removed = null;
    if (upgraded) {
      if (index < 0 || index >= p.relics.length || !p.upgradeSlot(index, u)) return;
    } else {
      removed = index >= 0 && index < p.relics.length ? p.swapRelic(index, u) : p.addRelic(u);
    }
    this.records.relics++;
    this.runRelics++;
    // legendary discovery bookkeeping (easy runs unlock nothing)
    if (u.legendary && !RECORDS_LOCKED) {
      this.records.legendaries = (this.records.legendaries || 0) + 1;
      this.records.legendaryMask = (this.records.legendaryMask || 0) | legendaryBit(u.id);
      this.runLegendaries = (this.runLegendaries || 0) + 1;
    }
    saveRecords(this.records);
    this.sound.upgrade();
    this.particles.float(p.x, p.y - 24, (upgraded ? 'UPGRADED ' : '') + u.name, upgraded ? C.gold : C.cyan, 1);
    if (removed) {
      const old = RELIC_BY_ID.get(removed);
      this.particles.float(p.x, p.y - 36, 'DROPPED ' + (old ? old.name : 'RELIC'), C.magenta, 1);
    }
    this.particles.ring(p.x, p.y, 14, 6, { color: C.cyan, speed: 70, life: 0.45 });
    this.particles.ring(p.x, p.y, 10, 4, { color: C.gold, speed: 50, life: 0.4 });
    this.upgradeChoices = [];
    this.cards = [];
    this.replacingIndex = -1;
    this.replaceHover = -1;
    this.replaceMode = 'swap';
    this.state = 'playing';
    this.transitionCd = Math.max(this.transitionCd, 0.2);
  }

  /* Applies the drafted relic to a slot, or spends the pick ranking that slot up. */
  pickReplacement(index) {
    const p = this.player;
    const u = this.upgradeChoices[this.replacingIndex];
    if (!p || !u) return;
    if (this.replaceMode === 'upgrade') {
      this.upgradeHeld(index);
      return;
    }
    this.applyRelic(u, index);
  }

  upgradeHeld(index) {
    const p = this.player;
    const id = p && p.relics[index];
    const next = id ? nextRelicTier(id) : null;
    if (!next) {
      this.toast = { text: 'THAT RELIC IS MAXED', t: 1.4 };
      this.sound.select();
      return;
    }
    if ((p.stacks[next.id] || 0) > 0) {
      this.toast = { text: next.name + ' ALREADY HELD', t: 1.4 };
      this.sound.select();
      return;
    }
    this.applyRelic(next, index, true);
  }

  rerollUpgrade() {
    if (this.state !== 'upgrade' || this.relicRerolls <= 0 || !this.player) return;
    const next = rollRelicChoices(this.player, this.records, MAX_RELICS, this.partyChars());
    if (!next.length) return;
    this.upgradeChoices = next;
    this.cards = buildCardRects(next.length);
    this.relicRerolls--;
    this.replacingIndex = -1;
    this.upgradeHover = -1;
    this.sound.select();
    this.toast = { text: 'REROLLED - ' + this.relicRerolls + ' LEFT', t: 1.4 };
  }

  skipUpgrade() {
    if (this.state !== 'upgrade') return;
    const p = this.player;
    this.particles.float(p.x, p.y - 24, 'RELIC SKIPPED', C.gray, 1);
    this.upgradeChoices = [];
    this.cards = [];
    this.replacingIndex = -1;
    this.replaceHover = -1;
    this.state = 'playing';
    this.transitionCd = Math.max(this.transitionCd, 0.2);
    this.sound.select();
  }

  /* ----------------------- pause / spell book -------------------- */

  pauseAction(i) {
    if (i === 0) {
      this.requestPause(0);
      this.sound.select();
    } else if (i === 1) {
      this.startRun();
    } else {
      this.quitToTitle();
    }
  }

  /* Drops the progress an EASY run built up in memory. */
  releaseRecords() {
    if (!this.recordsBackup) {
      RECORDS_LOCKED = false;
      return;
    }
    this.records = this.recordsBackup;
    this.recordsBackup = null;
    RECORDS_LOCKED = false;
    saveRecords(this.records);
  }

  quitToTitle() {
    this.releaseRecords();
    this.state = 'title';
    this.player = null;
    this.currentRoom = null;
    this.enemies.length = 0;
    this.bullets.clear();
    this.beams.length = 0;
    this.particles.clear();
    this.nuke = null;
    this.bossIntro = null;
    this.roomBanner = null;
    this.upgradeChoices = [];
    this.cards = [];
    this.transitionCd = 0;
    this.hitstop = 0;
    this.shake = 0;
    this.flashAlpha = 0;
    this.sound.select();
  }

  openSpellbook() {
    const p = this.player;
    if (!p || (p.char !== 'wizard' && p.char !== 'cryomancer')) return;
    const list = spellListFor(p.char);
    const cur = p.char === 'cryomancer' ? (p.cryoSpell | 0) : (p.spell | 0);
    this.spellHover = clamp(cur, 0, list.length - 1);
    this.state = 'spellbook';
    this.sound.select();
  }

  pickSpell(i) {
    const p = this.player;
    if (!p) return;
    const sp = spellListFor(p.char)[i];
    if (!sp) return;
    if (p.char === 'wizard') p.spell = i;
    else if (p.char === 'cryomancer') p.cryoSpell = i;
    else return;
    this.state = 'playing';
    this.transitionCd = Math.max(this.transitionCd, 0.15);
    this.toast = { text: sp.name + ' EQUIPPED', t: 1.6 };
    this.sound.upgrade();
    this.particles.ring(p.x, p.y, 16, 7, { color: '#7fd8ff', speed: 80, life: 0.45 });
  }

  /* ---------------------------- flow ----------------------------- */

  /* ---------------------------- LAN co-op ------------------------- */

  startLanHost() {
    if (typeof NET === 'undefined') return;
    this.sound.init();
    this.sound.resume();
    NET.hostStart(this);
  }

  /* Called by NET once the relay answers, never on the hosted static build. */
  beginLanHost() {
    this.netRole = 'host';
    this.startRun();
    this.toast = { text: 'OPEN FOR P2 - PRESS J ON THEIR MACHINE', t: 4 };
  }

  startLanGuest() {
    if (typeof NET === 'undefined') return;
    this.sound.init();
    this.sound.resume();
    this.netRole = 'guest';
    NET.guestStart(this);
  }

  /* The partner is a full hero: same relics, own health, own controls. */
  makePartner(char) {
    const p = this.player;
    const id = CHAR_LIST.some((c) => c.id === char) ? char : 'knight';
    const p2 = new Player(p.x + 16, p.y, id);
    p2.stacks = Object.assign({}, p.stacks || {});
    p2.relics = (p.relics || []).slice();
    p2.chains = JSON.parse(JSON.stringify(p.chains || {}));
    p2.recompute();
    p2.hp = p2.maxHp;
    p2.armor = p2.armorMax;
    p2.invuln = 1.5;
    p2.reviveT = 0;
    p2.relicSig = (p.relics || []).join(',');
    return p2;
  }

  onGuestHello(msg) {
    if (this.netRole !== 'host') return;
    NET.partnerChar = (msg && msg.char) || 'knight';
    if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'upgrade') {
      this.toast = { text: 'P2 JOINED - START A RUN', t: 3 };
      return;
    }
    if (this.coop) return;
    this.coop = true;
    window.COOP_ACTIVE = true;
    this.player2 = this.makePartner(NET.partnerChar);
    this.doubleTheFight();
    this.toast = { text: 'P2 JOINED - ENEMIES DOUBLED', t: 3.4 };
    this.particles.float(VIEW_W / 2, VIEW_H / 2 - 34, 'PLAYER 2 JOINED', C.gold, 2);
    this.shake = Math.max(this.shake, 4);
    this.sound.upgrade();
  }

  onGuestLeave() {
    if (!this.coop) return;
    this.coop = false;
    this.player2 = null;
    window.COOP_ACTIVE = false;
    // nobody is left to cast the second half of the vote
    this.pauseVotes = [false, false];
    if (this.state === 'paused') this.state = 'playing';
    this.toast = { text: 'P2 LEFT - BACK TO SOLO', t: 3 };
  }

  /* Pausing is a vote in co-op: both heroes ask before the crypt stops, and
     both have to release it before the fight resumes. who: 0 = P1, 1 = P2. */
  requestPause(who) {
    if (!this.coop || !this.player2) {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.pauseHover = 0;
      } else if (this.state === 'paused') {
        this.state = 'playing';
      }
      return;
    }
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const v = this.pauseVotes || (this.pauseVotes = [false, false]);
    v[who] = !v[who];
    if (v[0] && v[1]) {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.pauseHover = 0;
        this.toast = { text: 'PAUSED - BOTH AGREE', t: 2 };
      }
      return;
    }
    if (!v[0] && !v[1]) {
      if (this.state === 'paused') this.state = 'playing';
      return;
    }
    const other = who === 0 ? 'P2' : 'P1';
    this.toast = {
      text: this.state === 'paused' ? 'RESUME ASKED - WAITING FOR ' + other : 'PAUSE ASKED - WAITING FOR ' + other,
      t: 2.4,
    };
  }

  /* A joining partner doubles the fight: every living enemy gets a twin and
     any boss standing doubles its health pool. */
  doubleTheFight() {
    const room = this.currentRoom;
    if (!room || room.coopDoubled) return;
    room.coopDoubled = true;
    const extras = [];
    for (const e of room.enemies) {
      if (e.dead) continue;
      if (e.isBoss) {
        e.maxHp = Math.round(e.maxHp * 2);
        e.hp = e.maxHp;
        continue;
      }
      this.enemyUid += 1;
      const twin = makeEnemy(e.type, e.x + 18, e.y + 12, 5000 + this.enemyUid, room);
      twin.spawnT = 0.35;
      twin.spawnMax = 0.35;
      extras.push(twin);
    }
    for (const e of extras) room.enemies.push(e);
  }

  updatePartner(dt) {
    const p2 = this.player2;
    if (!p2) return;
    const real = this.input;
    const remote = NET.remote;
    if (p2.alive) {
      this.input = remote || real;
      p2.update(dt, this);
      this.input = real;
    }
    if (remote) {
      if (remote.pressed('q') && p2.alive) {
        if (p2.char === 'cryomancer') p2.castCryoSpell(this);
        else if (p2.char === 'sniper') p2.cycleAmmo();
      }
      remote.endFrame();
    }
    this.syncPartnerStats();
  }

  /* The heroes in this run: drafting is shared, so every pick has to suit
     all of them (see relicUsableBy). */
  partyChars() {
    if (!this.coop || !this.player2 || !this.player) return null;
    if (this.player2.char === this.player.char) return null;
    return [this.player2.char];
  }

  /* Relic picks are shared, but a relic the partner's hero cannot use is
     never pushed onto them: they keep the build they can actually play. */
  syncPartnerStats() {
    const a = this.player;
    const b = this.player2;
    if (!b || !a) return;
    const src = a.relics || [];
    const sig = src.join(',') + '|' + b.char;
    if (b.relicSig === sig) return;
    b.relicSig = sig;

    const chains = a.chains || {};
    const stacks = a.stacks || {};
    const relics = [];
    const keepChains = [];
    const keepStacks = {};
    for (let i = 0; i < src.length; i++) {
      if (!relicUsableBy(RELIC_BY_ID.get(src[i]), b.char)) continue;
      relics.push(src[i]);
      const chain = Array.isArray(chains[i]) ? chains[i] : [src[i]];
      keepChains.push(chain.filter((id) => relicUsableBy(RELIC_BY_ID.get(id), b.char)));
      keepStacks[src[i]] = stacks[src[i]] || 1;
    }
    b.relics = relics;
    b.chains = keepChains;
    b.stacks = keepStacks;
    b.recompute();
    if (b.hp > b.maxHp) b.hp = b.maxHp;
    // a rebuilt build must not leave a standing hero at zero hearts
    if (b.alive && b.hp < 1) b.hp = 1;
  }

  tickRevive(p, dt) {
    if (!p || !(p.reviveT > 0)) return;
    p.reviveT -= dt;
    if (p.reviveT > 0) return;
    p.reviveT = 0;
    p.alive = true;
    p.hp = Math.max(1, Math.ceil(p.maxHp / 2));
    const mate = p === this.player ? this.player2 : this.player;
    if (mate) {
      p.x = clamp(mate.x + 16, 22, VIEW_W - 22);
      p.y = clamp(mate.y, 22, VIEW_H - 22);
    }
    p.invuln = 2;
    if (p.trail) p.trail.length = 0;
    this.particles.ring(p.x, p.y, 14, 8, { color: C.gold, speed: 90, life: 0.5 });
    this.particles.float(p.x, p.y - 20, 'BACK UP', C.gold, 1);
    this.sound.upgrade();
  }

  startRun() {
    this.sound.init();
    this.sound.resume();
    // any start of a run settles the hosting panel: the address chip carries it
    if (typeof NET !== 'undefined') NET.hostWait = false;
    this.releaseRecords();
    // a locked hero (an old save, or a fresh account) never starts a run
    if (!charUnlocked(CHAR_LIST[this.charIndex].id, this.records)) this.charIndex = 0;
    this.diffIndex = clamp(this.diffIndex | 0, 0, DIFFICULTIES.length - 1);
    DIFF_IDX = this.diffIndex;
    const mode = DIFFICULTIES[this.diffIndex];
    this.noProgress = mode.noUnlock;
    RECORDS_LOCKED = mode.noUnlock;
    this.recordsBackup = mode.noUnlock ? Object.assign({}, this.records) : null;
    this.floor = 1;
    this.score = 0;
    this.runRecorded = false;
    this.difficulty = difficultyFor(1, this.diffIndex);
    this.bullets.speedScale = this.difficulty.bulletSpeed;
    const d = DungeonGenerator.generate(1);
    this.rooms = d.rooms;
    this.dungeon = d;
    this.player = new Player(VIEW_W / 2, VIEW_H / 2 + 26, CHAR_LIST[this.charIndex].id);
    this.player.stacks = {};
    // a partner who is already connected drops into every new run
    this.player2 = null;
    this.coop = false;
    this.pauseVotes = [false, false];
    if (this.netRole === 'host' && NET.guestHere) {
      this.coop = true;
      window.COOP_ACTIVE = true;
      this.player2 = this.makePartner(NET.partnerChar || 'knight');
    }
    window.COOP_ACTIVE = this.coop;
    this.bullets.clear();
    this.particles.clear();
    this.upgradeChoices = [];
    this.upgradeHover = -1;
    this.relicRerolls = RELIC_REROLLS;
    this.replacingIndex = -1;
    this.replaceHover = -1;
    this.cards = [];
    this.upgradeDelay = 0;
    this.victoryDelay = 0;
    this.nuke = null;
    this.beams.length = 0;
    this.runRelics = 0;
    this.deathTimer = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.flashAlpha = 0;
    this.state = 'playing';
    this.enterRoom(d.startRoom, null);
    this.roomBanner = { text: 'FLOOR 1 - ' + d.startRoom.name, t: 2.6 };
    this.sound.start();
  }

  nextFloor() {
    this.floor++;
    this.score += 1000 * (this.floor - 1);
    this.player.heal(2);
    this.player.armor = this.player.armorMax;
    this.player.armorTimer = 0;
    this.player.x = VIEW_W / 2;
    this.player.y = VIEW_H / 2 + 26;
    this.player.dashTime = 0;
    this.player.trail.length = 0;
    this.player.invuln = Math.max(this.player.invuln, 0.8);
    this.player.dashChargesLeft = this.player.dashCharges;
    this.player.aegisReady = this.player.aegis > 0;
    if (this.coop && this.player2) {
      this.player2.heal(Math.ceil(this.player2.maxHp / 2));
      this.player2.armor = this.player2.armorMax;
      this.player2.x = this.player.x + 16;
      this.player2.y = this.player.y;
      this.player2.alive = true;
      this.player2.reviveT = 0;
      this.player2.invuln = 2;
      this.player2.dashChargesLeft = this.player2.dashCharges;
    }
    this.bullets.clear();
    this.beams.length = 0;
    this.nuke = null;
    this.particles.clear();
    this.upgradeChoices = [];
    this.upgradeDelay = 0;
    this.difficulty = difficultyFor(this.floor, this.diffIndex);
    this.bullets.speedScale = this.difficulty.bulletSpeed;
    const d = DungeonGenerator.generate(this.floor);
    this.rooms = d.rooms;
    this.dungeon = d;
    this.enterRoom(d.startRoom, null);
    this.roomBanner = { text: 'FLOOR ' + this.floor + ' - ' + d.startRoom.name, t: 2.8 };
    this.state = 'playing';
    this.flashAlpha = 0.8;
    this.shake = 4;
    this.sound.descend();
    this.records.bestFloor = Math.max(this.records.bestFloor, this.floor);
    this.records.floors = Math.max(this.records.floors, this.floor);
    saveRecords(this.records);
  }

  recordRun(victory) {
    if (this.runRecorded) return;
    this.runRecorded = true;
    if (this.noProgress) {
      this.releaseRecords();
      return;
    }
    const r = this.records;
    r.runs++;
    if (victory) r.wins++;
    else r.deaths++;
    r.bestScore = Math.max(r.bestScore, this.score);
    r.score = Math.max(r.score, this.score);
    r.bestFloor = Math.max(r.bestFloor, this.floor);
    r.floors = Math.max(r.floors, this.floor);
    saveRecords(r);
  }

  toggleMute() {
    this.sound.init();
    const m = this.sound.toggleMute();
    saveMute(m);
    this.toast = { text: m ? 'MUTED' : 'SOUND ON', t: 1.2 };
    if (!m) this.sound.select();
  }

  handleClick(x, y) {
    this.sound.init();
    this.sound.resume();
    if (inRect(x, y, MUTE_RECT)) {
      this.toggleMute();
      return;
    }
    if (this.netRole === 'host' && NET && inRect(x, y, this.hostAddrRect || HOST_ADDR_RECT)) {
      this.copyJoinAddress();
      return;
    }
    if (this.state === 'title' && NET && NET.hostWait && inRect(x, y, this.hostWaitRect || { x: 0, y: 0, w: 0, h: 0 })) {
      this.copyJoinAddress();
      return;
    }
    if (this.state === 'title') {
      if (inRect(x, y, ACCOUNT_BTN)) {
        this.openAccounts();
        return;
      }
      for (let i = 0; i < TITLE_ACTIONS.length; i++) {
        if (inRect(x, y, titleActionRect(i))) {
          this.titleAction(TITLE_ACTIONS[i].id);
          return;
        }
      }
      for (let i = 0; i < DIFFICULTIES.length; i++) {
        if (inRect(x, y, diffRect(i))) {
          this.setDifficulty(i);
          return;
        }
      }
      for (let i = 0; i < CHAR_LIST.length; i++) {
        if (inRect(x, y, charRect(i))) {
          this.setChar(i);
          return;
        }
      }
      if (inRect(x, y, TITLE_PLAY)) {
        this.startRun();
        return;
      }
      return;
    } else if (this.state === 'accounts') {
      for (let i = 0; i < ACCOUNTS.length && i < ACCOUNT_ROWS; i++) {
        if (inRect(x, y, accountRowRect(i))) {
          if (ACCOUNTS[i].id !== ACTIVE_ACCOUNT) this.useAccount(ACCOUNTS[i].id);
          return;
        }
      }
      if (inRect(x, y, ACCOUNT_NEW)) this.addAccount();
      else if (inRect(x, y, ACCOUNT_DEL)) this.removeAccount();
      else if (inRect(x, y, ACCOUNT_BACK)) {
        this.state = 'title';
        this.sound.select();
      }
    } else if (this.state === 'upgrade') {
      if (this.replacingIndex >= 0) {
        const p = this.player;
        if (inRect(x, y, REPLACE_SWAP_RECT)) {
          this.replaceMode = 'swap';
          this.sound.select();
          return;
        }
        if (inRect(x, y, REPLACE_UP_RECT)) {
          this.replaceMode = 'upgrade';
          this.sound.select();
          return;
        }
        for (let i = 0; i < p.relics.length; i++) {
          if (inRect(x, y, replaceRect(i))) {
            this.pickReplacement(i);
            return;
          }
        }
        if (inRect(x, y, REPLACE_BACK)) {
          this.replacingIndex = -1;
          this.replaceHover = -1;
          this.sound.select();
        }
        return;
      }
      for (let i = 0; i < this.cards.length; i++) {
        if (inRect(x, y, this.cards[i])) {
          this.chooseUpgrade(i);
          return;
        }
      }
      if (inRect(x, y, REROLL_RECT)) {
        this.rerollUpgrade();
        return;
      }
      if (inRect(x, y, SKIP_RECT)) {
        this.skipUpgrade();
        return;
      }
    } else if (this.state === 'vault') {
      if (inRect(x, y, VAULT_PREV) && this.vaultPage > 0) {
        this.vaultPage--;
        this.sound.select();
      } else if (inRect(x, y, VAULT_NEXT) && this.vaultPage < this.vaultPages() - 1) {
        this.vaultPage++;
        this.sound.select();
      } else if (inRect(x, y, VAULT_BACK)) {
        this.state = 'title';
        this.sound.select();
      }
    } else if (this.state === 'gameover' || this.state === 'victory') {
      if (inRect(x, y, PLAY_RECT)) this.startRun();
    } else if (this.state === 'paused') {
      for (let i = 0; i < PAUSE_BUTTONS.length; i++) {
        if (inRect(x, y, pauseRect(i))) {
          this.pauseAction(i);
          return;
        }
      }
    } else if (this.state === 'spellbook') {
      const rows = this.player ? Math.min(spellListFor(this.player.char).length, SPELLBOOK_ROWS.length) : SPELLBOOK_ROWS.length;
      for (let i = 0; i < rows; i++) {
        if (inRect(x, y, SPELLBOOK_ROWS[i])) {
          this.pickSpell(i);
          return;
        }
      }
      this.state = 'playing';
    }
  }

  /* ------------------------ relics / vault ----------------------- */

  /* The title screen's secondary buttons, shared by mouse, tap and hotkey. */
  titleAction(id) {
    if (id === 'vault') this.openVault();
    else if (id === 'accounts') this.openAccounts();
    else if (id === 'host') this.startLanHost();
    else if (id === 'join') this.startLanGuest();
  }

  openVault() {
    this.vaultPage = 0;
    this.state = 'vault';
    this.sound.select();
  }

  /* --------------------------- accounts --------------------------- */

  openAccounts() {
    this.refreshAccountCache();
    this.state = 'accounts';
    this.accountHover = -1;
    this.sound.select();
  }

  /* Record summaries are read once per visit, never per frame. */
  refreshAccountCache() {
    this.accountCache = {};
    for (const a of ACCOUNTS) this.accountCache[a.id] = loadRecordsFor(a.id);
  }

  useAccount(id) {
    if (!switchAccount(id)) return;
    this.records = loadRecords();
    if (this.state === 'accounts') this.refreshAccountCache();
    this.sound.select();
    this.toast = { text: 'ACCOUNT: ' + activeAccount().name, t: 1.6 };
  }

  addAccount() {
    if (ACCOUNTS.length >= ACCOUNT_ROWS) {
      this.toast = { text: 'ACCOUNT LIMIT REACHED', t: 1.6 };
      return;
    }
    let name = null;
    try { name = window.prompt('NAME THIS ACCOUNT (MAX 14)', 'WARDEN'); } catch (err) { name = null; }
    if (name === null) return;
    const acc = createAccount(name);
    if (!acc) {
      this.toast = { text: 'NAME EMPTY OR TAKEN', t: 1.8 };
      return;
    }
    switchAccount(acc.id);
    this.records = loadRecords();
    this.refreshAccountCache();
    this.toast = { text: 'NEW ACCOUNT: ' + acc.name, t: 1.8 };
    this.sound.upgrade();
  }

  removeAccount() {
    if (ACCOUNTS.length <= 1) {
      this.toast = { text: 'KEEP AT LEAST ONE ACCOUNT', t: 1.8 };
      return;
    }
    const name = activeAccount().name;
    let ok = true;
    try { ok = window.confirm('DELETE ACCOUNT "' + name + '"? ITS PROGRESS IS LOST.'); } catch (err) { ok = true; }
    if (!ok) return;
    deleteAccount(ACTIVE_ACCOUNT);
    this.records = loadRecords();
    this.refreshAccountCache();
    this.toast = { text: 'DELETED ' + name, t: 1.8 };
    this.sound.select();
  }

  vaultPages() {
    return Math.max(1, Math.ceil(UPGRADES.length / VAULT_PER));
  }

  drawAccounts(ctx) {
    const m = this.input.mouseWorld();
    ctx.fillStyle = 'rgba(7,7,11,0.9)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Text.glow(ctx, 'ACCOUNTS', VIEW_W / 2, 16, C.white, C.cyan, 2, 'center', 1);
    Text.draw(ctx, 'EACH ACCOUNT KEEPS ITS OWN RECORDS AND UNLOCKS', VIEW_W / 2, 40, C.gray, 1, 'center');
    Text.draw(ctx, 'SAVED IN THIS BROWSER ONLY', VIEW_W / 2, 50, '#4d5666', 1, 'center');

    for (let i = 0; i < ACCOUNTS.length && i < ACCOUNT_ROWS; i++) {
      const acc = ACCOUNTS[i];
      const r = accountRowRect(i);
      const active = acc.id === ACTIVE_ACCOUNT;
      const hov = inRect(m.x, m.y, r);
      const recs = (this.accountCache && this.accountCache[acc.id]) || RECORD_DEFAULTS;
      ctx.fillStyle = active ? 'rgba(0,245,212,0.14)' : hov ? 'rgba(0,245,212,0.07)' : 'rgba(9,10,16,0.85)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = active ? C.cyan : hov ? C.cyanDim : '#2c3340';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      Text.draw(ctx, acc.name, r.x + 10, r.y + 5, active ? C.white : '#cfd6e2', 1, 'left');
      Text.draw(
        ctx,
        'BEST ' + String(recs.bestScore).padStart(6, '0') + '  F' + recs.bestFloor + '  RUNS ' + recs.runs,
        r.x + 10, r.y + 15, active ? '#8af5e3' : '#6f7a8a', 1, 'left'
      );
      Text.draw(ctx, active ? 'ACTIVE' : 'SWITCH', r.x + r.w - 10, r.y + 9, active ? C.gold : '#4d5666', 1, 'right');
    }

    const buttons = [
      { r: ACCOUNT_NEW, label: 'NEW ACCOUNT', on: ACCOUNTS.length < ACCOUNT_ROWS },
      { r: ACCOUNT_DEL, label: 'DELETE', on: ACCOUNTS.length > 1 },
      { r: ACCOUNT_BACK, label: 'BACK', on: true },
    ];
    for (const b of buttons) {
      const hov = b.on && inRect(m.x, m.y, b.r);
      ctx.fillStyle = b.on ? (hov ? 'rgba(0,245,212,0.18)' : 'rgba(0,245,212,0.05)') : 'rgba(7,8,12,0.6)';
      ctx.fillRect(b.r.x, b.r.y, b.r.w, b.r.h);
      ctx.fillStyle = b.on ? (hov ? C.cyan : '#2b5b55') : '#23242c';
      ctx.fillRect(b.r.x, b.r.y, b.r.w, 1);
      ctx.fillRect(b.r.x, b.r.y + b.r.h - 1, b.r.w, 1);
      ctx.fillRect(b.r.x, b.r.y, 1, b.r.h);
      ctx.fillRect(b.r.x + b.r.w - 1, b.r.y, 1, b.r.h);
      Text.draw(ctx, b.label, b.r.x + b.r.w / 2, b.r.y + 6, b.on ? (hov ? C.white : '#93a0b1') : '#3d4350', 1, 'center');
    }
    Text.draw(ctx, 'CLICK A ROW TO SWITCH   [O] OR ESC TO GO BACK', VIEW_W / 2, 274, '#4d5666', 1, 'center');
  }

  drawVault(ctx) {
    ctx.fillStyle = 'rgba(7,7,11,0.92)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const rec = this.records;
    const unlocked = unlockedRelicCount(rec);
    const draftable = UPGRADES.length - LEGENDARY_IDS.length;
    Text.glow(ctx, 'RELIC VAULT', VIEW_W / 2, 8, C.white, C.cyan, 2, 'center', 1);
    Text.draw(
      ctx,
      unlocked + ' / ' + draftable + ' UNLOCKED   LEGENDARY ' + legendaryFoundCount(rec) + '/' + LEGENDARY_IDS.length,
      VIEW_W / 2, 26, C.gray, 1, 'center'
    );
    const goal = nextRelicGoal(rec);
    if (goal && goal.relic.unlock) {
      const cur = Math.min(rec[goal.relic.unlock.stat] || 0, goal.relic.unlock.value);
      Text.draw(ctx, 'NEXT UNLOCK ' + goal.label + '  ' + cur + '/' + goal.relic.unlock.value, VIEW_W / 2, 37, C.goldDim, 1, 'center');
    }

    const page = this.vaultPage;
    for (let i = 0; i < VAULT_PER; i++) {
      const u = UPGRADES[page * VAULT_PER + i];
      if (!u) break;
      const r = VAULT_RECTS[i];
      const open = isRelicUnlocked(u, rec);
      const taken = this.player && this.player.stacks ? this.player.stacks[u.id] || 0 : 0;

      ctx.fillStyle = open ? '#141a22' : '#0d0e13';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = open ? '#1d5c55' : '#23242c';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);

      ctx.globalAlpha = open ? 1 : 0.3;
      drawUpgradeIcon(ctx, u.icon, r.x + 17, r.y + 22);
      ctx.globalAlpha = 1;

      const legendary = !!u.legendary;
      const found = legendary && legendaryFound(rec, u.id);
      const title = u.name.length > 15 ? u.name.slice(0, 15) : u.name;
      Text.draw(ctx, title, r.x + 32, r.y + 8, legendary ? (found ? '#ffcf4a' : '#4a4736') : (open ? C.white : '#5c6270'), 1, 'left');
      if (u.requires) {
        Text.draw(ctx, 'TIER CHAIN', r.x + 32, r.y + 19, '#4d5666', 1, 'left');
      } else if (legendary) {
        Text.draw(ctx, 'LEGENDARY', r.x + 32, r.y + 19, found ? '#8a6a1f' : '#3a3524', 1, 'left');
      }
      const line2 = legendary
        ? (found ? 'FOUND IN A SANCTUM' : 'UNDISCOVERED - SANCTUM')
        : open ? u.desc[0] : u.unlock ? u.unlock.label : 'LOCKED';
      Text.draw(ctx, line2, r.x + 32, r.y + 30, legendary ? (found ? '#ffcf4a' : '#4a4736') : (open ? C.cyan : C.magentaDim), 1, 'left');
      if (taken > 0) {
        Text.draw(ctx, 'TAKEN', r.x + r.w - 8, r.y + r.h - 12, C.gold, 1, 'right');
      }
    }

    this.drawVaultButton(ctx, VAULT_PREV, '<', page > 0);
    this.drawVaultButton(ctx, VAULT_NEXT, '>', page < this.vaultPages() - 1);
    this.drawVaultButton(ctx, VAULT_BACK, 'BACK', true);
    Text.draw(ctx, 'PAGE ' + (page + 1) + '/' + this.vaultPages(), VIEW_W / 2, 268, C.gray, 1, 'center');
  }

  drawVaultButton(ctx, r, label, on) {
    const m = this.input.mouseWorld();
    const hov = on && inRect(m.x, m.y, r);
    ctx.fillStyle = hov ? 'rgba(0,245,212,0.2)' : 'rgba(0,245,212,0.05)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? (hov ? C.cyan : '#2b5b55') : '#23242c';
    ctx.fillRect(r.x, r.y, r.w, 1);
    ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h);
    ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    Text.draw(ctx, label, r.x + r.w / 2, r.y + 5, on ? C.white : '#4d5666', 1, 'center');
  }

  /* ---------------------------- beams ---------------------------- */

  spawnBeam(x, y, angle, opts = {}) {
    this.beams.push({
      x,
      y,
      angle,
      len: opts.len || 620,
      charge: opts.charge === undefined ? 0.9 : opts.charge,
      active: opts.active === undefined ? 0.4 : opts.active,
      width: opts.width || 8,
      color: opts.color || C.cyan,
      track: opts.track || 0,
      damage: opts.damage || 1,
      t: 0,
      state: 'charge',
    });
  }

  updateBeams(dt) {
    const arr = this.beams;
    const p = this.player;
    for (let i = arr.length - 1; i >= 0; i--) {
      // a beam that kills the player ends the run and empties this list, so
      // the array can shrink under the loop: stop instead of reading past it
      if (this.beams !== arr || !arr[i]) break;
      const b = arr[i];
      b.t += dt;
      if (b.state === 'charge') {
        if (b.track > 0 && p && p.alive) {
          const want = angleTo(b.x, b.y, p.x, p.y);
          let diff = ((want - b.angle + Math.PI * 3) % TAU) - Math.PI;
          const lim = b.track * dt;
          if (diff > lim) diff = lim;
          else if (diff < -lim) diff = -lim;
          b.angle += diff;
        }
        if (b.t >= b.charge) {
          b.state = 'active';
          b.t = 0;
          this.sound.tone(900, 300, 0.1, 'sawtooth', 0.04);
        }
      } else {
        if (p && p.alive && b.t < b.active) {
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          const ux = Math.cos(b.angle);
          const uy = Math.sin(b.angle);
          const proj = clamp(dx * ux + dy * uy, 0, b.len);
          const ddx = dx - ux * proj;
          const ddy = dy - uy * proj;
          const rr = b.width * 0.5 + p.r;
          if (ddx * ddx + ddy * ddy <= rr * rr) p.hurt(b.damage, this);
          if (!p.alive || this.beams !== arr) return;
        }
        if (b.t >= b.active) arr.splice(i, 1);
      }
    }
  }

  drawBeams(ctx) {
    const arr = this.beams;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (!b) continue;
      ctx.save();
      ctx.translate(Math.round(b.x), Math.round(b.y));
      ctx.rotate(b.angle);
      if (b.state === 'charge') {
        const p = clamp(b.t / b.charge, 0, 1);
        ctx.globalAlpha = 0.14 + p * 0.3;
        ctx.fillStyle = b.color;
        ctx.fillRect(0, -0.5, b.len, 1);
        ctx.globalAlpha = 0.45 + p * 0.5;
        ctx.fillRect(0, -1, b.len * p, 2);
      } else {
        const p = clamp(b.t / b.active, 0, 1);
        const w = b.width * (1 - p * 0.35);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = b.color;
        ctx.fillRect(0, -w, b.len, w * 2);
        ctx.globalAlpha = 1;
        ctx.fillRect(0, -w / 2, b.len, w);
        ctx.fillStyle = C.white;
        ctx.fillRect(0, -2, b.len, 4);
      }
      ctx.restore();
    }
  }

  /* ------------------------ relic effects ------------------------ */

  onDash() {
    this.records.dashes++;
    const p = this.player;
    if (!p || p.dashBlast <= 0) return;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      const rr = 38 + e.r;
      if (dist2(p.x, p.y, e.x, e.y) <= rr * rr) e.hit(p.dashBlast, this);
    }
    this.particles.ring(p.x, p.y, 14, 8, { color: C.cyan, speed: 110, life: 0.3 });
  }

  onBulletHit(b, e) {
    if (b.explosive > 0) {
      this.explodeAt(b.x, b.y, Math.max(2, Math.round(b.damage * 0.5)), e);
    }
    if (b.chain > 0) this.chainFrom(e, b.chain, b.damage);
    if (b.cluster) {
      const base = Math.atan2(b.vy, b.vx);
      for (let i = -1; i <= 1; i += 2) {
        this.bullets.spawnFriendly(b.x, b.y, base + i * 0.6, 240, Math.max(1, Math.round(b.damage * 0.5)), {
          life: 0.5, w: 4, h: 4,
        });
      }
    }
    const p = this.player;
    if (b.crit && p && p.vamp && e.dead && p.hp < p.maxHp) {
      p.heal(1);
      this.particles.float(p.x, p.y - 20, '+1', C.heart, 1);
    }
  }

  /* Soft additive halo reused by every burning enemy. */
  burnGlowSprite() {
    if (this._burnGlow) return this._burnGlow;
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 48;
    const g2 = c.getContext('2d');
    const rad = g2.createRadialGradient(24, 24, 2, 24, 24, 24);
    rad.addColorStop(0, 'rgba(255,150,70,0.9)');
    rad.addColorStop(0.45, 'rgba(255,96,30,0.3)');
    rad.addColorStop(1, 'rgba(255,96,30,0)');
    g2.fillStyle = rad;
    g2.fillRect(0, 0, 48, 48);
    this._burnGlow = c;
    return c;
  }

  /* Frozen enemies wear a shell of ice: a chunky crust hugging their
     silhouette with icicles hanging off the bottom. Cached per radius, and
     generated from a fixed seed so a given size always freezes the same way
     instead of shivering into a new shape every frame. */
  iceCrustSprite(r) {
    if (!this._iceCrust) this._iceCrust = new Map();
    const key = Math.max(4, Math.round(r));
    if (this._iceCrust.has(key)) return this._iceCrust.get(key);
    const pad = 5;
    const s = key * 2 + pad * 2 + 2;
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    const g2 = c.getContext('2d');
    g2.imageSmoothingEnabled = false;
    const mid = s / 2;
    let seed = 7919 + key * 613;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    // the crust: a broken ring of ice, thicker where the frost pooled
    const steps = Math.max(16, Math.round(key * 2.6));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      // leave gaps so the body still shows through the shell
      if (rnd() < 0.22) continue;
      const wob = 0.96 + (rnd() - 0.5) * 0.12;
      const px = Math.round(mid + Math.cos(a) * key * wob);
      const py = Math.round(mid + Math.sin(a) * key * wob);
      const thick = rnd() < 0.3 ? 2 : 1;
      g2.fillStyle = rnd() < 0.3 ? '#cdf3ff' : rnd() < 0.7 ? '#7fe3ff' : '#3fb8e0';
      g2.fillRect(px, py, thick, thick);
      // frost creeping inward from the crust
      if (rnd() < 0.22) {
        const inx = Math.round(mid + Math.cos(a) * key * (wob - 0.22));
        const iny = Math.round(mid + Math.sin(a) * key * (wob - 0.22));
        g2.fillStyle = '#a9ecff';
        g2.fillRect(inx, iny, 1, 1);
      }
    }

    // icicles: narrow spikes under the body, longest near the middle
    const spikes = 3 + (key > 9 ? 2 : 0);
    for (let i = 0; i < spikes; i++) {
      const t = spikes > 1 ? i / (spikes - 1) : 0.5;
      const px = Math.round(mid + (t - 0.5) * key * 1.3);
      const len = 2 + Math.round(rnd() * 3 + (1 - Math.abs(t - 0.5) * 2) * 3);
      for (let k = 0; k < len; k++) {
        g2.fillStyle = k === len - 1 ? '#eafcff' : k < len - 2 ? '#3fb8e0' : '#7fe3ff';
        g2.fillRect(px, Math.round(mid + key - 1 + k), 1, 1);
      }
    }

    // a couple of pale glints so the shell reads as ice, not an outline
    for (let i = 0; i < 2; i++) {
      const a = rnd() * Math.PI * 2;
      const d = key * (0.3 + rnd() * 0.4);
      g2.fillStyle = 'rgba(214,246,255,0.6)';
      g2.fillRect(Math.round(mid + Math.cos(a) * d), Math.round(mid + Math.sin(a) * d), 1, 1);
    }

    this._iceCrust.set(key, c);
    return c;
  }

  /* Hairline fractures that crawl across the shell while the chill holds. */
  drawIceCracks(ctx, e, time) {
    const seed = (e.id || 1) * 2.7;
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) {
      const ang = seed + k * 2.1;
      let px = e.x + Math.cos(ang) * e.r * 0.85;
      let py = e.y + Math.sin(ang) * e.r * 0.85;
      const len = 3 + Math.round((Math.sin(seed * 3 + k) + 1) * 2);
      for (let step = 0; step < len; step++) {
        const wob = Math.sin(seed + k * 7 + step * 2.4) * 1.4;
        px += Math.cos(ang + 1.7 + wob * 0.25) * 1.6;
        py += Math.sin(ang + 1.7 + wob * 0.25) * 1.6;
        ctx.globalAlpha = step === 0 ? 0.85 : 0.3 + 0.25 * Math.sin(time * 7 + step);
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* The flamethrower heats the frame itself: a warm vignette that thickens
     the longer the trigger is held and cools off just as quickly. */
  drawHeatGlow(ctx) {
    const p = this.player;
    if (!p || p.char !== 'pyromancer' || !(p.heat > 0.02)) return;
    const heat = clamp(p.heat, 0, 1);
    if (!this._heatGrad) {
      const grad = ctx.createRadialGradient(
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.24,
        VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.8
      );
      grad.addColorStop(0, 'rgba(255,120,40,0)');
      grad.addColorStop(0.55, 'rgba(255,96,28,0.10)');
      grad.addColorStop(1, 'rgba(255,132,36,0.5)');
      this._heatGrad = grad;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + heat * 0.6;
    ctx.fillStyle = this._heatGrad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  /* WILDFIRE: a burning foe lights its neighbours, once each. */
  spreadBurn(source, radius) {
    if (!this.enemies) return;
    const pl = this.player;
    const longer = pl && pl.burnTime ? 1 + pl.burnTime : 1;
    for (let i = 0; i < this.enemies.length; i++) {
      const n = this.enemies[i];
      if (n === source || n.dead || n.spawnT > 0) continue;
      if (n.burnT > 0.6) continue; // already alight, no ping-pong
      if (dist(n.x, n.y, source.x, source.y) > radius + n.r) continue;
      // neighbours catch the same fire, at a fraction of the source's rate
      n.burnT = Math.max(n.burnT, 3.2 * longer);
      n.burnOne = 1;
      n.burnDmg = 0;
      n.burnStacks = Math.max(n.burnStacks || 0, 1);
      n.burnRate = Math.max(n.burnRate || 3, (source.burnRate || 3) * 0.7);
      n.burnTick = Math.min(n.burnTick || 0.32, 1 / n.burnRate);
      this.particles.ring(n.x, n.y, 7, 4, { color: '#ff7a3d', speed: 60, life: 0.28 });
    }
  }

  /* Burn: a short damage-over-time that keeps ticking after the round lands. */
  applyBurn(enemy, dmg, stack, plainSniper) {
    if (!enemy || enemy.dead) return;
    const pl = this.player;
    const longer = pl && pl.burnTime ? 1 + pl.burnTime : 1;
    // only announce the ignition, not all sixty hits a second of it
    const wasBurning = enemy.burnT > 0.6;

    // sniper incendiary rounds keep their own, untouched burn - none of the
    // fire relics or stacking rules apply to them
    if (plainSniper) {
      enemy.burnT = Math.max(enemy.burnT, 3.2);
      enemy.burnDmg = Math.max(enemy.burnDmg || 0, dmg * 0.18);
      enemy.burnOne = 0;
      enemy.burnRate = 3;
      enemy.burnTick = Math.min(enemy.burnTick || 0.32, 0.32);
      if (!wasBurning) {
        this.particles.burst(enemy.x, enemy.y, 6, {
          color: '#ff7a3d', speed: 90, life: 0.4, size: 1, grav: -60,
        });
        this.particles.float(enemy.x, enemy.y - enemy.r - 6, 'BURN', '#ff7a3d', 1);
      }
      return;
    }

    // fire: stacks are uncapped and raise the tick rate, never the damage
    if (stack) enemy.burnStacks = (enemy.burnStacks || 0) + 1;
    const stacks = enemy.burnStacks || 1;
    const mul = pl && pl.burnRateMul ? pl.burnRateMul : 1;
    enemy.burnOne = 1;
    enemy.burnDmg = 0;
    enemy.burnRate = (3 + stacks * 0.12) * mul;
    enemy.burnT = Math.max(enemy.burnT, 3.2 * longer);
    enemy.burnTick = Math.min(enemy.burnTick || 0.32, 1 / enemy.burnRate);
    if (!wasBurning) {
      this.particles.burst(enemy.x, enemy.y, 6, {
        color: '#ff7a3d', speed: 90, life: 0.4, size: 1, grav: -60,
      });
      this.particles.float(enemy.x, enemy.y - enemy.r - 6, 'BURN', '#ff7a3d', 1);
    }
  }

  /* Frost: slows the enemy's whole update, so it moves and attacks late. */
  applyFreeze(enemy, dmg) {
    if (!enemy || enemy.dead) return;
    const pl = this.player;
    const chill = pl && pl.chillMul ? pl.chillMul : 1;
    const longer = pl && pl.chillTime ? 1 + pl.chillTime : 1;
    const wasChilled = enemy.slowT > 0.6;
    enemy.slowT = Math.max(enemy.slowT, Math.min(6, 2.6 * longer));
    enemy.slowMul = Math.min(enemy.slowMul || 1, Math.max(0.1, 0.35 / chill));
    if (!wasChilled) {
      this.particles.burst(enemy.x, enemy.y, 7, {
        color: '#7fe3ff', speed: 80, life: 0.45, size: 1,
      });
      this.particles.ring(enemy.x, enemy.y, 8, 5, { color: '#eafcff', speed: 70, life: 0.3 });
      this.particles.float(enemy.x, enemy.y - enemy.r - 6, 'FROZEN', '#7fe3ff', 1);
    }
  }

  /* Explosive rounds: the bullet's own damage lands first, then this blast
     hits everything else in the radius. */
  explodeAt(x, y, dmg, source) {
    const r = 34;
    this.particles.ring(x, y, 16, 10, { color: '#fff6d6', speed: 190, life: 0.3 });
    this.particles.ring(x, y, 12, 7, { color: '#ff7a3d', speed: 130, life: 0.4 });
    this.particles.burst(x, y, 16, { color: '#ffcf4a', speed: 200, life: 0.4, size: 2, drag: 0.88 });
    this.particles.burst(x, y, 8, { color: '#ff7a3d', speed: 120, life: 0.5, size: 1, grav: -30 });
    this.shake = Math.min(7, this.shake + 1.6);
    this.sound.explode();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || e.spawnT > 0 || e === source) continue;
      const rr = r + e.r;
      if (dist2(x, y, e.x, e.y) <= rr * rr) e.hit(dmg, this);
    }
  }

  chainFrom(from, n, dmg) {
    if (n <= 0 || !from) return;
    const hit = new Set([from.id]);
    let src = from;
    for (let i = 0; i < n; i++) {
      let best = null;
      let bd = 90 * 90;
      for (let k = 0; k < this.enemies.length; k++) {
        const e = this.enemies[k];
        if (e.dead || e.spawnT > 0 || hit.has(e.id)) continue;
        const d2 = dist2(src.x, src.y, e.x, e.y);
        if (d2 < bd) { bd = d2; best = e; }
      }
      if (!best) return;
      for (let s = 1; s < 7; s++) {
        const t = s / 7;
        this.particles.spawn(lerp(src.x, best.x, t) + rand(-2, 2), lerp(src.y, best.y, t) + rand(-2, 2), {
          vx: rand(-8, 8), vy: rand(-8, 8), life: 0.2, color: C.cyan, size: 1, additive: true,
        });
      }
      best.hit(dmg * 0.6, this);
      hit.add(best.id);
      src = best;
    }
  }

  onNuke(boss) {
    this.flashAlpha = 1;
    this.shake = 18;
    this.hitstop = 0.1;
    this.sound.explode();
    this.sound.bossRoar();
    this.bullets.clearEnemyBullets();
    this.beams.length = 0;
    this.particles.burst(boss.x, boss.y, 90, {
      color: C.magenta, speed: 260, life: 1.2, size: 2, drag: 0.9,
    });
    this.particles.ring(boss.x, boss.y, 40, 18, { color: C.red, speed: 220, life: 0.9 });
    this.particles.float(VIEW_W / 2, 110, 'NUKE RELEASED', C.red, 2);
    const p = this.player;
    if (p && p.alive) p.instakill(this);
  }

  /* ---------------------------- render --------------------------- */

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.obsidian;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    HUD_LIFT = this.input.touchMode ? 46 : 0;

    if (this.netRole === 'guest') {
      NET.drawGuest(this, ctx);
      this.drawTouch(ctx);
      if (this.showFps) {
        Text.draw(ctx, 'FPS ' + this.fps, VIEW_W - 6, VIEW_H - 10, C.gray, 1, 'right');
      }
      return;
    }

    ctx.save();
    const shakeAmt = this.lowFx ? this.shake * 0.35 : this.shake;
    if (shakeAmt > 0) {
      ctx.translate(Math.round(rand(-shakeAmt, shakeAmt)), Math.round(rand(-shakeAmt, shakeAmt)));
    }

    if (this.state === 'title' || this.state === 'vault' || this.state === 'accounts') {
      this.drawTitleScene(ctx);
    } else {
      this.drawWorld(ctx);
      this.drawHeatGlow(ctx);
    }

    ctx.restore();

    if (this.state === 'title') {
      this.drawTitleUI(ctx);
    } else if (this.state === 'accounts') {
      this.drawAccounts(ctx);
    } else if (this.state === 'vault') {
      this.drawVault(ctx);
    } else {
      this.drawHUD(ctx);
      if (this.state === 'upgrade') this.drawUpgradeOverlay(ctx);
      if (this.state === 'spellbook') this.drawSpellbook(ctx);
      if (this.state === 'paused') this.drawPause(ctx);
      if (this.state === 'gameover') this.drawResult(ctx, false);
      if (this.state === 'victory') this.drawResult(ctx, true);
      if (this.state === 'dying') {
        const a = clamp(1 - this.deathTimer / 1.15, 0, 1) * 0.55;
        ctx.fillStyle = withAlpha(C.obsidian, a);
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
    }

    if (this.flashAlpha > 0) {
      ctx.fillStyle = withAlpha(C.heart, this.flashAlpha * 0.3);
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.showFps) {
      const col = this.lowFx ? C.gold : this.fps < 50 ? C.heart : C.gray;
      Text.draw(ctx, 'FPS ' + this.fps + (this.lowFx ? '  LOW FX' : ''), VIEW_W - 6, VIEW_H - 10, col, 1, 'right');
    }

    this.drawReticle(ctx);
    this.drawTouch(ctx);
  }

  /* ---------------------------- touch pad -------------------------- */

  /* The nearest foe, so a thumb-only player still shoots at something. */
  updateTouchAim() {
    const inp = this.input;
    if (!inp.touchMode) {
      inp.aimPoint = null;
      return;
    }
    const live = this.state === 'playing' || this.state === 'paused' || this.state === 'upgrade' || this.state === 'dying';
    if (!live) {
      inp.aimPoint = null;
      return;
    }
    const p = this.netRole === 'guest' ? NET.p2 : this.player;
    if (!p) {
      inp.aimPoint = null;
      return;
    }
    const list = this.netRole === 'guest' ? NET.enemyList : this.enemies;
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.dead || e.spawnT > 0) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    const a = best ? Math.atan2(best.y - p.y, best.x - p.x) : (p.aim || 0);
    inp.aimPoint = { x: p.x + Math.cos(a) * 90, y: p.y - 2 + Math.sin(a) * 90 };
  }

  drawTouch(ctx) {
    const inp = this.input;
    if (!inp.touchMode) return;
    if (this.state === 'title' || this.state === 'vault' || this.state === 'accounts') return;
    for (let i = 0; i < TOUCH_BUTTONS.length; i++) {
      const b = TOUCH_BUTTONS[i];
      const on = inp.touch.has(b.id);
      ctx.fillStyle = on ? 'rgba(0,245,212,0.30)' : 'rgba(7,7,11,0.38)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = on ? C.white : 'rgba(0,245,212,0.45)';
      ctx.fillRect(b.x, b.y, b.w, 1);
      ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
      ctx.fillRect(b.x, b.y, 1, b.h);
      ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
      if (b.id === 'up' || b.id === 'down' || b.id === 'left' || b.id === 'right') {
        // the pixel font has no arrow glyphs, so the arrows are drawn
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const s = 4;
        ctx.fillStyle = on ? C.white : 'rgba(0,245,212,0.75)';
        ctx.beginPath();
        if (b.id === 'up') {
          ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s); ctx.lineTo(cx - s, cy + s);
        } else if (b.id === 'down') {
          ctx.moveTo(cx, cy + s); ctx.lineTo(cx + s, cy - s); ctx.lineTo(cx - s, cy - s);
        } else if (b.id === 'left') {
          ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy - s); ctx.lineTo(cx + s, cy + s);
        } else {
          ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx - s, cy + s);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        Text.draw(ctx, b.label, b.x + b.w / 2, b.y + Math.round((b.h - 7) / 2), on ? C.white : 'rgba(0,245,212,0.6)', 1, 'center');
      }
    }
  }

  drawWorld(ctx) {
    const room = this.currentRoom;
    if (!room) return;
    if (room.bg) ctx.drawImage(room.bg, 0, 0);

    if (room.chest) this.drawChest(ctx, room.chest);
    if (room.portal) this.drawPortal(ctx, room.portal);

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

    // insertion sort into a reused array: no per-frame allocation
    const list = this.drawList;
    list.length = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      let j = list.length;
      while (j > 0 && list[j - 1].y > e.y) {
        list[j] = list[j - 1];
        j--;
      }
      list[j] = e;
    }
    for (let i = 0; i < list.length; i++) list[i].draw(ctx);
    // status markers sit on top of the sprite so burn/frost read instantly
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.burnT > 0) {
        // the flame column is a gauge: more burn stacks means a taller,
        // wider, faster-licking fire above the enemy
        const stacks = Math.max(1, e.burnStacks || 1);
        // sqrt growth: the flame keeps climbing with every stack, but never
        // gets so tall or so dense that it swallows the screen
        const grow = Math.sqrt(stacks);
        const n = Math.min(14, 3 + Math.round(grow * 2.4));
        const size = stacks >= 40 ? 4 : stacks >= 16 ? 3 : stacks >= 6 ? 2 : 1;
        // keeps climbing with every stack, easing off so a 300-stack fire
        // towers over the enemy without covering half the room
        const height = 5 + 30 * (1 - Math.exp(-grow / 4));
        const glowSize = 14 + Math.min(30, grow * 6);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.8, 0.16 + stacks * 0.02);
        ctx.drawImage(
          this.burnGlowSprite(),
          Math.round(e.x - glowSize / 2), Math.round(e.y - glowSize / 2 - 2),
          glowSize, glowSize
        );
        ctx.restore();
        for (let k = 0; k < n; k++) {
          const t = n > 1 ? k / (n - 1) : 0;
          const ph = this.time * (9 + Math.min(18, grow * 2)) + e.id + k * 1.7;
          const sway = Math.cos(ph) * (1 + Math.min(6, grow * 0.5));
          const fx = Math.round(e.x + sway);
          const fy = Math.round(e.y - e.r - 1 - t * height + Math.sin(ph * 1.7) * 1.5);
          ctx.fillStyle = t > 0.72 ? '#fff2c9' : t > 0.4 ? '#ffd166' : '#ff7a3d';
          ctx.fillRect(fx, fy, size, size);
        }
        // the number is how many burn ticks land per second, and it grows
        // in size once the fire is really roaring
        const rate = e.burnRate || 3;
        const label = rate >= 10 ? String(Math.round(rate)) : rate.toFixed(1);
        const cntScale = rate >= 9 ? 2 : 1;
        Text.draw(
          ctx, label, Math.round(e.x), Math.round(e.y - e.r - height - 8 - cntScale * 4),
          rate >= 9 ? '#fff2c9' : '#ffb347', cntScale, 'center'
        );
      }
      if (e.slowT > 0) {
        const shell = this.iceCrustSprite(e.r);
        // a faint wash of cold over the body, then the shell on top
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#5fc9ec';
        ctx.fillRect(Math.round(e.x - e.r) + 1, Math.round(e.y - e.r) + 1, Math.round(e.r * 2) - 2, Math.round(e.r * 2) - 2);
        ctx.globalAlpha = Math.min(0.9, 0.55 + e.slowT * 0.3);
        ctx.drawImage(shell, Math.round(e.x - shell.width / 2), Math.round(e.y - shell.height / 2));
        ctx.globalAlpha = 1;
        this.drawIceCracks(ctx, e, this.time);
        // frost flakes shed off the shell while it holds
        if (Math.random() < 0.1) {
          this.particles.burst(e.x + (Math.random() - 0.5) * e.r * 1.4, e.y + e.r * 0.5, 1, {
            color: Math.random() < 0.5 ? '#cdf3ff' : '#8fe4ff', speed: 16, life: 0.55, size: 1,
          });
        }
      }
    }
    if (this.player) this.player.draw(ctx, this);

    this.drawBeams(ctx);
    this.bullets.draw(ctx);
    this.particles.draw(ctx);
    this.particles.drawTexts(ctx);
    this.drawBarriers(ctx);

    if (room.portal && this.player && this.player.alive) {
      const near = dist2(this.player.x, this.player.y, room.portal.x, room.portal.y) < 44 * 44;
      if (near) Text.draw(ctx, 'DESCEND', room.portal.x, room.portal.y - 30, C.white, 1, 'center');
    }

    if (this.roomBanner) {
      const a = clamp(this.roomBanner.t, 0, 1);
      ctx.globalAlpha = a * 0.9;
      Text.draw(ctx, this.roomBanner.text, VIEW_W / 2, 44, C.white, 1, 'center');
      ctx.globalAlpha = 1;
    }

    if (this.toast) {
      ctx.globalAlpha = clamp(this.toast.t, 0, 1);
      Text.draw(ctx, this.toast.text, 84, VIEW_H - 15, C.gray, 1, 'left');
      ctx.globalAlpha = 1;
    }
  }

  /* Hovering a relic slot explains what that relic is currently doing. */
  drawRelicTip(ctx, slot, mouse) {
    const p = this.player;
    const u = RELIC_BY_ID.get(p.relics[slot]);
    if (!u) return;
    const rar = rarityOf(u);
    const chain = (p.chains && p.chains[slot]) || [u.id];
    const body = u.desc[0];
    const foot = chain.length > 1 ? 'TIER ' + chain.length : '';
    const pad = 4;
    const bodyLines = Text.wrap(body, 150);
    let bodyW = 0;
    for (let i = 0; i < bodyLines.length; i++) bodyW = Math.max(bodyW, Text.measure(bodyLines[i]));
    const w = Math.min(VIEW_W - 6, Math.max(Text.measure(u.name), bodyW, Text.measure(foot)) + pad * 2 + 2);
    const h = 14 + bodyLines.length * 9 + (foot ? 9 : 0);
    const sx = 8 + slot * 18;
    const tx = Math.round(clamp(sx + 8 - w / 2, 3, VIEW_W - 3 - w));
    const ty = Math.round(VIEW_H - 42 - h - 6);

    ctx.fillStyle = 'rgba(7,7,11,0.95)';
    ctx.fillRect(tx, ty, w, h);
    ctx.fillStyle = rar.color;
    ctx.fillRect(tx, ty, w, 1);
    ctx.fillRect(tx, ty + h - 1, w, 1);
    ctx.fillRect(tx, ty, 1, h);
    ctx.fillRect(tx + w - 1, ty, 1, h);
    // pointer down to the slot
    ctx.fillRect(Math.round(sx + 7), ty + h, 2, 3);

    Text.draw(ctx, u.name, tx + pad, ty + 4, rar.color, 1, 'left');
    for (let i = 0; i < bodyLines.length; i++) {
      Text.draw(ctx, bodyLines[i], tx + pad, ty + 13 + i * 9, '#c8d2e0', 1, 'left');
    }
    if (foot) Text.draw(ctx, foot, tx + pad, ty + 13 + bodyLines.length * 9, '#6f7a8a', 1, 'left');
  }

  drawChest(ctx, chest) {
    const kind = TREASURE_KINDS[chest.kind] || TREASURE_KINDS.reliquary;
    const x = Math.round(chest.x);
    const y = Math.round(chest.y);
    const glow = 0.3 + Math.sin(this.time * 3) * 0.12;
    ctx.globalAlpha = glow;
    ctx.fillStyle = kind.glow;
    ctx.fillRect(x - 15, y - 15, 30, 28);
    if (chest.kind === 'sanctum') {
      // rotating light shafts so the sanctum reads even from the doorway
      const spin = this.time * 0.6;
      ctx.globalAlpha = 0.16 + Math.sin(this.time * 2) * 0.06;
      ctx.fillStyle = '#fff1c4';
      for (let i = 0; i < 4; i++) {
        const a = spin + (i / 4) * TAU;
        ctx.fillRect(x + Math.round(Math.cos(a) * 12) - 1, y - 2 + Math.round(Math.sin(a) * 8), 3, 12);
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 11, y + 8, 22, 3);

    ctx.fillStyle = kind.body;
    ctx.fillRect(x - 10, y - 4, 20, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 10, y + 5, 20, 3);
    ctx.fillStyle = kind.trim;
    ctx.fillRect(x - 10, y + 1, 20, 2);
    ctx.fillRect(x - 1, y - 2, 2, 5);
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 1, y + 1, 2, 1);

    if (chest.opened) {
      ctx.fillStyle = '#2b2420';
      ctx.fillRect(x - 10, y - 12, 20, 4);
      ctx.fillStyle = kind.trim;
      ctx.fillRect(x - 9, y - 13, 18, 1);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = kind.glow;
      ctx.fillRect(x - 6, y - 30, 12, 18);
      ctx.fillRect(x - 3, y - 36, 6, 10);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = kind.body;
      ctx.fillRect(x - 11, y - 9, 22, 6);
      ctx.fillStyle = kind.trim;
      ctx.fillRect(x - 11, y - 9, 22, 1);
      ctx.fillRect(x - 2, y - 8, 4, 4);
    }
  }

  drawPortal(ctx, portal) {
    const x = Math.round(portal.x);
    const y = Math.round(portal.y);
    const t = portal.t || 0;
    const pulse = 0.5 + Math.sin(t * 4) * 0.2;
    ctx.globalAlpha = 0.16 + pulse * 0.16;
    ctx.fillStyle = C.magenta;
    ctx.fillRect(x - 20, y - 20, 40, 40);
    ctx.globalAlpha = 1;
    for (let r = 16; r >= 4; r -= 4) {
      ctx.fillStyle = r % 8 === 0 ? C.magenta : C.cyan;
      ctx.fillRect(x - 1, y - r, 2, r * 2);
      ctx.fillRect(x - r, y - 1, r * 2, 2);
    }
    ctx.fillStyle = '#0a0710';
    ctx.fillRect(x - 7, y - 7, 14, 14);
    const a = t * 3;
    ctx.fillStyle = C.white;
    ctx.fillRect(Math.round(x + Math.cos(a) * 5), Math.round(y + Math.sin(a) * 5), 2, 2);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(Math.round(x + Math.cos(a + Math.PI) * 5), Math.round(y + Math.sin(a + Math.PI) * 5), 2, 2);
  }

  drawBarriers(ctx) {
    const room = this.currentRoom;
    if (!room || !room.locked) return;
    const pulse = 0.5 + Math.sin(this.time * 7) * 0.28;
    const shift = Math.floor((this.time * 26) % 4);
    for (const side of ['n', 's', 'e', 'w']) {
      if (!room.doors[side]) continue;
      for (const t of doorTiles(side)) {
        const x = t[0] * TILE;
        const y = t[1] * TILE;
        ctx.globalAlpha = pulse * 0.35;
        ctx.fillStyle = C.magenta;
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = C.cyan;
        for (let i = 1; i < TILE - 1; i += 3) {
          ctx.fillRect(x + 1, y + i + shift, TILE - 2, 1);
        }
        ctx.globalAlpha = pulse * 0.8;
        ctx.fillStyle = C.white;
        ctx.fillRect(x + 2, y + 2, TILE - 4, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ----------------------------- HUD ----------------------------- */

  /* Partner block, bottom right: name, hearts, dash charges and relic slots,
     the same information the guest draws for both heroes. */
  /* The address P2 should type. The relay knows the LAN IP it is reachable
     on; the page's own origin is the same-machine fallback. */
  lanAddress() {
    const clean = (s) => String(s || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return clean(NET && NET.address) || clean(location.host) || 'THIS URL';
  }

  /* The address and room code, parked in the top-left all session. Clicking
     it copies, same as the big panel. */
  drawHostAddress(ctx, y) {
    const r = { x: HOST_ADDR_RECT.x, y: y, w: HOST_ADDR_RECT.w, h: HOST_ADDR_RECT.h };
    this.hostAddrRect = r;
    const m = this.input.touchMode ? { x: -99, y: -99 } : this.input.mouseWorld();
    const hov = inRect(m.x, m.y, r);
    ctx.fillStyle = hov ? 'rgba(0,245,212,0.12)' : 'rgba(7,7,11,0.62)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hov ? C.cyan : 'rgba(0,245,212,0.28)';
    ctx.fillRect(r.x, r.y, 1, r.h);
    ctx.fillRect(r.x, r.y, r.w, 1);
    Text.draw(ctx, this.lanAddress(), r.x + 5, r.y + 2, hov ? C.gold : C.white, 1, 'left');
    Text.draw(
      ctx,
      NET.guestHere ? 'CODE ' + NET.code + '   P2 JOINED' : 'CODE ' + NET.code + '   P2 PRESSES J',
      r.x + 5, r.y + 10,
      NET.guestHere ? '#4faf8f' : '#59636f', 1, 'left'
    );
  }

  /* Hosting shows its own panel from the click, before the relay answers: the
     address is on screen even while the lookup is in flight, and when it fails
     the panel says why instead of leaving the title screen untouched. */
  drawHostWait(ctx) {
    const w = 336;
    const h = 56;
    const r = { x: Math.round((VIEW_W - w) / 2), y: 94, w, h };
    this.hostWaitRect = r;
    const m = this.input.touchMode ? { x: -99, y: -99 } : this.input.mouseWorld();
    const hov = inRect(m.x, m.y, r);
    ctx.fillStyle = 'rgba(5,5,9,0.94)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hov ? C.cyan : 'rgba(0,245,212,0.45)';
    ctx.fillRect(r.x, r.y, r.w, 1);
    ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h);
    ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    // with no relay behind the page the address below is not one P2 can use,
    // so the heading says what is actually wrong instead of inviting a send
    const head = NET.hostError ? 'HOSTING NEEDS THE RELAY' : 'HOSTING - P2 OPENS THIS ADDRESS';
    Text.draw(ctx, head, r.x + 8, r.y + 6, NET.hostError ? C.heart : C.white, 1, 'left');
    Text.draw(ctx, this.lanAddress(), VIEW_W / 2, r.y + 18, hov ? C.white : C.gold, 2, 'center');
    if (NET.hostError) {
      Text.draw(ctx, NET.hostError, VIEW_W / 2, r.y + 39, C.heart, 1, 'center');
      Text.draw(ctx, 'START IT, THEN CLICK HOST AGAIN  -  ESC CLOSES', VIEW_W / 2, r.y + 48, '#59636f', 1, 'center');
    } else {
      Text.draw(ctx, 'CLICK TO COPY  -  ESC CLOSES', VIEW_W / 2, r.y + 39, '#59636f', 1, 'center');
      Text.draw(ctx, 'ASKING THE RELAY FOR THE LAN ADDRESS', VIEW_W / 2, r.y + 48, '#3d4350', 1, 'center');
    }
  }

  /* One click hands P1 the address to send to P2. */
  copyJoinAddress() {
    const addr = this.lanAddress();
    copyText(addr)
      .then(() => {
        this.toast = { text: 'COPIED ' + addr + ' - SEND IT TO P2', t: 4 };
        this.sound.select();
      })
      .catch(() => {
        this.toast = { text: 'COPY BLOCKED - READ ' + addr + ' OFF THIS SCREEN', t: 4.5 };
      });
  }

  drawCoopHUD(ctx) {
    const p2 = this.player2;
    if (!p2) return;
    const right = VIEW_W - 8;
    const slotsX = right - MAX_RELICS * 18;
    const heroName = (CHAR_LIST.filter((c) => c.id === p2.char)[0] || { name: 'P2' }).name;
    Text.draw(ctx, 'P2 ' + heroName, right, VIEW_H - 71 - HUD_LIFT, C.gold, 1, 'right');
    const hearts = Math.min(12, p2.maxHp);
    const hx = right - hearts * 8;
    for (let i = 0; i < hearts; i++) drawHeart(ctx, hx + i * 8, VIEW_H - 62 - HUD_LIFT, i < p2.hp, 1);
    if (!p2.alive) {
      Text.draw(ctx, p2.reviveT > 0 ? 'DOWN ' + p2.reviveT.toFixed(1) : 'DOWN', right, VIEW_H - 50 - HUD_LIFT, C.heart, 1, 'right');
    } else {
      drawDashMeter(ctx, p2, slotsX, VIEW_H - 50 - HUD_LIFT, MAX_RELICS * 18 - 2, this.time);
    }
    drawRelicSlots(ctx, p2.relics, slotsX, VIEW_H - 42 - HUD_LIFT, MAX_RELICS, -1, this.time);
  }

  drawHUD(ctx) {
    const p = this.player;
    if (!p) return;
    const room = this.currentRoom;
    if (this.coop || (this.netRole === 'host' && NET && !NET.guestHere)) this.drawCoopHUD(ctx);

    for (let i = 0; i < p.maxHp; i++) {
      drawHeart(ctx, 8 + i * 9, 7, i < p.hp, 1);
    }

    // armor plates: they soak damage before hearts (see Player.hurt)
    if (p.armorMax > 0) {
      const ax = 8 + p.maxHp * 9 + 5;
      for (let i = 0; i < p.armorMax; i++) {
        const px = ax + i * 8;
        const filled = i < p.armor;
        ctx.fillStyle = filled ? '#9aa7b8' : '#232a34';
        ctx.fillRect(px, 6, 6, 8);
        if (filled) {
          ctx.fillStyle = '#e8eef8';
          ctx.fillRect(px + 1, 7, 4, 1);
          ctx.fillStyle = '#5f6b7d';
          ctx.fillRect(px + 1, 12, 4, 1);
        }
        ctx.fillStyle = filled ? '#7d8896' : '#2b333f';
        ctx.fillRect(px, 6, 6, 1);
        ctx.fillRect(px, 13, 6, 1);
      }
      Text.draw(ctx, 'ARMOR', ax + p.armorMax * 8 + 3, 8, '#5f6b7d', 1, 'left');
    }

    drawDashMeter(ctx, p, 8, 18, 66, this.time);

    // character resource bar: wizard mana, sniper reload
    let hudY = 26;
    if (p.manaMax > 0) {
      const mf = clamp(p.mana / p.manaMax, 0, 1);
      const low = p.mana < p.castCost();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(7, hudY - 1, 66, 5);
      ctx.fillStyle = '#141f2b';
      ctx.fillRect(8, hudY, 64, 3);
      ctx.fillStyle = low ? C.magenta : '#4aa8ff';
      ctx.fillRect(8, hudY, Math.round(64 * mf), 3);
      Text.draw(ctx, 'MANA', 76, hudY - 2, low ? C.magenta : '#4aa8ff', 1, 'left');
      hudY += 8;
      const sp = p.spellDef ? p.spellDef() : null;
      if (sp) {
        Text.draw(ctx, sp.name, 8, hudY + 1, '#7fd8ff', 1, 'left');
        Text.draw(ctx, '[E] BOOK', 86, hudY + 1, '#4d5666', 1, 'left');
        hudY += 9;
      }
    } else if (p.char === 'sniper') {
      const rf = clamp(1 - p.fireCd / Math.max(0.001, p.fireRate), 0, 1);
      const readyShot = rf >= 1;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(7, hudY - 1, 66, 5);
      ctx.fillStyle = '#1a2014';
      ctx.fillRect(8, hudY, 64, 3);
      ctx.fillStyle = readyShot ? '#c8ff9e' : '#5b6d3f';
      ctx.fillRect(8, hudY, Math.round(64 * rf), 3);
      Text.draw(ctx, readyShot ? 'READY' : 'RELOAD', 76, hudY - 2, readyShot ? '#c8ff9e' : C.gray, 1, 'left');
      hudY += 8;
      const ammo = p.ammoDef ? p.ammoDef() : null;
      if (ammo) {
        Text.draw(ctx, ammo.name, 8, hudY + 1, ammo.color, 1, 'left');
        Text.draw(ctx, '[Q] SWAP', 86, hudY + 1, '#4d5666', 1, 'left');
        hudY += 9;
      }
    } else if (p.char === 'cryomancer') {
      const sp = p.cryoSpellDef ? p.cryoSpellDef() : null;
      const passive = !!(sp && sp.passive);
      const ready = passive || p.cryoCd <= 0;
      const cdFrac = p.cryoCdMax > 0 ? clamp(1 - p.cryoCd / p.cryoCdMax, 0, 1) : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(7, hudY - 1, 66, 5);
      ctx.fillStyle = '#12242b';
      ctx.fillRect(8, hudY, 64, 3);
      ctx.fillStyle = ready ? '#7fe3ff' : '#35586b';
      ctx.fillRect(8, hudY, Math.round(64 * (ready ? 1 : cdFrac)), 3);
      Text.draw(ctx, passive ? 'ALWAYS ON' : ready ? 'READY' : p.cryoCd.toFixed(1) + 'S', 76, hudY - 2, ready ? '#7fe3ff' : C.gray, 1, 'left');
      hudY += 8;
      if (sp) {
        Text.draw(ctx, sp.name, 8, hudY + 1, sp.color, 1, 'left');
        Text.draw(ctx, passive ? '[E] BOOK' : '[Q] CAST  [E] BOOK', 86, hudY + 1, '#4d5666', 1, 'left');
        hudY += 9;
      }
      if (passive) {
        Text.draw(ctx, 'BOLT ' + Math.max(0, p.cryoBoltT).toFixed(1) + 'S', 8, hudY + 1, '#bff3ff', 1, 'left');
        hudY += 9;
      }
    }
    Text.draw(ctx, 'SCORE ' + String(this.score).padStart(6, '0'), 8, hudY, C.gray, 1, 'left');
    // the join address sits under the score for the whole hosted session
    if (this.netRole === 'host' && NET) this.drawHostAddress(ctx, hudY + 10);
    Text.draw(ctx, 'FLOOR ' + this.floor + '/' + FINAL_FLOOR + '  ' + diffNow().name, VIEW_W / 2, 8, C.white, 1, 'center');
    if (room) Text.draw(ctx, room.name, VIEW_W / 2, 17, C.gray, 1, 'center');

    this.drawMinimap(ctx);
    drawSpeaker(ctx, MUTE_RECT.x + 3, MUTE_RECT.y + 4, this.sound.muted, 1);

    // four relic slots: a run can only ever hold MAX_RELICS of them
    const mouse = this.input.mouseWorld();
    let hoverRelic = -1;
    for (let i = 0; i < MAX_RELICS; i++) {
      const sx = 8 + i * 18;
      const sy = VIEW_H - 42 - HUD_LIFT;
      if (p.relics[i] && inRect(mouse.x, mouse.y, { x: sx, y: sy, w: 16, h: 16 })) hoverRelic = i;
    }
    if (this.coop) Text.draw(ctx, 'P1', 8, VIEW_H - 52 - HUD_LIFT, '#4d5666', 1, 'left');
    drawRelicSlots(ctx, p.relics, 8, VIEW_H - 42 - HUD_LIFT, MAX_RELICS, hoverRelic, this.time);
    if (hoverRelic >= 0) this.drawRelicTip(ctx, hoverRelic, mouse);

    const boss = room && room.type === 'boss'
      ? room.enemies.find((e) => e.isBoss && !e.dead)
      : null;
    drawBossBar(ctx, boss);

    if (this.nuke && this.nuke.boss && !this.nuke.boss.dead) {
      const nb = this.nuke.boss;
      const left = Math.max(0, nb.nukeDuration - nb.nukeT);
      const prog = clamp(nb.nukeDamage / nb.nukeThreshold, 0, 1);
      const w = 260;
      const x = (VIEW_W - w) / 2;
      const y = 150;
      ctx.fillStyle = 'rgba(24,4,12,0.86)';
      ctx.fillRect(x - 10, y - 26, w + 20, 58);
      ctx.fillStyle = withAlpha(C.red, 0.55 + Math.sin(this.time * 12) * 0.35);
      ctx.fillRect(x - 10, y - 26, w + 20, 1);
      ctx.fillRect(x - 10, y + 31, w + 20, 1);
      Text.draw(ctx, 'SUPER NUKE - BREAK IT', VIEW_W / 2, y - 22, C.red, 1, 'center');
      Text.draw(ctx, 'RELEASE IN ' + left.toFixed(1) + 'S', VIEW_W / 2, y - 12, C.white, 1, 'center');
      ctx.fillStyle = '#241826';
      ctx.fillRect(x, y, w, 8);
      ctx.fillStyle = prog >= 1 ? C.white : C.gold;
      ctx.fillRect(x, y, Math.round(w * prog), 8);
      ctx.fillStyle = '#12131c';
      for (let i = 1; i < 10; i++) ctx.fillRect(x + Math.round((w * i) / 10), y, 1, 8);
      Text.draw(ctx, Math.round(nb.nukeDamage) + ' / ' + nb.nukeThreshold + ' DAMAGE', VIEW_W / 2, y + 14, prog >= 1 ? C.cyan : C.gold, 1, 'center');
    }

    if (this.bossIntro) {
      const bi = this.bossIntro;
      if (bi.final) {
        this.drawFinalIntro(ctx, bi);
      } else {
        const fade = clamp(bi.t, 0, 1);
        const open = clamp((bi.max - bi.t) * 4, 0, 1);
        ctx.globalAlpha = 0.72 * fade;
        ctx.fillStyle = C.obsidian;
        ctx.fillRect(0, 84, VIEW_W, 46);
        ctx.globalAlpha = fade;
        ctx.fillStyle = bi.color;
        const half = Math.round(200 * open);
        ctx.fillRect(VIEW_W / 2 - half, 84, half * 2, 1);
        ctx.fillRect(VIEW_W / 2 - half, 129, half * 2, 1);
        Text.draw(ctx, bi.sub, VIEW_W / 2, 88, C.gray, 1, 'center');
        Text.draw(ctx, bi.name, VIEW_W / 2, 98, bi.color, 2, 'center');
        ctx.globalAlpha = 1;
      }
    }

    if (p.hp <= 1) {
      ctx.globalAlpha = 0.18 + Math.sin(this.time * 8) * 0.1;
      ctx.fillStyle = C.heart;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
  }

  drawFinalIntro(ctx, bi) {
    const k = 1 - bi.t / bi.max;
    const fade = clamp(k / 0.15, 0, 1) * clamp(bi.t / 0.6, 0, 1);
    ctx.globalAlpha = 0.86 * fade;
    ctx.fillStyle = C.obsidian;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = fade;

    const grow = clamp((k - 0.1) / 0.3, 0, 1);
    const half = Math.round(246 * grow);
    ctx.fillStyle = '#ff2b2e';
    ctx.fillRect(VIEW_W / 2 - half, 126, half * 2, 1);
    ctx.fillRect(VIEW_W / 2 - half, 152, half * 2, 1);
    ctx.fillStyle = 'rgba(255,43,46,0.3)';
    ctx.fillRect(VIEW_W / 2 - half, 127, half * 2, 1);

    const flick = 0.84 + Math.sin(this.time * 42) * 0.16;
    ctx.globalAlpha = fade * flick;
    Text.glow(ctx, bi.name, VIEW_W / 2, 131, '#ff2b2e', '#4a0000', 3, 'center', 1);
    ctx.globalAlpha = fade;
    Text.draw(ctx, bi.sub, VIEW_W / 2, 157, C.gray, 1, 'center');
    Text.draw(ctx, 'THE CRYPT HOLDS ITS BREATH', VIEW_W / 2, 170, '#6a7482', 1, 'center');
    ctx.globalAlpha = 1;
  }

  drawMinimap(ctx) {
    if (!this.rooms.length) return;
    let minX = 99, maxX = -99, minY = 99, maxY = -99;
    for (const r of this.rooms) {
      minX = Math.min(minX, r.gx);
      maxX = Math.max(maxX, r.gx);
      minY = Math.min(minY, r.gy);
      maxY = Math.max(maxY, r.gy);
    }
    const cw = 9;
    const ch = 7;
    const gap = 4;
    const sx = cw + gap;
    const sy = ch + gap;
    const w = (maxX - minX) * sx + cw;
    const h = (maxY - minY) * sy + ch;
    const ox = VIEW_W - 12 - w;
    const oy = 14;

    // panel with clipped corners
    ctx.fillStyle = 'rgba(7,7,11,0.84)';
    ctx.fillRect(ox - 7, oy - 7, w + 14, h + 14);
    ctx.fillStyle = '#262d3a';
    ctx.fillRect(ox - 7, oy - 7, w + 14, 1);
    ctx.fillRect(ox - 7, oy + h + 6, w + 14, 1);
    ctx.fillRect(ox - 7, oy - 7, 1, h + 14);
    ctx.fillRect(ox + w + 6, oy - 7, 1, h + 14);
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(ox - 7, oy - 7, 4, 1);
    ctx.fillRect(ox - 7, oy - 7, 1, 4);
    ctx.fillRect(ox + w + 3, oy + h + 3, 4, 1);
    ctx.fillRect(ox + w + 6, oy + h, 1, 4);

    // corridors between explored rooms
    for (const r of this.rooms) {
      if (!r.visited) continue;
      const x = ox + (r.gx - minX) * sx;
      const y = oy + (r.gy - minY) * sy;
      for (const s of ['n', 's', 'e', 'w']) {
        const nb = r.neighbors[s];
        if (!nb) continue;
        if (!(nb.visited || nb === this.currentRoom)) continue;
        ctx.fillStyle = '#39424f';
        if (s === 'n') ctx.fillRect(x + ((cw - 2) >> 1), y - gap, 2, gap + 1);
        else if (s === 's') ctx.fillRect(x + ((cw - 2) >> 1), y + ch, 2, gap);
        else if (s === 'w') ctx.fillRect(x - gap, y + ((ch - 2) >> 1), gap + 1, 2);
        else ctx.fillRect(x + cw, y + ((ch - 2) >> 1), gap, 2);
      }
    }

    for (const r of this.rooms) {
      const known = r.visited ||
        ['n', 's', 'e', 'w'].some((s) => r.neighbors[s] && r.neighbors[s].visited);
      if (!known) continue;
      const x = ox + (r.gx - minX) * sx;
      const y = oy + (r.gy - minY) * sy;

      if (!r.visited) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#2a3140';
        ctx.fillRect(x, y, cw, 1);
        ctx.fillRect(x, y + ch - 1, cw, 1);
        ctx.fillRect(x, y, 1, ch);
        ctx.fillRect(x + cw - 1, y, 1, ch);
        ctx.globalAlpha = 1;
        continue;
      }

      let col = r.cleared ? '#2f3a2a' : '#232935';
      if (r.type === 'treasure') col = r.cleared ? '#2f2a38' : treasureKindOf(r).rune;
      if (r.type === 'sanctum') col = r.cleared ? '#3a2f14' : '#ffcf4a';
      if (r.type === 'boss') col = r.cleared ? '#4a2030' : '#8f1d3f';
      ctx.fillStyle = col;
      ctx.fillRect(x, y, cw, ch);

      if (r.cleared) {
        ctx.fillStyle = 'rgba(255,183,3,0.5)';
        ctx.fillRect(x + 1, y + ch - 2, cw - 2, 1);
      }
      if (r.type === 'treasure') {
        ctx.fillStyle = r.cleared ? C.goldDim : treasureKindOf(r).trim;
        ctx.fillRect(x + 3, y + 2, 3, 3);
      }
      if (r.type === 'sanctum') {
        ctx.fillStyle = r.cleared ? '#7a5c18' : '#fff6d6';
        ctx.fillRect(x + 3, y + 1, 3, 5);
        ctx.fillStyle = '#ffcf4a';
        ctx.fillRect(x + 2, y + 2, 5, 1);
      }
      if (r.type === 'boss') {
        ctx.fillStyle = r.cleared ? '#a3195c' : C.magenta;
        ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        ctx.fillStyle = '#120b10';
        ctx.fillRect(x + 4, y + 3, 1, 1);
        ctx.fillRect(x + 6, y + 3, 1, 1);
      }
      if (r.type === 'start') {
        ctx.fillStyle = C.cyanDim;
        ctx.fillRect(x + 3, y + 2, 3, 3);
      }
      if (r === this.currentRoom) {
        const pulse = 0.55 + Math.sin(this.time * 6) * 0.35;
        ctx.fillStyle = C.cyan;
        ctx.fillRect(x - 1, y - 1, cw + 2, 1);
        ctx.fillRect(x - 1, y + ch, cw + 2, 1);
        ctx.fillRect(x - 1, y - 1, 1, ch + 2);
        ctx.fillRect(x + cw, y - 1, 1, ch + 2);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = C.white;
        ctx.fillRect(x + 3, y + 2, cw - 6, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  /* --------------------------- title ----------------------------- */

  drawTitleScene(ctx) {
    if (this.titleBg) ctx.drawImage(this.titleBg, 0, 0);
    ctx.fillStyle = 'rgba(7,7,11,0.58)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // pulsing arcane sigil behind the title
    const cx = VIEW_W / 2;
    const cy = 58;
    const pulse = 0.1 + Math.sin(this.time * 1.6) * 0.04;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 96 + Math.sin(this.time) * 3, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 72, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.particles.draw(ctx);
    this.particles.drawTexts(ctx);
  }

  drawTitleUI(ctx) {
    const cx = VIEW_W / 2;
    // account chip: current profile + best score live in the top corner
    const accRect = ACCOUNT_BTN;
    const accHov = inRect(this.input.mouseWorld().x, this.input.mouseWorld().y, accRect);
    const acc = activeAccount();
    ctx.fillStyle = accHov ? 'rgba(0,245,212,0.16)' : 'rgba(7,7,11,0.5)';
    ctx.fillRect(accRect.x, accRect.y, accRect.w, accRect.h);
    Text.draw(ctx, 'ACCOUNT: ' + acc.name, accRect.x + 4, accRect.y + 3, accHov ? C.white : '#6f7a8a', 1, 'left');
    Text.draw(ctx, '[O]', accRect.x + accRect.w - 4, accRect.y + 3, accHov ? C.cyan : '#3d4350', 1, 'right');
    Text.glow(ctx, 'CRYPT OF THE', cx, 26, C.white, C.cyan, 2, 'center', 1);
    Text.glow(ctx, 'LICH WARDEN', cx, 50, C.gold, C.magenta, 4, 'center', 1);
    // the subtitle line doubles as the one-line message slot
    const tag = this.toast ? this.toast.text
      : this.diffIndex === 0 ? 'EASY: NO RELIC OR RECORD UNLOCKS'
        : 'DESCEND ' + FINAL_FLOOR + ' FLOORS. SURVIVE THE WARDEN.';
    Text.draw(
      ctx, tag, cx, 84,
      this.toast ? C.white : this.diffIndex === 0 ? C.magenta : '#4d5666', 1, 'center'
    );

    // ---- character select ----
    const m = this.input.mouseWorld();
    for (let i = 0; i < CHAR_LIST.length; i++) {
      const ch = CHAR_LIST[i];
      const r = charRect(i);
      const st = CHAR_STATS[ch.id];
      const sel = i === this.charIndex;
      const hov = inRect(m.x, m.y, r);
      const locked = !charUnlocked(ch.id, this.records);

      ctx.fillStyle = sel ? 'rgba(0,245,212,0.12)' : hov ? 'rgba(0,245,212,0.07)' : '#0a0b10';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = sel ? C.cyan : hov && !locked ? C.cyanDim : '#2c3340';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      if (sel) {
        ctx.globalAlpha = 0.16 + Math.sin(this.time * 5) * 0.1;
        ctx.fillStyle = C.cyan;
        ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
        ctx.globalAlpha = 1;
      }

      if (locked) {
        ctx.globalAlpha = 0.22;
        this.drawCharPortrait(ctx, r, ch.id);
        ctx.globalAlpha = 1;
        Text.draw(ctx, 'LOCKED', r.x + r.w / 2, r.y + 45, '#8a2c44', 1, 'center');
        Text.draw(ctx, 'WIN A RUN', r.x + r.w / 2, r.y + 53, '#6a3a48', 1, 'center');
      } else {
        this.drawCharPortrait(ctx, r, ch.id);
        Text.draw(ctx, ch.name, r.x + r.w / 2, r.y + 46, sel ? C.white : '#8e9aab', 1, 'center');
      }
      Text.draw(ctx, String(i + 1), r.x + 5, r.y + 4, sel ? ch.color : locked ? '#2c3340' : '#39424f', 1, 'left');
    }

    // ---- selected hero: one tailored line, one stat line ----
    const sel = CHAR_LIST[this.charIndex];
    const ss = CHAR_STATS[sel.id];
    Text.draw(ctx, sel.name + '  -  ' + sel.desc[0] + ', ' + sel.desc[1], cx, 166, sel.color, 1, 'center');
    const extra = ss.manaMax > 0 ? '   MANA ' + ss.manaMax
      : ss.armor > 0 ? '   ARMOR ' + ss.armor
        : ss.storm ? '   STORM ' + STORM_RADIUS * 2 : '';
    Text.draw(
      ctx,
      'HP ' + ss.maxHp + '   DMG ' + ss.damage +
      '   RATE ' + (ss.fireRate < 0.02 ? 'STREAM' : (1 / ss.fireRate).toFixed(1) + '/S') +
      '   SPD ' + ss.speed + extra,
      cx, 176, '#6a7482', 1, 'center'
    );

    // ---- difficulty picker ----
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      const r = diffRect(i);
      const sel = i === this.diffIndex;
      const hov = inRect(m.x, m.y, r);
      ctx.fillStyle = sel ? 'rgba(0,245,212,0.14)' : hov ? 'rgba(0,245,212,0.07)' : 'rgba(7,7,11,0.7)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = sel ? C.cyan : hov ? C.cyanDim : '#2c3340';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      Text.draw(
        ctx, DIFFICULTIES[i].name, r.x + r.w / 2, r.y + 5,
        sel ? C.white : hov ? '#cfd6e2' : '#6a7482', 1, 'center'
      );
    }

    // ---- play ----
    const playHov = inRect(m.x, m.y, TITLE_PLAY);
    ctx.fillStyle = playHov ? 'rgba(0,245,212,0.22)' : 'rgba(0,245,212,0.09)';
    ctx.fillRect(TITLE_PLAY.x, TITLE_PLAY.y, TITLE_PLAY.w, TITLE_PLAY.h);
    ctx.fillStyle = playHov ? C.white : C.cyan;
    ctx.fillRect(TITLE_PLAY.x, TITLE_PLAY.y, TITLE_PLAY.w, 1);
    ctx.fillRect(TITLE_PLAY.x, TITLE_PLAY.y + TITLE_PLAY.h - 1, TITLE_PLAY.w, 1);
    ctx.fillRect(TITLE_PLAY.x, TITLE_PLAY.y, 1, TITLE_PLAY.h);
    ctx.fillRect(TITLE_PLAY.x + TITLE_PLAY.w - 1, TITLE_PLAY.y, 1, TITLE_PLAY.h);
    Text.draw(ctx, 'PLAY', cx - 8, TITLE_PLAY.y + 7, playHov ? C.white : C.cyan, 2, 'center');
    Text.draw(ctx, 'ENTER', TITLE_PLAY.x + TITLE_PLAY.w - 8, TITLE_PLAY.y + 11, playHov ? C.cyan : '#3d5a5e', 1, 'right');

    // ---- the other doors ----
    for (let i = 0; i < TITLE_ACTIONS.length; i++) {
      const a = TITLE_ACTIONS[i];
      const r = titleActionRect(i);
      const hov = inRect(m.x, m.y, r);
      ctx.fillStyle = hov ? 'rgba(0,245,212,0.12)' : 'rgba(7,7,11,0.5)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = hov ? C.cyan : '#2c3340';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      Text.draw(ctx, a.label, r.x + r.w / 2 - 5, r.y + 5, hov ? C.white : '#8e9aab', 1, 'center');
      Text.draw(ctx, a.key, r.x + r.w - 6, r.y + 5, hov ? C.cyan : '#3d4350', 1, 'right');
    }

    // ---- records, one quiet line ----
    // a dark strip seats the footer so the dungeon wall behind never eats it
    ctx.fillStyle = 'rgba(7,7,11,0.74)';
    ctx.fillRect(0, 262, VIEW_W, VIEW_H - 262);
    const rec = this.records;
    Text.draw(
      ctx,
      'BEST ' + String(rec.bestScore).padStart(6, '0') +
      '   DEEPEST F' + rec.bestFloor +
      '   WINS ' + rec.wins +
      '   RELICS ' + unlockedRelicCount(rec) + '/' + (UPGRADES.length - LEGENDARY_IDS.length) +
      '   LEGENDARY ' + legendaryFoundCount(rec) + '/' + LEGENDARY_IDS.length,
      cx, 270, '#59636f', 1, 'center'
    );

    // ---- controls, one line ----
    Text.draw(ctx, 'WASD MOVE  LMB FIRE  SPACE DASH  E SPELLS  Q AMMO  ESC PAUSE', cx, 279, '#4d5666', 1, 'center');
    // version sits opposite the FPS readout so the two never collide
    Text.draw(ctx, BUILD_TAG, MUTE_RECT.x + MUTE_RECT.w + 4, VIEW_H - 10, '#39424f', 1, 'left');
    drawSpeaker(ctx, MUTE_RECT.x + 3, MUTE_RECT.y + 4, this.sound.muted, 1);

    // last, so the panel sits over everything while hosting is being set up
    if (NET && NET.hostWait) this.drawHostWait(ctx);
  }

  /* The card art is the same sprite the game draws, scaled up, so the
     title screen and the dungeon never drift apart. */
  drawCharPortrait(ctx, r, id) {
    const x = r.x + Math.round(r.w / 2);
    const y = r.y + 38;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 8, y + 9, 16, 2);
    ctx.fillRect(x - 5, y + 11, 10, 1);
    ctx.save();
    ctx.translate(x, y);
    drawHeroBody(ctx, id, { animT: 0.9, moving: false, aim: 0 });
    ctx.restore();
  }

  /* --------------------------- overlays -------------------------- */

  drawUpgradeOverlay(ctx) {
    if (this.replacingIndex >= 0) {
      this.drawReplaceOverlay(ctx);
      return;
    }
    const p = this.player;
    const full = p && p.relics.length >= MAX_RELICS;
    ctx.fillStyle = 'rgba(7,7,11,0.84)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Text.glow(ctx, full ? 'SWAP A RELIC' : 'CHOOSE A RELIC', VIEW_W / 2, 44, C.white, C.cyan, 2, 'center', 1);
    Text.draw(
      ctx,
      full ? 'PICK ONE, THEN SWAP OR UPGRADE A SLOT' : 'YOUR POWER GROWS',
      VIEW_W / 2, 68, full ? C.gold: C.gray, 1, 'center'
    );

    for (let i = 0; i < this.upgradeChoices.length; i++) {
      const u = this.upgradeChoices[i];
      const r = this.cards[i];
      if (!r) continue;
      const hov = this.upgradeHover === i;
      const rar = rarityOf(u);
      const pulse = hov ? 0.45 + Math.sin(this.time * 8) * 0.15 : 0.2;

      ctx.fillStyle = hov ? 'rgba(0,245,212,0.16)' : 'rgba(0,245,212,0.05)';
      ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);

      ctx.fillStyle = hov ? '#1c2230' : '#12131c';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      ctx.globalAlpha = pulse;
      ctx.fillStyle = rar.color;
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(r.x + 10, r.y + 9, r.w - 20, 34);
      ctx.fillStyle = '#1a1a26';
      ctx.fillRect(r.x + 10, r.y + 30, r.w - 20, 1);
      drawUpgradeIcon(ctx, u.id, r.x + r.w / 2, r.y + 26);

      // long names and effect lines wrap onto a second line rather than
      // running off the card into its neighbours
      const innerW = r.w - 14;
      const nameLines = Text.wrap(u.name, innerW);
      const nameTop = r.y + 50 - Math.max(0, nameLines.length - 1) * 4;
      for (let n = 0; n < nameLines.length; n++) {
        Text.draw(ctx, nameLines[n], r.x + r.w / 2, nameTop + n * 9, hov ? C.white : '#cfd6e2', 1, 'center');
      }
      let ty = r.y + 69;
      for (let d = 0; d < u.desc.length; d++) {
        const lines = Text.wrap(u.desc[d], innerW);
        for (let k = 0; k < lines.length; k++) {
          if (ty > r.y + 78) break;
          Text.draw(ctx, lines[k], r.x + r.w / 2, ty, d === 1 ? rar.color : '#6f7a8a', 1, 'center');
          ty += 9;
        }
      }
      Text.draw(ctx, '[' + (i + 1) + ']', r.x + r.w / 2, r.y + r.h - 14, hov ? C.gold : '#4d5666', 1, 'center');
    }

    const m = this.input.mouseWorld();
    const buttons = [
      { r: REROLL_RECT, label: 'REROLL  [' + this.relicRerolls + ']', key: 'R', on: this.relicRerolls > 0 },
      { r: SKIP_RECT, label: 'SKIP', key: 'ESC', on: true },
    ];
    for (let b = 0; b < buttons.length; b++) {
      const btn = buttons[b];
      const hov = btn.on && inRect(m.x, m.y, btn.r);
      ctx.fillStyle = hov ? 'rgba(0,245,212,0.18)' : 'rgba(0,245,212,0.05)';
      ctx.fillRect(btn.r.x, btn.r.y, btn.r.w, btn.r.h);
      ctx.fillStyle = btn.on ? (hov ? C.cyan : '#2b333f') : '#23242c';
      ctx.fillRect(btn.r.x, btn.r.y, btn.r.w, 1);
      ctx.fillRect(btn.r.x, btn.r.y + btn.r.h - 1, btn.r.w, 1);
      ctx.fillRect(btn.r.x, btn.r.y, 1, btn.r.h);
      ctx.fillRect(btn.r.x + btn.r.w - 1, btn.r.y, 1, btn.r.h);
      Text.draw(
        ctx, btn.label, btn.r.x + btn.r.w / 2, btn.r.y + 6,
        btn.on ? (hov ? C.white : '#93a0b1') : '#3d4350', 1, 'center'
      );
    }

    Text.draw(ctx, 'CLICK A CARD OR PRESS 1-' + this.upgradeChoices.length, VIEW_W / 2, VIEW_H - 30, C.gray, 1, 'center');

    const goal = nextRelicGoal(this.records);
    if (goal && goal.relic.unlock) {
      const cur = Math.min(this.records[goal.relic.unlock.stat] || 0, goal.relic.unlock.value);
      Text.draw(
        ctx,
        'NEXT UNLOCK ' + goal.label + '  ' + cur + '/' + goal.relic.unlock.value,
        VIEW_W / 2, VIEW_H - 18, '#4d5666', 1, 'center'
      );
    }
  }

  drawReplaceOverlay(ctx) {
    const p = this.player;
    const u = this.upgradeChoices[this.replacingIndex];
    const m = this.input.mouseWorld();
    const upMode = this.replaceMode === 'upgrade';
    ctx.fillStyle = 'rgba(7,7,11,0.9)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Text.glow(
      ctx,
      upMode ? 'UPGRADE WHICH RELIC?' : 'REPLACE WHICH RELIC?',
      VIEW_W / 2, 24, C.white, C.cyan, 2, 'center', 1
    );
    Text.draw(
      ctx,
      upMode ? 'SPENDS THIS PICK - NO NEW RELIC' : 'MAKE ROOM FOR ' + (u ? u.name : 'THE NEW RELIC'),
      VIEW_W / 2, 46, upMode ? C.gold : C.gold, 1, 'center'
    );

    for (let i = 0; i < MAX_RELICS; i++) {
      const r = replaceRect(i);
      const id = p.relics[i];
      const relic = id ? RELIC_BY_ID.get(id) : null;
      const next = relic ? nextRelicTier(relic.id) : null;
      const canUp = !!next && !(p.stacks[next.id] > 0);
      const hov = this.replaceHover === i || inRect(m.x, m.y, r);
      const dim = upMode && !canUp;

      ctx.fillStyle = hov && !dim ? '#1c2230' : '#12131c';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = hov && !dim ? C.cyan : '#2b333f';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);

      if (relic) drawUpgradeIcon(ctx, relic.icon, r.x + 16, r.y + 13);
      const rar = relic ? rarityOf(relic) : null;
      Text.draw(ctx, relic ? relic.name : 'UNFILLED SLOT', r.x + 30, r.y + 4, dim ? '#4d5666' : (hov ? C.white : (rar ? rar.color : '#cfd6e2')), 1, 'left');
      if (relic) Text.draw(ctx, relic.desc[0], r.x + 30, r.y + 15, dim ? '#333a45' : '#6f7a8a', 1, 'left');

      if (upMode) {
        Text.draw(
          ctx, canUp ? '> ' + next.name : 'MAX', r.x + r.w - 32, r.y + 6,
          canUp ? (hov ? C.gold : '#b58a2a') : '#3d4350', 1, 'right'
        );
      }
      Text.draw(ctx, '[' + (i + 1) + ']', r.x + r.w - 6, r.y + 6, hov ? C.gold : '#4d5666', 1, 'right');
    }

    const modes = [
      { r: REPLACE_SWAP_RECT, label: 'SWAP RELIC', on: !upMode },
      { r: REPLACE_UP_RECT, label: 'UPGRADE', on: upMode },
    ];
    for (let i = 0; i < modes.length; i++) {
      const b = modes[i];
      const hov = inRect(m.x, m.y, b.r);
      ctx.fillStyle = b.on ? 'rgba(0,245,212,0.16)' : hov ? 'rgba(0,245,212,0.09)' : 'rgba(7,7,11,0.55)';
      ctx.fillRect(b.r.x, b.r.y, b.r.w, b.r.h);
      ctx.fillStyle = b.on ? C.cyan : hov ? C.cyanDim : '#2b333f';
      ctx.fillRect(b.r.x, b.r.y, b.r.w, 1);
      ctx.fillRect(b.r.x, b.r.y + b.r.h - 1, b.r.w, 1);
      ctx.fillRect(b.r.x, b.r.y, 1, b.r.h);
      ctx.fillRect(b.r.x + b.r.w - 1, b.r.y, 1, b.r.h);
      Text.draw(ctx, b.label, b.r.x + b.r.w / 2, b.r.y + 5, b.on ? C.white : '#93a0b1', 1, 'center');
    }

    const back = inRect(m.x, m.y, REPLACE_BACK);
    ctx.fillStyle = back ? 'rgba(0,245,212,0.18)' : 'rgba(0,245,212,0.05)';
    ctx.fillRect(REPLACE_BACK.x, REPLACE_BACK.y, REPLACE_BACK.w, REPLACE_BACK.h);
    ctx.fillStyle = back ? C.cyan : '#2b333f';
    ctx.fillRect(REPLACE_BACK.x, REPLACE_BACK.y, REPLACE_BACK.w, 1);
    ctx.fillRect(REPLACE_BACK.x, REPLACE_BACK.y + REPLACE_BACK.h - 1, REPLACE_BACK.w, 1);
    ctx.fillRect(REPLACE_BACK.x, REPLACE_BACK.y, 1, REPLACE_BACK.h);
    ctx.fillRect(REPLACE_BACK.x + REPLACE_BACK.w - 1, REPLACE_BACK.y, 1, REPLACE_BACK.h);
    Text.draw(ctx, 'CANCEL', REPLACE_BACK.x + REPLACE_BACK.w / 2, REPLACE_BACK.y + 5, back ? C.white : '#93a0b1', 1, 'center');

    Text.draw(ctx, '1-' + MAX_RELICS + ' PICK SLOT   U/TAB SWAP-UPGRADE   ESC BACK', VIEW_W / 2, VIEW_H - 22, '#4d5666', 1, 'center');
  }

  drawPause(ctx) {
    const m = this.input.mouseWorld();
    ctx.fillStyle = 'rgba(7,7,11,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    Text.glow(ctx, 'PAUSED', VIEW_W / 2, 80, C.white, C.cyan, 3, 'center', 1);
    Text.draw(ctx, 'THE CRYPT WAITS', VIEW_W / 2, 112, C.gray, 1, 'center');
    if (this.coop && this.player2) {
      const v = this.pauseVotes || [false, false];
      const held = [];
      if (v[0]) held.push('P1');
      if (v[1]) held.push('P2');
      Text.draw(ctx, held.length ? held.join(' + ') + ' HOLDING' : 'BOTH RELEASED', VIEW_W / 2, 122, held.length ? C.gold : C.cyanDim, 1, 'center');
      if (held.length < 2) Text.draw(ctx, 'WAITING FOR ' + (v[0] ? 'P2' : 'P1'), VIEW_W / 2, 358, C.heart, 1, 'center');
    }

    for (let i = 0; i < PAUSE_BUTTONS.length; i++) {
      const r = pauseRect(i);
      const mouse = inRect(m.x, m.y, r);
      if (mouse) this.pauseHover = i;
      const hov = mouse || this.pauseHover === i;
      ctx.fillStyle = hov ? 'rgba(0,245,212,0.18)' : 'rgba(0,245,212,0.05)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = hov ? C.cyan : '#2b333f';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      Text.draw(ctx, PAUSE_BUTTONS[i].label, r.x + r.w / 2, r.y + 6, hov ? C.white : '#93a0b1', 1, 'center');
    }

    const hint = this.coop && this.player2 ? 'P TO RELEASE THE PAUSE   W/S + ENTER SELECT' : 'ESC RESUME   W/S + ENTER SELECT';
    Text.draw(ctx, hint, VIEW_W / 2, VIEW_H - 24, '#4d5666', 1, 'center');
    Text.draw(ctx, 'ACCOUNT ' + activeAccount().name, 26, VIEW_H - 15, '#3d4350', 1, 'left');
    drawSpeaker(ctx, MUTE_RECT.x + 3, MUTE_RECT.y + 4, this.sound.muted, 1);
  }

  drawSpellbook(ctx) {
    const p = this.player;
    if (!p) return;
    const m = this.input.mouseWorld();
    ctx.fillStyle = 'rgba(7,7,11,0.84)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const bx = 48;
    const by = 36;
    const bw = VIEW_W - 96;
    const bh = 196;
    ctx.fillStyle = 'rgba(9,16,30,0.94)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#1d3f6b';
    ctx.fillRect(bx, by, bw, 1);
    ctx.fillRect(bx, by + bh - 1, bw, 1);
    ctx.fillRect(bx, by, 1, bh);
    ctx.fillRect(bx + bw - 1, by, 1, bh);
    // page-rune corners
    ctx.fillStyle = '#7fd8ff';
    ctx.fillRect(bx + 4, by + 4, 4, 1);
    ctx.fillRect(bx + 4, by + 4, 1, 4);
    ctx.fillRect(bx + bw - 8, by + bh - 8, 4, 1);
    ctx.fillRect(bx + bw - 5, by + bh - 8, 1, 4);

    const list = spellListFor(p.char);
    const cryo = p.char === 'cryomancer';
    const equipped = cryo ? (p.cryoSpell | 0) : (p.spell | 0);
    Text.glow(ctx, 'SPELL BOOK', VIEW_W / 2, 42, C.white, '#7fd8ff', 2, 'center', 1);
    if (cryo) {
      const sel = p.cryoSpellDef();
      if (sel && sel.passive) {
        Text.draw(ctx, 'ALWAYS ON   [Q] DOES NOTHING', VIEW_W / 2, 63, '#7fd8ff', 1, 'center');
      } else {
        const cdTxt = p.cryoCd > 0 ? 'READY IN ' + p.cryoCd.toFixed(1) + 'S' : 'READY';
        Text.draw(ctx, '[Q] CAST   ' + cdTxt, VIEW_W / 2, 63, p.cryoCd > 0 ? C.gray : '#7fd8ff', 1, 'center');
      }
    } else {
      Text.draw(
        ctx,
        'MANA ' + Math.round(p.mana) + '/' + Math.round(p.manaMax) +
        '   CAST COST X' + p.castCost().toFixed(1),
        VIEW_W / 2, 63, '#7fd8ff', 1, 'center'
      );
    }

    for (let i = 0; i < list.length; i++) {
      const sp = list[i];
      const r = SPELLBOOK_ROWS[i];
      if (!r) break;
      const sel = equipped === i;
      const hov = inRect(m.x, m.y, r) || this.spellHover === i;

      ctx.fillStyle = sel ? 'rgba(127,216,255,0.16)' : hov ? 'rgba(127,216,255,0.09)' : 'rgba(6,10,18,0.7)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = sel ? '#7fd8ff' : hov ? '#3c6f96' : '#20303f';
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);

      ctx.fillStyle = sp.color;
      ctx.fillRect(r.x + 4, r.y + 4, 2, r.h - 8);

      Text.draw(ctx, sp.name, r.x + 12, r.y + 4, sel ? C.white : '#b9c6d4', 1, 'left');
      Text.draw(ctx, sp.desc[0] + '  ' + sp.desc[1], r.x + 12, r.y + 16, '#6f7a8a', 1, 'left');
      const costLabel = cryo
        ? (sp.passive ? 'PASSIVE' : 'COOLDOWN ' + sp.cd + 'S')
        : 'COST ' + Math.round(sp.cost * (p.manaCost / CHAR_STATS.wizard.manaCost));
      Text.draw(ctx, costLabel, r.x + r.w - 10, r.y + 4, sel ? C.gold : '#8c7a4a', 1, 'right');
      Text.draw(ctx, sel ? 'EQUIPPED' : '[' + (i + 1) + ']', r.x + r.w - 10, r.y + 16, sel ? '#7fd8ff' : '#4d5666', 1, 'right');
    }

    Text.draw(ctx, 'CLICK OR PRESS 1-4   W/S SELECT   E CLOSE', VIEW_W / 2, 240, C.gray, 1, 'center');
  }

  drawResult(ctx, victory) {
    ctx.fillStyle = 'rgba(7,7,11,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const m = this.input.mouseWorld();
    const hov = inRect(m.x, m.y, PLAY_RECT);

    if (victory) {
      Text.glow(ctx, 'WARDEN SLAIN', VIEW_W / 2, 62, C.gold, C.magenta, 3, 'center', 1);
      Text.draw(ctx, 'ALL ' + FINAL_FLOOR + ' FLOORS CLEARED', VIEW_W / 2, 96, C.gray, 1, 'center');
    } else {
      Text.glow(ctx, 'YOU DIED', VIEW_W / 2, 62, C.magenta, C.magenta, 4, 'center', 1);
      Text.draw(ctx, 'THE CRYPT CLAIMS ANOTHER', VIEW_W / 2, 98, C.gray, 1, 'center');
    }

    const rows = [
      ['SCORE', String(this.score)],
      ['FLOOR REACHED', this.floor + ' / ' + FINAL_FLOOR],
      ['SOULS SLAIN', String(this.player ? this.player.kills : 0)],
      ['RELICS TAKEN', String(this.runRelics)],
      ['BOSSES SLAIN', String(this.records.bosses)],
      ['BEST SCORE', String(this.records.bestScore)],
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = 116 + i * 12;
      Text.draw(ctx, rows[i][0], VIEW_W / 2 - 8, y, '#6f7a8a', 1, 'right');
      Text.draw(ctx, rows[i][1], VIEW_W / 2 + 8, y, C.white, 1, 'left');
    }

    ctx.fillStyle = hov ? 'rgba(0,245,212,0.2)' : 'rgba(0,245,212,0.06)';
    ctx.fillRect(PLAY_RECT.x, PLAY_RECT.y, PLAY_RECT.w, PLAY_RECT.h);
    ctx.fillStyle = hov ? C.cyan : '#39434f';
    ctx.fillRect(PLAY_RECT.x, PLAY_RECT.y, PLAY_RECT.w, 1);
    ctx.fillRect(PLAY_RECT.x, PLAY_RECT.y + PLAY_RECT.h - 1, PLAY_RECT.w, 1);
    ctx.fillRect(PLAY_RECT.x, PLAY_RECT.y, 1, PLAY_RECT.h);
    ctx.fillRect(PLAY_RECT.x + PLAY_RECT.w - 1, PLAY_RECT.y, 1, PLAY_RECT.h);
    Text.draw(ctx, 'PLAY AGAIN', VIEW_W / 2, PLAY_RECT.y + 9, hov ? C.white : C.cyan, 1, 'center');
    Text.draw(ctx, 'PRESS ENTER', VIEW_W / 2, VIEW_H - 24, '#4d5666', 1, 'center');
  }

  drawReticle(ctx) {
    const m = this.input.mouseWorld();
    if (m.x < 0 || m.y < 0 || m.x > VIEW_W || m.y > VIEW_H) return;
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    const col = this.input.mouse.down ? C.gold : C.cyan;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = col;
    ctx.fillRect(x - 7, y, 4, 1);
    ctx.fillRect(x + 4, y, 4, 1);
    ctx.fillRect(x, y - 7, 1, 4);
    ctx.fillRect(x, y + 4, 1, 4);
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 1, y - 1, 2, 2);
    const a = this.time * 4;
    for (let i = 0; i < 2; i++) {
      const an = a + i * Math.PI;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(Math.round(x + Math.cos(an) * 11), Math.round(y + Math.sin(an) * 11), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}

/* ----------------------- upgrade icons ---------------------------- */

function drawUpgradeIcon(ctx, id, cx, cy) {
  const x = Math.round(cx);
  const y = Math.round(cy);
  if (id === 'triple') {
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = C.gold;
      ctx.fillRect(x - 9 + i * 7, y - 4 + Math.abs(i) * 2, 2, 8);
      ctx.fillStyle = '#fff2c9';
      ctx.fillRect(x - 9 + i * 7, y - 1 + Math.abs(i) * 2, 2, 2);
    }
  } else if (id === 'quick') {
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 2, y - 9, 5, 5);
    ctx.fillRect(x - 5, y - 4, 6, 4);
    ctx.fillRect(x - 2, y, 8, 2);
    ctx.fillRect(x - 5, y + 2, 6, 4);
    ctx.fillRect(x - 2, y + 6, 4, 3);
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(x + 7, y - 8, 1, 5);
    ctx.fillRect(x + 10, y - 4, 1, 6);
  } else if (id === 'pierce') {
    ctx.fillStyle = '#39434f';
    ctx.fillRect(x - 10, y - 3, 8, 7);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 8, y, 18, 2);
    ctx.fillRect(x + 7, y - 3, 2, 3);
    ctx.fillRect(x + 7, y + 2, 2, 3);
    ctx.fillStyle = '#fff2c9';
    ctx.fillRect(x + 9, y, 2, 2);
  } else if (id === 'shield') {
    ctx.strokeStyle = C.cyan;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(x + 6, y - 3, 4, 4);
    ctx.fillStyle = C.white;
    ctx.fillRect(x + 7, y - 2, 2, 2);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x - 5, y - 5, 4, 4);
  } else if (id === 'heart') {
    drawHeart(ctx, x - 5, y - 4, true, 2);
  } else if (id === 'dash') {
    ctx.fillStyle = C.cyan;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x - 10 + i * 6, y - 5, 3, 4);
      ctx.fillRect(x - 7 + i * 6, y - 1, 3, 4);
      ctx.fillRect(x - 10 + i * 6, y + 3, 3, 4);
    }
  } else if (id === 'heavy') {
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 5, y - 8, 10, 12);
    ctx.fillRect(x - 2, y - 10, 4, 2);
    ctx.fillRect(x - 2, y + 4, 4, 3);
    ctx.fillStyle = '#fff2c9';
    ctx.fillRect(x - 3, y - 6, 3, 6);
    ctx.fillStyle = C.magenta;
    ctx.fillRect(x + 7, y - 6, 2, 2);
    ctx.fillRect(x - 9, y + 4, 2, 2);
  } else if (id === 'swift') {
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x - 6, y - 6, 8, 4);
    ctx.fillRect(x - 6, y - 2, 5, 6);
    ctx.fillRect(x - 8, y + 4, 12, 3);
    ctx.fillStyle = '#c9fff8';
    ctx.fillRect(x - 7, y + 4, 11, 1);
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(x - 12, y - 4, 4, 1);
    ctx.fillRect(x - 13, y + 1, 5, 1);
  } else if (id === 'phantom') {
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(x - 12, y - 4, 3, 3);
    ctx.fillRect(x - 7, y - 1, 3, 3);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x - 2, y - 6, 4, 4);
    ctx.fillRect(x + 3, y + 1, 4, 4);
    ctx.fillStyle = C.white;
    ctx.fillRect(x + 8, y - 4, 2, 2);
  } else if (id === 'siphon') {
    ctx.fillStyle = C.magenta;
    ctx.fillRect(x - 5, y - 2, 10, 5);
    ctx.fillRect(x - 3, y - 6, 6, 4);
    ctx.fillRect(x - 1, y - 9, 2, 3);
    ctx.fillStyle = '#ffb7d9';
    ctx.fillRect(x - 2, y - 3, 2, 3);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x + 7, y - 3, 3, 3);
  } else if (id === 'ricochet') {
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 10, y - 8, 2, 7);
    ctx.fillRect(x - 10, y - 2, 7, 2);
    ctx.fillRect(x - 5, y, 2, 2);
    ctx.fillStyle = '#fff2c9';
    ctx.fillRect(x - 1, y + 2, 8, 2);
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x + 6, y - 8, 2, 10);
  } else if (id === 'berserk') {
    drawHeart(ctx, x - 5, y - 3, true, 2);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, y - 10, 3, 6);
    ctx.fillRect(x - 2, y - 6, 4, 3);
    ctx.fillRect(x, y - 3, 2, 2);
  } else if (id === 'regen') {
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x - 8, y - 2, 16, 4);
    ctx.fillRect(x - 2, y - 8, 4, 16);
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 1, y - 6, 2, 8);
    ctx.fillRect(x - 6, y - 1, 8, 2);
    drawHeart(ctx, x + 5, y + 2, true, 1);
  } else if (id === 'greed') {
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 8, y + 2, 16, 4);
    ctx.fillRect(x - 6, y - 2, 12, 4);
    ctx.fillRect(x - 4, y - 6, 8, 4);
    ctx.fillStyle = C.goldDim;
    ctx.fillRect(x - 2, y - 4, 4, 2);
    ctx.fillStyle = '#fff2c9';
    ctx.fillRect(x - 5, y + 3, 3, 1);
  } else if (id === 'longshot') {
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 10, y, 14, 2);
    ctx.fillRect(x + 3, y - 4, 2, 10);
    ctx.fillRect(x + 5, y - 2, 2, 6);
    ctx.fillRect(x + 7, y, 2, 2);
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(x - 12, y - 5, 5, 1);
    ctx.fillRect(x - 12, y + 6, 5, 1);
  } else if (id === 'flame' || id === 'flamespread') {
    ctx.fillStyle = '#ff7a3d';
    ctx.fillRect(x - 4, y - 1, 8, 7);
    ctx.fillRect(x - 6, y + 2, 3, 4);
    ctx.fillRect(x + 3, y + 2, 3, 4);
    ctx.fillRect(x - 2, y - 7, 5, 7);
    ctx.fillRect(x + 1, y - 9, 2, 3);
    ctx.fillStyle = '#ffcf4a';
    ctx.fillRect(x - 2, y + 1, 4, 5);
    ctx.fillStyle = '#fff2c9';
    ctx.fillRect(x - 1, y + 3, 2, 3);
    if (id === 'flamespread') {
      ctx.fillStyle = '#ff7a3d';
      ctx.fillRect(x - 10, y + 4, 2, 2);
      ctx.fillRect(x + 8, y + 4, 2, 2);
      ctx.fillRect(x - 9, y - 4, 2, 2);
      ctx.fillRect(x + 7, y - 6, 2, 2);
    }
  } else if (id === 'frost') {
    // snowflake: three crossed spokes with barbs
    ctx.fillStyle = '#8fe4ff';
    ctx.fillRect(x - 1, y - 8, 2, 17);
    ctx.fillRect(x - 8, y - 1, 17, 2);
    for (let i = -7; i <= 7; i += 2) {
      ctx.fillRect(x + i, y + i, 1, 1);
      ctx.fillRect(x + i, y - i, 1, 1);
    }
    ctx.fillStyle = '#eafcff';
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillRect(x - 6, y - 5, 2, 2);
    ctx.fillRect(x + 4, y + 4, 2, 2);
    ctx.fillRect(x - 6, y + 4, 2, 2);
    ctx.fillRect(x + 4, y - 5, 2, 2);
  } else {
    drawRelicGlyph(ctx, x, y, id);
  }
}

/* Deterministic rune for the relic icons the old table never had. */
function drawRelicGlyph(ctx, x, y, id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const col = [C.cyan, C.gold, C.magenta, C.purple][h % 4];
  const shape = h % 5;
  ctx.fillStyle = col;
  if (shape === 0) {
    ctx.fillRect(x - 7, y - 7, 14, 14);
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = col;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  } else if (shape === 1) {
    ctx.fillRect(x - 8, y - 1, 16, 2);
    ctx.fillRect(x - 1, y - 8, 2, 16);
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  } else if (shape === 2) {
    ctx.fillRect(x - 7, y + 4, 14, 3);
    ctx.fillRect(x - 5, y - 1, 10, 4);
    ctx.fillRect(x - 2, y - 6, 4, 4);
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 1, y + 5, 2, 1);
  } else if (shape === 3) {
    ctx.fillRect(x - 7, y - 7, 3, 14);
    ctx.fillRect(x + 4, y - 7, 3, 14);
    ctx.fillRect(x - 3, y - 2, 6, 4);
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  } else {
    ctx.fillRect(x - 6, y - 6, 12, 12);
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x - 9, y - 9, 2, 2);
    ctx.fillRect(x + 7, y + 7, 2, 2);
  }
}

/* --------------------------- bootstrap ---------------------------- */

(function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) return;

  const fit = () => {
    const vw = Math.max(240, window.innerWidth);
    const vh = Math.max(160, window.innerHeight);
    let scale = Math.min(vw / VIEW_W, vh / VIEW_H);
    // snap to whole pixels when that still fills the limiting dimension
    if (scale > 1) {
      const rounded = Math.round(scale);
      if (Math.abs(scale - rounded) < 0.06) scale = rounded;
    }
    canvas.style.width = Math.round(VIEW_W * scale) + 'px';
    canvas.style.height = Math.round(VIEW_H * scale) + 'px';
  };
  window.addEventListener('resize', fit);
  fit();

  const game = new Game(canvas);
  window.game = game;
})();
