# Frontline: Solo Ops

A single-player browser FPS inspired by classic Combat Arms. Three.js r128, no backend, no accounts.

See `docs/ARCHITECTURE.md` for the architecture diagram, status and build/output pipeline.

## Run it

```bash
npm install
npm run dev               # local dev server with hot reload
npm run build             # production build in dist/
npm run build:standalone  # one self-contained HTML file in dist-standalone/
```

`dist-standalone/frontline_solo_ops.html` is already built. Open it in any modern desktop browser with an internet connection (it loads three.js from cdnjs).

## What's in the game

- **Modes:** Free for All, Team Deathmatch, Survival (escalating waves, three lives), Gun Game (11-tier ladder, knife kills demote), Infection (infected knife-hunters convert survivors), Capture the Flag (first to 3), Zombies (endless rounds, points, wall-buys, mystery box, power-ups), Sandbox (everything unlocked, no XP, rule toggles, B opens the weapon menu).
- **Maps:** Steel Yard, Dust Outpost, Atomic Acres (1950s test town), Cascade Gorge (canyon, railway bridge with freight train, ladders, creek).
- **Weapons:** M4A1, AK-47, MP5, M870, SPAS-12, M249, Mk 14 EBR (2× scope), L96A1 and Barrett .50 (4×/8× scopes), RPG-7 (Sandbox), USP .45, Desert Eagle, knife (backstab instakill), cookable frags.
- **World:** explosive barrels with chain reactions, weapon drops (E to swap), bullets punch through thin wood, wading slows you down.
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
