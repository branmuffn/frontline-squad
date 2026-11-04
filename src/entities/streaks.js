import { saveProfile } from '../core/storage.js';
import * as THREE from 'three';
import { G } from '../core/state.js';
import { STREAKS, STREAK_PICKS, streakDef, WEAPONS } from '../core/config.js';
import { makeHeliMesh } from './vehicles.js';
import { rand, angleDiff, coneDir } from '../core/util.js';
import { rayWorld, rayUnits, losClear, blocked, supportHeight } from '../world/physics.js';
import { damage, isEnemy } from './units.js';
import { explode } from './grenades.js';
import { play } from '../engine/audio.js';
import { tracer, enemyFlash, impact } from '../engine/fx.js';
import * as hud from '../ui/hud.js';

export const streakState = { ready: [], uavUntil: 0, jamUntil: 0, shells: [], sentries: [], crates: [], choppers: [], gunships: [] };
// kill counts: the match's (host's in multiplayer) or your own; picks: yours (bots and unknown joiners use the defaults)
export const killsFor = (id) => { const k = (G.match && G.match.streakKills) || (G.profile.streaks && G.profile.streaks.kills) || {}; return k[id] ?? (streakDef(id) || {}).kills; };
export const myPicks = () => { const p = (G.profile.streaks && G.profile.streaks.picks) || STREAK_PICKS; return p.filter((id) => streakDef(id)).slice(0, 3); };
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
  else if (m.t === 'crate') { if (m.p) { const c = makeCrate(m.p[0], m.p[1], m.p[2], owner); c.key = m.k; c.ghost = true; } else removeCrate(streakState.crates.find((q) => q.key === m.k)); }
  else if (m.t === 'chp') { let c = streakState.choppers.find((q) => q.key === m.k); if (m.x) { if (c) chopperDown(c, false); } else { if (!c) { c = newChopper(owner, m.k); c.ghost = true; } [c.x, c.y, c.z, c.yaw] = m.p; } }
  else if (m.t === 'jam') { if (!G.player || G.player.team !== m.tm) { streakState.jamUntil = Math.max(streakState.jamUntil, m.u); hud.notice('Enemy counter-UAV: radar jammed'); } }
}
// joiner side: a mirrored sentry burst (from the host's shot list)
export function netSentryShot(key, mx, my, mz, ex, ey, ez) {
  const sn = streakState.sentries.find((q) => q.key === key) || streakState.choppers.find((q) => q.key === key); if (!sn) return;
  if (sn.head) { sn.yaw = Math.atan2(-(ex - sn.x), -(ez - sn.z)); sn.head.rotation.y = sn.yaw - sn.mesh.rotation.y; }
  tracer(mx, my, mz, ex, ey, ez, 0x9fe0ff, 380); enemyFlash(mx, my, mz); G.netSentryShots = (G.netSentryShots || 0) + 1;
  play('sentry', { x: sn.x, y: my, z: sn.z }, { gain: 0.7 });
}
// host side: a joiner deploys a reward it earned (validated against what the host granted)
export function remoteUseStreak(u, m) {
  const i = (u.sready || []).indexOf(m.id); if (i < 0 || !u.alive) return;
  const b = G.world.bounds;
  if (m.id === 'mortar' && isFinite(m.x + m.z) && m.x > b.minX && m.x < b.maxX && m.z > b.minZ && m.z < b.maxZ) addShells(strike(m.x, m.z, u));
  else if (m.id === 'sentry' && isFinite(m.x + m.z) && Math.hypot(m.x - u.x, m.z - u.z) < 4) addSentry(makeSentry(m.x, supportHeight(m.x, m.z, 0.3, u.y + 0.5), m.z, +m.yaw || 0, u));
  else if (m.id === 'care' && isFinite(m.x + m.z) && m.x > b.minX && m.x < b.maxX && m.z > b.minZ && m.z < b.maxZ) dropCrate(m.x, m.z, u);
  else if (m.id === 'air') airstrike(u, +m.yaw || u.yaw);
  else if (m.id === 'chopper') callChopper(u); else if (m.id === 'gunship') callGunship(u);
  else return;
  u.sready.splice(i, 1);
}
// host side: a joiner's kill streak reached n
export function remoteStreak(u, n) {
  const picks = (u.picks || STREAK_PICKS).filter((id) => streakDef(id)).slice(0, 3), got = picks.filter((id) => killsFor(id) === n);
  if (!got.length) return;
  for (const id of got) { if (id === 'cuav') jam(u, streakDef(id).duration); else if (!streakDef(id).auto) { u.sready = u.sready || []; if (!u.sready.includes(id)) u.sready.push(id); } }
  G.mp.toRemote(u, { t: 'stk', n });
}

