// 3d: multiplayer Gun Game (tiers through the host), Infection (joiner turns), CTF (joiner grabs the flag). node tests/mpmodes.mjs [mode]
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
// Votes (/votekick, /surrender, /yes) and ping relay with host + 2 joiners in TDM (all on one team vs bots).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), ev = (p, f, a) => p.evaluate(f, a);
const out = {}, fail = [], check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const H = await mk('HOST'), J = [];
await ev(H, () => window.__frontline.net.hostOpen('HOST', { mode: 'tdm', map: 'yard', skill: 5, count: 4, bots: {}, sameTeam: true }));
for (let i = 0; i < 2; i++) {
  const C = await mk('C' + i); J.push(C);
  const inv = await ev(H, () => window.__frontline.net.hostInvite()), rep = await ev(C, ([c, i]) => window.__frontline.net.joinManual('P' + i, c), [inv, i]);
  await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
  for (let k = 0; k < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); k++) await sleep(50);
  await ev(C, () => window.__frontline.net.setReady(true));
}
await sleep(300);
let all = [H, ...J]; const run = async (frames) => { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } };
await ev(H, () => window.__frontline.net.hostStart()); await run(200);
const spr = (p) => ev(p, () => window.__frontline.G.scene.children.filter((c) => c.isSprite && c.renderOrder === 20).length);
await ev(J[0], () => window.__frontline.net.session.ping({ x: 1, y: 0, z: 2, k: 'here' })); await run(20); await sleep(100); await run(10);
check('ping relayed to team', (await spr(H)) === 1 && (await spr(J[1])) === 1, [await spr(H), await spr(J[1]), await spr(J[0]), await ev(H, () => [window.__frontline.G.match.teams, window.__frontline.G.player.team, window.__frontline.net.session.remotes.map((r) => r.unit && r.unit.team), [...document.querySelectorAll('.cl')].map((x) => x.textContent).slice(-2)])]);
await ev(J[0], () => window.__frontline.net.sendChat('/votekick P1')); await sleep(150); await run(10);
const log = await ev(H, () => [...document.querySelectorAll('.cl')].map((x) => x.textContent).slice(-2).join(' | '));
await ev(H, () => window.__frontline.net.sendChat('/yes')); await sleep(400); await run(20);
const left = await ev(H, () => window.__frontline.net.session.remotes.filter((r) => r.hello).map((r) => r.name));
check('votekick passes (2 of 2 eligible)', /vote to kick P1/.test(log) && left.join() === 'P0', [log, left]);
all = [H, J[0]];
await ev(J[0], () => window.__frontline.net.sendChat('/surrender')); await sleep(150); await run(10);
await ev(H, () => window.__frontline.net.sendChat('/yes')); await sleep(200); await run(60);
check('surrender ends the match', await ev(H, () => window.__frontline.G.match.ended || window.__frontline.G.state === 'ended' || window.__frontline.G.state === 'finale'), null);
check('errors', !errors.filter((e) => !/kicked|removed/.test(e)).length, errors.slice(0, 4));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
process.exitCode = fail.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
