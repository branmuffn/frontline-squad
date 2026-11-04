// Central tuning data. Gameplay feel lives here, so balance changes rarely need code changes.

export const PHYS = {
  fallSafe: 4,         // drops up to this height (m) are free
  fallLethal: 12,      // drops from this height kill
  gravity: 17,
  step: 0.45,          // max height a unit can step up without jumping
  jump: 6.25,          // initial jump velocity (apex ~1.15 m)
  standH: 1.8,
  crouchH: 1.2,
  proneH: 0.65,
  eyeProne: 0.42,
  proneMul: 0.22,
  radius: 0.36,
  eyeStand: 1.62,
  eyeCrouch: 1.04,
  walk: 6.0,
  sprintMul: 1.5,
  crouchMul: 0.45,
  adsMul: 0.6,
};

// spread/recoil values are in radians. falloff: [full damage until m, hard max range m, damage multiplier at max range]
// pen: penetration class (see PENETRATION). velocity: muzzle speed (m/s) for weapons that fire real projectiles.
// What each calibre can punch through: max surfaces, thickest wood / non-wood wall (m), how many walls, damage kept per surface.
export const PENETRATION = {
  none: { max: 0, wood: 0, wall: 0, walls: 0, woodMul: 1, wallMul: 1 },
  light: { max: 1, wood: 0.5, wall: 0, walls: 0, woodMul: 0.6, wallMul: 1 },              // pistols, SMGs: thin wood only
  rifle: { max: 2, wood: 0.6, wall: 0.35, walls: 1, woodMul: 0.7, wallMul: 0.5 },         // rifles: thin wood + one thin wall
  heavy: { max: 3, wood: 1.2, wall: 0.8, walls: 3, woodMul: 0.85, wallMul: 0.65 },        // .50 cal: most cover
};
export const WEAPONS = {
  m4: {
    id: 'm4', slot: 0, name: 'M4A1', cls: 'Assault rifle', auto: true, rate: 0.08, mag: 30, reserve: 180,
    damage: 28, headMul: 2.1, legMul: 0.8, falloff: [35, 150, 0.6], pellets: 1, range: 150, pen: 'rifle',
    spread: { hip: 0.03, ads: 0.0035, move: 0.022, air: 0.06, bloom: 0.0045, bloomMax: 0.028, recover: 0.09 },
    recoil: { v: 0.0115, h: 0.0042, drift: 0.0011, recover: 7 },
    reload: 2.0, reloadEmpty: 2.5, draw: 0.55, speed: 0.97, adsZoom: 0.78, adsTime: 0.16,
    sound: 'rifle', noise: 38, tracer: 1, sight: 'dot',
    desc: 'Full-auto all-rounder. Tap or burst at range, spray up close.',
    stats: { damage: 0.56, rate: 0.75, accuracy: 0.72, range: 0.72, mobility: 0.6 },
  },
  mp5: {
    id: 'mp5', slot: 0, name: 'MP5', cls: 'Submachine gun', auto: true, rate: 0.068, mag: 30, reserve: 150,
    damage: 22, headMul: 2.0, legMul: 0.85, falloff: [20, 70, 0.5], pellets: 1, range: 70, pen: 'light',
    spread: { hip: 0.022, ads: 0.006, move: 0.011, air: 0.045, bloom: 0.004, bloomMax: 0.024, recover: 0.1 },
    recoil: { v: 0.0082, h: 0.005, drift: -0.0006, recover: 9 },
    reload: 1.7, reloadEmpty: 2.1, draw: 0.42, speed: 1.06, adsZoom: 0.85, adsTime: 0.12,
    sound: 'smg', noise: 30, tracer: 1, sight: 'dot',
    desc: 'Fast handling and a high fire rate. Loses punch past twenty metres.',
    stats: { damage: 0.42, rate: 0.9, accuracy: 0.66, range: 0.42, mobility: 0.85 },
  },
  m870: {
    id: 'm870', slot: 0, name: 'M870', cls: 'Shotgun', auto: false, pump: true, shells: true, rate: 0.82, mag: 7, reserve: 35,
    damage: 17, pellets: 9, headMul: 1.6, legMul: 0.9, falloff: [8, 30, 0.15], range: 30, pen: 'none',
    spread: { hip: 0.072, ads: 0.052, move: 0.01, air: 0.03, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.05, h: 0.012, drift: 0, recover: 6 },
    reloadStart: 0.35, shellReload: 0.48, draw: 0.6, speed: 0.95, adsZoom: 0.88, adsTime: 0.18,
    sound: 'shotgun', noise: 45, tracer: 0.35, sight: 'bead',
    desc: 'Pump-action. One clean hit inside eight metres ends the fight.',
    stats: { damage: 0.95, rate: 0.2, accuracy: 0.3, range: 0.2, mobility: 0.62 },
  },
  l96: {
    id: 'l96', slot: 0, name: 'L96A1', cls: 'Sniper rifle', auto: false, bolt: true, rate: 1.3, mag: 5, reserve: 25,
    damage: 100, headMul: 2.0, legMul: 0.75, falloff: [300, 300, 1], pellets: 1, range: 300, pen: 'rifle', velocity: 650,
    spread: { hip: 0.085, ads: 0.0, move: 0.05, air: 0.12, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.06, h: 0.01, drift: 0, recover: 5 },
    reload: 2.6, reloadEmpty: 3.0, draw: 0.7, speed: 0.9, adsZoom: 0.26, adsTime: 0.24, scope: true, mags: [4, 8],
    sound: 'sniper', noise: 55, tracer: 1,
    desc: 'Bolt-action. A body shot drops a full-health target. Useless from the hip.',
    stats: { damage: 1, rate: 0.08, accuracy: 0.95, range: 1, mobility: 0.4 },
  },
  mk14: {
    id: 'mk14', slot: 0, name: 'Mk 14 EBR', cls: 'Marksman rifle', auto: false, rate: 0.17, mag: 20, reserve: 100,
    damage: 45, headMul: 2.0, legMul: 0.8, falloff: [50, 200, 0.75], pellets: 1, range: 200, pen: 'rifle',
    spread: { hip: 0.05, ads: 0.0008, move: 0.035, air: 0.08, bloom: 0.006, bloomMax: 0.02, recover: 0.12 },
    recoil: { v: 0.026, h: 0.006, drift: 0.0005, recover: 6 },
    reload: 2.3, reloadEmpty: 2.8, draw: 0.6, speed: 0.93, adsZoom: 0.5, adsTime: 0.2, scope: true, mags: [2],
    sound: 'rifle', noise: 44, tracer: 1,
    desc: 'Semi-auto with a fixed 2× scope. Three body shots, or a headshot and a body shot.',
    stats: { damage: 0.72, rate: 0.36, accuracy: 0.88, range: 0.86, mobility: 0.5 },
  },
  ak47: {
    id: 'ak47', slot: 0, name: 'AK-47', cls: 'Assault rifle', auto: true, rate: 0.1, mag: 30, reserve: 150,
    damage: 33, headMul: 2.0, legMul: 0.8, falloff: [35, 150, 0.6], pellets: 1, range: 150, pen: 'rifle',
    spread: { hip: 0.034, ads: 0.005, move: 0.025, air: 0.06, bloom: 0.006, bloomMax: 0.034, recover: 0.08 },
    recoil: { v: 0.016, h: 0.006, drift: 0.0016, recover: 6 },
    reload: 2.2, reloadEmpty: 2.7, draw: 0.6, speed: 0.95, adsZoom: 0.78, adsTime: 0.18,
    sound: 'ak', noise: 40, tracer: 1, sight: 'iron',
    desc: 'Hard-hitting full-auto rifle. Kicks harder than the {m4}, kills faster.',
    stats: { damage: 0.66, rate: 0.62, accuracy: 0.6, range: 0.7, mobility: 0.56 },
  },
  m249: {
    id: 'm249', slot: 0, name: 'M249', cls: 'Light machine gun', auto: true, rate: 0.075, mag: 100, reserve: 200,
    damage: 26, headMul: 1.9, legMul: 0.8, falloff: [40, 150, 0.6], pellets: 1, range: 150, pen: 'rifle',
    spread: { hip: 0.045, ads: 0.012, move: 0.035, air: 0.07, bloom: 0.004, bloomMax: 0.03, recover: 0.08 },
    recoil: { v: 0.009, h: 0.006, drift: 0.0008, recover: 6 },
    reload: 5.0, reloadEmpty: 5.5, draw: 0.9, speed: 0.85, adsZoom: 0.8, adsTime: 0.28,
    sound: 'lmg', noise: 42, tracer: 1, sight: 'dot',
    desc: 'A hundred-round belt. Suppress a lane, but the reload takes forever.',
    stats: { damage: 0.52, rate: 0.82, accuracy: 0.45, range: 0.72, mobility: 0.3 },
  },
  // vehicle-mounted gun (not in any loadout list)
  m2: {
    id: 'm2', slot: 0, name: 'M2HB', cls: 'Mounted machine gun', auto: true, rate: 0.11, mag: 999, reserve: 0,
    damage: 40, headMul: 1.6, legMul: 0.85, falloff: [60, 220, 0.7], pellets: 1, range: 220, pen: 'heavy',
    spread: { hip: 0.01, ads: 0.01, move: 0, air: 0, bloom: 0, bloomMax: 0, recover: 1 }, recoil: { v: 0, h: 0, drift: 0, recover: 1 },
    reload: 1, reloadEmpty: 1, draw: 0, speed: 1, adsZoom: 1, adsTime: 0.1, sound: 'lmg', noise: 55, tracer: 1, mounted: true,
    desc: 'Heavy mounted gun.', stats: { damage: 0.7, rate: 0.7, accuracy: 0.8, range: 0.9, mobility: 0 },
  },
  spas12: {
    id: 'spas12', slot: 0, name: 'SPAS-12', cls: 'Shotgun', auto: false, shells: true, rate: 0.3, mag: 8, reserve: 32,
    damage: 13, pellets: 8, headMul: 1.5, legMul: 0.9, falloff: [8, 30, 0.15], range: 30, pen: 'none',
    spread: { hip: 0.08, ads: 0.06, move: 0.012, air: 0.03, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.04, h: 0.012, drift: 0, recover: 7 },
    reloadStart: 0.3, shellReload: 0.42, draw: 0.6, speed: 0.95, adsZoom: 0.88, adsTime: 0.18,
    sound: 'shotgun', noise: 45, tracer: 0.35, sight: 'bead',
    desc: 'Semi-auto shotgun. Less punch per shell than the {m870}, far faster follow-ups.',
    stats: { damage: 0.75, rate: 0.5, accuracy: 0.25, range: 0.18, mobility: 0.6 },
  },
  barrett: {
    id: 'barrett', slot: 0, name: 'BARRETT .50', cls: 'Anti-materiel rifle', auto: false, rate: 0.55, mag: 10, reserve: 30,
    damage: 110, headMul: 2.0, legMul: 0.8, falloff: [300, 300, 1], pellets: 1, range: 300, pen: 'heavy', velocity: 760,
    spread: { hip: 0.1, ads: 0.0, move: 0.06, air: 0.14, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.08, h: 0.02, drift: 0, recover: 4 },
    reload: 3.4, reloadEmpty: 3.9, draw: 0.9, speed: 0.85, adsZoom: 0.2, adsTime: 0.3, scope: true, mags: [4, 8], heavy: true,
    sound: 'barrett', noise: 70, tracer: 1,
    desc: 'Semi-auto .50 cal. One body shot kills, and the noise gives you away.',
    stats: { damage: 1, rate: 0.18, accuracy: 0.9, range: 1, mobility: 0.25 },
  },
  rpg: {
    id: 'rpg', slot: 0, name: 'RPG-7', cls: 'Rocket launcher', auto: false, projectile: true, rate: 1.0, mag: 1, reserve: 4,
    damage: 150, headMul: 1, legMul: 1, falloff: [999, 1000, 1], pellets: 1, range: 220,
    spread: { hip: 0.02, ads: 0.004, move: 0.02, air: 0.04, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.03, h: 0.01, drift: 0, recover: 5 },
    reload: 2.6, reloadEmpty: 2.6, draw: 0.8, speed: 0.9, adsZoom: 0.8, adsTime: 0.22, heavy: true,
    sound: 'rpg', noise: 50, tracer: 0, sandboxOnly: true,
    desc: 'Unguided rocket. Sandbox only.',
    stats: { damage: 1, rate: 0.05, accuracy: 0.6, range: 0.8, mobility: 0.4 },
  },
  deagle: {
    id: 'deagle', slot: 1, name: 'DESERT EAGLE', cls: 'Pistol', auto: false, rate: 0.32, mag: 7, reserve: 35,
    damage: 58, headMul: 2.0, legMul: 0.85, falloff: [30, 60, 0.6], pellets: 1, range: 60, pen: 'light',
    spread: { hip: 0.022, ads: 0.003, move: 0.02, air: 0.06, bloom: 0.012, bloomMax: 0.04, recover: 0.2 },
    recoil: { v: 0.05, h: 0.012, drift: 0, recover: 7 },
    reload: 1.7, reloadEmpty: 2.0, draw: 0.4, speed: 1.0, adsZoom: 0.85, adsTime: 0.12,
    sound: 'deagle', noise: 40, tracer: 1, sight: 'iron',
    desc: 'A headshot kills outright. Seven rounds, heavy kick.',
    stats: { damage: 0.6, rate: 0.3, accuracy: 0.5, range: 0.4, mobility: 0.9 },
  },
  usp: {
    id: 'usp', slot: 1, name: 'USP .45', cls: 'Pistol', auto: false, rate: 0.15, mag: 15, reserve: 75,
    damage: 34, headMul: 2.25, legMul: 0.85, falloff: [30, 60, 0.55], pellets: 1, range: 60, pen: 'light',
    spread: { hip: 0.016, ads: 0.004, move: 0.012, air: 0.05, bloom: 0.007, bloomMax: 0.03, recover: 0.12 },
    recoil: { v: 0.02, h: 0.006, drift: 0, recover: 9 },
    reload: 1.35, reloadEmpty: 1.6, draw: 0.3, speed: 1.05, adsZoom: 0.86, adsTime: 0.1,
    sound: 'pistol', noise: 30, tracer: 1, sight: 'iron',
    desc: 'Reliable sidearm. Fifteen rounds, quick draw.',
    stats: { damage: 0.4, rate: 0.55, accuracy: 0.62, range: 0.3, mobility: 0.95 },
  },
  knife: {
    id: 'knife', slot: 2, name: 'KNIFE', cls: 'Melee', melee: true, rate: 0.45, heavyRate: 1.0,
    damage: 55, heavyDamage: 100, backstab: 200, range: 2.3, draw: 0.25, speed: 1.12, noise: 5,
  },
};

