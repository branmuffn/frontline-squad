// 6c: bots crew vehicles. TDM on Gorge with Vehicles On: bots board, drive routes, fly, shoot; no NaN, no errors.
import { open } from './harness.mjs';
const secs = +process.argv[2] || 75;
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate((secs) => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true; G.profile.lobby.vehicles = true;
  F.deploy({ mode: 'tdm', map: 'gorge', difficulty: 'normal', count: 9 }); window.__step(200);
  G.player.protectUntil = 1e12; G.player.x = 0; G.player.z = 25; // keep the player out of the way
  const V = F.vehicles, start = V.map((v) => [v.x, v.z]), out = { boardedEver: 0, maxAlt: 0, shots: 0 };
  const seen = new Set(); let shots0 = 0;
  for (let i = 0; i < secs * 60; i++) {
    window.__step(1); G.player.health = 100;
    for (const v of V) { for (const u of v.seats) if (u && !u.isPlayer) seen.add(u.name + v.type); if (v.type === 'heli') out.maxAlt = Math.max(out.maxAlt, v.y); }
    if (i % 60 === 0) out.shots += F.vehicles.reduce((a, v) => a + ((v.heat || 0) > 0.05 ? 1 : 0), 0);
  }
  out.boardedEver = seen.size; out.crews = [...seen].slice(0, 8);
  out.moved = F.vehicles.map((v, i) => +(start[i] ? Math.hypot(v.x - start[i][0], v.z - start[i][1]) : -1).toFixed(1));
  out.nan = F.vehicles.some((v) => !isFinite(v.x + v.y + v.z)) || G.units.some((u) => !isFinite(u.x + u.y + u.z));
  out.alive = F.vehicles.filter((v) => v.alive).length; out.state = G.state; out.botMgShots = G.mgShots || 0; out.kills = G.units.reduce((a, u) => a + (u.kills || 0), 0);
  return out;
}, secs);
console.log(JSON.stringify(r), 'ERRORS', errors.length, errors.slice(0, 3));
await browser.close();
