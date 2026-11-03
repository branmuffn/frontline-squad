import * as THREE from 'three';
import { G } from '../core/state.js';
import { WEAPONS } from '../core/config.js';
import { explode } from './grenades.js';
import { gunModel } from './soldier.js';
import { play } from '../engine/audio.js';
import { trail } from '../engine/fx.js';
import { takeWeapon, pickupSlot } from './player.js';
import * as hud from '../ui/hud.js';
import { keyName } from '../ui/hud.js';

// ---------- explosive barrels ----------
let barrelMeshes = [], BGEO = null, BMATS = null;
const pending = [];
function barrelMesh() {
  if (!BGEO) {
    BGEO = new THREE.CylinderGeometry(0.33, 0.33, 1.0, 14);
    BMATS = [new THREE.MeshStandardMaterial({ color: 0xa3281c, roughness: 0.5, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0xd9a21e, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 })];
    for (const m of BMATS) m.color.convertSRGBToLinear();
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(BGEO, BMATS[0]); body.position.y = 0.5; body.castShadow = true; g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.16, 14), BMATS[1]); band.position.y = 0.55; g.add(band);
  for (const y of [0.18, 0.86]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.04, 14), BMATS[2]); r.position.y = y; g.add(r); }
  return g;
}

export function resetWorldProps() {
  for (const m of barrelMeshes) G.scene.remove(m);
  barrelMeshes = []; pending.length = 0;
  for (const c of G.world.barrelCols || []) {
    c.minY = c.home; c.maxY = c.home + 1.0; c.hp = 35; c.dead = false; c.burnUntil = 0; c.lastAttacker = null;
    const m = barrelMesh(); m.position.set((c.minX + c.maxX) / 2, c.home, (c.minZ + c.maxZ) / 2); G.scene.add(m);
    c.mesh = m; barrelMeshes.push(m);
  }
  clearDrops();
}

export function damageBarrel(c, dmg, attacker) {
  if (c.dead) return;
  c.hp -= dmg; if (attacker) c.lastAttacker = attacker;
  if (c.hp <= 0) { c.dead = true; pending.push({ c, at: G.now + 0.12 }); }
  else if (c.hp < 22 && !c.burnUntil) { c.burnUntil = G.now + 2.6; play('ricochet', { x: c.minX + 0.33, y: c.home + 0.8, z: c.minZ + 0.33 }, { gain: 0.6 }); }
}

export function nearbyBarrels(x, y, z, R, fn) {
  for (const c of G.world.barrelCols || []) {
    if (c.dead) continue;
    const d = Math.hypot((c.minX + c.maxX) / 2 - x, c.home + 0.5 - y, (c.minZ + c.maxZ) / 2 - z);
    if (d < R) fn(c, d);
  }
}

// ---------- dropped weapons ----------
export const drops = [];
let ringGeo = null, ringMat = null, gunMat = null;
export function clearDrops() { for (const d of drops) G.scene.remove(d.mesh); drops.length = 0; hud.prompt(''); }

export function dropWeapon(id, x, y, z, ammo) {
  const w = WEAPONS[id]; if (!w || w.melee) return;
  if (!ringGeo) {
    ringGeo = new THREE.RingGeometry(0.42, 0.5, 20);
    ringMat = new THREE.MeshBasicMaterial({ color: 0xe0b35a, transparent: true, opacity: 0.6, depthWrite: false });
    gunMat = new THREE.MeshStandardMaterial({ color: 0x1d2124, roughness: 0.45, metalness: 0.55 }); gunMat.color.convertSRGBToLinear();
  }
  const g = new THREE.Group();
  const gun = gunModel(g, id, gunMat); gun.rotation.set(0, 0, Math.PI / 2); gun.position.y = 0.06; gun.scale.setScalar(1.15);
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  g.position.set(x, y, z); g.rotation.y = Math.random() * 6.28; G.scene.add(g);
  drops.push({ id, x, y, z, mesh: g, until: G.now + 30, ammo: ammo || { mag: w.mag, res: Math.round(w.reserve * 0.5) } });
  while (drops.length > 10) G.scene.remove(drops.shift().mesh);
}

export function removeDrop(d) { G.scene.remove(d.mesh); const i = drops.indexOf(d); if (i >= 0) drops.splice(i, 1); }

function nearestDrop() {
  const P = G.player; if (!P || !P.alive) return null;
  let best = null, bd = 1.7;
  for (const d of drops) { const dist = Math.hypot(d.x - P.x, d.z - P.z); if (dist < bd && Math.abs(d.y - P.y) < 1.2) { bd = dist; best = d; } }
  return best;
}

export function tryPickup() {
  const d = nearestDrop(); if (!d) return;
  const P = G.player, slot = pickupSlot(d.id), old = P.weapons[slot];
  if (old === d.id) { P.ammo[old].res = Math.max(P.ammo[old].res, d.ammo.res + d.ammo.mag); hud.setAmmo(P); }
  else {
    const oldAmmo = P.ammo[old];
    takeWeapon(d.id, d.ammo);
    if (old && !WEAPONS[old].melee) dropWeapon(old, P.x, P.y + 0.02, P.z, oldAmmo);
  }
  G.scene.remove(d.mesh); drops.splice(drops.indexOf(d), 1);
  play('pickup');
}

export function updateWorldProps(dt) {
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i]; if (G.now < p.at) continue;
    pending.splice(i, 1);
    const c = p.c, x = (c.minX + c.maxX) / 2, z = (c.minZ + c.maxZ) / 2, y = c.home;
    c.minY = c.maxY = -100; // collider off
    if (c.mesh) c.mesh.visible = false;
    explode(x, y + 0.5, z, c.lastAttacker, 'barrel');
  }
  for (const c of G.world.barrelCols || []) {
    if (c.dead || !c.burnUntil) continue;
    const x = (c.minX + c.maxX) / 2, z = (c.minZ + c.maxZ) / 2;
    if (Math.random() < 0.5) trail(x + (Math.random() - 0.5) * 0.3, c.home + 1.05, z + (Math.random() - 0.5) * 0.3);
    if (G.now > c.burnUntil) { c.dead = true; pending.push({ c, at: G.now }); }
  }
  let near = null;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (G.now > d.until) { G.scene.remove(d.mesh); drops.splice(i, 1); continue; }
    d.mesh.children[d.mesh.children.length - 1].material.opacity = 0.35 + 0.25 * Math.sin(G.realTime * 4);
  }
  near = nearestDrop();
  if (!(G.match && G.match.hook && G.match.hook.prompting)) hud.prompt(near ? `<kbd>${keyName('interact')}</kbd> Pick up ${WEAPONS[near.id].name}` : '');
}
