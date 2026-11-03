import { G } from '../core/state.js';
import { MODES, WEAPONS, PRIMARIES, SECONDARIES, ALL_PRIMARIES, CAMOS, RANKS, TEAMS, DIFFICULTY, SANDBOX_RULES, STREAKS, weaponPower } from '../core/config.js';
import { $, esc, clamp } from '../core/util.js';
import { saveProfile, resetSettings, KEY_LABELS, DEFAULT_KEYS } from '../core/storage.js';
import { input } from '../core/input.js';
import { MAP_LIST } from '../world/maps/index.js';
import { rankProgress, rankFor } from '../game/progression.js';
import { badgeSVG } from './badges.js';
import { codeName } from './hud.js';

const SCREENS = ['menu', 'loadout', 'settings', 'career', 'controls', 'pause', 'end', 'armory'];
let cb = null, back = 'menu';

export function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  document.body.classList.toggle('in-menu', !!id);
  if (id === 'menu') refreshMenu();
}
const open = (id, from) => { back = from || 'menu'; showScreen(id); };

// ---------- map previews (collider-only build) ----------
function previewColliders(def) {
  const cols = [], ramps = [];
  const stub = {
    solid(x, y0, z, w, h, d, m, o = {}) { return this.col(x, y0, z, w, h, d, m, o); },
    col(x, y0, z, w, h, d, m, o = {}) { cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top: y0 + h, pass: o.pass }); return this; },
    deco() { return this; }, quad() { return this; }, light() { return this; },
    geom(g) { g.dispose(); return this; },
    ramp(a, b2, c, d) { ramps.push({ x0: a, x1: b2, z0: c, z1: d }); return {}; },
    stairs(a, b2, c, d) { ramps.push({ x0: a, x1: b2, z0: c, z1: d }); return {}; },
  };
  def.build(stub);
  return { cols, ramps };
}
function drawPreview(canvas, def) {
  const ctx = canvas.getContext('2d'), S = canvas.width, b = def.bounds;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 4, sc = S / span, ox = -(b.minX - 2), oz = -(b.minZ - 2);
  const { cols, ramps } = previewColliders(def);
  ctx.fillStyle = def.id === 'outpost' ? '#3b342a' : '#262d30'; ctx.fillRect(0, 0, S, S);
  for (const c of cols) {
    if (c.x1 < b.minX - 3 || c.x0 > b.maxX + 3 || c.z1 < b.minZ - 3 || c.z0 > b.maxZ + 3) continue;
    ctx.fillStyle = c.pass ? 'rgba(232,227,211,.25)' : c.top > 2.5 ? 'rgba(232,227,211,.75)' : 'rgba(232,227,211,.4)';
    ctx.fillRect((c.x0 + ox) * sc, (c.z0 + oz) * sc, Math.max(1, (c.x1 - c.x0) * sc), Math.max(1, (c.z1 - c.z0) * sc));
  }
  ctx.fillStyle = 'rgba(217,164,65,.6)';
  for (const r of ramps) ctx.fillRect((r.x0 + ox) * sc, (r.z0 + oz) * sc, (r.x1 - r.x0) * sc, (r.z1 - r.z0) * sc);
}

// ---------- main menu ----------
function seg(container, items, current, onPick) {
  container.innerHTML = items.map((it) => `<button type="button" data-v="${esc(it.v)}" class="${String(it.v) === String(current) ? 'sel' : ''}">${it.html}</button>`).join('');
  container.querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => {
    container.querySelectorAll('button').forEach((q) => q.classList.toggle('sel', q === bt));
    onPick(bt.dataset.v);
  }));
}

