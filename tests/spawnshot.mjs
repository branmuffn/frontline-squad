// Screenshot during the pre-match countdown and after it (looks for stray objects around the player).
import { shotSession } from './shot.mjs';
const s = await shotSession(), mode = process.argv[2] || 'ffa';
await s.prep({ mode, map: process.argv[3] || 'outpost', skill: 5, count: 5 }, 5);
const info = await s.page.evaluate(() => { const G = window.__frontline.G; return { state: G.state, near: G.units.filter((u) => u !== G.player).map((u) => +Math.hypot(u.x - G.player.x, u.z - G.player.z).toFixed(2)).sort((a, b) => a - b).slice(0, 5), prot: G.units.filter((u) => u.protectUntil > G.now).length }; });
for (const yaw of [0, 1.57, 3.14]) await s.shot(`/tmp/spawn_${mode}_${yaw}.png`, (y) => { const G = window.__frontline.G; G.player.yaw = y; G.player.pitch = -0.5; }, yaw);
console.log(JSON.stringify(info));
await s.browser.close();
