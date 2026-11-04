import * as THREE from 'three';
import { crate, railX, railZ } from './props.js';

// Cascade Gorge: two forested plateau bases (top at 8 m) facing each other across a canyon,
// joined by a steel railway bridge carrying a stalled freight train. Stone stairs and ladders
// lead down to a lower canyon with a gravel road and a wadeable creek.
const H = 8;

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
    if (hatch) { // roof hatch: grenades can drop in
      b.solid(cx - 2.25, y + Ht, 0, 3.5, 0.12, W, 'boxcar'); b.solid(cx + 2.25, y + Ht, 0, 3.5, 0.12, W, 'boxcar');
      b.solid(cx, y + Ht, -1.0, 1.0, 0.12, 1.0, 'boxcar'); b.solid(cx, y + Ht, 1.0, 1.0, 0.12, 1.0, 'boxcar');
    } else b.solid(cx, y + Ht, 0, L, 0.12, W, 'boxcar');
    crate(b, cx - 2.6, 0.6, 1.1, 1.0, y); crate(b, cx + 2.8, -0.7, 1.0, 0.9, y);
  }
  for (let i = -3.5; i <= 3.5; i += 1) for (const sz of [-1, 1]) b.deco(cx + i, y, sz * (W / 2 + 0.04), 0.09, Ht, 0.04, 'steelRust');
  for (const sz of [-1, 1]) {
    b.deco(cx, y + 0.05, sz * (W / 2 + 0.05), L, 0.12, 0.05, 'steelRust'); b.deco(cx, y + Ht - 0.15, sz * (W / 2 + 0.05), L, 0.12, 0.05, 'steelRust');
    for (const dx of [-2.4, 2.4]) b.geom(new THREE.BoxGeometry(0.07, 3.4, 0.04), 'steelRust', cx + dx, y + Ht / 2, sz * (W / 2 + 0.06), 0, 0, dx > 0 ? 0.62 : -0.62);
  }
  b.deco(cx, y + Ht + 0.12, 0, L - 0.4, 0.06, 0.5, 'woodDark'); // roof walk
}

