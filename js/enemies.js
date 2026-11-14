'use strict';

/* ------------------------------------------------------------------ *
 * enemies.js - acolyte, turret, charger skull and the Lich Warden    *
 * ------------------------------------------------------------------ */

let ENEMY_ID = 1;

class Enemy {
  constructor(x, y, type) {
    this.id = ENEMY_ID++;
    this.x = x;
    this.y = y;
    this.type = type;
    this.r = 8;
    this.hp = 10;
    this.maxHp = 10;
    this.dead = false;
    this.flash = 0;
    this.spawnT = 0.4;
    this.spawnMax = 0.4;
    this.t = rand(0, 10);
    this.score = 25;
    this.knockback = 1;
    this.isBoss = false;
    this.orbCd = 0;
    this.cd = rand(0.6, 1.6);
    this.state = 'idle';
    this.timer = 0;
    // status effects (sniper ammo): burn damage over time, frost slow
    this.burnT = 0;
    this.burnDmg = 0;
    this.burnTick = 0;
    this.slowT = 0;
    this.slowMul = 1;
  }

  /* Common per-frame bookkeeping; returns false while materialising. */
  tick(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.orbCd = Math.max(0, this.orbCd - dt);
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      return false;
    }
    return true;
  }

  hit(dmg, game) {
    if (this.dead || this.spawnT > 0) return;
    this.hp -= dmg;
    this.flash = 0.09;
    game.particles.float(this.x + rand(-4, 4), this.y - this.r - 4, Math.round(dmg), C.gold, 1);
    game.particles.burst(this.x, this.y, 3, { color: C.gold, speed: 85, life: 0.2, size: 1 });
    game.sound.hit();
    game.shake = Math.min(6, game.shake + 0.5);
    if (this.hp <= 0) this.die(game);
  }

  die(game) {
    if (this.dead) return;
    this.dead = true;
    game.particles.burst(this.x, this.y, 18, {
      color: C.magenta, speed: 150, life: 0.55, size: 2, drag: 0.87,
    });
    game.particles.burst(this.x, this.y, 10, {
      color: C.cyan, speed: 100, life: 0.45, size: 1,
    });
    game.particles.ring(this.x, this.y, 10, 4, { color: C.white, speed: 70, life: 0.26 });
    game.sound.enemyDeath();
    game.shake = Math.min(8, game.shake + 2.4);
    game.hitstop = Math.max(game.hitstop, 0.035);
    game.onEnemyDeath(this);
  }

  drawHpBar(ctx) {
    if (this.hp >= this.maxHp || this.isBoss) return;
    const w = Math.round(this.r * 2);
    const x = Math.round(this.x - w / 2);
    const y = Math.round(this.y - this.r - 7);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#2a2033';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = this.hp / this.maxHp > 0.4 ? C.cyan : C.magenta;
    ctx.fillRect(x, y, Math.max(1, Math.round(w * (this.hp / this.maxHp))), 2);
  }

  clampInside() {
    this.x = clamp(this.x, TILE + this.r, VIEW_W - TILE - this.r);
    this.y = clamp(this.y, TILE + this.r, VIEW_H - TILE - this.r);
  }

  drawSpawn(ctx) {
    if (this.spawnT <= 0) return false;
    const a = 1 - this.spawnT / this.spawnMax;
    ctx.globalAlpha = 0.7 * (1 - a);
    ctx.fillStyle = C.magenta;
    const s = Math.round(4 + a * 10);
    ctx.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
    ctx.globalAlpha = 1;
    return true;
  }
}

/* ------------------------- Cultist Acolyte ------------------------ */

class CultistAcolyte extends Enemy {
  constructor(x, y, id, room) {
    super(x, y, 'acolyte');
    this.id = id === undefined ? ENEMY_ID++ : id;
    this.room = room;
    this.r = 8;
    this.maxHp = 46 + (room ? room.depth * 5 : 0);
    this.hp = this.maxHp;
    this.score = 40;
    this.state = 'move';
    this.timer = 0;
    this.cd = rand(1.0, 2.0);
    this.castGlow = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
  }

  update(dt, game) {
    if (!this.tick(dt)) return;
    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const ang = angleTo(this.x, this.y, p.x, p.y);

    if (this.state === 'move') {
      let mv = 0;
      if (d > 148) mv = 1;
      else if (d < 96) mv = -1;
      const sx = Math.cos(ang) * mv + Math.cos(ang + Math.PI / 2) * this.strafe * 0.7;
      const sy = Math.sin(ang) * mv + Math.sin(ang + Math.PI / 2) * this.strafe * 0.7;
      const s = Math.hypot(sx, sy) || 1;
      this.x += (sx / s) * 34 * dt;
      this.y += (sy / s) * 34 * dt;
      this.castGlow = Math.max(0, this.castGlow - dt * 3);
      this.cd -= dt;
      if (this.cd <= 0 && d < 280) {
        this.state = 'telegraph';
        this.timer = 0.55;
      }
    } else if (this.state === 'telegraph') {
      this.timer -= dt;
      this.castGlow = Math.min(1, this.castGlow + dt * 4);
      if (this.timer <= 0) {
        this.cast(game);
        this.state = 'recover';
        this.timer = 0.45;
      }
    } else {
      this.timer -= dt;
      this.castGlow = Math.max(0, this.castGlow - dt * 3);
      if (this.timer <= 0) {
        this.state = 'move';
        this.cd = rand(1.3, 2.1);
        this.strafe *= Math.random() < 0.4 ? -1 : 1;
      }
    }
    this.clampInside();
  }

