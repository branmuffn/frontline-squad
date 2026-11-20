// Multiplayer text chat: one log shown in the lobby and (fading) on the HUD; T or Enter opens the in-match input.
import { esc } from '../core/util.js';
let lines = [], fade = 0, sendFn = null, heard = 0;
const el = (id) => document.getElementById(id);
export function reset() { lines = []; heard = 0; render(); }
export const heardCount = () => heard; // messages from others and system lines since the last reset
export function add(name, msg, kind = '', team = false) {
  lines.push({ name, msg, kind, team }); if (lines.length > 60) lines.shift();
  if (kind !== 'me') heard++;
  render(true);
}
const line = (l) => l.name ? `<div class="cl ${l.kind}">${l.team ? '<i>[Team]</i> ' : ''}<b>${esc(l.name)}</b> ${esc(l.msg)}</div>` : `<div class="cl sys">${esc(l.msg)}</div>`;
function render(fresh) {
  const lg = el('mpChatLog'); if (lg) { lg.innerHTML = lines.slice(-40).map(line).join(''); lg.scrollTop = lg.scrollHeight; }
  const h = el('chatlog'); if (!h) return;
  h.innerHTML = lines.slice(-6).map(line).join('');
  if (fresh) { h.classList.add('fresh'); clearTimeout(fade); fade = setTimeout(() => h.classList.remove('fresh'), 9000); }
}
export const isOpen = () => { const i = el('chatIn'); return !!(i && !i.classList.contains('hidden')); };
// in-match input; send(text) is net.sendChat
// Brian (2026-11-20): desktop can switch too. T opens To: All, Y opens To: Team; in team modes Tab flips while typing.
// send(text, team) gets the side chosen at the moment Enter is pressed.
let curTeam = false, canSwitch = false;
function paintIn() {
  const i = el('chatIn'); if (!i) return;
  const sw = canSwitch ? ' · Tab: ' + (curTeam ? 'everyone' : 'team only') : '';
  i.placeholder = (curTeam ? 'To: Team' : 'To: All') + sw + ' · Enter sends · Esc cancels';
  i.classList.toggle('team', curTeam);
}
export function open(send, team, teams = !!team) {
  const i = el('chatIn'); if (!i) return;
  sendFn = send; curTeam = !!team; canSwitch = !!teams; i.value = ''; paintIn(); i.classList.remove('hidden'); el('chatlog').classList.add('fresh', 'typing'); i.focus();
}
// Brian (2026-11-19): Esc in chat also makes the browser drop the mouse lock, which used to open the pause menu.
// main.js asks typingOrJustClosed() and skips the pause, so Esc only closes the chat.
let closedT = 0;
export const typingOrJustClosed = () => isOpen() || Date.now() - closedT < 400;
function close() { closedT = Date.now(); const i = el('chatIn'); i.classList.add('hidden'); i.blur(); el('chatlog').classList.remove('typing'); clearTimeout(fade); fade = setTimeout(() => el('chatlog').classList.remove('fresh'), 6000); }
export const closeChat = () => close();
export function initChat() {
  const i = el('chatIn');
  i.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const v = i.value; close(); if (v.trim() && sendFn) sendFn(v, curTeam); }
    else if (e.key === 'Tab') { e.preventDefault(); if (canSwitch) { curTeam = !curTeam; paintIn(); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  i.addEventListener('keyup', (e) => e.stopPropagation());
  i.addEventListener('blur', () => { if (!i.classList.contains('hidden')) close(); });
}

// Phone quick chat (Brian picked D1, 2026-11-20): the touch chat button opens one row of quick replies (a tap sends),
// "Type…" opens the keyboard. The game keeps running; the row hides after 5 s untouched.
const QUICK = ['gg', 'nice!', 'help me', 'on my way', 'go go go', 'thanks'];
let qEl = null, qHide = 0, qTeam = false, qSend = null;
export const quickOpen = () => !!(qEl && !qEl.classList.contains('hidden'));
export function hideQuick() { if (qEl) qEl.classList.add('hidden'); clearTimeout(qHide); }
const qTimer = () => { clearTimeout(qHide); qHide = setTimeout(hideQuick, 5000); };
export function toggleQuick(send, teams) {
  if (quickOpen()) { hideQuick(); return; }
  qSend = send; if (!teams) qTeam = false;
  if (!qEl) {
    qEl = document.createElement('div'); qEl.id = 'chatQuick'; qEl.className = 'chat-quick hidden';
    qEl.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; e.preventDefault();
      if (b.dataset.q === 'to') { qTeam = !qTeam; paintTo(); qTimer(); return; }
      hideQuick();
      if (b.dataset.q === 'type') open((t) => qSend(t, qTeam), qTeam, false); // phones pick All/Team on the chip first
      else qSend(b.dataset.q, qTeam);
    });
    document.body.appendChild(qEl);
  }
  qEl.innerHTML = (teams ? '<button type="button" class="cq-to" data-q="to"></button>' : '')
    + QUICK.map((q) => `<button type="button" data-q="${q}">${q}</button>`).join('') + '<button type="button" data-q="type">Type…</button>';
  paintTo(); qEl.classList.remove('hidden'); el('chatlog').classList.add('fresh'); qTimer();
}
function paintTo() { const b = qEl && qEl.querySelector('.cq-to'); if (b) { b.textContent = qTeam ? 'To: Team' : 'To: All'; b.classList.toggle('team', qTeam); } }
