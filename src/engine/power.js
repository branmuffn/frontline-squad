// Power & performance helpers: frame CPU time and host upload for the perf readout, the "on battery?" prompt,
// persistent storage (so the browser keeps the profile) and a gentle backup reminder.
import { G, isLive } from '../core/state.js';
import { saveProfile, applyQuality } from '../core/storage.js';
import * as net from '../net/net.js';

let t0 = 0, msAcc = 0, msN = 0, upLast = 0, upBytes = -1, asked = false;
export function perfFrameStart() { t0 = performance.now(); }
export function perfTick() {
  const p = G.perf, now = performance.now();
  msAcc += now - t0; msN++;
  if (msN >= 20) { p.ms = msAcc / msN; msAcc = msN = 0; }
  const S = net.session;
  p.host = !!(S && S.host && S.remotes && S.remotes.length);
  if (p.host && now - upLast > 1000) {
    let b = 0; for (const r of S.remotes) if (r.link) b += r.link.bytesOut + (r.link.bytesRel || 0);
    if (upBytes >= 0 && b >= upBytes) p.up = ((b - upBytes) * 8 / 1e6) / ((now - upLast) / 1000) * 1.12; // +~12% packet overhead
    upBytes = b; upLast = now;
  } else if (!p.host) upBytes = -1;
}

function toast(html, buttons) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<p>${html}</p><div class="btn-row">${buttons.map((b, i) => `<button type="button" data-i="${i}" class="${i ? 'btn-ghost' : 'btn-primary'}">${b[0]}</button>`).join('')}</div>`;
  el.classList.remove('hidden');
  el.querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => { el.classList.add('hidden'); const f = buttons[+bt.dataset.i][1]; if (f) f(); }));
}
export function hideToast() { const el = document.getElementById('toast'); if (el) el.classList.add('hidden'); }

// Chrome/Edge expose the battery state; Safari/Firefox don't, so there the preset is picked by hand.
async function batteryCheck(onQuality) {
  const s = G.profile.settings;
  if (asked || !s.batteryAsk || s.quality === 'battery' || !navigator.getBattery) return;
  try {
    const b = await navigator.getBattery();
    const ask = () => {
      if (asked || b.charging || G.profile.settings.quality === 'battery' || isLive()) return;
      asked = true;
      toast('You’re on battery. Switch to the <b>Battery saver</b> graphics preset? (Settings → Display → Quality to change it back.)',
        [['Switch', () => { applyQuality(G.profile.settings, 'battery'); saveProfile(); onQuality(); }], ['Not now', null], ['Don’t ask again', () => { G.profile.settings.batteryAsk = false; saveProfile(); }]]);
    };
    ask(); b.addEventListener('chargingchange', ask);
  } catch (e) { /* not available */ }
}

function backupNag(exportNow) {
  const bk = G.profile.backup, now = Date.now(), day = 864e5;
  if (G.profile.xp < 800 || now - bk.last < 14 * day || now - bk.nag < 3 * day) return;
  bk.nag = now; saveProfile();
  toast('Your rank and progress are saved in this browser only. Clearing browser data or switching browser loses them. Make a backup file?',
    [['Export now', exportNow], ['Later', null]]);
}

export function initPower(onQuality, exportNow) {
  const once = () => {
    window.removeEventListener('pointerdown', once);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {}); } catch (e) { /* ignore */ }
    setTimeout(() => batteryCheck(onQuality), 1500);
    setTimeout(() => { if (!isLive() && !asked) backupNag(exportNow); }, 4000);
  };
  window.addEventListener('pointerdown', once);
}
