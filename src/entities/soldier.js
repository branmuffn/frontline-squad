import * as THREE from 'three';
import { G } from '../core/state.js';

const std = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.9, metalness: o.m ?? 0 }); m.color.convertSRGBToLinear(); return m; };
const BOX = new THREE.BoxGeometry(1, 1, 1);
const HELMET = new THREE.SphereGeometry(1, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55);

function part(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, hit = true) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; parent.add(m);
  return m;
}

function gunModel(parent, id0, mat) {
  const g = new THREE.Group(); parent.add(g);
  const id = { barrett: 'l96', spas12: 'm870' }[id0] || id0;
  if (id === 'knife') { part(g, mat, 0.03, 0.03, 0.12, 0, -0.1, 0.1); part(g, mat, 0.01, 0.04, 0.2, 0, -0.1, -0.06); return g; }
  if (id === 'm249') { part(g, mat, 0.08, 0.12, 0.6, 0, 0, -0.16); part(g, mat, 0.035, 0.035, 0.3, 0, 0.01, -0.6); part(g, mat, 0.1, 0.1, 0.12, -0.08, -0.06, -0.12); part(g, mat, 0.055, 0.09, 0.24, 0, -0.02, 0.2); return g; }
  if (id === 'l96') {
    part(g, mat, 0.07, 0.1, 0.62, 0, 0, -0.18); part(g, mat, 0.035, 0.035, 0.5, 0, 0.01, -0.7);
    part(g, mat, 0.05, 0.05, 0.3, 0, 0.1, -0.15); part(g, mat, 0.07, 0.14, 0.26, 0, -0.04, 0.2);
  } else if (id === 'm870') {
    part(g, mat, 0.07, 0.09, 0.42, 0, 0, -0.12); part(g, mat, 0.045, 0.045, 0.45, 0, 0.01, -0.52);
    part(g, mat, 0.065, 0.06, 0.18, 0, -0.04, -0.42); part(g, mat, 0.06, 0.12, 0.26, 0, -0.03, 0.18);
  } else if (id === 'mp5') {
    part(g, mat, 0.06, 0.1, 0.42, 0, 0, -0.12); part(g, mat, 0.03, 0.03, 0.14, 0, 0.01, -0.39);
    part(g, mat, 0.04, 0.16, 0.06, 0, -0.12, -0.16, 0.25); part(g, mat, 0.04, 0.06, 0.2, 0, 0, 0.18);
  } else {
    part(g, mat, 0.065, 0.1, 0.55, 0, 0, -0.16); part(g, mat, 0.03, 0.03, 0.22, 0, 0.01, -0.53);
    part(g, mat, 0.045, 0.17, 0.07, 0, -0.12, -0.18, 0.15); part(g, mat, 0.055, 0.09, 0.24, 0, -0.02, 0.2);
    part(g, mat, 0.04, 0.04, 0.08, 0, 0.08, -0.1);
  }
  return g;
}

// opts: { uniform, accent, helmet, skin, weapon, heavy, noHelmet }
export function makeSoldier(opts) {
  const mats = {
    uni: std(opts.uniform), acc: std(opts.accent), skin: std(opts.skin ?? 0xb08c70), helm: std(opts.helmet ?? 0x34403d),
    gear: std(0x23292b), gun: std(0x1a1d20, { r: 0.6, m: 0.3 }), boot: std(0x2a2520),
  };
  const root = new THREE.Group();
  const pose = new THREE.Group(); root.add(pose);
  const hips = new THREE.Group(); hips.position.y = 0.86; pose.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(s * 0.12, 0, 0); hips.add(thigh);
    part(thigh, mats.uni, 0.19, 0.45, 0.23, 0, -0.21, 0);
    const knee = new THREE.Group(); knee.position.y = -0.43; thigh.add(knee);
    part(knee, mats.uni, 0.17, 0.42, 0.2, 0, -0.2, 0);
    part(knee, mats.boot, 0.19, 0.12, 0.3, 0, -0.39, -0.05);
    part(knee, mats.gear, 0.19, 0.12, 0.08, 0, -0.06, -0.11); // knee pad
    legs.push({ thigh, knee });
  }
  const torso = new THREE.Group(); hips.add(torso);
  part(torso, mats.uni, 0.48, 0.52, 0.28, 0, 0.27, 0);
  part(torso, mats.acc, 0.52, 0.34, 0.33, 0, 0.32, 0); // plate carrier (team / identity color)
  part(torso, mats.gear, 0.5, 0.08, 0.31, 0, 0.03, 0);
  part(torso, mats.gear, 0.12, 0.12, 0.08, -0.12, 0.27, -0.18); part(torso, mats.gear, 0.12, 0.12, 0.08, 0.12, 0.27, -0.18); // pouches
  part(torso, mats.gear, 0.32, 0.3, 0.14, 0, 0.3, 0.2); // pack
  const head = new THREE.Group(); head.position.y = 0.56; torso.add(head);
  part(head, mats.skin, 0.22, 0.25, 0.24, 0, 0.13, 0);
  part(head, mats.gear, 0.2, 0.06, 0.04, 0, 0.17, -0.12);
  if (!opts.noHelmet) {
    const helm = new THREE.Mesh(HELMET, mats.helm); helm.scale.set(0.165, 0.15, 0.175); helm.position.y = 0.2; helm.castShadow = true; head.add(helm);
  } else part(head, mats.helm, 0.24, 0.07, 0.26, 0, 0.27, 0.01);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.29, 0.5, 0); torso.add(sh);
    part(sh, mats.uni, 0.13, 0.3, 0.14, 0, -0.14, 0);
    const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
    part(el, mats.uni, 0.12, 0.28, 0.12, 0, -0.13, 0);
    part(el, mats.gear, 0.1, 0.1, 0.11, 0, -0.29, 0);
    arms.push({ sh, el });
  }
  // rifle-ready arm pose
  arms[1].sh.rotation.set(-0.95, 0, 0.12); arms[1].el.rotation.set(-0.7, 0, 0);
  arms[0].sh.rotation.set(-1.25, 0.5, -0.25); arms[0].el.rotation.set(-0.35, 0, 0);
  const gun = gunModel(torso, opts.weapon, mats.gun);
  gun.position.set(0.06, 0.33, -0.34);
  if (opts.heavy) root.scale.setScalar(1.1);
  G.scene.add(root);
  return { root, pose, hips, torso, head, legs, arms, gun, mats, flinch: 0, deathT: -1, deathDir: 1 };
}

