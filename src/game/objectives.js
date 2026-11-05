// Objective modes (3e): Domination (hold A/B/C), King of the Hill (one moving hill), Search & Destroy (rounds, one life,
// plant/defuse). Hooks follow game/modes.js; the host decides everything and mirrors it with netState/netApply.
import * as THREE from 'three';
import { G } from '../core/state.js';
import { TEAMS } from '../core/config.js';
import { input } from '../core/input.js';
import { supportHeight, blocked } from '../world/physics.js';
import { damage } from '../entities/units.js';
import { explode } from '../entities/grenades.js';
import { play } from '../engine/audio.js';
import * as hud from '../ui/hud.js';

const isClient = () => !!(G.mp && G.mp.live && G.mp.client);
const keyE = () => { const k = G.profile.settings.keys.interact; return k.startsWith('Key') ? k.slice(3) : k; };
const holdingE = (u) => (u.isPlayer ? !!input.keys[G.profile.settings.keys.interact] : u.remote ? !!u.objHold : false);
const mine = (t) => G.player && t === G.player.team;
const teamName = (t) => (mine(t) ? 'Your team' : TEAMS[t].name);

// ---- objective points from the map's own spawns (walkable by construction): A near team 0, B middle, C near team 1
function centroid(l) { return [l.reduce((a, s) => a + s[0], 0) / l.length, l.reduce((a, s) => a + s[1], 0) / l.length]; }
function ground(x, z, y0 = 0) { return { x, z, y: supportHeight(x, z, 0.2, y0 + 0.6) }; }
function nearestSpawn(x, z, used) {
  const sp = G.world.spawns, all = sp.ffa.concat(sp.teams[0], sp.teams[1]); let best = null, bd = 1e9;
  for (const s of all) { if (used.some((u) => Math.hypot(u.x - s[0], u.z - s[1]) < 9)) continue; const d = Math.hypot(s[0] - x, s[1] - z); if (d < bd) { bd = d; best = s; } }
  return best ? ground(best[0], best[1], best[2] || 0) : ground(x, z);
}
export function objectivePoints(n) {
  const def = G.world.def; if (def.objectives && def.objectives.length >= n) return def.objectives.slice(0, n).map(([x, z, y = 0]) => ground(x, z, y));
  const [ax, az] = centroid(G.world.spawns.teams[0]), [bx, bz] = centroid(G.world.spawns.teams[1]), out = [];
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : 0.2 + 0.6 * i / (n - 1); out.push(nearestSpawn(ax + (bx - ax) * t, az + (bz - az) * t, out)); }
  return out;
}

// ---- zone visuals: ring on the ground, a light beam, a letter
function letter(t, col) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.7)'; x.fillStyle = col; x.strokeText(t, 32, 34); x.fillText(t, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(1.3, 1.3, 1); s.renderOrder = 19; return s;
}
function makeZone(p, name, r) {
  const g = new THREE.Group(); g.position.set(p.x, p.y + 0.04, p.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.2, r, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false })); ring.rotation.x = -Math.PI / 2; g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false })); beam.position.y = 4.5; g.add(beam);
  const lab = letter(name, '#ffffff'); lab.position.y = 3.2; g.add(lab);
  G.scene.add(g); return { ...p, name, r, g, ring, beam, lab, owner: -1, prog: 0 };
}
function tintZone(z) { const c = new THREE.Color(z.owner < 0 ? 0xdedede : TEAMS[z.owner].hex); z.ring.material.color.copy(c); z.beam.material.color.copy(c); }
function disposeZones(list) { for (const z of list) { G.scene.remove(z.g); z.g.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); }); } list.length = 0; }
const inZone = (u, z) => u.alive && Math.hypot(u.x - z.x, u.z - z.z) < z.r && Math.abs(u.y - z.y) < 2.5;
function presence(z) { const n = [0, 0]; for (const u of G.units) if ((u.team === 0 || u.team === 1) && inZone(u, z)) n[u.team]++; return n; }
const teamResult = (unit) => () => {
  const [a, b] = G.match.teamScores, me = G.player.team, r = a === b ? 'draw' : (a > b) === (me === 0) ? 'victory' : 'defeat';
  return { result: r, title: r === 'draw' ? 'Draw' : r === 'victory' ? 'Victory' : 'Defeat', detail: `${TEAMS[0].name} ${a}  :  ${b} ${TEAMS[1].name} ${unit}` };
};
function radarZones(ctx, list) { for (const z of list) { ctx.strokeStyle = z.owner < 0 ? '#dedede' : TEAMS[z.owner].color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(z.x, z.z, z.r, 0, Math.PI * 2); ctx.stroke(); } }

