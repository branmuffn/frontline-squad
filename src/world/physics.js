import { G } from '../core/state.js';
import { PHYS } from '../core/config.js';

// Colliders are axis-aligned boxes: {minX,maxX,minY,maxY,minZ,maxZ, mat, pass}
// pass=true -> blocks movement but not bullets/sight (railings, fences)
// Ramps are solid wedges: {minX,maxX,minZ,maxZ, axis:'x'|'z', from, to, base, mat}
//   from = surface height at the min edge of the axis, to = at the max edge.

const SUPPORT_R = 0.2;
const CELL = 4;
let stamp = 1;
const qOut = [];

export function buildHash(world) {
  const b = world.bounds;
  const minX = b.minX - 8, minZ = b.minZ - 8;
  const nx = Math.ceil((b.maxX - b.minX + 16) / CELL), nz = Math.ceil((b.maxZ - b.minZ + 16) / CELL);
  const cells = Array.from({ length: nx * nz }, () => []);
  for (const c of world.colliders) {
    const i0 = Math.max(0, Math.floor((c.minX - minX) / CELL)), i1 = Math.min(nx - 1, Math.floor((c.maxX - minX) / CELL));
    const j0 = Math.max(0, Math.floor((c.minZ - minZ) / CELL)), j1 = Math.min(nz - 1, Math.floor((c.maxZ - minZ) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i].push(c);
    c._s = 0;
  }
  world.hash = { minX, minZ, nx, nz, cells };
}

export function query(minX, maxX, minZ, maxZ) {
  const h = G.world.hash;
  qOut.length = 0; stamp++;
  const i0 = Math.max(0, Math.floor((minX - h.minX) / CELL)), i1 = Math.min(h.nx - 1, Math.floor((maxX - h.minX) / CELL));
  const j0 = Math.max(0, Math.floor((minZ - h.minZ) / CELL)), j1 = Math.min(h.nz - 1, Math.floor((maxZ - h.minZ) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cell = h.cells[j * h.nx + i];
    for (let k = 0; k < cell.length; k++) { const c = cell[k]; if (c._s !== stamp) { c._s = stamp; qOut.push(c); } }
  }
  return qOut;
}

function circleRect(x, z, r, c) {
  const px = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
  const pz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
  return (px - x) * (px - x) + (pz - z) * (pz - z) < r * r;
}

export function rampHeight(rp, x, z) {
  const t = rp.axis === 'z' ? (z - rp.minZ) / (rp.maxZ - rp.minZ) : (x - rp.minX) / (rp.maxX - rp.minX);
  return rp.from + (rp.to - rp.from) * (t < 0 ? 0 : t > 1 ? 1 : t);
}

// Is a body cylinder (feet at y, height h) at (x,z) overlapping solid geometry above its step height?
export function blocked(x, z, r, y, h) {
  const w = G.world, b = w.bounds;
  if (x - r < b.minX || x + r > b.maxX || z - r < b.minZ || z + r > b.maxZ) return true;
  const feet = y + PHYS.step, top = y + h;
  const list = query(x - r, x + r, z - r, z + r);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.maxY <= feet || c.minY >= top) continue;
    if (circleRect(x, z, r, c)) return true;
  }
  for (const rp of w.ramps) {
    if (x + r < rp.minX || x - r > rp.maxX || z + r < rp.minZ || z - r > rp.maxZ) continue;
    const px = x < rp.minX ? rp.minX : x > rp.maxX ? rp.maxX : x;
    const pz = z < rp.minZ ? rp.minZ : z > rp.maxZ ? rp.maxZ : z;
    if ((px - x) ** 2 + (pz - z) ** 2 > r * r) continue;
    if (rampHeight(rp, px, pz) > feet && rp.base < top) return true;
  }
  return false;
}

// Highest walkable surface at or below maxY under a small circle.
export function supportHeight(x, z, r, maxY) {
  let h = 0;
  const list = query(x - r, x + r, z - r, z + r);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.maxY > h && c.maxY <= maxY + 1e-3 && circleRect(x, z, r, c)) h = c.maxY;
  }
  for (const rp of G.world.ramps) {
    if (x < rp.minX || x > rp.maxX || z < rp.minZ || z > rp.maxZ) continue;
    const rh = rampHeight(rp, x, z);
    if (rh > h && rh <= maxY + 1e-3) h = rh;
  }
  return h;
}

