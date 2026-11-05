import { botVehicle } from './vehicles.js';
import * as THREE from 'three';
import { G } from '../core/state.js';
import { PHYS, WEAPONS, DIFFICULTY, OPERATORS, operatorLook } from '../core/config.js';
import { clamp, damp, rand, randInt, chance, angleDiff, coneDir } from '../core/util.js';
import { moveBody, updateVertical, losClear, rayWorld, rayUnits, canStand, surfaceAt, stepSound, inWater, PENETRABLE } from '../world/physics.js';
import { findPath, randomNode, nearestNode } from '../world/nav.js';
import { newShot, traceSegment, fireBullet } from './ballistics.js';
import { makeUnit, damage, applyFall, isEnemy, noise, ladderBlocked, ladderBusy } from './units.js';
import { drops, dropWeapon, removeDrop } from './worldprops.js';
import { botUseStreaks } from './streaks.js';
import { smokeBlocks } from './gear.js';
import { swipe, makeSoldier, animateSoldier, setFlash, disposeSoldier, setSoldierGun, restyleSoldier } from './soldier.js';
import { grenades, throwGrenade } from './grenades.js';
import { pickups } from './pickups.js';
import { damageBarrel } from './worldprops.js';
import { play } from '../engine/audio.js';
import { tracer, enemyFlash, impact, blood } from '../engine/fx.js';

const STYLE = {
  m4: { min: 8, max: 28, burst: [3, 6] }, mp5: { min: 3, max: 15, burst: [4, 8] }, m870: { min: 1.5, max: 7, burst: [1, 1] },
  l96: { min: 20, max: 70, burst: [1, 1] }, mk14: { min: 12, max: 50, burst: [1, 2] }, usp: { min: 4, max: 16, burst: [1, 3] },
  ak47: { min: 8, max: 26, burst: [3, 5] }, m249: { min: 6, max: 30, burst: [6, 12] }, spas12: { min: 1.5, max: 8, burst: [2, 3] },
  barrett: { min: 25, max: 80, burst: [1, 1] }, deagle: { min: 4, max: 18, burst: [1, 2] }, knife: { min: 0, max: 1.4, burst: [1, 1] },
};
const TYPES = {
  soldier: { hp: 100, speed: 1, aggro: 0, acc: 1, dmg: 1 },
  rusher: { hp: 75, speed: 1.28, aggro: 1, acc: 1.15, dmg: 0.9, noCover: true, noHelmet: true },
  heavy: { hp: 220, speed: 0.8, aggro: 0.8, acc: 1.1, dmg: 1, heavy: true },
  marksman: { hp: 90, speed: 0.95, aggro: 0, acc: 0.55, dmg: 1 },
  infected: { hp: 100, speed: 1.25, aggro: 1, acc: 1, dmg: 1, noCover: true },
  zombie: { hp: 100, speed: 1, aggro: 1, acc: 1, dmg: 0.6, noCover: true, noHelmet: true, claws: true },
};

const laserGeo = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); return g; };

export function createBot(o) {
  const type = TYPES[o.type || 'soldier'];
  const u = makeUnit({ name: o.name, team: o.team, maxHealth: type.hp, health: type.hp });
  if (!o.type || o.type === 'soldier' || o.type === 'rusher' || o.type === 'marksman') Object.assign(o, { ...operatorLook(OPERATORS[(Math.random() * OPERATORS.length) | 0].id), ...o });
  u.soldier = makeSoldier({ ...(o.body ? { body: o.body, hair: o.hair, hairStyle: o.hairStyle, beard: o.beard, face: o.face } : {}), uniform: o.uniform, accent: o.accent, weapon: type.claws ? 'none' : o.weapon, heavy: type.heavy, noHelmet: type.noHelmet || o.noHelmet, helmet: o.helmet, skin: o.skin, pattern: o.pattern, style: o.type === 'zombie' ? 'zombie' : o.type === 'infected' ? 'infected' : 'soldier' });
  u.soldier.root.visible = false;
  const w = WEAPONS[o.weapon];
  u.brain = {
    guns: o.guns || [o.weapon], switchAt: 0, ready: [], uavUntil: 0, climb: null, loot: null,
    type: o.type || 'soldier', T: type, weapon: o.weapon, scoped: !!w.scope, melee: !!w.melee, style: STYLE[o.weapon], magMax: w.mag, mag: w.mag, reloadUntil: 0,
    state: 'patrol', path: null, pathI: 0, goal: null, repathAt: 0, thinkAt: rand(0, 0.3), target: null, visible: false,
    lastSeen: -99, lastKnown: null, reactAt: 0, trackStart: 0, burst: 0, nextShot: 0, pauseUntil: 0,
    strafeDir: chance(0.5) ? 1 : -1, strafeSwitch: 0, cover: null, coverUntil: 0, peekUntil: 0, wantCover: false,
    investigate: null, searchUntil: 0, stuckAt: 0, sx: 0, sz: 0, stuck: 0, grenades: 1, grenadeAt: 0, evade: null,
    wantCrouch: false, crouchUntil: 0, aimStart: 0, hunt: false, desiredYaw: 0, vx: 0, vz: 0, flankUntil: 0,
    onDamaged: onDamaged,
  };
  if (w.scope) {
    u.laser = new THREE.Line(laserGeo(), new THREE.LineBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, depthWrite: false }));
    u.laser.visible = false; u.laser.frustumCulled = false; G.scene.add(u.laser);
  }
  return u;
}

