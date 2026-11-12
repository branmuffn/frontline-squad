// B5: practice range rack: B opens it, tick any number of guns (all / clear), they're carried at once, 1-9 / wheel
// switch, the rack survives a respawn and is remembered in the profile. Screenshot /tmp/rack.png.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'range', map: 'yard', skill: 5 }); window.__step(200);
  const key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code })); window.dispatchEvent(new KeyboardEvent('keyup', { code })); window.__step(2); };
  key('KeyB'); o.open = !document.getElementById('armory').classList.contains('hidden'); o.title = document.getElementById('armTitle').textContent;
  for (const id of ['m4', 'ak47', 'l96', 'barrett', 'mp5', 'm870', 'deagle']) document.querySelector(`#armory [data-r="${id}"]`).click();
  o.stillOpen = !document.getElementById('armory').classList.contains('hidden');
  o.weapons = G.player.weapons.join(','); o.labels = document.querySelectorAll('#armory .arm-grid button.sel').length;
  document.querySelector('#armory [data-a="close"]').click(); window.__step(30);
  key('Digit5'); window.__step(30); o.digit5 = G.player.weapons[G.player.slot];
  F.cycleWeapon && F.cycleWeapon(1); o.hud = document.getElementById('wCls').textContent;
  const P = G.player; P.protectUntil = 0; F.damage(P, 999, null, { weapon: 'fall' }); window.__step(400);
  o.afterRespawn = G.player.weapons.join(','); o.saved = G.profile.rangeRack.length;
  key('KeyB'); document.querySelector('#armory [data-r="all"]').click(); o.all = G.player.weapons.length;
  return o;
});
await page.screenshot({ path: '/tmp/rack.png' });
await page.evaluate(() => document.querySelector('#armory [data-r="none"]').click());
const none = await page.evaluate(() => window.__frontline.G.profile.rangeRack.length);
const ok = r.open && r.title === 'Range rack' && r.stillOpen && r.weapons === 'm4,ak47,l96,barrett,mp5,m870,deagle,knife' && r.labels === 7 && r.digit5 === 'mp5'
  && r.afterRespawn === r.weapons && r.saved === 7 && r.all > 10 && none === 0 && /\/8/.test(r.hud);
console.log(JSON.stringify(r), none, ok && !errors.length ? 'PASS rack' : 'FAIL rack', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
