import { open } from './harness.mjs';
const { browser, page, errors } = await open({w:320,h:240});
console.log(await page.evaluate(() => { const F = window.__frontline, G = F.G, P = () => G.player, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'ffa', map: 'yard', difficulty: 'normal', count: 3 }); window.__step(200);
  // shove player into each map's colliders and check escape
  for (const map of ['yard','outpost','atomic','gorge']) { F.deploy({ mode: 'sandbox', map, difficulty: 'normal', count: 0 }); window.__step(200);
    const cols = G.world.colliders.filter(c => !c.pass && c.maxY < 6 && c.maxY - c.minY > 1.5 && (c.maxX-c.minX) > 0.3 && (c.maxZ-c.minZ) > 0.3); let ok = 0, fail = [];
    for (let i = 0; i < cols.length; i += Math.ceil(cols.length / 25)) { const c = cols[i]; const p = P(); p.x = (c.minX + c.maxX) / 2; p.z = (c.minZ + c.maxZ) / 2; p.y = Math.max(0, c.minY); p.vy = 0;
      window.__step(2); if (!F.physics.blocked(p.x, p.z, p.r, p.y, p.h)) ok++; else fail.push([c.minX,c.maxX,c.minZ,c.maxZ].map(v=>v.toFixed(1)).join(',')); }
    o[map] = { ok, fail: fail.slice(0, 3) }; }
  // redeploy
  F.deploy({ mode: 'ffa', map: 'yard', difficulty: 'normal', count: 0 }); window.__step(240);
  const p = P(); p.streak = 2; const x0 = p.x, d0 = p.deaths;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); window.__step(2);
  o.paused = G.state; o.btnHidden = document.getElementById('redeploy').classList.contains('hidden'); document.getElementById('redeploy').click(); window.__step(2);
  o.redeploy = { state: G.state, moved: Math.abs(p.x - x0) > 0.1, deaths: p.deaths - d0, streak: p.streak };
  p.lastHitAt = G.now; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); window.__step(1);
  o.underFire = [document.getElementById('redeploy').disabled, document.getElementById('redeploy').textContent];
  document.getElementById('resume').click(); window.__step(2);
  F.deploy({ mode: 'survival', map: 'yard', difficulty: 'normal', count: 0 }); window.__step(240);
  const l0 = G.match.lives; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); window.__step(1); document.getElementById('redeploy').click(); window.__step(2);
  o.survival = { state: G.state, livesLost: l0 - G.match.lives, feed: document.getElementById('killfeed') && document.getElementById('killfeed').textContent.slice(0, 60) };
  window.__step(400); o.survivalAfter = G.state;
  return JSON.stringify(o, null, 1); }), errors);
await browser.close();
