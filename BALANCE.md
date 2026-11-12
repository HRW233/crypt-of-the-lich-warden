# Hero balance — bot playtest

Every hero fights the **same wave**: 6 cultist acolytes + 2 bone archers ringing the player at
125 x 92 px, scaled by the floor's normal HP formula (`x1.0 / x1.8 / x2.6` for floors 1 / 3 / 5).
No relics, MEDIUM difficulty, starting weapons only.

The bot is the same for every hero: it aims at the nearest enemy, holds the trigger, kites to a
hero-specific range, and slides away from any hostile bullet within 40 px and any boss beam within
26 px. Close-range heroes (the knight and the pyromancer) are held at 26 px and 55 px; everyone
else kites at 100-150 px.

Measured 2026-11-12 across `v4.1` through `v4.6`.

## Clear time (seconds, lower is better)

| Hero | Floor 1 (344 HP) | Floor 3 (620 HP) | Floor 5 (896 HP) |
|---|---|---|---|
| SNIPER | **6.5** | **9.9** | **8.6** |
| KNIGHT | 7.7 | 9.3 | 12.5 |
| WIZARD | 7.8 | 12.5 | 15.8 |
| MAGE | 8.3 | 13.1 | 17.0 |
| CRYOMANCER | 9.3 | 15.5 | 19.0 |
| PYROMANCER | 14.8 | 19.8 | 28.0 |

## Effective damage per second

| Hero | Floor 1 | Floor 3 | Floor 5 |
|---|---|---|---|
| SNIPER | 52.9 | 62.6 | 104.2 |
| KNIGHT | 44.7 | 66.7 | 71.7 |
| WIZARD | 44.1 | 49.6 | 56.7 |
| MAGE | 41.4 | 47.3 | 52.7 |
| CRYOMANCER | 37.0 | 40.0 | 47.2 |
| PYROMANCER | 23.2 | 31.3 | 32.0 |

## Damage taken (average HP lost per wave)

| Hero | Floor 1 | Floor 3 | Floor 5 |
|---|---|---|---|
| KNIGHT | 0.0 | 0.0 | 0.0 |
| CRYOMANCER | 0.0 | 1.5 | 1.0 |
| SNIPER | 0.3 | 0.0 | 0.0 |
| WIZARD | 1.0 | 1.5 | 1.0 |
| MAGE | 1.0 | 2.0 | 2.0 |
| PYROMANCER | 2.0 | 2.5 | 2.0 |

No hero died in any wave trial (3 trials at floor 1, 2 at floors 3 and 5).

## Boss survival

Same bot, dropped into a boss room on the matching floor with starting weapons only, no relics,
60-second cap. Two trials per cell; the number is **seconds survived**, with deaths in brackets,
measured before the v4.5/v4.6 passes.

| Hero | F1 LICH WARDEN | F2 BONE TITAN | F3 CRIMSON CHOIR | F4 OBSIDIAN SERAPH | F5 DEVOURER |
|---|---|---|---|---|---|
| CRYOMANCER | 60 (0) | 60 (0) | 60 (0) | 60 (0) | 60 (0) |
| KNIGHT | 60 (0) | 39.5 (1) | 60 (0) | 22.5 (2) | 44.7 (2) |
| SNIPER | 60 (0) | 60 (0) | 60 (0) | 39.0 (2) | 45.7 (2) |
| PYROMANCER | 60 (0) | 41.9 (1) | 42.0 (1) | 22.5 (2) | 6.9 (2) |
| MAGE | 60 (0) | 26.2 (2) | 29.0 (2) | 19.9 (2) | 16.4 (2) |
| WIZARD | 60 (0) | 23.2 (2) | 32.4 (2) | 19.0 (2) | 12.4 (2) |

Bosses actually killed inside the window:

| Hero | F1 | F2 | F3 | F4 | F5 |
|---|---|---|---|---|---|
| KNIGHT | 13.0 / 17.3 s | 19.1 s (1 of 2) | 18.6 / 25.6 s | - | - |
| SNIPER | 17.5 / 19.9 s | 25.9 / 31.3 s | 37.9 / 44.4 s | - | - |
| PYROMANCER | 19.8 / 33.7 s | 33.1 s (1 of 2) | - | - | - |
| MAGE | 22.5 / 29.5 s | - | - | - | - |
| WIZARD | 22.3 / 22.4 s | - | - | - | - |
| CRYOMANCER | 46.4 / 48.9 s | - | - | - | - |

## With a full relic set

Same bot, same waves and bosses, but every hero starts with four relics - a full set, i.e. what a
run looks like once all four slots are filled. Each hero's set is the build they would actually aim
for, at the top tier of each chain:

