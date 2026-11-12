// Crosshair editor + share codes; MVP card on the end screen. Screenshots /tmp/xh.png, /tmp/mvp.png
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}, $ = (i) => document.getElementById(i);
  $('openSettings').click(); $('xhEdit').click(); o.pop = !$('xhPop').classList.contains('hidden');
  const len = $('xhRows').querySelector('input[data-k="len"]'); len.value = 14; len.dispatchEvent(new Event('input'));
  o.code = $('xhCode').value; o.var = $('crosshair').style.getPropertyValue('--xl');
  $('xhCode').value = 'FX1-ffd34d-5-3-12-4'; $('xhApply').click();
  o.after = [G.profile.settings.crosshair, JSON.stringify(G.profile.settings.xh), $('crosshair').classList.contains('nodot'), $('crosshair').classList.contains('noout')];
  $('xhCode').value = 'nonsense'; $('xhApply').click(); o.bad = $('xhMsg').textContent;
  return o;
});
await page.screenshot({ path: '/tmp/xh.png' });
const e = await page.evaluate(() => {
  const F = window.__frontline, G = F.G; document.getElementById('settingsDone').click(); F.input.freeLook = true;
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3 }); window.__step(200);
  G.bots[0].kills = 7; G.bots[0].deaths = 1; G.player.kills = 3; F.endMatch ? F.endMatch('time') : (G.match.time = 0.01); window.__step(400);
  return [G.state, document.getElementById('endMvp').textContent, document.getElementById('endMvp').classList.contains('hidden')];
});
await page.screenshot({ path: '/tmp/mvp.png' });
const ok = r.pop && /^FX1-[0-9a-f]{6}-14-/.test(r.code) && r.var === '14px' && r.after[0] === '#ffd34d' && r.after[2] && r.after[3] && /isn’t/.test(r.bad) && /MVP/.test(e[1]) && !e[2];
console.log(JSON.stringify(r), JSON.stringify(e), ok && !errors.length ? 'PASS xhmvp' : 'FAIL xhmvp', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