// Power = body damage of one trigger pull (all pellets), shown as a bar scaled to 110.
export function weaponPower(w) {
  const shot = w.damage * (w.pellets || 1);
  return { v: Math.min(1, shot / 110), text: w.pellets > 1 ? `${w.damage}×${w.pellets}` : String(w.damage) };
}
export const PRIMARIES = ['m4', 'ak47', 'mp5', 'm870', 'spas12', 'm249', 'mk14', 'l96', 'barrett'];
export const SECONDARIES = ['usp', 'deagle'];
export const ALL_PRIMARIES = [...PRIMARIES, 'rpg'];
export const ALL_GUNS = [...PRIMARIES, ...SECONDARIES];

// Weapon slot rules (A6). Bots follow the same rule as the player.
export const SLOT_MODES = {
  classic: { name: 'Standard', guns: 2, desc: 'Primary, sidearm and knife. A pickup replaces the gun in your hands, so a rifle plus a sniper is possible.' },
  overkill: { name: 'Overkill', guns: 3, desc: 'Any three guns and a knife (key 4). A pickup replaces the gun in your hands.', rank: 5 },
};
// Guns a loadout preset gives under a slot mode (always valid, never duplicated)
export function loadoutGuns(preset, mode) {
  if (mode === 'classic') {
    return [PRIMARIES.includes(preset.primary) ? preset.primary : 'm4', SECONDARIES.includes(preset.secondary) ? preset.secondary : 'usp'];
  }
  const out = [];
  for (const id of [preset.primary, preset.secondary, preset.third]) if (ALL_GUNS.includes(id) && !out.includes(id)) out.push(id);
  for (const id of ['m4', 'usp', 'mp5', 'ak47']) if (out.length < SLOT_MODES[mode].guns && !out.includes(id)) out.push(id);
  return out.slice(0, SLOT_MODES[mode].guns);
}