| Hero | Relics |
|---|---|
| MAGE | ARCANE MIGHT V, QUICK HANDS V, SPLIT BOLT, KEEN EYE IV |
| WIZARD | ARCANE MIGHT V, QUICK HANDS V, CRIT POWER III, KEEN EYE IV |
| SNIPER | ARCANE MIGHT V, QUICK HANDS V, CRIT POWER III, KEEN EYE IV |
| KNIGHT | ARCANE MIGHT V, QUICK HANDS V, HEART CONTAINER V, CRIT POWER III |
| PYROMANCER | CINDER TOUCH III, PYRE III, WILDFIRE II, ARCANE MIGHT V |
| CRYOMANCER | FROSTBITE III, DEEP FREEZE III, GLACIER II, ARCANE MIGHT V |

### Clear time with relics (seconds, two trials)

| Hero | Floor 1 | Floor 3 | Floor 5 | bare F5 | speedup at F5 |
|---|---|---|---|---|---|
| MAGE | 4.4 | 5.8 | **6.9** | 17.0 | 2.5x |
| SNIPER | 4.9 | 4.9 | 7.6 | 8.6 | 1.1x |
| KNIGHT | 5.8 | 6.7 | 8.8 | 12.5 | 1.4x |
| WIZARD | 4.5 | 7.1 | 9.8 | 15.8 | 1.6x |
| CRYOMANCER | 4.8 | 10.2 | 11.3 | 19.0 | 1.7x |
| PYROMANCER | 9.7 | 15.0 | 15.7 | 28.0 | 1.8x |

### Bosses with relics

Two trials per cell; **K** = boss killed (seconds shown), **D** = died, **S** = survived the 60 s cap.

| Hero | F2 Titan | F3 Choir | F4 Seraph | F5 Devourer |
|---|---|---|---|---|
| MAGE | K 9.0 | K 14.3 | D 13.2 / D 10.7 | D 10.8 / K 39.3 |
| WIZARD | K 16.2 | K 23.0 | D 14.1 / D 13.3 | D 25.0 / D 41.9 |
| SNIPER | K 12.2 | K 20.8 | K 25.6 / K 26.2 | D 19.4 / K 48.4 |
| KNIGHT | K 11.6 | K 12.3 | D 17.4 / K 26.7 | D 26.5 / D 29.1 |
| PYROMANCER | K 25.9 | K 43.5 | D 26.8 / D 29.0 | D 18.0 / D 22.1 |
| CRYOMANCER | K 44.6 | S 60 (10% left) | S 60 / S 60 (47% left) | S 60 / S 60 (3% left) |

With four relics the early and mid bosses stop being walls, but the **Obsidian Seraph** and the
**Devourer** stay lethal even fully geared.

## Balance pass v4.5

- **Pyromancer**: max HP 6 → 7, damage 5 → 6, ember damage factor 0.25 → 0.30, ember lifetime
  0.20-0.30 s → 0.32-0.44 s (reach ~75 px → ~110 px). Burn rules untouched: ticks still deal
  exactly 1 damage, stacks still only raise the tick rate.
- **Wizard**: max HP 4 → 5.
- **Cryomancer**: storm tick 0.18 s → 0.16 s and radius 60 px → 66 px.

## Five-trial pass (v4.5)

Five trials per cell, same bot and waves. Clear times are mean ± standard deviation.

| Hero | Floor 1 | Floor 3 | Floor 5 |
|---|---|---|---|
| SNIPER | **6.1 ±0.5** | **10.1 ±1.7** | **10.8 ±0.9** |
| KNIGHT | 7.3 ±0.4 | 10.1 ±0.3 | 12.1 ±1.1 |
| WIZARD | 7.4 ±0.1 | 12.0 ±1.0 | 15.8 ±0.9 |
| CRYOMANCER | 8.0 ±0.5 | 12.7 ±3.0 | 15.6 ±1.9 |
| PYROMANCER | 8.3 ±1.2 | 12.1 ±0.8 | 14.6 ±1.0 |
| MAGE | 8.6 ±0.5 | 12.7 ±0.7 | 15.4 ±4.0 |

Boss fights, five trials per boss (60 s cap). **Mean seconds**, then deaths and kills out of 5:

