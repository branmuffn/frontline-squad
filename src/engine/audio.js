import { G } from '../core/state.js';
import { losClear } from '../world/physics.js';

let ctx = null, master = null, verbIn = null, echoIn = null, noiseBuf = null, amb = null, birdT = 0;
let voices = 0;
const L = { x: 0, y: 1.6, z: 0, yaw: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = G.profile.settings.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    // short industrial reverb
    const len = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    verbIn = ctx.createGain(); verbIn.gain.value = 0.22; verbIn.connect(conv); conv.connect(master);
    // outdoor slap-back echo: delay with filtered feedback
    echoIn = ctx.createGain(); echoIn.gain.value = 0.32;
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.21;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

export const audioCtx = () => ctx;
export const masterNode = () => master;
export function setVolume(v) { if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
export function setListener(x, y, z, yaw) { L.x = x; L.y = y; L.z = z; L.yaw = yaw; }

// Build an output chain for one sound: gain -> (lowpass) -> pan -> master (+ reverb send)
function chain(gain, pan, cutoff, send, echo = 0) {
  const g = ctx.createGain(); g.gain.value = gain;
  let head = g;
  if (cutoff && cutoff < 16000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; g.connect(f); head = f; }
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; head.connect(p); head = p; }
  head.connect(master);
  if (send > 0) { const s = ctx.createGain(); s.gain.value = send; head.connect(s); s.connect(verbIn); }
  if (echo > 0) { const e = ctx.createGain(); e.gain.value = echo; head.connect(e); e.connect(echoIn); }
  return g;
}

function noise(dest, t, dur, o) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = dur > 0.4; src.playbackRate.value = o.rate || 1;
  const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  const g = ctx.createGain(); const a = o.attack || 0.002;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function tone(dest, t, dur, o) {
  const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, t); if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  const g = ctx.createGain(); const a = o.attack || 0.003;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + dur + 0.02);
}

