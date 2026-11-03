// "Detailed stylized" soldiers (B6).
// Each soldier is ONE SkinnedMesh (plus a cheaper far LOD sharing the same skeleton) built from rounded parts
// (lathe capsules, extruded rounded boxes, spheres) with vertex colours and one material, so a soldier costs one draw
// call. Bones keep the old group names (pose, hips, legs[].thigh/knee, torso, head, arms[].sh/el) so the animation code
// drives them directly. Geometry is cached per look (colours + style). Hands are placed on the gun with 2-bone IK.
import * as THREE from 'three';
import { G } from '../core/state.js';

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- shape helpers ----------
function capsule(r1, r2, len, rs = 10, cs = 3) { // along Y, centred, r1 at bottom
  const pts = [], L = Math.max(0.001, len - r1 - r2);
  for (let i = 0; i <= cs; i++) { const a = -Math.PI / 2 + (i / cs) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -L / 2 + Math.sin(a) * r1)); }
  for (let i = 0; i <= cs; i++) { const a = (i / cs) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r2, L / 2 + Math.sin(a) * r2)); }
  pts[0].x = 0.0001; pts[pts.length - 1].x = 0.0001;
  return new THREE.LatheGeometry(pts, rs);
}
function lathe(profile, rs = 12) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), rs); }
function rbox(w, h, d, r = 0.015, segs = 2) { // rounded box: extruded rounded rect (w x h), depth d along Z, centred
  const s = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
  s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.lineTo(x, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: segs, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}
const sphere = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);

// ---------- skeleton layout ----------
const B = { pose: 0, hips: 1, thighL: 2, kneeL: 3, thighR: 4, kneeR: 5, torso: 6, head: 7, shL: 8, elL: 9, shR: 10, elR: 11 };
const PARENT = [-1, 0, 1, 2, 1, 4, 1, 6, 6, 8, 6, 10];
const REST = [[0, 0, 0], [0, 0.86, 0], [-0.115, 0, 0], [0, -0.43, 0], [0.115, 0, 0], [0, -0.43, 0], [0, 0, 0], [0, 0.56, 0], [-0.27, 0.48, 0], [0, -0.28, 0], [0.27, 0.48, 0], [0, -0.28, 0]];
const ARM_A = 0.28, ARM_B = 0.3; // shoulder->elbow, elbow->hand centre
const restWorld = (() => { // bone -> mesh-space rest translation
  const out = [];
  for (let i = 0; i < REST.length; i++) { const p = PARENT[i] < 0 ? [0, 0, 0] : out[PARENT[i]]; out.push([p[0] + REST[i][0], p[1] + REST[i][1], p[2] + REST[i][2]]); }
  return out;
})();

// ---------- geometry assembly ----------
class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.si = []; this.sw = []; this.idx = []; }
  // geo in bone-local space via (x,y,z, rx,ry,rz, sx,sy,sz); colour hex; shade = top/bottom contrast
  add(bone, geo, hex, t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], o = {}) {
    const m = new THREE.Matrix4().compose(V3(t[0] + restWorld[bone][0], t[1] + restWorld[bone][1], t[2] + restWorld[bone][2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), V3(s[0], s[1], s[2]));
    const nm = new THREE.Matrix3().getNormalMatrix(m), g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, base = this.pos.length / 3, c = lin(hex);
    g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      let k = 1 - (o.ao ?? 0.22) * (1 - (y1 > y0 ? (v.y - y0) / (y1 - y0) : 1)); // soft contact darkening towards the bottom of each part
      if (o.noise) { const h = Math.sin(v.x * 91 + v.y * 57 + v.z * 133 + bone * 7) * 43758.5453; const f = h - Math.floor(h); if (f > 1 - o.noise[0]) k *= o.noise[1]; }
      v.applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      let cr = c.r, cg = c.g, cb = c.b;
      if (o.tint) { const h = Math.sin(i * 12.9898 + bone * 78.233) * 43758.5453; if (h - Math.floor(h) < o.tint[0]) { const t2 = lin(o.tint[1]); cr = t2.r; cg = t2.g; cb = t2.b; } }
      this.col.push(cr * k, cg * k, cb * k);
      this.si.push(bone, 0, 0, 0); this.sw.push(1, 0, 0, 0);
    }
    for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    if (g !== geo) g.dispose(); geo.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.boundingSphere = new THREE.Sphere(V3(0, 0.85, 0), 1.5);
    return g;
  }
}

