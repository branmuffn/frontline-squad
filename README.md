# Frontline: Solo Ops

A single-player browser FPS inspired by classic Combat Arms. Three.js r128, no backend, no accounts.

## Run it

```bash
npm install
npm run dev               # local dev server with hot reload
npm run build             # production build in dist/
npm run build:standalone  # one self-contained HTML file in dist-standalone/
```

`dist-standalone/frontline_solo_ops.html` is already built. Open it in any modern desktop browser with an internet connection (it loads three.js from cdnjs).

## What's in the game

- **Modes:** Free for All (first to 20, 8 min, 3–9 bots), Team Deathmatch (3v3 to 6v6, 10 min), Survival (escalating waves, three lives).
- **Maps:** Steel Yard (warehouse with mezzanine, catwalk, climbable container stack) and Dust Outpost (rooftop access, two watchtowers, houses, market street).
- **Weapons:** M4A1, MP5, M870 (shell-by-shell reload), L96A1 (scoped), USP .45, knife (backstab instakill), cookable frag grenades.
- **Killstreaks:** 3 kills earns a Recon UAV, 5 a mortar strike, 7 a sentry gun.
- **Progression:** XP for kills and medals, 20 ranks with insignia, weapon camos unlocked by rank, career stats. Everything is saved in localStorage.
- **Bots:** they patrol, investigate gunfire, hunt your last known position, flank, take cover and peek, grab health, dodge and throw grenades. Sniper bots show a laser while aiming.

## Project layout

```
src/core      config (all balance numbers), input, storage, shared state
src/engine    renderer (world + viewmodel pass), synthesized audio, particles and decals
src/world     physics/collision/raycasts, auto-generated nav graph + A*, map builder, maps
src/entities  player, bots/AI, soldier models, viewmodels, grenades, pickups, killstreaks
src/game      match flow and modes, XP/ranks
src/ui        HUD, menus, rank badges
```

Tuning lives in `src/core/config.js`.

In the browser console, `window.__frontline` exposes the game state for debugging.

## Notes

- **Ctrl+W:** crouch defaults to C. Ctrl also works, but Ctrl+W closes the tab in most browsers. During a match the page asks before leaving.
- **Mouse capture:** if a page refuses mouse capture (some embedded previews do), the pause menu offers "Play without mouse lock".