  cast(game) {
    const p = game.player;
    const base = angleTo(this.x, this.y, p.x, p.y);
    const shots = this.room && this.room.depth >= 3 ? 5 : 3;
    const spread = 0.19;
    for (let i = 0; i < shots; i++) {
      const a = base + (i - (shots - 1) / 2) * spread;
      game.bullets.spawnEnemy(this.x + Math.cos(a) * 8, this.y + Math.sin(a) * 8, a, 96, {
        color: C.magenta, r: 3, w: 5, h: 5, damage: 1,
      });
    }
    game.sound.tone(420, 240, 0.14, 'sawtooth', 0.05);
    game.particles.burst(this.x, this.y - 2, 6, {
      color: C.magenta, speed: 60, life: 0.3, angle: base, spread: 0.7,
    });
  }

  draw(ctx) {
    if (this.drawSpawn(ctx)) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 5, y + 6, 10, 2);

    const flash = this.flash > 0;
    ctx.fillStyle = flash ? C.white : '#4a1737';
    ctx.fillRect(x - 4, y - 1, 8, 8);
    ctx.fillStyle = flash ? C.white : '#6d2050';
    ctx.fillRect(x - 3, y - 2, 6, 6);
    // hood
    ctx.fillStyle = flash ? C.white : '#872a63';
    ctx.fillRect(x - 4, y - 8, 8, 6);
    ctx.fillRect(x - 3, y - 9, 6, 1);
    // face
    ctx.fillStyle = '#160b15';
    ctx.fillRect(x - 2, y - 7, 4, 4);
    ctx.fillStyle = this.state === 'telegraph' ? C.white : C.magenta;
    ctx.fillRect(x - 2, y - 6, 1, 1);
    ctx.fillRect(x + 1, y - 6, 1, 1);
    // robe trim
    ctx.fillStyle = '#3d1229';
    ctx.fillRect(x - 4, y + 4, 8, 1);
    // staff
    ctx.fillStyle = '#b9884a';
    ctx.fillRect(x + 4, y - 8, 1, 13);
    const glow = 1 + Math.round(this.castGlow * 2);
    ctx.globalAlpha = 0.35 + this.castGlow * 0.35;
    ctx.fillStyle = C.magenta;
    ctx.fillRect(x + 4 - glow, y - 10 - glow, 2 + glow * 2, 2 + glow * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.castGlow > 0.4 ? C.white : C.magenta;
    ctx.fillRect(x + 4, y - 9, 1, 1);
    this.drawHpBar(ctx);
  }
}

/* -------------------------- Bone Archer --------------------------- */

class BoneArcher extends Enemy {
  constructor(x, y, id, room) {
    super(x, y, 'archer');
    this.id = id === undefined ? ENEMY_ID++ : id;
    this.room = room;
    this.r = 8;
    this.maxHp = 34 + (room ? room.depth * 4 : 0);
    this.hp = this.maxHp;
    this.score = 50;
    this.state = 'reposition';
    this.timer = 0;
    this.cd = rand(0.9, 1.7);
    this.aimT = 0;
    this.shotsLeft = 0;
    this.facing = 1;
  }

  update(dt, game) {
    if (!this.tick(dt)) return;
    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const ang = angleTo(this.x, this.y, p.x, p.y);
    this.facing = Math.cos(ang) >= 0 ? 1 : -1;

    if (this.state === 'reposition') {
      const want = 168;
      const mv = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
      const strafe = Math.sin(this.t * 1.7) * 0.75;
      const sx = Math.cos(ang) * mv + Math.cos(ang + Math.PI / 2) * strafe;
      const sy = Math.sin(ang) * mv + Math.sin(ang + Math.PI / 2) * strafe;
      const s = Math.hypot(sx, sy) || 1;
      this.x += (sx / s) * 44 * dt;
      this.y += (sy / s) * 44 * dt;
      this.cd -= dt;
      if (this.cd <= 0 && d < 320) {
        this.state = 'volley';
        this.shotsLeft = (this.room && this.room.floor >= 4) ? 3 : 2;
        this.timer = 0.4;
      }
    } else if (this.state === 'volley') {
      this.timer -= dt;
      this.aimT = Math.min(1, this.aimT + dt * 5);
      if (this.timer <= 0 && this.shotsLeft > 0) {
        this.shotsLeft--;
        this.timer = 0.14;
        const a = angleTo(this.x, this.y, p.x, p.y) + rand(-0.05, 0.05);
        game.bullets.spawnEnemy(this.x + Math.cos(a) * 9, this.y + Math.sin(a) * 9, a, 205, {
          color: '#ffd166', core: '#fff6d6', r: 2, w: 7, h: 3, damage: 1, life: 3.4,
        });
        game.sound.tone(560, 300, 0.06, 'square', 0.04);
        game.particles.burst(this.x + Math.cos(a) * 9, this.y + Math.sin(a) * 9, 3, {
          color: '#ffd166', speed: 70, life: 0.16, angle: a, spread: 0.4, size: 1,
        });
      }
      if (this.shotsLeft <= 0 && this.timer <= 0) {
        this.state = 'reposition';
        this.cd = rand(1.4, 2.3);
        this.aimT = 0;
      }
    }
    this.clampInside();
  }