let curve = null;
function crunch(dest, amount) {
  if (!curve) { curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3.2); } }
  const ws = ctx.createWaveShaper(); ws.curve = curve; ws.oversample = 'none';
  const pre = ctx.createGain(); pre.gain.value = amount; pre.connect(ws); ws.connect(dest);
  return pre;
}
// [transient, crack Hz, body [f0,f1,dur,gain], sub [f0,f1,dur,gain], tail [f0,f1,dur,gain], mech click delay, drive]
const GUN2 = {
  rifle: [0.9, 2600, [1500, 380, 0.16, 0.95], [130, 42, 0.13, 0.85], [900, 160, 0.55, 0.32], 0.045, 1.6],
  smg: [0.75, 3100, [1900, 600, 0.11, 0.8], [160, 55, 0.09, 0.55], [1100, 220, 0.38, 0.22], 0.035, 1.3],
  shotgun: [1.0, 2100, [1100, 200, 0.32, 1.1], [95, 32, 0.3, 1.15], [700, 110, 0.9, 0.45], 0, 2.2],
  sniper: [1.0, 2300, [1200, 260, 0.42, 1.1], [75, 26, 0.4, 1.2], [600, 80, 1.3, 0.5], 0, 2.0],
  pistol: [0.8, 3300, [2300, 700, 0.12, 0.8], [210, 70, 0.08, 0.55], [1200, 260, 0.36, 0.2], 0.03, 1.2],
  ak: [0.95, 2300, [1250, 320, 0.19, 1.0], [115, 38, 0.15, 0.95], [800, 140, 0.6, 0.35], 0.05, 2.0],
  lmg: [0.85, 2500, [1400, 360, 0.15, 0.95], [125, 40, 0.12, 0.85], [850, 150, 0.5, 0.3], 0.04, 1.7],
  deagle: [1.0, 2700, [1700, 450, 0.2, 1.05], [140, 45, 0.15, 0.95], [900, 150, 0.7, 0.36], 0.04, 2.0],
  barrett: [1.2, 1900, [950, 160, 0.55, 1.3], [58, 22, 0.5, 1.4], [480, 60, 1.6, 0.6], 0, 2.6],
};
const GUN = {
  rifle: [0.5, [1400, 600, 0.16, 0.9], [140, 45, 0.12, 0.7], [900, 200, 0.35, 0.25]],
  smg: [0.4, [1900, 900, 0.11, 0.7], [170, 60, 0.08, 0.45], [1100, 260, 0.22, 0.18]],
  shotgun: [0.6, [900, 300, 0.3, 1.0], [90, 35, 0.25, 1.0], [700, 120, 0.6, 0.4]],
  sniper: [0.8, [1100, 350, 0.4, 1.0], [70, 28, 0.35, 1.0], [600, 90, 0.9, 0.45]],
  pistol: [0.5, [2200, 1000, 0.12, 0.75], [200, 70, 0.08, 0.5], [1200, 300, 0.25, 0.16]],
  ak: [0.55, [1200, 500, 0.18, 0.95], [120, 40, 0.13, 0.8], [800, 180, 0.4, 0.3]],
  lmg: [0.5, [1500, 650, 0.15, 0.85], [130, 45, 0.11, 0.7], [900, 200, 0.35, 0.25]],
  deagle: [0.65, [1700, 700, 0.18, 0.95], [150, 50, 0.12, 0.75], [900, 220, 0.4, 0.3]],
  barrett: [1.0, [900, 250, 0.5, 1.1], [60, 24, 0.45, 1.2], [500, 70, 1.2, 0.55]],
};
function gun(d, t, kind) {
  const g2 = GUN2[kind];
  if (g2) {
    const [tr, crack, body, sub, tail, mech, drive] = g2, j = 0.92 + Math.random() * 0.16;
    noise(d, t, 0.012, { type: 'highpass', f0: 5000, gain: tr });
    noise(d, t, 0.045, { type: 'bandpass', f0: crack * j, q: 1.4, gain: tr * 0.8 });
    noise(crunch(d, drive), t, body[2], { type: 'lowpass', f0: body[0] * j, f1: body[1], q: 1.1, gain: body[3] * 0.55 });
    tone(d, t, sub[2], { f0: sub[0] * j, f1: sub[1], gain: sub[3] });
    noise(d, t + 0.015, tail[2], { f0: tail[0], f1: tail[1], gain: tail[3], attack: 0.02 });
    if (mech) { tone(d, t + mech, 0.02, { type: 'square', f0: 1900 * j, gain: 0.05 }); noise(d, t + mech, 0.03, { type: 'highpass', f0: 4500, gain: 0.08 }); }
    return;
  }
  const [crack, body, thump, tail] = GUN[kind];
  noise(d, t, 0.05, { type: 'highpass', f0: 2600, gain: crack });
  noise(d, t, body[2], { type: 'bandpass', f0: body[0], f1: body[1], q: 0.9, gain: body[3] });
  tone(d, t, thump[2], { f0: thump[0], f1: thump[1], gain: thump[3] });
  noise(d, t + 0.01, tail[2], { f0: tail[0], f1: tail[1], gain: tail[3], attack: 0.01 });
}
const click = (d, t, f = 600, g = 0.14) => { tone(d, t, 0.03, { type: 'square', f0: f, gain: g * 0.6 }); noise(d, t, 0.05, { type: 'highpass', f0: 3000, gain: g }); };

