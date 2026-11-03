export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
// Frame-rate independent exponential approach
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const dist3 = (ax, ay, az, bx, by, bz) => Math.hypot(ax - bx, ay - by, az - bz);
export const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (id) => document.getElementById(id);
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Random direction inside a cone around (dx,dy,dz), uniform over the disk. Writes into out.
export function coneDir(dx, dy, dz, angle, out) {
  if (angle <= 0) { out.x = dx; out.y = dy; out.z = dz; return out; }
  // build orthonormal basis
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.95) { ux = 1; uy = 0; }
  let rx = dy * uz - dz * uy, ry = dz * ux - dx * uz, rz = dx * uy - dy * ux;
  let rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  const vx = ry * dz - rz * dy, vy = rz * dx - rx * dz, vz = rx * dy - ry * dx;
  const r = Math.sqrt(Math.random()) * Math.tan(angle), a = Math.random() * Math.PI * 2;
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  out.x = dx + rx * ox + vx * oy; out.y = dy + ry * ox + vy * oy; out.z = dz + rz * ox + vz * oy;
  const l = Math.hypot(out.x, out.y, out.z) || 1; out.x /= l; out.y /= l; out.z /= l;
  return out;
}
