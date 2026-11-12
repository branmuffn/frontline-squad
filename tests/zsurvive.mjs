// B1: Zombies fairness. A scripted "turret" player (aims at the nearest zombie, fires, reloads, never moves or buys)
// plays solo Zombies for N seconds per difficulty: rounds reached, first death, points, zombie speed vs your sprint.
import { open } from './harness.mjs';
const secs = +process.argv[2] || 150, diffs = (process.argv[3] || 'easy,normal,hard,nightmare').split(','), map = process.argv[4] || 'yard';
const { browser, page, errors } = await open({ w: 320, h: 240 });
for (const zd of diffs) {
  const r = await page.evaluate(([zd, secs, map]) => {
    const F = window.__frontline, G = F.G, o = { zd }; F.input.freeLook = true;
    F.deploy({ mode: 'zombies', map, skill: 5, difficulty: 'normal', zdiff: zd });
    let firstDeath = 0, minD = 99;
    for (let i = 0; i < secs * 60; i++) {
      const P = G.player;
      if (P.alive) {
        let best = null, bd = 1e9;
        for (const b of G.bots) if (b.alive) { const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; best = b; } }
        if (best) { minD = Math.min(minD, bd); const dx = best.x - P.x, dz = best.z - P.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(best.y + 1.25 - (P.y + (P.eye || 1.6)), Math.hypot(dx, dz)); }
        F.input.fire = !!best && bd < 40 && i % 6 < 3; if (i % 6 === 3) P.semiReady = true;
      } else if (!firstDeath) firstDeath = Math.round(G.now);
      window.__step(1); if (G.state === 'ended' || G.match.lives <= 0) break;
    }
    F.input.fire = false;
    const z = G.bots.find((b) => b.alive && b.zombie);
    o.round = G.match.round; o.firstDeath = firstDeath || 'none'; o.over = G.match.lives <= 0 ? Math.round(G.now) : 'no'; o.points = G.match.points; o.lives = G.match.lives;
    o.kills = G.player.kills; o.speedVsSprint = z ? +(z.brain.speedMul * 6 * 1.12 * (G.match.ai.speed || 1) * 1.5 / (6 * 1.5 * 0.95)).toFixed(2) : null;
    F.abandon && F.abandon();
    return o;
  }, [zd, secs, map]);
  console.log(JSON.stringify(r));
}
console.log('errors', errors.slice(0, 3));
process.exitCode = errors.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
