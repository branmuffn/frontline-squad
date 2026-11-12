// Map editor: open it, place pieces (block, wall, ramp, spawns), remove/undo, the custom map rebuilds with colliders,
// test-play as FFA with bots on it, and the JSON round-trips. Screenshot /tmp/editor.png
import { open } from './harness.mjs';
import { shotSession } from './shot.mjs';
const s = process.argv[2] === 'shot' ? await shotSession() : await open({ w: 640, h: 400 }); // logic in stub mode; 'shot' = real render
const r = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; localStorage.removeItem('frontline_custom_map'); F.input.freeLook = true; G.profile.settings.renderScale = 0.1;
  document.getElementById('openEditor').click(); window.__step(220);
  const key = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); window.__step(2); };
  const P = G.player; o.map = G.world.id; Object.assign(P, { x: 0, z: 10, y: 0, yaw: 0, pitch: -0.35 }); window.__step(2);
  key('Digit1'); key('KeyF'); P.yaw = 0.5; window.__step(2); key('Digit2'); key('KeyR'); key('KeyF'); P.yaw = -0.5; window.__step(2); key('Digit3'); key('KeyF');
  P.yaw = 3.1; window.__step(2); key('Digit7'); key('KeyF'); P.yaw = 1.6; window.__step(2); key('Digit8'); key('KeyF');
  const m = JSON.parse(localStorage.getItem('frontline_custom_map')); o.pieces = m.objs.map((q) => q.t).join(',');
  o.cols = G.world.colliders.length; P.yaw = 0; window.__step(2); key('KeyX'); o.afterX = JSON.parse(localStorage.getItem('frontline_custom_map')).objs.length; key('KeyZ'); o.afterZ = JSON.parse(localStorage.getItem('frontline_custom_map')).objs.length;
  o.spawns = JSON.stringify(G.world.def.spawns.teams.map((t) => t.length));
  return o;
});
if (process.argv[2] === 'shot') await s.shot('/tmp/editor.png'); // real render (SwiftShader can crash on long sessions)
const t = await s.page.evaluate(() => { const F = window.__frontline, G = F.G; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyT' })); window.__step(60 * 15);
  return [G.match.mode, G.world.id, G.bots.length, G.units.filter((u) => !isFinite(u.x)).length, G.units.reduce((a, u) => a + u.kills, 0)]; });
const ok = r.map === 'custom' && r.pieces === 'box,wall,ramp,spawnA,spawnB' && r.afterX === 4 && r.afterZ === 5 && t[0] === 'ffa' && t[1] === 'custom' && t[2] === 5 && t[3] === 0;
console.log(JSON.stringify(r), JSON.stringify(t), ok && !s.errors.length ? 'PASS editor' : 'FAIL editor', s.errors.slice(0, 3));
process.exitCode = ok && !s.errors.length ? 0 : 1; // exit non-zero on FAIL
await s.browser.close();
