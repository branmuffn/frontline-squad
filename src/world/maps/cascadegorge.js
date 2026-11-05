import * as THREE from 'three';
import { crate, railX, railZ } from './props.js';

// Cascade Gorge: two forested plateau bases (top at 8 m) facing each other across a canyon,
// joined by a steel railway bridge carrying a stalled freight train. Stone stairs and ladders
// lead down to a lower canyon with a gravel road and a wadeable creek.
const H = 8;
// "r" runs along each canyon wall, positive = to your right when you face that wall from the canyon (west wall: -z, east wall: +z)
const zOf = (sx, r) => -sx * r, wallX = (sx, d) => sx * (20 - d); // d = metres out from the cliff face into the canyon
const SLIDES = [], BUSHES = [], KEEP_OUT = [];
for (const sx of [-1, 1]) {
  for (const [r0, r1, run, brake] of [[13, 17, 8, true], [17, 24, 4, false], [24, 28.5, 8, true]]) {
    const za = zOf(sx, r0), zb = zOf(sx, r1), xa = wallX(sx, 0), xb = wallX(sx, run);
    SLIDES.push({ minX: Math.min(xa, xb), maxX: Math.max(xa, xb), minZ: Math.min(za, zb), maxZ: Math.max(za, zb), axis: 'x', from: sx < 0 ? H : 0, to: sx < 0 ? 0 : H, brake });
  }
  KEEP_OUT.push([Math.min(wallX(sx, 0), wallX(sx, 9.5)), Math.max(wallX(sx, 0), wallX(sx, 9.5)), Math.min(zOf(sx, 2.5), zOf(sx, 29)), Math.max(zOf(sx, 2.5), zOf(sx, 29))]);
  KEEP_OUT.push([Math.min(wallX(sx, 0), wallX(sx, 4.5)), Math.max(wallX(sx, 0), wallX(sx, 4.5)), Math.min(zOf(sx, -3), zOf(sx, -28)), Math.max(zOf(sx, -3), zOf(sx, -28))]);
  for (const [d, r, s] of [[5.5, -9, 0.8], [6.5, -13.5, 0.95], [5.2, -17, 0.75], [7.5, -20.5, 0.9], [5.8, -24.5, 0.85], [9.5, -15.5, 0.7], [10, -22.5, 0.8]]) BUSHES.push({ x: wallX(sx, d), z: zOf(sx, r), r: 1.15 * s, s });
}
const kept = (x, z) => !KEEP_OUT.some(([a, b, c, d]) => x > a - 1.5 && x < b + 1.5 && z > c - 1.5 && z < d + 1.5);