// =========================== DOMINATION ===========================
let dz = [], domAcc = 0;
export const dom = {
  setup() { disposeZones(dz); dz = objectivePoints(3).map((p, i) => makeZone(p, 'ABC'[i], 3.6)); dz.forEach(tintZone); domAcc = 0; },
  cleanup() { disposeZones(dz); },
  update(dt) {
    const m = G.match;
    if (isClient()) { dz.forEach(tintZone); return; }
    for (const z of dz) {
      const [a, b] = presence(z), lead = a > 0 && b === 0 ? 0 : b > 0 && a === 0 ? 1 : -1;
      if (lead < 0) continue; // empty or contested
      const dir = lead === 0 ? 1 : -1, was = z.owner;
      z.prog = Math.max(-1, Math.min(1, z.prog + dir * dt * 0.22 * Math.min(3, a + b)));
      if (Math.abs(z.prog) >= 1 && z.owner !== lead) z.owner = lead;
      else if (z.owner >= 0 && z.owner !== lead && Math.abs(z.prog) < 0.5) z.owner = -1; // neutralised
      if (z.owner !== was) { tintZone(z); if (z.owner >= 0) { hud.notice(`${teamName(z.owner)} captured ${z.name}`); play(mine(z.owner) ? 'streak' : 'deny', null, { important: true }); } }
    }
    domAcc += dt;
    if (domAcc >= 2) { domAcc -= 2; for (const z of dz) if (z.owner >= 0) m.teamScores[z.owner]++; hud.scoreChanged(); }
    if (m.scoreLimit && (m.teamScores[0] >= m.scoreLimit || m.teamScores[1] >= m.scoreLimit)) return 'end';
  },
  botGoal(u) { // go for the nearest zone your team doesn't own; every third bot guards an owned one
    const want = dz.filter((z) => z.owner !== u.team), own = dz.filter((z) => z.owner === u.team), pool = (u.id % 3 === 0 && own.length) ? own : want.length ? want : dz;
    const z = pool.slice().sort((a, b) => Math.hypot(a.x - u.x, a.z - u.z) - Math.hypot(b.x - u.x, b.z - u.z))[(u.id % 2) && pool.length > 1 ? 1 : 0];
    return z ? { x: z.x + Math.sin(u.id) * 1.5, y: z.y, z: z.z + Math.cos(u.id) * 1.5 } : null;
  },
  netState() { return dz.map((z) => [z.owner, Math.round(z.prog * 100)]); },
  netApply(s) { s.forEach(([o, p], i) => { const z = dz[i]; if (!z) return; if (z.owner !== o) { z.owner = o; tintZone(z); } z.prog = p / 100; }); },
  score() { const m = G.match; return { an: TEAMS[0].name, a: String(m.teamScores[0]), bn: TEAMS[1].name, b: String(m.teamScores[1]), sub: `${m.scoreLimit ? 'First to ' + m.scoreLimit : 'No limit'} · ` + dz.map((z) => `${z.name} ${z.owner < 0 ? '–' : mine(z.owner) ? 'ours' : 'theirs'}`).join(' · ') }; },
  radar(ctx) { radarZones(ctx, dz); },
  result: teamResult('points'),
};

