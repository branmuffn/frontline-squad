// Vehicles (Phase 6). 6a: a jeep with a driver seat and a mounted gun.
// The jeep is a dynamic oriented box in G.world.dynamic: it blocks units (physics.blocked) and bullets (physics.rayWorld).
// Bullets that hit its lower body damage it; occupants sit higher up and stay hittable. Explosions damage it.
// At 0 health it blows up with everyone inside and respawns at its home spot after a while.
import * as THREE from 'three';
import { G } from '../core/state.js';
import { WEAPONS } from '../core/config.js';
import { clamp, damp, lerp, rand, coneDir } from '../core/util.js';
import { input, down } from '../core/input.js';
import { blocked, supportHeight, rayWorld, losClear } from '../world/physics.js';
import { Builder, rbox, cyl, sphere, makeSoldier, poseSoldier, setSoldierGun } from './soldier.js';
import { damage, kill, isEnemy } from './units.js';
import { newShot, traceSegment } from './ballistics.js';
import { tracer, explosion } from '../engine/fx.js';
import { play, audioCtx, masterNode } from '../engine/audio.js';
import { keyName } from '../ui/hud.js';
import * as hud from '../ui/hud.js';

export const VEHICLE_MODES = ['ffa', 'tdm', 'sandbox', 'ctf'];
const JEEP = { hw: 1.02, hd: 2.15, y0: 0.32, y1: 1.28, hp: 560, crew: 0.85, maxF: 17, maxR: 6, accel: 9, brake: 24, wheelbase: 2.5, steerMax: 0.55, respawn: 20 };
// seat offsets in jeep space (x right, z backwards): driver front-left, gunner standing at the back on the gun ring
const SEATS = [{ x: -0.45, y: 0.45, z: -0.15, crouch: 0.75 }, { x: 0, y: 0.72, z: 1.05, crouch: 0 }];
const GUN_PIVOT = { x: 0, y: 1.95, z: 0.55 };
// helicopter: pilot (flies, nose gun at the crosshair) + door gunner on the right side
const HELI = { hw: 1.12, hd: 2.6, y0: 0.3, y1: 2.35, hp: 680, crew: 0.6, respawn: 30, maxH: 27, accel: 15, climb: 7, yawRate: 1.7, ceiling: 46,
  seats: [{ x: 0, y: 0.72, z: -1.05, crouch: 0.6 }, { x: 0.62, y: 0.55, z: 0.15, crouch: 0.45 }], gunPivot: { x: 1.2, y: 1.45, z: 0.15 }, gunArc: [-Math.PI / 2 - 1.25, -Math.PI / 2 + 1.25],
  name: 'Helicopter', who: ['Fly the helicopter', 'Man the door gun', 'Helicopter full'],
  keys: [['W A S D', 'Fly'], ['Space / C', 'Up / down'], ['Mouse', 'Turn and aim']] };
Object.assign(JEEP, { seats: SEATS, gunPivot: GUN_PIVOT, name: 'Jeep', who: ['Drive the jeep', 'Man the jeep gun', 'Jeep full'], keys: [['Space', 'Handbrake']] });
const SPEC = { jeep: JEEP, heli: HELI };
export const vehicles = [];

// ---------- model ----------
let jeepGeo = null, wheelGeo = null, mgGeo = null, vMat = null;
function buildModels() {
  const OD = 0x56603f, ODd = 0x434b31, K = 0x1d2022, T = 0x2a2b2b, SEAT = 0x3b3328;
  let b = new Builder();
  b.add(0, rbox(2.0, 0.42, 4.1, 0.08, 2), OD, [0, 0.72, 0]);              // tub
  b.add(0, rbox(1.84, 0.34, 1.35, 0.1, 2), OD, [0, 1.02, -1.35]);          // hood
  b.add(0, rbox(1.9, 0.12, 0.28, 0.04, 1), K, [0, 0.62, -2.08]);           // bumper
  for (const sx of [-1, 1]) {
    b.add(0, rbox(0.42, 0.12, 1.05, 0.05, 2), ODd, [sx * 0.86, 1.02, -1.45]); // front fenders
    b.add(0, rbox(0.42, 0.12, 1.0, 0.05, 2), ODd, [sx * 0.86, 1.02, 1.45]);   // rear fenders
    b.add(0, sphere(0.09, 8, 6), 0xf3e6b0, [sx * 0.62, 1.04, -2.03], [0, 0, 0], [1, 1, 0.5], { ao: 0 }); // headlights
  }
  b.add(0, rbox(1.6, 0.06, 0.06, 0.02, 1), K, [0, 1.65, -0.7]);            // windscreen frame top
  for (const sx of [-1, 1]) b.add(0, cyl(0.03, 0.03, 0.5, 6), K, [sx * 0.78, 1.42, -0.7]);
  b.add(0, rbox(1.5, 0.4, 0.02, 0.005, 1), 0x8fa4ad, [0, 1.42, -0.7], [0, 0, 0], [1, 1, 1], { ao: 0 }); // glass
  for (const sx of [-1, 1]) { // seats
    b.add(0, rbox(0.55, 0.12, 0.55, 0.04, 1), SEAT, [sx * 0.45, 0.98, 0.0]);
    b.add(0, rbox(0.55, 0.55, 0.1, 0.04, 1), SEAT, [sx * 0.45, 1.25, 0.28]);
  }
  b.add(0, rbox(0.38, 0.5, 0.06, 0.03, 1), K, [-0.45, 1.3, -0.45], [-0.5, 0, 0]); // steering column
  b.add(0, new THREE.TorusGeometry(0.17, 0.02, 4, 12), K, [-0.45, 1.5, -0.55], [-0.9, 0, 0]); // wheel
  // roll bar + gun ring post
  for (const sx of [-1, 1]) b.add(0, cyl(0.04, 0.04, 1.05, 6), K, [sx * 0.85, 1.48, 0.55]);
  b.add(0, cyl(0.04, 0.04, 1.74, 6), K, [0, 2.0, 0.55], [0, 0, Math.PI / 2]);
  b.add(0, cyl(0.07, 0.09, 0.9, 8), K, [0, 1.45, 0.55]);
  b.add(0, cyl(0.22, 0.22, 0.12, 12), K, [0, 1.62, 1.6], [Math.PI / 2, 0, 0]); // spare tyre
  b.add(0, rbox(0.5, 0.3, 0.45, 0.04, 1), ODd, [0.55, 1.08, 1.5]);           // ammo box / jerry can
  jeepGeo = b.geometry(); jeepGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  b = new Builder();
  b.add(0, cyl(0.42, 0.42, 0.32, 14), T, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1], { ao: 0 });
  b.add(0, cyl(0.22, 0.22, 0.34, 8), 0x6b7059, [0, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1], { ao: 0 });
  for (let i = 0; i < 6; i++) b.add(0, rbox(0.34, 0.06, 0.1, 0.01, 1), 0x1a1a1a, [0, Math.cos(i * 1.047) * 0.42, Math.sin(i * 1.047) * 0.42], [i * 1.047, 0, 0]); // tread lugs
  wheelGeo = b.geometry(); wheelGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.6);
  b = new Builder(); // M2 on a cradle, pivot at origin, barrel along -Z
  b.add(0, rbox(0.16, 0.18, 0.62, 0.03, 1), K, [0, 0, -0.05]);
  b.add(0, cyl(0.025, 0.025, 0.9, 8), K, [0, 0.02, -0.8], [Math.PI / 2, 0, 0]);
  b.add(0, cyl(0.045, 0.045, 0.38, 10), K, [0, 0.02, -0.5], [Math.PI / 2, 0, 0]);
  b.add(0, cyl(0.035, 0.03, 0.08, 8), K, [0, 0.02, -1.28], [Math.PI / 2, 0, 0]);
  b.add(0, rbox(0.22, 0.2, 0.16, 0.03, 1), ODd, [0.17, -0.02, -0.05]); // ammo can
  for (const sx of [-1, 1]) b.add(0, cyl(0.02, 0.02, 0.18, 6), K, [sx * 0.08, -0.02, 0.32], [Math.PI / 2, 0, 0]); // spade grips
  b.add(0, rbox(0.5, 0.26, 0.03, 0.01, 1), ODd, [0, 0.04, -0.3]); // shield
  mgGeo = b.geometry(); mgGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -0.5), 1.2);
  vMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.2 });
}

