import * as THREE from 'three';

export function crate(b, x, z, s = 2.6, h = 2.4, y0 = 0, mat = 'wood') {
  b.solid(x, y0, z, s, h, s, mat);
  // frame trim
  const t = 0.12, e = s / 2 + 0.015;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.deco(x + sx * (s / 2 - t / 2 + 0.01), y0, z + sz * (s / 2 - t / 2 + 0.01), t + 0.02, h, t + 0.02, 'woodDark');
  b.deco(x, y0 + h - 0.06, z, s + 0.04, 0.12, s + 0.04, 'woodDark');
  b.deco(x, y0 + h * 0.48, z - e, s, 0.1, 0.03, 'woodDark');
  b.deco(x, y0 + h * 0.48, z + e, s, 0.1, 0.03, 'woodDark');
}

export function barrier(b, x, z, len = 6, alongZ = false) {
  const w = alongZ ? 0.85 : len, d = alongZ ? len : 0.85;
  b.solid(x, 0, z, w, 1.25, d, 'concrete');
  b.deco(x, 0, z, alongZ ? 1.05 : len, 0.32, alongZ ? len : 1.05, 'concreteDark');
  const n = Math.max(2, Math.round(len / 2));
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + (i + 0.5) * (len / n);
    b.deco(x + (alongZ ? 0 : o), 1.25, z + (alongZ ? o : 0), alongZ ? 0.9 : 0.06, 0.02, alongZ ? 0.06 : 0.9, 'black');
  }
  b.deco(x, 0.75, z, alongZ ? 0.88 : len * 0.98, 0.14, alongZ ? len * 0.98 : 0.88, 'hazard');
}

// Stacked sandbag wall, ~1.05 high, collider merged into one box
export function sandbags(b, x, z, len = 4, alongZ = false, y0 = 0) {
  const rows = 3, bagL = 0.8, bagH = 0.36, n = Math.max(2, Math.round(len / bagL));
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bagL / 2, count = n - (r % 2);
    for (let i = 0; i < count; i++) {
      const o = -len / 2 + bagL / 2 + off + i * (len - bagL) / Math.max(1, n - 1);
      const jit = ((i * 7 + r * 3) % 5 - 2) * 0.03;
      b.deco(x + (alongZ ? jit : o), y0 + r * (bagH - 0.02), z + (alongZ ? o : jit), alongZ ? 0.55 : bagL * 0.96, bagH, alongZ ? bagL * 0.96 : 0.55, 'sand', { rot: jit });
    }
  }
  b.col(x, y0, z, alongZ ? 0.6 : len, rows * (bagH - 0.02), alongZ ? len : 0.6, 'sand');
}

export function barrel(b, x, z, y0 = 0, mat = 'metal') {
  b.geom(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 12), mat, x, y0 + 0.475, z);
  b.geom(new THREE.CylinderGeometry(0.345, 0.345, 0.05, 12), 'black', x, y0 + 0.3, z);
  b.geom(new THREE.CylinderGeometry(0.345, 0.345, 0.05, 12), 'black', x, y0 + 0.66, z);
  b.col(x, y0, z, 0.62, 0.95, 0.62, 'metal');
}

export function container(b, x, z, w, d, mat, y0 = 0, h = 2.9) {
  b.solid(x, y0, z, w, h, d, mat);
  const alongX = w > d;
  // corner posts and top rails
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.deco(x + sx * (w / 2 - 0.08), y0, z + sz * (d / 2 - 0.08), 0.2, h + 0.02, 0.2, 'metalDark');
  b.deco(x, y0 + h - 0.05, z, w + 0.04, 0.12, d + 0.04, 'metalDark');
  b.deco(x, y0, z, w + 0.04, 0.14, d + 0.04, 'metalDark');
  // door end with locking bars
  const ex = alongX ? x + w / 2 + 0.03 : x, ez = alongX ? z : z + d / 2 + 0.03;
  for (let i = -1; i <= 1; i += 2) for (let k = 0; k < 2; k++) {
    const off = i * (k ? 0.35 : 0.85);
    b.deco(alongX ? ex : ex + off, y0 + 0.2, alongX ? ez + off : ez, alongX ? 0.05 : 0.06, h - 0.4, alongX ? 0.06 : 0.05, 'black');
  }
}

