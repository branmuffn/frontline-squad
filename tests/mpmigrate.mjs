// 3d: host migration - the host quits mid-match, the first joiner in line takes over with the time, team scores and
// kills/deaths kept (the rest reconnect through the room broker, which this offline test cannot reach). node tests/mpmigrate.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
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



const H = await mk('HOST'), C1 = await mk('C1'), C2 = await mk('C2'); let all = [H, C1, C2];
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(frames) { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } }
const ev = (p, f, a) => p.evaluate(f, a);
await ev(H, () => { window.__frontline.net.hostOpen('ALPHA', { mode: 'tdm', map: 'yard', skill: 5, count: 3, bots: {} }); window.__frontline.net.session.code = 'KQXPA'; });
for (const [C, n] of [[C1, 'BRAVO'], [C2, 'CHARLIE']]) { const inv = await ev(H, () => window.__frontline.net.hostInvite()), rep = await ev(C, (a) => window.__frontline.net.joinManual(a[0], a[1]), [n, inv]); await ev(H, (r) => window.__frontline.net.hostAccept(r), rep); for (let i = 0; i < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); i++) await sleep(50); await ev(C, () => window.__frontline.net.setReady(true)); }
await sleep(200); await ev(H, () => window.__frontline.net.hostStart()); await run(240);
await ev(H, () => { const G = window.__frontline.G; G.match.teamScores = [4, 6]; G.units.find((u) => u.name === 'BRAVO').kills = 3; });
await run(40);
const t0 = await ev(C1, () => Math.round(window.__frontline.G.match.time)), succ = await ev(C1, () => window.__frontline.net.session.succ);
check('succession known', succ && succ.code === 'KQXPB' && succ.order[0] === 'BRAVO', succ);
all = [C1, C2]; await ev(H, () => window.__frontline.net.leave()); await sleep(400); await run(20);
const c1 = await ev(C1, () => { const F = window.__frontline, G = F.G; return { host: F.net.session.host, live: F.net.session.live, kills: G.player.kills, ts: G.match.teamScores, time: Math.round(G.match.time), state: G.state, bots: G.bots.length }; });
check('successor hosts', c1.host && c1.live && c1.state === 'playing' && c1.bots > 0, c1);
check('score kept', c1.kills === 3 && c1.ts[0] === 4 && c1.ts[1] === 6 && Math.abs(c1.time - t0) < 6, [c1, t0]);
const c2 = await ev(C2, () => ({ role: window.__frontline.net.session.role, client: window.__frontline.net.session.client }));
check('others reconnecting', c2.client, c2);
check('errors', errors.filter((e) => !/ERR_NAME_NOT_RESOLVED|WebSocket|peerjs/i.test(e)).length === 0, errors.slice(0, 6));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
await browser.close();
