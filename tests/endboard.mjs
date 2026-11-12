// End screen: a K/D board for every mode; an Infection timer win goes straight to the end screen (no stale replay).
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const out = {};
for (const [mode, map, count] of [['infection', 'gorge', 5], ['gungame', 'yard', 3], ['ctf', 'yard', 3], ['zombies', 'yard', 0], ['dom', 'outpost', 3], ['snd', 'yard', 2]]) {
  out[mode] = await page.evaluate(([mode, map, count]) => {
    const F = window.__frontline, G = F.G; F.input.freeLook = true;
    F.deploy({ mode, map, skill: 5, count }); window.__step(240);
    const P = G.player; P.protectUntil = 1e9;
    if (mode === 'infection') { G.match.time = 0.5; for (let i = 0; i < 400 && G.state !== 'ended'; i++) { if (P.team === 1) P.team = 0; window.__step(1); } }
    else { F.endMatch('limit'); for (let i = 0; i < 600 && G.state !== 'ended'; i++) window.__step(1); }
    return [G.state, document.querySelectorAll('#endBoard tr').length, document.getElementById('endTitle').textContent];
  }, [mode, map, count]);
}
await page.screenshot({ path: '/tmp/endboard.png' });
const ok = Object.values(out).every((v) => v[0] === 'ended' && v[1] >= 2) && out.infection[2] === 'Victory';
console.log(JSON.stringify(out), ok && !errors.length ? 'PASS endboard' : 'FAIL endboard', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
