// 3e weapons: SCAR-H / Vector / crossbow fire and kill, grenade launcher bursts on impact, rail gun goes through a wall
// and two people, attachments (extended mag, grip), power-weapon pickups appear and respawn.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  const fire = (id, n = 1) => { const P = G.player; P.weapons[0] = id; P.ammo[id] = { mag: 30, res: 30 }; P.slot = 0; P.switchStart = -10; P.nextFire = 0; P.reloadStart = -1;
    for (let i = 0; i < n; i++) { if (window.__pin) window.__pin(); F.input.fire = true; P.semiReady = true; window.__step(2); F.input.fire = false; for (let j = 0; j < 40; j++) { if (window.__pin) window.__pin(); window.__step(1); } } };
  let P, T, T2; const pins = [];
  const setup = () => { pins.length = 0; F.deploy({ mode: 'sandbox', map: 'yard', skill: 5, count: 2 }); window.__step(220); G.match.rules = { ...(G.match.rules || {}), passive: true };
    P = G.player; T = G.bots[0]; T2 = G.bots[1]; Object.assign(P, { x: 0, y: 0, z: 30, yaw: 0, pitch: -0.03 }); F.input.aim = true; window.__step(30); };
  window.__pin = () => { for (const [t, d] of pins) if (t.alive) Object.assign(t, { x: 0, y: 0, z: 30 - d, protectUntil: 0 }); };
  const place = (t, d) => { Object.assign(t, { x: 0, y: 0, z: 30 - d, health: 100, maxHealth: 100, protectUntil: 0 }); t.brain.target = null; pins.push([t, d]); };
  for (const id of ['scarh', 'vector', 'crossbow']) { setup(); place(T, 12); place(T2, 40); fire(id, id === 'crossbow' ? 2 : 6); window.__step(60); o[id] = P.kills > 0 || T.health < 100; o[id + 'St'] = [+G.player.x.toFixed(1), +G.player.z.toFixed(1), +G.player.yaw.toFixed(2), +T.x.toFixed(1), G.state, G.match.stats.shots, G.match.stats.hits, +T.z.toFixed(1), G.player.weapons[0]]; }
  setup(); place(T, 10); P.pitch = -0.06; fire('gl', 1); window.__step(120); o.gl = T.health < 100 || !T.alive;
  setup(); place(T, 8); place(T2, 14); fire('rail', 1); window.__step(30); o.railBoth = !T.alive && !T2.alive; o.railSt = [T.alive, T2.alive, +T.health.toFixed(0), +T2.health.toFixed(0), G.match.stats.shots];
  // attachments: extended mag + grip on the M4
  G.profile.loadout.att = { m4: ['extmag', 'grip'] }; F.deploy({ mode: 'ffa', map: 'outpost', skill: 5, count: 3, power: true }); window.__step(200);
  o.mag = G.player.ammo.m4 && G.player.ammo.m4.mag; o.recoil = G.player.attW.m4 && +(G.player.attW.m4.recoil.v / 0.0115).toFixed(2);
  window.__step(60 * 27); o.power = G.match.powerSpots.map((s) => s.drop && s.drop.id);
  return o;
});
const ok = r.scarh && r.vector && r.crossbow && r.gl && r.railBoth && r.mag === 45 && r.recoil === 0.75 && r.power.filter(Boolean).length === 2;
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS w3e' : 'FAIL w3e', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
