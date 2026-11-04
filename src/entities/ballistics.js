// Shared bullet rules for the player and bots (A4).
// Hitscan for most guns; snipers fire real projectiles with travel time and gravity drop.
// Range: full damage to falloff[0], linear down to falloff[2] at falloff[1] (= hard max range, nothing beyond).
// Penetration by calibre: how thick a surface each class can punch through and what it costs in damage.
import { G } from '../core/state.js';
import { WEAPONS, PENETRATION } from '../core/config.js';
import { rayWorld, rayUnits, hullSpan } from '../world/physics.js';
import { damage, isEnemy } from './units.js';
import { damageBarrel } from './worldprops.js';
import { impact, blood, tracer } from '../engine/fx.js';
import { play } from '../engine/audio.js';
import { recordShot } from '../game/killcam.js';
import { damageVehicle, crewMul, tailRotorHit } from './vehicles.js';
import { chopperHit, damageChopper } from './streaks.js';

export function falloff(w, d) {
  const [f0, f1, mn] = w.falloff;
  return d <= f0 ? 1 : d >= f1 ? mn : 1 + (mn - 1) * (d - f0) / (f1 - f0);
}

// distance the ray travels inside an axis-aligned collider (from its entry at tEnter)
function exitT(c, ox, oy, oz, dx, dy, dz) {
  if (c.hull) { const sp = hullSpan(c, ox, oy, oz, dx, dy, dz); return sp ? sp[1] : 0; }
  let tmx = Infinity;
  for (const [o, d, mn, mx] of [[ox, dx, c.minX, c.maxX], [oy, dy, c.minY, c.maxY], [oz, dz, c.minZ, c.maxZ]]) {
    if (Math.abs(d) < 1e-9) continue;
    const t1 = (mn - o) / d, t2 = (mx - o) / d;
    tmx = Math.min(tmx, Math.max(t1, t2));
  }
  return tmx;
}

// Solid thickness along the ray starting at a world hit, merging colliders that touch (stacked boxes, wall + trim).
function thickness(wh, ox, oy, oz, dx, dy, dz) {
  let c = wh.col, t = exitT(c, ox, oy, oz, dx, dy, dz), wood = c.mat === 'wood';
  for (let i = 0; i < 4; i++) {
    const n = rayWorld(ox + dx * (t + 0.01), oy + dy * (t + 0.01), oz + dz * (t + 0.01), dx, dy, dz, 0.03);
    if (!n || !n.col || n.col.axis || n.col.minY === undefined) break;
    if (n.col.mat !== 'wood') wood = false;
    t = t + 0.01 + n.t + Math.max(0, exitT(n.col, ox + dx * (t + 0.01 + n.t), oy + dy * (t + 0.01 + n.t), oz + dz * (t + 0.01 + n.t), dx, dy, dz));
  }
  return { exit: t, thick: t - wh.t, wood };
}

const SFX = (mat) => mat === 'water' ? 'splash' : mat === 'metal' ? 'impactMetal' : mat === 'wood' ? 'impactWood' : mat === 'sand' || mat === 'ground' || mat === 'grass' ? 'impactSoft' : 'impact';

function waterSurface(wh) {
  if (!G.world.water || wh.ny < 0.9 || wh.y > 0.4) return;
  for (const a of G.world.water) if (wh.x > a.minX && wh.x < a.maxX && wh.z > a.minZ && wh.z < a.maxZ) { wh.mat = 'water'; wh.y = a.top; }
}

// One bullet state, shared by hitscan traces and projectiles in flight.
export function newShot(shooter, wid, x, y, z, mul, k = 0) {
  const s = { shooter, wid, w: WEAPONS[wid], x, y, z, mul, k, travelled: 0, pens: 0, walls: 0, mulPen: 1, done: false, hit: null, whizzed: false, kills: 0 };
  if (shooter && shooter.isPlayer) { s.ads = shooter.adsT || 0; s.scopedFor = shooter.scopedAt ? G.now - shooter.scopedAt : 99; s.spin = shooter.spinAcc || 0; s.air = !shooter.grounded && !shooter.onLadder; }
  recordShot(s);
  return s;
}

