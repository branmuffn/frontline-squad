import * as THREE from 'three';
import { G } from '../core/state.js';
import { rayWorld, rayUnits } from '../world/physics.js';
import { isEnemy } from './units.js';
import { explode } from './grenades.js';
import { play } from '../engine/audio.js';
import { trail } from '../engine/fx.js';

export const rockets = [];
let GEO = null, MAT = null;

export function fireRocket(owner, x, y, z, dx, dy, dz, speed = 55) {
  if (!GEO) {
    const body = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8); body.rotateX(Math.PI / 2);
    GEO = body; MAT = new THREE.MeshStandardMaterial({ color: 0x4e5a36, roughness: 0.7 }); MAT.color.convertSRGBToLinear();
  }
  const mesh = new THREE.Mesh(GEO, MAT); mesh.position.set(x, y, z); G.scene.add(mesh);
  rockets.push({ owner, x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, mesh, life: 5 });
}

export function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.vy -= 2.5 * dt; r.life -= dt;
    const sp = Math.hypot(r.vx, r.vy, r.vz), len = sp * dt, dx = r.vx / sp, dy = r.vy / sp, dz = r.vz / sp;
    const wh = rayWorld(r.x, r.y, r.z, dx, dy, dz, len);
    const uh = rayUnits(r.x, r.y, r.z, dx, dy, dz, wh ? wh.t : len, (u) => u === r.owner || !isEnemy(r.owner, u));
    if (uh || wh || r.life <= 0) {
      const t = uh ? uh.t : wh ? wh.t : 0;
      explode(r.x + dx * (t - 0.15), r.y + dy * (t - 0.15), r.z + dz * (t - 0.15), r.owner, 'rpg');
      G.scene.remove(r.mesh); rockets.splice(i, 1); continue;
    }
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
    r.mesh.position.set(r.x, r.y, r.z); r.mesh.lookAt(r.x + dx, r.y + dy, r.z + dz);
    trail(r.x - dx * 0.4, r.y - dy * 0.4, r.z - dz * 0.4);
  }
}
export function clearRockets() { for (const r of rockets) G.scene.remove(r.mesh); rockets.length = 0; }
