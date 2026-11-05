// B2: in the kill cam the victim stays visible until the killing round lands (+ a beat), then falls.
// node tests/kcvictim.mjs [dist] [gun]   (default: 60 m L96 and 15 m M4)
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
let ok = true;
for (const [far, gun] of [[+process.argv[2] || 60, process.argv[3] || 'l96'], [15, 'm4']]) {
  await page.evaluate(() => localStorage.clear());
  const r = await page.evaluate(([far, gun]) => {
    const F = window.__frontline, G = F.G; F.input.freeLook = true;
    F.deploy({ mode: 'survival', map: 'yard', skill: 5 }); window.__step(260);
    const P = G.player; let n = 0;
    while (G.bots.filter((b) => b.alive).length < 1 && n++ < 600) window.__step(1);
    const b = G.bots.find((q) => q.alive); b.x = P.x + far; b.z = P.z + 1; b.y = P.y; b.weapon = gun; b.brain.weapon = gun;
    for (let i = 0; i < 60; i++) { b.yaw = Math.atan2(-(P.x - b.x), -(P.z - b.z)); window.__step(1); }
    P.protectUntil = 0; P.health = 1;
    const ey = b.y + 1.5, dx = P.x - b.x, dy = P.y + 1.3 - ey, dz = P.z - b.z, L = Math.hypot(dx, dy, dz);
    const s = F.ballistics.newShot(b, gun, b.x, ey, b.z, 1); F.ballistics.traceSegment(s, dx / L, dy / L, dz / L, 200);
    const log = { bad: 0, slugFrames: 0, bodyAfter: 0, fell: false, frames: 0, flight: 0 };
    for (let i = 0; i < 900; i++) {
      window.__step(1); const d = F.kcDebug(); if (!d) { if (log.frames) break; continue; }
      log.frames++; log.flight = d.flight;
      if (d.slug) { log.slugFrames++; if (!d.body) log.bad++; }
      if (d.t > d.hitT && d.body) log.bodyAfter++;
      if (d.fell) log.fell = true; log.last = [+d.t.toFixed(2), +d.hitT.toFixed(2), +d.end.toFixed(2)];
    }
    return log;
  }, [far, gun]);
  const pass = r.frames > 10 && r.bad === 0 && ((r.fell && r.bodyAfter > 0) || r.last[0] < r.last[1]); // the replay may end (respawn) before a long flight lands
  ok = ok && pass; console.log(gun, far + ' m', JSON.stringify(r), pass ? 'ok' : 'FAIL');
}
console.log(ok && !errors.length ? 'PASS kcvictim' : 'FAIL kcvictim', errors.slice(0, 3));
await browser.close();
