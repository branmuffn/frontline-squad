// Kill cam screenshots (logic stubbed until the replay, then one real render): node tests/kcshot.mjs [weapon]
// weapon: 'gun' (killer's eyes + slow-mo final blow) or 'mortar' (orbit view)
import { open } from './harness.mjs';
const kind = process.argv[2] || 'gun';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate((kind) => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true;
  F.deploy({ mode: 'survival', map: 'outpost', skill: 5 }); window.__step(260);
  const P = G.player; let n = 0;
  while (G.bots.filter((b) => b.alive).length < 1 && n++ < 600) window.__step(1);
  const b = G.bots.find((q) => q.alive); b.x = P.x + 7; b.z = P.z + 3; b.y = P.y; window.__step(80);
  P.protectUntil = 0; F.damage(P, 999, b, { weapon: kind === 'gun' ? 'm4' : 'mortar', explosive: kind !== 'gun', sx: b.x, sz: b.z });
  const out = { state: G.state };
  window.__step(32); out.t1 = document.getElementById('killcam').className;
  let k = 0; while (!document.getElementById('killcam').classList.contains('slow') && k++ < 200) window.__step(1);
  out.slowAt = k; out.info = document.getElementById('killcamInfo').textContent;
  const o = G.renderer.__orig; Object.assign(G.renderer, o); window.__step(1);
  return out;
}, kind);
await page.screenshot({ path: `/tmp/kc_${kind}.png` });
console.log(JSON.stringify(r), 'ERRORS', errors.slice(0, 3)); await browser.close();
