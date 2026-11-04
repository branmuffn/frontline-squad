import * as THREE from 'three';
import { G } from '../core/state.js';
import { CAMOS, WEAPONS } from '../core/config.js';
import { damp, clamp } from '../core/util.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const M = {};
let root, models = {}, flash, shells = [], shellI = 0, grenadeHand;
const vm = { swayX: 0, swayY: 0, kick: 0, kickRot: 0, land: 0, flashUntil: 0 };

function mats() {
  M.black = new THREE.MeshStandardMaterial({ color: 0x2c3135, roughness: 0.36, metalness: 0.45 });
  M.poly = new THREE.MeshStandardMaterial({ color: 0x1e2123, roughness: 0.78, metalness: 0.05 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x2c3236, roughness: 0.6, metalness: 0.3 });
  M.glove = new THREE.MeshStandardMaterial({ color: 0x2e2c27, roughness: 0.95 });
  M.sleeve = new THREE.MeshStandardMaterial({ color: 0x3b4430, roughness: 0.95 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xc9cfd2, roughness: 0.25, metalness: 0.7 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc9a046, roughness: 0.35, metalness: 0.7 });
  M.olive = new THREE.MeshStandardMaterial({ color: 0x4e5a36, roughness: 0.8 });
  M.dot = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  M.lens = new THREE.MeshBasicMaterial({ color: 0x0c1418 });
  M.camo = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.35 });
  M.port = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  for (const k in M) M[k].color.convertSRGBToLinear();
}

function camoTexture(c) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = c.base; x.fillRect(0, 0, 128, 128);
  let s = 99; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const col of c.spots) for (let i = 0; i < 14; i++) {
    x.fillStyle = col; x.beginPath();
    const cx = r() * 128, cy = r() * 128, rad = 6 + r() * 16;
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283, rr = rad * (0.6 + r() * 0.6); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7); }
    x.fill();
  }
  for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.12})`; x.fillRect(r() * 128, r() * 128, 1, 1); }
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function setCamo(id) {
  const c = CAMOS.find((q) => q.id === id) || CAMOS[0];
  if (M.camo.map) M.camo.map.dispose();
  M.camo.map = c.spots.length ? camoTexture(c) : null;
  M.camo.color.set(c.spots.length ? 0xffffff : c.base).convertSRGBToLinear();
  M.camo.metalness = c.metal ? 0.85 : 0.35; M.camo.roughness = c.metal ? 0.25 : 0.55;
  M.camo.needsUpdate = true;
}

// Bevelled box (B6): rounded edges catch the light; tiny parts stay plain boxes. Cached per size.
const RB = new Map();
function rboxGeo(w, h, d) {
  const k = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}`;
  let g = RB.get(k);
  if (!g) {
    const r = Math.min(0.006, Math.min(w, h, d) * 0.22), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r, s = new THREE.Shape();
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.lineTo(x, y);
    g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals();
    // planar UVs from position so camo textures tile evenly
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) + p.getX(i)) * 6, p.getY(i) * 6);
    RB.set(k, g);
  }
  return g;
}
function b(g, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  if (Math.min(w, h, d) >= 0.014) { const m = new THREE.Mesh(rboxGeo(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; }
  const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
function cyl(g, mat, r, len, x, y, z, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18, 1, open), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
}

function trigger(g, z, y = -0.05) {
  b(g, M.black, 0.006, 0.006, 0.075, 0, y - 0.03, z); b(g, M.black, 0.006, 0.03, 0.006, 0, y - 0.015, z - 0.035); // guard
  b(g, M.steel, 0.005, 0.022, 0.006, 0, y - 0.012, z + 0.005, 0.25); // trigger
}
function hands(g, grip, fore, twoHandGrip = false) {
  // right hand on the grip, forearm toward bottom-right of screen
  b(g, M.glove, 0.055, 0.085, 0.07, grip[0] + 0.012, grip[1] - 0.01, grip[2] + 0.005);
  for (let i = 0; i < 3; i++) b(g, M.glove, 0.05, 0.018, 0.03, grip[0] - 0.012, grip[1] - 0.03 - i * 0.022, grip[2] - 0.03, 0, 0, -0.2);
  b(g, M.glove, 0.022, 0.06, 0.022, grip[0] - 0.022, grip[1] + 0.02, grip[2] - 0.01, 0, 0, 0.5);
  b(g, M.sleeve, 0.075, 0.075, 0.34, grip[0] + 0.07, grip[1] - 0.08, grip[2] + 0.2, -0.35, 0.32, 0);
  if (twoHandGrip) {
    b(g, M.glove, 0.05, 0.075, 0.075, grip[0] - 0.032, grip[1] - 0.005, grip[2] - 0.01, 0, 0, 0.2);
    b(g, M.sleeve, 0.075, 0.075, 0.34, grip[0] - 0.11, grip[1] - 0.09, grip[2] + 0.18, -0.35, -0.5, 0);
  } else if (fore) {
    b(g, M.glove, 0.06, 0.06, 0.09, fore[0] - 0.01, fore[1] - 0.035, fore[2]);
    b(g, M.sleeve, 0.075, 0.075, 0.38, fore[0] - 0.12, fore[1] - 0.1, fore[2] + 0.17, -0.25, -0.62, 0);
  }
}

function dotSight(g, z) {
  b(g, M.black, 0.035, 0.022, 0.07, 0, 0.068, z);
  const tube = cyl(g, M.black, 0.019, 0.045, 0, 0.1, z, true); tube.material = M.black.clone(); tube.material.side = THREE.DoubleSide;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0019, 6, 6), M.dot); dot.position.set(0, 0.1, z - 0.03); g.add(dot);
  return new THREE.Vector3(0, 0.1, z);
}

