// Touch controls for phones and tablets (layout A, "thumb arc"): a fixed move stick bottom left, drag anywhere else to look,
// a big Fire button with Aim / Reload / Crouch / Jump / Grenade around it. Only built into the page's behaviour when
// input.touch is on (Settings > Touch controls: Auto = touch screens only); desktop play never runs any of this.
// Buttons press the player's bound keys and the mouse handlers, so every action goes through the same code as the
// keyboard (main.js onKeyDown / onKeyUp). Multiplayer sends state, not inputs, so touch and desktop players mix freely.
import { G, isLive } from './state.js';
import { input, binding } from './input.js';
import { WEAPONS, AUTO_FIRE } from './config.js';
import { enemyUnderCrosshair } from '../entities/aimassist.js';
import { killcamActive, skipKillcam, onKillcamBanner } from '../game/killcam.js';

const R = 52;             // stick travel (px)
const DEAD = 0.12;        // stick dead zone (share of R)
const SLACK = 30;         // px around the stick's ring that still count as the stick (a thumb that lands a bit off)
const LONG = 0.45;        // seconds: holding Crouch this long goes prone
const FAKE = { repeat: false, preventDefault() {}, stopPropagation() {} };
const ICON = {
  turn: '<path d="M5 12a7 7 0 1 0 2-5"/><path d="M5 3v5h5"/>',
  fire: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  crouch: '<path d="M7 6l5 5 5-5M7 13l5 5 5-5"/>',
  jump: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  nade: '<circle cx="12" cy="14" r="6"/><path d="M10 8V5h4v3M14 5h4"/>',
  use: '<path d="M8 12l3 3 5-6"/><circle cx="12" cy="12" r="9"/>',
  streak: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  equip: '<rect x="5" y="8" width="14" height="8" rx="1.5"/><path d="M8 16l-2 4M16 16l2 4M9 12h6"/>',
  armory: '<path d="M3 13h13l3-3h2M6 13v4h3l1-4M16 10V8"/>',
};
const BUTTONS = [ // [role, label, class]
  ['fire', 'Fire'], ['aim', 'Aim'], ['reload', 'Reload'], ['crouch', 'Crouch'], ['jump', 'Jump'], ['nade', 'Grenade'],
  ['use', 'Use'], ['streak', 'Streak'], ['pause', ''],
  ['equip', 'Equip'], ['armory', 'Weapons'], ['turn', '180°'], // turn: turn around (Brian picked A, 2026-11-16) // claymore (when carried); Sandbox / Range weapon menu (B on keyboards)
];
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

let opts = null, root = null, stick = null, knob = null, tip = null, playing = false, ctxT = 0, lastP = null, tipUntil = 0;
const btn = {};
const ptrs = new Map(); // pointerId -> { role, el, x, y, cx, cy, t0, long }
const cls = (el, c, on) => { if (el) el.classList.toggle(c, !!on); };

// Primary pointer is a finger (phones, tablets). A laptop with a touch screen keeps mouse play unless set to On.
export function touchCapable() { return (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window; }
export function wantTouch(s = G.profile.settings) {
  if (s.touch === 'on') return true;
  if (s.touch === 'off') return false;
  return touchCapable() && !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function keyDown(action) { const c = binding(action); if (!c) return; input.keys[c] = true; input.h.onKeyDown(c, FAKE); }
function keyUp(action) { const c = binding(action); if (!c) return; if (!input.keys[c]) return; input.keys[c] = false; input.h.onKeyUp(c, FAKE); }
function tap(action) { keyDown(action); keyUp(action); }
function setKey(action, on) { const c = binding(action); if (c) input.keys[c] = !!on; }

export function initTouch(o) {
  opts = o;
  root = document.createElement('div');
  root.id = 'touchUI'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<div class="t-zone t-left" data-t="move"></div><div class="t-zone t-right" data-t="look"></div>'
    + '<div class="t-stick"><i class="t-knob"></i></div><div class="t-tip">Push the stick all the way to the edge to sprint</div>'
    + '<div class="t-hit t-board" data-t="board"></div><div class="t-hit t-weapon" data-t="weapon"></div>'
    + BUTTONS.map(([r, l]) => `<div class="t-btn t-${r}" data-t="${r}">${svg(r)}${l ? `<small>${l}</small>` : ''}</div>`).join('');
  document.body.appendChild(root);
  stick = root.querySelector('.t-stick'); knob = root.querySelector('.t-knob'); tip = root.querySelector('.t-tip');
  for (const [r] of BUTTONS) btn[r] = root.querySelector('.t-' + r);
  const rot = document.createElement('div');
  rot.id = 'rotateMsg';
  rot.innerHTML = '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M3 9a9 9 0 0 1 3-5M21 15a9 9 0 0 1-3 5"/></svg>'
    + '<b>Turn your phone sideways to play</b><button id="rotateFull" class="btn-primary" type="button">Play full screen</button>';
  document.body.appendChild(rot);
  rot.querySelector('#rotateFull').addEventListener('click', goFullscreen);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  setTouch(wantTouch());
}

export function setTouch(on) {
  input.touch = !!on;
  document.body.classList.toggle('touch', input.touch);
  if (!input.touch) { releaseAll(); playing = false; document.body.classList.remove('t-play'); }
}

// Full screen + landscape where the browser allows it (Android Chrome); iPhone Safari plays in the normal window.
export function goFullscreen() {
  if (!input.touch) return;
  const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } };
  try {
    const d = document.documentElement;
    if (document.fullscreenElement || !d.requestFullscreen) { lock(); return; }
    const p = d.requestFullscreen({ navigationUI: 'hide' });
    if (p && p.then) p.then(lock, () => {});
  } catch (e) { /* needs a tap first, or not supported */ }
}