// Killfeed tags for non-gun damage sources
// Scope magnification -> fraction of the base field of view (true optical zoom for a given FOV)
export const magZoom = (fov, mag) => (2 * Math.atan(Math.tan(fov * Math.PI / 360) / mag)) / (fov * Math.PI / 180);

// Weapon names (A7): real names by default, original fictional names when the setting says so.
// WEAPONS[id].name and .desc are getters, so every menu, HUD line and killfeed entry follows the setting.
const FICTIONAL = {
  m4: 'AR-4 CARBINE', ak47: 'KR-47', mp5: 'SP-5', m870: 'FIELD PUMP 12', spas12: 'RIOT-12', m249: 'RHINO LMG',
  m2: 'MOUNTED .50', mk14: 'WARDEN DMR', l96: 'LONGBOW .338', barrett: 'THUNDER .50', rpg: 'ROCKET-7', deagle: 'HAND CANNON', usp: 'GUARDIAN .45', knife: 'KNIFE',
};
let nameStyle = 'real';
export function setNameStyle(v) { nameStyle = v === 'fictional' ? 'fictional' : 'real'; }
for (const [id, w] of Object.entries(WEAPONS)) {
  const real = w.name, desc = w.desc;
  delete w.name; delete w.desc;
  Object.defineProperty(w, 'realName', { value: real });
  Object.defineProperty(w, 'fakeName', { value: FICTIONAL[id] || real });
  Object.defineProperty(w, 'name', { get() { return nameStyle === 'fictional' ? this.fakeName : this.realName; }, enumerable: true });
  Object.defineProperty(w, 'desc', { get() { return desc.replace(/\{(\w+)\}/g, (_, k) => WEAPONS[k].name); }, enumerable: true });
}

