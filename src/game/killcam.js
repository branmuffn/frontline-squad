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
import { makeSoldier, setSoldierGun, poseSoldier, setFlash, startDeath, swipe } from '../entities/soldier.js';
import * as THREE from 'three';
import { tracer, blood } from '../engine/fx.js';
import { play, setListener } from '../engine/audio.js';
import { updateViewmodel, vmFire } from '../entities/viewmodel.js';

const RATE = 0.05, KEEP = 5.5, MAX_FOOTAGE = 4, MAX_SPEED = 1.4, FALL = 0.5, TAIL = 0.35;
// final blow: the last SLOW_PRE s before the kill and SLOW_POST after play at SLOW speed
// (short respawn windows get a milder, shorter slow-down so there is still footage before it)
const SLOWS = [{ k: 0.35, pre: 0.6, post: 0.15 }, { k: 0.6, pre: 0.4, post: 0.12 }].map((q) => ({ ...q, real: (q.pre + q.post) / q.k }));
// kills where the killer's eyes don't show what happened: watch from a slow orbit around the victim instead
const ORBIT = new Set(['mortar', 'sentry', 'barrel', 'vehicle', 'roadkill', 'claws']); // claws: watch the zombie swipe
let frames = [], shots = [], nextSample = 0;
let cam = null;     // active death camera state
let body = null;    // the player's own third-person body, only shown in the kill cam

// ---- end of match: replay the play that ended it (final kill, winning capture) for every player ----
export function startFinale(ev) {
  if (!G.profile.settings.killcam || !ev || !ev.killer || !ev.victim || G.now - ev.at > 6 || frames.length < 5) return false;
  if (!frames.some((f) => f.us.some((e) => e.u === ev.killer))) return false;
  const start = Math.max(frames[0].t, ev.at - 3.2), end = Math.min(frames[frames.length - 1].t, ev.at + 0.9);
  if (end - start < 1.2) return false;
  endReplay();
  const k = ev.killer, v = ev.victim, ks = frames[frames.length - 1].us.find((e) => e.u === k);
  cam = { t: 0, phase: 'replay', killer: k, victim: v, info: { weapon: ev.weapon, headshot: ev.headshot }, deathAt: ev.at, finale: ev.label || 'Final kill',
    dist: k === v ? 0 : Math.round(Math.hypot(k.x - v.x, k.z - v.z)), khp: 0,
    replay: { start, end, speed: 1, slow: SLOWS[0], shotI: 0, saved: null, orbit: ORBIT.has(ev.weapon) || k === v || !!(ks && ks.v && k.seat !== 1), oa: Math.atan2(v.x - k.x, v.z - k.z) || 0.6 } };
  startReplay();
  return true;
}
// per frame while the finale runs; false once it is over (or skipped)
export function finaleStep(dt) {
  if (!cam || !cam.finale) return false;
  if (cam.phase === 'replay') { const vm = replayStep(dt, G.player); if (cam && cam.phase === 'replay') return vm || 1; }
  cam = null; return false;
}
export const finaleActive = () => !!(cam && cam.finale);

export function resetKillcam() { frames = []; shots = []; nextSample = 0; endReplay(); cam = null; }

// how zoomed the unit's view was: [fov factor, scoped?] (player: real ADS/zoom; joiners: their aim flags; sniper bots: aiming)
function aimView(u, id) {
  const w = WEAPONS[id]; if (!w || w.melee) return [1, 0];
  const ads = u.isPlayer ? (u.adsT || 0) : u.brain ? (w.scope && u.brain.visible && u.brain.target ? 1 : 0) : (u.adsT || 0);
  const mag = w.mags ? w.mags[Math.min(u.zoomIdx || 0, w.mags.length - 1)] : 0, zoom = mag ? 1 / mag : (w.adsZoom || 1);
  return [Math.round(lerp(1, zoom, ads * ads) * 100) / 100, w.scope && ads > 0.9 ? 1 : 0];
}
const weaponOf = (u) => u.isPlayer ? (u.weapons ? u.weapons[u.slot] : null) : (u.brain ? u.brain.weapon : u.weapon || null);

