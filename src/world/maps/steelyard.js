import { crate, barrier, sandbags, barrel, container, railX, railZ, lampPost } from './props.js';

export default {
  id: 'yard',
  name: 'STEEL YARD',
  blurb: 'Industrial training compound. A two-level warehouse, container lanes and a raised catwalk.',
  bounds: { minX: -42.6, maxX: 42.6, minZ: -42.6, maxZ: 42.6 },
  ground: 'groundYard', groundMat: 'concrete',
  sky: [0x6f8fae, 0xc9d1d5, 0x8a9196],
  fog: { color: 0xadb8bd, density: 0.0078 },
  sun: { color: 0xffecd0, intensity: 2.0, pos: [-36, 66, 24], shadow: 50 },
  hemi: { sky: 0xc8d6e4, ground: 0x6b6a5c, intensity: 1.2 },
  ambience: 'yard',
  barrels: [[-12, 19], [16, -9], [21, 30], [-30, -28], [3, -30]],
  spawns: {
    ffa: [[-36, 36], [36, 36], [-38, 22], [38, 12], [0, 38], [-14, 39], [16, 39], [-38, -10], [38, -2], [-22, -40.5], [24, -40], [0, -40.5],
      [-10, -22], [11, -32], [-37, -30], [12, 8], [-12, 4], [19, 2], [-30, 18], [30, 26]],
    teams: [
      [[-36, 36], [36, 36], [0, 38], [-14, 39], [16, 39], [-24, 34], [28, 30], [8, 40], [-38, 22]],
      [[-10, -22], [11, -32], [-37, -30], [-22, -40.5], [24, -40], [0, -40.5], [39, -38], [-6, -30], [6, -20]],
    ],
  },
  pickups: [
    { type: 'health', x: -18, y: 0, z: 17 }, { type: 'health', x: 17, y: 0, z: 29 }, { type: 'health', x: 33, y: 2.6, z: -27 },
    { type: 'health', x: -12, y: 3.4, z: -35 },
    { type: 'ammo', x: -33, y: 0, z: -33 }, { type: 'ammo', x: 0, y: 0, z: 1 }, { type: 'ammo', x: -25, y: 3.0, z: 6 }, { type: 'ammo', x: 20, y: 0, z: -38 },
  ],
  build(b) {
    // ---- perimeter ----
    b.solid(0, 0, -43.5, 88.4, 7, 1.4, 'wall'); b.solid(0, 0, 43.5, 88.4, 7, 1.4, 'wall');
    b.solid(-43.5, 0, 0, 1.4, 7, 88.4, 'wall'); b.solid(43.5, 0, 0, 1.4, 7, 88.4, 'wall');
    for (let i = -40; i <= 40; i += 8) {
      b.deco(i, 0, 42.72, 0.7, 7.2, 0.25, 'concreteDark'); b.deco(i, 0, -42.72, 0.7, 7.2, 0.25, 'concreteDark');
      b.deco(42.72, 0, i, 0.25, 7.2, 0.7, 'concreteDark'); b.deco(-42.72, 0, i, 0.25, 7.2, 0.7, 'concreteDark');
    }
    b.deco(0, 7, -43.5, 88.6, 0.25, 1.6, 'metalDark'); b.deco(0, 7, 43.5, 88.6, 0.25, 1.6, 'metalDark');
    b.deco(-43.5, 7, 0, 1.6, 0.25, 88.6, 'metalDark'); b.deco(43.5, 7, 0, 1.6, 0.25, 88.6, 'metalDark');
    for (const [x, z] of [[-39, 39], [39, 39], [-39, -39], [39, -39]]) lampPost(b, x, z, 10);

    // ---- warehouse (x -16..16, z -38..-12) ----
    b.solid(0, 0, -38, 33, 7.5, 1, 'wall');
    b.solid(-16, 0, -28.25, 1, 7.5, 19.5, 'wall'); b.solid(16, 0, -28.25, 1, 7.5, 19.5, 'wall');
    b.solid(-11.25, 0, -12, 10.5, 7.5, 1, 'wall'); b.solid(11.25, 0, -12, 10.5, 7.5, 1, 'wall');
    b.solid(0, 5.2, -12, 12, 2.3, 1, 'wall');
    b.deco(0, 5.05, -11.4, 12.4, 0.18, 0.3, 'metalDark');
    b.solid(0, 7.5, -25, 34, 0.45, 28, 'metalDark');
    for (let x = -14; x <= 14; x += 4) b.deco(x, 7.1, -25, 0.25, 0.4, 26, 'metal');
    b.deco(0, 0, -25, 31, 0.012, 25, 'concreteDark');
    b.deco(0, 0, -11.2, 12, 0.014, 0.5, 'hazard');
    for (const sx of [-1, 1]) b.deco(sx * 16, 0, -15.5, 1.3, 0.014, 6, 'hazard');
    for (const z of [-30, -19]) { b.deco(0, 6.9, z, 2.4, 0.12, 0.7, 'lamp'); b.deco(0, 7.02, z, 2.6, 0.12, 0.85, 'black'); }
    b.light(0, 6.4, -30, 0xffdcaa, 1.4, 26); b.light(0, 6.4, -18, 0xffdcaa, 1.2, 22);
    // mezzanine along back wall, top at 3.4
    b.solid(-5.75, 3.15, -34.5, 19.5, 0.25, 6, 'steel');
    for (const x of [-15, -9, -3, 3]) b.solid(x, 0, -31.8, 0.35, 3.15, 0.35, 'metalDark');
    railX(b, -15.5, -8, -31.55, 3.4); railX(b, -6.5, 4, -31.55, 3.4);
    railZ(b, -35, -31.5, 4.05, 3.4);
    b.stairs(4, 11, -37.5, -35, 'x', 3.4, 0, 'steel');
    b.deco(7.5, 0, -34.95, 7, 0.1, 0.08, 'black');
    // interior cover
    crate(b, -8, -23, 2.6, 2.6); crate(b, -8, -23, 1.4, 1.3, 2.6);
    container(b, 8, -25, 2.6, 6, 'contOrange', 0, 2.7);
    crate(b, 0, -34, 2.4, 1.5); crate(b, -12, -27.5, 2, 1.4);
    barrier(b, -2, -18, 4.5);
    barrel(b, 12, -16); barrel(b, 12.7, -16.6); barrel(b, 12.2, -17.3);
    sandbags(b, 10, -21, 3.2, true);

    // ---- east catwalk (top 2.6) with ramp from the south ----
    b.solid(33, 2.35, -23.25, 10.8, 0.25, 15.5, 'steel');
    for (const x of [28.0, 38.0]) for (const z of [-30.5, -25.5, -20.5, -16]) b.solid(x, 0, z, 0.3, 2.35, 0.3, 'metalDark');
    b.solid(27.7, 2.6, -27.5, 0.14, 0.95, 7, 'metal'); b.solid(27.7, 2.6, -18.75, 0.14, 0.95, 6.5, 'metal');
    b.solid(33, 2.6, -30.93, 10.8, 0.95, 0.14, 'metal'); b.solid(38.33, 2.6, -23.25, 0.14, 0.95, 15.5, 'metal');
    b.deco(27.7, 3.55, -23.25, 0.1, 0.06, 15.5, 'black');
    b.ramp(29.6, 36.4, -15.5, -4.7, 'z', 2.6, 0, 'steel');
    b.deco(29.55, 0, -10.1, 0.1, 1.4, 10.8, 'black'); b.deco(36.45, 0, -10.1, 0.1, 1.4, 10.8, 'black');
    crate(b, 33, -26, 1.6, 1.2);

    // ---- container lanes ----
    container(b, 25, 17, 6, 13, 'contOrange', 0, 3.1);
    container(b, 25, 19, 6, 8, 'contRed', 3.1, 3.0);
    container(b, 25, -6, 6, 10, 'contGreen', 0, 3.1);
    container(b, -32, -20, 6, 9, 'contGreen', 0, 3.1);
    container(b, 14, 33, 12, 2.6, 'contRed', 0, 2.9);
    // west container stack reachable by stairs
    container(b, -25, 3, 7, 15, 'contBlue', 0, 3.0);
    b.stairs(-21.5, -19.3, -2, 10.5, 'z', 3.0, 0, 'metal');
    b.deco(-19.25, 0, 4.25, 0.08, 1.1, 12.5, 'black');
    sandbags(b, -25, -3.4, 4.2, false, 3.0);

    // ---- courtyard cover ----
    crate(b, -7, 12, 2.7, 2.5); crate(b, -3.2, 13.6, 2.2, 1.45); crate(b, 10, 13, 3, 2.3); crate(b, -9, -1, 3.2, 1.5);
    crate(b, 9, -3, 3, 2); crate(b, -23, 26, 3.4, 2); crate(b, 4, 33, 2.5, 1.9); crate(b, 32, 32, 3, 2);
    crate(b, -35, -4, 3, 2); crate(b, 0, 23, 2, 1.2); crate(b, 18, -38.5, 2.5, 2.5); crate(b, -38.5, 30, 2.4, 2.4);
    barrier(b, 0, 7, 6.5); barrier(b, 13, 25, 7); barrier(b, -15, 31, 6); barrier(b, 36, 4, 7, true);
    barrier(b, -35, 15, 7, true); barrier(b, -24, -38, 5); barrier(b, 23, -34, 7); barrier(b, -20, -12, 5, true);
    sandbags(b, -9, 25, 4); sandbags(b, 7, -8, 4); sandbags(b, 30, -37, 4, true); sandbags(b, -31, 35, 4, true); sandbags(b, 19, 8, 3.2, true);
    barrel(b, -16, 20); barrel(b, -15.3, 20.5); barrel(b, 36, 22); barrel(b, 36.6, 21.4); barrel(b, -38, -16);

    // ---- ground paint ----
    for (let i = -2; i <= 2; i++) b.deco(i * 9, 0, 13, 0.25, 0.012, 50, 'paint');
    for (let x = -8; x <= 8; x += 4) b.deco(x, 0, 20, 2.4, 0.012, 0.25, 'paint');
    b.deco(0, 0, -6, 70, 0.012, 0.25, 'paint');

    // ---- distant skyline (no collision) ----
    for (let i = 0; i < 70; i++) {
      const xx = Math.sin(i * 12.9) * 88, zz = Math.cos(i * 9.3) * 80;
      if (Math.abs(xx) < 50 && Math.abs(zz) < 50) continue;
      b.deco(xx, 0, zz, 3 + (i % 7) * 2.2, 5 + (i % 6) * 3.5, 4 + (i % 5) * 2, 'skyline');
    }
    for (const [x, z, r] of [[-70, -60, 0.4], [65, -75, -0.3]]) {
      b.deco(x, 0, z, 1.2, 34, 1.2, 'skyline'); b.deco(x + Math.cos(r) * 10, 33, z + Math.sin(r) * 10, 24, 1, 1, 'skyline', { rot: r });
    }
  },
};
