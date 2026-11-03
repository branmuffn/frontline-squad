import { G } from '../core/state.js';
import { losClear } from '../world/physics.js';

let ctx = null, master = null, verbIn = null, noiseBuf = null, amb = null;
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
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

export function setVolume(v) { if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
export function setListener(x, y, z, yaw) { L.x = x; L.y = y; L.z = z; L.yaw = yaw; }

// Build an output chain for one sound: gain -> (lowpass) -> pan -> master (+ reverb send)
function chain(gain, pan, cutoff, send) {
  const g = ctx.createGain(); g.gain.value = gain;
  let head = g;
  if (cutoff && cutoff < 16000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; g.connect(f); head = f; }
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; head.connect(p); head = p; }
  head.connect(master);
  if (send > 0) { const s = ctx.createGain(); s.gain.value = send; head.connect(s); s.connect(verbIn); }
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

const GUN = {
  rifle: [0.5, [1400, 600, 0.16, 0.9], [140, 45, 0.12, 0.7], [900, 200, 0.35, 0.25]],
  smg: [0.4, [1900, 900, 0.11, 0.7], [170, 60, 0.08, 0.45], [1100, 260, 0.22, 0.18]],
  shotgun: [0.6, [900, 300, 0.3, 1.0], [90, 35, 0.25, 1.0], [700, 120, 0.6, 0.4]],
  sniper: [0.8, [1100, 350, 0.4, 1.0], [70, 28, 0.35, 1.0], [600, 90, 0.9, 0.45]],
  pistol: [0.5, [2200, 1000, 0.12, 0.75], [200, 70, 0.08, 0.5], [1200, 300, 0.25, 0.16]],
};
function gun(d, t, kind) {
  const [crack, body, thump, tail] = GUN[kind];
  noise(d, t, 0.05, { type: 'highpass', f0: 2600, gain: crack });
  noise(d, t, body[2], { type: 'bandpass', f0: body[0], f1: body[1], q: 0.9, gain: body[3] });
  tone(d, t, thump[2], { f0: thump[0], f1: thump[1], gain: thump[3] });
  noise(d, t + 0.01, tail[2], { f0: tail[0], f1: tail[1], gain: tail[3], attack: 0.01 });
}
const click = (d, t, f = 600, g = 0.14) => { tone(d, t, 0.03, { type: 'square', f0: f, gain: g * 0.6 }); noise(d, t, 0.05, { type: 'highpass', f0: 3000, gain: g }); };

const RECIPES = {
  rifle: (d, t) => gun(d, t, 'rifle'), smg: (d, t) => gun(d, t, 'smg'), pistol: (d, t) => gun(d, t, 'pistol'),
  shotgun: (d, t) => { gun(d, t, 'shotgun'); click(d, t + 0.38, 520); click(d, t + 0.55, 760); },
  sniper: (d, t) => { gun(d, t, 'sniper'); click(d, t + 0.5, 700); click(d, t + 0.72, 520); },
  sentry: (d, t) => { noise(d, t, 0.04, { type: 'highpass', f0: 3000, gain: 0.3 }); noise(d, t, 0.09, { type: 'bandpass', f0: 2300, f1: 1100, gain: 0.5 }); tone(d, t, 0.06, { f0: 220, f1: 90, gain: 0.3 }); },
  knife: (d, t) => noise(d, t, 0.17, { type: 'bandpass', f0: 700, f1: 3200, q: 1.2, gain: 0.35, attack: 0.04 }),
  knifeHit: (d, t) => { noise(d, t, 0.09, { f0: 450, gain: 0.7 }); tone(d, t, 0.08, { f0: 180, f1: 90, gain: 0.4 }); },
  dry: (d, t) => click(d, t, 1800, 0.12),
  magOut: (d, t) => { tone(d, t, 0.04, { type: 'square', f0: 320, f1: 250, gain: 0.08 }); noise(d, t, 0.06, { type: 'bandpass', f0: 2500, gain: 0.22 }); },
  magIn: (d, t) => { click(d, t, 520, 0.2); click(d, t + 0.07, 900, 0.14); },
  bolt: (d, t) => { click(d, t, 700, 0.2); click(d, t + 0.14, 450, 0.2); },
  shell: (d, t) => { tone(d, t, 0.03, { type: 'triangle', f0: 900, gain: 0.12 }); noise(d, t, 0.05, { type: 'bandpass', f0: 2800, gain: 0.18 }); },
  switch: (d, t) => { noise(d, t, 0.14, { f0: 1200, gain: 0.16, attack: 0.03 }); click(d, t + 0.1, 400, 0.1); },
  hit: (d, t) => { tone(d, t, 0.05, { f0: 1700, gain: 0.16 }); tone(d, t, 0.03, { f0: 2600, gain: 0.07 }); },
  headshot: (d, t) => { tone(d, t, 0.09, { f0: 2400, gain: 0.18 }); tone(d, t + 0.01, 0.16, { type: 'triangle', f0: 3600, gain: 0.12 }); },
  kill: (d, t) => { tone(d, t, 0.07, { f0: 760, gain: 0.15 }); tone(d, t + 0.07, 0.13, { f0: 1140, gain: 0.15 }); },
  hurt: (d, t) => { noise(d, t, 0.16, { f0: 700, gain: 0.5 }); tone(d, t, 0.14, { f0: 95, f1: 60, gain: 0.45 }); },
  whiz: (d, t) => noise(d, t, 0.14, { type: 'bandpass', f0: 3500, f1: 1200, q: 3, gain: 0.32, attack: 0.03 }),
  step: (d, t) => noise(d, t, 0.07, { f0: 380 + Math.random() * 280, gain: 0.2 }),
  stepMetal: (d, t) => { noise(d, t, 0.06, { type: 'bandpass', f0: 1600, gain: 0.16 }); tone(d, t, 0.05, { type: 'triangle', f0: 310 + Math.random() * 60, gain: 0.05 }); },
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
  const t = ctx.currentTime + (o.delay || 0);
  voices++; setTimeout(() => voices--, 1200);
  r(chain(gain, pan, cutoff, send), t);
}

export function startAmbience(kind) {
  if (!ctx) return;
  stopAmbience();
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.5;
  const f = ctx.createBiquadFilter(); f.type = kind === 'desert' ? 'bandpass' : 'lowpass'; f.frequency.value = kind === 'desert' ? 650 : 380; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = kind === 'desert' ? 0.06 : 0.045;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g.gain);
  src.connect(f); f.connect(g); g.connect(master); src.start(); lfo.start();
  const nodes = [src, lfo];
  if (kind !== 'desert') { const hum = ctx.createOscillator(), hg = ctx.createGain(); hum.frequency.value = 55; hg.gain.value = 0.012; hum.connect(hg); hg.connect(master); hum.start(); nodes.push(hum); }
  amb = nodes;
}
export function stopAmbience() { if (amb) { for (const n of amb) { try { n.stop(); } catch (e) { /* already stopped */ } } amb = null; } }