function makeJeepMesh() {
  if (!jeepGeo) buildModels();
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const hull = new THREE.Mesh(jeepGeo, vMat); hull.castShadow = true; hull.receiveShadow = true; body.add(hull);
  const wheels = [];
  for (const [x, z] of [[-0.86, -1.42], [0.86, -1.42], [-0.86, 1.42], [0.86, 1.42]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z); root.add(pivot);
    const w = new THREE.Mesh(wheelGeo, vMat); w.castShadow = true; pivot.add(w); wheels.push({ pivot, w, front: z < 0 });
  }
  const turret = new THREE.Group(); turret.position.set(GUN_PIVOT.x, GUN_PIVOT.y - 0.2, GUN_PIVOT.z); body.add(turret);
  const gun = new THREE.Group(); gun.position.y = 0.2; turret.add(gun);
  const mg = new THREE.Mesh(mgGeo, vMat); mg.castShadow = true; gun.add(mg);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.position.y = 0.02; root.add(blob);
  G.scene.add(root);
  return { root, body, wheels, turret, gun, hull };
}

// ---------- lifecycle ----------
export function vehiclesEnabled() {
  const L = G.profile.lobby, m = G.match;
  return !!(L.vehicles && m && VEHICLE_MODES.includes(m.mode) && G.world && G.world.def.vehicles);
}

export function resetVehicles() {
  for (const v of vehicles) { G.scene.remove(v.m.root); stopEngine(v); }
  vehicles.length = 0; hidePlayerBody();
  if (G.world) G.world.dynamic = (G.world.dynamic || []).filter((d) => !d.vehicle);
  if (!vehiclesEnabled()) return;
  for (const h of G.world.def.vehicles) spawnVehicle(h);
}

function spawnVehicle(home) {
  const type = home.type || 'jeep', spec = SPEC[type];
  const v = { type, spec, home, x: home.x, y: home.y || 0, z: home.z, yaw: home.yaw || 0, speed: 0, steer: 0, vx: 0, vz: 0, vy: 0, hp: spec.hp, alive: true,
    seats: [null, null], pitch: 0, roll: 0, heat: 0, overheated: false, fireAt: 0, wheelSpin: 0, rotor: 0, deadAt: 0, lastHitBy: null, m: type === 'heli' ? makeHeliMesh() : makeJeepMesh(), engine: null, gunYaw: type === 'heli' ? -Math.PI / 2 : 0, gunPitch: 0 };
  v.y = supportHeight(v.x, v.z, type === 'heli' ? 1 : 0.3, v.y + 1);
  v.dyn = { vehicle: v, x: v.x, z: v.z, yaw: v.yaw, hw: spec.hw, hd: spec.hd, y0: v.y + spec.y0, y1: v.y + spec.y1, mat: 'metal' };
  G.world.dynamic.push(v.dyn);
  vehicles.push(v); syncMesh(v, 0);
  return v;
}

// ---------- seats ----------
const local = (v, x, z) => { const c = Math.cos(v.yaw), s = Math.sin(v.yaw), dx = x - v.x, dz = z - v.z; return [dx * c - dz * s, dx * s + dz * c]; }; // world -> jeep (x right, z back)
const world = (v, lx, lz) => { const c = Math.cos(v.yaw), s = Math.sin(v.yaw); return [v.x + lx * c + lz * s, v.z - lx * s + lz * c]; };

export function nearestVehicle(u, range = 3.4) {
  let best = null, bd = range;
  for (const v of vehicles) {
    if (!v.alive) continue;
    const [lx, lz] = local(v, u.x, u.z), d = Math.hypot(Math.max(0, Math.abs(lx) - v.spec.hw), Math.max(0, Math.abs(lz) - v.spec.hd));
    if (d < bd && Math.abs(u.y - v.y) < 1.8) { bd = d; best = v; }
  }
  return best;
}
export function enterVehicle(u, v, seat) {
  if (seat === undefined) seat = v.seats.findIndex((s) => !s);
  if (seat < 0 || v.seats[seat]) return false;
  v.seats[seat] = u; u.vehicle = v; u.seat = seat; u.vx = u.vz = u.vy = 0; u.prone = false;
  if (u.isPlayer) { u.adsT = 0; play('doorOpen', { x: v.x, y: v.y + 1, z: v.z }, { gain: 0.7 }); }
  placeOccupant(v, u);
  return true;
}
export function exitVehicle(u) {
  const v = u.vehicle; if (!v) return false;
  v.seats[u.seat] = null; u.vehicle = null; u.seat = -1;
  for (const [lx, lz] of [[-2.0, -0.2], [2.0, -0.2], [0, 3.2], [-2.0, 1.2], [2.0, 1.2], [0, -3.3]]) {
    const [x, z] = world(v, lx, lz), y = Math.max(supportHeight(x, z, 0.3, v.y + 1.2), v.type === 'heli' ? v.y : -1e9);
    if (!blocked(x, z, u.r, y, u.h)) { u.x = x; u.z = z; u.y = y; break; }
  }
  u.crouchT = 0; u.vy = 0; u.grounded = supportHeight(u.x, u.z, 0.3, u.y + 0.1) >= u.y - 0.05;
  if (u.isPlayer) { u.yaw = Math.atan2(Math.sin(u.yaw), Math.cos(u.yaw)); play('doorOpen', { x: v.x, y: v.y + 1, z: v.z }, { gain: 0.6 }); }
  return true;
}
export function switchSeat(u, seat) { const v = u.vehicle; if (!v || v.seats[seat] || seat === u.seat) return false; v.seats[u.seat] = null; v.seats[seat] = u; u.seat = seat; placeOccupant(v, u); return true; }