export const SOURCE_NAMES = { claymore: 'CLAYMORE', sticky: 'STICKY', claws: 'CLAWS', frag: 'FRAG', mortar: 'MORTAR', sentry: 'SENTRY', fall: 'FALL', barrel: 'BARREL', roadkill: 'JEEP', vehicle: 'WRECK' };

// explosion types: radius, max damage, visual size
export const EXPLOSIONS = { sticky: { R: 6, D: 140, big: 0.9 }, frag: { R: 7, D: 135, big: 1 }, mortar: { R: 8, D: 170, big: 1.25 }, rpg: { R: 5.5, D: 150, big: 1 }, barrel: { R: 6.5, D: 140, big: 1.1 } };

export const GRENADE = { fuse: 3.0, throwSpeed: 17, radius: 7, damage: 135, perLife: 2 };

export const DIFFICULTY = {
  recruit: {
    label: 'RECRUIT', skill: 1, react: [0.9, 1.35], aimErr: 0.11, settle: 1.9, dmgMul: 0.55, burstGap: [0.9, 1.5], burstMul: 0.5,
    turn: 4, speed: 0.92, hearing: 0.55, aggro: 0.15, grenade: 0.0, playerBias: 3, headChance: 0.01, sniperAim: 2, mg: 0.07,
  },
  easy: { skill: 3,
    label: 'EASY', react: [0.65, 1.0], aimErr: 0.085, settle: 1.4, dmgMul: 0.7, burstGap: [0.7, 1.2], burstMul: 0.6,
    turn: 5, speed: 1, hearing: 0.7, aggro: 0.25, grenade: 0.0, playerBias: 4, headChance: 0.03, sniperAim: 1.6, mg: 0.05,
  },
  normal: {
    label: 'NORMAL', skill: 5, react: [0.38, 0.6], aimErr: 0.06, settle: 0.95, dmgMul: 1, burstGap: [0.4, 0.8], burstMul: 0.85,
    turn: 8, speed: 1, hearing: 1, aggro: 0.5, grenade: 0.1, playerBias: 8, headChance: 0.08, sniperAim: 1.15, mg: 0.03,
  },
  hard: {
    label: 'HARD', skill: 7, react: [0.2, 0.34], aimErr: 0.042, settle: 0.6, dmgMul: 1, burstGap: [0.22, 0.5], burstMul: 1,
    turn: 12, speed: 1, hearing: 1.3, aggro: 0.8, grenade: 0.2, playerBias: 12, headChance: 0.15, sniperAim: 0.85, mg: 0.018,
  },
  elite: {
    label: 'ELITE', skill: 9.5, react: [0.12, 0.22], aimErr: 0.03, settle: 0.4, dmgMul: 1, burstGap: [0.15, 0.36], burstMul: 1.1,
    turn: 16, speed: 1.04, hearing: 1.5, aggro: 0.9, grenade: 0.26, playerBias: 14, headChance: 0.22, sniperAim: 0.7, mg: 0.012,
  },
};
// Bot skill 1-10: bands for labels/records, AI numbers interpolated between the anchors above.
export const SKILL_BANDS = [['recruit', 1, 2], ['easy', 3, 4], ['normal', 5, 6], ['hard', 7, 8], ['elite', 9, 10]];
export const skillBand = (n) => (SKILL_BANDS.find(([, a, b]) => n >= a && n <= b) || SKILL_BANDS[2])[0];
export const skillFor = (diff) => (DIFFICULTY[diff] ? Math.round(DIFFICULTY[diff].skill) : 5);
export function botSkill(n) {
  const L = Object.values(DIFFICULTY), x = Math.max(1, Math.min(10, +n || 5));
  let i = 0; while (i < L.length - 2 && x > L[i + 1].skill) i++;
  const A = L[i], B = L[i + 1], k = Math.max(0, Math.min(1, (x - A.skill) / (B.skill - A.skill)));
  const mix = (a, b) => (Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * k) : typeof a === 'number' ? a + (b - a) * k : a);
  const out = {}; for (const key of Object.keys(B)) out[key] = mix(A[key], B[key]);
  out.label = DIFFICULTY[skillBand(Math.round(x))].label; out.skill = x;
  return out;
}
// What bots may do (lobby "Bot rules"; all on by default)
export const BOT_RULES = [['grenades', 'Grenades'], ['streaks', 'Killstreaks'], ['snipers', 'Sniper rifles'], ['vehicles', 'Vehicles'], ['loot', 'Pick up guns'], ['tactics', 'Flank & cover']];
export const botRulesDefault = () => Object.fromEntries(BOT_RULES.map(([k]) => [k, true]));

