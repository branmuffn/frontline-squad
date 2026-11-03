import * as THREE from 'three';
import { G } from '../core/state.js';
import { STREAKS } from '../core/config.js';
import { rand, angleDiff, coneDir } from '../core/util.js';
import { rayWorld, rayUnits, losClear, blocked, supportHeight } from '../world/physics.js';
import { damage, isEnemy } from './units.js';
import { explode } from './grenades.js';
import { play } from '../engine/audio.js';
import { tracer, enemyFlash, impact } from '../engine/fx.js';
import * as hud from '../ui/hud.js';

export const streakState = { ready: [], uavUntil: 0, shells: [], sentries: [] };

export function resetStreaks() {
  streakState.ready.length = 0; streakState.uavUntil = 0; streakState.shells.length = 0;
  for (const s of streakState.sentries) G.scene.remove(s.mesh);
  streakState.sentries.length = 0;
  hud.setStreaks(0, streakState.ready);
}

export function checkStreak(n) {
  hud.setStreaks(n, streakState.ready);
  const s = STREAKS.find((q) => q.kills === n);
  if (!s) return;
  play('streak', null, { important: true });
  if (s.auto) {
    streakState.uavUntil = G.now + s.duration;
    hud.banner(s.name, 'Enemy positions on your radar');
    play('radio', null, { delay: 0.3 });
  } else {
    if (!streakState.ready.includes(s.id)) streakState.ready.push(s.id);
    hud.banner(s.name + ' ready', `Press ${hud.keyName('streak')} to deploy`);
  }
  hud.setStreaks(n, streakState.ready);
}

export function useStreak() {
  const p = G.player;
  if (!p || !p.alive || G.state !== 'playing' || !streakState.ready.length) { play('deny'); return; }
  const id = streakState.ready[0];
  const c = G.camera.position;
  const dir = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  if (id === 'mortar') {
    const h = rayWorld(c.x, c.y, c.z, dir.x, dir.y, dir.z, 160);
    if (!h) { hud.notice('Aim at the ground to mark the mortar target'); play('deny'); return; }
    for (let i = 0; i < 6; i++) {
      const a = rand(0, 6.28), r = rand(0, 6.5);
      const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
      streakState.shells.push({ x, z, at: G.now + 1.6 + i * 0.55 + rand(0, 0.25), whistled: false });
    }
    hud.notice('Mortar strike inbound');
    play('radio');
  } else if (id === 'sentry') {
    let x = p.x + dir.x * 2, z = p.z + dir.z * 2;
    if (blocked(x, z, 0.45, p.y, 1.2)) { x = p.x; z = p.z; }
    const y = supportHeight(x, z, 0.3, p.y + 0.5);
    streakState.sentries.push(makeSentry(x, y, z, p.yaw));
    hud.notice('Sentry gun deployed');
    play('switch');
  }
  streakState.ready.shift();
  hud.setStreaks(p.streak, streakState.ready);
}

function makeSentry(x, y, z, yaw) {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.6, metalness: 0.3 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), dark);
    const a = i / 3 * 6.283; leg.position.set(Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(leg);
  }
  const head = new THREE.Group(); head.position.y = 0.95; g.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), olive); head.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.5); head.add(barrel);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x5fd0ff })); lamp.position.set(0.1, 0.17, -0.2); head.add(lamp);
  dark.color.convertSRGBToLinear(); olive.color.convertSRGBToLinear();
  g.position.set(x, y, z); g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  G.scene.add(g);
  return { mesh: g, head, x, y, z, yaw, until: G.now + STREAKS[2].duration, next: 0, target: null, retarget: 0 };
}

export function updateStreaks(dt) {
  const st = streakState, p = G.player;
  for (let i = st.shells.length - 1; i >= 0; i--) {
    const s = st.shells[i];
    if (!s.whistled && G.now > s.at - 1.0) { s.whistled = true; play('whistle', { x: s.x, y: 8, z: s.z }, { range: 140, ref: 14 }); }
    if (G.now >= s.at) { explode(s.x, supportHeight(s.x, s.z, 0.2, 30) + 0.1, s.z, p, 'mortar'); st.shells.splice(i, 1); }
  }
  for (let i = st.sentries.length - 1; i >= 0; i--) {
    const s = st.sentries[i];
    if (G.now >= s.until) { explodeSentry(s); st.sentries.splice(i, 1); continue; }
    const ey = s.y + 1.0;
    if (G.now > s.retarget) {
      s.retarget = G.now + 0.25; s.target = null; let bd = 42;
      for (const u of G.units) {
        if (!u.alive || !isEnemy(p, u)) continue;
        const d = Math.hypot(u.x - s.x, u.z - s.z);
        if (d < bd && losClear(s.x, ey, s.z, u.x, u.y + u.h * 0.7, u.z)) { bd = d; s.target = u; }
      }
    }
    const t = s.target;
    if (t && t.alive) {
      const want = Math.atan2(-(t.x - s.x), -(t.z - s.z));
      const diff = angleDiff(s.yaw, want);
      s.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
      if (Math.abs(diff) < 0.15 && G.now >= s.next) {
        s.next = G.now + 0.11;
        const tx = t.x - s.x, ty = (t.y + t.h * 0.65) - ey, tz = t.z - s.z, l = Math.hypot(tx, ty, tz);
        const d = coneDir(tx / l, ty / l, tz / l, 0.028, { x: 0, y: 0, z: 0 });
        const mx = s.x - Math.sin(s.yaw) * 0.75, mz = s.z - Math.cos(s.yaw) * 0.75;
        const wh = rayWorld(mx, ey, mz, d.x, d.y, d.z, 60);
        const uh = rayUnits(mx, ey, mz, d.x, d.y, d.z, wh ? wh.t : 60, (u) => !isEnemy(p, u));
        const end = uh ? uh.t : wh ? wh.t : 60;
        tracer(mx, ey, mz, mx + d.x * end, ey + d.y * end, mz + d.z * end, 0x9fe0ff, 380);
        enemyFlash(mx, ey, mz);
        play('sentry', { x: s.x, y: ey, z: s.z }, { gain: 0.7 });
        if (uh) damage(uh.unit, 16, p, { weapon: 'sentry', zone: uh.zone, headshot: uh.zone === 'head', sx: s.x, sz: s.z, noStreak: true });
        else if (wh) impact(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, wh.mat);
      }
    } else s.yaw += dt * 0.6;
    s.head.rotation.y = s.yaw - s.mesh.rotation.y;
  }
}

function explodeSentry(s) { G.scene.remove(s.mesh); play('radio', { x: s.x, y: s.y, z: s.z }); }
