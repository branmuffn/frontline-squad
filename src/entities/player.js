import * as THREE from 'three';
import { G } from '../core/state.js';
import { PHYS, WEAPONS, GRENADE, loadoutGuns, magZoom } from '../core/config.js';
import { clamp, damp, lerp, rand, coneDir } from '../core/util.js';
import { input, down, consumeMouse } from '../core/input.js';
import { updateDeathCam, endDeathCam } from '../game/killcam.js';
import { moveBody, updateVertical, canStand, rayWorld, rayUnits, supportHeight, surfaceAt, stepSound, inWater, PENETRABLE } from '../world/physics.js';
import { newShot, traceSegment, fireBullet } from './ballistics.js';
import { makeUnit, damage, applyFall, isEnemy, noise, kill } from './units.js';
import { updateViewmodel, vmFire, vmLand, ejectShell, vmModel } from './viewmodel.js';
import { throwGrenade, explode } from './grenades.js';
import { fireRocket } from './projectiles.js';
import { damageBarrel } from './worldprops.js';
import { play, setListener } from '../engine/audio.js';
import { tracer, impact, blood, muzzleSmoke } from '../engine/fx.js';
import * as hud from '../ui/hud.js';

const _d = new THREE.Vector3();
let P = null;

export function createPlayer(team) {
  P = makeUnit({ name: 'YOU', isPlayer: true, team });
  Object.assign(P, {
    weapons: ['m4', 'usp', 'knife'], slot: 0, lastSlot: 1, ammo: {},
    nextFire: 0, semiReady: true, bloom: 0, recoilP: 0, recoilY: 0, adsT: 0, sprintT: 0, sprinting: false,
    switchStart: -10, switchDur: 0.01, reloadStart: -1, reloadEnd: 0, reloadKind: 'mag', shellNext: 0, reloadSfx: 0,
    pumpStart: -1, boltStart: -1, adsBlockUntil: 0, meleeStart: -1, meleeHeavy: false, meleeHitAt: -1,
    grenades: GRENADE.perLife, cookStart: -1, throwStart: -1, bob: 0, eye: PHYS.eyeStand, stepDist: 0,
    jumpRequest: -10, lastShotAt: -10, dryAt: 0, autoReloadAt: -1, lastKiller: null, deathT: 0, noSprintUntil: 0,
    lowHpBeat: 0, mdx: 0, mdy: 0,
  });
  G.player = P;
  return P;
}

const cur = () => P.weapons[P.slot];
const W = () => WEAPONS[cur()];
export const raised = () => G.now >= P.switchStart + P.switchDur;
const reloading = () => P.reloadStart >= 0;

export function refillAmmo() {
  for (const id of P.weapons) { const w = WEAPONS[id]; if (!w.melee) P.ammo[id] = { mag: w.mag, res: w.reserve }; }
}

export function spawnPlayer(x, y, z, yaw) {
  endDeathCam();
  Object.assign(P, {
    x, y, z, vx: 0, vz: 0, vy: 0, yaw, pitch: 0, alive: true, health: 100, grounded: true, crouch: false, crouchT: 0, h: PHYS.standH,
    slot: 0, lastSlot: 1, adsT: 0, recoilP: 0, recoilY: 0, bloom: 0, reloadStart: -1, meleeStart: -1, meleeHitAt: -1, cookStart: -1, throwStart: -1,
    pumpStart: -1, boltStart: -1, grenades: GRENADE.perLife, protectUntil: G.now + 2.2, streak: 0, eye: PHYS.eyeStand, semiReady: true,
  });
  P.weapons = startingWeapons();
  refillAmmo();
  P.switchStart = G.now; P.switchDur = WEAPONS[cur()].draw;
  P.damagers.clear();
  hud.setWeapon(P);
}

