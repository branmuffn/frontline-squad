// Multiplayer test grid through the real lobby buttons (Brian, 2026-11-15: "test all game settings, all phone/laptop
// settings, which configurations work"). Phone pages are touch + landscape 915x356 (Pixel 7 with Chrome's bar), laptops
// 1366x768. One machine, so the network part is simulated: FPS_LOOPBACK=1 links the pages over 127.0.0.1 (M14 firewall).
//   node tests/mpmatrix.mjs [parts]   parts: a (pairings x join method), b (every mode x every map), c (settings)
//   ROOM=1 also runs part a over the real room-code broker (needs internet).
// Prints a table and exits non-zero if any row fails.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const THREE = fs.readFileSync(path.join(HERE, 'three.min.js'), 'utf8');
const LOOP = process.env.FPS_LOOPBACK === '1', PARTS = process.argv[2] || 'abc';
const STEP = `window.__rafq=[];window.__t=0;window.requestAnimationFrame=function(f){window.__rafq.push(f);return window.__rafq.length;};
window.__step=function(n,dtms){dtms=dtms||16.6667;for(let i=0;i<n;i++){window.__t+=dtms;const q=window.__rafq;window.__rafq=[];for(const f of q)f(window.__t);}};`;
// Room codes trickle ICE candidates through the broker: with FPS_LOOPBACK, point host candidates at 127.0.0.1 too.
const ICE_LOOP = `;(function(){const A=RTCPeerConnection.prototype.addIceCandidate;RTCPeerConnection.prototype.addIceCandidate=function(c,...r){try{if(c&&c.candidate){const s=c.candidate.replace(/^(candidate:\\S+ \\d+ \\S+ \\d+ )(\\S+)( \\d+ typ host)/,'$1'+'127.0.0.1$3');c=new RTCIceCandidate({candidate:s,sdpMid:c.sdpMid,sdpMLineIndex:c.sdpMLineIndex,usernameFragment:c.usernameFragment});}}catch(e){}return A.call(this,c,...r);};})();`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const html = fs.readFileSync(path.join(HERE, '../dist-standalone/frontline_solo_ops.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
let errors = [];

async function mk(tag, phone, room) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 915, height: 356 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' ' + m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(tag + ' PAGEERR ' + e.message));
  await page.route('**/three.min.js', (r) => r.fulfill({ contentType: 'application/javascript', body: THREE }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', (r) => r.abort());
  await page.route('http://game.local/', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.addInitScript(STEP + (room ? (LOOP ? ICE_LOOP : '') + 'window.__NET_OPTS={phoneHost:true};' : `window.__NET_OPTS={phoneHost:true,nostun:true,nobroker:true,loopback:${LOOP}};`));
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__frontline, null, { timeout: 30000 });
  await page.evaluate(() => { const r = window.__frontline.G.renderer; r.clear = () => {}; r.clearDepth = () => {}; r.render = (s, c) => { s.updateMatrixWorld(); if (c && !c.parent) c.updateMatrixWorld(); }; });
  page.phone = phone; page.ctx = ctx;
  return page;
}
const press = (p, sel) => (p.phone ? p.locator(sel).tap() : p.locator(sel).click());
const pick = async (p, what, v) => {
  if (p.phone) { await p.evaluate(() => document.querySelector('.mpp-tabs [data-tab=match]').click()); const b = p.locator(`#${what === 'mode' ? 'mpModeChips' : 'mpMapTiles'} [data-v="${v}"]`); if (!(await b.getAttribute('class') || '').includes('sel')) await b.tap(); }
  else await p.selectOption(what === 'mode' ? '#mpMode' : '#mpMap', v);
};
const st = (p) => p.evaluate(() => { const f = window.__frontline, G = f.G, S = f.net.session; return { state: G.state, map: G.world && G.world.id, mode: G.match && G.match.mode, live: !!S.live, spec: !!G.spectating, units: G.units.length, prox: S.proxies ? S.proxies.size : 0, remote: G.units.filter((u) => u.remote).length }; });

async function pair({ hostPhone, joinPhone, room = false, watch = false }) {
  const H = await mk('HOST', hostPhone, room), C = await mk('JOIN', joinPhone, room);
  const step = async (n = 3) => { await H.evaluate((n) => window.__step(n), n); await C.evaluate((n) => window.__step(n), n); };
  await press(H, '#openMp'); await press(C, '#openMp'); await step();
  await press(H, '#mpHost'); await sleep(200); await step();
  if (room) {
    let code = ''; for (let i = 0; i < 150 && !/^[A-Z0-9]{5}$/.test(code = await H.evaluate(() => document.getElementById('mpRoomCode').textContent.trim())); i++) { await sleep(100); await step(1); }
    await C.fill('#mpCode', code); await press(C, watch ? '#mpWatch' : '#mpJoin');
  } else {
    await H.evaluate(() => document.getElementById('mpInvite').click());
    let inv = ''; for (let i = 0; i < 100 && !(inv = await H.evaluate(() => document.getElementById('mpInviteOut').value)); i++) await sleep(50);
    await C.evaluate(([c, w]) => { document.getElementById('mpInviteIn').value = c; document.getElementById(w ? 'mpReplyWatch' : 'mpReply').click(); }, [inv, watch]);
    let rep = ''; for (let i = 0; i < 100 && !(rep = await C.evaluate(() => document.getElementById('mpReplyOut').value)); i++) await sleep(50);
    await H.evaluate((c) => { document.getElementById('mpReplyIn').value = c; document.getElementById('mpAccept').click(); }, rep);
  }
  let ok = false; for (let i = 0; i < 300 && !(ok = await H.evaluate(() => window.__frontline.net.session.remotes.some((r) => r.hello))); i++) { await sleep(100); await step(1); }
  await sleep(200); await step();
  return { H, C, step, joined: ok, close: async () => { await H.ctx.close(); await C.ctx.close(); } };
}
// start (Ready first if needed), let the deploy countdown run, check both are in the same match; then the host ends it
async function play(P, { mode, map, warm = false, watch = false } = {}) {
  const { H, C, step } = P;
  if (mode) await pick(H, 'mode', mode);
  if (map && mode !== 'range') await pick(H, 'map', map);
  await sleep(120); await step();
  if (!warm && !watch && await H.evaluate(() => document.getElementById('mpStart').disabled)) { await press(C, '#mpReady'); await sleep(250); await step(); }
  await press(H, warm ? '#mpWarm' : '#mpStart');
  for (let i = 0; i < 24; i++) { await step(10); await sleep(40); }
  const h = await st(H), c = await st(C);
  const want = warm ? 'ffa' : mode || h.mode;
  const inBoth = ['deploy', 'playing', 'dead'].includes(h.state) && ['deploy', 'playing', 'dead'].includes(c.state) && c.live;
  const same = h.map === c.map && h.mode === c.mode && h.mode === want && (!map || mode === 'range' || h.map === map);
  const sees = watch ? c.spec && c.prox >= 1 : h.remote >= 1 && c.prox >= 1;
  // the joiner moves; the host's copy follows (skipped for spectators)
  let moved = true;
  if (!watch && c.state !== 'dead') { await C.evaluate(() => { const P = window.__frontline.G.player; if (P && P.alive) P.x += 1.2; }); for (let i = 0; i < 6; i++) { await step(5); await sleep(30); }
    const d = await H.evaluate(() => { const F = window.__frontline, r = F.G.units.find((u) => u.remote); return r ? r.x : null; }), cx = await C.evaluate(() => window.__frontline.G.player.x);
    moved = d !== null && Math.abs(d - cx) < 0.6; }
  await H.evaluate(() => document.getElementById('quit').click()); // pause > End match for everyone
  for (let i = 0; i < 8; i++) { await step(5); await sleep(40); }
  const back = (await st(H)).state === 'menu' && (await st(C)).state === 'menu' && await C.evaluate(() => !document.getElementById('mp').classList.contains('hidden'));
  return { ok: inBoth && same && sees && moved && back, detail: { h: `${h.state} ${h.mode}/${h.map}`, c: `${c.state} ${c.mode}/${c.map}${c.spec ? ' watching' : ''}`, sees, moved, back } };
}
const dev = (p) => (p ? 'phone' : 'laptop');
const row = (part, what, ok, detail) => { rows.push({ part, what, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} [${part}] ${what}${ok ? '' : ' ' + JSON.stringify(detail)}`); };

// ---- a: every pairing x join method: Start, play, end, Start again (rematch), Warm-up, Watch
if (PARTS.includes('a')) {
  const methods = process.env.ROOM === '1' ? [false, true] : [false];
  for (const room of methods) for (const [hp, jp] of [[true, false], [false, true], [true, true], [false, false]]) {
    const how = room ? 'room code' : 'copy-paste codes', label = `${dev(hp)} host + ${dev(jp)} joiner, ${how}`;
    errors = [];
    const P = await pair({ hostPhone: hp, joinPhone: jp, room });
    if (!P.joined) { row('a', label + ': join', false, { errors }); await P.close(); continue; }
    const r1 = await play(P, { mode: 'tdm', map: 'harbour' }); row('a', label + ': Start (TDM, Harbour)', r1.ok && !errors.length, { ...r1.detail, errors });
    const r2 = await play(P, { mode: 'ffa', map: 'gorge' }); row('a', label + ': rematch (FFA, Cascade Gorge)', r2.ok && !errors.length, { ...r2.detail, errors });
    await P.C.evaluate(() => { if (window.__frontline.net.session.ready) document.getElementById('mpReady').click(); }); await P.step();
    const r3 = await play(P, { warm: true }); row('a', label + ': Warm-up (joiner not ready)', r3.ok && !errors.length, { ...r3.detail, errors });
    await P.close();
    errors = [];
    const W = await pair({ hostPhone: hp, joinPhone: jp, room, watch: true });
    const r4 = W.joined ? await play(W, { mode: 'ctf', map: 'yard', watch: true }) : { ok: false, detail: 'no join' };
    row('a', label + ': Watch (spectator, CTF)', r4.ok && !errors.length, { ...r4.detail, errors });
    await W.close();
  }
}
// ---- b: every multiplayer mode on every map (phone host + laptop joiner)
if (PARTS.includes('b')) {
  errors = [];
  const P = await pair({ hostPhone: true, joinPhone: false });
  const { modes, maps } = await P.H.evaluate(() => ({ modes: window.__frontline.net.MP_MODES, maps: [...document.getElementById('mpMap').options].map((o) => o.value) }));
  for (const mode of modes) for (const map of mode === 'range' ? ['range'] : maps) {
    const e0 = errors.length;
    const r = await play(P, { mode, map });
    row('b', `${mode} on ${map}`, r.ok && errors.length === e0, { ...r.detail, errors: errors.slice(e0) });
  }
  await P.close();
}
// ---- c: lobby settings (laptop host + phone joiner, TDM)
if (PARTS.includes('c')) {
  errors = [];
  const P = await pair({ hostPhone: false, joinPhone: true });
  const set = async (id, v) => { await P.H.selectOption('#' + id, v); await sleep(100); await P.step(); };
  const cases = [
    ['Vehicles on (Cascade Gorge)', async () => { await pick(P.H, 'mode', 'tdm'); await pick(P.H, 'map', 'gorge'); await set('mpVeh', '1'); }, 'tdm', 'gorge'],
    ['No bots', async () => { await set('mpVeh', '0'); await set('mpCount', '0'); }, 'tdm', 'yard'],
    ['Same team (co-op TDM)', async () => { await set('mpCount', '3'); await set('mpTeams', '1'); }, 'tdm', 'outpost'],
    ['Room size 16', async () => { await set('mpTeams', '0'); await set('mpBig', '1'); }, 'tdm', 'atomic'],
    ['Pickups off + power weapons off', async () => { await set('mpBig', '0'); await set('mpPick', '0'); await set('mpPower', '0'); }, 'tdm', 'radar'],
    ['Score + time limits', async () => { await set('mpPick', '1'); await set('mpPower', '1'); const o = await P.H.evaluate(() => [[...document.getElementById('mpScore').options].map((x) => x.value), [...document.getElementById('mpTime').options].map((x) => x.value)]); await set('mpScore', o[0].at(-1)); await set('mpTime', o[1][1]); }, 'tdm', 'atomicnight'],
    ['Bot skill 10, every "Bots may" off', async () => { await set('mpDiff', '10'); const keys = await P.H.evaluate(() => [...document.querySelectorAll('#mpBotRules button.on')].map((b) => b.dataset.k)); for (const k of keys) { await P.H.locator(`#mpBotRules [data-k="${k}"]`).click(); await sleep(60); } await P.step(); }, 'tdm', 'harbour'],
    ['Zombies, Nightmare', async () => { await pick(P.H, 'mode', 'zombies'); await set('mpZdiff', 'nightmare'); }, 'zombies', 'yard'],
  ];
  for (const [name, setup, mode, map] of cases) {
    const e0 = errors.length;
    await setup();
    const r = await play(P, { mode, map });
    row('c', name, r.ok && errors.length === e0, { ...r.detail, errors: errors.slice(e0) });
  }
  { // Brian 2026-11-19: the host just watches (runs the match): their soldier isn't in it, the joiner plays the bots
    const e0 = errors.length;
    const shown = await P.H.evaluate(() => { const r = document.getElementById('mpHostPlayRow'); return !r.classList.contains('hidden') && r.offsetParent !== null; });
    row('c', 'host sees the "You (host)" setting', shown, { shown });
    await set('mpHostPlay', '0'); await pick(P.H, 'mode', 'tdm'); await sleep(120); await P.step();
    if (await P.H.evaluate(() => document.getElementById('mpStart').disabled)) { await press(P.C, '#mpReady'); await sleep(250); await P.step(); }
    await press(P.H, '#mpStart'); for (let i = 0; i < 24; i++) { await P.step(10); await sleep(40); }
    const h = await P.H.evaluate(() => { const F = window.__frontline, G = F.G; return { inMatch: G.units.includes(G.player), watching: !!G.spectating, remote: G.units.filter((u) => u.remote).length, name: F.net.session.name }; });
    const c = await P.C.evaluate(() => { const S = window.__frontline.net.session; return { live: !!S.live, names: [...S.proxies.values()].map((u) => u.name) }; });
    row('c', 'host just watches (TDM)', !h.inMatch && h.watching && h.remote === 1 && c.live && c.names.length > 0 && !c.names.includes(h.name) && errors.length === e0, { h, c, errors: errors.slice(e0) });
    await P.H.evaluate(() => document.getElementById('quit').click()); for (let i = 0; i < 8; i++) { await P.step(5); await sleep(40); }
    await set('mpHostPlay', '1');
  }
  await P.close();
  { // Brian 2026-11-19: phones can't host (real phone hosts failed); they still Join and Watch
    const Ph = await mk('PHONE', true, false);
    await Ph.evaluate(() => { window.__NET_OPTS.phoneHost = false; document.getElementById('openMp').click(); });
    const v = await Ph.evaluate(() => { const vis = (id) => !document.getElementById(id).classList.contains('hidden') && document.getElementById(id).offsetParent !== null; return { host: vis('mpHost'), note: vis('mpPhoneHostNote'), join: vis('mpJoin'), watch: vis('mpWatch') }; });
    row('c', 'phone: no Host button, Join + Watch stay', !v.host && v.note && v.join && v.watch, v);
    await Ph.ctx.close();
  }
  // touch controls switched off on a phone: the phone gets the computer lobby and still hosts
  errors = [];
  const Q = await pair({ hostPhone: false, joinPhone: false });
  const r = await play(Q, { mode: 'dom', map: 'outpost' });
  row('c', 'laptop host + laptop joiner, Domination', r.ok && !errors.length, { ...r.detail, errors });
  await Q.close();
}
const bad = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - bad.length}/${rows.length} passed${bad.length ? '; FAILED: ' + bad.map((r) => `[${r.part}] ${r.what}`).join(' | ') : ''}`);
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(rows, null, 1));
await browser.close();
process.exit(bad.length ? 1 : 0);
