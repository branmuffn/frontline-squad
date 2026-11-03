// Kill cam and death camera.
// Records every unit (position, view, crouch, speed, weapon) at ~20 Hz plus every shot into a short ring buffer.
// After the player dies: a short fall, then (setting "Kill cam" On) the last few seconds replayed from the killer's
// eyes, any key skips, then free look at the death spot (mouse turns, WASD drifts up to ~6 m, walls clip it).
// The respawn delay is never changed: the replay is fitted into it.
import { G } from '../core/state.js';
import { WEAPONS, TEAMS } from '../core/config.js';
import { damp, clamp, lerp } from '../core/util.js';
import { down } from '../core/input.js';
import { losClear } from '../world/physics.js';
import { makeSoldier, setSoldierGun, poseSoldier } from '../entities/soldier.js';
import { tracer } from '../engine/fx.js';
import { play, setListener } from '../engine/audio.js';
import { updateViewmodel, vmFire } from '../entities/viewmodel.js';

const RATE = 0.05, KEEP = 5.5, MAX_FOOTAGE = 4, MAX_SPEED = 1.4, FALL = 0.5, TAIL = 0.35;
let frames = [], shots = [], nextSample = 0;
let cam = null;     // active death camera state
let body = null;    // the player's own third-person body, only shown in the kill cam

export function resetKillcam() { frames = []; shots = []; nextSample = 0; endReplay(); cam = null; }

const weaponOf = (u) => u.isPlayer ? (u.weapons ? u.weapons[u.slot] : null) : (u.brain ? u.brain.weapon : null);

// called once per live frame, after all updates
export function recordFrame() {
  if (G.now < nextSample) return;
  nextSample = G.now + RATE;
  const us = [];
  for (const u of G.units) us.push({ u, x: u.x, y: u.y, z: u.z, yaw: u.yaw, pitch: u.isPlayer ? u.pitch : (u.aimPitch || 0), alive: u.alive, crouchT: u.crouchT || 0, speed: u.moveSpeed || 0, w: weaponOf(u) });
  frames.push({ t: G.now, us });
  while (frames.length && frames[0].t < G.now - KEEP) frames.shift();
  while (shots.length && shots[0].t < G.now - KEEP) shots.shift();
}
// called by ballistics for every bullet/pellet: s is the live shot state (its x/y/z end up at the impact)
export function recordShot(s) { if (G.match && !G.match.ended) shots.push({ t: G.now, s, x0: s.x, y0: s.y, z0: s.z, done: false }); }

// sample a unit's state at time t (linear interpolation between ~20 Hz frames)
function sample(u, t) {
  let a = null, b = null;
  for (let i = frames.length - 1; i >= 0; i--) { if (frames[i].t <= t) { a = frames[i]; b = frames[i + 1] || a; break; } }
  if (!a) { a = b = frames[0]; }
  if (!a) return null;
  const ea = a.us.find((e) => e.u === u), eb = b.us.find((e) => e.u === u) || ea;
  if (!ea) return null;
  const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
  const dy = Math.atan2(Math.sin(eb.yaw - ea.yaw), Math.cos(eb.yaw - ea.yaw));
  return { x: lerp(ea.x, eb.x, k), y: lerp(ea.y, eb.y, k), z: lerp(ea.z, eb.z, k), yaw: ea.yaw + dy * k, pitch: lerp(ea.pitch, eb.pitch, k),
    alive: k < 0.5 ? ea.alive : eb.alive, crouchT: lerp(ea.crouchT, eb.crouchT, k), speed: lerp(ea.speed, eb.speed, k), w: ea.w };
}

function ensureBody(P) {
  const team = TEAMS[P.team], accent = team ? team.hex : 0xd8a23a;
  if (!body) body = { s: makeSoldier({ uniform: 0x56604c, accent, helmet: 0x3f4a3c }), gun: null, ghost: {} };
  body.s.root.visible = false;
  return body;
}

