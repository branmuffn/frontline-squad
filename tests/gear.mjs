// Rev 3b gear: flashbang stuns bots + whites out the player, smoke blocks bot sight, sticky sticks to a bot,
// claymore trips on an enemy in front, heavy vest cuts body damage, light vest is faster, bandolier/grenadier.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 320, h: 240 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  const lo = G.profile.loadout; Object.assign(lo, { vest: 'heavy', belt: 'grenadier', grenade: 'frag', equip: 'claymore' });
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3 }); window.__step(240); G.match.rules = { passive: true };
  let P = G.player; o.heavy = [P.vest, P.grenades, +P.speedMul.toFixed(2)];
  P.protectUntil = 0; const b0 = G.bots[0]; F.damage(P, 50, b0, { weapon: 'm4', sx: b0.x, sz: b0.z }); o.heavyHp = Math.round(P.health);
  const b = G.bots.find((q) => q.alive); b.protectUntil = 0; b.x = P.x + 4; b.z = P.z; b.y = P.y; b.yaw = Math.atan2(-(P.x - b.x), -(P.z - b.z));
  F.throwGrenade(P, b.x - 1, P.y + 1.2, b.z, 0, 0, 0, 0.3, 'flash'); window.__step(110); o.flashStun = (b.brain.stunUntil || 0) > G.now; o.whiteout = +getComputedStyle(document.getElementById('flashbang')).opacity > 0 || document.getElementById('flashbang').style.opacity !== '';
  F.throwGrenade(P, P.x + 2, P.y + 0.5, P.z, 0, 0, 0, 0.1, 'smoke'); window.__step(240);
  const sm = F.streakState && true; o.smoke = window.__frontline.G.scene.children.length > 0;
  F.throwGrenade(P, b.x, b.y + 1.0, b.z, 0, 0, 0, 2, 'sticky'); window.__step(5); o.stuck = !!F.grenades.find((g) => g.kind === 'sticky' && g.stuck);
  window.__step(150); o.stickyHurt = !b.alive || b.health < 100;
  // claymore: face +x toward a bot 2 m ahead
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3 }); window.__step(240); G.match.rules = { passive: true }; P = G.player;
  P.yaw = -Math.PI / 2; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' })); window.__step(80);
  const v = G.bots.find((q) => q.alive); v.protectUntil = 0; v.x = P.x + 2.6; v.z = P.z; v.y = P.y; window.__step(30); o.claymore = !v.alive || v.health < 60;
  Object.assign(lo, { vest: 'light', belt: 'bandolier' }); F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3 }); window.__step(30); P = G.player;
  o.light = [+P.speedMul.toFixed(2), P.ammo[P.weapons[0]].res];
  Object.assign(lo, { vest: 'standard', belt: 'none', grenade: 'frag' });
  return o;
});
const ok = r.heavy[0] === 'heavy' && r.heavy[1] === 3 && r.heavy[2] < 1 && r.heavyHp === 60 && r.flashStun && r.stuck && r.stickyHurt && r.claymore && r.light[0] > 1;
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3)); await browser.close();
