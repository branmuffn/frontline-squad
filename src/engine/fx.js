import * as THREE from 'three';
import { G } from '../core/state.js';
import { rand } from '../core/util.js';

const VS = `attribute float size; attribute float alpha; attribute vec3 pcolor; uniform float uScale;
varying float vA; varying vec3 vC;
void main(){ vA = alpha; vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 1.0, 600.0); gl_Position = projectionMatrix * mv; }`;
const FS = `varying float vA; varying vec3 vC; uniform float uHard;
void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
  float a = vA * (1.0 - smoothstep(uHard * 0.5, 0.5, d)); gl_FragColor = vec4(vC, a); }`;

class Particles {
  constructor(max, additive, hard) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.siz = new Float32Array(max); this.alp = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, uHard: { value: hard } },
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    this.geo = g;
    // per-particle sim state
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
  }
  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = this.maxLife[i] = life; this.s0[i] = size; this.grow[i] = grow; this.a0[i] = a; this.grav[i] = grav; this.drag[i] = drag;
    this.siz[i] = size; this.alp[i] = a;
  }
  copy(i, j) {
    for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k]; }
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.s0[i] = this.s0[j]; this.grow[i] = this.grow[j];
    this.a0[i] = this.a0[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.siz[i] = this.siz[j]; this.alp[i] = this.alp[j];
  }
  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; if (i < this.n) { this.copy(i, this.n); i--; } continue; }
      const k = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[k + 1] -= this.grav[i] * dt;
      this.v[k] *= dr; this.v[k + 1] *= dr; this.v[k + 2] *= dr;
      this.pos[k] += this.v[k] * dt; this.pos[k + 1] += this.v[k + 1] * dt; this.pos[k + 2] += this.v[k + 2] * dt;
      if (this.pos[k + 1] < 0.02 && this.grav[i] > 0) { this.pos[k + 1] = 0.02; this.v[k + 1] *= -0.3; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.siz[i] = this.s0[i] * (1 + this.grow[i] * t);
      this.alp[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'pcolor', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

let glow, smoke, tracers = [], decals, scorches, decalI = 0, scorchI = 0, flashes = [], flashI = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);

function texCanvas(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); return t; }

export function initFx() {
  glow = new Particles(900, true, 0.15); smoke = new Particles(700, false, 0.0);
  G.scene.add(glow.points); G.scene.add(smoke.points);
  for (let i = 0; i < 48; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, depthWrite: false }));
    l.frustumCulled = false; l.visible = false; G.scene.add(l);
    tracers.push({ line: l, active: false });
  }
  const hole = texCanvas(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(10,10,10,1)'); g.addColorStop(0.28, 'rgba(25,24,22,.95)'); g.addColorStop(0.42, 'rgba(60,58,52,.55)'); g.addColorStop(1, 'rgba(60,58,52,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  const scorch = texCanvas(128, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(8,8,8,.9)'); g.addColorStop(0.5, 'rgba(20,18,15,.6)'); g.addColorStop(1, 'rgba(20,18,15,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  const mk = (tex, n) => {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), n);
    _m.makeScale(0, 0, 0); for (let i = 0; i < n; i++) m.setMatrixAt(i, _m);
    m.frustumCulled = false; m.renderOrder = 2; G.scene.add(m); return m;
  };
  decals = mk(hole, 160); scorches = mk(scorch, 12);
  const flashTex = texCanvas(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.3, 'rgba(255,190,90,.85)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.visible = false; sp.scale.set(0.7, 0.7, 1); G.scene.add(sp); flashes.push({ sp, until: 0 });
  }
}

export function clearFx() {
  glow.clear(); smoke.clear();
  for (const t of tracers) { t.active = false; t.line.visible = false; }
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < 160; i++) decals.setMatrixAt(i, _m); for (let i = 0; i < 12; i++) scorches.setMatrixAt(i, _m);
  decals.instanceMatrix.needsUpdate = true; scorches.instanceMatrix.needsUpdate = true;
  for (const f of flashes) { f.sp.visible = false; f.until = 0; }
  G.flashLight.intensity = 0; G.muzzleLight.intensity = 0;
}

export function tracer(ax, ay, az, bx, by, bz, color = 0xffe2a0, speed = 320) {
  const t = tracers.find((q) => !q.active) || tracers[0];
  const d = Math.hypot(bx - ax, by - ay, bz - az);
  if (d < 1.5) return;
  Object.assign(t, { active: true, ax, ay, az, dx: (bx - ax) / d, dy: (by - ay) / d, dz: (bz - az) / d, len: d, head: 0, speed, seg: Math.min(4.5, d * 0.5) });
  t.line.material.color.setHex(color).convertSRGBToLinear(); t.line.material.opacity = 0.9; t.line.visible = true;
}

export function decal(x, y, z, nx, ny, nz, size = 0.13) {
  _n.set(nx, ny, nz); _q.setFromUnitVectors(Z, _n);
  _q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * 6.28));
  _p.set(x + nx * 0.025, y + ny * 0.025, z + nz * 0.025); _s.set(size, size, size);
  _m.compose(_p, _q, _s); decals.setMatrixAt(decalI, _m); decalI = (decalI + 1) % 160; decals.instanceMatrix.needsUpdate = true;
}

export function enemyFlash(x, y, z) {
  const f = flashes[flashI]; flashI = (flashI + 1) % flashes.length;
  f.sp.position.set(x, y, z); f.sp.visible = true; f.until = G.realTime + 0.05; f.sp.material.rotation = Math.random() * 6.28;
  const s = 0.5 + Math.random() * 0.35; f.sp.scale.set(s, s, 1);
}