// Mode conversions (Infection): new role, gun and accent colour, keeping the same soldier
export function convertBot(u, type, weapon) {
  const b = u.brain; b.T = TYPES[type]; b.type = type; b.guns = [weapon]; setBotWeapon(u, weapon, false);
  b.alwaysHunt = true; b.target = null; b.state = 'patrol';
  if (u.soldier) restyleSoldier(u.soldier, type === 'infected' ? 'infected' : 'soldier', type === 'infected' ? 0x6fbf4a : 0x888888);
}

// Ladder climbing, same speed and exit as the player's
function climbLadder(u, b, dt) {
  const c = b.climb, L = c.L;
  u.onLadder = true; u.vy = 0; u.grounded = false; u.airPeak = u.y; b.vx = 0; b.vz = 0;
  u.x += (L.x + L.nx * 0.55 - u.x) * Math.min(1, dt * 8); u.z += (L.z + L.nz * 0.55 - u.z) * Math.min(1, dt * 8);
  if (ladderBlocked(u, L, c.up)) { // someone in the way: wait a moment, then give way (climb back and re-plan)
    c.blockedT = (c.blockedT || 0) + dt;
    if (c.blockedT > 0.8) { c.up = !c.up; c.blockedT = 0; c.exit = c.up ? [L.x - L.nx * 0.5, L.maxY, L.z - L.nz * 0.5] : [L.x + L.nx * 0.55, L.minY, L.z + L.nz * 0.55]; c.until = G.now + 6; b.path = null; }
    return;
  }
  u.y += (c.up ? 3.4 : -3.4) * dt;
  const done = c.up ? u.y >= L.maxY - 0.03 : u.y <= L.minY;
  if (done || G.now > c.until) {
    u.y = done ? (c.up ? L.maxY : L.minY) : u.y;
    if (done) { u.x = c.exit[0]; u.z = c.exit[2]; }
    u.grounded = true; u.onLadder = false; b.climb = null;
  }
}

// ---------- weapon pickups ----------
const TIER = { usp: 1, deagle: 1.6, mp5: 2, m870: 2.2, spas12: 2.3, m4: 3, ak47: 3, m249: 3, mk14: 3, l96: 3, barrett: 4 };
function lootSlot(u, id) {
  const b = u.brain, have = b.guns.indexOf(id);
  if (have >= 0) return -1;
  if (b.guns.length < 2) return 0;
  return Math.max(0, b.guns.indexOf(b.weapon));
}
function considerLoot(u, b) {
  if (b.loot || b.melee || !G.match.bots.loot || b.guns[0] === 'knife' || (G.match.rules && G.match.rules.knife)) return;
  for (const d of drops) {
    if (!TIER[d.id] || Math.abs(d.y - u.y) > 1.2 || Math.hypot(d.x - u.x, d.z - u.z) > 12) continue;
    if (!d.seen) d.seen = new Set();
    if (d.seen.has(u)) continue;
    d.seen.add(u);
    const slot = lootSlot(u, d.id); if (slot < 0) continue;
    const cur = b.guns[slot];
    if (TIER[d.id] > (TIER[cur] || 0) || chance(0.2)) { b.loot = d; setGoal(u, d.x, d.y, d.z, true); return; }
  }
}
function tryLoot(u, b) {
  const d = b.loot;
  if (!drops.includes(d)) { b.loot = null; return; }
  if (Math.hypot(d.x - u.x, d.z - u.z) > 1.1 || Math.abs(d.y - u.y) > 1.2) return;
  b.loot = null;
  const slot = lootSlot(u, d.id); if (slot < 0) return;
  const old = b.guns[slot];
  b.guns[slot] = d.id;
  removeDrop(d);
  if (old && !WEAPONS[old].melee) dropWeapon(old, u.x, u.y + 0.02, u.z);
  setBotWeapon(u, d.id);
  play('pickup', { x: u.x, y: u.y + 1, z: u.z }, { gain: 0.5 });
}

