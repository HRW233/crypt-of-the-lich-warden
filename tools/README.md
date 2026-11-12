# Balance-test bot

`testbot.js` drives a hero through scripted fights so balance changes can be measured without a
human. It is test-only: it is not loaded by the game, not copied into `dist/`, and never ships.

## Running it

Serve the project root and open the game in a browser, then inject the script from the console
(or from an automation tool) and drive it:

```js
const txt = await (await fetch('/tools/testbot.js')).text();
new Function(txt)();
BOT.init(game);

BOT.game.charIndex = 0;         // 0 mage, 1 wizard, 2 sniper, 3 knight, 4 pyromancer, 5 cryomancer
BOT.reset(0);                   // fresh run on MEDIUM
BOT.fightWave(5, 2400);         // fixed 8-enemy wave scaled to floor 5, returns secs / hp lost
BOT.reset(0);
BOT.fightBoss(4, 60);           // boss of floor 4, 60 s cap, returns secs / died / killed
```

`fightWave` and `fightBoss` reset the run themselves, so a loop of calls is independent.

## Policy

- **Aim**: cursor on the nearest live enemy, left button held.
- **Movement**: every frame it scores 16 directions x 2 step lengths (32 candidates). Each
  candidate is scored on threat over the next 0.45 s plus how well it holds the hero's preferred
  range from the target, with a small bias toward orbiting rather than charging straight in.
- **Threat model**: closest approach of every hostile bullet (homing rounds get a wider berth),
  beam lines predicted to where a tracking beam will point by the time it fires, enemy bodies, and
  arena walls.
- **Dash**: uses the space bar when a bullet will land within 0.16 s (i-frames beat walking), or
  when even the best candidate direction is still dangerous.
- **Preferred range**: knight 26 px, pyromancer 55 px, mage/cryomancer 100 px, wizard 105 px,
  sniper 150 px.

## What better dodging changed

The first bot dodged with a repulsion force field and never dashed. It was replaced with the
sampled model above (plus dashing, a homing margin and beam-sweep prediction) and the same five
trials per cell were re-run on `v4.6`. Deaths out of 5 per boss, summed over the six heroes:

| Boss | old bot | new bot |
|---|---|---|
| F1 Lich Warden | 0 | 0 |
| F2 Bone Titan | 11 | **1** |
| F3 Crimson Choir | 8 | 10 |
| F4 Obsidian Seraph | 18 | 22 |
| F5 Devourer | 24 | **20** |
| Total | 61 | **53** |

Boss kills, out of 30 attempts per boss, went 66 -> 71 overall. Per hero at the Devourer (deaths
out of 5): sniper 5 -> 4, knight 5 -> 3, pyromancer 4 -> 3, mage and wizard unchanged at 5,
cryomancer 0.

Clear times barely moved, which is the intended result: the bot is a measuring instrument, and its
damage output should not change just because it dodges better.

## Known weaknesses

- **The Obsidian Seraph got worse, not better** (18 -> 22 deaths). Its fights mix diving with beam
  sweeps, and the bot's panic-dash when every direction looks bad costs it there. An A/B run with
  that trigger disabled gave the knight 4 deaths instead of 5 on the Seraph, which is where to start
  next time.
- Wall and gap patterns (the Choir's bullet walls) are only partly solved: two step lengths help,
  but the bot cannot plan a route through a gap it has not reached yet.
- The bot never uses relics, abilities or ammo types, so it measures starting kits and raw scaling.
