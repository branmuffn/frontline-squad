import { G } from './state.js';

const KEY = 'frontline_solo_ops_v2';

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', crouchAlt: 'ControlLeft',
  sprint: 'ShiftLeft', reload: 'KeyR', primary: 'Digit1', secondary: 'Digit2', melee: 'Digit3', slot4: 'Digit4', grenade: 'KeyG',
  streak: 'KeyF', swap: 'KeyQ', scoreboard: 'Tab', armory: 'KeyB', interact: 'KeyE', zoom: 'KeyZ', prone: 'KeyX', chat: 'KeyT', teamChat: 'KeyY', equip: 'KeyV',
};
export const KEY_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch',
  crouchAlt: 'Crouch (alternate)', sprint: 'Sprint', reload: 'Reload', primary: 'Weapon 1', secondary: 'Weapon 2',
  melee: 'Weapon 3 (knife unless Overkill)', slot4: 'Knife in Overkill (weapon 4)', grenade: 'Frag grenade (hold to cook)', streak: 'Use killstreak', swap: 'Last weapon (Q)', scoreboard: 'Scoreboard', armory: 'Weapon menu (Sandbox)', interact: 'Pick up weapon', zoom: 'Scope zoom (4× / 8×)', prone: 'Go prone / get up', chat: 'Chat to everyone (multiplayer; Enter also works)', teamChat: 'Chat to your team only (team modes)', equip: 'Equipment (claymore)',
};

// Quality presets: picking one fills in every graphics option; changing any one of them shows "Custom".
export const QUALITY = {
  battery: { fpsCap: 60, pixelMax: 1, renderScale: 0.8, autoRes: true, shadowQ: 'low', shadowRate: 'half', particles: 'reduced', lowMenus: true, previewFps: 30 },
  balanced: { fpsCap: 60, pixelMax: 1.25, renderScale: 1, autoRes: true, shadowQ: 'high', shadowRate: 'half', particles: 'full', lowMenus: true, previewFps: 30 },
  max: { fpsCap: 0, pixelMax: 1.5, renderScale: 1, autoRes: false, shadowQ: 'high', shadowRate: 'full', particles: 'full', lowMenus: false, previewFps: 60 },
};
export const QUALITY_KEYS = Object.keys(QUALITY.balanced);
export function applyQuality(s, name) { if (QUALITY[name]) { Object.assign(s, QUALITY[name]); s.shadows = s.shadowQ !== 'off'; } s.quality = name; }
export function detectQuality(s) { for (const [n, q] of Object.entries(QUALITY)) if (QUALITY_KEYS.every((k) => s[k] === q[k])) return n; return 'custom'; }
export const DEFAULT_SETTINGS = {
  sens: 1, adsSens: 0.85, fov: 74, volume: 0.6, music: 0.5, invertY: false, shadows: true, renderScale: 1, showFps: false, killcam: true, scopeToggle: false, fpsCap: 60, autoRes: true,
  quality: 'balanced', pixelMax: 1.25, shadowQ: 'high', shadowRate: 'half', particles: 'full', lowMenus: true, previewFps: 30, batteryAsk: true, qv: 0,
  crosshair: '#eaf2e4', slots: 'classic', names: 'real', keys: { ...DEFAULT_KEYS },
};

