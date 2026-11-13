# Crypt of the Lich Warden

A neon-arcane pixel bullet-hell roguelike that runs in one browser tab. Five floors, five bosses, 176 relics, six heroes, and a two-player co-op mode.

No build step for the game itself: every sprite is drawn with the canvas API at runtime and the scripts load with plain `<script>` tags.

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
- **KNIGHT** - sword only, heavy armor, and bullets that cross the swing are parried back at the closest enemy.
- **PYROMANCER** - flamethrower with stacking burn ticks.
- **CRYOMANCER** - snowstorm and spell book; unlocks only after you win a run once.

## Relics

A run holds at most **four** relics. Every draft offers **three rerolls** and can be skipped, and each class draws from its own pool. Once all four slots are full, picking a card opens a swap screen: put the new relic into a slot, or spend the pick to raise a held relic to its next tier. Tiers stack - `MIGHT I` and `MIGHT II` in one slot give both bonuses.

171 standard relics and 5 legendaries, many gated behind lifetime stats (slain bosses, bullets grazed, runs won) tracked per profile.

## Co-op

Two players, one run. P1's browser simulates everything; P2 sends input and draws what P1 reports. Nothing about the game changes between the three ways to connect it.

### Nothing to install

On the published page, press **H** to host. The site's own Worker carries the traffic - messages and host presence live in D1 - so there is no server to run anywhere. P2 opens the same page, presses **J**, sees the room in the list and joins.

This relay is a short-poll store rather than a socket, so the client halves its snapshot and input rates while it is talking to it. Co-op is playable but looser than on a LAN, and every message is one billed request: good for a session, not the thing to use if you play for hours every night.

### With Lance, on a LAN

[Lance](https://github.com/lance-gg/lance) (`lance-gg`) owns a socket.io server on P1's machine: connections, rooms, the ping/latency monitor. The game's snapshots and inputs ride its sockets.

```
npm install
npm run lance        # same as: node server/lance.mjs
```

Lance's model is a server that runs the game logic. This game does not work that way - P1's browser is the authority - so the server-side game engine is deliberately empty and Lance provides the network, not the rules. See the comment at the top of `server/lance.mjs`.

### With no dependencies at all

```
node server/lan.js
```

Plain node, nothing to install: the static server plus a long-poll relay. Same rooms, same join list, a little more latency than the socket.

### Joining

Whichever server is in play, the flow is the same:

1. P1 presses **H**. A panel shows the address and room code straight away, then a chip under the score keeps them on screen for the whole session - click it to copy.
2. P2 opens the same page (or P1's address, when they are hosting on the LAN), presses **J**, and picks the room from the list. Typing P1's address in the `P1 ADDRESS` box still works and is remembered, for when the list cannot reach you.
3. Press **P** to pause: in co-op a pause is a vote, so it only takes effect when both players ask for it, and both must release it.

Rooms are listed while their host is still talking. The host heartbeats on a timer rather than from the render loop, so alt-tabbing to send P2 the address does not drop the room off the list.

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
js/net.js             co-op transport, lobby, guest view
js/game.js            input, state machine, HUD, every screen
js/socket.io.min.js   vendored socket.io client (MIT)
deploy/worker.js      the site: static files, run registry, hosted relay
server/relay.js       static server + relay, shared by both entry points
server/lan.js         dependency-free server
server/lance.mjs      Lance (lance-gg) + socket.io server
package.json          lance-gg, socket.io, socket.io-client
tools/testbot.js      balance bot (test only, never shipped)
```

The game loads its scripts in the order above, so `core.js` must stay first and `game.js` last. There is no bundler.

## How the GitHub Pages copy is built

The game is published to Freebuff Sites; the GitHub Pages URL is a mirror of that deployment, kept current by `.github/workflows/pages.yml`.

On every push to `main` the workflow:

1. downloads `index.html`, `style.css` and every `js/*.js` the page asks for, from the deployment;
2. writes `js/` and `style.css` back into this repository, so the code here matches what ships (it skips the commit when nothing changed, which is what stops it from re-triggering itself);
3. checks that the clone could actually host co-op - index.html, style.css, the server files, package.json and the bot, plus a script count taken from `index.html`;
4. mirrors the same files to the `gh-pages` branch and publishes the artifact with `actions/deploy-pages`.

One caveat worth knowing: the `pages` concurrency group uses `cancel-in-progress: false` on purpose. Cancelling a deploy after Pages has registered it orphans that deployment, and every later run is then rejected with `due to in progress deployment` until the stale record is cancelled by hand.

## Releasing a version

1. Bump `BUILD_TAG` in `js/game.js` and the `?v=` on every tag in `index.html`.
2. Copy `index.html`, `js/*.js` and `style.css` into `dist/`.
3. Deploy, then commit `index.html` to `main` - the workflow syncs the rest.

## Licence

No licence file yet; treat it as all rights reserved until one is added. `js/socket.io.min.js` is the socket.io client, MIT licensed.
