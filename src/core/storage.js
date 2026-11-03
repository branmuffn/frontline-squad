import { G } from './state.js';

const KEY = 'frontline_solo_ops_v2';

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', crouchAlt: 'ControlLeft',
  sprint: 'ShiftLeft', reload: 'KeyR', primary: 'Digit1', secondary: 'Digit2', melee: 'Digit3', slot4: 'Digit4', grenade: 'KeyG',
  streak: 'KeyF', swap: 'KeyQ', scoreboard: 'Tab', armory: 'KeyB', interact: 'KeyE',
};
export const KEY_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch',
  crouchAlt: 'Crouch (alternate)', sprint: 'Sprint', reload: 'Reload', primary: 'Weapon 1', secondary: 'Weapon 2',
  melee: 'Weapon 3 (knife unless Overkill)', slot4: 'Knife in Overkill (weapon 4)', grenade: 'Frag grenade (hold to cook)', streak: 'Use killstreak', swap: 'Last weapon (Q)', scoreboard: 'Scoreboard', armory: 'Weapon menu (Sandbox)', interact: 'Pick up weapon',
};

export const DEFAULT_SETTINGS = {
  sens: 1, adsSens: 0.85, fov: 74, volume: 0.6, music: 0.5, invertY: false, shadows: true, renderScale: 1, showFps: false, killcam: true,
  crosshair: '#eaf2e4', slots: 'classic', names: 'real', keys: { ...DEFAULT_KEYS },
};

function freshProfile() {
  return {
    v: 2,
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    loadout: null, // = presets[preset] at runtime
    preset: 0,
    presets: [
      { primary: 'm4', secondary: 'usp', third: 'mp5', camo: 'std' },
      { primary: 'ak47', secondary: 'deagle', third: 'm870', camo: 'std' },
      { primary: 'l96', secondary: 'usp', third: 'mp5', camo: 'std' },
    ],
    lobby: { mode: 'ffa', map: 'yard', difficulty: 'normal', counts: { ffa: 5, tdm: 5, sandbox: 5, gungame: 5, infection: 7, ctf: 4 },
      sandbox: { teams: false, infAmmo: true, god: false, lowGrav: false, oneShot: false, headshots: false, knife: false, passive: false } },
    hints: {},
    xp: 0,
    career: { kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, matches: 0, wins: 0, bestStreak: 0, seconds: 0, knifeKills: 0, grenadeKills: 0 },
    best: { ffa: 0, tdm: 0, survival: { easy: 0, normal: 0, hard: 0 }, wave: 0, zombies: 0, gungame: 0, ctf: 0, infection: 0 },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in saved)) continue;
    const b = base[k], s = saved[k];
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
  G.profile.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  saveProfile();
}