| Hero | F1 Warden | F2 Titan | F3 Choir | F4 Seraph | F5 Devourer |
|---|---|---|---|---|---|
| KNIGHT | 12.1 s, 0 d, 5 k | 17.7 s, 1 d, 4 k | 21.0 s, 0 d, 5 k | 40.5 s, 2 d, 3 k | 37.0 s, 5 d, 0 k |
| PYROMANCER | 14.3 s, 0 d, 5 k | 20.0 s, 0 d, 5 k | 33.1 s, 2 d, 3 k | 31.2 s, 3 d, 2 k | 26.4 s, 4 d, 0 k |
| SNIPER | 18.4 s, 0 d, 5 k | 35.6 s, 0 d, 5 k | 41.6 s, 0 d, 5 k | 50.9 s, 3 d, 0 k | 31.1 s, 5 d, 0 k |
| WIZARD | 22.9 s, 0 d, 5 k | 32.5 s, 5 d, 0 k | 35.7 s, 3 d, 2 k | 21.8 s, 5 d, 0 k | 28.3 s, 5 d, 0 k |
| MAGE | 25.1 s, 0 d, 5 k | 28.9 s, 5 d, 0 k | 50.6 s, 3 d, 2 k | 19.8 s, 5 d, 0 k | 23.3 s, 5 d, 0 k |
| CRYOMANCER | 42.7 s, 0 d, 5 k | 60 s, 0 d, 0 k | 60 s, 0 d, 0 k | 60 s, 0 d, 0 k | 60 s, 0 d, 0 k |

Cryomancer's Devourer runs ended at 28% HP every single trial and the Seraph at 20% every trial:
the bosses' phase gates cap her steady damage, so silence is her kill count, not variance.

## Mage and wizard buffs (v4.6)

Both heroes died on 5 of 5 attempts to the Titan, Seraph and Devourer, so:

- **Mage**: max HP 5 → 6, damage 9 → 10, fire interval 0.125 s → 0.115 s (8.7 shots/s).
- **Wizard**: max HP 5 → 6, damage 12 → 13, mana regen 30 → 36 and cost per cast 6 → 5. Mana used
  to cap his cast rate at 6/s; measured on the live build it now sits at 100 while casting.

Five-trial results after the buffs:

| Hero | Floor 1 | Floor 3 | Floor 5 |
|---|---|---|---|
| MAGE | 7.5 ±0.3 | 10.8 ±0.2 | 13.7 ±0.8 |
| MAGE before | 8.6 ±0.5 | 12.7 ±0.7 | 15.4 ±4.0 |
| WIZARD | 7.4 ±0.6 | 11.7 ±0.6 | 14.8 ±0.9 |
| WIZARD before | 7.4 ±0.1 | 12.0 ±1.0 | 15.8 ±0.9 |

Boss fights after the buffs (mean seconds, deaths, kills out of 5):

| Hero | F1 Warden | F2 Titan | F3 Choir | F4 Seraph | F5 Devourer |
|---|---|---|---|---|---|
| MAGE | 18.6 s, 0 d, 5 k | 33.0 s, 4 d, 1 k | 43.3 s, 2 d, 3 k | 28.6 s, 5 d, 0 k | 25.1 s, 5 d, 0 k |
| MAGE before | 25.1 s, 0 d, 5 k | 28.9 s, 5 d, 0 k | 50.6 s, 3 d, 2 k | 19.8 s, 5 d, 0 k | 23.3 s, 5 d, 0 k |
| WIZARD | 19.7 s, 0 d, 5 k | 37.2 s, 3 d, 2 k | 37.1 s, 4 d, 1 k | 23.3 s, 5 d, 0 k | 31.8 s, 5 d, 0 k |
| WIZARD before | 22.9 s, 0 d, 5 k | 32.5 s, 5 d, 0 k | 35.7 s, 3 d, 2 k | 21.8 s, 5 d, 0 k | 28.3 s, 5 d, 0 k |

The mage now clears a floor-5 wave in 13.7 s (third fastest, ahead of the pyromancer) and takes the
Warden in 18.6 s instead of 25.1 s; both heroes win Titan fights they used to lose outright. The
**Obsidian Seraph and Devourer still kill both heroes 5/5** - the extra heart lengthens those
fights by a few seconds rather than changing the outcome. The wizard's Choir result slipped from
2 kills to 1, which is inside the noise for five trials.

## Reading the table

- The **knight** and **sniper** are the strongest single-target heroes. The sniper's floor-5 number
  swings between 10.0 s and 11.7 s over five trials because crits and ammo types dominate a short
  wave.
- The **cryomancer** sits mid-pack and takes almost no damage, which is the point of the chill: she
  buys safety rather than speed, and she cannot finish bosses at all.
- The **pyromancer** was the slowest in the first pass by a wide margin: the bot only holds the
  stream on target between dodges, and her damage is a burn that needs contact time to stack. The
  v4.5 ember buffs closed most of that gap, but treat her row as a floor, not a fair reading.
- Wave sizes here are smaller than a real pack, so AoE heroes (cryomancer, pyromancer) scale better
  in actual rooms than these numbers suggest.
- Five trials still leaves floor-1 and floor-3 gaps of a second or less between most heroes, which
  is inside one standard deviation; only the sniper/knight tier and the bosses separate cleanly.
