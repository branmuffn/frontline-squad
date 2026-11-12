// New-map smoke: spawns/pickups not inside geometry, FFA/TDM/Domination/S&D run 25 s each with no NaN or stuck units. node tests/mapsmoke.mjs <map>
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const map = process.argv[2] || 'harbour';
const line = await page.evaluate((map) => {
  const F = window.__frontline, G = F.G, out = []; F.input.freeLook = true;
  // spawn/pickup validity like regress: not blocked, on the nav grid
  F.deploy({ mode: 'ffa', map, skill: 5, count: 9 }); window.__step(30);
  const W = G.world, bad = [];
  for (const [x, z, y = 0] of W.spawns.ffa.concat(W.spawns.teams[0], W.spawns.teams[1])) { const h = F.physics.supportHeight(x, z, 0.2, y + 0.5); if (F.physics.blocked(x, z, 0.4, h, 1.8)) bad.push('spawn ' + x + ',' + z); }
  for (const p of W.def.pickups || []) { const h = F.physics.supportHeight(p.x, p.z, 0.2, p.y + 0.5); if (F.physics.blocked(p.x, p.z, 0.4, h, 1.8)) bad.push('pickup ' + p.x + ',' + p.z); }
  for (const mode of ['ffa', 'tdm', 'dom', 'snd']) {
    F.deploy({ mode, map, skill: 5, count: mode === 'ffa' ? 9 : 5 }); let kills = 0, nan = 0;
    for (let i = 0; i < 60 * 25; i++) { window.__step(1); }
    kills = G.units.reduce((a, u) => a + u.kills, 0); nan = G.units.filter((u) => !isFinite(u.x + u.y + u.z)).length;
    const stuck = G.units.filter((u) => u.alive && F.physics.blocked(u.x, u.z, 0.3, u.y + 0.05, 1.5)).length;
    out.push(`${mode}: kills ${kills} nan ${nan} stuck ${stuck}`);
  }
  return out.join(' | ') + ' || bad: ' + bad.join(', ');
}, map);
console.log(line, 'ERR', errors.slice(0, 3));
const ok = !/ (nan|stuck) [1-9]/.test(line) && /\|\| bad: $/.test(line) && !errors.length; // no NaN, no stuck units, nothing in bad
console.log(ok ? 'PASS mapsmoke ' + map : 'FAIL mapsmoke ' + map);
process.exitCode = ok ? 0 : 1; // exit non-zero on FAIL
await browser.close();
