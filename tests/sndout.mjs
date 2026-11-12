// Rev 5: Search & Destroy while the player is out for the round.
// (1) Bots keep fighting: their trigger used to require G.state === 'playing', so with the player dead nobody could
//     shoot and every round ran to the timer. (2) The camera flies freely (no 6 m tether, no walls).
import { open } from './harness.mjs';
const map = process.argv[2] || 'yard';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate((map) => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'snd', map, skill: 5, count: 7 }); window.__step(300);
  const P = G.player; P.protectUntil = 0; F.damage(P, 999, null, { weapon: 'fall' });
  o.out = P.respawnAt > 1e8; o.hint = /fly/.test(document.getElementById('deathTimer').textContent);
  const alive0 = G.units.filter((u) => u.alive).length;
  window.__step(600); // past the fall + kill cam replay
  // fly forward and up for 3 s
  const c0 = G.camera.position.clone();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  window.__step(180);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  o.flew = +G.camera.position.distanceTo(c0).toFixed(1);
  o.camAboveBody = +(G.camera.position.y - P.y).toFixed(1);
  // bots fight on: within 30 s more, someone dies or the round is decided
  const score0 = G.match.teamScores.join(':');
  window.__step(1800);
  o.botDeaths = alive0 - 1 - G.units.filter((u) => u.alive && u !== P).length;
  o.roundDecided = G.match.teamScores.join(':') !== score0;
  return o;
}, map);
const ok = r.out && r.hint && r.flew > 15 && r.camAboveBody > 5 && (r.botDeaths > 0 || r.roundDecided);
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS sndout' : 'FAIL sndout', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
