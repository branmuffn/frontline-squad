// Joiner killstreaks: host grants, joiner deploys mortar + sentry through the host, both mirrored. node tests/mpstreaks.mjs
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

const H = await mk('HOST'), C = await mk('C1'), all = [H, C];
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(frames) { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } }
const ev = (p, f, a) => p.evaluate(f, a);
await ev(H, () => window.__frontline.net.hostOpen('ALPHA', { mode: 'ffa', map: 'yard', skill: 5, count: 3, bots: {} }));
const inv = await ev(H, () => window.__frontline.net.hostInvite());
const rep = await ev(C, (c) => window.__frontline.net.joinManual('BRAVO', c), inv);
await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
for (let i = 0; i < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); i++) await sleep(50);
await ev(C, () => window.__frontline.net.setReady(true)); await sleep(200);
await ev(H, () => window.__frontline.net.hostStart());
for (let i = 0; i < 60 && (await ev(C, () => window.__frontline.G.state)) !== 'deploy'; i++) await sleep(50);
await ev(H, () => { window.__frontline.G.match.rules = { passive: true }; });
await run(240);
const killBot = async (streakBefore) => {
  await ev(H, (n) => { const r = window.__frontline.net.session.remotes[0].unit; r.streak = n; }, streakBefore);
  const bid = await ev(H, () => window.__frontline.G.bots.find((b) => b.alive).id);
  await ev(C, (id) => { const F = window.__frontline, u = F.net.session.proxies.get(id); u.protectUntil = 0; F.damage(u, 999, F.G.player, { weapon: 'm4', zone: 'head', headshot: true, dist: 8 }); }, bid);
  await run(20);
};
await killBot(4);
let c = await ev(C, () => ({ st: window.__frontline.G.player.streak, ready: window.__frontline.streakState.ready.slice() }));
check('joiner earns mortar', c.st === 5 && c.ready.includes('mortar'), c);
// aim at the ground in front and deploy
await ev(C, () => { const P = window.__frontline.G.player; P.pitch = -0.09; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); });
await run(10);
let h = await ev(H, () => window.__frontline.streakState.shells.map((s) => s.owner && s.owner.remote ? 1 : 0));
let cs = await ev(C, () => window.__frontline.streakState.shells.map((s) => s.ghost ? 1 : 0));
check('mortar on host', h.length === 6 && h.every((x) => x === 1), h);
check('mortar mirrored', cs.length === 6 && cs.every((x) => x === 1), cs);
await run(300);
h = await ev(H, () => window.__frontline.streakState.shells.length); cs = await ev(C, () => window.__frontline.streakState.shells.length);
check('mortar landed', h === 0 && cs === 0, [h, cs]);
await run(260); // in case the strike caught the joiner: wait out the respawn
await killBot(6);
c = await ev(C, () => window.__frontline.streakState.ready.slice());
check('joiner earns sentry', c.includes('sentry'), c);
await ev(C, () => { const R = window.__frontline.streakState.ready; while (R.length && R[0] !== 'sentry') R.shift(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); });
await run(10);
h = await ev(H, () => window.__frontline.streakState.sentries.map((s) => (s.owner.remote ? 'R' : 'X') + s.key));
cs = await ev(C, () => window.__frontline.streakState.sentries.map((s) => (s.ghost ? 'G' : 'X') + s.key));
check('sentry on host', h.length === 1 && h[0][0] === 'R', h);
check('sentry mirrored', cs.length === 1 && cs[0] === 'G' + h[0].slice(1), [h, cs]);
// bring a bot in front of the sentry; the host fires, the joiner sees the bursts
await ev(H, () => { const F = window.__frontline, G = F.G, s = F.streakState.sentries[0], b = G.bots.find((q) => q.alive); if (!s || !b) return; b.x = s.x - Math.sin(s.yaw) * 6; b.z = s.z - Math.cos(s.yaw) * 6; b.y = s.y; b.protectUntil = 0; window.__sb = b.id; });
for (let k = 0; k < 4 && !(await ev(C, () => window.__frontline.G.netSentryShots || 0)); k++) { await ev(H, () => { const F = window.__frontline, G = F.G, s = F.streakState.sentries[0], b = G.bots.find((q) => q.alive); if (!s || !b) return; const a = s.yaw + (Math.random() - 0.5); b.x = s.x - Math.sin(a) * 4; b.z = s.z - Math.cos(a) * 4; b.y = s.y; }); await run(60); }
const shots = await ev(C, () => window.__frontline.G.netSentryShots || 0);
check('sentry bursts mirrored', shots > 0, shots);
check('errors', errors.length === 0, errors.slice(0, 6));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
process.exitCode = fail.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
