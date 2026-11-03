import { G } from '../core/state.js';
import { PHYS, WEAPONS, SOURCE_NAMES } from '../core/config.js';
import { moveBody } from '../world/physics.js';
import { startDeath, setFlash } from './soldier.js';
import { play } from '../engine/audio.js';
import * as hud from '../ui/hud.js';
import { onKill as matchOnKill } from '../game/match.js';
import { awardKill, award } from '../game/progression.js';
import { checkStreak } from './streaks.js';
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

export function weaponLabel(src) { return WEAPONS[src] ? WEAPONS[src].name : SOURCE_NAMES[src] || String(src || '').toUpperCase(); }

// info: { weapon, zone, headshot, sx, sz (source position), melee, explosive, noStreak, dist }
export function damage(victim, amount, attacker, info = {}) {
  if (!victim.alive || !(G.state === 'playing' || G.state === 'dead' || G.state === 'intermission')) return 0;
  if (attacker && attacker !== victim && !isEnemy(attacker, victim)) return 0;
  if (victim.protectUntil > G.now && attacker !== victim) return 0;
  const R = G.match && G.match.rules;
  if (R) {
    if (R.god && victim.isPlayer) return 0;
    if (R.headshots && attacker && attacker !== victim && !info.headshot && !info.melee) return 0;
    if (R.oneShot && attacker && attacker !== victim) amount = victim.health + 1;
  }
  let dmg = amount;
  if (attacker === victim) dmg *= 0.6;
  dmg = Math.min(dmg, victim.health + 200);
  victim.health -= dmg;
  victim.lastHitAt = G.now; victim.lastAttacker = attacker;
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
  if (victim.brain && !(G.match.rules && G.match.rules.knife)) dropWeapon(victim.brain.weapon, victim.x, victim.y + 0.02, victim.z);
  hud.killfeed(credited ? credited : victim, victim, info.weapon, !!info.headshot, !credited);
  if (credited && credited.isPlayer) {
    awardKill(victim, info, victimStreak);
    if (!info.noStreak) checkStreak(credited.streak);
    play('kill', null, { important: true, delay: 0.06 });
  }
  if (victim.isPlayer) G.player.lastKiller = credited;
  matchOnKill(credited, victim, info);
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
