// Three pages (host + 2 joiners) over manual codes: ready-up gate, chat relay, skins, TDM team dealing, pings on the
// scoreboard, joiner-vs-joiner hits, kick. usage: node tests/mp3.mjs [mode] [map] [secs]
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
performance.now=function(){return window.__t;}; window.__NET_OPTS={nostun:true,nobroker:true,loopback:${process.env.FPS_LOOPBACK === '1'}};`; // FPS_LOOPBACK=1: connect over 127.0.0.1 (see README)
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
const H = await mk('HOST'), C1 = await mk('C1'), C2 = await mk('C2'), all = [H, C1, C2];
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(frames) { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } }
const ev = (p, f, a) => p.evaluate(f, a);
await ev(H, (m) => window.__frontline.net.hostOpen('ALPHA', { mode: m[0], map: m[1], skill: 5, count: 0, sameTeam: false, bots: {} }, { uniform: 'navy', pattern: 'wood', helmet: 'tan' }), [mode, map]);
for (const [C, nm] of [[C1, 'BRAVO'], [C2, 'BRAVO']]) { // same name on purpose: host makes it unique
  const inv = await ev(H, () => window.__frontline.net.hostInvite());
  const rep = await ev(C, (a) => window.__frontline.net.joinManual(a[0], a[1], { uniform: 'khaki', pattern: 'desert', helmet: 'black' }), [nm, inv]);
  await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
  for (let i = 0; i < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); i++) await sleep(50);
}
await sleep(300);
const lobby = await ev(H, () => window.__frontline.net.session.remotes.map((r) => r.name + ':' + r.hello));
check('two joiners', lobby.length === 2 && lobby.every((x) => x.endsWith('true')), lobby);
check('unique names', new Set(lobby.map((x) => x.split(':')[0])).size === 2, lobby);
check('ready gate', !(await ev(H, () => window.__frontline.net.canStart())), 'started without ready');
await ev(C1, () => window.__frontline.net.setReady(true)); await sleep(200);
check('ready gate 2', !(await ev(H, () => window.__frontline.net.canStart())), 'one ready is enough?');
await ev(C2, () => window.__frontline.net.setReady(true)); await sleep(200);
check('all ready', await ev(H, () => window.__frontline.net.canStart()), 'cannot start');
// chat: C1 -> host -> C2
await ev(C1, () => window.__frontline.net.sendChat('hello <b>team</b>')); await sleep(250);
const c2log = await ev(C2, () => document.getElementById('mpChatLog').textContent);
check('chat relay', c2log.includes('hello <b>team</b>') && c2log.includes('BRAVO'), c2log);
await ev(H, () => window.__frontline.net.hostStart());
for (let i = 0; i < 60 && (await ev(C2, () => window.__frontline.G.state)) !== 'deploy'; i++) await sleep(50);
await run(240);
const st = await Promise.all(all.map((p) => ev(p, () => { const G = window.__frontline.G; return { state: G.state, n: G.units.length, team: G.player.team, id: window.__frontline.net.session.uid, bots: G.bots.length }; })));
check('all playing', st.every((s) => s.state === 'playing'), st.map((s) => s.state));
check('rosters', st.every((s) => s.n === st[0].n && s.n >= 3), st.map((s) => s.n));
if (mode === 'tdm') check('teams dealt', st[0].team === 0 && st[1].team === 1 && st[2].team === 0, st.map((s) => s.team));
const look = await ev(C2, () => { const S = window.__frontline.net.session; return [...S.proxies.values()].map((u) => u.look && u.look.helmet); });
check('skins sent', look.includes(0x8a7a58) || look.includes(0x1e2124), look);
await run(90);
const pings = await ev(C1, () => { const G = window.__frontline.G; window.__frontline.ui && 0; return G.units.map((u) => u.ping); });
check('pings', pings.filter((p) => typeof p === 'number').length >= 2, pings);
const board = await ev(C1, () => { document.dispatchEvent(new Event('x')); const hud = document.getElementById('board'); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' })); window.__step(2); const t = hud.textContent; window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Tab' })); return t; });
check('board ping', /Ping/.test(board) && /\d+ ms/.test(board), board.slice(0, 160));
// joiner vs joiner (C1 team 1 hits C2 team 0 in TDM; FFA: everyone)
const c2id = st[2].id;
await ev(C1, (id) => { const F = window.__frontline, u = F.net.session.proxies.get(id); u.protectUntil = 0; F.damage(u, 40, F.G.player, { weapon: 'm4', zone: 'body', dist: 5 }); }, c2id);
await run(20);
const hp = await ev(C2, () => window.__frontline.G.player.health);
check('joiner vs joiner', ['survival', 'zombies'].includes(mode) ? hp === 100 : hp <= 61, hp);
// in-match chat via the HUD input
await ev(C2, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' })); const i = document.getElementById('chatIn'); i.value = 'gg'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
await run(10); await sleep(200);
const hlog = await ev(H, () => document.getElementById('chatlog').textContent);
check('hud chat', hlog.includes('gg'), hlog);
if (mode === 'tdm') { // team chat from C1 (team 1) must not reach the host or C2 (team 0)
  await ev(C1, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY' })); const i = document.getElementById('chatIn'); i.value = 'secret'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await run(10); await sleep(200);
  const seen = await Promise.all([H, C2, C1].map((p) => ev(p, () => document.getElementById('mpChatLog').textContent.includes('secret'))));
  check('team chat private', !seen[0] && !seen[1] && seen[2], seen);
}
await run(secs * 60);
// kick C2
const slot2 = await ev(H, () => window.__frontline.net.session.remotes[1].slot);
await ev(H, (s) => window.__frontline.net.kick(s), slot2); await sleep(300); await run(20);
const after = await Promise.all([ev(H, () => [window.__frontline.net.session.remotes.length, window.__frontline.G.units.filter((u) => u.isPlayer || u.remote).length]), ev(C2, () => [window.__frontline.G.state, window.__frontline.net.session.role])]);
check('kick', after[0][0] === 1 && after[0][1] === 2 && after[1][0] !== 'playing' && !after[1][1], after);
check('errors', errors.length === 0, errors.slice(0, 6));
console.log(mode, map, JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
process.exitCode = fail.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