// Right of the train: metal zig-zag stairs (three flights, two lanes), top landing level with the plateau.
// Further right: slide chutes. Left of the train: staggered rock ledges (0.89 m drops: walk down, jump up).
function cliffRoutes(b, sx) {
  const lane = (d0, d1) => [Math.min(wallX(sx, d0), wallX(sx, d1)), Math.max(wallX(sx, d0), wallX(sx, d1))];
  const IN = lane(0, 1.3), OUT = lane(1.3, 2.6), BOTH = lane(0, 2.6), rr = (a, c) => [Math.min(zOf(sx, a), zOf(sx, c)), Math.max(zOf(sx, a), zOf(sx, c))];
  // one flight = a floating ramp (so flights stacked above each other stay walkable) with steel treads on top
  const flight = (L, ra, rb, ya, yb) => {
    const [z0, z1] = rr(ra, rb), first = zOf(sx, ra) === z0, y0 = first ? ya : yb, y1 = first ? yb : ya;
    b.ramp(L[0], L[1], z0, z1, 'z', y0, y1, 'steel', Math.max(0, Math.min(ya, yb) - 0.3));
    for (let i = 0; i < 10; i++) { const t = (i + 0.5) / 10; b.deco((L[0] + L[1]) / 2, y0 + (y1 - y0) * t - 0.02, z0 + (z1 - z0) * t, L[1] - L[0] - 0.1, 0.06, (z1 - z0) / 10 * 0.7, 'steelRust'); }
  };
  const third = H / 3;
  flight(IN, 5, 10.5, 0, third); flight(OUT, 10.5, 5, third, 2 * third); flight(IN, 5, 10.5, 2 * third, H);
  for (const [ra, rb, y] of [[10.5, 12.1, third], [3.4, 5, 2 * third], [10.5, 12.1, H]]) { const [z0, z1] = rr(ra, rb); b.solid((BOTH[0] + BOTH[1]) / 2, y - 0.14, (z0 + z1) / 2, 2.6, 0.14, z1 - z0, 'steel'); }
  for (const [ra, y] of [[10.5, third], [3.4, 2 * third], [10.5, H]]) for (let k = 0; k < 4; k++) b.deco(wallX(sx, 2.55), y - 3.2 + k * 0.01, zOf(sx, ra + (ra > 6 ? 1.6 : 0) - k * 0.5), 0.08, 3.2, 0.08, 'steelRust'); // support posts
  { const [z0, z1] = rr(3.4, 12.1), xo = wallX(sx, 2.66); b.col(xo, 0, (z0 + z1) / 2, 0.1, H + 1.0, z1 - z0, 'metal', { pass: true });
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 6) b.deco(xo, 0, z, 0.06, H + 1.0, 0.06, 'steelRust');
    for (const [ra, y] of [[12.1, third], [3.4, 2 * third], [12.1, H]]) { const zc = zOf(sx, ra), xa = wallX(sx, 1.3); b.col(xa, y, zc, 2.6, 1.0, 0.1, 'metal', { pass: true }); b.deco(xa, y + 0.95, zc, 2.6, 0.06, 0.07, 'steelRust'); b.deco(xa, y + 0.5, zc, 2.6, 0.05, 0.05, 'steelRust'); } }
  for (const y of [third, 2 * third, H]) { const [z0, z1] = rr(3.4, 12.1); b.deco(wallX(sx, 2.62), y + 0.95, (z0 + z1) / 2, 0.07, 0.06, z1 - z0, 'steelRust'); b.deco(wallX(sx, 2.62), y + 0.5, (z0 + z1) / 2, 0.05, 0.04, z1 - z0, 'steelRust'); for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 6) b.deco(wallX(sx, 2.62), y, z, 0.05, 0.98, 0.05, 'steelRust'); } // outer rail: posts, mid and top bar
  // slide chutes: loose scree (walk backwards to brake); the steep middle bulge can't be braked
  for (const s of SLIDES.filter((q) => Math.sign(q.minX + q.maxX) === sx)) {
    const rp = b.ramp(s.minX, s.maxX, s.minZ, s.maxZ, 'x', s.from, s.to, 'rockDark'); rp.slide = true; rp.brake = s.brake;
    b.geom(screeSkin(s, s.brake ? 0.14 : 0.42), s.brake ? 'gravel' : 'rock', 0, 0, 0); // loose scree / steep rock bulge
  }
  b.geom(cliffSkin(sx), 'rock', 0, 0, 0); skinCols(b, sx);
  // rock spurs along the chute edges hide the wedge sides and read as natural ridges between the gullies
  for (const r of [13, 17, 24, 28.5]) {
    const z = zOf(sx, r), len = Math.hypot(8, H), ang = Math.atan2(H, 8);
    b.geom(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.25, r), 'rockDark', wallX(sx, 3.6), H / 2 - 0.1, z, 0, 0, sx * ang, len * 0.56, 1.0, 0.9);
    b.colFit(b.lastTris, 'rock', 7, 3, { hull: true, floor: 0 }); // spurs are solid (B3)
  }
  // natural rock shelves jutting from the cliff, staggered: drop from one onto the next (1.6 m each, no fall damage)
  for (let k = 0; k < 5; k++) {
    const top = H - (k + 1) * 1.6, out = 1.05 + (k % 2) * 0.25, r = -5.2 - k * 2.5, [z0, z1] = rr(r, r - 2.3), cx = (wallX(sx, 0) + wallX(sx, out)) / 2, cz = (z0 + z1) / 2;
    if (top > 0.2) b.col(cx, top - 0.45, cz, out, 0.45, z1 - z0, 'rock');
    b.geom(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.22, k), k % 2 ? 'rock' : 'rockDark', wallX(sx, out * 0.3), top - 0.62, cz, 0, k, 0, out * 0.85, 0.66, (z1 - z0) * 0.5); // half sunk into the cliff
  }
  // berms with bushes on the canyon floor below the ledges: lie down behind them to hide
  for (const [d0, d1, ra, rb, h] of [[4.2, 6.2, -7, -26, 0.75], [7.2, 9.2, -13, -25, 0.6]]) {
    const xa = wallX(sx, d0), xm = wallX(sx, (d0 + d1) / 2), xb = wallX(sx, d1), [z0, z1] = rr(ra, rb);
    b.ramp(Math.min(xa, xm), Math.max(xa, xm), z0, z1, 'x', xa < xm ? 0 : h, xa < xm ? h : 0, 'grass');
    b.ramp(Math.min(xm, xb), Math.max(xm, xb), z0, z1, 'x', xm < xb ? h : 0, xm < xb ? 0 : h, 'grass');
  }
  for (const u of BUSHES.filter((q) => Math.sign(q.x) === sx)) for (let i = 0; i < 4; i++) { // waist-high clumps (~0.75 m): hide prone, still glimpsed
    const a = i * 1.7 + u.x, s = u.s * (0.8 + 0.12 * i);
    b.geom(new THREE.IcosahedronGeometry(0.62, 1), i % 2 ? 'pine' : 'grass', u.x + Math.cos(a) * 0.5 * u.s, 0.3 * s, u.z + Math.sin(a) * 0.5 * u.s, a, a * 1.3, 0, 1.15 * s, 0.75 * s, 1.05 * s);
  }
}

