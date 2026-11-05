// Range aim drills: flick (hit the lit target) and tracking (damage on movers), 30 s each, best saved.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 640, h: 400 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'range', map: 'yard', skill: 5 }); window.__step(200);
  const key = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); window.__step(2); };
  for (const kind of ['flick', 'track']) {
    key('KeyB'); document.querySelector(`#armory [data-a="drill:${kind}"]`).click(); window.__step(10);
    o[kind + 'Sub'] = document.getElementById('scSub') && document.getElementById('scSub').textContent;
    for (let i = 0; i < 31 * 60; i++) {
      if (i % 20 === 0) for (const b of G.bots) if (b.alive && (kind === 'track' ? b.dummy.rail : !b.dummy.rail)) { F.damage(b, 10, G.player, { weapon: 'm4' }); if (kind === 'flick') break; }
      if (i % 20 === 0 && kind === 'flick') for (const b of G.bots) if (b.alive && !b.dummy.rail) F.damage(b, 1, G.player, { weapon: 'm4' });
      window.__step(1);
    }
    o[kind + 'Best'] = G.profile.best[kind];
  }
  return o;
});
const ok = r.flickBest > 5 && r.trackBest > 50 && /Flick/.test(r.flickSub) && /Tracking/.test(r.trackSub);
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS drill' : 'FAIL drill', errors.slice(0, 3));
await browser.close();
