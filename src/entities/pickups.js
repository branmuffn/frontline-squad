import * as THREE from 'three';
import { G } from '../core/state.js';
import { PICKUP } from '../core/config.js';
import { play } from '../engine/audio.js';
import { pickupAmmo } from './player.js';
import * as hud from '../ui/hud.js';

export const pickups = [];
let built = null;

function mesh(type) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0x23292c, roughness: 0.6 }));
  base.position.y = 0.11; base.castShadow = true; g.add(base);
  if (type === 'health') {
    const m = new THREE.MeshStandardMaterial({ color: 0xe9ece6, emissive: 0x2a4a34, emissiveIntensity: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.36), m); box.position.y = 0.37; g.add(box);
    const cm = new THREE.MeshBasicMaterial({ color: 0x3fbf6a });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.31, 0.24), cm); c1.position.set(0, 0.37, 0); c1.scale.set(1, 1.01, 1.02); g.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.31, 0.08), cm); c2.position.set(0, 0.37, 0); c2.scale.set(1, 1.01, 1.02); g.add(c2);
  } else {
    const m = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.34), m); box.position.y = 0.38; g.add(box);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.06, 0.35), new THREE.MeshBasicMaterial({ color: 0xe0b35a })); stripe.position.y = 0.42; g.add(stripe);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 24), new THREE.MeshBasicMaterial({ color: type === 'health' ? 0x5fe08a : 0xf0c060, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.traverse((o) => { if (o.material && o.material.color) o.material.color.convertSRGBToLinear(); });
  return g;
}

export function buildPickups() {
  clearPickups();
  for (const d of G.world.pickups) {
    const g = mesh(d.type); g.position.set(d.x, d.y, d.z); G.scene.add(g);
    pickups.push({ ...d, g, available: true, respawnAt: 0 });
  }
  built = G.world.id;
}
export function clearPickups() { for (const p of pickups) G.scene.remove(p.g); pickups.length = 0; }
export function resetPickups() {
  if (built !== G.world.id) buildPickups();
  const off = !!(G.match && G.match.hook && G.match.hook.noPickups); // Zombies uses these spots for buy stations
  for (const p of pickups) { p.available = !off; p.g.visible = !off; p.respawnAt = off ? Infinity : 0; }
}

function take(p, u) {
  if (p.type === 'health') {
    if (u.health >= u.maxHealth) return false;
    u.health = Math.min(u.maxHealth, u.health + PICKUP.health);
    if (u.isPlayer) { hud.notice(`Medkit +${PICKUP.health} HP`); }
  } else if (u.isPlayer) {
    pickupAmmo(); hud.notice('Ammo resupplied');
  } else if (u.brain) u.brain.mag = u.brain.magMax;
  p.available = false; p.g.visible = false; p.respawnAt = G.now + PICKUP.respawn;
  play('pickup', u.isPlayer ? null : { x: p.x, y: p.y, z: p.z }, { gain: u.isPlayer ? 1 : 0.5 });
  return true;
}

export function updatePickups(dt) {
  for (const p of pickups) {
    if (!p.available) { if (G.now >= p.respawnAt) { p.available = true; p.g.visible = true; } continue; }
    p.g.position.y = p.y + 0.06 + Math.sin(G.realTime * 2.2 + p.x) * 0.06;
    p.g.rotation.y += dt * 0.9;
    for (const u of G.units) {
      if (!u.alive || Math.abs(u.y - p.y) > 1.2) continue;
      if (Math.hypot(u.x - p.x, u.z - p.z) < 1.15 && take(p, u)) break;
    }
  }
}
