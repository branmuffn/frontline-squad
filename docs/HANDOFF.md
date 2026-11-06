# Frontline: Solo Ops — hand-off (end of Rev 4 / build ~100)

This is a clean break point: everything below is built, tested and committed. Use this page to (1) update your
Netlify site, (2) play-test, (3) move the project to GitHub + Claude Code so future work is faster and cheaper.

## 1. Update the Netlify site now (drag and drop, 1 minute)
1. Unzip `frontline_site.zip` -> folder `frontline_site` with one `index.html`.
2. app.netlify.com -> your site (frontline-squad) -> **Deploys** -> drag the `frontline_site` folder onto the drop area.
3. Reload https://frontline-squad.netlify.app (everyone gets the new version; multiplayer needs the same version on
   every player's side, so ask friends to reload too). Your XP/loadouts stay: they live in your browser, not on Netlify.

## 2. Play-test checklist (what headless tests can't judge)
- Settings → Graphics quality: Balanced is the default; try Max and Battery saver; tick Performance readout.
- Zombies on Normal: does it feel fair now? Co-op revives (hold E) with a friend.
- Cascade Gorge with Vehicles On: ATV, Kestrel (left mouse fires its nose guns; 2 does nothing in one-seat vehicles),
  helicopter, jeep. Walls: try to get behind the cliffs or into rocks.
- New modes: Domination, King of the Hill, Search & Destroy (hold E to plant/defuse). Do zones sit in sensible places?
- New maps: Harbour, Snowbound Radar Base, Atomic Acres · Night (is it too dark on your screen?).
- Weapons: SCAR-H, Vector, crossbow; power weapons appear mid-map ~25 s in; Loadout → Attachments tab.
- Practice range: B = range rack (any number of guns) + flick/tracking drills.
- Multiplayer with friends: warm-up button in the lobby, pings (H), /votekick, 12-player rooms (16 experimental).
- Map editor (main menu): build, T to test, Esc → Export.
Note anything odd in one list; one message per round of feedback works best.

## 3. Move to GitHub + Netlify auto-deploy + Claude Code (one-time, ~20 minutes)
### a) GitHub repo
1. Install Git (macOS: `xcode-select --install`) and make a free GitHub account.
2. Unzip `frontline-solo-ops-vite.zip` somewhere permanent, e.g. `~/code/frontline` (it already contains the full git
   history; check with `git log --oneline | head`).
3. On github.com: **New repository** -> name `frontline` -> Private -> do NOT add a README -> Create.
4. In Terminal:
   ```
   cd ~/code/frontline
   git remote add origin https://github.com/<you>/frontline.git
   git branch -M main
   git push -u origin main
   ```
   (GitHub asks you to sign in; use the browser login or a personal access token.)
### b) Netlify builds from GitHub (no more drag and drop)
1. Netlify -> your site -> **Site configuration -> Build & deploy -> Link repository** -> GitHub -> pick `frontline`.
2. Netlify reads `netlify.toml` (already in the repo): build `npm ci && sh scripts/site.sh`, publish folder `site`.
3. From then on every `git push` redeploys the site automatically. (Drag-and-drop still works if you ever need it.)
### c) Claude Code
1. Install Node.js 20+ (https://nodejs.org), then `npm install -g @anthropic-ai/claude-code`
   (or use the Claude desktop app's Code tab). Check the current install steps at https://docs.claude.com if they changed.
2. `cd ~/code/frontline && npm install && sh tests/setup.sh`
   The tests need Playwright's Chromium: `npx playwright install chromium` (and `npm i -D playwright` if missing; the
   harness looks for it via `tests/harness.mjs` — edit the `createRequire` path there to your global node_modules or
   change it to a normal `import { chromium } from 'playwright'`).
3. Run `claude` in the folder. Claude Code reads `CLAUDE.md` automatically (commands, rules, pitfalls).
4. First prompt to paste:
   > Read CLAUDE.md, docs/ONE_PAGER.md, PLAN.md and tests/README.md. Run `sh tests/quick.sh` and tell me if anything
   > fails on this machine (fix the test harness paths if needed). Then wait: I'll give you a list of play-test
   > feedback. Work one item at a time: fix, add/extend a test, run quick.sh, commit, push.
5. Working style that saves tokens: one or two items per session, `sh tests/quick.sh` before each commit, `git push`
   to deploy, screenshots only for visual items, keep PLAN.md ticked.

## 4. If you continue in claude.ai instead
Attach `frontline-solo-ops-vite.zip` and paste `NEXT_CHAT_PROMPT.md`.

## 5. What's next (when you want it)
See `PLAN.md` → "Longer-term". Good next steps: play-test fixes; light polish (map-specific objective points via
`def.objectives` where the automatic ones feel odd); gamepad + touch; installable PWA; weather; daily challenges.
