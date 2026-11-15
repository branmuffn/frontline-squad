// Sprint stamina (Brian, 2026-11-15): a full bar lasts ~6 s of sprinting, then you're winded (no sprint) until it refills
// to 30%; it refills after a 1 s rest; the gold bar under health shows only while not full. Desktop keys (touch shares it).
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 640, h: 400 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 0 }); window.__step(240);
  const P = G.player, key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
  const bar = () => document.getElementById('stBar').style.opacity || '0'; // inline value (the fade itself runs on real time)
  o.start = [P.stamina, bar()];
  key('KeyW', true); key('ShiftLeft', true);
  window.__step(60); o.at1s = [+P.stamina.toFixed(2), P.sprinting, bar()];
  let t = 0; while (P.sprinting && t < 600) { window.__step(1); t++; } // until it runs out
  o.sprintSecs = +((60 + t) / 60).toFixed(2); o.winded = P.winded;
  window.__step(30); o.stillWinded = [P.sprinting, P.winded]; // holding sprint while winded: no sprint
  key('ShiftLeft', false); key('KeyW', false);
  window.__step(28); o.afterRest1s = +P.stamina.toFixed(2); // nothing refills during the 1 s rest after the last sprint
  window.__step(76); o.at30 = [+P.stamina.toFixed(2), P.winded]; // 1.2 s of refill = 30%: sprint allowed again
  key('KeyW', true); key('ShiftLeft', true); window.__step(2); o.sprintAgain = P.sprinting; key('ShiftLeft', false); key('KeyW', false);
  window.__step(400); o.full = [P.stamina, bar()];
  return o;
});
const ok = r.start[0] === 1 && r.start[1] === '0' && r.at1s[1] === true && r.at1s[0] > 0.8 && r.at1s[0] < 0.87 && r.at1s[2] === '1'
  && r.sprintSecs > 5.8 && r.sprintSecs < 6.2 && r.winded && !r.stillWinded[0] && r.afterRest1s === 0
  && r.at30[0] >= 0.29 && r.at30[1] === false && r.sprintAgain === true && r.full[0] === 1 && r.full[1] === '0';
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS stamina' : 'FAIL stamina', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1;
await browser.close();