export function ceiling(x, z, r, headY) {
  let m = Infinity;
  const list = query(x - r, x + r, z - r, z + r);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.minY >= headY - 0.12 && c.minY < m && circleRect(x, z, r, c)) m = c.minY;
  }
  return m;
}

function groundSnap(u) {
  const s = supportHeight(u.x, u.z, SUPPORT_R, u.y + PHYS.step);
  if (s >= u.y - 0.001 || u.y - s <= 0.55) u.y = s;
  else u.grounded = false;
}

// Horizontal movement with sub-stepping, wall sliding, step-up and ground snapping. Returns true if something blocked us.
export function moveBody(u, dx, dz) {
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return false;
  const n = Math.ceil(d / 0.14), sx = dx / n, sz = dz / n;
  let hit = false;
  for (let i = 0; i < n; i++) {
    if (!blocked(u.x + sx, u.z + sz, u.r, u.y, u.h)) { u.x += sx; u.z += sz; }
    else {
      hit = true;
      const okX = !blocked(u.x + sx, u.z, u.r, u.y, u.h); if (okX) u.x += sx;
      const okZ = !blocked(u.x, u.z + sz, u.r, u.y, u.h); if (okZ) u.z += sz;
      if (!okX && !okZ) break;
    }
    if (u.grounded) groundSnap(u);
  }
  return hit;
}

// Gravity, jumping arcs, ceilings and landing (including ledge mantling within step height). Returns landing speed.
export function updateVertical(u, dt) {
  u.fallH = 0;
  if (u.grounded && u.vy <= 0) {
    const s = supportHeight(u.x, u.z, SUPPORT_R, u.y + 0.05);
    u.airPeak = u.y;
    if (s >= u.y - 0.02) { u.y = Math.max(u.y, s); u.vy = 0; return 0; }
    if (u.y - s <= 0.55) { u.y = s; u.vy = 0; return 0; }
    u.grounded = false;
  }
  if (u.airPeak === undefined || u.grounded) u.airPeak = u.y;
  u.vy = Math.max(-40, u.vy - PHYS.gravity * (G.gravMul || 1) * dt);
  let ny = u.y + u.vy * dt;
  if (u.vy > 0) {
    const ceil = ceiling(u.x, u.z, u.r * 0.9, u.y + u.h);
    if (ny + u.h > ceil) { ny = ceil - u.h; u.vy = 0; }
  }
  const s = supportHeight(u.x, u.z, SUPPORT_R, u.y + PHYS.step);
  if (ny <= s) {
    const impact = -u.vy;
    u.fallH = u.airPeak - s; u.airPeak = s;
    u.y = s; u.vy = 0; u.grounded = true;
    return impact;
  }
  u.y = ny; u.grounded = false;
  if (ny > u.airPeak) u.airPeak = ny;
  return 0;
}

export function surfaceAt(x, z, y) {
  const w = G.world;
  for (const c of query(x - 0.25, x + 0.25, z - 0.25, z + 0.25)) {
    if (Math.abs(c.maxY - y) < 0.07 && x >= c.minX - 0.25 && x <= c.maxX + 0.25 && z >= c.minZ - 0.25 && z <= c.maxZ + 0.25) return c.mat;
  }
  for (const rp of w.ramps) if (x >= rp.minX && x <= rp.maxX && z >= rp.minZ && z <= rp.maxZ && Math.abs(rampHeight(rp, x, z) - y) < 0.12) return rp.mat;
  if (w.water) for (const a of w.water) if (y < a.top + 0.3 && x > a.minX && x < a.maxX && z > a.minZ && z < a.maxZ) return 'water';
  if (w.surfaces) for (const a of w.surfaces) if (y < 0.1 && x > a.minX && x < a.maxX && z > a.minZ && z < a.maxZ) return a.mat;
  return w.groundMat;
}
const STEP_SOUND = { metal: 'stepMetal', wood: 'stepWood', sand: 'stepSand', adobe: 'stepConcrete', concrete: 'stepConcrete', water: 'stepWater', grass: 'stepGrass' };
export const stepSound = (mat) => STEP_SOUND[mat] || 'stepConcrete';

