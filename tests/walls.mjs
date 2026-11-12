// B3: every place a player can stand (collision-wise) is checked against the VISUAL geometry: if the body's centre
// (knee or chest height) is inside a rock/wall that looks solid, the walls aren't solid there. Static audit of every
// map (0.5 m grid, every floor level). node tests/walls.mjs [maps] [step]
import { open } from './harness.mjs';
const maps = (process.argv[2] || 'yard,outpost,atomic,gorge,range').split(','), step = +process.argv[3] || 0.5;
const { browser, page, errors } = await open({ w: 320, h: 240 });
let total = 0;
for (const id of maps) {
  const r = await page.evaluate(([id, step]) => {
    globalThis.__recordVis = true;
    const F = window.__frontline, G = F.G; if (G.world && G.world.id === id) F.loadMap(id === 'range' ? 'yard' : 'range'); F.loadMap(id); const W = G.world, ph = F.physics;
    const SOFT = /^(water|grass|gravel|pine|bush|leaf|leaves|palm|foliage|tuft|hay|cloth|canvas|net)/i; // foliage, water, cloth: soft by design
    const vis = (W.vis || []).filter((v) => !SOFT.test(v.k));
    // prepare geometry: bbox per item
    const B0 = W.bounds;
    for (const v of vis) {
      if (v.box) { const [x, y0, z, w, h, d] = v.box, R = Math.hypot(w, d) / 2; v.bb = [x - R, x + R, y0, y0 + h, z - R, z + R]; }
      else { const t = v.tris; let a = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9]; for (let i = 0; i < t.length; i += 3) { a[0] = Math.min(a[0], t[i]); a[1] = Math.max(a[1], t[i]); a[2] = Math.min(a[2], t[i + 1]); a[3] = Math.max(a[3], t[i + 1]); a[4] = Math.min(a[4], t[i + 2]); a[5] = Math.max(a[5], t[i + 2]); } v.bb = a;
        // open surfaces (cliff/scree skins): which side is solid doesn't depend on triangle winding: the front must face
        // the open air (up for floor-like skins, toward the map centre for wall-like ones); closed rocks sum to ~0
        let Sx = 0, Sy = 0, Sz = 0, A = 0;
        for (let i = 0; i < t.length; i += 9) { const e1x = t[i + 3] - t[i], e1y = t[i + 4] - t[i + 1], e1z = t[i + 5] - t[i + 2], e2x = t[i + 6] - t[i], e2y = t[i + 7] - t[i + 1], e2z = t[i + 8] - t[i + 2];
          const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; Sx += nx; Sy += ny; Sz += nz; A += Math.hypot(nx, ny, nz); }
        const open = Math.hypot(Sx, Sy, Sz) > 0.2 * A, cx = (B0.minX + B0.maxX) / 2 - (a[0] + a[1]) / 2, cz = (B0.minZ + B0.maxZ) / 2 - (a[4] + a[5]) / 2;
        v.flip = open && (Math.abs(Sy) > Math.hypot(Sx, Sz) ? Sy < 0 : Sx * cx + Sz * cz < 0) ? -1 : 1; }
    }
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0.707, 0, 0.707], [-0.707, 0, 0.707], [0.707, 0, -0.707], [-0.707, 0, -0.707]];
    // nearest hit along d within L: returns +1 back face (we're behind/inside the surface), -1 front face, 0 none
    function ray(t, ox, oy, oz, d, L) {
      let best = L, side = 0;
      for (let i = 0; i < t.length; i += 9) {
        const e1x = t[i + 3] - t[i], e1y = t[i + 4] - t[i + 1], e1z = t[i + 5] - t[i + 2], e2x = t[i + 6] - t[i], e2y = t[i + 7] - t[i + 1], e2z = t[i + 8] - t[i + 2];
        const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-9) continue;
        const inv = 1 / det, sx = ox - t[i], sy = oy - t[i + 1], sz = oz - t[i + 2], u = (sx * px + sy * py + sz * pz) * inv; if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, w = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (w < 0 || u + w > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt <= 1e-4 || tt >= best) continue;
        best = tt; side = det < 0 ? 1 : -1; // det<0: ray hits the back of a counter-clockwise triangle
      }
      return side;
    }
    function inside(v, x, y, z) {
      const b = v.bb; if (x < b[0] - 0.05 || x > b[1] + 0.05 || y < b[2] || y > b[3] || z < b[4] - 0.05 || z > b[5] + 0.05) return false;
      if (v.box) { const [bx, y0, bz, w, h, d, rot] = v.box, c = Math.cos(rot), s = Math.sin(rot), lx = (x - bx) * c - (z - bz) * s, lz = (x - bx) * s + (z - bz) * c; return Math.abs(lx) < w / 2 - 0.08 && Math.abs(lz) < d / 2 - 0.08 && y > y0 + 0.05 && y < y0 + h - 0.05 && Math.min(w, d) > 0.25; }
      let back = 0; for (const d of DIRS) { const s = ray(v.tris, x, y, z, d, 2.5) * v.flip; if (s > 0) back++; else if (s < 0) return false; }
      return back >= 1;
    }
    const B = W.bounds, bad = new Map();
    for (let x = B.minX + 0.5; x < B.maxX - 0.5; x += step) for (let z = B.minZ + 0.5; z < B.maxZ - 0.5; z += step) {
      let top = 60;
      for (let f = 0; f < 6; f++) {
        const y = ph.supportHeight(x, z, 0.3, top); if (!(y > -5)) break;
        if (!ph.blocked(x, z, 0.3, y + 0.02, 1.6)) {
          for (const hy of [0.5, 1.2]) {
            const v = vis.find((q) => inside(q, x, y + hy, z));
            if (v) { const key = v.k + (v.box ? '[box]' : '[geo ' + v.bb.map((q) => q.toFixed(1)).join(' ') + ']') + ' @ ' + x.toFixed(1) + ',' + y.toFixed(1) + ',' + z.toFixed(1); bad.set(key, (bad.get(key) || 0) + 1); break; }
          }
        }
        top = y - 1.0;
      }
    }
    const byMat = {}; for (const k of bad.keys()) { const m = k.split(' @')[0]; byMat[m] = (byMat[m] || 0) + 1; }
    return { id, vis: vis.length, n: bad.size, byMat, keys: [...new Set((W.vis || []).map((v) => v.k))].join(','), list: [...bad.entries()].sort((a, b) => b[1] - a[1]).slice(0, +(globalThis.__wallList || 12)) };
  }, [id, step]);
  total += r.n; console.log(r.id, 'visuals', r.vis, 'gaps (1 m cells)', r.n, JSON.stringify(r.byMat)); if (process.env.KEYS) console.log('  keys', r.keys); for (const [k, c] of r.list) console.log('   ', k, '×' + c);
}
console.log(total === 0 && !errors.length ? 'PASS walls' : 'FAIL walls', errors.slice(0, 3));
process.exitCode = total === 0 && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