// opts: uniform, accent, helmet, skin, noHelmet, style ('soldier' | 'zombie' | 'infected')
function buildBody(o, hi) {
  const b = new Builder(), RS = hi ? 12 : 6, CS = hi ? 3 : 1;
  const zombie = o.style === 'zombie', infected = o.style === 'infected', human = !zombie && !infected;
  const uni = o.uniform, acc = o.accent, skin = o.skin ?? (zombie ? 0x7f8a66 : infected ? 0x9db38a : 0xb08c70);
  const gear = 0x262c2e, boot = 0x2a2520, glove = 0x2e2c27, helm = o.helmet ?? 0x34403d;
  const torn = zombie || infected ? { noise: [0.28, 0.55] } : {};
  const dirty = zombie ? { tint: [0.12, 0x4a2a20] } : {};
  // legs
  for (const [th, kn, sd] of [[B.thighL, B.kneeL, -1], [B.thighR, B.kneeR, 1]]) {
    b.add(th, capsule(0.088, 0.104, 0.47, RS, CS), uni, [0, -0.215, 0], [0, 0, 0], [1, 1, 1.05], { ...torn, ...dirty });
    if (hi && human) b.add(th, rbox(0.07, 0.13, 0.11, 0.015, 1), gear, [sd * 0.1, -0.2, 0.0]);
    b.add(kn, capsule(0.066, 0.085, 0.42, RS, CS), uni, [0, -0.2, 0], [0, 0, 0], [1, 1, 1.05], { ...torn, ...dirty });
    if (human) b.add(kn, sphere(0.065, hi ? 8 : 5, hi ? 6 : 4), gear, [0, -0.02, -0.07], [0, 0, 0], [1.1, 1, 0.6]);
    // boot: rounded box toe + heel block + darker sole
    b.add(kn, rbox(0.13, 0.12, 0.28, hi ? 0.04 : 0.02, hi ? 2 : 1), boot, [0, -0.385, -0.045]);
    b.add(kn, rbox(0.14, 0.03, 0.3, 0.01, 1), 0x161412, [0, -0.44, -0.045], [0, 0, 0], [1, 1, 1], { ao: 0 });
    b.add(kn, cyl(0.075, 0.07, 0.12, RS), boot, [0, -0.31, 0.0]);
  }
  // pelvis / belt
  b.add(B.torso, lathe([[0, -0.02], [0.17, -0.02], [0.2, 0.06], [0.19, 0.12], [0, 0.12]], RS), uni, [0, 0, 0], [0, 0, 0], [1, 1, 0.72], torn);
  if (human || infected) b.add(B.torso, cyl(0.205, 0.205, 0.06, RS), gear, [0, 0.06, 0], [0, 0, 0], [1, 1, 0.74]);
  // chest (tapered barrel)
  b.add(B.torso, lathe([[0, 0.08], [0.19, 0.08], [0.215, 0.22], [0.235, 0.4], [0.215, 0.5], [0.13, 0.56], [0, 0.57]], RS), uni, [0, 0, 0], [0, 0, 0], [1, 1, 0.66], { ...torn, ...dirty });
  if (human) {
    // plate carrier in the team / identity colour, with mag pouches, side pouches, back pack and radio
    b.add(B.torso, rbox(0.4, 0.33, 0.07, 0.03, hi ? 2 : 1), acc, [0, 0.33, -0.15]);
    b.add(B.torso, rbox(0.4, 0.33, 0.07, 0.03, hi ? 2 : 1), acc, [0, 0.33, 0.15]);
    b.add(B.torso, rbox(0.06, 0.26, 0.3, 0.02, 1), acc, [-0.2, 0.3, 0]); b.add(B.torso, rbox(0.06, 0.26, 0.3, 0.02, 1), acc, [0.2, 0.3, 0]);
    for (const sx of [-1, 1]) b.add(B.torso, rbox(0.07, 0.04, 0.32, 0.015, 1), acc, [sx * 0.11, 0.51, 0]); // shoulder straps
    if (hi) {
      for (const x of [-0.12, 0, 0.12]) { b.add(B.torso, rbox(0.1, 0.13, 0.06, 0.018, 1), gear, [x, 0.25, -0.205]); b.add(B.torso, rbox(0.1, 0.025, 0.065, 0.008, 1), 0x1a1e20, [x, 0.322, -0.205]); }
      b.add(B.torso, rbox(0.11, 0.1, 0.09, 0.02, 1), gear, [0.2, 0.08, -0.07]); b.add(B.torso, rbox(0.11, 0.1, 0.09, 0.02, 1), gear, [-0.2, 0.08, -0.07]);
      b.add(B.torso, rbox(0.09, 0.15, 0.06, 0.015, 1), gear, [0.11, 0.42, 0.22]); // radio
      b.add(B.torso, cyl(0.005, 0.006, 0.5, 4), gear, [0.13, 0.72, 0.23], [0.12, 0, 0.05]);
    }
    b.add(B.torso, rbox(0.3, 0.3, 0.13, 0.04, hi ? 2 : 1), gear, [0, 0.3, 0.24]); // pack
  } else if (infected) {
    b.add(B.torso, cyl(0.24, 0.24, 0.05, RS), acc, [0, 0.42, 0], [0, 0, 0], [1, 1, 0.7]); // green rag band
  }
  // shoulders + neck + head
  for (const sx of [-1, 1]) b.add(B.torso, sphere(0.095, hi ? 10 : 6, hi ? 8 : 4), uni, [sx * 0.25, 0.47, 0], [0, 0, 0], [1, 0.9, 1], torn);
  b.add(B.head, cyl(0.058, 0.068, 0.12, RS), skin, [0, 0.01, 0]);
  b.add(B.head, sphere(0.122, hi ? 14 : 7, hi ? 11 : 5), skin, [0, 0.145, -0.005], [0, 0, 0], [0.98, 1.08, 1.04], zombie ? { tint: [0.15, 0x5d6648] } : {});
  if (hi) for (const sx of [-1, 1]) b.add(B.head, sphere(0.03, 6, 4), skin, [sx * 0.12, 0.14, 0.01], [0, 0, 0], [0.5, 1, 0.8]); // ears
  if (human) {
    b.add(B.head, rbox(0.17, 0.055, 0.05, 0.02, 1), 0x1c2226, [0, 0.168, -0.108]); // goggles frame
    if (hi) for (const sx of [-1, 1]) b.add(B.head, sphere(0.032, 8, 6), 0x6fa3b0, [sx * 0.042, 0.169, -0.128], [0, 0, 0], [1, 0.85, 0.45], { ao: 0 });
    b.add(B.head, sphere(0.1, hi ? 10 : 6, hi ? 6 : 4), 0x6b6450, [0, 0.055, -0.055], [0, 0, 0], [1.02, 0.5, 0.8]); // face wrap (sand scarf)
  } else {
    const eye = infected ? 0x9cff6a : 0x5a1410;
    for (const sx of [-1, 1]) b.add(B.head, sphere(0.022, 6, 4), eye, [sx * 0.042, 0.165, -0.112], [0, 0, 0], [1, 0.8, 0.5], { ao: 0 });
    b.add(B.head, rbox(0.07, 0.022, 0.03, 0.008, 1), 0x2a0f0c, [0, 0.085, -0.115], [0.2, 0, 0]); // mouth
  }
  if (!o.noHelmet && human) {
    b.add(B.head, sphere(1, hi ? 14 : 8, hi ? 7 : 4, 0, Math.PI * 2, 0, Math.PI * 0.55), helm, [0, 0.175, 0.005], [0, 0, 0], [0.158, 0.15, 0.17]);
    b.add(B.head, new THREE.TorusGeometry(0.155, 0.014, 4, hi ? 18 : 8), helm, [0, 0.19, 0.005], [Math.PI / 2, 0, 0], [1, 1.08, 1]);
    if (hi) {
      b.add(B.head, rbox(0.05, 0.045, 0.04, 0.01, 1), gear, [0, 0.29, -0.15]); // NVG mount
      for (const sx of [-1, 1]) b.add(B.head, cyl(0.045, 0.045, 0.035, 10), gear, [sx * 0.135, 0.13, 0], [0, 0, Math.PI / 2]); // ear pro
    }
  } else if (o.noHelmet) {
    b.add(B.head, sphere(0.128, hi ? 10 : 6, hi ? 5 : 3, 0, Math.PI * 2, 0, Math.PI * 0.45), zombie ? 0x3a3329 : 0x2b2620, [0, 0.16, 0.01], [0, 0, 0], [1, 1.05, 1.05], zombie ? { noise: [0.35, 0.6] } : {});
  }
  // arms (zombies: left sleeve torn off)
  for (const [sh, el, side] of [[B.shL, B.elL, -1], [B.shR, B.elR, 1]]) {
    const bare = zombie && side < 0;
    b.add(sh, capsule(0.062, 0.072, 0.3, RS, CS), uni, [0, -0.14, 0], [0, 0, 0], [1, 1, 1], { ...torn, ...dirty });
    b.add(el, capsule(0.05, 0.062, 0.28, RS, CS), bare ? skin : uni, [0, -0.13, 0], [0, 0, 0], [1, 1, 1], bare ? {} : torn);
    if (!bare && human) b.add(el, cyl(0.064, 0.064, 0.04, RS), gear, [0, -0.25, 0]); // cuff
    const hand = human ? glove : skin;
    b.add(el, sphere(0.05, hi ? 8 : 5, hi ? 6 : 4), hand, [0, -0.3, -0.01], [0, 0, 0], [0.95, 1.25, 1.1]);
    if (hi) b.add(el, sphere(0.022, 6, 4), hand, [side * -0.035, -0.29, -0.04], [0, 0, 0], [1, 1.4, 1]); // thumb
  }
  return b.geometry();
}

