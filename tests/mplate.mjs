// 3d: late join into a running match, rejoin keeps the score, spectator mode. node tests/mplate.mjs
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


const H = await mk('HOST'), C1 = await mk('C1'), C2 = await mk('C2');
let all = [H, C1, C2];
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(frames) { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } }
const ev = (p, f, a) => p.evaluate(f, a);
async function join(C, name, spec) {
  const inv = await ev(H, () => window.__frontline.net.hostInvite());
  const rep = await ev(C, (a) => window.__frontline.net.joinManual(a[0], a[1], null, a[2]), [name, inv, spec]);
  await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
  for (let i = 0; i < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); i++) await sleep(50);
}
await ev(H, () => window.__frontline.net.hostOpen('ALPHA', { mode: 'ffa', map: 'yard', skill: 5, count: 2, bots: {} }));
await join(C1, 'BRAVO'); await ev(C1, () => window.__frontline.net.setReady(true)); await sleep(200);
await ev(H, () => window.__frontline.net.hostStart());
await run(200);
await join(C2, 'CHARLIE'); await sleep(300); await run(120);
let c2 = await ev(C2, () => ({ st: window.__frontline.G.state, live: window.__frontline.net.session.live, n: window.__frontline.G.units.length }));
let hu = await ev(H, () => window.__frontline.G.units.filter((u) => u.remote).map((u) => u.name));
check('late join', c2.live && c2.st === 'playing' && hu.includes('CHARLIE'), [c2, hu]);
await ev(H, () => { window.__frontline.G.units.find((u) => u.name === 'CHARLIE').kills = 2; });
await ev(C2, () => window.__frontline.net.leave()); await sleep(400); await run(10);
await join(C2, 'CHARLIE'); await sleep(300); await run(60);
const k = await ev(H, () => { const u = window.__frontline.G.units.find((q) => q.name === 'CHARLIE'); return u ? u.kills : -1; });
check('rejoin keeps score', k === 2, k);
await ev(C2, () => window.__frontline.net.leave()); await sleep(400); await run(10);
await join(C2, 'DELTA', true); await sleep(300); await run(90);
c2 = await ev(C2, () => ({ spec: !!window.__frontline.G.spectating, tag: document.getElementById('specTag').textContent, proxies: window.__frontline.net.session.proxies.size }));
hu = await ev(H, () => window.__frontline.G.units.filter((u) => u.remote).map((u) => u.name));
check('spectator', c2.spec && /Spectating/.test(c2.tag) && c2.proxies > 0 && !hu.includes('DELTA'), [c2, hu]);
await ev(C2, () => { window.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); }); await run(4);
check('errors', errors.length === 0, errors.slice(0, 6));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
process.exitCode = fail.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
