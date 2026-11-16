// Multiplayer through the real lobby UI (2026-11-15, Brian: phone host + laptop joiner, "couldn't choose a map" and
// "laptop stuck in the lobby"). Phone pages are touch + landscape (915x356, a Pixel 7 with Chrome's bar), laptops 1366x768.
// Pairs connect with the lobby's copy-paste codes (no broker needed). Checks:
//  - the Map list lists every map and the host's pick reaches the joiner (it was empty since 3f-7: a comment ate the code)
//  - phone host + laptop joiner: Ready -> Start, both play the picked mode and map
//  - laptop joiner ticks Spectate: the list says "spectating" (it said "ready"), Start puts it in the match watching
//    (it used to get no start at all and stay in the lobby while the host played)
//  - a joiner whose start message goes missing asks again and drops in (self-heal)
//  - Warm-up with a joiner who isn't ready; laptop host + phone joiner; phone host + phone joiner
// usage: node tests/mplobby.mjs   (FPS_LOOPBACK=1 on the M14, see README)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const THREE = fs.readFileSync(path.join(HERE, 'three.min.js'), 'utf8');
const INIT = `window.__rafq=[];window.__t=0;window.requestAnimationFrame=function(f){window.__rafq.push(f);return window.__rafq.length;};
window.__step=function(n,dtms){dtms=dtms||16.6667;for(let i=0;i<n;i++){window.__t+=dtms;const q=window.__rafq;window.__rafq=[];for(const f of q)f(window.__t);}};
window.__NET_OPTS={nostun:true,nobroker:true,loopback:${process.env.FPS_LOOPBACK === '1'}};`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const html = fs.readFileSync(path.join(HERE, '../dist-standalone/frontline_solo_ops.html'), 'utf8');
const errors = [], out = {}, fail = [];
const check = (name, ok, info) => { out[name] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mk(tag, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 915, height: 356 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' ' + m.text()); });
  page.on('pageerror', (e) => errors.push(tag + ' PAGEERR ' + e.message));
  await page.route('**/three.min.js', (r) => r.fulfill({ contentType: 'application/javascript', body: THREE }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', (r) => r.abort());
  await page.route('http://game.local/', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.addInitScript(INIT);
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__frontline, null, { timeout: 30000 });
  await page.evaluate(() => { const r = window.__frontline.G.renderer; r.clear = () => {}; r.clearDepth = () => {}; r.render = (s, c) => { s.updateMatrixWorld(); if (c && !c.parent) c.updateMatrixWorld(); }; });
  page.phone = phone; page.ctx = ctx;
  return page;
}
// press a button the way that device would (tap on phones, click on laptops)
const press = (p, sel) => (p.phone ? p.locator(sel).tap() : p.locator(sel).click());
const state = (p) => p.evaluate(() => { const f = window.__frontline, G = f.G; return { state: G.state, map: G.world && G.world.id, mode: G.match && G.match.mode, spec: !!G.spectating, live: !!f.net.session.live }; });

// Opens Multiplayer on both, host presses "Host a game", then the copy-paste codes join the second page.
async function pair(hostPhone, joinPhone, { spectate = false } = {}) {
  const H = await mk('HOST', hostPhone), C = await mk('JOIN', joinPhone);
  const step = async (n = 3) => { await H.evaluate((n) => window.__step(n), n); await C.evaluate((n) => window.__step(n), n); };
  await press(H, '#openMp'); await press(C, '#openMp'); await step();
  await press(H, '#mpHost'); await sleep(200); await step();
  if (spectate) await C.check('#mpSpec');
  // the copy-paste panel is folded away in a <details>; fill and press its buttons directly
  await H.evaluate(() => document.getElementById('mpInvite').click());
  let inv = ''; for (let i = 0; i < 100 && !(inv = await H.evaluate(() => document.getElementById('mpInviteOut').value)); i++) await sleep(50);
  await C.evaluate((c) => { document.getElementById('mpInviteIn').value = c; document.getElementById('mpReply').click(); }, inv);
  let rep = ''; for (let i = 0; i < 100 && !(rep = await C.evaluate(() => document.getElementById('mpReplyOut').value)); i++) await sleep(50);
  await H.evaluate((c) => { document.getElementById('mpReplyIn').value = c; document.getElementById('mpAccept').click(); }, rep);
  for (let i = 0; i < 100 && !(await H.evaluate(() => window.__frontline.net.session.remotes.some((r) => r.hello))); i++) { await sleep(50); await step(1); }
  await sleep(200); await step();
  return { H, C, step, close: async () => { await H.ctx.close(); await C.ctx.close(); } };
}
async function settle(P, n = 12) { for (let i = 0; i < n; i++) { await P.step(10); await sleep(60); } }

// --- 1. phone host + laptop joiner: map list, pick mode + map, Ready, Start
{
  const P = await pair(true, false), { H, C } = P;
  const opts = await H.evaluate(() => [...document.getElementById('mpMap').options].map((o) => o.value));
  const want = await H.evaluate(() => Object.keys(window.__frontline.MAPS || {}));
  check('map list filled', opts.length >= 6 && !opts.includes('range') && !opts.includes('custom'), opts);
  const seen = [];
  for (const id of opts) { await H.selectOption('#mpMap', id); await sleep(150); await P.step(); seen.push(await C.evaluate(() => document.getElementById('mpMap').value)); }
  check('every map reaches the joiner', seen.join() === opts.join(), { opts, seen });
  await H.selectOption('#mpMode', 'tdm'); await sleep(100);
  await H.selectOption('#mpMap', 'harbour'); await sleep(200); await P.step();
  const cfg = await H.evaluate(() => window.__frontline.net.session.cfg);
  check('host picks map', cfg.mode === 'tdm' && cfg.map === 'harbour', { mode: cfg.mode, map: cfg.map, want: want.length });
  check('joiner sees the pick', (await C.evaluate(() => document.getElementById('mpMap').value)) === 'harbour', await C.evaluate(() => document.getElementById('mpMap').value));
  await press(C, '#mpReady'); await sleep(300); await P.step();
  check('start enabled when ready', !(await H.evaluate(() => document.getElementById('mpStart').disabled)), await H.evaluate(() => document.getElementById('mpStart').textContent));
  await press(H, '#mpStart'); await settle(P);
  const h = await state(H), c = await state(C);
  check('phone host + laptop: both in', ['deploy', 'playing'].includes(h.state) && ['deploy', 'playing'].includes(c.state) && c.live, { h, c });
  check('same map and mode', h.map === 'harbour' && c.map === 'harbour' && h.mode === 'tdm' && c.mode === 'tdm', { h, c });
  await P.close();
}
// --- 2. laptop joins as a spectator
{
  const P = await pair(true, false, { spectate: true }), { H, C } = P;
  const list = await H.evaluate(() => document.getElementById('mpPlayers').innerText);
  check('list says spectating', /spectating/.test(list) && !/\bready\b/.test(list.replace(/spectating/g, '')), list);
  check('spectator has no Ready button', await C.evaluate(() => !document.getElementById('mpReady').offsetParent), '');
  await press(H, '#mpStart'); await settle(P);
  const h = await state(H), c = await state(C);
  check('spectator goes in watching', c.state === 'playing' && c.spec && c.live && ['deploy', 'playing'].includes(h.state), { h, c });
  // leaving the match: the spectator isn't pulled back in by the self-heal
  await C.evaluate(() => { const f = window.__frontline; f.net.clientQuit(); });
  await settle(P, 50);
  check('spectator who quits stays out', !(await state(C)).live, await state(C));
  await P.close();
}
// --- 2b. a spectator in every multiplayer mode (team modes used to crash the spectator's deploy: no spawns for team -1)
{
  const P = await pair(false, false, { spectate: true }), { H, C } = P;
  const modes = await H.evaluate(() => window.__frontline.net.MP_MODES);
  const bad = {};
  for (const mode of modes) {
    await H.selectOption('#mpMode', mode); await sleep(150); await P.step();
    await press(H, '#mpStart'); await settle(P, 8);
    const h = await state(H), c = await state(C), e = errors.length;
    if (!(c.state === 'playing' && c.spec && c.live && h.mode === mode && c.mode === mode) || e) bad[mode] = { h, c, e: errors.slice(-1) };
    // host ends it: both back to the lobby for the next mode
    await H.evaluate(() => document.getElementById('quit').click()); // pause menu > Quit: the host ends it, both go back to the lobby
    await settle(P, 4);
  }
  check('spectator in every mode', !Object.keys(bad).length, bad);
  await P.close();
}
// --- 3. the joiner's start message goes missing: it asks again and drops in
{
  const P = await pair(true, false), { H, C } = P;
  await C.evaluate(() => { const L = window.__frontline.net.session.link, on = L.onmsg; let dropped = false; L.onmsg = (m) => { if (m.t === 'start' && !dropped) { dropped = true; window.__dropped = true; return; } on(m); }; });
  await press(C, '#mpReady'); await sleep(300); await P.step();
  await press(H, '#mpStart');
  for (let i = 0; i < 40 && !(await state(C)).live; i++) { await P.step(10); await sleep(150); }
  const c = await state(C);
  check('lost start: joiner recovers', (await C.evaluate(() => !!window.__dropped)) && c.live && c.state === 'playing', c);
  await P.close();
}
// --- 4. Warm-up with a joiner who isn't ready
{
  const P = await pair(true, false), { H, C } = P;
  check('start waits for ready', await H.evaluate(() => document.getElementById('mpStart').disabled), '');
  await press(H, '#mpWarm'); await settle(P);
  const h = await state(H), c = await state(C);
  check('warm-up: both in', ['deploy', 'playing'].includes(h.state) && ['deploy', 'playing'].includes(c.state) && c.live, { h, c });
  await P.close();
}
// --- 5. laptop host + phone joiner, 6. phone + phone
for (const [hp, jp, name] of [[false, true, 'laptop host + phone'], [true, true, 'phone host + phone']]) {
  const P = await pair(hp, jp), { H, C } = P;
  await H.selectOption('#mpMap', 'gorge').catch(() => {}); await sleep(200); await P.step();
  await press(C, '#mpReady'); await sleep(300); await P.step();
  await press(H, '#mpStart'); await settle(P);
  const h = await state(H), c = await state(C);
  check(name + ': both in', ['deploy', 'playing'].includes(h.state) && ['deploy', 'playing'].includes(c.state) && c.live && h.map === c.map, { h, c });
  await P.close();
}
check('no errors', errors.length === 0, errors.slice(0, 6));
console.log(JSON.stringify(out, null, 1));
console.log(fail.length ? 'FAIL: ' + fail.join(', ') : 'PASS');
await browser.close();
process.exit(fail.length ? 1 : 0);
