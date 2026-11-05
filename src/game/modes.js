import { restyleSoldier } from '../entities/soldier.js';
import { RANGE_TARGETS, RANGE_MOVERS } from '../world/maps/firingrange.js';
// Phase 5 modes as hooks on top of the shared match flow (match.js calls these when present).
// Hook fields: setup, weapons(u), onSpawn(u), onKill, onDamage, modDamage, update, result, score, botGoal, interact, prompting
import * as THREE from 'three';
import { G } from '../core/state.js';
import { WEAPONS, ALL_GUNS, TEAMS } from '../core/config.js';
import { rand, randInt, pick, shuffle, chance } from '../core/util.js';
import { supportHeight, blocked } from '../world/physics.js';
import { isEnemy, kill } from '../entities/units.js';
import { PHYS } from '../core/config.js';
import { input } from '../core/input.js';
import { gunModel } from '../entities/soldier.js';
import { setBotWeapon, convertBot } from '../entities/ai.js';
import { giveWeapons, refillAmmo } from '../entities/player.js';
import { play } from '../engine/audio.js';
import * as hud from '../ui/hud.js';

const keyE = () => hud.keyName('interact');
const disposeAll = (list) => { for (const o of list) if (o.mesh) G.scene.remove(o.mesh); list.length = 0; };
function std(c, o = {}) { const m = new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.7, metalness: o.m ?? 0, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1 }); m.color.convertSRGBToLinear(); if (o.e) m.emissive.convertSRGBToLinear(); return m; }

// =========================== GUN GAME ===========================
// One weapon per tier; a kill moves you up, a knife kill knocks the victim down one. Final tier: knife kill wins.
export const GG_LADDER = ['m4', 'ak47', 'm249', 'mp5', 'spas12', 'm870', 'mk14', 'l96', 'barrett', 'deagle', 'usp', 'knife'];
function ggArm(u) {
  const id = GG_LADDER[Math.min(u.gg, GG_LADDER.length - 1)];
  if (u.isPlayer) { delete u.ammo[id]; giveWeapons(id === 'knife' ? ['knife'] : [id, 'knife']); }
  else if (u.remote) { u.weapon = id; G.mp.toRemote(u, { t: 'mode', gg: u.gg }); } // a joiner: their game arms them
  else { u.brain.guns = [id]; setBotWeapon(u, id, false); }
}
const gungame = {
  noDrops: true, noStreaks: true,
  setup() { for (const u of G.units) u.gg = 0; },
  weapons(u) { const id = GG_LADDER[u.gg || 0]; return id === 'knife' ? ['knife'] : [id, 'knife']; },
  onSpawn(u) { if (!u.isPlayer && !u.remote) ggArm(u); },
  netState() { return G.units.map((u) => [u.id, u.gg || 0]); },
  netApply(s, find) { for (const [id, g] of s) { const u = find(id); if (u) u.gg = g; } },
  netMsg(m) { const P = G.player; if (m.gg == null) return; const up = m.gg > (P.gg || 0); P.gg = m.gg; ggArm(P); if (up) { hud.center(`${P.gg + 1} / ${GG_LADDER.length}`, 0.9); play('streak', null, { important: true }); } else if (m.demoted) hud.banner('Demoted', `Back to ${WEAPONS[GG_LADDER[P.gg]].name}`); },
  onKill(c, v, info) {
    if (info.weapon === 'knife' && v.gg > 0 && c) { v.gg--; if (v.isPlayer) hud.banner('Demoted', `Back to ${WEAPONS[GG_LADDER[v.gg]].name}`); if (v.remote) G.mp.toRemote(v, { t: 'mode', gg: v.gg, demoted: 1 }); }
    if (!c || c === v) return;
    const cur = GG_LADDER[c.gg];
    if (info.weapon !== cur && info.weapon !== 'knife') return; // only your tier weapon (or a knife) counts
    c.gg++;
    if (c.gg >= GG_LADDER.length) { G.match.ggWinner = c; return 'end'; }
    if (c.alive) ggArm(c);
    if (c.isPlayer) { hud.center(`${c.gg + 1} / ${GG_LADDER.length}`, 0.9); play('streak', null, { important: true }); }
  },
  score() {
    const P = G.player, lead = G.units.filter((u) => u !== P).sort((a, b) => b.gg - a.gg)[0];
    return { an: 'Your tier', a: `${P.gg + 1}`, bn: lead ? `Leader: ${lead.name}` : 'Leader', b: lead ? `${lead.gg + 1}` : '-', sub: `${GG_LADDER.length} tiers · knife kill on the last one wins` };
  },
  result() {
    const P = G.player, top = G.match.ggWinner || [...G.units].sort((a, b) => b.gg - a.gg || b.kills - a.kills)[0];
    if (top === P) return { result: 'victory', title: 'Victory', detail: 'You climbed the whole ladder.' };
    return { result: 'defeat', title: 'Defeat', detail: `${top.name} reached tier ${top.gg + (top.gg >= GG_LADDER.length ? 0 : 1)} first.` };
  },
};