function placeOccupant(v, u) {
  const S = v.spec.seats[u.seat], [x, z] = world(v, S.x, S.z);
  u.x = x; u.z = z; u.y = v.y + S.y; u.crouchT = S.crouch; u.moveSpeed = 0;
  if (!u.isPlayer) u.yaw = u.seat === 1 ? v.yaw + v.gunYaw : v.yaw;
}

// E: get in, or out. Returns true when it handled the key.
export function vehicleInteract(u) {
  if (u.vehicle) return exitVehicle(u);
  const v = nearestVehicle(u);
  return v ? enterVehicle(u, v) : false;
}

// ---------- damage ----------
export function damageVehicle(v, amount, attacker, kind = 'bullet') {
  if (!v.alive || amount <= 0) return;
  // own team's fire doesn't hurt a crewed jeep (same rule as units)
  const crew = v.seats.find((s) => s);
  if (attacker && crew && attacker !== crew && !isEnemy(attacker, crew)) return;
  v.hp -= amount; v.lastHitBy = attacker || v.lastHitBy;
  if (attacker && attacker.isPlayer && kind === 'bullet') hud.hitMarker('hit');
  if (v.seats.includes(G.player)) G.shake = Math.min(0.05, (G.shake || 0) + amount * 0.0004);
  if (v.hp <= 0) destroyVehicle(v, attacker || v.lastHitBy);
}
// called by grenades.explode
export function explodeNearVehicles(x, y, z, R, maxD, owner) {
  for (const v of vehicles) {
    if (!v.alive) continue;
    const [lx, lz] = local(v, x, z), d = Math.hypot(Math.max(0, Math.abs(lx) - v.spec.hw), Math.max(0, Math.abs(lz) - v.spec.hd), Math.max(0, Math.abs(y - (v.y + 0.8)) - 0.6));
    if (d < R) damageVehicle(v, (maxD * Math.pow(1 - d / R, 0.8) + 15) * 2.2, owner, 'explosive');
  }
}
function destroyVehicle(v, attacker) {
  v.alive = false; v.deadAt = G.now; v.speed = 0;
  explosion(v.x, v.y + 1, v.z, 1.6);
  play('explosion', { x: v.x, y: v.y + 1, z: v.z }, { important: true, range: 180, ref: 14 });
  for (const u of v.seats) if (u) { exitVehicle(u); if (u.alive) kill(u, attacker && attacker !== u ? attacker : null, { weapon: 'vehicle', explosive: true }); }
  for (const u of G.units) { // blast around the wreck
    if (!u.alive) continue;
    const d = Math.hypot(u.x - v.x, u.y + 1 - (v.y + 1), u.z - v.z);
    if (d < 6) damage(u, 120 * (1 - d / 6) + 10, attacker, { weapon: 'vehicle', explosive: true, sx: v.x, sz: v.z });
  }
  stopEngine(v);
  v.m.hull.material = wreckMat(); v.m.gun.visible = false;
  v.m.wheels.forEach((w) => { w.w.material = v.m.hull.material; });
  if (G.player && G.player.vehicle === v) exitVehicle(G.player);
}
let wreckM = null;
const wreckMat = () => wreckM || (wreckM = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x2a2624, roughness: 0.95 }));

// ---------- driving ----------
function drive(v, dt, thr, steerIn, handbrake) {
  const J = JEEP;
  // throttle / brake / reverse
  if (thr > 0) v.speed = v.speed < 0 ? Math.min(0, v.speed + J.brake * dt) : Math.min(J.maxF, v.speed + J.accel * dt * (1 - v.speed / (J.maxF * 1.15)));
  else if (thr < 0) v.speed = v.speed > 0 ? Math.max(0, v.speed - J.brake * dt) : Math.max(-J.maxR, v.speed - J.accel * 0.6 * dt);
  else v.speed = damp(v.speed, 0, 0.7, dt);
  if (handbrake) v.speed = damp(v.speed, 0, 3.5, dt);
  v.steer = damp(v.steer, steerIn * J.steerMax * (1 - Math.min(0.55, Math.abs(v.speed) / J.maxF * 0.55)), 7, dt);
  const yawRate = v.speed / J.wheelbase * Math.tan(v.steer) * (handbrake ? 1.35 : 1);
  const step = v.speed * dt, nyaw = v.yaw + yawRate * dt;
  const fx = -Math.sin(nyaw), fz = -Math.cos(nyaw);
  let nx = v.x + fx * step, nz = v.z + fz * step;
  // hull = three circles along the body; climbs up to step height (ramps/stairs via supportHeight)
  const hullFree = (x, z, yaw) => {
    G.ignoreDyn = v.dyn;
    let ok = true;
    for (const o of [-1.35, 0, 1.35]) { const cx = x - Math.sin(yaw) * o, cz = z - Math.cos(yaw) * o; if (blocked(cx, cz, 0.98, v.y + 0.15, 1.1)) { ok = false; break; } }
    G.ignoreDyn = null; return ok;
  };
  if (hullFree(nx, nz, nyaw)) { v.x = nx; v.z = nz; v.yaw = nyaw; }
  else if (hullFree(v.x + fx * step, v.z, nyaw)) { v.x += fx * step; v.yaw = nyaw; v.speed *= 0.92; }
  else if (hullFree(v.x, v.z + fz * step, nyaw)) { v.z += fz * step; v.yaw = nyaw; v.speed *= 0.92; }
  else { if (Math.abs(v.speed) > 6) { play('impactMetal', { x: v.x, y: v.y + 1, z: v.z }, { gain: 1 }); damageVehicle(v, Math.abs(v.speed) * 3, null); } v.speed *= -0.25; }
  // ground: highest support under the four wheel spots (within a step), falling otherwise
  const sup = (lx, lz) => { const [x, z] = world(v, lx, lz); return supportHeight(x, z, 0.3, v.y + 0.55); };
  const hf = Math.max(sup(-0.8, -1.4), sup(0.8, -1.4)), hb = Math.max(sup(-0.8, 1.4), sup(0.8, 1.4));
  const hl = Math.max(sup(-0.8, -1.4), sup(-0.8, 1.4)), hr = Math.max(sup(0.8, -1.4), sup(0.8, 1.4));
  const g = Math.max(hf, hb, (hf + hb) / 2);
  if (g >= v.y - 0.05) { v.y = damp(v.y, g, 18, dt); v.vy = 0; }
  else { v.vy -= 20 * dt; v.y = Math.max(g, v.y + v.vy * dt); if (v.y === g) { if (v.vy < -9) damageVehicle(v, (-v.vy - 9) * 25, null); v.vy = 0; } }
  v.pitch = damp(v.pitch, Math.atan2(hf - hb, 2.8), 8, dt);
  v.roll = damp(v.roll, Math.atan2(hl - hr, 1.7), 8, dt);
}