// guns from the active preset under the match's slot rule, then the knife
export function startingWeapons() {
  const m = G.match;
  if (m && m.rules && m.rules.knife) return ['knife'];
  const hw = m && m.hook && m.hook.weapons && m.hook.weapons(P);
  if (hw) return hw.slice();
  const guns = m && m.loadout ? m.loadout.guns : loadoutGuns(G.profile.loadout, (m && m.slots) || 'classic');
  return [...guns, 'knife'];
}
export const knifeSlot = () => P.weapons.length - 1;
// Replace the whole kit mid-life (Gun Game tiers, Zombies purchases); draws `select` or the first weapon
export function giveWeapons(list, select) {
  for (const id of list) if (!WEAPONS[id].melee && !P.ammo[id]) P.ammo[id] = { mag: WEAPONS[id].mag, res: WEAPONS[id].reserve };
  P.weapons = list.slice();
  P.slot = Math.max(0, select ? P.weapons.indexOf(select) : 0); P.lastSlot = Math.min(1, P.weapons.length - 1);
  P.reloadStart = -1; P.meleeStart = -1; P.bloom = 0; P.switchStart = G.now; P.switchDur = WEAPONS[P.weapons[P.slot]].draw;
  play('switch'); hud.setWeapon(P);
}
// Which slot a picked-up gun goes into: Classic swaps the same type, Two-Gun/Overkill swap the gun in hand.
export function pickupSlot(id) {
  const have = P.weapons.indexOf(id);
  if (have >= 0) return have;
  if ((G.match && G.match.slots) === 'classic') return WEAPONS[id].slot === 1 ? 1 : 0;
  return WEAPONS[cur()].melee ? 0 : P.slot;
}
function switchTo(slot) {
  if (slot < 0 || slot >= P.weapons.length) return;
  if (slot === P.slot || !P.alive || P.cookStart >= 0 || P.throwStart >= 0) return;
  P.lastSlot = P.slot; P.slot = slot;
  P.reloadStart = -1; P.meleeStart = -1; P.meleeHitAt = -1; P.pumpStart = -1; P.boltStart = -1; P.bloom = 0;
  const w = W();
  // drawing is quicker when the gun you holster is light; pistols/knife are fastest
  P.switchStart = G.now; P.switchDur = w.draw;
  play('switch');
  hud.setWeapon(P);
}
export function selectSlot(slot) { switchTo(slot); }
// Swap in a weapon picked up off the ground (keeps its remaining ammo)
export function takeWeapon(id, ammo) {
  const w = WEAPONS[id], slot = pickupSlot(id);
  P.weapons[slot] = id; P.ammo[id] = { mag: ammo.mag, res: ammo.res };
  if (G.match.loadout) G.match.loadout.guns[slot] = id;
  P.lastSlot = P.slot; P.slot = slot; P.reloadStart = -1; P.meleeStart = -1; P.bloom = 0;
  P.switchStart = G.now; P.switchDur = w.draw;
  hud.setWeapon(P); hud.notice(`Picked up ${w.name}`);
}
// Sandbox weapon menu: put any weapon in its slot and draw it
export function equipWeapon(id) {
  const w = WEAPONS[id], slot = pickupSlot(id);
  P.weapons[slot] = id; P.ammo[id] = { mag: w.mag, res: w.reserve };
  if (G.match.loadout) G.match.loadout.guns[slot] = id;
  P.lastSlot = P.slot; P.slot = slot; P.reloadStart = -1; P.meleeStart = -1; P.bloom = 0;
  P.switchStart = G.now; P.switchDur = w.draw;
  play('switch'); hud.setWeapon(P);
}
export function swapLast() { switchTo(P.lastSlot); }
// mouse wheel / Z while scoped flips the magnification (returns true if it did)
export function scopeZoom(dir) {
  if (!P || !P.alive) return false;
  const w = W();
  if (!w.mags || w.mags.length < 2 || P.adsT < 0.9) return false;
  const n = w.mags.length, i = P.zoomIdx || 0;
  P.zoomIdx = dir === 0 ? (i + 1) % n : clamp(i + (dir < 0 ? 1 : -1), 0, n - 1);
  if (P.zoomIdx !== i) play('zoomClick', null, { gain: 0.5 });
  return true;
}
export const scopeMag = () => { const w = P && W(); return w && w.mags ? w.mags[Math.min(P.zoomIdx || 0, w.mags.length - 1)] : 0; };
export function cycleWeapon(dir) { const n = P.weapons.length; switchTo((P.slot + (dir > 0 ? 1 : n - 1)) % n); }

