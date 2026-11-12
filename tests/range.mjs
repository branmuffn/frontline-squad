// Practice range: its own map, dummies at their marks (static + movers), hits show damage numbers, dummies pop back up,
// no XP, B opens the armory. node tests/range.mjs [shots]
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'range', map: 'yard', skill: 5 }); window.__step(260);
  const P = G.player; o.map = G.world.id; o.dummies = G.bots.length; o.atMarks = G.bots.every((b) => b.dummy && Math.abs(b.z - b.dummy.z) < 0.6);
  const mv = G.bots.find((b) => b.dummy.rail), x0 = mv.x; window.__step(60); o.moves = Math.abs(mv.x - x0) > 1;
  const t = G.bots.find((b) => !b.dummy.rail && b.dummy.z === -17); P.yaw = Math.atan2(-(t.x - P.x), -(t.z - P.z)); P.pitch = 0;
  const ey = P.y + 1.55, dx = t.x - P.x, dz = t.z - P.z, ty = t.y + t.h - 0.17, L = Math.hypot(dx, ty - ey, dz);
  const s = F.ballistics.newShot(P, 'm4', P.x, ey, P.z, 1); F.ballistics.traceSegment(s, dx / L, (ty - ey) / L, dz / L, 60); window.__step(2);
  o.number = [...document.querySelectorAll('.dmgnum.go')].map((e) => e.textContent);
  t.protectUntil = 0; F.damage(t, 999, P, { weapon: 'm4' }); window.__step(2); o.down = !t.alive; window.__step(300); o.up = t.alive && Math.abs(t.z - t.dummy.z) < 0.6;
  o.xp = G.match.xpTotal; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' })); window.__step(2); o.armory = !document.getElementById('armory').classList.contains('hidden');
  return o;
});
const ok = r.map === 'range' && r.dummies === 13 && r.atMarks && r.moves && r.number.length && r.down && r.up && r.xp === 0 && r.armory;
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3));
if (process.argv[2] === 'shots') { await page.evaluate(() => { const F = window.__frontline; F.ui.showScreen(null); document.getElementById('armory').classList.add('hidden'); const G = F.G; G.state = 'playing'; Object.assign(G.renderer, G.renderer.__orig); window.__step(2); }); await page.screenshot({ path: '/tmp/range.png' }); }
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