// Match limits players can choose (score: kills / team score / captures, 0 = no limit, -1 = auto; time: minutes, 0 = no limit)
export const LIMITS = {
  ffa: { score: [10, 15, 20, 30, 50, 0], time: [5, 8, 10, 15, 20, 0] },
  tdm: { score: [-1, 25, 50, 75, 100, 0], time: [5, 10, 15, 20, 0] },
  ctf: { score: [1, 3, 5, 0], time: [5, 10, 15, 20, 0] },
  gungame: { time: [5, 10, 15, 0] }, infection: { time: [3, 5, 8, 10] }, sandbox: { time: [0, 5, 10, 15] },
};
export const limitDefault = (mode, k) => k === 'score' ? (mode === 'tdm' ? -1 : MODES[mode].scoreLimit || 0) : Math.round((MODES[mode].time || 0) / 60);
export const MODES = {
  ffa: {
    id: 'ffa', name: 'FREE FOR ALL', desc: 'Everyone is a target. First to 20 eliminations wins.',
    time: 480, scoreLimit: 20, counts: [3, 5, 7, 9], defaultCount: 5, countLabel: 'Opponents',
  },
  tdm: {
    id: 'tdm', name: 'TEAM DEATHMATCH', desc: 'Your squad against theirs. First team to the kill limit wins.',
    time: 600, counts: [3, 4, 5, 6], defaultCount: 5, countLabel: 'Squad size',
  },
  survival: {
    id: 'survival', name: 'SURVIVAL', desc: 'Hold out against escalating waves. Three lives, no timer.',
    counts: null, lives: 3,
  },
  gungame: {
    id: 'gungame', name: 'GUN GAME', desc: 'Every kill swaps your gun for the next one. Knife kills knock the victim back a tier.',
    time: 600, counts: [3, 5, 7, 9], defaultCount: 5, countLabel: 'Opponents',
  },
  infection: {
    id: 'infection', name: 'INFECTION', desc: 'One player starts infected. Their knife kills spread it. Survivors win at the timer.',
    time: 300, counts: [5, 7, 9, 11], defaultCount: 7, countLabel: 'Bots',
  },
  ctf: {
    id: 'ctf', name: 'CAPTURE THE FLAG', desc: 'Steal their flag and bring it home while yours is safe. Three captures win.',
    time: 600, scoreLimit: 3, teamSize: true, counts: [3, 4, 5, 6], defaultCount: 4, countLabel: 'Squad size',
  },
  zombies: {
    id: 'zombies', name: 'ZOMBIES', desc: 'Endless undead rounds. Earn points, buy wall weapons, gamble on the mystery box.',
    counts: null, lives: 3,
  },
  sandbox: {
    id: 'sandbox', name: 'SANDBOX', desc: 'Everything unlocked, no XP. Set your own rules. Press B for the weapon menu.',
    time: 0, counts: [0, 3, 5, 8, 12], defaultCount: 5, countLabel: 'Bots',
  },
};

