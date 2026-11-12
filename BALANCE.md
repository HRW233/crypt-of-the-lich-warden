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

## Boss survival

Same bot, dropped into a boss room on the matching floor with starting weapons only, no relics,
60-second cap. Two trials per cell; the number is **seconds survived**, with deaths in brackets,
and the second figure is the boss's remaining HP when the fight ended.

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

The Cryomancer never died in any boss trial and finished the Devourer at 1% HP twice; her chill
suppresses the bullet patterns that kill everyone else. The Devourer is nobody's easy fight: the
sniper and knight last longest but still lose to it, and the pyromancer dies in 6.9 s both times.

## Reading the table
