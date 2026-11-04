// Frame cost + draw calls (SwiftShader, so absolute ms are pessimistic; compare runs). node tests/perf.mjs [map] [vehicles 0/1]
import { shotSession } from './shot.mjs';
const map = process.argv[2] || 'gorge', veh = process.argv[3] === '1';
const s = await shotSession();
const r = await s.page.evaluate(([map, veh]) => { const F = window.__frontline, G = F.G, R = G.renderer;
  F.input.freeLook = true; G.profile.lobby.vehicles = veh; G.profile.settings.renderScale = 1; window.dispatchEvent(new Event('resize'));
  F.deploy({ mode: 'tdm', map, difficulty: 'normal', count: 9 }); window.__step(400);
  G.player.protectUntil = 1e12;
  R.info.autoReset = false; R.info.reset(); window.__step(1); const calls = R.info.render.calls, tris = R.info.render.triangles; R.info.autoReset = true;
  const t0 = performance.now(); window.__step(60); return { map, vehicles: F.vehicles.length, calls, tris, ms: +((performance.now() - t0) / 60).toFixed(1) };
}, [map, veh]);
console.log(JSON.stringify(r), s.errors.length); await s.browser.close();
