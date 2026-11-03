// Original procedural music (A10): a menu/lobby theme, a calmer end-screen variation, and short match stingers.
// Nothing plays during a match. Everything is synthesized; the scheduler looks ahead ~0.2 s on the audio clock.
import { audioCtx, masterNode } from './audio.js';

let ctx = null, bus = null, vol = 0.5, scene = null, timer = 0, nextT = 0, step = 0, loopN = 0, noise = null;
const BPM = 84, S16 = 60 / BPM / 4;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// D minor: i - VI - III - VII (Dm, Bb, F, C), two passes per loop
const CHORDS = [[50, 53, 57], [46, 50, 53], [45, 48, 53], [43, 48, 52]];
const ROOTS = [38, 34, 41, 36];
// melody in eighth notes per bar (MIDI, 0 = rest); bars 1-4 then the answer phrase 5-8
const MEL = [
  [69, 0, 65, 0, 62, 64, 65, 0], [74, 0, 72, 70, 69, 0, 0, 0], [72, 0, 69, 0, 65, 67, 69, 0], [67, 0, 64, 0, 60, 0, 0, 0],
  [69, 0, 74, 0, 72, 69, 65, 0], [70, 0, 69, 67, 65, 0, 62, 0], [72, 0, 77, 0, 76, 72, 69, 0], [64, 0, 67, 0, 69, 0, 0, 0],
];

function ensure() {
  if (ctx) return true;
  ctx = audioCtx(); if (!ctx) return false;
  bus = ctx.createGain(); bus.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
  bus.connect(lp); lp.connect(masterNode());
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function env(g, t, a, peak, hold, r) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
}
function osc(type, f, t, dur, peak, a, r, cutoff, out = bus, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  let head = o;
  if (cutoff) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = 0.7; o.connect(fl); head = fl; }
  head.connect(g); g.connect(out);
  env(g, t, a, peak, Math.max(0, dur - a), r);
  o.start(t); o.stop(t + dur + r + 0.05);
  return o;
}
function pad(chord, t, dur, peak, cutoff) {
  for (const m of chord) for (const dt of [-7, 6]) osc('sawtooth', mtof(m), t, dur, peak, 0.5, 1.1, cutoff, bus, dt);
}
function bass(m, t, dur, peak) { osc('triangle', mtof(m), t, dur, peak, 0.01, 0.12, 0); osc('sawtooth', mtof(m), t, dur, peak * 0.35, 0.01, 0.1, 420); }
function lead(m, t, dur, peak) {
  const o = osc('triangle', mtof(m), t, dur, peak, 0.03, 0.35, 2600);
  const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 5.2; vg.gain.value = 5;
  v.connect(vg); vg.connect(o.detune); v.start(t); v.stop(t + dur + 0.4);
}
function kick(t, peak) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  o.connect(g); g.connect(bus); env(g, t, 0.005, peak, 0.02, 0.22); o.start(t); o.stop(t + 0.3);
}
function tick(t, peak, hp = 2500, len = 0.08) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; f.type = 'highpass'; f.frequency.value = hp;
  s.connect(f); f.connect(g); g.connect(bus); env(g, t, 0.002, peak, 0.005, len); s.start(t); s.stop(t + len + 0.05);
}

// one sixteenth-note step of the current scene
function schedule(t) {
  const bar = Math.floor(step / 16) % 8, s16 = step % 16, chord = bar % 4, calm = scene === 'end';
  if (s16 === 0) pad(CHORDS[chord], t, S16 * 16 - 0.3, calm ? 0.022 : 0.028, calm ? 700 : 1100);
  if (!calm) {
    if (s16 % 2 === 0) bass(s16 === 6 || s16 === 14 ? ROOTS[chord] + 7 : ROOTS[chord], t, S16 * 1.6, 0.11);
    if (s16 === 0 || s16 === 8 || (s16 === 10 && bar % 2)) kick(t, 0.2);
    if (s16 === 4 || s16 === 12) tick(t, 0.05, 1800, 0.14);
    if (s16 % 2 === 1) tick(t, 0.012, 7000, 0.03);
  } else if (s16 === 0) bass(ROOTS[chord], t, S16 * 14, 0.07);
  // melody: from the second time round, alternating loops, softer on the end screen
  if (loopN > 0 && (loopN % 2 === 1 || calm) && s16 % 2 === 0) {
    const m = MEL[bar][s16 / 2];
    if (m) lead(m, t, S16 * 1.7, calm ? 0.035 : 0.05);
  }
  step++;
  if (step % 128 === 0) loopN++;
}
function pump() {
  if (!scene || !ctx) return;
  while (nextT < ctx.currentTime + 0.2) { schedule(nextT); nextT += S16; }
  timer = setTimeout(pump, 40);
}

export function setMusicVolume(v) { vol = v; if (bus && scene) bus.gain.setTargetAtTime(vol * 0.9, ctx.currentTime, 0.1); }

// scene: 'menu' | 'end' | null (silence, e.g. during a match)
export function setScene(s) {
  if (!ensure() || s === scene) return;
  clearTimeout(timer);
  const now = ctx.currentTime;
  if (!s) { scene = null; bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(0, now, 0.25); return; }
  scene = s; step = 0; loopN = s === 'end' ? 1 : 0; nextT = now + 0.1;
  bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(0.0001, now); bus.gain.setTargetAtTime(vol * 0.9, now, 0.6);
  pump();
}

// short cues: 'start' (deploy), 'victory', 'defeat', 'draw'
export function stinger(kind) {
  if (!ensure()) return;
  const t = ctx.currentTime + 0.05, out = ctx.createGain();
  out.gain.value = Math.max(0.0001, vol); out.connect(masterNode());
  const brass = (ms, at, dur, pk) => { for (const m of ms) for (const d of [-6, 6]) osc('sawtooth', mtof(m), at, dur, pk, 0.04, 0.5, 1800, out, d); };
  const timp = (at, pk) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(90, at); o.frequency.exponentialRampToValueAtTime(55, at + 0.5); o.connect(g); g.connect(out); env(g, at, 0.005, pk, 0.05, 0.9); o.start(at); o.stop(at + 1.1); };
  if (kind === 'start') {
    brass([50, 57], t, 0.18, 0.03); brass([53, 60], t + 0.22, 0.18, 0.03); brass([55, 62, 67], t + 0.44, 0.9, 0.035); timp(t + 0.44, 0.3);
  } else if (kind === 'victory') {
    brass([55, 59, 62], t, 0.3, 0.03); brass([57, 61, 64], t + 0.34, 0.3, 0.03); brass([62, 66, 69, 74], t + 0.68, 1.6, 0.035); timp(t + 0.68, 0.32);
  } else if (kind === 'defeat') {
    brass([57, 62, 65], t, 0.5, 0.028); brass([55, 58, 62], t + 0.55, 0.5, 0.026); brass([50, 53, 57], t + 1.1, 1.6, 0.024); timp(t + 1.1, 0.22);
  } else {
    brass([57, 62, 65], t, 0.4, 0.028); brass([55, 60, 64], t + 0.45, 1.4, 0.028);
  }
}
export const musicScene = () => scene;
