import { G } from '../core/state.js';
import { loadoutGuns, SLOT_MODES, ALL_GUNS } from '../core/config.js';
import { rankFor } from './progression.js';
import { MODES, BOT_NAMES, UNIFORMS, ACCENTS, TEAMS, DIFFICULTY, botSkill, skillBand, skillFor, botRulesDefault } from '../core/config.js';
import { rand, randInt, pick, shuffle, chance } from '../core/util.js';
import { clearInput, exitLock } from '../core/input.js';
import { loadMap } from '../world/maps/index.js';
import { buildNav } from '../world/nav.js';
import { blocked, supportHeight, losClear } from '../world/physics.js';
import { createPlayer, spawnPlayer, onPlayerDeath, refillAmmo } from '../entities/player.js';
import { createBot, disposeBot, resetBotForSpawn } from '../entities/ai.js';
import { clearGrenades } from '../entities/grenades.js';
import { clearRockets } from '../entities/projectiles.js';
import { clearBullets } from '../entities/ballistics.js';
import { resetWorldProps, clearDrops } from '../entities/worldprops.js';
import { resetPickups } from '../entities/pickups.js';
import { resetStreaks } from '../entities/streaks.js';
import { clearFx } from '../engine/fx.js';
import { play, startAmbience, stopAmbience } from '../engine/audio.js';
import { resetMatchXp, award, finishMatch } from './progression.js';
import * as hud from '../ui/hud.js';
import { showEnd } from '../ui/menus.js';
import { onDeathCam, resetKillcam } from './killcam.js';
import { resetVehicles, vehicles } from '../entities/vehicles.js';
function resetVehiclesHard() { const keep = G.profile.lobby.vehicles; G.profile.lobby.vehicles = false; resetVehicles(); G.profile.lobby.vehicles = keep; }
import { HOOKS } from './modes.js';

let deployBeep = 0;

function pickWeapon() {
  if (G.match.rules && G.match.rules.knife) return 'knife';
  const r = Math.random() * (G.match.bots.snipers ? 1 : 0.9); // no bolt-action snipers when the rule is off
  return r < 0.28 ? 'm4' : r < 0.46 ? 'ak47' : r < 0.62 ? 'mp5' : r < 0.71 ? 'm870' : r < 0.77 ? 'spas12' : r < 0.84 ? 'm249' : r < 0.9 ? 'mk14' : r < 0.96 ? 'l96' : 'barrett';
}

