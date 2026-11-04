// Rev 3b gear: grenade types (frag, flashbang, smoke, sticky), the claymore, vests and belts.
// Smoke clouds block bots' sight; flashbangs blind the local player (white-out) and stun bots; claymores are directional
// mines. In multiplayer the host owns claymores (mirrored to everyone); flash and smoke run locally from mirrored grenades.
import * as THREE from 'three';
import { G } from '../core/state.js';
import { VESTS, BELTS } from '../core/config.js';
import { losClear, supportHeight, blocked } from '../world/physics.js';
import { damage, isEnemy, noise } from './units.js';
import { play } from '../engine/audio.js';
import { explosion } from '../engine/fx.js';
import * as hud from '../ui/hud.js';

// ---------- vests and belts (applied at every spawn) ----------
export function applyGear(u, lo) {
  u.vest = VESTS[lo.vest] ? lo.vest : 'standard'; u.belt = BELTS[lo.belt] ? lo.belt : 'none';
  u.nade = ['frag', 'flash', 'smoke', 'sticky'].includes(lo.grenade) ? lo.grenade : 'frag'; u.equip = lo.equip === 'claymore' ? 'claymore' : 'none';
  u.speedMul = VESTS[u.vest].speed; u.equipLeft = u.equip === 'claymore' ? 1 : 0;
  if (u.belt === 'grenadier') u.grenades += 1;
  if (u.belt === 'bandolier' && u.ammo) for (const id in u.ammo) u.ammo[id].res = Math.round(u.ammo[id].res * 1.5);
}
// damage taken through a vest (headshots ignore it)
export const vestMul = (u, info) => (u.vest === 'heavy' && !info.headshot ? (info.explosive ? 0.88 : 0.8) : 1);

// ---------- smoke ----------
export const smokes = [];
let smokeTex = null;
function tex() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(210,212,214,0.95)'); gr.addColorStop(0.6, 'rgba(190,194,196,0.55)'); gr.addColorStop(1, 'rgba(180,184,186,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (smokeTex = new THREE.CanvasTexture(c));
}
export function smokeCloud(x, y, z) {
  const grp = new THREE.Group(), parts = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(), transparent: true, depthWrite: false, opacity: 0 }));
    const a = i * 2.4, r = 0.4 + (i % 4) * 0.7; m.position.set(Math.cos(a) * r, 0.6 + (i % 5) * 0.55, Math.sin(a) * r); grp.add(m); parts.push(m);
  }
  grp.position.set(x, y, z); G.scene.add(grp);
  smokes.push({ x, y: y + 1.4, z, t0: G.now, until: G.now + 13, r: 0, grp, parts });
  play('bounce', { x, y, z }, { gain: 0.6 }); noise(x, y, z, 12, null);
}
export function smokeBlocks(ax, ay, az, bx, by, bz) {
  for (const s of smokes) {
    if (s.r < 1.2) continue;
    const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / L2));
    if (Math.hypot(ax + dx * t - s.x, ay + dy * t - s.y, az + dz * t - s.z) < s.r * 0.85) return true;
  }
  return false;
}

// ---------- flashbang ----------
export function flashbang(x, y, z, owner) {
  explosion(x, y, z, 0.35); play('explosion', { x, y, z }, { gain: 0.55, range: 90 });
  for (const u of G.units) {
    if (!u.alive) continue;
    const ey = u.y + (u.eye || 1.55), d = Math.hypot(u.x - x, ey - y, u.z - z);
    if (d > 16 || !losClear(x, y + 0.2, z, u.x, ey, u.z)) continue;
    const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), facing = ((x - u.x) * fx + (z - u.z) * fz) / (Math.hypot(x - u.x, z - u.z) || 1);
    const k = Math.min(1, (1 - d / 16) * 1.3) * (0.45 + 0.55 * Math.max(0, facing));
    if (u === G.player && !(G.mp && G.mp.live && G.mp.client && false)) hud.flash(k);
    if (u.brain && (!owner || isEnemy(owner, u) || u === owner)) { u.brain.stunUntil = Math.max(u.brain.stunUntil || 0, G.now + 0.6 + 3.2 * k); }
  }
}

