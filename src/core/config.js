// Central tuning data. Gameplay feel lives here, so balance changes rarely need code changes.

export const PHYS = {
  fallSafe: 4,         // drops up to this height (m) are free
  fallLethal: 12,      // drops from this height kill
  gravity: 17,
  step: 0.45,          // max height a unit can step up without jumping
  jump: 6.25,          // initial jump velocity (apex ~1.15 m)
  standH: 1.8,
  crouchH: 1.2,
  radius: 0.36,
  eyeStand: 1.62,
  eyeCrouch: 1.04,
  walk: 6.0,
  sprintMul: 1.5,
  crouchMul: 0.45,
  adsMul: 0.6,
};

// spread/recoil values are in radians. falloff: [full damage until m, min damage from m, min multiplier]
export const WEAPONS = {
  m4: {
    id: 'm4', slot: 0, name: 'M4A1', cls: 'Assault rifle', auto: true, rate: 0.08, mag: 30, reserve: 180,
    damage: 28, headMul: 2.1, legMul: 0.8, falloff: [30, 75, 0.7], pellets: 1, range: 160,
    spread: { hip: 0.03, ads: 0.0035, move: 0.022, air: 0.06, bloom: 0.0045, bloomMax: 0.028, recover: 0.09 },
    recoil: { v: 0.0115, h: 0.0042, drift: 0.0011, recover: 7 },
    reload: 2.0, reloadEmpty: 2.5, draw: 0.55, speed: 0.97, adsZoom: 0.78, adsTime: 0.16,
    sound: 'rifle', noise: 38, tracer: 1, sight: 'dot',
    desc: 'Full-auto all-rounder. Tap or burst at range, spray up close.',
    stats: { damage: 0.56, rate: 0.75, accuracy: 0.72, range: 0.72, mobility: 0.6 },
  },
  mp5: {
    id: 'mp5', slot: 0, name: 'MP5', cls: 'Submachine gun', auto: true, rate: 0.068, mag: 30, reserve: 150,
    damage: 22, headMul: 2.0, legMul: 0.85, falloff: [16, 45, 0.55], pellets: 1, range: 120,
    spread: { hip: 0.022, ads: 0.006, move: 0.011, air: 0.045, bloom: 0.004, bloomMax: 0.024, recover: 0.1 },
    recoil: { v: 0.0082, h: 0.005, drift: -0.0006, recover: 9 },
    reload: 1.7, reloadEmpty: 2.1, draw: 0.42, speed: 1.06, adsZoom: 0.85, adsTime: 0.12,
    sound: 'smg', noise: 30, tracer: 1, sight: 'dot',
    desc: 'Fast handling and a high fire rate. Loses punch past twenty metres.',
    stats: { damage: 0.42, rate: 0.9, accuracy: 0.66, range: 0.42, mobility: 0.85 },
  },
  m870: {
    id: 'm870', slot: 0, name: 'M870', cls: 'Shotgun', auto: false, pump: true, shells: true, rate: 0.82, mag: 7, reserve: 35,
    damage: 17, pellets: 9, headMul: 1.6, legMul: 0.9, falloff: [7, 26, 0.2], range: 45,
    spread: { hip: 0.072, ads: 0.052, move: 0.01, air: 0.03, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.05, h: 0.012, drift: 0, recover: 6 },
    reloadStart: 0.35, shellReload: 0.48, draw: 0.6, speed: 0.95, adsZoom: 0.88, adsTime: 0.18,
    sound: 'shotgun', noise: 45, tracer: 0.35, sight: 'bead',
    desc: 'Pump-action. One clean hit inside eight metres ends the fight.',
    stats: { damage: 0.95, rate: 0.2, accuracy: 0.3, range: 0.2, mobility: 0.62 },
  },
  l96: {
    id: 'l96', slot: 0, name: 'L96A1', cls: 'Sniper rifle', auto: false, bolt: true, rate: 1.3, mag: 5, reserve: 25,
    damage: 100, headMul: 2.0, legMul: 0.75, falloff: [300, 400, 1], pellets: 1, range: 260,
    spread: { hip: 0.085, ads: 0.0, move: 0.05, air: 0.12, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.06, h: 0.01, drift: 0, recover: 5 },
    reload: 2.6, reloadEmpty: 3.0, draw: 0.7, speed: 0.9, adsZoom: 0.26, adsTime: 0.24, scope: true,
    sound: 'sniper', noise: 55, tracer: 1,
    desc: 'Bolt-action. A body shot drops a full-health target. Useless from the hip.',
    stats: { damage: 1, rate: 0.08, accuracy: 0.95, range: 1, mobility: 0.4 },
  },
  ak47: {
    id: 'ak47', slot: 0, name: 'AK-47', cls: 'Assault rifle', auto: true, rate: 0.1, mag: 30, reserve: 150,
    damage: 33, headMul: 2.0, legMul: 0.8, falloff: [28, 70, 0.72], pellets: 1, range: 160,
    spread: { hip: 0.034, ads: 0.005, move: 0.025, air: 0.06, bloom: 0.006, bloomMax: 0.034, recover: 0.08 },
    recoil: { v: 0.016, h: 0.006, drift: 0.0016, recover: 6 },
    reload: 2.2, reloadEmpty: 2.7, draw: 0.6, speed: 0.95, adsZoom: 0.78, adsTime: 0.18,
    sound: 'ak', noise: 40, tracer: 1, sight: 'iron',
    desc: 'Hard-hitting full-auto rifle. Kicks harder than the M4, kills faster.',
    stats: { damage: 0.66, rate: 0.62, accuracy: 0.6, range: 0.7, mobility: 0.56 },
  },
  m249: {
    id: 'm249', slot: 0, name: 'M249', cls: 'Light machine gun', auto: true, rate: 0.075, mag: 100, reserve: 200,
    damage: 26, headMul: 1.9, legMul: 0.8, falloff: [30, 80, 0.7], pellets: 1, range: 160,
    spread: { hip: 0.045, ads: 0.012, move: 0.035, air: 0.07, bloom: 0.004, bloomMax: 0.03, recover: 0.08 },
    recoil: { v: 0.009, h: 0.006, drift: 0.0008, recover: 6 },
    reload: 5.0, reloadEmpty: 5.5, draw: 0.9, speed: 0.85, adsZoom: 0.8, adsTime: 0.28,
    sound: 'lmg', noise: 42, tracer: 1, sight: 'dot',
    desc: 'A hundred-round belt. Suppress a lane, but the reload takes forever.',
    stats: { damage: 0.52, rate: 0.82, accuracy: 0.45, range: 0.72, mobility: 0.3 },
  },
  spas12: {
    id: 'spas12', slot: 0, name: 'SPAS-12', cls: 'Shotgun', auto: false, shells: true, rate: 0.3, mag: 8, reserve: 32,
    damage: 13, pellets: 8, headMul: 1.5, legMul: 0.9, falloff: [6, 22, 0.2], range: 40,
    spread: { hip: 0.08, ads: 0.06, move: 0.012, air: 0.03, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.04, h: 0.012, drift: 0, recover: 7 },
    reloadStart: 0.3, shellReload: 0.42, draw: 0.6, speed: 0.95, adsZoom: 0.88, adsTime: 0.18,
    sound: 'shotgun', noise: 45, tracer: 0.35, sight: 'bead',
    desc: 'Semi-auto shotgun. Less punch per shell than the M870, far faster follow-ups.',
    stats: { damage: 0.75, rate: 0.5, accuracy: 0.25, range: 0.18, mobility: 0.6 },
  },
  barrett: {
    id: 'barrett', slot: 0, name: 'BARRETT .50', cls: 'Anti-materiel rifle', auto: false, rate: 0.55, mag: 10, reserve: 30,
    damage: 110, headMul: 2.0, legMul: 0.8, falloff: [400, 500, 1], pellets: 1, range: 300,
    spread: { hip: 0.1, ads: 0.0, move: 0.06, air: 0.14, bloom: 0, bloomMax: 0, recover: 1 },
    recoil: { v: 0.08, h: 0.02, drift: 0, recover: 4 },
    reload: 3.4, reloadEmpty: 3.9, draw: 0.9, speed: 0.85, adsZoom: 0.2, adsTime: 0.3, scope: true, heavy: true,
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
    damage: 58, headMul: 2.0, legMul: 0.85, falloff: [25, 60, 0.7], pellets: 1, range: 120,
    spread: { hip: 0.022, ads: 0.003, move: 0.02, air: 0.06, bloom: 0.012, bloomMax: 0.04, recover: 0.2 },
    recoil: { v: 0.05, h: 0.012, drift: 0, recover: 7 },
    reload: 1.7, reloadEmpty: 2.0, draw: 0.4, speed: 1.0, adsZoom: 0.85, adsTime: 0.12,
    sound: 'deagle', noise: 40, tracer: 1, sight: 'iron',
    desc: 'A headshot kills outright. Seven rounds, heavy kick.',
  },
  usp: {
    id: 'usp', slot: 1, name: 'USP .45', cls: 'Pistol', auto: false, rate: 0.15, mag: 15, reserve: 75,
    damage: 34, headMul: 2.25, legMul: 0.85, falloff: [20, 50, 0.65], pellets: 1, range: 110,
    spread: { hip: 0.016, ads: 0.004, move: 0.012, air: 0.05, bloom: 0.007, bloomMax: 0.03, recover: 0.12 },
    recoil: { v: 0.02, h: 0.006, drift: 0, recover: 9 },
    reload: 1.35, reloadEmpty: 1.6, draw: 0.3, speed: 1.05, adsZoom: 0.86, adsTime: 0.1,
    sound: 'pistol', noise: 30, tracer: 1, sight: 'iron',
    desc: 'Reliable sidearm. Fifteen rounds, quick draw.',
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
export const PRIMARIES = ['m4', 'ak47', 'mp5', 'm870', 'spas12', 'm249', 'l96', 'barrett'];
export const SECONDARIES = ['usp', 'deagle'];
export const ALL_PRIMARIES = [...PRIMARIES, 'rpg'];

// Killfeed tags for non-gun damage sources
export const SOURCE_NAMES = { frag: 'FRAG', mortar: 'MORTAR', sentry: 'SENTRY', fall: 'FALL', barrel: 'BARREL' };

// explosion types: radius, max damage, visual size
export const EXPLOSIONS = { frag: { R: 7, D: 135, big: 1 }, mortar: { R: 8, D: 170, big: 1.25 }, rpg: { R: 5.5, D: 150, big: 1 }, barrel: { R: 6.5, D: 140, big: 1.1 } };

export const GRENADE = { fuse: 3.0, throwSpeed: 17, radius: 7, damage: 135, perLife: 2 };

export const DIFFICULTY = {
  easy: {
    label: 'EASY', react: [0.65, 1.0], aimErr: 0.085, settle: 1.4, dmgMul: 0.7, burstGap: [0.7, 1.2], burstMul: 0.6,
    turn: 5, speed: 0.85, hearing: 0.7, aggro: 0.25, grenade: 0.0, playerBias: 4, headChance: 0.03, sniperAim: 1.6,
  },
  normal: {
    label: 'NORMAL', react: [0.38, 0.6], aimErr: 0.06, settle: 0.95, dmgMul: 1, burstGap: [0.4, 0.8], burstMul: 0.85,
    turn: 8, speed: 0.95, hearing: 1, aggro: 0.5, grenade: 0.1, playerBias: 8, headChance: 0.08, sniperAim: 1.15,
  },
  hard: {
    label: 'HARD', react: [0.2, 0.34], aimErr: 0.042, settle: 0.6, dmgMul: 1, burstGap: [0.22, 0.5], burstMul: 1,
    turn: 12, speed: 1.0, hearing: 1.3, aggro: 0.8, grenade: 0.2, playerBias: 12, headChance: 0.15, sniperAim: 0.85,
  },
};

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
  { kills: 3, id: 'uav', name: 'RECON UAV', desc: 'Reveals enemies on the radar', duration: 25, auto: true },
  { kills: 5, id: 'mortar', name: 'MORTAR STRIKE', desc: 'Shells the spot you aim at' },
  { kills: 7, id: 'sentry', name: 'SENTRY GUN', desc: 'Auto-turret that guards a position', duration: 35 },
];

export const PICKUP = { health: 50, respawn: 25 };

export const SANDBOX_RULES = [
  ['teams', 'Team play'], ['infAmmo', 'Infinite ammo'], ['god', 'God mode'], ['lowGrav', 'Low gravity'],
  ['oneShot', 'One-shot kills'], ['headshots', 'Headshots only'], ['knife', 'Knives only'], ['passive', 'Passive bots (target practice)'],
];