// called once per live frame, after all updates
export function recordFrame() {
  if (G.now < nextSample) return;
  nextSample = G.now + RATE;
  const us = [];
  for (const u of G.units) { const w = weaponOf(u), [fk, sc] = aimView(u, w); us.push({ u, sw: u.lastSwipe, x: u.x, y: u.y, z: u.z, yaw: u.yaw, pitch: u.isPlayer ? u.pitch : (u.aimPitch || 0), alive: u.alive, crouchT: u.crouchT || 0, speed: u.moveSpeed || 0, w, v: u.vehicle ? 1 : 0, fk, sc }); }
  frames.push({ t: G.now, us });
  while (frames.length && frames[0].t < G.now - KEEP) frames.shift();
  while (shots.length && shots[0].t < G.now - KEEP) shots.shift();
}
// called by ballistics for every bullet/pellet: s is the live shot state (its x/y/z end up at the impact)
export function recordShot(s) { if (G.match && !G.match.ended) shots.push({ t: G.now, s, x0: s.x, y0: s.y, z0: s.z, done: false }); }
// multiplayer: shots mirrored from other players (drawn as tracers only) go into the footage too
export function recordNetShot(u, w, x0, y0, z0, ex, ey, ez) { if (G.match && !G.match.ended) shots.push({ t: G.now, s: { shooter: u, w, k: 0, x: ex, y: ey, z: ez }, x0, y0, z0, done: false }); }

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
    sw: eb.sw != null ? eb.sw : ea.sw, alive: k < 0.5 ? ea.alive : eb.alive, crouchT: lerp(ea.crouchT, eb.crouchT, k), speed: lerp(ea.speed, eb.speed, k), w: ea.w, v: ea.v, fk: lerp(ea.fk || 1, eb.fk || 1, k), sc: k < 0.5 ? ea.sc : eb.sc };
}

function ensureBody(P) {
  const team = TEAMS[P.team], accent = team ? team.hex : 0xd8a23a;
  if (!body) body = { s: makeSoldier({ uniform: 0x56604c, accent, helmet: 0x3f4a3c }), gun: null, ghost: {} };
  body.s.root.visible = false;
  return body;
}

export function onDeathCam(P, killer, info = {}) {
  const delay = P.respawnAt - G.now; // respawn timing is owned by match.js and never changed here
  cam = { t: 0, phase: 'fall', from: { x: G.camera.position.x, y: G.camera.position.y, z: G.camera.position.z, yaw: P.yaw, pitch: P.pitch },
    killer, info, deathAt: G.now, yaw: P.yaw, pitch: P.pitch, dist: killer ? Math.round(Math.hypot(killer.x - P.x, killer.z - P.z)) : 0, khp: killer && killer.alive ? Math.ceil(killer.health) : 0, ox: P.x, oy: P.y + 1.45, oz: P.z, cx: P.x, cy: P.y + 1.45, cz: P.z, replay: null };
  const ok = G.profile.settings.killcam && killer && !killer.isPlayer && killer !== P && frames.length > 4 && frames.some((f) => f.us.some((e) => e.u === killer));
  if (ok) {
    const window = Math.min(delay, 60) - FALL - 0.45;
    if (window > 0.8) {
      const slow = SLOWS.find((q) => window - q.real >= 0.95) || null; // room for the slow-motion final blow?
      const footage = Math.min(MAX_FOOTAGE, (slow ? window - slow.real : window) * MAX_SPEED + (slow ? slow.pre : 0), G.now - frames[0].t);
      const speed = slow ? Math.max(1, (footage + TAIL - slow.pre - slow.post) / (window - slow.real)) : Math.max(1, (footage + TAIL) / window);
      const ks = frames[frames.length - 1].us.find((e) => e.u === killer);
      cam.replay = { start: G.now - footage, end: G.now + TAIL, speed, slow, t0: null, shotI: 0, saved: null,
        orbit: ORBIT.has(info.weapon) || !!(ks && ks.v && killer.seat !== 1), oa: Math.atan2(P.x - killer.x, P.z - killer.z) };
    }
  }
}
export const killcamActive = () => !!(cam && cam.phase === 'replay');
export const deathCamActive = () => !!cam;
// tests: replay time, victim hold/fall state, body + slug visibility
export const kcDebug = () => { const r = cam && cam.phase === "replay" && cam.replay; return r ? { t: r.t, hitT: r.hitT, fell: r.fell, body: !!(body && body.s.root.visible), slug: !!(slug && slug.visible), flight: r.flight, vp: cam.victim === G.player, end: r.end, st: sample(G.player, r.t), dA: cam.deathAt, orbit: !!r.orbit } : null; };
export function skipKillcam() { if (cam && cam.phase === 'replay') { endReplay(); cam.phase = 'free'; cam.t = 0; return true; } return false; }