function refreshMenu() {
  const pr = G.profile, L = pr.lobby, rp = rankProgress(pr.xp);
  $('rankPlate').innerHTML = `${badgeSVG(rp.rank, 52)}<div class="rp-text"><b>${esc(rp.name)}</b><div class="rp-bar"><i style="width:${(rp.pct * 100).toFixed(1)}%"></i></div><small>${rp.next ? `${(rp.span - rp.into).toLocaleString()} XP to ${esc(rp.next)}` : 'Highest rank reached'}</small></div>`;
  seg($('modeSel'), Object.values(MODES).map((m) => ({ v: m.id, html: `<b>${m.name}</b><small>${esc(m.desc)}</small>` })), L.mode, (v) => { L.mode = v; saveProfile(); refreshCounts(); refreshBest(); refreshSandbox(); });
  seg($('diffSel'), Object.entries(DIFFICULTY).map(([k, d]) => ({ v: k, html: d.label })), L.difficulty, (v) => { L.difficulty = v; saveProfile(); refreshBest(); });
  const mapSel = $('mapSel');
  if (!mapSel.dataset.built) {
    mapSel.dataset.built = '1';
    mapSel.innerHTML = MAP_LIST.map((d) => `<button type="button" data-v="${d.id}"><canvas width="96" height="96"></canvas><span><b>${d.name}</b><small>${esc(d.blurb)}</small></span></button>`).join('');
    mapSel.querySelectorAll('button').forEach((bt, i) => {
      drawPreview(bt.querySelector('canvas'), MAP_LIST[i]);
      bt.addEventListener('click', () => { L.map = bt.dataset.v; saveProfile(); mapSel.querySelectorAll('button').forEach((q) => q.classList.toggle('sel', q === bt)); cb.onMapPreview(L.map); });
    });
  }
  mapSel.querySelectorAll('button').forEach((q) => q.classList.toggle('sel', q.dataset.v === L.map));
  refreshCounts(); refreshBest(); refreshSandbox();
}
function refreshSandbox() {
  const L = G.profile.lobby;
  $('sandboxOpts').classList.toggle('hidden', L.mode !== 'sandbox');
  if (L.mode !== 'sandbox') return;
  $('ruleSel').innerHTML = SANDBOX_RULES.map(([k, label]) => `<button type="button" data-k="${k}" class="${L.sandbox[k] ? 'on' : ''}" aria-pressed="${!!L.sandbox[k]}">${label}</button>`).join('');
  $('ruleSel').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { L.sandbox[bt.dataset.k] = !L.sandbox[bt.dataset.k]; saveProfile(); refreshSandbox(); }));
}
function refreshCounts() {
  const L = G.profile.lobby, m = MODES[L.mode];
  $('countRow').classList.toggle('hidden', !m.counts);
  if (!m.counts) return;
  $('countLabel').textContent = m.countLabel;
  const cur = L.counts[L.mode] ?? m.defaultCount;
  seg($('countSel'), m.counts.map((n) => ({ v: n, html: L.mode === 'tdm' ? `${n}v${n}` : String(n) })), cur, (v) => { L.counts[L.mode] = Number(v); saveProfile(); });
}
function refreshBest() {
  const pr = G.profile, L = pr.lobby;
  let t;
  if (L.mode === 'sandbox') t = 'Nothing in Sandbox counts toward XP or career stats.';
  else if (L.mode === 'survival') t = `Best on ${DIFFICULTY[L.difficulty].label.toLowerCase()}: ${(pr.best.survival[L.difficulty] || 0).toLocaleString()} points · furthest wave ${pr.best.wave}`;
  else t = `Most kills in a ${L.mode === 'ffa' ? 'free-for-all' : 'team'} match: ${pr.best[L.mode]}`;
  $('bestLine').textContent = t;
}

