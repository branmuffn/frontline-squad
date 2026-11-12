// 3f vehicles: ATV (ride, fast, one seat) and Kestrel (one-seat flyer: climb, fly faster than the helicopter, nose guns).
// Screenshot /tmp/veh3f.png of both on the Gorge plateau.
import { shotSession } from './shot.mjs';
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 1 }, 1);
const r = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G; G.profile.lobby.vehicles = true;
  F.deploy({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 1 }); window.__step(200);
  const press = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); window.__step(2); };
  const P = G.player, out = { types: F.vehicles.map((v) => v.type).join(',') }; P.protectUntil = 1e9;
  const atv = F.vehicles.find((v) => v.type === 'atv');
  P.x = atv.x + 1.6; P.z = atv.z; P.y = atv.y; press('KeyE'); out.atvIn = P.vehicle === atv && atv.seats.length === 1;
  const x0 = atv.x, z0 = atv.z; P.yaw = atv.yaw; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); let top = 0; for (let i = 0; i < 150; i++) { window.__step(1); top = Math.max(top, atv.speed); } window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); out.atvTop = Math.round(top * 3.6);
  out.atvMoved = +Math.hypot(atv.x - x0, atv.z - z0).toFixed(1); out.atvKmh = Math.round(Math.abs(atv.speed) * 3.6); press('KeyE'); window.__step(30);
  const k = F.vehicles.find((v) => v.type === 'kestrel');
  P.x = k.x + 2.2; P.z = k.z; P.y = k.y; window.__step(2); press('KeyE'); out.kIn = P.vehicle === k;
  const y0 = k.y; P.yaw = k.yaw; F.input.keys.Space = true; window.__step(120); F.input.keys.Space = false; out.kClimb = +(k.y - y0).toFixed(1);
  const kx = k.x, kz = k.z; F.input.keys.KeyW = true; window.__step(150); F.input.keys.KeyW = false; out.kFlew = +Math.hypot(k.x - kx, k.z - kz).toFixed(1); out.kKmh = Math.round(k.speed * 3.6);
  out.nan = F.vehicles.some((v) => !isFinite(v.x + v.y + v.z));
  press('KeyE'); window.__step(60);
  return out;
});
await s.shot('/tmp/veh3f.png', () => { const F = window.__frontline, G = F.G, P = G.player, a = F.vehicles.find((v) => v.type === 'atv'), k = F.vehicles.find((v) => v.type === 'kestrel');
  if (P.vehicle) F.exitVehicle && F.exitVehicle(P); Object.assign(k, { x: a.x + 3, z: a.z + 2, y: a.y, pitch: 0, roll: 0 }); P.x = a.x - 6; P.z = a.z + 1; P.y = a.y; P.yaw = Math.atan2(-(a.x + 1 - P.x), -(a.z + 1 - P.z)); P.pitch = -0.2; window.__step(2); });
const ok = r.atvIn && r.atvMoved > 10 && r.kIn && r.kClimb > 3 && r.kFlew > 15 && !r.nan && /atv/.test(r.types) && /kestrel/.test(r.types);
console.log(JSON.stringify(r), ok && !s.errors.length ? 'PASS veh3f' : 'FAIL veh3f', s.errors.slice(0, 3));
process.exitCode = ok && !s.errors.length ? 0 : 1; // exit non-zero on FAIL
await s.browser.close();