function onDown(e) {
  if (!input.touch) return;
  const el = e.target.closest && e.target.closest('[data-t]');
  if (!el) return;
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  const p = { role: el.dataset.t, el, x: e.clientX, y: e.clientY, cx: 0, cy: 0, t0: G.realTime, long: false };
  // Only the stick moves you (Brian, 2026-11-15): a left thumb anywhere else on the left side turns, like the right side,
  // which leaves the right thumb free for Fire. A touch keeps its job until it lifts (slide off the stick = still moving).
  if (p.role === 'move' && !onStick(p.x, p.y)) p.role = 'look';
  ptrs.set(e.pointerId, p);
  el.classList.add('down');
  const P = G.player;
  // Tap vs swipe (Brian, 2026-11-16): action buttons act when the thumb lifts; a swipe that starts on one turns instead.
  if (DEFER.has(p.role) && P && P.alive && !P.vehicle && G.state === 'playing' && !killcamActive()) {
    p.wait = true; p.sx = p.x; p.sy = p.y; return;
  }
  press(p);
}
const DEFER = new Set(['aim', 'reload', 'jump', 'crouch', 'nade', 'use', 'streak', 'equip', 'armory', 'turn']);
function onMove(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  e.preventDefault();
  if (p.wait) {
    const tx = e.clientX - p.sx, ty = e.clientY - p.sy;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(tx, ty) < AUTO_FIRE.swipe) return;
    p.wait = false; p.role = 'look'; p.moved = AUTO_FIRE.swipe; p.el.classList.remove('down');
    look(tx, ty); return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  p.moved = (p.moved || 0) + Math.hypot(dx, dy);
  if (p.role === 'look' || p.role === 'fire') look(dx, dy);
  else if (p.role === 'move') stickTo(p);
}
function onUp(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  ptrs.delete(e.pointerId);
  p.el.classList.remove('down');
  if (p.wait) { p.wait = false; press(p); } // a tap: act now
  release(p);
  const P = G.player;
  // double tap to fire (Brian, 2026-11-19): the second of two quick taps shoots
  const quick = p.role === 'look' && (p.moved || 0) < AUTO_FIRE.swipe && G.realTime - p.t0 < AUTO_FIRE.tapFire;
  let dbl = false;
  if (quick && G.profile.settings.dblFire) { dbl = G.realTime - lastTapAt < 0.35; lastTapAt = dbl ? -9 : G.realTime; }
  if (quick && (G.profile.settings.tapFire || dbl)
    && P && P.alive && !P.vehicle && G.state === 'playing' && !G.spectating && !killcamActive()) {
    tapShotUntil = G.realTime + AUTO_FIRE.tapShot; input.fire = true; input.h.onMouseDown(0);
  }
}

let lastTapAt = -9;
function look(dx, dy) {
  const s = G.profile.settings, F = AUTO_FIRE, m = Math.hypot(dx, dy);
  // quick swipes turn faster (up to 2x), so a half turn doesn't take a long thumb drag; slow drags stay precise
  const k = (s.touchSens || 1.5) / (s.sens || 1) * (1 + (F.flickMax - 1) * Math.min(1, Math.max(0, (m - F.flick) / F.flickSpan)));
  input.mdx += dx * k; input.mdy += dy * k;
}