  draw(ctx) {
    if (this.drawSpawn(ctx)) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const flash = this.flash > 0;
    const bone = flash ? C.white : '#d9d2c0';
    const boneDim = flash ? C.white : '#a89e88';

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(x - 5, y + 7, 10, 2);

    // legs and ribcage
    ctx.fillStyle = boneDim;
    ctx.fillRect(x - 3, y + 2, 2, 5);
    ctx.fillRect(x + 1, y + 2, 2, 5);
    ctx.fillStyle = '#07070b';
    ctx.fillRect(x - 4, y - 5, 8, 8);
    ctx.fillStyle = bone;
    ctx.fillRect(x - 3, y - 4, 6, 6);
    ctx.fillStyle = '#0d0d13';
    ctx.fillRect(x - 2, y - 3, 1, 4);
    ctx.fillRect(x + 1, y - 3, 1, 4);

    // skull
    ctx.fillStyle = '#07070b';
    ctx.fillRect(x - 4, y - 11, 8, 7);
    ctx.fillStyle = bone;
    ctx.fillRect(x - 3, y - 10, 6, 5);
    ctx.fillStyle = '#0d0d13';
    ctx.fillRect(x - 2, y - 8, 2, 2);
    ctx.fillRect(x + 1, y - 8, 2, 2);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 2, y - 8, 1, 1);
    ctx.fillRect(x + 2, y - 8, 1, 1);

    // bow, drawn on the side it faces
    const bx = x + this.facing * 7;
    ctx.strokeStyle = '#8a7350';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (this.facing > 0) ctx.arc(bx, y - 3, 8, -1.2, 1.2);
    else ctx.arc(bx, y - 3, 8, Math.PI - 1.2, Math.PI + 1.2);
    ctx.stroke();
    if (this.state === 'volley') {
      const glow = 0.35 + this.aimT * 0.65;
      ctx.globalAlpha = glow;
      ctx.fillStyle = C.gold;
      ctx.fillRect(bx + this.facing * 2 - 1, y - 4, 2, 2);
      ctx.globalAlpha = 1;
    }
    this.drawHpBar(ctx);
  }
}

/* --------------------------- Hex Wraith --------------------------- */

class HexWraith extends Enemy {
  constructor(x, y, id, room) {
    super(x, y, 'wraith');
    this.id = id === undefined ? ENEMY_ID++ : id;
    this.room = room;
    this.r = 8;
    this.maxHp = 40 + (room ? room.depth * 5 : 0);
    this.hp = this.maxHp;
    this.score = 60;
    this.state = 'drift';
    this.timer = 0;
    this.cd = rand(1.6, 2.6);
    this.phase = 0;
  }

  update(dt, game) {
    if (!this.tick(dt)) return;
    const p = game.player;

    if (this.state === 'drift') {
      const ang = angleTo(this.x, this.y, p.x, p.y);
      this.x += Math.cos(ang) * 24 * dt;
      this.y += Math.sin(ang) * 24 * dt;
      this.cd -= dt;
      if (this.cd <= 0) {
        this.state = 'vanish';
        this.timer = 0.32;
        game.particles.ring(this.x, this.y, 10, 6, { color: '#c77dff', speed: 70, life: 0.28 });
      }
    } else if (this.state === 'vanish') {
      this.timer -= dt;
      this.phase = Math.min(1, this.phase + dt * 3);
      if (this.timer <= 0) {
        const a = rand(0, TAU);
        const rad = rand(62, 96);
        const nx = p.x + Math.cos(a) * rad;
        const ny = p.y + Math.sin(a) * rad;
        const room = game.currentRoom;
        if (room && !room.circleBlocked(nx, ny, this.r)) {
          this.x = nx;
          this.y = ny;
        }
        this.phase = 0;
        game.particles.ring(this.x, this.y, 12, 6, { color: '#c77dff', speed: 90, life: 0.3 });
        this.state = 'cast';
        this.timer = 0.5;
      }
    } else if (this.state === 'cast') {
      this.timer -= dt;
      if (this.timer <= 0) {
        const shots = 7;
        for (let i = 0; i < shots; i++) {
          const a = (i / shots) * TAU + this.t * 0.4;
          game.bullets.spawnEnemy(this.x, this.y, a, 88, {
            color: '#c77dff', core: '#f0dcff', r: 3, w: 5, h: 5, damage: 1,
          });
        }
        game.sound.tone(320, 140, 0.22, 'triangle', 0.05);
        game.particles.burst(this.x, this.y, 12, { color: '#c77dff', speed: 110, life: 0.35, size: 1 });
        this.state = 'recover';
        this.timer = 0.5;
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'drift';
        this.cd = rand(2.2, 3.2);
      }
    }
    this.clampInside();
  }

  draw(ctx) {
    if (this.drawSpawn(ctx)) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y) + Math.round(Math.sin(this.t * 3) * 2);
    const flash = this.flash > 0;
    const body = flash ? C.white : '#4a2a6b';
    const glow = flash ? C.white : '#c77dff';

    ctx.globalAlpha = this.state === 'vanish' ? 0.35 : 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 5, y + 9, 10, 2);

    // tattered cloak
    ctx.fillStyle = body;
    ctx.fillRect(x - 5, y - 8, 10, 12);
    for (let i = 0; i < 5; i++) {
      const h = 2 + ((i * 7) % 4);
      ctx.fillRect(x - 5 + i * 2, y + 4, 2, h);
    }
    ctx.fillStyle = flash ? C.white : '#2c1840';
    ctx.fillRect(x - 3, y - 11, 6, 4);
    ctx.fillStyle = glow;
    ctx.fillRect(x - 2, y - 7, 2, 2);
    ctx.fillRect(x + 1, y - 7, 2, 2);
    ctx.globalAlpha = 1;

    if (this.state === 'cast') {
      const p = 1 - this.timer / 0.5;
      ctx.globalAlpha = 0.3 + p * 0.4;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y - 1, 10 + p * 6, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.drawHpBar(ctx);
  }
}

/* --------------------------- Grave Brute -------------------------- */