// =========================== KING OF THE HILL ===========================
let hills = [], hill = null, hillI = 0, hillMove = 0, hillAcc = 0;
function placeHill(i) { if (hill) disposeZones([hill]); hillI = i % hills.length; hill = makeZone(hills[hillI], '♛', 4.2); tintZone(hill); hillMove = G.now + 60; }
export const koth = {
  setup() { if (hill) disposeZones([hill]); hill = null; hills = objectivePoints(4); hills = [hills[1], hills[3], hills[0], hills[2]]; placeHill(0); hillAcc = 0; },
  cleanup() { if (hill) disposeZones([hill]); hill = null; },
  update(dt) {
    const m = G.match; if (!hill) return;
    if (isClient()) return;
    if (G.now > hillMove) { placeHill(hillI + 1); hud.banner('The hill moved', 'Follow the beam', 'wave'); G.mp && G.mp.bcast && G.mp.bcast({ t: 'bn', a: 'The hill moved', b: 'Follow the beam' }); }
    const [a, b] = presence(hill), lead = a > 0 && b === 0 ? 0 : b > 0 && a === 0 ? 1 : -1;
    if (hill.owner !== lead) { hill.owner = lead; tintZone(hill); }
    if (lead >= 0) { hillAcc += dt; if (hillAcc >= 1) { hillAcc -= 1; m.teamScores[lead]++; hud.scoreChanged(); } }
    if (m.scoreLimit && (m.teamScores[0] >= m.scoreLimit || m.teamScores[1] >= m.scoreLimit)) return 'end';
  },
  botGoal(u) { return hill ? { x: hill.x + Math.sin(u.id * 2.1) * 2, y: hill.y, z: hill.z + Math.cos(u.id * 2.1) * 2 } : null; },
  netState() { return [hillI, hill ? hill.owner : -1, Math.round(Math.max(0, hillMove - G.now))]; },
  netApply(s) { const [i, o, t] = s; if (!hills.length) return; if (!hill || i !== hillI) placeHill(i); hillMove = G.now + t; if (hill.owner !== o) { hill.owner = o; tintZone(hill); } },
  score() { const m = G.match, t = Math.max(0, Math.ceil(hillMove - G.now)); return { an: TEAMS[0].name, a: String(m.teamScores[0]), bn: TEAMS[1].name, b: String(m.teamScores[1]), sub: `${m.scoreLimit ? 'First to ' + m.scoreLimit : 'No limit'} · hill ${!hill || hill.owner < 0 ? 'open' : mine(hill.owner) ? 'ours' : 'theirs'} · moves in ${t} s` }; },
  radar(ctx) { if (hill) radarZones(ctx, [hill]); },
  result: teamResult('seconds on the hill'),
};