// Trace the shot `len` metres along (dx,dy,dz). Applies damage, penetration and effects. Returns true when the bullet stops.
export function traceSegment(s, dx, dy, dz, len) {
  const w = s.w, pc = PENETRATION[w.pen || 'none'], isP = !!s.shooter.isPlayer;
  len = Math.min(len, w.range - s.travelled);
  if (len <= 0) { s.done = true; return true; }
  whizCheck(s, dx, dy, dz, len);
  for (let guard = 0; guard < 6; guard++) {
    const wh = rayWorld(s.x, s.y, s.z, dx, dy, dz, len);
    const ch = chopperHit(s.x, s.y, s.z, dx, dy, dz, wh ? wh.t : len);
    if (ch) { const t = ch.t; damageChopper(ch.c, w.damage * falloff(w, s.travelled + t) * s.mul * (w.pen === 'heavy' ? 2 : 1), s.shooter); impact(s.x + dx * t, s.y + dy * t, s.z + dz * t, -dx, -dy, -dz, 'metal'); s.x += dx * t; s.y += dy * t; s.z += dz * t; s.travelled += t; s.done = true; return true; }
    const tr = tailRotorHit(s.x, s.y, s.z, dx, dy, dz, wh ? wh.t : len);
    if (tr && !tr.v.seats.includes(s.shooter)) { const t = tr.t, dist = s.travelled + t; damageVehicle(tr.v, w.damage * falloff(w, dist) * s.mul * s.mulPen * 3, s.shooter); if (isP) { play('impactMetal', { x: s.x + dx * t, y: s.y + dy * t, z: s.z + dz * t }, { gain: 0.6 }); } impact(s.x + dx * t, s.y + dy * t, s.z + dz * t, -dx, -dy, -dz, 'metal'); s.x += dx * t; s.y += dy * t; s.z += dz * t; s.travelled = dist; s.done = true; return true; }
    const uh = rayUnits(s.x, s.y, s.z, dx, dy, dz, wh ? wh.t : len, (u) => u === s.shooter || !isEnemy(s.shooter, u));
    if (uh) {
      const t = uh.t, ex = s.x + dx * t, ey = s.y + dy * t, ez = s.z + dz * t, head = uh.zone === 'head', dist = s.travelled + t;
      const zm = head ? w.headMul : uh.zone === 'legs' ? w.legMul : 1;
      damage(uh.unit, w.damage * falloff(w, dist) * zm * s.mul * s.mulPen, s.shooter, { weapon: s.wid, zone: uh.zone, headshot: head, sx: s.shooter.x, sz: s.shooter.z, dist, shot: s, pen: s.walls > 0 });
      if (!uh.unit.isPlayer) blood(ex, ey, ez, dx, dz, head);
      if (isP) play('bodyHit', { x: ex, y: ey, z: ez }, { gain: 0.6 });
      s.hit = { unit: uh.unit, head }; s.x = ex; s.y = ey; s.z = ez; s.travelled = dist; s.done = true;
      return true;
    }
    if (!wh) { s.x += dx * len; s.y += dy * len; s.z += dz * len; s.travelled += len; return s.travelled >= w.range - 1e-3 ? (s.done = true) : false; }
    waterSurface(wh);
    const fxOn = isP ? s.k < 3 : s.k < 2;
    if (fxOn) impact(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, wh.mat);
    if (isP && s.k < 3) play(SFX(wh.mat), { x: wh.x, y: wh.y, z: wh.z }, { gain: 0.5 });
    if (wh.col && wh.col.vehicle) { // the hull takes the hit, and rounds go on into the crew (open jeep: most of it; helicopter skin/glass: less)
      const v = wh.col.vehicle, base = w.damage * falloff(w, s.travelled + wh.t) * s.mul * s.mulPen;
      const ch = rayUnits(s.x, s.y, s.z, dx, dy, dz, wh.t + 5.5, (u) => u.vehicle !== v || u === s.shooter || !isEnemy(s.shooter, u));
      if (ch) {
        const head = ch.zone === 'head', zm = head ? w.headMul : ch.zone === 'legs' ? w.legMul : 1;
        damage(ch.unit, base * zm * crewMul(v, wh.x, wh.y, wh.z), s.shooter, { weapon: s.wid, zone: ch.zone, headshot: head, sx: s.shooter.x, sz: s.shooter.z, dist: s.travelled + ch.t });
        if (!ch.unit.isPlayer) blood(s.x + dx * ch.t, s.y + dy * ch.t, s.z + dz * ch.t, dx, dz, head);
        s.hit = { unit: ch.unit, head };
      }
      damageVehicle(v, base * (w.pen === 'heavy' ? 1.2 : 0.5) * (ch ? 0.5 : 1), s.shooter);
      return stop(s, wh, isP);
    }
    if (wh.col && wh.col.barrel) { damageBarrel(wh.col, w.damage * falloff(w, s.travelled + wh.t) * s.mul * s.mulPen, s.shooter); return stop(s, wh); }
    // penetration?
    const c = wh.col, m = wh.mat;
    if (!c || c.axis || c.minY === undefined || s.pens >= pc.max || m === 'sand' || m === 'water') return stop(s, wh, isP);
    const th = thickness(wh, s.x, s.y, s.z, dx, dy, dz);
    const wall = !th.wood;
    const limit = wall ? (s.walls < pc.walls ? pc.wall : 0) : pc.wood;
    if (th.thick > limit) return stop(s, wh, isP);
    const adv = th.exit + 0.02;
    if (fxOn) impact(s.x + dx * th.exit, s.y + dy * th.exit, s.z + dz * th.exit, dx, dy, dz, m); // exit hole
    s.mulPen *= wall ? pc.wallMul : pc.woodMul; s.pens++; if (wall) s.walls++;
    s.x += dx * adv; s.y += dy * adv; s.z += dz * adv; s.travelled += adv; len -= adv;
    if (len <= 0) return false;
  }
  s.done = true; return true;
}

