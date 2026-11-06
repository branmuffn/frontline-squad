// Map editor (3f): a free sandbox on the custom map. 1-8 pick a piece, F places it where you look (snapped to 1 m),
// R rotates, X removes the piece you look at, Z undoes, T test-plays it (FFA with bots), Esc menu has Export/Import.
import * as THREE from 'three';
import { G } from '../core/state.js';
import { PIECES, loadCustom, saveCustom } from '../world/maps/custommap.js';
import { rayWorld } from '../world/physics.js';
import * as hud from '../ui/hud.js';
import { play } from '../engine/audio.js';

const ORDER = ['box', 'wall', 'ramp', 'crate', 'cont', 'plat', 'spawnA', 'spawnB'];
let ed = null, ghost = null;
export const editorOn = () => !!ed;
export function startEditor() { ed = { piece: 'box', r: 0, map: loadCustom(), undo: [] }; makeGhost(); help(); }
export function stopEditor() { if (ghost) { G.scene.remove(ghost); ghost.geometry.dispose(); } ghost = null; ed = null; }
function help() { hud.banner('Map editor', `1–8 piece (${PIECES[ed.piece].name}) · F place · R rotate · X remove · Z undo · T test · Esc: export / import`, 'wave'); }
function makeGhost() {
  if (ghost) { G.scene.remove(ghost); ghost.geometry.dispose(); }
  const p = PIECES[ed.piece], q = ed.r % 2;
  ghost = new THREE.Mesh(new THREE.BoxGeometry(q ? p.d : p.w, p.h, q ? p.w : p.d), new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.35, depthWrite: false }));
  ghost.renderOrder = 18; G.scene.add(ghost);
}
function target() {
  const c = G.camera, d = new THREE.Vector3(); c.getWorldDirection(d);
  const h = rayWorld(c.position.x, c.position.y, c.position.z, d.x, d.y, d.z, 40); if (!h) return null;
  const p = PIECES[ed.piece], q = ed.r % 2, w = q ? p.d : p.w, dd = q ? p.w : p.d;
  const snap = (v, s) => Math.round(v - s / 2) + s / 2;
  return { x: snap(h.x + h.nx * 0.01, w % 2 ? 1 : 0), z: snap(h.z + h.nz * 0.01, dd % 2 ? 1 : 0), y: Math.max(0, Math.round((h.y + (h.ny > 0.5 ? 0 : -0.5)) * 10) / 10) };
}
export function editorTick() {
  if (!ed || !ghost) return; const t = target();
  ghost.visible = !!t; if (t) ghost.position.set(t.x, t.y + PIECES[ed.piece].h / 2, t.z);
  hud.prompt(`${PIECES[ed.piece].name} · ${ed.map.objs.length} pieces · F place · X remove · T test`);
}
function rebuild(reload) { saveCustom(ed.map); reload(); makeGhost(); }
// returns true when the key was used by the editor
export function editorKey(code, reload, testPlay) {
  if (!ed) return false;
  const n = /^Digit([1-8])$/.exec(code);
  if (n) { ed.piece = ORDER[+n[1] - 1]; makeGhost(); help(); return true; }
  if (code === 'KeyR') { ed.r = (ed.r + 1) % 4; makeGhost(); return true; }
  if (code === 'KeyF') { const t = target(); if (!t) return true; if (ed.map.objs.length >= 590) { hud.notice('Map is full (590 pieces)'); return true; }
    ed.map.objs.push({ t: ed.piece, x: t.x, y: t.y, z: t.z, r: ed.r }); ed.undo.push('add'); play('pickup'); rebuild(reload); return true; }
  if (code === 'KeyX') { const t = target(); if (!t) return true; let bi = -1, bd = 2.5;
    ed.map.objs.forEach((o, i) => { const d = Math.hypot(o.x - t.x, o.z - t.z) + Math.abs(o.y - t.y) * 0.5; if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) { const [o] = ed.map.objs.splice(bi, 1); ed.undo.push(['del', o]); rebuild(reload); } return true; }
  if (code === 'KeyZ') { const u = ed.undo.pop(); if (u === 'add') ed.map.objs.pop(); else if (u) ed.map.objs.push(u[1]); if (u) rebuild(reload); return true; }
  if (code === 'KeyT') { saveCustom(ed.map); testPlay(); return true; }
  return false;
}
export function exportMap() { return JSON.stringify(loadCustom()); }
