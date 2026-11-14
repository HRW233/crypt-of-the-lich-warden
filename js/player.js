'use strict';

/* ------------------------------------------------------------------ *
 * player.js - the player: movement, dash i-frames, firing, upgrades   *
 * ------------------------------------------------------------------ */

const PLAYER_COLORS = {
  robe: '#3b2f57',
  robeDark: '#2a2140',
  robeLight: '#56447d',
  hood: '#241d38',
  face: '#120e1d',
  trim: '#ffb703',
};

const MAX_RELICS = 4;
/* Cryomancer snowstorm: radius in pixels, damage tick and how hard it slows. */
const STORM_RADIUS = 66;
const STORM_TICK = 0.16;
const STORM_SLOW = 0.3;
const STORM_REACH = 128;

/* Embers take one of these on spawn so the stream is not one flat colour. */
const EMBER_COLORS = ['#ffd166', '#ff9b3d', '#ff6a2b', '#ff4d3d'];

const CHAR_STATS = {
  mage: {
    maxHp: 6, speed: 104, damage: 10, fireRate: 0.115, boltSpeed: 310,
    pierce: 0, crit: 0.02, critMult: 1.9, orbs: 0, manaMax: 0, manaRegen: 0, manaCost: 0,
    armor: 0,
  },
  wizard: {
    maxHp: 6, speed: 102, damage: 13, fireRate: 0.15, boltSpeed: 320,
    pierce: 0, crit: 0.02, critMult: 1.9, orbs: 1, manaMax: 100, manaRegen: 36, manaCost: 5,
    armor: 0,
  },
  sniper: {
    maxHp: 5, speed: 100, damage: 64, fireRate: 0.85, boltSpeed: 780,
    pierce: 2, crit: 0.15, critMult: 2.5, orbs: 0, manaMax: 0, manaRegen: 0, manaCost: 0,
    armor: 1,
  },
  knight: {
    maxHp: 7, speed: 116, damage: 28, fireRate: 0.34, boltSpeed: 300,
    pierce: 0, crit: 0.08, critMult: 2.2, orbs: 0, manaMax: 0, manaRegen: 0, manaCost: 0,
    armor: 3, armorRegen: 5, melee: 36,
  },
  /* A snowstorm instead of a gun: a chilled area that follows the cursor,
     grinds enemies down slowly and damps their bullets. */
  cryomancer: {
    maxHp: 6, speed: 103, damage: 9, fireRate: 0.0167, boltSpeed: 0,
    pierce: 0, crit: 0, critMult: 1.9, orbs: 0, manaMax: 0, manaRegen: 0, manaCost: 0,
    armor: 0, storm: 1,
  },
  /* A flamethrower: no cooldown to speak of, weak individual embers, and
     every hit stacks the burn until the target is cooking. */
  pyromancer: {
    maxHp: 7, speed: 100, damage: 6, fireRate: 0.0167, boltSpeed: 250,
    pierce: 0, crit: 0.05, critMult: 1.8, orbs: 0, manaMax: 0, manaRegen: 0, manaCost: 0,
    armor: 0, burn: 1,
  },
};

const CHAR_LIST = [
  { id: 'mage', name: 'MAGE', desc: ['BALANCED', 'ARCANE BOLTS'], color: C.gold },
  { id: 'wizard', name: 'WIZARD', desc: ['SPELL BOOK', 'MANA CASTER'], color: C.cyan },
  { id: 'sniper', name: 'SNIPER', desc: ['AMMO TYPES', 'HUGE DAMAGE'], color: '#9dc46a' },
  { id: 'knight', name: 'KNIGHT', desc: ['SWORD SWINGS', 'HEAVY ARMOR'], color: '#cfd6e2' },
  { id: 'pyromancer', name: 'PYROMANCER', desc: ['FLAMETHROWER', 'STACKING BURN'], color: '#ff7a3d' },
  { id: 'cryomancer', name: 'CRYOMANCER', desc: ['SNOWSTORM', 'SPELL BOOK'], color: '#7fe3ff' },
];

const CHAR_PALETTES = {
  mage: PLAYER_COLORS,
  wizard: { robe: '#27407a', robeDark: '#1a2b55', robeLight: '#3f63a8', hood: '#162444', face: '#0b1022', trim: '#7fd8ff' },
  sniper: { robe: '#3f4d2e', robeDark: '#2b3620', robeLight: '#5b6d3f', hood: '#222b18', face: '#0e120a', trim: '#9dc46a' },
  knight: { robe: '#5f6b7d', robeDark: '#3a4352', robeLight: '#8b93a6', hood: '#2b333f', face: '#0a0c11', trim: '#ffd166' },
  pyromancer: { robe: '#6b2a1e', robeDark: '#471c14', robeLight: '#94402a', hood: '#33150f', face: '#170a06', trim: '#ff9b3d' },
  cryomancer: { robe: '#2b4a6b', robeDark: '#1b3049', robeLight: '#416f96', hood: '#15243a', face: '#0a121c', trim: '#bff3ff' },
};

/* Wizard spells, chosen from the spell book (E). Each entry scales the
   caster's current stats, so relics keep improving every spell. */
const SPELLS = [
  {
    id: 'bolt', name: 'ARCANE BOLT', desc: ['FAST AND CHEAP', 'RELIABLE DAMAGE'],
    cost: 4.5, dmgMult: 1, rateMult: 1, speedMult: 1, shots: 1, spread: 0.13,
    size: 0, life: 1.3, pierce: 0, explosive: 0, shake: 0.3,
    color: '#7fd8ff', core: '#e9f8ff',
  },
  {
    id: 'lance', name: 'FROST LANCE', desc: ['HARD-HITTING SPIKE', 'PIERCES A ROW'],
    cost: 16, dmgMult: 2.5, rateMult: 2.9, speedMult: 1.7, shots: 1, spread: 0.02,
    size: 3, life: 1.7, pierce: 3, explosive: 0, shake: 0.9,
    color: '#b6f0ff', core: '#ffffff',
  },
  {
    id: 'void', name: 'VOID ORB', desc: ['SLOW, HUGE, PIERCING', 'DETONATES'],
    cost: 26, dmgMult: 3.6, rateMult: 4, speedMult: 0.5, shots: 1, spread: 0.02,
    size: 6, life: 2.2, pierce: 99, explosive: 1, shake: 1.4,
    color: '#c77dff', core: '#f0dcff',
  },
];

/* Sniper ammunition, cycled with Q. Every round still carries the full
   rifle damage; the type is what it does on impact. */
const AMMO_TYPES = [
  {
    id: 'standard', name: 'STANDARD', desc: 'PIERCING ROUND',
    color: '#c8ff9e', core: '#f2ffdf', dmgMult: 1,
  },
  {
    id: 'incendiary', name: 'INCENDIARY', desc: 'SETS THEM BURNING',
    color: '#ff7a3d', core: '#ffe0b0', dmgMult: 1, burn: 1,
  },
  {
    id: 'cryo', name: 'SUB ZERO', desc: 'FREEZES ON HIT',
    color: '#7fe3ff', core: '#eafcff', dmgMult: 1, freeze: 1,
  },
  {
    id: 'explosive', name: 'EXPLOSIVE', desc: 'AOE ON IMPACT',
    color: '#ffcf4a', core: '#fff6d6', dmgMult: 0.85, boom: 1,
  },
];

/* Cryomancer spell book (E), cast with Q. One controls where bullets go,
   the other keeps them off you. */
