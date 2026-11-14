'use strict';

/* ------------------------------------------------------------------ *
 * upgrades.js - 100+ relics, tier chains and achievement unlocks      *
 * ------------------------------------------------------------------ */

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

function unlockReq(stat, value, label) {
  return { stat, value, label };
}

const UNLOCK_STATS = {
  kills: 'SOULS SLAIN',
  grazes: 'BULLETS GRAZED',
  rooms: 'ROOMS CLEARED',
  bosses: 'BOSSES SLAIN',
  wins: 'RUNS WON',
  floors: 'DEEPEST FLOOR',
  dashes: 'DASHES USED',
  score: 'BEST SCORE',
  deaths: 'DEATHS',
  relics: 'RELICS TAKEN',
  legendaries: 'LEGENDARIES FOUND',
};

/* Relic rarities: weight controls how often a card shows up in a draft. */
const RARITY = {
  common: { label: 'COMMON', color: '#8792a2', weight: 6 },
  rare: { label: 'RARE', color: '#4aa8ff', weight: 4 },
  epic: { label: 'EPIC', color: '#c77dff', weight: 2 },
  legendary: { label: 'LEGENDARY', color: '#ffcf4a', weight: 0 },
};

function rarityOf(relic) {
  return RARITY[relic && relic.rarity] || RARITY.common;
}

/* Builds one relic entry per tier. Each tier requires the previous one,
   so a run still sees a varied pool instead of five copies of a stat.
   desc/applyTier may be functions, so a card can advertise the real
   numbers it adds (DAMAGE +12% on tier 1, +18% on tier 2, ...). */
function tiered(cfg) {
  const out = [];
  for (let i = 1; i <= cfg.tiers; i++) {
    let req = cfg.unlock || null;
    if (cfg.lateUnlock && i >= (cfg.lateFrom || 3)) req = cfg.lateUnlock;
    const desc = typeof cfg.desc === 'function' ? cfg.desc(i, cfg.tiers) : cfg.desc;
    // only the capstone of a long chain earns epic; short chains top out rare
    const rarity = cfg.rarity || (i > 1 && i === cfg.tiers && cfg.tiers >= 4 ? 'epic' : i > 1 ? 'rare' : 'common');
    out.push({
      id: cfg.id + i,
      name: cfg.name + ' ' + ROMAN[i],
      icon: cfg.icon,
      rarity,
      desc: [desc],
      requires: i > 1 ? cfg.id + (i - 1) : null,
      unlock: req,
      max: 1,
      chars: cfg.chars || null,
      notChars: cfg.notChars || null,
      noMelee: !!cfg.noMelee,
      apply: cfg.applyTier ? (p) => cfg.applyTier(p, i) : cfg.apply,
    });
  }
  return out;
}