// =========================== INFECTION ===========================
// Everyone starts as a survivor; one is infected. Infected are fast knife-only hunters; whoever they kill joins them.
// Survivors win if anyone is still uninfected when the timer runs out.
export const INF_TEAMS = [{ name: 'SURVIVORS', color: '#7fb3d9' }, { name: 'INFECTED', color: '#8fd16a' }];
function infect(u) {
  u.team = 1;
  if (u.isPlayer) { u.speedMul = 1.25; return; }
  if (u.remote) { G.mp.toRemote(u, { t: 'mode', inf: 1 }); if (u.soldier) restyleSoldier(u.soldier, 'infected', u.look && u.look.accent); return; }
  convertBot(u, 'infected', 'knife');
}
const infection = {
  noDrops: true, noStreaks: true, ffaSpawns: true, teamNames: INF_TEAMS,
  setup(m) {
    for (const u of G.units) u.team = 0;
    m.teams = true;
    if (G.mp && G.mp.live && G.mp.client) return; // the host picks patient zero
    const first = pick(G.units.filter((u) => !u.isPlayer).concat(chance(1 / G.units.length) ? [G.player] : []));
    infect(first); m.firstInfected = first;
  },
  weapons(u) { return u.team === 1 ? ['knife'] : null; },
  netMsg(m) { const P = G.player; if (!m.inf) return; P.team = 1; P.speedMul = 1.25; giveWeapons(['knife']); hud.notice('You’ve been infected. Hunt the survivors.'); play('radio'); },
  onSpawn(u) { if (u.isPlayer) u.speedMul = u.team === 1 ? 1.25 : 1; if (u.team === 1 && !u.isPlayer) u.brain.alwaysHunt = true; },
  onKill(c, v) {
    if (v.team === 0 && (!c || c.team === 1)) {
      infect(v);
      hud.notice(v.isPlayer ? 'You’ve been infected. Hunt the survivors.' : `${v.name} was infected`);
      play('radio');
    }
    if (!G.units.some((u) => u.team === 0)) return 'end';
  },
  score() {
    const s = G.units.filter((u) => u.team === 0).length;
    return { an: 'Survivors', a: String(s), bn: 'Infected', b: String(G.units.length - s), sub: G.player.team === 1 ? 'You’re infected: knife the survivors' : 'Survive until the timer runs out' };
  },
  result() {
    const P = G.player, left = G.units.filter((u) => u.team === 0);
    const survWin = left.length > 0;
    const won = survWin ? P.team === 0 : P.team === 1;
    return { result: won ? 'victory' : 'defeat', title: won ? 'Victory' : 'Defeat', detail: survWin ? `${left.length} survivor${left.length > 1 ? 's' : ''} held out.` : 'Everyone was infected.' };
  },
};

