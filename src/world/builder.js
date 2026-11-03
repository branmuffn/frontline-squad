import * as THREE from 'three';
import { G } from '../core/state.js';

// ---------- procedural textures ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function canvasTex(size, draw, seed = 7) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); draw(x, size, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(4, G.renderer.capabilities.getMaxAnisotropy());
  return t;
}

function speckle(x, s, r, n, maxA, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 200 + r() * 55 : r() * 60;
    x.fillStyle = `rgba(${v},${v},${v},${r() * maxA})`;
    x.fillRect(r() * s, r() * s, 1 + r() * 2.5, 1 + r() * 2.5);
  }
}

const TEX = {
  concrete: () => canvasTex(256, (x, s, r) => {
    x.fillStyle = '#b9bcbb'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { // stains
      const g = x.createRadialGradient(r() * s, r() * s, 0, r() * s, r() * s, 20 + r() * 60);
      g.addColorStop(0, `rgba(60,62,58,${0.05 + r() * 0.08})`); g.addColorStop(1, 'rgba(60,62,58,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
    speckle(x, s, r, 9000, 0.22); speckle(x, s, r, 2500, 0.18, true);
    x.strokeStyle = 'rgba(40,42,40,.28)'; x.lineWidth = 0.8;
    for (let i = 0; i < 9; i++) { let a = r() * s, b = r() * s; x.beginPath(); x.moveTo(a, b); for (let k = 0; k < 5; k++) { a += r() * 24 - 12; b += r() * 24 - 12; x.lineTo(a, b); } x.stroke(); }
    x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, s - 3, s, 3); x.fillRect(s - 3, 0, 3, s); // panel seams
  }, 11),
  metal: () => canvasTex(256, (x, s, r) => {
    x.fillStyle = '#a7adb0'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.05})`; x.fillRect(0, r() * s, s, 1); }
    speckle(x, s, r, 5000, 0.2);
    for (let i = 0; i < 18; i++) { // rust streaks
      x.fillStyle = `rgba(120,70,40,${0.06 + r() * 0.1})`; const w = 2 + r() * 8; x.fillRect(r() * s, r() * s * 0.6, w, 30 + r() * 90);
    }
    x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 8; i < s; i += 64) for (let j = 8; j < s; j += 64) { x.beginPath(); x.arc(i, j, 2, 0, 7); x.fill(); }
  }, 23),
  stripes: () => canvasTex(128, (x, s, r) => {
    for (let i = 0; i < s; i += 16) {
      const g = x.createLinearGradient(i, 0, i + 16, 0);
      g.addColorStop(0, '#8e8e8e'); g.addColorStop(0.35, '#d8d8d8'); g.addColorStop(0.6, '#bdbdbd'); g.addColorStop(1, '#7a7a7a');
      x.fillStyle = g; x.fillRect(i, 0, 16, s);
    }
    speckle(x, s, r, 1800, 0.25);
    for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(90,50,30,${0.08 + r() * 0.12})`; x.fillRect(r() * s, r() * s, 3 + r() * 10, 6 + r() * 30); }
  }, 5),
  wood: () => canvasTex(128, (x, s, r) => {
    x.fillStyle = '#c7a77c'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 32) {
      x.fillStyle = `rgba(80,55,30,${0.1 + r() * 0.12})`; x.fillRect(0, i, s, 32);
      x.fillStyle = 'rgba(40,25,10,.45)'; x.fillRect(0, i, s, 2);
      for (let k = 0; k < 12; k++) { x.fillStyle = `rgba(70,45,20,${r() * 0.18})`; x.fillRect(0, i + 3 + r() * 27, s, 1); }
    }
    speckle(x, s, r, 1200, 0.15);
  }, 9),
  sandbag: () => canvasTex(128, (x, s, r) => {
    x.fillStyle = '#c9bb98'; x.fillRect(0, 0, s, s);
    speckle(x, s, r, 3000, 0.22);
    x.strokeStyle = 'rgba(70,60,40,.45)'; x.lineWidth = 3;
    for (let row = 0; row < 4; row++) for (let col = -1; col < 3; col++) {
      const ox = col * 64 + (row % 2) * 32, oy = row * 32;
      x.beginPath(); x.roundRect ? x.roundRect(ox + 2, oy + 2, 60, 28, 12) : x.rect(ox + 2, oy + 2, 60, 28); x.stroke();
    }
  }, 3),
  plaster: () => canvasTex(256, (x, s, r) => {
    x.fillStyle = '#d9c3a0'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      const g = x.createRadialGradient(r() * s, r() * s, 0, r() * s, r() * s, 10 + r() * 50);
      g.addColorStop(0, `rgba(${r() > 0.5 ? '255,240,215' : '120,95,60'},${0.08 + r() * 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
    speckle(x, s, r, 6000, 0.16);
    x.fillStyle = 'rgba(90,70,45,.18)'; x.fillRect(0, s - 26, s, 26); // dirt band near ground
  }, 17),
  asphalt: () => canvasTex(256, (x, s, r) => {
    x.fillStyle = '#9a9c95'; x.fillRect(0, 0, s, s);
    speckle(x, s, r, 14000, 0.3); speckle(x, s, r, 4000, 0.2, true);
    for (let i = 0; i < 14; i++) {
      const g = x.createRadialGradient(r() * s, r() * s, 0, r() * s, r() * s, 15 + r() * 55);
      g.addColorStop(0, `rgba(40,40,36,${0.08 + r() * 0.12})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
  }, 31),
  sand: () => canvasTex(256, (x, s, r) => {
    x.fillStyle = '#d8bf93'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 30; i++) {
      const g = x.createRadialGradient(r() * s, r() * s, 0, r() * s, r() * s, 20 + r() * 70);
      g.addColorStop(0, `rgba(${r() > 0.5 ? '160,130,85' : '240,225,190'},${0.1 + r() * 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
    speckle(x, s, r, 9000, 0.18);
  }, 41),
  hazard: () => canvasTex(64, (x, s) => {
    x.fillStyle = '#d6aa3a'; x.fillRect(0, 0, s, s); x.fillStyle = '#1d1d1d';
    for (let i = -s; i < s * 2; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 8, 0); x.lineTo(i + 8 - s, s); x.lineTo(i - s, s); x.fill(); }
  }),
};
const texCache = {};
const tex = (k) => (texCache[k] ||= TEX[k]());

// ---------- shared materials ----------
const MAT_DEFS = {
  concrete: { color: 0x9aa0a0, map: 'concrete', uvs: 3 },
  concreteDark: { color: 0x737b7c, map: 'concrete', uvs: 3 },
  wall: { color: 0xa9b0ae, map: 'concrete', uvs: 4 },
  metal: { color: 0x5f6c73, map: 'metal', uvs: 3, metalness: 0.2, roughness: 0.68 },
  metalDark: { color: 0x3a464c, map: 'metal', uvs: 3, metalness: 0.2, roughness: 0.7 },
  steel: { color: 0x515c62, map: 'metal', uvs: 2, metalness: 0.25, roughness: 0.6 },
  black: { color: 0x1d2326, roughness: 0.8 },
  contOrange: { color: 0xb06a45, map: 'stripes', uvs: 1.1 },
  contBlue: { color: 0x456a86, map: 'stripes', uvs: 1.1 },
  contGreen: { color: 0x627352, map: 'stripes', uvs: 1.1 },
  contRed: { color: 0x87423a, map: 'stripes', uvs: 1.1 },
  contGray: { color: 0x7a8287, map: 'stripes', uvs: 1.1 },
  wood: { color: 0xa07c52, map: 'wood', uvs: 1.4 },
  woodDark: { color: 0x6b513a, map: 'wood', uvs: 1.4 },
  sand: { color: 0xb6a47c, map: 'sandbag', uvs: 1.2 },
  paint: { color: 0xd7b55c, roughness: 0.75 },
  hazard: { color: 0xffffff, map: 'hazard', uvs: 0.8 },
  lamp: { basic: true, color: 0xffe6b8 },
  redLamp: { basic: true, color: 0xff5a40 },
  groundYard: { color: 0x83877d, map: 'asphalt', uvs: 7 },
  adobe: { color: 0xd2b088, map: 'plaster', uvs: 3.5 },
  adobeDark: { color: 0xae8c64, map: 'plaster', uvs: 3.5 },
  adobeTrim: { color: 0xe6d1aa, map: 'plaster', uvs: 2 },
  teal: { color: 0x3e7473, map: 'wood', uvs: 1.4 },
  cloth1: { color: 0xa9493a, side: THREE.DoubleSide, roughness: 1 },
  cloth2: { color: 0x3f6d88, side: THREE.DoubleSide, roughness: 1 },
  cloth3: { color: 0xc8a14b, side: THREE.DoubleSide, roughness: 1 },
  trunk: { color: 0x6a5238, map: 'wood', uvs: 0.6 },
  leaf: { color: 0x5d7a39, side: THREE.DoubleSide, roughness: 0.9 },
  groundSand: { color: 0xcdb287, map: 'sand', uvs: 8 },
  rubber: { color: 0x202020, roughness: 0.95 },
  busYellow: { color: 0xd9a21e, roughness: 0.6 },
  paintWhite: { color: 0xe6e1d6, map: 'wood', uvs: 1.2 },
  sidingBlue: { color: 0x9dbccf, map: 'wood', uvs: 0.62 },
  sidingGreen: { color: 0xb3c896, map: 'wood', uvs: 0.62 },
  roofRed: { color: 0x8c4636, map: 'wood', uvs: 0.9 },
  carRed: { color: 0xa83b2e, roughness: 0.45, metalness: 0.2 },
  carTeal: { color: 0x3f8a86, roughness: 0.45, metalness: 0.2 },
  lawn: { color: 0x84a04c, map: 'sand', uvs: 5 },
  road: { color: 0x55585a, map: 'asphalt', uvs: 6 },
  mannequin: { color: 0xdcc9ad, roughness: 0.6 },
  rock: { color: 0x8a867c, map: 'concrete', uvs: 6 },
  rockDark: { color: 0x66635d, map: 'concrete', uvs: 6 },
  grass: { color: 0x6f8442, map: 'sand', uvs: 6 },
  gravel: { color: 0x8b867b, map: 'asphalt', uvs: 4 },
  boxcar: { color: 0x7a4f34, map: 'wood', uvs: 1.3 },
  steelRust: { color: 0x4f4640, map: 'metal', uvs: 2 },
  pine: { color: 0x2f4a2c, roughness: 0.95 },
  bark: { color: 0x4d3c2c, map: 'wood', uvs: 0.7 },
  water: { color: 0x3f6466, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.78, noShadow: true },
  skyline: { color: 0x56636c, noShadow: true },
  skylineDesert: { color: 0xb49a78, noShadow: true },
};
const matCache = {};
export function material(key) {
  if (matCache[key]) return matCache[key];
  const d = MAT_DEFS[key];
  if (!d) throw new Error('Unknown material ' + key);
  let m;
  if (d.basic) m = new THREE.MeshBasicMaterial({ color: d.color });
  else m = new THREE.MeshStandardMaterial({ color: d.color, roughness: d.roughness ?? 0.9, metalness: d.metalness ?? 0, side: d.side ?? THREE.FrontSide });
  m.color.convertSRGBToLinear(); // r128 treats hex colours as linear; convert so they match the design values
  m.vertexColors = true; m.envMapIntensity = d.metalness ? 0.6 : 0.22;
  if (d.transparent) { m.transparent = true; m.opacity = d.opacity; m.depthWrite = false; }
  if (d.map) m.map = tex(d.map);
  m.userData.uvs = d.uvs || 3;
  m.userData.noShadow = !!d.noShadow;
  return (matCache[key] = m);
}

// Box faces: [normal, u, v] with u x v = normal (CCW winding)
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

// World-space triangle soup (flat array, 9 numbers per triangle) of a geometry under a matrix
export function geomTris(g, m) {
  const p = g.attributes.position, out = [], v = new THREE.Vector3();
  const n = g.index ? g.index.count : p.count;
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, g.index ? g.index.getX(i) : i).applyMatrix4(m); out.push(v.x, v.y, v.z); }
  return out;
}
// Ray-only collider: AABB for the broad phase plus outward planes [nx, ny, nz, d] (inside: n·p <= d)
function hullCollider(tris, mat, floor) {
  const b = bboxOf([[...Array(tris.length / 3)].map((_, i) => tris.slice(i * 3, i * 3 + 3))]), planes = [];
  const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
  for (let i = 0; i < tris.length; i += 9) {
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
    const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
    let d = nx * tris[i] + ny * tris[i + 1] + nz * tris[i + 2];
    if (nx * cx + ny * cy + nz * cz > d) { nx = -nx; ny = -ny; nz = -nz; d = -d; }
    if (!planes.some((p) => p[0] * nx + p[1] * ny + p[2] * nz > 0.9999 && Math.abs(p[3] - d) < 1e-3)) planes.push([nx, ny, nz, d]);
  }
  if (floor !== undefined) { planes.push([0, -1, 0, -floor]); b[1] = Math.max(b[1], floor); }
  return { minX: b[0], maxX: b[3], minY: b[1], maxY: b[4], minZ: b[2], maxZ: b[5], mat, pass: false, rayOnly: true, hull: planes, tris };
}
function clipAll(polys, ax, val, keepGreater) {
  const out = [];
  for (const poly of polys) {
    const r = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ia = keepGreater ? a[ax] >= val : a[ax] <= val, ib = keepGreater ? b[ax] >= val : b[ax] <= val;
      if (ia) r.push(a);
      if (ia !== ib) { const t = (val - a[ax]) / (b[ax] - a[ax]); r.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    if (r.length >= 3) out.push(r);
  }
  return out;
}
function bboxOf(polys) {
  if (!polys.length) return null;
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const q of poly) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); }
  return b;
}

export class MapBuilder {
  constructor() {
    this.batches = new Map();
    this.colliders = [];
    this.ramps = [];
    this.lights = [];
    this.group = new THREE.Group();
  }
  batch(key) {
    let b = this.batches.get(key);
    if (!b) { b = { pos: [], nor: [], uv: [], col: [], idx: [], mat: material(key) }; this.batches.set(key, b); }
    return b;
  }
  _box(x, y0, z, w, h, d, matKey, rot = 0) {
    const b = this.batch(matKey), uvs = b.mat.userData.uvs;
    const hx = w / 2, hy = h / 2, hz = d / 2, cy = y0 + hy;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (const [n, u, v] of FACES) {
      const en = Math.abs(n[0]) * hx + Math.abs(n[1]) * hy + Math.abs(n[2]) * hz;
      const eu = Math.abs(u[0]) * hx + Math.abs(u[1]) * hy + Math.abs(u[2]) * hz;
      const ev = Math.abs(v[0]) * hx + Math.abs(v[1]) * hy + Math.abs(v[2]) * hz;
      const base = b.pos.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = n[0] * en + u[0] * eu * su + v[0] * ev * sv;
        const ly = n[1] * en + u[1] * eu * su + v[1] * ev * sv;
        const lz = n[2] * en + u[2] * eu * su + v[2] * ev * sv;
        b.pos.push(x + lx * cs + lz * sn, cy + ly, z - lx * sn + lz * cs);
        { const rel = ly + hy, k = n[1] < 0 ? 0.62 : 0.6 + 0.4 * Math.min(1, rel / 1.3) ** 0.7; b.col.push(k, k, k); }
        b.nor.push(n[0] * cs + n[2] * sn, n[1], -n[0] * sn + n[2] * cs);
        const wx = lx + x, wy = ly + cy, wz = lz + z; // unrotated world-ish coords for continuous texturing
        b.uv.push((wx * u[0] + wy * u[1] + wz * u[2]) / uvs, (wx * v[0] + wy * v[1] + wz * v[2]) / uvs);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  // Visual + collider. o: {rot, mat (impact material), pass}
  solid(x, y0, z, w, h, d, matKey, o = {}) {
    this._box(x, y0, z, w, h, d, matKey, o.rot || 0);
    this.col(x, y0, z, w, h, d, o.mat || impactMat(matKey), o);
    return this;
  }
  deco(x, y0, z, w, h, d, matKey, o = {}) { this._box(x, y0, z, w, h, d, matKey, o.rot || 0); return this; }
  col(x, y0, z, w, h, d, mat = 'concrete', o = {}) {
    if (o.rot && Math.abs(Math.sin(o.rot * 2)) > 0.02) { // rotated box: several tight AABBs instead of one inflated one
      const g = new THREE.BoxGeometry(w, h, d), m = new THREE.Matrix4().makeRotationY(o.rot).setPosition(x, y0 + h / 2, z);
      return this.colFit(geomTris(g, m), mat, 1, Math.max(2, Math.ceil(Math.max(w, d) / 0.9)), { pass: o.pass, floor: y0, oneAxis: true, hull: true });
    }
    let hw = w / 2, hd = d / 2;
    if (o.rot) { const c = Math.abs(Math.cos(o.rot)), s = Math.abs(Math.sin(o.rot)); [hw, hd] = [hw * c + hd * s, hw * s + hd * c]; }
    this.colliders.push({ minX: x - hw, maxX: x + hw, minY: y0, maxY: y0 + h, minZ: z - hd, maxZ: z + hd, mat, pass: !!o.pass });
    return this;
  }
  // Merge an arbitrary THREE geometry with transform
  geom(geometry, matKey, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const g = geometry.index ? geometry : geometry; const nm = new THREE.Matrix3().getNormalMatrix(m);
    this.lastTris = geomTris(g, m);
    const b = this.batch(matKey), base = b.pos.length / 3;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); b.pos.push(v.x, v.y, v.z); b.col.push(1, 1, 1);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); b.nor.push(v.x, v.y, v.z);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) b.idx.push(base + i);
    geometry.dispose();
    return this;
  }
  // Tight colliders for a convex shape (world-space triangles): slice into `layers` along y and a grid over x/z; each cell gets the exact AABB of (shape ∩ cell), so no box corner sticks far past the visible surface.
  colFit(tris, mat, layers = 2, strips = 2, o = {}) {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < tris.length; i += 3) { y0 = Math.min(y0, tris[i]); y1 = Math.max(y1, tris[i]); }
    if (o.floor !== undefined) y0 = Math.max(y0, o.floor);
    const polys = []; for (let i = 0; i < tris.length; i += 9) polys.push([tris.slice(i, i + 3), tris.slice(i + 3, i + 6), tris.slice(i + 6, i + 9)]);
    for (let L = 0; L < layers; L++) {
      const ya = y0 + (y1 - y0) * L / layers, yb = y0 + (y1 - y0) * (L + 1) / layers;
      const lp = clipAll(clipAll(polys, 1, ya, true), 1, yb, false), lb = bboxOf(lp);
      if (!lb) continue;
      // grid over x and z: `strips` cells on the longer axis, proportionally fewer on the shorter (just 1 with o.oneAxis)
      const ex = lb[3] - lb[0], ez = lb[5] - lb[2];
      const nx = ex >= ez ? strips : o.oneAxis ? 1 : Math.max(1, Math.round(strips * ex / ez)), nz = ez > ex ? strips : o.oneAxis ? 1 : Math.max(1, Math.round(strips * ez / ex));
      for (let I = 0; I < nx; I++) {
        const sp = clipAll(clipAll(lp, 0, lb[0] + ex * I / nx, true), 0, lb[0] + ex * (I + 1) / nx, false);
        if (!sp.length) continue;
        for (let K = 0; K < nz; K++) {
          const bb = bboxOf(nz === 1 ? sp : clipAll(clipAll(sp, 2, lb[2] + ez * K / nz, true), 2, lb[2] + ez * (K + 1) / nz, false));
          if (!bb || bb[3] - bb[0] < 0.02 || bb[5] - bb[2] < 0.02 || bb[4] - bb[1] < 0.02) continue;
          this.colliders.push({ minX: bb[0], maxX: bb[3], minY: L === 0 && o.floor !== undefined ? o.floor : bb[1], maxY: bb[4], minZ: bb[2], maxZ: bb[5], mat, pass: !!o.pass, noRay: !!o.hull });
        }
      }
    }
    // bullets and line of sight test the exact convex hull; the boxes above only handle movement
    if (o.hull) this.colliders.push(hullCollider(tris, mat, o.floor));
    return this;
  }
  quad(a, b2, c, d, matKey, center) {
    const b = this.batch(matKey), uvs = b.mat.userData.uvs, base = b.pos.length / 3;
    const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let pts = [a, b2, c, d];
    if (center) {
      const fx = (a[0] + c[0]) / 2 - center[0], fy = (a[1] + c[1]) / 2 - center[1], fz = (a[2] + c[2]) / 2 - center[2];
      if (fx * nx + fy * ny + fz * nz < 0) { pts = [a, d, c, b2]; nx = -nx; ny = -ny; nz = -nz; }
    }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (const p of pts) {
      b.pos.push(p[0], p[1], p[2]); b.nor.push(nx, ny, nz); b.col.push(1, 1, 1);
      if (ay >= ax && ay >= az) b.uv.push(p[0] / uvs, p[2] / uvs); else if (ax >= az) b.uv.push(p[2] / uvs, p[1] / uvs); else b.uv.push(p[0] / uvs, p[1] / uvs);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Solid sloped wedge (walkable). axis 'z': surface goes from height `from` at minZ to `to` at maxZ.
  ramp(minX, maxX, minZ, maxZ, axis, from, to, matKey, base = 0) {
    const rp = { minX, maxX, minZ, maxZ, axis, from, to, base, mat: impactMat(matKey) };
    this.ramps.push(rp);
    const P = (x, z) => { const t = axis === 'z' ? (z - minZ) / (maxZ - minZ) : (x - minX) / (maxX - minX); return from + (to - from) * t; };
    const c = [(minX + maxX) / 2, base + (Math.max(from, to) - base) / 3, (minZ + maxZ) / 2];
    const top = [[minX, P(minX, minZ), minZ], [maxX, P(maxX, minZ), minZ], [maxX, P(maxX, maxZ), maxZ], [minX, P(minX, maxZ), maxZ]];
    this.quad(top[0], top[1], top[2], top[3], matKey, c);
    const bot = top.map((p) => [p[0], base, p[2]]);
    const sides = [[0, 1], [1, 2], [2, 3], [3, 0]];
    for (const [i, j] of sides) if (top[i][1] - base > 0.01 || top[j][1] - base > 0.01) this.quad(bot[i], bot[j], top[j], top[i], matKey, c);
    return rp;
  }
  // Visual staircase with a smooth ramp collider underneath
  stairs(minX, maxX, minZ, maxZ, axis, from, to, matKey, steps = 0) {
    const len = axis === 'z' ? maxZ - minZ : maxX - minX, rise = Math.abs(to - from);
    steps = steps || Math.max(4, Math.round(rise / 0.26));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const hTop = from + (to - from) * (from < to ? t1 : t0);
      const h = Math.max(0.05, hTop);
      if (axis === 'z') this._box((minX + maxX) / 2, 0, minZ + len * (t0 + t1) / 2, maxX - minX, h, len / steps, matKey);
      else this._box(minX + len * (t0 + t1) / 2, 0, (minZ + maxZ) / 2, len / steps, h, maxZ - minZ, matKey);
    }
    const rp = { minX, maxX, minZ, maxZ, axis, from, to, base: 0, mat: impactMat(matKey) };
    this.ramps.push(rp);
    return rp;
  }
  light(x, y, z, color, intensity, distance) { this.lights.push({ x, y, z, color, intensity, distance }); return this; }

  finalize(shadows) {
    for (const [key, b] of this.batches) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, b.mat);
      mesh.name = 'static_' + key;
      mesh.castShadow = shadows && !b.mat.userData.noShadow && !b.mat.isMeshBasicMaterial;
      mesh.receiveShadow = !b.mat.isMeshBasicMaterial && !b.mat.userData.noShadow;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.group.add(mesh);
    }
    for (const l of this.lights) {
      const p = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
      p.position.set(l.x, l.y, l.z);
      this.group.add(p);
    }
    return this.group;
  }
}

export function impactMat(matKey) {
  if (/^cont|metal|steel|black|hazard|bus|car/.test(matKey)) return 'metal';
  if (/wood|teal|trunk|siding|paint|boxcar|bark|roof/.test(matKey)) return 'wood';
  if (/sand$|^sand|lawn|grass|gravel/.test(matKey)) return 'sand';
  if (matKey === 'water') return 'water';
  if (/adobe|plaster/.test(matKey)) return 'adobe';
  return 'concrete';
}

// Soft drifting cloud layer (one transparent plane)
export function makeClouds(tint = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const cx = r() * 256, cy = r() * 256, rad = 18 + r() * 46, g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.22 + r() * 0.25) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { x.save(); x.translate(ox, oy); x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); x.restore(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ map: t, color: tint, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  m.rotation.x = Math.PI / 2; m.position.y = 95; m.renderOrder = -9; m.name = 'clouds';
  return m;
}

export function makeSky(top, horizon, bottom) {
  const g = new THREE.SphereGeometry(190, 24, 14);
  const col = [], p = g.attributes.position, c = new THREE.Color(), ct = new THREE.Color(top), ch = new THREE.Color(horizon), cb = new THREE.Color(bottom);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 190;
    if (y > 0) c.copy(ch).lerp(ct, Math.pow(y, 0.6)); else c.copy(ch).lerp(cb, Math.min(1, -y * 3));
    c.convertSRGBToLinear(); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  return m;
}

export function makeGround(size, matKey) {
  const g = new THREE.PlaneGeometry(size, size, 1, 1);
  const m = material(matKey), uvs = m.userData.uvs;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / uvs, uv.getY(i) * size / uvs);
  const mesh = new THREE.Mesh(g, m);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
  mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true;
  return mesh;
}