class GraveBrute extends Enemy {
  constructor(x, y, id, room) {
    super(x, y, 'brute');
    this.id = id === undefined ? ENEMY_ID++ : id;
    this.room = room;
    this.r = 12;
    this.maxHp = 120 + (room ? room.depth * 12 : 0);
    this.hp = this.maxHp;
    this.score = 90;
    this.contactDamage = 2;
    this.state = 'walk';
    this.timer = 0;
    this.cd = rand(1.8, 2.8);
    this.step = 0;
  }

  update(dt, game) {
    if (!this.tick(dt)) return;
    const p = game.player;
    const ang = angleTo(this.x, this.y, p.x, p.y);

    if (this.state === 'walk') {
      this.step += dt * 6;
      this.x += Math.cos(ang) * 24 * dt;
      this.y += Math.sin(ang) * 24 * dt;
      this.cd -= dt;
      if (this.cd <= 0) {
        this.state = 'windup';
        this.timer = 0.55;
      }
    } else if (this.state === 'windup') {
      this.timer -= dt;
      if (this.timer <= 0) {
        const shots = 12;
        for (let i = 0; i < shots; i++) {
          const a = (i / shots) * TAU + 0.2;
          game.bullets.spawnEnemy(this.x, this.y, a, 78, {
            color: C.red, core: '#ffd9d9', r: 3, w: 6, h: 6, damage: 1, life: 5,
          });
        }
        game.shake = Math.min(8, game.shake + 3.5);
        game.sound.tone(120, 60, 0.3, 'sawtooth', 0.08);
        game.particles.ring(this.x, this.y, 18, 9, { color: C.red, speed: 110, life: 0.4 });
        game.particles.burst(this.x, this.y, 14, { color: '#6b3a2a', speed: 120, life: 0.4, size: 2 });
        this.state = 'recover';
        this.timer = 0.55;
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'walk';
        this.cd = rand(2.2, 3.0);
      }
    }
    this.clampInside();
  }

  draw(ctx) {
    if (this.drawSpawn(ctx)) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const flash = this.flash > 0;
    const stone = flash ? C.white : '#5b4a3f';
    const stoneLit = flash ? C.white : '#7a6353';
    const swing = Math.sin(this.step) * 1.5;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 9, y + 11, 18, 3);

    // legs
    ctx.fillStyle = '#3a2f28';
    ctx.fillRect(x - 6, y + 5, 4, 7);
    ctx.fillRect(x + 2, y + 5, 4, 7);
    // torso
    ctx.fillStyle = '#07070b';
    ctx.fillRect(x - 9, y - 9, 18, 15);
    ctx.fillStyle = stone;
    ctx.fillRect(x - 8, y - 8, 16, 13);
    ctx.fillStyle = stoneLit;
    ctx.fillRect(x - 8, y - 8, 5, 13);
    // cracks
    ctx.fillStyle = flash ? C.white : C.magenta;
    ctx.fillRect(x - 1, y - 6, 1, 4);
    ctx.fillRect(x, y - 3, 3, 1);
    ctx.fillRect(x - 3, y + 2, 1, 3);
    // head
    ctx.fillStyle = '#07070b';
    ctx.fillRect(x - 5, y - 16, 10, 8);
    ctx.fillStyle = stoneLit;
    ctx.fillRect(x - 4, y - 15, 8, 6);
    ctx.fillStyle = C.red;
    ctx.fillRect(x - 3, y - 13, 2, 2);
    ctx.fillRect(x + 1, y - 13, 2, 2);
    // fists
    ctx.fillStyle = stoneLit;
    ctx.fillRect(x - 13, y - 5 + Math.round(swing), 5, 5);
    ctx.fillRect(x + 8, y - 5 - Math.round(swing), 5, 5);

    if (this.state === 'windup') {
      const p = 1 - this.timer / 0.55;
      ctx.globalAlpha = 0.25 + p * 0.35;
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 20 + p * 26, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.drawHpBar(ctx);
  }
}

/* ------------------------- Arcane Turret -------------------------- */

class ArcaneTurret extends Enemy {
  constructor(x, y, id, room) {
    super(x, y, 'turret');
    this.id = id === undefined ? ENEMY_ID++ : id;
    this.room = room;
    this.r = 9;
    this.maxHp = 64 + (room ? room.depth * 7 : 0);
    this.hp = this.maxHp;
    this.score = 50;
    this.state = 'idle';
    this.cd = rand(0.8, 2.0);
    this.emitT = 0;
    this.shotsLeft = 0;
    this.spin = rand(0, TAU);
    this.ringT = 0;
  }