const cache = new Map();
function bodyGeometry(o) {
  const key = [o.uniform, o.accent, o.helmet, o.skin, !!o.noHelmet, o.style || 'soldier'].join('|');
  let c = cache.get(key);
  if (!c) { c = { hi: buildBody(o, true), lo: buildBody(o, false) }; cache.set(key, c); }
  return c;
}

// ---------- world guns (merged, vertex coloured, cached) ----------
// Gun-local: barrel along -Z, receiver at the origin. grip/fore = where the right/left hands go. hold: where the gun sits in torso space.
const GUN_DEF = {
  rifle: { grip: [0, -0.1, 0.05], fore: [0, -0.045, -0.3], hold: [0.075, 0.37, -0.24] },
  smg: { grip: [0, -0.1, 0.03], fore: [0, -0.05, -0.22], hold: [0.075, 0.37, -0.24] },
  shotgun: { grip: [0, -0.09, 0.06], fore: [0, -0.06, -0.32], hold: [0.075, 0.37, -0.24] },
  lmg: { grip: [0, -0.11, 0.06], fore: [0, -0.07, -0.26], hold: [0.08, 0.35, -0.22] },
  sniper: { grip: [0, -0.1, 0.06], fore: [0, -0.05, -0.3], hold: [0.075, 0.37, -0.24] },
  pistol: { grip: [0, -0.07, 0.03], fore: [-0.025, -0.075, 0.01], hold: [0.0, 0.36, -0.46] },
  rocket: { grip: [0, -0.11, -0.02], fore: [0, -0.1, -0.32], hold: [0.12, 0.48, -0.08] },
  knife: { grip: [0, 0, 0.0], fore: null, hold: [0.2, 0.12, -0.32] },
  none: { grip: null, fore: null, hold: [0, 0, 0] },
};
const KIND = { m4: 'rifle', ak47: 'rifle', mp5: 'smg', m870: 'shotgun', spas12: 'shotgun', m249: 'lmg', mk14: 'sniper', l96: 'sniper', barrett: 'sniper', usp: 'pistol', deagle: 'pistol', rpg: 'rocket', knife: 'knife', none: 'none' };
const gunCache = new Map();
let gunMat = null;
function gunGeometry(id) {
  if (gunCache.has(id)) return gunCache.get(id);
  const b = new Builder(), K = 0x1c1f22, D = 0x2a2f33, WD = 0x6b4a2c, TAN = 0x8a7a5a, OL = 0x4e5a36, ST = 0x9aa3a8;
  const box = (w, h, d, c, x, y, z, rx = 0) => b.add(0, rbox(w, h, d, Math.min(w, h, d) * 0.18, 1), c, [x, y, z], [rx, 0, 0], [1, 1, 1], { ao: 0.12 });
  const tube = (r, len, c, x, y, z, s = 8) => b.add(0, cyl(r, r, len, s), c, [x, y, z], [Math.PI / 2, 0, 0], [1, 1, 1], { ao: 0 });
  switch (id) {
    case 'm4': case 'ak47': {
      const ak = id === 'ak47', fc = ak ? WD : D;
      box(0.055, 0.085, 0.36, K, 0, 0, -0.04); box(0.064, 0.066, 0.24, fc, 0, -0.004, -0.33); tube(0.012, 0.2, K, 0, 0.005, -0.54); tube(0.018, 0.05, K, 0, 0.005, -0.65);
      box(0.045, 0.09, 0.22, ak ? WD : K, 0, -0.02, 0.24); box(0.04, 0.11, 0.045, K, 0, -0.085, 0.06, 0.3);
      box(0.042, 0.14, 0.065, K, 0, -0.105, -0.11, ak ? -0.45 : -0.18);
      if (!ak) { box(0.026, 0.035, 0.08, K, 0, 0.062, -0.04); box(0.008, 0.03, 0.01, K, 0, 0.06, -0.42); } else box(0.012, 0.03, 0.02, K, 0, 0.055, -0.6);
      break;
    }
    case 'mp5': box(0.05, 0.08, 0.3, K, 0, 0, -0.04); box(0.058, 0.06, 0.16, D, 0, -0.005, -0.25); tube(0.012, 0.08, K, 0, 0.005, -0.37);
      box(0.035, 0.12, 0.04, K, 0, -0.1, -0.1, -0.35); box(0.04, 0.1, 0.045, K, 0, -0.08, 0.06, 0.3); box(0.03, 0.06, 0.18, K, 0, -0.01, 0.2); break;
    case 'm870': case 'spas12':
      box(0.055, 0.08, 0.26, K, 0, 0, -0.03); tube(0.016, 0.5, K, 0, 0.012, -0.41); tube(0.014, 0.4, D, 0, -0.024, -0.37);
      box(0.06, 0.055, 0.15, id === 'm870' ? WD : K, 0, -0.03, -0.33); box(0.045, 0.1, 0.24, id === 'm870' ? WD : K, 0, -0.03, 0.22); break;
    case 'm249':
      box(0.075, 0.1, 0.42, OL, 0, 0, -0.05); box(0.07, 0.07, 0.2, K, 0, 0.0, -0.36); tube(0.016, 0.24, K, 0, 0.01, -0.56); box(0.1, 0.1, 0.12, OL, -0.07, -0.08, -0.06);
      box(0.04, 0.11, 0.045, K, 0, -0.09, 0.08, 0.3); box(0.05, 0.1, 0.22, K, 0, -0.02, 0.27);
      b.add(0, cyl(0.006, 0.006, 0.26, 4), K, [0.03, -0.1, -0.45], [0.35, 0, 0.2]); b.add(0, cyl(0.006, 0.006, 0.26, 4), K, [-0.03, -0.1, -0.45], [0.35, 0, -0.2]); break;
    case 'mk14': case 'l96': case 'barrett': {
      const bar = id === 'barrett', l96 = id === 'l96', c = l96 ? OL : bar ? D : TAN;
      box(0.06, 0.09, 0.44, c, 0, 0, -0.05); tube(bar ? 0.017 : 0.012, bar ? 0.5 : 0.42, K, 0, 0.008, bar ? -0.53 : -0.48);
      if (bar) box(0.06, 0.04, 0.09, K, 0, 0.008, -0.8); else tube(0.017, 0.05, K, 0, 0.008, -0.7);
      box(0.05, 0.11, 0.26, c, 0, -0.02, 0.28); box(0.04, 0.11, 0.045, K, 0, -0.085, 0.08, 0.3);
      box(0.045, bar ? 0.1 : 0.08, 0.08, K, 0, -0.08, -0.08);
      tube(0.02, 0.24, K, 0, 0.085, -0.05); tube(0.027, 0.05, K, 0, 0.085, -0.19); tube(0.025, 0.04, K, 0, 0.085, 0.08);
      if (bar || id === 'mk14') { b.add(0, cyl(0.006, 0.006, 0.24, 4), K, [0.03, -0.08, -0.4], [0.4, 0, 0.2]); b.add(0, cyl(0.006, 0.006, 0.24, 4), K, [-0.03, -0.08, -0.4], [0.4, 0, -0.2]); }
      break;
    }
    case 'usp': case 'deagle': { const dg = id === 'deagle';
      box(0.034, 0.04, dg ? 0.2 : 0.17, dg ? ST : K, 0, 0.02, -0.06); box(0.03, 0.03, dg ? 0.17 : 0.14, K, 0, -0.01, -0.05); box(0.032, 0.1, 0.045, K, 0, -0.06, 0.02, 0.25); break; }
    case 'rpg': tube(0.042, 1.0, OL, 0, 0, -0.1, 10); b.add(0, cyl(0.07, 0.03, 0.2, 10), OL, [0, 0, -0.68], [-Math.PI / 2, 0, 0]); box(0.035, 0.11, 0.04, K, 0, -0.08, 0.0, 0.25); box(0.035, 0.1, 0.04, K, 0, -0.08, -0.3); break;
    case 'knife': box(0.026, 0.026, 0.11, K, 0, 0, 0.02); b.add(0, rbox(0.006, 0.035, 0.17, 0.003, 1), ST, [0, 0.0, -0.11], [0, 0, 0], [1, 1, 1], { ao: 0 }); break;
    default: break;
  }
  const g = b.pos.length ? b.geometry() : null;
  if (g) g.boundingSphere = new THREE.Sphere(V3(0, 0, -0.2), 0.8);
  gunCache.set(id, g); return g;
}