// arcade helicopter: hovers when crewed, turns toward wantYaw (the pilot's view), W/S/A/D push, lift climbs/descends
function fly(v, dt, fwd, strafe, lift, wantYaw, powered) {
  const S = v.spec;
  v.rotorSpeed = damp(v.rotorSpeed || 0, powered ? 30 : (v.alive && v.y > supportHeight(v.x, v.z, 1, v.y + 0.1) + 0.2 ? 14 : 0), 0.8, dt);
  v.rotor += v.rotorSpeed * dt;
  const g = supportHeight(v.x, v.z, 1.0, v.y + 0.5), airborne = v.y > g + 0.05;
  const lifting = powered && v.rotorSpeed > 18;
  if (wantYaw !== null && (airborne || lift > 0)) { const dy = Math.atan2(Math.sin(wantYaw - v.yaw), Math.cos(wantYaw - v.yaw)); v.yaw += clamp(dy * 3, -S.yawRate, S.yawRate) * dt; }
  const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
  if (lifting && (airborne || lift > 0)) { v.vx += (-sy * fwd + cy * strafe) * S.accel * dt; v.vz += (-cy * fwd - sy * strafe) * S.accel * dt; }
  const drag = Math.exp(-(airborne ? 0.75 : 6) * dt); v.vx *= drag; v.vz *= drag;
  const hs = Math.hypot(v.vx, v.vz); if (hs > S.maxH) { v.vx *= S.maxH / hs; v.vz *= S.maxH / hs; }
  if (!v.alive) v.vy -= 18 * dt;                               // wreck falls
  else if (lifting) v.vy = damp(v.vy, lift * S.climb, 3, dt);   // hover / climb / descend
  else v.vy = damp(v.vy, airborne ? -4.5 : 0, 1.2, dt);        // autorotation
  const nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
  let ny = Math.min(S.ceiling, v.y + v.vy * dt);
  const hullFree = (x, z, y) => { G.ignoreDyn = v.dyn; let ok = true; for (const o of [-1.6, 0, 1.6, 4.2]) { const r = o > 3 ? 0.45 : 1.15; if (blocked(x - sy * o, z - cy * o, r, y + (o > 3 ? 1.1 : 0.15), o > 3 ? 1.2 : 2.1)) { ok = false; break; } } G.ignoreDyn = null; return ok; };
  if (hullFree(nx, nz, Math.max(ny, g))) { v.x = nx; v.z = nz; }
  else { if (hs > 8 && v.alive) { damageVehicle(v, hs * 6, null); play('impactMetal', { x: v.x, y: v.y + 1, z: v.z }, { gain: 1 }); } v.vx *= -0.3; v.vz *= -0.3; }
  const g2 = supportHeight(v.x, v.z, 1.0, Math.max(ny, v.y) + 0.5);
  if (ny <= g2) { if (v.vy < -7 && v.alive) damageVehicle(v, (-v.vy - 7) * 45, null); ny = g2; v.vy = Math.max(0, v.vy); }
  v.y = ny; v.speed = Math.hypot(v.vx, v.vz);
  // nose dips into the direction of travel
  const lf = (-sy * v.vx - cy * v.vz), ls = (cy * v.vx - sy * v.vz);
  v.pitch = damp(v.pitch, clamp(-lf * 0.022, -0.32, 0.32), 4, dt); v.roll = damp(v.roll, clamp(-ls * 0.03, -0.35, 0.35) + (!v.alive ? v.rotor * 0.0 : 0), 4, dt);
  if (!v.alive) { v.roll += dt * 1.5; }
}

function makeHeliMesh() {
  if (!jeepGeo) buildModels();
  if (!heliGeo) buildHeli();
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const hull = new THREE.Mesh(heliGeo.body, vMat); hull.castShadow = true; body.add(hull);
  const rotor = new THREE.Group(); rotor.position.set(0, 2.78, 0.25); body.add(rotor);
  const blades = new THREE.Mesh(heliGeo.rotor, vMat); blades.castShadow = true; rotor.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.7, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x202426, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  rotor.add(disc);
  const tail = new THREE.Group(); tail.position.set(0.2, 1.95, 5.65); body.add(tail);
  tail.add(new THREE.Mesh(heliGeo.tail, vMat));
  const GP = HELI.gunPivot, turret = new THREE.Group(); turret.position.set(GP.x, GP.y, GP.z); body.add(turret);
  const gun = new THREE.Group(); turret.add(gun); const mg = new THREE.Mesh(mgGeo, vMat); mg.scale.setScalar(0.85); gun.add(mg);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(3, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.position.y = 0.02;
  G.scene.add(root);
  return { root, body, wheels: [], turret, gun, hull, rotor, blades, disc, tail, blob };
}
let heliGeo = null;
function buildHeli() {
  const OD = 0x4b5541, ODd = 0x3a4233, K = 0x1d2022, GL = 0x86a8b6, ST = 0xc9b25a;
  let b = new Builder();
  b.add(0, lathe2([[0.0, -2.35], [0.45, -2.2], [0.88, -1.55], [1.05, -0.6], [1.08, 0.4], [0.95, 1.2], [0.6, 1.75], [0.3, 2.0], [0, 2.05]], 14), OD, [0, 1.35, 0], [Math.PI / 2, 0, 0], [1, 0.95, 1]);
  b.add(0, sphere(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), GL, [0, 1.45, -1.35], [-1.25, 0, 0], [0.86, 1.05, 0.8], { ao: 0 }); // canopy
  b.add(0, rbox(0.95, 0.42, 1.7, 0.12, 2), ODd, [0, 2.38, 0.35]);    // engine housing
  for (const sx of [-1, 1]) b.add(0, cyl(0.12, 0.12, 0.25, 8), K, [sx * 0.42, 2.38, 1.25], [Math.PI / 2, 0, 0]); // exhausts
  b.add(0, cyl(0.08, 0.08, 0.35, 8), K, [0, 2.62, 0.25]);             // mast
  b.add(0, cyl(0.24, 0.12, 4.0, 10), OD, [0, 1.62, 3.7], [Math.PI / 2, 0, 0]); // tail boom
  b.add(0, rbox(0.08, 1.05, 0.62, 0.03, 1), OD, [0, 2.05, 5.6], [0.25, 0, 0]); // fin
  b.add(0, rbox(1.3, 0.05, 0.36, 0.02, 1), OD, [0, 1.58, 5.0]);       // stabiliser
  for (const sx of [-1, 1]) {
    b.add(0, cyl(0.05, 0.05, 3.3, 8), K, [sx * 0.88, 0.07, -0.15], [Math.PI / 2, 0, 0]); // skids
    for (const z of [-0.9, 0.8]) b.add(0, cyl(0.035, 0.035, 0.8, 6), K, [sx * 0.72, 0.42, z], [0, 0, sx * 0.4]);
    b.add(0, rbox(0.04, 0.12, 1.4, 0.02, 1), ST, [sx * 1.04, 1.1, -0.1]); // stripe
  }
  b.add(0, rbox(1.75, 0.95, 1.15, 0.12, 2), ODd, [0, 1.15, 0.2]); // cabin sides (open doors)
  const body = b.geometry(); body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 1.5), 5);
  b = new Builder();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; b.add(0, rbox(0.28, 0.035, 4.5, 0.012, 1), K, [Math.sin(a) * 2.35, 0.05, Math.cos(a) * 2.35], [0, a, 0]); }
  b.add(0, cyl(0.16, 0.16, 0.12, 10), K, [0, 0.05, 0]);
  const rotor = b.geometry(); rotor.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
  b = new Builder();
  for (let i = 0; i < 2; i++) b.add(0, rbox(0.03, 0.14, 1.1, 0.01, 1), K, [0, 0, 0], [i * Math.PI / 2, 0, 0]);
  const tail = b.geometry(); tail.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.8);
  heliGeo = { body, rotor, tail };
}
const lathe2 = (profile, rs) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), rs);

