'use strict';

/* ------------------------------------------------------------------ *
 * bosses.js - four new bosses and the final Devourer                  *
 * ------------------------------------------------------------------ */

function bossDeath(boss, game, color) {
  if (boss.dead) return;
  boss.dead = true;
  game.nuke = null;
  game.shake = 16;
  game.hitstop = 0.12;
  game.sound.explode();
  game.sound.enemyDeath();
  for (let i = 0; i < 5; i++) {
    const a = rand(0, TAU);
    game.particles.burst(boss.x + Math.cos(a) * boss.r, boss.y + Math.sin(a) * boss.r, 18, {
      color: i % 2 ? color : C.cyan, speed: 170, life: 1.0, size: 2, drag: 0.88,
    });
  }
  game.particles.burst(boss.x, boss.y, 50, {
    color: C.gold, speed: 220, life: 1.1, size: 2, drag: 0.9,
  });
  game.particles.ring(boss.x, boss.y, 30, 12, { color: C.white, speed: 160, life: 0.7 });
  game.onBossDeath(boss);
}

function bossShift(boss, game) {
  boss.state = 'shift';
  boss.timer = 0.9;
  boss.staffGlow = 1;
  game.sound.bossShift();
  game.shake = Math.min(12, game.shake + 8);
  game.bullets.clearEnemyBullets();
  game.particles.burst(boss.x, boss.y, 30, { color: boss.barColor, speed: 180, life: 0.8, size: 2, drag: 0.88 });
  game.particles.ring(boss.x, boss.y, 22, 12, { color: C.white, speed: 110, life: 0.5 });
  game.particles.float(boss.x, boss.y - boss.r - 22, 'PHASE ' + boss.phase, boss.barColor, 2);
  game.particles.float(boss.x, boss.y - boss.r - 32, 'BAR RESTORED', C.heart, 1);
  game.particles.ring(boss.x, boss.y, 30, 10, { color: C.heart, speed: -70, life: 0.6 });
}

function bossDrift(boss, tx, ty, dt, k) {
  boss.x = lerp(boss.x, tx, Math.min(1, dt * k));
  boss.y = lerp(boss.y, ty, Math.min(1, dt * k));
}

function ringBurst(game, x, y, count, speed, opts = {}) {
  const gap = opts.gap === undefined ? 0 : opts.gap;
  const gapAngle = opts.gapAngle === undefined ? 0 : opts.gapAngle;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    if (gap > 0) {
      const da = Math.abs(((a - gapAngle + Math.PI * 3) % TAU) - Math.PI);
      if (da < gap) continue;
    }
    game.bullets.spawnEnemy(x + Math.cos(a) * (opts.radius || 14), y + Math.sin(a) * (opts.radius || 14), a, speed, {
      color: opts.color || C.magenta,
      r: opts.r || 3,
      w: opts.w || 5,
      h: opts.h || 5,
      damage: opts.damage || 1,
      life: opts.life || 8,
    });
  }
}

/* ------------------------------ BoneTitan ------------------------- */

class BoneTitan extends Enemy {
  constructor(x, y, room) {
    super(x, y, 'boss');
    this.room = room;
    this.name = 'GRAVEMAW, BONE TITAN';
    this.barColor = C.gold;
    this.r = 20;
    this.maxHp = 1500 + (room.floor - 1) * 350;
    this.phaseCount = 2;
    this.phaseMaxHp = Math.round((this.maxHp * (1 + (this.phaseCount - 1) * 0.2)) / this.phaseCount);
    this.hp = this.phaseMaxHp;
    this.score = 3000;
    this.isBoss = true;
    this.phaseHeal = 0.2;
    this.contactDamage = 2;
    this.spawnT = 1.6;
    this.spawnMax = 1.6;
    this.state = 'idle';
    this.timer = 1.2;
    this.phase = 1;
    this.attack = null;
    this.attackT = 0;
    this.fireT = 0;
    this.shockIdx = 0;
    this.fired = false;
    this.staffGlow = 0;
    this.rot = 0;
  }

  update(dt, game) {
    this.t += dt;
    this.rot += dt * 0.6;
    this.flash = Math.max(0, this.flash - dt);
    this.orbCd = Math.max(0, this.orbCd - dt);
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      if (Math.random() < 0.6) {
        game.particles.spawn(this.x + rand(-20, 20), this.y + rand(-6, 24), {
          vx: rand(-10, 10), vy: rand(-30, -10), life: 0.6, color: C.gold, size: 1,
        });
      }
      return;
    }

