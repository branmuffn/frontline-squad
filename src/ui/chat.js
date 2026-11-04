// Multiplayer text chat: one log shown in the lobby and (fading) on the HUD; T or Enter opens the in-match input.
import { esc } from '../core/util.js';
let lines = [], fade = 0, sendFn = null;
const el = (id) => document.getElementById(id);
export function reset() { lines = []; render(); }
export function add(name, msg, kind = '') {
  lines.push({ name, msg, kind }); if (lines.length > 60) lines.shift();
  render(true);
}
const line = (l) => l.name ? `<div class="cl ${l.kind}"><b>${esc(l.name)}</b> ${esc(l.msg)}</div>` : `<div class="cl sys">${esc(l.msg)}</div>`;
function render(fresh) {
  const lg = el('mpChatLog'); if (lg) { lg.innerHTML = lines.slice(-40).map(line).join(''); lg.scrollTop = lg.scrollHeight; }
  const h = el('chatlog'); if (!h) return;
  h.innerHTML = lines.slice(-6).map(line).join('');
  if (fresh) { h.classList.add('fresh'); clearTimeout(fade); fade = setTimeout(() => h.classList.remove('fresh'), 9000); }
}
export const isOpen = () => { const i = el('chatIn'); return !!(i && !i.classList.contains('hidden')); };
// in-match input; send(text) is net.sendChat
export function open(send) {
  const i = el('chatIn'); if (!i) return;
  sendFn = send; i.value = ''; i.classList.remove('hidden'); el('chatlog').classList.add('fresh', 'typing'); i.focus();
}
function close() { const i = el('chatIn'); i.classList.add('hidden'); i.blur(); el('chatlog').classList.remove('typing'); clearTimeout(fade); fade = setTimeout(() => el('chatlog').classList.remove('fresh'), 6000); }
export function initChat() {
  const i = el('chatIn');
  i.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const v = i.value; close(); if (v.trim() && sendFn) sendFn(v); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  i.addEventListener('keyup', (e) => e.stopPropagation());
  i.addEventListener('blur', () => { if (!i.classList.contains('hidden')) close(); });
}
