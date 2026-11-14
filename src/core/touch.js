// Touch controls for phones and tablets (layout A, "thumb arc"): a move stick on the left, drag on the right to look,
// a big Fire button with Aim / Reload / Crouch / Jump / Grenade around it. Only built into the page's behaviour when
// input.touch is on (Settings > Touch controls: Auto = touch screens only); desktop play never runs any of this.
// Buttons press the player's bound keys and the mouse handlers, so every action goes through the same code as the
// keyboard (main.js onKeyDown / onKeyUp). Multiplayer sends state, not inputs, so touch and desktop players mix freely.
import { G, isLive } from './state.js';
import { input, binding } from './input.js';
import { WEAPONS } from './config.js';

const R = 52;             // stick travel (px)
const DEAD = 0.12;        // stick dead zone (share of R)
const LONG = 0.45;        // seconds: holding Crouch this long goes prone
const FAKE = { repeat: false, preventDefault() {}, stopPropagation() {} };
const ICON = {
  fire: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  crouch: '<path d="M7 6l5 5 5-5M7 13l5 5 5-5"/>',
  jump: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  nade: '<circle cx="12" cy="14" r="6"/><path d="M10 8V5h4v3M14 5h4"/>',
  use: '<path d="M8 12l3 3 5-6"/><circle cx="12" cy="12" r="9"/>',
  streak: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
};
const BUTTONS = [ // [role, label, class]
  ['fire', 'Fire'], ['aim', 'Aim'], ['reload', 'Reload'], ['crouch', 'Crouch'], ['jump', 'Jump'], ['nade', 'Grenade'],
  ['use', 'Use'], ['streak', 'Streak'], ['pause', ''],
];
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

let opts = null, root = null, stick = null, knob = null, playing = false, ctxT = 0;
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
    + '<div class="t-stick"><i class="t-knob"></i></div><div class="t-hit t-board" data-t="board"></div><div class="t-hit t-weapon" data-t="weapon"></div>'
    + BUTTONS.map(([r, l]) => `<div class="t-btn t-${r}" data-t="${r}">${svg(r)}${l ? `<small>${l}</small>` : ''}</div>`).join('');
  document.body.appendChild(root);
  stick = root.querySelector('.t-stick'); knob = root.querySelector('.t-knob');
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
  ptrs.set(e.pointerId, p);
  el.classList.add('down');
  press(p);
}
function onMove(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  e.preventDefault();
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (p.role === 'look' || p.role === 'fire') look(dx, dy);
  else if (p.role === 'move') stickTo(p);
}
function onUp(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  ptrs.delete(e.pointerId);
  p.el.classList.remove('down');
  release(p);
}

function look(dx, dy) {
  const s = G.profile.settings, k = (s.touchSens || 1.5) / (s.sens || 1); // independent of mouse sensitivity
  input.mdx += dx * k; input.mdy += dy * k;
}

function press(p) {
  const h = input.h, P = G.player, r = p.role;
  if (G.state === 'dead' || G.spectating) { // a tap skips the kill cam / changes who you watch; dragging still looks
    if (r === 'look' || r === 'move' || r === 'fire') { h.onMouseDown(0); if (r !== 'look') return; }
  }
  if (r === 'move') {
    const z = root.querySelector('.t-left').getBoundingClientRect();
    p.cx = Math.min(Math.max(p.x, z.left + R + 10), z.right - R - 10);
    p.cy = Math.min(Math.max(p.y, z.top + R + 60), z.bottom - R - 10);
    stick.classList.add('free'); stick.style.transform = `translate(${p.cx}px, ${p.cy}px)`;
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
  else if (r === 'board') keyDown('scoreboard');
  else if (r === 'weapon') opts.onCycle();
  else if (r === 'pause') opts.onPause();
}

function release(p) {
  const r = p.role, P = G.player;
  if (r === 'move') {
    input.moveX = input.moveY = 0;
    for (const a of ['forward', 'back', 'left', 'right', 'sprint']) setKey(a, false);
    stick.classList.remove('free'); stick.style.transform = ''; knob.style.transform = '';
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

function stickTo(p) {
  const dx = p.x - p.cx, dy = p.y - p.cy, d = Math.hypot(dx, dy);
  const m = Math.min(1, d / R), a = Math.atan2(dy, dx);
  knob.style.transform = `translate(${(Math.cos(a) * m * R).toFixed(1)}px, ${(Math.sin(a) * m * R).toFixed(1)}px)`;
  const mm = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
  input.moveX = mm ? Math.cos(a) * mm : 0; input.moveY = mm ? -Math.sin(a) * mm : 0;
  // keys too, for code that reads them (vehicles, ladders); pushing to the rim while heading forward = sprint
  setKey('forward', input.moveY > 0.35); setKey('back', input.moveY < -0.35);
  setKey('right', input.moveX > 0.35); setKey('left', input.moveX < -0.35);
  setKey('sprint', d >= R * 0.95 && input.moveY > 0.6);
}

function releaseAll() {
  for (const p of ptrs.values()) { p.el.classList.remove('down'); release(p); }
  ptrs.clear();
  input.fire = false; input.moveX = input.moveY = 0;
}

// Every frame: show the controls only during play, swap buttons for the situation, long-press Crouch = prone.
export function touchTick() {
  if (!input.touch || !root) return;
  const live = isLive() && !G.netPaused;
  if (live !== playing) { playing = live; document.body.classList.toggle('t-play', live); if (!live) releaseAll(); }
  if (!live) return;
  const P = G.player, alive = !!(P && P.alive) && !G.spectating && (G.state === 'playing' || G.state === 'deploy');
  for (const p of ptrs.values()) {
    if (p.role === 'crouch' && !p.long && alive && !P.vehicle && G.realTime - p.t0 > LONG) {
      p.long = true; keyUp('crouch'); if (!P.prone) tap('prone');
    }
  }
  if (G.realTime < ctxT && G.realTime > ctxT - 1) return;
  ctxT = G.realTime + 0.12;
  cls(root, 't-dead', !alive); cls(root, 't-veh', alive && !!P.vehicle);
  const prompt = document.getElementById('prompt'), ready = document.getElementById('streakReady');
  cls(btn.use, 'show', alive && (!!P.vehicle || !!(prompt && prompt.textContent.trim())));
  cls(btn.streak, 'show', alive && !!(ready && ready.textContent.trim()));
  cls(btn.aim, 'on', alive && input.aim);
  cls(btn.crouch, 'on', alive && (P.crouch || P.prone));
}
