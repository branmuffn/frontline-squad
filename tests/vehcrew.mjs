// Vehicle crews can be shot through the hull (jeep easily, helicopter less) and hurt by blasts. node tests/vehcrew.mjs
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true;
  G.profile.lobby.vehicles = true; F.deploy({ mode: 'tdm', map: 'gorge', skill: 5, count: 3 }); window.__step(240);
  G.match.rules = { passive: true };
  const out = {};
  for (const type of ['jeep', 'heli']) {
    const v = F.vehicles.find((q) => q.type === type && q.alive && !q.seats[0]), b = G.spawnBot({ name: 'CREW', team: 1 - G.player.team, weapon: 'm4' });
    b.vehicle = v; v.seats[0] = b; b.seat = 0; b.protectUntil = 0; b.health = b.maxHealth; window.__step(2);
    const hp0 = v.hp; let n = 0;
    while (b.alive && n < 60) {
      const sx = v.x + 12, sy = b.y + b.h * 0.55, sz = v.z, dx = b.x - sx, dy = (b.y + b.h * 0.55) - sy, dz = b.z - sz, l = Math.hypot(dx, dy, dz);
      const s = F.ballistics.newShot(G.player, 'm4', sx, sy, sz, 1); F.ballistics.traceSegment(s, dx / l, dy / l, dz / l, 150); n++;
    }
    out[type] = { shots: n, dead: !b.alive, vehHp: Math.round(v.hp), vehHp0: hp0, alive: v.alive };
    v.seats[0] = null; b.vehicle = null;
  }
  // a frag next to a crewed jeep hurts the crew
  const v = F.vehicles.find((q) => q.type === 'jeep' && q.alive && !q.seats[0]), b = G.spawnBot({ name: 'CREW', team: 1 - G.player.team, weapon: 'm4' });
  b.vehicle = v; v.seats[0] = b; b.seat = 0; b.protectUntil = 0; b.health = b.maxHealth; window.__step(2);
  F.throwGrenade(G.player, v.x + 2.2, v.y + 0.3, v.z, 0, 0, 0, 0.02); window.__step(6);
  out.blast = Math.round(b.health);
  { // tail rotor weak spot: 3x damage
    const h = F.vehicles.find((q) => q.type === 'heli' && q.alive), hp0 = h.hp, c = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    const tx = h.x + 0.2 * c + 5.65 * sn, tz = h.z - 0.2 * sn + 5.65 * c, ty = h.y + 1.95;
    const s = F.ballistics.newShot(G.player, 'm4', tx, ty + 12, tz, 1); F.ballistics.traceSegment(s, 0, -1, 0, 100);
    out.tail = Math.round(hp0 - h.hp);
  }
  return out;
});
const ok = r.jeep.dead && r.jeep.shots <= 7 && r.heli.dead && r.heli.shots <= 10 && r.heli.shots >= r.jeep.shots && r.jeep.alive && r.blast < 100 && r.tail > 60;
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3));
await browser.close();