const RELIC_TEMPLATES = [
  /* ---- damage ---- */
  { id: 'might', name: 'ARCANE MIGHT', icon: 'damage', tiers: 5, desc: (i) => 'DAMAGE +' + (12 + i * 6) + '%', applyTier: (p, i) => { const pc = 12 + i * 6; p.damage = Math.max(p.damage + 1, Math.round(p.damage * (1 + pc / 100))); }, lateFrom: 4, lateUnlock: unlockReq('kills', 200, 'SLAY 200 SOULS') },
  { id: 'heavy', name: 'HEAVY BOLTS', icon: 'heavy', tiers: 4, desc: (i) => 'DAMAGE +' + (10 + i * 7) + '%', applyTier: (p, i) => { p.damage = Math.round(p.damage * (1 + (10 + i * 7) / 100)); p.boltSize += 1; }, noMelee: true },
  { id: 'keen', name: 'KEEN EYE', icon: 'crit', tiers: 4, desc: (i) => 'CRIT +' + (4 + i * 3) + '%', applyTier: (p, i) => { p.crit += (4 + i * 3) / 100; } },
  { id: 'critpow', name: 'CRIT POWER', icon: 'critdmg', tiers: 3, desc: (i) => 'CRIT DMG +' + (20 + i * 15) + '%', applyTier: (p, i) => { p.critMult += (20 + i * 15) / 100; }, unlock: unlockReq('kills', 100, 'SLAY 100 SOULS') },
  { id: 'glass', name: 'GLASS CANNON', icon: 'glass', tiers: 2, desc: 'DMG +30% HP -1', apply: (p) => { p.damage = Math.round(p.damage * 1.3); p.maxHp = Math.max(1, p.maxHp - 1); p.hp = Math.min(p.hp, p.maxHp); }, unlock: unlockReq('kills', 50, 'SLAY 50 SOULS') },

  /* ---- fire rate / shots ---- */
  { id: 'quick', name: 'QUICK HANDS', icon: 'quick', tiers: 5, desc: (i) => 'FIRE RATE +' + (7 + i * 3) + '%', applyTier: (p, i) => { p.fireRate = Math.max(0.04, p.fireRate * (1 - (7 + i * 3) / 100)); }, lateFrom: 3, lateUnlock: unlockReq('grazes', 300, 'GRAZE 300 BULLETS') },
  { id: 'longshot', name: 'LONG SHOT', icon: 'longshot', tiers: 3, desc: (i) => 'SPEED +' + (10 + i * 8) + '% DMG +' + i, applyTier: (p, i) => { p.boltSpeed *= 1 + (10 + i * 8) / 100; p.damage += i; }, noMelee: true },
  { id: 'pierce', name: 'PIERCING BOLTS', icon: 'pierce', tiers: 3, desc: 'PIERCE +1 FOE', apply: (p) => { p.pierce += 1; }, noMelee: true },
  { id: 'ricochet', name: 'RICOCHET', icon: 'ricochet', tiers: 2, desc: 'BOUNCE OFF WALLS', apply: (p) => { p.ricochet += 1; }, noMelee: true },
  { id: 'seeker', name: 'SEEKING BOLTS', icon: 'homing', tiers: 3, desc: 'BOLTS HOMING', apply: (p) => { p.homing += 1.1; }, lateFrom: 2, lateUnlock: unlockReq('kills', 500, 'SLAY 500 SOULS'), noMelee: true },
  { id: 'chain', name: 'CHAIN LIGHTNING', icon: 'chain', tiers: 3, desc: 'BOLTS ARC +1', apply: (p) => { p.chain += 1; }, unlock: unlockReq('kills', 150, 'SLAY 150 SOULS'), noMelee: true },
  { id: 'giant', name: 'TITAN BOLTS', icon: 'giant', tiers: 2, desc: (i) => 'BIGGER BOLTS +' + (8 + i * 6) + '% DMG', applyTier: (p, i) => { p.boltSize += 2; p.damage = Math.round(p.damage * (1 + (8 + i * 6) / 100)); }, unlock: unlockReq('kills', 75, 'SLAY 75 SOULS'), noMelee: true },
  { id: 'split', name: 'SPLIT BOLT', icon: 'shots', tiers: 1, desc: '+1 BOLT', chars: ['mage', 'wizard'], apply: (p) => { p.extraShots += 1; } },
  { id: 'fan', name: 'SPREAD FAN', icon: 'shots', tiers: 1, desc: '+1 BOLT', chars: ['mage', 'wizard'], apply: (p) => { p.extraShots += 1; }, unlock: unlockReq('kills', 25, 'SLAY 25 SOULS') },
  { id: 'storm', name: 'BOLT STORM', icon: 'shots', tiers: 1, desc: '+2 BOLTS', chars: ['mage', 'wizard'], apply: (p) => { p.extraShots += 2; }, unlock: unlockReq('floors', 3, 'REACH FLOOR 3') },
  { id: 'overcharge', name: 'OVERCHARGE', icon: 'overcharge', tiers: 3, desc: 'EVERY 6TH VOLLEY X3', apply: (p) => { p.overcharge += 1; }, unlock: unlockReq('grazes', 150, 'GRAZE 150 BULLETS') },
  { id: 'flurry', name: 'FLURRY', icon: 'flurry', tiers: 1, desc: 'RATE +33% DMG -10%', chars: ['mage', 'wizard'], apply: (p) => { p.fireRate *= 0.75; p.damage = Math.round(p.damage * 0.9); }, unlock: unlockReq('wins', 1, 'WIN A RUN') },

  /* ---- defence ---- */
  { id: 'heart', name: 'HEART CONTAINER', icon: 'heart', tiers: 5, desc: 'MAX HP +1', apply: (p) => { p.maxHp += 1; p.heal(2); }, lateFrom: 4, lateUnlock: unlockReq('bosses', 2, 'SLAY 2 BOSSES') },
  { id: 'regen', name: 'SOUL REGEN', icon: 'regen', tiers: 2, desc: (i) => 'HEAL +' + i + ' PER ROOM', applyTier: (p, i) => { p.regen += i; } },
  { id: 'evasion', name: 'PHASE SHIFT', icon: 'evasion', tiers: 2, desc: (i) => 'DODGE +' + (5 + i * 4) + '%', applyTier: (p, i) => { p.evasion += (5 + i * 4) / 100; }, unlock: unlockReq('grazes', 100, 'GRAZE 100 BULLETS') },
  { id: 'thorns', name: 'SPITE', icon: 'thorns', tiers: 2, desc: (i) => 'THORNS ' + (i * 2), applyTier: (p, i) => { p.thorns += i * 2; }, unlock: unlockReq('deaths', 3, 'FALL 3 TIMES') },
  { id: 'siphon', name: 'SOUL SIPHON', icon: 'siphon', tiers: 3, desc: (i) => 'KILL LEECH ' + (10 + i * 6) + '%', applyTier: (p, i) => { p.lifesteal += (10 + i * 6) / 100; } },
  { id: 'aegis', name: 'AEGIS', icon: 'aegis', tiers: 1, desc: 'BLOCK 1 HIT/ROOM', apply: (p) => { p.aegis += 1; p.aegisReady = true; }, unlock: unlockReq('rooms', 25, 'CLEAR 25 ROOMS') },
  { id: 'vamp', name: 'VAMPIRIC', icon: 'vamp', tiers: 1, desc: 'HEAL ON CRIT KILL', apply: (p) => { p.vamp = true; }, unlock: unlockReq('kills', 300, 'SLAY 300 SOULS') },
  { id: 'bloodpact', name: 'BLOOD PACT', icon: 'pact', tiers: 1, desc: 'DMG +50% HP -1', apply: (p) => { p.damage = Math.round(p.damage * 1.5); p.maxHp = Math.max(1, p.maxHp - 1); p.hp = Math.min(p.hp, p.maxHp); }, unlock: unlockReq('deaths', 5, 'FALL 5 TIMES') },

  /* ---- armor ---- */
  { id: 'plate', name: 'IRON PLATING', icon: 'shield', tiers: 3, desc: 'ARMOR +1 PLATE', apply: (p) => { p.armorMax += 1; } },
  { id: 'forge', name: 'FORGE TEMPER', icon: 'aegis', tiers: 2, desc: (i) => 'ARMOR REFORGE +' + (20 + i * 15) + '%', applyTier: (p, i) => { p.armorRegen *= 1 - (20 + i * 15) / 100; }, unlock: unlockReq('rooms', 15, 'CLEAR 15 ROOMS') },
  { id: 'rivets', name: 'RIVETED HULL', icon: 'heavy', tiers: 2, desc: 'ARMOR +1 HP +1', apply: (p) => { p.armorMax += 1; p.maxHp += 1; p.heal(1); }, unlock: unlockReq('bosses', 1, 'SLAY 1 BOSS') },

  /* ---- dash ---- */
  { id: 'wind', name: 'WIND STEP', icon: 'dash', tiers: 4, desc: (i) => 'DASH CD -' + (12 + i * 4) + '%', applyTier: (p, i) => { p.dashCdMax = Math.max(0.3, p.dashCdMax * (1 - (12 + i * 4) / 100)); }, lateFrom: 3, lateUnlock: unlockReq('dashes', 60, 'DASH 60 TIMES') },
  { id: 'phantom', name: 'PHANTOM STEP', icon: 'phantom', tiers: 3, desc: (i) => 'DASH +' + (18 + i * 8) + '%', applyTier: (p, i) => { p.dashDuration = Math.min(0.4, p.dashDuration * (1 + (18 + i * 8) / 100)); }, lateFrom: 3, lateUnlock: unlockReq('dashes', 200, 'DASH 200 TIMES') },
  { id: 'blink', name: 'BLINK', icon: 'iframe', tiers: 2, desc: 'LONGER I-FRAMES', apply: (p) => { p.iFrameBonus += 0.12; }, lateFrom: 2, lateUnlock: unlockReq('dashes', 400, 'DASH 400 TIMES') },
  { id: 'shockdash', name: 'SHOCK DASH', icon: 'dashblast', tiers: 2, desc: 'DASH DAMAGES', apply: (p) => { p.dashBlast += 8; }, unlock: unlockReq('dashes', 50, 'DASH 50 TIMES') },
  { id: 'charges', name: 'DOUBLE DASH', icon: 'charges', tiers: 1, desc: '+1 DASH CHARGE', apply: (p) => { p.dashCharges += 1; p.dashChargesLeft += 1; }, unlock: unlockReq('dashes', 150, 'DASH 150 TIMES') },

  /* ---- fire: ignition and stacking burns ---- */
  {
    id: 'cinder', name: 'CINDER TOUCH', icon: 'flame', tiers: 3,
    desc: (i) => (i === 1 ? 'HITS SET THEM BURNING' : 'FASTER BURN +' + (30 + (i - 2) * 25) + '%'),
    applyTier: (p, i) => {
      p.burnOnHit = 1;
      if (i > 1) p.burnRateMul *= 1 + (30 + (i - 2) * 25) / 100;
    },
    notChars: ['cryomancer'],
  },
  {
    id: 'pyre', name: 'PYRE', icon: 'flame', tiers: 3,
    desc: (i) => 'BURN RATE +' + (20 + i * 15) + '% LASTS +' + (i * 30) + '%',
    applyTier: (p, i) => {
      p.burnOnHit = 1;
      p.burnRateMul *= 1 + (20 + i * 15) / 100;
      p.burnTime += 0.3 * i;
    },
    notChars: ['cryomancer'],
    unlock: unlockReq('kills', 120, 'SLAY 120 SOULS'),
  },
  {
    id: 'wildfire', name: 'WILDFIRE', icon: 'flamespread', tiers: 2,
    desc: (i) => 'BURNS SPREAD ' + (32 + i * 20) + 'PX',
    applyTier: (p, i) => {
      p.burnOnHit = 1;
      p.burnSpread = 32 + i * 20;
    },
    notChars: ['cryomancer'],
    unlock: unlockReq('rooms', 30, 'CLEAR 30 ROOMS'),
  },

  /* ---- frost: chilling and shattering ---- */
  {
    id: 'frostbite', name: 'FROSTBITE', icon: 'frost', tiers: 3,
    desc: (i) => (i === 1 ? 'HITS CHILL FOES' : 'CHILL +' + (25 + (i - 2) * 15) + '%'),
    applyTier: (p, i) => {
      p.freezeOnHit = 1;
      p.chillTime += 0.25;
      if (i > 1) p.chillMul *= 1 + (25 + (i - 2) * 15) / 100;
    },
    chars: ['mage', 'wizard', 'sniper', 'cryomancer'],
  },
  {
    id: 'deepfreeze', name: 'DEEP FREEZE', icon: 'frost', tiers: 3,
    desc: (i) => 'CHILL +' + (20 + i * 10) + '% LASTS +' + (i * 35) + '%',
    applyTier: (p, i) => {
      p.freezeOnHit = 1;
      p.chillMul *= 1 + (20 + i * 10) / 100;
      p.chillTime += 0.35 * i;
    },
    chars: ['mage', 'wizard', 'sniper', 'cryomancer'],
    unlock: unlockReq('kills', 120, 'SLAY 120 SOULS'),
  },
  {
    id: 'glacier', name: 'GLACIER', icon: 'frost', tiers: 2,
    desc: (i) => 'CHILLED TAKE +' + (20 + i * 15) + '% DMG',
    applyTier: (p, i) => { p.shatter += (20 + i * 15) / 100; },
    chars: ['mage', 'wizard', 'sniper', 'cryomancer'],
    unlock: unlockReq('rooms', 30, 'CLEAR 30 ROOMS'),
  },

  /* ---- orbs ---- */
  { id: 'orb', name: 'ORBITAL SHIELD', icon: 'shield', tiers: 3, desc: '+1 ORBITING ORB', apply: (p) => { p.orbs = Math.min(3, p.orbs + 1); } },
  { id: 'orbdmg', name: 'ORB FOCUS', icon: 'guardian', tiers: 2, desc: (i) => 'ORB DMG +' + (3 + i * 3), applyTier: (p, i) => { p.orbDamage += 3 + i * 3; }, unlock: unlockReq('rooms', 60, 'CLEAR 60 ROOMS') },
  { id: 'orbspd', name: 'ORB HASTE', icon: 'shield', tiers: 1, desc: 'ORBS SPIN +50%', apply: (p) => { p.orbSpeed *= 1.5; } },

  /* ---- mobility / economy / utility ---- */
  { id: 'swift', name: 'SWIFT BOOTS', icon: 'swift', tiers: 4, desc: (i) => 'MOVE +' + (8 + i * 4) + '%', applyTier: (p, i) => { p.speed *= 1 + (8 + i * 4) / 100; }, lateFrom: 3, lateUnlock: unlockReq('dashes', 80, 'DASH 80 TIMES') },
  { id: 'greed', name: 'GREED', icon: 'greed', tiers: 3, desc: (i) => 'SCORE +' + (25 + i * 15) + '%', applyTier: (p, i) => { p.greed += (25 + i * 15) / 100; }, lateFrom: 3, lateUnlock: unlockReq('score', 10000, 'SCORE 10000') },
  { id: 'magnet', name: 'SOUL MAGNET', icon: 'magnet', tiers: 2, desc: (i) => 'MAGNET +' + (25 + i * 20), applyTier: (p, i) => { p.magnet += 25 + i * 20; } },
  { id: 'grace', name: 'GRAZE HEAL', icon: 'grace', tiers: 2, desc: 'HEAL PER 30 GRAZES', apply: (p) => { p.grazeHeal += 1; }, unlock: unlockReq('grazes', 60, 'GRAZE 60 BULLETS') },
  { id: 'luck', name: 'LUCK', icon: 'luck', tiers: 1, desc: 'CRIT +8%', apply: (p) => { p.crit += 0.08; }, unlock: unlockReq('floors', 2, 'REACH FLOOR 2') },
  { id: 'scholar', name: 'SCHOLAR', icon: 'scholar', tiers: 1, desc: 'MORE DROPS', apply: (p) => { p.dropBonus += 0.15; }, unlock: unlockReq('rooms', 40, 'CLEAR 40 ROOMS') },
  { id: 'scavenger', name: 'SCAVENGER', icon: 'scavenger', tiers: 1, desc: 'MORE DROPS', apply: (p) => { p.dropBonus += 0.15; }, unlock: unlockReq('kills', 60, 'SLAY 60 SOULS') },

  /* ---- conditional / legendary ---- */
  { id: 'berserk', name: 'BERSERK', icon: 'berserk', tiers: 1, desc: '+80% RATE AT 1 HP', apply: (p) => { p.berserk = true; } },
  { id: 'perfect', name: 'PERFECT FOCUS', icon: 'perfect', tiers: 1, desc: '+30% DMG AT FULL HP', apply: (p) => { p.perfect = true; }, unlock: unlockReq('wins', 1, 'WIN A RUN') },
  { id: 'momentum', name: 'MOMENTUM', icon: 'momentum', tiers: 1, desc: '+25% RATE MOVING', apply: (p) => { p.momentum = 0.25; }, unlock: unlockReq('dashes', 300, 'DASH 300 TIMES') },
  { id: 'focus', name: 'FOCUS', icon: 'focus', tiers: 1, desc: '+30% DMG STILL', apply: (p) => { p.focus = 0.3; }, unlock: unlockReq('rooms', 100, 'CLEAR 100 ROOMS') },
  { id: 'executioner', name: 'EXECUTIONER', icon: 'execution', tiers: 1, desc: '+50% DMG ON WEAK', apply: (p) => { p.executioner = 0.5; }, unlock: unlockReq('bosses', 3, 'SLAY 3 BOSSES') },
  { id: 'bounty', name: 'BOUNTY', icon: 'bounty', tiers: 1, desc: '+500 PER BOSS', apply: (p) => { p.bounty += 500; }, unlock: unlockReq('score', 25000, 'SCORE 25000') },

  /* ---- high tier unlocks ---- */
  { id: 'tempest', name: 'TEMPEST', icon: 'shots', tiers: 1, desc: '+1 BOLT, DMG -8%', chars: ['mage', 'wizard'], apply: (p) => { p.extraShots += 1; p.damage = Math.round(p.damage * 0.92); }, unlock: unlockReq('kills', 400, 'SLAY 400 SOULS') },
  { id: 'colossus', name: 'COLOSSUS', icon: 'heart', tiers: 1, desc: 'MAX HP +2 SPEED -8%', apply: (p) => { p.maxHp += 2; p.heal(2); p.speed *= 0.92; }, unlock: unlockReq('bosses', 2, 'SLAY 2 BOSSES') },
  { id: 'voidbolt', name: 'VOID BOLTS', icon: 'void', tiers: 1, desc: 'PIERCE +2', apply: (p) => { p.pierce += 2; }, unlock: unlockReq('floors', 4, 'REACH FLOOR 4') },
  { id: 'guardian', name: 'GUARDIAN', icon: 'guardian', tiers: 1, desc: '+1 ORB +3 ORB DMG', apply: (p) => { p.orbs = Math.min(3, p.orbs + 1); p.orbDamage += 3; }, unlock: unlockReq('rooms', 150, 'CLEAR 150 ROOMS') },
  { id: 'bloodlust', name: 'BLOODLUST', icon: 'bloodlust', tiers: 1, desc: 'LEECH + SPEED', apply: (p) => { p.lifesteal += 0.2; p.speed *= 1.06; }, unlock: unlockReq('kills', 700, 'SLAY 700 SOULS') },
  { id: 'soulfire', name: 'SOULFIRE', icon: 'soulfire', tiers: 1, desc: 'BOOM + CLUSTER', apply: (p) => { p.explosive += 1; p.cluster = true; }, unlock: unlockReq('bosses', 5, 'SLAY 5 BOSSES') },
  { id: 'gambler', name: 'GAMBLER', icon: 'gambler', tiers: 1, desc: 'CRIT +15%', apply: (p) => { p.crit += 0.15; }, unlock: unlockReq('wins', 3, 'WIN 3 RUNS') },
  { id: 'titan', name: 'TITAN HEART', icon: 'heart', tiers: 1, desc: 'HP +1 DMG +15%', apply: (p) => { p.maxHp += 1; p.heal(1); p.damage = Math.round(p.damage * 1.15); }, unlock: unlockReq('floors', 5, 'REACH FLOOR 5') },

  /* ---- wizard only ---- */
  { id: 'manawell', name: 'MANA WELL', icon: 'mana', tiers: 3, desc: (i) => 'MAX MANA +' + (20 + i * 15), chars: ['wizard'], applyTier: (p, i) => { p.manaMax += 20 + i * 15; p.mana += 20 + i * 15; } },
  { id: 'manaflow', name: 'MANA FLOW', icon: 'mana', tiers: 3, desc: (i) => 'MANA REGEN +' + (15 + i * 10) + '%', chars: ['wizard'], applyTier: (p, i) => { p.manaRegen *= 1 + (15 + i * 10) / 100; }, lateFrom: 3, lateUnlock: unlockReq('bosses', 2, 'SLAY 2 BOSSES') },
  { id: 'cheapcast', name: 'EFFICIENT CAST', icon: 'mana', tiers: 2, desc: (i) => 'SPELL COST -' + (10 + i * 6) + '%', chars: ['wizard'], applyTier: (p, i) => { p.manaCost *= 1 - (10 + i * 6) / 100; }, unlock: unlockReq('grazes', 80, 'GRAZE 80 BULLETS') },
  { id: 'spellpower', name: 'SPELL POWER', icon: 'damage', tiers: 3, desc: (i) => 'DAMAGE +' + (10 + i * 8) + '%', chars: ['wizard'], applyTier: (p, i) => { p.damage = Math.round(p.damage * (1 + (10 + i * 8) / 100)); } },
  { id: 'surge', name: 'ARCANE SURGE', icon: 'mana', tiers: 1, desc: '+40% DMG LOW MANA', chars: ['wizard'], apply: (p) => { p.surge = true; }, unlock: unlockReq('kills', 120, 'SLAY 120 SOULS') },
  { id: 'manaburst', name: 'MANA BURST', icon: 'shots', tiers: 1, desc: '+2 BOLTS, HP -1', chars: ['wizard'], apply: (p) => { p.extraShots += 2; p.maxHp = Math.max(1, p.maxHp - 1); }, unlock: unlockReq('floors', 3, 'REACH FLOOR 3') },

  /* ---- sniper only ---- */
  { id: 'rail', name: 'RAIL ROUNDS', icon: 'pierce', tiers: 3, desc: 'PIERCE +1', chars: ['sniper'], apply: (p) => { p.pierce += 1; } },
  { id: 'caliber', name: 'CALIBER', icon: 'damage', tiers: 3, desc: (i) => 'DAMAGE +' + (15 + i * 9) + '%', chars: ['sniper'], applyTier: (p, i) => { p.damage = Math.round(p.damage * (1 + (15 + i * 9) / 100)); }, lateFrom: 3, lateUnlock: unlockReq('bosses', 2, 'SLAY 2 BOSSES') },
  { id: 'reload', name: 'FAST HANDS', icon: 'quick', tiers: 3, desc: (i) => 'RELOAD -' + (8 + i * 5) + '%', chars: ['sniper'], applyTier: (p, i) => { p.fireRate *= 1 - (8 + i * 5) / 100; } },
  { id: 'headshot', name: 'HEADSHOT', icon: 'crit', tiers: 2, desc: (i) => 'CRIT +' + (7 + i * 6) + '%', chars: ['sniper'], applyTier: (p, i) => { p.crit += (7 + i * 6) / 100; }, unlock: unlockReq('kills', 80, 'SLAY 80 SOULS') },
  { id: 'ghillie', name: 'GHILLIE WEAVE', icon: 'evasion', tiers: 2, desc: (i) => 'DODGE +' + (5 + i * 4) + '%', chars: ['sniper'], applyTier: (p, i) => { p.evasion += (5 + i * 4) / 100; }, unlock: unlockReq('grazes', 60, 'GRAZE 60 BULLETS') },

  /* ---- knight only ---- */
  { id: 'edge', name: 'HONED EDGE', icon: 'damage', tiers: 4, desc: (i) => 'SWORD DMG +' + (10 + i * 6) + '%', chars: ['knight'], applyTier: (p, i) => { p.damage = Math.round(p.damage * (1 + (10 + i * 6) / 100)); } },
  { id: 'reach', name: 'LONG REACH', icon: 'pierce', tiers: 2, desc: (i) => 'SWING RANGE +' + (6 + i * 5), chars: ['knight'], applyTier: (p, i) => { p.meleeRange += 6 + i * 5; } },
  { id: 'tempo', name: 'BATTLE TEMPO', icon: 'quick', tiers: 3, desc: (i) => 'SWING SPEED +' + (8 + i * 5) + '%', chars: ['knight'], applyTier: (p, i) => { p.fireRate = Math.max(0.1, p.fireRate * (1 - (8 + i * 5) / 100)); } },
  { id: 'riposte', name: 'RIPOSTE', icon: 'siphon', tiers: 2, desc: (i) => 'LIFESTEAL +' + (10 + i * 8) + '%', chars: ['knight'], applyTier: (p, i) => { p.lifesteal += (10 + i * 8) / 100; }, unlock: unlockReq('kills', 30, 'SLAY 30 SOULS') },
  { id: 'aegisplate', name: 'BULWARK', icon: 'guardian', tiers: 2, desc: (i) => 'ARMOR +1, SWORD +' + (5 + i * 5) + '%', chars: ['knight'], applyTier: (p, i) => { p.armorMax += 1; p.damage = Math.round(p.damage * (1 + (5 + i * 5) / 100)); }, unlock: unlockReq('rooms', 10, 'CLEAR 10 ROOMS') },
];

