// Multiplayer session (Phase 7). Host-authoritative: the host's game runs the match, bots and rules; clients run
// their own movement and shooting locally (no input lag), claim their hits (shooter-favoured lag compensation), and
// render everyone else from 30 Hz snapshots interpolated 100 ms in the past. Explosives, pickups, doors, barrels,
// drops, deaths and respawns are decided by the host.
import { G } from '../core/state.js';
import { WEAPONS, PHYS, UNIFORMS, ACCENTS, TEAMS, SKINS, skinLook, OPERATORS, operatorLook } from '../core/config.js';
import { makeUnit, isEnemy, noise, damage } from '../entities/units.js';
import { makeSoldier, setSoldierGun, startDeath, disposeSoldier, animateSoldier, setFlash } from '../entities/soldier.js';
import { spawnPlayer, onPlayerDeath, refillAmmo, pickupAmmo, takeWeapon, pickupSlot } from '../entities/player.js';
import { throwGrenade } from '../entities/grenades.js';
import { fireRocket } from '../entities/projectiles.js';
import { damageBarrel, killBarrel, dropWeapon, drops, removeDrop } from '../entities/worldprops.js';
import { pickups } from '../entities/pickups.js';
import { toggleDoor } from '../world/doors.js';
import { rayWorld } from '../world/physics.js';
import { tracer, enemyFlash } from '../engine/fx.js';
import { play } from '../engine/audio.js';
import * as hud from '../ui/hud.js';
import { awardKill } from '../game/progression.js';
import { pickSpawn, endMatch } from '../game/match.js';
import { hostRoom, joinRoom, manualInvite, manualReply, routeOf } from './transport.js';
import * as chat from '../ui/chat.js';
import { vehSnap, vehApplySnap, vehInterp, vehLocal, vehHostApply, vehHostMsg, vehOk, vehRequest } from './netveh.js';
import { vehicles } from '../entities/vehicles.js';
import { placeClaymore, netClaymore } from '../entities/gear.js';
import { onDeathCam, recordNetShot } from '../game/killcam.js';
import { checkStreak, netStreak, netSentryShot, remoteUseStreak, remoteOpenCrate, remoteChopperDamage, grantStreak, refillPlayer } from '../entities/streaks.js';

export const MAX_PLAYERS = 8;
export const MP_MODES = ['survival', 'zombies', 'ffa', 'tdm'];
export const COOP = (mode) => mode === 'survival' || mode === 'zombies';
export const BUILD = (typeof window !== 'undefined' && window.__BUILD) || 'dev build';
const VER = 1, SNAP_DT = 1 / 30, INTERP = 0.1;
const WIDS = Object.keys(WEAPONS);
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const clean = (s) => String(s || '').replace(/[^\w \-.]/g, '').trim().slice(0, 14).toUpperCase() || 'PLAYER';

// session; G.mp points at it while a multiplayer lobby or match is open
const S = {
  role: null, host: false, client: false, live: false, name: 'PLAYER', cb: null, ui: null, skin: null, ready: false, pgAcc: 0,
  remotes: [], nextSlot: 1, room: null, invite: null, link: null, cfg: null,
  // client side
  uid: 0, proxies: new Map(), offset: 0, haveClock: false, sendAcc: 0, pingAcc: 0, rtt: 0, seq: 0, mstr: '',
  // host side
  snapAcc: 0, shots: [], rosterKey: '', replay: false, dropKey: 0,
};
export const session = S;
const now = () => performance.now() / 1000;

// ---------------- lobby ----------------
export function init(cb) { S.cb = cb; }
export function setUi(ui) { S.ui = ui; }
function status(msg, kind) { if (S.ui) S.ui.status(msg, kind); }
function players() {
  if (S.host) return [{ name: S.name, slot: 0, ping: 0, host: true, ready: true }].concat(S.remotes.filter((r) => r.hello).map((r) => ({ name: r.name, slot: r.slot, ping: Math.round(r.rtt * 1000), ready: r.ready, route: r.route })));
  return S.lobby || [];
}
function refreshUi() { if (S.ui) S.ui.players(players(), S.host ? S.cfg : S.lobbyCfg); }

