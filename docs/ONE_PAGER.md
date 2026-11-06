# Frontline: Solo Ops — one-pager (Rev 4 complete)

![Overview](frontline_overview.png)

## What it is
A browser FPS delivered as **one self-contained HTML file (~1.3 MB)**: three.js r128, the game and a font are inlined,
so single-player runs with no network at all. Multiplayer (**12 players, 16 experimental**) is peer to peer over WebRTC;
the only outside services are a free matchmaking broker (room codes) and public STUN/TURN servers. Hosted at
https://frontline-squad.netlify.app (or open the file directly). All art, audio and music are generated in code.

## What's in the game
- **13 modes:** Free for All, Team Deathmatch, Survival (co-op waves), Gun Game, Infection, Capture the Flag,
  **Domination, King of the Hill, Search & Destroy**, Zombies (co-op, difficulty, revives), Practice range (also co-op,
  range rack, flick/tracking drills), Sandbox, plus a lobby **warm-up**.
- **9 maps:** Steel Yard, Dust Outpost, Atomic Acres, **Atomic Acres · Night**, **Harbour**, Cascade Gorge,
  **Snowbound Radar Base**, Firing Range, and your **custom map** from the in-game **map editor** (export/import JSON).
- **17 guns + knife:** rifles (M4A1, AK-47, **SCAR-H**, Mk 14), SMGs (MP5, **Vector**), shotguns, LMG, snipers, **crossbow**,
  pistols; **power weapons** on the map (rocket launcher, **grenade launcher**, **rail gun**); **attachments** (red dot,
  suppressor, extended mag, grip); grenades (frag, flash, smoke, sticky), claymore, vests, belts; 6 operators.
- **Vehicles (off by default):** jeep with gunner, helicopter with door gunner, **ATV**, **Kestrel** attack flyer.
- **Progression:** XP and ranks, medals (no-scope, quickscope, wallbang, collateral...), pick-3 killstreaks (UAV,
  counter-UAV, care package, mortar, sentry, airstrike, attack chopper, gunship), career + export/import.
- **Bots:** skill 1–10 with rules (grenades, streaks, snipers, vehicles, loot, tactics); they play every objective.
- **Social/competitive:** pings (H), chat votes (/votekick, /surrender), MVP card, full K/D board on every end screen,
  kill cam (killer's scope view, bullet-follow camera, waits for the round to land), end-of-match replay, spectating,
  join in progress, rejoin with score, host migration, invite links, crosshair editor with share codes.
- **Comfort:** quality presets (Battery saver / Balanced / Max / Custom), 60 fps default, low-power menus, perf readout,
  battery prompt, persistent storage + backup reminder, real or fictional gun names, rebindable keys.

## How it is built
- **Source:** Vite project in `src/` (core, world, entities, game, engine, ui, net); one shared state object `G`; every
  balance number in `src/core/config.js`. Maps are data → merged meshes + axis-aligned colliders in a spatial hash; a
  2 m nav grid drives bot A* (on a **Web Worker** in the browser).
- **Build:** `scripts/build-standalone.mjs` (esbuild + inlining) → `dist-standalone/frontline_solo_ops.html`;
  `scripts/site.sh` → `site/index.html` for Netlify (`netlify.toml` for GitHub auto-deploys).
- **Quality loop:** 67 headless-Chromium test scripts (every mode × map, multiplayer with 2–16 pages, screens fit at
  4 sizes, a visual-vs-collider audit of every map, spawn separation, weapons, vehicles, editor) + screenshots reviewed.
  `sh tests/quick.sh` is the 3-minute smoke suite. ~11,800 lines of game code, ~100 commits (one per item).

## Key decisions and why
| Decision | Why |
| --- | --- |
| One offline HTML file | Share it like a document; nothing to keep alive; works on a plane. |
| Host-authoritative peer to peer | Free, no server; the host's game is the referee. |
| Joiners move/shoot locally and claim hits | No input lag; the host sanity-checks claims. |
| Interest management + 20 Hz above 8 players | 12 players + 8 bots ≈ 0.9 Mbps host upload. |
| Objective points derived from spawns | New modes work on every map, including custom ones; `def.objectives` overrides. |
| Balanced preset at 60 fps by default | Most of the heat came from 120 fps + menus rendering at full rate. |
| No money, shops or accounts | Keep it fun and easy to start; progress lives in the browser (export/import). |

## Insights from building it
- Most multiplayer bugs were "who decides?" bugs: one owner (the host) for anything with consequences; mirrors include visuals.
- Audits beat spot checks: the wall audit found invisible gaps nobody had reported; the spawn audit found soldiers
  spawning inside each other (the "weird colours" at the countdown).
- Small shape assumptions break later: every vehicle had two seats until the ATV/Kestrel arrived (pressing 2 froze the game).
- Tests that need real time must use the game's fake clock; real-time features (the nav worker) get a dedicated real-time test.

## Status and next steps
**Rev 4 complete** (see `PLAN.md` for the item-by-item log). Hand-off and setup guide: `docs/HANDOFF.md`.
Longer-term ideas: host-only mode, multiplayer custom maps/sandbox, spray patterns, match demos, gamepad + touch, PWA,
colour-blind options, light tank, weather, destructible cover, ragdolls, daily challenges, prestige, weapon levels,
full-state host migration, accounts (later).