export function startReload() {
  const id = cur(), w = WEAPONS[id], a = P.ammo[id];
  if (w.melee || reloading() || !a || a.mag >= w.mag || a.res <= 0 || !raised() || P.meleeStart >= 0) return;
  P.reloadStart = G.now; P.reloadSfx = 0;
  if (w.shells) { P.reloadKind = 'shell'; P.shellNext = G.now + w.reloadStart + w.shellReload; }
  else { P.reloadKind = 'mag'; P.reloadEnd = G.now + (a.mag === 0 ? w.reloadEmpty : w.reload); }
  P.adsT = Math.min(P.adsT, 0.5);
}

function updateReload() {
  if (!reloading()) {
    if (P.autoReloadAt > 0 && G.now >= P.autoReloadAt) { P.autoReloadAt = -1; startReload(); }
    return;
  }
  const id = cur(), w = WEAPONS[id], a = P.ammo[id];
  if (P.reloadKind === 'shell') {
    while (G.now >= P.shellNext && a.mag < w.mag && a.res > 0) { a.mag++; a.res--; play('shell'); P.shellNext += w.shellReload; }
    if (a.mag >= w.mag || a.res <= 0) { P.reloadStart = -1; P.pumpStart = G.now; play('magIn', null, { gain: 0.6 }); }
    return;
  }
  const p = (G.now - P.reloadStart) / (P.reloadEnd - P.reloadStart);
  if (P.reloadSfx === 0 && p > 0.12) { play('magOut'); P.reloadSfx = 1; }
  if (P.reloadSfx === 1 && p > 0.6) { play('magIn'); P.reloadSfx = 2; }
  if (P.reloadSfx === 2 && p > 0.85 && P.reloadEnd - P.reloadStart > w.reload + 0.01) { play('bolt'); P.reloadSfx = 3; }
  if (p >= 1) {
    const n = Math.min(w.mag - a.mag, a.res); a.mag += n; a.res -= n; P.reloadStart = -1;
  }
}

function aimDir(out) {
  const yaw = P.yaw + P.recoilY, pitch = P.pitch + P.recoilP;
  out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  return out;
}


const cam = () => G.camera.position;
function muzzleWorld() {
  const c = cam(), ads = P.adsT;
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  aimDir(_d);
  return [c.x + _d.x * 0.55 + rx * 0.13 * (1 - ads), c.y + _d.y * 0.55 - 0.09 * (1 - ads), c.z + _d.z * 0.55 + rz * 0.13 * (1 - ads)];
}

