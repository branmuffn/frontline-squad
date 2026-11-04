// Multiplayer lobby screen: host / join by room code, manual copy-paste codes, match settings, start.
import { G } from '../core/state.js';
import { $ } from '../core/util.js';
import { MODES, DIFFICULTY } from '../core/config.js';
import { MAPS } from '../world/maps/index.js';
import * as net from './net.js';

const KEY = 'frontline_mp_v1';
let saved = null, show = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function load() {
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { saved = {}; }
  saved.name = saved.name || 'PLAYER' + Math.floor(Math.random() * 90 + 10);
  saved.cfg = Object.assign({ mode: 'survival', map: 'yard', difficulty: 'normal', count: 5, sameTeam: false }, saved.cfg || {});
  if (!net.MP_MODES.includes(saved.cfg.mode)) saved.cfg.mode = 'survival';
  if (!MAPS[saved.cfg.map]) saved.cfg.map = Object.keys(MAPS)[0];
  if (!DIFFICULTY[saved.cfg.difficulty]) saved.cfg.difficulty = Object.keys(DIFFICULTY)[1] || Object.keys(DIFFICULTY)[0];
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} }
const panel = () => $('mp').querySelector('.panel');
const setState = (s) => { panel().dataset.state = s; };
const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(t)}</option>`;

function fillSettings(cfg) {
  $('mpMode').innerHTML = net.MP_MODES.map((m) => opt(m, MODES[m].name + (net.COOP(m) ? ' (co-op)' : ' (versus)'), m === cfg.mode)).join('');
  $('mpMap').innerHTML = Object.entries(MAPS).map(([id, d]) => opt(id, d.name, id === cfg.map)).join('');
  $('mpDiff').innerHTML = Object.entries(DIFFICULTY).map(([id, d]) => opt(id, d.label, id === cfg.difficulty)).join('');
  const counts = MODES[cfg.mode].counts;
  $('mpCountRow').classList.toggle('hidden', !counts);
  if (counts) {
    if (!counts.includes(+cfg.count)) cfg.count = MODES[cfg.mode].defaultCount;
    $('mpCountLabel').textContent = cfg.mode === 'tdm' ? 'Squad size' : 'Bots';
    $('mpCount').innerHTML = counts.map((c) => opt(c, String(c), c === +cfg.count)).join('');
  }
  $('mpTeamRow').classList.toggle('hidden', cfg.mode !== 'tdm');
  $('mpTeams').value = cfg.sameTeam ? '1' : '0';
}
function readSettings() {
  const c = saved.cfg;
  c.mode = $('mpMode').value; c.map = $('mpMap').value; c.difficulty = $('mpDiff').value;
  c.count = +$('mpCount').value || MODES[c.mode].defaultCount || 0; c.sameTeam = $('mpTeams').value === '1';
  fillSettings(c); persist();
  if (G.state === 'menu') import('../world/maps/index.js').then((m) => m.loadMap(c.map));
  net.hostCfg({ ...c });
  updateStart();
}
function updateStart() { $('mpStart').disabled = !net.canStart(); }
const status = (msg, kind = '') => { const s = $('mpStatus'); s.textContent = msg || ''; s.className = 'mp-status ' + kind; };
function copy(text, btn) {
  const done = () => { if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1200); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => {});
  else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch {} ta.remove(); }
}
const name = () => { saved.name = $('mpName').value.trim() || saved.name; persist(); return saved.name; };

export function initLobby(cb) {
  show = cb.showScreen;
  load();
  net.setUi({
    status,
    code: (c) => { $('mpRoomCode').textContent = c; },
    players: (list, cfg) => {
      $('mpPlayers').innerHTML = list.map((p) => `<li><span>${esc(p.name)}${p.host ? ' <i>host</i>' : ''}</span><i>${p.host ? '' : p.ping ? p.ping + ' ms' : ''}</i></li>`).join('')
        + (list.length < net.MAX_PLAYERS ? '<li><i>Waiting for a player…</i></li>' : '');
      if (cfg && net.session.client) fillSettings(cfg);
      updateStart();
    },
  });
  $('openMp').addEventListener('click', () => openMp());
  $('mpName').addEventListener('change', name);
  $('mpHost').addEventListener('click', () => {
    setState('host'); $('mpRoomCode').textContent = '·····';
    fillSettings(saved.cfg); net.hostOpen(name(), { ...saved.cfg }); updateStart();
  });
  const join = () => {
    const code = $('mpCode').value.trim().toUpperCase();
    if (code.length < 5) { status('Type the 5-letter room code from the host.', 'warn'); return; }
    setState('client');
    net.joinCode(name(), code).catch(() => setState('choose'));
  };
  $('mpJoin').addEventListener('click', join);
  $('mpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); e.stopPropagation(); });
  for (const id of ['mpMode', 'mpMap', 'mpDiff', 'mpCount', 'mpTeams']) $(id).addEventListener('change', () => { if (net.session.host) readSettings(); });
  $('mpCopyCode').addEventListener('click', (e) => copy($('mpRoomCode').textContent, e.target));
  $('mpInvite').addEventListener('click', async () => {
    if (!net.session.host) { setState('host'); fillSettings(saved.cfg); net.hostOpen(name(), { ...saved.cfg }); }
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
      const c = await net.joinManual(name(), $('mpInviteIn').value);
      $('mpReplyOut').value = c; copy(c);
      status('Reply copied. Send it to the host; you connect as soon as they paste it.', 'ok');
    } catch (e) { status(e.message, 'warn'); setState('choose'); }
  });
  $('mpStart').addEventListener('click', () => { if (!net.hostStart()) status('Wait for a player to join first.', 'warn'); });
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