// Change the gun a bot is holding: brain stats, model and sniper laser
export function setBotWeapon(u, id, drawTime = true) {
  const b = u.brain, w = WEAPONS[id];
  if (b.weapon === id) return;
  Object.assign(b, { weapon: id, scoped: !!w.scope, melee: !!w.melee, style: STYLE[id] || STYLE.m4, magMax: w.mag, mag: w.mag, burst: 0 });
  if (drawTime) b.reloadUntil = Math.max(b.reloadUntil, G.now + w.draw + 0.15);
  if (u.soldier) setSoldierGun(u.soldier, id);
  if (w.scope && !u.laser) {
    u.laser = new THREE.Line(laserGeo(), new THREE.LineBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, depthWrite: false }));
    u.laser.visible = false; u.laser.frustumCulled = false; G.scene.add(u.laser);
  }
  if (!w.scope && u.laser) u.laser.visible = false;
}
// With more than one gun, bots draw whichever suits the fight's range.
function chooseGun(u) {
  const b = u.brain;
  if (b.guns.length < 2 || G.now < b.switchAt || !b.target) return;
  const d = Math.hypot(b.target.x - u.x, b.target.z - u.z);
  let best = b.weapon, bs = -Infinity;
  for (const g of b.guns) {
    const st = STYLE[g] || STYLE.m4;
    const fit = d < st.min ? -(st.min - d) / Math.max(1, st.min) : d > st.max ? -(d - st.max) / st.max : 1;
    const sc = fit + (g === b.weapon ? 0.25 : 0) + (b.mag <= 0 && g === b.weapon ? -1 : 0);
    if (sc > bs) { bs = sc; best = g; }
  }
  if (best !== b.weapon) { setBotWeapon(u, best); b.switchAt = G.now + 4; }
}

export function disposeBot(u) {
  disposeSoldier(u.soldier);
  if (u.laser) { G.scene.remove(u.laser); u.laser.geometry.dispose(); u.laser.material.dispose(); }
}

export function resetBotForSpawn(u, x, y, z, yaw) {
  Object.assign(u, { x, y, z, vx: 0, vz: 0, vy: 0, yaw, alive: true, health: u.maxHealth, grounded: true, crouch: false, crouchT: 0, h: PHYS.standH, protectUntil: G.now + 2.2, streak: 0 });
  u.damagers.clear();
  const b = u.brain;
  if (b.guns[0] !== b.weapon) setBotWeapon(u, b.guns[0], false);
  b.climb = null; b.loot = null; u.onLadder = false;
  Object.assign(b, { state: 'patrol', path: null, pathI: 0, goal: null, target: null, visible: false, lastSeen: -99, lastKnown: null, burst: 0, mag: b.magMax, reloadUntil: 0, cover: null, wantCover: false, investigate: null, evade: null, grenades: 1, thinkAt: G.now + rand(0.1, 0.4), reactAt: G.now + 0.6, stuck: 0, aimStart: 0, wantCrouch: false });
  const s = u.soldier; s.deathT = -1; s.root.visible = true; s.root.position.set(x, y, z); s.pose.rotation.set(0, 0, 0);
  if (u.laser) u.laser.visible = false;
}

function onDamaged(u, attacker) {
  const b = u.brain;
  if (!attacker || attacker === u || !isEnemy(u, attacker)) return;
  if (!b.target || !b.visible) { b.target = attacker; b.lastKnown = { x: attacker.x, y: attacker.y, z: attacker.z }; b.lastSeen = G.now - 0.5; b.reactAt = Math.min(b.reactAt, G.now + 0.25); b.trackStart = G.now; }
  const cfg = G.match.ai;
  if (!b.T.noCover && G.match.bots.tactics && b.state !== 'cover' && chance((1 - Math.max(cfg.aggro, b.T.aggro)) * 0.7 + (u.health < 45 ? 0.3 : 0))) b.wantCover = true;
}

const yawTo = (ax, az, bx, bz) => Math.atan2(-(bx - ax), -(bz - az));

function setGoal(u, x, y, z, force) {
  const b = u.brain;
  if (!force && b.goal && b.path && Math.hypot(b.goal.x - x, b.goal.z - z) < 2.5 && G.now < b.repathAt) return;
  b.goal = { x, y, z };
  b.path = findPath(u.x, u.y, u.z, x, y, z);
  b.pathI = 0; b.repathAt = G.now + 1.4 + rand(0, 0.6);
  if (!b.path) b.path = [[x, y, z]];
}

function followPath(u) {
  const b = u.brain;
  if (!b.path) return null;
  while (b.pathI < b.path.length) {
    const p = b.path[b.pathI];
    const d = Math.hypot(p[0] - u.x, p[2] - u.z);
    const nx = b.path[b.pathI + 1];
    if (p.ladder && nx && nx.ladder === p.ladder && Math.abs(nx[1] - p[1]) > 1) {
      // reached a ladder end with the other end next: climb it
      if (d < 0.7) {
        if (ladderBusy(u, p.ladder) && (b.ladderWait = (b.ladderWait || 0) + 1 / 60) < 5) return null; // wait for the ladder to clear
        b.ladderWait = 0; b.climb = { L: p.ladder, up: nx[1] > p[1], exit: nx, until: G.now + 8 }; b.pathI += 2; return null;
      }
      return [(p[0] - u.x) / d, (p[2] - u.z) / d, d];
    }
    if (d < (b.pathI < b.path.length - 1 ? 1.0 : 0.6)) { b.pathI++; continue; }
    return [(p[0] - u.x) / d, (p[2] - u.z) / d, d];
  }
  return null;
}

