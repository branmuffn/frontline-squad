// Harbour (3f): a container port at dawn. Stacked containers with stairs to their roofs in the middle, two gantry
// cranes, warehouses at each end, a cargo ship moored along the north quay (gangway to its deck). Team A west, team B east.
import { crate, container, lampPost } from './props.js';

const C = ['contOrange', 'contBlue', 'contGreen', 'contRed', 'contGray'];
function stairs(b, x0, x1, z0, z1, h, axis = 'x') { b.ramp(x0, x1, z0, z1, axis, 0, h, 'steelRust'); }
function warehouse(b, cx, sx) { // shell 14 x 18, doorway facing the middle, roof walk via stairs inside
  const w = 14, d = 18, h = 6, t = 0.4, ix = cx + sx * (w / 2 - t / 2);
  b.solid(cx - sx * (w / 2 - t / 2), 0, 0, t, h, d, 'metalDark'); // back wall
  b.solid(cx, 0, d / 2 - t / 2, w, h, t, 'metalDark'); b.solid(cx, 0, -d / 2 + t / 2, w, h, t, 'metalDark');
  b.solid(ix, 0, -5.5, t, h, 7, 'metalDark'); b.solid(ix, 0, 5.5, t, h, 7, 'metalDark'); b.solid(ix, 3.2, 0, t, h - 3.2, 4, 'metalDark'); // door 4 m
  b.deco(cx, h, 0, w, 0.15, d, 'steel');
  for (const z of [-5, 0, 5]) crate(b, cx - sx * 3.5, z, 1.6, 1.4);
  container(b, cx - sx * 0.5, 6, 2.4, 5, C[(cx > 0) + 2]);
}
export default {
  id: 'harbour', name: 'HARBOUR',
  blurb: 'Container port at dawn. Climb the stacks for height, fight through the crane yard, or take the ship’s deck.',
  bounds: { minX: -46, maxX: 46, minZ: -34, maxZ: 36 },
  ground: 'groundYard', groundMat: 'concrete',
  sky: [0x6d8fb8, 0xf2c9a0, 0xa7a49a], cloudTint: '#f1dccf',
  fog: { color: 0xc9c2b8, density: 0.012 },
  sun: { color: 0xffd2a8, intensity: 2.1, pos: [-60, 30, 25], shadow: 48 },
  hemi: { sky: 0xd8e2ee, ground: 0x6e6a60, intensity: 1.0 },
  ambience: 'yard',
  water: [{ minX: -46, maxX: 46, minZ: 24, maxZ: 36, top: 0.3 }],
  barrels: [[-14, -12], [14, 12], [-4, 18], [4, -20]],
  spawns: {
    ffa: [[-40, -28], [-40, 0], [-40, 18], [40, 28], [40, 0], [40, -18], [-20, -28], [14, 22], [0, -28], [0, 4], [-24, 10], [24, -10], [-10, -18], [12, 14], [-28, -14], [28, 14]],
    teams: [
      [[-40, -28], [-40, -14], [-40, 0], [-40, 12], [-40, 18], [-34, -28], [-34, 18], [-30, -6]],
      [[40, 28], [40, 14], [40, 0], [40, -12], [40, -18], [34, 20], [34, -26], [30, 6]],
    ],
  },
  pickups: [
    { type: 'health', x: 0, y: 0, z: -24 }, { type: 'health', x: -24, y: 0, z: 18 }, { type: 'health', x: 24, y: 0, z: -18 },
    { type: 'ammo', x: -13, y: 0, z: -4 }, { type: 'ammo', x: 13, y: 0, z: 4 }, { type: 'ammo', x: 0, y: 0, z: 12 },
  ],
  build(b) {
    // quay edge + ship along the north (water beyond z 24)
    b.deco(0, 0.01, 30, 92, 0.02, 12, 'water');
    b.solid(0, -1, 24.2, 92, 1.0, 0.4, 'concreteDark');
    for (let x = -42; x <= 42; x += 6) b.solid(x, 0, 23.6, 0.45, 0.55, 0.45, 'black'); // bollards
    b.solid(4, 0, 30, 46, 4, 7, 'contRed'); b.deco(4, 4, 30, 46, 0.12, 7, 'metalDark'); // hull + deck
    b.solid(-16, 4, 30, 6, 4, 6, 'wall'); b.solid(-16, 8, 30, 4, 1.5, 4, 'wall'); // bridge tower
    stairs(b, -2, 2, 24.6, 26.6, 4, 'z'); b.solid(0, 0, 25.6, 4, 0.2, 2.2, 'steelRust'); // gangway up to the deck
    for (const x of [10, 18]) container(b, x, 30, 2.4, 5.5, C[x % 5], 4);
    b.solid(26, 4, 30, 0.3, 1.0, 7, 'steelRust'); b.solid(-18, 4, 26.6, 40, 1.0, 0.25, 'steelRust', { pass: true }); // railings
    // crane yard: two gantry cranes over the stacks
    for (const x of [-12, 12]) {
      for (const z of [-14, 16]) b.solid(x - 5, 0, z, 0.7, 14, 0.7, 'paint'), b.solid(x + 5, 0, z, 0.7, 14, 0.7, 'paint');
      b.solid(x, 14, 1, 11, 1.0, 1.0, 'paint'); b.solid(x - 5, 14, 1, 0.8, 1, 31, 'paint'); b.solid(x + 5, 14, 1, 0.8, 1, 31, 'paint');
      b.deco(x, 10, 1, 0.12, 4, 0.12, 'black'); b.deco(x, 9.6, 1, 2.6, 0.4, 1.2, 'hazard');
    }
    // container stacks (ground rows + a second tier reached by stairs)
    const rows = [[-20, -18], [-20, -6], [-6, -12], [-6, 2], [6, -2], [6, 12], [20, 6], [20, 18]];
    rows.forEach(([x, z], i) => { container(b, x, z, 2.4, 6, C[i % 5]); container(b, x + 3.2, z + 1, 2.4, 6, C[(i + 2) % 5]); });
    for (const [x, z, i] of [[-20, -6, 0], [6, -2, 1], [20, 6, 2], [-6, 2, 3]]) container(b, x, z, 2.4, 6, C[(i + 3) % 5], 2.9);
    stairs(b, -24.6, -21.4, -10.5, -3.5, 2.9, 'z'); stairs(b, 1.4, 4.6, -6.5, 0.5, 2.9, 'z'); stairs(b, 15.4, 18.6, 2.5, 9.5, 2.9, 'z'); stairs(b, -10.6, -7.4, -1.5, 5.5, 2.9, 'z');
    // loose cover
    for (const [x, z] of [[-30, -20], [30, 20], [-30, 8], [30, -8], [-2, -26], [2, 20], [-14, 10], [14, -10]]) crate(b, x, z, 1.6, 1.3);
    // warehouses at both ends
    warehouse(b, -38, -1); warehouse(b, 38, 1);
    for (const [x, z] of [[-26, -30], [26, -30], [-26, 22], [26, 22]]) lampPost(b, x, z, 8);
    // south fence line
    b.solid(0, 0, -33.6, 92, 2.6, 0.3, 'steelRust', { pass: true });
  },
};
