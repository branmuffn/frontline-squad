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



const only = process.argv[2];
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (p, f, a) => p.evaluate(f, a);
for (const mode of only ? [only] : ['gungame', 'infection', 'ctf']) {
  const H = await mk('HOST'), C = await mk('C1'), all = [H, C];
  const run = async (frames) => { for (let i = 0; i < frames; i += 2) { for (const p of all) await p.evaluate(() => window.__step(2)); if (i % 20 === 0) await sleep(5); } };
  await ev(H, (m) => window.__frontline.net.hostOpen('ALPHA', { mode: m, map: 'yard', skill: 5, count: 4, bots: {} }), mode);
  const inv = await ev(H, () => window.__frontline.net.hostInvite()), rep = await ev(C, (c) => window.__frontline.net.joinManual('BRAVO', c), inv);
  await ev(H, (r) => window.__frontline.net.hostAccept(r), rep);
  for (let i = 0; i < 80 && !(await ev(C, () => !!window.__frontline.net.session.link)); i++) await sleep(50);
  await ev(C, () => window.__frontline.net.setReady(true)); await sleep(200);
  const started = await ev(H, () => window.__frontline.net.hostStart());
  check(mode + ' starts', started, started);
  await ev(H, () => { window.__frontline.G.match.rules = { passive: true }; });
  await run(240);
  if (mode === 'gungame') {
    const w0 = await ev(C, () => window.__frontline.G.player.weapons[0]);
    const bid = await ev(H, () => window.__frontline.G.bots.find((b) => b.alive).id);
    await ev(C, (a) => { const F = window.__frontline, u = F.net.session.proxies.get(a[0]); u.protectUntil = 0; F.damage(u, 999, F.G.player, { weapon: a[1], zone: 'head', headshot: true, dist: 8 }); }, [bid, w0]);
    await run(30);
    const r = await ev(C, () => [window.__frontline.G.player.gg, window.__frontline.G.player.weapons[0]]);
    check('gungame tier up', r[0] === 1 && r[1] !== w0, [w0, r]);
  } else if (mode === 'infection') {
    await ev(H, () => { const F = window.__frontline, G = F.G, inf = G.units.find((u) => u.team === 1 && !u.remote) || G.bots[0], r = G.units.find((u) => u.remote); inf.team = 1; r.protectUntil = 0; F.damage(r, 999, inf, { weapon: 'knife', melee: true }); });
    await run(260);
    const r = await ev(C, () => [window.__frontline.G.player.team, window.__frontline.G.player.weapons.join(',')]);
    const h = await ev(H, () => window.__frontline.G.units.find((u) => u.remote).team);
    check('infection turns joiner', r[0] === 1 && h === 1 && r[1] === 'knife', [r, h]);
  } else {
    const team = await ev(C, () => window.__frontline.G.player.team);
    await ev(C, (t) => { const F = window.__frontline, s = F.G.match.hook.netState()[1 - t], P = F.G.player; P.x = s[2]; P.y = s[3]; P.z = s[4]; P.protectUntil = 1e9; }, team);
    await run(40);
    const h = await ev(H, (t) => window.__frontline.G.match.hook.netState()[1 - t], team), c = await ev(C, (t) => window.__frontline.G.match.hook.netState()[1 - t], team);
    check('ctf joiner grabs flag', h[0] === 1 && c[0] === 1, [h, c]);
  }
  await H.close(); await C.close();
}
check('errors', errors.length === 0, errors.slice(0, 6));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
await browser.close();
