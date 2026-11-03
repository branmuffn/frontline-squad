import * as THREE from 'three';
import { G } from '../../core/state.js';
import { MapBuilder, makeSky, makeGround } from '../builder.js';
import { buildHash } from '../physics.js';
import yard from './steelyard.js';
import outpost from './dustoutpost.js';

export const MAPS = { yard, outpost };
export const MAP_LIST = [yard, outpost];

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
  const shadows = G.profile.settings.shadows;
  const group = b.finalize(shadows);
  group.add(makeGround(420, def.ground));
  group.add(makeSky(...def.sky));
  group.add(new THREE.HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity));
  const sun = new THREE.DirectionalLight(def.sun.color, def.sun.intensity);
  sun.position.set(...def.sun.pos);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const s = def.sun.shadow;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 190 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  group.add(sun); group.add(sun.target);
  G.scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
  G.scene.fog.color.convertSRGBToLinear();
  G.scene.background = G.scene.fog.color.clone();
  G.scene.add(group);
  G.mapGroup = group;
  G.world = {
    id: def.id, def, colliders: b.colliders, ramps: b.ramps, bounds: def.bounds, groundMat: def.groundMat,
    nav: null, sun, spawns: def.spawns, pickups: def.pickups,
  };
  buildHash(G.world);
  return G.world;
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
