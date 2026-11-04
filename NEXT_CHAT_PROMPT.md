I'm continuing development of "Frontline: Solo Ops", a single-player browser FPS (Three.js r128) built over previous chats. The full project is attached as frontline-solo-ops-vite.zip: source (src/), PLAN.md (task list with every decision already made), README.md, scripts/build-standalone.mjs, the headless test harness (tests/), and git history (one commit per item).

## Status (update this line each session)
Round A, Round B (B1–B6), Phases 1–6 and extras X1 (prone) / X2 (train cars + doors) are DONE. Next: Phase 7 multiplayer, only after the user approves (decisions in PLAN.md). Architecture, status and build/output pipeline: docs/ARCHITECTURE.md. New tests since: hitbox, profile, fit, killcam, scope, lineup, vm, vehicles, heli, vehbots, doorways, prone, perf (see tests/README.md). Note: when publishing, copy the build to the artifact's container path (tests/ship.sh does this) and publish that path.

## Core working rules (most important)
- I'm token-limited (5-hour session cap and a weekly cap). Be efficient: short replies (what changed, what was tested, what's next), brief reasoning, read files with targeted grep/sed instead of whole files, batch related edits into one python/sed call, don't re-read code you already know.
- Still build high-quality work: test it, screenshot visual changes and review them before calling something done.
- Commit early and often, including mid-item when a big item is half done, so nothing is lost if a limit hits. After each finished item ALWAYS: run tests, commit, tick it in PLAN.md, rebuild, copy the HTML to /mnt/user-data/outputs/, update the artifact, re-zip. If I run out of tokens, I keep the last finished item.

## Setup
1. Unzip to /home/claude/frontline (if it unzips to a nested folder, flatten it), `npm install`, `sh tests/setup.sh`, `node scripts/build-standalone.mjs`. `npx vite build` must also keep working.
2. Read PLAN.md, README.md, tests/README.md and `git log --oneline` before changing anything.
3. Headless tests (details in tests/README.md): Playwright Chromium with SwiftShader; `node tests/regress.mjs 25` covers FFA/TDM/Survival/Sandbox × 4 maps; `node tests/p5.mjs <gungame|infection|ctf|zombies> <map> 35` covers Phase 5 modes; `tests/shot.mjs` for screenshots. Keep each command under the 300 s tool limit. `sh tests/ship.sh "message"` builds, commits, copies the HTML to outputs and re-zips.
4. Update the same artifact every time: https://claude.ai/artifact/PKJoK4eySfhpVtZKeEexSd (Artifact tool, action publish with that url). If that fails, publish a new one and tell me the link.

## What to build (all decisions are in PLAN.md; build without re-asking unless truly ambiguous)
1. Round B in order: B1 rock/collider hit-box audit (Cascade Gorge rocks and plateau tops first), B2 fully offline single HTML (inline three.js, no Google Fonts) + Export/Import Profile, B3 everything fits the window (loadout tabs, Deploy always visible), B4 kill cam (On/Off setting, default On) + free look-around after death, B5 two-level sniper zoom (4×/8×) + new Mk 14 EBR / WARDEN DMR marksman rifle with 2× scope, B6 "detailed stylized" graphics pass (soldiers, zombies, infected, weapons, lighting).
2. Then Phase 6 vehicles (6a–6d), with the match setting "Vehicles: On/Off", default OFF.
3. Then STOP and ask me before Phase 7 (multiplayer). Its decisions so far are recorded in PLAN.md for later; do not build any of it yet.

## Architecture notes (read the code for details)
- src/core: config.js (all tuning: weapons incl. falloff/pen/velocity, PENETRATION, SLOT_MODES, modes, difficulty, streaks, explosions), storage.js (localStorage profile with merge; presets A/B/C), input.js, state.js (shared `G`), util.js.
- src/world: physics.js (AABB colliders; `pass: true` blocks movement but not bullets; blocked, supportHeight, moveBody, updateVertical (fall height), depenetrate, rayWorld, rayUnits, losClear), nav.js (2 m grid graph, navExtra waypoints, ladder links, A* + string-pulling that keeps ladder ends), builder.js (merged static geometry; material colours MUST go through convertSRGBToLinear), maps/*.js (yard, outpost, atomic, gorge).
- src/entities: player.js (slots, giveWeapons, pickupSlot), ai.js (bots: perception, states, ladders, loot, gun switching, convertBot, alwaysHunt, objectives), ballistics.js (shared hitscan + sniper projectiles, falloff, penetration by calibre), units.js (damage/kill, mode damage hooks), soldier.js (models, setSoldierGun), viewmodel.js, streaks.js (player and bot killstreaks with owners), worldprops.js (barrels, drops), pickups.js, grenades.js, projectiles.js (rockets).
- src/game: match.js (shared flow, calls mode hooks), modes.js (Gun Game, Infection, CTF, Zombies hooks), progression.js.
- src/engine: render.js, audio.js, music.js (procedural menu music + stingers), fx.js.
- src/ui: hud.js, menus.js (pre-match loadout, Killstreaks page), badges.js; index.html holds all screens; src/styles.css.
- `window.__frontline` exposes G, physics, nav, loadMap, deploy, damage, input, rockets, bullets, ballistics, worldprops, musicScene.

## Known pitfalls
- r128 WebGLRenderer defines render() per instance; stub it on the instance, not the prototype.
- `classList.toggle(x, undefined)` flips every call; always pass a boolean.
- Rays that start inside a hitbox must still count as hits.
- Spawns and pickups must be validated against colliders and the nav graph (regress.mjs checks this).
- Units outside map bounds count as blocked and get depenetrated back inside; place test units within bounds.
- Scripted mouse events nudge free-look yaw; reset yaw before firing tests. `G.player` is a new object after each deploy.

## Hard constraints
- The single HTML file must keep working; from B2 on it must run fully offline (no external scripts, fonts or requests).
- Lightweight: target 60 fps on a typical laptop; fast load.
- Only original names, maps and assets. Never use "Combat Arms", "Call of Duty", "Nuketown", "Halo" or "Kill Creek" anywhere in the game.
- All audio and music generated in code.
- Real gun names stay the default, with the Fictional toggle.
- Vehicles must have an On/Off match setting, default OFF.

Start by unzipping, setting up, running a quick smoke test and the regression, then begin B1.
