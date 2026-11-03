import { G } from '../core/state.js';
import { PHYS } from '../core/config.js';
import { blocked, supportHeight, query, losClear } from './physics.js';

const S = 2.0; // grid spacing

export function canWalk(ax, ay, az, bx, by, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.2));
  let y = ay;
  for (let k = 1; k <= n; k++) {
    const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (blocked(x, z, 0.37, y, 1.7)) return false;
    const s = supportHeight(x, z, 0.2, y + PHYS.step);
    if (y - s > 3.3) return false;
    y = s;
  }
  return Math.abs(y - by) < 0.25;
}

export function buildNav() {
  const w = G.world, b = w.bounds;
  const x0 = b.minX + 1.1, z0 = b.minZ + 1.1;
  const ni = Math.floor((b.maxX - 1.1 - x0) / S) + 1, nj = Math.floor((b.maxZ - 1.1 - z0) / S) + 1;
  const nodes = [], grid = new Array(ni * nj);
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const x = x0 + i * S, z = z0 + j * S;
    const hs = [0];
    for (const c of query(x - 0.01, x + 0.01, z - 0.01, z + 0.01)) {
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.maxY < 9 && !c.pass) hs.push(c.maxY);
    }
    for (const rp of w.ramps) {
      if (x >= rp.minX && x <= rp.maxX && z >= rp.minZ && z <= rp.maxZ) {
        const t = rp.axis === 'z' ? (z - rp.minZ) / (rp.maxZ - rp.minZ) : (x - rp.minX) / (rp.maxX - rp.minX);
        hs.push(rp.from + (rp.to - rp.from) * t);
      }
    }
    const cell = [];
    for (const h of hs) {
      if (cell.some((n) => Math.abs(n.y - h) < 0.15)) continue;
      const s = supportHeight(x, z, 0.2, h + 0.05);
      if (Math.abs(s - h) > 0.06) continue;
      if (blocked(x, z, 0.42, s, 1.75)) continue;
      const n = { id: nodes.length, x, y: s, z, i, j, edges: [], cost: [], cover: 0, main: false };
      nodes.push(n); cell.push(n);
    }
    grid[j * ni + i] = cell;
  }
  // edges
  for (const n of nodes) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = n.i + di, jj = n.j + dj;
      if (ii < 0 || jj < 0 || ii >= ni || jj >= nj) continue;
      for (const m of grid[jj * ni + ii]) {
        if (m.y - n.y > 3) continue;
        if (canWalk(n.x, n.y, n.z, m.x, m.y, m.z)) { n.edges.push(m.id); n.cost.push(Math.hypot(m.x - n.x, m.z - n.z) + Math.max(0, m.y - n.y) * 0.8); }
      }
    }
  }
  // extra hand-placed nodes, linked to anything walkable within reach; ladders add a node at each end
  const ladderEnds = [];
  for (const L of w.ladders || []) {
    ladderEnds.push([L.x + L.nx * 0.8, L.z + L.nz * 0.8, L.minY, L, 'bottom'], [L.x - L.nx * 0.75, L.z - L.nz * 0.75, L.maxY, L, 'top']);
  }
  const extra = [...(w.def.navExtra || []), ...ladderEnds].map(([x, z, y, L, end]) => {
    const s = supportHeight(x, z, 0.2, y + 0.05);
    if (Math.abs(s - y) > 0.06 || blocked(x, z, 0.36, s, 1.75)) return null;
    const i = Math.max(0, Math.min(ni - 1, Math.round((x - x0) / S))), j = Math.max(0, Math.min(nj - 1, Math.round((z - z0) / S)));
    const n = { id: nodes.length, x, y: s, z, i, j, edges: [], cost: [], cover: 0, main: false };
    if (L) { n.ladder = L; n.ladderEnd = end; }
    nodes.push(n); grid[j * ni + i].push(n);
    return n;
  }).filter(Boolean);
  // climb edges between the two ends of each ladder (both ways)
  for (const a of extra) {
    if (a.ladderEnd !== 'bottom') continue;
    const t = extra.find((q) => q.ladder === a.ladder && q.ladderEnd === 'top');
    if (!t) continue;
    const c = (t.y - a.y) * 1.5 + 1;
    a.edges.push(t.id); a.cost.push(c); t.edges.push(a.id); t.cost.push(c);
  }
  for (const e of extra) {
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = e.i + di, jj = e.j + dj;
      if (ii < 0 || jj < 0 || ii >= ni || jj >= nj) continue;
      for (const m of grid[jj * ni + ii]) {
        if (m === e) continue;
        const d = Math.hypot(m.x - e.x, m.z - e.z);
        if (d > 2.9) continue;
        if (!e.edges.includes(m.id) && canWalk(e.x, e.y, e.z, m.x, m.y, m.z)) { e.edges.push(m.id); e.cost.push(d + Math.max(0, m.y - e.y) * 0.8); }
        if (!m.edges.includes(e.id) && canWalk(m.x, m.y, m.z, e.x, e.y, e.z)) { m.edges.push(e.id); m.cost.push(d + Math.max(0, e.y - m.y) * 0.8); }
      }
    }
  }
  // cover: a solid at least crouch-height tall right next to the node
  for (const n of nodes) {
    let mask = 0;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      for (const r of [0.8, 1.4]) {
        const px = n.x + Math.cos(a) * r, pz = n.z + Math.sin(a) * r;
        let hit = false;
        for (const c of query(px, px, pz, pz)) {
          if (c.pass) continue;
          if (px >= c.minX && px <= c.maxX && pz >= c.minZ && pz <= c.maxZ && c.minY <= n.y + 0.5 && c.maxY >= n.y + 1.05) { hit = true; break; }
        }
        if (hit) { mask |= 1 << k; break; }
      }
    }
    n.cover = mask;
  }
  // main component = reachable from seed AND can reach seed
  const seedPos = w.def.spawns.ffa[0];
  let seed = null, bd = Infinity;
  for (const n of nodes) { const d = Math.hypot(n.x - seedPos[0], n.z - seedPos[1]) + n.y * 5; if (d < bd && n.edges.length > 2) { bd = d; seed = n; } }
  const fwd = new Uint8Array(nodes.length), rev = new Uint8Array(nodes.length);
  const radj = nodes.map(() => []);
  for (const n of nodes) for (const e of n.edges) radj[e].push(n.id);
  const bfs = (mark, adj) => { const q = [seed.id]; mark[seed.id] = 1; while (q.length) { const c = q.pop(); for (const e of adj(c)) if (!mark[e]) { mark[e] = 1; q.push(e); } } };
  bfs(fwd, (c) => nodes[c].edges); bfs(rev, (c) => radj[c]);
  const main = [];
  for (const n of nodes) if (fwd[n.id] && rev[n.id]) { n.main = true; main.push(n); }
  w.nav = { nodes, grid, ni, nj, x0, z0, main, covers: main.filter((n) => n.cover) };
  return w.nav;
}

