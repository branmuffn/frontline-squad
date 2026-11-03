// X1: prone / crawl - X toggles, low height + eye, slow crawl, no sprint, steadier aim, jump/X gets up, ladders/vehicles cancel.
import { shotSession } from './shot.mjs';
const SHOTS = process.argv[2] === 'shots';
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'yard', difficulty: 'normal', count: 0 }, 220);
const r = await s.page.evaluate(() => {
  const F = window.__frontline, G = F.G, P = G.player, out = {};
  const press = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
  const speed = () => { const x0 = P.x, z0 = P.z; F.input.keys.KeyW = true; window.__step(60); F.input.keys.KeyW = false; window.__step(5); return +Math.hypot(P.x - x0, P.z - z0).toFixed(2); };
  P.x = 0; P.z = 4; P.yaw = 0; window.__step(5);
  out.walk = speed();
  P.x = 0; P.z = 4; press('KeyX'); window.__step(40);
  out.prone = P.prone; out.h = P.h; out.eye = +P.eye.toFixed(2);
  out.crawl = speed();
  F.input.keys.ShiftLeft = true; P.x = 0; P.z = 4; out.crawlShift = speed(); F.input.keys.ShiftLeft = false; out.sprinting = P.sprinting;
  press('Space'); window.__step(30); out.upByJump = !P.prone && P.h > 1;
  press('KeyX'); window.__step(30); press('KeyX'); window.__step(30); out.upByX = !P.prone;
  press('KeyX'); window.__step(40);
  return out;
});
if (SHOTS) await s.shot('/tmp/prone.png', () => { const P = window.__frontline.G.player; P.pitch = 0; window.__step(2); });
console.log(JSON.stringify(r), 'ERRORS', s.errors.length, s.errors.slice(0, 2));
await s.browser.close();
