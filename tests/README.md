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
- `killcam.mjs [shots]` — AFK player dies in FFA: replay shows, killer hidden, key skips, free-look drift, respawn still 3 s.
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
- `kcshot.mjs [gun|mortar]` — kill cam screenshot during the slow-motion final blow (/tmp/kc_*.png): killer's eyes or orbit view.
- `vehcrew.mjs` — shots to kill a jeep driver / helicopter pilot through the hull, frag hurts a crew, hull damage.
- `mpveh.mjs` — vehicles in MP on Gorge: same vehicles, joiner boards via the host and drives (host follows), seats mirrored, exit, joiner hits hull + crew, wreck and respawn mirrored.
- `skins.mjs` — screenshot of skin combinations (/tmp/skins.png).
- `ship.sh "msg"` — build standalone + vite, commit, copy HTML to /mnt/user-data/outputs, re-zip project (no node_modules/dist).
  Then publish the artifact (Artifact tool, same URL).

Gotchas: set `__frontline.input.freeLook = true` before Deploy; scripted mouse events nudge free-look yaw, so reset yaw before
firing tests; dispatch key events on `window`; Escape pauses via window keydown; `G.player` is a new object each deploy.