/* Five run-winning relics. They never roll in a normal draft; the only
   way to get one is a sanctum, which turns up on ~0.5% of floors. */
const LEGENDARY_TEMPLATES = [
  {
    id: 'lichcrown', name: 'CROWN OF THE LICH', icon: 'critdmg',
    desc: 'DMG x2  CRIT +35%',
    apply: (p) => {
      p.damage = Math.round(p.damage * 2);
      p.crit += 0.35;
      p.critMult += 0.8;
      p.pierce += 2;
    },
  },
  {
    id: 'abyssheart', name: 'HEART OF THE ABYSS', icon: 'heart',
    desc: 'HP +4  ARMOR +3',
    apply: (p) => {
      p.maxHp += 4;
      p.armorMax += 3;
      p.armorRegen *= 0.5;
      p.lifesteal += 0.25;
      p.regen += 2;
    },
  },
  {
    id: 'wardenform', name: 'ETERNAL WARDEN', icon: 'guardian',
    desc: 'DODGE +35%  THORNS 15',
    apply: (p) => {
      p.evasion += 0.35;
      p.thorns += 15;
      p.iFrameBonus += 0.35;
      p.armorMax += 2;
      p.dashCharges += 1;
      p.dashChargesLeft += 1;
    },
  },
  {
    id: 'hourglass', name: 'HOURGLASS OF RUIN', icon: 'quick',
    desc: 'RATE x2  MOVE +35%',
    apply: (p) => {
      p.fireRate = Math.max(0.04, p.fireRate * 0.5);
      p.speed *= 1.35;
      p.boltSpeed *= 1.5;
      p.dashCdMax = Math.max(0.3, p.dashCdMax * 0.5);
    },
  },
  {
    id: 'titanwrath', name: "TITAN'S WRATH", icon: 'giant',
    desc: 'DMG +120%  +1 BOLT',
    apply: (p) => {
      p.damage = Math.round(p.damage * 2.2);
      p.boltSize += 3;
      p.extraShots += 1;
      p.explosive += 2;
      p.chain += 2;
      p.lifesteal += 0.15;
    },
  },
];