export const TEAMS = [
  { name: 'TASK FORCE', color: '#5b8fc9', hex: 0x3f6ea8 },
  { name: 'OPFOR', color: '#d4553f', hex: 0xa33a2f },
];

export const BOT_NAMES = ['VIPER', 'GHOST', 'RECON', 'ROOK', 'HAWK', 'NOMAD', 'SABER', 'JACKAL', 'ONYX', 'RAVEN', 'TITAN', 'WOLF', 'BISHOP', 'COBRA'];
export const UNIFORMS = [0x5f6a52, 0x66727b, 0x857b5f, 0x54666a, 0x746b5c, 0x4f5848, 0x6d6255, 0x5a6470, 0x7a7466];
export const ACCENTS = [0xb0573f, 0x3f7fb0, 0xb09a3f, 0x5fa05a, 0x8a4fa8, 0x3fa8a0, 0xa83f6d, 0xc07a32, 0x7d8a94];

export const RANKS = [
  ['Recruit', 0], ['Private', 800], ['Private First Class', 2000], ['Specialist', 3800], ['Corporal', 6000],
  ['Sergeant', 9000], ['Staff Sergeant', 13000], ['Sergeant First Class', 18000], ['Master Sergeant', 24000],
  ['Sergeant Major', 31000], ['Second Lieutenant', 40000], ['First Lieutenant', 50000], ['Captain', 62000],
  ['Major', 76000], ['Lieutenant Colonel', 92000], ['Colonel', 110000], ['Brigadier General', 130000],
  ['Major General', 155000], ['Lieutenant General', 185000], ['General', 220000],
].map(([name, xp], i) => ({ i, name, xp }));

