import { open } from './harness.mjs';
const mode = process.argv[2], map = process.argv[3] || 'yard', secs = +process.argv[4] || 60;
const { browser, page, errors } = await open({w:320,h:240});
console.log(await page.evaluate(([mode, map, secs]) => { const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode, map, difficulty: 'normal', count: mode === 'ctf' ? 4 : 5 }); const P = G.player;
  for (let i = 0; i < secs * 60; i++) { window.__step(1); if (G.state === 'ended') break; }
  o.state = G.state; o.score = ['scAn', 'scA', 'scBn', 'scB', 'scSub'].map(i => document.getElementById(i) && document.getElementById(i).textContent).join(' | ');
  o.kills = G.units.reduce((a, u) => a + u.kills, 0); o.units = G.units.length; o.pw = P.weapons.join(',');
  if (mode === 'gungame') o.tiers = G.units.map(u => u.gg).join(',');
  if (mode === 'infection') o.teams = G.units.map(u => u.team).join('');
  if (mode === 'ctf') o.ts = G.match.teamScores.join(':');
  if (mode === 'zombies') o.z = [G.match.round, G.match.points, G.match.remaining, G.bots.length];
  o.end = document.getElementById('endTitle').textContent + ' / ' + document.getElementById('endDetail').textContent;
  return JSON.stringify(o); }, [mode, map, secs]), errors.slice(0, 5));
process.exitCode = errors.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
