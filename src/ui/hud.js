import * as THREE from 'three';
import { G } from '../core/state.js';
import { WEAPONS, TEAMS, STREAKS, MODES } from '../core/config.js';
import { myPicks, killsFor } from '../entities/streaks.js';
import { $, esc, fmtTime, clamp } from '../core/util.js';
import { binding } from '../core/input.js';
import { rayUnits, rayWorld } from '../world/physics.js';
import { weaponLabel, isEnemy } from '../entities/units.js';
import { streakState } from '../entities/streaks.js';
import { grenades } from '../entities/grenades.js';
import { pickups } from '../entities/pickups.js';
import { standings } from '../game/match.js';

const cache = {};
function set(id, prop, v) { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const el = $(id); if (!el) return; if (prop === 'text') el.textContent = v; else if (prop === 'html') el.innerHTML = v; else el.style[prop] = v; }
const arcs = [], tags = [], warns = [];
let radarCtx, radarT = 0, boardOpen = false, boardT = 0, bannerQ = [], bannerUntil = 0, centerUntil = 0, noticeUntil = 0, hitUntil = 0, dmgFlash = 0, aimT = 0, deathInfo = null;
const _v = new THREE.Vector3();

const KEYNAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`', Escape: 'Esc', Enter: 'Enter' };
export function codeName(code) {
  if (!code) return '—';
  if (KEYNAMES[code]) return KEYNAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code.startsWith('Arrow')) return code.slice(5) + ' arrow';
  return code;
}
export const keyName = (action) => codeName(binding(action));

export function initHud() {
  radarCtx = $('radar').getContext('2d');
  for (let i = 0; i < 6; i++) { const el = document.createElement('div'); el.className = 'arc'; $('arcs').appendChild(el); arcs.push({ el, t: -10, sx: 0, sz: 0 }); }
  for (let i = 0; i < 6; i++) { const el = document.createElement('div'); el.className = 'tag'; $('tags').appendChild(el); tags.push(el); }
  for (let i = 0; i < 3; i++) { const el = document.createElement('div'); el.className = 'nadewarn'; el.innerHTML = '<i></i><span></span>'; $('arcs').appendChild(el); warns.push(el); }
}

export function startMatch() {
  const m = G.match;
  $('hud').classList.add('active');
  $('killfeed').innerHTML = ''; $('xpfeed').innerHTML = '';
  for (const k in cache) delete cache[k];
  bannerQ = []; bannerUntil = 0; deathInfo = null;
  $('death').classList.add('hidden'); $('board').classList.add('hidden'); boardOpen = false;
  $('banner').classList.remove('show');
  const lim = m.mode === 'sandbox' ? 'Sandbox · press B for weapons' : m.mode === 'tdm' ? (isFinite(m.scoreLimit) ? `First team to ${m.scoreLimit}` : 'No score limit') : m.mode === 'ffa' ? (isFinite(m.scoreLimit) ? `First to ${m.scoreLimit}` : 'No kill limit') : 'Three lives';
  $('score').className = 'score mode-' + (m.teams ? 'tdm' : m.mode === 'survival' ? 'survival' : 'ffa');
  $('score').innerHTML = m.mode === 'survival' || m.mode === 'zombies'
    ? `<div class="sc-side"><small id="scAn">Points</small><b id="scA">0</b></div><div class="sc-mid"><small>${m.mode === 'zombies' ? 'Round' : 'Wave'}</small><b id="scT">1</b></div><div class="sc-side"><small id="scBn">Hostiles</small><b id="scB">0</b></div><div class="sc-sub" id="scSub"></div>`
    : `<div class="sc-side a"><small id="scAn">${m.teams ? TEAMS[0].name : 'You'}</small><b id="scA">0</b></div><div class="sc-mid"><b id="scT">--:--</b></div><div class="sc-side b"><small id="scBn">${m.teams ? TEAMS[1].name : 'Leader'}</small><b id="scB">0</b></div><div class="sc-sub" id="scSub">${lim}</div>`;
  $('mapLabel').textContent = `${G.world.def.name} · ${MODES[m.mode].name}`;
  const pips = $('pip0') && $('pip0').parentElement; if (pips) pips.style.visibility = m.hook && m.hook.noStreaks ? 'hidden' : '';
  setStreaks(0, []);
  scoreChanged();
}
let hudMagText = '';
// vehicle panel (null hides it)
let vhShown = false, vhKeysFor = -1;
export function vehicleHud(v, seat, kmh, heat, over, alt = -1) {
  if (!v) { if (vhShown) { $('vehHud').classList.add('hidden'); $('hud').classList.remove('in-vehicle'); vhShown = false; vhKeysFor = -1; } return; }
  if (!vhShown) { $('vehHud').classList.remove('hidden'); $('hud').classList.add('in-vehicle'); vhShown = true; }
  $('vhHp').style.width = Math.max(0, v.hp / v.spec.hp * 100).toFixed(1) + '%';
  $('vhHp').classList.toggle('low', v.hp < v.spec.hp * 0.35);
  $('vhName').textContent = v.spec.name;
  $('vhSpeed').textContent = seat === 0 ? Math.round(kmh) + ' km/h' + (alt >= 0 ? `   ${Math.round(alt)} m up` : '') : 'Gunner';
  $('vhHeatWrap').classList.toggle('hidden', seat !== 1);
  if (seat === 1) { $('vhHeat').style.width = (heat * 100).toFixed(1) + '%'; $('vhHeat').classList.toggle('over', !!over); }
  $('hud').classList.toggle('gunner', seat === 1);
  const kf = v.type + seat; if (vhKeysFor !== kf) { vhKeysFor = kf; $('vhKeys').innerHTML = [`<kbd>${esc(keyName('interact'))}</kbd> Get out`, `<kbd>1</kbd> ${v.type === 'heli' ? 'Fly' : 'Drive'}`, '<kbd>2</kbd> Gun', ...(seat === 0 ? v.spec.keys.map(([k, t]) => `<kbd>${k}</kbd> ${t}`) : [])].map((t) => `<span>${t}</span>`).join(''); }
}
export function endMatch() { $('hud').classList.remove('active'); $('scope').classList.remove('on'); $('board').classList.add('hidden'); boardOpen = false; }

export function scoreChanged() {
  const m = G.match, P = G.player; if (!m || !P) return;
  if (m.hook && m.hook.score) {
    const s = m.hook.score();
    set('scAn', 'text', s.an); set('scA', 'text', s.a); set('scBn', 'text', s.bn); set('scB', 'text', s.b); set('scSub', 'html', s.sub);
    if (s.t !== undefined) set('scT', 'text', s.t);
    return;
  }
  if (!m.teams && m.mode !== 'survival') {
    const others = G.units.filter((u) => u !== P).sort((a, b) => b.kills - a.kills);
    const lead = others[0];
    set('scA', 'text', String(P.kills));
    if (lead) { set('scB', 'text', String(lead.kills)); set('scBn', 'text', P.kills >= lead.kills ? `Next: ${lead.name}` : `Leader: ${lead.name}`); }
  } else if (m.teams) { set('scA', 'text', String(m.teamScores[0])); set('scB', 'text', String(m.teamScores[1])); }
  else {
    set('scA', 'text', m.points.toLocaleString()); set('scT', 'text', String(Math.max(1, m.wave)));
    set('scSub', 'html', 'Lives ' + Array.from({ length: Math.max(m.lives, 0) }, () => '<i class="life"></i>').join(''));
  }
}

export function setWeapon(P) {
  const w = WEAPONS[P.weapons[P.slot]];
  set('wName', 'text', w.name); set('wCls', 'text', w.cls);
  setAmmo(P);
}
export function setAmmo(P) {
  const id = P.weapons[P.slot], w = WEAPONS[id], a = P.ammo[id];
  if (w.melee) { set('wMag', 'text', '—'); set('wRes', 'text', ''); }
  else { set('wMag', 'text', String(a.mag)); set('wRes', 'text', '/ ' + a.res); set('wMag', 'color', a.mag <= Math.ceil(w.mag * 0.2) ? 'var(--red)' : ''); }
  set('nades', 'html', Array.from({ length: P.grenades }, () => '<i class="nade"></i>').join(''));
}

export function setStreaks(n, ready) {
  const picks = myPicks();
  picks.forEach((id, i) => { const el = $('pip' + i); if (!el) return; const k = killsFor(id); el.textContent = k; el.title = (STREAKS.find((s) => s.id === id) || {}).name || ''; el.classList.toggle('on', n >= k); });
  set('streakCount', 'text', n ? `${n} streak` : '');
  const r = ready ?? streakState.ready;
  set('streakReady', 'html', r.length ? `<kbd>${esc(keyName('streak'))}</kbd> ${esc(STREAKS.find((s) => s.id === r[0]).name)}${r.length > 1 ? ` <small>+${r.length - 1}</small>` : ''}` : '');
}

export function killfeed(killer, victim, weapon, headshot, suicide) {
  const P = G.player;
  const col = (u) => u === P ? 'me' : (P && !isEnemy(P, u) ? 'ally' : 'foe');
  const el = document.createElement('div'); el.className = 'kf';
  const wl = esc(weaponLabel(weapon));
  el.innerHTML = suicide
    ? `<span class="${col(victim)}">${esc(victim.name)}</span><em>${wl}</em><span class="muted">self</span>`
    : `<span class="${col(killer)}">${esc(killer.name)}</span><em>${wl}${headshot ? ' <b class="hs">HS</b>' : ''}</em><span class="${col(victim)}">${esc(victim.name)}</span>`;
  if (killer === P || victim === P) el.classList.add('involved');
  const f = $('killfeed'); f.prepend(el);
  while (f.children.length > 6) f.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 5200); setTimeout(() => el.remove(), 5600);
}

export function hitMarker(kind) {
  const h = $('hitmarker'); h.className = 'on ' + kind; hitUntil = G.realTime + (kind === 'kill' ? 0.35 : 0.14);
}

export function damageFrom(sx, sz, dmg) {
  const a = arcs.reduce((o, q) => (q.t < o.t ? q : o), arcs[0]);
  a.sx = sx; a.sz = sz; a.t = G.realTime; a.w = Math.min(1, 0.4 + dmg / 40);
  dmgFlash = Math.min(0.55, dmgFlash + dmg / 90);
}

export function xpPopup(label, amount) {
  const el = document.createElement('div'); el.className = 'xp';
  el.innerHTML = `<b>+${amount}</b> ${esc(label)}`;
  const f = $('xpfeed'); f.appendChild(el);
  while (f.children.length > 5) f.firstChild.remove();
  setTimeout(() => el.remove(), 2100);
}

let hintUntil = 0;
export function hint(title, text, secs = 8) { const h = $('hint'); h.innerHTML = `<b>${esc(title)}</b>${esc(text)}`; h.classList.add('show'); hintUntil = G.realTime + secs; }
// flashbang white-out: k 0..1 (how directly and how close); fades out over up to ~3.5 s
export function flash(k) {
  const el = document.getElementById('flashbang'); if (!el || k <= 0.02) return;
  el.style.transition = 'none'; el.style.opacity = String(Math.min(1, 0.25 + k)); void el.offsetWidth;
  el.style.transition = `opacity ${0.5 + 3 * k}s ease-in ${0.25 + 0.6 * k}s`; el.style.opacity = '0';
}
// practice range: the damage of each hit floats up from the target (head = gold), with the distance
const dmgPool = []; let dmgI = 0; const _pv = new THREE.Vector3();
export function dmgNumber(u, dmg, info) {
  if (!dmgPool.length) for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'dmgnum'; $('hud').appendChild(d); dmgPool.push(d); }
  _pv.set(u.x, u.y + u.h + 0.25, u.z).project(G.camera); if (_pv.z > 1) return;
  const el = dmgPool[dmgI++ % dmgPool.length], head = info.zone === 'head' || info.headshot;
  el.textContent = `${Math.round(dmg)}${head ? ' HEAD' : info.zone === 'groin' ? ' OUCH' : ''}${info.dist ? ` · ${Math.round(info.dist)} m` : ''}`;
  el.className = 'dmgnum' + (head ? ' head' : ''); el.style.left = ((_pv.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 30) + 'px'; el.style.top = ((-_pv.y * 0.5 + 0.5) * innerHeight) + 'px';
  void el.offsetWidth; el.classList.add('go');
}
export function notice(text) { if (!text) return; set('notice', 'text', text); $('notice').classList.add('show'); noticeUntil = G.realTime + 1.8; }
export function banner(title, sub = '', share) { if (share && G.mp && G.mp.host && G.mp.live) G.mp.banner(title, sub, share); bannerQ.push({ title, sub }); if (bannerQ.length > 4) bannerQ.shift(); }
export function center(text, dur = 0.95) { const c = $('center'); c.textContent = text; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); centerUntil = G.realTime + dur; }

export function showDeath(killer, info, respawnAt) {
  deathInfo = { respawnAt };
  const d = $('death'); d.classList.remove('hidden');
  if (killer) {
    $('deathTitle').innerHTML = `Eliminated by <span class="${isEnemy(G.player, killer) ? 'foe' : 'ally'}">${esc(killer.name)}</span>`;
    $('deathSub').textContent = `${weaponLabel(info.weapon)}${info.headshot ? ' · headshot' : ''}${killer.alive ? ` · ${Math.ceil(killer.health)} HP left` : ''}`;
  } else { $('deathTitle').textContent = 'You died'; $('deathSub').textContent = info.weapon === 'frag' ? 'Your own grenade' : ''; }
  if (respawnAt >= 99 && G.match.mode === 'survival') $('deathTimer').textContent = 'No lives left';
}
export function hideDeath() { $('death').classList.add('hidden'); deathInfo = null; }

export function toggleBoard(open) { boardOpen = open; $('board').classList.toggle('hidden', !open); if (open) drawBoard(); }

function drawBoard() {
  const m = G.match, P = G.player; if (!m) return;
  const net = !!(G.mp && G.mp.live), human = (u) => u.isPlayer || u.remote || u.human;
  const ping = (u) => net ? `<td class="ping">${human(u) ? (u.ping != null ? u.ping + ' ms' : '–') : 'BOT'}</td>` : '';
  const row = (u) => `<tr class="${u === P ? 'me' : ''}${u.alive ? '' : ' dead'}"><td>${esc(u.name)}</td><td>${u.kills}</td><td>${u.deaths}</td><td>${u.assists || 0}</td><td>${u.streak || 0}</td>${ping(u)}</tr>`;
  const head = `<tr><th>Operator</th><th>K</th><th>D</th><th>A</th><th>Streak</th>${net ? '<th>Ping</th>' : ''}</tr>`;
  let html = `<div class="board-head"><b>${esc(MODES[m.mode].name)}</b><span>${esc(G.world.def.name)}</span><span>${m.mode === 'survival' ? `Wave ${m.wave}` : m.mode === 'zombies' ? `Round ${m.round}` : m.timed ? fmtTime(m.time) : ''}</span></div>`;
  if (m.teams) {
    for (const t of [0, 1]) {
      const us = G.units.filter((u) => u.team === t).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const tn = m.hook && m.hook.teamNames ? m.hook.teamNames[t].name : TEAMS[t].name, ts = m.mode === 'infection' ? us.length : m.teamScores[t];
      html += `<div class="board-team t${t}"><div class="bt-name">${tn}<b>${ts}</b></div><table>${head}${us.map(row).join('')}</table></div>`;
    }
  } else if (m.mode === 'survival' || m.mode === 'zombies') {
    html += `<div class="board-surv"><div><small>Points</small><b>${m.points.toLocaleString()}</b></div><div><small>Kills</small><b>${P.kills}</b></div><div><small>Lives</small><b>${m.lives}</b></div><div><small>Hostiles left</small><b>${m.remaining ?? 0}</b></div></div>`;
    if (net) html += `<table>${head}${G.units.filter(human).sort((a, b) => b.kills - a.kills).map(row).join('')}</table>`;
  } else html += `<table>${head}${standings().map(row).join('')}</table>`;
  $('board').innerHTML = html;
}

// ---------- per-frame ----------
export function updatePlayerHud(P, o) {
  const w = WEAPONS[P.weapons[P.slot]];
  const hp = Math.max(0, Math.ceil(P.health));
  set('hpNum', 'text', String(hp));
  set('hpFill', 'width', clamp(P.health / P.maxHealth * 100, 0, 100) + '%');
  set('hpFill', 'background', hp < 35 ? 'var(--red)' : '');
  set('protect', 'display', P.protectUntil > G.now ? 'block' : 'none');
  set('vignette', 'opacity', String(clamp((45 - hp) / 45, 0, 0.85).toFixed(2)));
  setAmmo(P);
  const scoped = !!(w.scope && P.adsT > 0.9);
  $('scope').classList.toggle('on', scoped);
  if (scoped && w.mags) { const m = w.mags[Math.min(P.zoomIdx || 0, w.mags.length - 1)], t = m + '×' + (w.mags.length > 1 ? '   (wheel or ' + keyName('zoom') + ' to change)' : ''); if (hudMagText !== t) { hudMagText = t; $('scopeMag').textContent = t; } }
  const hideCh = (P.adsT > 0.55 && !w.melee && !(w.pellets > 1)) || (w.scope && P.adsT < 0.9) || P.sprintT > 0.6;
  const fovRad = THREE.MathUtils.degToRad(G.camera.fov);
  const gap = clamp(o.spread * (window.innerHeight / 2) / Math.tan(fovRad / 2), 3, 120);
  set('crosshair', 'opacity', hideCh || w.melee ? (w.melee && !P.sprinting ? '1' : '0') : '1');
  const ch = $('crosshair');
  if (cache.chGap !== Math.round(gap)) { cache.chGap = Math.round(gap); ch.style.setProperty('--gap', Math.round(gap) + 'px'); }
  ch.classList.toggle('melee', !!w.melee);
  set('reloadBar', 'display', o.reloadP >= 0 ? 'block' : 'none');
  if (o.reloadP >= 0) set('reloadFill', 'width', Math.round(clamp(o.reloadP, 0, 1) * 100) + '%');
  set('cook', 'text', o.cook >= 0 ? o.cook.toFixed(1) : '');
  set('cook', 'color', o.cook >= 0 && o.cook < 1 ? 'var(--red)' : '');
}

export function updateHud(dt) {
  const m = G.match, P = G.player; if (!m || !P) return;
  const rt = G.realTime;
  if (m.mode === 'zombies') { if (rt > (cache.svT || 0)) { cache.svT = rt + 0.4; scoreChanged(); } }
  else if (m.mode !== 'survival') set('scT', 'text', m.timed ? fmtTime(m.time) : '∞');
  else { set('scB', 'text', String(m.remaining ?? 0)); if (m.waveState === 'intermission') set('scSub', 'html', `Next wave in ${Math.ceil(m.nextWaveAt - G.now)} · Lives ${m.lives}`); else if (rt > (cache.svT || 0)) { cache.svT = rt + 0.5; scoreChanged(); } }
  if (m.mode !== 'survival' && m.mode !== 'zombies') { if (rt > (cache.scT2 || 0)) { cache.scT2 = rt + 0.4; scoreChanged(); } }
  // timers
  if (rt > hitUntil) $('hitmarker').className = '';
  if (rt > noticeUntil) $('notice').classList.remove('show');
  if (rt > hintUntil) $('hint').classList.remove('show');
  if (rt > centerUntil) $('center').classList.remove('pop');
  if (rt > bannerUntil) {
    const b = $('banner');
    if (bannerQ.length) { const n = bannerQ.shift(); $('bannerTitle').textContent = n.title; $('bannerSub').textContent = n.sub; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); bannerUntil = rt + 2.6; }
    else b.classList.remove('show');
  }
  dmgFlash = Math.max(0, dmgFlash - dt * 1.6);
  set('dmgflash', 'opacity', dmgFlash.toFixed(2));
  // damage arcs follow your view as you turn
  for (const a of arcs) {
    const age = rt - a.t;
    if (age > 1.5) { if (a.el.style.opacity !== '0') a.el.style.opacity = '0'; continue; }
    const ang = Math.atan2(-(a.sx - P.x), -(a.sz - P.z)) - P.yaw;
    a.el.style.transform = `rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg)`;
    a.el.style.opacity = String((1 - age / 1.5) * a.w);
  }
  // grenade warnings
  let wi = 0;
  if (P.alive) for (const g of grenades) {
    if (wi >= warns.length) break;
    const d = Math.hypot(g.x - P.x, g.z - P.z);
    if (d > 9 || (g.owner !== P && !isEnemy(P, g.owner))) continue;
    const el = warns[wi++]; el.style.display = 'block';
    const ang = Math.atan2(-(g.x - P.x), -(g.z - P.z)) - P.yaw;
    el.style.transform = `rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg)`;
    el.lastChild.textContent = d.toFixed(0) + 'm';
  }
  for (; wi < warns.length; wi++) warns[wi].style.display = 'none';
  // death timer
  if (deathInfo && deathInfo.respawnAt < 99) set('deathTimer', 'text', `Respawn in ${Math.max(0, deathInfo.respawnAt - G.now).toFixed(1)}`);
  if (boardOpen && rt > boardT) { boardT = rt + 0.5; drawBoard(); }
  radarT -= dt; if (radarT <= 0) { radarT = 0.05; drawRadar(); }
  updateTags();
}

function updateTags() {
  const P = G.player, m = G.match, cam = G.camera;
  let ti = 0;
  const W = window.innerWidth, H = window.innerHeight;
  if (m.teams) for (const u of G.bots) {
    if (ti >= tags.length) break;
    if (!u.alive || u.team !== P.team) continue;
    _v.set(u.x, u.y + u.h + 0.35, u.z).project(cam);
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
    const d = Math.hypot(u.x - P.x, u.z - P.z);
    const el = tags[ti++];
    el.style.display = 'block'; el.className = 'tag ally';
    el.textContent = u.name;
    el.style.transform = `translate(${((_v.x + 1) / 2 * W).toFixed(0)}px, ${((1 - _v.y) / 2 * H).toFixed(0)}px) translate(-50%,-100%) scale(${clamp(14 / d, 0.65, 1).toFixed(2)})`;
  }
  for (; ti < tags.length; ti++) tags[ti].style.display = 'none';
  // name of the enemy under your crosshair
  if (G.realTime > aimT) {
    aimT = G.realTime + 0.1;
    let name = '';
    if (P.alive) {
      const c = cam.position, dx = -Math.sin(P.yaw) * Math.cos(P.pitch), dy = Math.sin(P.pitch), dz = -Math.cos(P.yaw) * Math.cos(P.pitch);
      const wh = rayWorld(c.x, c.y, c.z, dx, dy, dz, 90);
      const uh = rayUnits(c.x, c.y, c.z, dx, dy, dz, wh ? wh.t : 90, (u) => u === P);
      if (uh) name = (isEnemy(P, uh.unit) ? '' : '◆ ') + uh.unit.name;
      $('aimName').className = uh && !isEnemy(P, uh.unit) ? 'ally' : 'foe';
      const v = !uh && wh && wh.col && wh.col.vehicle; // a crewed enemy vehicle under the crosshair: its health
      if (v && v.alive && !P.vehicle) { const crew = v.seats.find((q) => q); if (crew && isEnemy(P, crew)) { const k = Math.max(0, v.hp / v.spec.hp); name = `${v.type === 'heli' ? 'HELICOPTER' : 'JEEP'} ${'▮'.repeat(Math.ceil(k * 8))}${'▯'.repeat(8 - Math.ceil(k * 8))} ${Math.round(k * 100)}%`; } }
    }
    set('aimName', 'text', name);
  }
}

function drawRadar() {
  const ctx = radarCtx, P = G.player, m = G.match, S = 180, R = 88, range = 40, sc = R / range;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(14,19,21,0.82)'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(232,227,211,0.08)'; ctx.lineWidth = 1;
  for (const r of [R / 3, R * 2 / 3]) { ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.translate(S / 2, S / 2); ctx.rotate(P.yaw); ctx.scale(sc, sc); ctx.translate(-P.x, -P.z);
  for (const c of G.world.colliders) {
    if (c.rayOnly) continue;
    if (c.maxY < P.y + 0.7 || c.minY > P.y + 2.2 || c.maxX < P.x - range * 1.5 || c.minX > P.x + range * 1.5 || c.maxZ < P.z - range * 1.5 || c.minZ > P.z + range * 1.5) continue;
    ctx.fillStyle = c.maxY - c.minY > 2.2 ? 'rgba(170,176,170,0.55)' : 'rgba(150,156,150,0.3)';
    ctx.fillRect(c.minX, c.minZ, c.maxX - c.minX, c.maxZ - c.minZ);
  }
  ctx.fillStyle = 'rgba(150,156,150,0.22)';
  for (const r of G.world.ramps) ctx.fillRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
  for (const p of pickups) {
    if (!p.available) continue;
    ctx.fillStyle = p.type === 'health' ? '#5fe08a' : '#e0b35a';
    ctx.fillRect(p.x - 0.6, p.z - 0.6, 1.2, 1.2);
  }
  if (streakState.jamUntil > G.now) { // counter-UAV: static
    for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(200,210,200,${(Math.random() * 0.5).toFixed(2)})`; ctx.fillRect(P.x + (Math.random() - 0.5) * 60, P.z + (Math.random() - 0.5) * 60, 1.6, 1.6); }
    ctx.restore(); return;
  }
  const uav = streakState.uavUntil > G.now;
  const pings = new Map();
  for (const n of G.noise) if (G.now - n.t < 1.6 && n.r >= 25 && n.src && n.src !== P) pings.set(n.src, Math.max(pings.get(n.src) || 0, 1 - (G.now - n.t) / 1.6));
  for (const u of G.units) {
    if (u === P || !u.alive) continue;
    const ally = !isEnemy(P, u);
    let a = ally ? 1 : uav ? 1 : pings.get(u) || 0;
    if (a <= 0) continue;
    ctx.globalAlpha = a; ctx.fillStyle = ally ? '#6aa6e6' : '#e5604a';
    ctx.beginPath(); ctx.arc(u.x, u.z, ally ? 1.2 : 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (m.hook && m.hook.radar) m.hook.radar(ctx);
  for (const s of streakState.sentries) { ctx.fillStyle = isEnemy(s.owner, G.player) ? '#ff6b5a' : '#9fe0ff'; ctx.fillRect(s.x - 0.9, s.z - 0.9, 1.8, 1.8); }
  for (const c of streakState.choppers) { ctx.fillStyle = c.owner && isEnemy(c.owner, G.player) ? '#ff6b5a' : '#9fe0ff'; ctx.beginPath(); ctx.arc(c.x, c.z, 2.2, 0, Math.PI * 2); ctx.fill(); }
  for (const c of streakState.crates) if (c.owner === G.player) { ctx.fillStyle = '#e0b35a'; ctx.fillRect(c.x - 1, c.z - 1, 2, 2); }
  for (const s of streakState.shells) { ctx.strokeStyle = 'rgba(229,96,74,0.7)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.arc(s.x, s.z, 2, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  // player marker + view cone
  ctx.fillStyle = 'rgba(232,227,211,0.07)';
  ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.arc(S / 2, S / 2, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); ctx.fill();
  ctx.fillStyle = '#f2ead2';
  ctx.beginPath(); ctx.moveTo(S / 2, S / 2 - 7); ctx.lineTo(S / 2 - 5, S / 2 + 5); ctx.lineTo(S / 2, S / 2 + 2.5); ctx.lineTo(S / 2 + 5, S / 2 + 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = uav ? 'rgba(229,96,74,0.8)' : 'rgba(232,227,211,0.3)'; ctx.lineWidth = uav ? 2 : 1.2;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, R - 0.5, 0, Math.PI * 2); ctx.stroke();
  if (uav) {
    const sweep = (G.realTime * 2.4) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(229,96,74,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.lineTo(S / 2 + Math.cos(sweep) * R, S / 2 + Math.sin(sweep) * R); ctx.stroke();
  }
}

export function prompt(html) { set('prompt', 'html', html); }
export function setFps(n) { set('fps', 'text', n + ' FPS'); }
