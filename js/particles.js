'use strict';

/* ------------------------------------------------------------------ *
 * particles.js - pooled particles + floating pixel damage numbers     *
 * ------------------------------------------------------------------ */

class ParticleSystem {
  constructor(capacity = 700) {
    this.cap = capacity;
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        active: false,
        index: i,
        ai: 0,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1,
        size: 1,
        color: '#fff',
        grav: 0,
        drag: 0.9,
        shrink: true,
        additive: false,
      };
    }
    this.active = [];
    this.free = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.free[i] = i;
    this.texts = [];
    this.textCap = 40;
    this.buckets = [[], [], [], []];
    this.density = 1;
  }

  _acquire() {
    const idx = this.free.pop();
    if (idx === undefined) return null;
    const p = this.pool[idx];
    p.ai = this.active.length;
    this.active.push(p);
    p.active = true;
    return p;
  }

  release(p) {
    if (!p.active) return;
    p.active = false;
    const a = this.active;
    const last = a.pop();
    if (last !== p) {
      a[p.ai] = last;
      last.ai = p.ai;
    }
    this.free.push(p.index);
  }

  spawn(x, y, opts = {}) {
    const p = this._acquire();
    if (!p) return null;
    p.x = x;
    p.y = y;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.life = p.maxLife = opts.life || 0.45;
    p.size = opts.size || 1;
    p.color = opts.color || C.gold;
    p.grav = opts.grav || 0;
    p.drag = opts.drag === undefined ? 0.88 : opts.drag;
    p.shrink = opts.shrink !== false;
    p.additive = !!opts.additive;
    return p;
  }

  burst(x, y, count, opts = {}) {
    const speed = opts.speed || 90;
    const spread = opts.spread || 0.6;
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined
        ? opts.angle + rand(-spread, spread)
        : rand(0, TAU);
      const s = speed * rand(0.35, 1.15);
      this.spawn(x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: (opts.life || 0.5) * rand(0.65, 1.25),
        size: opts.size || (Math.random() < 0.35 ? 2 : 1),
        color: opts.color || C.gold,
        grav: opts.grav || 0,
        drag: opts.drag === undefined ? 0.9 : opts.drag,
        additive: opts.additive,
      });
    }
  }

  ring(x, y, count, radius, opts = {}) {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const a = (i / count) * TAU;
      this.spawn(x + Math.cos(a) * radius, y + Math.sin(a) * radius, {
        vx: Math.cos(a) * (opts.speed || 40),
        vy: Math.sin(a) * (opts.speed || 40),
        life: opts.life || 0.3,
        size: opts.size || 1,
        color: opts.color || C.cyan,
        additive: true,
      });
    }
  }

  float(x, y, text, color, scale = 1) {
    if (this.texts.length >= this.textCap) this.texts.shift();
    this.texts.push({ x, y, vy: -34, life: 0.72, maxLife: 0.72, text: String(text), color, scale });
  }

  update(dt) {
    const a = this.active;
    const k = dt * 60;
    for (let i = a.length - 1; i >= 0; i--) {
      const p = a[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.release(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      const d = k === 1 ? p.drag : Math.pow(p.drag, k);
      p.vx *= d;
      p.vy *= d;
    }
    const t = this.texts;
    for (let i = t.length - 1; i >= 0; i--) {
      const f = t[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
      if (f.life <= 0) t.splice(i, 1);
    }
  }

  /* Alpha is quantised into four buckets so the canvas state changes a
     handful of times per frame instead of once per particle. */
  draw(ctx) {
    const a = this.active;
    const b0 = this.buckets[0];
    const b1 = this.buckets[1];
    const b2 = this.buckets[2];
    const b3 = this.buckets[3];
    b0.length = 0; b1.length = 0; b2.length = 0; b3.length = 0;

    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      const f = p.life / p.maxLife;
      const alpha = f < 0.3 ? f / 0.3 : 1;
      if (alpha >= 0.85) b0.push(p);
      else if (alpha >= 0.6) b1.push(p);
      else if (alpha >= 0.35) b2.push(p);
      else b3.push(p);
    }

    for (let k = 0; k < 4; k++) {
      const arr = this.buckets[k];
      if (!arr.length) continue;
      ctx.globalAlpha = k === 0 ? 1 : k === 1 ? 0.72 : k === 2 ? 0.48 : 0.25;
      let lastColor = '';
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (p.color !== lastColor) {
          ctx.fillStyle = p.color;
          lastColor = p.color;
        }
        const f = p.life / p.maxLife;
        const s = p.shrink ? Math.max(1, Math.round(p.size * f)) : p.size;
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    const t = this.texts;
    for (let i = 0; i < t.length; i++) {
      const f = t[i];
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = a < 0.4 ? a / 0.4 : 1;
      Text.draw(ctx, f.text, f.x, f.y, f.color, f.scale, 'center');
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    const a = this.active;
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      p.active = false;
      this.free.push(p.index);
    }
    a.length = 0;
    this.texts.length = 0;
  }
}
