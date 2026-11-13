# Crypt of the Lich Warden

A neon-arcane pixel bullet-hell roguelike that runs in one browser tab. Five floors, five bosses, 176 relics, six heroes, and a two-player co-op mode.

No build step and no image files: every sprite is drawn with the canvas API at runtime, and the scripts load with plain `<script>` tags.

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
| H, J | host a co-op room, open the room list |
| Esc or P | pause; in co-op both players must ask to pause |
| M, F, G | mute, FPS counter, low-FX mode |

On a phone or tablet the game swaps the keyboard for an on-screen pad: a d-pad bottom left, FIRE and DASH bottom right, a pause button in the middle, and aim that locks onto the nearest enemy. Touch is detected automatically; add `?touch=1` to the URL to force it on.

## A run

Five floors, each a set of generated rooms ending in a boss. Clearing a room opens the doors; treasure rooms offer a relic draft, a score cache, an armor plate or a heal. Death ends the run.

**Difficulty** is picked on the title screen: EASY (-20% enemy health, slower bullets, one fewer enemy per room, and no relic or record unlocks), MEDIUM, HARD (+30% health, faster bullets, one extra enemy).

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

## Co-op

Two machines, one run. P1's browser simulates everything; P2 sends input and draws what P1 reports. Nothing to install, no account, no server on anyone's machine:

1. P1 presses **H**. A chip under the score shows the room code for the whole session.
2. P2 opens the same URL, presses **J**, and picks the room from the list.
3. Press **P** to pause: in co-op a pause is a vote, so it only takes effect when both players ask for it, and both must release it.

### How the connection is made

Hosting asks the page's own origin for a relay. Whatever answers - the published site's Worker, or a `server/lan.js` someone is running - is used for one job: signaling. The two browsers then open a direct WebRTC data channel, and snapshots (20 Hz) and guest input (30 Hz) cross that channel. A data channel costs nothing per message, so sessions are not metered and there is no daily play limit.

The relay stays underneath as a fallback. On the network pairs where traversal fails (symmetric NATs, some phone hotspots) it carries the game instead, at a halved snapshot rate - the session works, it is just slower and it does use the relay's write quota. A lost direct link drops back to the relay mid-run and says so.

### Hosting a relay on the LAN

Sometimes the fast path is worth running: no STUN lookup, no traversal, one hop on the local network.

```
node server/lan.js          # no dependencies
npm run lance               # Lance (lance-gg) + socket.io, after npm install
```

It prints both addresses:

```
  this machine : http://localhost:8080/
  on the LAN   : http://192.168.1.204:8080/
```

`PORT=9000 node server/lan.js` if 8080 is taken. Opening the page from that server means the direct link is not needed at all, though it will still be attempted.

[Lance](https://github.com/lance-gg/lance) owns a socket.io server on P1's machine: connections, rooms, the ping/latency monitor. Its game engine is deliberately empty - this game has no server-side rules, P1's browser is the authority - so Lance provides the network, not the simulation. See the comment at the top of `server/lance.mjs`.

### Joining by address

`ROOMS` (J) lists open runs from a public registry. The list is a convenience, not the only door: typing P1's address in the `P1 ADDRESS` box still works and is remembered, for when the list cannot reach you.

## Project layout

```
index.html            script tags and the canvas
style.css             page frame, canvas scaling
js/core.js            constants, math, drawing helpers, palettes
js/player.js          heroes, movement, dash, weapons
js/enemies.js         enemy behaviour and bullets
js/bosses.js          the five bosses
js/dungeon.js         room generation, floors, props
js/bullets.js         player projectiles
js/upgrades.js        the relic pool, tiers, unlock gates
js/particles.js       the particle system
js/sound.js           synthesised audio (no files)
js/net.js             co-op transport, direct link, lobby, guest view
js/game.js            input, state machine, HUD, every screen
js/socket.io.min.js   vendored socket.io client (MIT)
deploy/worker.js      the site: static files, run registry, relay, signaling
server/relay.js       static server + relay, shared by both entry points
server/lan.js         dependency-free server
server/lance.mjs      Lance (lance-gg) + socket.io server
package.json          lance-gg, socket.io, socket.io-client
tools/testbot.js      balance bot (test only, never shipped)
```

There is no bundler: `index.html` loads the files in a fixed order, so `core.js` must stay first and `game.js` last.

## How the GitHub Pages copy is built

The game is published to Freebuff Sites; the GitHub Pages URL is a mirror of that deployment, kept current by `.github/workflows/pages.yml`.

On every push to `main` the workflow:

1. downloads `index.html`, `style.css` and every `js/*.js` the page asks for, from the deployment;
2. writes `js/` and `style.css` back into this repository, so the code here matches what ships (it skips the commit when nothing changed, which is what stops it from re-triggering itself);
3. checks that a clone could actually host co-op;
4. mirrors the same files to the `gh-pages` branch and publishes the artifact with `actions/deploy-pages`.

One caveat worth knowing: the `pages` concurrency group uses `cancel-in-progress: false` on purpose. Cancelling a deploy after Pages has registered it orphans that deployment, and every later run is then rejected with `due to in progress deployment` until the stale record is cancelled by hand.

## Releasing a version

1. Bump `BUILD_TAG` in `js/game.js` and the `?v=` on every tag in `index.html`.
2. Copy `index.html`, `js/*.js` and `style.css` into `dist/`.
3. Deploy, then commit `index.html` to `main` - the workflow syncs the rest.

## Licence

No licence file yet; treat it as all rights reserved until one is added. `js/socket.io.min.js` is the socket.io client, MIT licensed.
