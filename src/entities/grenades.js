import { explodeNearVehicles } from './vehicles.js';
import * as THREE from 'three';
import { G } from '../core/state.js';
import { GRENADE, EXPLOSIONS } from '../core/config.js';
import { query, losClear, supportHeight } from '../world/physics.js';
import { damage, noise, isEnemy } from './units.js';
import { play } from '../engine/audio.js';
import { explosion } from '../engine/fx.js';
import { nearbyBarrels, damageBarrel } from './worldprops.js';

export const grenades = [];
const GEO = new THREE.SphereGeometry(0.075, 10, 8);
const MAT = new THREE.MeshStandardMaterial({ color: 0x4e5a36, roughness: 0.7 });
MAT.color.convertSRGBToLinear();

export function throwGrenade(owner, x, y, z, vx, vy, vz, fuse) {
  if (G.mp) G.mp.spawnEv('gr', owner, [x, y, z, vx, vy, vz, fuse]);
  const mesh = new THREE.Mesh(GEO, MAT); mesh.castShadow = true;
  mesh.position.set(x, y, z); G.scene.add(mesh);
  grenades.push({ owner, x, y, z, vx, vy, vz, explodeAt: G.now + fuse, mesh, lastBounce: 0, rest: false });
}

function inside(x, y, z, r) {
  for (const c of query(x - r, x + r, z - r, z + r)) {
    if (x > c.minX - r && x < c.maxX + r && y > c.minY - r && y < c.maxY + r && z > c.minZ - r && z < c.maxZ + r) return c;
  }
  return null;
}

export function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    if (G.now >= g.explodeAt) { explode(g.x, g.y, g.z, g.owner, 'frag'); G.scene.remove(g.mesh); grenades.splice(i, 1); continue; }
    if (g.rest) continue;
    const steps = 4, h = dt / steps, r = 0.075;
    for (let s = 0; s < steps; s++) {
      g.vy -= 19 * (G.gravMul || 1) * h;
      const nx = g.x + g.vx * h, ny = g.y + g.vy * h, nz = g.z + g.vz * h;
      let bounced = false;
      const c = inside(nx, ny, nz, r);
      if (c) {
        // reflect along the axis we entered through
        const wasX = g.x > c.minX - r && g.x < c.maxX + r, wasY = g.y > c.minY - r && g.y < c.maxY + r, wasZ = g.z > c.minZ - r && g.z < c.maxZ + r;
        if (!wasY) { g.vy = -g.vy * 0.35; g.vx *= 0.7; g.vz *= 0.7; }
        else if (!wasX) { g.vx = -g.vx * 0.4; g.vz *= 0.8; }
        else if (!wasZ) { g.vz = -g.vz * 0.4; g.vx *= 0.8; }
        else { g.vx = -g.vx * 0.3; g.vz = -g.vz * 0.3; g.vy = Math.abs(g.vy) * 0.2; }
        bounced = true;
      } else {
        const floor = supportHeight(nx, nz, 0.05, g.y + 0.05) + r;
        if (ny < floor) { g.y = floor; g.vy = -g.vy * 0.32; g.vx *= 0.68; g.vz *= 0.68; bounced = true; g.x = nx; g.z = nz; }
        else { g.x = nx; g.y = ny; g.z = nz; }
      }
      const b = G.world.bounds;
      if (g.x < b.minX || g.x > b.maxX) { g.vx = -g.vx * 0.4; g.x = Math.max(b.minX, Math.min(b.maxX, g.x)); bounced = true; }
      if (g.z < b.minZ || g.z > b.maxZ) { g.vz = -g.vz * 0.4; g.z = Math.max(b.minZ, Math.min(b.maxZ, g.z)); bounced = true; }
      if (bounced && Math.hypot(g.vx, g.vy, g.vz) > 2 && G.now - g.lastBounce > 0.08) { g.lastBounce = G.now; play('bounce', g); }
    }
    if (Math.hypot(g.vx, g.vy, g.vz) < 0.35 && Math.abs(g.vy) < 0.5) { g.rest = true; g.vx = g.vy = g.vz = 0; }
    g.mesh.position.set(g.x, g.y, g.z);
    g.mesh.rotation.x += dt * Math.hypot(g.vx, g.vz) * 3; g.mesh.rotation.z += dt * 4;
  }
}

// kind: 'frag' | 'mortar'
export function explode(x, y, z, owner, kind = 'frag') {
  const E = EXPLOSIONS[kind] || EXPLOSIONS.frag, R = E.R, maxD = E.D;
  explosion(x, y, z, E.big);
  play('explosion', { x, y, z }, { important: true, range: 160, ref: 12 });
  noise(x, y, z, 45, owner);
  for (const u of G.units) {
    if (!u.alive) continue;
    if (owner && u !== owner && !isEnemy(owner, u)) continue;
    const cy = u.y + u.h * 0.6, d = Math.hypot(u.x - x, cy - y, u.z - z);
    if (d > R) continue;
    if (!losClear(x, y + 0.25, z, u.x, cy, u.z) && !losClear(x, y + 0.25, z, u.x, u.y + u.h - 0.15, u.z)) continue;
    const dmg = maxD * Math.pow(1 - d / R, 1.15) + 8;
    damage(u, dmg, owner, { weapon: kind, explosive: true, sx: x, sz: z, noStreak: kind === 'mortar' });
  }
  nearbyBarrels(x, y, z, R, (c, d) => damageBarrel(c, maxD * (1 - d / R) + 10, owner, true));
  explodeNearVehicles(x, y, z, R, maxD, owner);
  const p = G.player;
  if (p) { const d = Math.hypot(p.x - x, p.y + 1.6 - y, p.z - z); if (d < 30) G.shake = Math.min(0.09, (G.shake || 0) + 0.08 * (1 - d / 30)); }
}

export function clearGrenades() { for (const g of grenades) G.scene.remove(g.mesh); grenades.length = 0; }
