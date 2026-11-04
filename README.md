# Frontline: Solo Ops

A single-player browser FPS inspired by classic Combat Arms. Three.js r128, no backend, no accounts.

See `docs/frontline_overview.png` (one-page infographic), `docs/ONE_PAGER.md` (decisions, insights, roadmap) and `docs/ARCHITECTURE.md` (architecture, status, build/output pipeline).

## Run it

```bash
npm install
npm run dev               # local dev server with hot reload
npm run build             # production build in dist/
npm run build:standalone  # one self-contained HTML file in dist-standalone/
```

`dist-standalone/frontline_solo_ops.html` is already built. Open it in any modern desktop browser; it runs fully offline (multiplayer room codes are the only network use).

## Multiplayer (up to 8 players)

Co-op Survival and Zombies, or Free for All and Team Deathmatch; bots optional (skill 1–10, rules for what they may do). Peer to peer (WebRTC), no account, no server of ours. Works across different Wi-Fi networks: a direct route is tried first, then a free relay. Use the downloaded HTML file (the claude.ai preview may block WebRTC); everyone needs the same file.

1. Both open `frontline_solo_ops.html`, click **Multiplayer**, type a name.
2. Host clicks **Host a game** and shares the 5-letter room code; picks mode, map, difficulty and bots.
3. Friends type the code, click **Join**, then **Ready**. When everyone is ready the host clicks **Start match**. Chat in the lobby, or press T / Enter in a match. The host can Kick (button or `/kick NAME`). Pick your look (uniform, pattern, helmet) as you rank up. After a match the host can **Play again**; the connection stays up.
4. If the code can't reach the matchmaking server (or you're offline on one LAN): open *No room code? Use copy-paste codes*. Host: **1 · Make invite code** and send it. Friend: paste it, **2 · Make reply code**, send it back. Host: paste it, **3 · Connect**.
5. If your networks block direct connections (~1 in 6), install free Tailscale or ZeroTier on both PCs and use the copy-paste codes.

Lag: your own movement, shooting and driving are instant (local), your hits count where you aimed (shooter-favoured), others are drawn ~100 ms behind for smoothness. Points and lives are shared in co-op. Everyone earns killstreaks and gets the kill cam. Vehicles (Cascade Gorge) can be switched On in the lobby. The lobby shows each player's ping and whether the link is Direct, LAN or Relayed.

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
