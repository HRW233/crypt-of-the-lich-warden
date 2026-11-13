# Crypt of the Lich Warden

A neon-arcane pixel bullet-hell roguelike that runs in one browser tab. Five floors, five bosses, 176 relics, six heroes, and a two-player co-op mode over your local network.

No build step, no dependencies, no image files: every sprite is drawn with the canvas API at runtime, and the eleven scripts load with plain `<script>` tags.

**Play:** https://hrw233.github.io/crypt-of-the-lich-warden/

## Controls

| Input | Action |
| --- | --- |
| WASD or arrows | move |
| Left mouse, held | fire |
| Space or right mouse | dash (charges refill on a timer) |
| E | spell book (wizard, cryomancer) |
| Q | cycle ammo (sniper) or cast (cryomancer) |
| 1 - 6 | pick a hero on the title screen |
| L, O | relic vault, profiles |
| H, J | host a LAN room, open the room list |
| Esc or P | pause; in co-op both players must ask to pause |
| M, F, G | mute, FPS counter, low-FX mode |

On a phone or tablet the game swaps the keyboard for an on-screen pad: a d-pad bottom left, FIRE and DASH bottom right, a pause button in the middle, and aim that locks onto the nearest enemy. Touch is detected automatically; add `?touch=1` to the URL to force it on.

## A run

Five floors, each a set of generated rooms ending in a boss. Clearing a room opens the doors; treasure rooms offer a relic draft, a score cache, an armor plate or a heal. Death ends the run.

**Difficulty** is picked on the title screen: EASY (-20% enemy health and bullet speed, one fewer enemy, no relic or record unlocks), MEDIUM, HARD (+30% health, faster bullets, one extra enemy).

**Armor** plates soak damage point for point before hearts, regenerate one at a time, and refill when you descend. Mage and wizard have none, sniper one, knight three.

## Heroes

- **MAGE** - balanced arcing bolts.
- **WIZARD** - mana caster with a four-spell book: Arcane Bolt, Frost Lance, Ember Fan, Void Orb.
- **SNIPER** - one huge shot on a long reload, with cycling ammo types.
- **KNIGHT** - sword only, heavy armor, and bullets that cross the swing are parried.
- **PYROMANCER** - flamethrower with stacking burn ticks.
- **CRYOMANCER** - snowstorm and spell book; unlocks only after you win a run once.

## Relics

A run holds at most **four** relics. Every draft offers **three rerolls** and can be skipped, and each class draws from its own pool. Once all four slots are full, picking a card opens a swap screen: put the new relic into a slot, or spend the pick to raise a held relic to its next tier. Tiers stack - `MIGHT I` and `MIGHT II` in one slot give both bonuses.

171 standard relics and 5 legendaries, many gated behind lifetime stats (slain bosses, bullets grazed, runs won) tracked per profile.

## Co-op over the LAN

Two machines, one run. P1's browser simulates everything; P2 sends input and draws what P1 reports.

**Start the relay on P1's machine**, from this folder:

```
node server/lan.js
```

It prints both addresses:

```
  this machine : http://localhost:8080/
  on the LAN   : http://192.168.1.204:8080/
```

`PORT=9000 node server/lan.js` if 8080 is taken. The server has no dependencies; it serves the game files and relays messages between the two browsers, which cannot open sockets to each other directly.

**Then:**

1. P1 opens the address, presses **H** to host. A chip under the score shows `192.168.1.204:8080` and the room code for the whole session - click it to copy the address.
2. P2 opens the same URL on the other machine, presses **J**, types that address in the `P1 ADDRESS` box and presses Enter. The address is remembered, so later sessions are J then Enter.
3. Press **P** to pause: in co-op a pause is a vote, so it only takes effect when both players ask for it, and both must release it.

The relay is deliberately dumb: each peer POSTs JSON and long-polls for the other's messages, keyed by a four-letter room code. Snapshots go out at 20 Hz, guest input at 30 Hz, and the guest predicts its own movement and dash so they read immediately rather than one packet late.

`ROOMS` (J) also lists open runs from a public registry, but that list is a convenience: joining by address is the path that always works, including when the registry is unreachable.

## Project layout

```
index.html          script tags and the canvas
style.css           page frame, canvas scaling
js/core.js          constants, math, drawing helpers, palettes
js/player.js        heroes, movement, dash, weapons
js/enemies.js       enemy behaviour and bullets
js/bosses.js        the five bosses
js/dungeon.js       room generation, floors, props
js/bullets.js       player projectiles
js/upgrades.js      the relic pool, tiers, unlock gates
js/particles.js     the particle system
js/sound.js         synthesised audio (no files)
js/net.js           LAN transport, lobby, guest view
js/game.js          input, state machine, HUD, every screen
server/lan.js       static server + co-op relay for LAN play
tools/testbot.js    balance bot (test only, never shipped)
```

There is no bundler: `index.html` loads the files in the order above, so `core.js` must stay first and `game.js` last.

## How the GitHub Pages copy is built

The game is published to Freebuff Sites; the GitHub Pages URL is a mirror of that deployment, kept current by `.github/workflows/pages.yml`.

On every push to `main` the workflow:

1. downloads `index.html`, `style.css` and all eleven `js/*.js` from the deployment;
2. writes `js/` and `style.css` back into this repository, so the code here matches what ships (it skips the commit when nothing changed, which is what stops it from re-triggering itself);
3. mirrors the same files to the `gh-pages` branch;
4. publishes the artifact with `actions/deploy-pages`.

One caveat worth knowing: the `pages` concurrency group uses `cancel-in-progress: false` on purpose. Cancelling a deploy after Pages has registered it orphans that deployment, and every later run is then rejected with `due to in progress deployment` until the stale record is cancelled by hand.

## Releasing a version

1. Bump `BUILD_TAG` in `js/game.js` and the `?v=` on every tag in `index.html`.
2. Copy `index.html`, `js/*.js` and `style.css` into `dist/`.
3. Deploy, then commit `index.html` to `main` - the workflow syncs the rest.

## Licence

No licence file yet; treat it as all rights reserved until one is added.