  update(dt, game) {
    if (!this.tick(dt)) return;
    this.spin += dt * 0.9;

    if (this.state === 'idle') {
      this.cd -= dt;
      if (this.cd <= 0) {
        this.state = 'charge';
        this.timer = 0.75;
        this.ringT = 0;
      }
    } else if (this.state === 'charge') {
      this.timer -= dt;
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 0.15;
        game.particles.ring(this.x, this.y, 12, 10, { color: C.cyan, speed: -26, life: 0.3 });
        game.sound.tone(300, 900, 0.1, 'sine', 0.03);
      }
      if (this.timer <= 0) {
        this.state = 'fire';
        this.shotsLeft = 18;
        this.emitT = 0;
        this.baseAngle = rand(0, TAU);
      }
    } else if (this.state === 'fire') {
      this.emitT -= dt;
      if (this.emitT <= 0 && this.shotsLeft > 0) {
        this.emitT = 0.075;
        const a = this.baseAngle + (18 - this.shotsLeft) * 0.4;
        game.bullets.spawnEnemy(this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 10, a, 74, {
          color: C.cyan, core: '#e6fffb', r: 3, w: 5, h: 5, damage: 1,
        });
        this.shotsLeft--;
        game.sound.tone(700, 500, 0.04, 'square', 0.022);
      }
      if (this.shotsLeft <= 0) {
        this.state = 'idle';
        this.cd = rand(1.9, 2.6);
      }
    }
  }

  draw(ctx) {
    if (this.drawSpawn(ctx)) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(x - 6, y + 7, 12, 2);

    // pedestal
    ctx.fillStyle = '#232a36';
    ctx.fillRect(x - 6, y + 5, 12, 3);
    ctx.fillStyle = '#39434f';
    ctx.fillRect(x - 5, y + 4, 10, 1);

    // floating crystal
    const bob = Math.round(Math.sin(this.t * 2.2) * 1.5);
    const cy = y - 2 + bob;
    const flash = this.flash > 0;
    const charge = this.state === 'charge' ? 1 : 0;
    const body = flash ? C.white : charge ? '#7dfcf0' : C.cyanDim;
    for (let i = 0; i < 5; i++) {
      const w = i < 3 ? (i + 1) * 2 : (5 - i) * 2;
      ctx.fillStyle = body;
      ctx.fillRect(x - w / 2, cy - 6 + i * 2, w, 2);
    }
    ctx.fillStyle = flash ? C.white : C.cyan;
    ctx.fillRect(x - 1, cy - 2, 2, 4);
    ctx.fillStyle = '#eafffd';
    ctx.fillRect(x - 1, cy - 4, 2, 2);

    // rotating shards
    for (let i = 0; i < 3; i++) {
      const a = this.spin + (i / 3) * TAU;
      const sx = Math.round(x + Math.cos(a) * 11);
      const sy = Math.round(cy + Math.sin(a) * 8);
      ctx.fillStyle = charge ? C.white : C.cyan;
      ctx.fillRect(sx, sy, 2, 1);
    }

    if (charge) {
      const p = 1 - this.timer / 0.75;
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = C.cyan;
      ctx.fillRect(x - 12, cy - 12, 24, 1);
      ctx.fillRect(x - 12, cy + 11, 24, 1);
      ctx.fillRect(x - 13, cy - 12, 1, 24);
      ctx.fillRect(x + 12, cy - 12, 1, 24);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.white;
      ctx.fillRect(x - Math.round(p * 10), cy - 12, 2, 1);
      ctx.fillRect(x + Math.round(p * 10), cy + 11, 2, 1);
    }
    this.drawHpBar(ctx);
  }
}

/* -------------------------- Charger Skull ------------------------- */

class ChargerSkull extends Enemy {
  constructor(x, y, id, room) {
    super(x, y, 'charger');
    this.id = id === undefined ? ENEMY_ID++ : id;
    this.room = room;
    this.r = 8;
    this.maxHp = 36 + (room ? room.depth * 4 : 0);
    this.hp = this.maxHp;
    this.score = 45;
    this.state = 'float';
    this.timer = 0;
    this.cd = rand(1.2, 2.2);
    this.dirX = 0;
    this.dirY = 0;
    this.dashSpeed = 320;
    this.aimPulse = 0;
    this.wobble = rand(0, TAU);
  }

