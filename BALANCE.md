# Hero balance — bot playtest

Every hero fights the **same wave**: 6 cultist acolytes + 2 bone archers ringing the player at
125 x 92 px, scaled by the floor's normal HP formula (`x1.0 / x1.8 / x2.6` for floors 1 / 3 / 5).
No relics, MEDIUM difficulty, starting weapons only.

The bot is the same for every hero: it aims at the nearest enemy, holds the trigger, kites to a
hero-specific range, and slides away from any hostile bullet within 36 px and any boss beam within
26 px. Close-range heroes (the knight and the pyromancer) are held at 26 px and 55 px; everyone
else kites at 100-150 px.

Measured 2026-11-12: bare numbers on `v4.1` / `v4.2`, relic set and bosses on `v4.4`, the pass
itself on `v4.5`.

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

No hero died in any trial (3 trials at floor 1, 2 at floors 3 and 5).

## Boss survival

Same bot, dropped into a boss room on the matching floor with starting weapons only, no relics,
60-second cap. Two trials per cell; the number is **seconds survived**, with deaths in brackets.

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

The Cryomancer never died in any boss trial; her chill suppresses the bullet patterns that kill
everyone else. The Devourer is nobody's easy fight: the sniper and knight last longest but still
lose to it, and the pyromancer died in 6.9 s both times before the v4.5 pass.

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

Damage taken with a full set is 0-2 HP per wave for every hero.

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

With four relics the early and mid bosses stop being walls: every hero kills the Titan and the
Choir, where the mage and wizard used to die to both. The **Obsidian Seraph** stays lethal to the
mage, wizard and pyromancer even fully geared, and the **Devourer** is still a coin flip or worse
for everyone except the sniper, whose burst is the only thing that races its finale.

## Balance pass v4.5

Bot data showed the pyromancer was last on every axis and the wizard died fastest, so:

- **Pyromancer**: max HP 6 → 7, damage 5 → 6, ember damage factor 0.25 → 0.30, ember lifetime
  0.20-0.30 s → 0.32-0.44 s (reach ~75 px → ~110 px). Burn rules untouched: ticks still deal
  exactly 1 damage, stacks still only raise the tick rate.
- **Wizard**: max HP 4 → 5.
- **Cryomancer**: storm tick 0.18 s → 0.16 s and radius 60 px → 66 px, lifting her clear speed
  without touching her chill strength.

Bare clear times after the pass (seconds, two trials):

| Hero | Floor 1 | Floor 3 | Floor 5 | F5 before |
|---|---|---|---|---|
| SNIPER | 6.0 | 11.3 | 12.2 | 8.6 |
| KNIGHT | 8.3 | 8.1 | 11.7 | 12.5 |
| PYROMANCER | 8.5 | 11.9 | **13.8** | 28.0 |
| WIZARD | 7.7 | 11.8 | 16.2 | 15.8 |
| MAGE | 8.2 | 13.6 | 17.1 | 17.0 |
| CRYOMANCER | 7.9 | 13.5 | 18.2 | 19.0 |

The pyromancer went from 28 s to under 14 s on a floor-5 wave - no longer the worst by a mile.
Against the Devourer her survival went from 6.9 s twice to 34.4 s (death) and 60 s (alive, boss at
30%), and she now kills the Obsidian Seraph in one of two trials.

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
the bosses' phase gates cap her steady damage, so silence is her kill count, not variance. The
mage's 8.4 s floor-5 clear among five runs of 15.9-17.9 s is the other outlier worth noting.

## Reading the table

- The **knight** and **sniper** are the strongest single-target heroes; the sniper's floor-5 number
  swings between 10.0 s and 11.7 s over five trials because crits and ammo types dominate a short
  wave.
- The **cryomancer** sits mid-pack and takes almost no damage, which is the point of the chill: she
  buys safety rather than speed.
- The **pyromancer** was the slowest in the first pass by a wide margin: the bot only holds the
  stream on target between dodges, and her damage is a burn that needs contact time to stack. The
  v4.5 ember buffs closed most of that gap, but treat her row as a floor, not a fair reading.
- Wave sizes here are smaller than a real pack, so AoE heroes (cryomancer, pyromancer) scale better
  in actual rooms than these numbers suggest.
- Five trials still leaves floor-1 and floor-3 gaps of a second or less between most heroes, which
  is inside one standard deviation; only the sniper/knight tier and the bosses separate cleanly.