function findCover(u, threat) {
  const nav = G.world.nav; if (!nav) return null;
  const ex = threat.x, ey = threat.y + threat.h - 0.15, ez = threat.z;
  let best = null, bs = Infinity, checks = 0;
  for (const n of nav.covers) {
    const d = Math.hypot(n.x - u.x, n.z - u.z);
    if (d > 15 || Math.abs(n.y - u.y) > 2.5) continue;
    const dt = Math.hypot(n.x - ex, n.z - ez); if (dt < 7) continue;
    if (++checks > 60) break;
    if (losClear(ex, ey, ez, n.x, n.y + 0.95, n.z)) continue;
    const half = losClear(ex, ey, ez, n.x, n.y + 1.6, n.z); // can peek over by standing
    const s = d + (half ? 0 : 2.5) - Math.min(dt, 25) * 0.1;
    if (s < bs) { bs = s; best = n; }
  }
  return best;
}

function think(u, cfg) {
  const b = u.brain, mode = G.match.mode;
  const eye = u.y + u.h - 0.15;
  const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
  let best = null, bestScore = -1e9;
  for (const t of G.units) {
    if (!t.alive || t.downed || !isEnemy(u, t)) continue;
    const dx = t.x - u.x, dz = t.z - u.z, d = Math.hypot(dx, dz);
    if (d > 80) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    const hitBy = u.lastAttacker === t && G.now - u.lastHitAt < 2.5;
    if (!(dot > 0.4 || d < 5 || hitBy || (t === b.target && G.now - b.lastSeen < 1.5))) continue;
    if (b.stunUntil > G.now) continue; // flashbanged
    if (smokeBlocks(u.x, eye, u.z, t.x, t.y + t.h * 0.6, t.z)) continue; // smoke
    const vis = losClear(u.x, eye, u.z, t.x, t.y + t.h - 0.17, t.z) || losClear(u.x, eye, u.z, t.x, t.y + t.h * 0.5, t.z);
    if (!vis) continue;
    if ((t.prone || t.crouch) && !hitBy && d > (t.prone ? 7 : 13) && (G.world.def.bushes || []).some((q) => Math.hypot(q.x - t.x, q.z - t.z) < q.r + 0.3)) continue; // hidden in a bush
    let s = 60 - d;
    if (t.isPlayer || t.remote) s += mode === 'survival' ? 25 : G.match.teams ? 4 : cfg.playerBias;
    if (t === b.target) s += 14;
    if (hitBy) s += 25;
    if (t.health < 40) s += 6;
    if (t.protectUntil > G.now) s -= 30;
    if (s > bestScore) { bestScore = s; best = t; }
  }
  const wasVisible = b.visible;
  if (best) {
    if (best !== b.target) { b.reactAt = G.now + rand(cfg.react[0], cfg.react[1]) * (b.target ? 0.6 : 1); b.trackStart = G.now; b.burst = 0; b.aimStart = 0; }
    else if (!wasVisible && G.now - b.lastSeen > 0.8) { b.reactAt = G.now + rand(cfg.react[0], cfg.react[1]) * 0.5; b.trackStart = G.now; }
    b.target = best; b.visible = true; b.lastSeen = G.now; b.lastKnown = { x: best.x, y: best.y, z: best.z };
  } else {
    b.visible = false;
    if (b.target && (!b.target.alive || G.now - b.lastSeen > (mode === 'survival' ? 99 : 7))) { b.target = null; b.lastKnown = null; }
  }
  // survival hunters always roughly know where you are
  let hT = null;
  if (mode === 'survival' && !b.visible && G.now > (b.huntPing || 0)) { let bd = Infinity; for (const t of G.units) if ((t.isPlayer || t.remote) && t.alive) { const d = Math.hypot(t.x - u.x, t.z - u.z); if (d < bd) { bd = d; hT = t; } } }
  if (hT) {
    b.huntPing = G.now + 3; b.target = hT; b.lastSeen = Math.max(b.lastSeen, G.now - 2);
    b.lastKnown = { x: hT.x + rand(-4, 4), y: hT.y, z: hT.z + rand(-4, 4) };
  }
  // zombies and the infected always sense the nearest living enemy
  if (b.alwaysHunt && !b.visible && G.now > (b.huntPing || 0)) {
    let best = null, bd = Infinity;
    for (const t of G.units) if (t.alive && !t.downed && isEnemy(u, t)) { const d = Math.hypot(t.x - u.x, t.z - u.z); if (d < bd) { bd = d; best = t; } }
    if (best) { b.huntPing = G.now + 1.5; b.target = best; b.lastSeen = Math.max(b.lastSeen, G.now - 2); b.lastKnown = { x: best.x, y: best.y, z: best.z }; }
  }
  // hearing
  if (!b.visible) {
    for (let i = G.noise.length - 1; i >= 0; i--) {
      const n = G.noise[i]; if (G.now - n.t > 1.2) break;
      if (!n.src || !isEnemy(u, n.src) || !n.src.alive) continue;
      const d = Math.hypot(n.x - u.x, n.z - u.z);
      if (d > n.r * cfg.hearing) continue;
      if (n.src === b.target) { b.lastKnown = { x: n.x, y: n.y - 1.5, z: n.z }; b.lastSeen = Math.max(b.lastSeen, G.now - 3); }
      else if (!b.target) b.investigate = { x: n.x + rand(-2, 2), y: Math.max(0, n.y - 1.5), z: n.z + rand(-2, 2), until: G.now + 9 };
      break;
    }
  }
  // grenade danger
  b.evade = null;
  for (const g of grenades) {
    if (g.explodeAt - G.now < 2.4 && Math.hypot(g.x - u.x, g.z - u.z) < 7.5 && Math.abs(g.y - u.y) < 3) { b.evade = g; break; }
  }
  // grenade throw at a hiding target
  if (b.target && b.grenades > 0 && G.now > b.grenadeAt && b.lastKnown && !b.evade) {
    const d = Math.hypot(b.lastKnown.x - u.x, b.lastKnown.z - u.z);
    if (d > 9 && d < 24 && (!b.visible || chance(0.25)) && G.now - b.lastSeen < 3 && G.match.bots.grenades && chance(cfg.grenade)) botThrow(u, b.lastKnown, d);
    b.grenadeAt = Math.max(b.grenadeAt, G.now + 2);
  }
  // decide state
  const prev = b.state;
  if (b.evade) b.state = 'evade';
  else if (b.target && b.visible) {
    if (!b.melee && G.match.bots.tactics && (b.wantCover || (u.health < 40 && !b.T.noCover) || (G.now < b.reloadUntil && Math.hypot(b.target.x - u.x, b.target.z - u.z) < 18)) && prev !== 'cover') {
      const c = findCover(u, b.target);
      b.wantCover = false;
      if (c) { b.cover = c; b.coverUntil = G.now + rand(1.6, 3.2); b.state = 'cover'; setGoal(u, c.x, c.y, c.z, true); }
      else b.state = 'engage';
    } else if (prev === 'cover' && (G.now < b.coverUntil || G.now < b.reloadUntil)) b.state = 'cover';
    else b.state = 'engage';
  } else if (b.target && b.lastKnown) {
    b.state = 'hunt';
    if (prev !== 'hunt' && G.match.bots.tactics && chance(cfg.aggro * 0.45) && mode !== 'survival') b.flankUntil = G.now + 6;
  } else if (b.investigate && G.now < b.investigate.until) b.state = 'investigate';
  else if (u.health < u.maxHealth * 0.55) {
    let hp = null, hd = 38;
    for (const p of pickups) if (p.available && p.type === 'health') { const d = Math.hypot(p.x - u.x, p.z - u.z); if (d < hd) { hd = d; hp = p; } }
    if (hp) { b.state = 'heal'; setGoal(u, hp.x, hp.y, hp.z); } else b.state = 'patrol';
  } else b.state = 'patrol';
  if (b.state !== 'cover' && prev === 'cover') b.wantCrouch = false;
  // mode objectives (Capture the Flag): carriers always run home, others take objectives when no one is in sight
  const H = G.match.hook;
  if (H && H.botGoal && b.state !== 'evade') {
    const g = H.botGoal(u);
    if (g && (!b.visible || (H.isCarrier && H.isCarrier(u)))) { b.state = 'objective'; setGoal(u, g.x, g.y, g.z); }
  }
  // parity with the player: pick up better guns, use earned killstreaks, UAV reveals enemies
  if (!b.visible && b.state !== 'evade') considerLoot(u, b);
  if (b.loot) { if (b.visible || b.state === 'evade') b.loot = null; else b.state = 'loot'; }
  botUseStreaks(u);
  if (b.uavUntil > G.now && !b.visible && !b.target && G.now > (b.uavPing || 0)) {
    b.uavPing = G.now + 3;
    let best = null, bd = Infinity;
    for (const t of G.units) if (t.alive && !t.downed && isEnemy(u, t)) { const d = Math.hypot(t.x - u.x, t.z - u.z); if (d < bd) { bd = d; best = t; } }
    if (best) { b.target = best; b.lastSeen = G.now - 2; b.lastKnown = { x: best.x, y: best.y, z: best.z }; }
  }

  if (b.state === 'patrol' && b.board) { const v = b.board; setGoal(u, v.x, v.y, v.z); } // walking to a vehicle seat (vehicles.js crew)
  else if (b.state === 'patrol' && (!b.goal || !b.path || b.pathI >= b.path.length || prev !== 'patrol')) {
    let n;
    if (G.match.teams && chance(0.6)) {
      // drift toward the enemy side so the squads actually meet
      const es = G.world.spawns.teams[1 - u.team]; const s = es[randInt(0, es.length - 1)];
      n = nearestNode(s[0] * 0.6, 0, s[1] * 0.6) || randomNode();
    } else n = randomNode((q) => Math.hypot(q.x - u.x, q.z - u.z) > 12);
    if (n) setGoal(u, n.x, n.y, n.z, true);
  } else if (b.state === 'hunt') {
    let gx = b.lastKnown.x, gz = b.lastKnown.z;
    if (G.now < b.flankUntil && Math.hypot(gx - u.x, gz - u.z) > 10) {
      const dx = gx - u.x, dz = gz - u.z, l = Math.hypot(dx, dz);
      gx += (-dz / l) * 8 * b.strafeDir; gz += (dx / l) * 8 * b.strafeDir;
    }
    setGoal(u, gx, b.lastKnown.y, gz);
    if (Math.hypot(b.lastKnown.x - u.x, b.lastKnown.z - u.z) < 2.2) {
      if (!b.searchUntil) b.searchUntil = G.now + 2.5;
      else if (G.now > b.searchUntil) { b.target = null; b.lastKnown = null; b.searchUntil = 0; }
    } else b.searchUntil = 0;
  } else if (b.state === 'investigate') {
    setGoal(u, b.investigate.x, b.investigate.y, b.investigate.z);
    if (Math.hypot(b.investigate.x - u.x, b.investigate.z - u.z) < 2.5) b.investigate.until = Math.min(b.investigate.until, G.now + 2);
  } else if (b.state === 'engage') {
    const t = b.target, d = Math.hypot(t.x - u.x, t.z - u.z), st = b.style;
    if (d > st.max || b.T.aggro >= 1 || b.melee) setGoal(u, t.x, t.y, t.z);
    else b.path = null;
    if (G.now > b.strafeSwitch) { b.strafeSwitch = G.now + rand(0.5, 1.6); if (chance(0.55)) b.strafeDir *= -1; }
    if (G.now > b.crouchUntil) {
      b.crouchUntil = G.now + rand(0.8, 2.2);
      b.wantCrouch = b.scoped ? chance(0.7) : chance(cfg.aggro * 0.3) && d > 8;
    }
  }
  // stuck detection
  if (G.now > b.stuckAt) {
    const moved = Math.hypot(u.x - b.sx, u.z - b.sz);
    if (b.path && b.pathI < b.path.length && moved < 0.5 && b.state !== 'engage') {
      b.stuck++;
      b.path = null; b.goal = null;
      if (b.stuck > 1 && u.grounded) { u.vy = PHYS.jump * 0.9; u.grounded = false; }
      if (b.stuck > 2) { b.investigate = null; b.stuck = 0; const n = randomNode(); if (n) setGoal(u, n.x, n.y, n.z, true); }
    } else if (moved > 1) b.stuck = 0;
    b.sx = u.x; b.sz = u.z; b.stuckAt = G.now + 1.1;
  }
}

