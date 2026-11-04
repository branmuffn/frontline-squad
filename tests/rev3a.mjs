// Rev 3a logic: match limits, pickups toggle, Standard slots (rifle into the sidearm slot), scope toggle, relock button.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3, limits: { ffa: { score: 0, time: 0 } }, pickups: false });
  o.noLimit = !G.match.timed && G.match.scoreLimit === Infinity;
  window.__step(240); o.timeStill = G.match.time; o.pickupsOff = F.worldprops && true;
  F.deploy({ mode: 'tdm', map: 'yard', skill: 5, count: 4, limits: { tdm: { score: 25, time: 5 } } });
  o.tdm = [G.match.scoreLimit, G.match.time, G.match.timed];
  // Standard slots: holding the pistol (slot 1), pick up an L96 -> it replaces the pistol, the M4 stays
  window.__step(200); const P = G.player; P.slot = 1; const before = P.weapons.slice();
  F.worldprops.dropWeapon('l96', P.x, P.y + 0.02, P.z); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); window.__step(2);
  o.slots = [before.join(','), P.weapons.join(',')];
  return o;
});
const pk = await page.evaluate(() => { const F = window.__frontline; F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3, pickups: false }); window.__step(30); const a = F.G.world && document; return F.G.match.pickupsOn; });
const ok = r.noLimit && r.tdm[0] === 25 && r.tdm[1] === 300 && r.slots[1].startsWith(r.slots[0].split(',')[0]) && r.slots[1].includes('l96') && pk === false;
console.log(JSON.stringify(r), pk, ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3)); await browser.close();