const cleanSkin = (k) => { k = k || {}; const pick = (list, id) => (list.find((e) => e[0] === id) || list[0])[0]; return { uniform: pick(SKINS.uniform, k.uniform), pattern: pick(SKINS.pattern, k.pattern), helmet: pick(SKINS.helmet, k.helmet), op: OPERATORS.some((o) => o.id === k.op) ? k.op : 'rex' }; };
export function setSkin(k) { S.skin = cleanSkin(k); if (S.client && S.link) S.link.send({ t: 'skin', k: S.skin }); }
export function hostOpen(name, cfg, skin) {
  leave(true);
  Object.assign(S, { role: 'host', host: true, client: false, name: clean(name), cfg, remotes: [], nextSlot: 1, skin: cleanSkin(skin || S.skin) });
  chat.reset();
  G.mp = S;
  status('Opening room…');
  if ((window.__NET_OPTS || {}).nobroker) { status('Room ready (manual codes only).', 'ok'); refreshUi(); return; }
  S.room = hostRoom(addLink, (st, v) => {
    if (st === 'ready') { status('Room open. Share the code; your friend presses Join and types it.', 'ok'); if (S.ui) S.ui.code(v); }
    else status(v + ' (Manual codes still work.)', 'warn');
  });
  refreshUi();
}
export function hostCfg(cfg) { S.cfg = cfg; if (S.host) { bcast({ t: 'lobby', p: players(), cfg }); refreshUi(); } }
export async function hostInvite() {
  if (!S.host) return null;
  if (S.invite) S.invite.close();
  S.invite = await manualInvite();
  return S.invite.code;
}
export async function hostAccept(reply) {
  const inv = S.invite; if (!inv) throw new Error('Make an invite code first.');
  status('Connecting…');
  const L = await inv.accept(reply); S.invite = null; addLink(L);
}
function addLink(L) {
  if (!S.host || S.remotes.length >= MAX_PLAYERS - 1 || S.live) { L.send({ t: 'full', why: S.live ? 'Match in progress. Try again when it ends.' : 'Room is full.' }); setTimeout(() => L.close(), 500); return; }
  const r = { link: L, slot: S.nextSlot++, name: 'PLAYER', rtt: 0, buf: [], unit: null, seq: 0, hello: false, ready: false, skin: cleanSkin(null), route: '', chatT: -9, team: 0 };
  if (L.pc) setTimeout(() => routeOf(L.pc).then((k) => { r.route = k; refreshUi(); bcast({ t: 'lobby', p: players(), cfg: S.cfg }); }), 1500);
  S.remotes.push(r);
  L.onmsg = (m) => hostMsg(r, m);
  L.onclose = () => dropRemote(r, 'left');
  r.pingT = setInterval(() => L.send({ t: 'pi', c: now() }), 1000);
}
function dropRemote(r, why) {
  const i = S.remotes.indexOf(r); if (i < 0) return;
  S.remotes.splice(i, 1); clearInterval(r.pingT);
  if (r.unit) removeRemoteUnit(r);
  if (r.hello) { const msg = `${r.name} ${why === 'left' ? 'left the game' : why === 'kicked' ? 'was removed by the host' : 'was disconnected'}`; hud.notice(msg); chat.add('', msg, 'sys'); bcast({ t: 'chat', n: '', m: msg, k: 'sys' }); }
  status(`${r.name} left.`, 'warn');
  bcast({ t: 'lobby', p: players(), cfg: S.cfg });
  refreshUi();
}
function bcast(o, except) { for (const r of S.remotes) if (r !== except && r.hello) r.link.send(o); }
function bcastFast(o) { for (const r of S.remotes) if (r.hello) r.link.sendFast(o); }

// host: remove a player from the room
export function kick(slot) {
  const r = S.remotes.find((x) => x.slot === slot); if (!S.host || !r) return;
  r.link.send({ t: 'kicked' }); dropRemote(r, 'kicked'); setTimeout(() => r.link.close(), 300);
}
// joiner: ready toggle (the host starts once everyone is ready)
export function setReady(on) { S.ready = !!on; if (S.client && S.link) S.link.send({ t: 'ready', on: S.ready }); }
// chat: everyone sees every message (lobby and in match). The host relays and rate-limits.
export function sendChat(text, team) {
  const m = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120); if (!m || !S.role) return;
  if (S.host) {
    const k = /^\/kick\s+(.+)$/i.exec(m); if (k) { const r = S.remotes.find((x) => x.name === clean(k[1])); if (r) kick(r.slot); else chat.add('', 'No player called ' + clean(k[1]), 'sys'); return; }
    const tm = G.player ? G.player.team : 0;
    chat.add(S.name, m, 'me', !!team); for (const r of S.remotes) if (r.hello && (!team || (r.unit && r.unit.team === tm))) r.link.send({ t: 'chat', n: S.name, m, tm, tt: team ? 1 : 0 });
  } else if (S.link) { chat.add(S.name, m, 'me', !!team); S.link.send({ t: 'chat', m, tt: team ? 1 : 0 }); }
}
export async function joinCode(name, code, skin) {
  leave(true);
  Object.assign(S, { role: 'client', host: false, client: true, name: clean(name), skin: cleanSkin(skin || S.skin), ready: false }); chat.reset();
  G.mp = S;
  status('Joining room ' + code.toUpperCase() + '…');
  const p = joinRoom(code); S.pending = p;
  try { attach(await p); } catch (e) { status(e.message, 'warn'); throw e; }
}
export async function joinManual(name, invite, skin) {
  leave(true);
  Object.assign(S, { role: 'client', host: false, client: true, name: clean(name), skin: cleanSkin(skin || S.skin), ready: false }); chat.reset();
  G.mp = S;
  const r = await manualReply(invite); S.reply = r;
  r.link.then(attach).catch((e) => status(e.message, 'warn'));
  status('Send this reply code to the host. It connects when they paste it.');
  return r.code;
}
function attach(L) {
  S.link = L; S.lobby = [];
  L.onmsg = clientMsg;
  L.onclose = () => { const was = S.live; status('Disconnected from the host.', 'warn'); S.link = null; if (was) { S.live = false; S.cb.abort('Connection to the host was lost.'); } refreshUi(); };
  L.send({ t: 'hello', name: S.name, v: VER, k: S.skin, b: BUILD });
  status('Connected. Waiting for the host to start…', 'ok');
}

export function leave(silent) {
  if (S.live && S.cb) { S.live = false; }
  if (S.link) { S.link.send({ t: 'bye' }); const l = S.link; S.link = null; setTimeout(() => l.close(), 200); }
  for (const r of S.remotes) { r.link.send({ t: 'closed' }); clearInterval(r.pingT); const l = r.link; setTimeout(() => l.close(), 200); }
  S.remotes = [];
  if (S.room) { S.room.close(); S.room = null; }
  if (S.invite) { S.invite.close(); S.invite = null; }
  if (S.pending && S.pending.cancel) S.pending.cancel();
  if (S.reply) { if (!S.link) S.reply.close(); S.reply = null; }
  clearProxies();
  Object.assign(S, { role: null, host: false, client: false, live: false });
  if (G.mp === S) G.mp = null;
  if (!silent) status('');
}

