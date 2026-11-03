import { crate, barrel } from './props.js';

// Two mirrored two-storey houses. s = -1 builds the north house (front faces +z), s = +1 the south one.
// Local coords: lx runs along the frontage (-6..8), ld is depth from the front wall (0..9).
function house(b, s, siding) {
  const X = (lx) => -s * lx, Z = (ld) => s * (11 + ld);
  const box = (lx0, lx1, ld0, ld1, y0, h, mat, solid = true) => {
    const x0 = Math.min(X(lx0), X(lx1)), x1 = Math.max(X(lx0), X(lx1)), z0 = Math.min(Z(ld0), Z(ld1)), z1 = Math.max(Z(ld0), Z(ld1));
    if (solid) b.solid((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, mat); else b.deco((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, mat);
  };
  const T = 0.3;
  // openings: {a, b, lo, hi} along the wall, lo/hi = bottom/top of the hole above y0
  const run = (from, to, gaps, seg) => {
    let cur = from;
    for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
      if (g.a > cur) seg(cur, g.a, 0, null);
      if (g.lo > 0) seg(g.a, g.b, 0, g.lo);
      seg(g.a, g.b, g.hi, null);
      cur = g.b;
    }
    if (cur < to) seg(cur, to, 0, null);
  };
  const wallF = (ld, y0, h, gaps) => run(-6.15, 8.15, gaps, (a, c, lo, top) => { const hh = (top ?? h) - lo; if (hh > 0.01) box(a, c, ld - T / 2, ld + T / 2, y0 + lo, hh, siding); });
  const wallS = (lx, y0, h, gaps) => run(0, 9, gaps, (a, c, lo, top) => { const hh = (top ?? h) - lo; if (hh > 0.01) box(lx - T / 2, lx + T / 2, a, c, y0 + lo, hh, siding); });
  const door = (a, c) => ({ a, b: c, lo: 0, hi: 2.35 });
  const win = (a, c, lo = 1.0, hi = 2.1) => ({ a, b: c, lo, hi });
  // ground floor
  wallF(0, 0, 3, [door(0.2, 1.8), win(-4.6, -2.4), win(3.4, 5.6)]);
  wallF(9, 0, 3, [door(-1.8, -0.2), win(2.5, 4.5)]);
  wallS(-6, 0, 3, [door(4.4, 6.6)]);
  wallS(8, 0, 3, [win(3, 5)]);
  // upper floor slab with stairwell hole (lx 5.6..8, ld 0..7.8) and landing
  box(-6.15, 5.6, -0.15, 9.15, 3.0, 0.25, 'wood');
  box(5.6, 8.15, 7.8, 9.15, 3.0, 0.25, 'wood');
  const top = s < 0;
  const sx0 = Math.min(X(5.6), X(7.6)), sx1 = Math.max(X(5.6), X(7.6)), sz0 = Math.min(Z(1.3), Z(7.8)), sz1 = Math.max(Z(1.3), Z(7.8));
  b.stairs(sx0, sx1, sz0, sz1, 'z', top ? 3.25 : 0, top ? 0 : 3.25, 'woodDark');
  { // railing on the upstairs edge of the stairwell
    const x = X(5.6), z0 = Math.min(Z(0.2), Z(7.0)), z1 = Math.max(Z(0.2), Z(7.0));
    b.col(x, 3.25, (z0 + z1) / 2, 0.1, 1.0, z1 - z0, 'wood', { pass: true });
    b.deco(x, 4.2, (z0 + z1) / 2, 0.08, 0.06, z1 - z0, 'paintWhite');
    for (let ld = 0.6; ld < 7.0; ld += 0.9) b.deco(x, 3.25, Z(ld), 0.05, 0.95, 0.05, 'paintWhite');
  }
  // upper floor walls (big street-facing windows)
  wallF(0, 3.25, 2.75, [win(-4.8, -1.6, 0.75, 1.95), win(1.8, 5, 0.75, 1.95)]);
  wallF(9, 3.25, 2.75, [win(-4, -1, 0.75, 1.95), win(2, 5, 0.75, 1.95)]);
  wallS(-6, 3.25, 2.75, [win(2.5, 6.5, 0.75, 1.95)]);
  wallS(8, 3.25, 2.75, [win(1, 3, 0.75, 1.95)]);
  // roof
  box(-6.5, 8.5, -0.5, 9.5, 6.0, 0.25, 'roofRed');
  box(-6.3, 8.3, 1.2, 7.8, 6.25, 0.8, 'roofRed', false);
  box(-6.1, 8.1, 2.8, 6.2, 7.05, 0.7, 'roofRed', false);
  box(-1.4, 3.4, -1.6, -0.15, 2.6, 0.15, 'roofRed', false); // porch roof
  box(-1.0, -0.8, -1.5, -1.3, 0, 2.6, 'paintWhite', false); box(2.8, 3.0, -1.5, -1.3, 0, 2.6, 'paintWhite', false);
  // furniture
  box(-5.6, -3.4, 5.6, 6.6, 0, 0.8, 'cloth2');
  box(-2.4, -0.4, 3.4, 4.8, 0, 0.78, 'woodDark');
  box(2.4, 5.4, 8.15, 8.8, 0, 0.95, 'concrete');
  box(-5.8, -5.0, 0.4, 1.4, 0, 1.9, 'paintWhite');
  box(-5.5, -3.2, 6.6, 8.7, 3.25, 0.6, 'cloth1');
  box(-0.8, 1.2, 8.3, 8.8, 3.25, 2.0, 'woodDark');
  box(2.4, 4.4, 0.4, 1.4, 3.25, 0.8, 'woodDark');
  // mannequins posed inside
  mannequin(b, X(-1.5), Z(4.1), 3.25, s > 0 ? 0 : Math.PI);
  mannequin(b, X(-3), Z(2.4), 0, s > 0 ? 0.6 : Math.PI + 0.6);
  // yard: picket fence with a gate, side fences, shed
  const fence = (lx0, lx1, ld0, ld1) => {
    box(lx0, lx1, ld0, ld1, 0, 1.0, 'paintWhite');
    const alongX = Math.abs(lx1 - lx0) > Math.abs(ld1 - ld0);
    const n = Math.floor((alongX ? Math.abs(lx1 - lx0) : Math.abs(ld1 - ld0)) / 0.35);
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n), lx = lx0 + (lx1 - lx0) * t, ld = ld0 + (ld1 - ld0) * t;
      box(lx - 0.04, lx + 0.04, ld - 0.04, ld + 0.04, 1.0, 0.12, 'paintWhite', false);
    }
  };
  fence(-10, -0.5, -5.55, -5.45); fence(2.5, 11, -5.55, -5.45);
  fence(-10.05, -9.95, -5.5, 2); fence(-10.05, -9.95, 4, 12); fence(-10.05, -9.95, 14, 19);
  fence(10.95, 11.05, -5.5, 2); fence(10.95, 11.05, 4, 12); fence(10.95, 11.05, 14, 19);
  box(-8, -5, 13.5, 16.5, 0, 2.5, 'woodDark'); box(-8.2, -4.8, 13.3, 16.7, 2.5, 0.15, 'roofRed', false);
  b.deco(X(1), 0, Z(-2.8), 1.6, 0.012, 5.4, 'concrete'); // front path
  b.deco(X(1), 0, Z(-3), 20, 0.008, 5, 'lawn');
}