// ---------- 2-bone IK (torso space) ----------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function solveArm(S, T, pole) {
  const D = T.clone().sub(S), d = Math.min(Math.max(D.length(), 0.08), ARM_A + ARM_B - 0.004), Dn = D.clone().normalize();
  const cosI = (ARM_A * ARM_A + ARM_B * ARM_B - d * d) / (2 * ARM_A * ARM_B), bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosI)));
  const H0 = V3(0, -ARM_A - ARM_B * Math.cos(bend), -ARM_B * Math.sin(bend)).normalize();
  const q1 = new THREE.Quaternion().setFromUnitVectors(H0, Dn);
  const E = V3(0, -ARM_A, 0).applyQuaternion(q1), e = E.clone().sub(Dn.clone().multiplyScalar(E.dot(Dn))), p = pole.clone().sub(Dn.clone().multiplyScalar(pole.dot(Dn)));
  let q = q1;
  if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) { const ang = Math.atan2(Dn.dot(e.clone().cross(p)), e.dot(p)); q = new THREE.Quaternion().setFromAxisAngle(Dn, ang).multiply(q1); }
  return { q, bend };
}
function computeArms(s) {
  const kind = KIND[s.gunId] || 'rifle', def = GUN_DEF[kind];
  s.gun && s.gun.position.set(def.hold[0], def.hold[1], def.hold[2]);
  const hold = V3(...def.hold), out = [null, null];
  const SL = V3(...REST[B.shL]), SR = V3(...REST[B.shR]);
  if (def.grip) out[1] = solveArm(SR, hold.clone().add(V3(...def.grip)), V3(1, -1, 0.2).normalize());
  if (def.fore) out[0] = solveArm(SL, hold.clone().add(V3(...def.fore)), V3(-0.4, -1, 0).normalize());
  s.ik = out;
}

