'use strict';

/* ------------------------------------------------------------------ *
 * core.js - constants, math helpers, RNG and the pixel bitmap font   *
 * ------------------------------------------------------------------ */

const VIEW_W = 512;
const VIEW_H = 288;
const TILE = 16;
const COLS = 32;
const ROWS = 18;
const TAU = Math.PI * 2;
const STEP = 1 / 60;

/* Difficulty presets. EASY runs never write records or unlock progress. */
const DIFFICULTIES = [
  { id: 'easy', name: 'EASY', hp: 0.8, bulletSpeed: 0.86, extra: -1, noUnlock: true },
  { id: 'medium', name: 'MEDIUM', hp: 1, bulletSpeed: 1, extra: 0, noUnlock: false },
  { id: 'hard', name: 'HARD', hp: 1.3, bulletSpeed: 1.15, extra: 1, noUnlock: false },
];
let DIFF_IDX = 1;

function diffNow() {
  return DIFFICULTIES[clamp(DIFF_IDX | 0, 0, DIFFICULTIES.length - 1)];
}

const C = {
  obsidian: '#07070b',
  floorDark: '#121218',
  floor: '#1c1c26',
  floorLit: '#23232f',
  floorLine: '#171720',
  wall: '#2e3440',
  wallLight: '#3b4252',
  wallDark: '#1e222a',
  wallEdge: '#12151b',
  moss: '#365243',
  mossLight: '#4a7355',
  cyan: '#00f5d4',
  cyanDim: '#0b8f80',
  magenta: '#ff007f',
  magentaDim: '#a3195c',
  gold: '#ffb703',
  goldDim: '#c98a06',
  white: '#f4f4fb',
  gray: '#8792a2',
  dark: '#14141c',
  heart: '#ff3b5c',
  red: '#ff2b2b',
  purple: '#9b5de5',
  purpleDim: '#5e3a8f',
};

/* ----------------------------- math ------------------------------- */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
};
const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
const sign = (v) => (v < 0 ? -1 : 1);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ----------------------------- font ------------------------------- */

/* 5 x 7 glyphs, '1' = lit pixel. All UI text is drawn from these so
   every label stays razor sharp at any integer scale.               */
const GLYPHS = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00110', '00100'],
  ':': ['00000', '00110', '00110', '00000', '00110', '00110', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '[': ['01110', '01000', '01000', '01000', '01000', '01000', '01110'],
  ']': ['01110', '00010', '00010', '00010', '00010', '00010', '01110'],
  '|': ['00100', '00100', '00100', '00100', '00100', '00100', '00100'],
  _: ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
};

class TextRenderer {
  constructor() {
    this.cache = new Map();
    this.strings = new Map();
  }

  _glyph(ch, color) {
    const key = ch + '|' + color;
    let cv = this.cache.get(key);
    if (cv) return cv;
    const rows = GLYPHS[ch] || GLYPHS['?'];
    cv = document.createElement('canvas');
    cv.width = 5;
    cv.height = 7;
    const g = cv.getContext('2d');
    g.fillStyle = color;
    for (let y = 0; y < 7; y++) {
      const row = rows[y];
      for (let x = 0; x < 5; x++) {
        if (row[x] === '1') g.fillRect(x, y, 1, 1);
      }
    }
    this.cache.set(key, cv);
    return cv;
  }

  measure(str, scale = 1, spacing = 1) {
    str = String(str);
    if (!str.length) return 0;
    return str.length * (5 + spacing) * scale - spacing * scale;
  }

  /* Greedy word wrap: breaks into lines that fit `maxWidth` pixels.
     A single word longer than the whole line is split by characters. */
  wrap(str, maxWidth, scale = 1, spacing = 1) {
    str = String(str).toUpperCase().trim();
    if (!str.length) return [];
    const charW = Math.max(1, (5 + spacing) * scale);
    const maxChars = Math.max(1, Math.floor((maxWidth + spacing * scale) / charW));
    const out = [];
    let line = '';
    const words = str.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      let word = words[i];
      while (word.length > maxChars) {
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!word) continue;
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  }

  /* Whole strings are baked once into a tiny canvas: one drawImage per
     label instead of one per glyph. The cache is bounded. */
  draw(ctx, str, x, y, color = C.white, scale = 1, align = 'left', spacing = 1) {
    str = String(str).toUpperCase();
    if (!str.length) return 0;
    const key = color + '|' + scale + '|' + spacing + '|' + str;
    let cv = this.strings.get(key);
    if (!cv) {
      const w = this.measure(str, scale, spacing);
      cv = document.createElement('canvas');
      cv.width = Math.max(1, w);
      cv.height = Math.max(1, 7 * scale);
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      let gx = 0;
      const step = (5 + spacing) * scale;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch !== ' ') {
          const rows = GLYPHS[ch] || GLYPHS['?'];
          let lit = false;
          for (let r = 0; r < 7; r++) if (rows[r].indexOf('1') !== -1) { lit = true; break; }
          if (lit) g.drawImage(this._glyph(ch, color), gx, 0, 5 * scale, 7 * scale);
        }
        gx += step;
      }
      if (this.strings.size > 260) this.strings.clear();
      this.strings.set(key, cv);
    }
    let px = Math.round(x);
    if (align === 'center') px = Math.round(x - cv.width / 2);
    else if (align === 'right') px = Math.round(x - cv.width);
    ctx.drawImage(cv, px, Math.round(y));
    return cv.width;
  }

  /* Draws a soft layered halo behind the text for neon UI headings. */
  glow(ctx, str, x, y, color, glowColor, scale = 1, align = 'center', spread = 1) {
    for (let i = spread; i >= 1; i--) {
      ctx.globalAlpha = 0.16;
      this.draw(ctx, str, x - i, y, glowColor, scale, align);
      this.draw(ctx, str, x + i, y, glowColor, scale, align);
      this.draw(ctx, str, x, y - i, glowColor, scale, align);
      this.draw(ctx, str, x, y + i, glowColor, scale, align);
    }
    ctx.globalAlpha = 1;
    this.draw(ctx, str, x, y, color, scale, align);
  }
}

const Text = new TextRenderer();

/* --------------------------- pixel art ---------------------------- */

const HEART_BITS = [
  '0110110',
  '1111111',
  '1111111',
  '1111111',
  '0111110',
  '0011100',
  '0001000',
];

function drawHeart(ctx, x, y, filled, scale = 1) {
  ctx.fillStyle = filled ? C.heart : '#3a2230';
  for (let r = 0; r < HEART_BITS.length; r++) {
    const row = HEART_BITS[r];
    for (let c = 0; c < 7; c++) {
      if (row[c] === '1') ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
  if (filled) {
    ctx.fillStyle = '#ff8ba3';
    ctx.fillRect(x + 2 * scale, y + 1 * scale, scale, scale);
    ctx.fillRect(x + 1 * scale, y + 2 * scale, scale, scale);
  }
}

function drawSpeaker(ctx, x, y, muted, scale = 1) {
  ctx.fillStyle = muted ? C.gray : C.cyan;
  ctx.fillRect(x + 1, y + 3, 2, 3);
  ctx.fillRect(x + 3, y + 2, 1, 5);
  ctx.fillRect(x + 4, y + 1, 1, 7);
  if (muted) {
    ctx.fillStyle = C.magenta;
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 6 + i, y + 6 - i, 1, 1);
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 6 + i, y + 2 + i, 1, 1);
  } else {
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(x + 6, y + 3, 1, 3);
    ctx.fillRect(x + 7, y + 2, 1, 5);
  }
}