function press(p) {
  const h = input.h, P = G.player, r = p.role;
  if (killcamActive() || G.state === 'finale') { // a replay: only a tap on its banner skips it (Brian, 2026-11-16)
    if (onKillcamBanner(p.x, p.y)) skipKillcam();
    return;
  }
  if (G.state === 'dead' || G.spectating) { // a tap changes who you watch; dragging still looks
    if (r === 'look' || r === 'move' || r === 'fire') { h.onMouseDown(0); if (r !== 'look') return; }
  }
  if (r === 'move') {
    // Fixed stick (Brian, 2026-11-15): it stays in its corner instead of jumping to where the thumb lands; the knob points
    // from the stick's centre toward the thumb.
    const s = stick.getBoundingClientRect();
    p.cx = s.left + s.width / 2; p.cy = s.top + s.height / 2;
    stickTo(p);
  } else if (r === 'fire') { input.fire = true; h.onMouseDown(0); }
  else if (r === 'aim') {
    if (!P || !P.alive) return;
    const w = WEAPONS[P.weapons && P.weapons[P.slot]];
    if (w && w.melee) h.onMouseDown(2); else if (h.onAimToggle) h.onAimToggle();
  }
  else if (r === 'reload') tap('reload');
  else if (r === 'jump') keyDown('jump');
  else if (r === 'crouch') { if (P && P.vehicle) keyDown('crouch'); }
  else if (r === 'nade') keyDown('grenade');
  else if (r === 'use') tap('interact');
  else if (r === 'streak') tap('streak');
  else if (r === 'equip') tap('equip');
  else if (r === 'armory') tap('armory');
  else if (r === 'board') keyDown('scoreboard');
  else if (r === 'weapon') opts.onCycle();
  else if (r === 'pause') opts.onPause();
  else if (r === 'turn') { if (P && P.alive && !P.vehicle) turnLeft = Math.PI; }
}

function release(p) {
  const r = p.role, P = G.player;
  if (r === 'move') {
    input.moveX = input.moveY = 0;
    for (const a of ['forward', 'back', 'left', 'right', 'sprint']) setKey(a, false);
    stick.classList.remove('sprint'); knob.style.transform = '';
  } else if (r === 'fire') { if (![...ptrs.values()].some((q) => q.role === 'fire')) input.fire = false; }
  else if (r === 'jump') keyUp('jump');
  else if (r === 'crouch') {
    if (P && P.vehicle) keyUp('crouch');
    else if (!p.long && P && P.alive) { // tap: crouch on / off (or stand up from prone)
      if (P.prone) tap('prone');
      else if (input.keys[binding('crouch')]) keyUp('crouch'); else keyDown('crouch');
    }
  }
  else if (r === 'nade') keyUp('grenade');
  else if (r === 'board') keyUp('scoreboard');
}

function onStick(x, y) {
  const s = stick.getBoundingClientRect();
  return s.width > 0 && Math.hypot(x - (s.left + s.width / 2), y - (s.top + s.height / 2)) <= s.width / 2 + SLACK;
}

function stickTo(p) {
  const dx = p.x - p.cx, dy = p.y - p.cy, d = Math.hypot(dx, dy);
  const m = Math.min(1, d / R), a = Math.atan2(dy, dx);
  knob.style.transform = `translate(${(Math.cos(a) * m * R).toFixed(1)}px, ${(Math.sin(a) * m * R).toFixed(1)}px)`;
  const mm = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
  input.moveX = mm ? Math.cos(a) * mm : 0; input.moveY = mm ? -Math.sin(a) * mm : 0;
  // keys too, for code that reads them (vehicles, ladders); pushing to the rim while heading forward = sprint
  setKey('forward', input.moveY > 0.35); setKey('back', input.moveY < -0.35);
  setKey('right', input.moveX > 0.35); setKey('left', input.moveX < -0.35);
  const sprint = d >= R * 0.95 && input.moveY > 0.6;
  setKey('sprint', sprint);
  stick.classList.toggle('sprint', sprint); // brass rim + "SPRINT" label, so players can see where sprint is
  if (sprint) tipUntil = 0;
}

function releaseAll() {
  for (const p of ptrs.values()) { p.el.classList.remove('down'); if (!p.wait) release(p); }
  ptrs.clear();
  input.fire = false; input.moveX = input.moveY = 0;
}

