// Light aim assist for touch players (never mouse or keyboard): turning slows while the crosshair is on, or just
// beside, an enemy you can see. No pull toward targets. Numbers live in AIM_ASSIST (src/core/config.js).
import { G } from '../core/state.js';
import { AIM_ASSIST, AUTO_FIRE } from '../core/config.js';
import { isEnemy } from './units.js';
import { rayWorld } from '../world/physics.js';

let nextT = 0, factor = 1;

// Look-speed multiplier for this frame: AIM_ASSIST.slow over a visible enemy, else 1. Checked 20 times a second.
export function aimAssistFactor(P) {
  if (G.realTime < nextT && G.realTime > nextT - 1) return factor;
  nextT = G.realTime + 0.05; factor = 1;
  const c = G.camera.position, A = AIM_ASSIST;
  const fx = -Math.sin(P.yaw) * Math.cos(P.pitch), fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * Math.cos(P.pitch);
  for (const u of G.units) {
    if (u === P || !u.alive || !isEnemy(P, u)) continue;
    const dx = u.x - c.x, dy = u.y + u.h * 0.6 - c.y, dz = u.z - c.z, d = Math.hypot(dx, dy, dz);
    if (d < 1 || d > A.range) continue;
    const along = dx * fx + dy * fy + dz * fz;
    if (along <= 0) continue;
    const off = Math.sqrt(Math.max(0, d * d - along * along)); // how far the enemy is from the aim line, in metres
    if (off > A.radius + d * 0.02) continue;
    const hit = rayWorld(c.x, c.y, c.z, dx / d, dy / d, dz / d, d);
    if (hit && hit.t < d - 0.6) continue; // behind cover: no help
    factor = A.slow; break;
  }
  return factor;
}

// Phone auto-fire: is a visible enemy right under the crosshair, within maxD metres? Checked 20 times a second.
let afNext = 0, afHit = false;
export function enemyUnderCrosshair(P, maxD) {
  if (G.realTime < afNext && G.realTime > afNext - 1) return afHit;
  afNext = G.realTime + 0.05; afHit = false;
  const c = G.camera.position, F = AUTO_FIRE;
  const fx = -Math.sin(P.yaw) * Math.cos(P.pitch), fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * Math.cos(P.pitch);
  for (const u of G.units) {
    if (u === P || !u.alive || !isEnemy(P, u)) continue;
    const dx = u.x - c.x, dy = u.y + u.h * 0.6 - c.y, dz = u.z - c.z, d = Math.hypot(dx, dy, dz);
    if (d < 0.5 || d > maxD) continue;
    const along = dx * fx + dy * fy + dz * fz;
    if (along <= 0) continue;
    if (Math.sqrt(Math.max(0, d * d - along * along)) > F.radius + d * F.grow) continue;
    const hit = rayWorld(c.x, c.y, c.z, dx / d, dy / d, dz / d, d);
    if (hit && hit.t < d - 0.6) continue; // behind cover
    afHit = true; break;
  }
  return afHit;
}
