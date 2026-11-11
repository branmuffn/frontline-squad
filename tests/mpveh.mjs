// Vehicles in multiplayer: same vehicles everywhere, joiner boards via the host, drives locally (host follows),
// seats mirrored, exit, joiner hits on a hull, destruction and respawn mirrored. node tests/mpveh.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const THREE = fs.readFileSync(path.join(HERE, 'three.min.js'), 'utf8');
const mode = process.argv[2] || 'tdm', map = process.argv[3] || 'yard', secs = +process.argv[4] || 10;
const INIT = `window.__rafq=[];window.__t=0;window.requestAnimationFrame=function(f){window.__rafq.push(f);return window.__rafq.length;};
window.__step=function(n,dtms){dtms=dtms||16.6667;for(let i=0;i<n;i++){window.__t+=dtms;const q=window.__rafq;window.__rafq=[];for(const f of q)f(window.__t);}};
performance.now=function(){return window.__t;}; window.__NET_OPTS={nostun:true,nobroker:true};`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const html = fs.readFileSync(path.join(HERE, '../dist-standalone/frontline_solo_ops.html'), 'utf8');
const errors = [];
export async function mk(tag) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on('request', (q) => { const u = q.url(); if (!u.startsWith('http://game.local/') && !u.startsWith('data:') && !u.startsWith('blob:')) errors.push(tag + ' EXTERNAL ' + u); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' ' + m.text()); });
  page.on('pageerror', (e) => errors.push(tag + ' PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await page.route('**/three.min.js', (r) => r.fulfill({ contentType: 'application/javascript', body: THREE }));
  await page.route('http://game.local/', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.addInitScript(INIT);
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__frontline, null, { timeout: 30000 });
  await page.evaluate(() => { const r = window.__frontline.G.renderer; r.clear = () => {}; r.clearDepth = () => {}; r.render = (s, c) => { s.updateMatrixWorld(); if (c && !c.parent) c.updateMatrixWorld(); }; window.__frontline.input.freeLook = true; });
  return page;
}


const H = await mk('HOST'), C = await mk('C1'), all = [H, C];
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(frames) { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } }
const ev = (p, f, a) => p.evaluate(f, a);
await ev(H, () => window.__frontline.net.hostOpen('ALPHA', { mode: 'tdm', map: 'gorge', skill: 5, count: 0, bots: {}, vehicles: true }));
const inv = await ev(H, () => window.__frontline.net.hostInvite());
const rep = await ev(C, (c) => window.__frontline.net.joinManual('BRAVO', c), inv);
await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
for (let i = 0; i < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); i++) await sleep(50);
await ev(C, () => window.__frontline.net.setReady(true)); await sleep(200);
await ev(H, () => window.__frontline.net.hostStart());
for (let i = 0; i < 60 && (await ev(C, () => window.__frontline.G.state)) !== 'deploy'; i++) await sleep(50);
await run(240);
const vl = async (p) => ev(p, () => window.__frontline.vehicles.map((v) => [v.vid, v.type, Math.round(v.x), Math.round(v.z), v.alive]));
const hv = await vl(H), cv = await vl(C);
check('same vehicles', hv.length > 0 && JSON.stringify(hv) === JSON.stringify(cv), [hv, cv]);
// joiner walks up to the first jeep and presses E
const vid = hv.find((v) => v[1] === 'jeep')[0];
await ev(C, (vid) => { const F = window.__frontline, P = F.G.player, v = F.vehicles.find((q) => q.vid === vid); P.x = v.x + 2.6; P.z = v.z; P.y = v.y; P.protectUntil = 1e9; }, vid);
await run(20);
await ev(C, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); });
await run(20);
let h = await ev(H, (vid) => { const v = window.__frontline.vehicles.find((q) => q.vid === vid); return v.seats[0] ? v.seats[0].remote : null; }, vid);
let c = await ev(C, () => { const P = window.__frontline.G.player; return [!!P.vehicle, P.seat]; });
check('joiner boards', h === true && c[0] && c[1] === 0, [h, c]);
// drive forward 2 s
const p0 = await ev(C, (vid) => { const v = window.__frontline.vehicles.find((q) => q.vid === vid); return [v.x, v.z]; }, vid);
await ev(C, () => { window.__frontline.input.keys.KeyW = true; });
await run(120);
await ev(C, () => { window.__frontline.input.keys.KeyW = false; });
await run(40);
const cp = await ev(C, (vid) => { const v = window.__frontline.vehicles.find((q) => q.vid === vid); return [v.x, v.z]; }, vid);
const hp = await ev(H, (vid) => { const v = window.__frontline.vehicles.find((q) => q.vid === vid); return [v.x, v.z]; }, vid);
check('joiner drives', Math.hypot(cp[0] - p0[0], cp[1] - p0[1]) > 5, [p0, cp]);
check('host follows', Math.hypot(cp[0] - hp[0], cp[1] - hp[1]) < 1.5, [cp, hp]);
// host hops in as gunner; the joiner sees it
await ev(H, (vid) => { const F = window.__frontline, P = F.G.player, v = F.vehicles.find((q) => q.vid === vid); P.x = v.x + 2.6; P.z = v.z; P.y = v.y; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); }, vid);
await run(30);
c = await ev(C, (vid) => { const v = window.__frontline.vehicles.find((q) => q.vid === vid); return v.seats[1] ? v.seats[1].name : null; }, vid);
check('seats mirrored', c === 'ALPHA', c);
// host's gunner fire reaches the joiner as tracers (shots list) - and the joiner gets out
await ev(H, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); });
await ev(C, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); });
await run(30);
h = await ev(H, (vid) => { const v = window.__frontline.vehicles.find((q) => q.vid === vid); return v.seats.map((q) => !!q); }, vid);
c = await ev(C, () => !!window.__frontline.G.player.vehicle);
check('exit', !h[0] && !h[1] && !c, [h, c]);
// joiner shoots an enemy-free hull: no damage (no crew = neutral); then the host crews it with nobody: shoot the heli the host pilots
const heli = hv.find((v) => v[1] === 'heli');
if (heli) {
  await ev(H, (id) => { const F = window.__frontline, P = F.G.player, v = F.vehicles.find((q) => q.vid === id); P.x = v.x + 3; P.z = v.z; P.y = v.y; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); }, heli[0]);
  await run(20);
  const hp0 = await ev(H, (id) => window.__frontline.vehicles.find((q) => q.vid === id).hp, heli[0]);
  await ev(C, (id) => { const F = window.__frontline, G = F.G, v = F.vehicles.find((q) => q.vid === id); const c = v.seats[0] || { x: v.x, y: v.y, z: v.z, h: 1.2 }; window.__crew = !!v.seats[0]; for (let i = 0; i < 5; i++) { const sx = c.x + 10, sy = c.y + c.h * 0.55, sz = c.z, dx = c.x - sx, dz = 0, l = Math.hypot(dx, dz); const s = F.ballistics.newShot(G.player, 'm4', sx, sy, sz, 1); F.ballistics.traceSegment(s, dx / l, 0, dz / l, 100); } }, heli[0]);
  await run(20);
  const hp1 = await ev(H, (id) => window.__frontline.vehicles.find((q) => q.vid === id).hp, heli[0]);
  const hostHp = await ev(H, () => window.__frontline.G.player.health);
  check('joiner hits hull + crew', hp1 < hp0 && hostHp < 100, [hp0, hp1, hostHp]);
  await ev(H, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); });
}
// destruction and respawn mirrored
await ev(H, (vid) => { const F = window.__frontline, v = F.vehicles.find((q) => q.vid === vid); F.G.player.protectUntil = 1e9; F.damageVehicle(v, 9999, null, 'explosive'); }, vid);
await run(20);
c = await ev(C, (vid) => window.__frontline.vehicles.find((q) => q.vid === vid).alive, vid);
check('wreck mirrored', c === false, c);
await ev(H, (vid) => { const F = window.__frontline, v = F.vehicles.find((q) => q.vid === vid); v.deadAt = F.G.now - v.spec.respawn - 1; for (const u of F.G.units) if (Math.hypot(u.x - v.home.x, u.z - v.home.z) < 3) { u.x += 6; } }, vid);
await run(30);
c = await ev(C, (vid) => { const v = window.__frontline.vehicles.find((q) => q.vid === vid); return v && v.alive; }, vid);
check('respawn mirrored', c === true, c);
check('errors', errors.length === 0, errors.slice(0, 6));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
await browser.close();
