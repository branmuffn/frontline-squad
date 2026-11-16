// B4: kill cam replays from the killer's eyes, skips on a key, free look after; respawn timing unchanged.
import { shotSession } from './shot.mjs';
import { open } from './harness.mjs';
const SHOTS = process.argv[2] === 'shots';
// real rendering only when screenshots are wanted (long real-render loops can crash SwiftShader in the sandbox)
const s = SHOTS ? await shotSession() : await (async () => { const o = await open({ w: 320, h: 240 }); o.prep = (cfg, steps) => o.page.evaluate(([cfg, steps]) => { const F = window.__frontline; F.input.freeLook = true; F.deploy(cfg); window.__step(steps); }, [cfg, steps]); o.shot = async () => {}; return o; })();
await s.prep({ mode: 'ffa', map: 'yard', difficulty: 'normal', count: 3 }, 30);
const r = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player;
  P.protectUntil = 0; G.profile.settings.renderScale = 0.1;
  window.__step(150); const kb = G.bots.find((q) => q.alive); kb.x = P.x + 6; kb.z = P.z; kb.y = P.y; window.__step(20); P.protectUntil = 0; F.damage(P, 999, kb, { weapon: 'm4', sx: kb.x, sz: kb.z }); // a deterministic death
  const k = P.lastKiller || G.units.find((u) => !u.isPlayer);
  const out = { state: G.state, respawnIn: +(P.respawnAt - G.now).toFixed(2) };
  window.__step(70); // past the fall, into the replay
  out.kcVisible = !document.getElementById('killcam').classList.contains('hidden');
  out.killerHidden = k.soldier.root.visible === false;
  return out;
});
if (SHOTS) await s.shot('/tmp/kc_replay.png');
const r2 = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player;
  const key = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })); window.__step(2); };
  const shown = () => !document.getElementById('killcam').classList.contains('hidden');
  // Brian 2026-11-16: the replay often didn't play. A click never skips; a key in the first second doesn't either.
  F.input.h.onMouseDown(0); window.__step(2);
  const out = { clickKept: shown() };
  key(); out.earlyKeyKept = shown();
  window.__step(40); key();
  out.skipped = !shown();
  const c0 = G.camera.position.clone();
  F.input.keys.KeyW = true; window.__step(30); F.input.keys.KeyW = false;
  out.drift = +G.camera.position.distanceTo(c0).toFixed(2);
  const t0 = G.now; let n = 0; while (G.state === 'dead' && n++ < 400) window.__step(1);
  out.respawnedAfter = +(G.now - t0).toFixed(2); out.state = G.state;
  out.allVisible = G.units.every((u) => !u.soldier || u.soldier.root.visible || !u.alive);
  return out;
});
if (SHOTS) await s.shot('/tmp/kc_after.png');
const bad = !r.kcVisible || !r2.clickKept || !r2.earlyKeyKept || !r2.skipped;
console.log(JSON.stringify(r), JSON.stringify(r2), 'ERRORS', s.errors.length, s.errors.slice(0, 3), bad ? 'FAIL killcam' : 'PASS killcam');
process.exitCode = s.errors.length || bad ? 1 : 0; // exit non-zero on FAIL
await s.browser.close();
