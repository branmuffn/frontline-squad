import { G } from '../core/state.js';
import { PHYS, WEAPONS, SOURCE_NAMES } from '../core/config.js';
import { moveBody, inWater, stepSound, surfaceAt } from '../world/physics.js';
import { startDeath, setFlash } from './soldier.js';
import { play } from '../engine/audio.js';
import * as hud from '../ui/hud.js';
import { onKill as matchOnKill } from '../game/match.js';
import { awardKill, award } from '../game/progression.js';
import { checkStreak, botStreak, remoteStreak } from './streaks.js';
import { vestMul } from './gear.js';
import { dropWeapon } from './worldprops.js';

let nextId = 1;
export function makeUnit(o) {
  return {
    id: nextId++, name: 'UNIT', isPlayer: false, team: 0,
    x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, r: PHYS.radius, h: PHYS.standH, grounded: true,
    crouch: false, crouchT: 0, yaw: 0, pitch: 0, aimPitch: 0, moveSpeed: 0,
    health: 100, maxHealth: 100, alive: false, kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, bestStreak: 0,
    damagers: new Map(), protectUntil: 0, respawnAt: 0, lastHitAt: -10, lastAttacker: null, soldier: null,
    ...o,
  };
}

export const isEnemy = (a, b) => a !== b && a.team !== b.team;

// Ladders are one body wide: someone on the ladder above (climbing up) or below (climbing down) blocks you.
export function ladderBlocked(u, L, up) {
  for (const o of G.units) {
    if (o === u || !o.alive || !o.onLadder) continue;
    const dx = o.x - L.x, dz = o.z - L.z, along = dx * L.nx + dz * L.nz, lat = Math.abs(dx * -L.nz + dz * L.nx);
    if (along < -0.3 || along > 1.2 || lat > 0.8) continue;
    const dy = o.y - u.y;
    if (up ? dy > -0.2 && dy < 1.9 : dy < 0.2 && dy > -1.9) return true;
  }
  return false;
}
export const ladderBusy = (u, L) => ladderBlocked(u, L, true) || ladderBlocked(u, L, false) || G.units.some((o) => o !== u && o.alive && o.onLadder && Math.hypot(o.x - L.x, o.z - L.z) < 1.3);

export function weaponLabel(src) { return WEAPONS[src] ? WEAPONS[src].name : SOURCE_NAMES[src] || String(src || '').toUpperCase(); }

// info: { weapon, zone, headshot, sx, sz (source position), melee, explosive, noStreak, dist }
export function damage(victim, amount, attacker, info = {}) {
  if (!victim.alive || !(G.state === 'playing' || G.state === 'dead' || G.state === 'intermission')) return 0;
  if (G.mp && G.mp.live) { // multiplayer: clients claim their hits; the host ignores mirrored (cosmetic) remote shots
    if (G.mp.client) return G.mp.clientDamage(victim, amount, attacker, info);
    if (attacker && attacker.remote && !info.claim && !info.explosive) return 0;
  }
  if (attacker && attacker !== victim && !isEnemy(attacker, victim)) return 0;
  if (victim.protectUntil > G.now && attacker !== victim) return 0;
  const R = G.match && G.match.rules;
  if (R) {
    if (R.god && victim.isPlayer) return 0;
    if (R.headshots && attacker && attacker !== victim && !info.headshot && !info.melee) return 0;
    if (R.oneShot && attacker && attacker !== victim) amount = victim.health + 1;
  }
  const H = G.match && G.match.hook;
  let dmg = H && H.modDamage ? H.modDamage(victim, attacker, amount) : amount;
  if (attacker === victim) dmg *= 0.6;
  dmg *= vestMul(victim, info); // heavy vest
  dmg = Math.min(dmg, victim.health + 200);
  victim.health -= dmg;
  victim.lastHitAt = G.now; victim.lastAttacker = attacker;
  if (H && H.onDamage) H.onDamage(victim, attacker, dmg, info);
  if (attacker && attacker !== victim) {
    const rec = victim.damagers.get(attacker) || { dmg: 0, t: 0 };
    rec.dmg += dmg; rec.t = G.now; victim.damagers.set(attacker, rec);
  }
  const lethal = victim.health <= 0;
  if (victim.isPlayer) {
    hud.damageFrom(info.sx ?? (attacker ? attacker.x : victim.x), info.sz ?? (attacker ? attacker.z : victim.z), dmg);
    play('hurt', null, { gain: 0.8 });
    G.shake = Math.min(0.05, (G.shake || 0) + dmg * 0.0009);
  }
  if (attacker && attacker.isPlayer && attacker !== victim) {
    hud.hitMarker(lethal ? 'kill' : info.headshot ? 'head' : 'hit');
    play(info.headshot ? 'headshot' : 'hit', null, { important: true });
    G.match.stats.damage += dmg;
  }
  if (victim.soldier) { victim.soldier.flinch = Math.min(1, victim.soldier.flinch + 0.5); victim.flashUntil = G.realTime + 0.09; }
  if (victim.brain && attacker) victim.brain.onDamaged(victim, attacker);
  if (G.mp && G.mp.live && (victim.remote || (attacker && attacker.remote))) G.mp.hurt(victim, dmg, info, attacker);
  if (lethal) kill(victim, attacker, info);
  return dmg;
}