const RECIPES = {
  zoomClick: (d, t) => { click(d, t, 900, 0.1); click(d, t + 0.05, 1300, 0.07); },
  ak: (d, t) => gun(d, t, 'ak'), lmg: (d, t) => gun(d, t, 'lmg'), deagle: (d, t) => gun(d, t, 'deagle'), barrett: (d, t) => gun(d, t, 'barrett'),
  rpg: (d, t) => { noise(d, t, 0.6, { type: 'bandpass', f0: 400, f1: 1800, q: 0.7, gain: 0.9, attack: 0.02 }); tone(d, t, 0.3, { f0: 90, f1: 40, gain: 0.6 }); noise(d, t + 0.05, 0.9, { type: 'highpass', f0: 2500, gain: 0.15, attack: 0.1 }); },
  rifle: (d, t) => gun(d, t, 'rifle'), smg: (d, t) => gun(d, t, 'smg'), pistol: (d, t) => gun(d, t, 'pistol'),
  shotgun: (d, t) => { gun(d, t, 'shotgun'); click(d, t + 0.38, 520); click(d, t + 0.55, 760); },
  sniper: (d, t) => { gun(d, t, 'sniper'); click(d, t + 0.5, 700); click(d, t + 0.72, 520); },
  sentry: (d, t) => { noise(d, t, 0.04, { type: 'highpass', f0: 3000, gain: 0.3 }); noise(d, t, 0.09, { type: 'bandpass', f0: 2300, f1: 1100, gain: 0.5 }); tone(d, t, 0.06, { f0: 220, f1: 90, gain: 0.3 }); },
  knife: (d, t) => noise(d, t, 0.17, { type: 'bandpass', f0: 700, f1: 3200, q: 1.2, gain: 0.35, attack: 0.04 }),
  knifeHit: (d, t) => { noise(d, t, 0.09, { f0: 450, gain: 0.7 }); tone(d, t, 0.08, { f0: 180, f1: 90, gain: 0.4 }); },
  dry: (d, t) => click(d, t, 1800, 0.12),
  magOut: (d, t) => { click(d, t, 900, 0.18); noise(d, t + 0.02, 0.12, { type: 'bandpass', f0: 1800, f1: 900, q: 1.5, gain: 0.14 }); tone(d, t + 0.03, 0.06, { type: 'triangle', f0: 420, gain: 0.05 }); },
  magIn: (d, t) => { noise(d, t, 0.08, { type: 'bandpass', f0: 1400, f1: 2600, q: 1.5, gain: 0.12 }); click(d, t + 0.08, 520, 0.24); click(d, t + 0.13, 1100, 0.14); tone(d, t + 0.08, 0.08, { type: 'triangle', f0: 640, gain: 0.05 }); },
  bolt: (d, t) => { click(d, t, 700, 0.22); noise(d, t + 0.02, 0.1, { type: 'bandpass', f0: 2200, q: 2, gain: 0.1 }); click(d, t + 0.15, 450, 0.24); tone(d, t + 0.15, 0.12, { type: 'triangle', f0: 880, f1: 760, gain: 0.05 }); },
  shell: (d, t) => { tone(d, t, 0.03, { type: 'triangle', f0: 900, gain: 0.12 }); noise(d, t, 0.05, { type: 'bandpass', f0: 2800, gain: 0.18 }); },
  switch: (d, t) => { noise(d, t, 0.14, { f0: 1200, gain: 0.16, attack: 0.03 }); click(d, t + 0.1, 400, 0.1); },
  hit: (d, t) => { tone(d, t, 0.05, { f0: 1700, gain: 0.16 }); tone(d, t, 0.03, { f0: 2600, gain: 0.07 }); },
  headshot: (d, t) => { tone(d, t, 0.09, { f0: 2400, gain: 0.18 }); tone(d, t + 0.01, 0.16, { type: 'triangle', f0: 3600, gain: 0.12 }); },
  kill: (d, t) => { tone(d, t, 0.07, { f0: 760, gain: 0.15 }); tone(d, t + 0.07, 0.13, { f0: 1140, gain: 0.15 }); },
  hurt: (d, t) => { noise(d, t, 0.16, { f0: 700, gain: 0.5 }); tone(d, t, 0.14, { f0: 95, f1: 60, gain: 0.45 }); },
  whiz: (d, t) => noise(d, t, 0.14, { type: 'bandpass', f0: 3500, f1: 1200, q: 3, gain: 0.32, attack: 0.03 }),
  step: (d, t) => noise(d, t, 0.07, { f0: 380 + Math.random() * 280, gain: 0.2 }),
  stepMetal: (d, t) => { noise(d, t, 0.06, { type: 'bandpass', f0: 1600, gain: 0.16 }); tone(d, t, 0.05, { type: 'triangle', f0: 310 + Math.random() * 60, gain: 0.05 }); },
  stepSand: (d, t) => { for (let i = 0; i < 3; i++) noise(d, t + i * 0.018, 0.05, { type: 'bandpass', f0: 1600 + Math.random() * 1200, q: 0.8, gain: 0.11, rate: 0.7 + Math.random() * 0.6 }); noise(d, t, 0.08, { f0: 260, gain: 0.14 }); },
  stepWood: (d, t) => { noise(d, t, 0.07, { type: 'bandpass', f0: 420 + Math.random() * 120, q: 2.2, gain: 0.34 }); tone(d, t, 0.06, { type: 'triangle', f0: 150 + Math.random() * 30, gain: 0.09 }); },
  stepConcrete: (d, t) => { noise(d, t, 0.05, { f0: 320 + Math.random() * 150, gain: 0.24 }); noise(d, t, 0.018, { type: 'highpass', f0: 3200, gain: 0.08 }); },
  stepGrass: (d, t) => noise(d, t, 0.11, { type: 'highpass', f0: 1300 + Math.random() * 600, gain: 0.08, attack: 0.02 }),
  stepWater: (d, t) => { noise(d, t, 0.28, { type: 'bandpass', f0: 950, f1: 380, q: 1.3, gain: 0.32, attack: 0.01 }); for (let i = 0; i < 3; i++) tone(d, t + 0.04 + i * 0.05, 0.04, { f0: 600 + Math.random() * 700, f1: 1400, gain: 0.03 }); },
  cloth: (d, t) => noise(d, t, 0.18, { type: 'bandpass', f0: 1100, q: 0.6, gain: 0.05, attack: 0.05 }),
  ricochet: (d, t) => { const f = 2600 + Math.random() * 1200; tone(d, t, 0.32, { f0: f, f1: f * 0.45, gain: 0.07 }); noise(d, t, 0.03, { type: 'highpass', f0: 4000, gain: 0.15 }); },
  casing: (d, t) => { for (let i = 0; i < 3; i++) tone(d, t + i * (0.05 + Math.random() * 0.05), 0.05, { type: 'triangle', f0: 3200 + Math.random() * 1800, gain: 0.025 / (i + 1) }); },
  splash: (d, t) => noise(d, t, 0.18, { type: 'bandpass', f0: 1200, f1: 500, q: 1, gain: 0.3 }),
  bird: (d, t) => { const f = 2200 + Math.random() * 1600; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(d, t + i * 0.13, 0.08, { f0: f, f1: f * (1.2 + Math.random() * 0.3), gain: 0.03 }); },
  land: (d, t) => noise(d, t, 0.13, { f0: 300, gain: 0.4 }),
  impact: (d, t) => noise(d, t, 0.05, { type: 'bandpass', f0: 2400, gain: 0.3 }),
  impactMetal: (d, t) => { tone(d, t, 0.07, { type: 'triangle', f0: 1400 + Math.random() * 1000, gain: 0.12 }); noise(d, t, 0.04, { type: 'highpass', f0: 4000, gain: 0.2 }); },
  impactWood: (d, t) => noise(d, t, 0.06, { type: 'bandpass', f0: 900, gain: 0.35 }),
  impactSoft: (d, t) => noise(d, t, 0.05, { f0: 600, gain: 0.3 }),
  bodyHit: (d, t) => noise(d, t, 0.07, { f0: 500, gain: 0.45 }),
  explosion: (d, t) => {
    noise(d, t, 1.3, { f0: 1300, f1: 90, gain: 1.5, attack: 0.005 });
    tone(d, t, 0.9, { f0: 65, f1: 24, gain: 1.3 });
    noise(d, t, 0.07, { type: 'highpass', f0: 2000, gain: 0.8 });
    noise(d, t + 0.2, 0.6, { type: 'highpass', f0: 3000, gain: 0.12, attack: 0.05 });
  },
  bounce: (d, t) => { tone(d, t, 0.04, { type: 'triangle', f0: 1100 + Math.random() * 300, gain: 0.14 }); noise(d, t, 0.03, { type: 'highpass', f0: 4000, gain: 0.1 }); },
  pin: (d, t) => { tone(d, t, 0.02, { type: 'square', f0: 1500, gain: 0.1 }); tone(d, t + 0.08, 0.03, { type: 'square', f0: 1100, gain: 0.08 }); },
  throw: (d, t) => noise(d, t, 0.2, { type: 'bandpass', f0: 500, f1: 1600, gain: 0.25, attack: 0.05 }),
  pickup: (d, t) => { tone(d, t, 0.08, { type: 'triangle', f0: 600, gain: 0.15 }); tone(d, t + 0.09, 0.12, { type: 'triangle', f0: 900, gain: 0.13 }); },
  radio: (d, t) => { for (let i = 0; i < 3; i++) tone(d, t + i * 0.09, 0.05, { type: 'square', f0: 1200, gain: 0.05 }); noise(d, t, 0.3, { type: 'bandpass', f0: 1800, q: 2, gain: 0.05 }); },
  streak: (d, t) => { [520, 780, 1040].forEach((f, i) => tone(d, t + i * 0.09, 0.12, { f0: f, gain: 0.13 })); },
  whistle: (d, t) => tone(d, t, 1.0, { f0: 1700, f1: 500, gain: 0.22, attack: 0.2 }),
  beep: (d, t) => tone(d, t, 0.09, { f0: 880, gain: 0.18 }),
  go: (d, t) => tone(d, t, 0.28, { f0: 1320, gain: 0.2 }),
  rankup: (d, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(d, t + i * 0.12, 0.2, { type: 'triangle', f0: f, gain: 0.16 })); },
  victory: (d, t) => { [392, 523, 659, 784].forEach((f, i) => tone(d, t + i * 0.16, 0.26, { type: 'triangle', f0: f, gain: 0.16 })); tone(d, t + 0.66, 0.7, { type: 'triangle', f0: 1047, gain: 0.16 }); },
  defeat: (d, t) => { [523, 440, 349, 262].forEach((f, i) => tone(d, t + i * 0.22, 0.32, { type: 'triangle', f0: f, gain: 0.15 })); },
  heartbeat: (d, t) => { tone(d, t, 0.1, { f0: 62, gain: 0.5 }); tone(d, t + 0.17, 0.12, { f0: 55, gain: 0.38 }); },
  wave: (d, t) => { tone(d, t, 0.7, { type: 'sawtooth', f0: 220, gain: 0.08, attack: 0.08 }); tone(d, t, 0.7, { type: 'sawtooth', f0: 330, gain: 0.06, attack: 0.08 }); },
  deny: (d, t) => tone(d, t, 0.12, { type: 'square', f0: 180, gain: 0.08 }),
};