// ---------- loadout ----------
function camoStyle(c) {
  const spots = c.spots.map((s, i) => `radial-gradient(circle at ${20 + i * 30}% ${30 + (i % 2) * 40}%, ${s} 0 22%, transparent 23%)`).join(',');
  return `background:${spots ? spots + ',' : ''}${c.base}`;
}
// stat bars: Power is computed from real damage per shot; the rest are hand-tuned ratings
function statBars(w, only) {
  const pw = weaponPower(w);
  const rows = [['Power', pw.v, pw.text]];
  if (!only && w.stats) for (const [k, v] of Object.entries(w.stats)) if (k !== 'damage') rows.push([k === 'rate' ? 'Fire rate' : k[0].toUpperCase() + k.slice(1), v, '']);
  return rows.map(([k, v, t]) => `<div class="stat"><span>${k}</span><i><b style="width:${(v * 100).toFixed(0)}%"></b></i><em>${t}</em></div>`).join('');
}
function refreshLoadout() {
  const lo = G.profile.loadout, rank = rankFor(G.profile.xp);
  $('weaponList').innerHTML = PRIMARIES.map((id) => {
    const w = WEAPONS[id];
    const bars = statBars(w);
    return `<button type="button" class="wcard ${lo.primary === id ? 'sel' : ''}" data-v="${id}"><div class="wc-head"><b>${w.name}</b><small>${w.cls}</small></div><p>${esc(w.desc)}</p>${bars}</button>`;
  }).join('');
  $('weaponList').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { lo.primary = bt.dataset.v; saveProfile(); refreshLoadout(); }));
  $('pistolList').innerHTML = SECONDARIES.map((id) => { const w = WEAPONS[id]; return `<button type="button" class="wcard ${(lo.secondary || 'usp') === id ? 'sel' : ''}" data-v="${id}"><div class="wc-head"><b>${w.name}</b><small>${w.cls}</small></div><p>${esc(w.desc)}</p>${statBars(w)}</button>`; }).join('');
  $('pistolList').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { lo.secondary = bt.dataset.v; saveProfile(); refreshLoadout(); }));
  $('camoList').innerHTML = CAMOS.map((c) => {
    const locked = rank < c.rank;
    return `<button type="button" class="camo ${lo.camo === c.id ? 'sel' : ''} ${locked ? 'locked' : ''}" data-v="${c.id}" ${locked ? 'disabled' : ''} title="${locked ? 'Unlocks at ' + esc(RANKS[c.rank].name) : esc(c.name)}"><i style="${camoStyle(c)}"></i><span>${esc(c.name)}</span>${locked ? `<small>${esc(RANKS[c.rank].name)}</small>` : ''}</button>`;
  }).join('');
  $('camoList').querySelectorAll('button:not([disabled])').forEach((bt) => bt.addEventListener('click', () => { lo.camo = bt.dataset.v; saveProfile(); cb.onCamo(lo.camo); refreshLoadout(); }));
}

// ---------- settings ----------
const SLIDERS = [
  ['sens', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)],
  ['adsSens', 'Aim-down-sights sensitivity', 0.3, 1.5, 0.05, (v) => Math.round(v * 100) + '%'],
  ['fov', 'Field of view', 60, 95, 1, (v) => v + '°'],
  ['volume', 'Volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
];
const CROSS = ['#eaf2e4', '#7dff9a', '#ffd34d', '#5fd0ff', '#ff6b6b'];
function refreshSettings() {
  const s = G.profile.settings;
  $('sliders').innerHTML = SLIDERS.map(([k, label, mn, mx, st, f]) => `<label class="slider"><span>${label}<output id="out_${k}">${f(s[k])}</output></span><input type="range" id="set_${k}" min="${mn}" max="${mx}" step="${st}" value="${s[k]}"></label>`).join('');
  for (const [k, , , , , f] of SLIDERS) $('set_' + k).addEventListener('input', (e) => { s[k] = Number(e.target.value); $('out_' + k).textContent = f(s[k]); cb.onSetting(k); saveProfile(); });
  $('toggles').innerHTML = [['invertY', 'Invert vertical look'], ['shadows', 'Shadows'], ['showFps', 'Show frame rate']]
    .map(([k, l]) => `<label class="toggle"><input type="checkbox" id="set_${k}" ${s[k] ? 'checked' : ''}><span>${l}</span></label>`).join('');
  for (const k of ['invertY', 'shadows', 'showFps']) $('set_' + k).addEventListener('change', (e) => { s[k] = e.target.checked; cb.onSetting(k); saveProfile(); });
  seg($('scaleSel'), [{ v: 0.6, html: 'Low' }, { v: 0.8, html: 'Medium' }, { v: 1, html: 'Full' }], s.renderScale, (v) => { s.renderScale = Number(v); cb.onSetting('renderScale'); saveProfile(); });
  $('crossSel').innerHTML = CROSS.map((c) => `<button type="button" class="${s.crosshair === c ? 'sel' : ''}" data-v="${c}" style="--c:${c}" aria-label="Crosshair colour ${c}"></button>`).join('');
  $('crossSel').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { s.crosshair = bt.dataset.v; cb.onSetting('crosshair'); saveProfile(); refreshSettings(); }));
  $('binds').innerHTML = Object.keys(DEFAULT_KEYS).map((a) => `<div class="bind"><span>${KEY_LABELS[a]}</span><button type="button" data-a="${a}">${esc(codeName(s.keys[a]))}</button></div>`).join('');
  $('binds').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => {
    bt.textContent = 'Press a key…'; bt.classList.add('listening');
    input.capture = (code) => {
      input.capture = null;
      if (code !== 'Escape') {
        const a = bt.dataset.a, prev = s.keys[a];
        for (const k of Object.keys(s.keys)) if (k !== a && s.keys[k] === code) s.keys[k] = prev; // swap on conflict
        s.keys[a] = code; saveProfile();
      }
      refreshSettings();
    };
  }));
  $('ctrlWarn').classList.toggle('hidden', !Object.values(s.keys).some((c) => c.startsWith('Control')));
}

