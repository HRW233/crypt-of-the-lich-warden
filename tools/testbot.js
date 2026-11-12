/* ------------------------------------------------------------------ *
 * testbot.js - the balance-test bot
 *
 * Injected into a running game page (it is not part of the build) and
 * driven from a benchmark loop:
 *
 *   const txt = await (await fetch('/tools/testbot.js')).text();
 *   new Function(txt)();
 *   BOT.reset(0); BOT.startBoss(4); for (..) BOT.step();
 *
 * The bot reads only public game state and presses the same inputs a
 * player would: WASD, the left mouse button aimed at the cursor, and the
 * space bar to dash.
 *
 * Dodging is done by sampling: every frame it scores a ring of candidate
 * directions by how dangerous they are over the next ~0.45 s (bullet
 * closest-approach, boss beams, enemy bodies, arena walls) and how well
 * they hold its preferred range from the target, then walks the best one.
 * It dashes when a hit is about to land or when every direction is bad.
 * ------------------------------------------------------------------ */

(function () {
  'use strict';

  const RANGE = {
    mage: 100, wizard: 105, sniper: 150, knight: 26, pyromancer: 55, cryomancer: 100,
  };
  const HORIZON = 0.45;      // seconds of bullet travel the bot worries about
  const LOOKAHEAD = 0.2;     // seconds of its own movement it scores per candidate
  const PROBE = 12;          // wall margin it tries to keep
  const DIRS = [];
  for (let i = 0; i < 16; i++) DIRS.push([Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);

  const BOT = {
    game: null,
    char: 'mage',
    target: null,
    dashT: 0,

    init(game) {
      this.game = game;
      return this;
    },

    /* ---- setup helpers ---- */

    reset(charIndex) {
      const g = this.game;
      g.state = 'title';
      g.setChar(charIndex);
      g.diffIndex = 1;
      g.startRun();
      g.roomBanner = null;
      g.bossIntro = null;
      this.char = g.player.char;
      this.dashT = 0;
      return g.player;
    },

    centerPlayer(x, y) {
      const p = this.game.player;
      p.x = x === undefined ? 256 : x;
      p.y = y === undefined ? 246 : y;
      return p;
    },

    /* ---- inputs ---- */

    aimAt(x, y) {
      const g = this.game;
      const r = g.canvas.getBoundingClientRect();
      g.input.mouse.clientX = r.left + r.width * (x / 512);
      g.input.mouse.clientY = r.top + r.height * (y / 288);
    },

    pressKeys(mx, my) {
      const keys = this.game.input.keys;
      keys.clear();
      if (mx > 0.35) keys.add('d');
      else if (mx < -0.35) keys.add('a');
      if (my > 0.35) keys.add('s');
      else if (my < -0.35) keys.add('w');
    },

    dash() {
      // the dash reads a one-shot key press
      this.game.input.just.add('space');
    },

    /* ---- threat model ---- */

    /* How badly a point is menaced over the next HORIZON seconds.
       Higher is worse; roughly "expected hits". */
    dangerAt(x, y, p) {
      const g = this.game;
      let danger = 0;

      // hostile bullets: closest approach of each one to this point
      const bullets = g.bullets.active;
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b.active || b.friendly) continue;
        const dx = b.x - x;
        const dy = b.y - y;
        const vx = b.vx || 0;
        const vy = b.vy || 0;
        const vv = vx * vx + vy * vy;
        let t = 0;
        if (vv > 1) t = -(dx * vx + dy * vy) / vv;
        if (t < 0) t = 0;
        else if (t > HORIZON) t = HORIZON;
        const mx = dx + vx * t;
        const my = dy + vy * t;
        const miss = Math.sqrt(mx * mx + my * my);
        const hitR = (b.r || 3) + p.r + 2;
        if (miss < hitR) {
          // the sooner and the more central, the worse
          const closeness = 1 - miss / hitR;
          const urgency = 1 - t / HORIZON;
          danger += 1.6 * closeness + 2.2 * closeness * urgency;
        } else if (miss < hitR * 3) {
          danger += 0.12 * (1 - miss / (hitR * 3));
        }
      }

      // boss beams: a tracking beam sweeps, so score where it will POINT when
      // it fires, not where it points now
      const beams = g.beams;
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        if (!b) continue;
        let ang = b.angle;
        const charging = b.state === 'charge';
        const chargeLeft = charging ? Math.max(0, (b.charge || 0.9) - b.t) : 0;
        if (charging && b.track > 0) {
          const want = Math.atan2(y - b.y, x - b.x);
          let diff = ((want - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          const lim = b.track * chargeLeft;
          ang += Math.max(-lim, Math.min(lim, diff));
        }
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const px = x - b.x;
        const py = y - b.y;
        const proj = Math.max(0, Math.min(b.len, px * ux + py * uy));
        const off = Math.hypot(px - ux * proj, py - uy * proj);
        // a beam still sweeping needs more clearance than one already locked
        const sweepPad = charging ? Math.abs((b.track || 0) * chargeLeft) * b.len * 0.5 : 0;
        const halfW = (b.width || 8) * 0.5 + p.r + 3 + Math.min(26, sweepPad);
        const charge = charging ? Math.min(1, b.t / Math.max(0.01, b.charge || 0.9)) : 1;
        if (off < halfW) danger += 2.4 + 3 * charge;
        else if (off < halfW * 3) danger += 0.5 * (1 - off / (halfW * 3));
      }

      // enemy bodies hurt on contact
      const enemies = g.enemies;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead || e.spawnT > 0) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        const body = e.r + p.r + 12;
        if (d < body) danger += 2.6 * (1 - d / body);
      }

      // don't get cornered
      const m = Math.min(x - PROBE, 512 - PROBE - x, y - PROBE, 288 - PROBE - y);
      if (m < 0) danger += 4 * (-m) / PROBE;
      else if (m < 24) danger += 0.35 * (1 - m / 24);

      return danger;
    },

    /* Is a hit about to land on the player, soon enough that only a dash
       (which grants i-frames) can beat it? */
    imminentHit(p) {
      const g = this.game;
      const bullets = g.bullets.active;
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b.active || b.friendly) continue;
        const vx = b.vx || 0;
        const vy = b.vy || 0;
        const vv = vx * vx + vy * vy;
        if (vv < 1) continue;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        let t = -(dx * vx + dy * vy) / vv;
        if (t < 0 || t > 0.16) continue;
        // homing rounds bend, so give them a wider berth
        const pad = (b.r || 3) + p.r + (b.turn > 0 || b.homing > 0 ? 8 : 3);
        const mx = dx + vx * t;
        const my = dy + vy * t;
        if (mx * mx + my * my <= pad * pad) return true;
      }
      const beams = g.beams;
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        if (!b) continue;
        const ux = Math.cos(b.angle);
        const uy = Math.sin(b.angle);
        const px = p.x - b.x;
        const py = p.y - b.y;
        const proj = Math.max(0, Math.min(b.len, px * ux + py * uy));
        const off = Math.hypot(px - ux * proj, py - uy * proj);
        const halfW = (b.width || 8) * 0.5 + p.r + 3;
        if (off < halfW && (b.state === 'active' ? b.t < b.active - 0.02 : b.t > (b.charge || 0.9) - 0.12)) return true;
      }
      return false;
    },

    /* ---- main step ---- */

    step() {
      const g = this.game;
      const p = g.player;
      if (!p || !p.alive) return 'dead';
      if (g.state === 'upgrade') { g.chooseUpgrade(0); return 'upgrade'; }
      if (g.state === 'paused' || g.state === 'spellbook') { g.state = 'playing'; return 'resume'; }
      if (g.state !== 'playing') return g.state;

      // 1. target: nearest live enemy
      let target = null;
      let best = 1e9;
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        if (e.dead || e.spawnT > 0) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < best) { best = d; target = e; }
      }
      if (!target) {
        g.input.mouse.down = false;
        g.input.keys.clear();
        g.update(1 / 60);
        // anything still materialising keeps the round alive; a truly empty
        // room is cleared
        return g.enemies.some((e) => !e.dead) ? 'wait' : 'clear';
      }
      this.aimAt(target.x, target.y);

      // 2. pick a direction
      const want = RANGE[this.char] || 100;
      const reach = p.speed * LOOKAHEAD;
      const here = this.dangerAt(p.x, p.y, p);
      let bestDir = null;
      let bestScore = 1e9;
      let bestDanger = 1e9;
      // two step lengths: a short hop can thread a gap a full stride cannot
      const STEPS = [reach * 0.55, reach];
      for (let i = 0; i < DIRS.length * STEPS.length; i++) {
        const [ux, uy] = DIRS[i % DIRS.length];
        const stepLen = STEPS[(i / DIRS.length) | 0];
        const cx = p.x + ux * stepLen;
        const cy = p.y + uy * stepLen;
        const danger = this.dangerAt(cx, cy, p);
        const d = Math.hypot(cx - target.x, cy - target.y);
        const rangeCost = Math.abs(d - want) / 90;
        // a small bias for sideways motion: orbiting beats running straight in
        const towardX = (p.x - target.x) / Math.max(1, best);
        const towardY = (p.y - target.y) / Math.max(1, best);
        const orbit = 1 - Math.abs(ux * towardX + uy * towardY) * 0.5;
        const score = danger * 3 + rangeCost - orbit * 0.25;
        if (score < bestScore) { bestScore = score; bestDir = [ux, uy]; bestDanger = danger; }
      }

      // 3. dash out of a hit the walk cannot clear
      this.dashT = Math.max(0, this.dashT - 1 / 60);
      const cornered = bestDanger > 1.1;
      const aboutToBeHit = this.imminentHit(p);
      if ((aboutToBeHit || cornered) && p.dashChargesLeft > 0 && this.dashT <= 0 && p.dashTime <= 0) {
        // dash along the chosen escape direction
        this.pressKeys(bestDir[0], bestDir[1]);
        this.dash();
        this.dashT = 0.45;
      } else if (bestDir) {
        this.pressKeys(bestDir[0], bestDir[1]);
      }

      g.input.mouse.down = true;
      g.update(1 / 60);
      return 'ok';
    },

    /* ---- scenarios ---- */

    startArena() {
      const g = this.game;
      const p = g.player;
      g.enemies.length = 0;
      g.bullets.clear();
      const types = ['acolyte', 'acolyte', 'acolyte', 'archer', 'archer', 'acolyte', 'acolyte', 'acolyte'];
      types.forEach((t, i) => {
        const a = (i / types.length) * Math.PI * 2;
        const e = makeEnemy(t, p.x + Math.cos(a) * 125, p.y + Math.sin(a) * 92);
        e.spawnT = 0;
        g.enemies.push(e);
      });
      g.currentRoom.enemies = g.enemies;
      return g.enemies;
    },

    startBoss(floorN) {
      const g = this.game;
      const room = g.currentRoom;
      room.type = 'boss';
      room.cleared = false;
      room.bossSpawned = false;
      room.enemies.length = 0;
      room.floor = floorN;
      g.enterRoom(room, null);
      g.roomBanner = null;
      g.bossIntro = null;
      this.centerPlayer();
      return room.enemies.find((e) => e.isBoss);
    },

    /* Clear the fixed wave on `floorN`, scaling HP like the real dungeon. */
    fightWave(floorN, frameCap) {
      const g = this.game;
      const p = this.reset(g.charIndex);
      const enemies = this.startArena();
      if (floorN > 1) {
        for (const e of enemies) {
          e.maxHp = Math.round(e.maxHp * (1 + (floorN - 1) * 0.4));
          e.hp = e.maxHp;
        }
      }
      const hp0 = p.hp;
      const cap = frameCap || 2400;
      for (let i = 0; i < cap; i++) {
        const r = this.step();
        if (r === 'dead') return { died: 1, secs: null, hpLost: hp0 };
        if (r === 'clear') return { died: 0, secs: +((i + 1) / 60).toFixed(1), hpLost: +(hp0 - p.hp).toFixed(1) };
      }
      return { died: 0, secs: null, hpLost: +(hp0 - p.hp).toFixed(1) };
    },

    /* Survive or kill the floor boss; `capSecs` truncates the fight. */
    fightBoss(floorN, capSecs) {
      const g = this.game;
      const p = this.reset(g.charIndex);
      const boss = this.startBoss(floorN);
      const cap = Math.round((capSecs || 60) * 60);
      for (let i = 0; i < cap; i++) {
        const r = this.step();
        if (r === 'dead') {
          return { died: 1, killed: 0, secs: +(i / 60).toFixed(1), hpLeftPct: Math.round((boss.hp / boss.maxHp) * 100) };
        }
        if (r === 'clear') {
          return { died: 0, killed: 1, secs: +(i / 60).toFixed(1), hpLeftPct: 0 };
        }
      }
      return { died: 0, killed: 0, secs: capSecs || 60, hpLeftPct: Math.round((boss.hp / boss.maxHp) * 100) };
    },
  };

  window.BOT = BOT;
  if (window.game) BOT.init(window.game);
})();