// play(name) for UI/first-person sounds; play(name, {x,y,z}) for positional world sounds
export function play(name, pos, o = {}) {
  if (!ctx || !master || G.profile.settings.volume <= 0) return;
  const r = RECIPES[name]; if (!r) return;
  if (voices > 60 && !o.important) return;
  let gain = o.gain ?? 1, pan = 0, cutoff = 0, send = o.send ?? 0.15;
  if (pos) {
    const dx = pos.x - L.x, dy = (pos.y ?? L.y) - L.y, dz = pos.z - L.z, d = Math.hypot(dx, dy, dz);
    const range = o.range || 110;
    if (d > range) return;
    gain *= 1 / (1 + Math.pow(d / (o.ref || 7), 1.35));
    if (gain < 0.012 && !o.important) return;
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    pan = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d)) : 0;
    cutoff = 18000 / (1 + d / 30);
    if (o.occlude && d > 3 && !losClear(L.x, L.y, L.z, pos.x, (pos.y ?? 1) + 0.2, pos.z)) { cutoff *= 0.18; gain *= 0.55; }
    send = Math.min(0.6, 0.12 + d / 120);
  }
  const echo = o.echo ?? (GUN2[name] || name === 'explosion' || name === 'shotgun' || name === 'sniper' || name === 'barrett' || name === 'rpg' ? (pos ? 0.6 : 0.45) : 0);
  const t = ctx.currentTime + (o.delay || 0);
  voices++; setTimeout(() => voices--, 1200);
  r(chain(gain, pan, cutoff, send, echo), t);
}