export function onDeathCam(P, killer) {
  const delay = P.respawnAt - G.now; // respawn timing is owned by match.js and never changed here
  cam = { t: 0, phase: 'fall', from: { x: G.camera.position.x, y: G.camera.position.y, z: G.camera.position.z, yaw: P.yaw, pitch: P.pitch },
    killer, deathAt: G.now, yaw: P.yaw, pitch: P.pitch, ox: P.x, oy: P.y + 1.45, oz: P.z, cx: P.x, cy: P.y + 1.45, cz: P.z, replay: null };
  const ok = G.profile.settings.killcam && killer && !killer.isPlayer && killer !== P && frames.length > 4 && frames.some((f) => f.us.some((e) => e.u === killer));
  if (ok) {
    const window = Math.min(delay, 60) - FALL - 0.45;
    if (window > 0.8) {
      const footage = Math.min(MAX_FOOTAGE, window * MAX_SPEED, G.now - frames[0].t);
      const speed = Math.max(1, (footage + TAIL) / window);
      cam.replay = { start: G.now - footage, end: G.now + TAIL, speed, t0: null, shotI: 0, saved: null };
    }
  }
}
export const killcamActive = () => !!(cam && cam.phase === 'replay');
export const deathCamActive = () => !!cam;
export function skipKillcam() { if (cam && cam.phase === 'replay') { endReplay(); cam.phase = 'free'; cam.t = 0; return true; } return false; }

function startReplay() {
  const r = cam.replay; r.t = r.start; cam.phase = 'replay';
  // remember the corpse poses so dead soldiers look the same afterwards
  r.saved = G.units.filter((u) => u.soldier).map((u) => ({ u, snap: snapPose(u.soldier) }));
  r.shotI = shots.findIndex((e) => e.t >= r.start); if (r.shotI < 0) r.shotI = shots.length;
  ensureBody(G.player);
  showTag(true);
}
function endReplay() {
  if (!cam || !cam.replay || cam.phase !== 'replay') { showTag(false); return; }
  const r = cam.replay;
  for (const { u, snap } of r.saved || []) if (u.soldier) { restorePose(u.soldier, snap); u.soldier.root.visible = true; }
  if (body) body.s.root.visible = false;
  showTag(false);
  cam.replay = null;
}
function snapPose(s) { return { px: s.pose.rotation.x, pz: s.pose.rotation.z, py: s.pose.position.y, hy: s.hips.position.y, tr: s.torso.rotation.x, ty: s.torso.rotation.y, hr: s.head.rotation.x, legs: s.legs.map((L) => [L.thigh.rotation.x, L.knee.rotation.x]), arms: s.arms.map((A) => A.sh.rotation.z), ry: s.root.position.y }; }
function restorePose(s, p) {
  s.pose.rotation.x = p.px; s.pose.rotation.z = p.pz; s.pose.position.y = p.py; s.hips.position.y = p.hy; s.torso.rotation.x = p.tr; s.torso.rotation.y = p.ty; s.head.rotation.x = p.hr;
  s.legs.forEach((L, i) => { L.thigh.rotation.x = p.legs[i][0]; L.knee.rotation.x = p.legs[i][1]; }); s.arms.forEach((A, i) => { A.sh.rotation.z = p.arms[i]; }); s.root.position.y = p.ry;
}

function showTag(on, name) {
  const el = document.getElementById('killcam'); if (!el) return;
  el.classList.toggle('hidden', !on);
  document.getElementById('hud').classList.toggle('kc-on', !!on);
  if (on && cam && cam.killer) document.getElementById('killcamName').textContent = cam.killer.name;
}

// returns true when the viewmodel should be drawn (kill cam shows the killer's gun)
export function updateDeathCam(dt, P, mdx, mdy) {
  if (!cam) return false;
  cam.t += dt;
  if (cam.phase === 'fall') {
    const t = Math.min(1, cam.t / FALL), e = 1 - Math.pow(1 - t, 3), d = cam.from;
    G.camera.position.set(d.x, lerp(d.y, P.y + 0.35, e), d.z);
    G.camera.rotation.set(lerp(d.pitch, -0.1, e), d.yaw, e * 0.5);
    setListener(d.x, P.y + 0.35, d.z, d.yaw);
    if (cam.t >= FALL) { if (cam.replay) startReplay(); else { cam.phase = 'free'; cam.t = 0; cam.yaw = d.yaw; cam.pitch = -0.1; } }
    return false;
  }
  if (cam.phase === 'replay') return replayStep(dt, P);
  freeLook(dt, P, mdx, mdy);
  return false;
}