function boulder(b, x, z, s, y0 = 0, seed = 1) {
  b.geom(new THREE.IcosahedronGeometry(1, 0), seed % 2 ? 'rock' : 'rockDark', x, y0 + 0.42 * s, z, seed * 0.7, seed * 1.3, seed * 0.4, s, 0.72 * s, 1.1 * s);
  const n = s > 1.15 ? 3 : s > 0.6 ? 2 : 1;
  b.colFit(b.lastTris, 'concrete', n, 2, { floor: y0, hull: true });
}
function pine(b, x, z, h = 9, y0 = 0) {
  b.geom(new THREE.CylinderGeometry(0.16, 0.26, h * 0.5, 7), 'bark', x, y0 + h * 0.25, z);
  for (let i = 0; i < 4; i++) {
    const r = (1.9 - i * 0.38) * h / 9, ch = h * 0.3;
    b.geom(new THREE.ConeGeometry(r, ch, 8), 'pine', x, y0 + h * 0.32 + i * h * 0.17 + ch / 2, z, 0, i * 0.7, 0);
  }
  b.col(x, y0, z, 0.5, h * 0.5, 0.5, 'wood');
}

function boxcar(b, cx, open, hatch) {
  const y = H + 0.45, L = 8, W = 3.0, Ht = 3.0; // floor one normal step above the deck: walk straight in, no boarding steps
  b.solid(cx, H, 0, 7.4, 0.33, 2.4, 'steelRust'); // undercarriage
  b.solid(cx, H + 0.33, 0, L, 0.12, W, open ? 'wood' : 'steelRust'); // floor, full width so doorways have no gap
  for (const dx of [-3.0, -2.2, 2.2, 3.0]) for (const dz of [-1.0, 1.0]) b.geom(new THREE.CylinderGeometry(0.21, 0.21, 0.14, 12), 'black', cx + dx, H + 0.21, dz * 0.78, 0, 0, Math.PI / 2);
  if (!open) {
    b.solid(cx, y, 0, L, Ht, W, 'boxcar');
  } else {
    const t = 0.12;
    for (const sz of [-1, 1]) { // long walls with sliding-door openings
      b.solid(cx - 2.45, y, sz * (W / 2 - t / 2), 3.1, Ht, t, 'boxcar');
      b.solid(cx + 2.45, y, sz * (W / 2 - t / 2), 3.1, Ht, t, 'boxcar');
      b.solid(cx, y + 2.25, sz * (W / 2 - t / 2), 1.8, Ht - 2.25, t, 'boxcar');
      b.doors.push({ x: cx, y, z: sz * (W / 2 + 0.075), w: 1.95, h: 2.3, t: 0.07, slide: 1.75, open: true, mat: 'boxcar' }); // sliding door (E)
    }
    b.solid(cx - L / 2 + t / 2, y, 0, t, Ht, W, 'boxcar'); b.solid(cx + L / 2 - t / 2, y, 0, t, Ht, W, 'boxcar');
    if (hatch) { // open roof hatch (1.5 m square): a well-aimed grenade drops inside
      b.solid(cx - 2.375, y + Ht, 0, 3.25, 0.12, W, 'boxcar'); b.solid(cx + 2.375, y + Ht, 0, 3.25, 0.12, W, 'boxcar');
      b.solid(cx, y + Ht, -1.125, 1.5, 0.12, 0.75, 'boxcar'); b.solid(cx, y + Ht, 1.125, 1.5, 0.12, 0.75, 'boxcar');
      for (const s of [-1, 1]) { b.deco(cx + s * 0.8, y + Ht + 0.12, 0, 0.1, 0.1, 1.7, 'black'); b.deco(cx, y + Ht + 0.12, s * 0.8, 1.7, 0.1, 0.1, 'black'); }
    } else b.solid(cx, y + Ht, 0, L, 0.12, W, 'boxcar');
    if (!hatch) b.deco(cx, y + Ht + 0.12, 0, L - 0.4, 0.06, 0.5, 'woodDark'); // roof walk
    crate(b, cx - 2.6, 0.6, 1.1, 1.0, y); crate(b, cx + 2.8, -0.7, 1.0, 0.9, y);
  }
  for (let i = -3.5; i <= 3.5; i += 1) for (const sz of [-1, 1]) b.deco(cx + i, y, sz * (W / 2 + 0.04), 0.09, Ht, 0.04, 'steelRust');
  for (const sz of [-1, 1]) {
    b.deco(cx, y + 0.05, sz * (W / 2 + 0.05), L, 0.12, 0.05, 'steelRust'); b.deco(cx, y + Ht - 0.15, sz * (W / 2 + 0.05), L, 0.12, 0.05, 'steelRust');
    for (const dx of [-2.4, 2.4]) b.geom(new THREE.BoxGeometry(0.07, 3.4, 0.04), 'steelRust', cx + dx, y + Ht / 2, sz * (W / 2 + 0.06), 0, 0, dx > 0 ? 0.62 : -0.62);
  }
}

