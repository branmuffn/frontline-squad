// 3c killstreaks: your picks at your kill counts; care package drops and opens, airstrike, attack chopper (shoots, can be
// shot down), gunship, counter-UAV (bots' UAV off). node tests/streaks3c.mjs
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, S = F.streakState, o = {}; F.input.freeLook = true;
  const press = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
  const killOne = () => { const P = G.player, b = G.bots.find((q) => q.alive); b.protectUntil = 0; F.damage(b, 999, P, { weapon: 'm4', dist: 10 }); window.__step(2); };
  G.profile.streaks.picks = ['care', 'air', 'chopper']; Object.assign(G.profile.streaks.kills, { care: 2, air: 3, chopper: 4 });
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 7 }); window.__step(240); G.match.rules = { passive: true };
  let P = G.player; P.protectUntil = 1e9;
  killOne(); killOne(); o.careReady = S.ready.includes('care');
  P.pitch = -0.5; press('KeyF'); window.__step(10); o.crate = S.crates.length;
  window.__step(200); const c = S.crates[0]; o.landed = !!(c && c.landed);
  if (c) { P.x = c.x + 1; P.z = c.z; P.y = c.y; window.__step(2); const before = S.ready.length + P.health; press('KeyE'); window.__step(3); o.opened = S.crates.length === 0; }
  killOne(); o.airReady = S.ready.includes('air');
  while (S.ready[0] !== 'air' && S.ready.length) S.ready.shift();
  P.pitch = 0; press('KeyF'); window.__step(3); o.airShells = S.shells.length;
  killOne(); while (S.ready[0] !== 'chopper' && S.ready.length) S.ready.shift(); press('KeyF'); window.__step(240);
  const ch = S.choppers[0]; o.chopper = !!ch; o.chopperY = ch && Math.round(ch.y);
  if (ch) { const bb = G.spawnBot({ name: 'AA', team: 99, weapon: 'm4' }); for (let i = 0; i < 12; i++) { const dx = ch.x - (ch.x + 10), s = F.ballistics.newShot(bb, 'barrett', ch.x + 10, ch.y + 1.3, ch.z, 1); F.ballistics.traceSegment(s, -1, 0, 0, 30); } o.chopperDown = !S.choppers.includes(ch); }
  // gunship + counter-UAV
  G.profile.streaks.picks = ['gunship', 'cuav', 'uav']; Object.assign(G.profile.streaks.kills, { cuav: 2, gunship: 3 });
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 7 }); window.__step(240); G.match.rules = { passive: true }; P = G.player; P.protectUntil = 1e9;
  G.bots.forEach((b) => { b.brain.uavUntil = G.now + 99; });
  killOne(); killOne(); o.cuav = G.bots.every((b) => !(b.brain.uavUntil > G.now));
  killOne(); press('KeyF'); window.__step(200); o.gunshipShells = S.gunships.length > 0;
  Object.assign(G.profile.streaks, { picks: ['uav', 'mortar', 'sentry'] });
  return o;
});
const ok = r.careReady && r.crate === 1 && r.landed && r.opened && r.airReady && r.airShells >= 4 && r.chopper && r.chopperDown && r.cuav && r.gunshipShells;
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3)); await browser.close();
