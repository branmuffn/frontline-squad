// Ping: tap the ping key (H) where you look. On an enemy: "Enemy", elsewhere: "Here"; double-tap: "Danger".
// A marker shows through walls for 6 s with a callout (high ground / low ground + compass direction + distance) and a
// team chat line. In multiplayer the host relays pings to your team (everyone in co-op).
import * as THREE from 'three';
import { G } from '../core/state.js';
import { rayWorld, rayUnits } from '../world/physics.js';
import { isEnemy } from '../entities/units.js';
import { play } from '../engine/audio.js';
import * as chat from './chat.js';

const KINDS = { enemy: ['ENEMY', '#ff5a4a'], here: ['HERE', '#ffd34d'], danger: ['DANGER', '#ff9a3a'] };
const marks = []; let lastTap = 0;
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function callout(x, y, z) {
  const b = G.world.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, dx = x - cx, dz = z - cz;
  const sector = Math.hypot(dx, dz) < 8 ? 'middle' : DIRS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8] + ' side';
  return (y > 3 ? 'high ground, ' : '') + sector;
}
function sprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)';
  x.fillStyle = color; x.beginPath(); x.moveTo(128, 92); x.lineTo(112, 62); x.lineTo(144, 62); x.closePath(); x.fill();
  x.strokeText(text, 128, 44); x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.renderOrder = 20; s.scale.set(2.4, 0.9, 1); return s;
}
export function showPing(p) { // { x, y, z, k, n }
  const [label, color] = KINDS[p.k] || KINDS.here, s = sprite(label, color);
  s.position.set(p.x, p.y + 1.1, p.z); G.scene.add(s); marks.push({ s, until: G.now + 6, born: G.now });
  const P = G.player, d = P ? Math.round(Math.hypot(p.x - P.x, p.z - P.z)) : 0;
  chat.add(p.n || '', `${label.charAt(0) + label.slice(1).toLowerCase()}${p.k === 'enemy' ? ' spotted' : ''} · ${callout(p.x, p.y, p.z)} · ${d} m`, 'ally', true);
  play('ping', null, { important: true });
}
export function updatePings() {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i], P = G.player, d = P ? Math.hypot(m.s.position.x - P.x, m.s.position.z - P.z) : 10, k = Math.max(1, d / 14);
    m.s.scale.set(2.4 * k, 0.9 * k, 1); m.s.material.opacity = Math.min(1, (m.until - G.now) / 1.2);
    if (G.now > m.until || G.now < m.born) { G.scene.remove(m.s); m.s.material.map.dispose(); m.s.material.dispose(); marks.splice(i, 1); }
  }
}
export function clearPings() { for (const m of marks) G.scene.remove(m.s); marks.length = 0; }
export function doPing() {
  const P = G.player; if (!P || !P.alive || !G.world) return;
  const cam = G.camera, d = new THREE.Vector3(); cam.getWorldDirection(d);
  const o = cam.position, w = rayWorld(o.x, o.y, o.z, d.x, d.y, d.z, 200), tmax = w ? w.t : 200;
  const u = rayUnits(o.x, o.y, o.z, d.x, d.y, d.z, tmax, (q) => q === P || !isEnemy(P, q));
  const dbl = G.realTime - lastTap < 0.4; lastTap = G.realTime;
  const p = u ? { x: u.unit.x, y: u.unit.y, z: u.unit.z, k: 'enemy' } : w ? { x: w.x, y: w.y, z: w.z, k: dbl ? 'danger' : 'here' } : null;
  if (!p) return;
  if (dbl && marks.length) { const m = marks.pop(); G.scene.remove(m.s); } // the double tap replaces the single one
  p.n = G.mp && G.mp.live ? G.mp.name : 'YOU';
  showPing(p);
  if (G.mp && G.mp.live) G.mp.ping({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), k: p.k });
}
