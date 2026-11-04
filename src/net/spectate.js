// Spectator camera (multiplayer): follow any living player or bot. Click = next, right-click = previous,
// V = switch between their eyes and a chase camera. Humans are listed first.
import { G } from '../core/state.js';
import { setListener } from '../engine/audio.js';
const lerp = (a, b, k) => a + (b - a) * k;
let cur = null;
const targets = () => G.units.filter((u) => u !== G.player && u.alive).sort((a, b) => (b.human || b.remote ? 1 : 0) - (a.human || a.remote ? 1 : 0) || a.id - b.id);
export function spectateCycle(d) { if (G.spectating) { G.spectating.i += d; cur = null; } }
export function spectateToggleView() { if (G.spectating) G.spectating.fp = !G.spectating.fp; }
export function spectateStep(dt) {
  const sp = G.spectating, list = targets(), cam = G.camera, el = document.getElementById('specTag');
  if (!list.length) { if (el) el.textContent = 'Spectating · waiting for players'; return; }
  sp.i = ((sp.i % list.length) + list.length) % list.length;
  const t = list[sp.i];
  if (el) el.textContent = `Spectating ${t.name}${t.human || t.remote ? '' : ' (bot)'} · click: next · right-click: previous · V: ${sp.fp ? 'chase cam' : 'their eyes'}`;
  const eye = t.y + 1.55 - (t.crouchT || 0) * 0.5;
  if (sp.fp) { cam.position.set(t.x, eye, t.z); cam.rotation.set(t.aimPitch || t.pitch || 0, t.yaw, 0); }
  else {
    const want = { x: t.x + Math.sin(t.yaw) * 3.4, y: t.y + 2.2, z: t.z + Math.cos(t.yaw) * 3.4 }, k = cur ? 1 - Math.exp(-dt * 8) : 1;
    cur = cur || { ...want }; cur.x = lerp(cur.x, want.x, k); cur.y = lerp(cur.y, want.y, k); cur.z = lerp(cur.z, want.z, k);
    cam.position.set(cur.x, cur.y, cur.z); cam.lookAt(t.x, t.y + 1.3, t.z);
  }
  setListener(cam.position.x, cam.position.y, cam.position.z, t.yaw);
}