  update(dt, game) {
    if (!this.tick(dt)) return;
    const p = game.player;
    this.wobble += dt * 6;

    if (this.state === 'float') {
      const ang = angleTo(this.x, this.y, p.x, p.y);
      const d = dist(this.x, this.y, p.x, p.y);
      const spd = d > 60 ? 40 : 16;
      this.x += Math.cos(ang) * spd * dt;
      this.y += Math.sin(ang) * spd * dt + Math.sin(this.wobble) * 0.35;
      this.cd -= dt;
      if (this.cd <= 0 && d < 260) {
        this.state = 'aim';
        this.timer = 0.9;
        this.dirX = Math.cos(ang);
        this.dirY = Math.sin(ang);
      }
    } else if (this.state === 'aim') {
      this.timer -= dt;
      this.aimPulse += dt * 14;
      if (this.timer > 0.28) {
        const ang = angleTo(this.x, this.y, p.x, p.y);
        this.dirX = Math.cos(ang);
        this.dirY = Math.sin(ang);
      }
      if (this.timer <= 0) {
        this.state = 'dash';
        this.timer = 0.55;
        game.sound.tone(180, 620, 0.16, 'sawtooth', 0.07);
        game.shake = Math.min(6, game.shake + 1.5);
        game.particles.burst(this.x, this.y, 10, {
          color: C.red, speed: 100, life: 0.3, angle: Math.atan2(-this.dirY, -this.dirX), spread: 0.7,
        });
      }
    } else if (this.state === 'dash') {
      this.timer -= dt;
      const step = this.dashSpeed * dt;
      const nx = this.x + this.dirX * step;
      const ny = this.y + this.dirY * step;
      const room = game.currentRoom;
      if (room.circleBlocked(nx, ny, this.r)) {
        this.burst(game);
      } else {
        this.x = nx;
        this.y = ny;
        game.particles.spawn(this.x, this.y, {
          vx: rand(-14, 14), vy: rand(-14, 14), life: 0.22, color: C.magenta, size: 1,
        });
        if (this.timer <= 0) this.burst(game);
      }
      if (game.player.canBeHit() && dist(this.x, this.y, p.x, p.y) < this.r + p.r + 2) {
        game.player.hurt(1, game);
        this.burst(game);
      }
    } else if (this.state === 'stun') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'float';
        this.cd = rand(1.6, 2.4);
      }
    }
    this.clampInside();
  }

  burst(game) {
    if (this.state === 'stun') return;
    this.state = 'stun';
    this.timer = 0.65;
    game.shake = Math.min(7, game.shake + 2.5);
    game.sound.explode();
    game.particles.burst(this.x, this.y, 16, {
      color: C.magenta, speed: 150, life: 0.45, size: 2, drag: 0.88,
    });
    game.particles.ring(this.x, this.y, 12, 6, { color: C.red, speed: 60, life: 0.3 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.15;
      game.bullets.spawnEnemy(this.x, this.y, a, 100, {
        color: C.magenta, core: '#ffd0e6', r: 3, w: 5, h: 5, damage: 1,
      });
    }
  }

  draw(ctx) {
    if (this.drawSpawn(ctx)) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y) + Math.round(Math.sin(this.wobble) * 1.5);

    // telegraph laser
    if (this.state === 'aim') {
      const p = 1 - this.timer / 0.9;
      const len = 460;
      const ex = this.x + this.dirX * len;
      const ey = this.y + this.dirY * len;
      ctx.globalAlpha = 0.35 + Math.sin(this.aimPulse) * 0.18;
      ctx.fillStyle = C.red;
      for (let d = 8; d < len; d += 8) {
        ctx.fillRect(Math.round(this.x + this.dirX * d), Math.round(this.y + this.dirY * d), 2, 2);
      }
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = C.white;
      ctx.fillRect(Math.round(this.x + this.dirX * 9), Math.round(this.y + this.dirY * 9), 3, 3);
      ctx.globalAlpha = 1;
      // charge ring
      ctx.globalAlpha = 0.5 * p;
      ctx.fillStyle = C.red;
      ctx.fillRect(x - 9, y - 10, 18, 1);
      ctx.fillRect(x - 9, y + 9, 18, 1);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 5, y + 6, 10, 2);

    const flash = this.flash > 0;
    const bone = flash ? C.white : '#d9d3e6';
    // horns
    ctx.fillStyle = flash ? C.white : '#9b8fb5';
    ctx.fillRect(x - 6, y - 8, 2, 3);
    ctx.fillRect(x + 4, y - 8, 2, 3);
    ctx.fillRect(x - 5, y - 9, 1, 2);
    ctx.fillRect(x + 4, y - 9, 1, 2);
    // cranium
    ctx.fillStyle = bone;
    ctx.fillRect(x - 4, y - 7, 8, 7);
    ctx.fillRect(x - 3, y, 6, 3);
    ctx.fillStyle = flash ? C.white : '#aba3c2';
    ctx.fillRect(x - 4, y + 2, 2, 2);
    ctx.fillRect(x + 2, y + 2, 2, 2);
    // sockets
    ctx.fillStyle = '#160f1e';
    ctx.fillRect(x - 3, y - 5, 2, 3);
    ctx.fillRect(x + 1, y - 5, 2, 3);
    const eye = this.state === 'aim' || this.state === 'dash' ? C.red : C.magenta;
    ctx.fillStyle = eye;
    ctx.fillRect(x - 3, y - 4, 1, 1);
    ctx.fillRect(x + 2, y - 4, 1, 1);
    if (this.state === 'aim') {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = C.red;
      ctx.fillRect(x - 4, y - 5, 3, 3);
      ctx.fillRect(x + 1, y - 5, 3, 3);
      ctx.globalAlpha = 1;
    }
    // teeth
    ctx.fillStyle = '#7c7391';
    ctx.fillRect(x - 2, y + 1, 4, 1);
    this.drawHpBar(ctx);
  }
}

/* --------------------------- Lich Warden -------------------------- */

const BOSS_DURATION = {
  curtain: 3.0,
  rings: 3.5,
  summon: 1.9,
  spread: 2.0,
  spiral: 2.7,
  slam: 3.0,
  spears: 1.7,
  quake: 2.9,
  notes: 3.1,
  burst: 2.0,
  beams: 2.4,
  walls: 2.6,
  dive: 2.2,
  beam: 2.2,
  storm: 2.4,
};

class LichWarden extends Enemy {
  constructor(x, y, room) {
    super(x, y, 'boss');
    this.room = room;
    this.r = 16;
    this.maxHp = Math.round(900 * (1 + ((room && room.floor ? room.floor : 1) - 1) * 0.55));
    this.phaseCount = 3;
    this.phaseMaxHp = Math.round((this.maxHp * (1 + (this.phaseCount - 1) * 0.18)) / this.phaseCount);
    this.hp = this.phaseMaxHp;
    this.score = 2500;
    this.isBoss = true;
    this.name = 'THE LICH WARDEN';
    this.barColor = C.magenta;
    this.contactDamage = 2;
    this.spawnT = 1.4;
    this.spawnMax = 1.4;
    this.state = 'idle';
    this.timer = 1.5;
    this.phase = 1;
    this.attack = null;
    this.attackT = 0;
    this.fireT = 0;
    this.lastAttack = '';
    this.targetX = VIEW_W / 2;
    this.targetY = 96;
    this.summoned = false;
    this.ringIdx = 0;
    this.driftT = 0;
    this.auraT = 0;
    this.staffGlow = 0;
    this.rot = 0;
    this.phaseHeal = 0.18;
    this.agitation = 1.12 + ((room && room.floor ? room.floor : 1) - 1) * 0.14;
  }

  update(dt, game) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.orbCd = Math.max(0, this.orbCd - dt);
    this.rot += dt * 0.8;
    this.auraT += dt;

    if (this.spawnT > 0) {
      this.spawnT -= dt;
      if (Math.random() < 0.5) {
        const a = rand(0, TAU);
        game.particles.spawn(this.x + Math.cos(a) * rand(4, 20), this.y + Math.sin(a) * rand(4, 20), {
          vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 0.5, color: C.magenta, size: 2,
        });
      }
      return;
    }