    if (this.state === 'shift') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = 0.7;
        this.staffGlow = 0;
      }
      return;
    }

    if (this.state === 'idle') {
      const p = game.player;
      bossDrift(this, clamp(p.x, 90, VIEW_W - 90), 104, dt, 1.1);
      this.timer -= dt;
      if (this.timer <= 0) this.pickAttack(game);
    } else if (this.state === 'attack') {
      this.attackT += dt;
      this.runAttack(dt, game);
      const dur = BOSS_DURATION[this.attack] || 2;
      if (this.attackT >= dur) {
        this.state = 'idle';
        this.timer = this.phase === 2 ? 0.35 : 0.6;
        this.staffGlow = 0;
      }
    }
  }

  pickAttack(game) {
    const pool = this.phase === 1 ? ['slam', 'spears', 'summon'] : ['slam', 'spears', 'summon', 'quake'];
    let name = pick(pool);
    if (name === this.attack && Math.random() < 0.6) name = pick(pool);
    this.attack = name;
    this.state = 'attack';
    this.attackT = 0;
    this.fireT = 0;
    this.shockIdx = 0;
    this.fired = false;
    game.sound.tone(160, 240, 0.2, 'sawtooth', 0.07);
  }

  runAttack(dt, game) {
    const t = this.attackT;
    const p = game.player;

    if (this.attack === 'slam') {
      if (t < 0.5) return;
      this.fireT -= dt;
      if (this.fireT <= 0 && this.shockIdx < 3) {
        this.shockIdx++;
        this.fireT = 0.38;
        ringBurst(game, this.x, this.y, 22, 66, { color: C.gold, r: 4, w: 6, h: 6, radius: 18 });
        game.shake = Math.min(10, game.shake + 3);
        game.sound.explode();
        game.particles.ring(this.x, this.y, 16, 10, { color: C.gold, speed: 80, life: 0.35 });
      }
    } else if (this.attack === 'spears') {
      if (t < 0.35 || this.fired) return;
      this.fired = true;
      const base = angleTo(this.x, this.y, p.x, p.y);
      for (let i = 0; i < 7; i++) {
        const a = base + (i - 3) * 0.11;
        game.bullets.spawnEnemy(this.x + Math.cos(a) * 16, this.y + 10 + Math.sin(a) * 16, a, 215, {
          color: C.white, core: '#ffe9b0', r: 2, w: 4, h: 4,
        });
      }
      game.sound.tone(700, 200, 0.18, 'sawtooth', 0.07);
    } else if (this.attack === 'summon') {
      if (t < 0.65 || this.fired) return;
      this.fired = true;
      const spots = [[90, 90], [VIEW_W - 90, 90], [VIEW_W / 2, VIEW_H - 90]];
      for (let i = 0; i < 3; i++) {
        const s = spots[i % spots.length];
        const e = makeEnemy(i === 1 ? 'charger' : 'acolyte', s[0], s[1], undefined, this.room);
        e.spawnT = 0.6;
        e.spawnMax = 0.6;
        game.enemies.push(e);
        game.particles.ring(s[0], s[1], 10, 4, { color: C.gold, speed: 55, life: 0.35 });
      }
      game.sound.tone(180, 400, 0.3, 'square', 0.06);
    } else if (this.attack === 'quake') {
      if (t < 0.35) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.26;
        const gapY = 60 + Math.abs(Math.sin(t * 2)) * 140;
        for (let y = 40; y <= VIEW_H - 40; y += 34) {
          if (Math.abs(y - gapY) < 40) continue;
          game.bullets.spawnEnemy(28, y, 0, 120, { color: C.magenta, r: 3, w: 5, h: 5 });
          game.bullets.spawnEnemy(VIEW_W - 28, y, Math.PI, 120, { color: C.magenta, r: 3, w: 5, h: 5 });
        }
        game.sound.tone(240, 160, 0.07, 'square', 0.03);
      }
    }
  }

  die(game) {
    if (this.dead) return;
    if (this.phase < this.phaseCount) {
      this.phase++;
      this.hp = this.phaseMaxHp;
      bossShift(this, game);
      return;
    }
    bossDeath(this, game, C.gold);
  }

  draw(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const float = Math.round(Math.sin(this.t * 1.5) * 2);
    const yy = y + float;
    const flash = this.flash > 0;

    if (this.spawnT > 0) {
      const a = 1 - this.spawnT / this.spawnMax;
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = C.gold;
      ctx.fillRect(x - 26, yy - 30, 52, 1);
      ctx.fillRect(x - 26, yy + 28, 52, 1);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 18, y + 30, 36, 4);
    ctx.fillRect(x - 12, y + 34, 24, 2);

    // robe / pelvis
    ctx.fillStyle = flash ? C.white : '#2a2230';
    ctx.fillRect(x - 14, yy + 8, 28, 24);
    ctx.fillStyle = C.goldDim;
    ctx.fillRect(x - 14, yy + 20, 28, 2);

    // ribcage
    ctx.fillStyle = flash ? C.white : '#cfc6a8';
    ctx.fillRect(x - 2, yy - 16, 4, 26);
    for (let i = 0; i < 5; i++) {
      const w = 22 - i * 2;
      ctx.fillRect(x - w / 2, yy - 14 + i * 4, w, 2);
      ctx.fillStyle = flash ? C.white : '#9c9276';
      ctx.fillRect(x - w / 2, yy - 12 + i * 4, w, 1);
      ctx.fillStyle = flash ? C.white : '#cfc6a8';
    }
    // core
    ctx.globalAlpha = 0.35 + Math.sin(this.t * 4) * 0.15;
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 8, yy - 2, 16, 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 2, yy + 2, 4, 4);

    // arms
    const raise = this.state === 'attack' && this.attackT < 0.9 ? 6 : 0;
    ctx.fillStyle = flash ? C.white : '#b9b094';
    ctx.fillRect(x - 22, yy - 8 - raise, 7, 22);
    ctx.fillRect(x + 15, yy - 8 - raise, 7, 22);
    ctx.fillStyle = flash ? C.white : '#8d8468';
    ctx.fillRect(x - 23, yy + 12 - raise, 9, 5);
    ctx.fillRect(x + 14, yy + 12 - raise, 9, 5);

    // skull
    ctx.fillStyle = flash ? C.white : '#e3dcc2';
    ctx.fillRect(x - 10, yy - 30, 20, 16);
    ctx.fillRect(x - 7, yy - 15, 14, 5);
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(x - 7, yy - 25, 5, 6);
    ctx.fillRect(x + 2, yy - 25, 5, 6);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 6, yy - 23, 3, 2);
    ctx.fillRect(x + 3, yy - 23, 3, 2);
    // horns
    ctx.fillStyle = flash ? C.white : '#a89d7e';
    ctx.fillRect(x - 14, yy - 34, 4, 8);
    ctx.fillRect(x + 10, yy - 34, 4, 8);
    ctx.fillRect(x - 16, yy - 38, 3, 6);
    ctx.fillRect(x + 13, yy - 38, 3, 6);
    // jaw teeth
    ctx.fillStyle = '#8d8468';
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 6 + i * 4, yy - 15, 2, 3);

    if (this.state === 'attack' && this.attack === 'slam' && this.attackT < 0.5) {
      const p = this.attackT / 0.5;
      ctx.globalAlpha = 0.25 + p * 0.35;
      ctx.fillStyle = C.gold;
      ctx.fillRect(x - 20, yy + 30, 40, 2);
      ctx.globalAlpha = 1;
    }
  }
}