// =========================== CAPTURE THE FLAG ===========================
let flags = [];
function flagBase(team) {
  const def = G.world.def;
  if (def.flags) { const [x, z, y = 0] = def.flags[team]; return { x, z, y }; }
  // the team spawn closest to the middle of that team's spawn area
  const sp = G.world.spawns.teams[team];
  const cx = sp.reduce((a, s) => a + s[0], 0) / sp.length, cz = sp.reduce((a, s) => a + s[1], 0) / sp.length;
  let best = sp[0], bd = Infinity;
  for (const s of sp) { const d = Math.hypot(s[0] - cx, s[1] - cz); if (d < bd) { bd = d; best = s; } }
  return { x: best[0], z: best[1], y: supportHeight(best[0], best[1], 0.2, (best[2] || 0) + 0.5) };
}
function makeFlag(team, base) {
  const g = new THREE.Group(), col = TEAMS[team].hex;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), std(0xcfcfc8, { m: 0.6, r: 0.4 })); pole.position.y = 1.1; g.add(pole);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.48, 0.02), std(col, { e: col, ei: 0.25 })); cloth.position.set(0.4, 1.9, 0); g.add(cloth);
  G.scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(base.x, base.y + 0.03, base.z); G.scene.add(ring);
  return { team, base, mesh: g, ring, cloth, state: 'home', carrier: null, x: base.x, y: base.y, z: base.z, dropAt: 0 };
}
function flagHome(f) { f.state = 'home'; f.carrier = null; f.x = f.base.x; f.y = f.base.y; f.z = f.base.z; }
const ctfName = (t) => (t === G.player.team ? 'Your' : 'Enemy');
const ctf = {
  setup() { disposeFlags(); flags = [0, 1].map((t) => makeFlag(t, flagBase(t))); },
  cleanup: disposeFlags,
  onKill(c, v) {
    for (const f of flags) if (f.carrier === v) {
      f.state = 'dropped'; f.carrier = null; f.x = v.x; f.y = v.y; f.z = v.z; f.dropAt = G.now;
      hud.notice(`${ctfName(f.team)} flag dropped`);
    }
  },
  netState() { return flags.map((f) => [f.state === 'home' ? 0 : f.state === 'carried' ? 1 : 2, f.carrier ? f.carrier.id : 0, Math.round(f.x * 50) / 50, Math.round(f.y * 50) / 50, Math.round(f.z * 50) / 50]); },
  netApply(s, find) { s.forEach(([st, cid, x, y, z], i) => { const f = flags[i]; if (!f) return; const was = f.state; f.state = st === 0 ? 'home' : st === 1 ? 'carried' : 'dropped'; f.carrier = cid ? find(cid) : null; f.x = x; f.y = y; f.z = z; if (was !== f.state && f.state === 'carried' && f.carrier) hud.notice(f.carrier === G.player ? 'You have the flag! Bring it home.' : `${f.carrier.name} has the ${ctfName(f.team).toLowerCase()} flag`); }); },
  update() {
    const m = G.match;
    if (G.mp && G.mp.live && G.mp.client) { for (const f of flags) { if (f.state === 'carried' && f.carrier) { f.x = f.carrier.x; f.y = f.carrier.y + 0.6; f.z = f.carrier.z; } f.mesh.position.set(f.x, f.y, f.z); f.cloth.rotation.y = Math.sin(G.realTime * 3 + f.team) * 0.25; } return; }
    for (const f of flags) {
      if (f.state === 'carried') { const c = f.carrier; if (!c.alive) { flagHome(f); continue; } f.x = c.x; f.y = c.y + 0.6; f.z = c.z; }
      if (f.state === 'dropped' && G.now - f.dropAt > 30) { flagHome(f); hud.notice(`${ctfName(f.team)} flag returned`); }
      for (const u of G.units) {
        if (!u.alive || f.state === 'carried' || Math.hypot(u.x - f.x, u.z - f.z) > 1.3 || Math.abs(u.y - f.y) > 1.6) continue;
        if (u.team === f.team) {
          if (f.state === 'dropped') { flagHome(f); hud.notice(`${ctfName(f.team)} flag returned by ${u.name}`); play('pickup'); }
        } else if (!flags.some((q) => q.carrier === u)) {
          f.state = 'carried'; f.carrier = u;
          hud.notice(u.isPlayer ? 'You have the flag! Bring it home.' : `${u.name} has the ${ctfName(f.team).toLowerCase()} flag`); play('radio');
        }
      }
      // capture: carrier reaches own base while own flag is home
      const c = f.carrier, own = c && flags[c.team];
      if (c && own.state === 'home' && Math.hypot(c.x - own.base.x, c.z - own.base.z) < 1.6 && Math.abs(c.y - own.base.y) < 1.6) {
        m.teamScores[c.team]++; flagHome(f);
        m.finalEvent = { killer: c, victim: c, at: G.now, weapon: 'flag', label: 'Winning capture' };
        hud.banner(c.team === G.player.team ? 'Flag captured' : 'Enemy captured', `${TEAMS[0].name} ${m.teamScores[0]} : ${m.teamScores[1]} ${TEAMS[1].name}`);
        play(c.team === G.player.team ? 'streak' : 'deny', null, { important: true });
        if (c.isPlayer) c.capt = (c.capt || 0) + 1;
        hud.scoreChanged();
        if (m.teamScores[c.team] >= m.scoreLimit) return 'end';
      }
      f.mesh.position.set(f.x, f.y, f.z);
      f.cloth.rotation.y = Math.sin(G.realTime * 3 + f.team) * 0.25;
    }
  },
  isCarrier: (u) => flags.some((f) => f.carrier === u),
  // bots: carriers run home, others mostly attack, some guard or chase the flag carrier
  botGoal(u) {
    const mine = flags[u.team], theirs = flags[1 - u.team];
    if (!mine || !theirs) return null;
    if (theirs.carrier === u) return mine.base;
    if (mine.state === 'carried') return { x: mine.carrier.x, y: mine.carrier.y, z: mine.carrier.z, chase: mine.carrier };
    if (mine.state === 'dropped') return { x: mine.x, y: mine.y, z: mine.z };
    if (theirs.state === 'carried') return { x: theirs.carrier.x, y: theirs.carrier.y, z: theirs.carrier.z }; // escort
    if ((u.id % 3) === 0) return { x: mine.base.x + rand(-5, 5), y: mine.base.y, z: mine.base.z + rand(-5, 5) }; // defenders
    return { x: theirs.x, y: theirs.y, z: theirs.z };
  },
  score() { const m = G.match; return { an: TEAMS[0].name, a: String(m.teamScores[0]), bn: TEAMS[1].name, b: String(m.teamScores[1]), sub: `${isFinite(m.scoreLimit) ? 'First to ' + m.scoreLimit : 'No limit on'} captures · ${flagLine()}` }; },
  radar(ctx) { for (const f of flags) { ctx.fillStyle = TEAMS[f.team].color; ctx.fillRect(f.x - 1.4, f.z - 1.4, 2.8, 2.8); } },
  result() {
    const [a, b] = G.match.teamScores, me = G.player.team;
    const r = a === b ? 'draw' : (a > b) === (me === 0) ? 'victory' : 'defeat';
    return { result: r, title: r === 'draw' ? 'Draw' : r === 'victory' ? 'Victory' : 'Defeat', detail: `${TEAMS[0].name} ${a}  :  ${b} ${TEAMS[1].name} captures` };
  },
};
function flagLine() { return flags.map((f) => `${ctfName(f.team)} flag ${f.state === 'home' ? 'safe' : f.state === 'carried' ? 'taken' : 'dropped'}`).join(' · '); }
function disposeFlags() { for (const f of flags) { G.scene.remove(f.mesh); G.scene.remove(f.ring); } flags = []; }
export const ctfFlags = () => flags;

