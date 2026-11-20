// Spectator camera (multiplayer): follow any living player or bot. Click = next, right-click = previous,
// V = switch between their eyes and a chase camera. Humans are listed first.
import { G } from '../core/state.js';
import { input, consumeMouse } from '../core/input.js';
import { setListener } from '../engine/audio.js';
const lerp = (a, b, k) => a + (b - a) * k;
let cur = null;
const targets = () => G.units.filter((u) => u !== G.player && u.alive).sort((a, b) => (b.human || b.remote ? 1 : 0) - (a.human || a.remote ? 1 : 0) || a.id - b.id);
export function spectateCycle(d) { if (G.spectating) { G.spectating.i += d; G.spectating.free = false; cur = null; } }
// Brian (2026-11-20): F = free camera (fly around on your own: WASD, mouse to look, Space up, C down, Shift faster)
export function spectateToggleFree() { const sp = G.spectating; if (!sp) return; sp.free = !sp.free; if (sp.free) { const c = G.camera; sp.fx = c.position.x; sp.fy = c.position.y; sp.fz = c.position.z; sp.fyaw = c.rotation.y; sp.fpitch = 0; } cur = null; }
function freeStep(sp, dt, cam, el) {
  const [mx, my] = consumeMouse(), sens = 0.0022;
  sp.fyaw -= mx * sens; sp.fpitch = Math.max(-1.5, Math.min(1.5, sp.fpitch - my * sens));
  const k = input.keys, f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), u = (k.Space ? 1 : 0) - (k.KeyC || k.ControlLeft ? 1 : 0);
  const v = (k.ShiftLeft ? 22 : 9) * dt, sy = Math.sin(sp.fyaw), cy = Math.cos(sp.fyaw);
  sp.fx += (-sy * f + cy * s) * v; sp.fz += (-cy * f - sy * s) * v; sp.fy = Math.max(-20, Math.min(150, sp.fy + u * v));
  cam.position.set(sp.fx, sp.fy, sp.fz); cam.rotation.set(sp.fpitch, sp.fyaw, 0, 'YXZ');
  if (el) el.textContent = 'Free camera · WASD move · mouse look · Space up · C down · Shift faster · F or click: back to players';
  setListener(sp.fx, sp.fy, sp.fz, sp.fyaw);
}
export function spectateToggleView() { if (G.spectating) G.spectating.fp = !G.spectating.fp; }
export function spectateStep(dt) {
  const sp = G.spectating, list = targets(), cam = G.camera, el = document.getElementById('specTag');
  if (sp.free) { freeStep(sp, dt, cam, el); return; }
  if (!list.length) { if (el) el.textContent = 'Spectating · waiting for players'; return; }
  sp.i = ((sp.i % list.length) + list.length) % list.length;
  const t = list[sp.i];
  if (el) el.textContent = `Spectating ${t.name}${t.human || t.remote ? '' : ' (bot)'} · ${input.touch ? 'tap: next player' : `click or → : next · right-click or ← : previous · V: ${sp.fp ? 'chase cam' : 'their eyes'} · F: free camera`}`;
  const eye = t.y + 1.55 - (t.crouchT || 0) * 0.5;
  if (sp.fp) { // their eyes: a step in front of the face, or the camera sits inside the head and shows its back
    const yaw = t.yaw, pitch = t.aimPitch || t.pitch || 0, fwd = 0.38;
    cam.position.set(t.x - Math.sin(yaw) * fwd * Math.cos(pitch), eye + Math.sin(pitch) * fwd, t.z - Math.cos(yaw) * fwd * Math.cos(pitch)); cam.rotation.set(pitch, yaw, 0, 'YXZ'); }
  else {
    const want = { x: t.x + Math.sin(t.yaw) * 3.4, y: t.y + 2.2, z: t.z + Math.cos(t.yaw) * 3.4 }, k = cur ? 1 - Math.exp(-dt * 8) : 1;
    cur = cur || { ...want }; cur.x = lerp(cur.x, want.x, k); cur.y = lerp(cur.y, want.y, k); cur.z = lerp(cur.z, want.z, k);
    cam.position.set(cur.x, cur.y, cur.z); cam.lookAt(t.x, t.y + 1.3, t.z);
  }
  setListener(cam.position.x, cam.position.y, cam.position.z, t.yaw);
}
