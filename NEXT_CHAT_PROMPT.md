# Frontline: Solo Ops — handoff prompt (build 66 → next)

I'm continuing "Frontline: Solo Ops", a browser FPS (Three.js r128, one offline HTML file, P2P multiplayer) built over many chats. Attached: `frontline-solo-ops-vite.zip` (source, git history with one commit per item, tests, docs), `frontline_solo_ops.html` (build 66), `ONE_PAGER.md` + `frontline_overview.png` (status), `HOSTING.md`. I host it on Netlify (drag-and-drop deploys).

## FIRST: planning phase only. Do NOT build until I say "all clear".
1. Set up (below), read `PLAN.md`, `docs/ONE_PAGER.md`, `docs/ARCHITECTURE.md`, `tests/README.md`, `git log --oneline | head -40`.
2. Answer my questions (section A) briefly and concretely.
3. Present a build plan for section B (order, approach, risks, how you'll test each), plus the parity audit table (B4) and the Valorant/CS idea list (C).
4. Ask only questions that truly block you, all at once, then wait for "all clear".

## Working rules (I'm token-limited: 5-hour and weekly caps)
- Be efficient: short replies, targeted `grep`/`sed` reads (files have long lines: use `cut -c1-250`), batch edits in one python script with `assert old in s` before each replace, don't re-read code you know, avoid big outputs.
- Commit early and often (mid-item too). After each finished item: run its test + quick regression, commit, tick `PLAN.md`, then `sh tests/ship.sh "msg"` (builds, commits, copies HTML + `frontline_site.zip` + docs to outputs, re-zips) and publish the artifact (https://claude.ai/artifact/PKJoK4eySfhpVtZKeEexSd, Artifact tool, publish with that url, file = the artifact container copy; if that fails publish new and tell me).
- **Every time you stop (even at a tool/turn limit): present the files** (HTML, `frontline_site.zip`, project zip, `ONE_PAGER.md`, `frontline_overview.png`) and end with this summary format: **New this turn** (what changed, plain words) · **Everything done so far** · **Near-term to-do** · **Longer-term to-do**. Only re-render the infographic (`node /tmp/render.mjs` from `docs/overview.html`) at milestones, not every stop.
- Screenshot visual changes and look at them before calling them done. Headless tests can't reach the PeerJS broker (manual codes only), so say clearly what was not testable.
- Keep it lightweight and snappy; single-player fully offline; the only network use is matchmaking/STUN/TURN. Only original names for maps/modes/vehicles; real gun names default with the Fictional toggle; vehicles default OFF; all audio/art generated in code.

## Setup
Unzip to `/home/claude/frontline` (flatten if nested), `npm install`, `sh tests/setup.sh`, `node scripts/build-standalone.mjs` (`npx vite build` must also work). Tests: `node tests/regress.mjs 10` (all modes × maps), `tests/fit.mjs` (every screen at 4 sizes), MP: `mp.mjs`, `mp3.mjs`, `mplate.mjs`, `mpmodes.mjs`, `mpmigrate.mjs`, `mpveh.mjs`, `mpstreaks.mjs`; feature tests listed in `tests/README.md`. Keep each command under 300 s.

## Known pitfalls (learned the hard way)
- `G.player` is a new object after each `deploy()`; re-read it. `page.evaluate(fn, arg)`: don't forget the arg.
- Real-render loops (`shotSession`) can crash SwiftShader on long runs: logic in stub mode, one real render for screenshots (harness keeps `renderer.__orig`).
- Profile merge only keeps keys that exist in defaults; free-form maps need `{ __open: true }` (see `career.medals`). Arrays are copied whole.
- Anything with consequences in MP (damage, deaths, rewards, seats, flags, tiers) has exactly one owner: the host. Mirrors must include visuals. New modes need hook `netState/netApply/netMsg`.
- `classList.toggle(x, undefined)` flips; pass booleans. r128 renderer methods are per instance.
- Self-sizing elements must never feed back into layout (the loadout preview canvas grew the page forever; now absolutely positioned; `tests/lostable.mjs`).
- Spawns/pickups are validated against colliders + nav (`regress.mjs`). Visual-only "skins" (Gorge cliff/scree) sit in front of flat colliders.

## A. Answer these first (planning phase)
1. **Heat/load:** my M4 MacBook Pro gets hot under the keyboard. Netlify only serves the file; the game runs entirely on my machine. Estimate RAM/CPU/GPU load and explain why it heats up (e.g. uncapped frame rate at ProMotion 120 Hz, shadows, main-thread AI/physics, second WebGL context on the loadout screen, chopper/smoke effects). Propose fixes (e.g. default 60 fps cap on laptops/battery, a "Battery saver" preset, cheaper shadows, pausing rendering in menus, an on-screen perf readout) and their trade-offs.
2. **Bigger rooms** (now 8): how far can we go (12? 16?) with the star topology while keeping lag low? Consider host upload per player, per-client interest management (far units at lower rate), delta vs last-acked snapshot, snapshot rate scaling, host CPU. Recommend a cap and plan.
3. **How I can iterate better/more efficiently** (process, tooling, session sizing; e.g. Claude Code locally on the repo, smaller sessions with a written plan, a `tests/quick.sh` smoke suite, milestone-only infographic).

## B. Build list (after "all clear"), suggested order
1. **Zombies is impossibly hard.** Diagnose (zombie speed/damage/health/count per round, points, ammo, buy prices, spawn distances, co-op scaling) and make it fair: gentler early rounds, scaling with the bot skill setting, more ammo/points, maybe a Zombies difficulty option and co-op revives. Verify with a headless survival-time test.
2. **Kill cam bullet timing:** my body disappears before the slug arrives. Keep the victim's ghost alive/visible until the slug impacts (+ a short beat), then play the death. Test with `tests/kcshot.mjs snipe`.
3. **Canyon walls are not solid everywhere:** I can get behind/between the walls. Make all Gorge cliff faces, rock skins, spurs and ledges collide where they look solid (or keep visuals inside colliders); write a test that sweeps a player along every wall and checks they can't pass or end up inside; check the other maps for gaps too.
4. **Multiplayer parity (sanity-checked):** bots option (count + skill + rules) in every MP mode including Infection, Gun Game and CTF; port single-player features that make sense (medals/XP for joiners, practice range co-op?, sandbox rules?, gear effects on joiners, end-of-match replay, etc.). First show a table: feature → in SP? → in MP? → plan or reason to skip.
5. **Practice range weapons:** cycle through and select many guns (as many as I want): e.g. a "range rack" picker with all guns + attachments later, quick-swap keys, and an option to carry any number of guns in the range.
6. **Bigger rooms** per the agreed plan from A2.
7. Then the rest of Rev 3:
   - **3e:** Domination, Search & Destroy, King of the Hill; SCAR-H, Vector, crossbow; power-weapon pickups (rocket launcher, grenade launcher, rail gun); attachments (optic, suppressor, extended mag, grip).
   - **3f:** batched drawing + bot pathfinding in a worker; maps: snowbound radar base (large, vehicles), harbour, night Atomic Acres; vehicles: Kestrel flyer (original Banshee-like), ATV; in-game map editor (place, test, export/import JSON).

## C. Suggest only (don't build until I approve)
Ideas drawn from Valorant and Counter-Strike, e.g. round-based S&D with buy phase/economy, agent-style abilities, learnable spray patterns, ping wheel and map callouts, crosshair editor/codes, warm-up deathmatch, round MVP, surrender/timeout votes, replays/demos, aim-trainer drills in the range. Give each a one-line value and effort (S/M/L).

## Longer-term (keep on the list)
Gamepad + touch, installable app (PWA), colour-blind options, coin shop (prices exist, all free now), light tank, weather, destructible cover, ragdolls, daily challenges, prestige, weapon levels, full-state host migration (current one keeps scores/time but respawns everyone). Voice chat: skipped by choice.