// ---------- claymores ----------
export const claymores = [];
const host = () => (G.mp && G.mp.live && G.mp.host ? G.mp : null);
let clKey = 0, clGeo = null, clMat = null;
function clMesh(x, y, z, yaw) {
  if (!clGeo) { clGeo = new THREE.BoxGeometry(0.26, 0.16, 0.06); clMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4e5a36).convertSRGBToLinear(), roughness: 0.8 }); }
  const g = new THREE.Group(), body = new THREE.Mesh(clGeo, clMat); body.position.y = 0.16; body.rotation.x = -0.25; body.castShadow = true; g.add(body);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.14, 0.015), clMat); leg.position.set(s * 0.09, 0.06, 0.02); g.add(leg); }
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0xff3a28 })); led.position.set(0.08, 0.22, -0.04); g.add(led);
  g.position.set(x, y, z); g.rotation.y = yaw; G.scene.add(g); return g;
}
export function placeClaymore(owner, x, y, z, yaw, key) {
  const mine = owner ? claymores.filter((c) => c.owner === owner) : [];
  if (mine.length >= 2) removeClaymore(mine[0], false);
  const c = { key: key || ++clKey, owner, x, y, z, yaw, armAt: G.now + 1.0, trip: 0, mesh: clMesh(x, y, z, yaw), ghost: !!key && !!(G.mp && G.mp.client) };
  claymores.push(c);
  const m = host(); if (m) m.bcast({ t: 'cl', k: c.key, p: [x, y, z, yaw].map((v) => Math.round(v * 100) / 100), o: owner ? owner.id : 0 });
  return c;
}
export function removeClaymore(c, boom) {
  const i = claymores.indexOf(c); if (i < 0) return; claymores.splice(i, 1); G.scene.remove(c.mesh);
  if (boom) { explosion(c.x, c.y + 0.3, c.z, 0.8); play('explosion', { x: c.x, y: c.y, z: c.z }, { important: true, range: 120 }); }
  const m = host(); if (m) m.bcast({ t: 'cl', k: c.key, x: boom ? 2 : 1 });
}
// player presses the equipment key (V): set a claymore down facing where you look
export function useEquipment(P) {
  if (!P || !P.alive || P.equip !== 'claymore' || !(P.equipLeft > 0) || !P.grounded || P.vehicle) { play('deny'); return; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let x = P.x + fx * 0.8, z = P.z + fz * 0.8;
  if (blocked(x, z, 0.2, P.y, 0.4)) { x = P.x; z = P.z; }
  const y = supportHeight(x, z, 0.2, P.y + 0.5);
  P.equipLeft--; play('switch'); hud.notice('Claymore set');
  if (G.mp && G.mp.live && G.mp.client) { G.mp.send({ t: 'clay', p: [x, y, z, P.yaw].map((v) => Math.round(v * 100) / 100) }); return; }
  placeClaymore(P, x, y, z, P.yaw);
}
export function netClaymore(m, owner) { // joiner: mirrored from the host
  if (m.p) placeClaymore(owner, m.p[0], m.p[1], m.p[2], m.p[3], m.k);
  else { const c = claymores.find((q) => q.key === m.k); if (c) { const i = claymores.indexOf(c); claymores.splice(i, 1); G.scene.remove(c.mesh); if (m.x === 2) { explosion(c.x, c.y + 0.3, c.z, 0.8); play('explosion', { x: c.x, y: c.y, z: c.z }, { important: true, range: 120 }); } } }
}
function detonate(c) {
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
  removeClaymore(c, true);
  for (const u of G.units) {
    if (!u.alive) continue;
    const dx = u.x - c.x, dz = u.z - c.z, d = Math.hypot(dx, dz), dot = (dx * fx + dz * fz) / (d || 1);
    if (d > 6.5 || Math.abs(u.y - c.y) > 2.2 || (dot < 0.25 && d > 1.2) || !losClear(c.x, c.y + 0.25, c.z, u.x, u.y + 0.9, u.z)) continue;
    damage(u, 170 * (1 - d / 6.5) + 25, c.owner, { weapon: 'claymore', explosive: true, sx: c.x, sz: c.z });
  }
}
export function updateGear(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i], age = G.now - s.t0, life = s.until - s.t0;
    s.r = Math.min(5, age * 2.6); const fade = Math.min(1, age / 0.8, (s.until - G.now) / 2.5);
    s.parts.forEach((p, j) => { p.material.opacity = Math.max(0, fade) * 0.85; const sc = 1.2 + s.r * (0.9 + (j % 3) * 0.2); p.scale.set(sc, sc, 1); p.position.y += dt * 0.05; });
    if (age > life) { G.scene.remove(s.grp); s.parts.forEach((p) => p.material.dispose()); smokes.splice(i, 1); }
  }
  if (G.mp && G.mp.live && G.mp.client) return; // the host decides claymores
  for (let i = claymores.length - 1; i >= 0; i--) {
    const c = claymores[i]; if (G.now < c.armAt) continue;
    if (c.trip) { if (G.now >= c.trip) detonate(c); continue; }
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    for (const u of G.units) {
      if (!u.alive || !c.owner || !isEnemy(c.owner, u)) continue;
      const dx = u.x - c.x, dz = u.z - c.z, d = Math.hypot(dx, dz);
      if (d < 3 && (dx * fx + dz * fz) / (d || 1) > 0.45 && Math.abs(u.y - c.y) < 1.5 && losClear(c.x, c.y + 0.25, c.z, u.x, u.y + 0.9, u.z)) { c.trip = G.now + 0.18; play('beep', { x: c.x, y: c.y, z: c.z }, { gain: 0.8 }); break; }
    }
  }
}
export function resetGear() {
  for (const s of smokes) G.scene.remove(s.grp); smokes.length = 0;
  for (const c of claymores) G.scene.remove(c.mesh); claymores.length = 0;
}
