// Multiplayer lobby screen: host / join by room code, manual copy-paste codes, match settings, start.
import { G } from '../core/state.js';
import { $ } from '../core/util.js';
import { LIMITS, limitDefault, MODES, DIFFICULTY, skillBand, skillFor, BOT_RULES, botRulesDefault, SKINS, RANKS } from '../core/config.js';
import { rankFor } from '../game/progression.js';
import { saveProfile } from '../core/storage.js';
import { MAPS } from '../world/maps/index.js';
import * as net from './net.js';
import { VEHICLE_MODES } from '../entities/vehicles.js';
import * as chat from '../ui/chat.js';

const KEY = 'frontline_mp_v1';
// bot counts in multiplayer (0 = humans only)
const MP_COUNTS = { ffa: [0, 1, 2, 3, 5, 7, 9], tdm: [0, 2, 3, 4, 5, 6], ctf: [0, 2, 3, 4, 5, 6], dom: [0, 2, 3, 4, 5, 6], koth: [0, 2, 3, 4, 5, 6], snd: [0, 2, 3, 4, 5], gungame: [0, 1, 2, 3, 5, 7, 9], infection: [0, 3, 5, 7, 9, 11] };
let saved = null, show = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function load() {
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { saved = {}; }
  saved.name = saved.name || 'PLAYER' + Math.floor(Math.random() * 90 + 10);
  saved.cfg = Object.assign({ mode: 'survival', map: 'yard', difficulty: 'normal', count: 5, sameTeam: false }, saved.cfg || {});
  if (!(saved.cfg.skill >= 1 && saved.cfg.skill <= 10)) saved.cfg.skill = skillFor(saved.cfg.difficulty);
  saved.cfg.bots = { ...botRulesDefault(), ...(saved.cfg.bots || {}) };
  if (!net.MP_MODES.includes(saved.cfg.mode)) saved.cfg.mode = 'survival';
  if (!MAPS[saved.cfg.map]) saved.cfg.map = Object.keys(MAPS)[0];
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} }
const panel = () => $('mp').querySelector('.panel');
const setState = (s) => {
  const was = panel().dataset.state; panel().dataset.state = s;
  if (s !== 'choose' && was === 'choose') panel().dataset.tab = 'match'; // a new room starts on the Match tab
  placeManual(); refreshPhone();
};
const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(t)}</option>`;

function fillSettings(cfg) {
  $('mpMode').innerHTML = net.MP_MODES.map((m) => opt(m, MODES[m].name + (net.COOP(m) ? ' (co-op)' : ' (versus)'), m === cfg.mode)).join('');
  // no range (its own mode) and no custom map (custom maps live in each player's own browser)
  $('mpMap').innerHTML = Object.entries(MAPS).filter(([id]) => id !== 'range' && id !== 'custom').map(([id, d]) => opt(id, d.name, id === cfg.map)).join('');
  if (!MAPS[cfg.map] || cfg.map === 'range' || cfg.map === 'custom') cfg.map = $('mpMap').value; // e.g. '' saved while the list was empty
  $('mpMap').closest('.field').classList.toggle('hidden', cfg.mode === 'range'); // the range is its own map
  $('mpDiff').innerHTML = Array.from({ length: 10 }, (_, i) => opt(i + 1, `${i + 1} · ${DIFFICULTY[skillBand(i + 1)].label}`, i + 1 === +cfg.skill)).join('');
  const counts = MP_COUNTS[cfg.mode];
  $('mpCountRow').classList.toggle('hidden', !counts);
  if (counts) {
    if (!counts.includes(+cfg.count)) cfg.count = MODES[cfg.mode].defaultCount;
    $('mpCountLabel').textContent = ['tdm', 'ctf', 'dom', 'koth', 'snd'].includes(cfg.mode) ? 'Team size (bots fill)' : 'Bots';
    $('mpCount').innerHTML = counts.map((c) => opt(c, c ? (['tdm', 'ctf', 'dom', 'koth', 'snd'].includes(cfg.mode) ? `${c} v ${c}` : String(c)) : 'No bots', c === +cfg.count)).join('');
  }
  const host = !!net.session.host, noBots = !!counts && +cfg.count === 0 && !net.COOP(cfg.mode);
  const zm = cfg.mode === 'zombies' || cfg.mode === 'range'; // no bot skill: zombies have their own difficulty, the range has dummies
  $('mpZdiff').innerHTML = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['nightmare', 'Nightmare']].map(([v, l]) => opt(v, l, v === (cfg.zdiff || 'normal'))).join('');
  $('mpZdiff').disabled = !host; $('mpZdiff').closest('.field').classList.toggle('hidden', cfg.mode !== 'zombies');
  $('mpDiff').closest('.field').classList.toggle('hidden', noBots || zm); $('mpBotRules').closest('.field').classList.toggle('hidden', noBots || zm);
  const LM = LIMITS[cfg.mode] || {}; cfg.limits = cfg.limits || {}; const cur = cfg.limits[cfg.mode] = cfg.limits[cfg.mode] || {};
  for (const [k, id] of [['score', 'mpScore'], ['time', 'mpTime']]) {
    $(id + 'Row').classList.toggle('hidden', !LM[k]); if (!LM[k]) continue;
    if (!LM[k].includes(+cur[k])) cur[k] = limitDefault(cfg.mode, k);
    $(id).innerHTML = LM[k].map((v) => opt(v, k === 'score' ? (v === -1 ? 'Auto' : v === 0 ? 'No limit' : String(v)) : (v === 0 ? 'No limit' : v + ' min'), v === +cur[k])).join('');
  }
  $('mpScoreLabel').textContent = cfg.mode === 'tdm' ? 'Team score to win' : 'Kills to win';
  $('mpPick').value = cfg.pickups === false ? '0' : '1'; $('mpBig').value = cfg.big ? '1' : '0'; $('mpPower').value = cfg.power === false ? '0' : '1'; $('mpPower').disabled = !host; $('mpBig').disabled = !host;
  $('mpBotRules').innerHTML = BOT_RULES.map(([k, label]) => `<button type="button" data-k="${k}" class="${cfg.bots && cfg.bots[k] === false ? '' : 'on'}" aria-pressed="${!(cfg.bots && cfg.bots[k] === false)}"${host ? '' : ' disabled'}>${label}</button>`).join('');
  $('mpTeamRow').classList.toggle('hidden', !['tdm', 'ctf', 'dom', 'koth', 'snd'].includes(cfg.mode)); // Brian 2026-11-19: Versus / Co-op in every team mode
  const vOk = !!(MAPS[cfg.map] && MAPS[cfg.map].vehicles) && VEHICLE_MODES.includes(cfg.mode);
  $('mpVehRow').classList.toggle('hidden', !vOk); $('mpVeh').value = cfg.vehicles ? '1' : '0';
  $('mpTeams').value = cfg.sameTeam ? '1' : '0';
  refreshPhone();
}

// ---------- phones: the lobby as tabs down the left (VT2, Brian 2026-11-15) ----------
// On touch screens the host / joiner lobby shows Match, Players, Rules and Chat as tabs down the left, each with a
// one-line summary; Mode is a row of chips and Map a row of picture tiles (they set the same selects). The existing
// controls move into the tabs (their listeners come along) and move back if touch controls are switched off.
const SHORT = { survival: 'Survival', zombies: 'Zombies', ffa: 'Free for all', tdm: 'Team DM', gungame: 'Gun Game', ctf: 'Capture the Flag', dom: 'Domination', koth: 'King of the Hill', snd: 'Search & Destroy', infection: 'Infection', range: 'Practice range' };
let phoneMoved = null, manualMark = null, lastList = [], chatSeen = 0, tilesKey = '';
const isPhone = () => document.body.classList.contains('touch');
const title = (s) => String(s).toLowerCase().replace(/(^|[\s·-])(\w)/g, (m, a, c) => a + c.toUpperCase()); // HARBOUR -> Harbour
function phoneLayout() {
  if (isPhone() === !!phoneMoved) return;
  if (!isPhone()) { for (const [node, mark] of phoneMoved) mark.replaceWith(node); phoneMoved = null; placeManual(); return; }
  const mp = $('mp'), field = (id) => $(id).closest('.field');
  const moves = [
    [field('mpDiff'), 'mppBots'], [field('mpZdiff'), 'mppBots'], [$('mpCountRow'), 'mppBots'],
    [mp.querySelector('.mp-plist'), 'mppPlayers'],
    [$('mpScoreRow'), 'mppRules'], [$('mpTimeRow'), 'mppRules'], [field('mpPick'), 'mppRules'], [field('mpPower'), 'mppRules'],
    [$('mpVehRow'), 'mppRules'], [field('mpBig'), 'mppRules'], [$('mpTeamRow'), 'mppRules'], [mp.querySelector('.mp-botrules'), 'mppRules'],
    [mp.querySelector('.mp-chat'), 'mppChat'],
    [mp.querySelector('.mp-codebox'), mp.querySelector('.ptitle')], // room code beside the title
    [$('mpStatus'), mp.querySelector('.btn-row'), true], // status line bottom-left, beside the buttons
  ];
  phoneMoved = moves.map(([node, to, first]) => {
    const mark = document.createComment('mp phone layout'); node.before(mark);
    const box = typeof to === 'string' ? $(to) : to;
    if (first) box.prepend(node); else box.append(node);
    return [node, mark];
  });
  tilesKey = ''; placeManual(); refreshPhone();
}
// the copy-paste codes: under Players in a room on a phone; where they were otherwise (the first screen needs them)
function placeManual() {
  const man = $('mp').querySelector('.mp-manual'), inRoom = phoneMoved && panel().dataset.state !== 'choose';
  if (inRoom && !manualMark) { manualMark = document.createComment('mp manual'); man.before(manualMark); $('mppPlayers').append(man); }
  else if (!inRoom && manualMark) { manualMark.replaceWith(man); manualMark = null; }
}
function previewInto(cv, id) { // the main menu's map picture, cropped to the tile
  const src = document.querySelector(`#mapSel [data-v="${id}"] canvas`); if (!src) return;
  const S = src.width, sh = S * cv.height / cv.width;
  cv.getContext('2d').drawImage(src, 0, (S - sh) / 2, S, sh, 0, 0, cv.width, cv.height);
}
function refreshPhone() {
  if (!phoneMoved) return;
  const host = !!net.session.host, mode = $('mpMode').value, map = $('mpMap').value;
  const modes = [...$('mpMode').options].map((o) => o.value), maps = [...$('mpMap').options].map((o) => o.value);
  const key = [host, modes, maps].join('|');
  if (key !== tilesKey) { // rebuild only when the choices change (keeps each row's scroll position)
    tilesKey = key;
    $('mpModeChips').innerHTML = modes.map((v) => `<button type="button" data-v="${v}"${host ? '' : ' disabled'}>${esc(SHORT[v] || MODES[v].name)}</button>`).join('');
    $('mpMapTiles').innerHTML = maps.map((v) => `<button type="button" data-v="${v}"${host ? '' : ' disabled'}><canvas width="192" height="104"></canvas><span>${esc(MAPS[v].name)}</span></button>`).join('');
    $('mpMapTiles').querySelectorAll('button').forEach((b) => previewInto(b.querySelector('canvas'), b.dataset.v));
  }
  $('mpModeChips').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === mode));
  $('mpMapTiles').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === map));
  $('mpMapLine').classList.toggle('hidden', mode === 'range'); // the range is its own map
  refreshTabs();
}
function refreshTabs() {
  if (!phoneMoved) return;
  const mode = $('mpMode').value, map = $('mpMap').value, tab = panel().dataset.tab || 'match';
  if (tab === 'chat') chatSeen = chat.heardCount();
  const unread = Math.max(0, chat.heardCount() - chatSeen);
  const n = lastList.length, waiting = lastList.filter((p) => !p.host && !p.ready && !p.spec).length;
  const pick = (id) => { const s = $(id); return s.closest('.hidden') || !s.selectedOptions[0] ? '' : s.selectedOptions[0].textContent; };
  const score = pick('mpScore'), time = pick('mpTime');
  const rules = [/^\d+$/.test(score) && `${score} to win`, /min/.test(time) && time].filter(Boolean).join(' · ') || ((score || time) ? 'No limits' : ''); // short: one line
  const set = (id, t) => { if ($(id).textContent !== String(t)) $(id).textContent = t; };
  set('mpSumMatch', (SHORT[mode] || '') + (mode === 'range' || !MAPS[map] ? '' : ' · ' + title(MAPS[map].name)));
  set('mpSumPlayersN', n || ''); set('mpSumPlayers', n <= 1 ? 'Waiting for players' : waiting ? `${waiting} not ready` : 'All ready');
  set('mpSumRules', rules || `Pickups ${$('mpPick').value === '1' ? 'on' : 'off'}`);
  set('mpSumChatN', unread || ''); set('mpSumChat', unread ? `${unread} new message${unread > 1 ? 's' : ''}` : 'No new messages');
  for (const b of $('mp').querySelectorAll('.mpp-tabs button')) { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
}
function readSettings() {
  const c = saved.cfg;
  c.mode = $('mpMode').value; c.map = $('mpMap').value; c.skill = +$('mpDiff').value || 5; c.zdiff = $('mpZdiff').value || 'normal'; c.difficulty = skillBand(c.skill);
  c.count = $('mpCount').value === '' ? MODES[c.mode].defaultCount || 0 : +$('mpCount').value; c.sameTeam = $('mpTeams').value === '1'; c.vehicles = $('mpVeh').value === '1'; c.big = $('mpBig').value === '1'; c.power = $('mpPower').value === '1'; c.pickups = $('mpPick').value === '1';
  c.limits = c.limits || {}; c.limits[c.mode] = { score: +$('mpScore').value, time: +$('mpTime').value };
  fillSettings(c); persist();
  if (G.state === 'menu') import('../world/maps/index.js').then((m) => m.loadMap(c.map));
  net.hostCfg({ ...c });
  updateStart();
}
function updateStart() {
  const ok = net.canStart(), wait = net.session.host ? net.notReady() : [];
  $('mpStart').disabled = !ok;
  $('mpWarm').classList.toggle('hidden', !net.session.host); $('mpWarm').disabled = !net.session.host || !net.session.remotes.some((r) => r.hello);
  $('mpStart').textContent = wait.length ? `Waiting: ${wait.length} not ready` : 'Start match';
  $('mpReady').classList.toggle('hidden', !!(net.session.client && net.session.spectate)); // spectators are always ready
  $('mpReady').classList.toggle('on', !!net.session.ready); $('mpReady').textContent = net.session.ready ? 'Ready ✓' : 'Ready';
}
// skins: uniform / pattern / helmet, locked until the listed rank
function fillSkins() {
  const sk = G.profile.skin, rank = rankFor(G.profile.xp);
  const fill = (id, list, cur, word) => { $(id).innerHTML = list.map((e) => { const lock = e[e.length - 1] > rank; return `<option value="${e[0]}"${e[0] === cur ? ' selected' : ''}${lock ? ' disabled' : ''}>${esc(e[1])}${lock ? ' · ' + esc(RANKS[e[e.length - 1]].name) : ''}</option>`; }).join(''); $(id).title = word; };
  for (const [k, list] of [['uniform', SKINS.uniform], ['pattern', SKINS.pattern], ['helmet', SKINS.helmet]]) { const e = list.find((x) => x[0] === sk[k]); if (!e || e[e.length - 1] > rank) sk[k] = list[0][0]; }
  fill('mpSkinU', SKINS.uniform, sk.uniform, 'Uniform'); fill('mpSkinP', SKINS.pattern, sk.pattern, 'Pattern'); fill('mpSkinH', SKINS.helmet, sk.helmet, 'Helmet');
}
const status = (msg, kind = '') => { const s = $('mpStatus'); s.textContent = msg || ''; s.className = 'mp-status ' + kind; };
function copy(text, btn) {
  const done = () => { if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1200); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => {});
  else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch {} ta.remove(); }
}
const name = () => { saved.name = $('mpName').value.trim() || saved.name; persist(); return saved.name; };

