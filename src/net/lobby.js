// Multiplayer lobby screen: host / join by room code, manual copy-paste codes, match settings, start.
import { G } from '../core/state.js';
import { $ } from '../core/util.js';
import { LIMITS, limitDefault, MODES, DIFFICULTY, skillBand, skillFor, BOT_RULES, botRulesDefault, SKINS, RANKS } from '../core/config.js';
import { rankFor } from '../game/progression.js';
import { saveProfile } from '../core/storage.js';
import { MAPS } from '../world/maps/index.js';
import * as net from './net.js';
import { VEHICLE_MODES } from '../entities/vehicles.js';

const KEY = 'frontline_mp_v1';
// bot counts in multiplayer (0 = humans only)
const MP_COUNTS = { ffa: [0, 1, 2, 3, 5, 7, 9], tdm: [0, 2, 3, 4, 5, 6] };
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
const setState = (s) => { panel().dataset.state = s; };
const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(t)}</option>`;

function fillSettings(cfg) {
  $('mpMode').innerHTML = net.MP_MODES.map((m) => opt(m, MODES[m].name + (net.COOP(m) ? ' (co-op)' : ' (versus)'), m === cfg.mode)).join('');
  $('mpMap').innerHTML = Object.entries(MAPS).map(([id, d]) => opt(id, d.name, id === cfg.map)).join('');
  $('mpDiff').innerHTML = Array.from({ length: 10 }, (_, i) => opt(i + 1, `${i + 1} · ${DIFFICULTY[skillBand(i + 1)].label}`, i + 1 === +cfg.skill)).join('');
  const counts = MP_COUNTS[cfg.mode];
  $('mpCountRow').classList.toggle('hidden', !counts);
  if (counts) {
    if (!counts.includes(+cfg.count)) cfg.count = MODES[cfg.mode].defaultCount;
    $('mpCountLabel').textContent = cfg.mode === 'tdm' ? 'Team size (bots fill)' : 'Bots';
    $('mpCount').innerHTML = counts.map((c) => opt(c, c ? (cfg.mode === 'tdm' ? `${c} v ${c}` : String(c)) : 'No bots', c === +cfg.count)).join('');
  }
  const host = !!net.session.host, noBots = !!counts && +cfg.count === 0 && !net.COOP(cfg.mode);
  $('mpDiff').closest('.field').classList.toggle('hidden', noBots); $('mpBotRules').closest('.field').classList.toggle('hidden', noBots);
  const LM = LIMITS[cfg.mode] || {}; cfg.limits = cfg.limits || {}; const cur = cfg.limits[cfg.mode] = cfg.limits[cfg.mode] || {};
  for (const [k, id] of [['score', 'mpScore'], ['time', 'mpTime']]) {
    $(id + 'Row').classList.toggle('hidden', !LM[k]); if (!LM[k]) continue;
    if (!LM[k].includes(+cur[k])) cur[k] = limitDefault(cfg.mode, k);
    $(id).innerHTML = LM[k].map((v) => opt(v, k === 'score' ? (v === -1 ? 'Auto' : v === 0 ? 'No limit' : String(v)) : (v === 0 ? 'No limit' : v + ' min'), v === +cur[k])).join('');
  }
  $('mpScoreLabel').textContent = cfg.mode === 'tdm' ? 'Team score to win' : 'Kills to win';
  $('mpPick').value = cfg.pickups === false ? '0' : '1';
  $('mpBotRules').innerHTML = BOT_RULES.map(([k, label]) => `<button type="button" data-k="${k}" class="${cfg.bots && cfg.bots[k] === false ? '' : 'on'}" aria-pressed="${!(cfg.bots && cfg.bots[k] === false)}"${host ? '' : ' disabled'}>${label}</button>`).join('');
  $('mpTeamRow').classList.toggle('hidden', cfg.mode !== 'tdm');
  const vOk = !!(MAPS[cfg.map] && MAPS[cfg.map].vehicles) && VEHICLE_MODES.includes(cfg.mode);
  $('mpVehRow').classList.toggle('hidden', !vOk); $('mpVeh').value = cfg.vehicles ? '1' : '0';
  $('mpTeams').value = cfg.sameTeam ? '1' : '0';
}
function readSettings() {
  const c = saved.cfg;
  c.mode = $('mpMode').value; c.map = $('mpMap').value; c.skill = +$('mpDiff').value || 5; c.difficulty = skillBand(c.skill);
  c.count = $('mpCount').value === '' ? MODES[c.mode].defaultCount || 0 : +$('mpCount').value; c.sameTeam = $('mpTeams').value === '1'; c.vehicles = $('mpVeh').value === '1'; c.pickups = $('mpPick').value === '1';
  c.limits = c.limits || {}; c.limits[c.mode] = { score: +$('mpScore').value, time: +$('mpTime').value };
  fillSettings(c); persist();
  if (G.state === 'menu') import('../world/maps/index.js').then((m) => m.loadMap(c.map));
  net.hostCfg({ ...c });
  updateStart();
}
function updateStart() {
  const ok = net.canStart(), wait = net.session.host ? net.notReady() : [];
  $('mpStart').disabled = !ok;
  $('mpStart').textContent = wait.length ? `Waiting: ${wait.length} not ready` : 'Start match';
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
  $('openOperator').addEventListener('click', () => { fillSkins(); show('operator'); });
  $('operatorDone').addEventListener('click', () => show('menu'));
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
      const host = net.session.host, route = { relay: 'relayed', lan: 'LAN', direct: 'direct' };
      $('mpPlayers').innerHTML = list.map((p) => `<li><span>${esc(p.name)}${p.host ? ' <i>host</i>' : ` <i class="${p.ready ? 'rdy' : 'nrdy'}">${p.ready ? 'ready' : 'not ready'}</i>`}</span><i>${p.host ? '' : [route[p.route] || '', p.ping ? p.ping + ' ms' : ''].filter(Boolean).join(' · ')}${host && !p.host ? `<button class="kick" data-slot="${p.slot}" type="button">Kick</button>` : ''}</i></li>`).join('')
        + (list.length < net.MAX_PLAYERS ? `<li><i>Waiting for players… (up to ${net.MAX_PLAYERS})</i></li>` : '');
      $('mpCount8').textContent = `${list.length}/${net.MAX_PLAYERS}`;
      if (cfg && net.session.client) fillSettings(cfg);
      updateStart();
    },
  });
  $('openMp').addEventListener('click', () => openMp());
  $('mpName').addEventListener('change', name);
  $('mpHost').addEventListener('click', () => {
    setState('host'); $('mpRoomCode').textContent = '·····';
    fillSettings(saved.cfg); net.hostOpen(name(), { ...saved.cfg }, G.profile.skin); updateStart();
  });
  $('mpPlayers').addEventListener('click', (e) => { const b = e.target.closest('.kick'); if (b) net.kick(+b.dataset.slot); });
  $('mpReady').addEventListener('click', () => { net.setReady(!net.session.ready); updateStart(); });
  $('mpChatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { net.sendChat(e.target.value); e.target.value = ''; } });
  for (const [id, k] of [['mpSkinU', 'uniform'], ['mpSkinP', 'pattern'], ['mpSkinH', 'helmet']]) $(id).addEventListener('change', (e) => { G.profile.skin[k] = e.target.value; saveProfile(); net.setSkin(G.profile.skin); });
  const join = () => {
    const code = $('mpCode').value.trim().toUpperCase();
    if (code.length < 5) { status('Type the 5-letter room code from the host.', 'warn'); return; }
    setState('client');
    net.joinCode(name(), code, G.profile.skin).catch(() => setState('choose'));
  };
  $('mpJoin').addEventListener('click', join);
  $('mpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); e.stopPropagation(); });
  for (const id of ['mpMode', 'mpMap', 'mpDiff', 'mpCount', 'mpTeams', 'mpVeh', 'mpScore', 'mpTime', 'mpPick']) $(id).addEventListener('change', () => { if (net.session.host) readSettings(); });
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
  $('mpReply').addEventListener('click', async () => {
    try {
      status('Making reply code…');
      setState('client');
      const c = await net.joinManual(name(), $('mpInviteIn').value, G.profile.skin);
      $('mpReplyOut').value = c; copy(c);
      status('Reply copied. Send it to the host; you connect as soon as they paste it.', 'ok');
    } catch (e) { status(e.message, 'warn'); setState('choose'); }
  });
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
  }, 500);
}

export function openMp(msg) {
  $('mpName').value = saved.name;
  const s = net.session;
  setState(s.host ? 'host' : s.client ? 'client' : 'choose');
  if (s.host) fillSettings(saved.cfg);
  show('mp');
  if (msg) status(msg, 'warn');
  updateStart();
}