function botThrow(u, at, d) {
  const b = u.brain, th = 0.72, g = 19;
  const v = Math.min(19, Math.sqrt(g * d / Math.sin(2 * th)) * 0.92);
  const dx = (at.x - u.x) / d, dz = (at.z - u.z) / d;
  throwGrenade(u, u.x + dx * 0.5, u.y + 1.6, u.z + dz * 0.5, dx * Math.cos(th) * v, Math.sin(th) * v, dz * Math.cos(th) * v, rand(2.1, 2.6));
  b.grenades--; b.grenadeAt = G.now + 14;
  play('pin', { x: u.x, y: u.y + 1.5, z: u.z }, { gain: 0.6 });
}


function fire(u, cfg) {
  const b = u.brain, t = b.target, w = WEAPONS[b.weapon];
  const my = u.y + (u.crouch ? 0.98 : 1.38);
  const mx = u.x - Math.sin(u.yaw) * 0.72 + Math.cos(u.yaw) * 0.08, mz = u.z - Math.cos(u.yaw) * 0.72 - Math.sin(u.yaw) * 0.08;
  const head = chance(cfg.headChance * (b.scoped ? 2 : 1));
  let ax = t.x, ay = t.y + (head ? t.h - 0.17 : t.h * 0.6), az = t.z;
  if (w.velocity) { // projectile rifles: lead the target and hold over for drop
    const tt = Math.hypot(ax - mx, az - mz) / w.velocity;
    ax += (t.velX || 0) * tt; az += (t.velZ || 0) * tt; ay += 4.9 * tt * tt;
  }
  let dx = ax - mx, dy = ay - my, dz = az - mz; const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
  const settle = clamp((G.now - b.trackStart) / cfg.settle, 0, 1);
  let err = cfg.aimErr * (2.4 - 1.6 * settle);
  err += (t.moveSpeed || 0) * 0.0068 * (1 - 0.4 * settle);
  if (u.moveSpeed > 1) err += 0.012;
  err += (b.scoped ? 0.002 : w.spread.hip * 0.3);
  err *= b.T.acc;
  if (G.match.mode === 'survival') err *= Math.max(0.7, 1 - (G.match.wave - 1) * 0.03);
  const dir = { x: 0, y: 0, z: 0 };
  let anyEnd = null, e0 = null;
  const p = G.player;
  const mul = cfg.dmgMul * b.T.dmg;
  for (let k = 0; k < w.pellets; k++) {
    coneDir(dx, dy, dz, err + (w.pellets > 1 ? w.spread.hip * 0.9 : 0), dir);
    if (w.velocity) { fireBullet(u, b.weapon, mx, my, mz, dir.x, dir.y, dir.z, mul, [mx, my, mz], 0xffb46a); anyEnd = 1; if (!e0) { const wh = rayWorld(mx, my, mz, dir.x, dir.y, dir.z, w.range), tt = wh ? wh.t : w.range; e0 = [mx + dir.x * tt, my + dir.y * tt, mz + dir.z * tt]; } continue; }
    const s = newShot(u, b.weapon, mx, my, mz, mul, k);
    traceSegment(s, dir.x, dir.y, dir.z, w.range);
    const end = Math.hypot(s.x - mx, s.y - my, s.z - mz);
    if (k === 0 || chance(0.3)) tracer(mx, my, mz, s.x, s.y, s.z, 0xffb46a, 420);
    anyEnd = end; if (!e0) e0 = [s.x, s.y, s.z];
  }
  if (G.mp && G.mp.live && e0) G.mp.shot(u, b.weapon, mx, my, mz, e0[0], e0[1], e0[2]);
  enemyFlash(mx, my, mz);
  play(w.sound, { x: mx, y: my, z: mz }, { occlude: true, gain: 0.9 });
  noise(u.x, my, u.z, w.noise, u);
  b.mag--;
  if (b.mag <= 0) { b.reloadUntil = G.now + (w.shells ? 2.6 : w.reload * 1.1); b.burst = 0; play('magOut', { x: u.x, y: my, z: u.z }, { gain: 0.5 }); }
  return anyEnd;
}

