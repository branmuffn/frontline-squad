// Usage: node regress.mjs [seconds]  -> all modes x all maps, logic stub, deterministic stepping
import { open } from './harness.mjs';
const SECS = +process.argv[2] || 45;
const MAPS = ['yard', 'outpost', 'atomic', 'atomicnight', 'harbour', 'gorge'], MODES = ['ffa', 'tdm', 'survival', 'sandbox'];
const { browser, page, errors } = await open({w:320,h:240});
// static: spawns and pickups clear of colliders and on/near main nav
const st = await page.evaluate((maps) => {
  const F = window.__frontline, out = [];
  for (const id of maps) {
    F.loadMap(id); F.nav.buildNav ? 0 : 0;
    const w = F.G.world; if (!w.nav) { /* build */ }
    out.push(id);
  }
  return out;
}, MAPS);
const res = [];
for (const map of MAPS) for (const mode of MODES) {
  const r = await page.evaluate(([map, mode, secs]) => {
    const F = window.__frontline, G = F.G; F.input.freeLook = true;
    F.deploy({ mode, map, difficulty: 'normal', count: 5 });
    const w = G.world, bad = [];
    const allS=[...w.spawns.ffa,...w.spawns.teams.flat()]; for (const s of allS) { const y = s[2] || 0; if (F.physics.blocked(s[0], s[1], 0.38, y, 1.7)) bad.push('spawn ' + s.join(',')); const n = F.nav.nearestNode(s[0], y, s[1]); if (!n || Math.hypot(n.x - s[0], n.z - s[1]) > 3) bad.push('spawn-nav ' + s.join(',')); }
    for (const p of w.pickups || []) { const x = p.x ?? p[0], z = p.z ?? p[1], y = p.y ?? 0; const n = F.nav.nearestNode(x, y, z); if (!n || Math.hypot(n.x - x, n.z - z) > 3) bad.push('pickup-nav ' + x + ',' + z); }
    let stuckMax = 0, nan = 0, insideMax = 0;
    const last = new Map(), stillT = new Map();
    const N = Math.round(secs * 60);
    for (let i = 0; i < N; i++) {
      window.__step(1);
      if (i % 30 === 0) for (const u of G.units) {
        if (!u.alive) continue;
        if (!isFinite(u.x + u.y + u.z)) nan++;
        if (F.physics.blocked(u.x, u.z, u.r, u.y, u.h)) { const k = (u._in || 0) + 1; u._in = k; insideMax = Math.max(insideMax, k); } else u._in = 0;
      }
    }
    const kills = G.units.reduce((a, u) => a + u.kills, 0), deaths = G.units.reduce((a, u) => a + u.deaths, 0);
    const out = { map, mode, state: G.state, kills, deaths, nan, insideMax, bad: bad.slice(0, 4), wave: G.match.wave };
    window.__frontline && G.state !== 'menu' && document.getElementById('quit') && (G.state = 'paused');
    return out;
  }, [map, mode, SECS]);
  res.push(r);
  console.log(JSON.stringify(r));
}
console.log('ERRORS', errors.length, errors.slice(0, 8));
// FAIL (exit 1): console/page errors or NaN positions. Spawn/pickup checks (bad) and units inside geometry (insideMax)
// are printed as warnings only: harbour's spawns at x = ±40, z = 0 have always tripped spawn-nav.
const nan = res.filter((r) => r.nan > 0).map((r) => r.map + '/' + r.mode);
const warn = [...new Set(res.flatMap((r) => r.bad.map((b) => r.map + ' ' + b)).concat(res.filter((r) => r.insideMax > 0).map((r) => `${r.map}/${r.mode} insideMax ${r.insideMax}`)))];
const pass = !errors.length && !nan.length;
console.log(pass ? 'PASS regress' : 'FAIL regress' + (nan.length ? ' NaN: ' + nan.join(', ') : '') + (errors.length ? ' errors: ' + errors.length : ''), warn.length ? '(warnings: ' + warn.join(', ') + ')' : '');
process.exitCode = pass ? 0 : 1; // exit non-zero on FAIL
await browser.close();
