// Two-page multiplayer test: host + client in one Chromium, connected with the manual copy-paste codes (no broker).
// usage: node tests/mp.mjs <mode> <map> [secs]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const THREE = fs.readFileSync(path.join(HERE, 'three.min.js'), 'utf8');
const mode = process.argv[2] || 'survival', map = process.argv[3] || 'yard', secs = +process.argv[4] || 20;
const INIT = `window.__rafq=[];window.__t=0;window.requestAnimationFrame=function(f){window.__rafq.push(f);return window.__rafq.length;};
window.__step=function(n,dtms){dtms=dtms||16.6667;for(let i=0;i<n;i++){window.__t+=dtms;const q=window.__rafq;window.__rafq=[];for(const f of q)f(window.__t);}};
performance.now=function(){return window.__t;}; window.__NET_OPTS={nostun:true,nobroker:true};`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const html = fs.readFileSync(path.join(HERE, '../dist-standalone/frontline_solo_ops.html'), 'utf8');
const errors = [];
async function mk(tag) {
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
const H = await mk('HOST'), C = await mk('CLIENT');
const out = {}, fail = [];
const check = (name, ok, info) => { out[name] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(frames) { for (let i = 0; i < frames; i += 2) { await H.evaluate(() => window.__step(2)); await C.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } }
// connect with manual codes
await H.evaluate(() => window.__frontline.net.hostOpen('ALPHA', { mode: 'survival', map: 'yard', difficulty: 'normal', count: 5 }));
const invite = await H.evaluate(() => window.__frontline.net.hostInvite());
const reply = await C.evaluate((c) => window.__frontline.net.joinManual('BRAVO', c), invite);
await H.evaluate((r) => window.__frontline.net.hostAccept(r), reply);
for (let i = 0; i < 100 && !(await H.evaluate(() => window.__frontline.net.canStart())); i++) await sleep(50);
check('connect', await H.evaluate(() => window.__frontline.net.canStart()), { invite: invite.length, reply: reply.length });
await H.evaluate(([mode, map]) => { const n = window.__frontline.net; n.hostCfg({ mode, map, difficulty: 'normal', count: 5, sameTeam: false }); n.hostStart(); }, [mode, map]);
for (let i = 0; i < 40 && (await C.evaluate(() => window.__frontline.G.state)) !== 'deploy'; i++) await sleep(50);
await run(240); // deploy countdown
const st = async () => ({
  h: await H.evaluate(() => { const G = window.__frontline.G; const r = G.units.find((u) => u.remote); return { state: G.state, n: G.units.length, now: G.now, r: r && { id: r.id, x: r.x, z: r.z, alive: r.alive, hp: r.health, team: r.team, k: r.kills }, bots: G.bots.filter((b) => b.alive).map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, hp: b.health, team: b.team })) }; }),
  c: await C.evaluate(() => { const G = window.__frontline.G, P = G.player, S = window.__frontline.net.session; return { state: G.state, n: G.units.length, now: G.now, P: { x: P.x, z: P.z, hp: P.health, alive: P.alive, team: P.team, k: P.kills, d: P.deaths }, prox: [...S.proxies.values()].map((u) => ({ id: u.hid, x: u.x, z: u.z, alive: u.alive, vis: u.soldier.root.visible })), match: [G.match.wave, G.match.points, G.match.lives, G.match.time] }; }),
});
let s = await st();
check('playing', s.h.state === 'playing' && s.c.state === 'playing', [s.h.state, s.c.state]);
check('roster', s.c.n === s.h.n, [s.h.n, s.c.n]);
check('clock', Math.abs(s.h.now - s.c.now) < 0.5, [s.h.now, s.c.now]);
check('team', s.h.r && s.h.r.team === s.c.P.team, [s.h.r && s.h.r.team, s.c.P.team]);
// client moves -> host's copy follows
await C.evaluate(() => { const P = window.__frontline.G.player; P.x += 1.5; });
await run(30);
s = await st();
check('remote follows', Math.hypot(s.h.r.x - s.c.P.x, s.h.r.z - s.c.P.z) < 0.4, [s.h.r, s.c.P]);
// proxies track bots
await run(60); s = await st();
const errs = s.h.bots.map((b) => { const p = s.c.prox.find((q) => q.id === b.id); return p ? Math.hypot(p.x - b.x, p.z - b.z) : 99; });
check('proxies track', errs.length > 0 && Math.max(...errs) < 1.5, errs.map((e) => e.toFixed(2)));
// hit claim: client damages a bot proxy
const target = s.h.bots[0];
await C.evaluate((id) => { const F = window.__frontline, S = F.net.session, u = S.proxies.get(id); u.protectUntil = 0; F.damage(u, 30, F.G.player, { weapon: 'm4', zone: 'body', dist: 10 }); }, target.id);
await H.evaluate((id) => { const u = window.__frontline.G.units.find((x) => x.id === id); window.__hp0 = u.health; }, target.id);
await run(20);
const hp1 = await H.evaluate((id) => window.__frontline.G.units.find((x) => x.id === id).health, target.id);
check('hit claim', hp1 <= target.hp - 29 || hp1 < target.hp, [target.hp, hp1]);
// kill claim
await C.evaluate((id) => { const F = window.__frontline, u = F.net.session.proxies.get(id); u.protectUntil = 0; if (u.alive) F.damage(u, 999, F.G.player, { weapon: 'm4', zone: 'head', headshot: true, dist: 10 }); }, target.id);
await run(40); s = await st();
check('kill credited', s.c.P.k >= 1 && s.h.r.k >= 1, [s.c.P.k, s.h.r.k]);
// host-side damage to the remote player
await H.evaluate(() => { const F = window.__frontline, G = F.G, r = G.units.find((u) => u.remote), b = G.bots.find((x) => x.alive); r.protectUntil = 0; F.damage(r, 30, b, { weapon: 'm4', sx: b.x, sz: b.z }); });
await run(10); s = await st();
check('hurt', Math.abs(s.c.P.hp - 70) < 1, s.c.P.hp);
// death and respawn of the client
await H.evaluate(() => { const F = window.__frontline, G = F.G, r = G.units.find((u) => u.remote), b = G.bots.find((x) => x.alive); r.protectUntil = 0; F.damage(r, 999, b, { weapon: 'm4', sx: b.x, sz: b.z }); });
await run(20); s = await st();
check('client died', s.c.state === 'dead' && !s.c.P.alive, [s.c.state, s.c.P.alive]);
await run(420); s = await st();
check('client respawned', s.c.state === 'playing' && s.c.P.alive && s.h.r.alive, [s.c.state, s.c.P.alive, s.h.r.alive]);
// grenade from the client becomes real on the host
await C.evaluate(() => { const F = window.__frontline, P = F.G.player; F.throwGrenade(P, P.x, P.y + 1.6, P.z, 0, 4, -6, 2.5); });
await run(6);
const hg = await H.evaluate(() => window.__frontline.grenades.map((g) => g.owner && g.owner.remote ? 'remote' : 'other'));
check('grenade mirrored', hg.includes('remote'), hg);
// match fields mirrored
check('match mirrored', JSON.stringify(s.c.match.slice(0, 3)) === JSON.stringify(await H.evaluate(() => { const m = window.__frontline.G.match; return [m.wave, m.points, m.lives]; })), s.c.match);
// play a while with bots
await run(secs * 60); s = await st();
check('still running', ['playing', 'dead', 'ended'].includes(s.c.state) && s.c.n === s.h.n, [s.c.state, s.h.n, s.c.n]);
// end of match reaches the client
await H.evaluate(() => window.__frontline.endMatch('limit'));
await run(20); s = await st();
check('end', s.c.state === 'ended', s.c.state);
const endTxt = await C.evaluate(() => document.getElementById('endTitle').textContent + ' / ' + document.getElementById('again').textContent);
out.endClient = endTxt;
check('errors', errors.length === 0, errors.slice(0, 6));
console.log(mode, map, JSON.stringify(out, null, 1));
console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
await browser.close();
