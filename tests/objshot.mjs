// Screenshot an objective zone (dom / koth / snd) from 8 m away. /tmp/obj_<mode>.png
import { shotSession } from './shot.mjs';
const s = await shotSession(), mode = process.argv[2] || 'dom';
await s.prep({ mode, map: process.argv[3] || 'outpost', skill: 5, count: 3 }, 300);
await s.shot(`/tmp/obj_${mode}.png`, () => { const G = window.__frontline.G, z = G.match.hook.botGoal({ team: 0, id: 3, x: 0, z: 0 }), P = G.player; P.x = z.x + 7; P.z = z.z + 4; P.y = z.y; P.yaw = Math.atan2(-(z.x - P.x), -(z.z - P.z)); P.pitch = -0.15; });
await s.browser.close();