// ---------- career ----------
function refreshCareer() {
  const pr = G.profile, c = pr.career, rp = rankProgress(pr.xp);
  const kd = (c.kills / Math.max(1, c.deaths)).toFixed(2), acc = c.shots ? Math.round(c.hits / c.shots * 100) + '%' : '—';
  const hrs = c.seconds >= 3600 ? `${Math.floor(c.seconds / 3600)}h ${Math.floor(c.seconds % 3600 / 60)}m` : `${Math.floor(c.seconds / 60)}m`;
  const tiles = [['Total XP', pr.xp.toLocaleString()], ['Matches', c.matches], ['Wins', c.wins], ['Kills', c.kills], ['Deaths', c.deaths], ['K/D', kd],
    ['Headshots', c.headshots], ['Accuracy', acc], ['Best streak', c.bestStreak], ['Knife kills', c.knifeKills], ['Grenade kills', c.grenadeKills], ['Time played', hrs],
    ['Best FFA', pr.best.ffa + ' kills'], ['Best TDM', pr.best.tdm + ' kills'], ['Best survival', Math.max(...Object.values(pr.best.survival)).toLocaleString() + ' pts'], ['Furthest wave', pr.best.wave]];
  $('careerStats').innerHTML = tiles.map(([k, v]) => `<div class="tile"><small>${k}</small><b>${v}</b></div>`).join('');
  $('rankLadder').innerHTML = RANKS.map((r) => `<div class="rung ${r.i === rp.rank ? 'cur' : r.i < rp.rank ? 'done' : ''}">${badgeSVG(r.i, 30)}<span>${esc(r.name)}</span><small>${r.xp.toLocaleString()} XP</small></div>`).join('');
  setTimeout(() => { const cur = $('rankLadder').querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'center' }); }, 0);
}

// ---------- end of match ----------
export function showEnd(r) {
  const P = G.player, m = G.match, st = m.stats;
  $('endTitle').textContent = r.title;
  $('end').dataset.result = r.result;
  $('endDetail').textContent = r.detail;
  const acc = st.shots ? Math.round(st.hits / st.shots * 100) + '%' : '—';
  const tiles = r.mode === 'survival'
    ? [['Wave', r.wave], ['Points', r.points.toLocaleString()], ['Kills', P.kills], ['Accuracy', acc], ['Headshots', st.headHits], ['Best streak', P.bestStreak]]
    : [['Kills', P.kills], ['Deaths', P.deaths], ['K/D', (P.kills / Math.max(1, P.deaths)).toFixed(2)], ['Assists', P.assists], ['Accuracy', acc], ['Best streak', P.bestStreak]];
  $('endStats').innerHTML = tiles.map(([k, v]) => `<div class="tile"><small>${k}</small><b>${v}</b></div>`).join('');
  const row = (u) => `<tr class="${u === P ? 'me' : ''}"><td>${esc(u.name)}</td><td>${u.kills}</td><td>${u.deaths}</td><td>${u.assists}</td></tr>`;
  const head = '<tr><th>Operator</th><th>K</th><th>D</th><th>A</th></tr>';
  if (r.mode === 'tdm') {
    $('endBoard').innerHTML = [0, 1].map((t) => `<div class="board-team t${t}"><div class="bt-name">${TEAMS[t].name}<b>${r.teamScores[t]}</b></div><table>${head}${G.units.filter((u) => u.team === t).sort((a, b) => b.kills - a.kills).map(row).join('')}</table></div>`).join('');
  } else if (r.mode === 'ffa') $('endBoard').innerHTML = `<table>${head}${r.standings.map(row).join('')}</table>`;
  else $('endBoard').innerHTML = '';
  const s = r.summary;
  $('xpLines').innerHTML = s.lines.map((l) => `<div><span>${esc(l.label)}${l.count > 1 ? ` ×${l.count}` : ''}</span><b>+${l.xp.toLocaleString()}</b></div>`).join('') + `<div class="total"><span>Total</span><b>+${s.total.toLocaleString()} XP</b></div>`;
  $('newBest').classList.toggle('hidden', !s.newBest);
  const before = rankProgress(s.xpBefore), after = rankProgress(s.xpAfter);
  $('endRank').innerHTML = `${badgeSVG(after.rank, 46)}<div class="rp-text"><b>${esc(after.name)}</b><div class="rp-bar"><i id="endBar" style="width:${(before.rank === after.rank ? before.pct : 0) * 100}%"></i></div><small>${after.rank > before.rank ? `Promoted from ${esc(before.name)}` : after.next ? `${(after.span - after.into).toLocaleString()} XP to ${esc(after.next)}` : 'Highest rank reached'}</small></div>`;
  showScreen('end');
  requestAnimationFrame(() => setTimeout(() => { const bar = $('endBar'); if (bar) bar.style.width = (after.pct * 100).toFixed(1) + '%'; }, 120));
}

