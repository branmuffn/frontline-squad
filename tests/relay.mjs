// Built-in relay + phone host mode (Brian, 2026-11-19: D2 + D3). One page each, no second player needed. Checks:
//  - multiplayer asks /api/turn once, puts the relay in the connection settings, and reuses it for the session
//  - no relay set up (204) or no answer: hosting still works, quickly, with direct links only
//  - phone host: a room opens with at most 3 bots (FFA) and says so; a laptop host keeps its 9
//  - the screen-awake lock is taken while in a room and let go on leaving
// usage: node tests/relay.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const THREE = fs.readFileSync(path.join(HERE, 'three.min.js'), 'utf8');
const html = fs.readFileSync(path.join(HERE, '../dist-standalone/frontline_solo_ops.html'), 'utf8');
// a fake Wake Lock that records what the game asks for; nobroker: only manual codes (no internet needed)
const INIT = `window.__rafq=[];window.requestAnimationFrame=function(f){window.__rafq.push(f);return window.__rafq.length;};window.__NET_OPTS={nobroker:true};window.__wake=[];
Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>{const l={released:false,listeners:[],addEventListener(t,f){this.listeners.push(f);},release:async()=>{l.released=true;window.__wake.push('off');}};window.__wake.push('on');return l;}}});`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = {}, fail = [], errors = [];
const check = (name, ok, info) => { out[name] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RELAY = { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.example.test:3478?transport=udp'], username: 'u', credential: 'c' }], expires: Date.now() + 3600e3 };

async function mk(phone, turn) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 915, height: 356 }, hasTouch: true, isMobile: true } : { viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage(); page.asks = 0;
  page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message));
  await page.route('**/three.min.js', (r) => r.fulfill({ contentType: 'application/javascript', body: THREE }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', (r) => r.abort());
  await page.route('http://game.local/', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/turn', async (r) => { page.asks++; if (turn === 'slow') await sleep(6000); turn === 'on' ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(RELAY) }) : r.fulfill({ status: 204, body: '' }); });
  await page.addInitScript(INIT);
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__frontline, null, { timeout: 30000 });
  page.ctx = ctx; page.step = () => page.evaluate(() => { const q = window.__rafq; window.__rafq = []; for (const f of q) f(performance.now()); });
  console.error('page ready', phone ? 'phone' : 'laptop', turn);
  return page;
}
async function host(p, phone) { // DOM clicks: no 3D drawing runs in this test (rAF is held), so the UI is driven directly
  await p.evaluate(() => document.getElementById('openMp').click()); await p.step(); await sleep(200);
  await p.evaluate(() => document.getElementById('mpHost').click()); await p.step(); await sleep(300);
  console.error('hosted', phone ? 'phone' : 'laptop');
}
async function invite(p) {
  const t0 = Date.now();
  await p.evaluate(() => document.getElementById('mpInvite').click());
  let inv = ''; for (let i = 0; i < 200 && !(inv = await p.evaluate(() => document.getElementById('mpInviteOut').value)); i++) await sleep(50);
  return { inv, ms: Date.now() - t0 };
}

{ // relay on: asked once, used in the connection, cached for the session
  const p = await mk(false, 'on');
  await host(p, false);
  const a = await invite(p);
  const sdpHasRelayTry = a.inv.startsWith('FL1');
  await p.evaluate(() => window.__frontline.net.leave());
  await p.evaluate(() => document.getElementById('mpHost').click()); await sleep(300); await invite(p);
  const cached = await p.evaluate(() => !!sessionStorage.getItem('frontline_relay_v1'));
  check('relay asked once per session and cached', p.asks === 1 && cached && sdpHasRelayTry, { asks: p.asks, cached });
  const w = await p.evaluate(() => window.__wake.slice());
  check('screen kept awake in a room, let go on leaving', w[0] === 'on' && w.includes('off'), w);
  await p.ctx.close();
}
{ // relay not set up (204): still hosts, no wait
  const p = await mk(false, 'off');
  await host(p, false);
  const a = await invite(p);
  check('no relay set up: invite still made', !!a.inv && p.asks === 1, { asks: p.asks, ms: a.ms });
  await p.ctx.close();
}
{ // relay service slow: gives up after 2.5 s and connects direct
  const p = await mk(false, 'slow');
  await host(p, false);
  const a = await invite(p);
  check('slow relay: no long wait', !!a.inv && a.ms < 9000, { ms: a.ms });
  await p.ctx.close();
}
{ // phone host gets fewer bots; laptop host keeps its pick
  const set = (p) => p.evaluate(() => { const k = 'frontline_mp_v1', s = JSON.parse(localStorage.getItem(k) || '{}'); s.cfg = { ...(s.cfg || {}), mode: 'ffa', count: 9 }; localStorage.setItem(k, JSON.stringify(s)); });
  const ph = await mk(true, 'off'); await set(ph); await ph.reload(); await ph.waitForFunction(() => window.__frontline, null, { timeout: 30000 });
  await host(ph, true);
  const r = await ph.evaluate(() => ({ count: window.__frontline.net.session.cfg.count, msg: document.getElementById('mpStatus') ? document.getElementById('mpStatus').textContent : document.body.innerText.match(/Phone host[^\n]*/)?.[0] }));
  check('phone host: 3 bots and a note', +r.count === 3 && /Phone host: bots set to 3/.test(r.msg || ''), r);
  const lp = await mk(false, 'off'); await set(lp); await lp.reload(); await lp.waitForFunction(() => window.__frontline, null, { timeout: 30000 });
  await host(lp, false);
  check('laptop host keeps 9 bots', +(await lp.evaluate(() => window.__frontline.net.session.cfg.count)) === 9, '');
  await ph.ctx.close(); await lp.ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
console.log(fail.length || errors.length ? 'FAIL ' + fail.join(', ') + ' ' + errors.join(' | ') : 'ALL OK');
process.exit(fail.length || errors.length ? 1 : 0);
