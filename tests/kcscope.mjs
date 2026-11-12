// Rev 5: killed from range, the kill cam shows the killer's view (their scope, if aiming) first, then follows the round for the last
// part of its flight (BULLET_CAM_FROM in game/killcam.js). It used to jump to the bullet camera as soon as it fired.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const run = () => page.evaluate(() => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true;
  F.deploy({ mode: 'survival', map: 'yard', skill: 5 }); window.__step(260);
  const P = G.player; let n = 0;
  while (G.bots.filter((b) => b.alive).length < 1 && n++ < 600) window.__step(1);
  const b = G.bots.find((q) => q.alive);
  // 30 m away with a clear line of fire (a wall in between made the shot short, so no bullet camera)
  const ph = F.physics; let placed = false;
  for (let a = 0; a < Math.PI * 2 && !placed; a += 0.2) {
    const x = P.x + Math.cos(a) * 30, z = P.z + Math.sin(a) * 30, y = ph.supportHeight(x, z, 0.3, P.y + 3);
    if (Math.abs(y - P.y) > 1 || ph.blocked(x, z, 0.4, y, 1.8) || !ph.losClear(x, y + 1.5, z, P.x, P.y + 1.3, P.z)) continue;
    b.x = x; b.z = z; b.y = y; placed = true;
  }
  b.brain.weapon = 'l96'; b.weapon = 'l96';
  for (let i = 0; i < 80; i++) { b.brain.state = 'engage'; b.brain.visible = true; b.brain.target = P; b.yaw = Math.atan2(-(P.x - b.x), -(P.z - b.z)); window.__step(1); }
  G.match.rules = { ...(G.match.rules || {}), passive: true }; // only the scripted sniper round may kill
  P.protectUntil = 0; P.health = 1;
  const ey = b.y + 1.5, dx = P.x - b.x, dy = P.y + 1.3 - ey, dz = P.z - b.z, L = Math.hypot(dx, dy, dz);
  const s = F.ballistics.newShot(b, 'l96', b.x, ey, b.z, 1); F.ballistics.traceSegment(s, dx / L, dy / L, dz / L, 200);
  for (let i = 0; i < 6; i++) { b.brain.state = 'engage'; b.brain.visible = true; b.brain.target = P; window.__step(1); } // still aiming as it's recorded
  const seq = []; let k = 0, nSlug = 0;
  while (!F.kcDebug() && k++ < 400) window.__step(1);
  for (let i = 0; i < 900 && F.kcDebug(); i++) {
    window.__step(1);
    const d = F.kcDebug(); if (!d || !d.slug) continue; nSlug++;
    // the scope view zooms in with the overlay on; the bullet camera is a plain 80% field of view
    const scope = document.getElementById('scope').classList.contains('on'), fov = G.camera.fov, base = G.profile.settings.fov;
    const ph = scope && fov < base * 0.6 ? 'scope' : !scope && Math.abs(fov - base * 0.8) < 1 ? 'bullet' : 'eyes';
    if (seq[seq.length - 1] !== ph) seq.push(ph);
  }
  return { placed, seq: seq.join('>'), slugFrames: nSlug };
});
// setup retry: occasionally the scripted round misses and there is no kill cam to judge
let r = await run(), tries = 1;
while (!r.slugFrames && tries < 3) { r = await run(); tries++; }
r.tries = tries;
const ok = r.placed && /^((scope|eyes)>)+bullet$/.test(r.seq); // the killer's view (scoped if they were) first, then the round
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS kcscope' : 'FAIL kcscope', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