const UPGRADES = [];
for (const t of RELIC_TEMPLATES) {
  for (const u of tiered(t)) UPGRADES.push(u);
}
for (const t of LEGENDARY_TEMPLATES) {
  UPGRADES.push({
    id: t.id,
    name: t.name,
    icon: t.icon,
    rarity: 'legendary',
    desc: [t.desc],
    requires: null,
    unlock: null,
    max: 1,
    chars: null,
    noMelee: false,
    legendary: true,
    apply: t.apply,
  });
}

const RELIC_BY_ID = new Map();
for (const u of UPGRADES) RELIC_BY_ID.set(u.id, u);

function isRelicUnlocked(relic, records) {
  if (!relic.unlock) return true;
  return (records[relic.unlock.stat] || 0) >= relic.unlock.value;
}

function unlockedRelicCount(records) {
  let n = 0;
  for (let i = 0; i < UPGRADES.length; i++) {
    if (UPGRADES[i].legendary) continue;
    if (isRelicUnlocked(UPGRADES[i], records)) n++;
  }
  return n;
}

/* Legendaries are never "unlocked" by a goal - they are discovered, and the
   discoveries are remembered in a bitmask on the save records. */
const LEGENDARY_IDS = LEGENDARY_TEMPLATES.map((t) => t.id);