// =========================== ZOMBIES ===========================
// Endless rounds of melee undead. Points for hits and kills buy wall weapons and mystery box rolls; power-ups drop.
const Z = { hit: 10, kill: 80, head: 120, knife: 150, box: 950, revive: 100 };
// Zombies difficulty (separate from bot skill: zombies don't aim). spd = speed factor, dmg = claws, hp = health,
// alive = how many at once, pts = points per hit/kill.
export const ZDIFF = {
  easy: { label: 'Easy', spd: 0.85, dmg: 0.6, hp: 0.8, alive: 0.75, pts: 1.3 },
  normal: { label: 'Normal', spd: 1, dmg: 1, hp: 1, alive: 1, pts: 1 },
  hard: { label: 'Hard', spd: 1.08, dmg: 1.3, hp: 1.2, alive: 1.2, pts: 1 },
  nightmare: { label: 'Nightmare', spd: 1.18, dmg: 1.6, hp: 1.4, alive: 1.4, pts: 0.9 },
};
const zd = () => ZDIFF[G.match.zdiff] || ZDIFF.normal;
const humans = () => G.units.filter((u) => u.isPlayer || u.remote);
// zombie sprint as a share of your sprint: 50% in round 1, ~90% by round 11, your full sprint only from round ~14
const zFrac = (r) => Math.min(1.1, 0.5 + 0.04 * (r - 1));
const zClaw = (r) => (22 + Math.min(18, Math.max(0, r - 5) * 1.5)) * zd().dmg;
const WALL = ['mp5', 'm870', 'm4', 'ak47', 'spas12', 'm249', 'mk14', 'l96', 'deagle'];
const COST = { usp: 300, deagle: 600, mp5: 1000, m870: 1200, m4: 1400, ak47: 1500, spas12: 1500, m249: 2200, mk14: 1700, l96: 1800 };
const POWERUPS = [['maxammo', 'MAX AMMO', 0x66d0ff], ['insta', 'INSTA-KILL', 0xff5a4a], ['double', 'DOUBLE POINTS', 0xffd34d]];
let stations = [], powerups = [], boxRoll = null;
const zHealth = (r) => (r < 10 ? 75 + (r - 1) * 62 : Math.round(640 * Math.pow(1.1, r - 9))) * zd().hp;
function labelSprite(text, color = '#ffe2a6') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,12,14,0.75)'; x.fillRect(0, 0, 256, 64); x.fillStyle = color; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false })); s.scale.set(1.6, 0.4, 1); return s;
}
function buildStations() {
  disposeAll(stations);
  const spots = (G.world.pickups || []).slice();
  const box = spots.find((p) => p.type === 'health') || spots[0];
  let wi = 0;
  for (const p of spots) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
    if (p === box) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.7), std(0x5a3a22)); crate.position.y = 0.35; g.add(crate);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.06, 0.72), std(0x7fd0ff, { e: 0x7fd0ff, ei: 1.2 })); glow.position.y = 0.7; g.add(glow);
      const l = labelSprite(`MYSTERY BOX ${Z.box}`, '#9fe0ff'); l.position.y = 1.4; g.add(l);
      G.scene.add(g); stations.push({ kind: 'box', x: p.x, y: p.y, z: p.z, mesh: g });
    } else {
      const id = WALL[wi++ % WALL.length];
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), std(0x3b3f36)); board.position.y = 1.2; g.add(board);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), std(0x2b2e2a)); post.position.y = 0.6; g.add(post);
      const gun = gunModel(g, id, std(0xd8d2b8, { e: 0x6a5f3a, ei: 0.35 })); gun.rotation.set(0, Math.PI / 2, 0); gun.position.set(0, 1.2, 0.08); gun.scale.setScalar(1.3);
      const l = labelSprite(`${WEAPONS[id].name} ${COST[id]}`); l.position.y = 1.85; g.add(l);
      G.scene.add(g); stations.push({ kind: 'wall', id, cost: COST[id], x: p.x, y: p.y, z: p.z, mesh: g, label: l });
    }
  }
}
function nearStation() {
  const P = G.player; let best = null, bd = 1.8;
  for (const s of stations) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd && Math.abs(s.y - P.y) < 1.5) { bd = d; best = s; } }
  return best;
}
function zGive(id) {
  const P = G.player, guns = P.weapons.filter((w) => w !== 'knife');
  const max = G.match.slots === 'overkill' ? 3 : 2;
  if (guns.includes(id)) { const w = WEAPONS[id]; P.ammo[id] = { mag: w.mag, res: w.reserve }; hud.setAmmo(P); return; }
  if (guns.length < max) guns.push(id);
  else { const held = P.weapons[P.slot]; const i = guns.indexOf(held); guns[i >= 0 ? i : 0] = id; }
  giveWeapons([...guns, 'knife'], id);
}
function spend(n) { const m = G.match; if (m.points < n) { play('deny'); hud.notice('Not enough points'); return false; } m.points -= n; hud.scoreChanged(); return true; }
function addPoints(n) { const m = G.match; m.points += Math.round(n * (m.mode === 'zombies' ? zd().pts : 1)) * (G.now < m.doubleUntil ? 2 : 1); hud.scoreChanged(); }
let puKey = 0;
function spawnPowerup(x, y, z, forced, key) {
  const [id, name, col] = forced || pick(POWERUPS);
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), std(col, { e: col, ei: 1.4, m: 0.3 }));
  mesh.position.set(x, y + 0.8, z); G.scene.add(mesh);
  const p = { id, name, x, y, z, mesh, until: G.now + 25, key: key || ++puKey };
  powerups.push(p);
  if (G.mp && G.mp.live && G.mp.host) G.mp.bcast({ t: 'pu', a: '+', k: p.key, id, x, y, z });
}
function dropPowerup(i) { const p = powerups[i]; G.scene.remove(p.mesh); powerups.splice(i, 1); if (G.mp && G.mp.live && G.mp.host) G.mp.bcast({ t: 'pu', a: '-', k: p.key }); }
const coop = (u) => u && (u.isPlayer || u.remote);
function spinPowerups() { for (const p of powerups) { p.mesh.rotation.y += 0.04; p.mesh.position.y = p.y + 0.8 + Math.sin(G.realTime * 3) * 0.12; } }
function stationPrompt(P) {
  const s = P.alive && nearStation();
  if (!s) hud.prompt('');
  else if (s.kind === 'box') hud.prompt(boxRoll ? 'The box is spinning…' : `<kbd>${keyE()}</kbd> Mystery box · ${Z.box}`);
  else { const owned = P.weapons.includes(s.id); hud.prompt(`<kbd>${keyE()}</kbd> ${owned ? 'Ammo for' : 'Buy'} ${WEAPONS[s.id].name} · ${owned ? Math.round(s.cost / 2) : s.cost}`); }
}
function squadResupply() {
  const P = G.player; if (P.alive) { refillAmmo(); hud.setAmmo(P); }
  for (const u of G.units) if (u.remote && u.alive) G.mp.toRemote(u, { t: 'resupply', g: 2 });
  hud.notice('Between rounds: ammo refilled');
}
function goDown(v) {
  v.downed = G.now + 30; v.reviveT = 0; v.health = v.maxHealth || 100;
  if (v.isPlayer) { v.prone = true; v.crouch = false; hud.banner('You’re down!', 'A teammate can revive you · hold on 30 s', 'wave'); play('hurt'); }
  else if (v.remote) G.mp.toRemote(v, { t: 'mode', dn: 1 });
  G.mp.bcast && G.mp.bcast({ t: 'bn', a: `${v.name} is down`, b: 'Hold E next to them to revive' });
  if (!v.isPlayer) hud.notice(`${v.name} is down · hold ${keyE()} next to them to revive`);
}
function revive(v, by) {
  v.downed = 0; v.reviveT = 0; v.health = Math.round((v.maxHealth || 100) * 0.5);
  if (v.isPlayer) { v.prone = false; hud.banner('Revived', by ? `by ${by.name}` : 'Round survived', 'streak'); }
  else if (v.remote) G.mp.toRemote(v, { t: 'mode', dn: 0, hp: v.health });
  if (by) { addPoints(Z.revive); if (!v.isPlayer) hud.notice(`${by.name} revived ${v.name}`); }
}
const nearDowned = (u) => G.units.find((d) => d !== u && d.downed && d.alive && Math.hypot(d.x - u.x, d.z - u.z) < 1.9 && Math.abs(d.y - u.y) < 1.5);
function reviveTick(dt) {
  const P = G.player, ups = humans().filter((h) => h.alive && !h.downed);
  for (const v of humans()) {
    if (!v.alive || !v.downed) continue;
    if (!ups.length || G.now > v.downed) { v.downed = 0; if (v.remote) G.mp.toRemote(v, { t: 'mode', dn: 0 }); kill(v, null, { weapon: 'bleed' }); continue; }
    const by = ups.find((h) => (h.isPlayer ? !!input.keys[G.profile.settings.keys.interact] : h.revHold) && Math.hypot(h.x - v.x, h.z - v.z) < 1.9);
    v.reviveT = by ? v.reviveT + dt : Math.max(0, v.reviveT - dt * 2);
    if (by && v.reviveT >= 3) revive(v, by);
  }
  if (P.alive && P.downed) hud.prompt(`You’re down · ${Math.ceil(P.downed - G.now)} s` + (P.reviveT > 0 ? ` · reviving ${Math.round(P.reviveT / 3 * 100)}%` : ''));
  else if (P.alive) { const d = nearDowned(P); if (d) hud.prompt(`Hold <kbd>${keyE()}</kbd> to revive ${d.name}` + (d.reviveT > 0 ? ` · ${Math.round(d.reviveT / 3 * 100)}%` : '')); }
}
function zombieName(r) { return r >= 8 && chance(0.2) ? 'BRUTE' : 'ZOMBIE'; }
const zombies = {
  noDrops: true, noStreaks: true, noPickups: true, waves: true, prompting: true,
  setup(m) { for (const u of G.units) u.downed = 0; m.points = 500; m.round = 0; m.wave = 0; m.roundState = 'none'; m.insta = 0; m.doubleUntil = 0; m.lives = 3; buildStations(); disposeAll(powerups); boxRoll = null; },
  cleanup() { disposeAll(stations); disposeAll(powerups); boxRoll = null; },
  weapons(u) { return u.isPlayer ? ['usp', 'knife'] : ['knife']; },
  modDamage(v, a, amt) {
    if (coop(a) && v.zombie && G.now < G.match.insta) return v.health + 1;
    if (v.downed) return 0;
    // co-op revives: a lethal hit downs a player instead while another teammate is still up (host decides)
    if (coop(v) && amt >= v.health && G.mp && G.mp.live && !G.mp.client && humans().some((h) => h !== v && h.alive && !h.downed)) { goDown(v); return 0; }
    return amt;
  },
  onDamage(v, a, dmg, info) { if (coop(a) && v.zombie && v.alive) addPoints(Z.hit); },
  onKill(c, v, info) {
    if (!v.zombie) return;
    G.match.alive = Math.max(0, (G.match.alive || 0) - 1);
    if (coop(c)) addPoints(info.melee ? Z.knife : info.headshot ? Z.head : Z.kill);
    if (chance(G.match.round <= 5 ? 0.06 : 0.045)) spawnPowerup(v.x, v.y, v.z);
  },
  interact() {
    if (G.player.downed || nearDowned(G.player)) return true; // E is the revive key here
    const s = nearStation(); if (!s) return false;
    if (G.mp && G.mp.live && G.mp.client) { G.mp.send({ t: 'buy', s: stations.indexOf(s), have: G.player.weapons }); return true; } // the host keeps the squad's points
    if (s.kind === 'wall') {
      const owned = G.player.weapons.includes(s.id), cost = owned ? Math.round(s.cost / 2) : s.cost;
      if (spend(cost)) { zGive(s.id); play('pickup'); hud.notice(owned ? `${WEAPONS[s.id].name} ammo` : `Bought ${WEAPONS[s.id].name}`); }
    } else if (!boxRoll && spend(Z.box)) {
      const pool = shuffle(ALL_GUNS.concat(['rpg']).filter((g) => !G.player.weapons.includes(g)));
      boxRoll = { s, id: pool[0], at: G.now + 2.2 }; play('switch'); hud.notice('The box is deciding…');
    }
    return true;
  },
  // multiplayer host: a remote player buys (points are shared by the squad)
  netBuy(u, idx, have) {
    const s = stations[idx], m = G.match, no = (msg) => G.mp.toRemote(u, { t: 'deny', msg });
    if (!s || !u.alive || Math.hypot(s.x - u.x, s.z - u.z) > 2.6) return;
    const cost = s.kind === 'box' ? Z.box : have.includes(s.id) ? Math.round(s.cost / 2) : s.cost;
    if (s.kind === 'box' && boxRoll) return no('The box is spinning…');
    if (m.points < cost) return no('Not enough points');
    m.points -= cost; hud.scoreChanged();
    if (s.kind === 'wall') G.mp.toRemote(u, { t: 'give', id: s.id, owned: have.includes(s.id) });
    else { const pool = shuffle(ALL_GUNS.concat(['rpg']).filter((g) => !have.includes(g))); boxRoll = { s, id: pool[0], at: G.now + 2.2, u }; G.mp.toRemote(u, { t: 'deny', msg: 'The box is deciding…' }); }
  },
  // multiplayer client: the host's answers
  netGive(m) { zGive(m.id); play('pickup'); hud.notice(m.box ? `The box gave you ${WEAPONS[m.id].name}` : m.owned ? `${WEAPONS[m.id].name} ammo` : `Bought ${WEAPONS[m.id].name}`); },
  netPowerup(m) {
    if (m.a === '+') spawnPowerup(m.x, m.y, m.z, POWERUPS.find((p) => p[0] === m.id), m.k);
    else { const i = powerups.findIndex((p) => p.key === m.k); if (i >= 0) { G.scene.remove(powerups[i].mesh); powerups.splice(i, 1); } }
  },
  clientUpdate() {
    spinPowerups(); stationPrompt(G.player);
    const P = G.player, d = P.alive && !P.downed && nearDowned(P), hold = !!(d && input.keys[G.profile.settings.keys.interact]);
    if (hold !== !!P.revSent) { P.revSent = hold; G.mp.send({ t: 'hmsg', rev: hold ? 1 : 0 }); }
    if (P.alive && P.downed) hud.prompt(`You’re down · ${Math.max(0, Math.ceil(P.downed - G.now))} s · a teammate can revive you`);
    else if (d) hud.prompt(`Hold <kbd>${keyE()}</kbd> to revive ${d.name}`);
  },
  // downed players are mirrored (who, seconds left) so everyone sees the prompt
  netState() { return G.units.filter((u) => u.downed && u.alive).map((u) => [u.id, Math.max(0, Math.round(u.downed - G.now))]); },
  netApply(s, find) {
    const on = new Map(); for (const [id, t] of s) { const u = find(id); if (u) on.set(u, t); }
    for (const u of G.units) if (u !== G.player) u.downed = on.has(u) ? G.now + on.get(u) : 0;
    const P = G.player; if (P) { if (on.has(P)) P.downed = G.now + on.get(P); else if (P.downed && !P._dnMsg) P.downed = 0; }
  },
  netMsg(m) {
    const P = G.player; if (m.dn == null) return;
    if (m.dn) { P.downed = G.now + 30; P.prone = true; P.crouch = false; hud.banner('You’re down!', 'A teammate can revive you · hold on 30 s', 'wave'); play('hurt'); }
    else { P.downed = 0; P.prone = false; if (m.hp) { P.health = m.hp; hud.banner('Revived', '', 'streak'); } }
  },
  netHostMsg(u, m) { if (u) u.revHold = !!m.rev; },
  update() {
    const m = G.match, P = G.player;
    // rounds
    if (m.roundState === 'none' || (m.roundState === 'break' && G.now >= m.nextRoundAt)) {
      m.round++; m.wave = m.round; m.roundState = 'fighting';
      const np = Math.max(1, humans().length);
      m.toSpawn = Math.min(90, Math.round((5 + m.round * 2.2) * (1 + 0.6 * (np - 1)))); m.nextSpawnAt = G.now + 1.5;
      m.maxAlive = Math.max(4, Math.min(24, Math.round((4 + m.round) * (1 + 0.5 * (np - 1)) * zd().alive)));
      hud.banner(`Round ${m.round}`, m.round === 1 ? 'They’re coming. Buy weapons off the walls with points.' : `${m.toSpawn} undead`, 'wave'); play('wave', null, { important: true });
    }
    for (let i = G.bots.length - 1; i >= 0; i--) { const b = G.bots[i]; if (!b.alive && G.now > b.respawnAt + 0.8) G.removeBot(b); }
    const alive = G.bots.filter((b) => b.alive).length;
    if (m.roundState === 'fighting') {
      if (m.toSpawn > 0 && alive < (m.maxAlive || 6) && G.now >= m.nextSpawnAt) {
        m.nextSpawnAt = G.now + Math.max(0.5, 2.2 - m.round * 0.1); m.toSpawn--; m.alive = alive + 1;
        const name = zombieName(m.round), b = G.spawnBot({ name, team: 1, weapon: 'knife', type: 'zombie', uniform: pick([0x4a4a3c, 0x3d4436, 0x56493a]), accent: 0x2b2b26, skin: 0x7f8a66, noHelmet: true });
        b.zombie = true; b.maxHealth = b.health = Math.round(zHealth(m.round) * (name === 'BRUTE' ? 2 : 1)); b.brain.speedMul = zFrac(m.round) * zd().spd * (name === 'BRUTE' ? 0.85 : 1) * (PHYS.walk * PHYS.sprintMul * 0.95) / (PHYS.walk * WEAPONS.knife.speed * (G.match.ai.speed || 1) * PHYS.sprintMul); b.brain.alwaysHunt = true;
        b.clawDmg = zClaw(m.round) * (name === 'BRUTE' ? 1.5 : 1);
      }
      if (m.toSpawn <= 0 && alive === 0) { m.roundState = 'break'; m.nextRoundAt = G.now + 10; if (m.round <= 5 || m.round % 5 === 0) squadResupply(); for (const h of humans()) if (h.downed) revive(h, null); hud.banner(`Round ${m.round} survived`, 'Next round in 8 seconds', 'streak'); play('streak', null, { important: true }); }
    }
    m.remaining = m.toSpawn + alive;
    // box roll
    if (boxRoll && G.now >= boxRoll.at) {
      if (boxRoll.u) { if (boxRoll.u.rec) G.mp.toRemote(boxRoll.u, { t: 'give', id: boxRoll.id, box: 1 }); }
      else { zGive(boxRoll.id); hud.notice(`The box gave you ${WEAPONS[boxRoll.id].name}`); play('pickup'); }
      boxRoll = null;
    }
    // power-ups
    spinPowerups();
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      if (G.now > p.until) { dropPowerup(i); continue; }
      const taker = G.units.find((u) => coop(u) && u.alive && Math.hypot(u.x - p.x, u.z - p.z) < 1.3 && Math.abs(u.y - p.y) < 1.6);
      if (taker) {
        if (p.id === 'maxammo') { if (P.alive) { refillAmmo(); P.grenades = Math.max(P.grenades, 3); hud.setAmmo(P); } for (const u of G.units) if (u.remote && u.alive) G.mp.toRemote(u, { t: 'resupply', g: 3 }); }
        if (p.id === 'insta') m.insta = G.now + 30;
        if (p.id === 'double') m.doubleUntil = G.now + 30;
        hud.banner(p.name, p.id === 'maxammo' ? 'All weapons refilled' : '30 seconds', 'streak'); play('streak', null, { important: true });
        dropPowerup(i);
      }
    }
    stationPrompt(P);
    reviveTick(1 / 60);
  },
  score() {
    const m = G.match, fx = [G.now < m.insta ? 'Insta-kill' : '', G.now < m.doubleUntil ? 'Double points' : ''].filter(Boolean).join(' · ');
    return { an: 'Points', a: m.points.toLocaleString(), mid: 'Round', t: String(Math.max(1, m.round)), bn: 'Undead', b: String(m.remaining || 0), sub: 'Lives ' + Array.from({ length: Math.max(m.lives, 0) }, () => '<i class="life"></i>').join('') + (fx ? ' · ' + fx : '') };
  },
  result() { const m = G.match; return { result: 'survival', title: 'Overrun', detail: `You survived to round ${m.round} with ${m.points.toLocaleString()} points.` }; },
};