// ---------------- match start / end ----------------
const joined = () => S.remotes.filter((r) => r.hello);
export const notReady = () => joined().filter((r) => !r.ready).map((r) => r.name);
export const canStart = () => S.host && joined().length > 0 && !notReady().length && MP_MODES.includes(S.cfg.mode);
// teams are dealt when the match starts: TDM alternates by join order (host first), so sides stay even
function dealTeams(mode) {
  joined().sort((a, b) => a.slot - b.slot).forEach((r, i) => { r.team = COOP(mode) ? 0 : mode === 'tdm' ? (S.cfg.sameTeam ? 0 : (i + 1) % 2) : 100 + r.slot; });
}
export function lookFor(team, slot, mode, skin) {
  const k = skin ? skinLook(skin) : null;
  if (mode === 'tdm') { const t = team === 0 ? { uniform: 0x5f6a52, accent: TEAMS[0].hex, helmet: 0x4a5340 } : { uniform: 0x3a3f44, accent: TEAMS[1].hex, helmet: 0x26292b }; if (k) Object.assign(t, operatorLook(skin.op), { helmet: k.helmet }); return t; }
  if (COOP(mode)) return k ? { ...k, accent: TEAMS[0].hex } : { uniform: 0x5f6a52, accent: TEAMS[0].hex, helmet: 0x4a5340 };
  const base = { uniform: UNIFORMS[(slot + 3) % UNIFORMS.length], accent: ACCENTS[(slot + 2) % ACCENTS.length], helmet: 0x3b4034 };
  return k ? { ...k, accent: base.accent } : base;
}
export function hostStart() {
  if (!canStart()) return false;
  const cfg = { ...S.cfg, streakKills: { ...((G.profile.streaks || {}).kills || {}) } }; // the host's killstreak kill counts apply to everyone
  dealTeams(cfg.mode);
  S.live = true; S.shots = []; S.rosterKey = ''; S.snapAcc = 0;
  S.cb.deploy(cfg);         // startMatch → makeRemoteUnits + spawnRemote
  for (const r of S.remotes) if (r.unit) r.link.send({ t: 'start', cfg, uid: r.unit.id, team: r.unit.team, sp: spawnOf(r.unit), seq: r.seq, hostName: S.name });
  sendRoster(true);
  return true;
}
const spawnOf = (u) => ({ x: u.x, y: u.y, z: u.z, yaw: u.yaw });
// called by startMatch on the host: one unit per connected player (bots count is adjusted by match.js)
export function remoteTeams() { return joined().map((r) => r.team); }
export function makeRemoteUnits(mode) {
  const out = [];
  for (const r of S.remotes) {
    if (!r.hello) continue;
    const team = r.team, look = lookFor(team, r.slot, mode, r.skin);
    const u = makeUnit({ name: r.name, team, remote: true, human: true, maxHealth: 100, health: 100 });
    u.look = look; u.weapon = 'm4'; u.rec = r;
    u.soldier = makeSoldier({ ...look, weapon: 'm4', style: 'soldier' }); u.soldier.root.visible = false;
    r.unit = u; r.buf = []; G.units.push(u); out.push(u);
  }
  return out;
}
export function spawnRemote(u, sp, notify = true) {
  Object.assign(u, { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw, vx: 0, vz: 0, vy: 0, alive: true, health: u.maxHealth, grounded: true, crouch: false, crouchT: 0, prone: false, h: PHYS.standH, protectUntil: G.now + 2.2, streak: 0 });
  u.damagers.clear();
  const s = u.soldier; s.deathT = -1; s.root.visible = true; s.root.position.set(sp.x, sp.y, sp.z); s.pose.rotation.set(0, 0, 0);
  const r = u.rec; r.seq++; r.buf = [];
  if (notify) r.link.send({ t: 'spawn', ...spawnOf(u), seq: r.seq });
}
function removeRemoteUnit(r) {
  const u = r.unit; r.unit = null;
  disposeSoldier(u.soldier);
  const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1);
}
// Host ends (endMatch hook) or quits: tell everyone
export function hostEnded(reason) {
  if (!S.host || !S.live) return;
  const f = G.match && G.match.finalEvent;
  bcast({ t: 'end', reason, m: matchFields(), fk: f && f.killer && f.victim ? { k: f.killer.id, v: f.victim.id, t: r3(f.at), w: f.weapon, h: f.headshot ? 1 : 0, l: f.label || '' } : null });
  S.live = false;
}
export function hostAbort() { if (S.host && S.live) { bcast({ t: 'abort' }); S.live = false; for (const r of S.remotes) if (r.unit) removeRemoteUnit(r); } }
export function clientQuit() { if (S.client && S.live) { S.link && S.link.send({ t: 'quit' }); S.live = false; clearProxies(); } }
S.cleanup = () => { for (const r of S.remotes) if (r.unit) removeRemoteUnit(r); clearProxies(); };
export function afterMatch() { if (S.host) for (const r of S.remotes) if (r.unit) removeRemoteUnit(r); clearProxies(); }

