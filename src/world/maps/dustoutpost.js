import * as THREE from 'three';
import { crate, sandbags, barrel, wallX, wallZ, palm } from './props.js';

const D = 1.6, DOOR = 2.35; // door width / lintel height

function house(b, cx, cz, w, d, doors, wins = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, h = 3.2, t = 0.5;
  const g = (side) => [...(doors[side] || []).map((o) => ({ a: o - D / 2, b: o + D / 2, top: DOOR })), ...(wins[side] || []).map((o) => ({ a: o - 1, b: o + 1, win: [1.1, 2.0] }))];
  wallX(b, x0 - t / 2, x1 + t / 2, z0, h, t, 'adobe', g('n'));
  wallX(b, x0 - t / 2, x1 + t / 2, z1, h, t, 'adobe', g('s'));
  wallZ(b, z0 + t / 2, z1 - t / 2, x0, h, t, 'adobe', g('w'));
  wallZ(b, z0 + t / 2, z1 - t / 2, x1, h, t, 'adobe', g('e'));
  b.solid(cx, h, cz, w + 0.7, 0.28, d + 0.7, 'adobeDark');
  b.deco(cx, h + 0.28, cz, w + 0.5, 0.35, 0.3, 'adobeTrim'); // roof ridge detail
  for (let i = -w / 2 + 0.8; i < w / 2; i += 1.6) b.deco(cx + i, h - 0.35, z0 - t / 2 - 0.12, 0.14, 0.14, 0.5, 'woodDark'); // vigas
}

