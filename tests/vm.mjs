// B6 viewmodel check: screenshots each gun at hip (/tmp/vm_<id>.png). node tests/vm.mjs [ids...]
import { shotSession } from './shot.mjs';
const ids = process.argv.length > 2 ? process.argv.slice(2) : ['m4', 'ak47', 'mk14', 'm870'];
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'outpost', difficulty: 'normal', count: 0 }, 260);
for (const id of ids) await s.shot(`/tmp/vm_${id}.png`, (id) => { const F = window.__frontline, P = F.G.player; P.weapons[0] = id; P.ammo[id] = P.ammo[id] || { mag: 10, res: 10 }; P.slot = 0; P.yaw = 0.6; P.pitch = 0; window.__step(50); }, id);
console.log('ERRORS', s.errors.length, s.errors.slice(0, 2));
await s.browser.close();
