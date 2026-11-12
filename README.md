# Crypt of the Lich Warden

A neon-arcane pixel bullet-hell roguelike that runs in a single browser tab. Five floors, five bosses, 159 relics and four playable classes.

## Play

**https://hrw233.github.io/crypt-of-the-lich-warden/**

### Heroes

- **MAGE** - balanced arcing bolts
- **WIZARD** - mana-fuelled caster with a four-spell book (`E`): Arcane Bolt, Frost Lance, Ember Fan and Void Orb
- **SNIPER** - ghillie-suited marksman, one huge shot on a long reload
- **KNIGHT** - sword-only melee, wide swing arc, 7 HP and 3 armor plates

You carry at most **four relics** per run; a fifth choice replaces whichever slot you pick. Each class draws from its own pool of class-specific relic cards. The relic draft offers **3 rerolls per run** and can be **skipped**.

### Armor

Every hero has armor plates (mage and wizard none, sniper one, knight three). Plates soak incoming damage point for point before hearts are touched, regenerate one at a time, refill by one on entering a room, and fully refill when you descend. Relics can add plates or speed up the reforge.

### Difficulty

Pick **EASY**, **MEDIUM** or **HARD** on the title screen (`F1`-`F3` or click). Easy weakens and thins out enemies, but **easy runs never unlock relics or save records**. Medium is the default; hard adds tougher, faster and more numerous enemies.

### Rooms

Floors hold 8, 9, 10, 11 and 12 rooms respectively; floors 3 and deeper hide a second reliquary with an extra relic draft.

Controls: `WASD` move, mouse aim, hold left mouse to fire, `SPACE` or right mouse to dash, `1`-`4` or arrows to pick a hero, `F1`-`F3` difficulty, `E` spell book (wizard), `L` relic vault, `ESC` pause menu (resume, restart, main menu), `M` mute, `F` fps, `G` effects.

## Deployment

This repository publishes the game to GitHub Pages with a workflow (`.github/workflows/pages.yml`). It mirrors the production build of the game into an artifact and deploys it; the same job also mirrors the built files onto the `gh-pages` branch so the published code is browsable here.

The canonical source lives in the local project the game is developed in. Re-run the workflow (manual dispatch or a push to `main`) to refresh the published copy.
