import { G } from './state.js';

export const input = {
  keys: Object.create(null), mdx: 0, mdy: 0, fire: false, aim: false,
  freeLook: false, capture: null, h: null, canvas: null,
};

const ALIASES = { sprint: ['ShiftRight'], crouch: [], crouchAlt: ['ControlRight'] };

export function binding(action) { return G.profile.settings.keys[action]; }
export function down(action) {
  if (input.keys[binding(action)]) return true;
  const al = ALIASES[action];
  if (al) for (const c of al) if (input.keys[c]) return true;
  return false;
}
export function matches(action, code) { return binding(action) === code || (ALIASES[action] || []).includes(code); }
export const isLocked = () => document.pointerLockElement === input.canvas;
export const lookActive = () => isLocked() || input.freeLook;

export function requestLock() {
  const c = input.canvas;
  const fail = () => input.h && input.h.onLockError();
  const plain = () => { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(fail); } catch (e) { fail(); } };
  try {
    const p = c.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotSupportedError') plain(); else fail(); });
  } catch (e) { plain(); }
}
export function exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

export function initInput(canvas, handlers) {
  input.canvas = canvas; input.h = handlers;
  window.addEventListener('keydown', (e) => {
    if (input.capture) { e.preventDefault(); e.stopPropagation(); input.capture(e.code); return; }
    if (e.ctrlKey && input.h.inGame() && ['KeyS', 'KeyD', 'KeyF', 'KeyA', 'KeyP', 'KeyR', 'KeyG', 'KeyQ', 'KeyE', 'KeyH', 'KeyJ', 'KeyU'].includes(e.code)) e.preventDefault();
    input.keys[e.code] = true;
    handlers.onKeyDown(e.code, e);
  });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; handlers.onKeyUp(e.code, e); });
  window.addEventListener('blur', () => { input.keys = Object.create(null); input.fire = false; input.aim = false; handlers.onBlur && handlers.onBlur(); });
  document.addEventListener('mousemove', (e) => {
    if (!lookActive()) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (Math.abs(dx) > 450 || Math.abs(dy) > 450) return; // drop spikes some browsers emit on lock
    input.mdx += dx; input.mdy += dy;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!lookActive()) { handlers.onCanvasClick && handlers.onCanvasClick(); return; }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.aim = true;
    handlers.onMouseDown(e.button);
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.aim = false;
    handlers.onMouseUp && handlers.onMouseUp(e.button);
  });
  canvas.addEventListener('wheel', (e) => { if (lookActive()) { e.preventDefault(); handlers.onWheel(Math.sign(e.deltaY)); } }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (handlers.inGame()) e.preventDefault(); });
  document.addEventListener('pointerlockchange', () => handlers.onLockChange(isLocked()));
  document.addEventListener('pointerlockerror', () => handlers.onLockError());
}

export function consumeMouse() { const r = [input.mdx, input.mdy]; input.mdx = 0; input.mdy = 0; return r; }
export function clearInput() { input.keys = Object.create(null); input.fire = false; input.aim = false; input.mdx = input.mdy = 0; }
