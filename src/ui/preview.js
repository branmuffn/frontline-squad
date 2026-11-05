// Loadout preview: a small second renderer that shows your operator wearing the current picks (slow turntable),
// and renders gun thumbnails from the in-game models (cached data URLs, so no image files are needed).
import * as THREE from 'three';
import { G } from '../core/state.js';
import { makeSoldier, poseSoldier, disposeSoldier, gunModel } from '../entities/soldier.js';

let R = null, scene = null, cam = null, sol = null, key = '', live = false, cvs = null, t0 = 0;
const thumbs = new Map(), ghost = { x: 0, y: 0, z: 0, yaw: 0, aimPitch: 0, crouchT: 0, moveSpeed: 0 };
function init() {
  cvs = document.createElement('canvas');
  R = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.25; R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ee, 0x3c362c, 1.15));
  const d = new THREE.DirectionalLight(0xfff0dc, 1.7); d.position.set(2, 4, 3); scene.add(d);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7); rim.position.set(-3, 2, -3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })); scene.add(floor);
  cam = new THREE.PerspectiveCamera(28, 0.7, 0.1, 30);
}
// look = makeSoldier options (uniform, accent, helmet, pattern, operator fields, vest, belt, weapon)
export function showPreview(host, look) {
  if (!R) init();
  if (cvs.parentNode !== host) host.appendChild(cvs);
  const k = JSON.stringify(look);
  if (k !== key) {
    if (sol) { scene.remove(sol.root); disposeSoldier(sol); }
    sol = makeSoldier(look); G.scene.remove(sol.root); scene.add(sol.root); key = k;
  }
  if (!live) { live = true; t0 = performance.now(); requestAnimationFrame(frame); }
}
export function stopPreview() { live = false; }
let lastF = 0;
function frame(t) {
  if (!live || !cvs.isConnected || !cvs.offsetParent) { live = false; return; }
  // 30 fps by default (the turntable is slow); 60 with "Smooth loadout preview"
  if ((G.profile.settings.previewFps || 30) < 50 && t - lastF < 30) { requestAnimationFrame(frame); return; }
  lastF = t;
  const w = cvs.parentNode.clientWidth, h = cvs.parentNode.clientHeight;
  if (w > 10 && h > 10 && (cvs.width !== Math.round(w * R.getPixelRatio()) || cvs.height !== Math.round(h * R.getPixelRatio()))) { R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } // canvas is absolutely positioned (CSS): resizing it can never grow the page
  cam.position.set(0, 1.15, 4.9); cam.lookAt(0, 0.92, 0);
  ghost.yaw = Math.PI + 0.5 + Math.sin((t - t0) * 0.00045) * 0.9;
  poseSoldier(sol, ghost, 1 / 60);
  R.render(scene, cam);
  requestAnimationFrame(frame);
}
// gun picture from the 3-D model (side view), cached
export function gunThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  if (!R) init();
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x50483c, 1.3)); const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(1, 2, 3); sc.add(d);
  const g = gunModel(sc, id); g.rotation.y = Math.PI / 2;
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), L = Math.max(s.x, s.y * 2.3, 0.2);
  const oc = new THREE.OrthographicCamera(-L * 0.56, L * 0.56, L * 0.245, -L * 0.245, 0.01, 10); oc.position.set(c.x, c.y, c.z + 3); oc.lookAt(c);
  const pw = R.getPixelRatio(), ow = cvs.width, oh = cvs.height; R.setPixelRatio(1); R.setSize(220, 96, false);
  R.render(sc, oc); const url = cvs.toDataURL('image/png');
  R.setPixelRatio(pw); R.setSize(ow / pw || 1, oh / pw || 1, false);
  thumbs.set(id, url); return url;
}