export const CAMOS = [
  { id: 'std', name: 'Factory', rank: 0, base: '#23292d', spots: [] },
  { id: 'desert', name: 'Desert', rank: 2, base: '#a89069', spots: ['#c4ad83', '#7d6a4c'] },
  { id: 'wood', name: 'Woodland', rank: 4, base: '#4d5739', spots: ['#2f3624', '#6f6a45', '#1f2218'] },
  { id: 'urban', name: 'Urban', rank: 7, base: '#6c7277', spots: ['#9aa0a4', '#3d4245'] },
  { id: 'arctic', name: 'Arctic', rank: 10, base: '#c9cfd3', spots: ['#8f989e', '#e9ecee'] },
  { id: 'crimson', name: 'Crimson', rank: 13, base: '#5e2321', spots: ['#8a3431', '#2e1312'] },
  { id: 'gold', name: 'Gold', rank: 17, base: '#b8913e', spots: ['#e0c06a', '#8a6a24'], metal: true },
];

export const XP = {
  kill: 100, headshot: 50, melee: 75, grenade: 75, longshot: 50, double: 50, triple: 100, multi: 150,
  firstBlood: 75, revenge: 50, assist: 40, streakEnd: 75, wave: 150, win: 500, complete: 200, survivor: 100,
};

export const STREAKS = [
  { kills: 3, id: 'uav', name: 'RECON UAV', desc: 'Reveals enemies on the radar', duration: 25, auto: true,
    how: 'Starts on its own. For 25 seconds every enemy shows on your radar as a red dot, even behind walls.' },
  { kills: 5, id: 'mortar', name: 'MORTAR STRIKE', desc: 'Shells the spot you aim at',
    how: 'Look at the ground or a rooftop and press {streak}. Six shells land around that spot over a few seconds. Keep clear: they can hit you too.' },
  { kills: 7, id: 'sentry', name: 'SENTRY GUN', desc: 'Auto-turret that guards a position', duration: 35,
    how: 'Press {streak} to set a turret down just in front of you. It shoots any enemy it can see for 35 seconds.' },
];

export const STREAK_RULES = [
  'Killstreaks count kills in one life. Dying resets the count to zero.',
  'Kills made by your mortar or sentry don’t add to your streak.',
  'An earned reward waits until you use it, even if you die, until the match ends.',
  'Bots earn and use the same killstreaks.',
];

export const PICKUP = { health: 50, respawn: 25 };

export const SANDBOX_RULES = [
  ['teams', 'Team play'], ['infAmmo', 'Infinite ammo'], ['god', 'God mode'], ['lowGrav', 'Low gravity'],
  ['oneShot', 'One-shot kills'], ['headshots', 'Headshots only'], ['knife', 'Knives only'], ['passive', 'Passive bots (target practice)'],
];