function legendaryBit(id) {
  const i = LEGENDARY_IDS.indexOf(id);
  return i < 0 ? 0 : (1 << i);
}

function legendaryFound(records, id) {
  const mask = (records && records.legendaryMask) || 0;
  return (mask & legendaryBit(id)) !== 0;
}

function legendaryFoundCount(records) {
  let mask = (records && records.legendaryMask) || 0;
  let n = 0;
  while (mask) { n += mask & 1; mask >>= 1; }
  return n;
}

/* Does this hero get anything at all out of the relic? Fire relics are dead
   weight for the cryomancer, projectile relics for the sword, and the hero
   gated ones are gated for a reason. Drafts, sanctums and the co-op
   partner's mirror all ask this one question. */
function relicUsableBy(u, char) {
  if (!u) return false;
  const c = char || 'mage';
  if (u.chars && u.chars.indexOf(c) < 0) return false;
  if (u.notChars && u.notChars.indexOf(c) >= 0) return false;
  if (u.noMelee && (c === 'knight' || c === 'cryomancer')) return false;
  return true;
}

/* Relics whose unlock condition is met and whose previous tier was taken.
   extraChars are the other heroes in the party: in co-op every pick is
   shared, so a relic only gets offered when all of them can use it. */
function rollRelicChoices(player, records, count, extraChars) {
  const avail = [];
  if (!player) return avail;
  const stacks = player.stacks || (player.stacks = {});
  const recs = records || {};
  const char = player.char || 'mage';
  const extra = extraChars && extraChars.length ? extraChars : null;
  for (let i = 0; i < UPGRADES.length; i++) {
    const u = UPGRADES[i];
    if ((stacks[u.id] || 0) >= u.max) continue;
    if (!isRelicUnlocked(u, recs)) continue;
    // legendaries never appear in a normal draft - only in a sanctum
    if (u.legendary) continue;
    if (!relicUsableBy(u, char)) continue;
    if (extra) {
      let shared = true;
      for (let k = 0; k < extra.length; k++) {
        if (!relicUsableBy(u, extra[k])) { shared = false; break; }
      }
      if (!shared) continue;
    }
    if (u.requires && !(stacks[u.requires] > 0)) continue;
    avail.push(u);
  }

  // rarity-weighted draw without replacement
  const picked = [];
  while (picked.length < count && avail.length) {
    let total = 0;
    for (let i = 0; i < avail.length; i++) total += rarityOf(avail[i]).weight;
    let roll = Math.random() * total;
    let idx = avail.length - 1;
    for (let i = 0; i < avail.length; i++) {
      roll -= rarityOf(avail[i]).weight;
      if (roll <= 0) { idx = i; break; }
    }
    picked.push(avail.splice(idx, 1)[0]);
  }
  return picked;
}

/* A sanctum holds exactly one legendary, chosen at random from the ones
   the player does not already own. */
function rollLegendaryRelic(player, extraChars) {
  const held = new Set((player && player.relics) || []);
  const char = (player && player.char) || 'mage';
  const extra = extraChars && extraChars.length ? extraChars : null;
  const pool = UPGRADES.filter((u) => {
    if (!u.legendary || held.has(u.id)) return false;
    if (!relicUsableBy(u, char)) return false;
    if (extra) {
      for (let k = 0; k < extra.length; k++) if (!relicUsableBy(u, extra[k])) return false;
    }
    return true;
  });
  return pool.length ? pick(pool) : null;
}

function nextRelicGoal(records) {
  let best = null;
  for (let i = 0; i < UPGRADES.length; i++) {
    const u = UPGRADES[i];
    if (!u.unlock) continue;
    if ((records[u.unlock.stat] || 0) >= u.unlock.value) continue;
    const need = u.unlock.value - (records[u.unlock.stat] || 0);
    if (!best || need < best.need) best = { need, label: u.unlock.label, relic: u };
  }
  return best;
}
