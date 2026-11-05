import { setupDoors } from '../doors.js';
import * as THREE from 'three';
import { G } from '../../core/state.js';
import { MapBuilder, makeSky, makeGround, makeClouds } from '../builder.js';
import { buildHash } from '../physics.js';
import yard from './steelyard.js';
import outpost from './dustoutpost.js';
import atomic from './atomicacres.js';
import gorge from './cascadegorge.js';
import range from './firingrange.js';

export const MAPS = { yard, outpost, atomic, gorge, range };
export const MAP_LIST = [yard, outpost, atomic, gorge];

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isMesh && o.material && o.material.vertexColors) o.material.dispose(); // sky only; shared materials stay cached
  });
}

export function loadMap(id) {
  const def = MAPS[id] || yard;
  if (G.world && G.world.id === def.id) return G.world;
  if (G.mapGroup) { G.scene.remove(G.mapGroup); disposeGroup(G.mapGroup); }
  const b = new MapBuilder();
  def.build(b);
  // explosive barrels: real colliders that can be switched off when they blow
  const barrelCols = (def.barrels || []).map(([x, z, y = 0]) => {
    const c = { minX: x - 0.33, maxX: x + 0.33, minY: y, maxY: y + 1.0, minZ: z - 0.33, maxZ: z + 0.33, mat: 'metal', barrel: true, home: y };
    b.colliders.push(c); return c;
  });
  const shadows = G.profile.settings.shadows;
  const group = b.finalize(shadows);
  group.add(makeGround(420, def.ground));
  const sky = makeSky(...def.sky);
  group.add(sky);
  group.add(makeClouds(def.cloudTint || '#ffffff'));
  // image-based lighting from the sky so metal and paint pick up reflections
  try {
    if (G.envRT) G.envRT.dispose();
    const pm = new THREE.PMREMGenerator(G.renderer), envScene = new THREE.Scene();
    envScene.add(sky.clone());
    const groundCol = new THREE.Color(def.hemi.ground).convertSRGBToLinear();
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: groundCol, side: THREE.DoubleSide })); gp.rotation.x = -Math.PI / 2; gp.position.y = -2; envScene.add(gp);
    G.envRT = pm.fromScene(envScene, 0.04); pm.dispose();
    G.scene.environment = G.envRT.texture; G.vmScene.environment = G.envRT.texture;
  } catch (e) { /* IBL is optional */ }
  group.add(new THREE.HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity));
  const sun = new THREE.DirectionalLight(def.sun.color, def.sun.intensity);
  sun.position.set(...def.sun.pos);
  sun.castShadow = shadows;
  const sz = G.profile && G.profile.settings.shadowQ === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
  const s = def.sun.shadow;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 190 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.2;
  // viewmodel lighting follows the map: sky/ground tint and a key light from the sun's side
  if (G.vmHemi) { G.vmHemi.color.setHex(def.hemi.sky); G.vmHemi.groundColor.setHex(def.hemi.ground); G.vmHemi.intensity = def.hemi.intensity * 1.05; }
  if (G.vmLight) { G.vmLight.color.setHex(def.sun.color); G.vmLight.intensity = def.sun.intensity * 0.62; }
  group.add(sun); group.add(sun.target);
  G.scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
  G.scene.fog.color.convertSRGBToLinear();
  G.scene.background = G.scene.fog.color.clone();
  G.scene.add(group);
  G.mapGroup = group;
  G.world = {
    id: def.id, def, colliders: b.colliders, ramps: b.ramps, bounds: def.bounds, groundMat: def.groundMat,
    nav: null, sun, vis: b.vis || null, spawns: def.spawns, pickups: def.pickups,
    barrelCols, water: def.water || null, surfaces: def.surfaces || null, ladders: def.ladders || [],
  };
  setupDoors(b.doors, group);
  buildHash(G.world);
  return G.world;
}

export function setShadowSize(n) {
  const sun = G.world && G.world.sun; if (!sun || sun.shadow.mapSize.x === n) return;
  sun.shadow.mapSize.set(n, n); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  G.shadowTick = 0;
}
export function setShadows(on) {
  if (!G.mapGroup) return;
  G.renderer.shadowMap.enabled = on;
  G.mapGroup.traverse((o) => {
    if (o.isDirectionalLight) o.castShadow = on;
    if (o.isMesh && o.name.startsWith('static_')) o.castShadow = on && !o.material.isMeshBasicMaterial && !o.material.userData.noShadow;
    if (o.material) o.material.needsUpdate = true;
  });
  for (const u of G.units) if (u.mesh) u.mesh.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}
