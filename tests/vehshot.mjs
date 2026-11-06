// Quick look at the ATV and Kestrel (fresh page, one real render): /tmp/vehshot.png
import { shotSession } from './shot.mjs';
const s = await shotSession();
await s.page.evaluate(() => { const F = window.__frontline, G = F.G; G.profile.lobby.vehicles = true; F.input.freeLook = true; G.profile.settings.renderScale = 0.1; F.deploy({ mode: 'sandbox', map: 'gorge', skill: 5, count: 0 }); window.__step(120); });
await s.shot('/tmp/vehshot.png', () => { const F = window.__frontline, G = F.G, P = G.player, a = F.vehicles.find((v) => v.type === 'atv'), k = F.vehicles.find((v) => v.type === 'kestrel');
  Object.assign(k, { x: a.x + 4, z: a.z - 1, y: a.y }); window.__step(1); P.x = a.x + 2; P.z = a.z + 7; P.y = a.y; P.yaw = Math.atan2(-(a.x + 2 - P.x), -(a.z - P.z)); P.pitch = -0.25; });
console.log('ERRORS', s.errors.length); await s.browser.close();