const CRYO_SPELLS = [
  {
    id: 'well', name: 'SNOWSTORM',
    desc: ['FLINGS EVERY BULLET', 'TO THE ARENA CENTRE'],
    cd: 9, color: '#7fe3ff',
  },
  {
    id: 'infinity', name: 'SNOW FOREST',
    desc: ['ALWAYS ON: SLOWS WHAT', 'COMES CLOSE, FIRES A BOLT'],
    passive: true, boltCd: 3.5, color: '#bff3ff',
  },
];
const INFINITY_RADIUS = 76; // where the field starts to bite
const INFINITY_CORE = 18;   // inside this a bullet is all but stopped

class Player {
  constructor(x, y, char) {
    this.x = x;
    this.y = y;
    this.r = 4; // true collision radius, far smaller than the sprite
    this.speed = 104;
    this.baseSpeed = 104;
    this.maxHp = 5;
    this.hp = 5;
    this.alive = true;

    this.aim = 0;
    this.facing = 1;
    this.fireCd = 0;
    this.fireRate = 0.125;
    this.damage = 9;
    this.extraShots = 0;
    this.pierce = 0;
    this.orbs = 0;
    this.orbAngle = 0;
    this.orbPos = [];
    this.lifesteal = 0;
    this.kills = 0;
    this.grazes = 0;
    this.ricochet = 0;
    this.berserk = false;
    this.regen = 0;
    this.greed = 1;
    this.boltSpeed = 310;
    this.bonusArmor = 0; // permanent plates from armory chests
    this.meleeRange = 36;
    this.slashT = 0;
    this.slashDur = 0.2;
    this.slashAng = 0;
    this.armorTimer = 0;

    /* relic-driven fields (upgrades.js writes these) */
    this.crit = 0;
    this.critMult = 1.9;
    this.boltSize = 0;
    this.explosive = 0;
    this.chain = 0;
    this.homing = 0;
    this.cluster = false;
    this.thorns = 0;
    this.iFrameBonus = 0;
    this.dashCharges = 1;
    this.dashChargesLeft = 1;
    this.dashBlast = 0;
    this.evasion = 0;
    this.grazeHeal = 0;
    this.grazeCount = 0;
    this.magnet = 48;
    this.choiceBonus = 0;
    this.dropBonus = 0;
    this.overcharge = 0;
    this.shotCount = 0;
    this.vamp = false;
    this.perfect = false;
    this.focus = 0;
    this.momentum = 0;
    this.executioner = 0;
    this.freezeOnHit = 0;
    this.chillMul = 1;
    this.chillTime = 0;
    this.shatter = 0;
    this.bounty = 0;
    this.aegis = 0;
    this.aegisReady = true;
    this.orbDamage = 7;
    this.orbSpeed = 2.7;
    this.damageTaken = 0;

    this.invuln = 0;
    this.hurtFlash = 0;
    this.dashTime = 0;
    this.dashDuration = 0.17;
    this.dashSpeed = 330;
    this.dashCd = 0;
    this.dashCdMax = 1.05;
    this.dashDirX = 1;
    this.dashDirY = 0;
    this.trail = [];

    this.animT = 0;
    this.moving = false;
    this.recoil = 0;
    this.ghostT = 0;

    this.char = char && CHAR_STATS[char] ? char : 'mage';
    this.heat = 0; // flamethrower build-up, drives the cone and the screen glow
    this.stormT = 0; // snowstorm visibility, refreshed every frame it is held
    this.stormX = x;
    this.stormY = y;
    this.stormTick = 0;
    this.spell = 0;
    this.cryoSpell = 0;
    this.cryoCd = 0;
    this.cryoCdMax = 0;
    this.cryoBoltT = 0;
    this.ammo = 0;
    this.relics = [];
    this.chains = []; // per-slot relic ids; an upgraded slot keeps the tiers below
    this.stacks = {};
    this.applyBase();
    this.hp = this.maxHp;
    this.mana = this.manaMax;
    this.armor = this.armorMax;
    this.armorTimer = 0;
  }

  /* Reset every relic-modifiable stat to this character's base values. */
  applyBase() {
    const b = CHAR_STATS[this.char] || CHAR_STATS.mage;
    this.baseSpeed = b.speed;
    this.speed = b.speed;
    this.maxHp = b.maxHp;
    this.damage = b.damage;
    this.fireRate = b.fireRate;
    this.boltSpeed = b.boltSpeed;
    this.pierce = b.pierce;
    this.extraShots = 0;
    this.ricochet = 0;
    this.crit = b.crit;
    this.critMult = b.critMult;
    this.boltSize = 0;
    this.homing = 0;
    this.explosive = 0;
    this.chain = 0;
    this.burnShot = b.burn || 0;
    this.burnOnHit = 0; // relics that make every hit ignite
    this.burnRateMul = 1; // relics that make the burn tick faster
    this.burnTime = 0;
    this.burnSpread = 0;
    this.freezeOnHit = 0; // relics that make every hit chill
    this.chillMul = 1; // how hard a chill bites
    this.chillTime = 0; // how long it lingers
    this.shatter = 0; // bonus damage against chilled foes
    this.cluster = false;
    this.orbs = b.orbs;
    this.orbDamage = 7;
    this.orbSpeed = 2.7;
    this.lifesteal = 0;
    this.regen = 0;
    this.greed = 1;
    this.berserk = false;
    this.dashCdMax = 1.05;
    this.dashDuration = 0.17;
    this.dashCharges = 1;
    this.iFrameBonus = 0;
    this.dashBlast = 0;
    this.evasion = 0;
    this.aegis = 0;
    this.aegisReady = true;
    this.thorns = 0;
    this.grazeHeal = 0;
    this.magnet = 48;
    this.choiceBonus = 0;
    this.dropBonus = 0;
    this.overcharge = 0;
    this.vamp = false;
    this.perfect = false;
    this.focus = 0;
    this.momentum = 0;
    this.executioner = 0;
    this.freezeOnHit = 0;
    this.chillMul = 1;
    this.chillTime = 0;
    this.shatter = 0;
    this.bounty = 0;
    this.manaMax = b.manaMax;
    this.manaRegen = b.manaRegen;
    this.manaCost = b.manaCost;
    this.armorMax = (b.armor || 0) + (this.bonusArmor || 0);
    this.armorRegen = b.armorRegen || 8;
    this.meleeRange = b.melee || 36;
    this.surge = false;
  }

  /* Rebuild stats from the four held relics, keeping the health ratio. */
  recompute() {
    const frac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    const charges = this.dashChargesLeft === undefined ? this.dashCharges : this.dashChargesLeft;
    const prevArmorMax = this.armorMax || 0;
    const prevArmor = this.armor || 0;
    this.applyBase();
    for (let i = 0; i < this.relics.length; i++) {
      const chain = (this.chains && this.chains[i]) || [this.relics[i]];
      for (let k = 0; k < chain.length; k++) {
        const r = RELIC_BY_ID.get(chain[k]);
        if (r) r.apply(this);
      }
    }
    this.maxHp = Math.max(1, this.maxHp);
    this.hp = clamp(Math.round(frac * this.maxHp), 1, this.maxHp);
    this.manaMax = Math.max(0, this.manaMax);
    this.mana = clamp(this.mana === undefined ? this.manaMax : this.mana, 0, this.manaMax);
    this.dashCharges = Math.max(1, this.dashCharges);
    this.dashChargesLeft = clamp(charges, 0, this.dashCharges);
    this.aegisReady = this.aegis > 0;
    this.armorMax = Math.max(0, this.armorMax);
    this.armor = clamp(prevArmor + Math.max(0, this.armorMax - prevArmorMax), 0, this.armorMax);
    this.spell = clamp(this.spell | 0, 0, SPELLS.length - 1);
    this.cryoSpell = clamp(this.cryoSpell | 0, 0, CRYO_SPELLS.length - 1);
  }

