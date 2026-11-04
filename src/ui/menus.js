import { VEHICLE_MODES } from '../entities/vehicles.js';
import { MapBuilder } from '../world/builder.js';
import { G } from '../core/state.js';
import { MODES, WEAPONS, PRIMARIES, SECONDARIES, ALL_PRIMARIES, CAMOS, RANKS, TEAMS, DIFFICULTY, LIMITS, MEDALS, NADES, EQUIPMENT, VESTS, BELTS, OPERATORS, SKINS, skinLook, SANDBOX_RULES, SKILL_BANDS, skillBand, BOT_RULES, STREAKS, STREAK_RULES, weaponPower, SLOT_MODES, ALL_GUNS, loadoutGuns } from '../core/config.js';
import { $, esc, clamp } from '../core/util.js';
import { saveProfile, resetSettings, KEY_LABELS, DEFAULT_KEYS, exportProfile, importProfile } from '../core/storage.js';
import { input } from '../core/input.js';
import { MAP_LIST } from '../world/maps/index.js';
import { rankProgress, rankFor } from '../game/progression.js';
import { badgeSVG } from './badges.js';
import { showPreview, stopPreview, gunThumb } from './preview.js';
import { setScene, stinger } from '../engine/music.js';
import { codeName, keyName } from './hud.js';

