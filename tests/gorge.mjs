// Cascade Gorge descents: braking chute survivable only when walking backwards, steep bulge lethal, bots find a way
// up the zig-zag stairs, hatch open. node tests/gorge.mjs
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, K = F.input.keys, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'sandbox', map: 'gorge', skill: 5, count: 0 }); window.__step(240);
  const S = G.world.def.slides;
  const ride = (s, key) => { const P = G.player; // start at the top of a west chute facing the canyon (+x)
    P.alive = true; P.health = 100; P.protectUntil = 0; P.slideV = 0; P.slideNet = 0; P.x = s.minX + 0.6; P.z = (s.minZ + s.maxZ) / 2; P.y = 8 - 0.6 * (8 / (s.maxX - s.minX)); P.vy = 0; P.grounded = true; P.yaw = -Math.PI / 2; P.pitch = 0;
    if (key) K[key] = true; let n = 0; while (P.alive && P.y > 0.05 && n++ < 600) window.__step(1); window.__step(10); if (key) K[key] = false;
    return { alive: P.alive, hp: Math.round(P.health), n };
  };
  const brake = S.find((s) => s.brake && s.maxX < 0), steep = S.find((s) => !s.brake && s.maxX < 0);
  o.brakeBack = ride(brake, 'KeyS');
  F.deploy({ mode: 'sandbox', map: 'gorge', skill: 5, count: 0 }); window.__step(240);
  o.noBrake = ride(brake, null);
  F.deploy({ mode: 'sandbox', map: 'gorge', skill: 5, count: 0 }); window.__step(240);
  o.steepBack = ride(steep, 'KeyS');
  // bots: a path from the canyon floor up to the west plateau that climbs the zig-zag stairs
  const path = F.nav.findPath(-15, 0, -2, -26, 8, -11);
  o.path = path ? path.length : 0; o.viaStairs = !!path && path.some((p) => p[1] > 2 && p[1] < 6 && p[0] < -17);
  o.hatches = G.world.colliders.filter((c) => c.minY > 11.3 && c.minY < 11.7 && Math.abs(c.minZ) < 1.6).length;
  return o;
});
const ok = r.brakeBack.alive && r.brakeBack.hp >= 70 && (!r.noBrake.alive || r.noBrake.hp < 35) && !r.steepBack.alive && r.viaStairs;
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3)); await browser.close();
