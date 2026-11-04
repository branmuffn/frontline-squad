// Skins visual check: a line-up of uniform / pattern / helmet combinations -> /tmp/skins.png
import { shotSession } from './shot.mjs';
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'yard', difficulty: 'normal', count: 0 }, 240);
await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player;
  const combos = [[0x5f6a52, null, 0x4a5340], [0x5f6a52, [0x2f3624, 0x6f6a45], 0x8a7a58], [0x857b5f, [0xc4ad83, 0x7d6a4c], 0x1e2124], [0x6c7277, [0x9aa0a4, 0x3d4245], 0xd8dcdc],
    [0x3b4a63, [0x445566, 0x8899aa], 0x7a2a24], [0x2a2e31, [0x1f2218, 0x8a7a4a], 0xb8913e], [0x6a2a26, [0xe0c06a, 0x8a6a24], 0xb8913e]];
  combos.forEach(([u, p, h], i) => { const b = G.spawnBot({ name: 'S' + i, team: 1, weapon: 'm4', uniform: u, pattern: p, helmet: h, accent: 0xb8402e }); Object.assign(b, { x: -4.2 + i * 1.4, z: -3, y: 0, yaw: Math.PI + (i % 2 ? 0.4 : -0.3), moveSpeed: 0 }); });
  F.input.freeLook = true; G.state = 'deploy'; P.x = 0; P.z = 3; P.y = 0; P.yaw = 0; P.pitch = -0.1; window.__step(3);
});
await s.shot('/tmp/skins.png', () => { window.__frontline.G.camera.position.set(0, 1.4, 2.6); });
console.log('ERRORS', s.errors.length, s.errors.slice(0, 3)); await s.browser.close();
