'use strict';

/* ------------------------------------------------------------------ *
 * bullets.js - one pooled buffer for both player and enemy bullets.
 *
 * Perf notes:
 *  - objects live in a fixed pool; an `active` array plus a free-index
 *    stack means update/draw only touch live bullets, never the 1200
 *    slots (the old version scanned every slot three times a frame).
 *  - all collision tests use squared distances (no Math.hypot).
 *  - spawn never allocates, except a Set for piercing/ricochet bullets.
 * ------------------------------------------------------------------ */

class BulletPool {
  constructor(capacity = 1200) {
    this.cap = capacity;
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        active: false,
        index: i,
        ai: 0,
        friendly: false,
        x: 0, y: 0, vx: 0, vy: 0,
        ax: 0, ay: 0, turn: 0,
        r: 3, w: 3, h: 3, cw: 1, ch: 1,
        color: C.cyan, core: '#ffffff',
        life: 6, damage: 1,
        pierce: 0, bounces: 0, hitSet: null,
        homing: 0, explosive: 0, chain: 0, cluster: false, crit: false, fxDone: false,
        burn: 0, burnStack: false, burnSniper: false, freeze: 0,
        grazed: false, halo: true, trail: 0, sprite: null,
      };
    }
    this.active = [];
    this.free = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.free[i] = i;
    this.count = 0;
    this.speedScale = 1;
    this.sprites = new Map();
  }

  _acquire() {
    const idx = this.free.pop();
    if (idx === undefined) return null;
    const b = this.pool[idx];
    b.ai = this.active.length;
    this.active.push(b);
    b.active = true;
    return b;
  }

  release(b) {
    if (!b.active) return;
    b.active = false;
    const a = this.active;
    const last = a.pop();
    if (last !== b) {
      a[b.ai] = last;
      last.ai = b.ai;
    }
    this.free.push(b.index);
  }

  spawn(opts) {
    const b = this._acquire();
    if (!b) return null;
    b.friendly = !!opts.friendly;
    b.x = opts.x;
    b.y = opts.y;
    b.vx = opts.vx || 0;
    b.vy = opts.vy || 0;
    b.ax = opts.ax || 0;
    b.ay = opts.ay || 0;
    b.turn = opts.turn || 0;
    b.r = opts.r === undefined ? 3 : opts.r;
    b.w = opts.w === undefined ? Math.max(2, Math.round(b.r * 2)) : opts.w;
    b.h = opts.h === undefined ? Math.max(2, Math.round(b.r * 2)) : opts.h;
    b.cw = opts.cw === undefined ? 2 : opts.cw;
    b.ch = opts.ch === undefined ? 2 : opts.ch;
    b.color = opts.color || (b.friendly ? C.gold : C.cyan);
    b.core = opts.core || '#ffffff';
    b.life = opts.life === undefined ? 8 : opts.life;
    b.damage = opts.damage === undefined ? 1 : opts.damage;
    b.pierce = opts.pierce || 0;
    b.bounces = opts.bounces || 0;
    b.hitSet = b.pierce > 0 || b.bounces > 0 ? new Set() : null;
    b.grazed = false;
    b.halo = opts.halo !== false;
    b.trail = opts.trail || 0;
    b.homing = opts.homing || 0;
    b.explosive = opts.explosive || 0;
    b.chain = opts.chain || 0;
    b.cluster = !!opts.cluster;
    b.crit = !!opts.crit;
    b.burn = opts.burn || 0;
    b.burnStack = !!opts.burnStack;
    b.burnSniper = !!opts.burnSniper;
    b.freeze = opts.freeze || 0;
    b.fxDone = false;
    b.sprite = this._spriteFor(b);
    return b;
  }

  /* One baked sprite per bullet colour/size: glow, body and core are
     composited once, so drawing a bullet is a single drawImage. */
  _spriteFor(b) {
    const key = b.color + '|' + b.w + '|' + b.h + '|' + b.cw + '|' + b.ch;
    let cv = this.sprites.get(key);
    if (cv) return cv;
    const sw = b.w + 10;
    const sh = b.h + 10;
    cv = document.createElement('canvas');
    cv.width = sw;
    cv.height = sh;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = b.color;
    g.globalAlpha = 0.1;
    g.fillRect(1, 1, sw - 2, sh - 2);
    g.globalAlpha = 0.18;
    g.fillRect(3, 3, sw - 6, sh - 6);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = b.color;
    g.fillRect((sw - b.w) / 2, (sh - b.h) / 2, b.w, b.h);
    g.fillStyle = b.core;
    g.fillRect((sw - b.cw) / 2, (sh - b.ch) / 2, b.cw, b.ch);
    if (this.sprites.size > 48) this.sprites.clear();
    this.sprites.set(key, cv);
    return cv;
  }

  spawnFriendly(x, y, angle, speed, damage, opts = {}) {
    return this.spawn({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      friendly: true,
      r: opts.r === undefined ? 3 : opts.r,
      w: opts.w || 5, h: opts.h || 5, cw: 3, ch: 3,
      color: opts.color || C.gold,
      core: opts.core || '#fff6d6',
      damage,
      life: opts.life === undefined ? 1.9 : opts.life,
      pierce: opts.pierce || 0,
      bounces: opts.bounces || 0,
      turn: opts.turn || 0,
      trail: 1,
      homing: opts.homing || 0,
      explosive: opts.explosive || 0,
      chain: opts.chain || 0,
      cluster: !!opts.cluster,
      crit: !!opts.crit,
      burn: opts.burn || 0,
      burnStack: !!opts.burnStack,
      burnSniper: !!opts.burnSniper,
      freeze: opts.freeze || 0,
    });
  }

  spawnEnemy(x, y, angle, speed, opts = {}) {
    const s = speed * this.speedScale;
    return this.spawn({
      x, y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      friendly: false,
      r: opts.r === undefined ? 3 : opts.r,
      w: opts.w, h: opts.h, cw: opts.cw, ch: opts.ch,
      color: opts.color || C.magenta,
      core: opts.core || '#ffd9ec',
      damage: opts.damage === undefined ? 1 : opts.damage,
      life: opts.life === undefined ? 7 : opts.life,
      ax: opts.ax || 0, ay: opts.ay || 0,
      turn: opts.turn || 0,
      halo: opts.halo,
    });
  }

  clear() {
    const a = this.active;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      b.active = false;
      this.free.push(b.index);
    }
    a.length = 0;
    this.count = 0;
  }

  clearEnemyBullets() {
    const a = this.active;
    for (let i = a.length - 1; i >= 0; i--) {
      if (!a[i].friendly) this.release(a[i]);
    }
  }

  update(dt, game) {
    const room = game.currentRoom;
    const player = game.player;
    const enemies = game.enemies;
    const particles = game.particles;
    const a = this.active;

    for (let i = a.length - 1; i >= 0; i--) {
      // a boss death or room change can clear the list mid-loop
      if (i >= a.length) continue;
      const b = a[i];
      if (!b || !b.active) continue;

      b.life -= dt;
      if (b.life <= 0) {
        this.release(b);
        continue;
      }

      if (b.turn) {
        const ang = Math.atan2(b.vy, b.vx) + b.turn * dt;
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        b.vx = Math.cos(ang) * sp;
        b.vy = Math.sin(ang) * sp;
      }
      if (b.ax) b.vx += b.ax * dt;
      if (b.ay) b.vy += b.ay * dt;

      if (b.homing > 0 && b.friendly) {
        let best = null;
        let bd = 150 * 150;
        for (let q = 0; q < enemies.length; q++) {
          const en = enemies[q];
          if (en.dead || en.spawnT > 0) continue;
          const hx = en.x - b.x;
          const hy = en.y - b.y;
          const dd = hx * hx + hy * hy;
          if (dd < bd) { bd = dd; best = en; }
        }
        if (best) {
          const want = Math.atan2(best.y - b.y, best.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          const lim = b.homing * dt;
          if (diff > lim) diff = lim;
          else if (diff < -lim) diff = -lim;
          const na = cur + diff;
          const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -10 || b.x > VIEW_W + 10 || b.y < -10 || b.y > VIEW_H + 10) {
        this.release(b);
        continue;
      }

      if (room && room.solidAt(b.x, b.y)) {
        if (b.bounces > 0) {
          b.bounces--;
          const nx = b.x + b.vx * dt;
          const ny = b.y + b.vy * dt;
          b.x -= b.vx * dt;
          b.y -= b.vy * dt;
          if (room.solidAt(nx, b.y)) b.vx = -b.vx;
          if (room.solidAt(b.x, ny)) b.vy = -b.vy;
          if (room.solidAt(b.x, b.y)) {
            this.release(b);
            continue;
          }
          particles.burst(b.x, b.y, 3, {
            color: b.color, speed: 60, life: 0.2, size: 1, angle: Math.atan2(-b.vy, -b.vx), spread: 1.2,
          });
        } else {
          if (b.friendly || Math.random() < 0.5) {
            particles.burst(b.x, b.y, 3, {
              color: b.color, speed: 55, life: 0.22, size: 1, angle: Math.atan2(-b.vy, -b.vx), spread: 1.2,
            });
          }
          // explosive rounds detonate on the wall too, catching anything nearby
          if (b.friendly && b.explosive > 0 && !b.fxDone) {
            b.fxDone = true;
            if (game.onBulletHit) game.onBulletHit(b, null);
          }
          this.release(b);
          continue;
        }
      }

      if (b.friendly) {
        for (let e = 0; e < enemies.length; e++) {
          const en = enemies[e];
          if (en.dead || en.spawnT > 0) continue;
          if (b.hitSet !== null && b.hitSet.has(en.id)) continue;
          const dx = b.x - en.x;
          const dy = b.y - en.y;
          const rr = b.r + en.r;
          if (dx * dx + dy * dy <= rr * rr) {
            let dmg = b.damage;
            const pl = game.player;
            if (pl && pl.executioner > 0 && en.hp / en.maxHp <= 0.35) {
              dmg *= 1 + pl.executioner;
            }
            // GLACIER: chilled targets take extra damage
            if (pl && pl.shatter > 0 && en.slowT > 0) dmg *= 1 + pl.shatter;
            en.hit(dmg, game);
            if (b.burn > 0 && game.applyBurn) game.applyBurn(en, dmg, b.burnStack, b.burnSniper);
            if (b.freeze > 0 && game.applyFreeze) game.applyFreeze(en, dmg);
            if (!b.fxDone && (b.explosive || b.chain || b.cluster)) {
              b.fxDone = true;
              if (game.onBulletHit) game.onBulletHit(b, en);
            }
            particles.burst(b.x, b.y, 4, {
              color: C.gold, speed: 110, life: 0.28, angle: Math.atan2(b.vy, b.vx) + Math.PI, spread: 1.1,
            });
            if (b.pierce > 0) {
              b.pierce--;
              b.hitSet.add(en.id);
            } else if (b.bounces > 0) {
              b.hitSet.add(en.id);
            } else {
              this.release(b);
              break;
            }
          }
        }
        if (!b.active) continue;
      } else {
        // hostile bullets test every hero in the room, not just the host
        const targets = game.coop && game.player2 ? [player, game.player2] : [player];
        let gone = false;
        for (let t = 0; t < targets.length; t++) {
          const pl = targets[t];
          if (!pl || !pl.alive) continue;
          const dx = b.x - pl.x;
          const dy = b.y - pl.y;
          const d2 = dx * dx + dy * dy;
          const hitR = b.r + pl.r;
          if (d2 <= hitR * hitR) {
            if (pl.canBeHit()) {
              pl.hurt(b.damage, game);
              particles.burst(b.x, b.y, 6, { color: b.color, speed: 90, life: 0.3 });
              this.release(b);
              gone = true;
              break;
            }
          } else if (!b.grazed) {
            const grazeR = hitR + 11;
            if (d2 <= grazeR * grazeR) {
              b.grazed = true;
              game.onGraze(b);
            }
          }
        }
        if (gone) continue;
      }
    }
    this.count = a.length;
  }

  draw(ctx) {
    const a = this.active;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      if (b.trail) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = b.color;
        ctx.fillRect(Math.round(b.x - b.vx * 0.018 - b.w / 2), Math.round(b.y - b.vy * 0.018 - b.h / 2), b.w, b.h);
        ctx.globalAlpha = 1;
      }
      const sp = b.sprite;
      ctx.drawImage(sp, Math.round(b.x - sp.width * 0.5), Math.round(b.y - sp.height * 0.5));
    }
  }
}
