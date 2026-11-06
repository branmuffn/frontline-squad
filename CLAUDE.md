# Frontline: Solo Ops — project memory for Claude Code

Browser FPS (three.js r128) shipped as ONE offline HTML file; single-player fully offline; P2P multiplayer (PeerJS/WebRTC,
host-authoritative). Read `docs/ONE_PAGER.md` (what exists), `docs/ARCHITECTURE.md` (how), `PLAN.md` (history + to-do).

## Commands
- `npm install` then `sh tests/setup.sh` (copies three.min.js for the test harness)
- Build the deliverable: `node scripts/build-standalone.mjs` -> `dist-standalone/frontline_solo_ops.html` (`npx vite build` must also work)
- Dev server: `npm run dev`
- Smoke suite (~3 min): `sh tests/quick.sh` — run before every commit
- Full checks by area: see `tests/README.md` (regress, fit, walls, spawnsep, mp*, w3e, editor, seats, ...)
- Ship: `sh tests/ship.sh "message"` (build + commit + copy to outputs; in Claude Code you can ignore the outputs copy)
- Netlify site folder: `sh scripts/site.sh` -> `site/index.html` (also what netlify.toml builds)

## Rules (keep these)
- Lightweight and offline: no new runtime dependencies, no network except matchmaking/STUN/TURN; all art and audio generated in code.
- Original names for maps/modes/vehicles; real gun names by default with the Fictional toggle; vehicles default OFF.
- No money/buying/shop features (decided). Accounts: later, not now.
- Every balance number lives in `src/core/config.js`.
- Multiplayer: anything with consequences (damage, deaths, rewards, seats, flags, rounds) has exactly ONE owner, the host;
  joiners mirror it (visuals included). New modes need hooks `netState / netApply / netMsg` (+ `netHostMsg` for joiner input).
- Profile merge keeps only keys that exist in defaults (`src/core/storage.js`); free-form maps need `{ __open: true }`.
- One commit per finished item; tick `PLAN.md`; add/extend a test in `tests/` for every fix.

## Pitfalls learned the hard way
- `G.player` is a new object after each `deploy()`; re-read it. `page.evaluate(fn, arg)`: pass the arg.
- Tests run on a fake clock (`window.__step`); real-render sessions (`tests/shot.mjs`) can crash SwiftShader on long runs:
  do logic in stub mode (`tests/harness.mjs open()`), one real render for screenshots. Kill stray `chrome-headless` if odd.
- The nav worker is OFF under the harness (fake clock); `tests/navworker.mjs` tests it in real time.
- `classList.toggle(x, undefined)` flips; pass booleans. r128 renderer methods are per instance.
- Self-sizing elements must never feed back into layout (`tests/lostable.mjs`). Screens must fit (`tests/fit.mjs`).
- Vehicles: seat numbers must be range-checked (one-seat ATV/Kestrel). Vehicle code keys off `spec.fly` / `spec.tail`.
- Visual geometry must sit inside colliders (`tests/walls.mjs` audits every map; must report 0 gaps).
- Spawns/pickups must be clear of geometry (`tests/mapsmoke.mjs <map>`, `tests/spawnsep.mjs`).
- Remote objects already use names like `r.pingT` (ping timer): don't reuse property names on `r` / units casually.

## Layout
`src/core` config, state, input, storage · `src/world` maps (data), builder (merge + colliders), physics, nav (+ worker)
· `src/entities` player, bots (ai), soldiers, weapons, ballistics, vehicles, grenades, pickups · `src/game` match flow,
modes (hooks), objectives (Dom/KotH/S&D), killcam, progression, editor · `src/engine` render, audio, fx, power/perf, merge
· `src/ui` menus, hud, chat, ping, preview · `src/net` transport, session (net.js), lobby, vehicles sync, codec.