export function nearestNode(x, y, z, mainOnly = true) {
  const nav = G.world.nav;
  const ci = Math.round((x - nav.x0) / S), cj = Math.round((z - nav.z0) / S);
  let best = null, bs = Infinity;
  for (let r = 1; r <= 4 && !best; r++) {
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= nav.ni || j >= nav.nj) continue;
      for (const n of nav.grid[j * nav.ni + i]) {
        if (mainOnly && !n.main) continue;
        const s = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 3;
        if (s < bs && losClear(x, y + 0.6, z, n.x, n.y + 0.6, n.z)) { bs = s; best = n; }
      }
    }
  }
  return best;
}

// Binary heap A*
export function findPath(fx, fy, fz, tx, ty, tz) {
  const nav = G.world.nav;
  const a = nearestNode(fx, fy, fz), bnode = nearestNode(tx, ty, tz);
  if (!a || !bnode) return null;
  const N = nav.nodes.length;
  const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [], hf = [];
  const push = (id, f) => { heap.push(id); hf.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop(), lf = hf.pop();
    if (heap.length) { heap[0] = last; hf[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } }
    return top;
  };
  const H = (n) => Math.hypot(n.x - bnode.x, n.z - bnode.z) + Math.abs(n.y - bnode.y);
  g[a.id] = 0; push(a.id, H(a));
  let found = false, iter = 0;
  while (heap.length && iter++ < 6000) {
    const c = pop();
    if (closed[c]) continue; closed[c] = 1;
    if (c === bnode.id) { found = true; break; }
    const n = nav.nodes[c];
    for (let k = 0; k < n.edges.length; k++) {
      const e = n.edges[k], ng = g[c] + n.cost[k];
      if (ng < g[e]) { g[e] = ng; from[e] = c; push(e, ng + H(nav.nodes[e])); }
    }
  }
  if (!found) return null;
  const pts = [];
  for (let c = bnode.id; c !== -1; c = from[c]) { const n = nav.nodes[c]; const p = [n.x, n.y, n.z]; if (n.ladder) p.ladder = n.ladder; pts.push(p); }
  pts.reverse();
  // string-pull: skip intermediate nodes when a straight walk works
  const out = [];
  let i = 0, cx = fx, cy = fy, cz = fz;
  while (i < pts.length) {
    let k = Math.min(pts.length - 1, i + 5);
    for (let q = i; q <= k; q++) if (pts[q].ladder) { k = q; break; } // ladder ends are mandatory waypoints
    while (k > i && !(Math.abs(pts[k][1] - cy) < 0.3 && canWalk(cx, cy, cz, pts[k][0], pts[k][1], pts[k][2]))) k--;
    out.push(pts[k]); cx = pts[k][0]; cy = pts[k][1]; cz = pts[k][2]; i = k + 1;
  }
  if (Math.hypot(tx - cx, tz - cz) < 3 && Math.abs(ty - cy) < 0.5) out.push([tx, ty, tz]);
  return out;
}

export function randomNode(filter) {
  const main = G.world.nav.main;
  for (let t = 0; t < 30; t++) { const n = main[Math.floor(Math.random() * main.length)]; if (!filter || filter(n)) return n; }
  return main[Math.floor(Math.random() * main.length)];
}
