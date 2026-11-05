// Snowbound radar base (3f, large, vehicles): a radar dome on a raised central plateau, a lattice mast, two fenced
// compounds (barracks, fuel tanks, motor pool) at the south (team A) and north (team B) ends, snow drifts as cover.
import * as THREE from 'three';
import { crate, container, sandbags, lampPost } from './props.js';

function hut(b, cx, cz, w, d, door, mat = 'metalDark') { // walls with a 3 m door on the side facing the middle (door = +1 / -1 in z)
  const h = 3.4, t = 0.35;
  b.solid(cx - w / 2 + t / 2, 0, cz, t, h, d, mat); b.solid(cx + w / 2 - t / 2, 0, cz, t, h, d, mat);
  b.solid(cx, 0, cz - door * (d / 2 - t / 2), w, h, t, mat);
  const fz = cz + door * (d / 2 - t / 2), side = (w - 3) / 2;
  b.solid(cx - 1.5 - side / 2, 0, fz, side, h, t, mat); b.solid(cx + 1.5 + side / 2, 0, fz, side, h, t, mat); b.solid(cx, 2.4, fz, 3, h - 2.4, t, mat);
  b.deco(cx, h, cz, w + 0.4, 0.25, d + 0.4, 'snow');
}
function tank(b, x, z) { // fuel tank: lathe visual + fitted collision
  const g = new THREE.CylinderGeometry(2.2, 2.2, 4, 18); b.geom(g, 'wall', x, 2, z); b.col(x, 0, z, 4.1, 4, 2.6, 'metal'); b.col(x, 0, z, 2.6, 4, 4.1, 'metal'); b.col(x, 0, z, 3.6, 4, 3.6, 'metal'); // octagon-ish
  b.deco(x, 4, z, 3.2, 0.1, 3.2, 'snow');
}
function drift(b, x, z, w, d, h) { // low snow drift: two ramps + a flat top (cover when crouched, walkable)
  b.ramp(x - w / 2, x - w / 2 + 1.4, z - d / 2, z + d / 2, 'x', 0, h, 'snow'); b.ramp(x + w / 2 - 1.4, x + w / 2, z - d / 2, z + d / 2, 'x', h, 0, 'snow');
  b.solid(x, 0, z, w - 2.8, h, d, 'snow');
}
export default {
  id: 'radar', name: 'SNOWBOUND RADAR BASE',
  blurb: 'A big, cold listening post. Hold the radar dome on its plateau, raid the compounds, or bring vehicles across the open snow.',
  bounds: { minX: -64, maxX: 64, minZ: -50, maxZ: 50 },
  ground: 'groundSnow', groundMat: 'sand',
  sky: [0x8fa9c4, 0xe4ecf2, 0xc9d3db], cloudTint: '#eef3f7',
  fog: { color: 0xdbe4ec, density: 0.011 },
  sun: { color: 0xfff4e6, intensity: 2.0, pos: [40, 55, -30], shadow: 60 },
  hemi: { sky: 0xe6eef6, ground: 0xc4ccd2, intensity: 1.15 },
  ambience: 'snow',
  barrels: [[-30, -36], [30, 36], [-8, -20], [8, 20]],
  spawns: {
    ffa: [[-50, -42], [50, 42], [-50, 42], [50, -42], [-56, 0], [56, 0], [0, -44], [0, 44], [-30, -14], [30, 14], [-28, 20], [28, -20], [-26, 0], [26, 0], [-44, -22], [44, 22]],
    teams: [
      [[-20, -44], [-10, -44], [0, -44], [10, -44], [20, -44], [-28, -38], [28, -38], [0, -36]],
      [[20, 44], [10, 44], [0, 44], [-10, 44], [-20, 44], [28, 38], [-28, 38], [0, 36]],
    ],
  },
  objectives: [[-34, -8], [0, 0, 3], [34, 8]],
  pickups: [
    { type: 'health', x: 0, y: 3, z: -6 }, { type: 'health', x: -40, y: 0, z: 10 }, { type: 'health', x: 40, y: 0, z: -10 },
    { type: 'ammo', x: 0, y: 3, z: 6 }, { type: 'ammo', x: -22, y: 0, z: -30 }, { type: 'ammo', x: 22, y: 0, z: 30 },
  ],
  vehicles: [
    { x: -36, z: -42, yaw: Math.PI / 2 }, { x: 36, z: 42, yaw: -Math.PI / 2 },
    { type: 'atv', x: -44, z: -34, yaw: Math.PI }, { type: 'atv', x: 44, z: 34, yaw: 0 },
    { type: 'heli', x: -52, z: -30, yaw: 0 }, { type: 'kestrel', x: 52, z: 30, yaw: Math.PI },
  ],
  vehicleRoutes: [
    { type: 'jeep', pts: [[-36, -42], [-52, -10], [-40, 26], [0, 30], [40, 26], [52, -10], [36, -42], [0, -30]] },
    { type: 'heli', alt: 22, pts: [[-50, -36], [0, -34], [50, -36], [50, 36], [0, 34], [-50, 36]] },
  ],
  build(b) {
    // central plateau (y 3) with ramps on all four sides, the dome and the mast on top
    b.solid(0, 0, 0, 28, 3, 22, 'concreteDark'); b.deco(0, 3, 0, 28, 0.06, 22, 'snow');
    b.ramp(-22, -14, -5, 5, 'x', 0, 3, 'concrete'); b.ramp(14, 22, -5, 5, 'x', 3, 0, 'concrete');
    b.ramp(-4, 4, -19, -11, 'z', 0, 3, 'concrete'); b.ramp(-4, 4, 11, 19, 'z', 3, 0, 'concrete');
    b.solid(-6, 3, 0, 8, 2.2, 8, 'wall'); const dome = new THREE.SphereGeometry(4.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    b.geom(dome, 'wall', -6, 5.2, 0);
    for (const [y0, y1] of [[0, 1.4], [1.4, 2.6], [2.6, 3.5], [3.5, 4.2]]) { const r = Math.sqrt(4.2 * 4.2 - y0 * y0) * 0.97; b.col(-6, 5.2 + y0, 0, r * 2, y1 - y0, r * 2, 'metal'); } // stacked boxes inside the dome
    b.solid(8, 3, 4, 1.6, 14, 1.6, 'steelRust'); b.deco(8, 17, 4, 4, 0.3, 0.6, 'steelRust'); b.deco(8, 17.3, 4, 0.2, 1.4, 0.2, 'redLamp');
    for (const [x, z] of [[9, -6], [4, -8], [-12, 8], [-12, -8]]) crate(b, x, z, 1.6, 1.3, 3);
    sandbags(b, 6, 9, 4, false, 3); sandbags(b, 6, -9.5, 4, false, 3); sandbags(b, 12, 0, 4, true, 3);
    // the two compounds (mirrored): fence, barracks, fuel tanks, motor pool
    for (const s of [-1, 1]) {
      const cz = s * 38;
      b.solid(0, 0, s * 49.6, 128, 3, 0.3, 'steelRust', { pass: true });
      hut(b, -18 * s, cz, 12, 8, -s); hut(b, 16 * s, cz + s * 2, 9, 7, -s, 'concreteDark');
      tank(b, -34 * s, s * 44); tank(b, -40 * s, s * 38);
      container(b, 4 * s, s * 30, 6, 2.4, 'contGray'); container(b, -6 * s, s * 26, 2.4, 6, 'contGreen');
      sandbags(b, 24 * s, s * 26, 5); sandbags(b, -26 * s, s * 24, 5);
      lampPost(b, -8 * s, s * 34, 7); lampPost(b, 30 * s, s * 34, 7);
    }
    // open field cover: snow drifts and a few rocks
    for (const [x, z, w, d, h] of [[-34, -8, 7, 3, 1.1], [34, 8, 7, 3, 1.1], [-30, 14, 6, 3, 1], [30, -14, 6, 3, 1], [-48, 6, 5, 4, 1.2], [48, -6, 5, 4, 1.2], [0, -26, 8, 3, 1], [0, 26, 8, 3, 1]]) drift(b, x, z, w, d, h);
    for (const [x, z] of [[-20, 20], [20, -20], [-46, -18], [46, 18]]) crate(b, x, z, 2.2, 1.8, 0, 'rockDark');
  },
};