function build() {
  // ---- M4A1 ----
  let g = new THREE.Group(); let mag;
  b(g, M.camo, 0.06, 0.09, 0.32, 0, 0, -0.1);
  b(g, M.camo, 0.068, 0.075, 0.3, 0, -0.004, -0.4);
  cyl(g, M.black, 0.011, 0.2, 0, -0.004, -0.64); cyl(g, M.black, 0.016, 0.05, 0, -0.004, -0.76);
  b(g, M.camo, 0.05, 0.085, 0.22, 0, -0.022, 0.17); cyl(g, M.black, 0.016, 0.14, 0, 0.005, 0.07);
  b(g, M.black, 0.04, 0.1, 0.05, 0, -0.09, 0.0, 0.3);
  mag = b(g, M.black, 0.045, 0.16, 0.07, 0, -0.12, -0.17, 0.15);
  b(g, M.black, 0.03, 0.014, 0.4, 0, 0.052, -0.2);
  b(g, M.black, 0.012, 0.035, 0.012, 0, 0.065, -0.52);
  for (let i = 0; i < 16; i++) b(g, M.black, 0.034, 0.008, 0.012, 0, 0.062, -0.37 + i * 0.022);
  b(g, M.port, 0.004, 0.025, 0.07, 0.031, 0.012, -0.08); b(g, M.black, 0.012, 0.012, 0.03, 0.032, 0.028, -0.02);
  b(g, M.black, 0.03, 0.012, 0.06, 0, 0.052, 0.03); b(g, M.black, 0.006, 0.03, 0.06, 0, -0.065, -0.04);
  for (let i = 0; i < 4; i++) b(g, M.port, 0.004, 0.01, 0.035, 0.035, -0.004, -0.33 - i * 0.05);
  let sight = dotSight(g, -0.13);
  trigger(g, -0.035);
  hands(g, [0, -0.09, 0.0], [-0.0, -0.03, -0.42]);
  models.m4 = { g, mag, sight, muzzle: new THREE.Vector3(0, -0.004, -0.8), port: new THREE.Vector3(0.035, 0.015, -0.07), hip: new THREE.Vector3(0.19, -0.215, -0.4), adsDist: 0.44 };

  // ---- MP5 ----
  g = new THREE.Group();
  b(g, M.camo, 0.058, 0.095, 0.36, 0, 0, -0.12);
  b(g, M.black, 0.072, 0.07, 0.16, 0, -0.01, -0.36);
  cyl(g, M.black, 0.012, 0.08, 0, 0, -0.48);
  b(g, M.black, 0.045, 0.07, 0.16, 0, -0.02, 0.16); b(g, M.black, 0.02, 0.06, 0.14, 0, -0.02, 0.27);
  b(g, M.black, 0.04, 0.1, 0.05, 0, -0.09, -0.02, 0.3);
  mag = b(g, M.black, 0.035, 0.16, 0.06, 0, -0.12, -0.2, 0.32);
  sight = dotSight(g, -0.13);
  trigger(g, -0.055, -0.050);
  hands(g, [0, -0.09, -0.02], [0, -0.03, -0.37]);
  models.mp5 = { g, mag, sight, muzzle: new THREE.Vector3(0, 0, -0.53), port: new THREE.Vector3(0.033, 0.02, -0.1), hip: new THREE.Vector3(0.18, -0.205, -0.38), adsDist: 0.42 };

  // ---- M870 ----
  g = new THREE.Group();
  b(g, M.camo, 0.06, 0.085, 0.25, 0, 0, -0.05);
  cyl(g, M.black, 0.014, 0.56, 0, 0.012, -0.44); cyl(g, M.black, 0.012, 0.46, 0, -0.025, -0.4);
  const pump = b(g, M.wood, 0.062, 0.058, 0.18, 0, -0.03, -0.36);
  b(g, M.wood, 0.05, 0.1, 0.3, 0, -0.03, 0.22, -0.12); b(g, M.black, 0.04, 0.09, 0.05, 0, -0.08, 0.06, 0.4);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), M.brass); bead.position.set(0, 0.03, -0.71); g.add(bead);
  b(g, M.black, 0.006, 0.012, 0.03, 0, 0.048, -0.02);
  trigger(g, 0.015, -0.040);
  hands(g, [0, -0.08, 0.05], [0, -0.03, -0.36]);
  models.m870 = { g, mag: null, pump, pumpAction: true, sight: new THREE.Vector3(0, 0.032, -0.71), muzzle: new THREE.Vector3(0, 0.012, -0.73), port: new THREE.Vector3(0.033, 0.01, -0.04), hip: new THREE.Vector3(0.17, -0.2, -0.36), adsDist: 0.42 };

  // ---- L96A1 ----
  g = new THREE.Group();
  b(g, M.camo, 0.064, 0.09, 0.42, 0, 0, -0.06);
  cyl(g, M.black, 0.012, 0.58, 0, 0.005, -0.55); cyl(g, M.black, 0.017, 0.07, 0, 0.005, -0.85);
  b(g, M.olive, 0.06, 0.14, 0.32, 0, -0.04, 0.27); b(g, M.olive, 0.045, 0.1, 0.06, 0, -0.08, 0.06, 0.35);
  cyl(g, M.black, 0.02, 0.3, 0, 0.09, -0.08); cyl(g, M.black, 0.027, 0.07, 0, 0.09, -0.25); cyl(g, M.black, 0.024, 0.06, 0, 0.09, 0.08);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), M.lens); lens.position.set(0, 0.09, 0.111); g.add(lens);
  const bolt = b(g, M.steel, 0.06, 0.016, 0.016, 0.04, 0.02, 0.06);
  mag = b(g, M.black, 0.04, 0.07, 0.08, 0, -0.07, -0.1);
  trigger(g, 0.025, -0.040);
  hands(g, [0, -0.08, 0.06], [0, -0.04, -0.34]);
  models.l96 = { g, mag, bolt, sight: new THREE.Vector3(0, 0.09, -0.08), muzzle: new THREE.Vector3(0, 0.005, -0.9), port: new THREE.Vector3(0.035, 0.02, 0.0), hip: new THREE.Vector3(0.17, -0.21, -0.36), adsDist: 0.25, scope: true };

  // ---- USP ----
  g = new THREE.Group();
  const slide = b(g, M.camo, 0.036, 0.04, 0.19, 0, 0.022, -0.08);
  b(g, M.black, 0.034, 0.032, 0.17, 0, -0.01, -0.075);
  b(g, M.black, 0.034, 0.11, 0.052, 0, -0.065, 0.0, 0.25);
  mag = b(g, M.dark, 0.028, 0.05, 0.04, 0, -0.12, 0.016, 0.25);
  b(g, M.black, 0.005, 0.01, 0.006, 0, 0.047, -0.165);
  b(g, M.black, 0.01, 0.01, 0.006, -0.009, 0.046, 0.005); b(g, M.black, 0.01, 0.01, 0.006, 0.009, 0.046, 0.005);
  hands(g, [0, -0.06, 0.01], null, true);
  models.usp = { g, mag, slide, sight: new THREE.Vector3(0, 0.051, -0.165), muzzle: new THREE.Vector3(0, 0.022, -0.19), port: new THREE.Vector3(0.025, 0.03, -0.06), hip: new THREE.Vector3(0.13, -0.17, -0.36), adsDist: 0.36 };

  // ---- Knife ----
  g = new THREE.Group();
  b(g, M.black, 0.028, 0.032, 0.11, 0, 0, 0.0);
  b(g, M.dark, 0.055, 0.012, 0.012, 0, 0, -0.06);
  b(g, M.steel, 0.007, 0.034, 0.18, 0, 0.004, -0.15);
  b(g, M.steel, 0.006, 0.02, 0.05, 0, 0.012, -0.255, 0.4);
  b(g, M.glove, 0.06, 0.085, 0.08, 0.005, -0.01, 0.01);
  b(g, M.sleeve, 0.075, 0.075, 0.34, 0.06, -0.07, 0.2, -0.35, 0.3, 0);
  models.knife = { g, sight: new THREE.Vector3(0, 0, -0.1), muzzle: new THREE.Vector3(0, 0, -0.3), hip: new THREE.Vector3(0.16, -0.17, -0.34), adsDist: 0.4, melee: true };


  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // ---- AK-47 ----
  g = new THREE.Group();
  b(g, M.camo, 0.054, 0.07, 0.36, 0, -0.008, -0.12); // receiver (top kept well below the sight line)
  b(g, M.wood, 0.066, 0.07, 0.24, 0, -0.008, -0.42);
  cyl(g, M.black, 0.011, 0.26, 0, 0.01, -0.66);
  b(g, M.black, 0.026, 0.022, 0.2, 0, 0.045, -0.42);
  b(g, M.black, 0.007, 0.03, 0.01, 0, 0.07, -0.62);
  b(g, M.black, 0.03, 0.012, 0.03, 0, 0.05, -0.2); b(g, M.black, 0.009, 0.026, 0.012, -0.009, 0.068, -0.2); b(g, M.black, 0.009, 0.026, 0.012, 0.009, 0.068, -0.2); // rear sight leaf with a notch (ADS looks through it)
  b(g, M.wood, 0.05, 0.09, 0.26, 0, -0.03, 0.18, -0.1);
  b(g, M.wood, 0.04, 0.1, 0.05, 0, -0.09, 0.0, 0.3);
  mag = b(g, M.black, 0.045, 0.18, 0.075, 0, -0.13, -0.2, 0.35);
  b(mag, M.black, 0.044, 0.09, 0.075, 0, -0.112, -0.019, 0.35); // lower curve of the banana mag (was sized in metres: a 1 m slab under the gun)
  for (let i = 0; i < 4; i++) b(g, M.black, 0.03, 0.004, 0.008, 0, 0.029, -0.06 + i * 0.05); // dust-cover ribs, flush with the receiver
  b(g, M.port, 0.004, 0.022, 0.08, 0.03, 0.015, -0.1); b(g, M.black, 0.03, 0.035, 0.03, 0, 0.045, -0.62);
  trigger(g, -0.035, -0.050);
  hands(g, [0, -0.09, 0.0], [0, -0.04, -0.42]);
  models.ak47 = { g, mag, sight: V(0, 0.088, -0.62), muzzle: V(0, 0.01, -0.8), port: V(0.035, 0.015, -0.08), hip: V(0.19, -0.215, -0.4), adsDist: 0.66 };

  // ---- M249 ----
  g = new THREE.Group();
  b(g, M.camo, 0.075, 0.11, 0.42, 0, 0, -0.1);
  b(g, M.black, 0.07, 0.08, 0.22, 0, -0.01, -0.42);
  cyl(g, M.black, 0.013, 0.34, 0, 0, -0.68); cyl(g, M.black, 0.018, 0.06, 0, 0, -0.86);
  b(g, M.black, 0.055, 0.1, 0.24, 0, -0.03, 0.2);
  b(g, M.black, 0.04, 0.1, 0.05, 0, -0.1, 0.02, 0.3);
  mag = b(g, M.olive, 0.09, 0.11, 0.13, -0.078, -0.07, -0.14);
  b(g, M.black, 0.012, 0.012, 0.26, 0.022, -0.05, -0.56); b(g, M.black, 0.012, 0.012, 0.26, -0.022, -0.05, -0.56);
  sight = dotSight(g, -0.18);
  trigger(g, -0.015, -0.060);
  hands(g, [0, -0.1, 0.02], [0, -0.05, -0.42]);
  models.m249 = { g, mag, sight, muzzle: V(0, 0, -0.9), port: V(0.04, 0.02, -0.08), hip: V(0.2, -0.235, -0.42), adsDist: 0.46 };

  // ---- Desert Eagle ----
  g = new THREE.Group();
  const dslide = b(g, M.camo, 0.042, 0.05, 0.22, 0, 0.026, -0.095);
  b(g, M.black, 0.04, 0.035, 0.18, 0, -0.012, -0.08);
  b(g, M.black, 0.04, 0.12, 0.058, 0, -0.07, 0.0, 0.22);
  mag = b(g, M.dark, 0.032, 0.05, 0.045, 0, -0.13, 0.018, 0.22);
  b(g, M.black, 0.006, 0.012, 0.006, 0, 0.057, -0.195);
  b(g, M.black, 0.009, 0.01, 0.006, -0.01, 0.056, 0.005); b(g, M.black, 0.009, 0.01, 0.006, 0.01, 0.056, 0.005);
  hands(g, [0, -0.065, 0.01], null, true);
  models.deagle = { g, mag, slide: dslide, sight: V(0, 0.063, -0.195), muzzle: V(0, 0.026, -0.21), port: V(0.025, 0.035, -0.06), hip: V(0.14, -0.18, -0.38), adsDist: 0.4 };

  // ---- SPAS-12 ----
  g = new THREE.Group();
  b(g, M.camo, 0.065, 0.1, 0.3, 0, 0, -0.06);
  cyl(g, M.black, 0.015, 0.5, 0, 0.015, -0.45); cyl(g, M.black, 0.013, 0.42, 0, -0.03, -0.41);
  for (let i = 0; i < 5; i++) b(g, M.black, 0.072, 0.066, 0.025, 0, -0.03, -0.28 - i * 0.04);
  b(g, M.black, 0.014, 0.05, 0.3, 0, 0.035, 0.2); b(g, M.black, 0.014, 0.1, 0.02, 0, -0.005, 0.34);
  b(g, M.black, 0.04, 0.1, 0.05, 0, -0.09, 0.05, 0.35);
  const sbead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), M.brass); sbead.position.set(0, 0.035, -0.69); g.add(sbead);
  trigger(g, 0.025, -0.050);
  hands(g, [0, -0.09, 0.06], [0, -0.035, -0.36]);
  models.spas12 = { g, mag: null, sight: V(0, 0.038, -0.69), muzzle: V(0, 0.015, -0.71), port: V(0.035, 0.02, -0.05), hip: V(0.18, -0.21, -0.38), adsDist: 0.44 };

  // ---- Mk 14 EBR (marksman, fixed 2x scope) ----
  g = new THREE.Group();
  b(g, M.camo, 0.066, 0.095, 0.44, 0, 0, -0.08);             // receiver + chassis
  b(g, M.black, 0.07, 0.02, 0.36, 0, 0.055, -0.1);            // top rail
  cyl(g, M.black, 0.013, 0.36, 0, 0.005, -0.48); cyl(g, M.black, 0.019, 0.08, 0, 0.005, -0.69); // barrel + brake
  b(g, M.dark, 0.072, 0.07, 0.22, 0, -0.005, -0.36);          // handguard
  for (let i = 0; i < 4; i++) b(g, M.black, 0.075, 0.008, 0.012, 0, 0.03, -0.28 - i * 0.05);
  b(g, M.camo, 0.05, 0.12, 0.28, 0, -0.025, 0.26); b(g, M.black, 0.054, 0.05, 0.06, 0, 0.04, 0.33); // stock + cheek riser
  b(g, M.black, 0.04, 0.1, 0.05, 0, -0.09, 0.06, 0.35);       // grip
  mag = b(g, M.black, 0.045, 0.12, 0.075, 0, -0.1, -0.1, -0.12);
  cyl(g, M.black, 0.019, 0.22, 0, 0.09, -0.07); cyl(g, M.black, 0.025, 0.05, 0, 0.09, -0.2); cyl(g, M.black, 0.022, 0.04, 0, 0.09, 0.05);
  b(g, M.black, 0.02, 0.03, 0.02, 0, 0.07, -0.12); b(g, M.black, 0.02, 0.03, 0.02, 0, 0.07, 0.0);
  const lens2 = new THREE.Mesh(new THREE.CircleGeometry(0.017, 12), M.lens); lens2.position.set(0, 0.09, 0.071); g.add(lens2);
  trigger(g, 0.025, -0.050);
  hands(g, [0, -0.09, 0.06], [0, -0.04, -0.34]);
  models.mk14 = { g, mag, sight: V(0, 0.09, -0.07), muzzle: V(0, 0.005, -0.74), port: V(0.035, 0.02, -0.04), hip: V(0.17, -0.21, -0.37), adsDist: 0.25, scope: true };

  // ---- Barrett .50 ----
  g = new THREE.Group();
  b(g, M.camo, 0.075, 0.11, 0.5, 0, 0, -0.05);
  cyl(g, M.black, 0.016, 0.6, 0, 0.01, -0.6); b(g, M.black, 0.06, 0.04, 0.09, 0, 0.01, -0.93);
  b(g, M.camo, 0.06, 0.12, 0.3, 0, -0.02, 0.3);
  b(g, M.black, 0.045, 0.1, 0.05, 0, -0.1, 0.08, 0.3);
  mag = b(g, M.black, 0.05, 0.1, 0.11, 0, -0.1, -0.12);
  cyl(g, M.black, 0.024, 0.34, 0, 0.11, -0.06); cyl(g, M.black, 0.032, 0.08, 0, 0.11, -0.27); cyl(g, M.black, 0.028, 0.06, 0, 0.11, 0.12);
  b(g, M.black, 0.012, 0.012, 0.3, 0.03, -0.07, -0.55, 0.3); b(g, M.black, 0.012, 0.012, 0.3, -0.03, -0.07, -0.55, 0.3);
  trigger(g, 0.045, -0.060);
  hands(g, [0, -0.1, 0.08], [0, -0.05, -0.32]);
  models.barrett = { g, mag, sight: V(0, 0.11, -0.06), muzzle: V(0, 0.01, -0.98), port: V(0.04, 0.02, -0.02), hip: V(0.2, -0.235, -0.4), adsDist: 0.25, scope: true };

  // ---- RPG-7 ----
  g = new THREE.Group();
  cyl(g, M.olive, 0.034, 0.9, 0, 0.02, -0.2);
  cyl(g, M.black, 0.045, 0.12, 0, 0.02, 0.27);
  const warhead = new THREE.Group(); warhead.position.set(0, 0.02, -0.72); g.add(warhead);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 12), M.olive); cone.rotation.x = -Math.PI / 2; cone.position.z = -0.12; warhead.add(cone);
  const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.06, 12), M.olive); wb.rotation.x = Math.PI / 2; warhead.add(wb);
  b(g, M.black, 0.04, 0.11, 0.05, 0, -0.07, -0.05, 0.25); b(g, M.black, 0.04, 0.1, 0.05, 0, -0.065, -0.3, 0.2);
  b(g, M.black, 0.012, 0.05, 0.012, 0, 0.072, -0.32); b(g, M.black, 0.03, 0.03, 0.012, 0, 0.068, -0.02);
  hands(g, [0, -0.08, -0.04], [0, -0.07, -0.3]);
  models.rpg = { g, mag: warhead, sight: V(0, 0.097, -0.32), muzzle: V(0, 0.02, -0.86), hip: V(0.2, -0.2, -0.46), adsDist: 0.5, launcher: true };

  for (const k in models) { const md = models[k]; md.g.visible = false; root.add(md.g); if (md.mag) md.magHome = md.mag.position.clone(); if (md.slide) md.slideHome = md.slide.position.z; if (md.pump) md.pumpHome = md.pump.position.z; }

  // grenade hand (left side, used during cook/throw)
  grenadeHand = new THREE.Group();
  const nade = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), M.olive); nade.position.set(0, 0.02, -0.02); grenadeHand.add(nade);
  b(grenadeHand, M.black, 0.02, 0.025, 0.02, 0, 0.06, -0.02);
  b(grenadeHand, M.glove, 0.06, 0.06, 0.07, 0, -0.01, 0.01);
  b(grenadeHand, M.sleeve, 0.075, 0.075, 0.34, -0.03, -0.07, 0.19, -0.4, -0.25, 0);
  grenadeHand.visible = false;
  G.vmCamera.add(grenadeHand);

  // muzzle flash: two crossed additive quads + core
  const ftex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,252,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,110,.95)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    x.fillStyle = gr; x.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283, r = i % 2 ? 12 : 32; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    x.fill(); return new THREE.CanvasTexture(c);
  })();
  const fm = new THREE.MeshBasicMaterial({ map: ftex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  flash = new THREE.Group();
  const q1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm); flash.add(q1);
  const q2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.24), fm); q2.rotation.y = Math.PI / 2; q2.position.z = -0.06; flash.add(q2);
  const q3 = q2.clone(); q3.rotation.set(0, Math.PI / 2, Math.PI / 2); flash.add(q3);
  flash.visible = false; root.add(flash);

  // ejected casings
  const sg = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6);
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(sg, M.brass); m.visible = false; G.vmCamera.add(m); shells.push({ m, vx: 0, vy: 0, vz: 0, life: 0 }); }
}