export function kill(victim, attacker, info = {}) {
  if (!victim.alive) return;
  const victimStreak = victim.streak;
  victim.alive = false; victim.health = 0; victim.deaths++; victim.streak = 0;
  const credited = attacker && attacker !== victim ? attacker : null;
  if (victim.soldier) {
    let front = true;
    if (attacker) { const dx = attacker.x - victim.x, dz = attacker.z - victim.z; front = (-Math.sin(victim.yaw) * dx - Math.cos(victim.yaw) * dz) >= 0; }
    startDeath(victim.soldier, front);
    setFlash(victim.soldier, 0);
  }
  if (credited) {
    credited.kills++;
    if (!info.noStreak) { credited.streak++; credited.bestStreak = Math.max(credited.bestStreak, credited.streak); }
  }
  // assists
  for (const [u, rec] of victim.damagers) {
    if (u === credited || u === victim || rec.t < G.now - 8 || rec.dmg < 25) continue;
    u.assists++;
    if (u.isPlayer) award('assist', 'Assist');
  }
  victim.damagers.clear();
  if (victim.brain && !(G.match.rules && G.match.rules.knife) && !(G.match.hook && G.match.hook.noDrops)) dropWeapon(victim.brain.weapon, victim.x, victim.y + 0.02, victim.z);
  hud.killfeed(credited ? credited : victim, victim, info.weapon, !!info.headshot, !credited);
  const noStreaks = G.match.hook && G.match.hook.noStreaks;
  if (credited && !credited.isPlayer && !credited.remote && !info.noStreak && !noStreaks) botStreak(credited, credited.streak);
  if (credited && credited.remote && !info.noStreak && !noStreaks && G.mp && G.mp.live) remoteStreak(credited, credited.streak);
  if (credited && credited.isPlayer) {
    awardKill(victim, info, victimStreak);
    if (!info.noStreak && !noStreaks) checkStreak(credited.streak);
    play('kill', null, { important: true, delay: 0.06 });
  }
  if (victim.isPlayer) G.player.lastKiller = credited;
  matchOnKill(credited, victim, info);
  if (G.mp && G.mp.live && G.mp.host) G.mp.onKill(credited, victim, info);
}

// Push overlapping bodies apart (bots never stack, player can't walk through them)
export function separateUnits() {
  const us = G.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i]; if (!a.alive) continue;
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j]; if (!b.alive || Math.abs(a.y - b.y) > 1.4) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
      if (d >= min || d < 1e-4) continue;
      const push = (min - d) / 2, nx = dx / d, nz = dz / d;
      const wa = a.isPlayer ? 0.35 : 1, wb = b.isPlayer ? 0.35 : 1;
      moveBody(a, -nx * push * wa, -nz * push * wa);
      moveBody(b, nx * push * wb, nz * push * wb);
    }
  }
}

export function noise(x, y, z, radius, src) {
  G.noise.push({ x, y, z, r: radius, t: G.now, src });
  if (G.noise.length > 40) G.noise.shift();
}

// Fall damage by drop height (peak of the arc to the landing surface), shared by the player and bots.
export function applyFall(u) {
  const h = u.fallH || 0;
  if (h <= PHYS.fallSafe || !u.alive || inWater(u)) return 0;
  const dmg = h >= PHYS.fallLethal ? 999 : (h - PHYS.fallSafe) / (PHYS.fallLethal - PHYS.fallSafe) * u.maxHealth;
  return damage(u, dmg, null, { weapon: 'fall' });
}

// Movement sounds for everyone except you (bots already make their own footsteps in ai.js): other players' footsteps
// (sprint louder, crouch softer, prone a quiet crawl), ladder rungs, landings. Positional: quieter with distance,
// muffled behind walls (audio.js range/ref/occlude).
export function unitFoley(dt) {
  for (const u of G.units) {
    if (u.isPlayer || !u.alive || u.vehicle) { u._fx = undefined; continue; }
    const f = u._fx || (u._fx = { x: u.x, y: u.y, z: u.z, acc: 0, air: 0, peak: u.y });
    const d = Math.hypot(u.x - f.x, u.z - f.z), dy = u.y - f.y, pos = { x: u.x, y: u.y, z: u.z };
    if (d > 4) { f.x = u.x; f.y = u.y; f.z = u.z; continue; } // teleport / respawn
    if (u.onLadder) { f.acc += Math.abs(dy); if (f.acc > 0.55) { f.acc = 0; play('stepMetal', pos, { gain: 0.7, range: 24, ref: 4, occlude: true }); } }
    else if (!u.brain) { // other players (bots step in ai.js)
      const v = d / Math.max(dt, 1e-3), step = u.prone ? 1.4 : u.crouch ? 2.6 : v > 6 ? 2.0 : 2.3, gain = u.prone ? 0.3 : u.crouch ? 0.55 : v > 6 ? 1.25 : 0.95;
      f.acc += d; if (f.acc > step && v > 0.6) { f.acc = 0; play(u.prone ? 'cloth' : inWater(u) ? 'stepWater' : stepSound(surfaceAt(u.x, u.z, u.y)), pos, { gain, range: 30, ref: 4, occlude: true }); }
    }
    const grounded = u.grounded !== false && Math.abs(dy) < 0.02; // proxies have no flag: use vertical motion
    if (!grounded && !u.onLadder) { f.air += dt; f.peak = Math.max(f.peak, u.y); }
    else { if (f.air > 0.25 && f.peak - u.y > 0.6) play('land', pos, { gain: Math.min(1.2, 0.4 + (f.peak - u.y) * 0.25), range: 30, ref: 4, occlude: true }); f.air = 0; f.peak = u.y; }
    f.x = u.x; f.y = u.y; f.z = u.z;
  }
}