// ---------- public API ----------
function bodyMaterial() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04, skinning: true }); }

export function makeSoldier(opts) {
  opts = { style: 'soldier', ...opts };
  const geo = bodyGeometry(opts), mat = bodyMaterial();
  const root = new THREE.Group();
  const bones = REST.map(() => new THREE.Bone());
  bones.forEach((bn, i) => { bn.position.set(...REST[i]); if (PARENT[i] >= 0) bones[PARENT[i]].add(bn); });
  const hi = new THREE.SkinnedMesh(geo.hi, mat); // far away it swaps to the cheaper geometry (same skeleton)
  hi.add(bones[0]); root.add(hi);
  root.updateMatrixWorld(true);
  hi.bind(new THREE.Skeleton(bones));
  hi.castShadow = true;
  const s = {
    root, mesh: hi, geo, far: false, opts, style: opts.style, mats: { body: mat },
    pose: bones[B.pose], hips: bones[B.hips], torso: bones[B.torso], head: bones[B.head],
    legs: [{ thigh: bones[B.thighL], knee: bones[B.kneeL] }, { thigh: bones[B.thighR], knee: bones[B.kneeR] }],
    arms: [{ sh: bones[B.shL], el: bones[B.elL] }, { sh: bones[B.shR], el: bones[B.elR] }],
    gun: null, gunId: null, flinch: 0, deathT: -1, deathDir: 1, deathType: 0, t: Math.random() * 10,
  };
  if (opts.heavy) root.scale.setScalar(1.1);
  setSoldierGun(s, opts.style === 'zombie' ? 'none' : (opts.weapon || 'm4'));
  G.scene.add(root);
  return s;
}

