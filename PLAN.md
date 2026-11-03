# Frontline: Solo Ops — build plan

Resume note: attach the project zip in a new chat; work top to bottom, checking items off as they ship.
Always: commit after each item group, rebuild `dist-standalone/frontline_solo_ops.html`, test headless, republish, re-zip.

## Done
- [x] v2.0 rebuilt game: Steel Yard + Dust Outpost, FFA/TDM/Survival, killstreaks, XP/ranks, camos, smart bots
- [x] Phase 1 Sandbox mode (rules, B weapon menu) + AK-47, M249, SPAS-12, Barrett .50, Desert Eagle, RPG-7 (sandbox only)
- [x] Phase 2 Atomic Acres (1950s test town)
- [x] Phase 3 Cascade Gorge (canyon, rail bridge + freight train, ladders, wading, bullets through thin wood)
- [x] Phase 4 explosive barrels (chain reactions, kill credit) + weapon drops (E to swap)
- [x] Graphics/audio pass (contact shading, sky reflections, clouds, detailed soldiers/guns, layered gunshots, surface footsteps)

## Next: Round A — fixes and upgrades (do these first)
- [x] A1 Stuck-in-geometry fix: per-frame depenetration (if a unit's current position is `blocked()`, push out along the shortest escape); move the Atomic Acres stairwell railing clear of the stairs; "Redeploy" button in the pause menu (respawn without a death in non-survival modes, counts as death in Survival).
- [x] A2 Fall damage: starts at ~4 m drop, lethal at ~12 m (tune by impact speed in `updateVertical`); applies to bots too; killfeed source "FALL".
- [x] A3 Weapon power: bots deal full weapon damage on Normal/Hard (Easy keeps a reduction); difficulty only changes aim, reaction, aggression. Add a "Power" stat bar (damage per shot) in loadout/weapon menu.
- [x] A4 Bullet physics and ranges (hybrid, like CA/COD with BF-style snipers):
  - Per-weapon effective range, falloff curve and hard max range by class: pistol ~30/60 m, SMG ~20/70, shotgun ~8/30 (pellets), AR ~35/150, LMG ~40/150, sniper/Barrett no falloff to 300.
  - Snipers and Barrett fire real projectiles (muzzle velocity ~600-800 m/s, gravity drop, travel time); others stay hitscan.
  - Penetration by calibre: pistol/SMG thin wood only, rifles thin wood + 1 thin wall, Barrett most cover; damage reduced per surface.
  - Tracer speed matches projectile speed; bots use the same rules.
- [x] A5 Pre-match loadout screen after Deploy: 3 saved presets (A/B/C), primary, secondary, camo, stat bars incl. Power; remembered per profile.
- [x] A6 "Weapon slots" setting (Settings and the pre-match screen), bots obey the same rule:
  - Classic (Combat Arms): primary / sidearm / knife; pickups replace the same slot type. DEFAULT.
  - Two-gun (Halo): any 2 guns + knife; pickup replaces the gun in hand.
  - Overkill: 3 guns + knife (key 4); unlocks at Sergeant rank; always available in Sandbox.
  - Controls: 1-4, mouse wheel, Q = last weapon; list them in Controls.
- [x] A7 Weapon names toggle in Settings: Real (default) / Fictional (e.g. M4A1 -> AR-4 Carbine, Barrett .50 -> Thunder .50); applies to menus, HUD, killfeed.
- [x] A8 Killstreak explanations: "Killstreaks" page in the menu, summary on the loadout screen, one-time hint the first time each is earned.
- [x] A9 Bot parity: bots sprint at player speed, climb ladders (add ladder links to the nav graph), pick up dropped weapons, earn and use killstreaks (UAV, mortar, sentry), same respawn and spawn-protection rules.
- [ ] A10 Music: original procedural music (Web Audio) for menus/lobby/end screen + short match start/end stingers; NO in-match music (matches Halo MP / Combat Arms); separate Music volume slider; starts after first user click.

## Then: Phase 5 — modes
- [ ] 5a Gun Game (advance weapon per kill, knife kill demotes victim) + Infection (Quarantine-style: infected are fast melee, kills convert survivors, survivors win at the timer)
- [ ] 5b Capture the Flag (bots grab, escort, return flags; flag bases per map)
- [ ] 5c Zombies (endless rounds, points for hits/kills, wall-buy weapons, mystery box, power-ups: Max Ammo, Insta-Kill, Double Points)

## Then: Phase 6 — vehicles (match setting "Vehicles: On/Off", default OFF)
- [ ] 6a Drivable jeep with gunner turret (E enter/exit)
- [ ] 6b Flyable helicopter
- [ ] 6c Bots drive, gun and fly
- [ ] 6d Vehicle placements on Cascade Gorge (+ a larger vehicle-friendly map if needed); keep performance acceptable

## Constraints
- The single HTML file must keep working (three.js r128 from cdnjs, no other external scripts).
- Original names for maps/modes; never use "Combat Arms", "Call of Duty", "Nuketown", "Halo" or "Kill Creek" in the game.
- All audio generated in code; no copyrighted assets.
