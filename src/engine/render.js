import * as THREE from 'three';
import { G } from '../core/state.js';

export function initRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  renderer.shadowMap.enabled = G.profile.settings.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCF honours shadow.radius -> softer, blurred edges
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  container.appendChild(renderer.domElement);
  G.renderer = renderer;

  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(G.profile.settings.fov, 1, 0.05, 230);
  G.camera.rotation.order = 'YXZ';
  G.scene.add(G.camera);

  // Viewmodel scene: rendered after clearing depth so guns never poke through walls
  G.vmScene = new THREE.Scene();
  G.vmCamera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
  G.vmScene.add(G.vmCamera);
  G.vmHemi = new THREE.HemisphereLight(0xd8e0e8, 0x4a4840, 1.25); G.vmScene.add(G.vmHemi);
  const key = new THREE.DirectionalLight(0xfff0dc, 1.35); key.position.set(0.6, 1, 0.4); G.vmScene.add(key);
  G.vmLight = key;
  // cool rim light from behind/above so the gun's silhouette and bevels read against any background
  const rim = new THREE.DirectionalLight(0xbcd4ff, 0.9); rim.position.set(-0.5, 0.6, -1); G.vmScene.add(rim);
  // muzzle light lives in the world scene; intensity toggled (constant light count = no shader recompiles)
  G.muzzleLight = new THREE.PointLight(0xffc070, 0, 9, 2);
  G.scene.add(G.muzzleLight);
  G.flashLight = new THREE.PointLight(0xffa050, 0, 22, 2);
  G.scene.add(G.flashLight);

  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const scale = G.profile.settings.renderScale || 1;
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * scale);
  G.renderer.setSize(w, h);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  G.vmCamera.aspect = w / h; G.vmCamera.updateProjectionMatrix();
  G.viewH = h;
}

export function render(showViewmodel) {
  const r = G.renderer;
  r.clear();
  r.render(G.scene, G.camera);
  if (showViewmodel) { r.clearDepth(); r.render(G.vmScene, G.vmCamera); }
}