function stop(s, wh, ricochet) {
  if (ricochet && wh.mat === 'metal' && s.k === 0 && Math.random() < 0.25) play('ricochet', { x: wh.x, y: wh.y, z: wh.z }, { gain: 0.8 });
  s.travelled += wh.t; s.x = wh.x; s.y = wh.y; s.z = wh.z; s.done = true;
  return true;
}

// enemy rounds passing close to the player's head crack past
function whizCheck(s, dx, dy, dz, len) {
  const p = G.player;
  if (s.whizzed || s.k !== 0 || s.shooter.isPlayer || !p || !p.alive || !isEnemy(s.shooter, p)) return;
  const hx = p.x - s.x, hy = p.y + p.h - 0.2 - s.y, hz = p.z - s.z;
  const tt = Math.max(0, Math.min(len, hx * dx + hy * dy + hz * dz));
  const md = Math.hypot(s.x + dx * tt - p.x, s.y + dy * tt - (p.y + p.h - 0.2), s.z + dz * tt - p.z);
  if (md < 1.4 && md > 0.25 && tt < len) {
    // only if nothing solid is in between
    if (!rayWorld(s.x, s.y, s.z, dx, dy, dz, tt, true)) { s.whizzed = true; play('whiz', { x: s.x + dx * tt, y: s.y + dy * tt, z: s.z + dz * tt }, { gain: 0.9 }); }
  }
}

// ---------- projectile bullets (snipers) ----------
export const bullets = [];
const BULLET_G = 9.81;

export function fireBullet(shooter, wid, x, y, z, dx, dy, dz, mul, muzzle, tracerColor) {
  const w = WEAPONS[wid], s = newShot(shooter, wid, x, y, z, mul);
  s.vx = dx * w.velocity; s.vy = dy * w.velocity; s.vz = dz * w.velocity;
  bullets.push(s);
  // tracer runs at the bullet's own speed along its (nearly straight) path
  const wh = rayWorld(x, y, z, dx, dy, dz, w.range), end = wh ? wh.t : w.range;
  if (muzzle) tracer(muzzle[0], muzzle[1], muzzle[2], x + dx * end, y + dy * end, z + dz * end, tracerColor, w.velocity);
  return s;
}

export function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const s = bullets[i];
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    const done = traceSegment(s, s.vx / sp, s.vy / sp, s.vz / sp, sp * dt);
    s.vy -= BULLET_G * dt;
    if (done || s.y < -5) {
      if (s.hit && s.shooter.isPlayer && G.match) { G.match.stats.hits++; if (s.hit.head) G.match.stats.headHits++; }
      bullets.splice(i, 1);
    }
  }
}
export function clearBullets() { bullets.length = 0; }
