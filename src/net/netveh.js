// Vehicles in multiplayer. The host simulates every vehicle except one a joiner is driving: that joiner drives it
// locally (no input lag, like their own movement) and streams its pose with their state; the host applies it. Everyone
// else sees vehicles from the host's 30 Hz snapshot, interpolated. Seats, damage, destruction and respawn are host-decided.
import { G } from '../core/state.js';
import { vehicles, enterVehicle, exitVehicle, switchSeat, damageVehicle, nearestVehicle, wreckVehicle, respawnVehicleNow } from '../entities/vehicles.js';
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const byId = (i) => vehicles.find((v) => v.vid === i);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// [vid, alive, x, y, z, yaw, pitch, roll, speed, steer, gunYaw, gunPitch, rotorSpeed, hp, seat0, seat1]
export function vehSnap() {
  return vehicles.map((v) => [v.vid, v.alive ? 1 : 0, r2(v.x), r2(v.y), r2(v.z), r3(v.yaw), r3(v.pitch), r3(v.roll), r2(v.speed), r3(v.steer || 0), r3(v.gunYaw), r3(v.gunPitch), r2(v.rotorSpeed || 0), Math.round(v.hp), v.seats[0] ? v.seats[0].id : 0, v.seats[1] ? v.seats[1].id : 0]);
}
const pose = (v, a) => { v.x = a[2]; v.y = a[3]; v.z = a[4]; v.yaw = a[5]; v.pitch = a[6]; v.roll = a[7]; v.speed = a[8]; v.steer = a[9]; v.gunYaw = a[10]; v.gunPitch = a[11]; v.rotorSpeed = a[12]; };
// client: a snapshot arrived
export function vehApplySnap(n, list, unitById) {
  const P = G.player;
  for (const a of list) {
    let v = byId(a[0]); if (!v) continue;
    if (a[1] && !v.alive) v = respawnVehicleNow(v); // host respawned it
    else if (!a[1] && v.alive) { if (P.vehicle === v) exitVehicle(P); wreckVehicle(v); }
    v.hp = a[13];
    if (!v.alive) { pose(v, a); continue; }
    if (v.seats[0] !== P || !P.vehicle) { v.nb = v.nb || []; v.nb.push({ n, a }); if (v.nb.length > 20) v.nb.shift(); }
    for (let s = 0; s < v.seats.length; s++) { // seats (our own seat is ours to decide); one-seat vehicles have one
      const cur = v.seats[s]; if (cur === P) continue;
      const u = a[14 + s] ? unitById(a[14 + s]) : null;
      if (u === P) continue;
      if (cur && cur !== u && cur.vehicle === v) { cur.vehicle = null; cur.seat = -1; }
      v.seats[s] = u || null; if (u) { u.vehicle = v; u.seat = s; }
    }
  }
}
// client: move vehicles we don't drive along the interpolated snapshots
export function vehInterp(v, dt, rt) {
  const b = v.nb; if (!b || !b.length) return;
  while (b.length > 2 && b[1].n < rt) b.shift();
  const A = b[0], B = b[1] || A, k = B.n > A.n ? Math.max(0, Math.min(1, (rt - A.n) / (B.n - A.n))) : 1;
  const L = (i) => A.a[i] + (B.a[i] - A.a[i]) * k, W = (i) => A.a[i] + wrap(B.a[i] - A.a[i]) * k;
  v.x = L(2); v.y = L(3); v.z = L(4); v.yaw = W(5); v.pitch = L(6); v.roll = L(7); v.speed = L(8); v.steer = L(9); v.gunPitch = L(11); v.rotorSpeed = L(12);
  if (v.seats[1] !== G.player) v.gunYaw = W(10);
  v.rotor = (v.rotor || 0) + v.rotorSpeed * dt;
}
// client: what we send with our state while in a vehicle
export function vehLocal() {
  const P = G.player, v = P.vehicle; if (!v) return null;
  if (P.seat === 0) return [v.vid, r2(v.x), r2(v.y), r2(v.z), r3(v.yaw), r3(v.pitch), r3(v.roll), r2(v.speed), r3(v.steer || 0), r2(v.rotorSpeed || 0), r3(v.gunYaw), r3(v.gunPitch)];
  return [v.vid, r3(v.gunYaw), r3(v.gunPitch)];
}
// host: apply a joiner's driving (smoothed toward their latest pose)
export function vehHostApply(u, a, dt) {
  const v = u.vehicle; if (!a || !v || v.vid !== a[0] || !v.alive) return;
  if (a.length === 3) { if (u.seat === 1) { v.gunYaw = a[1]; v.gunPitch = a[2]; } return; }
  if (u.seat !== 0) return;
  const k = Math.min(1, dt * 18);
  v.x += (a[1] - v.x) * k; v.y += (a[2] - v.y) * k; v.z += (a[3] - v.z) * k; v.yaw += wrap(a[4] - v.yaw) * k;
  v.pitch = a[5]; v.roll = a[6]; v.speed = a[7]; v.steer = a[8]; v.rotorSpeed = a[9]; v.rotor = (v.rotor || 0) + a[9] * dt;
  if (!v.seats[1] || !v.seats[1].isPlayer) { v.gunYaw = a[10]; v.gunPitch = a[11]; }
}
// host: requests from a joiner
export function vehHostMsg(r, m) {
  const u = r.unit; if (!u || !u.alive) return;
  const v = byId(m.i);
  if (m.t === 'ven') {
    // the joiner's own position (their state may lag behind this request), sanity-checked against ours
    const px = isFinite(m.x) && Math.hypot(m.x - u.x, m.z - u.z) < 12 ? m.x : u.x, pz = isFinite(m.z) && Math.hypot(m.x - u.x, m.z - u.z) < 12 ? m.z : u.z;
    if (!v || !v.alive || u.vehicle || v.seats[m.s] || Math.hypot(px - v.x, pz - v.z) > 5.5) { r.link.send({ t: 'deny', msg: 'Seat taken' }); return; }
    if (enterVehicle(u, v, m.s)) r.link.send({ t: 'vok', i: v.vid, s: m.s });
  } else if (m.t === 'vex') { if (u.vehicle) exitVehicle(u); }
  else if (m.t === 'vsw') { if (u.vehicle && switchSeat(u, m.s)) r.link.send({ t: 'vok', i: u.vehicle.vid, s: m.s }); }
  else if (m.t === 'vdm') { if (v && v.alive && m.a > 0 && Math.hypot(u.x - v.x, u.z - v.z) < 240) damageVehicle(v, Math.min(m.a, 400), u, 'claim'); }
}
// client: the host said yes
export function vehOk(m) {
  const P = G.player, v = byId(m.i); if (!v || !v.alive || !P.alive) return;
  if (P.vehicle === v) { P._vok = true; switchSeat(P, m.s); P._vok = false; } else { if (P.vehicle) exitVehicle(P); v.nb = []; enterVehicle(P, v, m.s); }
}
// client: E pressed (enter the nearest free seat, or get out)
export function vehRequest() {
  const P = G.player;
  if (P.vehicle) { exitVehicle(P); G.mp.send({ t: 'vex' }); return true; }
  const v = nearestVehicle(P); if (!v) return false;
  const s = v.seats.findIndex((q) => !q); if (s < 0) return false;
  G.mp.send({ t: 'ven', i: v.vid, s, x: r2(P.x), z: r2(P.z) }); return true;
}