const SCREENS = ['menu', 'streaks', 'loadout', 'settings', 'career', 'controls', 'pause', 'end', 'armory', 'mp'];
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
  seg($('modeSel'), Object.values(MODES).map((m) => ({ v: m.id, html: `<b>${m.name}</b><small>${esc(m.desc)}</small>` })), L.mode, (v) => { L.mode = v; saveProfile(); refreshMatchOpts(); refreshSkillVis(); $('mapSel').parentElement.classList.toggle('hidden', v === 'range'); refreshCounts(); refreshBest(); refreshSandbox(); refreshVehicles(); $('modeDesc').textContent = MODES[v].desc; });
  $('modeDesc').textContent = MODES[L.mode].desc;
  refreshSkill(); refreshSkillVis();
  if (!$('matchRulesBtn').dataset.on) { $('matchRulesBtn').dataset.on = '1'; $('matchRulesBtn').addEventListener('click', () => { $('matchOpts').classList.toggle('hidden'); $('botOpts').classList.add('hidden'); refreshMatchOpts(); }); $('matchOptsX').addEventListener('click', () => $('matchOpts').classList.add('hidden')); }
  if (!$('botRulesBtn').dataset.on) { $('botRulesBtn').dataset.on = '1'; $('botRulesBtn').addEventListener('click', () => { $('botOpts').classList.toggle('hidden'); $('matchOpts').classList.add('hidden'); refreshBotOpts(); }); $('botOptsX').addEventListener('click', () => $('botOpts').classList.add('hidden')); }
  $('mapSel').parentElement.classList.toggle('hidden', L.mode === 'range'); // the range is its own map
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
let loTab = 'g0';
// small SVG icons for gear cards
const ICON = {
  frag: '<circle cx="40" cy="34" r="17" fill="#55603f"/><rect x="34" y="12" width="12" height="7" fill="#2a3034"/><path d="M46 14 q12 0 10 14" stroke="#9aa0a4" stroke-width="3" fill="none"/>',
  flash: '<rect x="30" y="14" width="20" height="38" rx="4" fill="#2c3236"/><rect x="30" y="22" width="20" height="4" fill="#c9a25a"/><path d="M58 22 l10 -6 M60 32 h12 M58 42 l10 6" stroke="#ffe9a8" stroke-width="3"/>',
  smoke: '<rect x="30" y="20" width="20" height="34" rx="4" fill="#8d9295"/><circle cx="34" cy="13" r="8" fill="#c9cdcf"/><circle cx="46" cy="9" r="9" fill="#dfe2e3"/><circle cx="56" cy="16" r="7" fill="#c9cdcf"/>',
  sticky: '<circle cx="40" cy="34" r="16" fill="#7b4a2a"/><path d="M40 50 q0 8 4 10" stroke="#a87a3a" stroke-width="4" fill="none"/><circle cx="40" cy="34" r="5" fill="#d0a060"/>',
  claymore: '<path d="M16 26 q24 -10 48 0 v16 q-24 -10 -48 0 z" fill="#4e5a36"/><path d="M24 40 l-4 14 M56 40 l4 14" stroke="#2a3034" stroke-width="3"/><text x="40" y="35" font-size="7" text-anchor="middle" fill="#c9d3a8">FRONT</text>',
  none: '<circle cx="40" cy="34" r="16" fill="none" stroke="#6b7478" stroke-width="4"/><path d="M28 46 L52 22" stroke="#6b7478" stroke-width="4"/>',
  light: '<path d="M26 14 h28 l6 12 v28 h-40 v-28 z" fill="#5f6a52"/><path d="M34 14 v10 h12 v-10" fill="#3a4233"/>',
  standard: '<path d="M24 12 h32 l8 12 v32 h-48 v-32 z" fill="#4f5848"/><rect x="28" y="30" width="10" height="10" fill="#3a4233"/><rect x="42" y="30" width="10" height="10" fill="#3a4233"/>',
  heavy: '<path d="M22 10 h36 l10 12 v36 h-56 v-36 z" fill="#2f3438"/><rect x="28" y="22" width="24" height="26" rx="3" fill="#4a5054"/><rect x="26" y="50" width="28" height="6" fill="#1e2124"/>',
  'b-none': '<rect x="10" y="30" width="60" height="9" rx="3" fill="#4a3b24"/><rect x="36" y="28" width="9" height="13" fill="#9aa0a4"/>',
  bandolier: '<rect x="10" y="30" width="60" height="9" rx="3" fill="#4a3b24"/>' + [16, 26, 46, 56].map((x) => `<rect x="${x}" y="22" width="6" height="12" fill="#c9a25a"/>`).join(''),
  grenadier: '<rect x="10" y="34" width="60" height="9" rx="3" fill="#4a3b24"/><circle cx="26" cy="30" r="7" fill="#55603f"/><circle cx="54" cy="30" r="7" fill="#55603f"/>',
  quickdraw: '<rect x="10" y="22" width="60" height="9" rx="3" fill="#4a3b24"/><path d="M44 30 h14 l-2 26 h-10 z" fill="#2a2e31"/><path d="M14 46 h18 M10 52 h18" stroke="#c9a25a" stroke-width="3"/>',
};
const icon = (k) => `<svg class="ico" viewBox="0 0 80 64" aria-hidden="true">${ICON[k] || ICON.none}</svg>`;
// Loadout: tabs for every slot; each tab is one side-scrolling row of picture cards; the operator on the right wears it all
function refreshLoadout() {
  const pr = G.profile, lo = pr.loadout, rank = rankFor(pr.xp), sandbox = prematch && pr.lobby.mode === 'sandbox';
  for (const [k, d] of [['grenade', 'frag'], ['equip', 'claymore'], ['vest', 'standard'], ['belt', 'none']]) if (!lo[k]) lo[k] = d;
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
  guns.forEach((g, i) => { lo[keys[i]] = g; });
  const nGuns = SLOT_MODES[mode].guns, camo = CAMOS.find((c) => c.id === lo.camo) || CAMOS[0], op = OPERATORS.find((o) => o.id === pr.skin.op) || OPERATORS[0];
  const labels = mode === 'classic' ? ['Primary', 'Sidearm'] : ['Weapon 1', 'Weapon 2', 'Weapon 3'];
  const tabs = [...labels.slice(0, nGuns).map((l, i) => ['g' + i, l, WEAPONS[guns[i]].name]), ['nade', 'Grenade', NADES[lo.grenade].name], ['equip', 'Equipment', EQUIPMENT[lo.equip].name],
    ['vest', 'Vest', VESTS[lo.vest].name], ['belt', 'Belt', BELTS[lo.belt].name], ['op', 'Operator', op.name], ['camo', 'Camo', camo.name]];
  if (!tabs.some((t) => t[0] === loTab)) loTab = 'g0';
  $('loTabs').innerHTML = tabs.map(([i, l, v]) => `<button type="button" role="tab" aria-selected="${i === loTab}" class="${i === loTab ? 'sel' : ''}" data-t="${i}"><b>${l}</b><small>${esc(v)}</small></button>`).join('');
  $('loTabs').querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { loTab = bt.dataset.t; refreshLoadout(); }));
  const pick = (cards, onPick) => { $('loRow').innerHTML = cards.join(''); $('loRow').querySelectorAll('button:not([disabled])').forEach((bt) => bt.addEventListener('click', () => { onPick(bt.dataset.v); saveProfile(); refreshLoadout(); })); };
  const gearCard = (k, d, sel, ico) => `<button type="button" class="lo-card ${sel ? 'sel' : ''}" data-v="${k}">${icon(ico || k)}<b>${esc(d.name)}</b><small>${esc(d.desc)}</small></button>`;
  $('loOpExtra').classList.toggle('hidden', loTab !== 'op');
  if (loTab[0] === 'g') {
    const i = +loTab[1], pool = mode === 'classic' ? (i === 0 ? PRIMARIES : SECONDARIES) : ALL_GUNS;
    $('loDetail').textContent = WEAPONS[guns[i]].desc;
    pick(pool.map((id) => { const w = WEAPONS[id]; return `<button type="button" class="lo-card ${guns[i] === id ? 'sel' : ''}" data-v="${id}" title="${esc(w.desc)}"><img alt="" src="${gunThumb(id)}"><b>${w.name}</b><small>${w.cls}</small>${statBars(w)}</button>`; }), (id) => {
      const other = guns.indexOf(id); if (other >= 0 && other !== i) lo[keys[other]] = guns[i]; lo[keys[i]] = id;
    });
  } else if (loTab === 'nade') { $('loDetail').textContent = 'G throws it (hold to cook a frag). Free for now.'; pick(Object.entries(NADES).map(([k, d]) => gearCard(k, d, lo.grenade === k)), (v) => { lo.grenade = v; }); }
  else if (loTab === 'equip') { $('loDetail').textContent = `${keyName('equip')} sets it down where you look.`; pick(Object.entries(EQUIPMENT).map(([k, d]) => gearCard(k, d, lo.equip === k)), (v) => { lo.equip = v; }); }
  else if (loTab === 'vest') { $('loDetail').textContent = 'Armour against speed.'; pick(Object.entries(VESTS).map(([k, d]) => gearCard(k, d, lo.vest === k)), (v) => { lo.vest = v; }); }
  else if (loTab === 'belt') { $('loDetail').textContent = 'One perk carried on the belt.'; pick(Object.entries(BELTS).map(([k, d]) => gearCard(k, d, lo.belt === k, k === 'none' ? 'b-none' : k)), (v) => { lo.belt = v; }); }
  else if (loTab === 'op') {
    $('loDetail').textContent = 'Your operator and look (what other players see). More uniforms, patterns and helmets unlock as you rank up.';
    pick(OPERATORS.map((o) => `<button type="button" class="lo-card ${o.id === op.id ? 'sel' : ''}" data-v="${o.id}"><svg class="ico" viewBox="0 0 80 64"><circle cx="40" cy="26" r="14" fill="#${o.skin.toString(16).padStart(6, '0')}"/><path d="M26 22 a14 14 0 0 1 28 0 z" fill="#4a5340"/>${o.hairStyle === 'pony' ? `<path d="M52 28 q8 10 2 22" stroke="#${o.hair.toString(16).padStart(6, '0')}" stroke-width="6" fill="none"/>` : o.hairStyle === 'bun' ? `<circle cx="54" cy="24" r="6" fill="#${o.hair.toString(16).padStart(6, '0')}"/>` : ''}${o.beard ? `<path d="M30 30 q10 12 20 0 v4 q-10 10 -20 0 z" fill="#${o.hair.toString(16).padStart(6, '0')}"/>` : ''}<rect x="22" y="42" width="36" height="18" rx="6" fill="#5f6a52"/></svg><b>${o.name}</b><small>${o.face === 'wrap' ? 'Face scarf' : 'Open face'}</small></button>`), (v) => { pr.skin.op = v; cb.onSkin && cb.onSkin(pr.skin); });
    fillSkins();
  } else {
    $('loDetail').textContent = 'Finishes for your guns. New ones unlock as you rank up.';
    pick(CAMOS.map((c) => { const locked = rank < c.rank; return `<button type="button" class="lo-card ${lo.camo === c.id ? 'sel' : ''}" data-v="${c.id}" ${locked ? 'disabled' : ''} title="${locked ? 'Unlocks at ' + esc(RANKS[c.rank].name) : esc(c.name)}"><i class="camo-sw" style="${camoStyle(c)}"></i><b>${esc(c.name)}</b><small>${locked ? '🔒 ' + esc(RANKS[c.rank].name) : 'Unlocked'}</small></button>`; }), (v) => { lo.camo = v; cb.onCamo(v); });
  }
  const gi = loTab[0] === 'g' ? +loTab[1] : 0;
  showPreview($('loPreview'), { ...skinLook(pr.skin), accent: 0x7a6a48, weapon: guns[gi], vest: lo.vest, belt: lo.belt });
  $('loSummary').textContent = `${guns.map((g) => WEAPONS[g].name).join(' · ')} · ${NADES[lo.grenade].name} · ${EQUIPMENT[lo.equip].name} · ${VESTS[lo.vest].name} · ${BELTS[lo.belt].name}`;
}
// uniform / pattern / helmet pickers (operator tab), locked until the listed rank
function fillSkins() {
  const sk = G.profile.skin, rank = rankFor(G.profile.xp);
  const fill = (id, list, cur) => { $(id).innerHTML = list.map((e) => { const lock = e[e.length - 1] > rank; return `<option value="${e[0]}"${e[0] === cur ? ' selected' : ''}${lock ? ' disabled' : ''}>${esc(e[1])}${lock ? ' · ' + esc(RANKS[e[e.length - 1]].name) : ''}</option>`; }).join(''); };
  for (const [k, list] of [['uniform', SKINS.uniform], ['pattern', SKINS.pattern], ['helmet', SKINS.helmet]]) { const e = list.find((x) => x[0] === sk[k]); if (!e || e[e.length - 1] > rank) sk[k] = list[0][0]; }
  fill('mpSkinU', SKINS.uniform, sk.uniform); fill('mpSkinP', SKINS.pattern, sk.pattern); fill('mpSkinH', SKINS.helmet, sk.helmet);
}
// ---------- killstreaks ----------
export const streakHow = (s) => s.how.replace('{streak}', keyName('streak'));
function refreshStreaks() {
  const st = G.profile.streaks, picks = st.picks;
  $('streakCards').innerHTML = `<p class="small-note">Pick three (${picks.length}/3). Kill counts are yours to tune; in multiplayer the host's counts apply to everyone.</p>` + [...STREAKS].sort((a, b) => (st.kills[a.id] ?? a.kills) - (st.kills[b.id] ?? b.kills)).map((s) => { const on = picks.includes(s.id), k = st.kills[s.id] ?? s.kills;
    return `<div class="streak-card ${on ? 'on' : ''}"><div class="sk-kills"><button type="button" class="sk-step" data-k="${s.id}" data-d="-1" aria-label="Fewer kills">−</button><b>${k}</b><button type="button" class="sk-step" data-k="${s.id}" data-d="1" aria-label="More kills">+</button><small>kills</small></div><div><h3>${esc(s.name)}</h3><p>${esc(streakHow(s))}</p></div><button type="button" class="sk-pick ${on ? 'on' : ''}" data-p="${s.id}">${on ? 'Equipped' : 'Equip'}</button></div>`; }).join('');
  $('streakCards').querySelectorAll('.sk-step').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.k, def = STREAKS.find((s) => s.id === id); st.kills[id] = Math.max(2, Math.min(30, (st.kills[id] ?? def.kills) + Number(b.dataset.d))); saveProfile(); refreshStreaks(); }));
  $('streakCards').querySelectorAll('.sk-pick').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.p, i = picks.indexOf(id); if (i >= 0) { if (picks.length > 1) picks.splice(i, 1); } else { if (picks.length >= 3) picks.shift(); picks.push(id); } saveProfile(); refreshStreaks(); }));
  $('streakRules').innerHTML = STREAK_RULES.map((r) => `<li>${esc(r)}</li>`).join('');
}
function streakSummary() {
  const st = G.profile.streaks;
  return `<div class="sk-summary"><span class="flabel">Killstreaks</span>${st.picks.map((id) => STREAKS.find((s) => s.id === id)).filter(Boolean).map((s) => `<span title="${esc(s.desc)}"><b>${st.kills[s.id] ?? s.kills}</b> ${esc(s.name)}</span>`).join('')}</div>`;
}

