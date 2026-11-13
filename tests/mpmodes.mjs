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



const only = process.argv[2];
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (p, f, a) => p.evaluate(f, a);
for (const mode of only ? [only] : ['gungame', 'infection', 'ctf', 'zombies', 'range', 'dom', 'koth', 'snd']) {
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
    await ev(C, (a) => { const F = window.__frontline, u = F.net.session.proxies.get(a[0]); u.protectUntil = 0; F.G.profile.career.medals = {}; F.damage(u, 999, F.G.player, { weapon: a[1], zone: 'head', headshot: true, dist: 45 }); }, [bid, w0]);
    await run(30);
    const r = await ev(C, () => [window.__frontline.G.player.gg, window.__frontline.G.player.weapons[0]]);
    check('gungame tier up', r[0] === 1 && r[1] !== w0, [w0, r]);
    const md = await ev(C, () => window.__frontline.G.profile.career.medals), nb = await ev(H, () => window.__frontline.G.bots.length);
    check('joiner medals from own claim (headshot + longshot)', md.headshot >= 1 && md.longshot >= 1, md);
    check('gungame bots = lobby count', nb === 4, nb);
  } else if (mode === 'infection') {
    await ev(H, () => { const F = window.__frontline, G = F.G, inf = G.units.find((u) => u.team === 1 && !u.remote) || G.bots[0], r = G.units.find((u) => u.remote); inf.team = 1; r.protectUntil = 0; F.damage(r, 999, inf, { weapon: 'knife', melee: true }); });
    await run(260);
    const r = await ev(C, () => [window.__frontline.G.player.team, window.__frontline.G.player.weapons.join(',')]);
    const h = await ev(H, () => window.__frontline.G.units.find((u) => u.remote).team);
    check('infection turns joiner', r[0] === 1 && h === 1 && r[1] === 'knife', [r, h]);
  } else if (mode === 'dom' || mode === 'koth') {
    const h = await ev(H, () => JSON.stringify(window.__frontline.G.match.hook.netState())), c = await ev(C, () => JSON.stringify(window.__frontline.G.match.hook.netState()));
    check(mode + ' zones mirrored', h === c || (mode === 'koth' && JSON.parse(h)[0] === JSON.parse(c)[0]), [h, c]);
  } else if (mode === 'snd') {
    // the joiner (attacker or defender) — make them the attacker's side by checking who attacks, then plant from a site
    const st = await ev(H, () => window.__frontline.G.match.hook.netState()), cs = await ev(C, () => window.__frontline.G.match.hook.netState());
    check('snd round mirrored', st[0] === cs[0] && st[1] === cs[1], [st, cs]);
    await ev(H, (att) => { const G = window.__frontline.G; const r = G.units.find((u) => u.remote); r.team = att; for (const b of G.bots) b.brain.target = null; }, st[1]);
    const site = await ev(H, () => { const G = window.__frontline.G, sp = G.match.hook.botGoal({ team: G.match.hook.netState()[1], id: 0, x: 0, z: 0 }); return sp; });
    await ev(C, (s) => { const F = window.__frontline, P = F.G.player; P.x = s.x; P.y = s.y; P.z = s.z; P.protectUntil = 1e9; F.input.keys[F.G.profile.settings.keys.interact] = true; }, site);
    await run(260);
    await ev(C, () => { const F = window.__frontline; F.input.keys[F.G.profile.settings.keys.interact] = false; });
    const b = await ev(H, () => window.__frontline.G.match.hook.netState()[4]), cb = await ev(C, () => window.__frontline.G.match.hook.netState()[4]);
    check('snd joiner plants (bomb mirrored)', Array.isArray(b) && Array.isArray(cb), [b, cb]);
  } else if (mode === 'range') {
    // co-op practice range: same map + dummies on both sides; the joiner's hits land on the host's dummies, numbers show
    const h = await ev(H, () => [window.__frontline.G.world.id, window.__frontline.G.bots.length]);
    const c = await ev(C, () => [window.__frontline.G.world.id, window.__frontline.net.session.proxies.size, window.__frontline.G.bots.length]);
    const id = await ev(H, () => window.__frontline.G.bots.find((b) => b.alive && !b.dummy.rail).id);
    const hp0 = await ev(H, (id) => window.__frontline.G.units.find((u) => u.id === id).health, id);
    await ev(C, (id) => { const F = window.__frontline, u = F.net.session.proxies.get(id); u.protectUntil = 0; F.damage(u, 30, F.G.player, { weapon: 'm4', dist: 10 }); }, id);
    await run(20);
    const hp1 = await ev(H, (id) => window.__frontline.G.units.find((u) => u.id === id).health, id), num = await ev(C, () => document.querySelectorAll('.dmgnum').length);
    check('range co-op', h[0] === 'range' && c[0] === 'range' && h[1] === 13 && c[2] === 0 && c[1] >= 13 && hp1 < hp0 && num > 0, [h, c, hp0, hp1, num]);
  } else if (mode === 'zombies') {
    // co-op revive: a lethal hit downs the joiner; the host holds E next to them; bleed-out kills; joiner revives host
    const E = (p, on) => ev(p, (on) => { const F = window.__frontline; F.input.keys[F.G.profile.settings.keys.interact] = on; }, on);
    await ev(H, () => { const F = window.__frontline, G = F.G; for (const b of G.bots) b.alive && F.damage(b, 9999, null, {}); G.match.toSpawn = 0; G.match.roundState = 'break'; G.match.nextRoundAt = G.now + 999;
      const r = G.units.find((u) => u.remote); r.protectUntil = 0; F.damage(r, 999, null, { weapon: 'claws', melee: true }); });
    await run(30);
    const d1 = await ev(H, () => { const r = window.__frontline.G.units.find((u) => u.remote); return [r.alive, r.downed > 0]; });
    const c1 = await ev(C, () => { const P = window.__frontline.G.player; return [P.alive, P.downed > 0, P.prone]; });
    const L0 = await ev(H, () => window.__frontline.G.match.lives); console.log('lives after down', L0);
    check('zombies joiner downed', d1[0] && d1[1] && c1[0] && c1[1] && c1[2], [d1, c1]);
    await ev(H, () => { const G = window.__frontline.G, r = G.units.find((u) => u.remote), P = G.player; P.x = r.x + 1; P.z = r.z; P.y = r.y; });
    await E(H, true); await run(220); await E(H, false);
    const d2 = await ev(H, () => { const r = window.__frontline.G.units.find((u) => u.remote); return [r.downed || 0, r.health]; });
    const c2 = await ev(C, () => { const P = window.__frontline.G.player; return [P.downed || 0, P.prone, P.health]; });
    check('zombies host revives joiner', d2[0] === 0 && d2[1] === 50 && c2[0] === 0 && !c2[1] && c2[2] === 50, [d2, c2]);
    // the joiner revives the host
    await ev(H, () => { const F = window.__frontline, P = F.G.player; P.protectUntil = 0; F.damage(P, 999, null, { weapon: 'claws', melee: true }); });
    await run(20);
    await ev(C, () => { const F = window.__frontline, G = F.G, h = F.net.session.proxies.get([...F.net.session.proxies.keys()].find((k) => F.net.session.proxies.get(k).name === 'ALPHA')); const P = G.player; P.x = h.x + 1; P.z = h.z; P.y = h.y; });
    await run(20); await E(C, true); await run(240); await E(C, false);
    const d3 = await ev(H, () => { const P = window.__frontline.G.player; return [P.alive, P.downed || 0, P.health]; });
    check('zombies joiner revives host', d3[0] && d3[1] === 0 && d3[2] === 50, d3);
    // bleed-out
    await ev(H, () => { const F = window.__frontline, G = F.G, r = G.units.find((u) => u.remote); F.damage(r, 999, null, { weapon: 'claws' }); r.downed = G.now + 0.2; });
    await run(40);
    const d4 = await ev(H, () => { const G = window.__frontline.G, r = G.units.find((u) => u.remote); return [r.alive, G.match.lives]; });
    check('zombies bleed-out uses a life', !d4[0] && d4[1] === 2, d4);
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
process.exitCode = fail.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