function freshProfile() {
  return {
    v: 2,
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    loadout: null, // = presets[preset] at runtime
    preset: 0,
    presets: [
      { primary: 'm4', secondary: 'usp', third: 'mp5', camo: 'std', grenade: 'frag', equip: 'claymore', vest: 'standard', belt: 'none' },
      { primary: 'ak47', secondary: 'deagle', third: 'm870', camo: 'std', grenade: 'sticky', equip: 'claymore', vest: 'heavy', belt: 'bandolier' },
      { primary: 'l96', secondary: 'usp', third: 'mp5', camo: 'std', grenade: 'smoke', equip: 'claymore', vest: 'light', belt: 'quickdraw' },
    ],
    lobby: { mode: 'ffa', map: 'yard', difficulty: 'normal', zdiff: 'normal', skill: 0, bots: { grenades: true, streaks: true, snipers: true, vehicles: true, loot: true, tactics: true }, vehicles: false, pickups: true, limits: { ffa: { score: 20, time: 8 }, tdm: { score: -1, time: 10 }, ctf: { score: 3, time: 10 }, gungame: { time: 10 }, infection: { time: 5 }, sandbox: { time: 0 } }, counts: { ffa: 5, tdm: 5, sandbox: 5, gungame: 5, infection: 7, ctf: 4 },
      sandbox: { teams: false, infAmmo: true, god: false, lowGrav: false, oneShot: false, headshots: false, knife: false, passive: false } },
    skin: { uniform: 'olive', pattern: 'plain', helmet: 'olive', op: 'rex' },
    streaks: { picks: ['uav', 'mortar', 'sentry'], kills: { uav: 3, cuav: 4, mortar: 5, care: 6, sentry: 7, chopper: 9, air: 11, gunship: 15 } },
    hints: {},
    backup: { last: 0, nag: 0 },
    rangeRack: [], // practice range: the guns you carry there (any number; empty = your loadout)
    xp: 0,
    career: { kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, matches: 0, wins: 0, bestStreak: 0, seconds: 0, knifeKills: 0, grenadeKills: 0, medals: { __open: true } },
    best: { ffa: 0, tdm: 0, survival: { recruit: 0, easy: 0, normal: 0, hard: 0, elite: 0 }, wave: 0, zombies: 0, gungame: 0, ctf: 0, infection: 0 },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in saved)) continue;
    const b = base[k], s = saved[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && b.__open) base[k] = s && typeof s === 'object' ? { ...s } : {}; // free-form maps (medal counts)
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, s);
    else if (typeof s === typeof b) base[k] = s;
  }
  return base;
}

function fromSaved(saved) {
  let p = freshProfile();
  const defs = p.presets.map((d) => ({ ...d }));
  p = merge(p, saved);
  // older saves had a single loadout: it becomes preset A
  if (!Array.isArray(saved.presets) && saved.loadout) Object.assign(defs[0], saved.loadout);
  p.presets = defs.map((d, i) => ({ ...d, ...(Array.isArray(saved.presets) && saved.presets[i] && typeof saved.presets[i] === 'object' ? saved.presets[i] : {}) }));
  p.preset = Math.max(0, Math.min(2, p.preset | 0));
  p.loadout = p.presets[p.preset];
  if (p.career.medals) delete p.career.medals.__open;
  const st = p.settings; // build 67+: quality presets; older profiles move to Balanced once
  if (st.qv !== 1) { if (st.shadows === false) { applyQuality(st, 'balanced'); st.shadowQ = 'off'; st.shadows = false; st.quality = 'custom'; } else applyQuality(st, 'balanced'); st.qv = 1; }
  const L = p.lobby; // bot skill 1-10 replaced the 3-step difficulty
  if (!(L.skill >= 1 && L.skill <= 10)) L.skill = { easy: 3, normal: 5, hard: 7 }[L.difficulty] || 5;
  return p;
}

export function loadProfile() {
  let p = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) p = fromSaved(JSON.parse(raw));
    else {
      p = fromSaved({});
      p.best.ffa = Number(localStorage.getItem('frontline_solo_ops_best')) || 0; // carry over v1 high score
    }
  } catch (e) { /* storage blocked: play with defaults */ }
  G.profile = p || fromSaved({});
  return G.profile;
}

// ---- moving progress between browsers / the artifact page and a downloaded copy ----
export function exportProfile() {
  const { loadout, ...rest } = G.profile;
  return JSON.stringify({ app: 'frontline-solo-ops', format: 1, exported: new Date().toISOString(), profile: rest }, null, 1);
}
// Returns { ok, msg }. Accepts an export file or a raw profile; unknown keys are ignored, missing ones get defaults.
export function importProfile(text) {
  let data;
  try { data = JSON.parse(String(text).trim()); } catch (e) { return { ok: false, msg: 'That isn\u2019t a profile file. Choose a .json file made with Export profile.' }; }
  const saved = data && data.app === 'frontline-solo-ops' ? data.profile : data;
  const valid = saved && typeof saved === 'object' && !Array.isArray(saved) && saved.settings && typeof saved.settings === 'object'
    && (typeof saved.xp === 'number' || (saved.career && typeof saved.career === 'object'));
  if (!valid) return { ok: false, msg: 'This file doesn\u2019t contain a Frontline profile. Nothing was changed.' };
  const p = fromSaved(saved);
  if (!(p.xp >= 0 && isFinite(p.xp))) p.xp = 0;
  G.profile = p; saveProfile();
  return { ok: true, msg: 'Profile imported.' };
}

export function saveProfile() {
  try { localStorage.setItem(KEY, JSON.stringify(G.profile)); } catch (e) { /* ignore */ }
}

export function resetSettings() {
  G.profile.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); G.profile.settings.qv = 1;
  saveProfile();
}
