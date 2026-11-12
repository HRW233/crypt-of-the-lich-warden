# Crypt of the Lich Warden

A neon-arcane pixel bullet-hell roguelike that runs in a single browser tab. Five floors, five bosses, 159 relics and four playable classes. Current build: **v1.9** (shown in the bottom-right of the title screen).

## Play

**https://hrw233.github.io/crypt-of-the-lich-warden/**

### Heroes

All four heroes share one hand-drawn pixel sprite: a 1px outline, three-tone robe shading, a shoulder cape, a two-frame walk cycle and class headgear the title cards reuse.

- **MAGE** - balanced arcing bolts, hooded circlet, staff with a gold focus stone
- **WIZARD** - mana-fuelled caster with a four-spell book (`E`): Arcane Bolt, Frost Lance, Ember Fan and Void Orb. Tall banded hat and a floating focus stone
- **SNIPER** - ghillie-suited marksman, one huge shot on a long reload. Ghillie brim, strands and rifle
- **KNIGHT** - sword-only melee. Visored helm, gold crest, pauldrons and back shield; wide swing arc, 7 HP, 3 armor plates, and enemies' bullets that cross his swing are **parried** back at them

### Relics

You carry at most **four relic slots**. Each draft offers **3 rerolls** and can be **skipped**, and each class draws from its own pool of class-specific cards.

Once all four slots are full, picking a card opens a **SWAP / UPGRADE** screen (`U` or `Tab` toggles the mode): swap the card into a slot, or spend the pick to raise a held relic to its next tier. Upgrades stack on top of the lower tiers, so `MIGHT I` + `MIGHT II` in one slot gives both bonuses.

### Treasure rooms

Treasure rooms come in four kinds, each with its own palette, props and reward:

- **RELIQUARY** - relic draft
- **GOLD VAULT** - score cache (+1200 x floor)
- **ARMORY** - a permanent armor plate for the run
- **SHRINE** - heals 3 HP and refills armor

Floors 3 and deeper hold a second treasure room, always of a different kind from the first.

### Armor

Every hero has armor plates (mage and wizard none, sniper one, knight three). Plates soak incoming damage point for point before hearts are touched, regenerate one at a time, refill by one on entering a room, and fully refill when you descend. Relics can add plates or speed up the reforge.

### Difficulty

Pick **EASY**, **MEDIUM** or **HARD** on the title screen (`F1`-`F3` or click). Easy weakens and thins out enemies, but **easy runs never unlock relics or save records**. Medium is the default; hard adds tougher, faster and more numerous enemies.

### Rooms

Floors hold 8, 9, 10, 11 and 12 rooms respectively.

Controls: `WASD` move, mouse aim, hold left mouse to fire, `SPACE` or right mouse to dash, `1`-`4` or arrows to pick a hero, `F1`-`F3` difficulty, `E` spell book (wizard), `L` relic vault, `ESC` pause menu (resume, restart, main menu), `M` mute, `F` fps, `G` effects.

## Deployment

This repository publishes the game to GitHub Pages with a workflow (`.github/workflows/pages.yml`). It mirrors the production build of the game into an artifact and deploys it; the same job also mirrors the built files onto the `gh-pages` branch so the published code is browsable here.

The canonical source lives in the local project the game is developed in. Re-run the workflow (manual dispatch or a push to `main`) to refresh the published copy.