function mannequin(b, x, z, y0, rot) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const p = (ox, oy, oz, w, h, d) => b.deco(x + ox * c + oz * sn, y0 + oy, z - ox * sn + oz * c, w, h, d, 'mannequin', { rot });
  p(-0.11, 0, 0, 0.16, 0.86, 0.18); p(0.11, 0, 0, 0.16, 0.86, 0.18);
  p(0, 0.86, 0, 0.44, 0.62, 0.24); p(-0.3, 0.9, 0, 0.12, 0.56, 0.12); p(0.3, 0.9, 0, 0.12, 0.56, 0.12);
  p(0, 1.5, 0, 0.2, 0.26, 0.22);
  b.col(x, y0, z, 0.5, 1.75, 0.5, 'wood');
}

export default {
  id: 'atomic',
  name: 'ATOMIC ACRES',
  blurb: 'A tiny 1950s test town. Two houses face off across one street, so the fighting starts seconds after you spawn.',
  bounds: { minX: -30.2, maxX: 30.2, minZ: -30.2, maxZ: 30.2 },
  ground: 'groundSand', groundMat: 'sand',
  sky: [0x5b93d1, 0xeadfc6, 0xcbb28a],
  fog: { color: 0xd9cfb8, density: 0.009 },
  sun: { color: 0xfff1d8, intensity: 2.3, pos: [30, 70, 22], shadow: 36 },
  hemi: { sky: 0xdbe8f5, ground: 0x9b8a66, intensity: 1.1 },
  ambience: 'desert',
  barrels: [[-14, -3.8], [14, 3.8], [0, -8.2]],
  spawns: {
    ffa: [[-26, -26], [26, 26], [-26, 26], [26, -26], [-26, 0], [26, 0], [0, -27], [0, 27], [-14, -26], [14, 26],
      [-16, -8], [16, 8], [2.5, -13.5], [-2.5, 13.5], [20, -14], [-20, 14]],
    teams: [
      [[-26, -26], [0, -27], [-14, -26], [14, -27], [26, -26], [2.5, -13.5], [20, -14], [-24, -12]],
      [[26, 26], [0, 27], [14, 26], [-14, 27], [-26, 26], [-2.5, 13.5], [-20, 14], [24, 12]],
    ],
  },
  pickups: [
    { type: 'health', x: -4, y: 3.25, z: -15 }, { type: 'health', x: 4, y: 3.25, z: 15 },
    { type: 'health', x: -26, y: 0, z: -4 }, { type: 'health', x: 26, y: 0, z: 4 },
    { type: 'ammo', x: 3, y: 0, z: -14.5 }, { type: 'ammo', x: -3, y: 0, z: 14.5 }, { type: 'ammo', x: 2, y: 0, z: 3.6 },
  ],
  build(b) {
    // perimeter: test-site block wall, low enough to see the desert beyond
    b.solid(0, 0, -31, 63, 2.6, 1, 'concreteDark'); b.solid(0, 0, 31, 63, 2.6, 1, 'concreteDark');
    b.solid(-31, 0, 0, 1, 2.6, 63, 'concreteDark'); b.solid(31, 0, 0, 1, 2.6, 63, 'concreteDark');
    for (let i = -30; i <= 30; i += 5) { b.deco(i, 2.6, -31, 0.2, 0.9, 0.2, 'black'); b.deco(i, 2.6, 31, 0.2, 0.9, 0.2, 'black'); b.deco(-31, 2.6, i, 0.2, 0.9, 0.2, 'black'); b.deco(31, 2.6, i, 0.2, 0.9, 0.2, 'black'); }
    for (const z of [-31, 31]) b.deco(0, 3.35, z, 62, 0.04, 0.04, 'black');
    for (const x of [-31, 31]) b.deco(x, 3.35, 0, 0.04, 0.04, 62, 'black');
    // street and sidewalks
    b.deco(0, 0, 0, 60, 0.01, 10, 'road');
    for (const z of [-5.6, 5.6]) b.deco(0, 0, z, 60, 0.1, 1.2, 'concrete');
    for (let x = -26; x <= 26; x += 6) b.deco(x, 0, 0, 2.6, 0.012, 0.18, 'paint');
    house(b, -1, 'sidingBlue');
    house(b, 1, 'sidingGreen');
    // the bus and cars in the street
    b.solid(2, 0.35, -1.0, 9.5, 2.4, 2.5, 'busYellow', { rot: 0.1 });
    b.deco(2, 1.75, -1.0, 9.55, 0.6, 2.55, 'black', { rot: 0.1 });
    b.deco(2, 0.75, -1.0, 9.6, 0.12, 2.56, 'black', { rot: 0.1 });
    for (const dx of [-3.3, 3.3]) for (const dz of [-1.3, 1.3]) b.deco(2 + dx * Math.cos(0.1) + dz * Math.sin(0.1), 0, -1.0 - dx * Math.sin(0.1) + dz * Math.cos(0.1), 0.9, 0.9, 0.3, 'rubber', { rot: 0.1 });
    b.solid(-10.5, 0.4, 2.6, 2.8, 0.75, 2.0, 'carRed'); b.solid(-8.2, 0.4, 2.6, 2.0, 1.5, 2.0, 'carRed'); b.solid(-6.7, 0.4, 2.6, 1.2, 0.8, 2.0, 'carRed');
    b.deco(-8.2, 1.25, 2.6, 2.05, 0.5, 2.05, 'black');
    for (const x of [-10.8, -7.0]) for (const z of [1.55, 3.65]) b.deco(x, 0, z, 0.75, 0.75, 0.25, 'rubber');
    b.solid(13, 0.35, -2.8, 4.4, 0.8, 1.9, 'carTeal'); b.solid(12.8, 1.15, -2.8, 2.3, 0.6, 1.75, 'carTeal');
    b.deco(12.8, 1.2, -2.8, 2.35, 0.45, 1.8, 'black');
    for (const x of [11.5, 14.5]) for (const z of [-3.8, -1.8]) b.deco(x, 0, z, 0.7, 0.7, 0.22, 'rubber');
    // street ends: block garages and test equipment
    for (const sx of [-1, 1]) {
      b.solid(sx * 26.5, 0, sx * -7.5, 6, 3, 4.5, 'concrete');
      b.deco(sx * 26.5, 3, sx * -7.5, 6.3, 0.2, 4.8, 'metalDark');
      crate(b, sx * 24, sx * 8.5, 1.6, 1.4); crate(b, sx * 25.6, sx * 8.2, 1.4, 1.1);
      barrel(b, sx * 28.5, sx * 4); barrel(b, sx * 28.0, sx * 4.7);
      b.solid(sx * 20, 0, sx * -6.6, 5, 1.1, 1.1, 'leaf'); b.solid(sx * -20, 0, sx * -6.6, 5, 1.1, 1.1, 'leaf');
      b.solid(sx * -24, 0, sx * 6.6, 4, 1.1, 1.1, 'leaf');
      mannequin(b, sx * 6, sx * -6.2, 0, sx > 0 ? Math.PI : 0);
      mannequin(b, sx * 23, sx * 1.5, 0, sx > 0 ? 1.4 : -1.7);
    }
    // backyard cover
    crate(b, -18, -24, 2, 1.6); crate(b, 18, 24, 2, 1.6); crate(b, 10, -25, 1.6, 1.2); crate(b, -10, 25, 1.6, 1.2);
    // desert test site beyond the wall
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2, r = 75 + (i % 6) * 8;
      b.deco(Math.cos(a) * r, 0, Math.sin(a) * r, 16 + (i % 4) * 6, 5 + (i % 5) * 3, 12, 'skylineDesert', { rot: a });
    }
    for (const [x, z] of [[-48, -40], [52, 36]]) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.deco(x + sx * 1.5, 0, z + sz * 1.5, 0.25, 22, 0.25, 'steelRust');
      for (let y = 3; y < 22; y += 4) b.deco(x, y, z, 3.2, 0.15, 3.2, 'steelRust');
      b.deco(x, 22, z, 4, 2.5, 4, 'metalDark');
    }
  },
};