// prematch = shown after Deploy, before the match loads
export function showLoadout(isPrematch, tab) {
  prematch = !!isPrematch; if (tab) loTab = tab;
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
  $('toggles').innerHTML = [['invertY', 'Invert vertical look'], ['shadows', 'Shadows'], ['showFps', 'Show frame rate'], ['killcam', 'Kill cam after death'], ['scopeToggle', 'Right-click toggles aim (snipers: 4× → 8× → off)'], ['autoRes', 'Auto resolution (drops render scale to hold the frame rate)']]
    .map(([k, l]) => `<label class="toggle"><input type="checkbox" id="set_${k}" ${s[k] ? 'checked' : ''}><span>${l}</span></label>`).join('');
  for (const k of ['invertY', 'shadows', 'showFps', 'killcam', 'scopeToggle', 'autoRes']) $('set_' + k).addEventListener('change', (e) => { s[k] = e.target.checked; cb.onSetting(k); saveProfile(); });
  seg($('namesSel'), [{ v: 'real', html: 'Real' }, { v: 'fictional', html: 'Fictional' }], s.names, (v) => { s.names = v; cb.onSetting('names'); saveProfile(); });
  seg($('setSlotSel'), slotItems(false), s.slots, (v) => { if (!pickSlots(v, false)) { /* locked */ } refreshSettings(); });
  seg($('scaleSel'), [{ v: 0.6, html: 'Low' }, { v: 0.8, html: 'Medium' }, { v: 1, html: 'Full' }], s.renderScale, (v) => { s.renderScale = Number(v); cb.onSetting('renderScale'); saveProfile(); });
  seg($('fpsSel'), [{ v: 0, html: 'Display' }, { v: 30, html: '30' }, { v: 60, html: '60' }, { v: 120, html: '120' }, { v: 144, html: '144' }], s.fpsCap || 0, (v) => { s.fpsCap = Number(v); saveProfile(); });
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
  { const md = G.profile.career.medals || {}; $('rankLadder').insertAdjacentHTML('afterbegin', '<div class="medal-case"><span class="flabel">Medal case</span><div>' + Object.entries(MEDALS).map(([k, n]) => `<span class="medal ${md[k] ? '' : 'none'}"><b>${md[k] || 0}</b>${esc(n)}</span>`).join('') + '</div></div>'); }
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
  $('openOperator').addEventListener('click', () => showLoadout(false, 'op'));
  for (const [id, k] of [['mpSkinU', 'uniform'], ['mpSkinP', 'pattern'], ['mpSkinH', 'helmet']]) $(id).addEventListener('change', (e) => { G.profile.skin[k] = e.target.value; saveProfile(); cb.onSkin && cb.onSkin(G.profile.skin); refreshLoadout(); });
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
