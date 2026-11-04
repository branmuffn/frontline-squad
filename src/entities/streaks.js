import { saveProfile } from '../core/storage.js';
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
// multiplayer: the host runs every mortar and sentry and mirrors them; joiners ask the host to deploy theirs
const host = () => (G.mp && G.mp.live && G.mp.host ? G.mp : null);
const joiner = () => !!(G.mp && G.mp.live && G.mp.client);
const r2 = (v) => Math.round(v * 100) / 100;
let sentryKey = 0;
function addShells(list) {
  streakState.shells.push(...list);
  const m = host(); if (m) m.bcast({ t: 'mor', s: list.map((q) => [r2(q.x), r2(q.z), r2(q.at)]) });
}
function addSentry(s) {
  s.key = ++sentryKey; streakState.sentries.push(s);
  const m = host(); if (m) m.bcast({ t: 'sen', k: s.key, p: [r2(s.x), r2(s.y), r2(s.z), r2(s.yaw)], o: s.owner.id, u: r2(s.until) });
}
const strike = (x, z, owner) => Array.from({ length: 6 }, (_, i) => { const a = rand(0, 6.28), r = rand(0, 6.5); return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, at: G.now + 1.6 + i * 0.55 + rand(0, 0.25), whistled: false, owner }; });
// joiner side: mirrored strikes and sentries (visual only; the host applies all damage)
export function netStreak(m, owner) {
  if (m.t === 'mor') for (const [x, z, at] of m.s) streakState.shells.push({ x, z, at, whistled: false, owner: null, ghost: true });
  else if (m.t === 'sen' && m.p) { const [x, y, z, yaw] = m.p, sn = makeSentry(x, y, z, yaw, owner || G.player); sn.key = m.k; sn.until = m.u; sn.ghost = true; streakState.sentries.push(sn); }
  else if (m.t === 'sen') { const i = streakState.sentries.findIndex((q) => q.key === m.k); if (i >= 0) { explodeSentry(streakState.sentries[i]); streakState.sentries.splice(i, 1); } }
}
// joiner side: a mirrored sentry burst (from the host's shot list)
export function netSentryShot(key, mx, my, mz, ex, ey, ez) {
  const sn = streakState.sentries.find((q) => q.key === key); if (!sn) return;
  sn.yaw = Math.atan2(-(ex - sn.x), -(ez - sn.z)); sn.head.rotation.y = sn.yaw - sn.mesh.rotation.y;
  tracer(mx, my, mz, ex, ey, ez, 0x9fe0ff, 380); enemyFlash(mx, my, mz); G.netSentryShots = (G.netSentryShots || 0) + 1;
  play('sentry', { x: sn.x, y: my, z: sn.z }, { gain: 0.7 });
}
// host side: a joiner deploys a reward it earned (validated against what the host granted)
export function remoteUseStreak(u, m) {
  const i = (u.sready || []).indexOf(m.id); if (i < 0 || !u.alive) return;
  const b = G.world.bounds;
  if (m.id === 'mortar' && isFinite(m.x + m.z) && m.x > b.minX && m.x < b.maxX && m.z > b.minZ && m.z < b.maxZ) addShells(strike(m.x, m.z, u));
  else if (m.id === 'sentry' && isFinite(m.x + m.z) && Math.hypot(m.x - u.x, m.z - u.z) < 4) addSentry(makeSentry(m.x, supportHeight(m.x, m.z, 0.3, u.y + 0.5), m.z, +m.yaw || 0, u));
  else return;
  u.sready.splice(i, 1);
}
// host side: a joiner's kill streak reached n
export function remoteStreak(u, n) {
  const s = STREAKS.find((q) => q.kills === n); if (!s) return;
  if (!s.auto) { u.sready = u.sready || []; if (!u.sready.includes(s.id)) u.sready.push(s.id); }
  G.mp.toRemote(u, { t: 'stk', n });
}

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
  // first time each reward is earned: explain what it does and how to use it
  const hints = G.profile.hints;
  if (!hints[s.id]) { hints[s.id] = true; saveProfile(); hud.hint(`New: ${s.name}`, s.how.replace('{streak}', hud.keyName('streak')), 9); }
}

export function grantStreak(id) {
  if (id === 'uav') { streakState.uavUntil = G.now + STREAKS[0].duration; hud.banner('RECON UAV', 'Enemy positions on your radar'); play('radio'); }
  else if (!streakState.ready.includes(id)) streakState.ready.push(id);
  hud.setStreaks(G.player ? G.player.streak : 0, streakState.ready);
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
    if (joiner()) G.mp.send({ t: 'use', id, x: r2(h.x), z: r2(h.z) }); else addShells(strike(h.x, h.z, p));
    hud.notice('Mortar strike inbound');
    play('radio');
  } else if (id === 'sentry') {
    let x = p.x + dir.x * 2, z = p.z + dir.z * 2;
    if (blocked(x, z, 0.45, p.y, 1.2)) { x = p.x; z = p.z; }
    const y = supportHeight(x, z, 0.3, p.y + 0.5);
    if (joiner()) G.mp.send({ t: 'use', id, x: r2(x), z: r2(z), yaw: r2(p.yaw) }); else addSentry(makeSentry(x, y, z, p.yaw, p));
    hud.notice('Sentry gun deployed');
    play('switch');
  }
  streakState.ready.shift();
  hud.setStreaks(p.streak, streakState.ready);
}