// Every frame: show the controls only during play, swap buttons for the situation, long-press Crouch = prone.
// Auto-fire (phones; Settings switch, on by default): holds the trigger while an enemy is under the crosshair (single-shot
// guns get a fresh pull each frame); the Fire button still works and takes over while pressed.
let turnLeft = 0, lastTick = 0, autoOn = false, autoPulse = false, tapShotUntil = 0;
// Auto-fire only reaches as far as the gun still does real damage (minDmg of full; more for shotguns), at most `range` m.
export function autoReach(w) {
  const F = AUTO_FIRE;
  if (!w.falloff) return Math.min(F.range, w.range || F.range);
  const [f0, f1, mn] = w.falloff, want = (w.pellets || 1) > 1 ? F.minDmgPellets : F.minDmg;
  return Math.min(F.range, mn >= want ? f1 : f0 + (f1 - f0) * (1 - want) / (1 - mn));
}
function autoFire(P, alive) {
  const s = G.profile.settings, w = alive && P.weapons ? WEAPONS[P.weapons[P.slot]] : null;
  const manual = [...ptrs.values()].some((q) => q.role === 'fire');
  const reach = w ? autoReach(w) : 0;
  // Brian (2026-11-16): never auto-fire through a scope (the Mk 14 / Barrett kick threw his aim off every shot); you
  // fire scoped shots yourself. Unzoomed it still helps. Semi-auto guns also wait for the last kick to settle, so
  // each auto shot lands where you aim instead of climbing (pistols, shotguns, marksman rifles).
  const scoped = w && w.scope && P.adsT > 0.3;
  const settled = !w || w.auto || !w.recoil || Math.abs(P.recoilP) < w.recoil.v * 0.65 * AUTO_FIRE.settle;
  // Brian (2026-11-19): optional sniper auto-fire (off by default) lifts both the sniper skip and the scope rule
  const sniperOk = s.sniperAuto && /sniper/i.test(w ? w.cls || '' : '');
  const want = !!(s.autoFire && w && !manual && !w.melee && (!scoped || s.sniperAuto) && (sniperOk || !AUTO_FIRE.skip.test(w.cls || '')) && G.state === 'playing' && !P.vehicle && enemyUnderCrosshair(P, reach));
  if (want && !settled) { input.fire = false; autoPulse = false; autoOn = true; cls(btn.fire, 'auto', true); return; }
  if (want) { autoPulse = w.auto ? true : !autoPulse; input.fire = autoPulse; autoOn = true; }
  else if (autoOn) { if (!manual) input.fire = false; autoOn = false; }
  cls(btn.fire, 'auto', want);
}

export function touchTick() {
  if (!input.touch || !root) return;
  const live = isLive() && !G.netPaused;
  if (live !== playing) { playing = live; document.body.classList.toggle('t-play', live); if (!live) releaseAll(); }
  if (!live) return;
  const P = G.player, alive = !!(P && P.alive) && !G.spectating && (G.state === 'playing' || G.state === 'deploy');
  if (P && P !== lastP) { // a new match (or respawn): the sprint tip shows for the first few matches on this device
    lastP = P; const s = G.profile.settings;
    if (G.state === 'deploy' && (s.touchTipN || 0) < 3) { s.touchTipN = (s.touchTipN || 0) + 1; tipUntil = G.realTime + 8; }
  }
  cls(tip, 'show', alive && G.realTime < tipUntil);
  const now = G.realTime, dt = Math.min(0.05, Math.max(0, now - (lastTick || now))); lastTick = now;
  if (turnLeft > 0 && alive && !P.vehicle) { const st = Math.min(turnLeft, dt * Math.PI / AUTO_FIRE.turn); P.yaw += st; turnLeft -= st; } else turnLeft = 0;
  if (tapShotUntil && G.realTime > tapShotUntil) { tapShotUntil = 0; if (!autoOn && ![...ptrs.values()].some((q) => q.role === 'fire')) input.fire = false; }
  autoFire(P, alive);
  for (const p of ptrs.values()) {
    if (p.role === 'crouch' && !p.long && alive && !P.vehicle && G.realTime - p.t0 > LONG) {
      p.long = true; p.wait = false; keyUp('crouch'); if (!P.prone) tap('prone');
    }
    if (p.wait && p.role === 'nade' && G.realTime - p.t0 > AUTO_FIRE.nadeHold) { p.wait = false; press(p); } // held still: cook
  }
  if (G.realTime < ctxT && G.realTime > ctxT - 1) return;
  ctxT = G.realTime + 0.12;
  cls(root, 't-dead', !alive); cls(root, 't-veh', alive && !!P.vehicle);
  const prompt = document.getElementById('prompt'), ready = document.getElementById('streakReady');
  cls(btn.use, 'show', alive && (!!P.vehicle || !!(prompt && prompt.textContent.trim())));
  cls(btn.streak, 'show', alive && !!(ready && ready.textContent.trim()));
  cls(btn.equip, 'show', alive && !P.vehicle && P.equip === 'claymore' && P.equipLeft > 0);
  cls(btn.armory, 'show', alive && !P.vehicle && !!G.match && (G.match.mode === 'sandbox' || G.match.mode === 'range'));
  cls(btn.aim, 'on', alive && input.aim);
  cls(btn.crouch, 'on', alive && (P.crouch || P.prone));
  const fl = btn.fire && btn.fire.querySelector('small'); if (fl) fl.textContent = G.profile.settings.autoFire ? 'Auto' : 'Fire';
}