// =========================== SEARCH & DESTROY ===========================
// Rounds of one life. Attackers (alternating each round) plant at A or B (hold E 3 s), defenders defuse (hold E 5 s).
// A round ends when a side is wiped out, the bomb explodes (35 s), it's defused or the 100 s clock runs out (defenders).
const SND = { plant: 3, defuse: 5, fuse: 35, round: 100, gap: 4, r: 3 };
let sites = [], bomb = null, sd = null;
function bombMesh(p) {
  const g = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3f36, roughness: 0.6 }));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); led.position.set(0.12, 0.13, 0); box.position.y = 0.11; g.add(box); g.add(led);
  g.position.set(p.x, p.y, p.z); G.scene.add(g); return { g, led };
}
function clearBomb() { if (bomb && bomb.mesh) { G.scene.remove(bomb.mesh.g); } bomb = null; }
function alive(t) { return G.units.filter((u) => u.alive && u.team === t); }
function newRound(first) {
  const m = G.match; clearBomb();
  sd.round++; sd.att = first ? 0 : 1 - sd.att; sd.state = 'live'; sd.until = G.now + SND.round; sd.site = Math.random() < 0.5 ? 0 : 1; sd.prog = 0;
  for (const u of G.units) { u.plantT = 0; u.respawnAt = G.now; if (u.alive && !first) u.alive = u.alive; }
  if (!first) m.resetRound();
  const me = G.player.team === sd.att;
  hud.banner(`Round ${sd.round}`, me ? `Attack: plant the bomb at A or B (hold ${keyE()})` : 'Defend A and B: stop the plant, or defuse', 'wave'); play('wave', null, { important: true });
  hud.scoreChanged();
}
function endRound(winner, why) {
  const m = G.match; if (sd.state === 'over') return;
  sd.state = 'over'; sd.next = G.now + SND.gap; m.teamScores[winner]++;
  const msg = `${teamName(winner)} won the round`;
  hud.banner(msg, why, mine(winner) ? 'streak' : 'wave'); play(mine(winner) ? 'streak' : 'deny', null, { important: true });
  if (G.mp && G.mp.bcast) G.mp.bcast({ t: 'bn', a: `${TEAMS[winner].name} won the round`, b: why });
  hud.scoreChanged();
}
export const snd = {
  setup(m) { disposeZones(sites); clearBomb(); const p = objectivePoints(3); sites = [makeZone(p[2], 'A', SND.r), makeZone(nearestSpawn(p[2].x * 0.5 + p[1].x * 0.5 + 8, p[2].z * 0.5 + p[1].z * 0.5 + 8, [p[2]]), 'B', SND.r)]; sites.forEach(tintZone); sd = { round: 0, att: 0, state: 'live', until: 0, next: 0 }; if (!isClient()) newRound(true); },
  cleanup() { disposeZones(sites); clearBomb(); },
  holdRespawn() { return true; }, // one life per round
  // attackers start on team 0's side, defenders on team 1's side (so the sites are always in the defenders' half)
  spawnFor(u) {
    if (!sd || !(u.team === 0 || u.team === 1)) return null;
    const list = G.world.spawns.teams[u.team === sd.att ? 0 : 1]; let best = null, bs = -1e9;
    for (const [x, z, sy] of list) { const y = supportHeight(x, z, 0.2, (sy || 0) + 0.5); if (blocked(x, z, 0.4, y, 1.8)) continue; let s = Math.random() * 3; for (const o of G.units) if (o !== u && o.alive && Math.hypot(o.x - x, o.z - z) < 1.3) s -= 100; if (s > bs) { bs = s; best = { x, y, z }; } }
    if (best) best.yaw = Math.atan2(best.x, best.z); return best;
  },
  update(dt) {
    const m = G.match; if (!sd) return;
    if (bomb && bomb.mesh) bomb.mesh.led.visible = Math.sin(G.now * (bomb.at ? 8 + 20 * (1 - (bomb.at - G.now) / SND.fuse) : 4)) > 0;
    if (isClient()) return;
    if (sd.state === 'over') { if (G.now > sd.next) { if (m.teamScores[0] >= m.scoreLimit || m.teamScores[1] >= m.scoreLimit) return 'end'; newRound(false); } return; }
    const att = sd.att, def = 1 - att, A = alive(att), D = alive(def);
    if (bomb && bomb.at) { // planted: defenders defuse
      if (G.now >= bomb.at) { const b = bomb; explode(b.x, b.y + 0.3, b.z, b.planter, 'frag', 2.2); for (const u of G.units) if (u.alive && Math.hypot(u.x - b.x, u.z - b.z) < 9) damage(u, 300, b.planter && b.planter.alive ? b.planter : null, { weapon: 'bomb', explosive: true }); clearBomb(); return endRound(att, 'The bomb went off'); }
      const by = D.find((u) => Math.hypot(u.x - bomb.x, u.z - bomb.z) < 1.6 && (u.brain ? !u.brain.visible : holdingE(u)));
      bomb.def = by ? bomb.def + dt : Math.max(0, bomb.def - dt * 2);
      if (by && by.isPlayer) hud.prompt(`Defusing… ${Math.round(bomb.def / SND.defuse * 100)}%`);
      if (bomb.def >= SND.defuse) { clearBomb(); return endRound(def, 'Bomb defused'); }
      if (!D.length) return endRound(att, 'Defenders eliminated');
    } else {
      if (!A.length) return endRound(def, 'Attackers eliminated');
      if (G.now > sd.until) return endRound(def, 'Time ran out');
      for (const u of A) { // plant: hold E inside a site (bots: when nobody's shooting at them)
        const s = sites.find((z) => inZone(u, z)), on = s && (u.brain ? !u.brain.visible : holdingE(u));
        u.plantT = on ? (u.plantT || 0) + dt : 0;
        if (on && u.isPlayer) hud.prompt(`Planting… ${Math.round(u.plantT / SND.plant * 100)}%`);
        if (u.plantT >= SND.plant) {
          bomb = { x: u.x, y: u.y, z: u.z, at: G.now + SND.fuse, def: 0, planter: u, site: s.name }; bomb.mesh = bombMesh(bomb); u.plantT = 0;
          hud.banner('Bomb planted', `Site ${s.name} · ${SND.fuse} s`, 'wave'); play('radio', null, { important: true }); if (G.mp && G.mp.bcast) G.mp.bcast({ t: 'bn', a: 'Bomb planted', b: `Site ${s.name}` });
          break;
        }
      }
    }
    if (!D.length && !(bomb && bomb.at)) return endRound(att, 'Defenders eliminated');
    const P = G.player; if (P.alive && !bomb && P.team === att && sites.some((z) => inZone(P, z)) && !P.plantT) hud.prompt(`Hold <kbd>${keyE()}</kbd> to plant`);
    if (P.alive && bomb && bomb.at && P.team === def && Math.hypot(P.x - bomb.x, P.z - bomb.z) < 1.6 && !bomb.def) hud.prompt(`Hold <kbd>${keyE()}</kbd> to defuse`);
  },
  interact() { return true; }, // E is the plant/defuse key here (held)
  netHostMsg(u, m) { if (u && m.obj != null) u.objHold = !!m.obj; },
  clientUpdate() {
    const P = G.player, hold = !!input.keys[G.profile.settings.keys.interact];
    if (hold !== !!P.objSent) { P.objSent = hold; G.mp.send({ t: 'hmsg', obj: hold ? 1 : 0 }); }
    if (bomb && bomb.mesh) bomb.mesh.led.visible = Math.sin(G.now * 10) > 0;
  },
  botGoal(u) {
    if (!sd || sd.state !== 'live') return null;
    if (bomb && bomb.at) return { x: bomb.x + (u.team === sd.att ? Math.sin(u.id) * 4 : 0), y: bomb.y, z: bomb.z + (u.team === sd.att ? Math.cos(u.id) * 4 : 0) };
    const s = u.team === sd.att ? sites[sd.site] : sites[u.id % 2];
    return s ? { x: s.x + Math.sin(u.id * 1.7) * 1.2, y: s.y, z: s.z + Math.cos(u.id * 1.7) * 1.2 } : null;
  },
  netState() { return [sd ? sd.round : 0, sd ? sd.att : 0, sd ? ['live', 'over'].indexOf(sd.state) : 0, sd ? Math.round(Math.max(0, sd.until - G.now)) : 0, bomb && bomb.at ? [Math.round(bomb.x * 50) / 50, Math.round(bomb.y * 50) / 50, Math.round(bomb.z * 50) / 50, Math.round((bomb.at - G.now) * 10) / 10] : 0]; },
  netApply(s) {
    if (!sd) return; const [r, att, st, left, b] = s;
    if (r !== sd.round) { sd.round = r; hud.banner(`Round ${r}`, G.player.team === att ? 'Attack: plant at A or B' : 'Defend A and B', 'wave'); }
    sd.att = att; sd.state = st === 1 ? 'over' : 'live'; sd.until = G.now + left;
    if (b && !bomb) { bomb = { x: b[0], y: b[1], z: b[2], at: G.now + b[3] }; bomb.mesh = bombMesh(bomb); } else if (b && bomb) bomb.at = G.now + b[3]; else if (!b && bomb) clearBomb();
  },
  score() {
    const m = G.match; if (!sd) return { an: TEAMS[0].name, a: '0', bn: TEAMS[1].name, b: '0', sub: '' };
    const t = bomb && bomb.at ? Math.max(0, Math.ceil(bomb.at - G.now)) : Math.max(0, Math.ceil(sd.until - G.now)), me = G.player.team === sd.att;
    return { an: TEAMS[0].name, a: String(m.teamScores[0]), mid: bomb && bomb.at ? 'Bomb' : 'Round ' + sd.round, t: String(t), bn: TEAMS[1].name, b: String(m.teamScores[1]), sub: `First to ${m.scoreLimit} rounds · you ${me ? 'attack' : 'defend'} · ${alive(0).length} v ${alive(1).length}` };
  },
  radar(ctx) { radarZones(ctx, sites); if (bomb && bomb.at) { ctx.fillStyle = '#ff3020'; ctx.fillRect(bomb.x - 1.5, bomb.z - 1.5, 3, 3); } },
  result: teamResult('rounds'),
};