const IMPACT = {
  concrete: [0.62, 0.62, 0.6], adobe: [0.78, 0.66, 0.5], sand: [0.8, 0.7, 0.52], wood: [0.45, 0.33, 0.2], metal: [0.5, 0.52, 0.55], ground: [0.55, 0.55, 0.52],
};
export function impact(x, y, z, nx, ny, nz, mat) {
  const c = IMPACT[mat] || IMPACT.concrete;
  const n = mat === 'metal' ? 3 : 7;
  for (let i = 0; i < n; i++) {
    smoke.spawn(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * rand(0.6, 2) + rand(-0.6, 0.6), ny * rand(0.6, 2) + rand(0.1, 0.9), nz * rand(0.6, 2) + rand(-0.6, 0.6),
      rand(0.35, 0.7), rand(0.12, 0.22), 2.2, c[0], c[1], c[2], 0.55, 0.6, 2.5);
  }
  const sparks = mat === 'metal' ? 8 : mat === 'concrete' ? 2 : 0;
  for (let i = 0; i < sparks; i++) glow.spawn(x, y, z, nx * rand(2, 6) + rand(-2.5, 2.5), ny * rand(2, 5) + rand(0, 3), nz * rand(2, 6) + rand(-2.5, 2.5), rand(0.1, 0.25), 0.05, 0, 1, 0.8, 0.4, 1, 9, 1);
  decal(x, y, z, nx, ny, nz, mat === 'metal' ? 0.1 : 0.14);
}
export function blood(x, y, z, dx, dz, head) {
  for (let i = 0; i < (head ? 9 : 5); i++) smoke.spawn(x, y, z, dx * rand(0.5, 2) + rand(-0.6, 0.6), rand(-0.3, 1), dz * rand(0.5, 2) + rand(-0.6, 0.6), rand(0.25, 0.5), rand(0.12, 0.22), 1.8, 0.42, 0.06, 0.05, 0.75, 3, 3);
}
export function muzzleSmoke(x, y, z) { smoke.spawn(x, y, z, rand(-0.2, 0.2), rand(0.2, 0.6), rand(-0.2, 0.2), 0.6, 0.18, 3, 0.7, 0.7, 0.7, 0.18, -0.4, 1); }

export function explosion(x, y, z, big = 1) {
  for (let i = 0; i < 26 * big; i++) {
    const a = rand(0, 6.28), up = rand(0.2, 1), sp = rand(2, 9) * big;
    glow.spawn(x, y + 0.3, z, Math.cos(a) * sp * (1 - up * 0.5), up * sp, Math.sin(a) * sp * (1 - up * 0.5), rand(0.25, 0.55), rand(0.9, 1.8) * big, 1.2, 1, rand(0.45, 0.7), 0.2, 1, -1, 3);
  }
  for (let i = 0; i < 30 * big; i++) {
    const a = rand(0, 6.28), sp = rand(4, 16);
    glow.spawn(x, y + 0.2, z, Math.cos(a) * sp, rand(2, 10), Math.sin(a) * sp, rand(0.4, 0.9), 0.07, 0, 1, 0.75, 0.3, 1, 14, 0.5);
  }
  for (let i = 0; i < 22 * big; i++) {
    const a = rand(0, 6.28), sp = rand(1, 4.5);
    const g = rand(0.22, 0.38);
    smoke.spawn(x + rand(-0.6, 0.6), y + rand(0.2, 1.2), z + rand(-0.6, 0.6), Math.cos(a) * sp, rand(0.8, 2.6), Math.sin(a) * sp, rand(1.6, 3), rand(1.4, 2.6) * big, 1.6, g, g * 0.95, g * 0.9, 0.7, -0.25, 1.4);
  }
  for (let i = 0; i < 12; i++) { const a = rand(0, 6.28); smoke.spawn(x, 0.2, z, Math.cos(a) * 7, 0.4, Math.sin(a) * 7, 0.9, 0.9, 2, 0.6, 0.55, 0.48, 0.5, 0, 3.5); }
  G.flashLight.position.set(x, y + 1.2, z); G.flashLight.intensity = 9 * big;
  if (y < 0.6) {
    _q.setFromUnitVectors(Z, _n.set(0, 1, 0)); _q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * 6.28));
    _p.set(x, 0.03, z); const s = 3.4 * big; _s.set(s, s, s);
    _m.compose(_p, _q, _s); scorches.setMatrixAt(scorchI, _m); scorchI = (scorchI + 1) % 12; scorches.instanceMatrix.needsUpdate = true;
  }
}

export function updateFx(dt) {
  const scale = G.renderer.getDrawingBufferSize(_p).y / (2 * Math.tan(THREE.MathUtils.degToRad(G.camera.fov) / 2));
  glow.update(dt, scale); smoke.update(dt, scale);
  for (const t of tracers) {
    if (!t.active) continue;
    t.head += t.speed * dt;
    const tail = Math.max(0, t.head - t.seg), head = Math.min(t.len, t.head);
    if (tail >= t.len) { t.active = false; t.line.visible = false; continue; }
    const a = t.line.geometry.attributes.position.array;
    a[0] = t.ax + t.dx * tail; a[1] = t.ay + t.dy * tail; a[2] = t.az + t.dz * tail;
    a[3] = t.ax + t.dx * head; a[4] = t.ay + t.dy * head; a[5] = t.az + t.dz * head;
    t.line.geometry.attributes.position.needsUpdate = true;
  }
  for (const f of flashes) if (f.sp.visible && G.realTime > f.until) f.sp.visible = false;
  G.flashLight.intensity = Math.max(0, G.flashLight.intensity - dt * 40);
  G.muzzleLight.intensity = Math.max(0, G.muzzleLight.intensity - dt * 60);
}