// ---------------- hooks called from game code (G.mp.*) ----------------
const unitById = (id) => { if (S.host) return G.units.find((u) => u.id === id) || null; if (id === S.uid) return G.player; return S.proxies.get(id) || null; };
// client: every damage call lands here; only our own non-explosive hits on others are claimed with the host
S.clientDamage = (victim, amount, attacker, info) => {
  if (!S.live || !victim.alive) return 0;
  if (victim === G.player && !attacker && info.weapon === 'fall') { S.link.send({ t: 'self', a: r2(amount), w: 'fall' }); return amount; }
  if (attacker !== G.player || !victim.proxy || info.explosive || !isEnemy(attacker, victim)) return 0;
  if (victim.protectUntil > G.now) return 0;
  S.link.send({ t: 'hit', id: victim.hid, a: r2(amount), w: info.weapon, z: info.zone, h: !!info.headshot, m: !!info.melee, d: r2(info.dist || 0) });
  hud.hitMarker(info.headshot ? 'head' : 'hit');
  play(info.headshot ? 'headshot' : 'hit', null, { important: true });
  G.match.stats.damage += amount;
  if (victim.soldier) { victim.soldier.flinch = Math.min(1, victim.soldier.flinch + 0.5); victim.flashUntil = G.realTime + 0.09; }
  return amount;
};
// host: a remote player took damage / landed an explosive hit
S.hurt = (victim, dmg, info, attacker) => {
  if (victim.remote && victim.rec) victim.rec.link.send({ t: 'hurt', a: r2(dmg), sx: r2(info.sx ?? (attacker ? attacker.x : victim.x)), sz: r2(info.sz ?? (attacker ? attacker.z : victim.z)), hp: Math.ceil(victim.health) });
  if (attacker && attacker.remote && attacker.rec && attacker !== victim && info.explosive) attacker.rec.link.send({ t: 'hm', k: victim.health <= 0 ? 'kill' : 'hit' });
};
S.onKill = (credited, victim, info) => {
  bcast({ t: 'kill', k: credited ? credited.id : 0, v: victim.id, w: info.weapon, h: !!info.headshot, ra: r2(victim.respawnAt || 0) });
};
S.shot = (u, wid, mx, my, mz, ex, ey, ez) => {
  if (!S.live || S.replay) return;
  const rec = [u.id, WIDS.indexOf(wid), r2(mx), r2(my), r2(mz), r2(ex), r2(ey), r2(ez)];
  if (S.host) S.shots.push(rec); else S.link.sendFast({ t: 'sh', s: rec });
};
// host & client: grenades / rockets spawned locally are mirrored on the others
S.spawnEv = (kind, owner, a, gk) => {
  if (!S.live || S.replay || !owner) return;
  const msg = { t: kind, o: owner.id, a: a.map(r3), k: gk || undefined };
  if (S.host) bcast(msg, owner.remote ? owner.rec : null); else if (owner === G.player) S.link.send(msg);
};
S.door = (i) => { if (S.client && S.live) S.link.send({ t: 'door', i }); };
S.barrel = (c, dmg) => { if (S.client && S.live) S.link.send({ t: 'brl', i: (G.world.barrelCols || []).indexOf(c), a: r2(dmg) }); };
S.dropAdded = (d) => { if (S.host && S.live && !S.replay) { d.key = ++S.dropKey; bcast({ t: 'dr+', k: d.key, id: d.id, p: [r2(d.x), r2(d.y), r2(d.z)] }); } };
S.dropRemoved = (d) => { if (S.host && S.live && d.key) bcast({ t: 'dr-', k: d.key }); };
S.take = (d) => { S.link.send({ t: 'take', k: d.key }); };
S.toRemote = (u, msg) => { if (u.rec) u.rec.link.send(msg); };
S.banner = (a, b, s) => { if (S.host && S.live) bcast({ t: 'bn', a, b, s }); };
S.bcast = (o) => bcast(o);
S.send = (o) => { if (S.link) S.link.send(o); };

// ---------------- host: messages from a client ----------------
function hostMsg(r, m) {
  const u = r.unit;
  switch (m.t) {
    case 'hello':
      if (m.v !== VER) { r.link.send({ t: 'full', why: 'Version mismatch: both players need the same game file.' }); setTimeout(() => r.link.close(), 500); return; }
      r.name = clean(m.name); r.hello = true; r.skin = cleanSkin(m.k);
      if (m.b && m.b !== BUILD) { const w = `${clean(m.name)} is on ${m.b}, you are on ${BUILD}. Everyone should reload the same link.`; status(w, 'warn'); r.link.send({ t: 'chat', n: '', m: w, k: 'sys' }); }
      { let n = 2; const base = r.name; while ([S.name, ...S.remotes.filter((x) => x !== r && x.hello).map((x) => x.name)].includes(r.name)) r.name = (base.slice(0, 12) + n++); }
      r.link.send({ t: 'welcome', slot: r.slot });
      status(`${r.name} joined.`, 'ok'); play('pickup');
      bcast({ t: 'lobby', p: players(), cfg: S.cfg }); refreshUi(); return;
    case 'pi': r.link.send({ t: 'po', c: m.c }); return;
    case 'po': r.rtt = r.rtt ? r.rtt * 0.7 + (now() - m.c) * 0.3 : now() - m.c; return;
    case 'bye': dropRemote(r, 'left'); return;
    case 'ready': r.ready = !!m.on; bcast({ t: 'lobby', p: players(), cfg: S.cfg }); refreshUi(); return;
    case 'skin': r.skin = cleanSkin(m.k); return;
    case 'chat': {
      const t = now(); if (t - r.chatT < 0.4) return; r.chatT = t;
      const msg = String(m.m || '').replace(/\s+/g, ' ').trim().slice(0, 120); if (!msg) return;
      const team = !!m.tt && !!u && !!(G.match && G.match.teams), mate = u && G.player && u.team === G.player.team && G.match && G.match.teams;
      if (!team || mate) chat.add(r.name, msg, mate ? 'ally' : '', team);
      for (const o of S.remotes) if (o !== r && o.hello && (!team || (o.unit && o.unit.team === u.team))) o.link.send({ t: 'chat', n: r.name, m: msg, tm: u ? u.team : 0, tt: team ? 1 : 0 });
      return;
    }
    case 'quit': if (u) { removeRemoteUnit(r); hud.notice(`${r.name} left the match`); } return;
  }
  if (!S.live || !u) return;
  switch (m.t) {
    case 'st': if (m.q === r.seq) { r.buf.push(m); if (r.buf.length > 20) r.buf.shift(); } break;
    case 'hit': {
      const v = unitById(m.id), w = WEAPONS[m.w];
      const road = m.w === 'roadkill' && u.vehicle && u.seat === 0; // run over by a joiner's jeep
      if (!v || !v.alive || !u.alive || !(w || road) || !(m.a > 0) || m.a > 1000) break;
      if (Math.hypot(v.x - u.x, v.z - u.z) > (road ? 7 : (w.range || 3) + 8)) break;
      damage(v, m.a, u, { weapon: m.w, zone: m.z, headshot: m.h, melee: m.m, dist: m.d, sx: u.x, sz: u.z, claim: true });
      break;
    }
    case 'self': if (u.alive) damage(u, Math.min(999, m.a), null, { weapon: 'fall', claim: true }); break;
    case 'sh': replayShot(m.s, r); break;
    case 'gr': case 'rk': replaySpawn(m, u); bcast(m, r); break;
    case 'door': { const d = G.world.doors && G.world.doors[m.i]; if (d) toggleDoor(d); break; }
    case 'brl': { const c = (G.world.barrelCols || [])[m.i]; if (c && m.a > 0 && m.a < 500) damageBarrel(c, m.a, u); break; }
    case 'take': {
      const d = drops.find((x) => x.key === m.k);
      if (!d || !u.alive || Math.hypot(d.x - u.x, d.z - u.z) > 2.5) { r.link.send({ t: 'deny', msg: '' }); break; }
      removeDrop(d); r.link.send({ t: 'give', id: d.id, ammo: d.ammo, drop: 1 });
      break;
    }
    case 'drop': { const w = WEAPONS[m.id]; if (w && !w.melee) dropWeapon(m.id, u.x, u.y + 0.02, u.z, m.ammo); break; }
    case 'use': remoteUseStreak(u, m); break;
    case 'clay': if (u.alive && m.p && Math.hypot(m.p[0] - u.x, m.p[2] - u.z) < 4) placeClaymore(u, m.p[0], m.p[1], m.p[2], m.p[3]); break;
    case 'gear': u.vest = m.v; u.belt = m.b; if (Array.isArray(m.pk)) u.picks = m.pk.filter((x) => typeof x === 'string').slice(0, 3); break;
    case 'open': remoteOpenCrate(u, m.k); break;
    case 'chd': remoteChopperDamage(u, m); break;
    case 'ven': case 'vex': case 'vsw': case 'vdm': vehHostMsg(r, m); break;
    case 'buy': { const H = G.match.hook; if (H && H.netBuy) H.netBuy(u, m.s, m.have || []); break; }
  }
}