// Wall running along X at fixed z, from x0 to x1. gaps: [{a, b, top (door lintel height) | win:[y0,y1]}]
export function wallX(b, x0, x1, z, h, t, mat, gaps = [], y0 = 0) {
  let cur = x0;
  const sorted = [...gaps].sort((p, q) => p.a - q.a);
  for (const g of sorted) {
    if (g.a > cur) b.solid((cur + g.a) / 2, y0, z, g.a - cur, h, t, mat);
    const w = g.b - g.a, cx = (g.a + g.b) / 2;
    if (g.win) { b.solid(cx, y0, z, w, g.win[0], t, mat); b.solid(cx, y0 + g.win[1], z, w, h - g.win[1], t, mat); b.deco(cx, y0 + g.win[0] - 0.06, z, w + 0.2, 0.08, t + 0.12, 'adobeTrim'); }
    else if (g.top && g.top < h) { b.solid(cx, y0 + g.top, z, w, h - g.top, t, mat); b.deco(cx, y0 + g.top - 0.1, z, w + 0.3, 0.12, t + 0.08, 'woodDark'); }
    cur = g.b;
  }
  if (x1 > cur) b.solid((cur + x1) / 2, y0, z, x1 - cur, h, t, mat);
}
export function wallZ(b, z0, z1, x, h, t, mat, gaps = [], y0 = 0) {
  let cur = z0;
  const sorted = [...gaps].sort((p, q) => p.a - q.a);
  for (const g of sorted) {
    if (g.a > cur) b.solid(x, y0, (cur + g.a) / 2, t, h, g.a - cur, mat);
    const w = g.b - g.a, cz = (g.a + g.b) / 2;
    if (g.win) { b.solid(x, y0, cz, t, g.win[0], w, mat); b.solid(x, y0 + g.win[1], cz, t, h - g.win[1], w, mat); b.deco(x, y0 + g.win[0] - 0.06, cz, t + 0.12, 0.08, w + 0.2, 'adobeTrim'); }
    else if (g.top && g.top < h) { b.solid(x, y0 + g.top, cz, t, h - g.top, w, mat); b.deco(x, y0 + g.top - 0.1, cz, t + 0.08, 0.12, w + 0.3, 'woodDark'); }
    cur = g.b;
  }
  if (z1 > cur) b.solid(x, y0, (cur + z1) / 2, t, h, z1 - cur, mat);
}

// Pipe railing: blocks movement, lets bullets through
export function railX(b, x0, x1, z, y0, h = 1.0) {
  b.col((x0 + x1) / 2, y0, z, x1 - x0, h, 0.12, 'metal', { pass: true });
  b.deco((x0 + x1) / 2, y0 + h - 0.05, z, x1 - x0, 0.06, 0.06, 'black');
  b.deco((x0 + x1) / 2, y0 + h * 0.5, z, x1 - x0, 0.05, 0.05, 'black');
  for (let x = x0; x <= x1 + 0.01; x += 1.5) b.deco(Math.min(x, x1), y0, z, 0.06, h, 0.06, 'black');
}
export function railZ(b, z0, z1, x, y0, h = 1.0) {
  b.col(x, y0, (z0 + z1) / 2, 0.12, h, z1 - z0, 'metal', { pass: true });
  b.deco(x, y0 + h - 0.05, (z0 + z1) / 2, 0.06, 0.06, z1 - z0, 'black');
  b.deco(x, y0 + h * 0.5, (z0 + z1) / 2, 0.05, 0.05, z1 - z0, 'black');
  for (let z = z0; z <= z1 + 0.01; z += 1.5) b.deco(x, y0, Math.min(z, z1), 0.06, h, 0.06, 'black');
}

export function palm(b, x, z, h = 5.5, lean = 0.12, seed = 1) {
  const ang = seed * 2.1;
  const tx = x + Math.cos(ang) * lean * h, tz = z + Math.sin(ang) * lean * h;
  b.geom(new THREE.CylinderGeometry(0.13, 0.2, h, 7), 'trunk', (x + tx) / 2, h / 2, (z + tz) / 2, Math.sin(ang) * lean, 0, -Math.cos(ang) * lean);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + seed;
    b.geom(new THREE.BoxGeometry(0.5, 0.03, 2.6), 'leaf', tx + Math.cos(a) * 1.1, h - 0.15, tz + Math.sin(a) * 1.1, 0.35, -a + Math.PI / 2, 0);
  }
  b.col(x, 0, z, 0.36, h * 0.9, 0.36, 'wood');
}

export function lampPost(b, x, z, h = 9) {
  b.solid(x, 0, z, 0.26, h, 0.26, 'metalDark');
  b.deco(x, h, z, 1.1, 0.32, 0.7, 'black');
  b.deco(x, h - 0.06, z, 0.95, 0.08, 0.55, 'lamp');
}
