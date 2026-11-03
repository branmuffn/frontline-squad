import { G } from './state.js';

const KEY = 'frontline_solo_ops_v2';

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', crouchAlt: 'ControlLeft',
  sprint: 'ShiftLeft', reload: 'KeyR', primary: 'Digit1', secondary: 'Digit2', melee: 'Digit3', grenade: 'KeyG',
  streak: 'KeyF', swap: 'KeyQ', scoreboard: 'Tab', armory: 'KeyB', interact: 'KeyE',
};
export const KEY_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch',
  crouchAlt: 'Crouch (alternate)', sprint: 'Sprint', reload: 'Reload', primary: 'Primary weapon', secondary: 'Pistol',
  melee: 'Knife', grenade: 'Frag grenade (hold to cook)', streak: 'Use killstreak', swap: 'Last weapon', scoreboard: 'Scoreboard', armory: 'Weapon menu (Sandbox)', interact: 'Pick up weapon',
};

export const DEFAULT_SETTINGS = {
  sens: 1, adsSens: 0.85, fov: 74, volume: 0.6, invertY: false, shadows: true, renderScale: 1, showFps: false,
  crosshair: '#eaf2e4', keys: { ...DEFAULT_KEYS },
};

function freshProfile() {
  return {
    v: 2,
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    loadout: { primary: 'm4', secondary: 'usp', camo: 'std' },
    lobby: { mode: 'ffa', map: 'yard', difficulty: 'normal', counts: { ffa: 5, tdm: 5, sandbox: 5 },
      sandbox: { teams: false, infAmmo: true, god: false, lowGrav: false, oneShot: false, headshots: false, knife: false, passive: false } },
    xp: 0,
    career: { kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, matches: 0, wins: 0, bestStreak: 0, seconds: 0, knifeKills: 0, grenadeKills: 0 },
    best: { ffa: 0, tdm: 0, survival: { easy: 0, normal: 0, hard: 0 }, wave: 0 },
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

export function loadProfile() {
  let p = freshProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) p = merge(p, JSON.parse(raw));
    else {
      const old = Number(localStorage.getItem('frontline_solo_ops_best')) || 0; // carry over v1 high score
      p.best.ffa = old;
    }
  } catch (e) { /* storage blocked: play with defaults */ }
  G.profile = p;
  return p;
}

export function saveProfile() {
  try { localStorage.setItem(KEY, JSON.stringify(G.profile)); } catch (e) { /* ignore */ }
}

export function resetSettings() {
  G.profile.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  saveProfile();
}