// ---------------- client: messages from the host ----------------
function clientMsg(m) {
  switch (m.t) {
    case 'welcome': S.slot = m.slot; return;
    case 'full': status(m.why, 'warn'); return;
    case 'kicked': status('The host removed you from the room.', 'warn'); { const was = S.live; S.live = false; leave(true); if (was) S.cb.abort('The host removed you from the room.'); else refreshUi(); } return;
    case 'chat': chat.add(m.n, m.m, m.k === 'sys' ? 'sys' : G.match && G.match.teams && G.player && m.tm === G.player.team ? 'ally' : '', !!m.tt); return;
    case 'lobby': S.lobby = m.p; S.lobbyCfg = m.cfg; refreshUi(); return;
    case 'pi': S.link.send({ t: 'po', c: m.c }); return;
    case 'po': S.rtt = S.rtt ? S.rtt * 0.7 + (now() - m.c) * 0.3 : now() - m.c; return;
    case 'closed': status('The host closed the room.', 'warn'); if (S.live) { S.live = false; S.cb.abort('The host closed the room.'); } return;
    case 'start': clientStart(m); return;
    case 'abort': if (S.live) { S.live = false; clearProxies(); S.cb.abort('The host ended the match.'); } return;
  }
  if (!S.live) return;
  switch (m.t) {
    case 'sn': onSnap(m); break;
    case 'ro': syncRoster(m.u); break;
    case 'pg': for (const [id, ms] of m.p) { const u = id === S.uid ? G.player : S.proxies.get(id); if (u) u.ping = ms; } if (G.player) G.player.ping = Math.round(S.rtt * 1000); break;
    case 'spawn': clientSpawn(m); break;
    case 'kill': onKillEv(m); break;
    case 'hurt': {
      const P = G.player; if (!P.alive) break;
      P.health = m.hp; hud.damageFrom(m.sx, m.sz, m.a); play('hurt', null, { gain: 0.8 });
      G.shake = Math.min(0.05, (G.shake || 0) + m.a * 0.0009); P.lastHitAt = G.now;
      break;
    }
    case 'vok': vehOk(m); break;
    case 'cl': netClaymore(m, m.o ? unitById(m.o) : null); break;
    case 'stk': G.player.streak = m.n; G.player.bestStreak = Math.max(G.player.bestStreak || 0, m.n); checkStreak(m.n); break;
    case 'mor': case 'sen': case 'crate': case 'chp': case 'jam': netStreak(m, m.o ? unitById(m.o) : null); break;
    case 'gift': if (m.r === 'refill') refillPlayer(); else { grantStreak(m.r); hud.banner('Care package', m.r.toUpperCase()); } break;
    case 'hm': hud.hitMarker(m.k); play('hit', null, { important: true }); break;
    case 'gr': case 'rk': replaySpawn(m, unitById(m.o)); break;
    case 'dr+': S.replay = true; dropWeapon(m.id, m.p[0], m.p[1], m.p[2]); drops[drops.length - 1].key = m.k; S.replay = false; break;
    case 'dr-': { const d = drops.find((x) => x.key === m.k); if (d) removeDrop(d); break; }
    case 'give': clientGive(m); break;
    case 'deny': if (m.msg) { play('deny'); hud.notice(m.msg); } break;
    case 'pk': if (m.k === 'ammo') { pickupAmmo(); hud.notice('Ammo resupplied'); } else hud.notice(`Medkit +${m.a} HP`); play('pickup'); break;
    case 'resupply': { const P = G.player; if (P.alive) { refillAmmo(); P.grenades = Math.max(P.grenades, m.g || 2); hud.setAmmo(P); } break; }
    case 'bn': hud.banner(m.a, m.b); if (m.s) play(m.s, null, { important: true }); break;
    case 'pu': { const H = G.match.hook; if (H && H.netPowerup) H.netPowerup(m); break; }
    case 'end': {
      applyMatch(m.m); S.live = false;
      const f = m.fk, k = f && unitById(f.k), v = f && unitById(f.v);
      G.match.finalEvent = k && v ? { killer: k, victim: v, at: f.t, weapon: f.w, headshot: !!f.h, label: f.l || '' } : null;
      endMatch(m.reason); break;
    }
  }
}
function clientStart(m) {
  S.uid = m.uid; S.team = m.team; S.seq = m.seq; S.haveClock = false; S.mstr = '';
  clearProxies();
  S.live = true;
  S.cb.deploy(m.cfg);               // startMatch sees G.mp.client: no bots, our team
  const P = G.player; P.name = S.name;
  spawnPlayer(m.sp.x, m.sp.y, m.sp.z, m.sp.yaw);
}
function clientSpawn(m) {
  S.seq = m.seq;
  spawnPlayer(m.x, m.y, m.z, m.yaw);
  if (G.state === 'dead') { G.state = 'playing'; hud.hideDeath(); }
}
function clientGive(m) {
  const P = G.player;
  if (m.drop) { // weapon taken from the floor: same rules as tryPickup
    const slot = pickupSlot(m.id), old = P.weapons[slot];
    if (old === m.id) { P.ammo[old].res = Math.max(P.ammo[old].res, m.ammo.res + m.ammo.mag); hud.setAmmo(P); }
    else { const oa = P.ammo[old]; takeWeapon(m.id, m.ammo); if (old && !WEAPONS[old].melee) S.link.send({ t: 'drop', id: old, ammo: oa }); }
    play('pickup'); return;
  }
  const H = G.match.hook; if (H && H.netGive) H.netGive(m);
}
function onKillEv(m) {
  const k = m.k ? unitById(m.k) : null, v = unitById(m.v);
  if (!v) return;
  hud.killfeed(k || v, v, m.w, m.h, !k);
  if (v === G.player) {
    const P = G.player;
    if (P.alive) { P.alive = false; P.health = 0; P.deaths++; P.streak = 0; }
    onPlayerDeath(); P.lastKiller = k; G.state = 'dead';
    P.respawnAt = m.ra < 0 ? G.now + 1.6 : m.ra; // host clock (ours is synced to it); the host sends the spawn
    hud.showDeath(k, { weapon: m.w, headshot: m.h }, m.ra < 0 ? 99 : m.ra);
    onDeathCam(P, k, { weapon: m.w, headshot: m.h });
  } else if (v.proxy && v.alive) proxyDie(v, k);
  if (k === G.player && v !== G.player) {
    hud.hitMarker('kill'); play('kill', null, { important: true, delay: 0.06 });
    awardKill(v, { weapon: m.w, headshot: m.h }, 0);
  }
}