export function startMatch(cfg) {
  const mode = MODES[cfg.mode];
  loadMap(cfg.map);
  resetKillcam();
  if (!G.world.nav) buildNav();
  cleanupMatch();
  const skill = cfg.skill >= 1 ? +cfg.skill : skillFor(cfg.difficulty);
  G.match = {
    mode: cfg.mode, map: cfg.map, difficulty: skillBand(Math.round(skill)), skill, ai: botSkill(skill), bots: { ...botRulesDefault(), ...(cfg.bots || {}) }, count: cfg.count, def: mode,
    time: mode.time || 0, elapsed: 0, scoreLimit: cfg.mode === 'tdm' ? Math.max(3, cfg.count || 0) * 10 : mode.scoreLimit || 0, hook: HOOKS[cfg.mode] || null,
    teamScores: [0, 0], stats: { shots: 0, hits: 0, headHits: 0, damage: 0 }, killsTotal: 0,
    wave: 0, waveState: 'none', toSpawn: 0, nextSpawnAt: 0, nextWaveAt: 0, lives: mode.lives || 0, points: 0, ended: false,
    rules: cfg.mode === 'sandbox' ? { ...G.profile.lobby.sandbox } : null, loadout: null,
  };
  const m = G.match;
  m.teams = cfg.mode === 'tdm' || !!mode.teamSize || !!(m.rules && m.rules.teams);
  const waves = cfg.mode === 'survival' || (m.hook && m.hook.waves);
  m.slots = effectiveSlots(cfg.mode);
  if (m.rules) m.loadout = { guns: loadoutGuns(G.profile.loadout, m.slots) };
  G.gravMul = m.rules && m.rules.lowGrav ? 0.4 : 1;
  resetMatchXp();
  G.now = 0; G.noise.length = 0;
  const mpc = !!(G.mp && G.mp.live && G.mp.client), rt = G.mp && G.mp.live && G.mp.host ? G.mp.remoteTeams(cfg.mode) : [];
  const P = createPlayer(mpc ? G.mp.team : 0);
  G.units = [P]; G.bots = [];
  const names = shuffle(BOT_NAMES.slice());
  if (mpc) { /* the host runs every bot */ } else if (!m.teams && !waves) {
    for (let i = 0; i < cfg.count; i++) addBot({ name: names[i], team: i + 1, weapon: pickWeapon(), uniform: UNIFORMS[i % UNIFORMS.length], accent: ACCENTS[i % ACCENTS.length] });
  } else if (m.teams) {
    const squads = cfg.mode === 'tdm' || mode.teamSize;
    let allies = squads ? cfg.count - 1 : Math.floor(cfg.count / 2), foes = squads ? cfg.count : cfg.count - allies;
    allies = Math.max(0, allies - rt.filter((t) => t === 0).length); foes = Math.max(0, foes - rt.filter((t) => t === 1).length);
    for (let i = 0; i < allies; i++) addBot({ name: names[i], team: 0, weapon: pickWeapon(), uniform: pick([0x5f6a52, 0x857b5f, 0x6d6255]), accent: TEAMS[0].hex, helmet: 0x4a5340 });
    for (let i = 0; i < foes; i++) addBot({ name: names[allies + i], team: 1, weapon: pickWeapon(), uniform: pick([0x3a3f44, 0x46423c, 0x2f3438]), accent: TEAMS[1].hex, helmet: 0x26292b });
  }
  if (m.hook && m.hook.setup) m.hook.setup(m, cfg);
  const remotes = rt.length ? G.mp.makeRemoteUnits(cfg.mode) : [];
  resetPickups(); resetStreaks(); clearGrenades(); clearRockets(); clearFx(); resetWorldProps();
  const s = pickSpawn(P); spawnPlayer(s.x, s.y, s.z, s.yaw); hookSpawn(P);
  for (const u of remotes) G.mp.spawnRemote(u, pickSpawn(u), false);
  for (const b of G.bots) { const sp = pickSpawn(b); resetBotForSpawn(b, sp.x, sp.y, sp.z, sp.yaw); hookSpawn(b); }
  G.camera.fov = G.profile.settings.fov; G.camera.updateProjectionMatrix();
  G.state = 'deploy'; G.deployUntil = 3; deployBeep = 0;
  hud.startMatch();
  startAmbience(G.world.def.ambience);
  resetVehicles();
}

// Overkill needs Sergeant outside Sandbox; anything else falls back to Classic
export function effectiveSlots(mode) {
  const want = G.profile.settings.slots;
  if (!SLOT_MODES[want]) return 'classic';
  if (want === 'overkill' && mode !== 'sandbox' && rankFor(G.profile.xp) < SLOT_MODES.overkill.rank) return 'classic';
  return want;
}

// a bot's guns follow the same slot rule as the player
function botGuns(primary) {
  const m = G.match;
  if (primary === 'knife' || primary === 'rpg') return [primary];
  if (m.slots === 'classic') return [primary, chance(0.3) ? 'deagle' : 'usp'];
  const pool = shuffle(ALL_GUNS.filter((g) => g !== primary));
  return [primary, ...pool.slice(0, SLOT_MODES[m.slots].guns - 1)];
}

function addBot(o) {
  if (!o.guns) o.guns = botGuns(o.weapon);
  const b = createBot(o);
  G.bots.push(b); G.units.push(b);
  return b;
}

function hookSpawn(u) { const h = G.match && G.match.hook; if (h && h.onSpawn) h.onSpawn(u); }
// helpers modes use to add and remove wave enemies
G.spawnBot = (o) => { const b = addBot(o); const sp = pickSpawn(b); resetBotForSpawn(b, sp.x, sp.y, sp.z, sp.yaw); b.protectUntil = 0; return b; };
G.removeBot = (b) => { disposeBot(b); G.bots.splice(G.bots.indexOf(b), 1); G.units.splice(G.units.indexOf(b), 1); };