export default {
  id: 'outpost',
  name: 'DUST OUTPOST',
  blurb: 'Desert village at dusk. Tight alleys, a market street and rooftop sightlines.',
  bounds: { minX: -36.6, maxX: 36.6, minZ: -36.6, maxZ: 36.6 },
  ground: 'groundSand', groundMat: 'sand',
  sky: [0x5f8dbd, 0xf0d0a2, 0xc9ad85],
  fog: { color: 0xe0c9a3, density: 0.0105 },
  sun: { color: 0xffd39c, intensity: 2.4, pos: [55, 38, -30], shadow: 42 },
  hemi: { sky: 0xffe8c8, ground: 0x9b7a52, intensity: 1.0 },
  ambience: 'desert',
  barrels: [[-11, 15], [11, -15.5], [-17, -27], [20, 24]],
  spawns: {
    ffa: [[-33, -14], [-33, 10], [33, -10], [33, 14], [-10, -33], [12, -33], [-12, 33], [10, 33], [-33, 33], [33, -33],
      [-24, 22], [24, -22], [0, -27], [0, 31], [-20, -31], [20, 31], [-33, -33], [33, 33]],
    teams: [
      [[-33, -14], [-33, 10], [-33, 33], [-24, 22], [-26, -4], [-33, -2], [-20, -31], [-12, 33], [-33, -33]],
      [[33, -10], [33, 14], [33, -33], [24, -22], [26, 6], [33, 2], [20, 31], [12, -33], [33, 33]],
    ],
  },
  pickups: [
    { type: 'health', x: -3, y: 0, z: 2 }, { type: 'health', x: -24, y: 0, z: 22 }, { type: 'health', x: 24, y: 0, z: -22 }, { type: 'health', x: 28, y: 4.6, z: 28 },
    { type: 'ammo', x: 2, y: 3.9, z: -2 }, { type: 'ammo', x: -26, y: 0, z: -4 }, { type: 'ammo', x: 26, y: 0, z: 6 }, { type: 'ammo', x: 0, y: 0, z: 21.5 },
    { type: 'ammo', x: -28, y: 4.6, z: -28 },
  ],
  build(b) {
    // ---- perimeter walls with crenellations ----
    b.solid(0, 0, -37.4, 76, 5, 1.2, 'adobe'); b.solid(0, 0, 37.4, 76, 5, 1.2, 'adobe');
    b.solid(-37.4, 0, 0, 1.2, 5, 76, 'adobe'); b.solid(37.4, 0, 0, 1.2, 5, 76, 'adobe');
    for (let i = -36; i <= 36; i += 2.4) {
      b.deco(i, 5, -37.4, 1.1, 0.55, 1.2, 'adobeTrim'); b.deco(i, 5, 37.4, 1.1, 0.55, 1.2, 'adobeTrim');
      b.deco(-37.4, 5, i, 1.2, 0.55, 1.1, 'adobeTrim'); b.deco(37.4, 5, i, 1.2, 0.55, 1.1, 'adobeTrim');
    }

    // ---- command building (roof at 3.9, reachable by east stairs) ----
    const t = 0.6, h = 3.6;
    wallX(b, -6.3, 6.3, -5, h, t, 'adobe', [{ a: -1.2, b: 1.2, top: DOOR }]);
    wallX(b, -6.3, 6.3, 5, h, t, 'adobe', [{ a: -1.2, b: 1.2, top: DOOR }]);
    wallZ(b, -4.7, 4.7, -6, h, t, 'adobe', [{ a: -1.2, b: 1.2, win: [1.1, 2.1] }]);
    wallZ(b, -4.7, 4.7, 6, h, t, 'adobe');
    b.solid(0, h, 0, 12.6, 0.3, 10.6, 'adobeDark');
    // parapets (top of roof 3.9)
    b.solid(1.1, 3.9, -5.12, 14.8, 0.9, 0.36, 'adobeTrim');
    b.solid(0, 3.9, 5.12, 12.6, 0.9, 0.36, 'adobeTrim');
    b.solid(-6.12, 3.9, 0, 0.36, 0.9, 9.9, 'adobeTrim');
    b.solid(6.12, 3.9, 1.25, 0.36, 0.9, 7.7, 'adobeTrim');
    b.solid(7.4, 3.65, -4.05, 2.2, 0.25, 2.5, 'adobeDark');
    b.solid(8.33, 3.9, -4.05, 0.36, 0.9, 2.5, 'adobeTrim');
    b.stairs(6.3, 8.5, -2.8, 5.6, 'z', 3.9, 0, 'adobeTrim');
    b.deco(0, 1.2, -5.32, 3, 1.1, 0.06, 'cloth2'); // banner over north door
    crate(b, 3.5, -2.5, 1.6, 1.2); crate(b, -3.6, -2.6, 1.8, 1.0);
    b.solid(3, 0, 2.6, 2.4, 0.85, 1.1, 'wood');
    b.light(0, 3.1, 0, 0xffc98a, 0.9, 12);
    b.deco(0, 3.35, 0, 0.5, 0.2, 0.5, 'lamp');

    // ---- watchtowers (platform 4.6) ----
    const tower = (cx, cz, stairsNorth) => {
      b.solid(cx, 4.35, cz, 5, 0.25, 5, 'woodDark');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.solid(cx + sx * 2.3, 0, cz + sz * 2.3, 0.35, 4.35, 0.35, 'trunk'); b.solid(cx + sx * 2.3, 4.6, cz + sz * 2.3, 0.25, 2.6, 0.25, 'trunk'); }
      b.solid(cx, 7.2, cz, 5.6, 0.2, 5.6, 'woodDark');
      const zN = cz - 2.45, zS = cz + 2.45;
      // railings (solid wood half-walls) leaving the stair side open
      b.solid(cx - 2.45, 4.6, cz, 0.15, 1.0, 5, 'wood'); b.solid(cx + 2.45, 4.6, cz, 0.15, 1.0, 5, 'wood');
      const open = stairsNorth ? zN : zS, closed = stairsNorth ? zS : zN;
      b.solid(cx, 4.6, closed, 5, 1.0, 0.15, 'wood');
      b.solid(cx - 1.9, 4.6, open, 1.2, 1.0, 0.15, 'wood'); b.solid(cx + 1.9, 4.6, open, 1.2, 1.0, 0.15, 'wood');
      if (stairsNorth) b.stairs(cx - 1.25, cx + 1.25, cz - 12, cz - 2.5, 'z', 0, 4.6, 'woodDark');
      else b.stairs(cx - 1.25, cx + 1.25, cz + 2.5, cz + 12, 'z', 4.6, 0, 'woodDark');
      b.deco(cx, 5.6, cz, 0.05, 0.6, 0.05, 'black');
    };
    tower(-28, -28, false);
    tower(28, 28, true);

    // ---- houses ----
    house(b, -24, 22, 10, 8, { n: [-24], e: [22] }, { s: [-26.5] });
    house(b, 24, -22, 10, 8, { s: [24], w: [-22] }, { n: [26] });
    house(b, -26, -4, 8, 10, { e: [-4], n: [-26] }, { w: [-1] });
    house(b, 26, 6, 8, 10, { w: [6], s: [26] }, { e: [3] });
    crate(b, -27, 24.5, 1.5, 1.3); crate(b, 27, -24.5, 1.5, 1.3); crate(b, -28.5, -7.5, 1.4, 1.2); crate(b, 28.5, 9.3, 1.4, 1.2);

    // ---- market street (south) ----
    for (const [x, cloth] of [[-8, 'cloth1'], [0, 'cloth3'], [8, 'cloth2']]) {
      b.solid(x, 0, 18, 3, 0.9, 1.2, 'wood');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.solid(x + sx * 1.55, 0, 18 + sz * 1.35, 0.14, 2.45, 0.14, 'trunk');
      b.deco(x, 2.42, 18, 3.5, 0.05, 3.1, cloth);
      b.geom(new THREE.BoxGeometry(0.5, 0.35, 0.5), 'woodDark', x - 0.8, 1.07, 18);
      b.geom(new THREE.BoxGeometry(0.6, 0.3, 0.45), 'woodDark', x + 0.7, 1.05, 18.1);
    }
    crate(b, -12, 24, 1.8, 1.6); crate(b, -10.2, 24.4, 1.2, 1.0); crate(b, 12, 23, 2, 1.8);
    // cart
    b.solid(-3, 0.45, 25, 3.2, 0.8, 1.7, 'wood'); b.deco(-3, 1.25, 25, 3.2, 0.5, 0.08, 'woodDark');
    for (const sx of [-1, 1]) b.geom(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), 'woodDark', -3 + sx * 0.6, 0.5, 25 + 0.92, Math.PI / 2, 0, 0);
    barrel(b, 5, 26); barrel(b, 5.7, 26.4); barrel(b, 15.5, 18);

    // ---- north plaza ----
    b.geom(new THREE.CylinderGeometry(1.5, 1.6, 0.9, 16), 'adobeTrim', 0, 0.45, -17);
    b.geom(new THREE.CylinderGeometry(1.15, 1.15, 0.92, 16), 'adobeDark', 0, 0.47, -17);
    b.col(0, 0, -17, 2.9, 0.9, 2.9, 'adobe');
    for (const sx of [-1, 1]) { b.solid(sx * 0.95, 0.9, -17, 0.12, 1.5, 0.12, 'woodDark'); }
    b.deco(0, 2.4, -17, 2.1, 0.12, 0.12, 'woodDark');
    b.solid(-10, 0, -14, 6, 1.15, 0.7, 'adobe'); b.solid(10, 0, -14, 6, 1.15, 0.7, 'adobe');
    sandbags(b, 0, -26, 4); sandbags(b, -18, -20, 3.2, true); sandbags(b, 18, 20, 3.2, true);

    // ---- lane dividers ----
    b.solid(-14, 0, -8, 0.7, 2.8, 12, 'adobe'); b.solid(14, 0, 8, 0.7, 2.8, 12, 'adobe');
    b.solid(-14, 0, 8, 0.7, 1.2, 6, 'adobeDark'); b.solid(14, 0, -8, 0.7, 1.2, 6, 'adobeDark');
    b.solid(-20, 0, 12, 6, 2.6, 0.7, 'adobe'); b.solid(20, 0, -12, 6, 2.6, 0.7, 'adobe');
    crate(b, -9, 6, 2.2, 1.4); crate(b, 9, -7, 2.2, 1.4); crate(b, -20, -14, 2, 2); crate(b, 20, 15, 2, 2);
    barrel(b, -15.2, -1.2); barrel(b, 15.3, 1.5); barrel(b, -31, 30); barrel(b, 31, -30);

    palm(b, -16, -26, 6, 0.12, 1); palm(b, 16, 26, 5.6, 0.14, 2); palm(b, -32, 18, 5.2, 0.1, 3); palm(b, 31, -16, 6.2, 0.1, 4);

    // ---- distant dunes / ridgeline ----
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2, r = 70 + (i % 5) * 9;
      b.deco(Math.cos(a) * r, 0, Math.sin(a) * r, 14 + (i % 4) * 5, 4 + (i % 7) * 2.2, 10 + (i % 3) * 6, 'skylineDesert', { rot: a });
    }
  },
};