// ---------------- shots and projectiles ----------------
function replayShot(s, from) {
  if (s[0] < 0) { if (S.client) netSentryShot(-s[0], s[2], s[3], s[4], s[5], s[6], s[7]); return; } // sentry burst
  const u = unitById(s[0]), wid = WIDS[s[1]], w = WEAPONS[wid];
  if (!u || !w) return;
  if (S.host) S.shots.push(s); // forward to the other clients in the next snapshot
  if (u === G.player) return;
  let [, , mx, my, mz, ex, ey, ez] = s;
  tracer(mx, my, mz, ex, ey, ez, 0xffb46a, w.velocity || 420);
  recordNetShot(u, w, mx, my, mz, ex, ey, ez);
  enemyFlash(mx, my, mz);
  play(w.sound, { x: mx, y: my, z: mz }, { occlude: true, gain: 0.9 });
  if (S.host) noise(u.x, my, u.z, w.noise, u);
  if (from) u.lastShotAt = G.now;
}
function replaySpawn(m, owner) {
  if (!owner || owner === G.player) return;
  const a = m.a;
  S.replay = true;
  if (m.t === 'gr') { throwGrenade(owner, a[0], a[1], a[2], a[3], a[4], a[5], a[6], m.k || 'frag'); }
  else { fireRocket(owner, a[0], a[1], a[2], a[3], a[4], a[5], a[6]); play(WEAPONS.rpg.sound, { x: a[0], y: a[1], z: a[2] }, { occlude: true }); }
  S.replay = false;
}
// end point of a shot for the mirror (projectile rifles: where the bullet would meet the world)
export function shotEnd(wid, x, y, z, dx, dy, dz) {
  const w = WEAPONS[wid], wh = rayWorld(x, y, z, dx, dy, dz, w.range), t = wh ? wh.t : w.range;
  return [x + dx * t, y + dy * t, z + dz * t];
}