export function setSoldierGun(s, id) {
  if (s.gun) { s.torso.remove(s.gun); s.gun = null; }
  s.gunId = KIND[id] ? id : 'm4';
  const g = gunGeometry(s.gunId);
  if (g) {
    if (!gunMat) gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 });
    s.gun = new THREE.Mesh(g, gunMat); s.gun.castShadow = true; s.torso.add(s.gun);
  }
  computeArms(s);
}

export function setFlash(s, amount, color = 0x9a2a1c) {
  const m = s.mats.body;
  if (amount > 0) { m.emissive.setHex(color).convertSRGBToLinear(); m.emissiveIntensity = amount; } else m.emissiveIntensity = 0;
}

// Restyle in place (Infection: a soldier turns infected). Keeps bones and pose.
export function restyleSoldier(s, style, accent) {
  s.opts = { ...s.opts, style, accent: accent ?? s.opts.accent, noHelmet: style !== 'soldier' || s.opts.noHelmet };
  s.style = style;
  s.geo = bodyGeometry(s.opts);
  s.mesh.geometry = s.far ? s.geo.lo : s.geo.hi;
}

export function animateSoldier(s, u, dt) {
  if (s.deathT >= 0) { deathPose(s, u, dt); return; }
  poseSoldier(s, u, dt);
}

