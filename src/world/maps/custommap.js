// Custom map (3f map editor): a flat 80 x 80 m yard built from a JSON list the editor writes.
// { name, objs: [{ t: 'box'|'wall'|'ramp'|'crate'|'barrel'|'cont', x, y, z, r }], spawnsA: [[x,z]], spawnsB: [[x,z]] }
import { crate, container } from './props.js';
const KEY = 'frontline_custom_map';
export const PIECES = {
  box: { name: 'Block 2 m', w: 2, h: 2, d: 2 }, wall: { name: 'Wall', w: 4, h: 3, d: 0.4 }, ramp: { name: 'Ramp', w: 3, h: 2, d: 4 },
  crate: { name: 'Crate', w: 1.6, h: 1.4, d: 1.6 }, cont: { name: 'Container', w: 2.4, h: 2.9, d: 6 }, plat: { name: 'Platform', w: 4, h: 0.4, d: 4 },
  spawnA: { name: 'Spawn A', w: 0.8, h: 0.1, d: 0.8 }, spawnB: { name: 'Spawn B', w: 0.8, h: 0.1, d: 0.8 },
};
export function loadCustom() { try { const m = JSON.parse(localStorage.getItem(KEY) || 'null'); if (m && Array.isArray(m.objs)) return m; } catch (e) { /* ignore */ } return { name: 'MY MAP', objs: [] }; }
export function saveCustom(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } }
export function validCustom(m) { return m && Array.isArray(m.objs) && m.objs.length < 600 && m.objs.every((o) => PIECES[o.t] && [o.x, o.y, o.z].every((v) => Number.isFinite(v) && Math.abs(v) < 60)); }
const dims = (o) => { const p = PIECES[o.t], q = (o.r || 0) % 2; return q ? [p.d, p.h, p.w] : [p.w, p.h, p.d]; };
const RING = [[-34, -34], [34, 34], [-34, 34], [34, -34], [0, -34], [0, 34], [-34, 0], [34, 0]];
const custom = {
  id: 'custom', name: 'CUSTOM MAP', blurb: 'Your own map from the map editor.',
  bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, ground: 'groundYard', groundMat: 'concrete',
  sky: [0x7fa6d8, 0xe9eef2, 0xb9b4a8], cloudTint: '#ffffff', fog: { color: 0xd9dde0, density: 0.008 },
  sun: { color: 0xfff1dc, intensity: 2.2, pos: [40, 60, 30], shadow: 44 }, hemi: { sky: 0xdde8f2, ground: 0x6e6a60, intensity: 1.0 },
  ambience: 'yard', pickups: [{ type: 'health', x: 0, y: 0, z: 6 }, { type: 'ammo', x: 0, y: 0, z: -6 }],
  get spawns() {
    const m = loadCustom(), A = m.objs.filter((o) => o.t === 'spawnA').map((o) => [o.x, o.z, o.y]), B = m.objs.filter((o) => o.t === 'spawnB').map((o) => [o.x, o.z, o.y]);
    const ta = A.length ? A : RING.filter((p) => p[0] < 0 || (p[0] === 0 && p[1] < 0)).slice(0, 4), tb = B.length ? B : RING.filter((p) => p[0] > 0 || (p[0] === 0 && p[1] > 0)).slice(0, 4);
    return { ffa: [...ta, ...tb, ...RING].slice(0, 16), teams: [ta, tb] };
  },
  build(b) {
    for (const o of loadCustom().objs) {
      const [w, h, d] = dims(o), y = o.y || 0;
      if (o.t === 'box') b.solid(o.x, y, o.z, w, h, d, 'concrete');
      else if (o.t === 'wall') b.solid(o.x, y, o.z, w, h, d, 'wall');
      else if (o.t === 'plat') b.solid(o.x, y, o.z, w, h, d, 'steelRust');
      else if (o.t === 'crate') crate(b, o.x, o.z, 1.6, 1.4, y);
      else if (o.t === 'cont') container(b, o.x, o.z, w, d, ['contOrange', 'contBlue', 'contGreen'][Math.abs(Math.round(o.x + o.z)) % 3], y);
      else if (o.t === 'ramp') { const r = (o.r || 0) % 4, ax = r % 2 ? 'x' : 'z', up = r < 2; b.ramp(o.x - w / 2, o.x + w / 2, o.z - d / 2, o.z + d / 2, ax, up ? y : y + h, up ? y + h : y, 'concrete', y); }
      else if (o.t === 'spawnA' || o.t === 'spawnB') b.deco(o.x, y, o.z, 0.8, 0.04, 0.8, o.t === 'spawnA' ? 'paint' : 'roofRed');
    }
  },
};
export default custom;