export function resetStreaks() {
  streakState.ready.length = 0; streakState.uavUntil = 0; streakState.jamUntil = 0; streakState.shells.length = 0;
  for (const c of streakState.crates) G.scene.remove(c.mesh); streakState.crates.length = 0;
  for (const c of streakState.choppers) G.scene.remove(c.m.root); streakState.choppers.length = 0; streakState.gunships.length = 0;
  for (const s of streakState.sentries) G.scene.remove(s.mesh);
  streakState.sentries.length = 0;
  hud.setStreaks(0, streakState.ready);
}

export function checkStreak(n) {
  hud.setStreaks(n, streakState.ready);
  for (const id of myPicks()) if (killsFor(id) === n) earn(streakDef(id));
}
function earn(s) {
  play('streak', null, { important: true });
  if (s.id === 'cuav') { jam(G.player, s.duration); hud.banner(s.name, 'Enemy radar jammed'); play('radio', null, { delay: 0.3 }); }
  else if (s.auto) {
    streakState.uavUntil = G.now + s.duration;
    hud.banner(s.name, 'Enemy positions on your radar');
    play('radio', null, { delay: 0.3 });
  } else {
    if (!streakState.ready.includes(s.id)) streakState.ready.push(s.id);
    hud.banner(s.name + ' ready', `Press ${hud.keyName('streak')} to deploy`);
  }
  hud.setStreaks(G.player ? G.player.streak : 0, streakState.ready);
  // first time each reward is earned: explain what it does and how to use it
  const hints = G.profile.hints;
  if (!hints[s.id]) { hints[s.id] = true; saveProfile(); hud.hint(`New: ${s.name}`, s.how.replace('{streak}', hud.keyName('streak')), 9); }
}

export function grantStreak(id) {
  if (id === 'uav') { streakState.uavUntil = G.now + streakDef('uav').duration; hud.banner('RECON UAV', 'Enemy positions on your radar'); play('radio'); }
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
  } else if (id === 'care' || id === 'air') {
    const h = rayWorld(c.x, c.y, c.z, dir.x, dir.y, dir.z, 160);
    if (id === 'care' && !h) { hud.notice('Aim at open ground to drop the crate'); play('deny'); return; }
    if (joiner()) G.mp.send({ t: 'use', id, x: r2(h ? h.x : p.x), z: r2(h ? h.z : p.z), yaw: r2(p.yaw) });
    else if (id === 'care') dropCrate(h.x, h.z, p); else airstrike(p, p.yaw);
    hud.notice(id === 'care' ? 'Care package inbound' : 'Airstrike inbound'); play('radio');
  } else if (id === 'chopper' || id === 'gunship') {
    if (joiner()) G.mp.send({ t: 'use', id }); else if (id === 'chopper') callChopper(p); else callGunship(p);
    hud.notice(id === 'chopper' ? 'Attack chopper inbound' : 'Gunship on station'); play('radio');
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
  return { mesh: g, head, x, y, z, yaw, owner, until: G.now + streakDef('sentry').duration, next: 0, target: null, retarget: 0 };
}