export function cleanupMatch() {
  if (G.mp) G.mp.cleanup();
  resetKillcam();
  resetVehiclesHard();
  for (const h of Object.values(HOOKS)) if (h.cleanup) h.cleanup();
  for (const b of G.bots) disposeBot(b);
  G.bots = []; G.units = G.player ? [] : [];
  clearGrenades(); clearRockets(); clearBullets(); clearDrops();
}

// Choose the safest spawn: far from enemies, out of their sight, near friends in team modes.
export function pickSpawn(u, opts = {}) {
  const sp = G.world.spawns, m = G.match;
  let list = sp.ffa;
  if (m.teams && !(m.hook && m.hook.ffaSpawns)) list = G.now < 20 ? sp.teams[u.team] : sp.teams[u.team].concat(sp.ffa);
  if ((m.mode === 'survival' || (m.hook && m.hook.waves)) && !u.isPlayer) list = sp.ffa.concat(sp.teams[0], sp.teams[1]);
  let best = null, bs = -1e9;
  for (const [x, z, sy] of list) {
    const y = supportHeight(x, z, 0.2, (sy || 0) + 0.5);
    if (blocked(x, z, 0.4, y, 1.8)) continue;
    let minD = 60, seen = 0, friends = 0;
    for (const o of G.units) {
      if (!o.alive || o === u) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (o.team === u.team) { if (d < 16) friends++; continue; }
      minD = Math.min(minD, d);
      if (d < 50 && losClear(o.x, o.y + 1.6, o.z, x, y + 1.2, z)) seen++;
    }
    let s = Math.min(minD, 45) + rand(0, 7) - seen * 30 + Math.min(friends, 2) * 4;
    if ((m.mode === 'survival' || (m.hook && m.hook.waves)) && u.brain) { for (const p of G.units) if ((p.isPlayer || p.remote) && p.alive && Math.hypot(p.x - x, p.z - z) < 22) s -= 80; } // wave enemies never spawn on a human
    if (minD < 6) s -= 60;
    if (s > bs) { bs = s; best = { x, y, z }; }
  }
  if (!best) best = { x: list[0][0], y: list[0][2] || 0, z: list[0][1] };
  best.yaw = Math.atan2(best.x, best.z);
  return best;
}

export function onKill(credited, victim, info) {
  const m = G.match; if (!m || m.ended) return;
  m.killsTotal++;
  if (credited && m.teams && !m.hook) m.teamScores[credited.team]++;
  const hookEnd = m.hook && m.hook.onKill ? m.hook.onKill(credited, victim, info) : null;
  if (victim.isPlayer) {
    onPlayerDeath();
    G.state = 'dead';
    if (m.mode === 'survival' || (m.hook && m.hook.waves)) {
      m.lives--;
      if (m.lives <= 0) { setTimeout(() => endMatch('time'), 1600); hud.showDeath(credited, info, 99); victim.respawnAt = G.now + 1.6; onDeathCam(victim, credited); return; }
    }
    victim.respawnAt = G.now + (m.mode === 'survival' ? 5 : 3);
    hud.showDeath(credited, info, victim.respawnAt);
    onDeathCam(victim, credited);
  } else if (victim.remote) { // another human player (multiplayer host)
    if (m.mode === 'survival' || (m.hook && m.hook.waves)) {
      m.lives--;
      if (m.lives <= 0) { setTimeout(() => endMatch('time'), 1600); victim.respawnAt = -1; }
      else victim.respawnAt = G.now + (m.mode === 'survival' ? 5 : 3);
    } else victim.respawnAt = G.now + 3;
  } else {
    victim.respawnAt = G.now + 3; // same delay as the player
    if (m.mode === 'survival') m.alive = Math.max(0, (m.alive || 0) - 1);
  }
  if (hookEnd === 'end') { setTimeout(() => endMatch('limit'), 300); hud.scoreChanged(); return; }
  if (m.mode === 'ffa' && credited && credited.kills >= m.scoreLimit) endMatch('limit');
  if (m.mode === 'tdm' && (m.teamScores[0] >= m.scoreLimit || m.teamScores[1] >= m.scoreLimit)) endMatch('limit');
  hud.scoreChanged();
}