function startReplay() {
  const r = cam.replay; r.t = r.start; cam.phase = 'replay';
  // remember the corpse poses so dead soldiers look the same afterwards
  r.saved = G.units.filter((u) => u.soldier).map((u) => ({ u, snap: snapPose(u.soldier) }));
  r.shotI = shots.findIndex((e) => e.t >= r.start); if (r.shotI < 0) r.shotI = shots.length;
  // the round that did it: shown as a glowing slug (slow motion while it flies; long shots get a bullet-follow camera)
  const kill = cam.killer && !ORBIT.has((cam.info || {}).weapon) ? shots.filter((e) => e.s.shooter === cam.killer && e.s.k === 0 && e.t <= cam.deathAt + 0.06 && e.t >= r.start).pop() : null;
  if (kill) { const d = Math.hypot(kill.s.x - kill.x0, kill.s.y - kill.y0, kill.s.z - kill.z0); r.kill = kill; r.flight = Math.max(0.16, d / 140); r.bulletCam = d > 22; r.end = Math.max(r.end, kill.t + r.flight + 0.8); }
  // the victim stays up until the round lands (+ a short beat), then falls: footage timing ≠ slug flight timing
  r.hitT = (kill ? kill.t + r.flight : cam.deathAt) + 0.08; r.fell = false;
  ensureBody(G.player);
  showTag(true);
}
function endReplay() {
  if (!cam || !cam.replay || cam.phase !== 'replay') { showTag(false); return; }
  const r = cam.replay;
  for (const { u, snap } of r.saved || []) if (u.soldier) { restorePose(u.soldier, snap); u.soldier.root.visible = true; if (u === cam.victim) setFlash(u.soldier, 0); }
  if (body) { body.s.root.visible = false; setFlash(body.s, 0); }
  if (slug) slug.visible = false;
  G.camera.fov = G.profile.settings.fov; G.camera.updateProjectionMatrix(); document.getElementById('scope').classList.remove('on');
  showTag(false);
  cam.replay = null;
}
function snapPose(s) { return { dT: s.deathT, px: s.pose.rotation.x, pz: s.pose.rotation.z, py: s.pose.position.y, hy: s.hips.position.y, tr: s.torso.rotation.x, ty: s.torso.rotation.y, hr: s.head.rotation.x, legs: s.legs.map((L) => [L.thigh.rotation.x, L.knee.rotation.x]), arms: s.arms.map((A) => A.sh.rotation.z), ry: s.root.position.y }; }
function restorePose(s, p) {
  if (p.dT !== undefined) s.deathT = p.dT;
  s.pose.rotation.x = p.px; s.pose.rotation.z = p.pz; s.pose.position.y = p.py; s.hips.position.y = p.hy; s.torso.rotation.x = p.tr; s.torso.rotation.y = p.ty; s.head.rotation.x = p.hr;
  s.legs.forEach((L, i) => { L.thigh.rotation.x = p.legs[i][0]; L.knee.rotation.x = p.legs[i][1]; }); s.arms.forEach((A, i) => { A.sh.rotation.z = p.arms[i]; }); s.root.position.y = p.ry;
}