// ---------- sandbox weapon menu ----------
export function showArmory() {
  const P = G.player, cur = P.weapons;
  const btn = (id) => `<button type="button" data-w="${id}" class="${cur.includes(id) ? 'sel' : ''}"><b>${WEAPONS[id].name}</b><small>${WEAPONS[id].cls}</small>${statBars(WEAPONS[id], true)}</button>`;
  $('armPrimary').innerHTML = ALL_PRIMARIES.map(btn).join('');
  $('armSecondary').innerHTML = SECONDARIES.map(btn).join('');
  $('armExtras').innerHTML = STREAKS.map((s) => `<button type="button" data-a="${s.id}"><b>${s.name}</b><small>${esc(s.desc)}</small></button>`).join('')
    + '<button type="button" data-a="refill"><b>REFILL AMMO</b><small>Full ammo and three grenades</small></button><button type="button" data-a="heal"><b>FULL HEALTH</b><small>Back to 100</small></button>';
  document.querySelectorAll('#armory .arm-grid button').forEach((bt) => bt.addEventListener('click', () => cb.onArmory(bt.dataset.w ? { weapon: bt.dataset.w } : { action: bt.dataset.a })));
  showScreen('armory');
}

// ---------- pause ----------
export function showPause(lockError) {
  $('lockMsg').classList.toggle('hidden', !lockError);
  const P = G.player, canRedeploy = !!(P && P.alive && G.pausedFrom === 'playing');
  $('redeploy').classList.toggle('hidden', !canRedeploy);
  const underFire = P && G.now - P.lastHitAt < 4;
  $('redeploy').disabled = underFire;
  $('redeploy').textContent = underFire ? 'Redeploy (not while under fire)' : G.match && G.match.mode === 'survival' ? 'Redeploy (costs a life)' : 'Redeploy';
  showScreen('pause');
}

export function initMenus(callbacks) {
  cb = callbacks;
  $('deploy').addEventListener('click', () => {
    const L = G.profile.lobby;
    cb.onDeploy({ mode: L.mode, map: L.map, difficulty: L.difficulty, count: L.counts[L.mode] ?? MODES[L.mode].defaultCount });
  });
  $('openLoadout').addEventListener('click', () => { refreshLoadout(); open('loadout'); });
  $('openSettings').addEventListener('click', () => { refreshSettings(); open('settings', 'menu'); });
  $('openCareer').addEventListener('click', () => { refreshCareer(); open('career'); });
  $('openControls').addEventListener('click', () => open('controls', 'menu'));
  for (const id of ['loadoutDone', 'careerDone']) $(id).addEventListener('click', () => showScreen('menu'));
  $('settingsDone').addEventListener('click', () => { input.capture = null; showScreen(back); });
  $('controlsDone').addEventListener('click', () => showScreen(back));
  $('resetSettings').addEventListener('click', () => { resetSettings(); for (const k of ['sens', 'fov', 'volume', 'shadows', 'showFps', 'crosshair', 'renderScale']) cb.onSetting(k); refreshSettings(); });
  $('resume').addEventListener('click', () => cb.onResume());
  $('freeLook').addEventListener('click', () => cb.onFreeLook());
  $('pauseSettings').addEventListener('click', () => { refreshSettings(); open('settings', 'pause'); });
  $('pauseControls').addEventListener('click', () => open('controls', 'pause'));
  $('restart').addEventListener('click', () => cb.onRestart());
  $('redeploy').addEventListener('click', () => cb.onRedeploy());
  $('quit').addEventListener('click', () => cb.onQuit());
  $('again').addEventListener('click', () => cb.onRestart());
  $('armClose').addEventListener('click', () => cb.onArmory({ action: 'close' }));
  $('endMenu').addEventListener('click', () => cb.onQuit());
}
