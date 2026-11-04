import { VEHICLE_MODES } from '../entities/vehicles.js';
import { MapBuilder } from '../world/builder.js';
import { G } from '../core/state.js';
import { MODES, WEAPONS, PRIMARIES, SECONDARIES, ALL_PRIMARIES, CAMOS, RANKS, TEAMS, DIFFICULTY, LIMITS, SANDBOX_RULES, SKILL_BANDS, skillBand, BOT_RULES, STREAKS, STREAK_RULES, weaponPower, SLOT_MODES, ALL_GUNS, loadoutGuns } from '../core/config.js';
import { $, esc, clamp } from '../core/util.js';
import { saveProfile, resetSettings, KEY_LABELS, DEFAULT_KEYS, exportProfile, importProfile } from '../core/storage.js';
import { input } from '../core/input.js';
import { MAP_LIST } from '../world/maps/index.js';
import { rankProgress, rankFor } from '../game/progression.js';
import { badgeSVG } from './badges.js';
import { setScene, stinger } from '../engine/music.js';
import { codeName, keyName } from './hud.js';

const SCREENS = ['menu', 'operator', 'streaks', 'loadout', 'settings', 'career', 'controls', 'pause', 'end', 'armory', 'mp'];
let cb = null, back = 'menu';

export function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  document.body.classList.toggle('in-menu', !!id);
  if (id === 'menu') refreshMenu();
}
const open = (id, from) => { back = from || 'menu'; showScreen(id); };