function showTag(on, name) {
  const el = document.getElementById('killcam'); if (!el) return;
  el.classList.toggle('hidden', !on);
  document.getElementById('hud').classList.toggle('kc-on', !!on);
  const tagB = document.querySelector('#killcam .kc-tag b'); if (tagB) tagB.textContent = cam && cam.finale ? cam.finale : 'Kill cam';
  if (on && cam && cam.killer) {
    const i = cam.info || {}, wl = WEAPONS[i.weapon] ? WEAPONS[i.weapon].name : String(i.weapon || '').toUpperCase();
    document.getElementById('killcamName').textContent = cam.killer.name;
    document.getElementById('killcamInfo').textContent = [wl, i.headshot ? 'headshot' : '', cam.dist ? cam.dist + ' m' : '', cam.khp ? cam.khp + ' HP left' : ''].filter(Boolean).join(' · ');
  }
  if (!on) document.getElementById('killcam').classList.remove('slow');
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

function victimFall(s, ghost, dt) {
  const r = cam.replay;
  s.root.visible = true; setFlash(s, 0.4 + 0.15 * Math.sin(G.realTime * 8), 0xff3a28);
  if (!r.fell) { r.fell = true; startDeath(s, true); }
  poseSoldier(s, ghost, dt);
}
function replayStep(dt, P) {
  const r = cam.replay;
  const q = r.slow, inSlow = !!q && r.t >= cam.deathAt - q.pre && r.t < Math.max(cam.deathAt + q.post, r.kill ? r.kill.t + r.flight + 0.05 : 0);
  r.t += dt * (inSlow ? q.k : r.speed);
  document.getElementById('killcam').classList.toggle('slow', !!inSlow);
  if (r.t >= r.end) { endReplay(); cam.phase = 'free'; cam.t = 0; return false; }
  const k = cam.killer, sp = inSlow ? q.k : r.speed;
  // pose every soldier from the recording; units not in the recording keep their live pose
  for (const u of G.units) {
    let st = sample(u, r.t);
    const isV = u === cam.victim || (u.isPlayer && !cam.victim && !cam.finale); // own death: the victim is you
    if (isV && st && !st.alive && r.t < r.hitT) { const a = sample(u, Math.min(r.t, cam.deathAt - 0.06)); if (a && a.alive) st = a; }
    if (u.isPlayer) {
      const b = ensureBody(P);
      if (isV && st && !st.alive && r.t >= r.hitT && !(u === k && !r.orbit)) { victimFall(b.s, b.ghost, dt * sp); continue; }
      if (isV && st && st.alive) b.s.deathT = -1;
      if (!st || !st.alive || (u === k && !r.orbit)) continue; // (finale: we may be looking through our own eyes)
      b.s.root.visible = true;
      if (st.w && st.w !== b.gun && WEAPONS[st.w] && !WEAPONS[st.w].melee) { setSoldierGun(b.s, st.w); b.gun = st.w; }
      Object.assign(b.ghost, { x: st.x, y: st.y, z: st.z, yaw: st.yaw, aimPitch: st.pitch, crouchT: st.crouchT, moveSpeed: st.speed, walkPhase: (b.ghost.walkPhase || 0) });
      poseSoldier(b.s, b.ghost, dt * sp);
      setFlash(b.s, cam.victim === u ? 0.4 + 0.15 * Math.sin(G.realTime * 8) : 0, 0xff3a28); // the victim, in red
      continue;
    }
    if (!u.soldier || !st) continue;
    if (u === k && !r.orbit) { u.soldier.root.visible = false; continue; } // we are looking through the killer's eyes
    if (isV && !st.alive && r.t >= r.hitT) { u.soldier.root.visible = true; victimFall(u.soldier, u._kcGhost || {}, dt * sp); continue; }
    u.soldier.root.visible = st.alive;
    if (st.alive && u.soldier.deathT >= 0) u.soldier.deathT = -1; // alive in the footage: no death pose (restored afterwards)
    if (u === cam.victim) setFlash(u.soldier, 0.4 + 0.15 * Math.sin(G.realTime * 8), 0xff3a28);
    if (st.sw != null && u.soldier) { const ago = r.t - st.sw; if (ago >= 0 && ago < 0.45 && u._kcSw !== st.sw) { u._kcSw = st.sw; swipe(u.soldier); } }
    if (st.alive) { u._kcGhost = Object.assign(u._kcGhost || {}, { x: st.x, y: st.y, z: st.z, yaw: st.yaw, aimPitch: st.pitch, crouchT: st.crouchT, moveSpeed: st.speed }); poseSoldier(u.soldier, u._kcGhost, dt * sp); }
  }
  if (r.orbit) return orbitStep(dt, P, r, sp);
  // killer's eyes (lightly smoothed: the footage is 20 Hz)
  const ks = sample(k, r.t);
  if (ks) {
    const eye = 1.58 - ks.crouchT * 0.5;
    if (!r.sm) r.sm = { x: ks.x, y: ks.y + eye, z: ks.z, yaw: ks.yaw, pitch: ks.pitch };
    const a = 1 - Math.exp(-dt * 25), m = r.sm;
    m.x += (ks.x - m.x) * a; m.y += (ks.y + eye - m.y) * a; m.z += (ks.z - m.z) * a;
    m.yaw += Math.atan2(Math.sin(ks.yaw - m.yaw), Math.cos(ks.yaw - m.yaw)) * a; m.pitch += (ks.pitch - m.pitch) * a;
    G.camera.position.set(m.x, m.y, m.z);
    G.camera.rotation.set(m.pitch, m.yaw, 0);
    const w = WEAPONS[ks.w] ? ks.w : 'm4';
    const fov = G.profile.settings.fov * (ks.fk || 1); // their zoom: iron sights, 2x, 4x or 8x scope
    const flying = slugStep(r), bcam = flying && r.bulletCam;
    if (bcam) { // follow the round
      const e = r.kill, dx = e.s.x - e.x0, dy = e.s.y - e.y0, dz = e.s.z - e.z0, L = Math.hypot(dx, dy, dz) || 1;
      G.camera.position.set(slug.position.x - dx / L * 1.3, slug.position.y - dy / L * 1.3 + 0.12, slug.position.z - dz / L * 1.3);
      G.camera.lookAt(e.s.x, e.s.y, e.s.z);
    }
    const f2 = bcam ? G.profile.settings.fov * 0.8 : fov; if (Math.abs(G.camera.fov - f2) > 0.1) { G.camera.fov = f2; G.camera.updateProjectionMatrix(); }
    document.getElementById('scope').classList.toggle('on', !!ks.sc && !bcam);
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
    return !WEAPONS[w].melee && !(ks.sc && !bcam) && !bcam;
  }
  return false;
}

// third-person view circling the victim (sentry, mortar, barrel and vehicle kills), walls pull the camera in
function orbitStep(dt, P, r, sp) {
  const V = cam.victim || P, v = sample(V, r.t) || { x: V.x, y: V.y, z: V.z };
  r.oa += dt * sp * 0.35;
  const R = 7, cx = v.x + Math.sin(r.oa) * R, cz = v.z + Math.cos(r.oa) * R, cy = v.y + 4.2;
  let px = cx, py = cy, pz = cz;
  for (let f = 1; f > 0.2 && !losClear(v.x, v.y + 1.4, v.z, px, py, pz); f -= 0.15) { px = v.x + (cx - v.x) * f; py = v.y + 1.4 + (cy - v.y - 1.4) * f; pz = v.z + (cz - v.z) * f; }
  G.camera.position.set(px, py, pz);
  G.camera.lookAt(v.x, v.y + 1.0, v.z);
  setListener(px, py, pz, G.camera.rotation.y);
  while (r.shotI < shots.length && shots[r.shotI].t <= r.t) {
    const e = shots[r.shotI++], s = e.s;
    tracer(e.x0, e.y0, e.z0, s.x, s.y, s.z, 0xffe0a0, 420);
    if (s.k === 0 && s.w && s.w.sound) play(s.w.sound, { x: e.x0, y: e.y0, z: e.z0 }, { gain: 0.5 });
  }
  return false;
}

// the killing round: a bright slug that flies (in replay time) from the muzzle to the hit, then a burst of blood
let slug = null;
function slugStep(r) {
  const e = r.kill; if (!e || r.t < e.t) { if (slug) slug.visible = false; return false; }
  const k = (r.t - e.t) / r.flight;
  if (!slug) { slug = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 1, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); G.scene.add(slug); }
  if (k >= 1) { if (slug.visible) { slug.visible = false; const dx = e.s.x - e.x0, dz = e.s.z - e.z0, L = Math.hypot(dx, dz) || 1; blood(e.s.x, e.s.y, e.s.z, dx / L, dz / L, !!(cam.info && cam.info.headshot)); blood(e.s.x, e.s.y, e.s.z, dx / L, dz / L, true); } return false; }
  const x = e.x0 + (e.s.x - e.x0) * k, y = e.y0 + (e.s.y - e.y0) * k, z = e.z0 + (e.s.z - e.z0) * k;
  slug.visible = true; slug.position.set(x, y, z); slug.lookAt(e.s.x, e.s.y, e.s.z); slug.scale.set(1, 1, Math.min(0.9, 0.25 + k * 2));
  return true;
}

function freeLook(dt, P, mdx, mdy) {
  const s = G.profile.settings, kk = 0.0022 * s.sens;
  cam.yaw -= mdx * kk; cam.pitch = clamp(cam.pitch - mdy * kk * (s.invertY ? -1 : 1), -1.45, 1.45);
  const f = (down('forward') ? 1 : 0) - (down('back') ? 1 : 0), st = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  const up = (down('jump') ? 1 : 0) - (down('crouch') ? 1 : 0);
  // out until the next round (Search & Destroy): fly anywhere, through walls, at speed
  if (P.respawnAt > 1e8) {
    if (f || st || up) {
      const sp = (down('sprint') ? 24 : 10) * dt, sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), cp = Math.cos(cam.pitch);
      cam.cx += (-sy * cp * f + cy * st) * sp; cam.cz += (-cy * cp * f - sy * st) * sp;
      cam.cy = clamp(cam.cy + (Math.sin(cam.pitch) * f + up) * sp, -5, 80);
    }
    cam.lift = 1;
    G.camera.position.set(cam.cx, cam.cy, cam.cz);
    G.camera.rotation.set(cam.pitch, cam.yaw, 0);
    setListener(cam.cx, cam.cy, cam.cz, cam.yaw);
    return;
  }
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