// low ridge (two ramps meeting in a crest): real cover for prone/crouched players, walkable, bullets stop on it
// low rounded mound: four ramps underneath for footing and cover, a smooth grass skin on top
function ridge(b, x, z, w, d, h, y0 = 0) {
  const q = w / 4, ks = [[0, 0.62], [0.62, 1], [1, 0.62], [0.62, 0]];
  for (let i = 0; i < 4; i++) { const a = x - w / 2 + i * q; b.ramp(a, a + q, z - d / 2, z + d / 2, 'x', y0 + h * ks[i][0], y0 + h * ks[i][1], 'grass', y0); }
  const g = new THREE.PlaneGeometry(w * 1.1, d, 12, 6).rotateX(-Math.PI / 2), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const u = Math.min(1, Math.abs(P.getX(i)) / (w * 0.55)), v = Math.min(1, Math.abs(P.getZ(i)) / (d * 0.5)); P.setY(i, h * (0.5 + 0.5 * Math.cos(Math.PI * u)) * Math.min(1, (1 - v) * 3) + 0.03); }
  g.computeVertexNormals(); b.geom(g, 'grass', x, y0, z);
}
// smooth noise for the rock skins (sum of sines: cheap, deterministic)
const nz = (a, c, s) => 0.5 + 0.25 * Math.sin(a * 0.9 + Math.sin(c * 0.7 + s) * 1.3) + 0.15 * Math.sin(a * 2.3 + c * 1.7 + s) + 0.1 * Math.sin(c * 3.1 - a * 0.6 - s);
function lumpy(g, amt, seed) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 1 + amt * (nz(x * 3 + z, y * 3, seed) - 0.5) * 2; P.setXYZ(i, x * k, y * k, z * k); } g.computeVertexNormals(); return g; }
// cliff face skin: the flat collision wall stays, a bulging rock surface (0-0.45 m) sits in front so the walls meander
// how far the rock skin stands out from the flat cliff wall at (z, y)
function skinOut(sx, z, y) {
  const r = -sx * z, nearStairs = r > 2.5 && r < 13 ? 0.25 : 1, edge = Math.min(1, Math.max(0, (H - y) / 0.6)) * Math.min(1, y / 0.4 + 0.3);
  const bulge = 0.5 * nz(z * 0.55, y * 0.5, sx) + 0.35 * (0.5 + 0.5 * Math.sin(z * 0.23 + sx * 2 + Math.sin(y * 0.3)));
  return 0.03 + bulge * nearStairs * edge;
}
// collision that follows the skin: 1 m x 1 m cells reaching out to the skin's furthest point minus a body radius,
// so your centre can never end up inside the rock (B3); bullets keep hitting the flat wall behind (noRay)
function skinCols(b, sx) {
  for (let z = -29.5; z < 29.5; z += 1) for (let y = 0; y < H; y += 1) {
    let m = 0; for (let a = 0; a <= 4; a++) for (let c = 0; c <= 4; c++) m = Math.max(m, skinOut(sx, z + a / 4, Math.min(H, y + c / 4)));
    const d = m - 0.22; if (d < 0.06) continue;
    if (SLIDES.some((s) => Math.sign(s.minX + s.maxX) === sx && z + 1 > s.minZ && z < s.maxZ)) continue; // chutes run down the wall here
    b.colliders.push({ minX: sx > 0 ? 20 - d : -20, maxX: sx > 0 ? 20 : -20 + d, minY: y, maxY: Math.min(H, y + 1), minZ: z, maxZ: z + 1, mat: 'rock', pass: false, noRay: true });
  }
}
function cliffSkin(sx) {
  const g = new THREE.PlaneGeometry(59, H + 0.4, 72, 12), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const z = P.getX(i), y = P.getY(i) + (H + 0.4) / 2 - 0.2;
    P.setXYZ(i, sx * 20 - sx * skinOut(sx, z, y), y, z);
  }
  if (sx > 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i]; I[i] = I[i + 2]; I[i + 2] = t; } } // face into the canyon
  g.computeVertexNormals(); return g;
}
function screeSkin(s, amp) {
  const w = s.maxX - s.minX, d = s.maxZ - s.minZ, g = new THREE.PlaneGeometry(w, d, 14, 10).rotateX(-Math.PI / 2), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i) + (s.minX + s.maxX) / 2, z = P.getZ(i) + (s.minZ + s.maxZ) / 2, t = (x - s.minX) / w, base = s.from + (s.to - s.from) * t;
    const edgeZ = Math.min(z - s.minZ, s.maxZ - z), bump = amp * nz(x * 1.3, z * 1.1, s.minZ) * Math.min(1, edgeZ / 0.6 + 0.2) * Math.min(1, base / 0.5 + 0.1);
    P.setXYZ(i, x, base + 0.04 + bump, z);
  }
  g.computeVertexNormals(); return g;
}
function ladderVis(b, x, z, y0, y1, alongZ, top = 0.9) {
  for (const o of [-0.25, 0.25]) b.deco(x + (alongZ ? 0 : o), y0, z + (alongZ ? o : 0), 0.06, y1 - y0 + top, 0.06, 'steelRust');
  for (let y = y0 + 0.3; y < y1 + Math.min(0.9, top) - 0.05; y += 0.32) b.deco(x, y, z, alongZ ? 0.05 : 0.5, 0.04, alongZ ? 0.5 : 0.05, 'steelRust');
}