// ---------- map previews (collider-only build) ----------
function previewColliders(def) {
  const mb = new MapBuilder(); def.build(mb);
  const cols = mb.colliders.filter((c) => !c.rayOnly).map((c) => ({ x0: c.minX, x1: c.maxX, z0: c.minZ, z1: c.maxZ, top: c.maxY, pass: c.pass }));
  const ramps = mb.ramps.map((r) => ({ x0: r.minX, x1: r.maxX, z0: r.minZ, z1: r.maxZ }));
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
  seg($('modeSel'), Object.values(MODES).map((m) => ({ v: m.id, html: `<b>${m.name}</b><small>${esc(m.desc)}</small>` })), L.mode, (v) => { L.mode = v; saveProfile(); refreshMatchOpts(); refreshSkillVis(); refreshCounts(); refreshBest(); refreshSandbox(); refreshVehicles(); $('modeDesc').textContent = MODES[v].desc; });
  $('modeDesc').textContent = MODES[L.mode].desc;
  refreshSkill(); refreshSkillVis();
  if (!$('matchRulesBtn').dataset.on) { $('matchRulesBtn').dataset.on = '1'; $('matchRulesBtn').addEventListener('click', () => { $('matchOpts').classList.toggle('hidden'); $('botOpts').classList.add('hidden'); refreshMatchOpts(); }); $('matchOptsX').addEventListener('click', () => $('matchOpts').classList.add('hidden')); }
  if (!$('botRulesBtn').dataset.on) { $('botRulesBtn').dataset.on = '1'; $('botRulesBtn').addEventListener('click', () => { $('botOpts').classList.toggle('hidden'); $('matchOpts').classList.add('hidden'); refreshBotOpts(); }); $('botOptsX').addEventListener('click', () => $('botOpts').classList.add('hidden')); }
  const mapSel = $('mapSel');
  if (!mapSel.dataset.built) {
    mapSel.dataset.built = '1';
    mapSel.innerHTML = MAP_LIST.map((d) => `<button type="button" data-v="${d.id}"><canvas width="96" height="96"></canvas><span><b>${d.name}</b><small>${esc(d.blurb)}</small></span></button>`).join('');
    mapSel.querySelectorAll('button').forEach((bt, i) => {
      drawPreview(bt.querySelector('canvas'), MAP_LIST[i]);
      bt.addEventListener('click', () => { L.map = bt.dataset.v; saveProfile(); refreshVehicles(); mapSel.querySelectorAll('button').forEach((q) => q.classList.toggle('sel', q === bt)); cb.onMapPreview(L.map); });
    });
  }
  mapSel.querySelectorAll('button').forEach((q) => q.classList.toggle('sel', q.dataset.v === L.map));
  refreshCounts(); refreshBest(); refreshSandbox(); refreshVehicles();
}
// Vehicles: On/Off (default Off), only for maps with vehicle spots and modes that use them
function refreshVehicles() {
  const L = G.profile.lobby, def = MAP_LIST.find((m) => m.id === L.map), show = !!(def && def.vehicles) && VEHICLE_MODES.includes(L.mode);
  $('vehRow').classList.toggle('hidden', !show);
  document.querySelector('#menu .row2').classList.toggle('three', show);
  if (show) seg($('vehSel'), [{ v: 'off', html: 'Off' }, { v: 'on', html: 'On' }], L.vehicles ? 'on' : 'off', (v) => { L.vehicles = v === 'on'; saveProfile(); });
}
// Bot skill: five named bands on the main menu, 1-10 fine tune and what bots may do under "Rules"
function refreshSkill() {
  const L = G.profile.lobby;
  seg($('diffSel'), SKILL_BANDS.map(([k, a]) => ({ v: k, html: DIFFICULTY[k].label })), skillBand(L.skill), (v) => { L.skill = SKILL_BANDS.find((b) => b[0] === v)[1]; L.difficulty = v; saveProfile(); refreshBest(); refreshBotOpts(); });
}
function refreshBotOpts() {
  const L = G.profile.lobby, box = $('botOpts'); if (box.classList.contains('hidden')) return;
  $('skillVal').textContent = `${L.skill} · ${DIFFICULTY[skillBand(L.skill)].label}`; $('skillRange').value = L.skill;
  $('botRuleSel').innerHTML = BOT_RULES.map(([k, label]) => `<button type="button" data-k="${k}" class="${L.bots[k] ? 'on' : ''}" aria-pressed="${!!L.bots[k]}">${label}</button>`).join('');
  $('botRuleSel').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { L.bots[bt.dataset.k] = !L.bots[bt.dataset.k]; saveProfile(); refreshBotOpts(); }));
  if (!$('skillRange').dataset.on) { $('skillRange').dataset.on = '1'; $('skillRange').addEventListener('input', (e) => { L.skill = +e.target.value; L.difficulty = skillBand(L.skill); saveProfile(); refreshSkill(); refreshBest(); refreshBotOpts(); }); }
}
// Match rules card: score and time limits per mode (where they apply) and the health/ammo pickups toggle
const limText = (k, v) => k === 'score' ? (v === -1 ? 'Auto' : v === 0 ? 'No limit' : String(v)) : (v === 0 ? 'No limit' : v + ' min');
function refreshMatchOpts() {
  const L = G.profile.lobby, box = $('matchOpts'); if (box.classList.contains('hidden')) return;
  const LM = LIMITS[L.mode] || {}, cur = L.limits[L.mode] || {};
  for (const k of ['score', 'time']) {
    $(k + 'LimRow').classList.toggle('hidden', !LM[k]);
    if (LM[k]) seg($(k + 'LimSel'), LM[k].map((v) => ({ v, html: limText(k, v) })), cur[k] ?? LM[k][0], (v) => { L.limits[L.mode][k] = Number(v); saveProfile(); });
  }
  $('scoreLimLabel').textContent = L.mode === 'ctf' ? 'Captures to win' : L.mode === 'tdm' ? 'Team score to win' : 'Kills to win';
  $('limNone').classList.toggle('hidden', !!(LM.score || LM.time));
  seg($('pickupSel'), [{ v: 'on', html: 'On' }, { v: 'off', html: 'Off' }], L.pickups ? 'on' : 'off', (v) => { L.pickups = v === 'on'; saveProfile(); });
}
function refreshSandbox() {
  const L = G.profile.lobby;
  $('sandboxOpts').classList.toggle('hidden', L.mode !== 'sandbox');
  if (L.mode !== 'sandbox') return;
  $('ruleSel').innerHTML = SANDBOX_RULES.map(([k, label]) => `<button type="button" data-k="${k}" class="${L.sandbox[k] ? 'on' : ''}" aria-pressed="${!!L.sandbox[k]}">${label}</button>`).join('');
  $('ruleSel').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { L.sandbox[bt.dataset.k] = !L.sandbox[bt.dataset.k]; saveProfile(); refreshSandbox(); }));
}
// no bots (Sandbox 0): bot skill and rules don't apply
function refreshSkillVis() { const L = G.profile.lobby, none = MODES[L.mode].counts && (L.counts[L.mode] ?? MODES[L.mode].defaultCount) === 0; $('diffSel').parentElement.classList.toggle('hidden', !!none); if (none) $('botOpts').classList.add('hidden'); }
function refreshCounts() {
  const L = G.profile.lobby, m = MODES[L.mode];
  $('countRow').classList.toggle('hidden', !m.counts);
  if (!m.counts) return;
  $('countLabel').textContent = m.countLabel;
  const cur = L.counts[L.mode] ?? m.defaultCount;
  seg($('countSel'), m.counts.map((n) => ({ v: n, html: L.mode === 'tdm' || m.teamSize ? `${n}v${n}` : String(n) })), cur, (v) => { L.counts[L.mode] = Number(v); saveProfile(); refreshSkillVis(); });
}
function refreshBest() {
  const pr = G.profile, L = pr.lobby;
  let t;
  if (L.mode === 'sandbox') t = 'Nothing in Sandbox counts toward XP or career stats.';
  else if (L.mode === 'survival') t = `Best on ${DIFFICULTY[skillBand(L.skill)].label.toLowerCase()}: ${(pr.best.survival[skillBand(L.skill)] || 0).toLocaleString()} points · furthest wave ${pr.best.wave}`;
  else if (L.mode === 'zombies') t = `Furthest round: ${pr.best.zombies || 0}`;
  else t = `Most kills in a ${MODES[L.mode].name.toLowerCase()} match: ${pr.best[L.mode] || 0}`;
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
// ---------- loadout / pre-match ----------
let prematch = false;
const overkillLocked = (sandbox) => !sandbox && rankFor(G.profile.xp) < SLOT_MODES.overkill.rank;
function slotItems(sandbox) {
  return Object.entries(SLOT_MODES).map(([k, m]) => ({ v: k, html: m.name + (k === 'overkill' && overkillLocked(sandbox) ? ' <small>🔒 ' + esc(RANKS[m.rank].name) + '</small>' : '') }));
}
function pickSlots(v, sandbox) {
  if (v === 'overkill' && overkillLocked(sandbox)) return false;
  G.profile.settings.slots = v; saveProfile(); return true;
}
const card = (w, id, sel, full) => `<button type="button" class="wcard ${full ? '' : 'compact'} ${sel ? 'sel' : ''}" data-v="${id}" title="${esc(w.desc)}"><div class="wc-head"><b>${w.name}</b><small>${w.cls}</small></div>${statBars(w)}</button>`;
let loTab = 0;
function refreshLoadout() {
  const pr = G.profile, lo = pr.loadout, rank = rankFor(pr.xp), sandbox = prematch && pr.lobby.mode === 'sandbox';
  let mode = pr.settings.slots;
  if (mode === 'overkill' && overkillLocked(sandbox)) mode = 'classic';
  seg($('presetTabs'), pr.presets.map((p, i) => ({ v: i, html: `${'ABC'[i]} <small>${esc(WEAPONS[loadoutGuns(p, mode)[0]].name)}</small>` })), pr.preset, (v) => {
    pr.preset = Number(v); pr.loadout = pr.presets[pr.preset]; saveProfile(); cb.onCamo(pr.loadout.camo); refreshLoadout();
  });
  seg($('slotSel'), slotItems(sandbox), mode, (v) => { pickSlots(v, sandbox); refreshLoadout(); });
  $('slotDesc').textContent = SLOT_MODES[mode].desc;
  const okBtn = $('slotSel').querySelector('[data-v="overkill"]');
  if (okBtn) okBtn.title = overkillLocked(sandbox) ? `Overkill unlocks at ${RANKS[SLOT_MODES.overkill.rank].name} (always open in Sandbox).` : '';
  const guns = loadoutGuns(lo, mode), keys = ['primary', 'secondary', 'third'];
  // write back the resolved guns so the preset is always valid for this rule
  guns.forEach((g, i) => { lo[keys[i]] = g; });
  const lists = ['weaponList', 'pistolList', 'thirdList'];
  const labels = mode === 'classic' ? ['Primary', 'Sidearm'] : ['Weapon 1', 'Weapon 2', 'Weapon 3'];
  if (mode === 'classic') {
    $('weaponList').innerHTML = PRIMARIES.map((id) => card(WEAPONS[id], id, guns[0] === id, true)).join('');
    $('pistolList').innerHTML = SECONDARIES.map((id) => card(WEAPONS[id], id, guns[1] === id, true)).join('');
  } else {
    for (let i = 0; i < SLOT_MODES[mode].guns; i++) $(lists[i]).innerHTML = ALL_GUNS.map((id) => card(WEAPONS[id], id, guns[i] === id, false)).join('');
  }
  // tabs: one list at a time so the screen fits; each tab shows what is picked in it
  const nGuns = SLOT_MODES[mode].guns, camo = CAMOS.find((c) => c.id === lo.camo) || CAMOS[0];
  const tabs = [...labels.slice(0, nGuns).map((l, i) => [i, l, WEAPONS[guns[i]].name]), [3, 'Camo', camo.name]];
  if (!tabs.some((t) => t[0] === loTab)) loTab = 0;
  $('loTabs').innerHTML = tabs.map(([i, l, v]) => `<button type="button" role="tab" aria-selected="${i === loTab}" class="${i === loTab ? 'sel' : ''}" data-t="${i}"><b>${l}</b><small>${esc(v)}</small></button>`).join('');
  $('loTabs').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { loTab = Number(bt.dataset.t); refreshLoadout(); }));
  document.querySelectorAll('#loadout .lo-pane').forEach((p) => p.classList.toggle('hidden', Number(p.dataset.tab) !== loTab));
  $('loDetail').textContent = loTab === 3 ? 'New finishes unlock as you rank up.' : WEAPONS[guns[loTab]].desc;
  lists.forEach((l, i) => $(l).querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => {
    const id = bt.dataset.v, other = guns.indexOf(id);
    if (other >= 0 && other !== i) lo[keys[other]] = guns[i]; // picking a gun already in another slot swaps them
    lo[keys[i]] = id; saveProfile(); refreshLoadout();
  })));
  $('camoList').innerHTML = CAMOS.map((c) => {
    const locked = rank < c.rank;
    return `<button type="button" class="camo ${lo.camo === c.id ? 'sel' : ''} ${locked ? 'locked' : ''}" data-v="${c.id}" ${locked ? 'disabled' : ''} title="${locked ? 'Unlocks at ' + esc(RANKS[c.rank].name) : esc(c.name)}"><i style="${camoStyle(c)}"></i><span>${esc(c.name)}</span>${locked ? `<small>${esc(RANKS[c.rank].name)}</small>` : ''}</button>`;
  }).join('');
  $('camoList').querySelectorAll('button:not([disabled])').forEach((bt) => bt.addEventListener('click', () => { lo.camo = bt.dataset.v; saveProfile(); cb.onCamo(lo.camo); refreshLoadout(); }));
}
// ---------- killstreaks ----------
export const streakHow = (s) => s.how.replace('{streak}', keyName('streak'));
function refreshStreaks() {
  $('streakCards').innerHTML = STREAKS.map((s) => `<div class="streak-card"><div class="sk-kills"><b>${s.kills}</b><small>kills</small></div><div><h3>${esc(s.name)}</h3><p>${esc(streakHow(s))}</p></div></div>`).join('');
  $('streakRules').innerHTML = STREAK_RULES.map((r) => `<li>${esc(r)}</li>`).join('');
}
function streakSummary() {
  return `<div class="sk-summary"><span class="flabel">Killstreaks</span>${STREAKS.map((s) => `<span title="${esc(s.desc)}"><b>${s.kills}</b> ${esc(s.name)}</span>`).join('')}</div>`;
}