function runOver(v, driver) {
  if (Math.abs(v.speed) < 2) return;
  for (const u of G.units) {
    if (!u.alive || u.vehicle === v) continue;
    if (u.y > v.y + JEEP.y1 || u.y + u.h < v.y) continue;
    const [lx, lz] = local(v, u.x, u.z);
    if (Math.abs(lx) > JEEP.hw + u.r || Math.abs(lz) > JEEP.hd + u.r) continue;
    const sp = Math.abs(v.speed);
    if (sp > 5.5 && (!driver || isEnemy(driver, u) || !driver.team && driver !== u)) { damage(u, 40 + sp * 9, driver, { weapon: 'roadkill', sx: v.x, sz: v.z }); v.speed *= 0.85; }
    // shove them aside
    const side = lx >= 0 ? 1 : -1, [px, pz] = world(v, side * (JEEP.hw + u.r + 0.05), lz);
    if (!blocked(px, pz, u.r, u.y, u.h)) { u.x = px; u.z = pz; }
  }
}

// ---------- mounted gun ----------
function fireMG(v, u, dirx, diry, dirz, ox, oy, oz, spread = 0.02) {
  if (v.overheated || G.now < v.fireAt) return;
  const w = WEAPONS.m2;
  v.fireAt = G.now + w.rate; v.heat = Math.min(1, v.heat + 0.032); G.mgShots = (G.mgShots || 0) + (u.isPlayer ? 0 : 1);
  if (v.heat >= 1) { v.overheated = true; play('dry', null, { gain: 0.8 }); }
  const d = { x: 0, y: 0, z: 0 }; coneDir(dirx, diry, dirz, u.isPlayer ? 0.008 : spread, d);
  const s = newShot(u, 'm2', ox, oy, oz, 1, 0); G.ignoreDyn = v.dyn; traceSegment(s, d.x, d.y, d.z, w.range); G.ignoreDyn = null;
  const mx = ox + dirx * 1.3, my = oy + diry * 1.3, mz = oz + dirz * 1.3;
  tracer(mx, my, mz, s.x, s.y, s.z, 0xffd080, 520);
  play(w.sound, u.isPlayer ? null : { x: mx, y: my, z: mz }, { gain: 0.95, important: u.isPlayer });
  if (G.muzzleLight && u.isPlayer) { G.muzzleLight.position.set(mx, my, mz); G.muzzleLight.intensity = 3; }
  v.kick = 1;
  if (u.isPlayer) { G.match.stats.shots++; if (s.hit) G.match.stats.hits++; u.pitch = clamp(u.pitch + 0.004, -1.2, 0.9); }
}

// gunner aim in world space -> turret angles; returns muzzle origin + dir
function aimGun(v, yaw, pitch) {
  v.gunYaw = Math.atan2(Math.sin(yaw - v.yaw), Math.cos(yaw - v.yaw)); v.gunPitch = clamp(pitch, v.type === 'heli' ? -1.0 : -0.45, 0.75);
  if (v.spec.gunArc) { v.gunYaw = clamp(v.gunYaw, v.spec.gunArc[0], v.spec.gunArc[1]); yaw = v.yaw + v.gunYaw; }
  const GP = v.spec.gunPivot, [px, pz] = world(v, GP.x, GP.z), py = v.y + GP.y;
  const cp = Math.cos(v.gunPitch);
  return { ox: px, oy: py, oz: pz, dx: -Math.sin(yaw) * cp, dy: Math.sin(v.gunPitch), dz: -Math.cos(yaw) * cp };
}