const FAR2 = 30 * 30;
// alive pose from a unit-like state {x,y,z,yaw,aimPitch,crouchT,moveSpeed,walkPhase} (also used by the kill cam)
export function poseSoldier(s, u, dt) {
  const r = s.root;
  r.position.set(u.x, u.y, u.z);
  r.rotation.y = u.yaw;
  lod(s);
  s.t += dt;
  const crouch = u.crouchT || 0, speed = Math.min(1.5, (u.moveSpeed || 0) / 5), run = Math.max(0, speed - 0.9) / 0.6;
  const zombie = s.style === 'zombie', infected = s.style === 'infected';
  u.walkPhase = (u.walkPhase || 0) + dt * (4 + speed * 6.5) * (speed > 0.05 ? 1 : 0);
  const ph = u.walkPhase, stride = (0.55 + run * 0.25) * speed * (1 - crouch * 0.55);
  for (let i = 0; i < 2; i++) {
    const L = s.legs[i], sgn = i ? 1 : -1, sw = Math.sin(ph) * sgn;
    const limp = zombie && i === 0 ? 0.55 : 1;
    L.thigh.rotation.set(-sw * stride * limp + crouch * 1.15, 0, 0);
    // knee bends while the leg swings forward and on contact; deeper when running or crouched
    const swing = Math.max(0, Math.sin(ph + (i ? 0 : Math.PI) + 0.6));
    L.knee.rotation.x = -(swing * (0.75 + run * 0.6) * speed + 0.06 * speed) * limp - crouch * 1.95;
  }
  s.hips.position.y = 0.86 - crouch * 0.4 + (Math.abs(Math.cos(ph)) - 0.6) * 0.035 * speed - run * 0.03;
  s.hips.rotation.y = Math.sin(ph) * 0.08 * speed;
  s.flinch = Math.max(0, s.flinch - dt * 6);
  const hunch = zombie ? -0.5 : infected ? -0.25 : 0;
  s.torso.rotation.set(hunch - crouch * 0.22 - run * 0.16 + (zombie ? 0 : (u.aimPitch || 0) * 0.75) + s.flinch * 0.35, -Math.sin(ph) * 0.1 * speed + (zombie ? Math.sin(s.t * 1.3) * 0.08 : 0), zombie ? Math.sin(s.t * 0.9) * 0.06 : 0);
  s.head.rotation.set((zombie ? 0.35 : (u.aimPitch || 0) * 0.25) - hunch * 0.5, zombie ? Math.sin(s.t * 0.7) * 0.25 : 0, zombie ? 0.18 : 0);
  s.pose.rotation.set(0, 0, 0); s.pose.position.set(0, 0, 0);
  arms(s, speed);
}

function arms(s, speed) {
  const zombie = s.style === 'zombie' || (s.style === 'infected' && !s.gun);
  if (zombie) { // reaching, swaying
    for (let i = 0; i < 2; i++) {
      const A = s.arms[i], sd = i ? 1 : -1, w = Math.sin(s.t * 2.2 + i * 1.7);
      A.sh.rotation.set(1.25 + w * 0.18, 0, sd * (0.12 + w * 0.05)); A.el.rotation.set(0.35 + Math.max(0, w) * 0.3, 0, 0);
    }
    return;
  }
  for (let i = 0; i < 2; i++) {
    const A = s.arms[i], ik = s.ik && s.ik[i];
    if (ik) { A.sh.quaternion.copy(ik.q); A.el.rotation.set(ik.bend, 0, 0); }
    else { const sw = Math.sin((s.t) * 1.5) * 0.03; A.sh.rotation.set(-0.1 + sw - speed * 0.3 * Math.sin(s.t * 6), 0, i ? 0.12 : -0.12); A.el.rotation.set(0.25, 0, 0); }
  }
  if (s.flinch > 0) s.arms[1].sh.rotateX(-s.flinch * 0.2);
}

function lod(s) {
  const c = G.camera.position, dx = c.x - s.root.position.x, dz = c.z - s.root.position.z, far = dx * dx + dz * dz > FAR2;
  if (far !== s.far) { s.far = far; s.mesh.geometry = far ? s.geo.lo : s.geo.hi; }
}