export default {
  id: 'gorge',
  name: 'CASCADE GORGE',
  blurb: 'Forested plateau bases across a deep canyon. Cross the train bridge, or flank through the creek below.',
  bounds: { minX: -58.5, maxX: 58.5, minZ: -29.5, maxZ: 29.5 },
  // jeep spots (Vehicles: On): one on each plateau base, one on the canyon road
  vehicles: [{ x: -47, z: 4, y: H, yaw: -Math.PI / 2 }, { x: 47, z: -4, y: H, yaw: Math.PI / 2 }, { x: -6.5, z: 19, y: 0, yaw: 0 },
    { type: 'heli', x: -37, z: 19, y: H, yaw: -Math.PI / 2 }, { type: 'heli', x: 37, z: -19, y: H, yaw: Math.PI / 2 }],
  // bot routes (6c): plateau loops, the canyon road, and a high loop for the helicopters
  vehicleRoutes: [
    { type: 'jeep', pts: [[-50, -20], [-27, -21], [-26, 20], [-50, 22]] },
    { type: 'jeep', pts: [[50, 20], [27, 21], [26, -20], [50, -22]] },
    { type: 'jeep', pts: [[-6.5, 19], [-6.5, -7]] },
    { type: 'heli', alt: H + 13, pts: [[-42, -18], [0, -22], [42, -18], [42, 18], [0, 22], [-42, 18]] },
  ],
  // cliff descents (per wall, mirrored): right of the train metal zig-zag stairs, then slide chutes (two braking
  // chutes with a lethal steep bulge between), left of the train staggered rock ledges with bushes and berms below
  slides: SLIDES, bushes: BUSHES,
  ground: 'grass', groundMat: 'grass',
  sky: [0x6c95bd, 0xd3dde0, 0x7d8a7a],
  fog: { color: 0xb9c6c9, density: 0.0068 },
  sun: { color: 0xfff2dc, intensity: 2.2, pos: [-40, 72, 34], shadow: 64 },
  hemi: { sky: 0xcfe0ea, ground: 0x4f5a3a, intensity: 1.15 },
  ambience: 'forest',
  barrels: [[-14, -9, 0], [14, 9, 0], [-35, -6, H], [35, 6, H]],
  water: [{ minX: 3, maxX: 8.5, minZ: -29.5, maxZ: 29.5, top: 0.3 }],
  surfaces: [{ minX: -9, maxX: -4, minZ: -29.5, maxZ: 29.5, mat: 'sand' }],
  // hand-placed waypoints for spots too narrow for the 2 m nav grid (bridge walkways, boxcar interiors)
  navExtra: (() => {
    const p = [];
    for (let x = -19.5; x <= 19.5; x += 1.5) { p.push([x, 2.0, H]); p.push([x, -2.0, H]); }
    for (const cx of [-4.5, 4.5]) for (let x = cx - 3; x <= cx + 3; x += 1.5) p.push([x, 0, H + 0.45]);
    for (const cx of [-4.5, 4.5]) { p.push([cx, 1.8, H + 0.45]); p.push([cx, -1.8, H + 0.45]); }
    for (let x = -16; x <= 16; x += 1.5) p.push([x, 0, 5.0]); // catwalk under the bridge (ladder access)
    p.push([6.6, 1.3, 5.0]);
    for (const sx of [-1, 1]) { // zig-zag stairs: flights, landings and the step onto the plateau (bots climb back up here)
      const t = H / 3, pt = (d, r, y) => p.push([wallX(sx, d), zOf(sx, r), y]);
      for (let r = 5.6; r < 10.5; r += 1.4) { const k = (r - 5) / 5.5; pt(0.65, r, t * k); pt(1.95, r, t * (2 - k)); pt(0.65, r, t * (2 + k)); }
      pt(1.3, 11.3, t); pt(1.3, 4.2, 2 * t); pt(1.3, 11.3, H); pt(-1.2, 11.3, H); pt(2.2, 4.4, 0);
    }
    return p;
  })(),
  ladders: [
    { x: -17.4, z: 0, minY: 0, maxY: 5.0, nx: -1, nz: 0 },
    { x: 17.4, z: 0, minY: 0, maxY: 5.0, nx: 1, nz: 0 },
    { x: 7.15, z: 2.0, minY: 5.0, maxY: H, nx: -1, nz: 0 },
  ],
  spawns: {
    ffa: [[-50, -20, H], [-50, 20, H], [-42, -8, H], [-55, 8, H], [50, 20, H], [50, -20, H], [42, 8, H], [55, -8, H],
      [-9.5, -20, 0], [9.5, 24, 0], [-9.5, 24, 0], [9.5, -24, 0], [-2, -26, 0], [2, 26, 0], [-35, 25, H], [35, -25, H]],
    teams: [
      [[-50, -20, H], [-50, 0, H], [-50, 20, H], [-42, -10, H], [-42, 12, H], [-55, -8, H], [-55, 10, H], [-35, -25, H], [-35, 25, H]],
      [[50, 20, H], [50, 0, H], [50, -20, H], [42, 10, H], [42, -12, H], [55, 8, H], [55, -10, H], [35, 25, H], [35, -25, H]],
    ],
  },
  pickups: [
    { type: 'health', x: -44, y: H, z: -6 }, { type: 'health', x: 44, y: H, z: 6 }, { type: 'health', x: -12, y: 0, z: 2 }, { type: 'health', x: 12, y: 0, z: -2 },
    { type: 'ammo', x: 0, y: 5.0, z: 0 }, { type: 'ammo', x: -4.5, y: H + 0.45, z: 0 }, { type: 'ammo', x: 4.5, y: H + 0.45, z: 0 },
    { type: 'ammo', x: -30, y: H, z: -20 }, { type: 'ammo', x: 30, y: H, z: 20 },
  ],
  build(b) {
    // ---- plateaus (rock cliffs with grassy tops) ----
    for (const sx of [-1, 1]) {
      b.solid(sx * 39.5, 0, 0, 39, H, 62, 'rock');
      b.deco(sx * 39.5, H, 0, 39, 0.02, 62, 'grass');
      for (let z = -27; z <= 27; z += 4.5) { // broken cliff face
        const k = Math.abs(Math.sin(z * 1.7 + sx)), d = 0.4 + k * 0.7;
        b.deco(sx * (20 + d / 2 - 0.05), 0, z, d, H * (0.55 + k * 0.45), 3.2 + k * 2, k > 0.5 ? 'rockDark' : 'rock');
      }
      cliffRoutes(b, sx);
      // tunnel portal where the railway leaves the map
      b.deco(sx * 59.5, H, 0, 1.5, 9, 14, 'rockDark'); b.deco(sx * 58.7, H, 0, 0.2, 5, 4.4, 'black');
      // sniper boulders along the cliff edge and cover across the base
      [[-22.6, -19, 1.6], [-23, -4.5, 1.4], [-22.8, 6, 1.7], [-23, 19, 1.5], [-30, -12, 1.8], [-34, 8, 2], [-40, -22, 1.7], [-45, 15, 2.2], [-28, 24, 1.6], [-50, -6, 1.6], [-38, 4, 1.2], [-46, -14, 1.3]]
        .forEach(([x, z, s], i) => boulder(b, -x * sx, z * -sx, s, H, i + (sx > 0 ? 7 : 1)));
      [[-36, -18, 10], [-42, -26, 11], [-48, 10, 9], [-31, 15, 10], [-53, 22, 12], [-46, -12, 9], [-56, -24, 11], [-27, -26, 9]]
        .forEach(([x, z, h]) => pine(b, -x * sx, z * -sx, h, H));
      crate(b, sx * 33, sx * -4, 1.6, 1.4, H); crate(b, sx * 52, sx * 4, 1.8, 1.6, H);
      // rolling ground: low ridges between the spawns, plus grass tufts and stones so the plateau isn't a flat table
      for (const [x, z, w, d, h] of [[41, 3, 4, 4.5, 0.8], [31, 1, 3.2, 4, 0.7], [52, -14, 3.2, 3.2, 0.6]]) ridge(b, -x * sx, z * -sx, w, d, h, H);
      for (let i = 0; i < 40; i++) {
        const x = -(23 + ((i * 37) % 34)) * sx, z = (((i * 53) % 54) - 27) * -sx, t = (i * 7) % 3;
        b.geom(new THREE.SphereGeometry(t ? 0.24 : 0.18, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), t === 2 ? 'rockDark' : 'grass', x, H, z, 0, i, 0, 1.7, 0.32, 1.3);
      }
    }
    for (const sz of [-1, 1]) { // canyon end walls
      b.deco(0, 0, sz * 31.5, 40, 16, 3, 'rock');
      for (let x = -18; x <= 18; x += 6) if (kept(x + 1.5, sz * 28.6)) boulder(b, x + 1.5, sz * 28.6, 1.8 + Math.abs(Math.sin(x)) * 0.8, 0, x + 20);
    }

    // ---- railway bridge (deck top at H) with a maintenance hatch at x 6..7.2 ----
    b.solid(0, H - 0.4, -0.55, 40, 0.4, 4.1, 'steelRust');
    b.solid(-7, H - 0.4, 2.05, 26, 0.4, 1.1, 'steelRust'); b.solid(13.6, H - 0.4, 2.05, 12.8, 0.4, 1.1, 'steelRust');
    railX(b, -20, 20, -2.55, H, 1.05); railX(b, -20, 20, 2.55, H, 1.05);
    for (const sz of [-1, 1]) {
      b.deco(0, H - 1.4, sz * 2.45, 40, 1.0, 0.25, 'steelRust');
      for (let x = -18; x < 18; x += 4) b.geom(new THREE.BoxGeometry(0.16, 1.4, 0.12), 'steelRust', x + 2, H - 0.9, sz * 2.6, 0, 0, 0.9);
    }
    for (const px of [-10, 0, 10]) { // trestle piers
      for (const pz of [-1.9, 1.9]) b.solid(px, 0, pz, 0.7, H - 0.4, 0.7, 'steelRust');
      for (let y = 1.2; y < H - 1; y += 2.6) b.geom(new THREE.BoxGeometry(0.14, 0.14, 4.4), 'steelRust', px, y + 1.3, 0, 0.55, 0, 0);
      b.deco(px, 3.5, 0, 0.3, 0.3, 3.8, 'steelRust');
    }
    // under-deck catwalk (y 5) with a spur below the hatch
    b.solid(0, 4.8, 0, 34, 0.2, 1.2, 'steel');
    b.solid(6.6, 4.8, 1.55, 2.0, 0.2, 1.9, 'steel');
    railX(b, -17, 17, -0.62, 5.0); railX(b, -17, 5.6, 0.62, 5.0); railX(b, 7.6, 17, 0.62, 5.0);
    railZ(b, 0.62, 2.5, 5.6, 5.0); railZ(b, 0.62, 2.5, 7.6, 5.0);
    ladderVis(b, -17.35, 0, 0, 5.0, true); ladderVis(b, 17.35, 0, 0, 5.0, true); ladderVis(b, 7.2, 2.0, 5.0, H, true, 0.3);
    // track across the whole map
    for (const z of [-0.72, 0.72]) b.deco(0, H, z, 117, 0.12, 0.09, 'steel');
    for (let x = -58; x <= 58; x += 0.8) b.deco(x, H, 0, 0.22, 0.06, 2.3, 'woodDark');
    // stalled freight train: closed car, two enterable cars (one with a roof hatch), flatcar with crates
    boxcar(b, -13.5, false, false);
    boxcar(b, -4.5, true, true);
    boxcar(b, 4.5, true, true);
    b.solid(13.5, H, 0, 7.4, 0.9, 2.4, 'steelRust');
    b.deco(13.5, H + 0.9, 0, 8, 0.1, 3, 'woodDark');
    crate(b, 11.5, 0.3, 1.5, 1.4, H + 0.9); crate(b, 15.2, -0.4, 1.4, 1.2, H + 0.9); crate(b, 13.4, 0.5, 1.1, 1.0, H + 2.3);

    // ---- lower canyon: gravel road, creek, boulders, trees, a wrecked truck ----
    b.deco(-6.5, 0, 0, 5, 0.012, 59, 'gravel');
    b.deco(5.75, 0, 0, 5.5, 0.008, 59, 'rockDark');
    b.deco(5.75, 0.27, 0, 5.5, 0.03, 59, 'water');
    for (let z = -26; z <= 26; z += 3.4) { b.deco(2.75, 0, z, 0.6 + Math.abs(Math.sin(z)) * 0.5, 0.35, 2.2, 'rock'); b.deco(8.75, 0, z + 1.7, 0.7, 0.3, 2.2, 'rockDark'); }
    [[-6, -16, 0.5], [5.2, -14, 0.45], [6.4, -13.2, 0.4], [5.8, 18, 0.5]].forEach(([x, z, s], i) => boulder(b, x, z, s, 0, i + 3));
    [[-12, -18, 1.7], [-14, 6, 1.5], [12, -8, 1.6], [14, 20, 1.8], [2, -24, 1.4], [-1, 24, 1.5], [-15, 17, 1.3], [15, -18, 1.4], [-2, -10, 1.1], [1, 13, 1.2]]
      .forEach(([x, z, s], i) => kept(x, z) && boulder(b, x, z, s, 0, i + 11));
    [[-15, -12, 10], [15, -22, 11], [-9, 22, 9], [11, 15, 10], [-16, -25, 12], [16, 25, 9], [10, 6, 8]].forEach(([x, z, h]) => kept(x, z) && pine(b, x, z, h, 0));
    b.solid(-6.5, 0.45, -14, 2.2, 1.3, 4.4, 'steelRust', { rot: 0.25 }); b.solid(-6.3, 1.75, -15.4, 2.0, 1.0, 1.6, 'steelRust', { rot: 0.25 });
    for (const dz of [-1.5, 1.5]) for (const dx of [-1.1, 1.1]) b.deco(-6.5 + dx, 0, -14 + dz, 0.3, 0.8, 0.8, 'rubber', { rot: 0.25 });
    crate(b, -11, 12, 1.6, 1.4); crate(b, 11, -12, 1.6, 1.4);
    for (let i = 0; i < 46; i++) { const x = ((i * 29) % 36) - 18, z = ((i * 41) % 56) - 28; if (kept(x, z) && Math.abs(x - 5.75) > 3.2) b.geom(new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), i % 3 ? 'grass' : 'rock', x, 0, z, 0, i, 0, 1.7, 0.3, 1.4); }

    // ---- distant mountains ----
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2, r = 120 + (i % 4) * 14;
      b.geom(new THREE.ConeGeometry(28 + (i % 5) * 8, 40 + (i % 6) * 12, 6), i % 2 ? 'rockDark' : 'pine', Math.cos(a) * r, 15 + (i % 6) * 6, Math.sin(a) * r, 0, a, 0);
    }
  },
};