// ---------- player in a vehicle (called from updatePlayer after mouse look) ----------
export function playerVehicle(P, dt) {
  const v = P.vehicle, frozen = G.state !== 'playing';
  const heli = v.type === 'heli';
  if (P.seat === 0 && heli) {
    const k = (a) => !frozen && down(a) ? 1 : 0;
    fly(v, dt, k('forward') - k('back'), k('right') - k('left'), k('jump') - (k('crouch') || k('crouchAlt')), frozen ? null : P.yaw, true);
  } else if (P.seat === 0) {
    drive(v, dt, frozen ? 0 : (down('forward') ? 1 : 0) - (down('back') ? 1 : 0), frozen ? 0 : (down('left') ? 1 : 0) - (down('right') ? 1 : 0), !frozen && down('jump'));
    runOver(v, P);
  }
  placeOccupant(v, P);
  const cam = G.camera;
  if (P.seat === 0 && heli) { // pilot: chase cam further back; nose gun fires at whatever the crosshair is on
    P.pitch = clamp(P.pitch, -0.9, 0.5);
    const dist = 11, cp = Math.cos(P.pitch), cx = Math.sin(P.yaw) * cp * dist, cz = Math.cos(P.yaw) * cp * dist, cy = 3.2 - Math.sin(P.pitch) * dist;
    const tx = v.x, ty = v.y + 1.8, tz = v.z, l = Math.hypot(cx, cy, cz);
    G.ignoreDyn = v.dyn; const h = rayWorld(tx, ty, tz, cx / l, cy / l, cz / l, l);
    G.ignoreDyn = null; const kk = h ? Math.max(0.2, (h.t - 0.4) / l) : 1;
    cam.position.set(tx + cx * kk, ty + cy * kk, tz + cz * kk);
    cam.rotation.set(P.pitch - 0.12, P.yaw, 0);
    if (!frozen && input.fire) {
      const fwd = new THREE.Vector3(0, 0, -1).applyEuler(cam.rotation), hit = (G.ignoreDyn = v.dyn, rayWorld(cam.position.x, cam.position.y, cam.position.z, fwd.x, fwd.y, fwd.z, 220)); G.ignoreDyn = null;
      const T = hit ? [hit.x, hit.y, hit.z] : [cam.position.x + fwd.x * 220, cam.position.y + fwd.y * 220, cam.position.z + fwd.z * 220];
      const [nx, nz] = world(v, 0, -2.5), ny = v.y + 0.75, dx = T[0] - nx, dy = T[1] - ny, dz = T[2] - nz, dl = Math.hypot(dx, dy, dz) || 1;
      if ((dx * -Math.sin(v.yaw) + dz * -Math.cos(v.yaw)) / dl > 0.5) fireMG(v, P, dx / dl, dy / dl, dz / dl, nx, ny, nz); // nose gun only covers the front
    }
  } else if (P.seat === 0) { // chase camera, mouse orbits; pulled in by walls
    P.pitch = clamp(P.pitch, -0.6, 0.5);
    const dist = 6.2, cx = Math.sin(P.yaw) * Math.cos(P.pitch) * dist, cz = Math.cos(P.yaw) * Math.cos(P.pitch) * dist, cy = 2.4 - Math.sin(P.pitch) * dist;
    const tx = v.x, ty = v.y + 1.6, tz = v.z, l = Math.hypot(cx, cy - 1.6 + 1.6, cz);
    G.ignoreDyn = v.dyn; const h = rayWorld(tx, ty, tz, cx / l, (cy - 0.8) / l, cz / l, l);
    G.ignoreDyn = null; const k = h ? Math.max(0.25, (h.t - 0.3) / l) : 1;
    cam.position.set(tx + cx * k, ty + (cy - 0.8) * k, tz + cz * k);
    cam.rotation.set(P.pitch - 0.16, P.yaw, 0);
  } else { // gunner: look over the gun
    const a = aimGun(v, P.yaw, P.pitch);
    P.pitch = v.gunPitch; P.yaw = v.yaw + v.gunYaw; // the view stops where the gun's arc stops
    const back = v.type === 'heli' ? 0.2 : 0.5; cam.position.set(a.ox - a.dx * back, a.oy + (v.type === 'heli' ? 0.44 : 0.5), a.oz - a.dz * back);
    cam.rotation.set(P.pitch - 0.05, P.yaw, 0);
    if (!frozen && input.fire) fireMG(v, P, a.dx, a.dy, a.dz, a.ox + a.dx * 0.9, a.oy + 0.04, a.oz + a.dz * 0.9);
  }
  cam.fov = damp(cam.fov, G.profile.settings.fov + (P.seat === 0 ? Math.min(8, Math.abs(v.speed) * 0.35) : 0), 6, dt); cam.updateProjectionMatrix();
  hud.vehicleHud(v, P.seat, Math.abs(v.speed) * 3.6, v.heat, v.overheated, heli ? Math.max(0, v.y - supportHeight(v.x, v.z, 0.5, v.y + 0.1)) : -1);
  playerBody(P, v, P.seat === 0, dt);
}

// the player's own body, seen from the driver's chase camera
let pBody = null;
function playerBody(P, v, show, dt) {
  if (!show) { if (pBody) pBody.root.visible = false; return; }
  if (!pBody) { pBody = makeSoldier({ uniform: 0x56604c, accent: 0xd8a23a, helmet: 0x3f4a3c }); setSoldierGun(pBody, 'none'); }
  pBody.root.visible = true;
  poseSoldier(pBody, { x: P.x, y: P.y + 0.08, z: P.z, yaw: v.yaw, aimPitch: 0, crouchT: 0.62, moveSpeed: 0 }, dt);
  pBody.arms.forEach((A, i) => { A.sh.rotation.set(-0.95, 0, (i ? -1 : 1) * 0.12); A.el.rotation.set(0.5, 0, 0); }); // hands on the wheel
}
export function hidePlayerBody() { if (pBody) pBody.root.visible = false; }

// ---------- per-frame ----------
export function updateVehicles(dt) {
  if (!vehicles.length) return;
  const P = G.player;
  for (const v of vehicles) {
    if (!v.alive) {
      if (v.type === 'heli') { fly(v, dt, 0, 0, 0, null, false); syncMesh(v, dt); }
      if (G.now - v.deadAt > v.spec.respawn) respawnVehicle(v);
      continue;
    }
    // occupants who died leave their seat
    v.seats.forEach((u, i) => { if (u && (!u.alive || u.vehicle !== v)) { v.seats[i] = null; if (u.vehicle === v) { u.vehicle = null; u.seat = -1; } } });
    if (!v.seats[0] || !v.seats[0].isPlayer) { // no player driver: coast to a stop (bots drive in 6c)
      if (!v.seats[0]) { if (v.type === 'heli') fly(v, dt, 0, 0, 0, null, false); else drive(v, dt, 0, 0, true); }
    }
    for (const u of v.seats) if (u && !u.isPlayer) placeOccupant(v, u);
    // gun cools down
    v.heat = Math.max(0, v.heat - dt * (v.overheated ? 0.32 : 0.45)); if (v.overheated && v.heat <= 0.15) v.overheated = false;
    v.kick = Math.max(0, (v.kick || 0) - dt * 14);
    syncMesh(v, dt);
    engineSound(v);
  }
  if (G.state === 'playing' && G.now >= crewAt) { crewAt = G.now + 1; assignCrews(); }
  // prompt to get in
  if (P && P.alive && !P.vehicle && G.state === 'playing') {
    const v = nearestVehicle(P);
    if (v) hud.prompt(`<kbd>${keyName('interact')}</kbd> ${v.spec.who[v.seats[0] ? (v.seats[1] ? 2 : 1) : 0]}`);
  }
  if (P && !P.vehicle) { hud.vehicleHud(null); hidePlayerBody(); }
}