    if (this.state === 'shift') {
      this.timer -= dt;
      this.staffGlow = Math.min(1, this.staffGlow + dt * 2);
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = 1.0 / this.agitation;
        this.staffGlow = 0;
      }
      return;
    }

    if (this.state === 'idle') {
      this.driftT -= dt;
      if (this.driftT <= 0) {
        this.driftT = rand(0.7, 1.3);
        this.targetX = rand(120, VIEW_W - 120);
        this.targetY = rand(70, 128);
      }
      this.x = lerp(this.x, this.targetX, Math.min(1, dt * 1.4));
      this.y = lerp(this.y, this.targetY, Math.min(1, dt * 1.4));
      this.staffGlow = Math.max(0, this.staffGlow - dt * 2);
      this.timer -= dt;
      if (this.timer <= 0) this.pickAttack(game);
    } else if (this.state === 'attack') {
      this.attackT += dt;
      this.runAttack(dt, game);
      this.staffGlow = Math.min(1, this.staffGlow + dt * 1.4);
      if (this.attackT >= (BOSS_DURATION[this.attack] || 2)) {
        this.state = 'idle';
        this.timer = (this.phase === 3 ? 0.4 : 0.55) / this.agitation;
        this.staffGlow = 0;
      }
    }

    if (Math.random() < dt * 12) {
      game.particles.spawn(this.x + rand(-14, 14), this.y + rand(-6, 20), {
        vx: rand(-8, 8), vy: rand(-24, -8), life: 0.6, color: this.phase === 3 ? C.magenta : C.purple, size: 1,
      });
    }
  }

  pickAttack(game) {
    const pools = {
      1: ['curtain', 'rings', 'summon'],
      2: ['rings', 'spread', 'curtain', 'summon'],
      3: ['spiral', 'rings', 'spread', 'curtain'],
    };
    const pool = pools[this.phase];
    let name = pick(pool);
    if (name === this.lastAttack && Math.random() < 0.65) name = pick(pool);
    this.lastAttack = name;
    this.attack = name;
    this.attackT = 0;
    this.fireT = 0;
    this.summoned = false;
    this.ringIdx = 0;
    this.state = 'attack';
    game.sound.tone(300, 500, 0.16, 'sawtooth', 0.06);
  }

  runAttack(dt, game) {
    const p = game.player;
    const t = this.attackT;

    if (this.attack === 'curtain') {
      if (t < 0.35) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.2;
        const gapX = VIEW_W / 2 + Math.sin((t - 0.7) * 2.4) * 132;
        for (let x = 36; x <= VIEW_W - 36; x += 44) {
          if (Math.abs(x - gapX) < 52) continue;
          game.bullets.spawnEnemy(x, 24, Math.PI / 2, 92, {
            color: (Math.floor(t * 4) % 2) ? C.magenta : C.cyan,
            r: 3, w: 5, h: 5, damage: 1,
          });
        }
        game.sound.tone(260, 200, 0.06, 'square', 0.028);
      }
    } else if (this.attack === 'rings') {
      if (t < 0.25) return;
      const marks = [0.55, 1.3, 2.05];
      if (this.ringIdx < marks.length && t >= marks[this.ringIdx]) {
        this.ringIdx++;
        const gap = rand(0, TAU);
        const count = 22;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU;
          let da = Math.abs(((a - gap + Math.PI) % TAU) - Math.PI);
          if (da < 0.42) continue;
          game.bullets.spawnEnemy(this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 14, a, 62, {
            color: C.cyan, core: '#eafffd', r: 3, w: 5, h: 5, damage: 1,
          });
        }
        game.sound.tone(520, 260, 0.16, 'triangle', 0.06);
        game.shake = Math.min(6, game.shake + 0.8);
      }
    } else if (this.attack === 'summon') {
      if (t > 0.6 && !this.summoned) {
        this.summoned = true;
        const spots = [
          { x: TILE + 30, y: TILE + 40 },
          { x: VIEW_W - TILE - 30, y: TILE + 40 },
          { x: VIEW_W / 2, y: VIEW_H - TILE - 50 },
        ];
        const n = this.phase >= 2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const s = spots[i % spots.length];
          const type = Math.random() < 0.5 ? 'acolyte' : 'charger';
          const e = makeEnemy(type, s.x + rand(-12, 12), s.y + rand(-12, 12), undefined, this.room);
          e.spawnT = 0.55;
          e.spawnMax = 0.55;
          game.enemies.push(e);
          game.particles.ring(s.x, s.y, 12, 4, { color: C.magenta, speed: 60, life: 0.4 });
          game.particles.burst(s.x, s.y, 10, { color: C.purple, speed: 90, life: 0.5, size: 2 });
        }
        game.sound.tone(180, 520, 0.3, 'sawtooth', 0.08);
        game.shake = Math.min(8, game.shake + 2);
      }
    } else if (this.attack === 'spread') {
      if (t < 0.2) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.55;
        const base = angleTo(this.x, this.y, p.x, p.y);
        for (let i = 0; i < 5; i++) {
          const a = base + (i - 2) * 0.18;
          game.bullets.spawnEnemy(this.x + Math.cos(a) * 12, this.y + 8 + Math.sin(a) * 12, a, 128, {
            color: C.magenta, core: '#ffd9ec', r: 3, w: 5, h: 5, damage: 1,
          });
        }
        game.sound.tone(700, 320, 0.12, 'square', 0.05);
      }
    } else if (this.attack === 'spiral') {
      if (t < 0.15) return;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.065;
        const a = t * 2.7;
        for (let i = 0; i < 2; i++) {
          const aa = a + i * Math.PI;
          game.bullets.spawnEnemy(this.x + Math.cos(aa) * 12, this.y + 6 + Math.sin(aa) * 12, aa, 82, {
            color: i ? C.cyan : C.magenta, r: 3, w: 5, h: 5, damage: 1,
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
    this.dead = true;
    game.shake = 14;
    game.hitstop = 0.12;
    game.sound.explode();
    game.sound.enemyDeath();
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU);
      game.particles.burst(this.x + Math.cos(a) * 16, this.y + Math.sin(a) * 16, 16, {
        color: i % 2 ? C.magenta : C.cyan, speed: 170, life: 0.9, size: 2, drag: 0.88,
      });
    }
    game.particles.burst(this.x, this.y, 50, {
      color: C.gold, speed: 220, life: 1.1, size: 2, drag: 0.9,
    });
    game.particles.ring(this.x, this.y, 30, 10, { color: C.white, speed: 160, life: 0.7 });
    game.onBossDeath(this);
  }

  draw(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const float = Math.round(Math.sin(this.t * 1.8) * 2);
    const yy = y + float;
    const flash = this.flash > 0;

    if (this.spawnT > 0) {
      const a = 1 - this.spawnT / this.spawnMax;
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = C.magenta;
      ctx.fillRect(x - 22, yy - 26, 44, 1);
      ctx.fillRect(x - 22, yy + 22, 44, 1);
      ctx.globalAlpha = 1;
    }

    // aura
    ctx.globalAlpha = 0.16 + Math.sin(this.t * 3) * 0.05;
    ctx.fillStyle = this.phase === 3 ? C.magenta : C.purple;
    ctx.fillRect(x - 23, yy - 24, 46, 46);
    ctx.globalAlpha = 1;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 14, y + 26, 28, 3);
    ctx.fillRect(x - 10, y + 29, 20, 1);

    // robe
    ctx.fillStyle = flash ? C.white : '#2c1c44';
    ctx.fillRect(x - 13, yy - 2, 26, 26);
    ctx.fillRect(x - 10, yy + 24, 20, 4);
    ctx.fillStyle = flash ? C.white : '#3b2757';
    ctx.fillRect(x - 11, yy - 4, 22, 24);
    // robe trim
    ctx.fillStyle = C.goldDim;
    ctx.fillRect(x - 12, yy + 18, 24, 2);
    ctx.fillStyle = C.magentaDim;
    ctx.fillRect(x - 8, yy + 20, 16, 1);
    // ribcage hint
    ctx.fillStyle = '#241636';
    for (let i = 0; i < 3; i++) ctx.fillRect(x - 8, yy + 2 + i * 4, 16, 1);

    // shoulders
    ctx.fillStyle = flash ? C.white : '#4a3168';
    ctx.fillRect(x - 16, yy - 6, 6, 8);
    ctx.fillRect(x + 10, yy - 6, 6, 8);

    // skull
    const bone = flash ? C.white : '#ded8ec';
    ctx.fillStyle = bone;
    ctx.fillRect(x - 9, yy - 22, 18, 15);
    ctx.fillRect(x - 7, yy - 8, 14, 5);
    ctx.fillStyle = flash ? C.white : '#b6aecb';
    ctx.fillRect(x - 9, yy - 14, 3, 4);
    ctx.fillRect(x + 6, yy - 14, 3, 4);
    // sockets
    ctx.fillStyle = '#120b1c';
    ctx.fillRect(x - 7, yy - 17, 6, 6);
    ctx.fillRect(x + 1, yy - 17, 6, 6);
    const eyeColor = this.phase === 3 ? C.magenta : C.cyan;
    const eyeGlow = 0.6 + Math.sin(this.t * 5) * 0.3;
    ctx.globalAlpha = eyeGlow;
    ctx.fillStyle = eyeColor;
    ctx.fillRect(x - 6, yy - 15, 4, 3);
    ctx.fillRect(x + 2, yy - 15, 4, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 5, yy - 15, 1, 1);
    ctx.fillRect(x + 3, yy - 15, 1, 1);
    // jaw
    ctx.fillStyle = '#120b1c';
    ctx.fillRect(x - 5, yy - 8, 10, 2);
    ctx.fillStyle = bone;
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 4 + i * 3, yy - 8, 1, 2);

    // crown
    ctx.fillStyle = C.gold;
    ctx.fillRect(x - 8, yy - 25, 16, 2);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x - 8 + i * 7, yy - 29, 2, 4);
      ctx.fillStyle = C.goldDim;
      ctx.fillRect(x - 7 + i * 7, yy - 28, 1, 3);
      ctx.fillStyle = C.gold;
    }
    ctx.fillStyle = C.magenta;
    ctx.fillRect(x - 1, yy - 24, 2, 1);

    // staff
    const sx = x + 19;
    ctx.fillStyle = '#6b5230';
    ctx.fillRect(sx, yy - 20, 2, 40);
    ctx.fillStyle = C.goldDim;
    ctx.fillRect(sx - 1, yy - 22, 4, 2);
    const orbR = 2 + Math.round(this.staffGlow * 3);
    ctx.globalAlpha = 0.28 + this.staffGlow * 0.3;
    ctx.fillStyle = C.magenta;
    ctx.fillRect(sx - orbR, yy - 26 - orbR, orbR * 2 + 2, orbR * 2 + 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.staffGlow > 0.5 ? C.white : C.magenta;
    ctx.fillRect(sx - 1, yy - 27, 4, 4);
    ctx.fillStyle = '#ffe1f0';
    ctx.fillRect(sx, yy - 26, 2, 2);

    // orbiting sigils
    for (let i = 0; i < 4; i++) {
      const a = this.rot + (i / 4) * TAU;
      const ox = Math.round(x + Math.cos(a) * 28);
      const oy = Math.round(yy + Math.sin(a) * 16);
      ctx.fillStyle = i % 2 ? C.cyan : C.magenta;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(ox, oy, 2, 2);
      ctx.globalAlpha = 1;
    }
  }
}