export function updateStreaks(dt) {
  updateAir(dt);
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
  const b = u.brain, s = STREAK_PICKS.map(streakDef).find((q) => killsFor(q.id) === n);
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

// ---------- 3c: counter-UAV, care package, airstrike, attack chopper, gunship ----------
function jam(owner, dur) { // enemies of the owner see static on their radar
  const until = G.now + dur, m = host();
  if (G.player && owner && isEnemy(owner, G.player)) { streakState.jamUntil = until; hud.notice('Enemy counter-UAV: radar jammed'); }
  for (const b of G.bots) if (owner && isEnemy(owner, b)) b.brain.uavUntil = 0; // bots' UAVs go dark too
  if (m) m.bcast({ t: 'jam', tm: owner ? owner.team : -1, u: r2(until) });
}
let crateKey = 0, crateGeo = null, crateMat = null;
function makeCrate(x, y, z, owner) {
  if (!crateGeo) { crateGeo = new THREE.BoxGeometry(1.1, 0.8, 0.8); crateMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4d5a3a).convertSRGBToLinear(), roughness: 0.8 }); }
  const mesh = new THREE.Mesh(crateGeo, crateMat); mesh.castShadow = true; mesh.position.set(x, y + 30, z); G.scene.add(mesh);
  const c = { key: ++crateKey, x, y, z, fy: y + 30, owner, mesh, landed: false, until: G.now + 60 }; streakState.crates.push(c); return c;
}
function dropCrate(x, z, owner) {
  const y = supportHeight(x, z, 0.5, 60), c = makeCrate(x, y, z, owner);
  const m = host(); if (m) m.bcast({ t: 'crate', k: c.key, p: [r2(x), r2(y), r2(z)], o: owner ? owner.id : 0 });
}
function removeCrate(c) { if (!c) return; const i = streakState.crates.indexOf(c); if (i >= 0) streakState.crates.splice(i, 1); G.scene.remove(c.mesh); const m = host(); if (m && !c.ghost) m.bcast({ t: 'crate', k: c.key }); }
const CRATE_LOOT = ['refill', 'refill', 'mortar', 'sentry', 'air', 'uav'];
function crateReward(u) { // what the crate gives its owner
  const r = CRATE_LOOT[(Math.random() * CRATE_LOOT.length) | 0];
  if (u === G.player) { if (r === 'refill') refillPlayer(); else { grantStreak(r); hud.banner('Care package', streakDef(r).name); } play('pickupAmmo'); }
  else if (u.remote) { if (r !== 'refill' && r !== 'uav') { u.sready = u.sready || []; u.sready.push(r); } G.mp.toRemote(u, { t: 'gift', r }); }
}
export function refillPlayer() { const P = G.player; for (const id of P.weapons) { const w = WEAPONS[id]; if (!w.melee) P.ammo[id] = { mag: w.mag, res: w.reserve }; } P.health = P.maxHealth || 100; P.grenades = Math.max(P.grenades, 2); hud.setAmmo(P); hud.banner('Care package', 'Full ammo and health'); }
// E near your landed crate
export function openCrate(P) {
  const c = streakState.crates.find((q) => q.landed && q.owner === P && Math.hypot(q.x - P.x, q.z - P.z) < 2.3 && Math.abs(q.y - P.y) < 1.6);
  if (!c) return false;
  if (joiner()) { G.mp.send({ t: 'open', k: c.key }); removeCrateLocal(c); return true; }
  crateReward(P); removeCrate(c); return true;
}
function removeCrateLocal(c) { const i = streakState.crates.indexOf(c); if (i >= 0) streakState.crates.splice(i, 1); G.scene.remove(c.mesh); }
export function remoteOpenCrate(u, k) { const c = streakState.crates.find((q) => q.key === k && q.owner === u); if (c && Math.hypot(c.x - u.x, c.z - u.z) < 3.5) { crateReward(u); removeCrate(c); } }
function airstrike(owner, yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), b = G.world.bounds, list = [];
  for (let i = 0; i < 6; i++) { const d = 10 + i * 6, x = owner.x + fx * d + rand(-1.2, 1.2), z = owner.z + fz * d + rand(-1.2, 1.2); if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) list.push({ x, z, at: G.now + 2.2 + i * 0.16, whistled: true, owner }); }
  addShells(list); play('whistle', { x: owner.x + fx * 25, y: 30, z: owner.z + fz * 25 }, { range: 200, ref: 30, delay: 1.2 });
}
function callGunship(owner) { streakState.gunships.push({ owner, until: G.now + streakDef('gunship').duration, next: G.now + 2 }); }
let chopKey = 1000;
function newChopper(owner, key) {
  const m = makeHeliMesh(), c = { key: key || ++chopKey, owner, m, x: 0, y: 24, z: 0, yaw: 0, ang: 0, hp: 520, until: G.now + streakDef('chopper').duration, next: 0, sendAt: 0 };
  streakState.choppers.push(c); return c;
}
function callChopper(owner) { const c = newChopper(owner); const b = G.world.bounds; c.cx = (b.minX + b.maxX) / 2; c.cz = (b.minZ + b.maxZ) / 2; c.R = Math.min(b.maxX - b.minX, b.maxZ - b.minZ) * 0.3; c.ang = Math.atan2(owner.z - c.cz, owner.x - c.cx); }
function chopperDown(c, boom) {
  const i = streakState.choppers.indexOf(c); if (i >= 0) streakState.choppers.splice(i, 1);
  G.scene.remove(c.m.root); if (c.m.engine) c.m.engine = null;
  if (boom) { explode(c.x, c.y, c.z, null, 'mortar'); hud.notice('Attack chopper down'); }
  const m = host(); if (m && !c.ghost) m.bcast({ t: 'chp', k: c.key, x: boom ? 2 : 1 });
}
// bullets hitting a chopper (ballistics): returns { c, t } for the nearest hit along the ray
export function chopperHit(ox, oy, oz, dx, dy, dz, tmax) {
  let best = null;
  for (const c of streakState.choppers) { const lx = ox - c.x, ly = oy - (c.y + 1.3), lz = oz - c.z, b = lx * dx + ly * dy + lz * dz, q = lx * lx + ly * ly + lz * lz - 2.2 * 2.2, d = b * b - q; if (d < 0) continue; const t = -b - Math.sqrt(d); if (t > 0 && t < tmax && (!best || t < best.t)) best = { c, t }; }
  return best;
}
export function damageChopper(c, amount, attacker) {
  if (!c || (attacker && c.owner && !isEnemy(attacker, c.owner))) return;
  if (joiner()) { if (attacker === G.player) { G.mp.send({ t: 'chd', k: c.key, a: Math.round(amount) }); hud.hitMarker('hit'); } return; }
  c.hp -= amount; if (attacker === G.player) hud.hitMarker('hit');
  if (c.hp <= 0) chopperDown(c, true);
}
export function remoteChopperDamage(u, m) { const c = streakState.choppers.find((q) => q.key === m.k); if (c && m.a > 0) damageChopper(c, Math.min(m.a, 300), u); }
function updateAir(dt) {
  const st = streakState;
  for (let i = st.crates.length - 1; i >= 0; i--) { // crates fall, then wait for their owner
    const c = st.crates[i];
    if (!c.landed) { c.fy = Math.max(c.y + 0.4, c.fy - 14 * dt); if (c.fy <= c.y + 0.4) { c.landed = true; play('land', { x: c.x, y: c.y, z: c.z }, { gain: 1.2 }); } c.mesh.position.set(c.x, c.fy, c.z); c.mesh.rotation.y += dt * 0.6; }
    if (G.now > c.until && !c.ghost) removeCrate(c);
  }
  for (let i = st.choppers.length - 1; i >= 0; i--) {
    const c = st.choppers[i];
    if (!c.ghost) {
      if (G.now >= c.until) { chopperDown(c, false); continue; }
      c.ang += dt * 0.28; c.x = c.cx + Math.cos(c.ang) * c.R; c.z = c.cz + Math.sin(c.ang) * c.R; c.y = 22 + Math.sin(G.now * 0.5) * 1.5; c.yaw = Math.atan2(Math.sin(c.ang), -Math.cos(c.ang)) + Math.PI;
      if (G.now >= c.next) { // shoot the nearest enemy it can see
        let tgt = null, bd = 70;
        for (const u of G.units) { if (!u.alive || !c.owner || !isEnemy(c.owner, u)) continue; const d = Math.hypot(u.x - c.x, u.z - c.z, u.y - c.y); if (d < bd && losClear(c.x, c.y, c.z, u.x, u.y + 1.2, u.z)) { bd = d; tgt = u; } }
        c.next = G.now + (tgt ? 0.11 : 0.4);
        if (tgt) {
          const ex = tgt.x + rand(-0.6, 0.6), ey = tgt.y + 1.0 + rand(-0.5, 0.5), ez = tgt.z + rand(-0.6, 0.6), dx = ex - c.x, dy = ey - c.y, dz = ez - c.z, L = Math.hypot(dx, dy, dz);
          const wh = rayWorld(c.x, c.y, c.z, dx / L, dy / L, dz / L, L + 2), uh = rayUnits(c.x, c.y, c.z, dx / L, dy / L, dz / L, wh ? wh.t : L + 2, (u) => !isEnemy(c.owner, u));
          const end = uh ? uh.t : wh ? wh.t : L;
          tracer(c.x, c.y, c.z, c.x + dx / L * end, c.y + dy / L * end, c.z + dz / L * end, 0xffd090, 420); play('sentry', { x: c.x, y: c.y, z: c.z }, { gain: 0.8, range: 140 });
          if (uh) damage(uh.unit, 13, c.owner, { weapon: 'chopper', zone: uh.zone, headshot: uh.zone === 'head', sx: c.x, sz: c.z, noStreak: true, claim: true });
          if (host()) G.mp.shots.push([-c.key, -1, r2(c.x), r2(c.y), r2(c.z), r2(c.x + dx / L * end), r2(c.y + dy / L * end), r2(c.z + dz / L * end)]);
        }
      }
      const m = host(); if (m && G.now >= c.sendAt) { c.sendAt = G.now + 0.1; m.bcast({ t: 'chp', k: c.key, o: c.owner ? c.owner.id : 0, p: [r2(c.x), r2(c.y), r2(c.z), r2(c.yaw)] }); }
    }
    c.m.root.position.set(c.x, c.y, c.z); c.m.body.rotation.set(0.12, c.yaw, 0); c.m.rotor.rotation.y += dt * 30;
  }
  for (let i = st.gunships.length - 1; i >= 0; i--) { // heavy rounds at enemies out in the open
    const g = st.gunships[i]; if (G.now >= g.until) { st.gunships.splice(i, 1); continue; }
    if (G.now < g.next) continue; g.next = G.now + 1.3;
    const open = G.units.filter((u) => u.alive && g.owner && isEnemy(g.owner, u) && !rayWorld(u.x, u.y + 40, u.z, 0, -1, 0, 38.5));
    if (open.length) { const u = open[(Math.random() * open.length) | 0]; addShells([{ x: u.x + rand(-2, 2), z: u.z + rand(-2, 2), at: G.now + 0.9, whistled: false, owner: g.owner }]); }
  }
}