function makeSentry(x, y, z, yaw, owner) {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.6, metalness: 0.3 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), dark);
    const a = i / 3 * 6.283; leg.position.set(Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(leg);
  }
  const head = new THREE.Group(); head.position.y = 0.95; g.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), olive); head.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.5); head.add(barrel);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: owner.isPlayer || (G.match.teams && owner.team === G.player.team) ? 0x5fd0ff : 0xff4a3a })); lamp.position.set(0.1, 0.17, -0.2); head.add(lamp);
  dark.color.convertSRGBToLinear(); olive.color.convertSRGBToLinear();
  g.position.set(x, y, z); g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  G.scene.add(g);
  return { mesh: g, head, x, y, z, yaw, owner, until: G.now + STREAKS[2].duration, next: 0, target: null, retarget: 0 };
}

export function updateStreaks(dt) {
  const st = streakState;
  for (let i = st.shells.length - 1; i >= 0; i--) {
    const s = st.shells[i];
    if (!s.whistled && G.now > s.at - 1.0) { s.whistled = true; play('whistle', { x: s.x, y: 8, z: s.z }, { range: 140, ref: 14 }); }
    if (G.now >= s.at) { explode(s.x, supportHeight(s.x, s.z, 0.2, 30) + 0.1, s.z, s.owner, 'mortar'); st.shells.splice(i, 1); }
  }
  for (let i = st.sentries.length - 1; i >= 0; i--) {
    const s = st.sentries[i], p = s.owner;
    if (G.now >= s.until) { explodeSentry(s); st.sentries.splice(i, 1); const m = host(); if (m) m.bcast({ t: 'sen', k: s.key }); continue; }
    if (s.ghost) continue; // mirrored from the host
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
        if (host()) G.mp.shots.push([-s.key, -1, r2(mx), r2(ey), r2(mz), r2(mx + d.x * end), r2(ey + d.y * end), r2(mz + d.z * end)]);
        enemyFlash(mx, ey, mz);
        play('sentry', { x: s.x, y: ey, z: s.z }, { gain: 0.7 });
        if (uh) damage(uh.unit, 16, p, { weapon: 'sentry', zone: uh.zone, headshot: uh.zone === 'head', sx: s.x, sz: s.z, noStreak: true, claim: true });
        else if (wh) impact(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, wh.mat);
      }
    } else s.yaw += dt * 0.6;
    s.head.rotation.y = s.yaw - s.mesh.rotation.y;
  }
}

function explodeSentry(s) { G.scene.remove(s.mesh); play('radio', { x: s.x, y: s.y, z: s.z }); }

// ---------- bots earn and use the same rewards ----------
export function botStreak(u, n) {
  const s = STREAKS.find((q) => q.kills === n), b = u.brain;
  if (!s || !b || !G.match.bots.streaks) return;
  const hostile = isEnemy(u, G.player);
  if (s.auto) {
    b.uavUntil = G.now + s.duration;
    if (hostile) hud.notice(`Enemy UAV overhead (${u.name})`);
  } else if (!b.ready.includes(s.id)) b.ready.push(s.id);
}
// called from bot thinking: deploy any ready reward when it makes sense
export function botUseStreaks(u) {
  const b = u.brain;
  if (!b.ready.length || !u.alive) return;
  const id = b.ready[0];
  if (id === 'sentry') {
    if (b.visible) return; // set it down in a quiet moment
    const y = supportHeight(u.x, u.z, 0.3, u.y + 0.5);
    addSentry(makeSentry(u.x - Math.sin(u.yaw) * 1.2, y, u.z - Math.cos(u.yaw) * 1.2, u.yaw, u));
    b.ready.shift();
    if (isEnemy(u, G.player)) hud.notice(`Enemy sentry gun deployed (${u.name})`);
  } else if (id === 'mortar') {
    const k = b.lastKnown;
    if (!k || Math.hypot(k.x - u.x, k.z - u.z) < 14) return; // never shell yourself
    addShells(strike(k.x, k.z, u));
    b.ready.shift();
    if (isEnemy(u, G.player)) hud.notice('Incoming enemy mortar strike!');
    play('radio', { x: u.x, y: u.y + 1.5, z: u.z });
  }
}