function fireOnce() {
  const id = cur(), w = WEAPONS[id], a = P.ammo[id];
  if (a.mag <= 0) {
    if (G.now > P.dryAt) { play('dry'); P.dryAt = G.now + 0.35; }
    if (a.res > 0) startReload(); else hud.notice('Out of ammo. Switch weapons or find an ammo crate.');
    return false;
  }
  const inf = G.match.rules && G.match.rules.infAmmo;
  if (!inf) a.mag--;
  G.match.stats.shots++;
  P.lastShotAt = G.now; P.protectUntil = 0;
  const moving = Math.min(1, P.moveSpeed / 6);
  const adsF = w.scope ? (P.adsT > 0.95 ? 1 : 0) : P.adsT;
  let spread = lerp(w.spread.hip, w.spread.ads, adsF) + moving * w.spread.move * (1 - adsF * 0.5) + (P.grounded ? 0 : w.spread.air) + P.bloom;
  if (P.crouch) spread *= 0.75;
  aimDir(_d);
  const o = cam(), [mx, my, mz] = muzzleWorld();
  let anyHit = false, hitHead = false;
  const dir = { x: 0, y: 0, z: 0 };
  if (w.projectile) {
    coneDir(_d.x, _d.y, _d.z, spread, dir);
    fireRocket(P, o.x + dir.x * 0.8, o.y + dir.y * 0.8 - 0.05, o.z + dir.z * 0.8, dir.x, dir.y, dir.z);
  }
  for (let k = 0; k < (w.projectile ? 0 : w.pellets); k++) {
    coneDir(_d.x, _d.y, _d.z, spread, dir);
    if (w.velocity) { fireBullet(P, id, o.x, o.y, o.z, dir.x, dir.y, dir.z, 1, [mx, my, mz], 0xffe0a0); continue; }
    const s = newShot(P, id, o.x, o.y, o.z, 1, k);
    traceSegment(s, dir.x, dir.y, dir.z, w.range);
    if (s.hit) { anyHit = true; hitHead = hitHead || s.hit.head; }
    if (Math.random() < w.tracer) tracer(mx, my, mz, s.x, s.y, s.z, 0xffe0a0, 420);
  }
  if (anyHit) G.match.stats.hits++;
  if (hitHead) G.match.stats.headHits++;
  // recoil: part permanent (you pull it down), part recovering
  const r = w.recoil, rm = (P.adsT > 0.5 ? 0.75 : 1) * (P.crouch ? 0.85 : 1);
  P.pitch = clamp(P.pitch + r.v * 0.35 * rm, -1.5, 1.5);
  P.recoilP += r.v * 0.65 * rm;
  P.recoilY += (Math.random() * 2 - 1) * r.h * rm + r.drift;
  P.bloom = Math.min(w.spread.bloomMax, P.bloom + w.spread.bloom);
  vmFire(id);
  const big = w.pellets > 1 || w.scope || w.heavy;
  G.muzzleLight.position.set(mx, my, mz); G.muzzleLight.intensity = big ? 3 : 2;
  if (Math.random() < 0.3) muzzleSmoke(mx, my, mz);
  G.shake = Math.min(0.03, (G.shake || 0) + (big ? 0.012 : 0.0025));
  play(w.sound, null, { important: true, send: 0.25 });
  if (!w.projectile && !w.pump && Math.random() < 0.5) play('casing', null, { delay: 0.35 + Math.random() * 0.2, gain: 0.8 });
  noise(P.x, P.y + 1.5, P.z, w.noise, P);
  if (w.pump) P.pumpStart = G.now + 0.14;
  if (w.bolt) { P.boltStart = G.now + 0.3; P.adsBlockUntil = G.now + 1.05; }
  if (a.mag === 0 && a.res > 0) P.autoReloadAt = G.now + (w.bolt ? 0.9 : 0.3);
  hud.setAmmo(P);
  return true;
}

function meleeStart(heavy) {
  const w = WEAPONS.knife;
  if (G.now < P.nextFire || !raised()) return;
  P.meleeStart = G.now; P.meleeHeavy = heavy; P.meleeHitAt = G.now + (heavy ? 0.22 : 0.1);
  P.nextFire = G.now + (heavy ? w.heavyRate : w.rate);
  P.lastShotAt = G.now; P.protectUntil = 0;
  play('knife');
}

function meleeResolve() {
  const w = WEAPONS.knife, heavy = P.meleeHeavy, range = w.range + (heavy ? 0.3 : 0);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let best = null, bd = Infinity;
  for (const u of G.units) {
    if (!u.alive || !isEnemy(P, u)) continue;
    const dx = u.x - P.x, dz = u.z - P.z, d = Math.hypot(dx, dz);
    if (d > range + u.r || Math.abs(u.y - P.y) > 1.4) continue;
    if ((dx * fx + dz * fz) / (d || 1) < 0.5) continue;
    if (d < bd) { bd = d; best = u; }
  }
  if (best) {
    const dx = best.x - P.x, dz = best.z - P.z, d = Math.hypot(dx, dz) || 1;
    const vfx = -Math.sin(best.yaw), vfz = -Math.cos(best.yaw);
    const behind = (vfx * dx + vfz * dz) / d > 0.45; // victim faces away from us
    const dmg = behind ? w.backstab : heavy ? w.heavyDamage : w.damage;
    damage(best, dmg, P, { weapon: 'knife', melee: true, sx: P.x, sz: P.z, backstab: behind, dist: d });
    blood(best.x, best.y + 1.2, best.z, dx / d, dz / d, false);
    play('knifeHit');
    G.match.stats.shots++; G.match.stats.hits++;
    if (behind) hud.notice('Backstab');
    return;
  }
  aimDir(_d);
  const o = cam(), wh = rayWorld(o.x, o.y, o.z, _d.x, _d.y, _d.z, 1.8);
  if (wh) { impact(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, wh.mat); play('impactMetal', { x: wh.x, y: wh.y, z: wh.z }, { gain: 0.5 }); }
}

