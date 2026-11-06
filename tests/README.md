# Headless test harness (Playwright Chromium, SwiftShader)

Setup: `sh tests/setup.sh` (fetches three.js r128 into tests/three.min.js). Playwright is loaded from the global npm root
(`/home/claude/.npm-global/lib/node_modules/`); browsers from `$PLAYWRIGHT_BROWSERS_PATH`.

- `harness.mjs` — `open({ stub, w, h })` boots the standalone build at http://game.local/ with three.js served locally.
  `stub: true` (logic tests): renderer.render/clear/clearDepth replaced on the INSTANCE after boot (r128 defines render
  per instance, a prototype patch does nothing) → ~1 ms/frame. requestAnimationFrame is replaced; advance with `window.__step(n)`.
  Use a small viewport (320×240) for logic tests.
- `shot.mjs` — `shotSession()`: real renderer; `prep(cfg, steps)` deploys at render scale 0.1, `shot(file, fn)` restores scale 1, renders, screenshots.
- `regress.mjs [secs]` — FFA/TDM/Survival/Sandbox × 4 maps: kills, NaN, units stuck in geometry, spawn/pickup nav checks, console errors.
  Keep under ~25–35 s game time per combo or it exceeds the 300 s tool limit.
- `hitbox.mjs [tol] [maps]` — static audit: every bullet-blocking box must hug visible geometry (hull colliders are exact).
- `profile.mjs` — Export/Import profile round trip (download, file import, bad input).
- `fit.mjs [shots]` — every screen at 1024×640/1280×720/1366×768/1920×1080: no page scroll, main button on screen, only `.scroll-list` may scroll (panel body too at 1024).
- `killcam.mjs` (stubbed renderer; pass `shots` for real-render screenshots, which can crash SwiftShader on long runs) — [shots]` — AFK player dies in FFA: replay shows, killer hidden, key skips, free-look drift, respawn still 3 s.
- `scope.mjs [shots]` — L96 4×/8× via wheel and Z (true optical FOV), Mk 14 fixed 2×, scope label.
- `lineup.mjs` — screenshots a line-up of soldiers (every gun), a zombie and an infected, standing and running (/tmp/lineup_*.png).
- `vm.mjs [ids]` — first-person gun screenshots (/tmp/vm_<id>.png).
- `vehicles.mjs [shots]` — jeep: Off by default, spawns clear, enter/drive/turn/no wall clipping, seats, gunner fire, exit, bullets stop on hull, destroy + respawn.
- `heli.mjs [shots]` — helicopter: enter, climb, fly, turn to view, no clipping, door-gun arc, bail-out autorotation landing.
- `doorways.mjs` — walks along the Gorge bridge walkway and in/out of every boxcar door with real input (stalls, height jitter); sliding doors: close/open, block, bullets, bots open them.
- `prone.mjs [shots]` — prone toggle, height/eye, crawl speed, no sprint, getting up.
- `vehbots.mjs [secs]` — TDM on Gorge with Vehicles On: bots board, drive, fly, fire; no NaN/errors.
- `perf.mjs [map] [0|1]` — draw calls, triangles and frame ms in TDM with 9 bots, vehicles off/on (SwiftShader: compare runs, not absolute ms).
- `p5.mjs <mode> <map> [secs]` — quick run of a Phase 5 mode.
- `mp.mjs <mode> <map> [secs]` — two pages (host + joiner) connected with manual codes: sync, hit/kill claims, hurt, death/respawn, grenades, Zombies buying, FFA/TDM teams, PvP, drop handoff, end + rematch. `SHOT=1` saves /tmp/mp_lobby.png and /tmp/mp_client.png.
- `bots.mjs [secs]` — bot skill 1–10 (monotonic AI numbers, bands, legacy difficulty), every "Bots may" rule off is obeyed, No bots.
- `uishot.mjs [w] [h]` — screenshots of the main menu (bot rules card open) and the MP lobby (/tmp/ui_*.png).
- `mp3.mjs [mode] [map] [secs]` — host + 2 joiners: ready gate, unique names, chat relay (lobby + HUD), TDM team dealing, skins, pings on the scoreboard, joiner-vs-joiner hits, kick.
- `mpstreaks.mjs` — joiner earns UAV/mortar/sentry from the host, deploys them through the host; strikes, sentries and sentry bursts mirrored.
- `kcshot.mjs [gun|snipe|mortar]` — kill cam screenshots at the killing shot (/tmp/kc_*.png): killer's eyes + slug, sniper bullet-follow camera, orbit view.
- `vehcrew.mjs` — shots to kill a jeep driver / helicopter pilot through the hull, frag hurts a crew, hull damage.
- `mpveh.mjs` — vehicles in MP on Gorge: same vehicles, joiner boards via the host and drives (host follows), seats mirrored, exit, joiner hits hull + crew, wreck and respawn mirrored.
- `rev3a.mjs` — match limits (no limit / custom), pickups toggle, Standard slots (rifle into the sidearm slot).
- `ladder.mjs [map]` — no accidental grabs (brushing past, backing into it), deliberate climb, unit above blocks, bot gives way (maps with ladders).
- `gorge.mjs` — chutes: braking (walk backwards) survivable, unbraked/steep lethal; bots path up the zig-zag stairs; boxcar hatches.
- `gorgeshot.mjs` — screenshots of the Gorge cliff routes (/tmp/gorge_right.png, /tmp/gorge_left.png).
- `finale.mjs` — end-of-match replay plays ("Final kill"), runs to the end screen, any key skips.
- `gear.mjs` — heavy vest damage, grenadier, flashbang stun + white-out, smoke, sticky sticks, claymore trips, light vest speed, bandolier ammo.
- `loshot.mjs [w] [h]` — loadout screenshots (gun, vest, operator tabs; TABS=…, OP=ava) to /tmp/lo_*.png.
- `medals.mjs` — no-scope, 360 no-scope, quickscope, nutcracker (groin zone).
- `streaks3c.mjs` — picks + kill counts, care package drop/open, airstrike, attack chopper (shot down), counter-UAV, gunship.
- `range.mjs [shots]` — practice range: own map, dummies at marks, movers, damage numbers, pop back up, no XP, armory.
- `mplate.mjs` — late join into a running match, rejoin keeps score, spectator (follow cam, snapshots, no unit).
- `mpmodes.mjs [mode]` — multiplayer Gun Game tier-up, Infection turning a joiner, CTF joiner grabbing the flag.
- `mpmigrate.mjs` — host quits mid-match: succession list, first joiner re-hosts with time, team scores and kills kept.
- `skins.mjs` — screenshot of skin combinations (/tmp/skins.png).
- `power.mjs` — B0: quality presets, migration to Balanced, low-power menus (30 renders/s), perf readout, settings UI (/tmp/settings_b0.png).
- `zsurvive.mjs [secs] [diffs] [map]` — B1: a stand-still pistol 'turret' player per Zombies difficulty: rounds, first death, game over, zombie speed vs your sprint.
- `mpmodes.mjs zombies` — co-op revives: joiner downed, host revives, joiner revives host, bleed-out uses a life.
- `kcvictim.mjs` — B2: kill cam victim visible while the slug flies, falls after it lands (60 m L96, 15 m M4).
- `walls.mjs [maps] [step]` — B3: every standable spot vs the visual geometry (rocks, skins, roofs, props): your centre must never be inside something that looks solid. All maps must report 0 gaps.
- `rack.mjs` — B5: range rack (multi-select, carried at once, 1-9 keys, survives respawn, saved, all/clear); /tmp/rack.png.
- `mp12.mjs [joiners] [big]` — B6: host + 11 (or 15 with big=1) joiners: all join, match runs, bots trimmed, host upload per joiner. Host frame ms isn't measurable headless (fake clock).
- `xhmvp.mjs` — crosshair editor + share codes, MVP card (/tmp/xh.png, /tmp/mvp.png).
- `ping.mjs` — pings: enemy / here / danger markers and callouts.
- `drill.mjs` — range flick + tracking drills, bests.
- `mpvote.mjs` — ping relay to the team, /votekick, /surrender (host + 2 joiners).
- `mpwarm.mjs` — warm-up without ready, back to lobby, real match, no XP.
- `spawnsep.mjs` — nobody spawns inside another soldier (every mode x map). `spawnshot.mjs [mode] [map]` screenshots the countdown.
- `kczombie.mjs` — Zombies kill cam: orbit + claw swipe (/tmp/kc_zombie.png).
- `w3e.mjs` — 3e weapons: SCAR-H/Vector/crossbow hit, GL bursts, rail through two people, attachments (mag 45, recoil 0.75), power pickups spawn.
- `objshot.mjs [mode]` — screenshot of an objective zone.
- `endboard.mjs` — end-screen board in every mode, Infection timer win goes straight to the end screen.
- `veh3f.mjs` — ATV ride + Kestrel climb/fly on Gorge (/tmp/veh3f.png). `mapshot.mjs <map>` — map screenshots.
- `mapsmoke.mjs <map>` — new-map smoke (spawns/pickups clear, 4 modes run). `vehshot.mjs` — ATV/Kestrel look.
- `navworker.mjs` — real-time page (no fake clock): bots path via the worker.
- `quick.sh` — smoke suite: build, power, regress 6, mp.
- `ship.sh "msg"` — build standalone + vite, commit, copy HTML to /mnt/user-data/outputs, re-zip project (no node_modules/dist).
  Then publish the artifact (Artifact tool, same URL).

Gotchas: set `__frontline.input.freeLook = true` before Deploy; scripted mouse events nudge free-look yaw, so reset yaw before
firing tests; dispatch key events on `window`; Escape pauses via window keydown; `G.player` is a new object each deploy.
