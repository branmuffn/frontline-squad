// Phase 5 modes as hooks on top of the shared match flow (match.js calls these when present).
// Hook fields: setup, weapons(u), onSpawn(u), onKill, onDamage, modDamage, update, result, score, botGoal, interact, prompting
import * as THREE from 'three';
import { G } from '../core/state.js';
import { WEAPONS, ALL_GUNS, TEAMS } from '../core/config.js';
import { rand, randInt, pick, shuffle, chance } from '../core/util.js';
import { supportHeight, blocked } from '../world/physics.js';
import { isEnemy } from '../entities/units.js';
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
  else { u.brain.guns = [id]; setBotWeapon(u, id, false); }
}
const gungame = {
  noDrops: true, noStreaks: true,
  setup() { for (const u of G.units) u.gg = 0; },
  weapons(u) { const id = GG_LADDER[u.gg || 0]; return id === 'knife' ? ['knife'] : [id, 'knife']; },
  onSpawn(u) { if (!u.isPlayer) ggArm(u); },
  onKill(c, v, info) {
    if (info.weapon === 'knife' && v.gg > 0 && c) { v.gg--; if (v.isPlayer) hud.banner('Demoted', `Back to ${WEAPONS[GG_LADDER[v.gg]].name}`); }
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
  convertBot(u, 'infected', 'knife');
}
const infection = {
  noDrops: true, noStreaks: true, ffaSpawns: true, teamNames: INF_TEAMS,
  setup(m) {
    for (const u of G.units) u.team = 0;
    m.teams = true;
    const first = pick(G.units.filter((u) => !u.isPlayer).concat(chance(1 / G.units.length) ? [G.player] : []));
    infect(first); m.firstInfected = first;
  },
  weapons(u) { return u.team === 1 ? ['knife'] : null; },
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
  update() {
    const m = G.match;
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
const Z = { hit: 10, kill: 60, head: 100, knife: 130, box: 950, maxAlive: 12 };
const WALL = ['mp5', 'm870', 'm4', 'ak47', 'spas12', 'm249', 'mk14', 'l96', 'deagle'];
const COST = { usp: 300, deagle: 600, mp5: 1000, m870: 1200, m4: 1400, ak47: 1500, spas12: 1500, m249: 2200, mk14: 1700, l96: 1800 };
const POWERUPS = [['maxammo', 'MAX AMMO', 0x66d0ff], ['insta', 'INSTA-KILL', 0xff5a4a], ['double', 'DOUBLE POINTS', 0xffd34d]];
let stations = [], powerups = [], boxRoll = null;
const zHealth = (r) => r < 10 ? 100 + (r - 1) * 60 : Math.round(640 * Math.pow(1.1, r - 9));
const zSpeed = (r) => Math.min(1.3, 0.55 + r * 0.09);
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
function addPoints(n) { const m = G.match; m.points += n * (G.now < m.doubleUntil ? 2 : 1); hud.scoreChanged(); }
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
function zombieName(r) { return r >= 8 && chance(0.2) ? 'BRUTE' : 'ZOMBIE'; }
const zombies = {
  noDrops: true, noStreaks: true, noPickups: true, waves: true, prompting: true,
  setup(m) { m.points = 500; m.round = 0; m.wave = 0; m.roundState = 'none'; m.insta = 0; m.doubleUntil = 0; m.lives = 3; buildStations(); disposeAll(powerups); boxRoll = null; },
  cleanup() { disposeAll(stations); disposeAll(powerups); boxRoll = null; },
  weapons(u) { return u.isPlayer ? ['usp', 'knife'] : ['knife']; },
  modDamage(v, a, amt) { return coop(a) && v.zombie && G.now < G.match.insta ? v.health + 1 : amt; },
  onDamage(v, a, dmg, info) { if (coop(a) && v.zombie && v.alive) addPoints(Z.hit); },
  onKill(c, v, info) {
    if (!v.zombie) return;
    G.match.alive = Math.max(0, (G.match.alive || 0) - 1);
    if (coop(c)) addPoints(info.melee ? Z.knife : info.headshot ? Z.head : Z.kill);
    if (chance(0.035)) spawnPowerup(v.x, v.y, v.z);
  },
  interact() {
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
  clientUpdate() { spinPowerups(); stationPrompt(G.player); },
  update() {
    const m = G.match, P = G.player;
    // rounds
    if (m.roundState === 'none' || (m.roundState === 'break' && G.now >= m.nextRoundAt)) {
      m.round++; m.wave = m.round; m.roundState = 'fighting'; m.toSpawn = Math.min(60, 6 + m.round * 3); m.nextSpawnAt = G.now + 1;
      hud.banner(`Round ${m.round}`, m.round === 1 ? 'They’re coming. Buy weapons off the walls with points.' : `${m.toSpawn} undead`, 'wave'); play('wave', null, { important: true });
    }
    for (let i = G.bots.length - 1; i >= 0; i--) { const b = G.bots[i]; if (!b.alive && G.now > b.respawnAt + 0.8) G.removeBot(b); }
    const alive = G.bots.filter((b) => b.alive).length;
    if (m.roundState === 'fighting') {
      if (m.toSpawn > 0 && alive < Z.maxAlive && G.now >= m.nextSpawnAt) {
        m.nextSpawnAt = G.now + Math.max(0.35, 1.6 - m.round * 0.1); m.toSpawn--; m.alive = alive + 1;
        const name = zombieName(m.round), b = G.spawnBot({ name, team: 1, weapon: 'knife', type: 'zombie', uniform: pick([0x4a4a3c, 0x3d4436, 0x56493a]), accent: 0x2b2b26, skin: 0x7f8a66, noHelmet: true });
        b.zombie = true; b.maxHealth = b.health = Math.round(zHealth(m.round) * (name === 'BRUTE' ? 2 : 1)); b.brain.speedMul = zSpeed(m.round) * (name === 'BRUTE' ? 0.8 : 1); b.brain.alwaysHunt = true;
      }
      if (m.toSpawn <= 0 && alive === 0) { m.roundState = 'break'; m.nextRoundAt = G.now + 8; hud.banner(`Round ${m.round} survived`, 'Next round in 8 seconds', 'streak'); play('streak', null, { important: true }); }
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
  },
  score() {
    const m = G.match, fx = [G.now < m.insta ? 'Insta-kill' : '', G.now < m.doubleUntil ? 'Double points' : ''].filter(Boolean).join(' · ');
    return { an: 'Points', a: m.points.toLocaleString(), mid: 'Round', t: String(Math.max(1, m.round)), bn: 'Undead', b: String(m.remaining || 0), sub: 'Lives ' + Array.from({ length: Math.max(m.lives, 0) }, () => '<i class="life"></i>').join('') + (fx ? ' · ' + fx : '') };
  },
  result() { const m = G.match; return { result: 'survival', title: 'Overrun', detail: `You survived to round ${m.round} with ${m.points.toLocaleString()} points.` }; },
};

export const HOOKS = { gungame, infection, ctf, zombies };