// prematch = shown after Deploy, before the match loads
export function showLoadout(isPrematch) {
  prematch = !!isPrematch;
  const L = G.profile.lobby;
  $('loTitle').textContent = prematch ? 'Choose your loadout' : 'Loadout';
  $('loLede').textContent = prematch ? `${MODES[L.mode].name} on ${MAP_LIST.find((m) => m.id === L.map).name}. Pick a preset, then deploy.` : 'Three saved presets. Pick one, set it up, and it’s remembered.';
  $('loadoutDone').textContent = prematch ? 'Deploy' : 'Done';
  $('loadoutBack').classList.toggle('hidden', !prematch);
  $('streakSummary').innerHTML = streakSummary();
  refreshLoadout(); open('loadout');
}

// ---------- settings ----------
const SLIDERS = [
  ['sens', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)],
  ['adsSens', 'Aim-down-sights sensitivity', 0.3, 1.5, 0.05, (v) => Math.round(v * 100) + '%'],
  ['fov', 'Field of view', 60, 95, 1, (v) => v + '°'],
  ['volume', 'Volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['music', 'Music volume (menus only)', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
];
const CROSS = ['#eaf2e4', '#7dff9a', '#ffd34d', '#5fd0ff', '#ff6b6b'];
function refreshSettings() {
  const s = G.profile.settings;
  $('sliders').innerHTML = SLIDERS.map(([k, label, mn, mx, st, f]) => `<label class="slider"><span>${label}<output id="out_${k}">${f(s[k])}</output></span><input type="range" id="set_${k}" min="${mn}" max="${mx}" step="${st}" value="${s[k]}"></label>`).join('');
  for (const [k, , , , , f] of SLIDERS) $('set_' + k).addEventListener('input', (e) => { s[k] = Number(e.target.value); $('out_' + k).textContent = f(s[k]); cb.onSetting(k); saveProfile(); });
  $('toggles').innerHTML = [['invertY', 'Invert vertical look'], ['shadows', 'Shadows'], ['showFps', 'Show frame rate'], ['killcam', 'Kill cam after death'], ['scopeToggle', 'Right-click toggles aim (snipers: 4× → 8× → off)']]
    .map(([k, l]) => `<label class="toggle"><input type="checkbox" id="set_${k}" ${s[k] ? 'checked' : ''}><span>${l}</span></label>`).join('');
  for (const k of ['invertY', 'shadows', 'showFps', 'killcam', 'scopeToggle']) $('set_' + k).addEventListener('change', (e) => { s[k] = e.target.checked; cb.onSetting(k); saveProfile(); });
  seg($('namesSel'), [{ v: 'real', html: 'Real' }, { v: 'fictional', html: 'Fictional' }], s.names, (v) => { s.names = v; cb.onSetting('names'); saveProfile(); });
  seg($('setSlotSel'), slotItems(false), s.slots, (v) => { if (!pickSlots(v, false)) { /* locked */ } refreshSettings(); });
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
  stinger(r.result);
  setTimeout(() => { if (G.state === 'ended') setScene('end'); }, 2600);
  const mp = G.mp;
  $('endMenu').textContent = mp ? 'Back to lobby' : 'Main menu';
  $('again').textContent = mp && !mp.host ? 'Waiting for host…' : 'Play again'; $('again').disabled = !!(mp && !mp.host);
  const P = G.player, m = G.match, st = m.stats;
  $('endTitle').textContent = r.title;
  $('end').dataset.result = r.result;
  $('endDetail').textContent = r.detail;
  const acc = st.shots ? Math.round(st.hits / st.shots * 100) + '%' : '—';
  const tiles = r.mode === 'zombies'
    ? [['Round', m.round], ['Points', m.points.toLocaleString()], ['Kills', P.kills], ['Accuracy', acc], ['Headshots', st.headHits], ['Downs', P.deaths]]
    : r.mode === 'survival'
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
  const P = G.player, canRedeploy = !!(P && P.alive && G.pausedFrom === 'playing' && !G.mp);
  $('restart').classList.toggle('hidden', !!G.mp);
  $('quit').textContent = G.mp ? (G.mp.host ? 'End match for everyone' : 'Leave match') : 'Quit to main menu';
  $('redeploy').classList.toggle('hidden', !canRedeploy);
  $('relock').classList.toggle('hidden', !input.freeLook);
  const underFire = P && G.now - P.lastHitAt < 4;
  $('redeploy').disabled = underFire;
  $('redeploy').textContent = underFire ? 'Redeploy (not while under fire)' : G.match && G.match.mode === 'survival' ? 'Redeploy (costs a life)' : 'Redeploy';
  showScreen('pause');
}

