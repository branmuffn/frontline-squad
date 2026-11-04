// Kill cam screenshots (logic stubbed until the replay, then one real render): node tests/kcshot.mjs [gun|snipe|mortar]
// gun: killer's eyes + slow-mo + the killing round; snipe: 30 m scoped L96 (scope view, bullet-follow camera); mortar: orbit
import { open } from './harness.mjs';
const kind = process.argv[2] || 'gun';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate((kind) => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true;
  F.deploy({ mode: 'survival', map: kind === 'snipe' ? 'yard' : 'outpost', skill: 5 }); window.__step(260);
  const P = G.player; let n = 0;
  while (G.bots.filter((b) => b.alive).length < 1 && n++ < 600) window.__step(1);
  const b = G.bots.find((q) => q.alive), far = kind === 'snipe' ? 30 : 7;
  b.x = P.x + far; b.z = P.z + 1; b.y = P.y; if (kind === 'snipe') { b.brain.weapon = 'l96'; b.weapon = 'l96'; }
  for (let i = 0; i < 80; i++) { if (kind === 'snipe') { b.brain.state = 'engage'; b.brain.visible = true; b.brain.target = P; } b.yaw = Math.atan2(-(P.x - b.x), -(P.z - b.z)); window.__step(1); }
  P.protectUntil = 0;
  if (kind === 'mortar') F.damage(P, 999, b, { weapon: 'mortar', explosive: true, sx: b.x, sz: b.z });
  else { P.health = 1; const ey = b.y + 1.5, dx = P.x - b.x, dy = P.y + 1.3 - ey, dz = P.z - b.z, L = Math.hypot(dx, dy, dz); const s = F.ballistics.newShot(b, kind === 'snipe' ? 'l96' : 'm4', b.x, ey, b.z, 1); F.ballistics.traceSegment(s, dx / L, dy / L, dz / L, 200); }
  const out = { state: G.state };
  let k = 0; while (!document.getElementById('killcam').classList.contains('slow') && k++ < 300) window.__step(1);
  window.__step(kind === 'snipe' ? 112 : 106);
  out.slowAt = k; out.info = document.getElementById('killcamInfo').textContent; out.scope = document.getElementById('scope').classList.contains('on'); out.fov = Math.round(G.camera.fov);
  const o = G.renderer.__orig; Object.assign(G.renderer, o); window.__step(1);
  return out;
}, kind);
await page.screenshot({ path: `/tmp/kc_${kind}.png` });
console.log(JSON.stringify(r), 'ERRORS', errors.slice(0, 3)); await browser.close();
