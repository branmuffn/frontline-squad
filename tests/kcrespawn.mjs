// Rev 5: a soldier who respawns while you watch the kill cam must come back upright. The replay restored every
// soldier's pose from when it started, so a bot that was dead then and respawned meanwhile kept its corpse pose:
// lying in the grass while alive (looked invisible, name tag floating, still shooting).
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'tdm', map: 'gorge', skill: 5, count: 5 }); window.__step(400);
  const P = G.player, foes = G.bots.filter((b) => b.team !== P.team), A = G.bots.find((b) => b.team === P.team) || foes[1], K = foes[0];
  A.protectUntil = 0; F.damage(A, 999, K, { weapon: 'm4' }); window.__step(60); // A dies and starts its death pose
  o.aDeathPose = A.soldier.deathT >= 0;
  P.protectUntil = 0; F.damage(P, 999, K, { weapon: 'm4' });
  for (let i = 0; i < 300 && !F.kcDebug(); i++) window.__step(2);
  o.replay = !!F.kcDebug();
  A.respawnAt = G.now; window.__step(10); // A respawns mid-replay
  o.aAliveInReplay = A.alive;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' })); window.__step(5); // skip
  o.replayOver = !F.kcDebug();
  o.aUpright = A.alive && A.soldier.deathT < 0 && Math.abs(A.soldier.pose.rotation.x) < 0.01 && Math.abs(A.soldier.pose.rotation.z) < 0.01 && A.soldier.root.visible;
  return o;
});
const ok = r.aDeathPose && r.replay && r.aAliveInReplay && r.replayOver && r.aUpright;
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS kcrespawn' : 'FAIL kcrespawn', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