// hitFromFront: attacker was in front of the victim -> fall backwards (one of a few falls, picked at random)
export function startDeath(s, hitFromFront) {
  s.deathT = 0;
  s.deathDir = hitFromFront ? 1 : -1;
  s.deathType = Math.floor(Math.random() * 3);
  s.deathSide = Math.random() < 0.5 ? -1 : 1;
}

const ease = (t) => 1 - Math.pow(1 - t, 3);
function deathPose(s, u, dt) {
  const r = s.root;
  r.position.set(u.x, u.y, u.z); r.rotation.y = u.yaw;
  lod(s);
  s.deathT += dt;
  const T = s.deathT, dir = s.deathDir, side = s.deathSide;
  if (s.deathType === 1) { // knees buckle, then slump forward onto one side
    const k = ease(Math.min(1, T / 0.35)), f = ease(Math.min(1, Math.max(0, T - 0.25) / 0.5));
    s.legs.forEach((L) => { L.thigh.rotation.set(k * 1.3 - f * 0.9, 0, 0); L.knee.rotation.x = -k * 2.1 + f * 1.4; });
    s.hips.position.y = 0.86 - k * 0.42 + f * 0.1;
    s.pose.rotation.set(-f * 1.4, 0, side * f * 0.5); s.pose.position.y = 0;
    s.torso.rotation.set(-k * 0.5 + f * 0.2, 0, 0);
    s.arms[0].sh.rotation.set(-0.3 + f * 1.4, 0, -0.3 - f * 0.6); s.arms[1].sh.rotation.set(-0.2 + f * 1.2, 0, 0.3 + f * 0.6);
    s.arms[0].el.rotation.x = 0.4; s.arms[1].el.rotation.x = 0.6;
  } else if (s.deathType === 2) { // spun by the hit, falls sideways
    const t = ease(Math.min(1, T / 0.65));
    s.pose.rotation.set(dir * t * 0.3, side * t * 1.1, side * t * 1.45); s.pose.position.y = 0;
    s.legs[0].thigh.rotation.set(t * 0.4, 0, 0); s.legs[1].thigh.rotation.set(-t * 0.2, 0, 0); s.legs[0].knee.rotation.x = -t * 0.8; s.legs[1].knee.rotation.x = -t * 0.3;
    s.torso.rotation.set(0, side * t * 0.4, side * t * 0.2);
    s.arms[0].sh.rotation.set(t * 0.8, 0, -0.4 - t); s.arms[1].sh.rotation.set(t * 0.5, 0, 0.4 + t); s.arms[0].el.rotation.x = 0.3; s.arms[1].el.rotation.x = 0.5;
  } else { // straight back (or forward when shot from behind), arms flung
    const t = Math.min(1, T / 0.55), e = ease(t), kick = Math.sin(Math.min(1, T / 0.3) * Math.PI);
    s.pose.rotation.set(e * 1.48 * dir, 0, e * 0.22 * dir * side); s.pose.position.y = -e * 0.04;
    s.legs[0].thigh.rotation.set(-e * 0.45 * dir + kick * 0.3, 0, 0); s.legs[1].thigh.rotation.set(e * 0.3 * dir, 0, 0);
    s.legs[0].knee.rotation.x = -kick * 0.6; s.legs[1].knee.rotation.x = -e * 0.25;
    s.torso.rotation.set(e * 0.2 * dir, 0, 0);
    s.arms[0].sh.rotation.set(-e * 0.8 * dir, 0, -0.3 - e * 1.0); s.arms[1].sh.rotation.set(-e * 0.6 * dir, 0, 0.3 + e * 1.0);
    s.arms[0].el.rotation.x = 0.2 + kick * 0.5; s.arms[1].el.rotation.x = 0.3;
  }
  if (T > 2.4) r.position.y = u.y - Math.min(1.2, (T - 2.4) * 0.9);
}

export function disposeSoldier(s) {
  G.scene.remove(s.root);
  s.mats.body.dispose(); // geometry is cached and shared
}

// A standalone gun model (dropped weapons, wall-buys). Pass mat to override the colours (e.g. chalk outlines).
export function gunModel(parent, id, mat) {
  const g = new THREE.Group(); parent.add(g);
  const geo = gunGeometry(KIND[id] ? id : 'm4');
  if (geo) {
    if (!gunMat) gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 });
    const m = new THREE.Mesh(geo, mat && !mat.userData.keepVertexColors && mat.color && mat.emissive && mat.emissiveIntensity > 0 ? mat : gunMat);
    m.castShadow = true; g.add(m);
  }
  return g;
}
