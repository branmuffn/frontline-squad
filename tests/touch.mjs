// Touch controls (phones/tablets): desktop shows none of it; on a touch screen the fixed stick moves you, the rest of the screen looks,
// and every button works (fire, aim, reload, crouch/prone, jump, grenade, weapon, scoreboard, pause/resume, use);
// light aim assist slows turning over an enemy; phone defaults (Balanced at 2x sharpness) apply once; portrait asks to rotate;
// phone menus keep every screen's main button on screen.
import { open } from './harness.mjs';
const fails = [], errs = [];
const check = (name, ok, info) => { if (!ok) fails.push(name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };

// ---- desktop: unchanged ----
{
  const { browser, page, errors } = await open({ w: 1280, h: 720 });
  const r = await page.evaluate(() => {
    const F = window.__frontline, G = F.G; F.input.freeLook = true;
    F.deploy({ mode: 'tdm', map: 'yard', skill: 5, count: 2 }); window.__step(240);
    const ui = document.getElementById('touchUI');
    return { touch: F.input.touch, body: document.body.className, ui: ui && getComputedStyle(ui).display, q: G.profile.settings.quality, setup: G.profile.settings.touchV,
      field: document.getElementById('touchField').classList.contains('hidden'), rot: getComputedStyle(document.getElementById('rotateMsg')).display };
  });
  check('desktop: no touch mode', r.touch === false && !/\btouch\b/.test(r.body), r);
  check('desktop: controls hidden', r.ui === 'none' && r.rot === 'none', r);
  check('desktop: graphics untouched', r.q === 'balanced' && r.setup === 0, r);
  check('desktop: touch settings hidden', r.field === true, r);
  errs.push(...errors); await browser.close();
}

// ---- phone (Pixel 7 held sideways) ----
const { browser, page, errors } = await open({ w: 915, h: 412, touch: true });
const cdp = await page.context().newCDPSession(page);
let fingers = [];
// finger moves reach the page on the browser's next real frame (the game clock is fake), so wait a moment after each
const send = async (type) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: fingers.map((f) => ({ x: f.x, y: f.y, id: f.id })) }); await page.waitForTimeout(35); };
const down = async (id, x, y) => { fingers.push({ id, x, y }); await send('touchStart'); };
const move = async (id, x, y) => { const f = fingers.find((q) => q.id === id); f.x = x; f.y = y; await send('touchMove'); };
const up = async (id) => { fingers = fingers.filter((q) => q.id !== id); await send('touchEnd'); };
const step = (n) => page.evaluate((n) => window.__step(n), n);
const ev = (fn, arg) => page.evaluate(fn, arg);
const center = (sel) => ev((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
const tapAt = async ([x, y], frames = 2) => { await down(9, x, y); await step(frames); await up(9); await step(2); };

const r0 = await ev(() => { const F = window.__frontline, G = F.G, s = G.profile.settings; return { touch: F.input.touch, shadows: s.shadowQ, scale: s.renderScale, px: s.pixelMax, auto: s.autoRes, setup: s.touchV }; });
check('phone: touch mode on', r0.touch === true, r0);
check('phone: Balanced graphics at 2x sharpness on first start', r0.shadows === 'high' && r0.scale === 1 && r0.px === 2 && r0.auto === true && r0.setup === 2, r0);

// phone menus (Brian picked M2): every screen's main button is on screen without scrolling the page
// (2026-11-15, back button B: on phones the way out of Settings / Killstreaks / Career / Controls is "‹ Back" at the top)
const scr = await ev(() => { const F = window.__frontline, out = {};
  const S = { menu: [() => F.ui.showScreen('menu'), '#deploy'], loadout: [() => F.ui.showLoadout(true), '#loadoutDone'],
    settings: [() => document.getElementById('openSettings').click(), '#settings .back-top'], streaks: [() => document.getElementById('openStreaks').click(), '#streaks .back-top'],
    career: [() => document.getElementById('openCareer').click(), '#career .back-top'], controls: [() => document.getElementById('openControls').click(), '#controls .back-top'] };
  for (const [k, [fn, sel]] of Object.entries(S)) { F.ui.showScreen('menu'); fn(); window.__step(2); const r = document.querySelector(sel).getBoundingClientRect();
    out[k] = r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight + 1;
    if (k === 'loadout') { const row = document.querySelector('#loadoutDone').parentElement.getBoundingClientRect(), pan = document.querySelector('#loadout .panel').getBoundingClientRect(); out.loadoutBarNarrow = row.width < pan.width * 0.5; } }
  F.ui.showScreen('menu'); return out; });
check('phone menus: main buttons reachable', Object.values(scr).every(Boolean), scr);

await ev(() => { const F = window.__frontline, G = F.G; F.deploy({ mode: 'tdm', map: 'yard', skill: 5, count: 2 }); window.__step(240);
  G.match.rules = { passive: true }; for (const b of G.bots) { b.x = 999; b.z = 999; } });
await step(2);
const vis = await ev(() => ({ ui: getComputedStyle(document.getElementById('touchUI')).display, fire: getComputedStyle(document.querySelector('.t-fire')).display, st: window.__frontline.G.state }));
check('phone: controls visible in play', vis.ui === 'block' && vis.fire === 'flex' && vis.st === 'playing', vis);

// stick: push up to the rim = run forward (sprint)
// face the most open direction (12 m+ of free ground), so walls don't cut the run short
const openYaw = () => ev(() => { const F = window.__frontline, P = F.G.player; let best = 0, bt = -1;
  for (let i = 0; i < 16; i++) { const y = i * Math.PI / 8, h = F.physics.rayWorld(P.x, P.y + 0.5, P.z, -Math.sin(y), 0, -Math.cos(y), 40); const t = h ? h.t : 40; if (t > bt) { bt = t; best = y; } }
  P.yaw = best; P.pitch = 0; return { x: P.x, z: P.z, yaw: best, free: bt }; });
const fwdOf = (a, b) => (a.x - b.x) * Math.sin(a.yaw) + (a.z - b.z) * Math.cos(a.yaw); // distance moved along the facing direction
// fixed stick (Brian, 2026-11-15): it stays in its corner; the thumb lands on it and pushes
const stickBox = () => ev(() => { const r = document.querySelector('.t-stick').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; });
const home = await stickBox();
const [sx, sy] = await center('.t-stick');
let a = await openYaw();
await down(1, sx, sy); await move(1, sx, sy - 30); await move(1, sx, sy - 64); await page.waitForFunction(() => window.__frontline.input.moveY > 0.95); await step(40);
const held = await stickBox();
let b = await ev(() => { const F = window.__frontline, P = F.G.player; return { x: P.x, z: P.z, sprint: P.sprinting, my: F.input.moveY, label: document.querySelector('.t-stick').classList.contains('sprint') }; });
await up(1); await step(30);
const fwd = fwdOf(a, b);
check('stick: moves forward', fwd > 3 && Math.hypot(b.x - a.x, b.z - a.z) - fwd < 0.5, { fwd, a, b });
check('stick: rim = sprint (with the SPRINT label)', b.sprint === true && b.my > 0.95 && b.label === true, b);
const rest = await ev(() => ({ my: window.__frontline.input.moveY, k: window.__frontline.input.keys.KeyW }));
check('stick: release stops', rest.my === 0 && !rest.k, rest);
check('stick: stays put while pushed and after', JSON.stringify(held) === JSON.stringify(home) && JSON.stringify(await stickBox()) === JSON.stringify(home), { home, held });
// a thumb landing just outside the ring still counts as the stick (pushes toward itself); the stick doesn't move there
await down(1, sx + 75, sy - 8); await step(2);
const side = await ev(() => ({ mx: window.__frontline.input.moveX, my: window.__frontline.input.moveY }));
const sideBox = await stickBox(); await up(1); await step(2);
check('stick: thumb just right of the ring = move right, stick stays', side.mx > 0.9 && Math.abs(side.my) < 0.3 && JSON.stringify(sideBox) === JSON.stringify(home), { side, sideBox, home });
// only the stick moves you (Brian, 2026-11-15): a left thumb anywhere else on the left side turns, like the right side
const mv = () => ev(() => { const F = window.__frontline, P = F.G.player; return { mx: F.input.moveX, my: F.input.moveY, yaw: P.yaw, pitch: P.pitch, x: P.x, z: P.z }; });
await step(30); // let the last push's walk stop
let m0 = await mv();
await down(1, 250, 120); for (let i = 1; i <= 4; i++) { await move(1, 250 + 25 * i, 120); await step(1); }
let m1 = await mv(); await up(1); await page.waitForTimeout(40); await step(2);
check('left side off the stick: drag turns, no walking', m0.yaw - m1.yaw > 0.2 && m1.mx === 0 && m1.my === 0 && Math.hypot(m1.x - m0.x, m1.z - m0.z) < 0.05, { m0, m1 });
// a touch keeps its job: starts on the stick and slides far off = still moving (and doesn't turn)
m0 = await mv();
await down(1, sx, sy); await move(1, sx + 60, sy - 120); await move(1, 300, 120); await step(2);
m1 = await mv(); await up(1); await step(2);
check('stick: sliding off the stick keeps moving, no turning', Math.hypot(m1.mx, m1.my) > 0.9 && Math.abs(m1.yaw - m0.yaw) < 0.01, { m0, m1 });
// starts off the stick and slides over it = still turning (no walking)
m0 = await mv();
await down(1, sx + 140, sy - 140); await move(1, sx + 60, sy - 60); await move(1, sx, sy); await step(2);
m1 = await mv(); await up(1); await page.waitForTimeout(40); await step(2);
check('left look sliding over the stick keeps turning, no walking', m1.mx === 0 && m1.my === 0 && Math.abs(m1.yaw - m0.yaw) > 0.1, { m0, m1 });
// half push walks slower
a = await openYaw();
await down(1, sx, sy); await move(1, sx, sy - 24); await page.waitForFunction(() => window.__frontline.input.moveY > 0.2); await step(40);
b = await ev(() => { const P = window.__frontline.G.player; return { x: P.x, z: P.z, sprint: P.sprinting }; }); await up(1); await step(30);
const half = fwdOf(a, b);
check('stick: half push = slower, no sprint', half > 0.5 && half < fwd * 0.7 && !b.sprint, { half, fwd, a });

// look: drag on the right side turns (no enemy near)
const look = async (dx) => { const y0 = await ev(() => window.__frontline.G.player.yaw); await down(2, 560, 200);
  for (let i = 1; i <= 4; i++) { await move(2, 560 + dx * i / 4, 200); await step(1); } await up(2); await page.waitForTimeout(40); await step(2); return y0 - await ev(() => window.__frontline.G.player.yaw); };
const turn = await look(100);
check('look: drag turns right', turn > 0.2 && turn < 0.5, turn);

// fire: hold = shoots; slide = still looks
const fire = await center('.t-fire');
const mag0 = await ev(() => { const P = window.__frontline.G.player; return P.ammo[P.weapons[P.slot]].mag; });
const yawF = await ev(() => window.__frontline.G.player.yaw);
await down(3, ...fire); await step(20); await move(3, fire[0] - 40, fire[1]); await step(20);
const fr = await ev(() => { const F = window.__frontline, P = F.G.player; return { mag: P.ammo[P.weapons[P.slot]].mag, fire: F.input.fire, yaw: P.yaw }; });
await up(3); await step(2);
check('fire: hold shoots', fr.mag < mag0 && fr.fire === true, { mag0, fr });
check('fire: slide aims', Math.abs(fr.yaw - yawF) > 0.05, { yawF, fr });
check('fire: release stops', await ev(() => window.__frontline.input.fire) === false);
// left thumb turns while the right thumb holds Fire (the reason for the change)
const magL = await ev(() => { const P = window.__frontline.G.player; return P.ammo[P.weapons[P.slot]].mag; });
m0 = await mv();
await down(3, ...fire); await down(1, 250, 140); for (let i = 1; i <= 4; i++) { await move(1, 250 - 20 * i, 140); await step(5); }
const both = await ev(() => { const F = window.__frontline, P = F.G.player; return { mag: P.ammo[P.weapons[P.slot]].mag, fire: F.input.fire, yaw: P.yaw }; });
await up(1); await up(3); await step(2);
check('left thumb turns while right thumb fires', both.mag < magL && both.fire === true && both.yaw - m0.yaw > 0.1, { magL, both, m0 });

// reload, aim, crouch, prone, jump, grenade, weapon, scoreboard
await tapAt(await center('.t-reload'));
check('reload', await ev(() => window.__frontline.G.player.reloadStart >= 0));
await step(200);
await tapAt(await center('.t-aim'));
check('aim: tap on', await ev(() => window.__frontline.input.aim === true));
await tapAt(await center('.t-aim'));
check('aim: tap off', await ev(() => window.__frontline.input.aim === false));
const cr = await center('.t-crouch');
await tapAt(cr); await step(10);
check('crouch: tap on', await ev(() => window.__frontline.G.player.crouch === true));
await tapAt(cr); await step(20);
check('crouch: tap off', await ev(() => window.__frontline.G.player.crouch === false));
await down(4, ...cr); await step(40); await up(4); await step(5);
check('crouch: hold = prone', await ev(() => window.__frontline.G.player.prone === true));
await tapAt(cr); await step(40);
check('crouch: tap stands up from prone', await ev(() => window.__frontline.G.player.prone === false));
await tapAt(await center('.t-jump'), 1);
check('jump', await ev(() => { const P = window.__frontline.G.player; return !P.grounded || P.vy > 0; }));
await step(90);
const n0 = await ev(() => window.__frontline.G.player.grenades);
const nade = await center('.t-nade');
await down(5, ...nade); await step(10);
const cook = await ev(() => window.__frontline.G.player.cookStart >= 0);
await up(5); await step(60);
check('grenade: hold cooks, release throws', cook && await ev(() => window.__frontline.G.player.grenades) === n0 - 1, { cook, n0 });
const s0 = await ev(() => window.__frontline.G.player.slot);
await tapAt(await center('.t-weapon')); await step(40);
check('weapon: tap switches', await ev(() => window.__frontline.G.player.slot) !== s0);
await down(6, ...(await center('.t-board'))); await step(2);
const bd = await ev(() => !document.getElementById('board').classList.contains('hidden'));
await up(6); await step(2);
check('scoreboard: hold shows', bd && await ev(() => document.getElementById('board').classList.contains('hidden')), bd);

// aim assist: slower turn while an enemy sits on the crosshair, normal with the setting off
// (enemy 20 m straight ahead; a short drag keeps the crosshair on it; step 4 frames so the 20 Hz check refreshes)
const placeEnemy = (assist) => ev((assist) => { const F = window.__frontline, G = F.G, P = G.player, e = G.bots.find((u) => u.team !== P.team);
  let yaw = 0, bt = -1; // the most open direction, so no wall sits between you and the enemy (cover turns the assist off)
  for (let i = 0; i < 16; i++) { const y = i * Math.PI / 8, h = F.physics.rayWorld(P.x, P.y + 1.4, P.z, -Math.sin(y), 0, -Math.cos(y), 40); const t = h ? h.t : 40; if (t > bt) { bt = t; yaw = y; } }
  const put = () => { e.x = P.x - Math.sin(yaw) * 20; e.z = P.z - Math.cos(yaw) * 20; e.y = P.y; };
  P.yaw = yaw; P.pitch = 0; put(); e.alive = true; G.profile.settings.aimAssist = assist; window.__step(4); put(); return bt; }, assist);
await placeEnemy(true); const tA = await look(12);
await placeEnemy(false); const tB = await look(12);
await ev(() => { window.__frontline.G.profile.settings.aimAssist = true; });
check('aim assist: slower over an enemy', tA > 0 && tA < tB * 0.75, { tA, tB });

// use: appears with a prompt
await ev(() => { document.getElementById('prompt').textContent = 'Pick up'; window.__step(10); });
const useVis = await ev(() => getComputedStyle(document.querySelector('.t-use')).display);
await ev(() => { document.getElementById('prompt').textContent = ''; window.__step(10); });
check('use: shows only with a prompt', useVis === 'flex' && await ev(() => getComputedStyle(document.querySelector('.t-use')).display) === 'none', useVis);

// kill cam (Brian 2026-11-16: it often didn't play): taps on the screen, the stick or Fire don't skip it; a tap on its
// banner does, after the first second
const kcShown = () => ev(() => !document.getElementById('killcam').classList.contains('hidden'));
const kcDie = async () => { await ev(() => { const F = window.__frontline, G = F.G, P = G.player; G.profile.settings.killcam = true;
  if (!P.alive) { let n = 0; while (G.state === 'dead' && n++ < 600) window.__step(1); }
  const P2 = G.player, kb = G.bots.find((q) => q.alive && q.team !== P2.team); kb.x = P2.x + 6; kb.z = P2.z; kb.y = P2.y; window.__step(20); P2.protectUntil = 0;
  F.damage(P2, 999, kb, { weapon: 'm4', sx: kb.x, sz: kb.z }); window.__step(45); }); };
await kcDie();
const kc0 = await kcShown();
const kcHint = await ev(() => document.querySelector('#killcam .kc-tag small').textContent);
await tapAt([700, 220]); await tapAt([150, 260]); await tapAt(await center('.t-fire'));
const kcKept = await kcShown();
await step(40);
const ban = await center('#killcam .kc-tag');
await tapAt(ban);
check('kill cam: plays, says tap here', kc0 && kcHint === 'Tap here to skip', { kc0, kcHint });
check('kill cam: screen, stick and Fire taps keep it', kcKept);
check('kill cam: a tap on the banner skips it', !(await kcShown()));
await ev(() => { const G = window.__frontline.G; let n = 0; while (G.state === 'dead' && n++ < 600) window.__step(1); });

// pause and resume without mouse lock
await tapAt(await center('.t-pause'));
const pz = await ev(() => ({ st: window.__frontline.G.state, pause: !document.getElementById('pause').classList.contains('hidden'), ui: getComputedStyle(document.getElementById('touchUI')).display,
  free: getComputedStyle(document.getElementById('freeLook')).display }));
check('pause: button pauses, controls hide', pz.st === 'paused' && pz.pause && pz.ui === 'none' && pz.free === 'none', pz);
await tapAt(await center('#resume')); await step(3);
check('resume: back in play without mouse lock', await ev(() => window.__frontline.G.state === 'playing' && getComputedStyle(document.getElementById('touchUI')).display === 'block'));

// full screen happened on deploy (the browser allowed it here); portrait: ask to turn the phone
check('deploy: full screen', await ev(() => !!document.fullscreenElement));
await ev(() => document.fullscreenElement && document.exitFullscreen()); await step(2);
await page.setViewportSize({ width: 412, height: 915 }); await step(2);
check('portrait: rotate message', await ev(() => getComputedStyle(document.getElementById('rotateMsg')).display === 'flex'));
await page.setViewportSize({ width: 915, height: 412 }); await step(2);
check('landscape: no rotate message', await ev(() => getComputedStyle(document.getElementById('rotateMsg')).display === 'none'));

errs.push(...errors);
await browser.close();
const ok = !fails.length && !errs.length;
console.log(fails.length ? 'failed: ' + fails.join(' | ') : '', errs.slice(0, 3).join(' | '), ok ? 'PASS touch' : 'FAIL touch');
process.exitCode = ok ? 0 : 1;