export function startAmbience(kind) {
  if (!ctx) return;
  stopAmbience();
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.5;
  const f = ctx.createBiquadFilter(); f.type = kind === 'desert' || kind === 'forest' ? 'bandpass' : 'lowpass'; f.frequency.value = kind === 'desert' ? 650 : kind === 'forest' ? 900 : 380; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = kind === 'desert' ? 0.06 : 0.045;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g.gain);
  src.connect(f); f.connect(g); g.connect(master); src.start(); lfo.start();
  const nodes = [src, lfo];
  if (kind !== 'desert') { const hum = ctx.createOscillator(), hg = ctx.createGain(); hum.frequency.value = 55; hg.gain.value = 0.012; hum.connect(hg); hg.connect(master); hum.start(); nodes.push(hum); }
  amb = nodes;
}
// occasional birdsong on the woodland map
export function ambienceTick(dt, kind) {
  if (!ctx || kind !== 'forest') return;
  birdT -= dt;
  if (birdT <= 0) { birdT = 3 + Math.random() * 7; play('bird', { x: L.x + (Math.random() - 0.5) * 60, y: 8, z: L.z + (Math.random() - 0.5) * 60 }, { gain: 0.9, range: 80 }); }
}

export function stopAmbience() { if (amb) { for (const n of amb) { try { n.stop(); } catch (e) { /* already stopped */ } } amb = null; } }
