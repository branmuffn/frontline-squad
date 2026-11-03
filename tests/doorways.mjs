// X2: walk into and out of the Gorge boxcars (and other doorways) with real input; flag stalls and height jitter.
// node tests/doorways.mjs
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const res = await page.evaluate(() => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true;
  F.deploy({ mode: 'sandbox', map: 'gorge', difficulty: 'normal', count: 0 }); window.__step(200);
  const P = G.player, H = 8, out = [];
  const walk = (label, x, z, yaw, frames) => {
    P.x = x; P.z = z; P.y = F.physics.supportHeight(x, z, 0.3, H + 1.5); P.vy = 0; P.vx = 0; P.vz = 0; P.crouch = false; P.grounded = true; P.yaw = yaw; P.pitch = 0;
    window.__step(5);
    let stalls = 0, flips = 0, lastY = P.y, dirY = 0, px = P.x, pz = P.z, minProg = 1e9;
    const ys = [];
    F.input.keys.KeyW = true;
    for (let i = 0; i < frames; i++) {
      window.__step(1);
      const prog = Math.hypot(P.x - px, P.z - pz); px = P.x; pz = P.z; minProg = Math.min(minProg, prog);
      if (prog < 0.02) stalls++;
      const d = Math.sign(Math.round((P.y - lastY) * 100)); if (d && dirY && d !== dirY) flips++; if (d) dirY = d; lastY = P.y; ys.push(+P.y.toFixed(2));
    }
    F.input.keys.KeyW = false;
    out.push({ label, stalls, flips, end: [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)], ys: ys.filter((y, i) => i === 0 || y !== ys[i - 1]).slice(0, 12).join(' ') });
  };
  // along the walkway past each door (both sides), then turn into the car and back out
  for (const cx of [-4.5, 4.5]) for (const s of [-1, 1]) {
    walk(`walkway past car ${cx} side ${s}`, cx - 2.5, s * 2.05, -Math.PI / 2, 60);
    walk(`into car ${cx} side ${s}`, cx, s * 2.05, s > 0 ? 0 : Math.PI, 45);
    walk(`out of car ${cx} side ${s}`, cx, 0, s > 0 ? Math.PI : 0, 30);
  }
  // doors: E closes the nearest one, a closed door blocks walking in and stops bullets, E opens it again
  const doors = G.world.doors, D = doors.find((d) => d.x === 4.5 && d.z > 0);
  const press = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); };
  P.x = 4.5; P.z = 2.05; P.y = 8; P.vx = P.vz = 0; window.__step(3); press(); window.__step(40);
  const closed = D.t01 === 0;
  walk('into car through CLOSED door', 4.5, 2.05, 0, 40);
  const blockedByDoor = out[out.length - 1].end[2] > 1.5;
  const ray = F.physics.rayWorld(4.5, 9.3, 3.0, 0, 0, -1, 4); const rayStops = !!(ray && ray.col && ray.col.door);
  P.x = 4.5; P.z = 2.05; P.y = 8; window.__step(2); press(); window.__step(40);
  const reopened = D.t01 === 1;
  walk('into car through reopened door', 4.5, 2.05, 0, 45);
  // a bot walking into a closed door opens it
  toggle: { const D2 = doors.find((d) => d.x === -4.5 && d.z < 0); D2.target = 0; D2.t01 = 0; window.__step(1);
    const b = G.spawnBot({ name: 'DOOR', team: 1, weapon: 'm4' }); b.x = -4.5; b.z = -2.05; b.y = 8; b.moveSpeed = 2; window.__step(2);
    out.push({ label: 'bot opens door', opened: D2.target === 1 }); }
  out.push({ label: 'doors', count: doors.length, closed, blockedByDoor, rayStops, reopened });
  return out;
});
for (const r of res) console.log(JSON.stringify(r));
console.log('ERRORS', errors.length, errors.slice(0, 2));
await browser.close();