// ---------- practice range: dummies that stand still or ride a track, pop back up, never fight ----------
const rackOf = () => (G.profile.rangeRack || []).filter((id) => WEAPONS[id] && !WEAPONS[id].melee);
const range = {
  noDrops: true, noStreaks: true,
  // the range rack: carry any number of guns (B to pick; wheel, 1-9 or Q to switch)
  weapons(u) { const r = rackOf(); return u.isPlayer && r.length ? [...r, 'knife'] : null; },
  setup(m) {
    m.rules = { infAmmo: true, passive: true };
    if (G.mp && G.mp.live && G.mp.client) return; // co-op range: the host runs the dummies
    const look = { uniform: 0x8a7a58, accent: 0xb8402e, helmet: 0x3b4034 };
    for (const t of RANGE_TARGETS) { const b = G.spawnBot({ name: t.d + ' m', team: 9, weapon: 'knife', ...look }); b.dummy = { x: t.x, z: t.z }; }
    for (const r of RANGE_MOVERS) { const b = G.spawnBot({ name: r.d + ' m mover', team: 9, weapon: 'knife', ...look }); b.dummy = { x: r.x0, z: r.z, rail: r, dir: 1 }; }
  },
  spawnFor(u) { return u.dummy ? { x: u.dummy.x, y: 0, z: u.dummy.z, yaw: 0 } : null; },
  update(dt) {
    for (const b of G.bots) {
      const d = b.dummy; if (!d) continue;
      if (!b.alive) continue; // pops back up through the normal respawn
      if (d.rail) { const r = d.rail; d.x += r.speed * d.dir * dt; if (d.x > r.x1) { d.x = r.x1; d.dir = -1; } if (d.x < r.x0) { d.x = r.x0; d.dir = 1; } b.moveSpeed = r.speed; }
      b.x = d.x; b.z = d.z; b.y = 0; b.yaw = 0; b.health = Math.max(b.health, 1);
    }
  },
  score() { return { an: 'RANGE', a: String(G.player.kills), bn: 'BEST', b: String(G.match.bestHit || 0), sub: 'Practice range · B: range rack (carry any guns) · wheel / 1-9 / Q to switch' }; },
};
export const HOOKS = { gungame, infection, ctf, zombies, range };
