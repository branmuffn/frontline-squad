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
// Warm-up: host starts a free-for-all warm-up without anyone ready; nothing counts; ending it sends everyone back to the
// lobby, then the real match (lobby settings) starts once everyone is ready.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), ev = (p, f, a) => p.evaluate(f, a);
const out = {}, fail = [], check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const H = await mk('HOST'), C = await mk('C');
await ev(H, () => window.__frontline.net.hostOpen('HOST', { mode: 'tdm', map: 'yard', skill: 5, count: 3, bots: {} }));
const inv = await ev(H, () => window.__frontline.net.hostInvite()), rep = await ev(C, (c) => window.__frontline.net.joinManual('P0', c), inv);
await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
for (let k = 0; k < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); k++) await sleep(50);
await sleep(300);
const all = [H, C], run = async (frames) => { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } };
const notReadyStart = await ev(H, () => window.__frontline.net.hostStart());
await ev(H, () => document.getElementById('mpWarm').click()); await sleep(200); await run(200);
const w = await ev(H, () => { const G = window.__frontline.G; return [G.match.mode, G.match.warmup, G.bots.length, G.units.filter((u) => u.remote).length]; });
const wc = await ev(C, () => { const G = window.__frontline.G; return [G.match && G.match.mode, G.match && G.match.warmup, G.state]; });
check('warm-up starts without ready', !notReadyStart && w[0] === 'ffa' && w[1] && w[2] === 0 && w[3] === 1 && wc[1] && wc[2] !== 'menu', [notReadyStart, w, wc]);
await ev(C, () => { const F = window.__frontline; F.G.profile.career.medals = {}; F.G.match.multiCount = 0; });
const xp0 = await ev(C, () => window.__frontline.G.profile.xp);
await ev(H, () => document.getElementById('warmEnd').click()); await sleep(500); await run(20);
const back = await ev(C, () => [window.__frontline.net.session.live, document.getElementById('mp').classList.contains('hidden')]);
check('ending warm-up returns everyone to the lobby', !back[0] && !back[1], back);
await ev(C, () => window.__frontline.net.setReady(true)); await sleep(300);
const st = await ev(H, () => window.__frontline.net.hostStart()); await run(60);
const real = await ev(H, () => [window.__frontline.G.match.mode, window.__frontline.G.match.warmup]);
check('real match starts with lobby settings', st && real[0] === 'tdm' && !real[1], [st, real]);
check('warm-up gave no XP', (await ev(C, () => window.__frontline.G.profile.xp)) === xp0, null);
check('errors', !errors.length, errors.slice(0, 4));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
process.exitCode = fail.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
