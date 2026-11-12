# Crypt of the Lich Warden

A neon-arcane pixel bullet-hell roguelike that runs in a single browser tab. Five floors, five bosses, 112 relics and three playable classes.

## Play

**https://hrw233.github.io/crypt-of-the-lich-warden/**

- **MAGE** - balanced arcing bolts
- **WIZARD** - mana-fuelled caster with a four-spell book (`E`): Arcane Bolt, Frost Lance, Ember Fan and Void Orb
- **SNIPER** - ghillie-suited marksman, one huge shot on a long reload

You carry at most **four relics** per run; a fifth choice replaces the oldest. Each class draws from its own pool of class-specific relic cards.

Controls: `WASD` move, mouse aim, hold left mouse to fire, `SPACE` or right mouse to dash, `1`-`3` or arrows to pick a hero, `E` spell book (wizard), `L` relic vault, `ESC` pause menu (resume, restart, main menu), `M` mute, `F` fps, `G` effects.

## Deployment

This repository publishes the game to GitHub Pages with a workflow (`.github/workflows/pages.yml`). It mirrors the production build of the game into an artifact and deploys it; the same job also mirrors the built files onto the `gh-pages` branch so the published code is browsable here.

The canonical source lives in the local project the game is developed in. Re-run the workflow (manual dispatch or a push to `main`) to refresh the published copy.
