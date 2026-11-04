// End-of-match replay: the kill that ends the match is replayed ("Final kill"), any key skips, then the end screen.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  const run = (skip) => {
    F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3 }); window.__step(300);
    G.match.scoreLimit = 1; const P = G.player, b = G.bots.find((q) => q.alive); b.protectUntil = 0; b.x = P.x + 6; b.z = P.z; window.__step(30);
    F.damage(b, 999, P, { weapon: 'm4', zone: 'head', headshot: true, dist: 6 });
    const a = { state: G.state, tag: document.querySelector('#killcam .kc-tag b').textContent, vis: !document.getElementById('killcam').classList.contains('hidden') };
    if (skip) { window.__step(20); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })); window.__step(3); a.afterSkip = G.state; }
    else { let n = 0; while (G.state === 'finale' && n++ < 600) window.__step(1); a.frames = n; a.after = G.state; }
    a.endShown = !document.getElementById('end').classList.contains('hidden');
    return a;
  };
  o.full = run(false); o.skip = run(true);
  return o;
});
const ok = r.full.state === 'finale' && r.full.tag === 'Final kill' && r.full.vis && r.full.after === 'ended' && r.full.frames > 60 && r.full.endShown && r.skip.afterSkip === 'ended';
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3)); await browser.close();