export function initViewmodel() {
  mats();
  root = new THREE.Group();
  G.vmCamera.add(root);
  build();
  setCamo(G.profile.loadout.camo);
}

export function vmFire(weaponId) {
  const md = models[weaponId]; if (!md || md.melee) return;
  flash.visible = true; flash.position.copy(md.muzzle);
  const w = WEAPONS[weaponId], big = w.pellets > 1 || w.scope || w.projectile || weaponId === 'deagle';
  flash.rotation.z = Math.random() * 6.28; const s = w.projectile ? 2.2 : big ? 1.5 : w.slot === 1 ? 0.75 : 1;
  flash.scale.setScalar(s * (0.8 + Math.random() * 0.4));
  vm.flashUntil = G.realTime + 0.045;
  vm.kick = Math.min(1.5, vm.kick + (big ? 1.0 : w.slot === 1 ? 0.6 : 0.42));
  if (md.port && !md.pumpAction && !md.bolt) ejectShell(md);
  if (md.slide) md.slideKick = 1;
}
export function ejectShell(md) {
  const s = shells[shellI]; shellI = (shellI + 1) % shells.length;
  const p = md.port.clone(); md.g.localToWorld(p); G.vmCamera.worldToLocal(p);
  s.m.position.copy(p); s.m.visible = true; s.life = 0.6;
  s.vx = 0.9 + Math.random() * 0.5; s.vy = 0.8 + Math.random() * 0.4; s.vz = 0.15 + Math.random() * 0.2;
  s.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
}
export function vmLand(v) { vm.land = Math.min(1, vm.land + v); }
export function vmModel(id) { return models[id]; }