// ---------- survival waves ----------
const WAVE_TYPES = (n) => {
  const r = Math.random();
  if (n >= 4 && r < 0.14) return 'heavy';
  if (n >= 3 && r < 0.26) return 'marksman';
  if (n >= 2 && r < 0.5) return 'rusher';
  return 'soldier';
};
function startWave(n) {
  const m = G.match;
  m.wave = n; m.waveState = 'fighting';
  m.toSpawn = Math.min(30, 4 + n * 2); m.waveTotal = m.toSpawn; m.nextSpawnAt = G.now + 0.5;
  hud.banner(`Wave ${n}`, n === 1 ? 'Hostiles inbound. Hold the line.' : `${m.waveTotal} hostiles inbound`, 'wave');
  play('wave', null, { important: true });
  hud.scoreChanged();
}
function spawnSurvivor() {
  const m = G.match, type = WAVE_TYPES(m.wave);
  const weapon = type === 'rusher' ? 'mp5' : type === 'heavy' ? 'm870' : type === 'marksman' ? (chance(0.5) || !m.bots.snipers ? 'mk14' : 'l96') : chance(0.3) ? 'mp5' : 'm4';
  const b = addBot({
    name: type === 'heavy' ? 'HEAVY' : type === 'marksman' ? 'MARKSMAN' : type === 'rusher' ? 'RUSHER' : 'HOSTILE', team: 1, weapon, type,
    uniform: type === 'heavy' ? 0x2c2f31 : type === 'marksman' ? 0x4d5a3a : pick([0x3a3f44, 0x46423c, 0x5a4f43]), accent: type === 'heavy' ? 0x1f2224 : 0x8a3a30,
    helmet: type === 'heavy' ? 0x1b1d1e : 0x30302c,
  });
  const sp = pickSpawn(b); resetBotForSpawn(b, sp.x, sp.y, sp.z, sp.yaw);
  b.protectUntil = 0;
  b.brain.target = G.player; b.brain.lastKnown = { x: G.player.x, y: G.player.y, z: G.player.z }; b.brain.lastSeen = G.now - 3;
  m.toSpawn--; m.alive = (m.alive || 0) + 1;
}

function updateSurvival() {
  const m = G.match;
  if (m.waveState === 'none') { startWave(1); return; }
  // remove corpses after their fall animation
  for (let i = G.bots.length - 1; i >= 0; i--) {
    const b = G.bots[i];
    if (!b.alive && G.now > b.respawnAt + 0.8) { disposeBot(b); G.bots.splice(i, 1); G.units.splice(G.units.indexOf(b), 1); }
  }
  const alive = G.bots.filter((b) => b.alive).length;
  if (m.waveState === 'fighting') {
    const cap = Math.min(4 + Math.floor(m.wave / 2), 9);
    if (m.toSpawn > 0 && alive < cap && G.now >= m.nextSpawnAt) { spawnSurvivor(); m.nextSpawnAt = G.now + rand(0.8, 1.6); }
    if (m.toSpawn <= 0 && alive === 0) {
      m.waveState = 'intermission'; m.nextWaveAt = G.now + 10;
      award('wave', `Wave ${m.wave} cleared`, 150 * m.wave);
      if (m.wave % 5 === 0) { m.lives++; hud.notice('Reinforcements: +1 life'); }
      const p = G.player;
      if (p.alive) { p.health = p.maxHealth; refillAmmo(); p.grenades = Math.max(p.grenades, 2); hud.setAmmo(p); }
      for (const u of G.units) if (u.remote && u.alive) { u.health = u.maxHealth; G.mp.toRemote(u, { t: 'resupply', g: 2 }); }
      hud.banner(`Wave ${m.wave} cleared`, 'Resupplied. Next wave in 10 seconds.', 'streak');
      play('streak', null, { important: true });
    }
  } else if (m.waveState === 'intermission' && G.now >= m.nextWaveAt) startWave(m.wave + 1);
  m.remaining = m.toSpawn + alive;
}

