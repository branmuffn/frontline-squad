// One-seat vehicles: pressing 2 (gun seat) in the Kestrel or on the ATV does nothing (it used to break the game loop);
// the jeep and helicopter still switch to the gun. No errors, frame loop keeps running.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, out = {}; G.profile.lobby.vehicles = true; F.input.freeLook = true;
  F.deploy({ mode: 'sandbox', map: 'gorge', skill: 5, count: 0 }); window.__step(200);
  const press = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); window.__step(2); };
  const P = G.player; P.protectUntil = 1e9;
  for (const type of ['kestrel', 'atv', 'jeep', 'heli']) {
    const v = F.vehicles.find((q) => q.type === type); if (P.vehicle) { press('KeyE'); window.__step(20); }
    P.x = v.x + 2.2; P.z = v.z; P.y = v.y; window.__step(2); press('KeyE');
    const t0 = G.now; press('Digit2'); window.__step(30); press('Digit1'); window.__step(10); press('Digit2'); window.__step(10);
    out[type] = { in: P.vehicle === v, seat: P.seat, seats: v.seats.length, ran: +(G.now - t0).toFixed(2), keys: document.getElementById('vhKeys').textContent };
  }
  return out;
});
const ok = r.kestrel.in && r.kestrel.seat === 0 && r.kestrel.seats === 1 && r.atv.seat === 0 && r.atv.seats === 1 && r.jeep.seat === 1 && r.heli.seat === 1 && r.kestrel.ran > 0.8 && !/2Gun/.test(r.kestrel.keys.replace(/\s/g, ''));
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS seats' : 'FAIL seats', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