export function initMenus(callbacks) {
  cb = callbacks;
  $('deploy').addEventListener('click', () => showLoadout(true));
  $('openLoadout').addEventListener('click', () => showLoadout(false));
  $('loadoutBack').addEventListener('click', () => showScreen('menu'));
  $('openSettings').addEventListener('click', () => { refreshSettings(); open('settings', 'menu'); });
  $('openCareer').addEventListener('click', () => { refreshCareer(); open('career'); });
  $('openControls').addEventListener('click', () => open('controls', 'menu'));
  $('loadoutDone').addEventListener('click', () => {
    if (!prematch) { showScreen('menu'); return; }
    const L = G.profile.lobby;
    cb.onDeploy({ mode: L.mode, map: L.map, difficulty: skillBand(L.skill), skill: L.skill, bots: { ...L.bots }, pickups: L.pickups, limits: { [L.mode]: { ...(L.limits[L.mode] || {}) } }, count: L.counts[L.mode] ?? MODES[L.mode].defaultCount });
  });
  $('careerDone').addEventListener('click', () => showScreen('menu'));
  // export / import profile
  const saveMsg = (t, ok) => { const m = $('saveMsg'); m.textContent = t; m.className = 'save-msg ' + (ok ? 'ok' : 'err'); };
  $('exportProfile').addEventListener('click', () => {
    const txt = exportProfile(), name = 'frontline-profile-' + new Date().toISOString().slice(0, 10) + '.json';
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch (e) { /* downloads blocked */ }
    // the download can be blocked inside an embedded page, so the text also goes to the clipboard
    const done = (c) => saveMsg(c ? `Saved ${name} and copied the profile to the clipboard.` : `Saved ${name} to your downloads.`, true);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); else done(false);
  });
  const doImport = (txt) => {
    const r = importProfile(txt); saveMsg(r.ok ? r.msg + ' Reloading\u2026' : r.msg, r.ok);
    if (r.ok) setTimeout(() => location.reload(), 700);
  };
  $('importProfile').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 2e6) { saveMsg('That file is too large to be a profile.', false); return; } f.text().then(doImport); });
  $('pasteProfile').addEventListener('click', () => { $('pasteBox').classList.toggle('hidden', false); $('pasteText').focus(); });
  $('pasteGo').addEventListener('click', () => doImport($('pasteText').value));
  $('openStreaks').addEventListener('click', () => { refreshStreaks(); open('streaks'); });
  $('streaksDone').addEventListener('click', () => showScreen('menu'));
  $('settingsDone').addEventListener('click', () => { input.capture = null; showScreen(back); });
  $('controlsDone').addEventListener('click', () => showScreen(back));
  $('resetSettings').addEventListener('click', () => { resetSettings(); for (const k of ['sens', 'fov', 'volume', 'music', 'shadows', 'showFps', 'crosshair', 'renderScale', 'names']) cb.onSetting(k); refreshSettings(); });
  $('resume').addEventListener('click', () => cb.onResume());
  $('freeLook').addEventListener('click', () => cb.onFreeLook());
  $('relock').addEventListener('click', () => { input.freeLook = false; cb.onResume(); });
  $('pauseSettings').addEventListener('click', () => { refreshSettings(); open('settings', 'pause'); });
  $('pauseControls').addEventListener('click', () => open('controls', 'pause'));
  $('restart').addEventListener('click', () => cb.onRestart());
  $('redeploy').addEventListener('click', () => cb.onRedeploy());
  $('quit').addEventListener('click', () => cb.onQuit());
  $('again').addEventListener('click', () => cb.onRestart());
  $('armClose').addEventListener('click', () => cb.onArmory({ action: 'close' }));
  $('endMenu').addEventListener('click', () => cb.onQuit());
}