function replayStep(dt, P) {
  const r = cam.replay;
  r.t += dt * r.speed;
  if (r.t >= r.end) { endReplay(); cam.phase = 'free'; cam.t = 0; return false; }
  const k = cam.killer;
  // pose every soldier from the recording; units not in the recording keep their live pose
  for (const u of G.units) {
    const st = sample(u, r.t);
    if (u.isPlayer) {
      const b = ensureBody(P);
      if (!st || !st.alive) continue;
      b.s.root.visible = true;
      if (st.w && st.w !== b.gun && WEAPONS[st.w] && !WEAPONS[st.w].melee) { setSoldierGun(b.s, st.w); b.gun = st.w; }
      Object.assign(b.ghost, { x: st.x, y: st.y, z: st.z, yaw: st.yaw, aimPitch: st.pitch, crouchT: st.crouchT, moveSpeed: st.speed, walkPhase: (b.ghost.walkPhase || 0) });
      poseSoldier(b.s, b.ghost, dt * r.speed);
      continue;
    }
    if (!u.soldier || !st) continue;
    if (u === k) { u.soldier.root.visible = false; continue; } // we are looking through the killer's eyes
    u.soldier.root.visible = st.alive;
    if (st.alive) { u._kcGhost = Object.assign(u._kcGhost || {}, { x: st.x, y: st.y, z: st.z, yaw: st.yaw, aimPitch: st.pitch, crouchT: st.crouchT, moveSpeed: st.speed }); poseSoldier(u.soldier, u._kcGhost, dt * r.speed); }
  }
  // killer's eyes
  const ks = sample(k, r.t);
  if (ks) {
    const eye = 1.58 - ks.crouchT * 0.5;
    G.camera.position.set(ks.x, ks.y + eye, ks.z);
    G.camera.rotation.set(ks.pitch, ks.yaw, 0);
    const w = WEAPONS[ks.w] ? ks.w : 'm4';
    if (Math.abs(G.camera.fov - G.profile.settings.fov) > 0.1) { G.camera.fov = G.profile.settings.fov; G.camera.updateProjectionMatrix(); }
    setListener(ks.x, ks.y + eye, ks.z, ks.yaw);
    // replay shots that happened up to now in the footage
    while (r.shotI < shots.length && shots[r.shotI].t <= r.t) {
      const e = shots[r.shotI++], s = e.s, mine = s.shooter === k;
      const ex = s.x, ey = s.y, ez = s.z;
      if (mine) { vmFire(w); }
      tracer(mine ? ks.x + Math.sin(-ks.yaw) * 0.0 : e.x0, mine ? ks.y + eye - 0.12 : e.y0, mine ? ks.z : e.z0, ex, ey, ez, 0xffe0a0, 420);
      if (s.k === 0 && s.w && s.w.sound) play(s.w.sound, mine ? null : { x: e.x0, y: e.y0, z: e.z0 }, { gain: mine ? 0.7 : 0.5 });
    }
    updateViewmodel(dt, { weapon: w, visible: !WEAPONS[w].melee, loaded: true, adsT: 0, sprintT: 0, bob: 0, bobAmp: 0, mdx: 0, mdy: 0, reload: -1, switchT: 1, melee: -1, meleeHeavy: false, throwT: -1, cooking: false, crouchT: ks.crouchT, pump: -1, bolt: -1 });
    return !WEAPONS[w].melee;
  }
  return false;
}

function freeLook(dt, P, mdx, mdy) {
  const s = G.profile.settings, kk = 0.0022 * s.sens;
  cam.yaw -= mdx * kk; cam.pitch = clamp(cam.pitch - mdy * kk * (s.invertY ? -1 : 1), -1.45, 1.45);
  const f = (down('forward') ? 1 : 0) - (down('back') ? 1 : 0), st = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  const up = (down('jump') ? 1 : 0) - (down('crouch') ? 1 : 0);
  if (f || st || up) {
    const sp = 4 * dt, sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    const nx = cam.cx + (-sy * f + cy * st) * sp, nz = cam.cz + (-cy * f - sy * st) * sp, ny = clamp(cam.cy + up * sp, P.y + 0.3, P.y + 5);
    const dx = nx - cam.ox, dy = ny - cam.oy, dz = nz - cam.oz, d = Math.hypot(dx, dy, dz);
    if (d <= 6 && losClear(cam.ox, cam.oy, cam.oz, nx + Math.sign(dx) * 0.25, ny, nz + Math.sign(dz) * 0.25)) { cam.cx = nx; cam.cy = ny; cam.cz = nz; }
  }
  cam.lift = damp(cam.lift || 0, 1, 4, dt);
  G.camera.position.set(cam.cx, lerp(P.y + 0.35, cam.cy, cam.lift), cam.cz);
  G.camera.rotation.set(cam.pitch, cam.yaw, 0);
  setListener(cam.cx, cam.cy, cam.cz, cam.yaw);
}

// back to normal play (respawn) or leaving the match
export function endDeathCam() { endReplay(); cam = null; if (body) body.s.root.visible = false; }
