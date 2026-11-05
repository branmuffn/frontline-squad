// 3d: multiplayer Gun Game (tiers through the host), Infection (joiner turns), CTF (joiner grabs the flag). node tests/mpmodes.mjs [mode]
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
// B6: big rooms. Host + N joiners (default 11 = 12 players) over manual codes: all join, match starts, snapshots at
// 20 Hz with interest management, upload per joiner, host frame time. node tests/mp12.mjs [joiners] [big]
const NJ = +process.argv[2] || 11, big = process.argv[3] === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (p, f, a) => p.evaluate(f, a);
const H = await mk('HOST'), J = [];
await ev(H, (big) => window.__frontline.net.hostOpen('HOST', { mode: 'ffa', map: 'outpost', skill: 5, count: 9, bots: {}, big }), big);
for (let i = 0; i < NJ; i++) {
  const C = await mk('C' + i); J.push(C);
  const inv = await ev(H, () => window.__frontline.net.hostInvite()), rep = await ev(C, ([c, i]) => window.__frontline.net.joinManual('P' + i, c), [inv, i]);
  await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
  for (let k = 0; k < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); k++) await sleep(50);
  await ev(C, () => window.__frontline.net.setReady(true));
}
await sleep(500);
const all = [H, ...J], run = async (frames) => { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } };
const lobby = await ev(H, () => [window.__frontline.net.session.remotes.filter((r) => r.hello).length, window.__frontline.net.maxPlayers(), document.getElementById('mpNet').textContent]);
const started = await ev(H, () => window.__frontline.net.hostStart());
await run(120);
const b0 = await ev(H, () => window.__frontline.net.session.remotes.map((r) => r.link.bytesOut));
const t0 = await ev(H, () => window.__frontline.G.now); await run(180);
const r = await ev(H, ([b0, t0]) => { const F = window.__frontline, G = F.G, S = F.net.session, dt = G.now - t0;
  const per = S.remotes.map((x, i) => (x.link.bytesOut - b0[i]) / dt);
  return { secs: +dt.toFixed(1), bots: G.bots.length, humans: G.units.filter((u) => u.isPlayer || u.remote).length, kbpsPerJoiner: +(per.reduce((a, b) => a + b, 0) / per.length * 8 / 1000).toFixed(1), hostMbps: +(per.reduce((a, b) => a + b, 0) * 8 * 1.12 / 1e6).toFixed(2), hostMs: +G.perf.ms.toFixed(2) };
}, [b0, t0]);
const seen = await ev(J[J.length - 1], () => [window.__frontline.net.session.proxies.size, [...window.__frontline.net.session.proxies.values()].filter((u) => u.buf.length > 2).length]);
console.log(JSON.stringify({ lobby, started, ...r, lastJoinerSees: seen, errors: errors.slice(0, 3) }));
const ok = lobby[0] === NJ && started && r.humans === NJ + 1 && seen[1] >= seen[0] - 1 && !errors.length;
console.log(ok ? 'PASS mp12' : 'FAIL mp12');
await browser.close();
