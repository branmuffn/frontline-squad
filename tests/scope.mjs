// B5: 4x/8x scopes (wheel + Z), Mk 14 EBR / WARDEN DMR (2x, 45 dmg, hitscan), present in lists.
import { shotSession } from './shot.mjs';
const SHOTS = process.argv[2] === 'shots';
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'yard', difficulty: 'normal', count: 1 }, 260);
const ads = async (id) => s.page.evaluate((id) => {
  const F = window.__frontline, G = F.G, P = G.player;
  F.G.profile.settings.renderScale = 0.1;
  P.weapons[0] = id; P.ammo[id] = P.ammo[id] || { mag: 20, res: 60 }; P.slot = 0; P.switchStart = -10;
  P.yaw = 0; P.pitch = 0;

  F.input.aim = true;
  window.__step(40);
  return { adsT: +P.adsT.toFixed(2), fov: +G.camera.fov.toFixed(1) };
}, id);
const out = {};
out.l96 = await ads('l96');
const canvas = await s.page.$('canvas');
const wheel = (dy) => s.page.evaluate((dy) => { const c = document.querySelector('canvas'); c.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true })); window.__step(40); return +window.__frontline.G.camera.fov.toFixed(1); }, dy);
out.l96_wheelUp = await wheel(-100);
out.l96_slot = await s.page.evaluate(() => window.__frontline.G.player.slot);
out.l96_label = await s.page.textContent('#scopeMag');
if (SHOTS) await s.shot('/tmp/b5_8x.png');
out.l96_Z = await s.page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' })); window.__step(40); return +window.__frontline.G.camera.fov.toFixed(1); });
out.mk14 = await ads('mk14');
out.mk14_wheel = await wheel(-100);
out.mk14_label = await s.page.textContent('#scopeMag');
if (SHOTS) await s.shot('/tmp/b5_2x.png');
out.lists = await s.page.evaluate(() => { const W = window.__frontline; return null; });
console.log(JSON.stringify(out), 'ERRORS', s.errors.length, s.errors.slice(0, 3));
process.exitCode = s.errors.length ? 1 : 0; // exit non-zero on FAIL
await s.browser.close();