// ---- input events routed from main ----
export function onMouseDown(btn) {
  if (!P || !P.alive || G.state !== 'playing') return;
  if (btn === 0) { const w = W(); if (w.melee) meleeStart(false); }
  if (btn === 2 && W().melee) meleeStart(true);
}
export function onJumpPressed() { if (P) P.jumpRequest = G.now; }
export function grenadePress() {
  if (!P.alive || G.state !== 'playing') return;
  if (P.grenades <= 0 || P.cookStart >= 0 || P.throwStart >= 0) { play('deny'); hud.notice(P.grenades <= 0 ? 'No grenades left' : ''); return; }
  P.cookStart = G.now; P.reloadStart = -1; P.adsT = 0;
  play('pin');
}
export function grenadeRelease() {
  if (!P || P.cookStart < 0 || !P.alive) return;
  const held = G.now - P.cookStart;
  P.cookStart = -1; if (!(G.match.rules && G.match.rules.infAmmo)) P.grenades--; P.throwStart = G.now;
  aimDir(_d);
  const o = cam(), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  throwGrenade(P, o.x + _d.x * 0.4 - rx * 0.15, o.y + _d.y * 0.4 - 0.05, o.z + _d.z * 0.4 - rz * 0.15,
    _d.x * GRENADE.throwSpeed + P.vx * 0.6, _d.y * GRENADE.throwSpeed + 3.2, _d.z * GRENADE.throwSpeed + P.vz * 0.6, Math.max(0.05, GRENADE.fuse - held));
  play('throw');
  hud.setAmmo(P);
}

export function pickupAmmo() {
  for (const id of P.weapons) { const w = WEAPONS[id]; if (!w.melee) P.ammo[id].res = Math.max(P.ammo[id].res, w.reserve); }
  P.grenades = Math.min(3, P.grenades + 1);
  hud.setAmmo(P);
}

