// Phase 6a: jeep - Off by default, spawn clear, enter/drive/turn/collide, seats, gunner fire, exit, destroy + respawn.
import { shotSession } from './shot.mjs';
const SHOTS = process.argv[2] === 'shots';
const s = await shotSession();
const off = await s.page.evaluate(() => { const F = window.__frontline; F.input.freeLook = true; F.G.profile.lobby.vehicles = false; F.deploy({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 0 }); window.__step(5); return F.vehicles.length; });
await s.prep({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 1 }, 1);
const r = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G; G.profile.lobby.vehicles = true;
  F.deploy({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 1 }); window.__step(200);
  const V = F.vehicles, P = G.player, out = { count: V.length };
  G.ignoreDyn = null;
  out.spawnClear = V.map((v) => { G.ignoreDyn = v.dyn; const ok = !F.physics.blocked(v.x, v.z, 0.9, v.y + 0.15, 1.0); G.ignoreDyn = null; return ok; });
  const v = V[2]; // canyon road jeep
  P.x = v.x + 2.6; P.z = v.z; P.y = 0; P.protectUntil = 1e9;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); window.__step(2);
  out.entered = P.vehicle === v && P.seat === 0;
  const x0 = v.x, z0 = v.z; F.input.keys.KeyW = true; window.__step(120);
  out.drove = +Math.hypot(v.x - x0, v.z - z0).toFixed(1); out.kmh = Math.round(v.speed * 3.6);
  F.input.keys.KeyA = true; const y0 = v.yaw; window.__step(40); F.input.keys.KeyA = false; out.turned = +(v.yaw - y0).toFixed(2);
  window.__step(240); F.input.keys.KeyW = false; // keep driving: should hit something, never pass through
  let inside = 0; for (const c of G.world.colliders) { if (c.pass || c.rayOnly || c.noRay === undefined && false) continue; }
  G.ignoreDyn = v.dyn; inside = F.physics.blocked(v.x, v.z, 0.6, v.y + 0.3, 0.8) ? 1 : 0; G.ignoreDyn = null;
  out.notInWall = !inside; out.nan = !isFinite(v.x + v.y + v.z);
  window.__step(60);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' })); window.__step(2);
  out.gunner = P.seat === 1;
  // aim at the bot and fire
  const b = G.bots[0]; b.x = v.x - Math.sin(v.yaw) * 14; b.z = v.z - Math.cos(v.yaw) * 14; b.y = F.physics.supportHeight(b.x, b.z, 0.3, 5); b.protectUntil = 0; b.health = 100;
  P.yaw = Math.atan2(-(b.x - v.x), -(b.z - v.z)); P.pitch = Math.atan2(b.y + 1.1 - (v.y + 1.95), Math.hypot(b.x - v.x, b.z - v.z));
  F.input.fire = true; window.__step(30); F.input.fire = false;
  out.botHurt = b.health < 100 || !b.alive; out.heat = +v.heat.toFixed(2);
  return out;
});
if (SHOTS) await s.shot('/tmp/veh_gunner.png');
const r2 = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player, v = F.vehicles[2], out = {};
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit1' })); window.__step(2);
  out.driverAgain = P.seat === 0; P.yaw = v.yaw + 0.5; P.pitch = -0.2; window.__step(5);
  return out;
});
if (SHOTS) await s.shot('/tmp/veh_driver.png');
const r3 = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player, v = F.vehicles[2], out = {};
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); window.__step(2);
  out.exited = !P.vehicle && !F.physics.blocked(P.x, P.z, P.r, P.y, P.h);
  // bullets stop on the hull: shoot from the side at body height
  const h = F.physics.rayWorld(v.x + 6, v.y + 0.8, v.z, -1, 0, 0, 10); out.rayHitsJeep = !!(h && h.col && h.col.vehicle === v);
  for (let i = 0; i < 6 && v.alive; i++) F.ballistics && 0, window.__frontline.G && 0, (function () { const ex = { x: v.x + 1, y: v.y + 0.5, z: v.z }; })();
  return out;
});
const r4 = await s.page.evaluate(async () => {
  const F = window.__frontline, G = F.G, v = F.vehicles[2], out = {};
  const mod = F.vehiclesApi; // not exposed; use damage path through an explosion helper
  let n = 0; while (v.alive && n++ < 20) { G.player.protectUntil = 1e9; F.damageVehicle(v, 200, G.bots[0]); }
  out.destroyed = !v.alive; window.__step(60 * 21);
  out.respawned = F.vehicles.length === 5 && F.vehicles.every((q) => q.alive);
  return out;
});
console.log(JSON.stringify({ off, ...r, ...r2, ...r3, ...r4 }), 'ERRORS', s.errors.length, s.errors.slice(0, 3));
process.exitCode = s.errors.length ? 1 : 0; // exit non-zero on FAIL
await s.browser.close();