  spellDef() {
    if (this.char !== 'wizard') return null;
    return SPELLS[clamp(this.spell | 0, 0, SPELLS.length - 1)];
  }

  ammoDef() {
    if (this.char !== 'sniper') return null;
    return AMMO_TYPES[clamp(this.ammo | 0, 0, AMMO_TYPES.length - 1)];
  }

  cycleAmmo() {
    if (this.char !== 'sniper') return null;
    this.ammo = ((this.ammo | 0) + 1) % AMMO_TYPES.length;
    return this.ammoDef();
  }

  castCost() {
    const sp = this.spellDef();
    if (!sp) return this.manaCost;
    return sp.cost * (this.manaCost / CHAR_STATS.wizard.manaCost);
  }

  addRelic(relic) {
    if (!this.chains) this.chains = [];
    let removed = null;
    if (this.relics.length >= MAX_RELICS) {
      removed = this.relics.shift();
      delete this.stacks[removed];
      this.chains.shift();
    }
    this.relics.push(relic.id);
    this.chains.push([relic.id]);
    this.stacks[relic.id] = (this.stacks[relic.id] || 0) + 1;
    this.recompute();
    return removed;
  }

  /* Swap a held relic out for a new one, keeping the chosen slot. */
  swapRelic(index, relic) {
    if (index < 0 || index >= this.relics.length) return this.addRelic(relic);
    if (!this.chains) this.chains = [];
    const removed = this.relics[index];
    delete this.stacks[removed];
    this.relics[index] = relic.id;
    this.chains[index] = [relic.id];
    this.stacks[relic.id] = (this.stacks[relic.id] || 0) + 1;
    this.recompute();
    return removed;
  }

  /* Raises one held relic to its next tier, stacking it on the tiers below
     so the slot ends up stronger than either alone. */
  upgradeSlot(index, relic) {
    if (index < 0 || index >= this.relics.length) return false;
    if (!this.chains) this.chains = [];
    const chain = this.chains[index] || (this.chains[index] = [this.relics[index]]);
    const prev = this.relics[index];
    // the lower tiers stay held (and stay out of the draft pool)
    this.stacks[prev] = Math.max(1, this.stacks[prev] || 0);
    chain.push(relic.id);
    this.relics[index] = relic.id;
    this.stacks[relic.id] = 1;
    this.recompute();
    return true;
  }

  canBeHit() {
    return this.alive && this.invuln <= 0 && this.dashTime <= 0;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  hurt(amount, game) {
    if (!this.canBeHit()) return;
    if (this.evasion > 0 && Math.random() < this.evasion) {
      this.invuln = Math.max(this.invuln, 0.28);
      game.particles.float(this.x, this.y - 16, 'DODGE', C.cyan, 1);
      game.particles.ring(this.x, this.y, 8, 4, { color: C.cyan, speed: 60, life: 0.25 });
      return;
    }
    if (this.aegis > 0 && this.aegisReady) {
      this.aegisReady = false;
      this.invuln = Math.max(this.invuln, 0.85);
      game.sound.select();
      game.shake = Math.min(8, game.shake + 3);
      game.particles.ring(this.x, this.y, 16, 8, { color: C.cyan, speed: 90, life: 0.4 });
      game.particles.float(this.x, this.y - 18, 'AEGIS BLOCK', C.cyan, 1);
      return;
    }
    // armor plates soak damage point for point before hearts are touched
    let incoming = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, incoming);
      this.armor -= absorbed;
      incoming -= absorbed;
      this.armorTimer = 0;
      game.shake = Math.min(10, game.shake + 2);
      game.particles.ring(this.x, this.y, 13, 6, { color: '#9aa7b8', speed: 80, life: 0.3 });
      game.particles.float(this.x, this.y - 15, 'ARMOR -' + absorbed, '#9aa7b8', 1);
      game.sound.tone(180, 120, 0.12, 'square', 0.05);
      if (incoming <= 0) {
        this.invuln = Math.max(this.invuln, 0.45);
        this.hurtFlash = 0.2;
        return;
      }
    }

