// Static hit-box audit: every bullet-blocking collider must hug visible geometry.
// Samples corners (inset) + centres of each collider; a sample passes if a visible static surface (or the ground) is
// within TOL, or the point is enclosed by geometry (inside a solid). Usage: node tests/hitbox.mjs [tol=0.3] [maps...]
import { open } from './harness.mjs';
const TOL = +process.argv[2] || 0.3;
const MAPS = process.argv.length > 3 ? process.argv.slice(3) : ['gorge', 'yard', 'outpost', 'atomic'];
const { browser, page, errors } = await open({ w: 320, h: 240 });
const out = await page.evaluate(([maps, TOL]) => {
  const F = window.__frontline, G = F.G, T = window.THREE, res = {};
  for (const id of maps) {
    F.loadMap(id);
    const meshes = []; G.mapGroup.children.forEach((m) => { if (m.isMesh && m.name.startsWith('static_')) { m.material.side = T.DoubleSide; meshes.push(m); } });
    // bucket triangles in a 2 m grid
    const B = new Map(), key = (i, k) => i * 100003 + k, tris = [];
    for (const m of meshes) {
      const p = m.geometry.attributes.position, ix = m.geometry.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        const t = new T.Triangle(new T.Vector3().fromBufferAttribute(p, ix[i]), new T.Vector3().fromBufferAttribute(p, ix[i + 1]), new T.Vector3().fromBufferAttribute(p, ix[i + 2]));
        const n = tris.push(t) - 1;
        const x0 = Math.floor(Math.min(t.a.x, t.b.x, t.c.x) / 2), x1 = Math.floor(Math.max(t.a.x, t.b.x, t.c.x) / 2);
        const z0 = Math.floor(Math.min(t.a.z, t.b.z, t.c.z) / 2), z1 = Math.floor(Math.max(t.a.z, t.b.z, t.c.z) / 2);
        if ((x1 - x0) * (z1 - z0) > 400) continue; // skip huge far scenery
        for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) { const k = key(a, c); (B.get(k) || B.set(k, []).get(k)).push(n); }
      }
    }
    const q = new T.Vector3(), cp = new T.Vector3(), rc = new T.Raycaster();
    const dist = (x, y, z) => {
      q.set(x, y, z); let d = Math.abs(y); const seen = new Set();
      const gx = Math.floor(x / 2), gz = Math.floor(z / 2);
      for (let a = gx - 1; a <= gx + 1; a++) for (let c = gz - 1; c <= gz + 1; c++) for (const n of B.get(key(a, c)) || []) {
        if (seen.has(n)) continue; seen.add(n); tris[n].closestPointToPoint(q, cp); d = Math.min(d, cp.distanceTo(q));
      }
      return d;
    };
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const enclosed = (x, y, z) => DIRS.every(([a, b, c]) => { rc.set(new T.Vector3(x, y, z), new T.Vector3(a, b, c)); rc.far = 80; return (b < 0 && y > 0) ? true && rc.intersectObjects(meshes).length > 0 || y < 80 : rc.intersectObjects(meshes).length > 0; });
    const bad = [];
    for (const c of G.world.colliders) {
      if (c.pass || c.barrel || c.noRay || c.hull) continue; // hulls are exact by construction
      const ix = Math.min(0.05, (c.maxX - c.minX) * 0.2), iy = Math.min(0.05, (c.maxY - c.minY) * 0.2), iz = Math.min(0.05, (c.maxZ - c.minZ) * 0.2);
      const xs = [c.minX + ix, c.maxX - ix], ys = [c.minY + iy, c.maxY - iy], zs = [c.minZ + iz, c.maxZ - iz];
      const pts = [[(c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2], [(c.minX + c.maxX) / 2, c.maxY - iy, (c.minZ + c.maxZ) / 2]];
      for (const x of xs) for (const y of ys) for (const z of zs) pts.push([x, y, z]);
      let worst = 0, wp = null;
      for (const p of pts) { const d = dist(...p); if (d > TOL && !enclosed(...p) && d > worst) { worst = d; wp = p; } }
      if (wp) bad.push({ d: +worst.toFixed(2), at: wp.map((v) => +v.toFixed(1)), box: [c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ].map((v) => +v.toFixed(1)), mat: c.mat });
    }
    bad.sort((a, b) => b.d - a.d);
    res[id] = { colliders: G.world.colliders.length, bad: bad.length, worst: bad.slice(0, 8) };
  }
  return res;
}, [MAPS, TOL]);
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
console.log('ERRORS', errors.length, errors.slice(0, 3));
await browser.close();