// ---- per-frame update ----
export function updatePlayer(dt) {
  const s = G.profile.settings;
  const [mdx, mdy] = consumeMouse();
  P.mdx = mdx; P.mdy = mdy;
  if (!P.alive) { if (!updateDeathCam(dt, P, mdx, mdy)) updateViewmodel(dt, { visible: false }); return; }
  const frozen = G.state === 'deploy';
  const w = W(), id = cur();
  // look
  const fovNow = G.camera.fov, adsScale = P.adsT > 0.5 ? s.adsSens * (fovNow / s.fov) : 1;
  const k = 0.0022 * s.sens * adsScale;
  P.yaw -= mdx * k; P.pitch -= mdy * k * (s.invertY ? -1 : 1);
  const kl = 2.4 * dt;
  if (input.keys.ArrowLeft) P.yaw += kl; if (input.keys.ArrowRight) P.yaw -= kl;
  if (input.keys.ArrowUp) P.pitch += kl * 0.7; if (input.keys.ArrowDown) P.pitch -= kl * 0.7;
  P.pitch = clamp(P.pitch, -1.5, 1.5);

  // movement
  const f = frozen ? 0 : (down('forward') ? 1 : 0) - (down('back') ? 1 : 0);
  const st = frozen ? 0 : (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  const wantCrouch = !frozen && (down('crouch') || down('crouchAlt'));
  if (wantCrouch) P.crouch = true; else if (P.crouch && canStand(P)) P.crouch = false;
  P.h = P.crouch ? PHYS.crouchH : PHYS.standH;
  P.crouchT = damp(P.crouchT, P.crouch ? 1 : 0, 12, dt);
  const firingRecently = G.now - P.lastShotAt < 0.25;
  P.sprinting = !frozen && down('sprint') && f > 0 && !P.crouch && P.adsT < 0.35 && P.cookStart < 0 && !firingRecently && G.now > P.noSprintUntil && P.meleeStart < 0;
  P.sprintT = damp(P.sprintT, P.sprinting ? 1 : 0, 10, dt);
  let speed = PHYS.walk * (w.speed || 1) * (P.speedMul || 1);
  if (P.sprinting) speed *= PHYS.sprintMul; else if (P.crouch) speed *= PHYS.crouchMul; else if (P.adsT > 0.5) speed *= PHYS.adsMul;
  if (inWater(P)) speed *= 0.62;
  // ladders: walk into one and hold forward to climb, back to descend, jump to let go
  let ladder = null;
  for (const L of G.world.ladders) {
    const dx = P.x - L.x, dz = P.z - L.z, along = dx * L.nx + dz * L.nz, lat = Math.abs(dx * -L.nz + dz * L.nx);
    if (along > -0.1 && along < 0.8 && lat < 0.5 && P.y > L.minY - 0.15 && P.y < L.maxY - 0.02) { ladder = L; break; }
  }
  if (ladder && !frozen) {
    P.airPeak = P.y;
    const facing = -Math.sin(P.yaw) * -ladder.nx + -Math.cos(P.yaw) * -ladder.nz;
    const up = f > 0 && facing > 0.2, dn = f < 0 || (f > 0 && facing < -0.2);
    if (up || dn || !P.grounded) {
      if (G.now - P.jumpRequest < 0.15) { P.vy = 3; P.x += ladder.nx * 0.5; P.z += ladder.nz * 0.5; P.jumpRequest = -10; }
      else {
        P.vx = 0; P.vz = 0; P.vy = 0; P.grounded = false; P.onLadder = true;
        P.y += (up ? 3.4 : dn ? -3.4 : 0) * dt;
        P.x += (ladder.x + ladder.nx * 0.55 - P.x) * Math.min(1, dt * 8); P.z += (ladder.z + ladder.nz * 0.55 - P.z) * Math.min(1, dt * 8);
        if (P.y >= ladder.maxY - 0.03) { P.y = ladder.maxY; P.x -= ladder.nx * 1.05; P.z -= ladder.nz * 1.05; P.grounded = true; P.onLadder = false; }
        else if (P.y <= ladder.minY) { P.y = ladder.minY; P.grounded = true; P.onLadder = false; }
        P.stepDist += dt * 3; if (P.stepDist > 1.1) { P.stepDist = 0; play('stepMetal', null, { gain: 0.6 }); }
        P.moveSpeed = 0;
        G.camera.position.set(P.x, P.y + P.eye, P.z);
        G.camera.rotation.set(P.pitch, P.yaw, 0);
        setListener(P.x, P.y + P.eye, P.z, P.yaw);
        updateViewmodel(dt, { weapon: id, visible: true, adsT: 0, sprintT: 1, bob: P.bob, bobAmp: 0, mdx, mdy, reload: -1, switchT: 1, melee: -1, throwT: -1, cooking: false, crouchT: 0, pump: -1, bolt: -1, loaded: true });
        return;
      }
    }
  }
  P.onLadder = false;
  const len = Math.hypot(f, st) || 1;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const tvx = (fx * f + rx * st) / len * speed, tvz = (fz * f + rz * st) / len * speed;
  const acc = P.grounded ? 13 : 2.2;
  P.vx = damp(P.vx, (f || st) ? tvx : 0, acc, dt); P.vz = damp(P.vz, (f || st) ? tvz : 0, acc, dt);
  const ox = P.x, oz = P.z;
  moveBody(P, P.vx * dt, P.vz * dt);
  if (P.grounded && G.now - P.jumpRequest < 0.15 && !frozen) {
    P.vy = PHYS.jump; P.grounded = false; P.jumpRequest = -10;
    play('step', null, { gain: 0.5 });
  }
  const impactV = updateVertical(P, dt);
  if (P.fallH) applyFall(P);
  if (impactV > 4.5) {
    vmLand(Math.min(1, impactV / 11)); play('land', null, { gain: Math.min(1, impactV / 10) }); play(stepSound(surfaceAt(P.x, P.z, P.y)), null, { gain: 0.8 });
    G.shake = Math.min(0.04, (G.shake || 0) + impactV * 0.0015);
  }
  P.moveSpeed = Math.hypot(P.x - ox, P.z - oz) / Math.max(dt, 1e-4);
  // footsteps
  if (P.grounded && P.moveSpeed > 1.6) {
    P.stepDist += P.moveSpeed * dt;
    const stride = P.sprinting ? 2.7 : P.crouch ? 1.6 : 2.15;
    if (P.stepDist > stride) {
      P.stepDist = 0;
      if (!P.crouch) {
        play(inWater(P) ? 'stepWater' : stepSound(surfaceAt(P.x, P.z, P.y)), null, { gain: P.sprinting ? 0.85 : 0.6 });
        if (P.sprinting && Math.random() < 0.35) play('cloth', null, { gain: 0.8 });
        noise(P.x, P.y, P.z, P.sprinting ? 16 : 8, P);
      }
    }
  }
  if (P.grounded) P.bob += dt * P.moveSpeed * 1.15;

  // weapon state
  P.bloom = damp(P.bloom, 0, G.now - P.lastShotAt > 0.12 ? 7 : 1.5, dt);
  if (G.now - P.lastShotAt > Math.max(0.12, (w.rate || 0.1) * 1.6)) {
    P.recoilP = damp(P.recoilP, 0, w.recoil ? w.recoil.recover : 8, dt);
    P.recoilY = damp(P.recoilY, 0, w.recoil ? w.recoil.recover : 8, dt);
  }
  const canAds = !frozen && input.aim && !w.melee && !P.sprinting && raised() && !reloading() && P.cookStart < 0 && P.throwStart < 0 && G.now > P.adsBlockUntil;
  P.adsT = clamp(P.adsT + (canAds ? 1 : -1) * dt / (w.adsTime || 0.15), 0, 1);
  updateReload();
  if (P.cookStart >= 0 && G.now - P.cookStart >= GRENADE.fuse) {
    P.cookStart = -1; P.grenades--;
    explode(P.x, P.y + 1.2, P.z, P, 'frag');
  }
  if (P.throwStart >= 0 && G.now - P.throwStart > 0.45) P.throwStart = -1;
  if (P.meleeHitAt > 0 && G.now >= P.meleeHitAt) { P.meleeHitAt = -1; meleeResolve(); }
  if (P.meleeStart >= 0 && G.now - P.meleeStart > (P.meleeHeavy ? 0.6 : 0.38)) P.meleeStart = -1;

  if (!frozen && G.state === 'playing' && !w.melee && P.cookStart < 0 && P.throwStart < 0) {
    if (input.fire) {
      if (raised() && !(reloading() && !(P.reloadKind === 'shell' && P.ammo[id].mag > 0))) {
        if (reloading()) P.reloadStart = -1; // shotgun: fire interrupts shell loading
        if (P.sprinting) P.noSprintUntil = G.now + 0.2;
        if (w.auto) {
          if (P.nextFire < G.now - w.rate) P.nextFire = G.now;
          let n = 0;
          while (P.nextFire <= G.now && n++ < 3) { if (!fireOnce()) { P.nextFire = G.now + 0.2; break; } P.nextFire += w.rate; }
        } else if (P.semiReady && G.now >= P.nextFire) {
          P.semiReady = false;
          if (fireOnce()) P.nextFire = G.now + w.rate;
        }
      }
    } else P.semiReady = true;
  }
  if (P.pumpStart >= 0 && G.now - P.pumpStart > 0.45) { P.pumpStart = -1; const md = vmModel('m870'); if (md && cur() === 'm870') ejectShell(md); }
  if (P.boltStart >= 0 && G.now - P.boltStart > 0.55) { P.boltStart = -1; const md = vmModel('l96'); if (md && cur() === 'l96') ejectShell(md); }

  // camera
  P.eye = damp(P.eye, P.crouch ? PHYS.eyeCrouch : PHYS.eyeStand, 12, dt);
  const amp = Math.min(1.3, P.moveSpeed / 6) * (1 - P.adsT * 0.8) * (P.grounded ? 1 : 0);
  G.shake = damp(G.shake || 0, 0, 6, dt);
  const sh = G.shake;
  G.camera.position.set(P.x + Math.cos(P.bob) * 0.02 * amp * rx, P.y + P.eye + Math.sin(P.bob * 2) * 0.032 * amp, P.z + Math.cos(P.bob) * 0.02 * amp * rz);
  G.camera.rotation.set(P.pitch + P.recoilP + rand(-sh, sh), P.yaw + P.recoilY + rand(-sh, sh), -st * 0.012 + rand(-sh, sh) * 0.5);
  // scopes: magnification levels (4x/8x for the bolt rifles, fixed 2x on the marksman rifle)
  if (w.mags) { P.zoomIdx = Math.min(P.zoomIdx || 0, w.mags.length - 1); P.zoomCur = damp(P.zoomCur || magZoom(s.fov, w.mags[0]), magZoom(s.fov, w.mags[P.zoomIdx]), 14, dt); }
  const zoom = lerp(1, w.mags ? P.zoomCur : (w.adsZoom || 1), P.adsT * P.adsT);
  const targetFov = s.fov * zoom * (1 + P.sprintT * 0.05);
  G.camera.fov = damp(G.camera.fov, targetFov, 18, dt);
  G.camera.updateProjectionMatrix();
  setListener(P.x, P.y + P.eye, P.z, P.yaw);

  // low health heartbeat
  if (P.health < 35 && G.now > P.lowHpBeat) { P.lowHpBeat = G.now + 0.95; play('heartbeat', null, { gain: 0.7 }); }

  const reloadP = reloading() ? (P.reloadKind === 'shell' ? 0.25 : (G.now - P.reloadStart) / (P.reloadEnd - P.reloadStart)) : -1;
  updateViewmodel(dt, {
    weapon: id, visible: !(w.scope && P.adsT > 0.9), loaded: !P.ammo[id] || P.ammo[id].mag > 0, adsT: P.adsT, sprintT: P.sprintT, bob: P.bob, bobAmp: amp, mdx, mdy,
    reload: reloadP, switchT: clamp((G.now - P.switchStart) / P.switchDur, 0, 1),
    melee: P.meleeStart >= 0 ? clamp((G.now - P.meleeStart) / (P.meleeHeavy ? 0.6 : 0.38), 0, 1) : -1, meleeHeavy: P.meleeHeavy,
    throwT: P.throwStart >= 0 ? (G.now - P.throwStart) / 0.45 : -1, cooking: P.cookStart >= 0, crouchT: P.crouchT,
    pump: P.pumpStart >= 0 && G.now >= P.pumpStart ? (G.now - P.pumpStart) / 0.45 : -1,
    bolt: P.boltStart >= 0 && G.now >= P.boltStart ? (G.now - P.boltStart) / 0.55 : -1,
  });
  hud.updatePlayerHud(P, { spread: lerp(w.spread ? w.spread.hip : 0.02, w.spread ? w.spread.ads : 0, P.adsT) + Math.min(1, P.moveSpeed / 6) * (w.spread ? w.spread.move : 0) + P.bloom + (P.grounded ? 0 : 0.03), reloadP, cook: P.cookStart >= 0 ? GRENADE.fuse - (G.now - P.cookStart) : -1 });
}

export function onPlayerDeath() {
  P.deathT = 0; P.cookStart = -1; P.reloadStart = -1; P.adsT = 0;
}

export function killPlayerSelf() { if (P.alive) kill(P, null, { weapon: 'fall' }); }
export const getPlayer = () => P;