function respawnVehicle(v) {
  G.scene.remove(v.m.root);
  const i = vehicles.indexOf(v); vehicles.splice(i, 1);
  const j = G.world.dynamic.indexOf(v.dyn); if (j >= 0) G.world.dynamic.splice(j, 1);
  // only respawn if the home spot is clear of units
  for (const u of G.units) if (u.alive && Math.hypot(u.x - v.home.x, u.z - v.home.z) < 3) { vehicles.splice(i, 0, v); G.world.dynamic.push(v.dyn); G.scene.add(v.m.root); v.deadAt = G.now - v.spec.respawn + 2; return; }
  spawnVehicle(v.home);
}

function syncMesh(v, dt) {
  const m = v.m;
  m.root.position.set(v.x, v.y, v.z); m.root.rotation.set(0, v.yaw, 0);
  m.body.rotation.set(-v.pitch, 0, v.roll); m.body.position.y = Math.sin(G.now * 30) * 0.008 * Math.min(1, Math.abs(v.speed) / 4);
  if (v.type === 'heli') {
    m.body.position.y = 0; m.rotor.rotation.y = v.rotor; m.tail.rotation.x = v.rotor * 2.3;
    const fast = Math.min(1, (v.rotorSpeed || 0) / 25); m.disc.material.opacity = 0.16 * fast; m.blades.visible = fast < 0.85;
    m.turret.rotation.y = v.gunYaw; m.gun.rotation.x = v.gunPitch; m.gun.position.z = (v.kick || 0) * 0.03;
    const d = v.dyn; d.x = v.x; d.z = v.z; d.yaw = v.yaw; d.y0 = v.y + v.spec.y0; d.y1 = v.y + v.spec.y1;
    return;
  }
  v.wheelSpin += v.speed * dt / 0.42;
  for (const w of m.wheels) { w.w.rotation.x = -v.wheelSpin; w.pivot.rotation.y = w.front ? v.steer : 0; }
  m.turret.rotation.y = v.gunYaw; m.gun.rotation.x = v.gunPitch; m.gun.position.z = (v.kick || 0) * 0.03;
  const d = v.dyn; d.x = v.x; d.z = v.z; d.yaw = v.yaw; d.y0 = v.y + v.spec.y0; d.y1 = v.y + v.spec.y1;
}

// ---------- engine: one continuous tone per crewed jeep ----------
function engineSound(v) {
  const ctx = audioCtx(); if (!ctx) return;
  const on = v.alive && v.seats[0];
  if (!on) { stopEngine(v); return; }
  if (!v.engine) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(masterNode()); o.start(); o2.start();
    v.engine = { o, o2, f, g };
  }
  if (v.type === 'heli' && !v.engine.lfo) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 11; lg.gain.value = 0.06; lfo.connect(lg); lg.connect(v.engine.g.gain); lfo.start(); v.engine.lfo = lfo; v.engine.o.type = 'triangle'; }
  const L = G.camera.position, d = Math.hypot(L.x - v.x, L.y - v.y, L.z - v.z), sp = v.type === 'heli' ? Math.min(1, (v.rotorSpeed || 0) / 30) : Math.abs(v.speed) / JEEP.maxF;
  if (v.engine.lfo) { v.engine.lfo.frequency.setTargetAtTime(4 + sp * 8, ctx.currentTime, 0.2); }
  const t = ctx.currentTime;
  v.engine.o.frequency.setTargetAtTime(42 + sp * 70, t, 0.08); v.engine.o2.frequency.setTargetAtTime(21 + sp * 35, t, 0.08);
  v.engine.f.frequency.setTargetAtTime(300 + sp * 700, t, 0.1);
  v.engine.g.gain.setTargetAtTime(0.11 * (0.55 + sp * 0.6) / (1 + d * d * 0.012), t, 0.08);
}
function stopEngine(v) { if (!v.engine) return; try { v.engine.o.stop(); v.engine.o2.stop(); if (v.engine.lfo) v.engine.lfo.stop(); v.engine.g.disconnect(); } catch (e) { /* already stopped */ } v.engine = null; }

// ---------- geometry queries used by physics ----------
// circle (x,z,r) vs a dynamic oriented box
export function obbCircle(d, x, z, r) {
  const c = Math.cos(d.yaw), s = Math.sin(d.yaw), dx = x - d.x, dz = z - d.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
  const px = clamp(lx, -d.hw, d.hw), pz = clamp(lz, -d.hd, d.hd);
  return (lx - px) ** 2 + (lz - pz) ** 2 < r * r;
}
// ray vs dynamic oriented box: [t, nx, nz, ny] or null
export function obbRay(d, ox, oy, oz, dx, dy, dz, tmax) {
  const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
  const lox = (ox - d.x) * c - (oz - d.z) * s, loz = (ox - d.x) * s + (oz - d.z) * c, ldx = dx * c - dz * s, ldz = dx * s + dz * c;
  let t0 = 0, t1 = tmax, ax = -1;
  for (const [o, dd, mn, mx, a] of [[lox, ldx, -d.hw, d.hw, 0], [oy, dy, d.y0, d.y1, 1], [loz, ldz, -d.hd, d.hd, 2]]) {
    if (Math.abs(dd) < 1e-9) { if (o < mn || o > mx) return null; continue; }
    let ta = (mn - o) / dd, tb = (mx - o) / dd; if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) { t0 = ta; ax = a; } if (tb < t1) t1 = tb; if (t0 > t1) return null;
  }
  // local normal -> world
  let nx = 0, ny = 0, nz = 0;
  if (ax === 0) { const sx = ldx > 0 ? -1 : 1; nx = sx * c; nz = -sx * s; } else if (ax === 2) { const sz = ldz > 0 ? -1 : 1; nx = sz * s; nz = sz * c; } else ny = dy > 0 ? -1 : 1;
  return [t0, nx, ny, nz];
}