// ---------------- per-frame ----------------
export function update(dt) {
  if (!S.live || !G.match) return;
  if (S.host) hostUpdate(dt); else clientUpdate(dt);
}
const wOf = (u) => u.isPlayer ? u.weapons[u.slot] : u.brain ? u.brain.weapon : u.weapon || 'm4';
function matchFields() {
  const m = G.match;
  return { time: r2(m.time), ts: m.teamScores, pts: m.points, wave: m.wave, round: m.round || 0, rem: m.remaining || 0, lives: m.lives, ws: m.waveState, rs: m.roundState, insta: r2(m.insta || 0), dbl: r2(m.doubleUntil || 0), kt: m.killsTotal, ggw: 0 };
}
function hostUpdate(dt) {
  const m = G.match;
  for (const r of S.remotes) {
    const u = r.unit; if (!u) continue;
    if (u.alive) {
      const st = sample(r.buf, G.now - 0.05);
      if (st) {
        u.x = st.x; u.y = st.y; u.z = st.z; u.yaw = st.yaw; u.aimPitch = u.pitch = st.p; u.crouchT = st.c; u.moveSpeed = st.ms;
        u.crouch = !!(st.f & 2); u.prone = !!(st.f & 4); u.grounded = !!(st.f & 8); u.adsT = st.f & 32 ? 1 : 0; u.zoomIdx = st.f & 64 ? 1 : 0;
        u.h = u.prone ? (PHYS.proneH || 0.6) : u.crouch ? PHYS.crouchH : PHYS.standH;
        const w = WIDS[st.w] || 'm4'; if (w !== u.weapon) { u.weapon = w; setSoldierGun(u.soldier, w); }
        if (u.vehicle && st.v) vehHostApply(u, st.v, dt);
      }
      if (u.flashUntil > G.realTime) setFlash(u.soldier, 0.9); else if (u.protectUntil > G.now) setFlash(u.soldier, 0.35 + 0.25 * Math.sin(G.realTime * 18), 0x3a6aa8); else setFlash(u.soldier, 0);
    } else if (u.respawnAt > 0 && G.now >= u.respawnAt && !m.ended && G.state !== 'ended') spawnRemote(u, pickSpawn(u));
    animateSoldier(u.soldier, u, dt);
  }
  sendRoster(false);
  S.pgAcc += dt;
  if (S.pgAcc > 1) { // pings for the scoreboard
    S.pgAcc = 0; const p = [[G.player.id, 0]]; G.player.ping = 0;
    for (const r of S.remotes) if (r.unit) { r.unit.ping = Math.round(r.rtt * 1000); p.push([r.unit.id, r.unit.ping]); }
    bcast({ t: 'pg', p });
  }
  S.snapAcc += dt;
  if (S.snapAcc >= SNAP_DT) { S.snapAcc = Math.min(S.snapAcc - SNAP_DT, SNAP_DT); sendSnap(); }
}
function sendRoster(force) {
  const key = G.units.map((u) => u.id).join(',');
  if (!force && key === S.rosterKey) return;
  S.rosterKey = key;
  bcast({ t: 'ro', u: G.units.map((u) => ({ id: u.id, n: u.isPlayer ? S.name : u.name, tm: u.team, l: u.isPlayer ? lookFor(u.team, 0, G.match.mode, S.skin) : u.look || {}, w: wOf(u), hp: u.maxHealth, hu: u.isPlayer || u.remote ? 1 : 0 })) });
}
function sendSnap() {
  const us = [];
  for (const u of G.units) {
    const pitch = u.isPlayer ? u.pitch : u.aimPitch || 0;
    us.push([u.id, r2(u.x), r2(u.y), r2(u.z), r3(u.yaw), r3(pitch), r2(u.crouchT || 0), r2(u.moveSpeed || 0),
      (u.alive ? 1 : 0) | (u.crouch ? 2 : 0) | (u.prone ? 4 : 0) | (u.grounded ? 8 : 0) | (u.protectUntil > G.now ? 16 : 0) | ((u.isPlayer ? u.adsT > 0.6 : u.adsT > 0.6) ? 32 : 0) | ((u.zoomIdx || 0) > 0 ? 64 : 0),
      Math.max(0, Math.ceil(u.health)), u.kills, u.deaths, WIDS.indexOf(wOf(u)), u.vehicle ? 1 : 0]);
  }
  const w = G.world;
  const snap = { t: 'sn', n: r3(G.now), u: us, m: matchFields(),
    dr: (w.doors || []).map((d) => d.target), br: (w.barrelCols || []).map((c) => (c.dead ? 1 : 0)).join(''),
    pk: pickups.map((p) => (p.available ? 1 : 0)).join(''), vh: vehicles.length ? vehSnap() : undefined };
  for (const r of S.remotes) {
    if (!r.hello || !r.unit) continue;
    snap.sh = S.shots.filter((s) => s[0] !== r.unit.id);
    r.link.sendFast(snap);
  }
  S.shots = [];
}

// interpolation buffer sample at time t (entries have .n)
function sample(buf, t) {
  if (!buf.length) return null;
  if (t <= buf[0].n) return buf[0];
  for (let i = buf.length - 1; i >= 0; i--) {
    const a = buf[i];
    if (a.n <= t) {
      const b = buf[i + 1]; if (!b) return a;
      const k = (t - a.n) / Math.max(1e-4, b.n - a.n);
      let dy = b.yaw - a.yaw; dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      return { ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + dy * k, p: a.p + (b.p - a.p) * k, c: a.c + (b.c - a.c) * k, ms: a.ms + (b.ms - a.ms) * k };
    }
  }
  return buf[buf.length - 1];
}