/* ----------------------------- CrimsonChoir ----------------------- */

class CrimsonChoir extends Enemy {
  constructor(x, y, room) {
    super(x, y, 'boss');
    this.room = room;
    this.name = 'VESPERA, CRIMSON CHOIR';
    this.barColor = C.magenta;
    this.r = 16;
    this.maxHp = 2100 + (room.floor - 1) * 400;
    this.phaseCount = 2;
    this.phaseMaxHp = Math.round((this.maxHp * (1 + (this.phaseCount - 1) * 0.2)) / this.phaseCount);
    this.hp = this.phaseMaxHp;
    this.score = 4000;
    this.isBoss = true;
    this.phaseHeal = 0.2;
    this.contactDamage = 2;
    this.spawnT = 1.5;
    this.spawnMax = 1.5;
    this.state = 'idle';
    this.timer = 2.0;
    this.phase = 1;
    this.attack = null;
    this.attackT = 0;
    this.fireT = 0;
    this.ringIdx = 0;
    this.fired = false;
    this.glow = 0;
    this.rot = 0;
    this.teleT = 0;
  }

  update(dt, game) {
    this.t += dt;
    this.rot += dt * 1.2;
    this.flash = Math.max(0, this.flash - dt);
    this.orbCd = Math.max(0, this.orbCd - dt);
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      return;
    }
    if (this.state === 'shift') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = 0.6;
        this.glow = 0;
      }
      return;
    }

    this.teleT -= dt;
    if (this.teleT <= 0 && this.state !== 'attack') {
      this.teleT = rand(2.2, 3.4);
      const oldX = this.x;
      const oldY = this.y;
      this.x = rand(90, VIEW_W - 90);
      this.y = rand(70, 150);
      game.particles.burst(oldX, oldY, 14, { color: C.magenta, speed: 90, life: 0.45, size: 2 });
      game.particles.burst(this.x, this.y, 14, { color: C.magenta, speed: 90, life: 0.45, size: 2 });
      game.sound.tone(500, 900, 0.12, 'triangle', 0.04);
    }

    if (this.state === 'idle') {
      this.timer -= dt;
      this.glow = Math.max(0, this.glow - dt * 2);
      if (this.timer <= 0) this.pickAttack(game);
    } else if (this.state === 'attack') {
      this.attackT += dt;
      this.runAttack(dt, game);
      this.glow = Math.min(1, this.glow + dt * 2);
      if (this.attackT >= (BOSS_DURATION[this.attack] || 2)) {
        this.state = 'idle';
        this.timer = this.phase === 2 ? 0.5 : 0.9;
        this.glow = 0;
      }
    }
  }

  pickAttack(game) {
    const pool = this.phase === 1 ? ['notes', 'spiral', 'burst'] : ['notes', 'spiral', 'burst', 'curtain'];
    let name = pick(pool);
    if (name === this.attack && Math.random() < 0.6) name = pick(pool);
    this.attack = name;
    this.state = 'attack';
    this.attackT = 0;
    this.fireT = 0;
    this.ringIdx = 0;
    this.fired = false;
    game.sound.tone(620, 880, 0.14, 'triangle', 0.05);
  }

  runAttack(dt, game) {
    const t = this.attackT;
    const p = game.player;

    if (this.attack === 'notes') {
      if (t < 0.55) return;
      const marks = [0.55, 1.25, 1.95].map((m) => m / (this.phase === 2 ? 1.25 : 1));
      if (this.ringIdx < marks.length && t >= marks[this.ringIdx]) {
        this.ringIdx++;
        ringBurst(game, this.x, this.y, 24, 64, {
          color: C.magenta, gap: 0.5, gapAngle: rand(0, TAU), radius: 12,
        });
        if (this.phase === 2) {
          game.particles.ring(this.x, this.y, 14, 6, { color: C.white, speed: 50, life: 0.4 });
        }
        game.sound.tone(880, 620, 0.12, 'triangle', 0.04);
      }
    } else if (this.attack === 'spiral') {
      if (t < 0.35) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.phase === 2 ? 0.05 : 0.065;
        const a = t * 3.1;
        for (let i = 0; i < 2; i++) {
          const aa = a + i * Math.PI;
          game.bullets.spawnEnemy(this.x + Math.cos(aa) * 12, this.y + Math.sin(aa) * 12, aa, 86, {
            color: i ? C.cyan : C.magenta, r: 3, w: 5, h: 5,
          });
        }
      }
    } else if (this.attack === 'burst') {
      if (t < 0.45) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.5;
        const base = angleTo(this.x, this.y, p.x, p.y);
        for (let i = 0; i < 9; i++) {
          const a = base + (i - 4) * 0.13;
          game.bullets.spawnEnemy(this.x + Math.cos(a) * 12, this.y + Math.sin(a) * 12, a, 130, {
            color: C.magenta, core: '#ffd6ea', r: 3, w: 5, h: 5,
          });
        }
        game.sound.tone(760, 380, 0.1, 'square', 0.045);
      }
    } else if (this.attack === 'curtain') {
      if (t < 0.6) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.19;
        const gapX = VIEW_W / 2 + Math.sin((t - 0.6) * 2.6) * 140;
        for (let x = 36; x <= VIEW_W - 36; x += 42) {
          if (Math.abs(x - gapX) < 50) continue;
          game.bullets.spawnEnemy(x, 22, Math.PI / 2, 104, {
            color: (Math.floor(t * 4) % 2) ? C.magenta : C.purple, r: 3, w: 5, h: 5,
          });
        }
      }
    }
  }

  die(game) {
    if (this.dead) return;
    if (this.phase < this.phaseCount) {
      this.phase++;
      this.hp = this.phaseMaxHp;
      bossShift(this, game);
      return;
    }
    bossDeath(this, game, C.magenta);
  }

  draw(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const yy = y + Math.round(Math.sin(this.t * 2) * 2);
    const flash = this.flash > 0;

    // halo of notes
    for (let i = 0; i < 5; i++) {
      const a = this.rot + (i / 5) * TAU;
      const nx = Math.round(x + Math.cos(a) * 30);
      const ny = Math.round(yy - 6 + Math.sin(a) * 14);
      ctx.fillStyle = i % 2 ? C.magenta : C.white;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(nx, ny, 2, 2);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 12, y + 22, 24, 3);

    // robe
    ctx.fillStyle = flash ? C.white : '#5c1330';
    ctx.fillRect(x - 12, yy - 4, 24, 26);
    ctx.fillRect(x - 8, yy + 22, 16, 4);
    ctx.fillStyle = flash ? C.white : '#7d1b42';
    ctx.fillRect(x - 10, yy - 6, 20, 24);
    ctx.fillStyle = '#2a0a18';
    for (let i = 0; i < 3; i++) ctx.fillRect(x - 9, yy + 4 + i * 6, 18, 1);

    // shoulders
    ctx.fillStyle = flash ? C.white : '#3a0d22';
    ctx.fillRect(x - 16, yy - 8, 6, 9);
    ctx.fillRect(x + 10, yy - 8, 6, 9);

    // hood + mask
    ctx.fillStyle = flash ? C.white : '#7d1b42';
    ctx.fillRect(x - 9, yy - 22, 18, 14);
    ctx.fillRect(x - 6, yy - 26, 12, 5);
    ctx.fillStyle = '#e9e2f0';
    ctx.fillRect(x - 6, yy - 18, 12, 8);
    ctx.fillStyle = '#120710';
    ctx.fillRect(x - 4, yy - 16, 2, 4);
    ctx.fillRect(x + 2, yy - 16, 2, 4);
    ctx.fillStyle = this.state === 'attack' ? C.white : C.magenta;
    ctx.fillRect(x - 4, yy - 15, 2, 2);
    ctx.fillRect(x + 2, yy - 15, 2, 2);

    // blood orb in hands
    const r = 2 + Math.round(this.glow * 4);
    ctx.globalAlpha = 0.25 + this.glow * 0.3;
    ctx.fillStyle = C.magenta;
    ctx.fillRect(x - r, yy + 2 - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.glow > 0.55 ? C.white : C.magenta;
    ctx.fillRect(x - 2, yy, 4, 4);
  }
}

