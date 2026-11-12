# Hero balance — bot playtest

Every hero fights the **same wave**: 6 cultist acolytes + 2 bone archers ringing the player at
125 x 92 px, scaled by the floor's normal HP formula (`x1.0 / x1.8 / x2.6` for floors 1 / 3 / 5).
No relics, MEDIUM difficulty, starting weapons only.

The bot is the same for every hero: it aims at the nearest enemy, holds the trigger, kites to a
hero-specific range, and slides away from any hostile bullet within 36 px. Close-range heroes
(the knight and the pyromancer, whose embers die within ~60 px) are held at 26 px and 45 px;
everyone else kites at 100-150 px.

`v4.1` / `v4.2`, measured 2026-11-12.

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

## Reading the table

- The **knight** and **sniper** are the strongest single-target heroes; the sniper's floor-5 number
  swings between 5.6 s and 11.6 s because crits and ammo types dominate a short wave.
- The **cryomancer** sits mid-pack and takes almost no damage, which is the point of the chill: she
  buys safety rather than speed.
- The **pyromancer** is the slowest in this test by a wide margin. The bot only holds the stream on
  target between dodges, and her damage is a burn that needs contact time to stack, so a bot that
  kites away loses most of it. Treat her row as a floor, not a fair reading.
- Wave sizes here are smaller than a real pack, so AoE heroes (cryomancer, pyromancer) scale better
  in actual rooms than these numbers suggest.