// ---------------- client side ----------------
function clearProxies() {
  for (const u of S.proxies.values()) { disposeSoldier(u.soldier); const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1); }
  S.proxies.clear();
}
function syncRoster(list) {
  const seen = new Set();
  for (const o of list) {
    seen.add(o.id);
    if (o.id === S.uid || S.proxies.has(o.id)) { const p = S.proxies.get(o.id); if (p) { p.name = o.n; p.team = o.tm; } continue; }
    const l = o.l || {}, zombie = l.style === 'zombie';
    const u = makeUnit({ name: o.n, team: o.tm, maxHealth: o.hp, health: o.hp, proxy: true, hid: o.id, human: !!o.hu });
    u.look = l; u.weapon = o.w; u.buf = [];
    u.soldier = makeSoldier({ ...l, weapon: zombie ? 'none' : o.w, style: l.style || 'soldier' });
    u.soldier.root.visible = false;
    S.proxies.set(o.id, u); G.units.push(u);
  }
  for (const [id, u] of S.proxies) if (!seen.has(id)) { disposeSoldier(u.soldier); S.proxies.delete(id); const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1); }
}
function onSnap(m) {
  const lt = now(), off = m.n - lt;
  if (!S.haveClock || Math.abs(off - S.offset) > 0.5) { S.offset = off; S.haveClock = true; }
  else S.offset = off > S.offset ? S.offset + (off - S.offset) * 0.1 : S.offset + (off - S.offset) * 0.02; // late packets don't drag the clock back
  applyMatch(m.m);
  for (const a of m.u) {
    const [id, x, y, z, yaw, p, c, ms, f, hp, k, d, wi] = a;
    if (id === S.uid) { const P = G.player; if (P.alive && f & 1) P.health = hp; P.kills = k; P.deaths = d; continue; }
    const u = S.proxies.get(id); if (!u) continue;
    u.kills = k; u.deaths = d; u.health = hp; u.protectUntil = f & 16 ? G.now + 0.2 : 0; u.adsT = f & 32 ? 1 : 0; u.zoomIdx = f & 64 ? 1 : 0;
    u.buf.push({ n: m.n, x, y, z, yaw, p, c, ms, f, w: wi });
    if (u.buf.length > 30) u.buf.shift();
    if (!(f & 1) && u.alive) proxyDie(u, null);
  }
  if (m.sh) for (const s of m.sh) replayShot(s, null);
  if (m.vh) vehApplySnap(m.n, m.vh, unitById);
  const w = G.world;
  if (w.doors && m.dr) m.dr.forEach((t, i) => { const dd = w.doors[i]; if (dd && dd.target !== t) toggleDoor(dd, t > 0.5); });
  if (w.barrelCols && m.br) for (let i = 0; i < m.br.length; i++) { const c = w.barrelCols[i]; if (c && m.br[i] === '1' && !c.dead) killBarrel(c); }
  if (m.pk) for (let i = 0; i < m.pk.length && i < pickups.length; i++) { const on = m.pk[i] === '1', pk = pickups[i]; if (pk.available !== on) { pk.available = on; pk.g.visible = on; } }
}
function applyMatch(f) {
  const m = G.match; if (!m || !f) return;
  m.time = f.time; m.teamScores = f.ts; m.points = f.pts; m.wave = f.wave; m.round = f.round; m.remaining = f.rem; m.lives = f.lives;
  m.waveState = f.ws; m.roundState = f.rs; m.insta = f.insta; m.doubleUntil = f.dbl; m.killsTotal = f.kt;
  const key = JSON.stringify([f.ts, f.pts, f.wave, f.round, f.rem, f.lives, f.insta > G.now, f.dbl > G.now]);
  if (key !== S.mstr) { S.mstr = key; hud.scoreChanged(); }
}
function proxyDie(u, killer) {
  u.alive = false; u.health = 0;
  let front = true;
  if (killer) { const dx = killer.x - u.x, dz = killer.z - u.z; front = (-Math.sin(u.yaw) * dx - Math.cos(u.yaw) * dz) >= 0; }
  if (u.soldier.deathT < 0) startDeath(u.soldier, front);
  setFlash(u.soldier, 0);
}
function clientUpdate(dt) {
  const t = now();
  if (S.haveClock) G.now = t + S.offset;
  const rt = G.now - INTERP;
  for (const u of S.proxies.values()) {
    const st = sample(u.buf, rt);
    if (st) {
      const alive = !!(st.f & 1);
      if (alive && !u.alive) { // respawned
        u.alive = true; u.health = u.maxHealth; const s = u.soldier; s.deathT = -1; s.root.visible = true; s.pose.rotation.set(0, 0, 0);
      }
      if (!u.soldier.root.visible && alive) u.soldier.root.visible = true;
      if (u.alive) {
        u.x = st.x; u.y = st.y; u.z = st.z; u.yaw = st.yaw; u.aimPitch = st.p; u.crouchT = st.c; u.moveSpeed = st.ms;
        u.crouch = !!(st.f & 2); u.prone = !!(st.f & 4); u.grounded = !!(st.f & 8); u.adsT = st.f & 32 ? 1 : 0; u.zoomIdx = st.f & 64 ? 1 : 0;
        u.h = u.prone ? (PHYS.proneH || 0.6) : u.crouch ? PHYS.crouchH : PHYS.standH;
        const w = WIDS[st.w]; if (w && w !== u.weapon && u.look.style !== 'zombie') { u.weapon = w; setSoldierGun(u.soldier, w); }
      }
      // keep buffer short
      while (u.buf.length > 2 && u.buf[1].n < rt - 0.5) u.buf.shift();
    }
    if (u.flashUntil > G.realTime) setFlash(u.soldier, 0.9); else if (u.alive && u.protectUntil > G.now) setFlash(u.soldier, 0.35 + 0.25 * Math.sin(G.realTime * 18), 0x3a6aa8); else if (u.alive) setFlash(u.soldier, 0);
    animateSoldier(u.soldier, u, dt);
  }
  // our state to the host
  S.sendAcc += dt;
  const P = G.player;
  if (S.sendAcc >= SNAP_DT && P && P.alive) {
    S.sendAcc = Math.min(S.sendAcc - SNAP_DT, SNAP_DT);
    S.link.sendFast({ t: 'st', q: S.seq, n: r3(G.now), x: r2(P.x), y: r2(P.y), z: r2(P.z), yaw: r3(P.yaw), p: r3(P.pitch), c: r2(P.crouchT || 0), ms: r2(P.moveSpeed || 0),
      f: (P.crouch ? 2 : 0) | (P.prone ? 4 : 0) | (P.grounded ? 8 : 0) | (P.adsT > 0.6 ? 32 : 0) | ((P.zoomIdx || 0) > 0 ? 64 : 0), w: WIDS.indexOf(P.weapons[P.slot]), v: P.vehicle ? vehLocal() : undefined });
  }
  S.pingAcc += dt;
  if (S.pingAcc > 1) { S.pingAcc = 0; S.link.send({ t: 'pi', c: now() }); }
}
export const pingMs = () => Math.round((S.host ? Math.max(0, ...S.remotes.map((r) => r.rtt)) : S.rtt) * 1000);
Object.assign(S, { remoteTeams, makeRemoteUnits, spawnRemote, hostEnded, vehInterp, vehRequest });