// Multiplayer skins (Phase 7c), unlocked by rank index. Co-op and FFA show the full look; TDM keeps team uniforms (helmet only).
export const SKINS = {
  uniform: [['olive', 'Olive', 0x5f6a52, 0], ['slate', 'Slate', 0x66727b, 0], ['khaki', 'Khaki', 0x857b5f, 1], ['navy', 'Navy', 0x3b4a63, 3], ['urban', 'Urban grey', 0x6c7277, 5],
    ['black', 'Black ops', 0x2a2e31, 7], ['arctic', 'Arctic', 0xb9c0c4, 10], ['crimson', 'Crimson', 0x6a2a26, 13], ['royal', 'Royal blue', 0x2f4f8a, 16]],
  pattern: [['plain', 'Plain', null, 0], ['wood', 'Woodland', [0x2f3624, 0x6f6a45], 2], ['desert', 'Desert', [0xc4ad83, 0x7d6a4c], 4], ['city', 'Urban', [0x9aa0a4, 0x3d4245], 6],
    ['tiger', 'Tiger stripe', [0x1f2218, 0x8a7a4a], 9], ['digital', 'Digital', [0x445566, 0x8899aa], 12], ['gold', 'Gold', [0xe0c06a, 0x8a6a24], 18]],
  helmet: [['olive', 'Olive', 0x4a5340, 0], ['tan', 'Tan', 0x8a7a58, 2], ['black', 'Black', 0x1e2124, 4], ['white', 'White', 0xd8dcdc, 8], ['red', 'Red', 0x7a2a24, 11], ['gold', 'Gold', 0xb8913e, 17]],
};
// resolve a skin choice ({ uniform, pattern, helmet } ids) to soldier colours
export function skinLook(sk) {
  const f = (list, id) => list.find((e) => e[0] === id) || list[0];
  sk = sk || {};
  return { uniform: f(SKINS.uniform, sk.uniform)[2], pattern: f(SKINS.pattern, sk.pattern)[2] || null, helmet: f(SKINS.helmet, sk.helmet)[2], ...operatorLook(sk.op) };
}

// Rev 3b gear (free for now; price fields ready for a later shop)
export const NADES = {
  frag: { name: 'Frag', desc: 'Bounces, cook it with a held G. Big blast.', price: 0 },
  flash: { name: 'Flashbang', desc: 'Blinds anyone looking at it and stuns bots for a few seconds. No damage.', price: 0 },
  smoke: { name: 'Smoke', desc: 'Thick cloud for 13 s. Bots cannot see through it.', price: 0 },
  sticky: { name: 'Sticky', desc: 'Sticks to the first thing it touches (people too). Short fuse.', price: 0 },
};
export const EQUIPMENT = { none: { name: 'None', desc: 'Travel light.', price: 0 }, claymore: { name: 'Claymore', desc: 'Directional mine (V). Trips on enemies in front of it. Two at a time.', price: 0 } };
export const VESTS = {
  light: { name: 'Light vest', desc: '7% faster on foot. No armour.', speed: 1.07, price: 0 },
  standard: { name: 'Standard vest', desc: 'Balanced.', speed: 1, price: 0 },
  heavy: { name: 'Heavy vest', desc: '20% less body damage (12% vs blasts), 7% slower. Headshots ignore it.', speed: 0.93, price: 0 },
};
export const BELTS = {
  none: { name: 'Plain belt', desc: 'Nothing extra.', price: 0 },
  bandolier: { name: 'Bandolier', desc: '50% more spare ammo.', price: 0 },
  grenadier: { name: 'Grenadier', desc: 'One extra grenade per life.', price: 0 },
  quickdraw: { name: 'Quickdraw', desc: 'Weapon swaps 35% faster.', price: 0 },
};

// Operators (look only): body build, skin tone, hair, open face or scarf. Bots pick at random.
export const OPERATORS = [
  { id: 'rex', name: 'Rex', body: 'm', skin: 0xb08c70, hair: 0x2b2620, hairStyle: 'short', beard: true, face: 'open' },
  { id: 'ava', name: 'Ava', body: 'f', skin: 0xd2a684, hair: 0x3b2a1f, hairStyle: 'pony', face: 'open' },
  { id: 'dante', name: 'Dante', body: 'm', skin: 0x6e4630, hair: 0x111111, hairStyle: 'short', face: 'wrap' },
  { id: 'mara', name: 'Mara', body: 'f', skin: 0x8d5a3b, hair: 0x161210, hairStyle: 'bun', face: 'open' },
  { id: 'jonas', name: 'Jonas', body: 'm', skin: 0xd8b494, hair: 0x8a6a3a, hairStyle: 'short', beard: true, face: 'wrap' },
  { id: 'kira', name: 'Kira', body: 'f', skin: 0xe1b896, hair: 0xa8743a, hairStyle: 'pony', face: 'wrap' },
];
export const operatorLook = (id) => { const o = OPERATORS.find((q) => q.id === id) || OPERATORS[0]; return { body: o.body, skin: o.skin, hair: o.hair, hairStyle: o.hairStyle, beard: !!o.beard, face: o.face }; };