export function initLobby(cb) {
  show = cb.showScreen;
  $('mpBuild').textContent = 'Version: ' + net.BUILD; $('buildTag').textContent = 'Frontline: Solo Ops · ' + net.BUILD;
  // invite link: hosted copies open straight into the host's lobby (#join=CODE)
  $('mpCopyLink').addEventListener('click', (e) => copy(location.href.split('#')[0] + '#join=' + $('mpRoomCode').textContent.trim(), e.target));
  $('mpCopyLink').classList.toggle('hidden', !/^https?:/.test(location.protocol));
  const jm = /#join=([A-Z0-9]{5})/i.exec(location.hash);
  if (jm) setTimeout(() => { history.replaceState(null, '', location.href.split('#')[0]); openMp(); $('mpCode').value = jm[1].toUpperCase(); if (localStorage.getItem(KEY)) $('mpJoin').click(); else status('Type your name, then press Join.', 'ok'); }, 300);
  load();
  net.setUi({
    status,
    code: (c) => { $('mpRoomCode').textContent = c; },
    players: (list, cfg) => {
      lastList = list;
      const host = net.session.host, route = { relay: 'relayed', lan: 'LAN', direct: 'direct' };
      $('mpPlayers').innerHTML = list.map((p) => `<li><span>${p.dev ? `<b class="dev" title="${p.dev === 'phone' ? 'Playing on a phone or tablet' : 'Playing on a computer'}" aria-label="${p.dev === 'phone' ? 'phone' : 'computer'}">${p.dev === 'phone' ? '📱' : '💻'}</b> ` : ''}${esc(p.name)}${p.host ? ' <i>host</i>' : p.spec ? ' <i class="rdy">spectating</i>' : ` <i class="${p.ready ? 'rdy' : 'nrdy'}">${p.ready ? 'ready' : 'not ready'}</i>`}</span><i>${p.host ? '' : [route[p.route] || '', p.ping ? p.ping + ' ms' : ''].filter(Boolean).join(' · ')}${host && !p.host ? `<button class="kick" data-slot="${p.slot}" type="button">Kick</button>` : ''}</i></li>`).join('')
        + (list.length < net.maxPlayers() ? `<li><i>Waiting for players… (up to ${net.maxPlayers()})</i></li>` : '');
      $('mpCount8').textContent = `${list.length}/${net.maxPlayers()}`;
      // big rooms: the host's upload grows with every player (each gets the whole match ~20-30 times a second)
      const c = cfg || net.session.cfg || {}, n = list.length, units = n + (+c.count || 0), mbps = Math.max(0, n - 1) * (20 * units + 60) * (n > 8 ? 20 : 30) * 0.7 * 1.12 * 8 / 1e6;
      const relayed = list.some((p) => p.route === 'relay');
      $('mpNet').classList.toggle('hidden', n <= 8 && !c.big);
      $('mpNet').textContent = `Big room: the host needs about ${mbps.toFixed(1)} Mbps upload. Best on wired or strong Wi-Fi, not a phone hotspot.` + (relayed ? ' Some players are relayed: they may lag.' : '');
      if (cfg && net.session.client) fillSettings(cfg);
      updateStart(); refreshPhone(); // also redraws the chips / tiles once we know we're the host
    },
  });
  $('openMp').addEventListener('click', () => openMp());
  $('mp').querySelector('.mpp-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { panel().dataset.tab = b.dataset.tab; refreshTabs(); } });
  for (const [box, sel] of [['mpModeChips', 'mpMode'], ['mpMapTiles', 'mpMap']]) $(box).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !net.session.host || $(sel).value === b.dataset.v) return;
    $(sel).value = b.dataset.v; $(sel).dispatchEvent(new Event('change')); // the same path as picking from the list
  });
  $('mpName').addEventListener('change', name);
  $('mpHost').addEventListener('click', () => {
    setState('host'); $('mpRoomCode').textContent = '·····';
    fillSettings(saved.cfg); net.hostOpen(name(), { ...saved.cfg }, G.profile.skin); updateStart();
  });
  $('mpPlayers').addEventListener('click', (e) => { const b = e.target.closest('.kick'); if (b) net.kick(+b.dataset.slot); });
  $('mpReady').addEventListener('click', () => { net.setReady(!net.session.ready); updateStart(); });
  $('mpChatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { net.sendChat(e.target.value); e.target.value = ''; } });
  // Join plays, Watch spectates (SP1, Brian 2026-11-15: two buttons instead of a Spectate box that was easy to tick)
  const join = (watch) => {
    const code = $('mpCode').value.trim().toUpperCase();
    if (code.length < 5) { status('Type the 5-letter room code from the host.', 'warn'); return; }
    setState('client');
    net.joinCode(name(), code, G.profile.skin, watch).catch(() => setState('choose'));
  };
  $('mpJoin').addEventListener('click', () => join(false));
  $('mpWatch').addEventListener('click', () => join(true));
  $('mpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(false); e.stopPropagation(); });
  for (const id of ['mpMode', 'mpMap', 'mpDiff', 'mpZdiff', 'mpCount', 'mpTeams', 'mpVeh', 'mpScore', 'mpTime', 'mpPick', 'mpBig', 'mpPower']) $(id).addEventListener('change', () => { if (net.session.host) readSettings(); });
  $('mpBotRules').addEventListener('click', (e) => { const k = e.target.dataset && e.target.dataset.k; if (!k || !net.session.host) return; saved.cfg.bots[k] = !saved.cfg.bots[k]; readSettings(); });
  $('mpCopyCode').addEventListener('click', (e) => copy($('mpRoomCode').textContent, e.target));
  $('mpInvite').addEventListener('click', async () => {
    if (!net.session.host) { setState('host'); fillSettings(saved.cfg); net.hostOpen(name(), { ...saved.cfg }, G.profile.skin); }
    status('Making invite code…');
    try { const c = await net.hostInvite(); $('mpInviteOut').value = c; copy(c); status('Invite copied. Send it to your friend, then paste their reply below.', 'ok'); }
    catch (e) { status(e.message, 'warn'); }
  });
  $('mpInviteOut').addEventListener('focus', (e) => e.target.select());
  $('mpReplyOut').addEventListener('focus', (e) => e.target.select());
  $('mpAccept').addEventListener('click', async () => {
    try { await net.hostAccept($('mpReplyIn').value); $('mpReplyIn').value = ''; $('mpInviteOut').value = ''; }
    catch (e) { status(e.message, 'warn'); }
  });
  const reply = async (watch) => {
    try {
      status('Making reply code…');
      setState('client');
      const c = await net.joinManual(name(), $('mpInviteIn').value, G.profile.skin, watch);
      $('mpReplyOut').value = c; copy(c);
      status('Reply copied. Send it to the host; you connect as soon as they paste it.', 'ok');
    } catch (e) { status(e.message, 'warn'); setState('choose'); }
  };
  $('mpReply').addEventListener('click', () => reply(false));
  $('mpReplyWatch').addEventListener('click', () => reply(true));
  $('mpWarm').addEventListener('click', () => { if (!net.hostWarmup()) status('Warm-up starts once a friend has joined.', 'warn'); });
  $('mpStart').addEventListener('click', () => { if (!net.hostStart()) status(net.notReady().length ? 'Waiting for everyone to press Ready.' : 'Wait for a player to join first.', 'warn'); });
  $('mpBack').addEventListener('click', () => {
    if (panel().dataset.state === 'choose') { show('menu'); return; }
    net.leave(); setState('choose'); status('');
    $('mpInviteOut').value = $('mpReplyOut').value = '';
  });
  // stop the game's key bindings from firing while typing
  for (const el of $('mp').querySelectorAll('input, textarea')) el.addEventListener('keydown', (e) => e.stopPropagation());
  setInterval(() => {
    const el = $('netPing'), on = !!(G.mp && G.mp.live);
    el.classList.toggle('hidden', !on);
    if (on) el.textContent = `PING ${net.pingMs()} ms`;
    if (!$('mp').classList.contains('hidden') && G.mp && G.mp.host) updateStart();
    if (!$('mp').classList.contains('hidden')) refreshTabs();
  }, 500);
}

export function openMp(msg) {
  phoneLayout(); // touch screens: tabs down the left (re-checked each time: touch controls can be switched in Settings)
  $('mpName').value = saved.name;
  const s = net.session;
  setState(s.host ? 'host' : s.client ? 'client' : 'choose');
  if (s.host) fillSettings(saved.cfg);
  show('mp');
  if (msg) status(msg, 'warn');
  updateStart();
}
