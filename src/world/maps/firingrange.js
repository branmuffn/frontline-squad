// Practice range (mode "Practice range" only): a firing line, four lanes with target dummies at 10/25/50 m,
// a long lane out to 75/100 m, and a moving target track at 35 m. Coloured poles mark the distances.
import { crate, sandbags, lampPost } from './props.js';
const POLE = { 10: 'grass', 25: 'hazard', 50: 'paint', 75: 'carRed', 100: 'paintWhite' };
export const RANGE_TARGETS = [];
for (const x of [-12, -4, 4]) for (const d of [10, 25, 50]) RANGE_TARGETS.push({ x, z: 8 - d, d });
for (const d of [75, 100]) RANGE_TARGETS.push({ x: 12, z: 8 - d, d });
export const RANGE_MOVERS = [{ x0: -13, x1: 9, z: 8 - 35, speed: 2.4, d: 35 }, { x0: -13, x1: 9, z: 8 - 18, speed: 3.4, d: 18 }];
export default {
  id: 'range',
  name: 'PRACTICE RANGE',
  blurb: 'Firing line, lanes out to 100 m, moving targets.',
  hidden: true,
  bounds: { minX: -19.4, maxX: 19.4, minZ: -99, maxZ: 15 },
  ground: 'grass', groundMat: 'grass',
  sky: [0x6f8fae, 0xc9d1d5, 0x8a9196],
  fog: { color: 0xb4c0c4, density: 0.0028 },
  sun: { color: 0xffecd0, intensity: 2.0, pos: [-30, 70, 20], shadow: 60 },
  hemi: { sky: 0xc8d6e4, ground: 0x6b6a5c, intensity: 1.2 },
  ambience: 'yard',
  barrels: [],
  spawns: { ffa: [[0, 11], [-6, 11], [6, 11]], teams: [[[0, 11], [-6, 11]], [[0, 11], [6, 11]]] },
  pickups: [{ type: 'ammo', x: -16, y: 0, z: 12 }, { type: 'health', x: 16, y: 0, z: 12 }],
  build(b) {
    b.solid(0, 0, -100.5, 40, 9, 2, 'concrete'); b.solid(0, 0, 16.5, 40, 4, 2, 'concrete'); // backstop berm, rear wall
    b.solid(-20.5, 0, -42, 2, 4, 118, 'concrete'); b.solid(20.5, 0, -42, 2, 4, 118, 'concrete');
    b.solid(0, 0, 6.6, 34, 1.05, 0.5, 'woodDark'); // firing line bench (lean over it)
    for (const x of [-8, 0, 8]) b.deco(x, 0.01, -20, 0.08, 0.02, 52, 'paintWhite'); // lane lines
    for (const d of [10, 25, 50, 75, 100]) for (const x of [-18.5, 18.5]) { b.deco(x, 0, 8 - d, 0.18, 2.4, 0.18, POLE[d]); b.deco(x, 2.2, 8 - d, 0.5, 0.25, 0.5, POLE[d]); }
    b.solid(-2, 0, 8 - 35 - 1.2, 25, 0.35, 0.3, 'steel'); b.solid(-2, 0, 8 - 18 - 1.2, 25, 0.35, 0.3, 'steel'); // mover tracks (low rails)
    crate(b, -16, 12, 1.2, 1.0); sandbags(b, 15, 3, 4); lampPost(b, -17, 13); lampPost(b, 17, 13);
  },
};