// ---------- bots (6c) ----------
let crewAt = 0;
// idle bots walk to empty seats (one bot per seat), board when close; give up if the seat is taken or the jeep is gone
function assignCrews() {
  if (!G.match.bots.vehicles) return;
  for (const u of G.bots) {
    const b = u.brain; if (!u.alive || u.vehicle || !b.board) continue;
    const v = b.board;
    if (!v.alive || v.seats[b.boardSeat] || (b.target && b.state !== 'patrol')) { b.board = null; continue; }
    if (nearestVehicle(u, 3.2) === v) { enterVehicle(u, v, b.boardSeat); b.board = null; u.vRoute = pickRoute(v); u.vWp = 0; }
  }
  for (const v of vehicles) {
    if (!v.alive) continue;
    for (let seat = 0; seat < 2; seat++) {
      if (v.seats[seat] || G.bots.some((u) => u.brain.board === v && u.brain.boardSeat === seat)) continue;
      if (seat === 1 && !v.seats[0]) continue; // a driver first
      let best = null, bd = 32;
      for (const u of G.bots) {
        const b = u.brain;
        if (!u.alive || u.vehicle || b.board || b.state !== 'patrol' || b.melee || b.weapon === 'knife') continue;
        if (v.seats[0] && isEnemy(v.seats[0], u)) continue;
        const d = Math.hypot(u.x - v.x, u.z - v.z) + Math.abs(u.y - v.y) * 3; if (d < bd) { bd = d; best = u; }
      }
      if (best) { best.brain.board = v; best.brain.boardSeat = seat; }
    }
  }
}
function pickRoute(v) {
  const routes = (G.world.def.vehicleRoutes || []).filter((r) => r.type === v.type);
  let best = null, bd = Infinity;
  for (const r of routes) for (const p of r.pts) { const d = Math.hypot(p[0] - v.x, p[1] - v.z); if (d < bd) { bd = d; best = r; } }
  return best;
}
function findTarget(u, v, ox, oy, oz, range) {
  let best = null, bd = range;
  G.ignoreDyn = v.dyn;
  for (const t of G.units) {
    if (!t.alive || t === u || !isEnemy(u, t) || t.vehicle === v) continue;
    const d = Math.hypot(t.x - ox, t.y + 1 - oy, t.z - oz);
    if (d < bd && losClear(ox, oy, oz, t.x, t.y + (t.h || 1.6) * 0.6, t.z)) { bd = d; best = t; }
  }
  G.ignoreDyn = null;
  return best;
}
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function botVehicle(u, dt) {
  const v = u.vehicle; if (!v || !v.alive) return;
  const heli = v.type === 'heli';
  if (G.now >= (u.vtAt || 0)) {
    u.vtAt = G.now + 0.45;
    const GP = v.spec.gunPivot, [gx, gz] = world(v, u.seat === 1 ? GP.x : 0, u.seat === 1 ? GP.z : -2.4);
    u.vTarget = findTarget(u, v, gx, v.y + (u.seat === 1 ? GP.y : heli ? 0.9 : 1.6), gz, heli ? 140 : 110);
  }
  const t = u.vTarget && u.vTarget.alive ? u.vTarget : null;
  if (u.seat === 1) return botGunner(u, v, dt, t);
  if (heli) botPilot(u, v, dt, t); else botDriver(u, v, dt, t);
}
function botGunner(u, v, dt, t) {
  if (!t) { v.gunPitch = damp(v.gunPitch, 0, 2, dt); return; }
  const GP = v.spec.gunPivot, [px, pz] = world(v, GP.x, GP.z), py = v.y + GP.y;
  const tx = t.x + (t.vx || 0) * 0.15, tz = t.z + (t.vz || 0) * 0.15, ty = t.y + (t.h || 1.6) * 0.6;
  const wantYaw = Math.atan2(-(tx - px), -(tz - pz)), wantPitch = Math.atan2(ty - py, Math.hypot(tx - px, tz - pz));
  const cur = v.yaw + v.gunYaw, dy = wrapA(wantYaw - cur), turn = 2.6 * dt;
  const a = aimGun(v, cur + clamp(dy, -turn, turn), v.gunPitch + clamp(wantPitch - v.gunPitch, -turn, turn));
  if (Math.abs(dy) < 0.09 && Math.abs(wantPitch - v.gunPitch) < 0.09) fireMG(v, u, a.dx, a.dy, a.dz, a.ox + a.dx * 0.9, a.oy + 0.04, a.oz + a.dz * 0.9, G.match.ai.mg || 0.03);
}
function botDriver(u, v, dt, t) {
  const r = u.vRoute; if (!r) { drive(v, dt, 0, 0, true); return; }
  // stuck: back up with the wheel turned the other way
  if (Math.abs(v.speed) < 0.8) u.vStuck = (u.vStuck || 0) + dt; else u.vStuck = 0;
  if (u.vStuck > 1.4) { u.vReverseUntil = G.now + 1.2; u.vStuck = 0; }
  const wp = r.pts[u.vWp % r.pts.length], dx = wp[0] - v.x, dz = wp[1] - v.z;
  if (Math.hypot(dx, dz) < 5) u.vWp++;
  const diff = wrapA(Math.atan2(-dx, -dz) - v.yaw), steer = clamp(diff * 2.2, -1, 1);
  if (G.now < (u.vReverseUntil || 0)) { drive(v, dt, -1, -steer, false); return; }
  const gunnerBusy = t && v.seats[1] && Math.hypot(t.x - v.x, t.z - v.z) < 45;
  const thr = gunnerBusy ? (Math.abs(v.speed) > 3 ? -1 : 0) : Math.abs(diff) > 1.1 && v.speed > 7 ? -1 : 1;
  drive(v, dt, thr, steer, false);
  runOver(v, u);
}
function botPilot(u, v, dt, t) {
  const r = u.vRoute, g = supportHeight(v.x, v.z, 1, v.y + 0.5);
  let wantYaw = v.yaw, fwd = 0;
  if (t) { // hover-turn toward the target and use the nose gun
    wantYaw = Math.atan2(-(t.x - v.x), -(t.z - v.z));
    const d = Math.hypot(t.x - v.x, t.z - v.z); fwd = d > 60 ? 0.6 : d < 25 ? -0.4 : 0;
    if (Math.abs(wrapA(wantYaw - v.yaw)) < 0.12 && v.y > g + 4) {
      const [nx, nz] = world(v, 0, -2.5), ny = v.y + 0.75, tx = t.x - nx, ty = t.y + 1 - ny, tz = t.z - nz, l = Math.hypot(tx, ty, tz) || 1;
      fireMG(v, u, tx / l, ty / l, tz / l, nx, ny, nz, (G.match.ai.mg || 0.03) * 1.3);
    }
  } else if (r) {
    const wp = r.pts[u.vWp % r.pts.length], dx = wp[0] - v.x, dz = wp[1] - v.z;
    if (Math.hypot(dx, dz) < 8) u.vWp++;
    wantYaw = Math.atan2(-dx, -dz); fwd = Math.abs(wrapA(wantYaw - v.yaw)) < 0.6 ? 1 : 0.25;
  }
  const alt = Math.max(g + 12, (r && r.alt) || 0), lift = clamp((alt - v.y) / 3, -1, 1);
  fly(v, dt, v.y > g + 3 ? fwd : 0, 0, lift, wantYaw, true);
}
