// Phase 6b: helicopter - enter, take off, climb, fly forward, turn toward view, no wall clipping, door gun arc, autorotate + land, crash damage.
import { shotSession } from './shot.mjs';
const SHOTS = process.argv[2] === 'shots';
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 1 }, 1);
const key = (code) => `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}' }));`;
const r = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G; G.profile.lobby.vehicles = true;
  F.deploy({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 1 }); window.__step(200);
  const press = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); window.__step(2); };
  const hs = F.vehicles.filter((v) => v.type === 'heli'), v = hs[0], P = G.player, out = { helis: hs.length, total: F.vehicles.length };
  P.x = v.x + 3.4; P.z = v.z; P.y = v.y; P.protectUntil = 1e9; press('KeyE');
  out.entered = P.vehicle === v && P.seat === 0; const y0 = v.y;
  P.yaw = v.yaw; F.input.keys.Space = true; window.__step(150); F.input.keys.Space = false;
  out.climbed = +(v.y - y0).toFixed(1);
  const x0 = v.x, z0 = v.z; F.input.keys.KeyW = true; window.__step(150); out.flew = +Math.hypot(v.x - x0, v.z - z0).toFixed(1); out.kmh = Math.round(v.speed * 3.6);
  const yawBefore = v.yaw; P.yaw = v.yaw + 1.2; window.__step(90); out.turned = +(v.yaw - yawBefore).toFixed(2);
  window.__step(300); F.input.keys.KeyW = false; // fly on into whatever is there
  G.ignoreDyn = v.dyn; out.inWall = F.physics.blocked(v.x, v.z, 0.6, v.y + 0.4, 1.2); G.ignoreDyn = null; out.nan = !isFinite(v.x + v.y + v.z);
  out.alt = +v.y.toFixed(1); out.hp = Math.round(v.hp);
  press('Digit2'); out.gunner = P.seat === 1;
  P.yaw = v.yaw - Math.PI / 2; P.pitch = -0.15; window.__step(3); out.arcClamped = v.gunYaw >= v.spec.gunArc[0] - 1e-6 && v.gunYaw <= v.spec.gunArc[1] + 1e-6;
  return out;
});
if (SHOTS) await s.shot('/tmp/heli_gunner.png');
const r2 = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player, v = P.vehicle, out = {};
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit1' })); window.__step(3);
  P.pitch = -0.25; window.__step(5);
  return out;
});
if (SHOTS) await s.shot('/tmp/heli_pilot.png');
const r3 = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player, v = F.vehicles.find((q) => q.type === 'heli'), out = {};
  // pilot bails out mid-air: heli autorotates down and lands; pilot falls
  const alt0 = v.y; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  window.__step(2); out.bailed = !P.vehicle; out.pilotY = +P.y.toFixed(1); out.heliY = +alt0.toFixed(1);
  window.__step(60 * 12); out.landedY = +v.y.toFixed(1); out.ground = +F.physics.supportHeight(v.x, v.z, 1, v.y + 0.5).toFixed(1); out.hp = Math.round(v.hp);
  return out;
});
console.log(JSON.stringify({ ...r, ...r2, ...r3 }), 'ERRORS', s.errors.length, s.errors.slice(0, 3));
await s.browser.close();
