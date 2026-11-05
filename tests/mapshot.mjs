// Screenshot a map from a spawn: node tests/mapshot.mjs <map> [mode]  -> /tmp/map_<map>_<n>.png
import { shotSession } from './shot.mjs';
const s = await shotSession(), map = process.argv[2] || 'atomicnight';
await s.prep({ mode: process.argv[3] || 'ffa', map, skill: 5, count: 3 }, 260);
const pts = await s.page.evaluate(() => { const G = window.__frontline.G, sp = G.world.spawns.ffa; return [sp[0], sp[Math.floor(sp.length / 2)]]; });
for (let i = 0; i < pts.length; i++) await s.shot(`/tmp/map_${map}_${i}.png`, (p) => { const G = window.__frontline.G, P = G.player; P.x = p[0]; P.z = p[1]; P.y = p[2] || 0; P.yaw = Math.atan2(P.x, P.z); P.pitch = -0.05; }, pts[i]);
console.log('ERRORS', s.errors.length, s.errors.slice(0, 2)); await s.browser.close();
