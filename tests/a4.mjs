import { open } from './harness.mjs';
const { browser, page, errors } = await open({w:320,h:240});
console.log(await page.evaluate(() => { const F = window.__frontline, G = F.G, B = F.ballistics, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'sandbox', map: 'outpost', difficulty: 'normal', count: 1 }); window.__step(240);
  const P = G.player, T = G.bots[0]; T.brain.think = () => {};
  const place = (u, x, y, z) => Object.assign(u, { x, y, z, alive: true, health: 1000, maxHealth: 1000, protectUntil: 0 });
  // fire from (sx,sy,sz) at target chest; returns damage dealt
  const shoot = (wid, sx, sy, sz, tx, tz, ty = 0) => { place(T, tx, ty, tz); const h0 = T.health; const cy = ty + 1.1;
    let dx = tx - sx, dy = cy - sy, dz = tz - sz; const d = Math.hypot(dx, dy, dz); dx /= d; dy /= d; dz /= d;
    const w = { ...G.player }; const s = B.newShot(P, wid, sx, sy, sz, 1, 5); B.traceSegment(s, dx, dy, dz, 999); return +(h0 - T.health).toFixed(1); };
  // range: high in the air over open ground so nothing blocks
  o.range = {};
  for (const [wid, d] of [['usp', 25], ['usp', 50], ['usp', 65], ['mp5', 60], ['mp5', 75], ['m4', 30], ['m4', 80], ['m870', 6], ['m870', 25], ['m870', 35]]) o.range[wid + '@' + d] = shoot(wid, -30 + d, 60, -30 + 0.001, -30, -30, 58.9);
  // penetration through house wall on outpost (adobe 0.5 m): house at -24,22, south wall z=26
  o.adobe = {}; for (const wid of ['usp', 'mp5', 'm4', 'l96', 'barrett']) o.adobe[wid] = shoot(wid, -22, 1.4, 30, -22, 23);
  F.deploy({ mode: 'sandbox', map: 'atomic', difficulty: 'normal', count: 1 }); window.__step(240);
  const P2 = G.player, T2 = G.bots[0];
  return JSON.stringify(o); }), errors);
await browser.close();