function ladderVis(b, x, z, y0, y1, alongZ) {
  for (const o of [-0.25, 0.25]) b.deco(x + (alongZ ? 0 : o), y0, z + (alongZ ? o : 0), 0.06, y1 - y0 + 1.0, 0.06, 'steelRust');
  for (let y = y0 + 0.3; y < y1 + 0.9; y += 0.32) b.deco(x, y, z, alongZ ? 0.05 : 0.5, 0.04, alongZ ? 0.5 : 0.05, 'steelRust');
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
    return p;
  })(),
  ladders: [
    { x: -17.4, z: 0, minY: 0, maxY: 5.0, nx: -1, nz: 0 },
    { x: 17.4, z: 0, minY: 0, maxY: 5.0, nx: 1, nz: 0 },
    { x: 7.15, z: 2.0, minY: 5.0, maxY: H, nx: -1, nz: 0 },
  ],
  spawns: {
    ffa: [[-50, -20, H], [-50, 20, H], [-42, -8, H], [-55, 8, H], [50, 20, H], [50, -20, H], [42, 8, H], [55, -8, H],
      [-14, -20, 0], [13, 24, 0], [-12, 24, 0], [12, -24, 0], [-2, -26, 0], [2, 26, 0], [-35, 25, H], [35, -25, H]],
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
      // stone stairs down each cliff (south and north), with landings onto the plateau
      const x0 = sx < 0 ? -20 : 17.4, x1 = sx < 0 ? -17.4 : 20, xc = (x0 + x1) / 2;
      b.stairs(x0, x1, -26, -10, 'z', 0, H, 'concrete');
      b.stairs(x0, x1, 10, 26, 'z', H, 0, 'concrete');
      b.solid(xc, 0, -8.75, 2.6, H, 2.5, 'concrete'); b.solid(xc, 0, 8.75, 2.6, H, 2.5, 'concrete');
      for (let z = -25; z <= 25; z += 2.5) if (Math.abs(z) > 9) b.deco(sx < 0 ? -17.45 : 17.45, H * (1 - Math.abs(Math.abs(z) - 10) / 16) + 0.05, z, 0.06, 1.0, 0.06, 'black');
      // tunnel portal where the railway leaves the map
      b.deco(sx * 59.5, H, 0, 1.5, 9, 14, 'rockDark'); b.deco(sx * 58.7, H, 0, 0.2, 5, 4.4, 'black');
      // sniper boulders along the cliff edge and cover across the base
      [[-22.6, -19, 1.6], [-23, -4.5, 1.4], [-22.8, 6, 1.7], [-23, 19, 1.5], [-30, -12, 1.8], [-34, 8, 2], [-40, -22, 1.7], [-45, 15, 2.2], [-28, 24, 1.6], [-50, -6, 1.6], [-38, 4, 1.2], [-46, -14, 1.3]]
        .forEach(([x, z, s], i) => boulder(b, -x * sx, z * -sx, s, H, i + (sx > 0 ? 7 : 1)));
      [[-36, -18, 10], [-42, -26, 11], [-48, 10, 9], [-31, 15, 10], [-53, 22, 12], [-46, -12, 9], [-56, -24, 11], [-27, -26, 9]]
        .forEach(([x, z, h]) => pine(b, -x * sx, z * -sx, h, H));
      crate(b, sx * 33, sx * -4, 1.6, 1.4, H); crate(b, sx * 52, sx * 4, 1.8, 1.6, H);
    }
    for (const sz of [-1, 1]) { // canyon end walls
      b.deco(0, 0, sz * 31.5, 40, 16, 3, 'rock');
      for (let x = -18; x <= 18; x += 6) boulder(b, x + 1.5, sz * 28.6, 1.8 + Math.abs(Math.sin(x)) * 0.8, 0, x + 20);
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
    ladderVis(b, -17.35, 0, 0, 5.0, true); ladderVis(b, 17.35, 0, 0, 5.0, true); ladderVis(b, 7.2, 2.0, 5.0, H, true);
    // track across the whole map
    for (const z of [-0.72, 0.72]) b.deco(0, H, z, 117, 0.12, 0.09, 'steel');
    for (let x = -58; x <= 58; x += 0.8) b.deco(x, H, 0, 0.22, 0.06, 2.3, 'woodDark');
    // stalled freight train: closed car, two enterable cars (one with a roof hatch), flatcar with crates
    boxcar(b, -13.5, false, false);
    boxcar(b, -4.5, true, true);
    boxcar(b, 4.5, true, false);
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
      .forEach(([x, z, s], i) => boulder(b, x, z, s, 0, i + 11));
    [[-15, -12, 10], [15, -22, 11], [-9, 22, 9], [11, 15, 10], [-16, -25, 12], [16, 25, 9], [10, 6, 8]].forEach(([x, z, h]) => pine(b, x, z, h, 0));
    b.solid(-6.5, 0.45, -14, 2.2, 1.3, 4.4, 'steelRust', { rot: 0.25 }); b.solid(-6.3, 1.75, -15.4, 2.0, 1.0, 1.6, 'steelRust', { rot: 0.25 });
    for (const dz of [-1.5, 1.5]) for (const dx of [-1.1, 1.1]) b.deco(-6.5 + dx, 0, -14 + dz, 0.3, 0.8, 0.8, 'rubber', { rot: 0.25 });
    crate(b, -11, 12, 1.6, 1.4); crate(b, 11, -12, 1.6, 1.4);

    // ---- distant mountains ----
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2, r = 120 + (i % 4) * 14;
      b.geom(new THREE.ConeGeometry(28 + (i % 5) * 8, 40 + (i % 6) * 12, 6), i % 2 ? 'rockDark' : 'pine', Math.cos(a) * r, 15 + (i % 6) * 6, Math.sin(a) * r, 0, a, 0);
    }
  },
};
