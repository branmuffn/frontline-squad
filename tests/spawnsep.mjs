// Nobody spawns inside another soldier: every mode x map, at the deploy countdown and after respawns.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, out = []; F.input.freeLook = true;
  for (const map of ['yard', 'outpost', 'atomic', 'atomicnight', 'harbour', 'gorge', 'radar']) for (const [mode, count] of [['ffa', 9], ['tdm', 6], ['ctf', 6], ['gungame', 9], ['infection', 11], ['survival', 6]]) {
    F.deploy({ mode, map, skill: 5, count }); window.__step(3);
    let min = 99; const U = G.units.filter((u) => u.alive);
    for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) min = Math.min(min, Math.hypot(U[i].x - U[j].x, U[i].z - U[j].z) + Math.abs(U[i].y - U[j].y));
    if (min < 1.0) out.push(`${mode}/${map} ${min.toFixed(2)}`);
  }
  return out;
});
console.log(r.length ? 'overlaps: ' + r.join(', ') : 'no overlaps', !r.length && !errors.length ? 'PASS spawnsep' : 'FAIL spawnsep', errors.slice(0, 3));
await browser.close();
