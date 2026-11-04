// Ladders: no accidental grabs (brushing past, facing away), deliberate climb works, a unit above blocks you,
// a bot meeting someone on the ladder gives way. node tests/ladder.mjs [map]
import { open } from './harness.mjs';
const map = process.argv[2] || 'gorge';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate((map) => {
  const F = window.__frontline, G = F.G, K = F.input.keys, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'sandbox', map, skill: 5, count: 0 }); window.__step(240);
  const P = G.player, L = G.world.ladders.slice().sort((a, b) => (b.maxY - b.minY) - (a.maxY - a.minY))[0];
  const foot = () => { P.x = L.x + L.nx * 0.9; P.z = L.z + L.nz * 0.9; P.y = L.minY; P.vy = 0; P.onLadder = false; P.grounded = true; };
  const yawTo = (s) => Math.atan2(-(L.x - P.x) * s, -(L.z - P.z) * s); // s=1 facing the ladder, -1 away
  const hold = (k, n) => { K[k] = true; window.__step(n); K[k] = false; };
  foot(); P.yaw = yawTo(1) + Math.PI / 2; hold('KeyW', 40); o.brushPast = P.onLadder || P.y > L.minY + 0.3;   // walking along the wall
  foot(); P.yaw = yawTo(-1); hold('KeyS', 30); o.backInto = P.onLadder || P.y > L.minY + 0.3;               // backing into it
  foot(); P.yaw = yawTo(1); P.pitch = 0; hold('KeyW', 30); o.climbs = P.y > L.minY + 0.5;                    // deliberate
  // a unit on the ladder above blocks the climb
  const y0 = P.y; const bot = G.spawnBot({ name: 'LAD', team: 1, weapon: 'm4' }); G.match.rules = { passive: true, god: true };
  bot.x = L.x + L.nx * 0.55; bot.z = L.z + L.nz * 0.55; bot.y = y0 + 1.2; bot.onLadder = true; bot.brain.climb = { L, up: false, exit: [L.x + L.nx * 0.55, L.minY, L.z + L.nz * 0.55], until: G.now + 8 };
  hold('KeyW', 30); o.blocked = P.y - y0 < 0.25;
  window.__step(120); o.botGaveWay = !bot.onLadder || bot.y > y0 + 1.5;
  o.ladder = [L.minY, L.maxY];
  return o;
}, map);
const ok = !r.brushPast && !r.backInto && r.climbs && r.blocked && r.botGaveWay;
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3)); await browser.close();