export function inWater(u) {
  const w = G.world.water; if (!w || u.y > 0.35) return false;
  for (const a of w) if (u.x > a.minX && u.x < a.maxX && u.z > a.minZ && u.z < a.maxZ) return true;
  return false;
}
// materials thin enough for bullets to punch through
export const PENETRABLE = new Set(['wood']);

export function canStand(u) {
  return ceiling(u.x, u.z, u.r * 0.9, u.y + PHYS.crouchH) > u.y + PHYS.standH;
}

// ---------- Ray casting ----------
const hitOut = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, mat: 'ground' };

// Returns a fresh hit object or null. any=true returns on the first blocking hit (for line-of-sight checks).
export function rayWorld(ox, oy, oz, dx, dy, dz, tmax, any = false) {
  const w = G.world;
  const idx = 1 / (dx || 1e-12), idy = 1 / (dy || 1e-12), idz = 1 / (dz || 1e-12);
  let best = tmax, bn = -1, bmat = null, bc = null;
  const cols = w.colliders;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.pass) continue;
    let t1 = (c.minX - ox) * idx, t2 = (c.maxX - ox) * idx;
    let tmin = t1 < t2 ? t1 : t2, tmx = t1 < t2 ? t2 : t1, ax = 0;
    t1 = (c.minY - oy) * idy; t2 = (c.maxY - oy) * idy;
    let a = t1 < t2 ? t1 : t2, b = t1 < t2 ? t2 : t1;
    if (a > tmin) { tmin = a; ax = 1; } if (b < tmx) tmx = b;
    t1 = (c.minZ - oz) * idz; t2 = (c.maxZ - oz) * idz;
    a = t1 < t2 ? t1 : t2; b = t1 < t2 ? t2 : t1;
    if (a > tmin) { tmin = a; ax = 2; } if (b < tmx) tmx = b;
    if (tmx < 0 || tmin > tmx) continue;
    const t = tmin < 0 ? 0 : tmin;
    if (t < best) { best = t; bn = ax; bmat = c.mat; bc = c; if (any) return true; }
  }
  // ramps (sloped top surface only)
  for (const rp of w.ramps) {
    const span = rp.axis === 'z' ? rp.maxZ - rp.minZ : rp.maxX - rp.minX;
    const k = (rp.to - rp.from) / span;
    const along0 = rp.axis === 'z' ? oz - rp.minZ : ox - rp.minX, dAlong = rp.axis === 'z' ? dz : dx;
    const den = dy - k * dAlong;
    if (Math.abs(den) < 1e-6) continue;
    const t = (rp.from + k * along0 - oy) / den;
    if (t <= 0 || t >= best) continue;
    const px = ox + dx * t, pz = oz + dz * t;
    if (px < rp.minX || px > rp.maxX || pz < rp.minZ || pz > rp.maxZ) continue;
    if (any) return true;
    best = t; bn = 3; bmat = rp.mat; bc = rp;
  }
  // ground plane
  if (dy < 0) {
    const t = -oy / dy;
    if (t > 0 && t < best) { if (any) return true; best = t; bn = 4; bmat = w.groundMat || 'ground'; bc = null; }
  }
  if (bn < 0) return any ? false : null;
  const h = { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, nx: 0, ny: 0, nz: 0, mat: bmat, col: bc };
  if (bn === 0) h.nx = dx > 0 ? -1 : 1;
  else if (bn === 1) h.ny = dy > 0 ? -1 : 1;
  else if (bn === 2) h.nz = dz > 0 ? -1 : 1;
  else if (bn === 3) {
    const span = bc.axis === 'z' ? bc.maxZ - bc.minZ : bc.maxX - bc.minX, k = (bc.to - bc.from) / span;
    const l = Math.hypot(k, 1);
    if (bc.axis === 'z') { h.ny = 1 / l; h.nz = -k / l; } else { h.ny = 1 / l; h.nx = -k / l; }
  } else h.ny = 1;
  return h;
}

export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  if (d < 1e-4) return true;
  return !rayWorld(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, true);
}