/* ---------------------------- ObsidianSeraph ---------------------- */

class ObsidianSeraph extends Enemy {
  constructor(x, y, room) {
    super(x, y, 'boss');
    this.room = room;
    this.name = 'OBSIDIAN SERAPH';
    this.barColor = C.cyan;
    this.r = 17;
    this.maxHp = 3000 + (room.floor - 1) * 450;
    this.phaseCount = 2;
    this.phaseMaxHp = Math.round((this.maxHp * (1 + (this.phaseCount - 1) * 0.2)) / this.phaseCount);
    this.hp = this.phaseMaxHp;
    this.score = 5000;
    this.isBoss = true;
    this.phaseHeal = 0.2;
    this.contactDamage = 2;
    this.spawnT = 1.5;
    this.spawnMax = 1.5;
    this.state = 'idle';
    this.timer = 2.0;
    this.phase = 1;
    this.attack = null;
    this.attackT = 0;
    this.fireT = 0;
    this.fired = false;
    this.aimX = 0;
    this.aimY = 0;
    this.rot = 0;
    this.glow = 0;
    this.diveT = 0;
  }

  update(dt, game) {
    this.t += dt;
    this.rot += dt * 0.9;
    this.flash = Math.max(0, this.flash - dt);
    this.orbCd = Math.max(0, this.orbCd - dt);
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      return;
    }
    if (this.state === 'shift') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = 0.6;
        this.glow = 0;
      }
      return;
    }

    if (this.state === 'idle') {
      const p = game.player;
      bossDrift(this, clamp(p.x + Math.sin(this.t) * 90, 90, VIEW_W - 90), 96, dt, 1.2);
      this.timer -= dt;
      if (this.timer <= 0) this.pickAttack(game);
    } else if (this.state === 'attack') {
      this.attackT += dt;
      this.runAttack(dt, game);
      this.glow = Math.min(1, this.glow + dt * 2);
      if (this.attackT >= (BOSS_DURATION[this.attack] || 2)) {
        this.state = 'idle';
        this.timer = 0.7;
        this.glow = 0;
      }
    }
  }

  pickAttack(game) {
    const pool = this.phase === 1 ? ['beams', 'walls', 'dive', 'summon'] : ['beams', 'walls', 'dive', 'summon'];
    let name = pick(pool);
    if (name === this.attack && Math.random() < 0.55) name = pick(pool);
    this.attack = name;
    this.state = 'attack';
    this.attackT = 0;
    this.fireT = 0;
    this.fired = false;
    game.sound.tone(420, 640, 0.18, 'triangle', 0.05);
  }

  runAttack(dt, game) {
    const t = this.attackT;
    const p = game.player;

    if (this.attack === 'beams') {
      if (t < 0.15 || this.fired) return;
      this.fired = true;
      const base = angleTo(this.x, this.y, p.x, p.y);
      for (let i = -1; i <= 1; i++) {
        game.spawnBeam(this.x, this.y, base + i * 0.3, {
          charge: 0.95,
          active: 0.4,
          width: 9,
          color: i === 0 ? C.magenta : C.cyan,
          track: this.phase === 2 ? 0.7 : 0,
          damage: 1,
        });
      }
      game.sound.tone(240, 700, 0.4, 'sawtooth', 0.05);
    } else if (this.attack === 'walls') {
      if (t < 0.5) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.phase === 2 ? 0.16 : 0.22;
        const gapX = 60 + Math.abs(Math.sin(t * 1.6)) * (VIEW_W - 120);
        for (let x = 40; x <= VIEW_W - 40; x += 32) {
          if (Math.abs(x - gapX) < 46) continue;
          game.bullets.spawnEnemy(x, 22, Math.PI / 2, 130, {
            color: C.cyan, r: 3, w: 4, h: 6,
          });
        }
      }
    } else if (this.attack === 'dive') {
      if (t < 0.65) {
        const a = angleTo(this.x, this.y, p.x, p.y);
        this.aimX = Math.cos(a);
        this.aimY = Math.sin(a);
        return;
      }
      if (!this.fired) {
        this.fired = true;
        this.diveT = 0.55;
        game.sound.tone(180, 900, 0.2, 'sawtooth', 0.06);
      }
      if (this.diveT > 0) {
        this.diveT -= dt;
        const step = 420 * dt;
        const nx = this.x + this.aimX * step;
        const ny = this.y + this.aimY * step;
        if (!game.currentRoom.circleBlocked(nx, ny, this.r)) {
          this.x = nx;
          this.y = ny;
        } else {
          this.diveT = 0;
        }
        if (Math.random() < 0.7) {
          game.bullets.spawnEnemy(this.x, this.y, Math.PI / 2, 60, { color: C.cyan, r: 3 });
        }
      }
    } else if (this.attack === 'summon') {
      if (t < 0.9 || this.fired) return;
      this.fired = true;
      const spots = [[90, 80], [VIEW_W - 90, 80]];
      for (let i = 0; i < 2; i++) {
        const e = makeEnemy('turret', spots[i][0], spots[i][1], undefined, this.room);
        e.spawnT = 0.5;
        e.spawnMax = 0.5;
        game.enemies.push(e);
        game.particles.ring(spots[i][0], spots[i][1], 10, 4, { color: C.cyan, speed: 55, life: 0.35 });
      }
    }
  }

  die(game) {
    if (this.dead) return;
    if (this.phase < this.phaseCount) {
      this.phase++;
      this.hp = this.phaseMaxHp;
      bossShift(this, game);
      return;
    }
    bossDeath(this, game, C.cyan);
  }

  draw(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const yy = y + Math.round(Math.sin(this.t * 2.4) * 2);
    const flash = this.flash > 0;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 14, y + 22, 28, 3);

    // wings
    ctx.fillStyle = flash ? C.white : '#111018';
    for (let i = 0; i < 3; i++) {
      const s = 8 + i * 5;
      ctx.fillRect(x - 12 - s, yy - 12 + i * 4, s, 4);
      ctx.fillRect(x + 12, yy - 12 + i * 4, s, 4);
    }
    ctx.fillStyle = flash ? C.white : '#00b39e';
    ctx.fillRect(x - 30, yy - 4, 10, 1);
    ctx.fillRect(x + 20, yy - 4, 10, 1);

    // body
    ctx.fillStyle = flash ? C.white : '#18141f';
    ctx.fillRect(x - 10, yy - 14, 20, 32);
    ctx.fillStyle = flash ? C.white : '#26202f';
    ctx.fillRect(x - 7, yy - 12, 14, 26);
    ctx.fillStyle = C.cyanDim;
    ctx.fillRect(x - 10, yy + 10, 20, 2);

    // head
    ctx.fillStyle = flash ? C.white : '#2a2333';
    ctx.fillRect(x - 7, yy - 24, 14, 11);
    ctx.fillStyle = C.cyan;
    ctx.globalAlpha = 0.6 + Math.sin(this.t * 5) * 0.3;
    ctx.fillRect(x - 5, yy - 20, 3, 2);
    ctx.fillRect(x + 2, yy - 20, 3, 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 4, yy - 20, 1, 1);
    ctx.fillRect(x + 3, yy - 20, 1, 1);

    // floating shards
    for (let i = 0; i < 4; i++) {
      const a = this.rot + (i / 4) * TAU;
      const sx = Math.round(x + Math.cos(a) * 24);
      const sy = Math.round(yy + Math.sin(a) * 16);
      ctx.fillStyle = i % 2 ? C.cyan : C.magenta;
      ctx.fillRect(sx, sy, 3, 2);
    }

    // telegraph
    if (this.state === 'attack' && this.attack === 'beams' && this.attackT < 0.2) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = C.cyan;
      ctx.fillRect(x - 20, yy - 22, 40, 1);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'attack' && this.attack === 'dive' && this.attackT < 0.65) {
      const p = this.attackT / 0.65;
      ctx.globalAlpha = 0.2 + p * 0.4;
      ctx.fillStyle = C.red;
      for (let d = 10; d < 320; d += 9) {
        ctx.fillRect(Math.round(x + this.aimX * d), Math.round(yy + this.aimY * d), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
}

/* ------------------------------ Devourer -------------------------- */

const NUKE_TIME = 12;
const NUKE_BAR_MULT = 1.2;

class Devourer extends Enemy {
  constructor(x, y, room) {
    super(x, y, 'boss');
    this.room = room;
    this.name = 'THE DEVOURER';
    this.barColor = '#ff2b4e';
    this.isFinal = true;
    this.r = 24;
    this.maxHp = 5600;
    this.phaseCount = 5;
    this.phaseMaxHp = Math.round((this.maxHp * (1 + (this.phaseCount - 1) * 0.12)) / this.phaseCount);
    this.hp = this.phaseMaxHp;
    this.score = 12000;
    this.isBoss = true;
    this.phaseHeal = 0.12;
    this.contactDamage = 2;
    this.spawnT = 2.0;
    this.spawnMax = 2.0;
    this.state = 'idle';
    this.timer = 2.0;
    this.phase = 1;
    this.attack = null;
    this.attackT = 0;
    this.fireT = 0;
    this.ringIdx = 0;
    this.fired = false;
    this.rot = 0;
    this.glow = 0;
    this.nukeState = 'none';
    this.nukeT = 0;
    this.nukeDuration = NUKE_TIME;
    this.nukeThreshold = 1;
    this.nukeDamage = 0;
    this.nukeCd = 0;
    this.staggerT = 0;
    this.nukeSecs = -1;
    this.shieldFx = 0;
    this.lastAttack = '';
  }

  update(dt, game) {
    this.t += dt;
    this.rot += dt * 0.7;
    this.flash = Math.max(0, this.flash - dt);
    this.orbCd = Math.max(0, this.orbCd - dt);
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      if (Math.random() < 0.8) {
        game.particles.spawn(this.x + rand(-24, 24), this.y + rand(-12, 26), {
          vx: rand(-14, 14), vy: rand(-40, -14), life: 0.6, color: C.magenta, size: 1,
        });
      }
      return;
    }

    if (this.nukeState === 'charging') {
      this.nukeT += dt;
      const secs = Math.max(0, Math.ceil(this.nukeDuration - this.nukeT));
      if (secs !== this.nukeSecs) {
        this.nukeSecs = secs;
        game.sound.tone(secs <= 3 ? 780 : 430, secs <= 3 ? 520 : 300, 0.07, 'square', 0.045);
      }
      bossDrift(this, VIEW_W / 2, 96, dt, 2.2);
      this.glow = Math.min(1, this.glow + dt * 1.2);
      game.shake = Math.max(game.shake, 2 + (this.nukeT / this.nukeDuration) * 4);
      if (Math.random() < dt * 40) {
        const a = rand(0, TAU);
        const dist = rand(90, 180);
        game.particles.spawn(this.x + Math.cos(a) * dist, this.y + Math.sin(a) * dist, {
          vx: -Math.cos(a) * 120, vy: -Math.sin(a) * 120, life: 0.7, color: C.magenta, size: 2, additive: true,
        });
      }
      if (this.nukeT >= this.nukeDuration) {
        this.nukeState = 'none';
        this.glow = 0;
        game.onNuke(this);
        return;
      }
      return;
    }

    if (this.nukeState === 'stagger') {
      this.staggerT -= dt;
      this.glow = Math.max(0, this.glow - dt * 2);
      if (this.staggerT <= 0) {
        this.nukeState = 'none';
        this.state = 'idle';
        this.timer = 0.8;
        this.nukeCd = 16;
      }
      return;
    }

    if (this.state === 'shift') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = 0.7;
        this.glow = 0;
      }
      return;
    }

    if (this.phase === 5 && this.nukeCd > 0) this.nukeCd -= dt;

    if (this.state === 'idle') {
      const p = game.player;
      bossDrift(this, clamp(p.x, 100, VIEW_W - 100), 100, dt, 1.3);
      this.timer -= dt;
      if (this.phase === 5 && this.nukeCd <= 0) {
        this.startNuke(game);
        return;
      }
      if (this.timer <= 0) this.pickAttack(game);
    } else if (this.state === 'attack') {
      this.attackT += dt;
      this.runAttack(dt, game);
      this.glow = Math.min(1, this.glow + dt * 1.8);
      if (this.attackT >= (BOSS_DURATION[this.attack] || 2)) {
        this.state = 'idle';
        this.timer = 0.5;
        this.glow = 0;
      }
    }
  }

  startNuke(game) {
    this.nukeState = 'charging';
    this.nukeT = 0;
    this.nukeSecs = -1;
    this.nukeDamage = 0;
    this.nukeThreshold = Math.round(this.phaseMaxHp * NUKE_BAR_MULT);
    this.nukeDuration = NUKE_TIME;
    this.state = 'nuke';
    this.glow = 0;
    game.bullets.clearEnemyBullets();
    game.beams.length = 0;
    game.nuke = { boss: this };
    game.shake = 8;
    game.sound.bossRoar();
    game.particles.float(this.x, this.y - 34, 'SUPER NUKE', C.red, 2);
    game.particles.ring(this.x, this.y, 26, 10, { color: C.magenta, speed: 140, life: 0.6 });
  }

  hit(dmg, game) {
    if (this.dead) return;
    const staggered = this.nukeState === 'stagger';

    // Phase 5 gate: the finale cannot be burst down before the nuke resolves.
    // While it charges, the shell eats everything you throw at it.
    if (this.nukeState === 'charging' || (this.phase === 5 && this.nukeState === 'none' && this.nukeCd <= 0)) {
      if (this.nukeState === 'charging') {
        this.nukeDamage += dmg;
        game.particles.float(this.x + rand(-8, 8), this.y - this.r - 4, Math.round(dmg), C.gold, 1);
        if (this.nukeDamage >= this.nukeThreshold) this.breakNuke(game);
      } else if (!this.shieldFx || this.t - this.shieldFx > 0.5) {
        this.shieldFx = this.t;
        game.particles.float(this.x, this.y - this.r - 10, 'SHIELDED', C.cyan, 1);
      }
      game.sound.hit();
      return;
    }

    const mult = staggered ? 1.5 : 1;
    super.hit(dmg * mult, game);
  }

  breakNuke(game) {
    this.nukeState = 'stagger';
    this.staggerT = 3.0;
    this.glow = 0;
    game.nuke = null;
    game.sound.bossShift();
    game.shake = 12;
    game.hitstop = Math.max(game.hitstop, 0.06);
    game.particles.burst(this.x, this.y, 40, {
      color: C.gold, speed: 220, life: 0.9, size: 2, drag: 0.9,
    });
    game.particles.float(this.x, this.y - 34, 'NUKE BROKEN', C.gold, 2);
    game.particles.float(this.x, this.y - 46, 'STAGGERED', C.white, 1);
  }

  pickAttack(game) {
    const pools = {
      1: ['curtain', 'rings', 'spread'],
      2: ['curtain', 'rings', 'spread', 'beam'],
      3: ['rings', 'spiral', 'summon', 'beam', 'spread'],
      4: ['storm', 'spiral', 'curtain', 'beam', 'summon'],
      5: ['storm', 'spiral', 'beam', 'spread'],
    };
    const pool = pools[this.phase] || pools[5];
    let name = pick(pool);
    if (name === this.lastAttack && Math.random() < 0.5) name = pick(pool);
    this.lastAttack = name;
    this.attack = name;
    this.state = 'attack';
    this.attackT = 0;
    this.fireT = 0;
    this.ringIdx = 0;
    this.fired = false;
    game.sound.tone(120, 60, 0.3, 'sawtooth', 0.08);
  }

  runAttack(dt, game) {
    const t = this.attackT;
    const p = game.player;
    const fast = 0.66;

    if (this.attack === 'curtain') {
      if (t < 0.6) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.15 * fast;
        const gapX = VIEW_W / 2 + Math.sin((t - 0.6) * 2.8) * 150;
        for (let x = 34; x <= VIEW_W - 34; x += 38) {
          if (Math.abs(x - gapX) < 48) continue;
          game.bullets.spawnEnemy(x, 22, Math.PI / 2, 120, {
            color: (Math.floor(t * 5) % 2) ? C.magenta : '#ff2b4e', r: 3, w: 6, h: 6, damage: 2,
          });
        }
      }
    } else if (this.attack === 'rings') {
      if (t < 0.45) return;
      const marks = [0.45, 1.05, 1.65, 2.25].map((m) => m * fast);
      if (this.ringIdx < marks.length && t >= marks[this.ringIdx]) {
        this.ringIdx++;
        ringBurst(game, this.x, this.y, 26, 78, {
          color: C.magenta, gap: 0.45, gapAngle: rand(0, TAU), radius: 16, damage: 2, w: 6, h: 6,
        });
        game.sound.tone(520, 260, 0.14, 'triangle', 0.05);
        game.shake = Math.min(8, game.shake + 1);
      }
    } else if (this.attack === 'spread') {
      if (t < 0.4) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.42 * fast;
        const base = angleTo(this.x, this.y, p.x, p.y);
        for (let i = 0; i < 7; i++) {
          const a = base + (i - 3) * 0.16;
          game.bullets.spawnEnemy(this.x + Math.cos(a) * 14, this.y + 8 + Math.sin(a) * 14, a, 150, {
            color: C.magenta, core: '#ffd0e0', r: 4, w: 6, h: 6, damage: 2,
          });
        }
        game.sound.tone(700, 300, 0.1, 'square', 0.05);
      }
    } else if (this.attack === 'spiral') {
      if (t < 0.3) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.055 * fast;
        const a = t * 3.2;
        for (let i = 0; i < 3; i++) {
          const aa = a + (i / 3) * TAU;
          game.bullets.spawnEnemy(this.x + Math.cos(aa) * 14, this.y + Math.sin(aa) * 14, aa, 95, {
            color: i % 2 ? C.cyan : C.magenta, r: 3, w: 5, h: 5, damage: 2,
          });
        }
      }
    } else if (this.attack === 'beam') {
      if (t < 0.1 || this.fired) return;
      this.fired = true;
      const base = angleTo(this.x, this.y, p.x, p.y);
      for (let i = -1; i <= 1; i++) {
        game.spawnBeam(this.x, this.y, base + i * 0.45, {
          charge: 0.85,
          active: 0.45,
          width: 12,
          color: i === 0 ? '#ff2b4e' : C.magenta,
          track: 0.55,
          damage: 2,
        });
      }
      game.sound.tone(200, 800, 0.5, 'sawtooth', 0.06);
    } else if (this.attack === 'storm') {
      if (t < 0.4) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.12;
        for (let i = 0; i < 6; i++) {
          const a = rand(0, TAU);
          game.bullets.spawnEnemy(this.x + Math.cos(a) * 18, this.y + Math.sin(a) * 18, a, rand(60, 150), {
            color: i % 2 ? C.cyan : C.magenta, r: 3, w: 5, h: 5, damage: 2,
          });
        }
      }
    } else if (this.attack === 'summon') {
      if (t < 0.9 || this.fired) return;
      this.fired = true;
      for (let i = 0; i < 3; i++) {
        const type = pick(['acolyte', 'turret', 'charger']);
        const e = makeEnemy(type, rand(90, VIEW_W - 90), rand(80, 160), undefined, this.room);
        e.spawnT = 0.6;
        e.spawnMax = 0.6;
        game.enemies.push(e);
        game.particles.ring(e.x, e.y, 10, 4, { color: C.magenta, speed: 60, life: 0.4 });
      }
      game.sound.tone(140, 420, 0.3, 'sawtooth', 0.07);
    }
  }

  die(game) {
    if (this.dead) return;
    if (this.phase < this.phaseCount) {
      this.phase++;
      this.hp = this.phaseMaxHp;
      this.nukeState = 'none';
      this.staggerT = 0;
      game.nuke = null;
      bossShift(this, game);
      if (this.phase === 5) this.nukeCd = 0;
      return;
    }
    game.nuke = null;
    bossDeath(this, game, '#ff2b4e');
  }

  draw(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const yy = y + Math.round(Math.sin(this.t * 1.6) * 3);
    const flash = this.flash > 0;
    const pulse = 0.5 + Math.sin(this.t * 3) * 0.2;

    // shadow / void
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 26, y + 30, 52, 5);

    // aura
    ctx.globalAlpha = 0.14 + pulse * 0.08;
    ctx.fillStyle = '#ff2b4e';
    ctx.fillRect(x - 34, yy - 30, 68, 62);
    ctx.globalAlpha = 1;

    // body mass
    ctx.fillStyle = flash ? C.white : '#160b14';
    ctx.fillRect(x - 24, yy - 18, 48, 40);
    ctx.fillRect(x - 18, yy - 26, 36, 52);
    ctx.fillStyle = flash ? C.white : '#25101f';
    ctx.fillRect(x - 20, yy - 12, 40, 34);
    // ribbed flesh
    ctx.fillStyle = '#3a1027';
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 20, yy - 8 + i * 7, 40, 2);

    // maw
    ctx.fillStyle = '#0a0409';
    ctx.fillRect(x - 14, yy - 2, 28, 18);
    ctx.fillStyle = flash ? C.white : '#5a1030';
    ctx.fillRect(x - 12, yy, 24, 2);
    ctx.fillRect(x - 12, yy + 12, 24, 2);
    // teeth
    ctx.fillStyle = '#e8dcea';
    for (let i = 0; i < 7; i++) {
      const tx = x - 12 + i * 4;
      ctx.fillRect(tx, yy, 2, 4);
      ctx.fillRect(tx, yy + 10, 2, 4);
    }
    // eyes
    const eyeGlow = 0.6 + Math.sin(this.t * 6) * 0.3;
    ctx.globalAlpha = eyeGlow;
    ctx.fillStyle = '#ff2b4e';
    ctx.fillRect(x - 18, yy - 12, 5, 3);
    ctx.fillRect(x + 13, yy - 12, 5, 3);
    ctx.fillRect(x - 3, yy - 20, 6, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.white;
    ctx.fillRect(x - 17, yy - 12, 2, 1);
    ctx.fillRect(x + 14, yy - 12, 2, 1);

    // horns
    ctx.fillStyle = flash ? C.white : '#3a1027';
    ctx.fillRect(x - 22, yy - 30, 5, 8);
    ctx.fillRect(x + 17, yy - 30, 5, 8);
    ctx.fillRect(x - 26, yy - 34, 4, 6);
    ctx.fillRect(x + 22, yy - 34, 4, 6);

    // charging nuke
    if (this.nukeState === 'charging') {
      const p = this.nukeT / this.nukeDuration;
      ctx.globalAlpha = 0.3 + p * 0.4;
      ctx.fillStyle = C.magenta;
      const rr = 6 + p * 14;
      ctx.fillRect(x - rr, yy - 48 - rr, rr * 2, rr * 2);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p > 0.75 ? C.white : C.red;
      ctx.fillRect(x - 5, yy - 53, 10, 10);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i++) {
        const a = this.rot * 2 + (i / 6) * TAU;
        ctx.fillStyle = i % 2 ? C.cyan : C.magenta;
        ctx.fillRect(Math.round(x + Math.cos(a) * (34 - p * 10)), Math.round(yy - 48 + Math.sin(a) * (18 - p * 6)), 2, 2);
      }
    }

    if (this.nukeState === 'stagger') {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = C.white;
      ctx.fillRect(x - 20, yy - 30, 40, 1);
      ctx.fillRect(x - 20, yy + 24, 40, 1);
      ctx.globalAlpha = 1;
    }
  }
}

/* ------------------------------ factory --------------------------- */

function makeBoss(room) {
  const floor = Math.min(5, room.floor || 1);
  if (floor >= 5) return new Devourer(VIEW_W / 2, 100, room);
  if (floor === 4) return new ObsidianSeraph(VIEW_W / 2, 96, room);
  if (floor === 3) return new CrimsonChoir(VIEW_W / 2, 90, room);
  if (floor === 2) return new BoneTitan(VIEW_W / 2, 104, room);
  return new LichWarden(VIEW_W / 2, 96, room);
}