    this.hp -= incoming;
    this.damageTaken += incoming;
    this.invuln = 0.9;
    this.hurtFlash = 0.25;
    game.shake = Math.min(10, game.shake + 7);
    game.hitstop = Math.max(game.hitstop, 0.05);
    game.sound.hurt();
    game.particles.burst(this.x, this.y, 14, {
      color: C.heart, speed: 130, life: 0.45, size: 2, drag: 0.86,
    });
    game.particles.float(this.x, this.y - 16, '-' + incoming, C.heart, 2);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.die(game);
    }
  }

  die(game) {
    game.particles.burst(this.x, this.y, 44, {
      color: C.cyan, speed: 180, life: 0.9, size: 2, drag: 0.9,
    });
    game.particles.burst(this.x, this.y, 20, {
      color: C.magenta, speed: 120, life: 0.7, size: 2,
    });
    game.shake = 12;
    game.onPlayerDeath(this);
  }

  instakill(game) {
    if (!this.alive) return;
    this.hp = 0;
    this.alive = false;
    game.shake = 16;
    game.flashAlpha = 1;
    game.particles.burst(this.x, this.y, 60, {
      color: C.magenta, speed: 220, life: 1.0, size: 2, drag: 0.9,
    });
    this.die(game);
  }

  update(dt, game) {
    const input = game.input;
    this.animT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.slashT = Math.max(0, this.slashT - dt);
    if (this.armor < this.armorMax) {
      this.armorTimer += dt;
      if (this.armorTimer >= Math.max(2.5, this.armorRegen)) {
        this.armorTimer = 0;
        this.armor++;
        game.particles.ring(this.x, this.y, 11, 4, { color: '#9aa7b8', speed: 45, life: 0.3 });
      }
    } else {
      this.armorTimer = 0;
    }
    if (this.manaMax > 0 && this.mana < this.manaMax) {
      this.mana = Math.min(this.manaMax, this.mana + this.manaRegen * dt);
    }
    if (this.dashChargesLeft < this.dashCharges) {
      this.dashCd = Math.max(0, this.dashCd - dt);
      if (this.dashCd <= 0) {
        this.dashChargesLeft++;
        this.dashCd = this.dashChargesLeft < this.dashCharges ? this.dashCdMax : 0;
      }
    } else {
      this.dashCd = 0;
    }
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.heat = Math.max(0, this.heat - dt * 2.4);
    this.cryoCd = Math.max(0, this.cryoCd - dt);

    if (!this.alive) return;

    const world = input.mouseWorld();
    this.aim = angleTo(this.x, this.y - 2, world.x, world.y);
    if (Math.abs(Math.cos(this.aim)) > 0.12) this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;

    // Snow Forest is a passive: the field is always up while it is equipped
    const passiveSpell = this.cryoSpellDef();
    if (this.char === 'cryomancer' && passiveSpell && passiveSpell.passive) {
      this.updateCryoPassive(dt, game, passiveSpell);
    }

    let ix = 0;
    let iy = 0;
    if (input.down('left') || input.down('a')) ix -= 1;
    if (input.down('right') || input.down('d')) ix += 1;
    if (input.down('up') || input.down('w')) iy -= 1;
    if (input.down('down') || input.down('s')) iy += 1;
    const len = Math.hypot(ix, iy);
    if (len > 0) {
      ix /= len;
      iy /= len;
    }
    this.moving = len > 0;

    // ---- dash ----
    const wantsDash = input.pressed('space') || input.mouse.rightPressed;
    if (wantsDash && this.dashChargesLeft > 0) {
      if (len > 0) {
        this.dashDirX = ix;
        this.dashDirY = iy;
      } else {
        this.dashDirX = Math.cos(this.aim);
        this.dashDirY = Math.sin(this.aim);
      }
      this.dashTime = this.dashDuration;
      this.dashChargesLeft--;
      this.dashCd = this.dashCdMax;
      if (this.iFrameBonus > 0) this.invuln = Math.max(this.invuln, this.iFrameBonus);
      this.trail.length = 0;
      this.ghostT = 0;
      if (game.onDash) game.onDash();
      game.sound.dash();
      game.particles.burst(this.x, this.y, 10, {
        color: C.cyan, speed: 90, life: 0.35, angle: Math.atan2(-this.dashDirY, -this.dashDirX), spread: 0.9,
      });
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const step = this.dashSpeed * dt;
      moveCircle(this, this.dashDirX * step, this.dashDirY * step, game.currentRoom);
      this.ghostT += dt;
      if (this.ghostT >= 0.018) {
        this.ghostT = 0;
        this.trail.push({ x: this.x, y: this.y, facing: this.facing, life: 0.26, maxLife: 0.26 });
        if (this.trail.length > 14) this.trail.shift();
      }
      if (Math.random() < 0.5) {
        game.particles.spawn(this.x - this.dashDirX * 5, this.y - this.dashDirY * 5, {
          vx: rand(-20, 20), vy: rand(-20, 20), life: 0.22, color: C.cyan, size: 1, additive: true,
        });
      }
    } else {
      const spd = this.speed;
      moveCircle(this, ix * spd * dt, iy * spd * dt, game.currentRoom);
    }

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    // ---- firing ----
    if (input.mouse.down && this.fireCd <= 0) this.fire(game);

    // the snowstorm only exists while the button is held, but keeps grinding
    // for the rest of the frame it was refreshed on
    if (this.stormT > 0) {
      this.stormT = Math.max(0, this.stormT - dt);
      this.updateStorm(dt, game);
    }

    this.updateOrbs(dt, game);
  }

  fire(game) {
    if (this.char === 'knight') {
      this.swing(game);
      return;
    }
    if (this.char === 'pyromancer') {
      this.flame(game);
      return;
    }
    if (this.char === 'cryomancer') {
      this.snowstorm(game);
      return;
    }
    const sp = this.spellDef();
    const cost = this.castCost();
    // the wizard casts from a mana pool: no mana, no spell
    if (this.manaMax > 0 && this.mana < cost) {
      this.fireCd = 0.1;
      return;
    }
    if (this.manaMax > 0) this.mana -= cost;

    const berserk = this.berserk && this.hp <= 1;
    let rate = sp ? this.fireRate * sp.rateMult : this.fireRate;
    if (berserk) rate *= 0.55;
    if (this.momentum > 0 && this.moving) rate *= 1 - Math.min(0.5, this.momentum);
    this.fireCd = rate;

    const sniper = this.char === 'sniper';
    const ammo = sniper ? AMMO_TYPES[clamp(this.ammo | 0, 0, AMMO_TYPES.length - 1)] : null;
    let dmg = this.damage * (sp ? sp.dmgMult : 1) * (ammo ? ammo.dmgMult : 1);
    if (this.perfect && this.hp >= this.maxHp) dmg *= 1.3;
    if (this.focus > 0 && !this.moving) dmg *= 1 + this.focus;
    if (this.surge && this.manaMax > 0 && this.mana < this.manaMax * 0.3) dmg *= 1.4;
    this.shotCount++;
    const over = this.overcharge > 0 && this.shotCount % 6 === 0;
    if (over) dmg *= 3;

    const shots = (sp ? sp.shots : 1) + this.extraShots;
    const spread = sp ? sp.spread : sniper ? 0.05 : 0.13;
    const mx = this.x + Math.cos(this.aim) * 7;
    const my = this.y + Math.sin(this.aim) * 7 - 2;
    const speed = this.boltSpeed * (sp ? sp.speedMult : 1);
    const size = (sniper ? 8 : 5) + this.boltSize * 2 + (sp ? sp.size : 0);
    const life = sp ? sp.life : sniper ? 2.0 : 1.3;
    const flame = this.char === 'pyromancer';
    const baseCol = ammo ? ammo.color : sniper ? '#c8ff9e' : sp ? sp.color : flame ? '#ff7a3d' : C.gold;
    const coreCol = ammo ? ammo.core : sniper ? '#f2ffdf' : sp ? sp.core : flame ? '#ffe0b0' : '#fff6d6';
    for (let i = 0; i < shots; i++) {
      const off = (i - (shots - 1) / 2) * spread;
      const crit = this.crit > 0 && Math.random() < this.crit;
      const d = crit ? dmg * this.critMult : dmg;
      game.bullets.spawnFriendly(mx, my, this.aim + off, speed, Math.max(1, Math.round(d)), {
        pierce: this.pierce + (sp ? sp.pierce : 0),
        bounces: this.ricochet,
        life: life,
        w: size,
        h: size,
        r: crit ? (sniper ? 7 : 4) : (sniper ? 6 : 3),
        color: over ? C.magenta : crit ? C.white : baseCol,
        core: crit ? '#ffffff' : coreCol,
        homing: this.homing > 0 ? 1.5 + this.homing * 1.5 : 0,
        explosive: this.explosive + (sp ? sp.explosive : 0) + (ammo && ammo.boom ? 1 : 0),
        burn: Math.min(1, (ammo && ammo.burn ? 1 : 0) + this.burnShot + this.burnOnHit),
        burnSniper: !!(ammo && ammo.burn),
        freeze: Math.min(1, (ammo && ammo.freeze ? 1 : 0) + (this.freezeOnHit || 0)),
        chain: this.chain,
        cluster: this.cluster,
        crit,
      });
    }
    this.recoil = 1;
    game.sound.shoot();
    game.particles.burst(mx, my, sniper ? 9 : 3, {
      color: over ? C.magenta : baseCol,
      speed: sniper ? 140 : 80, life: sniper ? 0.3 : 0.18,
      angle: this.aim, spread: sniper ? 0.25 : 0.55, size: sniper ? 2 : 1,
    });
    const kick = sp ? sp.shake : sniper ? 2.4 : 0.3;
    game.shake = Math.min(sniper ? 7 : 3, game.shake + kick);
  }

  /* Flamethrower: a stream, not a shot. Each ember is weak and dies almost
     at once, but landing hits stack the burn, so holding the trigger on a
     target is what kills it. */
  flame(game) {
    this.fireCd = 0; // a stream, not a shot: it never waits
    this.shotCount++;
    const over = this.overcharge > 0 && this.shotCount % 6 === 0;

    let base = this.damage * 0.3;
    if (this.perfect && this.hp >= this.maxHp) base *= 1.3;
    if (this.focus > 0 && !this.moving) base *= 1 + this.focus;
    if (over) base *= 3;

    const n = 1 + this.extraShots;
    const mx = this.x + Math.cos(this.aim) * 6;
    const my = this.y + Math.sin(this.aim) * 6 - 2;
    for (let i = 0; i < n; i++) {
      const crit = this.crit > 0 && Math.random() < this.crit;
      const off = rand(-0.2, 0.2) + (i - (n - 1) / 2) * 0.13;
      const dmg = Math.max(1, Math.round(crit ? base * this.critMult : base));
      game.bullets.spawnFriendly(mx, my, this.aim + off, this.boltSpeed * rand(0.8, 1.15), dmg, {
        pierce: 0,
        bounces: 0,
        life: rand(0.32, 0.44),
        w: 4 + ((Math.random() * 3) | 0) + this.boltSize * 2,
        h: 4 + ((Math.random() * 3) | 0) + this.boltSize * 2,
        r: 2,
        color: over ? C.magenta : crit ? '#ffe9a8' : EMBER_COLORS[(Math.random() * EMBER_COLORS.length) | 0],
        core: crit ? '#ffffff' : '#ffe0a8',
        explosive: this.explosive,
        chain: this.chain,
        cluster: this.cluster,
        burn: 1,
        burnStack: true,
        crit,
      });
    }
    this.recoil = 1;
    this.heat = Math.min(1, this.heat + 0.16);
    if (this.shotCount % 3 === 0) game.sound.tone(rand(120, 180), 70, 0.05, 'sawtooth', 0.02);
    game.particles.burst(mx, my, 2, {
      color: Math.random() < 0.5 ? '#ffb347' : '#ff7a3d',
      speed: 90, life: 0.22, angle: this.aim, spread: 0.55, size: 1, additive: true,
    });
    game.shake = Math.min(2, game.shake + 0.12);
  }

  /* ---------------- cryomancer spell book ---------------- */

  cryoSpellDef() {
    if (this.char !== 'cryomancer') return null;
    return CRYO_SPELLS[clamp(this.cryoSpell | 0, 0, CRYO_SPELLS.length - 1)];
  }

  castCryoSpell(game) {
    const sp = this.cryoSpellDef();
    if (!sp || !this.alive) return false;
    if (sp.passive) {
      game.toast = { text: sp.name + ' IS ALWAYS ON', t: 1.2 };
      return false;
    }
    if (this.cryoCd > 0) {
      game.sound.tone(220, 160, 0.06, 'square', 0.03);
      return false;
    }
    this.cryoCdMax = sp.cd;
    this.cryoCd = sp.cd;
    if (sp.id === 'well') this.castWell(game);
    game.toast = { text: sp.name, t: 1.2 };
    return true;
  }

  /* Gravity well: every hostile bullet is yanked onto a line to the middle
     of the arena, so a wall of shots leaves you an opening. */
  castWell(game) {
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const live = game.bullets && game.bullets.active;
    if (live) {
      for (let i = 0; i < live.length; i++) {
        const b = live[i];
        if (!b.active || b.friendly) continue;
        const sp = Math.max(215, Math.hypot(b.vx, b.vy));
        const a = Math.atan2(cy - b.y, cx - b.x);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
        // nothing keeps steering once the pull has hold of it
        b.turn = 0;
        b.homing = 0;
        b.ax = 0;
        b.ay = 0;
      }
    }
    game.particles.ring(cx, cy, 20, 16, { color: '#7fe3ff', speed: 210, life: 0.6 });
    game.particles.ring(cx, cy, 44, 10, { color: '#bff3ff', speed: 120, life: 0.75 });
    game.particles.burst(this.x, this.y, 14, { color: '#bff3ff', speed: 130, life: 0.4, size: 1 });
    game.shake = Math.max(game.shake, 6);
    game.hitstop = Math.max(game.hitstop, 0.04);
    game.sound.tone(140, 640, 0.32, 'sawtooth', 0.06);
  }

  /* The passive side of Snow Forest: the field keeps running, and one slow
     frost bolt leaves down the aim line on its own timer. */
  updateCryoPassive(dt, game, sp) {
    this.infinityAura(dt, game);
    this.cryoBoltT -= dt;
    if (this.cryoBoltT <= 0) {
      this.cryoBoltT = sp.boltCd || 3.5;
      this.fireFrostBolt(game);
    }
  }

  fireFrostBolt(game) {
    game.bullets.spawnFriendly(this.x, this.y - 2, this.aim, 165, Math.max(1, Math.round(this.damage * 0.9)), {
      r: 4, w: 7, h: 7, life: 2.4, pierce: 0, freeze: 1,
      color: '#bff3ff', core: '#ffffff',
    });
    game.particles.burst(this.x, this.y - 2, 5, {
      color: '#bff3ff', speed: 60, life: 0.28, angle: this.aim, spread: 0.5, size: 1, additive: true,
    });
    game.sound.tone(880, 1320, 0.08, 'sine', 0.03);
  }

  /* Infinity: the field bites harder the closer a thing gets. At the core a
     bullet is close to frozen, so shots stall just short of you. */
  infinityAura(dt, game) {
    const live = game.bullets && game.bullets.active;
    if (live) {
      for (let i = 0; i < live.length; i++) {
        const b = live[i];
        if (!b.active || b.friendly) continue;
        const d = Math.hypot(b.x - this.x, b.y - this.y);
        if (d > INFINITY_RADIUS) continue;
        const t = clamp((d - INFINITY_CORE) / (INFINITY_RADIUS - INFINITY_CORE), 0, 1);
        const rate = 1.1 + 8.4 * (1 - t) * (1 - t);
        const damp = Math.max(0, 1 - rate * dt);
        b.vx *= damp;
        b.vy *= damp;
        if (Math.random() < 0.1) {
          game.particles.burst(b.x, b.y, 1, { color: '#bff3ff', speed: 26, life: 0.22, size: 1 });
        }
      }
    }
    // bodies slow too: they crawl at the edge and barely move in the core
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.dead || e.spawnT > 0 || e.isBoss) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > INFINITY_RADIUS) continue;
      const t = clamp((d - INFINITY_CORE) / (INFINITY_RADIUS - INFINITY_CORE), 0, 1);
      e.slowT = Math.max(e.slowT, 0.2);
      e.slowMul = Math.min(e.slowMul || 1, 0.25 + 0.6 * t);
    }
  }

  drawInfinity(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y - 2);
    const t = this.animT;
    const fade = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const rr = INFINITY_RADIUS * (0.34 + i * 0.22);
      ctx.globalAlpha = (0.045 + i * 0.03) * fade;
      ctx.fillStyle = '#7fe3ff';
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.6 * fade;
    ctx.strokeStyle = '#bff3ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, INFINITY_CORE + Math.sin(t * 4) * 1.5, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.22 * fade;
    ctx.beginPath();
    ctx.arc(x, y, INFINITY_RADIUS - 1 + Math.sin(t * 2.3) * 2, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = t * (0.8 + (i % 3) * 0.5) + (i / 10) * TAU;
      const rr = INFINITY_RADIUS * (0.4 + ((i * 29) % 50) / 100);
      ctx.globalAlpha = (0.32 + Math.sin(a * 3) * 0.18) * fade;
      ctx.fillStyle = i % 2 ? '#bff3ff' : '#7fe3ff';
      ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), 1, 1);
    }
    ctx.restore();
  }

  /* Snowstorm: an area centred on the cursor that chills enemies, grinds them
     down a little at a time, and damps hostile bullets that pass through it. */
  snowstorm(game) {
    this.fireCd = 0; // held, not fired
    const world = game.input.mouseWorld();
    const dx = world.x - this.x;
    const dy = world.y - this.y;
    const d = Math.hypot(dx, dy);
    const k = d > STORM_REACH ? STORM_REACH / d : 1;
    this.stormX = this.x + dx * k;
    this.stormY = this.y + dy * k;
    this.stormT = 0.1;
    this.recoil = 0.4;
  }

  updateStorm(dt, game) {
    const r = STORM_RADIUS;
    this.stormTick += dt;
    const strike = this.stormTick >= STORM_TICK;
    if (strike) this.stormTick = 0;

    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      if (dist(e.x, e.y, this.stormX, this.stormY) > r + e.r) continue;
      e.slowT = Math.max(e.slowT, 0.55 * (1 + (this.chillTime || 0)));
      e.slowMul = Math.min(e.slowMul || 1, Math.max(0.1, STORM_SLOW / (this.chillMul || 1)));
      if (strike) {
        const dmg = Math.max(1, Math.round(this.damage * 0.5 * (1 + (this.shatter || 0))));
        e.hit(dmg, game);
        game.particles.float(e.x, e.y - e.r - 4, String(dmg), '#bff3ff', 1);
      }
    }

    // hostile bullets caught in the storm lose speed fast
    const live = game.bullets && game.bullets.active;
    if (live) {
      for (let i = 0; i < live.length; i++) {
        const b = live[i];
        if (!b.active || b.friendly) continue;
        if (dist(b.x, b.y, this.stormX, this.stormY) > r) continue;
        const damp = Math.max(0, 1 - 3.4 * dt);
        b.vx *= damp;
        b.vy *= damp;
        if (Math.random() < 0.12) {
          game.particles.burst(b.x, b.y, 1, { color: '#bff3ff', speed: 40, life: 0.25, size: 1 });
        }
      }
    }

    // a few drifting flakes so the storm reads as weather, not a bubble
    if (!game.lowFx && Math.random() < 0.55) {
      const a = Math.random() * TAU;
      const rr = Math.random() * r;
      game.particles.spawn(this.stormX + Math.cos(a) * rr, this.stormY + Math.sin(a) * rr, {
        vx: rand(-18, 18), vy: rand(-14, 14), life: rand(0.25, 0.5),
        color: Math.random() < 0.4 ? '#ffffff' : '#bff3ff', size: 1, additive: true,
      });
    }
  }

  drawStorm(ctx) {
    const sx = Math.round(this.stormX);
    const sy = Math.round(this.stormY);
    const r = STORM_RADIUS;
    const t = this.animT;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#7fe3ff';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#bff3ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r - 1 + Math.sin(t * 3.1) * 2, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const a = t * (1.5 + (i % 5) * 0.4) + (i / 16) * TAU;
      const rr = r * (0.2 + ((i * 37) % 74) / 100);
      const fx = Math.round(sx + Math.cos(a) * rr);
      const fy = Math.round(sy + Math.sin(a) * rr * 0.82);
      ctx.globalAlpha = 0.45 + Math.sin(a * 2) * 0.25;
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : '#bff3ff';
      ctx.fillRect(fx, fy, 1, 1);
    }
    ctx.restore();
  }

  /* Widening cone of fire drawn over the nozzle: three additive wedges with
     wobbling edges, so it licks like flame instead of reading as a cone decal. */
  drawFlameCone(ctx, x, y) {
    const heat = clamp(this.heat, 0, 1);
    const nx = Math.cos(this.aim);
    const ny = Math.sin(this.aim);
    const px = -ny;
    const py = nx;
    const ox = x + nx * 7;
    const oy = y - 2 + ny * 7;
    const flick = 0.86 + Math.sin(this.animT * 31) * 0.09 + Math.random() * 0.14;
    const len = (24 + 44 * heat) * flick;
    const half = 6 + 13 * heat;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // three nested bands of soft additive puffs: overlapping round blobs read
    // as fire, where a hard polygon would read as a decal
    const layers = [
      { l: len, h: half, col: 'rgba(255,72,16,0.14)' },
      { l: len * 0.74, h: half * 0.64, col: 'rgba(255,146,44,0.17)' },
      { l: len * 0.46, h: half * 0.36, col: 'rgba(255,236,168,0.19)' },
    ];
    const puffs = 9;
    for (let k = 0; k < layers.length; k++) {
      const L = layers[k];
      ctx.fillStyle = L.col;
      for (let i = 0; i < puffs; i++) {
        const t = i / (puffs - 1);
        const d = L.l * t;
        const r = (1.6 + L.h * Math.pow(t, 1.2)) * (0.85 + Math.random() * 0.32);
        const wob = 1 + t * 2.4;
        const jx = px * rand(-1, 1) * wob;
        const jy = py * rand(-1, 1) * wob;
        ctx.beginPath();
        ctx.arc(ox + nx * d + jx, oy + ny * d + jy, r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* Bats a hostile bullet back toward the closest enemy for sword damage. */
  parry(b, game) {
    const speed = Math.max(320, Math.hypot(b.vx, b.vy) * 1.4);
    let dir = this.aim;
    let best = null;
    let bd = 280 * 280;
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      const dd = (e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y);
      if (dd < bd) { bd = dd; best = e; }
    }
    if (best) dir = Math.atan2(best.y - b.y, best.x - b.x);

    b.friendly = true;
    b.damage = Math.max(4, Math.round(this.damage * 0.8));
    b.vx = Math.cos(dir) * speed;
    b.vy = Math.sin(dir) * speed;
    b.turn = 0;
    b.ax = 0;
    b.ay = 0;
    b.life = Math.max(0.9, b.life);
    b.pierce = Math.max(1, b.pierce | 0);
    b.bounces = Math.max(b.bounces, 0);
    b.hitSet = new Set();
    b.grazed = true;
    b.color = '#e8eef8';
    b.core = '#ffe9a8';
    b.halo = true;
    b.sprite = game.bullets._spriteFor(b);

    game.particles.burst(b.x, b.y, 7, { color: '#ffd166', speed: 120, life: 0.3, size: 1 });
    game.particles.ring(b.x, b.y, 9, 5, { color: '#e8eef8', speed: 90, life: 0.22 });
  }

  /* Melee arc: everything inside a wedge in front of the knight takes the hit. */
  swing(game) {
    const berserk = this.berserk && this.hp <= 1;
    let rate = this.fireRate;
    if (berserk) rate *= 0.55;
    if (this.momentum > 0 && this.moving) rate *= 1 - Math.min(0.5, this.momentum);
    this.fireCd = rate;
    this.slashT = this.slashDur;
    this.slashAng = this.aim;
    this.shotCount++;
    const over = this.overcharge > 0 && this.shotCount % 6 === 0;

    let base = this.damage;
    if (this.perfect && this.hp >= this.maxHp) base *= 1.3;
    if (this.focus > 0 && !this.moving) base *= 1 + this.focus;
    if (over) base *= 3;

    const reach = this.meleeRange + this.boltSize * 3;
    const halfArc = 1.15;
    let hits = 0;
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.dead || e.spawnT > 0) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > reach + e.r) continue;
      if (d > 1) {
        const a = Math.atan2(e.y - this.y, e.x - this.x);
        const diff = Math.abs(((a - this.aim + Math.PI * 3) % TAU) - Math.PI);
        if (diff > halfArc) continue;
      }
      const crit = this.crit > 0 && Math.random() < this.crit;
      const dmg = Math.max(1, Math.round(crit ? base * this.critMult : base));
      e.hit(dmg, game);
      if (this.burnOnHit && game.applyBurn) game.applyBurn(e, dmg, false);
      hits++;
      game.particles.burst(e.x, e.y, crit ? 8 : 4, {
        color: crit ? C.white : '#dbe6f5', speed: 110, life: 0.28, size: 1,
      });
      game.particles.float(e.x, e.y - 12, String(dmg), crit ? C.white : '#cfd6e2', crit ? 2 : 1);
    }

    // sword parry: hostile bullets inside the arc get batted back
    let parried = 0;
    const live = game.bullets && game.bullets.active;
    if (live) {
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i];
        if (!b || !b.active || b.friendly) continue;
        const dx = b.x - this.x;
        const dy = b.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > reach + b.r + 3) continue;
        const ba = Math.atan2(dy, dx);
        const bd = Math.abs(((ba - this.aim + Math.PI * 3) % TAU) - Math.PI);
        if (bd > halfArc + 0.25) continue;
        this.parry(b, game);
        parried++;
      }
    }
    if (parried > 0) {
      game.score += 10 * parried;
      game.particles.float(this.x, this.y - 24, 'PARRY', C.cyan, 1);
      game.sound.tone(520, 880, 0.1, 'square', 0.06);
      this.invuln = Math.max(this.invuln, 0.12);
    }

    this.recoil = 1;
    game.sound.tone(240, 90, 0.12, 'square', 0.07);
    game.particles.burst(
      this.x + Math.cos(this.aim) * reach * 0.55,
      this.y + Math.sin(this.aim) * reach * 0.55 - 2,
      hits > 0 ? 6 : 2,
      { color: '#e8eef8', speed: 60, life: 0.16, angle: this.aim, spread: 1.1, size: 1 }
    );
    game.shake = Math.min(4, game.shake + (hits > 0 ? 1.6 : 0.4));
  }

  updateOrbs(dt, game) {
    if (this.orbs <= 0) {
      this.orbPos.length = 0;
      return;
    }
    this.orbAngle += dt * this.orbSpeed;
    this.orbPos.length = 0;
    for (let i = 0; i < this.orbs; i++) {
      const a = this.orbAngle + (i / this.orbs) * TAU;
      const ox = this.x + Math.cos(a) * 27;
      const oy = this.y + Math.sin(a) * 27;
      this.orbPos.push({ x: ox, y: oy });
      for (let k = 0; k < game.enemies.length; k++) {
        const e = game.enemies[k];
        if (e.dead || e.spawnT > 0) continue;
        if ((e.orbCd || 0) > 0) continue;
        if (dist(ox, oy, e.x, e.y) < e.r + 4) {
          e.orbCd = 0.3;
          e.hit(this.orbDamage, game);
          game.particles.burst(ox, oy, 5, { color: C.cyan, speed: 90, life: 0.26 });
        }
      }
    }
  }

  /* ----------------------------- draw ---------------------------- */

  draw(ctx, game) {
    // dash ghost trail
    for (const t of this.trail) {
      const a = t.life / t.maxLife;
      ctx.globalAlpha = a * 0.42;
      drawMageSilhouette(ctx, Math.round(t.x), Math.round(t.y), t.facing, C.cyan);
    }
    ctx.globalAlpha = 1;

    if (!this.alive) return;

    const blink = this.invuln > 0 && this.dashTime <= 0 && Math.floor(this.invuln * 26) % 2 === 0;
    const bob = this.moving ? Math.round(Math.sin(this.animT * 11) * 1) : 0;
    const x = Math.round(this.x);
    const y = Math.round(this.y) + bob;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 6, y + 9, 12, 2);
    ctx.fillRect(x - 4, y + 11, 8, 1);

    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.save();
    ctx.translate(x, y);
    if (this.facing < 0) ctx.scale(-1, 1);

    drawHeroBody(ctx, this.char, { animT: this.animT, moving: this.moving, aim: this.aim });

    ctx.restore();
    ctx.globalAlpha = 1;

    if (this.char === 'sniper') {
      // long rifle + faint sight line
      ctx.save();
      ctx.translate(x, y - 1);
      ctx.rotate(this.aim);
      ctx.fillStyle = '#20261a';
      ctx.fillRect(3, -1, 15, 2);
      ctx.fillStyle = '#3b4530';
      ctx.fillRect(9, 0, 4, 3);
      ctx.fillStyle = '#9dc46a';
      ctx.fillRect(2, -2, 2, 4);
      ctx.restore();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#9dc46a';
      for (let d = 22; d < 130; d += 9) {
        ctx.fillRect(Math.round(x + Math.cos(this.aim) * d), Math.round(y + Math.sin(this.aim) * d), 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    if (this.char === 'mage' || this.char === 'wizard' || this.char === 'pyromancer') {
      // staff levelled at the aim with a glowing focus stone
      const glow = this.char === 'wizard' ? '#7fd8ff' : this.char === 'pyromancer' ? '#ff7a3d' : C.gold;
      ctx.save();
      ctx.translate(x, y - 1);
      ctx.rotate(this.aim);
      ctx.fillStyle = '#4a3320';
      ctx.fillRect(4, -1, 12, 2);
      ctx.fillStyle = '#2f2014';
      ctx.fillRect(4, 0, 12, 1);
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = glow;
      ctx.fillRect(12, -4, 7, 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(14, -2, 3, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(15, -1, 1, 1);
      ctx.restore();
    }

    if (this.char === 'pyromancer' && this.heat > 0.02) this.drawFlameCone(ctx, x, y);
    if (this.char === 'cryomancer' && this.cryoSpellDef() && this.cryoSpellDef().passive) this.drawInfinity(ctx);
    if (this.char === 'cryomancer' && this.stormT > 0) this.drawStorm(ctx);

    if (this.char === 'knight') {
      // drawn sword and the swing arc
      ctx.save();
      ctx.translate(x, y - 1);
      ctx.rotate(this.aim);
      ctx.fillStyle = '#5f6b7d';
      ctx.fillRect(3, -1, 4, 2);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(6, -4, 2, 8);
      ctx.fillStyle = '#e8eef8';
      ctx.fillRect(8, -1, 14, 2);
      ctx.fillStyle = '#b9c6d8';
      ctx.fillRect(20, -1, 2, 1);
      ctx.restore();

      if (this.slashT > 0) {
        const t = 1 - this.slashT / this.slashDur;
        const sweep = -1.25 + t * 1.15;
        ctx.save();
        ctx.translate(x, y - 2);
        ctx.rotate(this.slashAng);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = '#e8eef8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.meleeRange, sweep, sweep + 2.5);
        ctx.stroke();
        ctx.globalAlpha = (1 - t) * 0.45;
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, this.meleeRange + 4, sweep, sweep + 2.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // hand glow toward aim
    const hx = this.x + Math.cos(this.aim) * 7;
    const hy = this.y + Math.sin(this.aim) * 7 - 2;
    ctx.globalAlpha = 0.5 + this.recoil * 0.5;
    ctx.fillStyle = C.gold;
    ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 2, 2);
    ctx.globalAlpha = 1;

    // orbiting shield
    for (const o of this.orbPos) {
      const ox = Math.round(o.x);
      const oy = Math.round(o.y);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = C.cyan;
      ctx.fillRect(ox - 3, oy - 3, 6, 6);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.cyanDim;
      ctx.fillRect(ox - 2, oy - 2, 4, 4);
      ctx.fillStyle = C.white;
      ctx.fillRect(ox - 1, oy - 1, 2, 2);
    }

    // hitbox core: bright dot, exactly the collision radius
    const pulse = 1 + Math.sin(this.animT * 8) * 0.25;
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x - 4, y - 2, 8, 4);
    ctx.fillRect(x - 2, y - 4, 4, 8);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x - 3, y - 2, 6, 4);
    ctx.fillRect(x - 2, y - 3, 4, 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d9fffb';
    ctx.fillRect(x - 1, y - 1, 2, 2);
    if (this.hurtFlash > 0) {
      ctx.globalAlpha = this.hurtFlash * 2;
      ctx.fillStyle = C.heart;
      ctx.fillRect(x - 4, y - 2, 8, 4);
      ctx.fillRect(x - 2, y - 4, 4, 8);
      ctx.globalAlpha = 1;
    }
  }
}

/* ------------------------- hero sprite ---------------------------- *
 * One pixel-art body shared by gameplay and the title portraits. Drawn
 * facing right around the origin with the feet at y = 9, so callers can
 * flip it with scale(-1, 1) and the title screen can scale it up.
 * ---------------------------------------------------------------- */
function drawHeroBody(ctx, char, o) {
  const P = CHAR_PALETTES[char] || PLAYER_COLORS;
  const OUT = '#07070b';
  const animT = o.animT || 0;
  const step = o.moving ? Math.round(Math.sin(animT * 13) * 1.4) : 0;
  const px = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };

  // ---- back cloak, one pixel of outline all round ----
  px(-8, -4, 2, 8, OUT);
  px(-7, -4, 2, 7, P.robeDark);
  px(-7, 2, 2, 1, P.robeLight);

  // ---- boots, alternating with the walk cycle ----
  px(-4, 5 + step, 3, 4, OUT);
  px(1, 5 - step, 3, 4, OUT);
  px(-3, 5 + step, 2, 2, P.robeDark);
  px(2, 5 - step, 2, 2, P.robeDark);
  px(-4, 8 + step, 3, 1, P.trim);
  px(1, 8 - step, 3, 1, P.trim);

  // ---- torso ----
  px(-5, -7, 11, 13, OUT);
  px(-4, -6, 9, 11, P.robe);
  px(-4, -6, 3, 11, P.robeLight);
  px(2, -6, 3, 11, P.robeDark);
  px(-4, 0, 9, 1, P.trim);
  px(3, 0, 1, 1, C.white);
  px(-4, 4, 9, 1, P.robeDark);

  // ---- shoulder cape ----
  px(-5, -8, 11, 2, OUT);
  px(-5, -8, 3, 1, P.robeLight);
  px(2, -8, 4, 1, P.robeDark);

  // ---- head ----
  px(-4, -15, 9, 9, OUT);
  px(-3, -15, 7, 8, P.hood);
  px(-3, -15, 7, 1, P.robeLight);
  px(-2, -12, 5, 4, P.face);
  px(1, -11, 1, 2, C.cyan);
  px(3, -13, 1, 4, P.robeDark);

  // ---- front arm ----
  px(4, -6, 3, 7, OUT);
  px(4, -5, 2, 4, P.robeLight);
  px(4, -1, 2, 2, P.hood);

  if (char === 'wizard') {
    // tall pointed hat with a gold band and a star
    px(-7, -16, 15, 2, OUT);
    px(-6, -16, 13, 1, '#3a67c7');
    px(-5, -19, 11, 3, OUT);
    px(-5, -18, 10, 2, '#2f5aa8');
    px(-4, -22, 9, 3, '#2a4c93');
    px(-3, -25, 7, 3, '#27407a');
    px(-2, -28, 5, 3, '#22376a');
    px(-1, -29, 3, 1, '#1c2d55');
    px(-5, -18, 10, 1, P.trim);
    px(0, -24, 1, 1, P.trim);
    px(-1, -26, 3, 1, P.trim);
    // spell book tucked at the hip
    px(4, 1, 3, 3, '#1a2b55');
    px(4, 1, 3, 1, P.trim);
  } else if (char === 'sniper') {
    // ghillie brim and hanging strips
    px(-5, -16, 11, 2, OUT);
    px(-5, -16, 10, 1, '#3f4d2e');
    for (let i = -4; i <= 3; i += 2) px(i, -18, 1, 2, P.trim);
    px(-5, -7, 2, 2, P.trim);
    px(3, -6, 2, 2, P.trim);
    px(-6, 1, 1, 3, '#2b3620');
    px(-4, 3, 1, 2, '#2b3620');
  } else if (char === 'knight') {
    // visored helm, gold crest, pauldrons and a round shield on the back
    px(-4, -15, 9, 3, '#8b93a6');
    px(-4, -15, 9, 1, '#cfd6e2');
    px(-2, -13, 5, 2, '#2b333f');
    px(-1, -20, 2, 6, OUT);
    px(-1, -20, 2, 5, '#ffd166');
    px(-2, -18, 4, 1, '#ffd166');
    px(-6, -8, 3, 3, OUT);
    px(-6, -8, 3, 2, '#8b93a6');
    px(4, -8, 3, 3, OUT);
    px(4, -8, 3, 2, '#8b93a6');
    px(-7, -5, 3, 7, OUT);
    px(-6, -4, 2, 5, '#3a4352');
    px(-6, -4, 2, 1, '#9aa7b8');
    px(-6, -2, 1, 2, '#ffd166');
  } else if (char === 'cryomancer') {
    // frosted hood with icicles hanging off the brim
    px(-4, -16, 9, 2, '#8fd8f0');
    px(-4, -16, 9, 1, '#dffaff');
    px(-4, -17, 2, 3, '#dffaff');
    px(2, -17, 2, 4, '#dffaff');
    px(0, -18, 1, 2, '#ffffff');
    px(-6, -9, 2, 1, '#bff3ff');
    px(4, -9, 2, 1, '#bff3ff');
    px(-3, 1, 1, 2, '#bff3ff');
    px(3, 3, 1, 2, '#8fd8f0');
  } else if (char === 'pyromancer') {
    // scorched hood with embers lifting off the shoulders
    px(-3, -18, 6, 3, OUT);
    px(-3, -17, 5, 2, '#33150f');
    px(0, -19, 1, 1, '#ff7a3d');
    px(-5, -20, 1, 1, '#ffcf4a');
    px(-6, -9, 2, 1, '#ff9b3d');
    px(3, -9, 2, 1, '#ff7a3d');
    px(-4, 1, 1, 2, '#ffcf4a');
  } else {
    // mage: hood peak and a small circlet glint
    px(-2, -18, 5, 3, OUT);
    px(-2, -17, 4, 2, P.hood);
    px(0, -16, 1, 1, P.trim);
  }
}

/* Flat silhouette used for the dash after-images. */
function drawMageSilhouette(ctx, x, y, facing, color) {
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(-5, -2, 10, 9);
  ctx.fillRect(-4, -9, 8, 7);
  ctx.fillRect(-5, -8, 10, 2);
  ctx.restore();
}
