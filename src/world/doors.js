// Sliding doors (train boxcars). A door is a panel that slides along X between closed (covering the opening) and open.
// It is a dynamic box in G.world.dynamic, so it blocks units (physics.blocked) and bullets (physics.rayWorld).
// E toggles the nearest door; bots open a closed door they walk into. Units in the way get pushed out (depenetrate).
import * as THREE from 'three';
import { G } from '../core/state.js';
import { material } from './builder.js';
import { play } from '../engine/audio.js';
import * as hud from '../ui/hud.js';
import { keyName } from '../ui/hud.js';

const SPEED = 2.2; // panel travel per second (fraction of the slide)

// called by loadMap with the builder's door specs: { x, y, z, w, h, t, slide, open, mat }
export function setupDoors(specs, group) {
  const w = G.world;
  w.doors = [];
  w.dynamic = (w.dynamic || []).filter((d) => !d.door);
  for (const s of specs || []) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.t), material(s.mat || 'boxcar'));
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    // ribs so it reads as a door
    for (const dx of [-s.w * 0.3, 0, s.w * 0.3]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, s.h, s.t + 0.04), material('steelRust')); r.position.x = dx; mesh.add(r); }
    const d = { ...s, t01: s.open ? 1 : 0, target: s.open ? 1 : 0, mesh };
    d.dyn = { door: d, x: s.x, z: s.z, yaw: 0, hw: s.w / 2, hd: s.t / 2 + 0.02, y0: s.y, y1: s.y + s.h, mat: 'metal' };
    w.dynamic.push(d.dyn); w.doors.push(d);
    place(d);
  }
}
function place(d) {
  const x = d.x + d.slide * d.t01;
  d.mesh.position.set(x, d.y + d.h / 2, d.z);
  d.dyn.x = x;
}

export function nearestDoor(u, range = 1.9) {
  const w = G.world; if (!w || !w.doors) return null;
  let best = null, bd = range;
  for (const d of w.doors) {
    if (u.y < d.y - 1 || u.y > d.y + d.h) continue;
    const dist = Math.hypot(u.x - d.x, (u.z - d.z) * 1.3); // the doorway, not the panel's current spot
    if (dist < bd) { bd = dist; best = d; }
  }
  return best;
}
export function toggleDoor(d, open = d.target < 0.5) {
  if (d.target === (open ? 1 : 0)) return;
  d.target = open ? 1 : 0;
  play('doorSlide', { x: d.x, y: d.y + 1, z: d.z }, { gain: 0.9 });
}
// E: returns true when it handled the key
export function doorInteract(u) { const d = nearestDoor(u); if (!d) return false; if (G.mp && G.mp.live && G.mp.client) G.mp.door(G.world.doors.indexOf(d)); else toggleDoor(d); return true; }

export function updateDoors(dt) {
  const w = G.world; if (!w || !w.doors || !w.doors.length) return;
  for (const d of w.doors) {
    if (d.t01 !== d.target) { d.t01 = d.target > d.t01 ? Math.min(d.target, d.t01 + SPEED * dt) : Math.max(d.target, d.t01 - SPEED * dt); place(d); }
  }
  // bots open a closed door they are pressing against
  for (const b of G.bots) {
    if (!b.alive || b.isPlayer) continue;
    const d = nearestDoor(b, 1.25); if (d && d.target < 0.5) toggleDoor(d, true);
  }
  const P = G.player;
  if (P && P.alive && !P.vehicle && G.state === 'playing') {
    const d = nearestDoor(P);
    if (d) hud.prompt(`<kbd>${keyName('interact')}</kbd> ${d.target > 0.5 ? 'Close' : 'Open'} door`);
  }
}
