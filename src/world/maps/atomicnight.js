// Atomic Acres at night (3f): the same streets under a moon, street lamps and lit windows; darker fog, shorter sight lines.
import * as THREE from 'three';
import atomic from './atomicacres.js';
import { lampPost } from './props.js';

const LAMPS = [[-6, -5], [6, 5], [-6, 9], [6, -9], [-20, -1], [20, 1]];
export default {
  ...atomic,
  id: 'atomicnight', name: 'ATOMIC ACRES · NIGHT',
  blurb: 'The test town after dark. Street lamps pool light on the road; the yards and houses are shadows. Muzzle flashes give you away.',
  sky: [0x0b1222, 0x1c2840, 0x141a24], cloudTint: '#3a4660',
  fog: { color: 0x101827, density: 0.022 },
  sun: { color: 0x9fb4ff, intensity: 0.75, pos: [-35, 60, -20], shadow: 36 },
  hemi: { sky: 0x31405e, ground: 0x1d1a16, intensity: 0.75 },
  ambience: 'night', exposure: 0.62,
  build(b) {
    atomic.build(b);
    for (const [x, z] of LAMPS) lampPost(b, x, z, 6);
  },
  // warm pools of light under the lamps (few point lights, no shadows: cheap)
  after(group) {
    for (const [x, z] of LAMPS.slice(0, 4)) { const l = new THREE.PointLight(0xffc477, 6, 18, 2); l.position.set(x, 5.6, z); group.add(l); }
    const glow = new THREE.SpriteMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [x, z] of LAMPS) { const s = new THREE.Sprite(glow); s.position.set(x, 5.85, z); s.scale.set(1.6, 1.6, 1); group.add(s); }
  },
};