export function updateMatch(dt) {
  const m = G.match; if (!m) return;
  if (G.state === 'deploy') {
    G.deployUntil -= dt;
    const n = Math.ceil(G.deployUntil);
    if (n !== deployBeep && n > 0) { deployBeep = n; play('beep', null, { important: true }); hud.center(String(n)); }
    if (G.deployUntil <= 0) { G.state = 'playing'; play('go', null, { important: true }); hud.center(m.mode === 'survival' ? 'Survive' : 'Go', 0.8); }
    return;
  }
  if (G.mp && G.mp.live && G.mp.client) { if (m.hook && m.hook.clientUpdate) m.hook.clientUpdate(dt); return; } // the host runs the rules
  m.elapsed += dt;
  if (m.def.time) {
    m.time -= dt;
    if (m.time <= 0) { m.time = 0; endMatch('time'); return; }
  } else if (m.mode === 'survival') updateSurvival();
  if (m.hook && m.hook.update && m.hook.update(dt) === 'end') { endMatch('limit'); return; }
  if (m.mode !== 'survival' && !(m.hook && m.hook.waves)) {
    for (const b of G.bots) {
      if (!b.alive && b.respawnAt && G.now >= b.respawnAt) { const s = pickSpawn(b); resetBotForSpawn(b, s.x, s.y, s.z, s.yaw); hookSpawn(b); }
    }
  }
  const P = G.player;
  if (G.state === 'dead' && G.now >= P.respawnAt && !m.ended) {
    const s = pickSpawn(P); spawnPlayer(s.x, s.y, s.z, s.yaw); hookSpawn(P);
    G.state = 'playing'; hud.hideDeath(); hud.setStreaks(0, null);
  }
}

export function standings() {
  return [...G.units].filter((u) => G.match.mode !== 'survival' || u.isPlayer || u.human || u.alive)
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
}

export function endMatch(reason) {
  const m = G.match; if (!m || m.ended) return;
  m.ended = true;
  if (G.mp && G.mp.host) G.mp.hostEnded(reason);
  G.state = 'ended';
  clearInput();
  const P = G.player;
  let result, title, detail;
  if (m.hook && m.hook.result) ({ result, title, detail } = m.hook.result());
  else if (m.mode === 'ffa') {
    const ranks = [...G.units].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const top = ranks[0], second = ranks[1];
    if (top === P && (!second || P.kills > second.kills || P.deaths < second.deaths)) { result = 'victory'; title = 'Victory'; detail = 'Top of the leaderboard. Excellent work, operator.'; }
    else if (top.kills === P.kills && top.deaths === P.deaths) { result = 'draw'; title = 'Draw'; detail = 'Tied for first. Run it back.'; }
    else { result = 'defeat'; title = 'Defeat'; detail = `${top.name} topped the board with ${top.kills} eliminations.`; }
  } else if (m.mode === 'tdm') {
    const [a, b] = m.teamScores, mine = m.teamScores[P.team === 1 ? 1 : 0], theirs = m.teamScores[P.team === 1 ? 0 : 1];
    result = mine > theirs ? 'victory' : mine < theirs ? 'defeat' : 'draw';
    title = result === 'victory' ? 'Victory' : result === 'defeat' ? 'Defeat' : 'Draw';
    detail = `${TEAMS[0].name} ${a}  :  ${b} ${TEAMS[1].name}`;
  } else {
    result = 'survival'; title = 'Overrun';
    detail = `You held out until wave ${m.wave} with ${m.points.toLocaleString()} points.`;
  }
  const summary = finishMatch(result);
  hud.endMatch();
  stopAmbience();
  play(result === 'victory' ? 'victory' : 'defeat', null, { important: true });
  exitLock();
  showEnd({ result, title, detail, reason, summary, mode: m.mode, standings: standings(), teamScores: m.teamScores, wave: m.wave, points: m.points, difficulty: DIFFICULTY[m.difficulty].label });
}

export function abandonMatch() {
  if (G.match) G.match.ended = true;
  G.state = 'menu';
  cleanupMatch();
  clearInput();
  stopAmbience();
  hud.endMatch();
}
