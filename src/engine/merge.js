// Batched drawing (3f): merge a group's static child meshes that share a material into one mesh per material, so a
// vehicle or prop built from many boxes costs one or two draw calls (plus their shadow passes) instead of a dozen.
import * as THREE from 'three';
export function mergeStatic(group) {
  group.updateMatrix(); const byMat = new Map();
  for (const o of group.children.slice()) {
    if (!o.isMesh || o.isSkinnedMesh || o.children.length || !o.visible) continue;
    const k = o.material; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(o);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const pos = [], nor = [], uv = [];
    for (const o of list) {
      o.updateMatrix(); const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrix);
      pos.push(...g.attributes.position.array); nor.push(...(g.attributes.normal ? g.attributes.normal.array : new Float32Array(g.attributes.position.count * 3)));
      const u = g.attributes.uv; uv.push(...(u ? u.array : new Float32Array(g.attributes.position.count * 2))); g.dispose();
      group.remove(o); o.geometry.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; group.add(m);
  }
  return group;
}
