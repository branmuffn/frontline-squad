// 3c medals: no-scope, quickscope, 360 no-scope, nutcracker (groin zone), wallbang, collateral, point blank, last stand.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 5 }); window.__step(240); G.match.rules = { passive: true };
  const P = G.player, labels = () => [...G.match.xp.keys()];
  const shootAt = (b, wid, dy = 0.55, set = {}) => { b.protectUntil = 0; b.health = 1; b.x = P.x + 6; b.z = P.z; b.y = P.y; Object.assign(P, set); const ey = P.y + 1.55, dx = b.x - P.x, ty = b.y + b.h * dy, L = Math.hypot(dx, ty - ey); const s = F.ballistics.newShot(P, wid, P.x, ey, P.z, 1); F.ballistics.traceSegment(s, dx / L, (ty - ey) / L, 0, 60); window.__step(30); return s; };
  const bots = () => G.bots.filter((b) => b.alive);
  shootAt(bots()[0], 'l96', 0.6, { adsT: 0, spinAcc: 0 }); o.noscope = labels().includes('No-scope');
  shootAt(bots()[0], 'l96', 0.6, { adsT: 0, spinAcc: 6 }); o.spin = labels().includes('360 No-scope');
  P.scopedAt = G.now - 0.2; shootAt(bots()[0], 'l96', 0.6, { adsT: 1, spinAcc: 0 }); o.quick = labels().includes('Quickscope');
  shootAt(bots()[0], 'm4', 0.48, { adsT: 0 }); o.nut = labels().includes('Nutcracker');
  o.medals = G.profile.career.medals;
  return o;
});
const ok = r.noscope && r.spin && r.quick && r.nut;
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