export function updateBots(dt) {
  const cfg = G.match.ai;
  const frozen = G.state === 'deploy';
  for (const u of G.bots) {
    const s = u.soldier, b = u.brain;
    if (!u.alive) { animateSoldier(s, u, dt); if (u.laser) u.laser.visible = false; continue; }
    if (frozen || u.dummy) { if (frozen) u.moveSpeed = 0; animateSoldier(s, u, dt); continue; } // practice-range dummies never think
    if (u.vehicle) { botVehicle(u, dt, cfg); u.moveSpeed = 0; if (u.laser) u.laser.visible = false; animateSoldier(s, u, dt); continue; }
    if (G.now >= b.thinkAt) { b.thinkAt = G.now + rand(0.2, 0.32); think(u, cfg); chooseGun(u); }
    if (b.reloadUntil && G.now >= b.reloadUntil) { b.reloadUntil = 0; b.mag = b.magMax; }
    const t = b.target;
    // ---- desired movement ----
    let mvx = 0, mvz = 0;
    // same speeds as the player: walk = PHYS.walk x gun handling, sprint = x sprintMul when not fighting
    const baseSpeed = PHYS.walk * (WEAPONS[b.weapon].speed || 1) * cfg.speed * b.T.speed * (b.speedMul || 1), sprint = baseSpeed * PHYS.sprintMul;
    let speed = baseSpeed;
    if (b.state === 'evade' && b.evade) {
      const dx = u.x - b.evade.x, dz = u.z - b.evade.z, l = Math.hypot(dx, dz) || 1;
      mvx = dx / l; mvz = dz / l; speed = sprint; b.wantCrouch = false;
    } else if (b.state === 'engage' && t) {
      const d = Math.hypot(t.x - u.x, t.z - u.z), st = b.style;
      const tx = (t.x - u.x) / (d || 1), tz = (t.z - u.z) / (d || 1);
      if (b.path && (d > st.max || b.T.aggro >= 1 || b.melee)) { const fp = followPath(u); if (fp) { mvx = fp[0]; mvz = fp[1]; } speed = b.T.aggro >= 1 || b.melee ? sprint : baseSpeed * 0.8; }
      else if (d < st.min && WEAPONS[b.weapon].pellets <= 1) { mvx = -tx; mvz = -tz; speed = baseSpeed * 0.55; }
      if (!b.melee && (!b.scoped || !b.wantCrouch)) { mvx += -tz * b.strafeDir * 0.8; mvz += tx * b.strafeDir * 0.8; }
      const l = Math.hypot(mvx, mvz); if (l > 1e-3) { mvx /= l; mvz /= l; }
      if (!b.melee) speed = Math.min(speed, baseSpeed * 0.75); else if (!b.path || d < 3) { mvx = tx; mvz = tz; speed = sprint; }
    } else if (b.state === 'cover' && b.cover) {
      const fp = followPath(u);
      if (fp && fp[2] > 0.5) { mvx = fp[0]; mvz = fp[1]; speed = sprint; b.wantCrouch = false; }
      else {
        // at cover: crouch, then peek by standing up
        if (!b.peekUntil || G.now > b.peekUntil + 1.6) b.peekUntil = G.now + rand(1.2, 2.4);
        b.wantCrouch = G.now > b.peekUntil || G.now < b.reloadUntil;
      }
    } else {
      const fp = followPath(u);
      if (fp) { mvx = fp[0]; mvz = fp[1]; }
      speed = b.state === 'patrol' ? baseSpeed * 0.75 : sprint; // hunting, investigating, healing and looting are done at a run
      b.wantCrouch = false;
    }
    // crouch handling
    if (b.wantCrouch) u.crouch = true; else if (u.crouch && canStand(u)) u.crouch = false;
    u.h = u.crouch ? PHYS.crouchH : PHYS.standH;
    u.crouchT = damp(u.crouchT, u.crouch ? 1 : 0, 10, dt);
    if (u.crouch) speed *= 0.45;
    if (inWater(u)) speed *= 0.62;
    b.vx = damp(b.vx, mvx * speed, 10, dt); b.vz = damp(b.vz, mvz * speed, 10, dt);
    const ox = u.x, oz = u.z;
    if (b.climb) climbLadder(u, b, dt);
    else {
      const hit = moveBody(u, b.vx * dt, b.vz * dt);
      if (hit && b.state === 'engage') b.strafeDir *= -1;
      updateVertical(u, dt);
      if (u.fallH) applyFall(u);
    }
    u.moveSpeed = Math.hypot(u.x - ox, u.z - oz) / Math.max(dt, 1e-4);
    if (b.loot) tryLoot(u, b);
    // ---- facing / aiming ----
    let wantYaw = u.yaw, turn = 7;
    const aiming = t && b.visible && (b.state === 'engage' || b.state === 'cover');
    if (aiming) { wantYaw = yawTo(u.x, u.z, t.x, t.z); turn = cfg.turn; u.aimPitch = Math.atan2((t.y + t.h * 0.6) - (u.y + 1.4), Math.hypot(t.x - u.x, t.z - u.z)); }
    else if (Math.hypot(b.vx, b.vz) > 0.8) { wantYaw = Math.atan2(-b.vx, -b.vz); u.aimPitch *= 0.9; }
    else if (b.state === 'hunt' || b.state === 'investigate') wantYaw = u.yaw + dt * 1.2;
    const dyaw = angleDiff(u.yaw, wantYaw);
    u.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), turn * dt);
    // ---- shooting ----
    const facing = Math.abs(dyaw) < 0.3;
    const canShoot = aiming && G.now >= b.reactAt && facing && !b.reloadUntil && !(b.state === 'cover' && u.crouch && b.cover && b.wantCrouch) && G.state === 'playing' && !(G.match.rules && G.match.rules.passive);
    if (u.laser) u.laser.visible = false;
    if (canShoot) {
      const w = WEAPONS[b.weapon];
      if (b.melee) {
        if (t.downed) b.target = null;
        else if (Math.hypot(t.x - u.x, t.z - u.z) < 1.9 && Math.abs(t.y - u.y) < 1.3 && G.now >= b.nextShot) {
          // zombie claws: own damage (difficulty + round), slower swing, short grace after each hit so a swarm can't
          // delete you in one frame
          b.nextShot = G.now + (u.clawDmg ? 0.9 : 0.75); u.lastSwipe = G.now; if (u.soldier && b.T.claws) swipe(u.soldier);
          play('knife', { x: u.x, y: u.y + 1.4, z: u.z }, { gain: 0.8 });
          if (u.clawDmg && G.now < (t.clawGrace || 0)) { /* grace */ } else { if (u.clawDmg) t.clawGrace = G.now + 0.6;
          damage(t, u.clawDmg || WEAPONS.knife.damage * cfg.dmgMul * b.T.dmg, u, { weapon: b.T.claws ? 'claws' : 'knife', melee: true, sx: u.x, sz: u.z, dist: 1.5 }); }
        }
      } else if (b.scoped) {
        if (!b.aimStart) b.aimStart = G.now;
        const need = 0.9 * cfg.sniperAim;
        const my = u.y + (u.crouch ? 0.98 : 1.38);
        const a = u.laser.geometry.attributes.position.array;
        a[0] = u.x - Math.sin(u.yaw) * 0.72; a[1] = my; a[2] = u.z - Math.cos(u.yaw) * 0.72; a[3] = t.x; a[4] = t.y + t.h * 0.6; a[5] = t.z;
        u.laser.geometry.attributes.position.needsUpdate = true; u.laser.visible = true;
        if (G.now - b.aimStart > need && G.now >= b.nextShot) { fire(u, cfg); b.nextShot = G.now + w.rate * 1.4; b.aimStart = G.now - need * 0.35; }
      } else if (G.now >= b.pauseUntil) {
        if (b.burst <= 0) b.burst = Math.max(1, Math.round(randInt(b.style.burst[0], b.style.burst[1]) * cfg.burstMul));
        if (G.now >= b.nextShot) {
          fire(u, cfg); b.burst--;
          b.nextShot = G.now + w.rate * rand(1.05, 1.35) * (w.auto ? 1 : 1.6);
          if (b.burst <= 0) b.pauseUntil = G.now + rand(cfg.burstGap[0], cfg.burstGap[1]) * (w.shells ? 0.6 : 1);
        }
      }
    } else if (!aiming) b.aimStart = 0;
    // ---- visuals ----
    animateSoldier(s, u, dt);
    if (u.flashUntil > G.realTime) setFlash(s, 0.9);
    else if (u.protectUntil > G.now) setFlash(s, 0.35 + 0.25 * Math.sin(G.realTime * 18), 0x3a6aa8);
    else setFlash(s, 0);
    // bot footsteps you can hear (helps locate flankers)
    if (u.grounded && u.moveSpeed > 3.2 && !u.crouch) {
      u.stepAcc = (u.stepAcc || 0) + u.moveSpeed * dt;
      if (u.stepAcc > 2.3) { u.stepAcc = 0; play(stepSound(surfaceAt(u.x, u.z, u.y)), { x: u.x, y: u.y, z: u.z }, { gain: 1.1, range: 28, ref: 4, occlude: true }); noise(u.x, u.y, u.z, 9, u); }
    }
  }
}