export function setFlash(s, amount, color = 0x9a2a1c) {
  for (const k in s.mats) { const m = s.mats[k]; if (amount > 0) { m.emissive.setHex(color).convertSRGBToLinear(); m.emissiveIntensity = amount; } else m.emissiveIntensity = 0; }
}

// Animate a soldier from its unit state each frame
export function animateSoldier(s, u, dt) {
  const r = s.root;
  r.position.set(u.x, u.y, u.z);
  r.rotation.y = u.yaw;
  if (s.deathT >= 0) {
    s.deathT += dt;
    const t = Math.min(1, s.deathT / 0.55), e = 1 - Math.pow(1 - t, 3);
    s.pose.rotation.x = e * 1.45 * s.deathDir;
    s.pose.rotation.z = e * 0.25 * s.deathDir;
    s.pose.position.y = -e * 0.05;
    s.legs[0].thigh.rotation.x = -e * 0.5; s.legs[1].thigh.rotation.x = e * 0.3;
    s.arms[0].sh.rotation.z = -0.25 - e * 0.9; s.arms[1].sh.rotation.z = 0.12 + e * 0.9;
    if (s.deathT > 2.4) r.position.y = u.y - Math.min(1.2, (s.deathT - 2.4) * 0.9);
    return;
  }
  const crouch = u.crouchT || 0;
  const speed = Math.min(1.4, (u.moveSpeed || 0) / 5);
  u.walkPhase = (u.walkPhase || 0) + dt * (4 + speed * 7) * (speed > 0.05 ? 1 : 0);
  const sw = Math.sin(u.walkPhase) * 0.62 * speed * (1 - crouch * 0.6);
  for (let i = 0; i < 2; i++) {
    const L = s.legs[i], ph = i ? sw : -sw;
    L.thigh.rotation.x = ph + crouch * 1.2;
    L.knee.rotation.x = -Math.max(0, Math.sin(u.walkPhase + (i ? 0 : Math.PI))) * 0.8 * speed - crouch * 2.0;
  }
  s.hips.position.y = 0.86 - crouch * 0.42 + Math.abs(Math.sin(u.walkPhase)) * 0.03 * speed;
  s.flinch = Math.max(0, s.flinch - dt * 6);
  s.torso.rotation.x = -crouch * 0.25 + (u.aimPitch || 0) * 0.7 + s.flinch * 0.35;
  s.torso.rotation.y = Math.sin(u.walkPhase) * 0.06 * speed;
  s.head.rotation.x = (u.aimPitch || 0) * 0.3;
  s.pose.rotation.set(0, 0, 0); s.pose.position.y = 0;
}

// hitFromFront: attacker was in front of the victim -> fall backwards
export function startDeath(s, hitFromFront) {
  s.deathT = 0;
  s.deathDir = hitFromFront ? 1 : -1;
}

export function disposeSoldier(s) {
  G.scene.remove(s.root);
  for (const k in s.mats) s.mats[k].dispose();
}
