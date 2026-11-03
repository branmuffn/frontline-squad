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
- `p5.mjs <mode> <map> [secs]` — quick run of a Phase 5 mode.
- `ship.sh "msg"` — build standalone + vite, commit, copy HTML to /mnt/user-data/outputs, re-zip project (no node_modules/dist).
  Then publish the artifact (Artifact tool, same URL).

Gotchas: set `__frontline.input.freeLook = true` before Deploy; scripted mouse events nudge free-look yaw, so reset yaw before
firing tests; dispatch key events on `window`; Escape pauses via window keydown; `G.player` is a new object each deploy.
