// Zombies kill cam: orbit view of the zombie swiping you (screenshot /tmp/kc_zombie.png at the swipe).
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true;
  F.deploy({ mode: 'zombies', map: 'yard', skill: 5, zdiff: 'normal' }); window.__step(200);
  const P = G.player; let n = 0; while (!G.bots.some((b) => b.alive) && n++ < 900) window.__step(1);
  const z = G.bots.find((b) => b.alive); P.protectUntil = 0; P.health = 1; z.x = P.x + 1.2; z.z = P.z; z.y = P.y; z.brain.target = P; z.brain.nextShot = 0;
  let k = 0; while (P.alive && k++ < 300) { z.x = P.x + 1.2; z.z = P.z; window.__step(1); }
  const o = { died: !P.alive, by: P.lastKiller && P.lastKiller.name, swipes: 0, orbit: false };
  for (let i = 0; i < 400; i++) { window.__step(1); const d = F.kcDebug(); if (d) { o.orbit = d.orbit; const s = z.soldier; if (s.swipeAt != null && s.t - s.swipeAt < 0.2 && s.t - s.swipeAt > 0.1) { o.swipes++; if (o.swipes === 1) { o.shotAt = i; break; } } } }
  return o;
});
await page.evaluate(() => { const G = window.__frontline.G, o = G.renderer.__orig; Object.assign(G.renderer, o); window.__step(1); });
await page.screenshot({ path: '/tmp/kc_zombie.png' });
const ok = r.died && r.orbit && r.swipes > 0;
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS kczombie' : 'FAIL kczombie', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