// Ray vs unit hit volumes (vertical cylinder body + head sphere).
// skip(u) -> true to ignore a unit. Returns {unit, t, zone} or null.
export function rayUnits(ox, oy, oz, dx, dy, dz, tmax, skip) {
  let best = tmax, hu = null, zone = 'body';
  for (const u of G.units) {
    if (!u.alive || (skip && skip(u))) continue;
    const cx = u.x, cz = u.z;
    // quick reject: distance from ray to unit axis
    const rx = cx - ox, rz = cz - oz;
    const along = rx * dx + rz * dz;
    if (along < -1) continue;
    // head sphere
    const hy = u.y + u.h - 0.17, hr = 0.2;
    {
      const lx = ox - cx, ly = oy - hy, lz = oz - cz;
      const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - hr * hr;
      const disc = b * b - c;
      if (c <= 0) { if (0 < best) { best = 0; hu = u; zone = 'head'; } } // segment starts inside
      else if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < best) { best = t; hu = u; zone = 'head'; } }
    }
    // body cylinder
    const r = 0.31, y0 = u.y, y1 = u.y + u.h - 0.34;
    const a = dx * dx + dz * dz;
    const lx = ox - cx, lz = oz - cz;
    if (a > 1e-9) {
      const b = 2 * (dx * lx + dz * lz), c = lx * lx + lz * lz - r * r;
      const disc = b * b - 4 * a * c;
      if (c <= 0 && oy >= y0 && oy <= y1) { if (0 < best) { best = 0; hu = u; zone = (oy - u.y) < u.h * 0.46 ? 'legs' : 'body'; } }
      else if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t > 0 && t < best) {
          const y = oy + dy * t;
          if (y >= y0 && y <= y1) { best = t; hu = u; zone = (y - u.y) < u.h * 0.46 ? 'legs' : 'body'; }
        }
      }
    }
    if (dy < -1e-6) { // top cap (shots from above)
      const t = (y1 - oy) / dy;
      if (t > 0 && t < best) {
        const px = ox + dx * t - cx, pz = oz + dz * t - cz;
        if (px * px + pz * pz < r * r) { best = t; hu = u; zone = 'body'; }
      }
    }
  }
  return hu ? { unit: hu, t: best, zone } : null;
}

// Per-frame safety net: if a unit ends up overlapping solid geometry (moving train, crowd push, spawn on a prop),
// move it out along the shortest escape: a small lift onto a surface, or the nearest clear spot in rings around it.
const RING_DIRS = Array.from({ length: 16 }, (_, k) => [Math.cos(k / 16 * Math.PI * 2), Math.sin(k / 16 * Math.PI * 2)]);
export function depenetrate(u) {
  if (u.onLadder) return false;
  if (!blocked(u.x, u.z, u.r, u.y, u.h)) { u._safeX = u.x; u._safeY = u.y; u._safeZ = u.z; return false; }
  let best = null, bestCost = Infinity;
  const lift = supportHeight(u.x, u.z, SUPPORT_R, u.y + 2.2);
  if (lift > u.y + 0.01 && !blocked(u.x, u.z, u.r, lift, u.h)) { best = [u.x, lift, u.z]; bestCost = (lift - u.y) * 1.5; }
  for (let d = 0.08; d <= 3.2 && d < bestCost; d += 0.08) {
    for (const [cx, cz] of RING_DIRS) {
      const x = u.x + cx * d, z = u.z + cz * d;
      const y = Math.max(supportHeight(x, z, SUPPORT_R, u.y + PHYS.step), Math.min(u.y, supportHeight(x, z, SUPPORT_R, u.y + 0.05)));
      if (u.y - y > 0.6) continue; // never shove someone off a ledge
      if (!blocked(x, z, u.r, y, u.h)) { best = [x, y, z]; bestCost = d; break; }
    }
  }
  if (!best && u._safeX !== undefined && !blocked(u._safeX, u._safeZ, u.r, u._safeY, u.h)) best = [u._safeX, u._safeY, u._safeZ];
  if (!best) return false;
  u.x = best[0]; u.y = best[1]; u.z = best[2]; u.vy = Math.max(0, u.vy); u.grounded = true;
  return true;
}