const _hip = new THREE.Vector3(), _ads = new THREE.Vector3(), _p = new THREE.Vector3();
// st: { weapon, adsT, sprintT, bob, bobAmp, mdx, mdy, reload (0..1 or -1), switchT (0 lowered..1 raised), melee (0..1 or -1), meleeHeavy, throwT (-1 or 0..1), cooking, crouchT, pump (0..1 or -1), bolt (0..1 or -1), visible }
export function updateViewmodel(dt, st) {
  for (const k in models) models[k].g.visible = false;
  const md = models[st.weapon];
  for (const s of shells) {
    if (s.life <= 0) continue;
    s.life -= dt; s.vy -= 6 * dt;
    s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
    s.m.rotation.x += dt * 14; s.m.rotation.z += dt * 9;
    if (s.life <= 0) s.m.visible = false;
  }
  if (!md || !st.visible) { root.visible = false; grenadeHand.visible = false; return; }
  root.visible = true; md.g.visible = true;
  // sway from mouse movement (lagging the camera)
  vm.swayX = damp(vm.swayX, clamp(st.mdx * 0.04, -1.2, 1.2), 9, dt);
  vm.swayY = damp(vm.swayY, clamp(st.mdy * 0.04, -1.2, 1.2), 9, dt);
  vm.kick = damp(vm.kick, 0, 14, dt);
  vm.land = damp(vm.land, 0, 7, dt);
  const ads = st.adsT * st.adsT * (3 - 2 * st.adsT);
  _hip.copy(md.hip);
  _ads.set(-md.sight.x, -md.sight.y, -md.adsDist - md.sight.z);
  _p.lerpVectors(_hip, _ads, ads);
  const nonAds = 1 - ads * 0.88;
  let rx = 0, ry = 0, rz = 0;
  // movement bob
  _p.x += Math.sin(st.bob) * 0.011 * st.bobAmp * nonAds;
  _p.y += -Math.abs(Math.cos(st.bob)) * 0.009 * st.bobAmp * nonAds;
  rz += Math.sin(st.bob) * 0.02 * st.bobAmp * nonAds;
  // sway
  _p.x -= vm.swayX * 0.008 * nonAds; _p.y += vm.swayY * 0.006 * nonAds;
  ry += vm.swayX * 0.03 * nonAds; rx += vm.swayY * 0.025 * nonAds;
  // sprint pose
  const sp = st.sprintT;
  _p.x += -0.05 * sp; _p.y += -0.05 * sp; _p.z += 0.02 * sp; ry += 0.55 * sp; rz += 0.3 * sp; rx += -0.12 * sp;
  // recoil kick
  _p.z += vm.kick * (0.045 - ads * 0.02); rx += vm.kick * (0.11 - ads * 0.07);
  // landing dip + crouch tilt
  _p.y -= vm.land * 0.04; rz += st.crouchT * 0.05 * nonAds;
  // reload animation
  if (st.reload >= 0 && !md.melee) {
    const p = st.reload, s = Math.sin(Math.PI * Math.min(1, p * 1.05));
    rx -= 0.42 * s; rz += 0.5 * s; _p.y -= 0.06 * s; _p.x -= 0.03 * s;
    if (md.mag) {
      let off = 0;
      if (p > 0.15 && p < 0.38) off = (p - 0.15) / 0.23; else if (p >= 0.38 && p < 0.55) off = 1; else if (p >= 0.55 && p < 0.75) off = 1 - (p - 0.55) / 0.2;
      md.mag.position.copy(md.magHome); md.mag.position.y -= off * 0.28; md.mag.visible = off < 0.95;
    }
  } else if (md.mag) { md.mag.position.copy(md.magHome); md.mag.visible = true; }
  if (md.pump) md.pump.position.z = md.pumpHome + (st.pump >= 0 ? Math.sin(Math.PI * st.pump) * 0.09 : 0);
  if (md.launcher && st.reload < 0) md.mag.visible = st.loaded !== false;
  if (md.bolt) { const k = st.bolt >= 0 ? Math.sin(Math.PI * st.bolt) : 0; md.bolt.position.z = 0.06 + k * 0.09; md.bolt.rotation.z = k * 1.2; }
  if (md.slide) { md.slideKick = damp(md.slideKick || 0, 0, 20, dt); md.slide.position.z = md.slideHome + md.slideKick * 0.04; }
  // weapon switch (lower / raise)
  const sw = 1 - st.switchT;
  _p.y -= sw * 0.32; rx -= sw * 0.7;
  // knife swing
  if (md.melee && st.melee >= 0) {
    const t = st.melee, e = Math.sin(Math.PI * t);
    if (st.meleeHeavy) { _p.z -= e * 0.16; _p.y += e * 0.02; rx -= e * 0.25; }
    else { _p.x -= e * 0.2; _p.z -= e * 0.06; ry += e * 1.1 - 0.3 * e; rz -= e * 0.9; }
  }
  // grenade cook/throw: hide gun a bit and show the grenade hand
  grenadeHand.visible = st.throwT >= 0 || st.cooking;
  if (grenadeHand.visible) {
    const t = st.throwT >= 0 ? st.throwT : 0;
    grenadeHand.position.set(-0.13 + t * 0.12, -0.16 + Math.sin(Math.PI * t) * 0.18, -0.36 - t * 0.25);
    grenadeHand.rotation.set(st.cooking ? 0.2 : -t * 1.2, 0.2, 0);
    _p.y -= 0.1; rx -= 0.25;
  }
  root.position.copy(_p);
  root.rotation.set(rx, ry, rz);
  flash.visible = G.realTime < vm.flashUntil && !md.melee;
  if (flash.visible) flash.position.copy(md.muzzle);
  // zoom the viewmodel camera a touch when aiming
  G.vmCamera.fov = 54 - ads * (md.scope ? 0 : 8);
  G.vmCamera.updateProjectionMatrix();
}
