// F9: draw every collider (and ramp) as a wireframe box, for hit-box audits.
import * as THREE from 'three';
import { G } from '../core/state.js';

let lines = null, worldId = null, on = false;
function build() {
  const pos = [], col = [];
  const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const add = (c, r, g, b) => {
    const P = []; for (let i = 0; i < 8; i++) P.push([i & 1 ? c.maxX : c.minX, i & 4 ? c.maxY : c.minY, i & 2 ? c.maxZ : c.minZ]);
    for (const [a, z] of E) { pos.push(...P[a], ...P[z]); col.push(r, g, b, r, g, b); }
  };
  for (const c of G.world.colliders) {
    if (c.hull) { // exact bullet hull: draw its triangles (cyan)
      const t = c.tris;
      for (let i = 0; i < t.length; i += 9) for (const [a, z] of [[0, 3], [3, 6], [6, 0]]) { pos.push(t[i + a], t[i + a + 1], t[i + a + 2], t[i + z], t[i + z + 1], t[i + z + 2]); col.push(0.1, 1, 1, 0.1, 1, 1); }
    } else if (c.noRay) add(c, 0.3, 0.9, 0.3); // movement-only boxes (green)
    else add(c, c.pass ? 0.2 : 1, c.pass ? 0.6 : 0.15, c.pass ? 1 : 0.6); // blocks bullets and movement (magenta), pass (blue)
  }
  for (const rp of G.world.ramps) add({ minX: rp.minX, maxX: rp.maxX, minY: rp.base, maxY: Math.max(rp.from, rp.to), minZ: rp.minZ, maxZ: rp.maxZ }, 1, 0.85, 0.1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85, fog: false }));
  lines.renderOrder = 999; lines.frustumCulled = false; worldId = G.world;
}
export function toggleColliderDebug(force) {
  on = typeof force === 'boolean' ? force : !on;
  if (lines && (worldId !== G.world || !on)) { G.scene.remove(lines); lines.geometry.dispose(); lines.material.dispose(); lines = null; }
  if (on && G.world) { if (!lines) build(); G.scene.add(lines); }
  return on;
}
export function syncColliderDebug() { if (on && lines && worldId !== G.world) toggleColliderDebug(true); }
