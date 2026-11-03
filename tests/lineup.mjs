// B6 visual check: a line-up of soldiers (each weapon), a zombie and an infected, standing and running. node tests/lineup.mjs
import { shotSession } from './shot.mjs';
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'yard', difficulty: 'normal', count: 0 }, 240);
const setup = (run) => s.page.evaluate((run) => {
  const F = window.__frontline, G = F.G, P = G.player;
  if (!window.__line) {
    const ws = ['m4', 'ak47', 'mp5', 'm870', 'm249', 'mk14', 'barrett', 'usp', 'knife'];
    window.__line = ws.map((w, i) => G.spawnBot({ name: 'T' + i, team: 1, weapon: w, uniform: [0x5f6a52, 0x3a3f44, 0x857b5f][i % 3], accent: [0xb8402e, 0x2f6fb0, 0xd8a23a][i % 3] }));
    window.__line.push(G.spawnBot({ name: 'Z', team: 1, weapon: 'knife', type: 'zombie', uniform: 0x3d4436, accent: 0x2b2b26, skin: 0x7f8a66, noHelmet: true }));
    const inf = G.spawnBot({ name: 'I', team: 1, weapon: 'knife', uniform: 0x46423c, accent: 0x6fbf4a }); window.__inf = inf; window.__line.push(inf);
  }
  G.state = 'deploy'; // freeze AI; we pose by hand
  window.__line.forEach((u, i) => { u.x = -6.6 + i * 1.3; u.z = -4; u.y = 0; u.yaw = Math.PI + (i % 2 ? 0.5 : -0.3); u.moveSpeed = run ? 6.5 : 0; u.aimPitch = 0; u.crouchT = 0; u.alive = true; u.soldier.deathT = -1; });
  P.x = 0; P.z = 3.2; P.y = 0; P.yaw = 0; P.pitch = -0.12;
  return true;
}, run);
await setup(false);
await s.page.evaluate(() => { const F = window.__frontline; F.input.freeLook = true; F.G.state = 'deploy'; window.__step(3); });
await s.shot('/tmp/lineup_stand.png', () => { window.__frontline.G.camera.position.set(0, 1.5, 3.2); });
await setup(true); await s.page.evaluate(() => window.__step(9));
await s.shot('/tmp/lineup_run.png', () => { window.__frontline.G.camera.position.set(0, 1.5, 3.2); });
console.log('ERRORS', s.errors.length, s.errors.slice(0, 3));
await s.browser.close();
